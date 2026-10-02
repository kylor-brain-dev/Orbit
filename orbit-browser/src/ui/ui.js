(() => {
'use strict';
const o = window.orbit, $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
document.body.classList.toggle('priv', location.search.includes('private=1'));
$('#priv').hidden = !location.search.includes('private=1');

const SEC = { secure: ['🔒', 'Secure', 'ok'], insecure: ['⚠', 'Not secure', 'bad'], error: ['⚠', 'Error', 'bad'], internal: ['◉', 'Orbit', 'muted'], unknown: ['ⓘ', 'Unverified', 'muted'], none: ['ⓘ', '', 'muted'] };
const MODE = { direct: 'Direct', http: 'HTTP proxy', https: 'HTTPS proxy', socks5: 'SOCKS5' };
const PERMS = { media: 'use your camera or microphone', 'media:audio': 'use your microphone', 'media:video': 'use your camera', 'media:audio+video': 'use your camera and microphone', geolocation: 'know your location', notifications: 'show notifications', 'clipboard-read': 'read your clipboard', midi: 'use MIDI devices', 'display-capture': 'record your screen' };
let st = null, ov = null, sug = [], si = -1, permQ = [], tSug = 0;
const urlI = $('#url'), panel = $('#panel');

/* ---------- render ---------- */
function render() {
  if (!st) return;
  const tabs = $('#tabs'); tabs.replaceChildren();
  for (const t of st.tabs) {
    const d = mk('div', 'tab' + (t.id === st.active ? ' on' : '')); d.title = t.title;
    const fav = () => mk('i', 'fav', (t.title[0] || '•').toUpperCase());
    let ic; if (t.loading) ic = mk('i', 'spin'); else if (t.favicon) { ic = mk('img', 'ico'); ic.src = t.favicon; ic.alt = ''; ic.onerror = () => ic.replaceWith(fav()); } else ic = fav();
    const x = mk('button', 'x', '✕'); x.title = 'Close tab';
    d.append(ic, mk('span', 'tt', t.title), x);
    d.onmousedown = e => { if (e.button === 1) { e.preventDefault(); o.cmd('close', t.id); } };
    d.onclick = e => { if (e.target === x) o.cmd('close', t.id); else o.cmd('activate', t.id); };
    d.oncontextmenu = e => { e.preventDefault(); o.cmd('tabmenu', t.id); };
    tabs.append(d);
  }
  const plus = mk('button', null, '+'); plus.id = 'newtab'; plus.title = 'New tab (Ctrl+T)'; plus.onclick = () => o.cmd('newtab'); tabs.append(plus);
  const act = tabs.querySelector('.tab.on'); if (act) act.scrollIntoView({ inline: 'nearest', block: 'nearest' });

  const p = st.page || {};
  $('#back').disabled = !p.canBack; $('#fwd').disabled = !p.canFwd;
  $('#rel').textContent = p.loading ? '✕' : '↻'; $('#rel').title = p.loading ? 'Stop (Esc)' : 'Reload (Ctrl+R)';
  if (document.activeElement !== urlI) urlI.value = p.url || '';
  const s = SEC[p.sec || 'none']; $('#sec').textContent = s[0] + ' ' + s[1]; $('#sec').className = s[2];
  $('#star').textContent = p.starred ? '★' : '☆'; $('#star').disabled = !!p.internal || !p.url;
  const n = st.net, c = $('#conn');
  c.textContent = '● ' + (n.state === 'connected' ? MODE[n.mode] : n.state === 'failed' ? 'Connection problem' : MODE[n.mode] + ' (unverified)');
  c.className = n.state === 'connected' ? 'ok' : n.state === 'failed' ? 'bad' : 'muted';
  $('#dl').textContent = st.dl ? '⤓ ' + st.dl : '⤓';

  const bm = $('#bm'); bm.hidden = !st.bar; bm.replaceChildren();
  if (st.bar) {
    const loose = st.bookmarks.filter(b => !b.folder), folders = [...new Set(st.bookmarks.map(b => b.folder).filter(Boolean))];
    if (!st.bookmarks.length) bm.append(mk('span', 'hint', 'Press ☆ in the address bar to add bookmarks here'));
    for (const b of loose) { const e = mk('button', null, b.title); e.title = b.url; e.onmousedown = ev => { if (ev.button === 1) { ev.preventDefault(); o.cmd('newtab', { url: b.url, bg: true }); } }; e.onclick = () => o.cmd('go', b.url); bm.append(e); }
    for (const f of folders) { const e = mk('button', null, '📁 ' + f + ' ▾'); e.onclick = () => openOv('folder', f); bm.append(e); }
  }
}

/* ---------- overlay + panels ---------- */
function openOv(kind, data) {
  ov = kind; o.cmd('overlay', true);
  const O = $('#ov'); O.hidden = false; O.className = kind === 'sug' ? 'clear' : '';
  const R = PANELS[kind](data); panel.className = R[0]; panel.innerHTML = R[1];
  const f = panel.querySelector('[autofocus]'); if (f) f.focus();
}
function closeOv() { if (!ov) return; ov = null; $('#ov').hidden = true; panel.innerHTML = ''; o.cmd('overlay', false); }
const item = (a, label, k) => '<button class="it" data-a="' + a + '"><span>' + label + '</span><kbd>' + (k || '') + '</kbd></button>';
const ago = t => new Date(t).toLocaleString();
const PANELS = {
  menu: () => ['panel right', item('newtab', 'New tab', 'Ctrl+T') + item('newwin', 'New window', 'Ctrl+N') + item('privwin', 'New private window', 'Ctrl+Shift+N') + item('reopen', 'Reopen closed tab', 'Ctrl+Shift+T') + '<hr>' +
    item('page:bookmarks', 'Bookmarks') + item('page:history', 'History', 'Ctrl+H') + item('page:downloads', 'Downloads', 'Ctrl+J') + item('page:settings', 'Settings') + item('page:diagnostics', 'Diagnostics') + '<hr>' +
    '<div class="it"><span>Zoom</span><span><button data-a="zoomout">−</button> <button data-a="zoomreset">100%</button> <button data-a="zoomin">+</button></span></div>' + item('print', 'Print…', 'Ctrl+P') + item('devtools', 'Developer tools', 'F12') + '<hr>' + item('page:about', 'About Orbit')],
  sug: () => ['panel omni', sug.map((s, i) => '<button class="sg' + (i === si ? ' on' : '') + '" data-i="' + i + '"><span>' + (s.type === 'bookmark' ? '★' : '🕘') + '</span><span>' + esc(s.title || s.url) + '</span><span>' + esc(s.url) + '</span></button>').join('')],
  site: d => {
    if (!d) return ['panel left', '<h3>Site information</h3><div class="p">No page loaded.</div>'];
    let h = '<h3>Site information</h3>';
    if (d.sec === 'internal') h += '<div class="p">This is an internal Orbit page. Nothing is sent to the internet.</div>';
    else {
      h += '<div class="p">Domain: <b>' + esc(d.host) + '</b><br>Protocol: <b>' + esc(d.protocol.toUpperCase()) + '</b><br>Connection: <b class="' + (d.sec === 'secure' ? 'ok' : d.sec === 'insecure' ? 'bad' : 'muted') + '">' +
        (d.sec === 'secure' ? 'Secure (certificate verified)' : d.sec === 'insecure' ? 'Not secure — traffic is not encrypted' : d.sec === 'error' ? 'Error' : 'Not verified') + '</b></div>';
      if (d.cert) h += '<hr><div class="p">Certificate<br>Issued to: ' + esc(d.cert.subject) + '<br>Issued by: ' + esc(d.cert.issuer) + '<br>Valid: ' + esc(ago(d.cert.from * 1000)) + ' → ' + esc(ago(d.cert.to * 1000)) + '<br>Chromium verification: ' + esc(d.cert.result) + '<br><span class="k">SHA-256: ' + esc(String(d.cert.fp).replace('sha256/', '').slice(0, 24)) + '…</span></div>';
      const pk = Object.entries(d.perms || {}); if (pk.length) h += '<hr><div class="p">Saved permissions: ' + pk.map(([k, v]) => esc(k) + ' → ' + esc(v)).join(', ') + '</div><div class="row"><button class="btn g" data-a="permreset" data-o="' + esc(d.origin) + '">Reset permissions</button></div>';
      if (d.blocked) h += '<hr><div class="p">' + d.blocked + ' popup(s) blocked on this page.</div>';
    }
    return ['panel left', h];
  },
  conn: d => ['panel right', '<h3>Connection</h3><div class="p">Mode: <b>' + MODE[d.net.mode] + '</b>' + (d.net.mode !== 'direct' ? '<br>Host: ' + esc(d.net.host) + '<br>Port: ' + esc(d.net.port) : '') +
    '<br>Status: <b class="' + (d.net.state === 'connected' ? 'ok' : d.net.state === 'failed' ? 'bad' : 'muted') + '">' + (d.net.state === 'connected' ? 'Connected (' + d.net.ms + ' ms)' : d.net.state === 'failed' ? 'Failed — ' + esc(d.net.error) : 'Not verified yet') + '</b>' +
    '<br>Auto-switch: ' + (d.net.auto ? 'on' : 'off') + '<br>Active profile: ' + d.net.active +
    '<hr>System VPN: <b>' + d.vpn.state + '</b>' + (d.vpn.interfaces.length ? ' (' + esc(d.vpn.interfaces.join(', ')) + ')' : '') + '<br><span class="k">' + esc(d.vpn.note) + '</span></div>' +
    '<div class="row"><button class="btn g" data-a="page:settings#network">Network settings</button><button class="btn" data-a="netcheck">Test now</button></div>'],
  dl: list => ['panel right', '<h3>Downloads</h3>' + (list.length ? list.map(d => '<div class="p"><b>' + esc(d.name) + '</b><br>' + (d.state === 'downloading' || d.state === 'paused' ? '<progress max="' + (d.total || 1) + '" value="' + d.received + '"></progress><br>' : '') + esc(d.state) + (d.total ? ' · ' + Math.round(d.received / Math.max(1, d.total) * 100) + '%' : '') +
    (d.state === 'completed' ? ' <button data-a="dlopen" data-id="' + d.id + '">Open</button>' : '') + (d.state === 'downloading' ? ' <button data-a="dlcancel" data-id="' + d.id + '">Cancel</button>' : '') + '</div>').join('') : '<div class="p">No downloads yet.</div>') +
    '<div class="row"><button class="btn g" data-a="page:downloads">Show all</button></div>'],
  bm: b => ['panel right', '<h3>Bookmark</h3><input type="text" id="bt" autofocus value="' + esc(b.title) + '"><input type="text" id="bf" placeholder="Folder (optional)" value="' + esc(b.folder) + '">' +
    '<div class="row"><button class="btn g" data-a="bmdel" data-id="' + b.id + '">Remove</button><button class="btn" data-a="bmsave" data-id="' + b.id + '">Done</button></div>'],
  folder: f => ['panel left', '<h3>' + esc(f) + '</h3>' + st.bookmarks.filter(b => b.folder === f).map(b => '<button class="it" data-a="go" data-u="' + esc(b.url) + '"><span>' + esc(b.title) + '</span></button>').join('')],
  perm: p => ['panel center', '<h3>' + esc(p.origin.replace(/^https?:\/\//, '')) + ' wants to ' + esc(PERMS[p.key] || p.key) + '</h3><label class="p"><input type="checkbox" id="rem" checked> Remember my choice for this site</label>' +
    '<div class="row"><button class="btn g" data-a="pblock">Block</button><button class="btn" data-a="pallow">Allow</button></div>']
};
const FLOW = { newtab: () => o.cmd('newtab'), newwin: () => o.cmd('view', 'newwin'), privwin: () => o.cmd('view', 'privwin'), reopen: () => o.cmd('reopen'),
  zoomin: () => o.cmd('view', 'zoomin'), zoomout: () => o.cmd('view', 'zoomout'), zoomreset: () => o.cmd('view', 'zoomreset'), print: () => o.cmd('view', 'print'), devtools: () => o.cmd('view', 'devtools') };
panel.addEventListener('click', async e => {
  const el = e.target.closest('[data-a],[data-i]'); if (!el) return;
  if (el.dataset.i != null) { const s = sug[+el.dataset.i]; closeOv(); o.cmd('go', s.url); return; }
  const a = el.dataset.a, id = el.dataset.id ? +el.dataset.id : null;
  if (a === 'netcheck') { el.textContent = 'Testing…'; await o.cmd('netcheck'); return openOv('conn', { net: st.net, vpn: await o.cmd('vpn') }); }
  if (a === 'permreset') { await o.cmd('perm-reset', el.dataset.o); return closeOv(); }
  if (a === 'dlopen') { o.cmd('dl:act', { id, act: 'open' }); return; }
  if (a === 'dlcancel') { o.cmd('dl:act', { id, act: 'cancel' }); return; }
  if (a === 'bmsave') { await o.cmd('bm:set', { id: el.dataset.id, title: $('#bt').value, folder: $('#bf').value.trim() }); return closeOv(); }
  if (a === 'bmdel') { await o.cmd('bm:del', el.dataset.id); return closeOv(); }
  if (a === 'go') { closeOv(); return o.cmd('go', el.dataset.u); }
  if (a === 'pallow' || a === 'pblock') { const p = permQ.shift(); o.cmd('perm-reply', { id: p.id, allow: a === 'pallow', remember: $('#rem').checked }); closeOv(); return nextPerm(); }
  closeOv();
  if (a.startsWith('page:')) return o.cmd('newtab', { url: 'browser://' + a.slice(5) });
  if (FLOW[a]) FLOW[a]();
});
$('#ov').addEventListener('mousedown', e => { if (e.target === $('#ov') && ov !== 'perm') closeOv(); });
function nextPerm() { if (permQ.length && ov !== 'perm') openOv('perm', permQ[0]); }

/* ---------- toolbar wiring ---------- */
$('#back').onclick = () => o.cmd('back'); $('#fwd').onclick = () => o.cmd('forward'); $('#home').onclick = () => o.cmd('home');
$('#rel').onclick = () => o.cmd(st && st.page && st.page.loading ? 'stop' : 'reload');
$('#dots').onclick = () => ov === 'menu' ? closeOv() : openOv('menu');
$('#sec').onclick = async () => openOv('site', await o.cmd('siteinfo'));
$('#conn').onclick = async () => openOv('conn', { net: st.net, vpn: await o.cmd('vpn') });
$('#dl').onclick = async () => openOv('dl', await o.cmd('dl:list'));
async function starClick() { let b = await o.cmd('bm:get'); if (!b) b = await o.cmd('bm:add'); if (b) openOv('bm', b); }
$('#star').onclick = starClick;

urlI.addEventListener('focus', () => urlI.select());
urlI.addEventListener('input', () => {
  clearTimeout(tSug); const q = urlI.value;
  tSug = setTimeout(async () => { if (!q.trim()) return closeOv(); sug = await o.cmd('suggest', q); si = -1; if (sug.length) openOv('sug'); else if (ov === 'sug') closeOv(); }, 90);
});
urlI.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (ov !== 'sug') return; e.preventDefault(); const n = sug.length; si = e.key === 'ArrowDown' ? (si + 1 >= n ? -1 : si + 1) : (si - 1 < -1 ? n - 1 : si - 1); if (si >= 0) urlI.value = sug[si].url; openOv('sug'); }
  else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tSug); closeOv(); o.cmd('go', urlI.value); urlI.blur(); }
  else if (e.key === 'Escape') { closeOv(); urlI.value = (st.page && st.page.url) || ''; urlI.blur(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && ov !== 'perm') closeOv(); });

/* ---------- main-process events ---------- */
o.on('state', s => { st = s; render(); });
o.on('focus-url', () => { urlI.focus(); urlI.select(); });
o.on('bookmark', starClick);
o.on('dl', n => { if (st) { st.dl = n; render(); } if (ov === 'dl') o.cmd('dl:list').then(l => openOv('dl', l)); });
o.on('perm', p => { permQ.push(p); nextPerm(); });
o.cmd('ready').then(s => { st = s; render(); });
})();
