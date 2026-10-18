// Info desktop untuk bilah menu: aplikasi aktif, warna wallpaper, dan warna bagian atas jendela aktif.
// Memakai Win32 (user32, kernel32, gdi32, dwmapi) lewat koffi.
// Warna jendela dibaca dengan satu BitBlt selebar jendela setinggi 1 piksel, dan hanya saat fokus atau judul berubah.
// (Versi 0.4.0 memakai 20 kali GetPixel tiap 1,4 detik. Setiap GetPixel memaksa salinan dari GPU, itu yang membuat berat.) Semua fungsi aman dipanggil di luar Windows (mengembalikan null).
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

let F = null;
let loadError = '';

function load() {
  if (F !== null) return F;
  if (process.platform !== 'win32') { loadError = 'bukan Windows'; return (F = false); }
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    const k = koffi.load('kernel32.dll');
    const g = koffi.load('gdi32.dll');
    let dwm = null;
    try { dwm = koffi.load('dwmapi.dll'); } catch (_) {}
    F = {
      GetDC: u.func('__stdcall', 'GetDC', 'intptr', ['intptr']),
      ReleaseDC: u.func('__stdcall', 'ReleaseDC', 'int', ['intptr', 'intptr']),
      GetWindowRect: u.func('__stdcall', 'GetWindowRect', 'bool', ['intptr', 'void*']),
      IsIconic: u.func('__stdcall', 'IsIconic', 'bool', ['intptr']),
      CreateCompatibleDC: g.func('__stdcall', 'CreateCompatibleDC', 'intptr', ['intptr']),
      CreateCompatibleBitmap: g.func('__stdcall', 'CreateCompatibleBitmap', 'intptr', ['intptr', 'int', 'int']),
      SelectObject: g.func('__stdcall', 'SelectObject', 'intptr', ['intptr', 'intptr']),
      BitBlt: g.func('__stdcall', 'BitBlt', 'bool', ['intptr', 'int', 'int', 'int', 'int', 'intptr', 'int', 'int', 'uint32']),
      GetDIBits: g.func('__stdcall', 'GetDIBits', 'int', ['intptr', 'intptr', 'uint32', 'uint32', 'void*', 'void*', 'uint32']),
      DeleteObject: g.func('__stdcall', 'DeleteObject', 'bool', ['intptr']),
      DeleteDC: g.func('__stdcall', 'DeleteDC', 'bool', ['intptr']),
      DwmGetWindowAttribute: dwm ? dwm.func('__stdcall', 'DwmGetWindowAttribute', 'int32', ['intptr', 'uint32', 'void*', 'uint32']) : null,
      GetForegroundWindow: u.func('__stdcall', 'GetForegroundWindow', 'intptr', []),
      GetClassNameW: u.func('__stdcall', 'GetClassNameW', 'int', ['intptr', 'void*', 'int']),
      GetWindowTextW: u.func('__stdcall', 'GetWindowTextW', 'int', ['intptr', 'void*', 'int']),
      GetWindowThreadProcessId: u.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['intptr', koffi.out(koffi.pointer('uint32'))]),
      SystemParametersInfoW: u.func('__stdcall', 'SystemParametersInfoW', 'bool', ['uint32', 'uint32', 'void*', 'uint32']),
      OpenProcess: k.func('__stdcall', 'OpenProcess', 'intptr', ['uint32', 'bool', 'uint32']),
      QueryFullProcessImageNameW: k.func('__stdcall', 'QueryFullProcessImageNameW', 'bool', ['intptr', 'uint32', 'void*', koffi.inout(koffi.pointer('uint32'))]),
      CloseHandle: k.func('__stdcall', 'CloseHandle', 'bool', ['intptr'])
    };
  } catch (e) { loadError = e.message; F = false; }
  return F;
}

const wstr = (buf, n) => buf.toString('utf16le', 0, Math.max(0, n) * 2);

const APP_NAMES = {
  chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'Firefox', opera: 'Opera', brave: 'Brave', vivaldi: 'Vivaldi',
  code: 'Visual Studio Code', cursor: 'Cursor', devenv: 'Visual Studio', idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm', studio64: 'Android Studio',
  explorer: 'File Explorer', spotify: 'Spotify', discord: 'Discord', whatsapp: 'WhatsApp', telegram: 'Telegram', slack: 'Slack', zoom: 'Zoom', teams: 'Microsoft Teams', 'ms-teams': 'Microsoft Teams',
  winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', onenote: 'OneNote', outlook: 'Outlook', olk: 'Outlook',
  notepad: 'Notepad', 'notepad++': 'Notepad++', windowsterminal: 'Terminal', cmd: 'Command Prompt', powershell: 'PowerShell', pwsh: 'PowerShell',
  acrobat: 'Adobe Acrobat', acrord32: 'Adobe Acrobat', photoshop: 'Photoshop', figma: 'Figma', obs64: 'OBS Studio', vlc: 'VLC',
  taskmgr: 'Task Manager', systemsettings: 'Pengaturan', mspaint: 'Paint', snippingtool: 'Snipping Tool', calc: 'Kalkulator', calculatorapp: 'Kalkulator',
  'osu!': 'osu!', steam: 'Steam', claude: 'Claude', chatgpt: 'ChatGPT', notion: 'Notion', obsidian: 'Obsidian', postman: 'Postman', pulau: 'Pulau'
};
function prettyApp(exe, title) {
  const base = path.basename(exe || '').replace(/\.exe$/i, '');
  const key = base.toLowerCase();
  if (key === 'applicationframehost' && title) return title.split(' - ').pop().trim();
  if (APP_NAMES[key]) return APP_NAMES[key];
  if (!base) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Jendela yang sedang aktif. Buffer dipakai ulang dan nama exe di-cache per PID agar tidak ada alokasi tiap detik.
const CB = Buffer.alloc(512), TB = Buffer.alloc(1024), PB = Buffer.alloc(1040);
const exeCache = new Map();
function exeOf(f, pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  let exe = '';
  const hp = f.OpenProcess(0x1000, false, pid);
  if (hp) {
    try { const size = [520]; if (f.QueryFullProcessImageNameW(hp, 0, PB, size)) exe = wstr(PB, size[0]); }
    finally { f.CloseHandle(hp); }
  }
  if (exeCache.size >= 64) exeCache.delete(exeCache.keys().next().value);
  exeCache.set(pid, exe);
  return exe;
}
function foreground() {
  const f = load(); if (!f) return null;
  try {
    const h = f.GetForegroundWindow();
    if (!h) return null;
    const cls = wstr(CB, f.GetClassNameW(h, CB, 256));
    const title = wstr(TB, f.GetWindowTextW(h, TB, 512));
    const pid = [0];
    f.GetWindowThreadProcessId(h, pid);
    const exe = exeOf(f, pid[0]);
    const desktop = cls === 'Progman' || cls === 'WorkerW';
    const shell = cls === 'Shell_TrayWnd' || cls === 'Shell_SecondaryTrayWnd' || cls === 'NotifyIconOverflowWindow' ||
      cls === 'Windows.UI.Core.CoreWindow' || cls === 'XamlExplorerHostIslandWindow' || cls === 'TopLevelWindowForOverflowXamlIsland' ||
      cls === 'ForegroundStaging' || cls === 'MultitaskingViewFrame' || cls === 'TaskListThumbnailWnd';
    return { hwnd: Number(h), cls, title, exe, pid: pid[0], desktop, shell, app: desktop ? 'Desktop' : prettyApp(exe, title) };
  } catch (_) { return null; }
}

// Warna bagian atas jendela pada satu baris piksel (title bar, tab, atau ribbon).
// bar: { left, right, bottom } bilah dalam piksel fisik. Mengembalikan { color: [r,g,b] | null, why, ms, rect }.
const RB = Buffer.alloc(16);
const BMI = Buffer.alloc(44);
function windowTopColor(hwnd, bar) {
  const t0 = Date.now();
  const out = (color, why, extra) => ({ color, why, ms: Date.now() - t0, ...extra });
  const f = load(); if (!f) return out(null, 'win32 tidak tersedia');
  if (f.IsIconic(hwnd)) return out(null, 'jendela diminimalkan');
  let ok = f.DwmGetWindowAttribute && f.DwmGetWindowAttribute(hwnd, 9, RB, 16) === 0; // DWMWA_EXTENDED_FRAME_BOUNDS, tanpa bayangan
  if (!ok) ok = f.GetWindowRect(hwnd, RB);
  if (!ok) return out(null, 'batas jendela tidak terbaca');
  const r = { left: RB.readInt32LE(0), top: RB.readInt32LE(4), right: RB.readInt32LE(8), bottom: RB.readInt32LE(12) };
  const y = Math.max(r.top, bar.bottom) + 4;
  const x0 = Math.max(r.left, bar.left) + 6, x1 = Math.min(r.right, bar.right) - 6;
  const w = Math.min(x1 - x0, 4096);
  const rect = `jendela ${r.left},${r.top},${r.right},${r.bottom} baris y=${y} lebar=${w}`;
  if (w < 24 || y >= r.bottom - 2) return out(null, 'area terlalu kecil', { rect });

  let sdc = 0, mdc = 0, bmp = 0, old = 0;
  try {
    sdc = f.GetDC(0); if (!sdc) return out(null, 'GetDC gagal', { rect });
    mdc = f.CreateCompatibleDC(sdc); if (!mdc) return out(null, 'CreateCompatibleDC gagal', { rect });
    bmp = f.CreateCompatibleBitmap(sdc, w, 1); if (!bmp) return out(null, 'CreateCompatibleBitmap gagal', { rect });
    old = f.SelectObject(mdc, bmp);
    if (!f.BitBlt(mdc, 0, 0, w, 1, sdc, x0, y, 0x00CC0020)) return out(null, 'BitBlt gagal', { rect }); // SRCCOPY
    f.SelectObject(mdc, old); old = 0; // bitmap harus dilepas dari DC sebelum GetDIBits
    BMI.fill(0);
    BMI.writeUInt32LE(40, 0); BMI.writeInt32LE(w, 4); BMI.writeInt32LE(-1, 8);
    BMI.writeUInt16LE(1, 12); BMI.writeUInt16LE(32, 14); // 32 bit, BI_RGB
    const px = Buffer.alloc(w * 4);
    if (!f.GetDIBits(mdc, bmp, 0, 1, px, BMI, 0)) return out(null, 'GetDIBits gagal', { rect });
    const c = dominant(px, w);
    return out(c, c ? 'ok' : 'piksel kosong', { rect });
  } catch (e) { return out(null, 'galat: ' + e.message, { rect }); }
  finally {
    try { if (old) f.SelectObject(mdc, old); } catch (_) {}
    try { if (bmp) f.DeleteObject(bmp); } catch (_) {}
    try { if (mdc) f.DeleteDC(mdc); } catch (_) {}
    try { if (sdc) f.ReleaseDC(0, sdc); } catch (_) {}
  }
}
// Kelompokkan warna (3 bit per kanal) dan ambil kelompok terbanyak beserta tetangganya, lalu rata-ratakan.
// Latar bergradasi (Word, Office) terpecah ke banyak kelompok, jadi tetangga ikut dihitung.
// Bila tidak ada pemenang yang jelas (foto, video), pakai median tiap kanal. Tidak pernah mengembalikan null untuk data valid.
function dominant(px, w) {
  if (!w) return null;
  const grid = new Array(512).fill(null);
  const R = new Uint8Array(w), G = new Uint8Array(w), B = new Uint8Array(w);
  for (let i = 0; i < w; i++) {
    const o = i * 4, b = px[o], g = px[o + 1], r = px[o + 2];
    R[i] = r; G[i] = g; B[i] = b;
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = grid[k] || (grid[k] = [0, 0, 0, 0]);
    e[0] += r; e[1] += g; e[2] += b; e[3]++;
  }
  let bestK = -1, bestScore = 0;
  for (let k = 0; k < 512; k++) {
    if (!grid[k]) continue;
    const kr = k >> 6, kg = (k >> 3) & 7, kb = k & 7;
    let score = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      const rr = kr + dr, gg = kg + dg, bb = kb + db;
      if (rr < 0 || rr > 7 || gg < 0 || gg > 7 || bb < 0 || bb > 7) continue;
      const e = grid[(rr << 6) | (gg << 3) | bb];
      if (e) score += e[3];
    }
    if (score > bestScore) { bestScore = score; bestK = k; }
  }
  if (bestK >= 0 && bestScore >= w * 0.4) {
    const kr = bestK >> 6, kg = (bestK >> 3) & 7, kb = bestK & 7;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      const rr = kr + dr, gg = kg + dg, bb = kb + db;
      if (rr < 0 || rr > 7 || gg < 0 || gg > 7 || bb < 0 || bb > 7) continue;
      const e = grid[(rr << 6) | (gg << 3) | bb];
      if (e) { r += e[0]; g += e[1]; b += e[2]; n += e[3]; }
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }
  const med = (a) => Array.from(a).sort((p, q) => p - q)[w >> 1];
  return [med(R), med(G), med(B)];
}

// Warna rata-rata bagian atas wallpaper (tempat bilah berada)
let wallCache = { key: '', color: null };
function wallpaperColor() {
  const f = load(); if (!f) return null;
  try {
    const buf = Buffer.alloc(1040);
    f.SystemParametersInfoW(0x0073, 520, buf, 0);
    let p = buf.toString('utf16le').replace(/\0.*$/s, '');
    if (!p || !fs.existsSync(p)) p = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
    if (!fs.existsSync(p)) return null;
    const st = fs.statSync(p);
    const key = p + '|' + st.mtimeMs + '|' + st.size;
    if (wallCache.key === key) return wallCache.color;
    let img = nativeImage.createFromBuffer(fs.readFileSync(p));
    if (img.isEmpty()) return null;
    img = img.resize({ width: 96 });
    const { width, height } = img.getSize();
    const bmp = img.toBitmap(); // BGRA
    const rows = Math.max(1, Math.round(height * 0.1));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      b += bmp[i]; g += bmp[i + 1]; r += bmp[i + 2]; n++;
    }
    const color = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    wallCache = { key, color };
    return color;
  } catch (_) { return null; }
}

module.exports = { foreground, wallpaperColor, windowTopColor, dominant, available: () => !!load(), error: () => loadError };
