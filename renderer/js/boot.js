'use strict';
(async () => {
  for (const k of ['settings', 'todos', 'water', 'shelf', 'pomo']) P.data[k] = await api.get(k);
  for (const m of Object.values(P.mods)) m.init && m.init();

  api.onMedia((m) => {
    if (m.type === 'sys') { P.mods.system.sys(m); P.mods.menubar.sys(m); }
    else if (m.type === 'net') P.mods.menubar.net(m);
    else P.mods.music.media(m);
  });
  // status agen AI muncul sebagai notifikasi yang diperbarui di tempat
  if (api.onAgent) api.onAgent((a) => {
    const color = { thinking: 'var(--blue)', acting: 'var(--blue)', waiting: 'var(--amber)', done: 'var(--green)', error: 'var(--red)' }[a.phase];
    if (!color) return;
    notify({ id: 'agent', title: a.title || 'Agen AI', sub: a.sub || '', icon: ringIcon(a.phase === 'done' || a.phase === 'error' ? 1 : 0.35, color, G.bot), sound: a.phase === 'waiting' ? 'soft' : a.phase === 'done' ? 'done' : undefined, dur: a.phase === 'waiting' ? 20000 : a.phase === 'thinking' || a.phase === 'acting' ? 9000 : 5000, w: 380 });
  });
  if (api.onEnv) api.onEnv((e) => P.mods.menubar.env(e));
  if (api.onBarImg) api.onBarImg((u) => P.mods.menubar.img(u));
  if (api.barImg) api.barImg().then((u) => P.mods.menubar.img(u)).catch(() => {});
  api.onStore((k, v) => {
    P.data[k] = v;
    for (const m of Object.values(P.mods)) m.onData && m.onData(k);
    render();
  });

  clock();
  setInterval(clock, 1000);
  setInterval(eyesTick, 1000);
  render();
  sendRect();
})();
