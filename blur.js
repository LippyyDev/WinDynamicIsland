// Latar blur (acrylic) untuk bilah menu.
// Memanggil SetWindowCompositionAttribute (user32.dll) lewat koffi pada jendela latar kecil setinggi bilah.
// Blur digambar oleh DWM di kartu grafis, jadi tidak membebani CPU dan tidak membaca layar.

const WCA_ACCENT_POLICY = 19;
const ACCENT_DISABLED = 0, ACCENT_ENABLE_BLURBEHIND = 3, ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;

let F = null; // null = belum dimuat, false = tidak tersedia
let loadError = '';

function load() {
  if (F !== null) return F;
  if (process.platform !== 'win32') { loadError = 'bukan Windows'; return (F = false); }
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const DATA = koffi.struct('PULAU_WCAD', { attrib: 'int32', data: 'void*', size: 'size_t' });
    const gdi32 = koffi.load('gdi32.dll');
    F = {
      fn: user32.func('__stdcall', 'SetWindowCompositionAttribute', 'bool', ['intptr', koffi.pointer(DATA)]),
      SetWindowRgn: user32.func('__stdcall', 'SetWindowRgn', 'int', ['intptr', 'intptr', 'bool']),
      GetWindowRect: user32.func('__stdcall', 'GetWindowRect', 'bool', ['intptr', 'void*']),
      CreateRectRgn: gdi32.func('__stdcall', 'CreateRectRgn', 'intptr', ['int', 'int', 'int', 'int'])
    };
  } catch (e) { loadError = e.message; F = false; }
  return F;
}

function setAccent(hwnd, state, abgr) {
  const policy = Buffer.alloc(16); // ACCENT_POLICY: state, flags, gradientColor, animationId
  policy.writeInt32LE(state, 0);
  policy.writeInt32LE(2, 4);
  policy.writeUInt32LE(abgr >>> 0, 8);
  policy.writeInt32LE(0, 12);
  return !!F.fn(hwnd, { attrib: WCA_ACCENT_POLICY, data: policy, size: policy.length });
}

// tint: { r, g, b, a } dengan a 0 sampai 255. Mengembalikan jenis efek yang aktif: 'acrylic', 'blur', atau '' bila gagal.
function enable(hwnd, tint) {
  if (!load()) return '';
  try {
    const abgr = ((tint.a << 24) | (tint.b << 16) | (tint.g << 8) | tint.r) >>> 0;
    if (setAccent(hwnd, ACCENT_ENABLE_ACRYLICBLURBEHIND, abgr)) return 'acrylic';
    if (setAccent(hwnd, ACCENT_ENABLE_BLURBEHIND, abgr)) return 'blur';
  } catch (e) { loadError = e.message; }
  return '';
}

function disable(hwnd) {
  if (!load()) return;
  try { setAccent(hwnd, ACCENT_DISABLED, 0); } catch (_) {}
}

// Memotong jendela ke persegi w x h piksel fisik (relatif ke pojok kiri atas jendela). Efek blur ikut terpotong,
// jadi tinggi bilah tetap tepat walau Windows membuat jendelanya lebih tinggi dari yang diminta.
// Mengembalikan ukuran jendela sebenarnya { w, h } atau null.
function clip(hwnd, w, h) {
  if (!load()) return null;
  try {
    const rect = Buffer.alloc(16);
    F.GetWindowRect(hwnd, rect);
    const real = { w: rect.readInt32LE(8) - rect.readInt32LE(0), h: rect.readInt32LE(12) - rect.readInt32LE(4) };
    const rgn = F.CreateRectRgn(0, 0, w, h); // setelah SetWindowRgn, region dimiliki sistem dan tidak boleh dihapus
    F.SetWindowRgn(hwnd, rgn, true);
    return real;
  } catch (e) { loadError = e.message; return null; }
}

module.exports = { enable, disable, clip, available: () => !!load(), error: () => loadError };
