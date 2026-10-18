'use strict';
/* Notifikasi sistem: pengisian daya, baterai lemah, perangkat audio, Caps Lock, volume. */
P.mods.system = (() => {
  let sysBase = null, lowWarned = false;
  const N = () => P.S.notify;

  /* ---------- baterai ---------- */
  function battery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then((b) => {
      const pct = () => Math.round(b.level * 100);
      const paint = () => {
        $('#batVal').style.strokeDashoffset = (47.12 * (1 - b.level)).toFixed(2);
        $('#bat').classList.toggle('low', b.level <= 0.2 && !b.charging);
        $('#bat').title = `Baterai ${pct()}%${b.charging ? ' · mengisi' : ''}`;
      };
      const lowCheck = () => {
        if (b.charging || pct() > N().lowAt + 3) { lowWarned = false; return; }
        if (!lowWarned && N().lowBattery && pct() <= N().lowAt) {
          lowWarned = true;
          notify({ id: 'bat', title: 'Baterai lemah', sub: 'Sambungkan pengisi daya', icon: ringIcon(b.level, 'var(--red)', G.battery), right: `${pct()}%`, sound: 'soft', dur: 6000, w: 360 });
        }
      };
      paint();
      b.addEventListener('levelchange', () => { paint(); lowCheck(); });
      b.addEventListener('chargingchange', () => {
        paint(); lowCheck();
        if (!N().charging) return;
        notify({ id: 'charge', title: b.charging ? 'Mengisi daya' : 'Pengisi daya dilepas', sub: b.charging ? 'Pengisi daya tersambung' : 'Sekarang memakai baterai',
          icon: ringIcon(b.level, b.charging ? 'var(--green)' : '#fff', G.bolt), right: `${pct()}%`, dur: 3200, w: 380 });
      });
    }).catch(() => {});
  }

  /* ---------- perangkat audio (headphone, speaker bluetooth) ---------- */
  let devs = null;
  function cleanLabel(l) {
    if (!l) return 'Perangkat audio';
    const m = l.match(/\(([^)]+)\)\s*$/);
    let n = m ? m[1] : l;
    n = n.replace(/^\d+\s*-\s*/, '').replace(/\s+(stereo|hands-free.*|headset)$/i, '').trim();
    return n || l;
  }
  async function scanDevices(first) {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const now = new Map(list.map((d) => [d.deviceId, d.label]));
      if (!first && devs && N().headphones) {
        for (const [id, label] of now) if (!devs.has(id)) announce(label, true);
        for (const [id, label] of devs) if (!now.has(id)) announce(label, false);
      }
      devs = now;
    } catch (_) {}
  }
  function announce(label, on) {
    const name = cleanLabel(label);
    const isHead = /head|bud|pod|ear|bluetooth|hands|wh-|wf-|jbl|sony|airdots|tws/i.test(label || '');
    notify({ id: 'dev', title: name, sub: on ? 'Terhubung' : 'Terputus',
      icon: ringIcon(on ? 1 : 0, 'var(--blue)', isHead ? G.headphones : G.speaker),
      right: `<span style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(77,163,255,${on ? '.18' : '.06'});box-shadow:0 0 0 1.5px rgba(77,163,255,${on ? '.6' : '.2'})">${isHead ? G.headphones : G.speaker}</span>`,
      dur: 3200, w: 400 });
  }

  /* ---------- Caps Lock & volume dari PowerShell ---------- */
  function sys(m) {
    if (!sysBase) { sysBase = m; return; }
    if (m.caps !== sysBase.caps && N().caps) {
      notify({ id: 'caps', title: m.caps ? 'Caps Lock aktif' : 'Caps Lock mati', icon: ringIcon(m.caps ? 1 : 0, 'var(--amber)', G.caps), dur: 1400, w: 230, h: 44 });
    }
    if (m.vol >= 0 && (m.vol !== sysBase.vol || m.mute !== sysBase.mute) && N().volume) {
      const v = m.mute ? 0 : m.vol;
      notify({ id: 'vol', title: m.mute ? 'Senyap' : `Volume ${m.vol}%`, icon: (m.mute ? G.mute : G.speaker),
        right: `<div class="vbar"><i style="width:${v}%"></i></div>`, dur: 1500, w: 320, h: 46 });
    }
    sysBase = m;
  }

  return {
    sys,
    init() {
      battery();
      if (navigator.mediaDevices) {
        scanDevices(true);
        navigator.mediaDevices.addEventListener('devicechange', () => setTimeout(() => scanDevices(false), 400));
      }
    }
  };
})();
