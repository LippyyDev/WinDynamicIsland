'use strict';
/* Inti island: state, mode, navigasi halaman, notifikasi, jam, mata idle. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = window.pulau;
const island = $('#island');

const P = {
  data: {},
  get S() { return this.data.settings; },
  order: ['music', 'pomodoro', 'water', 'shelf', 'todo'],
  mods: {},
  page: 'music',
  hover: false, hoverRaw: false,
  alert: null, alertQ: [], alertT: 0,
  alt: false, curOn: false, lastActive: Date.now(),
  compactW: 340
};

const save = (key) => api.set(key, P.data[key]);
const logA = (level, src, msg) => { try { if (api.log) api.log(level, src, String(msg)); } catch (_) {} };
window.addEventListener('error', (e) => logA('ERROR', 'antarmuka', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => logA('ERROR', 'antarmuka', 'Promise ditolak: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
const fmt = (s) => {
  s = Math.max(0, Math.round(s || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- ikon ---------- */
const G = {
  bolt: '<svg class="glyph fill" viewBox="0 0 24 24"><path d="M13.2 2.5 5 13.2h5.6l-1 8.3 8.4-11h-5.7z"/></svg>',
  headphones: '<svg class="glyph" viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4.5" height="6.5" rx="1.8"/><rect x="16" y="14" width="4.5" height="6.5" rx="1.8"/></svg>',
  speaker: '<svg class="glyph" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg class="glyph" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
  caps: '<svg class="glyph" viewBox="0 0 24 24"><path d="M12 4 4.5 12H9v4h6v-4h4.5z"/><path d="M9 20h6"/></svg>',
  battery: '<svg class="glyph" viewBox="0 0 24 24"><rect x="3" y="7.5" width="16" height="9" rx="2"/><path d="M21 10.5v3"/><path d="M6 10.5v3" /></svg>',
  drop: '<svg class="glyph" viewBox="0 0 24 24"><path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/></svg>',
  check: '<svg class="glyph" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  timer: '<svg class="glyph" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M9.5 2.5h5"/></svg>',
  bell: '<svg class="glyph" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
  bot: '<svg class="glyph" viewBox="0 0 24 24"><rect x="5" y="8.5" width="14" height="10" rx="3"/><path d="M12 5v3.5M9.5 13v1.5M14.5 13v1.5"/></svg>',
  file: '<svg class="glyph" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>'
};
function ringIcon(frac, color, glyph) {
  const c = 2 * Math.PI * 17;
  return `<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,.13)"/>` +
    `<circle cx="20" cy="20" r="17" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}"/></svg>${glyph}`;
}

/* ---------- suara ---------- */
let actx = null;
function chime(kind = 'soft') {
  try {
    actx = actx || new AudioContext();
    const notes = kind === 'done' ? [784, 1046.5, 1318.5] : [880, 1174.7];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = actx.currentTime + i * 0.17;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 1.2);
    });
  } catch (_) {}
}

/* ---------- notifikasi di island ---------- */
function notify(a) {
  if (a.id && P.alert && P.alert.id === a.id) {
    Object.assign(P.alert, a); paintAlert(); armAlert(); render(); return;
  }
  if (a.id) {
    const i = P.alertQ.findIndex((x) => x.id === a.id);
    if (i >= 0) { P.alertQ[i] = a; return; }
  }
  logA(a.id === 'vol' || a.id === 'caps' ? 'DEBUG' : 'INFO', 'notifikasi', a.title + (a.sub ? ': ' + a.sub : ''));
  P.alertQ.push(a);
  if (P.alertQ.length > 8) P.alertQ.splice(0, P.alertQ.length - 8);
  if (!P.alert) nextAlert();
}
function nextAlert() {
  P.alert = P.alertQ.shift() || null;
  if (P.alert) {
    paintAlert(); armAlert(); P.lastActive = Date.now();
    if (P.alert.sound) chime(P.alert.sound);
  }
  render();
}
function armAlert() {
  clearTimeout(P.alertT);
  P.alertT = setTimeout(() => { P.alert = null; nextAlert(); }, P.alert.dur || 3200);
}
function dismissAlert() { clearTimeout(P.alertT); P.alert = null; P.alertQ = P.alertQ.filter((a) => a.sticky); }
function paintAlert() {
  const a = P.alert;
  $('#alIcon').innerHTML = a.icon || '';
  $('#alTitle').textContent = a.title || '';
  $('#alSub').textContent = a.sub || '';
  $('#alSub').style.display = a.sub ? '' : 'none';
  $('#alRight').innerHTML = a.right || '';
}

/* ---------- compact ---------- */
let lastCompact = '';
function buildCompact() {
  const m = P.mods.music.compact();
  const t = P.mods.pomodoro.compactTimer();
  if (!m && !t) return false;
  let left, line, right;
  if (m) {
    left = m.left; line = m.line;
    right = t ? t : '<span class="bars"><i></i><i></i><i></i><i></i></span>';
  } else {
    left = G.timer.replace('class="glyph"', '');
    line = P.mods.pomodoro.label();
    right = t;
  }
  P.compactW = t && m ? 380 : 340;
  const sig = left + '|' + right;
  if (sig !== lastCompact) {
    lastCompact = sig;
    $('#cLeft').innerHTML = left;
    $('#cRight').innerHTML = right;
  }
  setMarquee($('#cLine'), line);
  return true;
}
function setMarquee(span, text) {
  if (span.textContent === text) return;
  span.textContent = text;
  checkMarquee(span);
}
// Diukur ulang setelah animasi lebar selesai, karena lebar saat transisi belum final.
function checkMarquee(span = $('#cLine')) {
  span.classList.remove('scroll');
  void span.offsetWidth;
  if (span.scrollWidth > span.parentElement.clientWidth + 2) span.classList.add('scroll');
}
island.addEventListener('transitionend', (e) => { if (e.target === island && e.propertyName === 'width') checkMarquee(); });

/* ---------- lebar otomatis mengikuti teks, dengan batas maksimal dari pengaturan ---------- */
const autoW = () => P.S.autoWidth !== false;
const maxW = () => Math.max(240, Math.min(800, Number(P.S.maxW) || 400));
const mctx = document.createElement('canvas').getContext('2d');
function textW(el, text) { // diukur lewat canvas: tidak terpengaruh transformasi animasi atau batas wadah
  const cs = getComputedStyle(el);
  mctx.font = cs.font;
  mctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  return Math.ceil(mctx.measureText(text || '').width);
}
function boxExtra(view, nParts) { // padding kiri kanan dan jarak antar bagian
  const cs = getComputedStyle(view);
  return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + (parseFloat(cs.columnGap) || 0) * Math.max(0, nParts - 1);
}
function fitCompact() {
  const line = $('#cLine'), left = $('#cLeft').offsetWidth, right = $('#cRight').offsetWidth;
  const txt = textW(line, line.textContent);
  const w = Math.max(190, Math.min(maxW(), boxExtra($('.v-compact'), 1 + (txt ? 1 : 0) + (right ? 1 : 0)) + left + right + txt + 14));
  if (P.fitC && Math.abs(w - P.fitC) < 14) return P.fitC; // hindari goyang kecil saat lirik berganti
  return (P.fitC = w);
}
function fitAlert() {
  const a = P.alert, ic = $('#alIcon').offsetWidth, rt = $('#alRight').offsetWidth;
  const txt = Math.max(textW($('#alTitle'), a.title), textW($('#alSub'), a.sub));
  const parts = [ic, txt, rt].filter((x) => x > 0).length;
  return Math.max(220, Math.min(maxW(), boxExtra($('.v-alert'), parts) + ic + rt + txt + 6));
}

/* ---------- render ---------- */
const TITLE_COLOR = { water: 'var(--blue)', shelf: 'var(--amber)', todo: 'var(--green)', pomodoro: 'var(--red)' };
function pagesOn() {
  const p = P.order.filter((k) => P.S.pages[k] !== false);
  return p.length ? p : ['music'];
}
function render() {
  if (!P.S) return;
  const pages = pagesOn();
  if (!pages.includes(P.page)) P.page = pages[0];

  let mode;
  if (P.hover) mode = 'expanded';
  else if (P.alert) mode = 'alert';
  else if (buildCompact()) mode = 'compact';
  else mode = 'idle';
  if (mode !== 'idle') P.alt = false;
  const idle = mode === 'idle' ? idleItems() : [];

  island.dataset.mode = mode;
  island.dataset.page = P.page;
  island.dataset.idle = idle.join(' ');
  idleApply();
  const eyesOn = idle.includes('eyes');
  if (eyesOn !== P.curOn) { P.curOn = eyesOn; api.wantCursor(eyesOn); }
  island.classList.toggle('al-small', mode === 'alert' && (P.alert.h || 64) < 56);

  const notch = !!P.S.notch;
  const barH = Math.max(20, Math.min(60, Number(P.S.barHeight) || 32));
  document.body.classList.toggle('notch', notch);
  document.body.classList.toggle('menubar', notch && P.S.menubar !== false);
  document.documentElement.style.setProperty('--barh', barH + 'px');
  let w = 150, h = notch ? barH : 32;
  if (mode === 'expanded') { w = P.mods[P.page].width(); h = 190; }
  else if (mode === 'alert') { w = autoW() ? fitAlert() : P.alert.w || 380; h = Math.max(P.alert.h || 64, notch ? barH : 0); }
  else if (mode === 'compact') { w = autoW() ? fitCompact() : P.compactW; P.compactW = w; h = notch ? barH : 38; }
  else if (idle.length) { w = idleWidth(idle); }
  island.style.width = w + 'px';
  island.style.height = h + 'px';

  // header + halaman
  const mod = P.mods[P.page];
  $('#hdTitle').innerHTML = mod.title || '';
  island.style.setProperty('--pc-title', TITLE_COLOR[P.page] || 'var(--blue)');
  const idx = pages.indexOf(P.page);
  for (const sec of $$('.page')) {
    const k = sec.dataset.page, i = pages.indexOf(k);
    sec.hidden = i < 0;
    sec.classList.toggle('on', k === P.page);
    sec.classList.toggle('left', i >= 0 && i < idx);
  }
  const dots = $('#dots');
  if (dots.childElementCount !== pages.length || dots.dataset.sig !== pages.join()) {
    dots.innerHTML = pages.map((k) => `<i data-p="${k}" title="${k}"></i>`).join('');
    dots.dataset.sig = pages.join();
  }
  $$('#dots i').forEach((d) => d.classList.toggle('on', d.dataset.p === P.page));
  $('#navPrev').hidden = $('#navNext').hidden = pages.length < 2;

  for (const m of Object.values(P.mods)) m.decorate && m.decorate(mode, w);
  sendRect();
}

function go(page) {
  if (page === P.page) return;
  P.page = page;
  logA('DEBUG', 'pulau', 'Pindah ke halaman ' + page);
  render();
  P.mods[page].onShow && P.mods[page].onShow();
}
function step(d) {
  const p = pagesOn();
  go(p[(p.indexOf(P.page) + d + p.length) % p.length]);
}

/* ---------- hover & fokus ---------- */
let enterT = 0, leaveT = 0;
const editing = () => { const a = document.activeElement; return a && a.tagName === 'INPUT' && island.contains(a); };
function openIsland(page) {
  clearTimeout(leaveT);
  if (page) P.page = page;
  else if (P.alert && P.alert.page) P.page = P.alert.page;
  else if (island.dataset.mode === 'compact') P.page = P.mods.music.hasTrack() ? 'music' : 'pomodoro';
  if (P.alert) dismissAlert();
  P.hover = true; P.lastActive = Date.now();
  logA('DEBUG', 'pulau', 'Dibuka, halaman ' + P.page);
  render();
  P.mods[P.page].onShow && P.mods[P.page].onShow();
}
function closeIsland() {
  if (editing()) {
    const a = document.activeElement;
    if (a.value && a.value.trim()) { leaveT = setTimeout(() => { if (!P.hoverRaw) closeIsland(); }, 2000); return; }
    a.blur();
  }
  P.hover = false;
  render();
}
api.onHover((v) => {
  P.hoverRaw = v;
  if (v) {
    clearTimeout(leaveT);
    if (!P.hover) enterT = setTimeout(() => openIsland(), P.S ? P.S.hoverDelay : 120);
  } else {
    clearTimeout(enterT);
    leaveT = setTimeout(closeIsland, 420);
  }
});
document.addEventListener('focusout', () => setTimeout(() => { if (!P.hoverRaw && !editing()) closeIsland(); }, 250));

/* ---------- navigasi ---------- */
$('#navPrev').onclick = () => step(-1);
$('#navNext').onclick = () => step(1);
$('#dots').addEventListener('click', (e) => { const p = e.target.dataset.p; if (p) go(p); });
$('#bSettings').onclick = () => api.openSettings();
$('#hdEq').onclick = () => go('music');
let wheelAt = 0;
island.addEventListener('wheel', (e) => {
  if (island.dataset.mode !== 'expanded') return;
  if (e.target.closest('.scroll-y, .scroll-x, .m-lyrics')) return;
  const now = Date.now();
  if (now - wheelAt < 450) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 4) return;
  wheelAt = now; step(d > 0 ? 1 : -1);
}, { passive: true });

/* ---------- jam ---------- */
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function clock() {
  const d = new Date();
  const t = hhmm(d);
  if (t === clock.last) return; // DOM hanya disentuh saat menit berganti
  clock.last = t;
  $('#clock').textContent = t;
  $('#idleDate').textContent = `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}`;
  $('#hdClock').textContent = t;
  $('#hdDate').textContent = `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- tampilan idle (bisa dikustom) ---------- */
const IDLE_ITEMS = ['cam', 'eyes', 'breath', 'wave', 'clock', 'date', 'text', 'battery']; // urutan tampil
const idleBat = { level: -1, charging: false };
const autoIdle = () => (P.S.notch && P.S.menubar !== false ? 'cam' : 'clock');
// item yang tampil sekarang: pilihan dasar, atau pilihan "setelah lama diam" bila P.alt aktif
function idleItems() {
  const raw = P.alt ? P.S.idleAltItems : P.S.idleItems;
  const list = Array.isArray(raw) ? raw : [];
  const set = new Set(list.map((x) => (x === 'auto' ? autoIdle() : x)));
  if (idleBat.level < 0) set.delete('battery'); // PC tanpa baterai
  if (!set.size && list.length) set.add(autoIdle());
  return IDLE_ITEMS.filter((x) => set.has(x));
}
let idleSig = '', idleW = 150;
// lebar pulau mengikuti isinya; diukur hanya saat isi berubah
function idleWidth(items) {
  if (items.length === 1 && items[0] === 'eyes') return 124;
  const sig = items.join() + '|' + (P.S.idleText || '') + '|' + $('#idleDate').textContent + '|' + idleBat.level + '|' + maxW();
  if (sig === idleSig) return idleW;
  idleSig = sig;
  const row = $('#idleRow');
  idleW = Math.max(150, Math.min(maxW(), Math.ceil(row.offsetWidth) + 44));
  return idleW;
}
let idleApplied = '';
function idleApply() { // tulis DOM hanya bila isinya berubah
  const sig = (P.S.idleText || '') + '|' + idleBat.level + idleBat.charging;
  if (sig === idleApplied) return;
  idleApplied = sig;
  $('#idleText').textContent = String(P.S.idleText || '').slice(0, 16);
  if (idleBat.level >= 0) {
    const pct = Math.round(idleBat.level * 100);
    $('#idleBatPct').textContent = pct + '%';
    island.style.setProperty('--bat-o', (47.12 * (1 - idleBat.level)).toFixed(2));
    island.style.setProperty('--bat-c', idleBat.charging ? 'var(--green)' : pct <= 20 ? 'var(--red)' : '#fff');
  }
}
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    // PC tanpa baterai biasanya melapor 100% mengisi dengan waktu isi 0
    if (b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity) return;
    const up = () => { idleBat.level = b.level; idleBat.charging = b.charging; if (P.S) render(); };
    b.addEventListener('levelchange', up);
    b.addEventListener('chargingchange', up);
    up();
  }).catch(() => {});
}
function eyesTick() { // nama lama: sekarang mengatur peralihan ke gaya "setelah lama diam"
  if (!P.S) return;
  const want = Array.isArray(P.S.idleAltItems) && P.S.idleAltItems.length > 0 && island.dataset.mode === 'idle' && !P.alert &&
    Date.now() - P.lastActive > (P.S.eyesAfter || 20) * 1000;
  if (want !== P.alt) { P.alt = want; render(); }
}
api.onCursor(({ x, y }) => {
  if (!P.curOn) return;
  const cx = window.innerWidth / 2;
  const ex = Math.max(-1, Math.min(1, (x - cx) / 220)) * 3.5;
  const ey = Math.max(-1, Math.min(1, (y - 16) / 220)) * 3.5;
  island.style.setProperty('--ex', ex.toFixed(1) + 'px');
  island.style.setProperty('--ey', ey.toFixed(1) + 'px');
});

/* ---------- area klik untuk main process ---------- */
function sendRect() {
  const r = island.getBoundingClientRect();
  const rects = [{ id: 'island', x: Math.floor(r.left) - 2, y: 0, w: Math.ceil(r.width) + 4, h: Math.ceil(r.bottom) + 2 }];
  const logo = $('#mbLogo');
  if (document.body.classList.contains('menubar') && logo && logo.offsetParent) {
    const l = logo.getBoundingClientRect();
    rects.push({ id: 'logo', x: Math.floor(l.left), y: 0, w: Math.ceil(l.width), h: Math.ceil(l.bottom) });
  }
  api.rect(rects);
}
new ResizeObserver(sendRect).observe(island);
