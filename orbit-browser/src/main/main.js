'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, protocol, Menu, shell, dialog,
  nativeTheme, safeStorage, net, clipboard } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), { pathToFileURL } = require('url');
const { Store } = require('./store');
const { resolve, ENGINES } = require('./url');

protocol.registerSchemesAsPrivileged([{ scheme: 'browser', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const SRC = path.join(__dirname, '..'), CHROME = 84, BAR = 30;
const DEF = {
  theme: 'system', engine: 'duckduckgo', customSearch: '', home: 'browser://newtab', bookmarksBar: true,
  blockPopups: true, httpsOnly: false, doNotTrack: true, askDownload: false, downloadDir: '',
  network: { auto: false, primary: { mode: 'direct' }, secondary: null }
};
let SET, BM, HIST, PERM;
const wins = new Map(), wcMap = new Map(), prepared = new WeakSet(), DL = [], mem = {}, certs = new Map(), pendingPerm = new Map();
let dlId = 1, permId = 1;
const S = () => SET.get(), rid = () => Math.random().toString(36).slice(2, 10);
const diag = { logs: [], last: null, log(m) { this.logs.push(new Date().toISOString().slice(11, 19) + '  ' + m); if (this.logs.length > 300) this.logs.shift(); } };
const hostOf = u => { try { return new URL(u).hostname; } catch { return '?'; } };
const safeUrl = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return ''; } }; // never log query strings / tokens
const cw = () => { const f = BrowserWindow.getFocusedWindow(); const all = [...wins.values()]; return all.find(w => w.win === f) || all[0]; };

/* ───────────────────────── NetworkManager (Direct / HTTP / HTTPS / SOCKS5 + ConnectionTester) ───────────────────────── */
let netState = { active: 'primary', mode: 'direct', host: '', port: '', state: 'unverified', ms: null, error: null, at: null }, netTimer = null, applied = null;
const rules = p => !p || p.mode === 'direct' ? null : (p.mode === 'socks5' ? 'socks5://' : p.mode + '://') + p.host + ':' + p.port;
const allSes = () => [...new Set([...wins.values()].map(w => w.ses))];
function setPass(slot, pw) {
  if (!pw) return null;
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(pw).toString('base64');
  mem[slot] = pw; return null; // no OS keychain: keep in memory only, never plaintext on disk
}
function getPass(slot, p) {
  try { if (p.passEnc) return safeStorage.decryptString(Buffer.from(p.passEnc, 'base64')); } catch {}
  return mem[slot] || '';
}
async function applyProfile(slot, p) {
  applied = { slot, p };
  const r = rules(p);
  for (const s of allSes()) { await s.setProxy(r ? { proxyRules: r, proxyBypassRules: '<local>' } : { mode: 'direct' }); await s.closeAllConnections().catch(() => {}); }
}
function probe(slot, p) {
  return new Promise(async res => {
    let done = false, to;
    const fin = v => { if (done) return; done = true; clearTimeout(to); res(v); };
    try {
      const ts = session.fromPartition('probe-' + rid()), r = rules(p), t0 = Date.now();
      await ts.setProxy(r ? { proxyRules: r } : { mode: 'direct' });
      const q = net.request({ url: 'https://www.gstatic.com/generate_204', session: ts });
      to = setTimeout(() => { try { q.abort(); } catch {} fin({ ok: false, error: 'Connection timed out' }); }, 8000);
      q.on('login', (a, cb) => (p.user && a.isProxy) ? cb(p.user, getPass(slot, p)) : cb());
      q.on('response', rs => { rs.on('data', () => {}); fin({ ok: rs.statusCode < 500, ms: Date.now() - t0 }); });
      q.on('error', e => fin({ ok: false, error: String(e.message).replace(/^net::/, '') }));
      q.end();
    } catch (e) { fin({ ok: false, error: String(e.message) }); }
  });
}
function setNet(slot, p, state, r) {
  netState = { active: slot, mode: p.mode, host: p.host || '', port: p.port || '', state, ms: r && r.ms != null ? r.ms : null, error: state === 'failed' ? ((r && r.error) || 'Unreachable') : null, at: Date.now() };
  diag.log('connection ' + slot + ' ' + p.mode + ' ' + state + (netState.ms ? ' ' + netState.ms + 'ms' : ''));
  if (state === 'failed') diag.last = 'Connection check failed: ' + netState.error;
  for (const w of wins.values()) w.push();
}
async function selectConnection() {
  const n = S().network, slots = [['primary', n.primary]];
  if (n.auto && n.secondary) slots.push(['secondary', n.secondary]);
  let last = null;
  for (const [slot, p] of slots) {
    const r = await probe(slot, p); last = r;
    if (r.ok) {
      if (!applied || applied.slot !== slot || JSON.stringify(applied.p) !== JSON.stringify(p)) await applyProfile(slot, p);
      setNet(slot, p, 'connected', r); return pubNet();
    }
  }
  // Nothing worked: stay on the configured primary so traffic is NEVER silently rerouted; show the failure honestly.
  await applyProfile('primary', n.primary); setNet('primary', n.primary, 'failed', last); return pubNet();
}
function scheduleNet() { clearInterval(netTimer); netTimer = null; if (S().network.auto) netTimer = setInterval(selectConnection, 30000); }
const pubNet = () => ({ ...netState, auto: !!S().network.auto });
const pubProfile = p => p ? { mode: p.mode, host: p.host || '', port: p.port || '', user: p.user || '', hasPass: !!(p.passEnc || mem[p.slot]) } : null;
function cleanProfile(slot, p, old) {
  if (!p || p.mode === 'none') return null;
  if (!['direct', 'http', 'https', 'socks5'].includes(p.mode)) throw new Error('Invalid connection type');
  if (p.mode === 'direct') return { mode: 'direct' };
  if (!/^[A-Za-z0-9._\-\[\]:]{1,253}$/.test(p.host || '')) throw new Error('Invalid proxy host');
  const port = parseInt(p.port, 10); if (!(port > 0 && port < 65536)) throw new Error('Invalid proxy port');
  const out = { mode: p.mode, host: p.host.trim(), port, user: String(p.user || '').slice(0, 200) };
  if (p.pass) out.passEnc = setPass(slot, p.pass); else if (p.keep && old) out.passEnc = old.passEnc;
  return out;
}
function vpnStatus() {
  const names = Object.keys(os.networkInterfaces()).filter(n => /^(wg|tun|tap|ppp|ipsec|tailscale|zt|nordlynx|proton|wireguard)/i.test(n));
  return { state: names.length ? 'Connected' : 'Disconnected', interfaces: names,
    note: 'Read-only detection of system VPN interfaces (heuristic). Orbit does not create or control VPN connections - use your VPN app or OS settings. A browser proxy is not a VPN.' };
}
app.on('login', (e, wc, req, auth, cb) => { // proxy credentials: only ever sent to the configured proxy host
  const a = applied; if (auth.isProxy && a && a.p && a.p.user && auth.host === a.p.host) { e.preventDefault(); cb(a.p.user, getPass(a.slot, a.p)); }
});

/* ───────────────────────── Sessions: permissions, downloads, certs, headers ───────────────────────── */
const ASK = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'display-capture']);
const AUTO = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
const winForWc = wc => { const m = wcMap.get(wc.id); return m && m.win; };
function prep(ses, priv) {
  if (prepared.has(ses)) return; prepared.add(ses);
  ses.protocol.handle('browser', serve);
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|orbit-browser)\/\S+/gi, '')); // look like Chrome so sites don't block the shell
  ses.setPermissionRequestHandler(async (wc, perm, cb, det) => {
    if (AUTO.has(perm)) return cb(true);
    if (!ASK.has(perm)) return cb(false);
    let origin; try { origin = new URL(det.requestingUrl).origin; } catch { return cb(false); }
    if (origin.startsWith('browser:')) return cb(false);
    const key = perm === 'media' ? 'media:' + (det.mediaTypes || []).sort().join('+') : perm;
    const saved = (PERM.get()[origin] || {})[key];
    if (saved) return cb(saved === 'allow');
    const w = winForWc(wc); if (!w) return cb(false);
    const r = await w.askPermission(origin, key);
    if (r.remember && !priv) { const P = PERM.get(); (P[origin] = P[origin] || {})[key] = r.allow ? 'allow' : 'block'; PERM.save(); }
    cb(!!r.allow);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => {
    if (AUTO.has(perm)) return true;
    const p = PERM.get()[origin] || {};
    return perm === 'media' ? Object.entries(p).some(([k, v]) => k.startsWith('media:') && v === 'allow') : p[perm] === 'allow';
  });
  ses.on('will-download', (e, item) => onDownload(ses, item));
  ses.setCertificateVerifyProc((req, cb) => { // record REAL certificate info, then defer to Chromium's own verification
    try { const c = req.certificate; certs.set(req.hostname, { issuer: c.issuerName, subject: c.subjectName, from: c.validStart, to: c.validExpiry, fp: c.fingerprint, result: req.verificationResult }); } catch {}
    cb(-3);
  });
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (d, cb) => {
    if (S().httpsOnly && d.resourceType === 'mainFrame') {
      try { const u = new URL(d.url); if (!/^(localhost|127\.|\[::1\])/.test(u.hostname)) { u.protocol = 'https:'; return cb({ redirectURL: u.href }); } } catch {}
    }
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders((d, cb) => { const h = d.requestHeaders; if (S().doNotTrack) h.DNT = '1'; cb({ requestHeaders: h }); });
  const r = rules(applied && applied.p); if (r) ses.setProxy({ proxyRules: r, proxyBypassRules: '<local>' });
}

/* ───────────────────────── DownloadManager ───────────────────────── */
const safeName = n => (path.basename(String(n || '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 180)) || 'download';
function uniquePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext); let p = path.join(dir, name), i = 1;
  while (fs.existsSync(p)) p = path.join(dir, base + ' (' + (i++) + ')' + ext); return p;
}
function onDownload(ses, item) {
  const dir = S().downloadDir || app.getPath('downloads'), name = safeName(item.getFilename());
  const d = { id: dlId++, name, total: item.getTotalBytes(), received: 0, speed: 0, state: 'downloading', path: '', url: item.getURL(), ses, item };
  if (!S().askDownload) { d.path = uniquePath(dir, name); item.setSavePath(d.path); } else item.setSaveDialogOptions({ defaultPath: path.join(dir, name) });
  DL.unshift(d); let last = Date.now(), lb = 0;
  item.on('updated', (e, st) => {
    d.received = item.getReceivedBytes(); d.total = item.getTotalBytes();
    d.state = st === 'interrupted' ? 'failed' : item.isPaused() ? 'paused' : 'downloading';
    const n = Date.now(); if (n - last >= 500) { d.speed = (d.received - lb) / ((n - last) / 1000); last = n; lb = d.received; }
    if (!d.path && item.getSavePath()) d.path = item.getSavePath(); bcastDl();
  });
  item.once('done', (e, st) => { d.speed = 0; d.state = st === 'completed' ? 'completed' : st === 'cancelled' ? 'cancelled' : 'failed'; d.path = item.getSavePath() || d.path; d.item = null; bcastDl(true); });
  bcastDl(true);
}
const pubDl = () => DL.map(d => ({ id: d.id, name: d.name, total: d.total, received: d.received, speed: d.speed, state: d.state, canResume: !!(d.item && d.item.canResume && d.item.canResume()) }));
let dlT = 0;
function bcastDl(force) {
  const n = Date.now(); if (!force && n - dlT < 250) return; dlT = n;
  const act = DL.filter(d => d.state === 'downloading').length, list = pubDl();
  for (const w of wins.values()) {
    if (!w.ui.webContents.isDestroyed()) w.ui.webContents.send('dl', act);
    for (const t of w.tabs) if (t.url.startsWith('browser://downloads')) t.wc.send('downloads', list);
  }
}
function dlAct(id, act) {
  const i = DL.findIndex(d => d.id === id), d = DL[i]; if (!d) return;
  if (act === 'cancel' && d.item) d.item.cancel();
  else if (act === 'pause' && d.item) d.item.pause();
  else if (act === 'resume' && d.item && d.item.canResume()) d.item.resume();
  else if (act === 'open' && d.state === 'completed' && fs.existsSync(d.path)) shell.openPath(d.path);
  else if (act === 'show' && fs.existsSync(d.path)) shell.showItemInFolder(d.path);
  else if (act === 'retry') { const w = [...wins.values()].find(x => x.ses === d.ses); if (w && w.cur()) w.cur().wc.downloadURL(d.url); }
  else if (act === 'remove') { if (d.item) d.item.cancel(); DL.splice(i, 1); }
  bcastDl(true);
}

/* ───────────────────────── History / suggestions ───────────────────────── */
function addHist(url, title) {
  const a = HIST.get(); if (a[0] && a[0].url === url) { a[0].time = Date.now(); return; }
  a.unshift({ id: rid(), url, title: title || url, time: Date.now(), favicon: '' }); if (a.length > 5000) a.length = 5000; HIST.save();
}
function updHist(url, patch) { const e = HIST.get().find(x => x.url === url); if (e) { Object.assign(e, patch); HIST.save(); } }
function suggest(q) {
  q = q.toLowerCase().trim(); if (!q) return [];
  const out = [], seen = new Set();
  const add = (x, type) => { if (!seen.has(x.url) && out.length < 6 && ((x.title || '') + ' ' + x.url).toLowerCase().includes(q)) { seen.add(x.url); out.push({ title: x.title, url: x.url, type }); } };
  BM.get().forEach(b => add(b, 'bookmark')); HIST.get().slice(0, 600).forEach(h => add(h, 'history')); return out;
}

/* ───────────────────────── Navigation guard (SecurityManager) ───────────────────────── */
function guardNav(e, url, fromInternal) {
  let u; try { u = new URL(url); } catch { return e.preventDefault(); }
  if (u.protocol === 'http:' || u.protocol === 'https:' || url === 'about:blank') return;
  if (u.protocol === 'browser:') { if (!fromInternal) e.preventDefault(); return; }
  e.preventDefault(); // javascript:, data:, file:, blob: and unknown schemes never navigate a tab
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') {
    dialog.showMessageBox({ type: 'question', buttons: ['Open', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Open this link in another application?', detail: u.protocol + u.pathname.slice(0, 80) })
      .then(r => { if (r.response === 0) shell.openExternal(url); });
  }
}

/* ───────────────────────── Window / tabs (TabManager + BrowserController) ───────────────────────── */
class Win {
  constructor(priv) {
    this.priv = !!priv; this.tabs = []; this.active = null; this.closed = []; this.overlay = false; this.nid = 1;
    this.ses = priv ? session.fromPartition('private-' + rid()) : session.fromPartition('persist:main'); prep(this.ses, priv);
    this.win = new BrowserWindow({ width: 1366, height: 820, minWidth: 640, minHeight: 420, show: false, autoHideMenuBar: true, title: 'Orbit Browser', backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161c' : '#ffffff' });
    this.ui = new WebContentsView({ webPreferences: { preload: path.join(SRC, 'preload', 'ui.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    this.ui.setBackgroundColor('#00000000'); this.win.contentView.addChildView(this.ui);
    wins.set(this.ui.webContents.id, this);
    this.ui.webContents.loadURL('browser://ui/index.html' + (priv ? '?private=1' : ''));
    this.ui.webContents.once('did-finish-load', () => { this.layout(); this.newTab(S().home); this.win.show(); });
    this.win.on('resize', () => this.layout());
    this.win.on('closed', () => {
      for (const t of this.tabs) { wcMap.delete(t.wc.id); try { t.wc.close(); } catch {} }
      wins.delete(this.ui.webContents.id); if (this.priv) this.ses.clearStorageData().catch(() => {});
    });
  }
  cur() { return this.active; }
  layout() {
    if (this.win.isDestroyed()) return;
    const [w, h] = this.win.getContentSize(), ch = CHROME + (S().bookmarksBar ? BAR : 0);
    this.ui.setBounds(this.overlay ? { x: 0, y: 0, width: w, height: h } : { x: 0, y: 0, width: w, height: ch });
    for (const t of this.tabs) { t.view.setVisible(t === this.active); t.view.setBounds({ x: 0, y: ch, width: w, height: Math.max(0, h - ch) }); }
  }
  newTab(url, o = {}) {
    const view = new WebContentsView({ webPreferences: { session: this.ses, preload: path.join(SRC, 'preload', 'page.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: true } });
    const wc = view.webContents;
    const t = { id: this.nid++, view, wc, title: 'New Tab', url: '', favicon: '', loading: false, failed: null, t0: 0, loadMs: null, popups: 0, popT: 0, blocked: 0 };
    this.tabs.push(t); wcMap.set(wc.id, { win: this, tab: t });
    this.win.contentView.addChildView(view); this.win.contentView.addChildView(this.ui); // keep browser chrome on top
    this.wire(t); if (!o.bg || !this.active) this.active = t;
    this.layout(); this.navigate(t, url || S().home); this.push(); return t;
  }
  activate(t) { this.active = t; this.layout(); t.wc.focus(); this.win.setTitle(t.title + ' - Orbit'); this.push(); }
  closeTab(t = this.active) {
    const i = this.tabs.indexOf(t); if (i < 0) return;
    const u = t.failed ? t.failed.url : t.url; if (!this.priv && u && !u.startsWith('browser://')) { this.closed.push(u); if (this.closed.length > 25) this.closed.shift(); }
    this.tabs.splice(i, 1); this.win.contentView.removeChildView(t.view); wcMap.delete(t.wc.id); try { t.wc.close(); } catch {}
    if (!this.tabs.length) { this.win.close(); return; }
    if (this.active === t) this.active = this.tabs[Math.min(i, this.tabs.length - 1)];
    this.layout(); this.push();
  }
  reopen() { const u = this.closed.pop(); if (u) this.newTab(u); }
  navigate(t, text) {
    const r = resolve(text, S());
    if (r.error) { if (r.error === 'empty') return; t.wc.loadURL('browser://error/?code=-300&desc=' + encodeURIComponent('ERR_INVALID_URL') + '&msg=' + encodeURIComponent(r.error) + '&url=' + encodeURIComponent(String(text).slice(0, 300))).catch(() => {}); return; }
    t.wc.loadURL(r.url).catch(() => {}); // failures are reported through did-fail-load
  }
  reload(t) { if (t.failed) this.navigate(t, t.failed.url); else t.wc.reload(); }
  wire(t) {
    const wc = t.wc;
    wc.setWindowOpenHandler(d => {
      const now = Date.now(); if (now - t.popT > 3000) { t.popT = now; t.popups = 0; } t.popups++;
      if (!/^https?:/i.test(d.url)) return { action: 'deny' };
      const scripted = d.disposition === 'new-window';
      if ((scripted && S().blockPopups && t.popups > 1) || t.popups > 5) { t.blocked++; diag.log('popup blocked from ' + hostOf(t.url)); this.push(); return { action: 'deny' }; }
      if (scripted && d.features) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 520, height: 700 } }; // real popup keeps window.opener (OAuth / login flows)
      this.newTab(d.url, { bg: d.disposition === 'background-tab' }); return { action: 'deny' };
    });
    wc.on('did-create-window', child => { child.setMenuBarVisibility(false); child.webContents.on('will-navigate', e => guardNav(e, e.url, false)); child.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); });
    wc.on('page-title-updated', (e, title) => { t.title = title; if (!this.priv) updHist(t.url, { title }); if (t === this.active) this.win.setTitle(title + ' - Orbit'); this.push(); });
    wc.on('page-favicon-updated', (e, f) => { t.favicon = f[0] || ''; if (!this.priv) updHist(t.url, { favicon: t.favicon }); this.push(); });
    wc.on('did-start-loading', () => { t.loading = true; t.t0 = Date.now(); this.push(); });
    wc.on('did-stop-loading', () => { t.loading = false; t.loadMs = Date.now() - t.t0; this.push(); });
    wc.on('did-start-navigation', e => { if (e.isMainFrame && !e.isSameDocument && !String(e.url).startsWith('browser://error')) t.failed = null; });
    wc.on('did-navigate', (e, url) => {
      t.url = url; if (url.startsWith('browser://')) { const k = url.slice(10).split(/[/?#]/)[0]; t.title = k === 'error' ? 'Page failed to load' : k[0].toUpperCase() + k.slice(1); }
      if (!this.priv && /^https?:/.test(url)) addHist(url, t.title); this.push();
    });
    wc.on('did-navigate-in-page', (e, url, isMain) => { if (isMain) { t.url = url; this.push(); } });
    wc.on('did-fail-load', (e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return; // -3 = aborted (user navigated away / stopped)
      t.failed = { code, desc, url }; diag.last = desc + ' (' + hostOf(url) + ')'; diag.log('load failed ' + desc + ' ' + hostOf(url));
      wc.loadURL('browser://error/?code=' + code + '&desc=' + encodeURIComponent(desc) + '&url=' + encodeURIComponent(url)).catch(() => {});
    });
    wc.on('render-process-gone', (e, d) => { t.failed = { code: -1, desc: 'RENDERER_CRASH', url: t.url }; diag.log('renderer gone: ' + d.reason); wc.loadURL('browser://error/?code=-1&desc=RENDERER_CRASH&url=' + encodeURIComponent(t.url)).catch(() => {}); });
    const nav = e => guardNav(e, e.url, wc.getURL().startsWith('browser://'));
    wc.on('will-navigate', nav); wc.on('will-redirect', nav);
    wc.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape' && t.loading) wc.stop(); });
    wc.on('context-menu', (e, p) => {
      const m = [];
      if (p.linkURL) m.push({ label: 'Open link in new tab', click: () => this.newTab(p.linkURL) }, { label: 'Open link in background tab', click: () => this.newTab(p.linkURL, { bg: true }) }, { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
      if (p.selectionText) m.push({ role: 'copy' }); if (p.isEditable) m.push({ role: 'cut' }, { role: 'paste' });
      m.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Reload', click: () => this.reload(t) }, { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
      Menu.buildFromTemplate(m).popup({ window: this.win });
    });
  }
  secState(t) {
    const u = t.failed ? null : t.url; if (!u) return t.failed ? 'error' : 'none';
    if (u.startsWith('browser:')) return 'internal'; if (u.startsWith('http:')) return 'insecure';
    if (u.startsWith('https:')) { const c = certs.get(hostOf(u)); return c && c.result === 'net::OK' ? 'secure' : 'unknown'; }
    return 'unknown';
  }
  info(t) {
    const h = t.wc.navigationHistory; let url = t.url; if (t.failed) url = t.failed.url;
    return { url: url.startsWith('browser://newtab') ? '' : url, title: t.title, canBack: h.canGoBack(), canFwd: h.canGoForward(), loading: t.loading,
      sec: this.secState(t), starred: BM.get().some(b => b.url === url), internal: url.startsWith('browser://'), blocked: t.blocked };
  }
  snapshot() {
    return { priv: this.priv, active: this.active && this.active.id, page: this.active ? this.info(this.active) : null,
      tabs: this.tabs.map(x => ({ id: x.id, title: x.title, favicon: x.favicon, loading: x.loading })),
      bookmarks: BM.get().slice(0, 300), bar: S().bookmarksBar, dl: DL.filter(d => d.state === 'downloading').length, net: pubNet() };
  }
  push() { clearTimeout(this.pt); this.pt = setTimeout(() => { if (!this.win.isDestroyed() && !this.ui.webContents.isDestroyed()) this.ui.webContents.send('state', this.snapshot()); }, 20); }
  siteInfo() {
    const t = this.active; if (!t) return null; const url = t.failed ? t.failed.url : t.url; let u; try { u = new URL(url); } catch {}
    return { url: safeUrl(url), host: u ? u.hostname : '', protocol: u ? u.protocol.replace(':', '') : '', sec: this.secState(t), cert: u ? certs.get(u.hostname) || null : null,
      perms: u ? PERM.get()[u.origin] || {} : {}, origin: u ? u.origin : '', blocked: t.blocked };
  }
  askPermission(origin, key) { return new Promise(r => { const id = permId++; pendingPerm.set(id, r); this.ui.webContents.send('perm', { id, origin, key }); }); }
}

/* ───────────────────────── IPC: browser chrome ───────────────────────── */
ipcMain.handle('ui', async (e, cmd, a) => {
  const w = wins.get(e.sender.id); if (!w) throw new Error('denied');
  const t = w.active, byId = id => w.tabs.find(x => x.id === id);
  switch (cmd) {
    case 'ready': return w.snapshot();
    case 'newtab': w.newTab(a && a.url, { bg: !!(a && a.bg) }); return;
    case 'activate': { const x = byId(a); if (x) w.activate(x); return; }
    case 'close': { const x = byId(a); if (x) w.closeTab(x); return; }
    case 'go': if (t) w.navigate(t, String(a)); return;
    case 'back': if (t) t.wc.navigationHistory.goBack(); return;
    case 'forward': if (t) t.wc.navigationHistory.goForward(); return;
    case 'reload': if (t) w.reload(t); return;
    case 'stop': if (t) t.wc.stop(); return;
    case 'home': if (t) w.navigate(t, S().home); return;
    case 'dup': { const x = byId(a) || t; if (x) w.newTab(x.failed ? x.failed.url : x.url); return; }
    case 'reopen': w.reopen(); return;
    case 'overlay': w.overlay = !!a; w.layout(); return;
    case 'suggest': return suggest(String(a));
    case 'siteinfo': return w.siteInfo();
    case 'bm:get': { const x = t && w.info(t).url; return BM.get().find(b => b.url === x) || null; }
    case 'bm:add': { const i = w.info(t); if (!/^https?:/.test(i.url)) return null; const b = { id: rid(), title: (t.title || i.url).slice(0, 200), url: i.url, folder: '' }; BM.get().push(b); BM.save(); w.push(); return b; }
    case 'bm:set': { const b = BM.get().find(x => x.id === a.id); if (b) { b.title = String(a.title || b.title).slice(0, 200); b.folder = String(a.folder || '').slice(0, 60); BM.save(); w.push(); } return; }
    case 'bm:del': { const i = BM.get().findIndex(x => x.id === a); if (i >= 0) { BM.get().splice(i, 1); BM.save(); w.push(); } return; }
    case 'perm-reply': { const p = pendingPerm.get(a.id); if (p) { pendingPerm.delete(a.id); p({ allow: !!a.allow, remember: !!a.remember }); } return; }
    case 'perm-reset': { const P = PERM.get(); delete P[String(a)]; PERM.save(); return; }
    case 'netcheck': return selectConnection();
    case 'vpn': return vpnStatus();
    case 'dl:list': return pubDl().slice(0, 6);
    case 'dl:act': dlAct(a.id, a.act); return;
    case 'view': {
      if (!t) return; const wc = t.wc;
      if (a === 'zoomin') wc.setZoomLevel(Math.min(5, wc.getZoomLevel() + 0.5)); else if (a === 'zoomout') wc.setZoomLevel(Math.max(-3, wc.getZoomLevel() - 0.5));
      else if (a === 'zoomreset') wc.setZoomLevel(0); else if (a === 'print') wc.print(); else if (a === 'devtools') wc.toggleDevTools();
      else if (a === 'newwin') new Win(false); else if (a === 'privwin') new Win(true); return;
    }
    case 'tabmenu': {
      const x = byId(a); if (!x) return;
      Menu.buildFromTemplate([{ label: 'Duplicate tab', click: () => w.newTab(x.failed ? x.failed.url : x.url) }, { label: 'Reload', click: () => w.reload(x) }, { type: 'separator' },
        { label: 'Close tab', click: () => w.closeTab(x) }, { label: 'Close other tabs', click: () => w.tabs.filter(y => y !== x).forEach(y => w.closeTab(y)) }]).popup({ window: w.win }); return;
    }
  }
});

/* ───────────────────────── IPC: internal browser:// pages ───────────────────────── */
const SCHEMA = {
  theme: v => ['system', 'light', 'dark'].includes(v), engine: v => v in ENGINES, customSearch: v => typeof v === 'string' && v.length < 500,
  home: v => typeof v === 'string' && !resolve(v, S()).error, bookmarksBar: v => typeof v === 'boolean', blockPopups: v => typeof v === 'boolean',
  httpsOnly: v => typeof v === 'boolean', doNotTrack: v => typeof v === 'boolean', askDownload: v => typeof v === 'boolean', downloadDir: v => typeof v === 'string' && v.length < 500
};
const pubSettings = () => { const { network, ...rest } = S(); return rest; };
const cutoff = r => ({ hour: 3.6e6, day: 8.64e7, week: 6.048e8 }[r] ? Date.now() - { hour: 3.6e6, day: 8.64e7, week: 6.048e8 }[r] : 0);

ipcMain.handle('page', async (e, cmd, a) => {
  const own = wcMap.get(e.sender.id), fu = e.senderFrame && e.senderFrame.url || '';
  if (!own || !fu.startsWith('browser://') || fu.startsWith('browser://ui')) throw new Error('denied');
  a = a || {};
  switch (cmd) {
    case 'go': { const q = typeof a === 'string' ? a : a.q; own.win.navigate(own.tab, String(q)); return; }
    case 'nav': if (a === 'back') own.tab.wc.navigationHistory.goBack(); return;
    case 'external': { const r = resolve(a.url, S()); if (r.url && /^https?:/.test(r.url)) shell.openExternal(r.url); return; }
    case 'settings:get': return pubSettings();
    case 'settings:set': {
      for (const [k, v] of Object.entries(a)) { if (!SCHEMA[k] || !SCHEMA[k](v)) throw new Error('Invalid value for ' + k); S()[k] = v; }
      SET.save(); nativeTheme.themeSource = S().theme; for (const w of wins.values()) { w.layout(); w.push(); } return pubSettings();
    }
    case 'pickdir': { const r = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; }
    case 'engines': return Object.entries(ENGINES).map(([id, v]) => ({ id, name: v.name }));
    case 'newtab': {
      const f = {}; HIST.get().slice(0, 1500).forEach(h => { const k = hostOf(h.url); (f[k] = f[k] || { host: k, url: h.url, n: 0 }).n++; });
      return { engine: (ENGINES[S().engine] || ENGINES.duckduckgo).name, bookmarks: BM.get().slice(0, 8), top: Object.values(f).sort((x, y) => y.n - x.n).slice(0, 6), recent: HIST.get().slice(0, 5), net: pubNet() };
    }
    case 'bm:list': return BM.get();
    case 'bm:set': { const b = BM.get().find(x => x.id === a.id); if (b) { b.title = String(a.title || b.title).slice(0, 200); b.folder = String(a.folder || '').slice(0, 60); BM.save(); } return BM.get(); }
    case 'bm:del': { const i = BM.get().findIndex(x => x.id === a.id); if (i >= 0) BM.get().splice(i, 1); BM.save(); for (const w of wins.values()) w.push(); return BM.get(); }
    case 'bm:export': { const r = await dialog.showSaveDialog({ defaultPath: 'orbit-bookmarks.json' }); if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(BM.get(), null, 2)); return !r.canceled; }
    case 'bm:import': {
      const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] }); if (r.canceled) return 0;
      const arr = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); let n = 0;
      for (const b of Array.isArray(arr) ? arr : []) if (b && typeof b.url === 'string' && /^https?:\/\//i.test(b.url) && !BM.get().some(x => x.url === b.url)) { BM.get().push({ id: rid(), title: String(b.title || b.url).slice(0, 200), url: b.url, folder: String(b.folder || '').slice(0, 60) }); n++; }
      BM.save(); for (const w of wins.values()) w.push(); return n;
    }
    case 'hist:list': { const q = String(a.q || '').toLowerCase(); return HIST.get().filter(h => !q || (h.title + ' ' + h.url).toLowerCase().includes(q)).slice(0, 1000); }
    case 'hist:del': { const ids = new Set(a.ids || []); const arr = HIST.get(); for (let i = arr.length - 1; i >= 0; i--) if (ids.has(arr[i].id)) arr.splice(i, 1); HIST.save(); return; }
    case 'hist:clear': { const c = cutoff(a.range); const arr = HIST.get(); for (let i = arr.length - 1; i >= 0; i--) if (arr[i].time >= c) arr.splice(i, 1); HIST.save(); return; }
    case 'data:clear': {
      const ses = own.win.ses;
      if (a.cookies) await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'filesystem'] });
      if (a.cache) await ses.clearCache();
      if (a.history) { const c = cutoff(a.range); const arr = HIST.get(); for (let i = arr.length - 1; i >= 0; i--) if (arr[i].time >= c) arr.splice(i, 1); HIST.save(); }
      return;
    }
    case 'dl:list': return pubDl();
    case 'dl:act': dlAct(a.id, a.act); return pubDl();
    case 'dl:clear': for (let i = DL.length - 1; i >= 0; i--) if (DL[i].state !== 'downloading' && DL[i].state !== 'paused') DL.splice(i, 1); bcastDl(true); return pubDl();
    case 'perm:list': return PERM.get();
    case 'perm:del': { const P = PERM.get(); if (a.key) { if (P[a.origin]) { delete P[a.origin][a.key]; if (!Object.keys(P[a.origin]).length) delete P[a.origin]; } } else delete P[a.origin]; PERM.save(); return P; }
    case 'net:get': { const n = S().network; return { auto: !!n.auto, primary: pubProfile(n.primary && { ...n.primary, slot: 'primary' }), secondary: pubProfile(n.secondary && { ...n.secondary, slot: 'secondary' }), status: pubNet(), vpn: vpnStatus() }; }
    case 'net:test': { const p = cleanProfile(a.key, a.profile, S().network[a.key]); if (!p) return { ok: false, error: 'Nothing to test' }; if (a.profile.keep && !p.passEnc) p.passEnc = (S().network[a.key] || {}).passEnc; return probe(a.key, p); }
    case 'net:save': {
      const n = S().network, primary = cleanProfile('primary', a.primary, n.primary) || { mode: 'direct' }, secondary = cleanProfile('secondary', a.secondary, n.secondary);
      S().network = { auto: !!a.auto, primary, secondary }; SET.save(); scheduleNet(); return selectConnection();
    }
    case 'diag:get': {
      const w = own.win;
      return { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform + ' ' + os.release(),
        renderer: 'Chromium ' + process.versions.chrome + ' (Electron WebContentsView, sandboxed)', windows: wins.size, tabCount: [...wins.values()].reduce((n, x) => n + x.tabs.length, 0),
        tabs: w.tabs.map(t => ({ title: String(t.title).slice(0, 60), url: safeUrl(t.failed ? t.failed.url : t.url), loadMs: t.loadMs, loading: t.loading, active: t === w.active })),
        net: pubNet(), vpn: vpnStatus(), lastError: diag.last, logs: diag.logs.slice(-120) };
    }
    case 'diag:clear': diag.logs.length = 0; diag.last = null; return;
    case 'about': return { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, userData: app.getPath('userData') };
  }
});

/* ───────────────────────── browser:// protocol (serves UI + internal pages; hosts never reach the network) ───────────────────────── */
async function serve(req) {
  const u = new URL(req.url); let f;
  if (u.host === 'ui') {
    const root = path.join(SRC, 'ui'); f = path.normalize(path.join(root, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)));
    if (!f.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
  } else { const m = u.pathname.match(/^\/(internal\.(js|css))$/); f = path.join(SRC, 'pages', m ? m[1] : 'internal.html'); }
  return net.fetch(pathToFileURL(f).toString());
}

/* ───────────────────────── Menu + shortcuts ───────────────────────── */
function buildMenu() {
  const W = () => cw(), T = () => cw() && cw().cur(), go = u => W() && W().newTab(u);
  const tabs = []; for (let i = 1; i <= 8; i++) tabs.push({ label: 'Tab ' + i, accelerator: 'CmdOrCtrl+' + i, click: () => { const w = W(); if (w && w.tabs[i - 1]) w.activate(w.tabs[i - 1]); } });
  const step = d => { const w = W(); if (!w) return; const i = w.tabs.indexOf(w.active); w.activate(w.tabs[(i + d + w.tabs.length) % w.tabs.length]); };
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => go() }, { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => new Win(false) },
      { label: 'New Private Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => new Win(true) }, { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => W() && W().closeTab() },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => W() && W().reopen() }, { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => T() && T().wc.print() } ] },
    { label: 'Edit', role: 'editMenu' },
    { label: 'Navigate', submenu: [
      { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => { const w = W(); if (w) { w.ui.webContents.focus(); w.ui.webContents.send('focus-url'); } } },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => T() && W().reload(T()) }, { label: 'Reload (F5)', accelerator: 'F5', click: () => T() && W().reload(T()) },
      { label: 'Back', accelerator: 'Alt+Left', click: () => T() && T().wc.navigationHistory.goBack() }, { label: 'Forward', accelerator: 'Alt+Right', click: () => T() && T().wc.navigationHistory.goForward() },
      { label: 'Home', accelerator: 'Alt+Home', click: () => T() && W().navigate(T(), S().home) },
      { label: 'Bookmark This Page', accelerator: 'CmdOrCtrl+D', click: () => W() && W().ui.webContents.send('bookmark') },
      { label: 'History', accelerator: 'CmdOrCtrl+H', click: () => go('browser://history') }, { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: () => go('browser://downloads') },
      { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => step(1) }, { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => step(-1) } ] },
    { label: 'View', submenu: [
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => T() && T().wc.setZoomLevel(T().wc.getZoomLevel() + 0.5) }, { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => T() && T().wc.setZoomLevel(T().wc.getZoomLevel() - 0.5) },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => T() && T().wc.setZoomLevel(0) }, { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'F12', click: () => T() && T().wc.toggleDevTools() }, { label: 'Developer Tools (Inspect)', accelerator: 'CmdOrCtrl+Shift+I', click: () => T() && T().wc.toggleDevTools() },
      { label: 'Diagnostics', click: () => go('browser://diagnostics') }, { role: 'togglefullscreen', accelerator: 'F11' } ] },
    { label: 'Tabs', submenu: tabs }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on('web-contents-created', (e, wc) => { wc.on('will-attach-webview', ev => ev.preventDefault()); });
app.whenReady().then(async () => {
  SET = new Store('settings', DEF); BM = new Store('bookmarks', []); HIST = new Store('history', []); PERM = new Store('permissions', {});
  nativeTheme.themeSource = S().theme; protocol.handle('browser', serve); buildMenu();
  new Win(false); scheduleNet(); selectConnection();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) new Win(false); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { [SET, BM, HIST, PERM].forEach(s => s && s.flush()); });
