'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const OK = ['state', 'perm', 'focus-url', 'bookmark', 'dl'];
contextBridge.exposeInMainWorld('orbit', {
  cmd: (c, a) => ipcRenderer.invoke('ui', c, a),
  on: (ch, cb) => { if (OK.includes(ch)) ipcRenderer.on(ch, (_e, d) => cb(d)); }
});
