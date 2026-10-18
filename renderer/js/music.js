'use strict';
/* Halaman musik: data dari kontrol media Windows + lirik LRCLIB. */
P.mods.music = (() => {
  const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#3a3a44"/><stop offset="1" stop-color="#1c1c22"/></linearGradient></defs>' +
    '<rect width="64" height="64" fill="url(#g)"/><path d="M27 19v20.5a6.5 6.5 0 1 0 4 6V27h11v-8z" fill="#8a8a96"/></svg>');

  let st = { none: true };
  let base = { pos: 0, t: performance.now() };
  let art = null, accentFromArt = null;
  let lyr = [], lyrMsg = '', lyrKey = '', curIdx = -2;

  const hasTrack = () => !st.none;
  const playing = () => !st.none && st.status === 'Playing';
  const nowPos = () => {
    if (st.none) return 0;
    const p = base.pos + (st.status === 'Playing' ? (performance.now() - base.t) / 1000 : 0);
    return st.dur > 0 ? Math.min(p, st.dur) : p;
  };

  /* ---------- sampul & warna ---------- */
  function setArt(src) {
    art = src || null;
    $('#mArt').src = art || FALLBACK;
    if (!art) { accentFromArt = null; applyAccent(); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const sat = mx ? (mx - mn) / mx : 0;
        const wt = sat * sat * (mx / 255) + 0.02;
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      const mx = Math.max(r / w, g / w, b / w, 1), k = Math.max(1, 210 / mx);
      accentFromArt = [r / w, g / w, b / w].map((v) => Math.round(Math.min(255, v * k)));
      applyAccent();
    };
    img.src = art;
    render();
  }
  function applyAccent() {
    const rgb = accentFromArt || [255, 90, 130];
    document.documentElement.style.setProperty('--accent', rgb.join(','));
  }

  /* ---------- lirik ---------- */
  function parseLrc(text) {
    const out = [];
    for (const line of (text || '').split('\n')) {
      const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const words = line.replace(/\[[^\]]*\]/g, '').trim();
      for (const t of tags) out.push({ t: +t[1] * 60 + +t[2], text: words || '♪' });
    }
    return out.sort((a, b) => a.t - b.t);
  }
  const getJSON = async (url) => { const r = await fetch(url); return r.ok ? r.json() : null; };
  function cleanTitle(t) {
    return t.replace(/\s*[\(\[](official|lyric|lirik|audio|video|mv|visualizer|hd|4k)[^\)\]]*[\)\]]/gi, '')
      .trim();
  }
  async function loadLyrics(m) {
    const key = lyrKey;
    lyr = []; lyrMsg = 'Memuat lirik…'; curIdx = -2; drawLyrics();
    try {
      let d = null;
      if (m.artist) {
        const q = { track_name: m.title, artist_name: m.artist };
        if (m.album) q.album_name = m.album;
        if (m.dur > 0) q.duration = Math.round(m.dur);
        d = await getJSON('https://lrclib.net/api/get?' + new URLSearchParams(q)).catch(() => null);
      }
      if (!d || !d.syncedLyrics) {
        const qs = [`${cleanTitle(m.title)} ${m.artist || ''}`.trim(), cleanTitle(m.title)];
        for (const q of qs) {
          const arr = await getJSON('https://lrclib.net/api/search?' + new URLSearchParams({ q })).catch(() => null) || [];
          const near = arr.filter((x) => x.syncedLyrics && (!m.dur || Math.abs((x.duration || 0) - m.dur) < 8));
          d = near[0] || arr.find((x) => x.syncedLyrics) || null;
          if (d) break;
        }
      }
      if (key !== lyrKey) return;
      lyr = d ? parseLrc(d.syncedLyrics) : [];
      lyrMsg = lyr.length ? '' : 'Lirik tidak tersedia';
    } catch (_) {
      if (key !== lyrKey) return;
      lyrMsg = 'Lirik tidak tersedia';
    }
    curIdx = -2; drawLyrics();
  }
  function drawLyrics() {
    const box = $('#lyrInner');
    box.innerHTML = '';
    if (!lyr.length) {
      box.innerHTML = `<p class="msg">${esc(lyrMsg)}</p>`;
      box.style.transform = 'translateY(-50%)';
      return;
    }
    const frag = document.createDocumentFragment();
    lyr.forEach((l) => {
      const p = document.createElement('p');
      p.textContent = l.text;
      p.onclick = () => seek(l.t + 0.05);
      frag.appendChild(p);
    });
    box.appendChild(frag);
  }
  function lyricIndex(pos) {
    let lo = 0, hi = lyr.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyr[mid].t <= pos + 0.3) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function updateLyric(pos) {
    const idx = lyr.length ? lyricIndex(pos) : -1;
    if (idx === curIdx) return;
    curIdx = idx;
    const ps = $('#lyrInner').children;
    for (let i = 0; i < ps.length; i++) ps[i].classList.toggle('cur', i === idx);
    if (lyr.length && island.classList.contains('lyr-on')) {
      const el = ps[Math.max(idx, 0)];
      $('#lyrInner').style.transform = `translateY(${-(el.offsetTop + el.offsetHeight / 2)}px)`;
    }
    if (island.dataset.mode === 'compact') render();
  }
  function compactLine() {
    if (st.none) return '';
    if (P.S.lyrics && P.S.lyricsCompact && curIdx >= 0 && lyr[curIdx] && lyr[curIdx].text !== '♪' && playing()) return lyr[curIdx].text;
    return st.artist ? `${st.title}  ·  ${st.artist}` : st.title;
  }

  /* ---------- media ---------- */
  function prettyApp(id) {
    id = (id || '').toLowerCase();
    const map = [['spotify', 'Spotify'], ['chrome', 'Chrome'], ['msedge', 'Edge'], ['firefox', 'Firefox'], ['opera', 'Opera'], ['brave', 'Brave'],
      ['zunemusic', 'Media Player'], ['microsoft.media', 'Media Player'], ['applemusic', 'Apple Music'], ['itunes', 'iTunes'], ['vlc', 'VLC'], ['youtube', 'YouTube']];
    for (const [k, v] of map) if (id.includes(k)) return v;
    return '';
  }
  function media(m) {
    if (m.type === 'track') { setArt(m.thumb); return; }
    if (m.type !== 'state') return;
    const prevStatus = st.status;
    const key = m.none ? '' : `${m.title}|${m.artist}`;
    const predicted = nowPos();
    st = m;
    if (m.none || prevStatus !== m.status || Math.abs(predicted - m.pos) > 1.5 || key !== lyrKey) {
      base = { pos: m.pos || 0, t: performance.now() };
    }
    if (key !== lyrKey) {
      lyrKey = key; curIdx = -2;
      if (!m.none) loadLyrics(m); else { lyr = []; lyrMsg = ''; drawLyrics(); setArt(null); }
    }
    if (playing()) P.lastActive = Date.now();
    $('#mTitle').textContent = m.none ? 'Tidak ada yang diputar' : m.title;
    $('#mArtist').textContent = m.none ? 'Putar musik di Spotify, YouTube, atau pemutar lain' : [m.artist, m.album && m.album !== m.title ? m.album : ''].filter(Boolean).join(' · ');
    $('#mApp').textContent = m.none ? '' : prettyApp(m.app);
    render();
  }
  function seek(sec) {
    if (st.none) return;
    base = { pos: sec, t: performance.now() };
    curIdx = -2;
    api.cmd('seek ' + sec.toFixed(2));
  }

  function tick() {
    if (st.none) return;
    const pos = nowPos();
    const pct = st.dur > 0 ? (pos / st.dur) * 100 : 0;
    $('#fill').style.width = pct + '%';
    $('#knob').style.left = pct + '%';
    $('#tCur').textContent = fmt(pos);
    $('#tRem').textContent = '-' + fmt((st.dur || 0) - pos);
    updateLyric(pos);
  }

  return {
    title: '',
    hasTrack, playing,
    width: () => (P.S.lyrics && hasTrack() ? 800 : 560),
    compact() {
      if (st.none) return null;
      return { left: `<img class="art" src="${art || FALLBACK}">`, line: compactLine() };
    },
    media,
    decorate(mode) {
      island.classList.toggle('playing', playing());
      island.classList.toggle('has-track', hasTrack());
      island.classList.toggle('no-track', !hasTrack());
      const lyrOn = P.S.lyrics && hasTrack();
      if (lyrOn !== island.classList.contains('lyr-on')) { island.classList.toggle('lyr-on', lyrOn); curIdx = -2; }
      island.dataset.tint = mode === 'expanded' && P.page === 'music' && P.S.artColor && hasTrack() ? '1' : '0';
      $('#bLyr').classList.toggle('on', !!P.S.lyrics);
    },
    onShow() { curIdx = -2; tick(); },
    init() {
      $('#mArt').src = FALLBACK;
      $('#bPlay').onclick = () => {
        if (st.none) return;
        base = { pos: nowPos(), t: performance.now() };
        st.status = st.status === 'Playing' ? 'Paused' : 'Playing';
        render(); api.cmd('toggle');
      };
      $('#bNext').onclick = () => api.cmd('next');
      $('#bPrev').onclick = () => api.cmd('prev');
      $('#bLyr').onclick = () => { P.S.lyrics = !P.S.lyrics; save('settings'); curIdx = -2; render(); };
      $('#track').addEventListener('click', (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (st.dur > 0) seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * st.dur);
      });
      drawLyrics();
      setInterval(tick, 250);
    }
  };
})();
