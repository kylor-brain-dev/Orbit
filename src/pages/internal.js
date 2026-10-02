'use strict';
const o = window.orbit, root = document.getElementById('root');
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t), late = {};
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') late[k] = v;
    else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const x of c.flat(9)) e.append(x && x.nodeType ? x : document.createTextNode(x == null ? '' : String(x)));
  return Object.assign(e, late);
};
const inv = (c, a) => o.invoke(c, a);
const mount = (...n) => root.replaceChildren(...n);
const fmtB = n => n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' KB' : (n || 0) + ' B';
const when = t => new Date(t).toLocaleString();
const letter = t => h('i', { class: 'fav' }, ((t || '•')[0] || '•').toUpperCase());
const MODE = { direct: 'Direct', http: 'HTTP proxy', https: 'HTTPS proxy', socks5: 'SOCKS5' };
let tt; const toast = m => { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2500); };
const row = (label, ctl, hint) => h('div', { class: 'f' }, h('label', {}, label), h('div', {}, ctl, hint ? h('small', {}, hint) : ''));
const connPill = n => h('span', { class: 'pill ' + (n.state === 'connected' ? 'ok' : n.state === 'failed' ? 'bad' : 'muted') },
  '● ' + (n.state === 'connected' ? 'Connected - ' + MODE[n.mode] : n.state === 'failed' ? 'Connection problem' : MODE[n.mode] + ' (not verified)'));

/* ---------- New tab ---------- */
async function newtab() {
  const d = await inv('newtab');
  const tile = (t, u) => h('a', { class: 'tile', href: u }, letter(t), h('b', {}, t));
  mount(
    h('div', { class: 'wrap center' }, h('h1', { class: 'logo' }, 'Orbit'),
      h('form', { class: 'search', onsubmit: e => { e.preventDefault(); const q = e.target.q.value; if (q.trim()) inv('go', { q }); } },
        h('input', { name: 'q', placeholder: 'Search with ' + d.engine + ' or enter address', autofocus: true, autocomplete: 'off' }), h('button', { class: 'btn' }, 'Search'))),
    h('div', { class: 'wrap' },
      d.bookmarks.length ? [h('h2', {}, 'Bookmarks'), h('div', { class: 'grid' }, d.bookmarks.map(b => tile(b.title, b.url)))] : '',
      d.top.length ? [h('h2', {}, 'Frequently visited'), h('div', { class: 'grid' }, d.top.map(t => tile(t.host, t.url)))] : '',
      d.recent.length ? [h('h2', {}, 'Recent pages'), d.recent.map(r => h('a', { class: 'row', href: r.url }, h('span', { class: 'm' }, r.title), h('span', { class: 'u' }, r.url)))] : '',
      h('h2', {}, 'Connection'), h('p', {}, connPill(d.net), ' ', h('a', { href: 'browser://settings#network' }, 'Network settings'))));
}

/* ---------- History ---------- */
async function histPage() {
  let q = '', items = [], sel = new Set();
  const list = h('div');
  async function load() { items = await inv('hist:list', { q }); sel.clear(); draw(); }
  function draw() {
    list.replaceChildren(items.length ? items.map(i => h('div', { class: 'row' },
      h('input', { type: 'checkbox', onchange: e => e.target.checked ? sel.add(i.id) : sel.delete(i.id) }),
      h('a', { class: 'm', href: i.url }, i.title), h('span', { class: 'u' }, i.url), h('span', { class: 'u' }, when(i.time)))) : h('p', { class: 'muted' }, 'No history.'));
  }
  const range = h('select', {}, [['hour', 'Last hour'], ['day', 'Last 24 hours'], ['week', 'Last 7 days'], ['all', 'All time']].map(([v, t]) => h('option', { value: v }, t)));
  mount(h('div', { class: 'wrap' }, h('h1', {}, 'History'),
    h('div', { class: 'bar' }, h('input', { placeholder: 'Search history', oninput: e => { q = e.target.value; clearTimeout(window._ht); window._ht = setTimeout(load, 150); } }),
      h('button', { onclick: async () => { if (!sel.size) return toast('Select items first'); await inv('hist:del', { ids: [...sel] }); load(); } }, 'Delete selected'),
      range, h('button', { class: 'bad', onclick: async () => { if (confirm('Clear history for: ' + range.selectedOptions[0].text + '?')) { await inv('hist:clear', { range: range.value }); load(); } } }, 'Clear')), list));
  load();
}

/* ---------- Bookmarks ---------- */
async function bookmarks() {
  let all = await inv('bm:list'), q = ''; const list = h('div');
  function draw() {
    const f = all.filter(b => !q || (b.title + b.url + b.folder).toLowerCase().includes(q));
    list.replaceChildren(f.length ? f.map(b => {
      const t = h('input', { value: b.title }), fo = h('input', { value: b.folder, placeholder: 'Folder' });
      return h('div', { class: 'row' }, h('a', { href: b.url }, letter(b.title)), t, fo, h('span', { class: 'u' }, b.url),
        h('button', { class: 's', onclick: async () => { all = await inv('bm:set', { id: b.id, title: t.value, folder: fo.value }); toast('Saved'); } }, 'Save'),
        h('button', { class: 's bad', onclick: async () => { all = await inv('bm:del', { id: b.id }); draw(); } }, 'Delete'));
    }) : h('p', { class: 'muted' }, 'No bookmarks yet. Press the star in the address bar.'));
  }
  mount(h('div', { class: 'wrap' }, h('h1', {}, 'Bookmarks'),
    h('div', { class: 'bar' }, h('input', { placeholder: 'Search bookmarks', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
      h('button', { onclick: async () => { toast((await inv('bm:export')) ? 'Exported' : 'Cancelled'); } }, 'Export'),
      h('button', { onclick: async () => { try { const n = await inv('bm:import'); all = await inv('bm:list'); draw(); toast(n + ' imported'); } catch { toast('Import failed: invalid file'); } } }, 'Import')), list));
  draw();
}

/* ---------- Downloads ---------- */
async function downloads() {
  const list = h('div');
  function draw(items) {
    list.replaceChildren(items.length ? items.map(d => h('div', { class: 'box', style: null }, h('div', { class: 'bar' }, h('b', {}, d.name), h('span', { class: 'muted' }, d.state)),
      (d.state === 'downloading' || d.state === 'paused') ? h('progress', { max: d.total || 1, value: d.received }) : '',
      h('div', { class: 'muted' }, fmtB(d.received) + (d.total ? ' / ' + fmtB(d.total) : '') + (d.state === 'downloading' && d.speed ? ' · ' + fmtB(d.speed) + '/s' : '')),
      h('div', { class: 'bar' },
        d.state === 'downloading' ? [h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'pause' }) }, 'Pause'), h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'cancel' }) }, 'Cancel')] : '',
        d.state === 'paused' ? [h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'resume' }) }, 'Resume'), h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'cancel' }) }, 'Cancel')] : '',
        d.state === 'completed' ? [h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'open' }) }, 'Open'), h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'show' }) }, 'Show in folder')] : '',
        (d.state === 'failed' || d.state === 'cancelled') ? h('button', { onclick: () => inv('dl:act', { id: d.id, act: 'retry' }) }, 'Retry') : '',
        d.state !== 'downloading' && d.state !== 'paused' ? h('button', { onclick: async () => draw(await inv('dl:act', { id: d.id, act: 'remove' })) }, 'Remove from list') : ''))) : h('p', { class: 'muted' }, 'No downloads.'));
  }
  mount(h('div', { class: 'wrap' }, h('h1', {}, 'Downloads'), h('div', { class: 'bar' }, h('button', { onclick: async () => draw(await inv('dl:clear')) }, 'Clear finished')), list));
  draw(await inv('dl:list')); o.on('downloads', draw);
}

/* ---------- Settings (General / Appearance / Search / Privacy / Security / Network / Downloads / Permissions / Shortcuts / About) ---------- */
async function settings() {
  const S = await inv('settings:get'), engines = await inv('engines');
  const SECS = ['general', 'appearance', 'search', 'privacy', 'security', 'network', 'downloads', 'permissions', 'shortcuts', 'about'];
  let sec = (location.hash || '#general').slice(1); if (!SECS.includes(sec)) sec = 'general';
  const set = async (k, v) => { try { Object.assign(S, await inv('settings:set', { [k]: v })); toast('Saved'); } catch { toast('That value is not valid'); } };
  const chk = (k, label, hint) => row(label, h('input', { type: 'checkbox', checked: !!S[k], onchange: e => set(k, e.target.checked) }), hint);
  const sel = (k, opts) => h('select', { value: String(S[k]), onchange: e => set(k, e.target.value) }, opts.map(([v, t]) => h('option', { value: v }, t)));
  const txt = (k, ph) => h('input', { value: S[k] || '', placeholder: ph || '', style: null, onchange: e => set(k, e.target.value) });
  const B = {
    general: async () => [h('h1', {}, 'General'), row('Home page', txt('home', 'browser://newtab'), 'Use browser://newtab or any web address.')],
    appearance: async () => [h('h1', {}, 'Appearance'), row('Theme', sel('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])), chk('bookmarksBar', 'Show bookmarks bar')],
    search: async () => [h('h1', {}, 'Search'), row('Search engine', sel('engine', engines.map(e => [e.id, e.name])), 'Used when you type something that is not a web address.'),
      row('Custom search URL', txt('customSearch', 'https://example.com/search?q=%s'), 'Used when engine is Custom. Must be https:// and contain %s for the query.')],
    privacy: async () => {
      const range = h('select', {}, [['hour', 'Last hour'], ['day', 'Last 24 hours'], ['week', 'Last 7 days'], ['all', 'All time']].map(([v, t]) => h('option', { value: v }, t)));
      const cH = h('input', { type: 'checkbox', checked: true }), cC = h('input', { type: 'checkbox' }), cK = h('input', { type: 'checkbox' });
      return [h('h1', {}, 'Privacy'), chk('doNotTrack', 'Send "Do Not Track"', 'Sites may ignore this request.'), chk('blockPopups', 'Block repeated pop-ups', 'Link-opened tabs are always allowed; script pop-ups are rate-limited.'),
        h('h2', {}, 'Clear browsing data'), row('Time range', range), row('Browsing history', cH), row('Cookies & site data', cC, 'Always clears everything - cookies cannot be cleared by time range.'), row('Cached files', cK),
        h('button', { class: 'bad', onclick: async () => { await inv('data:clear', { range: range.value, history: cH.checked, cookies: cC.checked, cache: cK.checked }); toast('Cleared'); } }, 'Clear data'),
        h('p', { class: 'muted' }, 'Private windows (Ctrl+Shift+N) keep no history, cookies or cache on disk. They do not make you anonymous: websites and your network can still see your activity.')];
    },
    security: async () => [h('h1', {}, 'Security'), chk('httpsOnly', 'HTTPS-only mode', 'Upgrade http:// page loads to https://. Sites without HTTPS will show an error instead.'),
      h('div', { class: 'box' }, 'Pages run in sandboxed Chromium processes with no access to Orbit internals. Dangerous address types (javascript:, data:, file:) are blocked from navigation. Certificate errors are never bypassed. The lock icon only appears when Chromium has verified the certificate.')],
    network: async () => netSection(),
    downloads: async () => { const dir = h('code', {}, S.downloadDir || '(system Downloads folder)'); return [h('h1', {}, 'Downloads'), chk('askDownload', 'Ask where to save each file'),
      row('Download folder', h('div', {}, dir, ' ', h('button', { onclick: async () => { const p = await inv('pickdir'); if (p) { await set('downloadDir', p); dir.textContent = p; } } }, 'Change…'), ' ', h('button', { onclick: async () => { await set('downloadDir', ''); dir.textContent = '(system Downloads folder)'; } }, 'Reset')))]; },
    permissions: async () => {
      const box = h('div'); const draw = P => { const ent = Object.entries(P); box.replaceChildren(ent.length ? ent.map(([origin, perms]) => h('fieldset', {}, h('legend', {}, origin),
        Object.entries(perms).map(([k, v]) => h('div', { class: 'row' }, h('span', { class: 'm' }, k), h('b', { class: v === 'allow' ? 'ok' : 'bad' }, v), h('button', { class: 's', onclick: async () => draw(await inv('perm:del', { origin, key: k })) }, 'Reset'))))) : h('p', { class: 'muted' }, 'No saved site permissions. Sites ask before using your camera, microphone, location, notifications or clipboard.')); };
      draw(await inv('perm:list')); return [h('h1', {}, 'Permissions'), box];
    },
    shortcuts: async () => [h('h1', {}, 'Shortcuts'), h('table', {}, [['Ctrl+T', 'New tab'], ['Ctrl+W', 'Close tab'], ['Ctrl+Shift+T', 'Reopen closed tab'], ['Ctrl+L', 'Focus address bar'], ['Ctrl+R / F5', 'Reload'], ['Esc', 'Stop loading / close menus'], ['Ctrl+D', 'Bookmark page'], ['Ctrl+H', 'History'], ['Ctrl+J', 'Downloads'],
      ['Alt+Left / Alt+Right', 'Back / Forward'], ['Ctrl+Tab', 'Next tab'], ['Ctrl+1…8', 'Go to tab'], ['Ctrl+N / Ctrl+Shift+N', 'New window / private window'], ['Ctrl++ / Ctrl+- / Ctrl+0', 'Zoom'], ['F12', 'Developer tools'], ['Ctrl+P', 'Print']].map(([k, d]) => h('tr', {}, h('th', {}, k), h('td', {}, d))))],
    about: async () => aboutBody()
  };
  const nav = h('div', { class: 'nav' }, SECS.map(s => h('a', { href: '#' + s, class: s === sec ? 'on' : '', onclick: e => { e.preventDefault(); location.hash = s; settings(); } }, s[0].toUpperCase() + s.slice(1))));
  mount(h('div', { class: 'layout' }, nav, h('div', { class: 'main' }, await B[sec]())));
}

async function netSection() {
  const c = await inv('net:get'), st = c.status; let auto = c.auto;
  const slot = (key, label, p, optional) => {
    const mode = h('select', { value: p ? p.mode : (optional ? 'none' : 'direct') }, (optional ? [['none', 'None']] : []).concat(Object.entries(MODE)).map(([v, t]) => h('option', { value: v }, t)));
    const host = h('input', { value: p ? p.host : '', placeholder: 'proxy.example.com' }), port = h('input', { value: p ? p.port : '', placeholder: '8080', inputmode: 'numeric' });
    const user = h('input', { value: p ? p.user : '', autocomplete: 'off' }), pass = h('input', { type: 'password', autocomplete: 'off', placeholder: p && p.hasPass ? '(saved - leave blank to keep)' : '' });
    const res = h('span', { class: 'muted' });
    const read = () => ({ mode: mode.value, host: host.value.trim(), port: port.value, user: user.value, pass: pass.value, keep: !pass.value && !!(p && p.hasPass) });
    return { read, el: h('fieldset', {}, h('legend', {}, label), row('Connection', mode), row('Host', host), row('Port', port), row('Username', user), row('Password', pass, 'Stored encrypted by your OS keychain when available; never logged.'),
      h('div', { class: 'bar' }, h('button', { onclick: async () => { res.className = 'muted'; res.textContent = 'Testing…'; try { const r = await inv('net:test', { key, profile: read() }); res.className = r.ok ? 'ok' : 'bad'; res.textContent = r.ok ? '✓ Reachable (' + r.ms + ' ms)' : '✗ ' + r.error; } catch (e) { res.className = 'bad'; res.textContent = '✗ Invalid settings'; } } }, 'Test connection'), res)) };
  };
  const a = slot('primary', 'Preferred connection', c.primary, false), b = slot('secondary', 'Fallback connection (optional)', c.secondary, true);
  const status = h('p', {}, connPill(st), st.error ? h('span', { class: 'bad' }, '  ' + st.error) : '');
  const ac = h('input', { type: 'checkbox', checked: auto, onchange: e => auto = e.target.checked });
  return [h('h1', {}, 'Network'), h('div', { class: 'box' }, 'Orbit only reports a connection as active after a real test request succeeded. Use a proxy you own or are authorized to use. Orbit never scrapes public proxy lists and never silently switches to unknown servers.'), h('br'), status,
    a.el, b.el, row('Automatic switching', ac, 'Every 30 s, check the preferred connection; switch to the fallback if it fails and return to preferred when it recovers.'),
    h('div', { class: 'bar' }, h('button', { class: 'btn', onclick: async () => { try { await inv('net:save', { auto, primary: a.read(), secondary: b.read() }); toast('Applied'); settings(); } catch (e) { toast('Check host and port values'); } } }, 'Apply'),
      h('button', { onclick: async () => { await inv('net:save', { auto, primary: a.read(), secondary: b.read() }).catch(() => {}); settings(); } }, 'Re-check now')),
    h('h2', {}, 'VPN'), h('div', { class: 'box' }, h('b', {}, 'System VPN: ' + c.vpn.state), c.vpn.interfaces.length ? ' (' + c.vpn.interfaces.join(', ') + ')' : '', h('br'), c.vpn.note)];
}

/* ---------- Diagnostics ---------- */
async function diagnostics() {
  const box = h('div'); let timer;
  async function draw() {
    const d = await inv('diag:get'), kv = (k, v) => h('tr', {}, h('th', {}, k), h('td', {}, v == null || v === '' ? '-' : String(v)));
    box.replaceChildren(h('table', {}, kv('Browser version', 'Orbit ' + d.app), kv('Renderer', d.renderer), kv('Electron / Node', d.electron + ' / ' + d.node), kv('Platform', d.platform), kv('Windows / tabs', d.windows + ' / ' + d.tabCount),
      kv('Connection mode', MODE[d.net.mode] + ' (' + d.net.active + ')'), kv('Proxy / connection state', d.net.state + (d.net.error ? ' - ' + d.net.error : '')), kv('Network latency', d.net.ms != null ? d.net.ms + ' ms' : 'not measured'), kv('System VPN', d.vpn.state), kv('Last navigation error', d.lastError)),
      h('h2', {}, 'Tabs in this window'), h('table', {}, d.tabs.map(t => h('tr', {}, h('th', {}, (t.active ? '▶ ' : '') + t.title), h('td', {}, (t.url || 'internal page') + (t.loadMs != null ? '  -  loaded in ' + t.loadMs + ' ms' : ''))))),
      h('h2', {}, 'Log'), h('pre', {}, d.logs.join('\n') || '(empty)'));
  }
  mount(h('div', { class: 'wrap' }, h('h1', {}, 'Diagnostics'), h('p', { class: 'muted' }, 'Shows real state only. URLs are shown without query strings; passwords, cookies, tokens and page contents are never recorded.'),
    h('div', { class: 'bar' }, h('button', { onclick: draw }, 'Refresh'), h('button', { onclick: async () => { await inv('diag:clear'); draw(); } }, 'Clear log')), box));
  await draw(); timer = setInterval(() => { if (!document.hidden) draw(); }, 4000); addEventListener('pagehide', () => clearInterval(timer));
}

/* ---------- About ---------- */
async function aboutBody() {
  const a = await inv('about');
  return [h('h1', {}, 'About Orbit'), h('div', { class: 'box' }, h('b', {}, 'Orbit Browser ' + a.app), h('br'), 'Engine: Chromium ' + a.chrome + ' via Electron ' + a.electron, h('br'), 'Profile folder: ', h('code', {}, a.userData),
    h('br'), h('br'), 'Orbit contains no AI features. Bookmarks, history and settings are stored locally on this device.')];
}
const about = async () => mount(h('div', { class: 'wrap' }, await aboutBody()));

/* ---------- Error page ---------- */
function errorPage() {
  const p = new URLSearchParams(location.search), desc = p.get('desc') || '', url = p.get('url') || '', msg = p.get('msg');
  let host = url; try { host = new URL(url).hostname || url; } catch {}
  const E = [
    [/NAME_NOT_RESOLVED|DNS/, 'Server not found', 'The address ' + host + ' could not be found. Check for typing mistakes, or your DNS / proxy settings.'],
    [/CONNECTION_REFUSED/, 'Connection refused', host + ' refused the connection. The server may be down or the port may be wrong.'],
    [/TIMED_OUT/, 'Connection timed out', host + ' took too long to respond.'],
    [/CERT|SSL|SECURE|BAD_SSL/, 'Connection is not private', 'The security certificate for ' + host + ' could not be verified. Orbit will not bypass this for your safety.'],
    [/INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE/, 'You are offline', 'Check your network connection and try again.'],
    [/PROXY|TUNNEL/, 'Proxy problem', 'The configured proxy could not be used. Check Settings > Network.'],
    [/INVALID_URL/, 'Invalid address', msg || 'That address is not valid.'],
    [/RENDERER_CRASH/, 'This tab crashed', 'The page stopped unexpectedly. Reloading may help.'],
    [/RESET|CLOSED|ABORTED|EMPTY_RESPONSE/, 'Connection interrupted', 'The connection to ' + host + ' was interrupted.'],
    [/BLOCKED|ACCESS_DENIED/, 'Blocked', host + ' could not be reached because the request was blocked.']
  ];
  const m = E.find(x => x[0].test(desc)) || [null, "This page couldn't be loaded", 'Something went wrong while loading ' + host + '.'];
  document.title = m[1];
  mount(h('div', { class: 'wrap center' }, h('h1', {}, m[1]), h('p', { class: 'box' }, m[2], h('br'), h('small', { class: 'muted' }, desc)),
    h('div', { class: 'bar', style: null }, h('button', { class: 'btn', onclick: () => inv('go', { q: url }) }, 'Retry'), h('button', { onclick: () => inv('nav', 'back') }, 'Back'),
      /^https?:/.test(url) ? h('button', { onclick: () => inv('external', { url }) }, 'Open externally') : '', h('button', { onclick: () => inv('go', { q: 'browser://settings#network' }) }, 'Network settings'))));
}

const PAGES = { newtab, settings, network: () => { location.hash = 'network'; return settings(); }, privacy: () => { location.hash = 'privacy'; return settings(); }, history: histPage, bookmarks, downloads, diagnostics, about, error: errorPage };
(PAGES[location.host] || newtab)();
