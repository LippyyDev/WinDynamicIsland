'use strict';
(async () => {
  for (const k of ['settings', 'todos', 'water', 'shelf', 'pomo']) P.data[k] = await api.get(k);
  for (const m of Object.values(P.mods)) m.init && m.init();

  api.onMedia((m) => (m.type === 'sys' ? P.mods.system.sys(m) : P.mods.music.media(m)));
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
