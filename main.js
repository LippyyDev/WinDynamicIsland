const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { Store } = require('./store');
const { Logger } = require('./logger');
const { AppBar } = require('./appbar');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const H = 300;
let win = null, settingsWin = null, tray = null, store = null, appbar = null;
let ps = null, cmdPs = null, quitting = false;
let islandRect = null, inside = false, wantCursor = false;
let userHidden = false, fullscreenHidden = false;
let lastSettings = null;

const ICON = path.join(__dirname, 'assets', 'icon.png');
const PRELOAD = path.join(__dirname, 'preload.js');
const log = new Logger(app.getPath('userData'));

process.on('uncaughtException', (e) => log.error('main', e));
process.on('unhandledRejection', (e) => log.error('main', e instanceof Error ? e : 'Promise ditolak: ' + e));

/* ---------------- jendela island ---------------- */
function primaryBounds() { return screen.getPrimaryDisplay().bounds; }

function place() {
  if (!win || win.isDestroyed()) return;
  const b = primaryBounds();
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: H });
}

function createWindow() {
  const b = primaryBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: H,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); applyNotch(); });
  win.webContents.on('render-process-gone', (_e, d) => log.error('renderer', 'Proses antarmuka berhenti: ' + d.reason));
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 3) log.error('renderer', `${message} (${path.basename(source || '')}:${line})`);
  });
  const onDisplay = () => { log.info('layar', 'Konfigurasi layar berubah'); place(); applyNotch(); };
  screen.on('display-metrics-changed', onDisplay);
  screen.on('display-added', onDisplay);
  screen.on('display-removed', onDisplay);

  appbar = new AppBar(win, log);
  appbar.onPosChanged = () => applyNotch();
  appbar.onTaskbarCreated = () => { log.info('notch', 'Explorer dimulai ulang, daftar ulang AppBar'); appbar.registered = false; applyNotch(); };
  appbar.onFullscreen = (on) => {
    if (!store.get('settings').hideOnFullscreen) return;
    log.info('notch', on ? 'Aplikasi layar penuh terdeteksi, pulau disembunyikan' : 'Layar penuh selesai, pulau ditampilkan');
    fullscreenHidden = on;
    if (on) win.hide(); else if (!userHidden) win.showInactive();
  };
}

/* ---------------- mode notch ---------------- */
function applyNotch() {
  if (!win || win.isDestroyed() || !appbar) return;
  const s = store.get('settings');
  if (!s.notch) { appbar.remove(); return; }
  const d = screen.getPrimaryDisplay();
  const b = d.bounds;
  const barH = Math.max(20, Math.min(60, Number(s.barHeight) || 32));
  const phys = process.platform === 'win32' ? screen.dipToScreenRect(win, { x: b.x, y: b.y, width: b.width, height: barH }) : { x: b.x, y: b.y, width: b.width, height: barH };
  appbar.apply({ left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height }, phys.height);
}

// Posisi kursor dibaca langsung dari sistem, jadi tetap terdeteksi saat menyeret file.
function pollCursor() {
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    const r = islandRect;
    const now = !!r && x >= r.x && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h;
    if (now !== inside) {
      inside = now;
      win.setIgnoreMouseEvents(!now, { forward: true });
      win.webContents.send('hover', now);
    }
    if (wantCursor) win.webContents.send('cursor', { x, y });
  }, 40);
}

function setVisible(v) {
  userHidden = !v;
  if (v && !fullscreenHidden) win.showInactive(); else win.hide();
  log.info('tray', v ? 'Pulau ditampilkan' : 'Pulau disembunyikan');
}

/* ---------------- jendela pengaturan ---------------- */
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  log.info('pengaturan', 'Jendela pengaturan dibuka');
  settingsWin = new BrowserWindow({
    width: 940, height: 660, minWidth: 780, minHeight: 520,
    title: 'Pengaturan Pulau', icon: ICON, backgroundColor: '#0c0c0f', show: false,
    autoHideMenuBar: true, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0c0f', symbolColor: '#d8d8de', height: 40 },
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
}

/* ---------------- jembatan PowerShell ---------------- */
const psScript = () => app.isPackaged ? path.join(process.resourcesPath, 'media.ps1') : path.join(__dirname, 'media.ps1');

function runPs(mode, onMsg) {
  const p = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScript(),
      '-Mode', mode, '-ParentPid', String(process.pid)],
    { windowsHide: true });
  log.info('ps-' + mode, 'Proses PowerShell dimulai (pid ' + p.pid + ')');
  p.on('error', (e) => log.error('ps-' + mode, 'Gagal menjalankan PowerShell: ' + e.message));
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', (d) => log.error('ps-' + mode, String(d).trim().slice(0, 1000)));
  p.stdout.setEncoding('utf8');
  readline.createInterface({ input: p.stdout }).on('line', (line) => {
    line = line.replace(/^﻿/, '').trim();
    if (!line) return;
    let m;
    try { m = JSON.parse(line); } catch (_) { log.warn('ps-' + mode, 'Baris bukan JSON: ' + line.slice(0, 200)); return; }
    if (m.type === 'log') { log.write(m.level || 'INFO', 'ps-' + mode, m.msg); return; }
    if (onMsg) onMsg(m);
  });
  return p;
}
function startMedia() {
  if (process.platform !== 'win32') return;
  ps = runPs('watch', (m) => { if (win && !win.isDestroyed()) win.webContents.send('media', m); });
  ps.on('exit', (c) => {
    log[quitting ? 'info' : 'warn']('ps-watch', 'Proses berhenti, kode ' + c);
    ps = null; if (!quitting) setTimeout(startMedia, 3000);
  });
}
function startCmd() {
  if (process.platform !== 'win32') return;
  cmdPs = runPs('cmd');
  cmdPs.on('exit', (c) => {
    log[quitting ? 'info' : 'warn']('ps-cmd', 'Proses berhenti, kode ' + c);
    cmdPs = null; if (!quitting) setTimeout(startCmd, 3000);
  });
}

/* ---------------- sampul cadangan (iTunes Search) ---------------- */
const artCache = new Map();
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function lookupArt(title, artist) {
  const key = norm(title) + '|' + norm(artist);
  if (artCache.has(key)) return artCache.get(key);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  let out = '';
  try {
    const q = new URLSearchParams({ term: `${title} ${artist || ''}`.trim(), media: 'music', entity: 'song', limit: '10' });
    const r = await fetch('https://itunes.apple.com/search?' + q, { signal: ctl.signal });
    const j = await r.json();
    const nt = norm(title), na = norm(artist);
    const hit = (j.results || []).find((x) => {
      const xt = norm(x.trackName), xa = norm(x.artistName);
      const tOk = xt.length >= 2 && (nt === xt || nt.includes(xt) || xt.includes(nt));
      const aOk = !na || xa.includes(na) || na.includes(xa) || nt.includes(xa);
      return tOk && aOk;
    });
    if (hit && hit.artworkUrl100) {
      const url = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.');
      const ir = await fetch(url, { signal: ctl.signal });
      const buf = Buffer.from(await ir.arrayBuffer());
      if (buf.length > 500) out = 'data:image/jpeg;base64,' + buf.toString('base64');
    }
    log.info('sampul', `Sampul online ${out ? 'ditemukan' : 'tidak ditemukan'}: ${title} | ${artist}`);
  } catch (e) { log.warn('sampul', 'Pencarian sampul online gagal: ' + e.message); }
  clearTimeout(timer);
  if (out) { if (artCache.size > 40) artCache.delete(artCache.keys().next().value); artCache.set(key, out); }
  return out;
}

/* ---------------- IPC ---------------- */
function broadcast(channel, ...args) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, ...args);
}
async function fileInfo(paths) {
  const out = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      let icon = '';
      try { icon = (await app.getFileIcon(p, { size: 'large' })).toDataURL(); } catch (_) {}
      out.push({ path: p, name: path.basename(p), icon, dir: st.isDirectory(), size: st.size, added: Date.now() });
    } catch (e) { log.warn('rak', 'Tidak bisa membaca file: ' + p + ' (' + e.message + ')'); }
  }
  return out;
}
function diffSettings(a, b, prefix = '') {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    if (x && y && typeof x === 'object' && typeof y === 'object') out.push(...diffSettings(x, y, prefix + k + '.'));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${prefix}${k}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
  }
  return out;
}
function onSettingsChanged(next) {
  const changes = diffSettings(lastSettings, next);
  if (changes.length) log.info('pengaturan', 'Diubah: ' + changes.join(', '));
  const prev = lastSettings || {};
  lastSettings = JSON.parse(JSON.stringify(next));
  log.setLevel(next.logLevel);
  if (prev.notch !== next.notch || prev.barHeight !== next.barHeight) applyNotch();
}

ipcMain.on('media-cmd', (_e, cmd) => {
  log.info('musik', 'Perintah: ' + cmd);
  if (cmdPs && cmdPs.stdin.writable) cmdPs.stdin.write(cmd + '\n');
  else log.warn('musik', 'Perintah tidak terkirim, proses PowerShell belum siap');
});
ipcMain.on('island-rect', (_e, r) => { islandRect = r; });
ipcMain.on('want-cursor', (_e, v) => { wantCursor = !!v; });
ipcMain.handle('store-get', (_e, k) => store.get(k));
ipcMain.on('store-set', (e, k, v) => {
  store.set(k, v);
  if (k === 'settings') onSettingsChanged(v);
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) w.webContents.send('store-changed', k, v);
});
ipcMain.on('open-settings', openSettings);
ipcMain.handle('autostart-get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('autostart-set', (_e, v) => { app.setLoginItemSettings({ openAtLogin: !!v }); log.info('pengaturan', 'Autostart: ' + !!v); rebuildTray(); });
ipcMain.handle('file-info', (_e, paths) => fileInfo(paths || []));
ipcMain.handle('file-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Tambah ke Rak File', properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : fileInfo(r.filePaths);
});
ipcMain.on('file-open', async (_e, p) => {
  const err = await shell.openPath(p);
  if (err) log.warn('rak', `Gagal membuka ${p}: ${err}`); else log.info('rak', 'Membuka ' + p);
});
ipcMain.on('file-reveal', (_e, p) => { shell.showItemInFolder(p); log.info('rak', 'Tampilkan di folder: ' + p); });
ipcMain.on('file-drag', (e, p, icon) => {
  if (!fs.existsSync(p)) { log.warn('rak', 'File untuk diseret tidak ada: ' + p); return; }
  let img = icon ? nativeImage.createFromDataURL(icon) : nativeImage.createEmpty();
  if (img.isEmpty()) img = nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 });
  e.sender.startDrag({ file: p, icon: img });
  log.info('rak', 'Seret keluar: ' + p);
});
ipcMain.handle('art-lookup', (_e, title, artist) => (title ? lookupArt(String(title), String(artist || '')) : ''));
ipcMain.on('data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.on('data-reset', () => {
  log.warn('data', 'Semua data dihapus oleh pengguna');
  store.reset();
  for (const k of Object.keys(store.get())) broadcast('store-changed', k, store.get(k));
  onSettingsChanged(store.get('settings'));
});
ipcMain.handle('version', () => app.getVersion());

// log
ipcMain.on('log', (_e, level, src, msg) => log.write(String(level || 'INFO').toUpperCase(), src, msg));
ipcMain.handle('log-tail', (_e, n) => log.tail(Number(n) || 300));
ipcMain.handle('log-size', () => log.size());
ipcMain.on('log-clear', () => { log.clear(); log.info('log', 'Log dikosongkan'); });
ipcMain.on('log-open', () => { if (!fs.existsSync(log.file)) fs.writeFileSync(log.file, ''); shell.openPath(log.file); });

/* ---------------- tray ---------------- */
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pulau ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Pengaturan…', click: openSettings },
    { label: 'Tampilkan pulau', type: 'checkbox', checked: !userHidden, click: (i) => setVisible(i.checked) },
    {
      label: 'Jalankan saat Windows mulai', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked }); log.info('tray', 'Autostart: ' + i.checked); }
    },
    { label: 'Buka log', click: () => { if (!fs.existsSync(log.file)) fs.writeFileSync(log.file, ''); shell.openPath(log.file); } },
    { type: 'separator' },
    { label: 'Keluar', click: () => { quitting = true; app.quit(); } }
  ]));
}
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Pulau');
  tray.on('click', openSettings);
  rebuildTray();
}

/* ---------------- start ---------------- */
app.on('second-instance', openSettings);

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  lastSettings = JSON.parse(JSON.stringify(store.get('settings')));
  log.setLevel(lastSettings.logLevel);
  log.info('app', `Pulau ${app.getVersion()} dimulai (Electron ${process.versions.electron}, Windows ${process.getSystemVersion ? process.getSystemVersion() : ''})`);

  // buang file rak yang sudah tidak ada
  const shelf = store.get('shelf') || [];
  const kept = shelf.filter((f) => { try { return fs.existsSync(f.path); } catch (_) { return false; } });
  if (kept.length !== shelf.length) log.info('rak', `${shelf.length - kept.length} file di rak sudah tidak ada dan dibuang`);
  store.set('shelf', kept);

  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  if (app.isPackaged) {
    const flag = path.join(app.getPath('userData'), '.init');
    if (!fs.existsSync(flag)) { app.setLoginItemSettings({ openAtLogin: true }); try { fs.writeFileSync(flag, '1'); } catch (_) {} }
  }
  createWindow();
  buildTray();
  pollCursor();
  startMedia();
  startCmd();
});

app.on('before-quit', () => {
  quitting = true;
  log.info('app', 'Pulau ditutup');
  if (appbar) appbar.remove();
  if (store) store.flush();
  for (const p of [ps, cmdPs]) if (p) { try { p.stdin.end(); p.kill(); } catch (_) {} }
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
