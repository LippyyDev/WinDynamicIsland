const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch, cb) => ipcRenderer.on(ch, (_e, ...a) => cb(...a));

contextBridge.exposeInMainWorld('pulau', {
  onMedia: (cb) => on('media', cb),
  cmd: (c) => ipcRenderer.send('media-cmd', c),
  onHover: (cb) => on('hover', cb),
  onCursor: (cb) => on('cursor', cb),
  onEnv: (cb) => on('env', cb),
  logoMenu: (x, y) => ipcRenderer.send('logo-menu', x, y),
  rect: (r) => ipcRenderer.send('island-rect', r),
  wantCursor: (v) => ipcRenderer.send('want-cursor', v),

  get: (k) => ipcRenderer.invoke('store-get', k),
  set: (k, v) => ipcRenderer.send('store-set', k, v),
  onStore: (cb) => on('store-changed', cb),

  openSettings: () => ipcRenderer.send('open-settings'),
  autostartGet: () => ipcRenderer.invoke('autostart-get'),
  autostartSet: (v) => ipcRenderer.send('autostart-set', v),

  artLookup: (title, artist) => ipcRenderer.invoke('art-lookup', title, artist),
  fileInfo: (paths) => ipcRenderer.invoke('file-info', paths),
  fileDialog: () => ipcRenderer.invoke('file-dialog'),
  openFile: (p) => ipcRenderer.send('file-open', p),
  revealFile: (p) => ipcRenderer.send('file-reveal', p),
  dragFile: (p, icon) => ipcRenderer.send('file-drag', p, icon),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (_) { return ''; } },

  log: (level, src, msg) => ipcRenderer.send('log', level, src, msg),
  logTail: (n) => ipcRenderer.invoke('log-tail', n),
  logSize: () => ipcRenderer.invoke('log-size'),
  logClear: () => ipcRenderer.send('log-clear'),
  logOpen: () => ipcRenderer.send('log-open'),

  dataFolder: () => ipcRenderer.send('data-folder'),
  dataReset: () => ipcRenderer.send('data-reset'),
  version: () => ipcRenderer.invoke('version')
});
