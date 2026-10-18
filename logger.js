// Pencatat aktivitas dan galat ke satu file teks di folder data.
// Level: 'off' (mati), 'errors' (hanya peringatan dan galat), 'all' (semua aktivitas).
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, lalu diputar ke pulau.old.log
const RANK = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  constructor(dir) {
    this.file = path.join(dir, 'pulau.log');
    this.old = path.join(dir, 'pulau.old.log');
    this.level = 'errors';
    this.written = 0;
  }
  setLevel(l) { this.level = ['off', 'errors', 'all'].includes(l) ? l : 'errors'; }
  allowed(lv) {
    if (this.level === 'off') return false;
    if (this.level === 'errors') return RANK[lv] >= RANK.WARN;
    return true;
  }
  stamp() {
    const d = new Date(), p = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }
  rotate() {
    try {
      if (fs.statSync(this.file).size < MAX_BYTES) return;
      try { fs.unlinkSync(this.old); } catch (_) {}
      fs.renameSync(this.file, this.old);
    } catch (_) {}
  }
  write(level, src, msg) {
    const lv = RANK[level] !== undefined ? level : 'INFO';
    if (!this.allowed(lv)) return;
    let text = msg instanceof Error ? (msg.stack || msg.message) : String(msg ?? '');
    if (text.length > 4000) text = text.slice(0, 4000) + ' …';
    const line = `${this.stamp()} ${lv.padEnd(5)} [${String(src || 'app').slice(0, 14)}] ${text.replace(/\r?\n/g, '\n    ')}\n`;
    try {
      if (++this.written % 200 === 0) this.rotate();
      fs.appendFileSync(this.file, line);
    } catch (_) {}
  }
  debug(s, m) { this.write('DEBUG', s, m); }
  info(s, m) { this.write('INFO', s, m); }
  warn(s, m) { this.write('WARN', s, m); }
  error(s, m) { this.write('ERROR', s, m); }

  tail(n = 300) {
    try {
      const st = fs.statSync(this.file);
      const len = Math.min(st.size, 256 * 1024);
      const fd = fs.openSync(this.file, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len);
      fs.closeSync(fd);
      const lines = buf.toString('utf8').split('\n');
      if (len < st.size) lines.shift();
      return lines.filter(Boolean).slice(-n).join('\n');
    } catch (_) { return ''; }
  }
  size() { try { return fs.statSync(this.file).size; } catch (_) { return 0; } }
  clear() {
    try { fs.writeFileSync(this.file, ''); } catch (_) {}
    try { fs.unlinkSync(this.old); } catch (_) {}
  }
}

module.exports = { Logger };
