'use strict';
/* Bilah menu ala macOS di mode notch: aplikasi aktif, Wi-Fi, volume, baterai, jam, dan tema warna. */
P.mods.menubar = (() => {
  let env = { dark: true };
  let net = { signal: -1, ssid: '' };
  let vol = null;
  let bat = null;

  const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const css = (c) => `rgb(${c.join(',')})`;

  /* ---------- warna ----------
     Sumber warna (barColor): auto = warna bagian atas jendela aktif, wallpaper saat di desktop; system = hitam atau putih.
     Efek (barEffect): solid = latar penuh; blur = kaca buram diwarnai sumber warna (digambar jendela terpisah);
     transparent = tanpa latar. Warna teks dipilih dari apa yang benar-benar terlihat di belakangnya. */
  // Blur hanya dipakai saat desktop terlihat; saat ada jendela aktif bilah memakai warna jendela (Padat)
  const effEffect = () => { const e = (P.S && P.S.barEffect) || 'solid'; return e === 'blur' && !env.desktop ? 'solid' : e; };
  const pct = (v, d) => Math.max(0, Math.min(100, Number(v ?? d)));
  const tintAlpha = () => pct(P.S.barBlurTint, 35) / 100;   // kepekatan warna jendela aktif
  const blurPx = () => pct(P.S.barBlur, 60) * 0.3;            // 0 sampai 30 px; 0 = transparan
  function colors() {
    const S = P.S;
    const effect = effEffect();
    const base = env.dark ? BLACK : WHITE;
    const src = S.barColor !== 'system' && env.color ? env.color : base;
    let bg = src, ref = src, clear = false, tint = null;
    if (effect === 'blur') {
      bg = null; clear = true; tint = src;
      ref = mix(env.wall || base, src, tintAlpha()); // yang terlihat: wallpaper (dikaburkan) dan diberi tinta
    } else if (effect === 'transparent') {
      bg = null; clear = true; ref = env.wall || base;
    }
    const light = lum(ref) > 0.3;
    return { bg, clear, tint, fg: light ? [22, 22, 26] : [255, 255, 255], light };
  }
  let imgUri = '', imgApplied = null, lastColors = '';
  function applyImg() {
    const want = P.S && effEffect() === 'blur' && blurPx() > 0 ? imgUri : ''; // blur 0 = transparan, wallpaper asli terlihat
    if (want === imgApplied) return;
    imgApplied = want;
    $('#barImg').style.backgroundImage = want ? `url("${want}")` : 'none';
  }
  function applyColors() {
    if (!P.S) return;
    const c = colors();
    const root = document.documentElement.style;
    const key = JSON.stringify(c) + P.S.notch + tintAlpha() + '|' + blurPx();
    if (key !== lastColors) {
      lastColors = key;
      root.setProperty('--bar-bg', c.bg ? css(c.bg) : 'transparent');
      root.setProperty('--bar-tint', c.tint ? `rgba(${c.tint.join(',')},${tintAlpha().toFixed(2)})` : 'transparent');
      root.setProperty('--bar-blur', blurPx().toFixed(1) + 'px');
      root.setProperty('--bar-fg', css(c.fg));
      root.setProperty('--bar-shadow', !c.clear ? 'none' : c.light ? '0 1px 2px rgba(255,255,255,.4)' : '0 1px 3px rgba(0,0,0,.6)');
      document.body.classList.toggle('bar-black', !!P.S.notch && !c.clear);
      document.body.classList.toggle('bar-clear', !!P.S.notch && c.clear);
      document.body.classList.toggle('bar-blur', !!P.S.notch && !!c.tint);
    }
    applyImg();
  }

  /* ---------- ikon ---------- */
  function wifiIcon() {
    if (!navigator.onLine) {
      return '<svg viewBox="0 0 24 24"><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0" class="dim"/><path d="m4 4 16 16"/></svg>';
    }
    if (net.signal < 0) { // kabel atau tidak diketahui
      return '<svg viewBox="0 0 24 24"><rect x="4" y="13.5" width="16" height="6" rx="1.5"/><path d="M8 13.5V9.5h8v4M12 9.5V4.5"/><path d="M8 16.5h.01M11 16.5h.01" /></svg>';
    }
    const lv = net.signal >= 75 ? 3 : net.signal >= 45 ? 2 : net.signal >= 15 ? 1 : 0;
    const c = (n) => (lv >= n ? '' : ' class="dim"');
    return `<svg viewBox="0 0 24 24"><path d="M2.5 9a14 14 0 0 1 19 0"${c(3)}/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"${c(2)}/><path d="M8.8 16a5 5 0 0 1 6.4 0"${c(1)}/><circle cx="12" cy="19.2" r="1.3" class="f"/></svg>`;
  }
  function volIcon() {
    if (!vol || vol.vol < 0) return '';
    const v = vol.mute ? 0 : vol.vol;
    const w1 = v > 0 ? '' : ' class="dim"', w2 = v > 33 ? '' : ' class="dim"', w3 = v > 66 ? '' : ' class="dim"';
    const x = vol.mute ? '<path d="m16 9.5 5 5M21 9.5l-5 5"/>' :
      `<path d="M15.5 10a3 3 0 0 1 0 4"${w1}/><path d="M17.8 7.8a6.2 6.2 0 0 1 0 8.4"${w2}/><path d="M20 5.6a9.3 9.3 0 0 1 0 12.8"${w3}/>`;
    return `<svg viewBox="0 0 24 24"><path d="M3.5 9.5h3.5l4.5-4v13l-4.5-4H3.5z" class="f"/>${x}</svg>`;
  }
  function batIcon() {
    if (!bat) return '';
    const pct = Math.round(bat.level * 100);
    const w = Math.max(1.5, 13 * bat.level);
    const low = !bat.charging && pct <= 20;
    const fillColor = bat.charging ? '#34c759' : low ? '#ff453a' : 'currentColor';
    const bolt = bat.charging ? '<path d="M12.6 8.2 9.6 12.3h2.6l-.8 3.5 3-4.1h-2.6z" fill="#fff" stroke="#000" stroke-width=".5" stroke-linejoin="round"/>' : '';
    const pctTxt = P.S.mb && P.S.mb.batteryPct !== false ? `<span class="pct">${pct}%</span>` : '';
    return `${pctTxt}<svg viewBox="0 0 26 24" style="width:22px"><rect x="2" y="7" width="19" height="10" rx="3" style="opacity:.45"/><path d="M23 10.5v3" style="opacity:.45"/>` +
      `<rect x="4" y="9" width="${w.toFixed(1)}" height="6" rx="1.4" fill="${fillColor}" stroke="none"/>${bolt}</svg>`;
  }

  /* ---------- isi ---------- */
  const HARI_PANJANG = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const htmlCache = {};
  function setHtml(sel, h) { if (htmlCache[sel] !== h) { htmlCache[sel] = h; $(sel).innerHTML = h; } }
  function paint() {
    if (!P.S) return;
    const mb = P.S.mb || {};
    const on = (k) => mb[k] !== false;
    $('#mbApp').textContent = on('app') ? (env.app || '') : '';
    $('#mbTitle').textContent = on('title') && env.title && env.title !== env.app ? env.title : '';
    setHtml('#mbWifi', on('wifi') ? wifiIcon() : '');
    $('#mbWifi').title = net.ssid ? `${net.ssid} · sinyal ${net.signal}%` : (navigator.onLine ? 'Terhubung' : 'Tidak ada internet');
    setHtml('#mbVol', on('volume') ? volIcon() : '');
    setHtml('#mbBat', on('battery') ? batIcon() : '');
    lastClock = null; clockTick();
  }
  let lastClock = null;
  function clockTick() {
    if (!P.S) return;
    const mb = P.S.mb || {};
    const d = new Date();
    const t = mb.clock === false ? '' : `${HARI_PANJANG[d.getDay()]} ${d.getDate()} ${BLN[d.getMonth()]}  ${hhmm(d)}`;
    if (t !== lastClock) { lastClock = t; $('#mbClock').textContent = t; }
  }

  return {
    env(e) { env = e || env; applyColors(); paint(); },
    img(u) { imgUri = u || ''; applyImg(); },
    net(m) { net = { signal: Number(m.signal), ssid: m.ssid || '' }; paint(); },
    sys(m) { vol = { vol: m.vol, mute: m.mute }; paint(); },
    decorate(mode, w) {
      // celah tengah mengikuti lebar pulau saat tertutup, supaya teks bilah tidak tertutup
      const gap = (mode === 'idle' || mode === 'compact' ? w : mode === 'alert' ? Math.min(w, 420) : P.compactW) + 34;
      document.documentElement.style.setProperty('--gapw', gap + 'px');
      applyColors();
    },
    onData(k) { if (k === 'settings') { applyColors(); paint(); } },
    init() {
      $('#mbLogo').addEventListener('click', () => {
        const r = $('#mbLogo').getBoundingClientRect();
        $('#mbLogo').classList.add('on');
        setTimeout(() => $('#mbLogo').classList.remove('on'), 300);
        api.logoMenu && api.logoMenu(r.left, r.bottom + 2);
      });
      if (navigator.getBattery) {
        navigator.getBattery().then((b) => {
          // PC tanpa baterai biasanya melapor 100% mengisi dengan waktu isi 0
          const desktopPc = b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity;
          if (desktopPc) return;
          const up = () => { bat = { level: b.level, charging: b.charging }; paint(); };
          b.addEventListener('levelchange', up);
          b.addEventListener('chargingchange', up);
          up();
        }).catch(() => {});
      }
      window.addEventListener('online', paint);
      window.addEventListener('offline', paint);
      setInterval(clockTick, 1000);
      applyColors(); paint();
    }
  };
})();
