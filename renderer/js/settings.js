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

/* ---------- suara notifikasi ---------- */
function loadVoices() {
  const sel = $('#voiceSel'); if (!sel || !window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices();
  if (!vs.length || sel.options.length > 1) return;
  for (const v of vs) { const o = document.createElement('option'); o.value = v.name; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o); }
  if (S) fill();
}
if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }
$('#voiceTest').onclick = () => {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Mengisi daya. Pengisi daya tersambung.');
  const v = speechSynthesis.getVoices().find((x) => x.name === $('#voiceSel').value);
  if (v) u.voice = v; else u.lang = 'id-ID';
  u.rate = Number(S && S.notify.rate) || 1;
  speechSynthesis.speak(u);
};

/* ---------- agen AI ---------- */
async function keyRefresh() {
  const has = await api.agentKeyHas();
  $('#keyState').textContent = has ? 'Tersimpan terenkripsi di PC ini. Tidak bisa ditampilkan lagi; simpan kunci baru untuk menggantinya.' : 'Belum disimpan. Disimpan terenkripsi di PC ini dan tidak pernah ditampilkan lagi.';
}
$('#keySave').onclick = async () => {
  const f = $('#agentKey'), r = await api.agentKeySet(f.value);
  if (r.ok) { f.value = ''; toast('Kunci tersimpan'); } else toast(r.error);
  keyRefresh();
};
$('#keyClear').onclick = async () => { await api.agentKeyClear(); toast('Kunci dihapus'); keyRefresh(); };
$('#testBtn').onclick = async () => {
  const b = $('#testBtn'), t = $('#testState');
  b.disabled = true; t.textContent = 'Menguji…';
  const r = await api.agentTest();
  t.textContent = r.ok ? `Berhasil dalam ${r.ms} ms. Balasan model: "${r.reply}". Kemampuan gambar belum terbukti; coba satu tugas di jendela agen.` : 'Gagal: ' + r.error;
  b.disabled = false;
};
$('#openAgent').onclick = () => api.openAgent();
keyRefresh();

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

(async () => {
  S = await api.get('settings');
  fill(); bind();
  const as = $('#autostart');
  as.checked = await api.autostartGet();
  as.addEventListener('change', () => { api.autostartSet(as.checked); toast(); });
  $('#ver').textContent = 'versi ' + (await api.version());
  api.onStore((k, v) => { if (k === 'settings') { S = v; fill(); } });
})();
