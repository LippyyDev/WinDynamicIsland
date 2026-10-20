'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const api = window.pulau;
let S = null;

const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => {
  const ks = p.split('.'), last = ks.pop();
  ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v;
};

let toastT = 0;
function toast(msg = 'Tersimpan') {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1200);
}

function fill() {
  for (const el of $$('[data-k]')) {
    const v = getP(S, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = v;
  }
  for (const box of $$('[data-multi]')) {
    const cur = getP(S, box.dataset.multi);
    for (const c of box.children) c.classList.toggle('on', Array.isArray(cur) && cur.includes(c.dataset.v));
  }  // baris yang hanya relevan untuk pilihan tertentu, misalnya data-when="barEffect=blur"
  for (const el of $$('[data-when]')) {
    const [k, v] = el.dataset.when.split('=');
    el.classList.toggle('hidden', String(getP(S, k)) !== v);
  }
}

function bind() {
  for (const el of $$('[data-k]')) {
    const k = el.dataset.k;
    if (el.type === 'checkbox') {
      el.addEventListener('change', () => { setP(S, k, el.checked); api.set('settings', S); fill(); toast(); });
    } else if (el.tagName === 'SELECT') {
      el.addEventListener('change', () => { setP(S, k, el.value); api.set('settings', S); fill(); toast(); setTimeout(refreshLog, 300); });
    } else if (el.type === 'text') {
      el.addEventListener('change', () => { const v = el.value.trim().slice(0, Number(el.maxLength) > 0 ? el.maxLength : 64); el.value = v; setP(S, k, v); api.set('settings', S); toast(); });
    } else {
      el.addEventListener('change', () => {
        let v = Number(el.value);
        const min = Number(el.min), max = Number(el.max);
        if (!Number.isFinite(v)) v = getP(S, k);
        if (el.min !== '') v = Math.max(min, v);
        if (el.max !== '') v = Math.min(max, v);
        el.value = v;
        setP(S, k, v);
        if (k === 'water.start' && S.water.end <= v) { S.water.end = Math.min(24, v + 1); fill(); }
        if (k === 'water.end' && S.water.start >= v) { S.water.start = Math.max(0, v - 1); fill(); }
        api.set('settings', S); toast();
      });
    }
  }
  // pilihan ganda berbentuk chip: Otomatis saling menggantikan dengan pilihan lain
  for (const box of $$('[data-multi]')) {
    box.addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      const k = box.dataset.multi, v = c.dataset.v;
      let cur = Array.isArray(getP(S, k)) ? [...getP(S, k)] : [];
      if (cur.includes(v)) cur = cur.filter((x) => x !== v);
      else cur = v === 'auto' ? ['auto'] : [...cur.filter((x) => x !== 'auto'), v];
      setP(S, k, cur); api.set('settings', S); fill(); toast();
    });
  }
  // cegah semua halaman dimatikan
  for (const el of $$('[data-k^="pages."]')) {
    el.addEventListener('change', () => {
      if (!Object.values(S.pages).some(Boolean)) { el.checked = true; setP(S, el.dataset.k, true); api.set('settings', S); toast('Minimal satu halaman aktif'); }
    });
  }
}

$('#nav').addEventListener('click', (e) => {
  const a = e.target.closest('a'); if (!a) return;
  $$('#nav a').forEach((x) => x.classList.toggle('on', x === a));
  $$('main section').forEach((s) => s.classList.toggle('on', s.dataset.s === a.dataset.s));
  $('#main').scrollTop = 0;
});

$('#openData').onclick = () => api.dataFolder();

/* ---------- penampil log ---------- */
const escH = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB');
async function refreshLog() {
  if (!$('section[data-s="data"]').classList.contains('on')) return;
  const view = $('#logView');
  let text = await api.logTail(400);
  let lines = text ? text.split('\n') : [];
  if ($('#logErrOnly').checked) lines = lines.filter((l) => / (WARN|ERROR) /.test(l));
  view.innerHTML = lines.length
    ? lines.map((l) => {
        const c = / ERROR /.test(l) ? 'e' : / WARN /.test(l) ? 'w' : / DEBUG /.test(l) ? 'd' : '';
        return c ? `<span class="${c}">${escH(l)}</span>` : escH(l);
      }).join('\n')
    : (S && S.logLevel === 'off' ? 'Log sedang mati. Pilih Hanya galat atau Semua aktivitas di atas.' : 'Log masih kosong.');
  if ($('#logFollow').checked) view.scrollTop = view.scrollHeight;
  $('#logInfo').textContent = 'pulau.log di folder data, ukuran ' + fmtSize(await api.logSize()) + '. Diputar otomatis setelah 2 MB.';
}
$('#logOpen').onclick = () => api.logOpen();
$('#logClear').onclick = () => { if (confirm('Kosongkan isi log?')) { api.logClear(); setTimeout(refreshLog, 200); toast('Log dikosongkan'); } };
$('#logRefresh').onclick = refreshLog;
$('#logErrOnly').onchange = refreshLog;
setInterval(refreshLog, 2000);
$('#nav').addEventListener('click', () => setTimeout(refreshLog, 50));
$('#resetData').onclick = () => {
  if (confirm('Hapus semua data Pulau? Pengaturan kembali ke awal dan tugas, catatan minum, serta rak file akan dikosongkan.')) {
    api.dataReset(); toast('Data dihapus');
  }
};

/* ---------- asisten suara ---------- */
const FALLBACK = { chat: ['gpt-4o-mini', 'gpt-4o', 'gemini-2.5-flash', 'claude-sonnet-4'], stt: ['whisper-1'], tts: ['tts-1', 'tts-1-hd'] };
function setOpts(sel, list, cur) {
  const ids = [...new Set([...(cur ? [cur] : []), ...list])];
  sel.innerHTML = '';
  for (const id of ids) { const o = document.createElement('option'); o.value = o.textContent = id; sel.appendChild(o); }
  sel.value = cur || ids[0] || '';
}
function fillModels(m) {
  setOpts($('#selChat'), m.chat, S.aiModel);
  setOpts($('#selStt'), m.stt, S.aiStt);
  setOpts($('#selTts'), m.tts, S.aiTts);
}
async function aiKeyRefresh() {
  const has = await api.aiKeyHas();
  $('#aiKeyState').textContent = has ? 'Tersimpan terenkripsi di PC ini. Tidak bisa ditampilkan lagi; simpan kunci baru untuk menggantinya.' : 'Belum disimpan. Disimpan terenkripsi di PC ini dan tidak pernah ditampilkan lagi.';
  $('#aiKeyClear').disabled = !has;
  return has;
}
let modelsBusy = false;
async function loadModels(quiet) {
  if (modelsBusy) return;
  modelsBusy = true;
  const st = $('#aiModelsState'), b = $('#aiModelsLoad');
  b.disabled = true; st.textContent = 'Mengambil daftar model…';
  const r = await api.aiModels();
  modelsBusy = false; b.disabled = false;
  if (r && r.ok) {
    fillModels(r.value);
    st.textContent = `${r.value.chat.length} model percakapan, ${r.value.stt.length} transkripsi, ${r.value.tts.length} suara dari akun Anda.`;
  } else {
    st.textContent = 'Gagal: ' + (r ? r.error : 'tidak diketahui') + ' Daftar bawaan dipakai.';
    if (!quiet) toast('Gagal memuat model');
  }
}
$('#aiKeySave').onclick = async () => {
  const f = $('#aiKey'), r = await api.aiKeySet(f.value);
  if (r.ok) { f.value = ''; toast('Kunci disimpan'); await aiKeyRefresh(); loadModels(true); }
  else toast(r.error);
};
$('#aiKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#aiKeySave').click(); });
$('#aiKeyClear').onclick = async () => { if (!confirm('Hapus kunci API?')) return; api.aiKeyClear(); toast('Kunci dihapus'); setTimeout(aiKeyRefresh, 150); };
$('#aiModelsLoad').onclick = () => loadModels(false);
let testAudio = null;
$('#aiTest').onclick = async () => {
  const st = $('#aiTestState'), b = $('#aiTest');
  b.disabled = true; st.textContent = 'Membuat suara…';
  const r = await api.aiSpeech('Halo, saya Pulau. Tekan shortcut, lalu tanyakan apa saja.');
  b.disabled = false;
  if (!r.ok) { st.textContent = 'Gagal: ' + r.error; return; }
  if (testAudio) { testAudio.pause(); URL.revokeObjectURL(testAudio.src); }
  testAudio = new Audio(URL.createObjectURL(new Blob([r.value], { type: 'audio/mpeg' })));
  testAudio.play().catch(() => {});
  st.textContent = 'Diputar dengan suara ' + S.aiVoice + ' dan model ' + S.aiTts + '.';
};
let modelsLoaded = false;
$('#nav').addEventListener('click', async (e) => {
  const a = e.target.closest('a');
  if (a && a.dataset.s === 'suara' && !modelsLoaded) { modelsLoaded = true; if (await aiKeyRefresh()) loadModels(true); }
});

(async () => {
  S = await api.get('settings');
  fillModels(FALLBACK);
  fill(); bind();
  aiKeyRefresh();
  const as = $('#autostart');
  as.checked = await api.autostartGet();
  as.addEventListener('change', () => { api.autostartSet(as.checked); toast(); });
  $('#ver').textContent = 'versi ' + (await api.version());
  api.onStore((k, v) => { if (k === 'settings') { S = v; fill(); } });
})();
