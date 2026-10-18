// Info desktop untuk bilah menu: aplikasi aktif dan warna wallpaper.
// Memakai Win32 (user32, kernel32) lewat koffi. Tidak membaca piksel layar, karena GetPixel pada layar lambat dan membuat Pulau berat. Semua fungsi aman dipanggil di luar Windows (mengembalikan null).
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
    F = {
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

// Jendela yang sedang aktif
function foreground() {
  const f = load(); if (!f) return null;
  try {
    const h = f.GetForegroundWindow();
    if (!h) return null;
    const cb = Buffer.alloc(512);
    const cls = wstr(cb, f.GetClassNameW(h, cb, 256));
    const tb = Buffer.alloc(1024);
    const title = wstr(tb, f.GetWindowTextW(h, tb, 512));
    const pid = [0];
    f.GetWindowThreadProcessId(h, pid);
    let exe = '';
    const hp = f.OpenProcess(0x1000, false, pid[0]);
    if (hp) {
      const pb = Buffer.alloc(1040), size = [520];
      if (f.QueryFullProcessImageNameW(hp, 0, pb, size)) exe = wstr(pb, size[0]);
      f.CloseHandle(hp);
    }
    const desktop = cls === 'Progman' || cls === 'WorkerW';
    const shell = cls === 'Shell_TrayWnd' || cls === 'Shell_SecondaryTrayWnd' || cls === 'NotifyIconOverflowWindow' ||
      cls === 'Windows.UI.Core.CoreWindow' || cls === 'XamlExplorerHostIslandWindow' || cls === 'TopLevelWindowForOverflowXamlIsland';
    return { hwnd: Number(h), cls, title, exe, pid: pid[0], desktop, shell, app: desktop ? 'Desktop' : prettyApp(exe, title) };
  } catch (_) { return null; }
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

module.exports = { foreground, wallpaperColor, available: () => !!load(), error: () => loadError };
