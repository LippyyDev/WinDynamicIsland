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

// Warna dominan pada satu baris piksel di bagian atas jendela (title bar, tab, atau ribbon).
// bar: { left, right, bottom } bilah dalam piksel fisik. Mengembalikan [r, g, b] atau null.
const RB = Buffer.alloc(16);
const BMI = Buffer.alloc(44);
function windowTopColor(hwnd, bar) {
  const f = load(); if (!f) return null;
  if (f.IsIconic(hwnd)) return null;
  let ok = f.DwmGetWindowAttribute && f.DwmGetWindowAttribute(hwnd, 9, RB, 16) === 0; // DWMWA_EXTENDED_FRAME_BOUNDS, tanpa bayangan
  if (!ok) ok = f.GetWindowRect(hwnd, RB);
  if (!ok) return null;
  const r = { left: RB.readInt32LE(0), top: RB.readInt32LE(4), right: RB.readInt32LE(8), bottom: RB.readInt32LE(12) };
  const y = Math.max(r.top, bar.bottom) + 4;
  const x0 = Math.max(r.left, bar.left) + 6, x1 = Math.min(r.right, bar.right) - 6;
  const w = Math.min(x1 - x0, 4096);
  if (w < 24 || y >= r.bottom - 2) return null;

  let sdc = 0, mdc = 0, bmp = 0, old = 0;
  try {
    sdc = f.GetDC(0); if (!sdc) return null;
    mdc = f.CreateCompatibleDC(sdc); if (!mdc) return null;
    bmp = f.CreateCompatibleBitmap(sdc, w, 1); if (!bmp) return null;
    old = f.SelectObject(mdc, bmp);
    if (!f.BitBlt(mdc, 0, 0, w, 1, sdc, x0, y, 0x00CC0020)) return null; // SRCCOPY
    f.SelectObject(mdc, old); old = 0; // bitmap harus dilepas dari DC sebelum GetDIBits
    BMI.fill(0);
    BMI.writeUInt32LE(40, 0); BMI.writeInt32LE(w, 4); BMI.writeInt32LE(-1, 8);
    BMI.writeUInt16LE(1, 12); BMI.writeUInt16LE(32, 14); // 32 bit, BI_RGB
    const px = Buffer.alloc(w * 4);
    if (!f.GetDIBits(mdc, bmp, 0, 1, px, BMI, 0)) return null;
    return dominant(px, w);
  } catch (_) { return null; }
  finally {
    try { if (old) f.SelectObject(mdc, old); } catch (_) {}
    try { if (bmp) f.DeleteObject(bmp); } catch (_) {}
    try { if (mdc) f.DeleteDC(mdc); } catch (_) {}
    try { if (sdc) f.ReleaseDC(0, sdc); } catch (_) {}
  }
}
// Kelompokkan warna (4 bit per kanal), ambil kelompok terbanyak, lalu rata-rata di dalamnya.
// Teks, ikon, dan tab aktif yang kecil tidak ikut menggeser hasil.
function dominant(px, w) {
  const buckets = new Map();
  for (let i = 0; i < w; i++) {
    const o = i * 4, b = px[o], g = px[o + 1], r = px[o + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let e = buckets.get(k);
    if (!e) { e = [0, 0, 0, 0]; buckets.set(k, e); }
    e[0] += r; e[1] += g; e[2] += b; e[3]++;
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e[3] > best[3]) best = e;
  if (!best || best[3] < w * 0.15) return null; // terlalu acak (foto, video): biarkan pemanggil memakai cadangan
  return [Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3])];
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
