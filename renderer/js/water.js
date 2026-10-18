'use strict';
/* Pengingat minum: catatan per jam, target harian, pengingat berkala. */
P.mods.water = (() => {
  const W = () => P.data.water;
  const cfg = () => P.S.water;
  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  const startedAt = Date.now();

  const today = () => (W().log[dayKey()] ||= {});
  const total = () => Object.values(W().log[dayKey()] || {}).reduce((a, b) => a + b, 0);

  function prune() {
    const keep = new Date(); keep.setDate(keep.getDate() - 30);
    const k = dayKey(keep);
    for (const d of Object.keys(W().log)) if (d < k) delete W().log[d];
  }
  function drink() {
    const before = total();
    const h = new Date().getHours();
    const t = today();
    t[h] = (t[h] || 0) + Number(cfg().cup);
    W().lastDrink = Date.now();
    (W().undo ||= []).push({ d: dayKey(), h, ml: Number(cfg().cup) });
    W().undo = W().undo.slice(-20);
    prune(); save('water'); paint();
    const g = Number(cfg().goal);
    if (before < g && total() >= g) {
      notify({ title: 'Target minum tercapai', sub: `${nf.format(total() / 1000)} L hari ini, mantap`, icon: ringIcon(1, 'var(--blue)', G.check), page: 'water', sound: 'done', w: 360 });
    }
  }
  function undo() {
    const u = (W().undo || []).pop();
    if (!u || !W().log[u.d]) return;
    W().log[u.d][u.h] = Math.max(0, (W().log[u.d][u.h] || 0) - u.ml);
    save('water'); paint();
  }

  function paint() {
    const t = total(), g = Number(cfg().goal) || 2000;
    const pct = Math.min(100, Math.round((t / g) * 100));
    $('#wNow').textContent = nf.format(t / 1000);
    $('#wGoal').textContent = `/ ${nf.format(g / 1000)} L`;
    $('#wSub').innerHTML = `Hari ini · <b>${pct}%</b>${pct >= 100 ? ' · Target tercapai' : ''}`;
    $('#wFill').style.width = pct + '%';
    $('#wDrinkTxt').textContent = `Minum ${cfg().cup} ml`;
    $('#wRemind').classList.toggle('on', !!cfg().remind);

    // grafik 8 jam terakhir
    const now = new Date().getHours();
    const from = Math.max(0, now - 7);
    const log = W().log[dayKey()] || {};
    const hrs = Array.from({ length: 8 }, (_, i) => from + i).filter((h) => h <= 23);
    const max = Math.max(Number(cfg().cup) * 2, ...hrs.map((h) => log[h] || 0));
    $('#wChart').innerHTML =
      `<div class="w-cols">${hrs.map((h) => `<div class="w-col${h === now ? ' now' : ''}" title="${pad2(h)}:00 · ${log[h] || 0} ml">` +
        `<div class="bar"><i style="height:${((log[h] || 0) / max) * 100}%"></i></div><span>${h % 3 === 0 || h === now ? pad2(h) : ''}</span></div>`).join('')}</div>` +
      `<div class="w-axis"><span>${max}</span><span>${Math.round(max / 2)}</span><span>0 ml</span></div>`;
  }

  function remindTick() {
    const c = cfg();
    if (!c.remind) return;
    const d = new Date(), h = d.getHours();
    if (h < c.start || h >= c.end) return;
    if (total() >= c.goal) return;
    const last = Math.max(W().lastDrink || 0, W().lastRemind || 0, startedAt);
    if (Date.now() - last < c.interval * 60000) return;
    W().lastRemind = Date.now(); save('water');
    notify({ title: 'Waktunya minum', sub: `${nf.format(total() / 1000)} dari ${nf.format(c.goal / 1000)} L hari ini`,
      icon: ringIcon(total() / c.goal, 'var(--blue)', G.drop), page: 'water', sound: 'soft', dur: 7000, w: 360 });
  }

  return {
    title: 'Pengingat <em>Minum</em>',
    width: () => 620,
    onShow: paint,
    onData(k) { if (k === 'water' || k === 'settings') paint(); },
    init() {
      $('#wDrink').onclick = drink;
      $('#wUndo').onclick = undo;
      $('#wRemind').onclick = () => { cfg().remind = !cfg().remind; save('settings'); paint(); };
      setInterval(remindTick, 30000);
      setInterval(() => { if (P.page === 'water' && island.dataset.mode === 'expanded') paint(); }, 60000);
      paint();
    }
  };
})();
