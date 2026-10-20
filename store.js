// Penyimpanan lokal: satu file JSON di folder AppData pengguna.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    lyrics: true,
    lyricsCompact: true,
    artColor: true,
    artOnline: true,
    autoWidth: true,
    maxW: 400,
    idleItems: ['auto'],
    idleAltItems: ['eyes'],
    idleText: 'Pulau',
    notch: true,
    notchBlack: true,
    menubar: true,
    barColor: 'auto',
    barEffect: 'solid',
    barBlur: 60,
    barBlurTint: 35,
    mb: { app: true, title: true, wifi: true, volume: true, battery: true, batteryPct: true, clock: true },
    barHeight: 32,
    hideOnFullscreen: true,
    logLevel: 'errors',
    eyesAfter: 20,
    hoverDelay: 120,
    pages: { music: true, pomodoro: true, water: true, shelf: true, todo: true },
    pomo: { focus: 25, short: 5, long: 15, every: 4, sound: true, autoNext: false },
    water: { remind: true, goal: 2000, cup: 250, interval: 60, start: 8, end: 22 },
    aiEnabled: false,
    aiBase: 'https://api.aivene.com/v1',
    aiModel: 'gpt-4o-mini',
    aiStt: 'whisper-1',
    aiTts: 'tts-1',
    aiVoice: 'nova',
    aiSpeed: 1,
    aiLang: 'id',
    aiShortcut: 'Control+Alt+Space',
    aiSilence: 1.5,
    aiFollow: false,
    aiPersona: '',
    notify: { charging: true, lowBattery: true, lowAt: 20, headphones: true, caps: true, volume: true, todo: true }
  },
  todos: [],
  water: { log: {}, lastDrink: 0, lastRemind: 0 },
  shelf: [],
  pomo: { phase: 'focus', running: false, endAt: 0, remaining: 0, count: 0 }
};

function merge(def, val) {
  if (Array.isArray(def)) return Array.isArray(val) ? val : def;
  if (def && typeof def === 'object') {
    const out = { ...def };
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const k of Object.keys(val)) out[k] = k in def ? merge(def[k], val[k]) : val[k];
    }
    return out;
  }
  return val === undefined || val === null ? def : val;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'pulau-data.json');
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {}
    this.data = merge(DEFAULTS, raw);
    this.timer = null;
  }
  get(k) { return k ? this.data[k] : this.data; }
  set(k, v) { this.data[k] = v; this.queue(); }
  queue() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 250); }
  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (_) {}
  }
  reset() { this.data = merge(DEFAULTS, {}); this.flush(); }
}

module.exports = { Store, DEFAULTS };
