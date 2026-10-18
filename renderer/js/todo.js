'use strict';
/* Daftar tugas harian dengan pengingat jam. */
P.mods.todo = (() => {
  const T = () => P.data.todos;
  const SVG_CK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const SVG_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function cleanup() {
    const d = dayKey();
    const before = T().length;
    P.data.todos = T().filter((t) => !t.done || t.doneDay === d);
    if (P.data.todos.length !== before) save('todos');
  }
  function sorted() {
    return [...T()].sort((a, b) =>
      (a.done - b.done) || ((a.due || '99') < (b.due || '99') ? -1 : (a.due || '99') > (b.due || '99') ? 1 : 0) || (a.created - b.created));
  }
  function addTodo(text, due) {
    const now = hhmm();
    T().push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, due: due || '', done: false,
      created: Date.now(), doneDay: '', notified: due && due <= now ? dayKey() : '' });
    save('todos'); paint();
    logA('INFO', 'tugas', 'Tugas baru: ' + text + (due ? ' (pengingat ' + due + ')' : ''));
  }
  function toggle(id) {
    const t = T().find((x) => x.id === id); if (!t) return;
    t.done = !t.done; t.doneDay = t.done ? dayKey() : '';
    logA('INFO', 'tugas', (t.done ? 'Selesai: ' : 'Batal selesai: ') + t.text);
    save('todos'); paint();
  }
  function del(id) { const t0 = T().find((x) => x.id === id); if (t0) logA('INFO', 'tugas', 'Dihapus: ' + t0.text); P.data.todos = T().filter((x) => x.id !== id); save('todos'); paint(); }
  function edit(id, el) {
    const t = T().find((x) => x.id === id); if (!t) return;
    const inp = document.createElement('input');
    inp.value = t.text; inp.maxLength = 120;
    inp.style.cssText = 'flex:1;min-width:0;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);padding:0 8px;outline:none;font-size:12.5px;font-weight:600';
    el.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = () => { if (done) return; done = true; const v = inp.value.trim(); if (v) t.text = v; save('todos'); paint(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { done = true; paint(); } };
    inp.onblur = commit;
  }

  function paint() {
    const list = T();
    const done = list.filter((t) => t.done).length;
    $('#tDone').textContent = done;
    $('#tTotal').textContent = list.length;
    $('#tSub').textContent = list.length && done === list.length ? 'Semua tugas selesai' : 'Tugas selesai hari ini';
    const box = $('#tList');
    if (!list.length) {
      box.innerHTML = '<div class="t-empty">Belum ada tugas.<br>Klik Tambah untuk membuat.</div>';
      return;
    }
    const now = hhmm();
    box.innerHTML = sorted().map((t) =>
      `<div class="todo-item${t.done ? ' done' : ''}" data-id="${t.id}">` +
      `<button class="ck" title="Tandai selesai">${SVG_CK}</button>` +
      `<div class="tx" title="Klik dua kali untuk mengubah">${esc(t.text)}</div>` +
      (t.due ? `<span class="due${!t.done && t.due < now ? ' late' : ''}">${t.due}</span>` : '') +
      `<button class="del" title="Hapus">${SVG_X}</button></div>`).join('');
  }

  function remindTick() {
    if (!P.S.notify.todo) return;
    const now = hhmm(), d = dayKey();
    let changed = false;
    for (const t of T()) {
      if (t.done || !t.due || t.due > now || t.notified === d) continue;
      t.notified = d; changed = true;
      notify({ title: 'Pengingat tugas', sub: t.text, icon: ringIcon(1, 'var(--amber)', G.bell), page: 'todo', sound: 'soft', dur: 7000, w: 380 });
    }
    if (changed) { save('todos'); paint(); }
  }

  function openForm(on) {
    $('.t-right').classList.toggle('adding', on);
    if (on) { $('#tText').focus(); } else { $('#tText').value = ''; $('#tDue').value = ''; }
  }

  return {
    title: 'Daftar <em>Tugas</em>',
    width: () => 620,
    onShow() { cleanup(); paint(); },
    onData(k) { if (k === 'todos') paint(); },
    init() {
      cleanup();
      $('#tAdd').onclick = () => openForm(!$('.t-right').classList.contains('adding'));
      $('#tClear').onclick = () => { P.data.todos = T().filter((t) => !t.done); save('todos'); paint(); };
      $('#tForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = $('#tText').value.trim();
        if (!v) return;
        addTodo(v, $('#tDue').value);
        $('#tText').value = ''; $('#tDue').value = ''; $('#tText').focus();
      });
      $('#tForm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.id === 'tDue') { e.preventDefault(); $('#tForm').requestSubmit(); }
        if (e.key === 'Escape') { openForm(false); document.activeElement.blur(); }
      });
      $('#tList').addEventListener('click', (e) => {
        const item = e.target.closest('.todo-item'); if (!item) return;
        if (e.target.closest('.ck')) toggle(item.dataset.id);
        else if (e.target.closest('.del')) del(item.dataset.id);
      });
      $('#tList').addEventListener('dblclick', (e) => {
        const tx = e.target.closest('.tx'); if (tx) edit(tx.parentElement.dataset.id, tx);
      });
      setInterval(remindTick, 15000);
      setInterval(() => { cleanup(); if (P.page === 'todo') paint(); }, 60000);
      paint();
    }
  };
})();
