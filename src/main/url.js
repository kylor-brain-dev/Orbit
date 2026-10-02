'use strict';
// UrlValidator + search provider adapters. No Electron imports so it can be unit-tested.
const ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=%s' },
  google:     { name: 'Google',     url: 'https://www.google.com/search?q=%s' },
  wikipedia:  { name: 'Wikipedia',  url: 'https://en.wikipedia.org/w/index.php?search=%s' },
  custom:     { name: 'Custom',     url: '' }
};
const INTERNAL = new Set(['newtab', 'settings', 'history', 'bookmarks', 'downloads', 'privacy', 'network', 'diagnostics', 'about']);

function searchUrl(q, s) {
  const tpl = s.engine === 'custom' ? s.customSearch : (ENGINES[s.engine] || {}).url;
  return (/^https?:\/\/.+%s/.test(tpl || '') ? tpl : ENGINES.duckduckgo.url).replace('%s', encodeURIComponent(q));
}

function resolve(raw, s) {
  const x = String(raw == null ? '' : raw).trim();
  if (!x) return { error: 'empty' };
  if (/^browser:\/\//i.test(x)) {
    const h = x.slice(10).split(/[/?#]/)[0].toLowerCase();
    const hash = x.includes('#') ? x.slice(x.indexOf('#')) : '';
    return INTERNAL.has(h) ? { url: 'browser://' + h + hash } : { error: 'That internal page does not exist.' };
  }
  const hostPort = /^(localhost|[^\s/:?#]+\.[^\s/:?#]+|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]):\d+([/?#]|$)/i.test(x);
  const scheme = x.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !hostPort) {
    const p = scheme[1].toLowerCase();
    if (p !== 'http' && p !== 'https') return { error: 'The "' + p + ':" address type is blocked for your safety.' };
    try { return { url: new URL(x).href }; } catch { return { error: 'That address is not valid.' }; }
  }
  if (!/\s/.test(x)) {
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])([:/?#]|$)/i.test(x);
    const domain = /^[^\s/:?#]+\.[^\s/:?#]{2,}([:/?#]|$)/u.test(x);
    if (local || domain || hostPort) {
      try { return { url: new URL((local ? 'http://' : 'https://') + x).href }; }
      catch { return { error: 'That address is not valid.' }; }
    }
  }
  return { url: searchUrl(x, s), search: true };
}
module.exports = { resolve, searchUrl, ENGINES, INTERNAL };
