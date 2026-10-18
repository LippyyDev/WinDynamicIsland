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
}

function bind() {
  for (const el of $$('[data-k]')) {
    const k = el.dataset.k;
    if (el.type === 'checkbox') {
      el.addEventListener('change', () => { setP(S, k, el.checked); api.set('settings', S); toast(); });
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
