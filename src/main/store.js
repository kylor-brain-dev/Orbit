'use strict';
const fs = require('fs'), path = require('path'), { app } = require('electron');
class Store {
  constructor(name, def) {
    this.file = path.join(app.getPath('userData'), name + '.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.v = Array.isArray(def) ? (Array.isArray(raw) ? raw : []) : { ...def, ...raw };
    } catch { this.v = structuredClone(def); }
  }
  get() { return this.v; }
  save() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 250); }
  flush() { clearTimeout(this.t); try { fs.writeFileSync(this.file, JSON.stringify(this.v)); } catch {} }
}
module.exports = { Store };
