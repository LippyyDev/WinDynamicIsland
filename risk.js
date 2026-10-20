'use strict';
// Penilaian risiko aksi agen untuk mode Otonom.
// Aksi biasa (klik, mengetik, tombol) berjalan tanpa izin; fungsi ini mengembalikan alasan singkat
// bila aksi termasuk berisiko sehingga agen berhenti dan meminta persetujuan. String kosong berarti aman.
// Modul ini murni (tanpa Electron) supaya mudah diuji: node risk.test.js
const path = require('path');

const ALIAS = { control: 'ctrl', windows: 'win', escape: 'esc', del: 'delete', return: 'enter' };
const keysOf = (combo) => String(combo || '').toLowerCase().split('+').map((s) => s.trim()).filter(Boolean).map((s) => ALIAS[s] || s);

const RISKY_COMBOS = [
  [['win', 'r'], 'membuka kotak Run'],
  [['win', 'x'], 'membuka menu admin Windows'],
  [['win', 'l'], 'mengunci komputer'],
  [['ctrl', 'shift', 'esc'], 'membuka Task Manager'],
  [['ctrl', 'alt', 'delete'], 'membuka layar keamanan Windows'],
  [['shift', 'delete'], 'menghapus permanen tanpa Recycle Bin'],
  [['ctrl', 'shift', 'enter'], 'menjalankan sebagai administrator']
];

// Teks yang tampak seperti perintah sistem (diketik ke kotak Run, terminal, atau bilah alamat Explorer)
const COMMAND_RE = new RegExp([
  '(^|[\\s;&|"\'])(powershell|pwsh|cmd(\\.exe)?\\s*\\/[ck]|wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin|wmic|diskpart|bcdedit|vssadmin|netsh|schtasks|takeown|icacls)\\b',
  '\\breg(\\.exe)?\\s+(add|delete|import)\\b',
  '(^|\\s)(del|erase)\\s+(\\/[a-z]\\s+)*[a-z]:',
  '(^|\\s)(rd|rmdir)\\s+\\/s',
  '(^|\\s)rm\\s+-[a-z]*[rf]',
  '(^|\\s)format\\s+[a-z]:',
  '(^|\\s)shutdown(\\.exe)?\\s+\\/',
  '(^|\\s)sc(\\.exe)?\\s+(delete|config|stop|create)\\b',
  '\\b(set-executionpolicy|invoke-expression|invoke-webrequest|start-process|remove-item|new-service|add-mppreference)\\b',
  '(^|[\\s;|])(iex|iwr|irm)\\b',
  '-enc(odedcommand)?\\s',
  '(^|\\s)(curl|wget)\\s+\\S*https?:'
].join('|'), 'i');

const EXEC_EXT = /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|lnk|reg|scr|hta|jar|cpl|pif|appx|appxbundle|msix|msixbundle)$/i;

const TERMINALS = new Set(['cmd', 'powershell', 'powershell_ise', 'pwsh', 'windowsterminal', 'wt', 'conhost', 'openconsole', 'mintty', 'bash', 'wsl', 'wslhost', 'regedit', 'mmc', 'taskmgr', 'gpedit']);
const PASSWORD_APPS = new Set(['1password', 'bitwarden', 'keepass', 'keepassxc', 'lastpass', 'dashlane', 'enpass', 'nordpass', 'credentialuibroker']);
const SELF = new Set(['pulau', 'electron']);

// Judul jendela yang menandakan data atau transaksi sensitif
const SENSITIVE_TITLE = /password|kata ?sandi|\bpin\b|\botp\b|checkout|payment|pembayaran|billing|tagihan|\bbank|m-?banking|livin|brimo|wondr|\bwallet|dompet|paypal|transfer dana|rekening|kartu kredit|credit card/i;

const MUTATING = new Set(['click', 'type_text', 'press_key', 'open_target']);

// allow: daftar nama aplikasi (nama exe tanpa .exe atau nama tampilan), huruf kecil. Kosong berarti semua aplikasi boleh.
function parseAllow(s) {
  return String(s || '').split(/[,;\n]/).map((x) => x.trim().toLowerCase().replace(/\.exe$/, '')).filter(Boolean);
}

// fg: hasil desktop.foreground() ({ exe, title, app, desktop, shell }) atau null bila tidak terbaca
function assessRisk(name, a = {}, fg = null, allow = []) {
  if (!MUTATING.has(name)) return '';

  if (name === 'open_target') {
    const t = String(a.target || '').trim().replace(/^["']|["']$/g, '');
    if (!/^https?:\/\//i.test(t) && EXEC_EXT.test(t)) return 'membuka file yang bisa dijalankan';
    return '';
  }

  if (name === 'press_key') {
    const set = new Set(keysOf(a.keys));
    for (const [combo, why] of RISKY_COMBOS) if (combo.length === set.size && combo.every((k) => set.has(k))) return why;
  }

  if (name === 'type_text' && COMMAND_RE.test(String(a.text || ''))) return 'teks berupa perintah sistem';

  if (!fg) return allow.length ? 'jendela aktif tidak terbaca' : '';

  const base = path.win32.basename(String(fg.exe || '')).replace(/\.exe$/i, '').toLowerCase();
  const title = String(fg.title || '');
  if (SELF.has(base) && /pengaturan/i.test(title)) return 'mengubah pengaturan Pulau sendiri';
  if (PASSWORD_APPS.has(base)) return 'jendela pengelola kata sandi';
  if (SENSITIVE_TITLE.test(title)) return `jendela tampak sensitif ("${title.slice(0, 50)}")`;
  if (TERMINALS.has(base) && name !== 'click') return `mengetik di ${fg.app || base}`;
  if (allow.length && !fg.desktop && !fg.shell && !SELF.has(base) &&
      !allow.includes(base) && !allow.includes(String(fg.app || '').toLowerCase())) return `aplikasi ${fg.app || base} di luar daftar izin`;
  return '';
}

module.exports = { assessRisk, parseAllow, MUTATING };
