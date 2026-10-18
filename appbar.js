// Mode notch: mendaftarkan jendela Pulau sebagai AppBar Windows di tepi atas layar.
// Windows lalu mencadangkan area itu, jadi jendela yang dimaksimalkan mulai di bawahnya.
// Memakai SHAppBarMessage (shell32.dll) lewat koffi.

const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3;
const ABE_TOP = 1;
const ABN_POSCHANGED = 1, ABN_FULLSCREENAPP = 2;
const CALLBACK_MSG = 0x0400 + 0x2f1; // WM_USER + offset unik

let ffi = null; // null = belum dimuat, false = tidak tersedia
let loadError = '';

function load() {
  if (ffi !== null) return ffi;
  if (process.platform !== 'win32') { loadError = 'bukan Windows'; return (ffi = false); }
  try {
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    const RECT = koffi.struct('PULAU_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const ABD = koffi.struct('PULAU_APPBARDATA', {
      cbSize: 'uint32', hWnd: 'intptr', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr'
    });
    const fn = shell32.func('__stdcall', 'SHAppBarMessage', 'uintptr', ['uint32', koffi.inout(koffi.pointer(ABD))]);
    let taskbarCreated = 0;
    try {
      const user32 = koffi.load('user32.dll');
      const reg = user32.func('__stdcall', 'RegisterWindowMessageW', 'uint32', ['str16']);
      taskbarCreated = reg('TaskbarCreated');
    } catch (_) {}
    ffi = { fn, size: koffi.sizeof(ABD), taskbarCreated };
  } catch (e) {
    loadError = e.message;
    ffi = false;
  }
  return ffi;
}

class AppBar {
  constructor(win, log) {
    this.win = win;
    this.log = log;
    this.registered = false;
    this.hooked = false;
    this.onFullscreen = null;
    this.onPosChanged = null;
  }
  hwnd() {
    const b = this.win.getNativeWindowHandle();
    return Number(b.length >= 8 ? b.readBigUInt64LE(0) : b.readUInt32LE(0));
  }
  data(rc) {
    return { cbSize: ffi.size, hWnd: this.hwnd(), uCallbackMessage: CALLBACK_MSG, uEdge: ABE_TOP, rc: rc || { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
  }
  hook() {
    if (this.hooked) return;
    this.hooked = true;
    this.win.hookWindowMessage(CALLBACK_MSG, (wParam, lParam) => {
      const code = wParam.readUInt32LE(0);
      if (code === ABN_POSCHANGED && this.onPosChanged) this.onPosChanged();
      if (code === ABN_FULLSCREENAPP && this.onFullscreen) this.onFullscreen(lParam.readUInt32LE(0) !== 0);
    });
    // Explorer dimulai ulang: semua AppBar hilang dan harus didaftarkan lagi
    if (ffi && ffi.taskbarCreated) {
      this.win.hookWindowMessage(ffi.taskbarCreated, () => { if (this.onTaskbarCreated) this.onTaskbarCreated(); });
    }
  }
  // rect dalam piksel fisik: { left, top, right, bottom }
  apply(rect, heightPx) {
    if (!load()) { this.log.warn('notch', 'AppBar tidak tersedia: ' + loadError); return false; }
    try {
      this.hook();
      if (!this.registered) {
        const ok = ffi.fn(ABM_NEW, this.data());
        this.registered = true;
        this.log.info('notch', 'AppBar didaftarkan (' + (ok ? 'baru' : 'sudah ada') + ')');
      }
      const d = this.data({ ...rect });
      ffi.fn(ABM_QUERYPOS, d);
      d.rc.bottom = d.rc.top + heightPx;
      ffi.fn(ABM_SETPOS, d);
      this.log.info('notch', `area atas dicadangkan ${heightPx}px fisik (${d.rc.left},${d.rc.top})-(${d.rc.right},${d.rc.bottom})`);
      return true;
    } catch (e) {
      this.log.error('notch', 'Gagal mengatur AppBar: ' + e.message);
      return false;
    }
  }
  remove() {
    if (!this.registered || !ffi) return;
    try { ffi.fn(ABM_REMOVE, this.data()); this.log.info('notch', 'AppBar dilepas'); }
    catch (e) { this.log.error('notch', 'Gagal melepas AppBar: ' + e.message); }
    this.registered = false;
  }
}

module.exports = { AppBar };
