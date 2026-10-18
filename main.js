const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const { Store } = require('./store');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const W = 820, H = 300;
let win = null, settingsWin = null, tray = null, store = null;
let ps = null, cmdPs = null, quitting = false;
let islandRect = null, inside = false, wantCursor = false;

const ICON = path.join(__dirname, 'assets', 'icon.png');
const PRELOAD = path.join(__dirname, 'preload.js');

/* ---------------- jendela island ---------------- */
function place() {
  if (!win || win.isDestroyed()) return;
  const b = screen.getPrimaryDisplay().bounds;
  win.setBounds({ x: Math.round(b.x + (b.width - W) / 2), y: b.y, width: W, height: H });
}

function createWindow() {
  win = new BrowserWindow({
    width: W, height: H,
    frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  place();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
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

/* ---------------- jendela pengaturan ---------------- */
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 900, height: 620, minWidth: 760, minHeight: 500,
    title: 'Pengaturan Pulau', icon: ICON, backgroundColor: '#0c0c0f', show: false,
    autoHideMenuBar: true, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0c0f', symbolColor: '#d8d8de', height: 40 },
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
}

/* ---------------- jembatan PowerShell ---------------- */
const logPath = () => path.join(app.getPath('userData'), 'media.log');
function log(m) { try { fs.appendFileSync(logPath(), `[${new Date().toLocaleTimeString()}] [main] ${m}\n`); } catch (_) {} }
const psScript = () => app.isPackaged ? path.join(process.resourcesPath, 'media.ps1') : path.join(__dirname, 'media.ps1');

function runPs(mode) {
  const p = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScript(),
      '-Mode', mode, '-Log', logPath(), '-ParentPid', String(process.pid)],
    { windowsHide: true });
  p.on('error', (e) => log(`spawn ${mode} gagal: ${e.message}`));
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', (d) => log(`stderr ${mode}: ${String(d).trim().slice(0, 500)}`));
  return p;
}
function startMedia() {
  if (process.platform !== 'win32') return;
  ps = runPs('watch');
  ps.stdout.setEncoding('utf8');
  readline.createInterface({ input: ps.stdout }).on('line', (line) => {
    line = line.replace(/^﻿/, '').trim();
    if (!line) return;
    try { if (win && !win.isDestroyed()) win.webContents.send('media', JSON.parse(line)); }
    catch (_) { log('baris bukan JSON: ' + line.slice(0, 200)); }
  });
  ps.on('exit', (c) => { log('pembaca media berhenti, kode ' + c); ps = null; if (!quitting) setTimeout(startMedia, 3000); });
}
function startCmd() {
  if (process.platform !== 'win32') return;
  cmdPs = runPs('cmd');
  cmdPs.on('exit', () => { cmdPs = null; if (!quitting) setTimeout(startCmd, 3000); });
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
    } catch (_) {}
  }
  return out;
}

ipcMain.on('media-cmd', (_e, cmd) => { if (cmdPs && cmdPs.stdin.writable) cmdPs.stdin.write(cmd + '\n'); });
ipcMain.on('island-rect', (_e, r) => { islandRect = r; });
ipcMain.on('want-cursor', (_e, v) => { wantCursor = !!v; });
ipcMain.handle('store-get', (_e, k) => store.get(k));
ipcMain.on('store-set', (e, k, v) => {
  store.set(k, v);
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== e.sender) w.webContents.send('store-changed', k, v);
});
ipcMain.on('open-settings', openSettings);
ipcMain.handle('autostart-get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('autostart-set', (_e, v) => { app.setLoginItemSettings({ openAtLogin: !!v }); rebuildTray(); });
ipcMain.handle('file-info', (_e, paths) => fileInfo(paths || []));
ipcMain.handle('file-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Tambah ke Rak File', properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : fileInfo(r.filePaths);
});
ipcMain.on('file-open', (_e, p) => shell.openPath(p));
ipcMain.on('file-reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.on('file-drag', (e, p, icon) => {
  if (!fs.existsSync(p)) return;
  let img = icon ? nativeImage.createFromDataURL(icon) : nativeImage.createEmpty();
  if (img.isEmpty()) img = nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 });
  e.sender.startDrag({ file: p, icon: img });
});
ipcMain.on('data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.on('data-reset', () => {
  store.reset();
  for (const k of Object.keys(store.get())) broadcast('store-changed', k, store.get(k));
});
ipcMain.handle('version', () => app.getVersion());

/* ---------------- tray ---------------- */
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pulau ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Pengaturan…', click: openSettings },
    {
      label: 'Tampilkan pulau', type: 'checkbox', checked: !!win && win.isVisible(),
      click: (i) => { i.checked ? win.showInactive() : win.hide(); }
    },
    {
      label: 'Jalankan saat Windows mulai', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked })
    },
    { label: 'Buka log media', click: () => shell.openPath(logPath()) },
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
  // buang file rak yang sudah tidak ada
  store.set('shelf', (store.get('shelf') || []).filter((f) => { try { return fs.existsSync(f.path); } catch (_) { return false; } }));

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
  if (store) store.flush();
  for (const p of [ps, cmdPs]) if (p) { try { p.stdin.end(); p.kill(); } catch (_) {} }
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
