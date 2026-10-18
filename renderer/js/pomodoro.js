'use strict';
/* Pomodoro: fokus, istirahat pendek, istirahat panjang. State disimpan lokal. */
P.mods.pomodoro = (() => {
  const C = 263.9;
  const LABEL = { focus: 'Waktu fokus', short: 'Istirahat pendek', long: 'Istirahat panjang' };
  const ps = () => P.data.pomo;
  const dur = (ph) => Math.max(1, Number(P.S.pomo[ph]) || 1) * 60;
  const remaining = () => {
    const s = ps();
    if (s.running) return Math.max(0, (s.endAt - Date.now()) / 1000);
    return s.remaining > 0 ? s.remaining : dur(s.phase);
  };

  function label() {
    const s = ps();
    if (s.phase === 'focus') return `${LABEL.focus} · sesi ${(s.count % P.S.pomo.every) + 1} dari ${P.S.pomo.every}`;
    return LABEL[s.phase];
  }
  function start() { logA('INFO', 'pomodoro', `Mulai ${ps().phase}, sisa ${fmt(remaining())}`); const s = ps(); s.endAt = Date.now() + remaining() * 1000; s.running = true; save('pomo'); paint(); render(); }
  function pause() { logA('INFO', 'pomodoro', `Jeda, sisa ${fmt(remaining())}`); const s = ps(); s.remaining = remaining(); s.running = false; save('pomo'); paint(); render(); }
  function reset() { logA('INFO', 'pomodoro', 'Ulang'); const s = ps(); s.running = false; s.remaining = dur(s.phase); save('pomo'); paint(); render(); }
  function setPhase(ph) { logA('INFO', 'pomodoro', 'Ganti fase ke ' + ph); const s = ps(); s.phase = ph; s.running = false; s.remaining = dur(ph); save('pomo'); paint(); render(); }

  function finish() {
    const s = ps();
    logA('INFO', 'pomodoro', 'Fase selesai: ' + s.phase);
    let next;
    if (s.phase === 'focus') {
      s.count++;
      next = s.count % P.S.pomo.every === 0 ? 'long' : 'short';
      notify({ title: 'Fokus selesai', sub: next === 'long' ? 'Saatnya istirahat panjang' : 'Saatnya istirahat sebentar',
        icon: ringIcon(1, 'var(--green)', G.check), page: 'pomodoro', sound: P.S.pomo.sound ? 'done' : '', dur: 6000, w: 360 });
    } else {
      next = 'focus';
      notify({ title: 'Istirahat selesai', sub: 'Ayo kembali fokus',
        icon: ringIcon(1, 'var(--red)', G.timer), page: 'pomodoro', sound: P.S.pomo.sound ? 'done' : '', dur: 6000, w: 340 });
    }
    s.phase = next;
    s.remaining = dur(next);
    s.running = !!P.S.pomo.autoNext;
    if (s.running) s.endAt = Date.now() + s.remaining * 1000;
    save('pomo'); paint(); render();
  }

  function paint() {
    const s = ps(), rem = remaining();
    $('#pTime').textContent = fmt(rem);
    $('#pLabel').textContent = label();
    $('#pRing').style.strokeDashoffset = (C * (1 - rem / dur(s.phase))).toFixed(1);
    island.dataset.phase = s.phase;
    island.classList.toggle('pomo-run', !!s.running);
    $$('.page[data-page="pomodoro"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.phase === s.phase || (s.phase === 'long' && c.dataset.phase === 'short')));
  }

  return {
    title: 'Pomodoro',
    width: () => 560,
    label,
    compactTimer() {
      const s = ps();
      return s.running ? `<span class="c-timer">${fmt(remaining())}</span>` : null;
    },
    decorate() { paint(); },
    onData(k) { if (k === 'pomo' || k === 'settings') paint(); },
    init() {
      $('#pPlay').onclick = () => (ps().running ? pause() : start());
      $('#pReset').onclick = reset;
      $('#pSkip').onclick = () => { ps().running = false; finish(); };
      $$('.page[data-page="pomodoro"] .chip').forEach((c) => (c.onclick = () => setPhase(c.dataset.phase)));
      setInterval(() => {
        const s = ps();
        if (!s.running) return;
        if (remaining() <= 0) finish();
        else { paint(); if (island.dataset.mode === 'compact') buildCompact(); }
      }, 1000);
      paint();
    }
  };
})();
