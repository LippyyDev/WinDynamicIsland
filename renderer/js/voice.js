'use strict';
/* Asisten suara: tekan shortcut, bicara, diam sebentar, Pulau menjawab dengan suara.
   Alur: listen (mikrofon + deteksi diam) -> think (transkripsi lalu percakapan) -> speak (TTS) -> selesai.
   Semua panggilan API lewat main process; di sini hanya mikrofon, pemutar audio, dan animasi. */
const V = { state: '', run: 0, history: [], lastAt: 0, spoke: false };

(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const S = () => P.S || {};
  let stream = null, rec = null, chunks = [], ctx = null, an = null, tick = 0, audio = null, url = '', holdT = 0;
  const buf = new Float32Array(1024);

  /* ---------- tampilan ---------- */
  function setState(state, title, sub) {
    V.state = state;
    island.dataset.voice = state;
    if (title != null) $('#voTitle').textContent = title;
    if (sub != null) { const el = $('#voSub'); el.textContent = sub; el.style.transform = ''; el.parentElement.classList.remove('long'); }
    if (state !== 'listen' && state !== 'speak') paint(0, true);
    render();
  }
  function paint(lv, reset) {
    island.style.setProperty('--lv', lv.toFixed(3));
    const t = performance.now() / 1000;
    $$('#voBars i').forEach((el, i) => {
      if (reset) { el.style.transform = ''; return; }
      const k = 0.35 + 0.65 * Math.abs(Math.sin(t * 7 + i * 1.7));
      el.style.transform = `scaleY(${(0.16 + Math.min(1, lv * k) * 0.84).toFixed(3)})`;
    });
  }
  // ukuran pulau saat mode suara; dipanggil dari render()
  window.voiceSize = function () {
    const fixed = 12 + 16 + 34 + 39 + 24; // padding, orb, batang, dua jarak
    const title = $('#voTitle'), sub = $('#voSub');
    const one = Math.max(textW(title, title.textContent), textW(sub, sub.textContent));
    const barH = Math.max(20, Math.min(60, Number(S().barHeight) || 32));
    if (V.state === 'speak' || V.state === 'error') {
      const w = clamp(fixed + one + 4, 300, Math.max(380, maxW()));
      const lines = clamp(Math.ceil((one * 1.08) / (w - fixed)), 1, 4);
      return { w, h: Math.max(14 + 15 + lines * 18 + 14, S().notch ? barH : 0) };
    }
    return { w: clamp(fixed + one + 4, 300, maxW()), h: Math.max(60, S().notch ? barH : 0) };
  };

  /* ---------- suara pendek penanda ---------- */
  function ac() { ctx = ctx || new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function beep(kind) {
    try {
      const c = ac();
      const f = kind === 'on' ? [660, 990] : kind === 'off' ? [880, 620] : [440, 330];
      f.forEach((hz, i) => {
        const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.09;
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25);
      });
    } catch (_) {}
  }
  function rms() {
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  /* ---------- bersih-bersih ---------- */
  function cleanup() {
    clearInterval(tick); clearTimeout(holdT);
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (_) {}
    rec = null;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
    if (url) { URL.revokeObjectURL(url); url = ''; }
    an = null;
  }
  function close() {
    V.run++;
    cleanup();
    api.aiCancel();
    if (V.state) { V.state = ''; island.dataset.voice = ''; paint(0, true); P.lastActive = Date.now(); render(); }
  }
  function fail(title, msg, id) {
    if (id !== V.run) return;
    cleanup();
    logA('WARN', 'asisten', title + (msg ? ': ' + msg : ''));
    beep('err');
    setState('error', title, msg || '');
    holdT = setTimeout(() => { if (id === V.run) close(); }, 4500);
  }

  /* ---------- mendengar ---------- */
  async function listen() {
    close();
    const id = V.run;
    if (!S().aiEnabled) { notify({ id: 'voice', icon: G.mic, title: 'Asisten suara mati', sub: 'Nyalakan di Pengaturan > Asisten Suara', dur: 3500 }); return; }
    if (!(await api.aiKeyHas())) { notify({ id: 'voice', icon: G.mic, title: 'Kunci API belum disimpan', sub: 'Buka Pengaturan > Asisten Suara', dur: 3500 }); return; }
    if (id !== V.run) return;
    if (Date.now() - V.lastAt > 5 * 60 * 1000) V.history = []; // percakapan lama dilupakan setelah 5 menit
    P.hover = false;
    V.spoke = false;
    setState('listen', 'Mendengarkan', 'Silakan bicara…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      return fail('Mikrofon tidak bisa dipakai', e && e.name === 'NotAllowedError'
        ? 'Izinkan aplikasi desktop memakai mikrofon di Pengaturan Windows > Privasi > Mikrofon.'
        : 'Tidak ada mikrofon yang terdeteksi.', id);
    }
    if (id !== V.run) { for (const t of stream.getTracks()) t.stop(); stream = null; return; }
    const c = ac();
    an = c.createAnalyser(); an.fftSize = 1024;
    c.createMediaStreamSource(stream).connect(an);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250);
    beep('on');
    logA('INFO', 'asisten', 'Mulai mendengar');

    const t0 = performance.now();
    const silence = clamp(Number(S().aiSilence) || 1.5, 0.6, 5) * 1000;
    let floor = 0.004, voiced = 0, lastVoice = t0, smooth = 0;
    tick = setInterval(() => {
      if (id !== V.run || !an) return;
      const now = performance.now(), r = rms();
      const thr = Math.max(0.012, floor * 3);
      if (r > thr) { voiced += 50; lastVoice = now; }
      else floor = floor * 0.96 + r * 0.04; // lantai derau menyesuaikan ruangan
      if (!V.spoke && voiced >= 200) { V.spoke = true; $('#voSub').textContent = 'Mendengar…'; }
      smooth = Math.max(r, smooth * 0.82);
      paint(Math.min(1, smooth * 9));
      if (V.spoke && now - lastVoice > silence) finish(id);
      else if (!V.spoke && now - t0 > 8000) fail('Tidak terdengar suara', 'Tekan shortcut lalu bicara.', id);
      else if (now - t0 > 60000) finish(id);
    }, 50);
  }
  function stopRec() {
    return new Promise((res) => {
      if (!rec || rec.state === 'inactive') return res(new Blob(chunks));
      const type = rec.mimeType;
      rec.onstop = () => res(new Blob(chunks, { type }));
      try { rec.stop(); } catch (_) { res(new Blob(chunks, { type })); }
    });
  }

  /* ---------- transkripsi, percakapan, ucapan ---------- */
  async function finish(id) {
    if (id !== V.run || V.state !== 'listen') return;
    clearInterval(tick);
    const blob = await stopRec();
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    if (id !== V.run) return;
    beep('off');
    setState('think', 'Menyalin ucapan', '…');
    if (blob.size < 1500) return fail('Suara terlalu pendek', 'Coba lagi dan bicara sedikit lebih lama.', id);

    const t = await api.aiTranscribe(new Uint8Array(await blob.arrayBuffer()), blob.type || 'audio/webm');
    if (id !== V.run) return;
    if (!t.ok) return fail('Gagal menyalin ucapan', t.error, id);
    const said = String(t.value || '').trim();
    if (!said) return fail('Tidak ada kata yang terdengar', 'Coba bicara lebih dekat ke mikrofon.', id);

    V.history.push({ role: 'user', content: said });
    setState('think', 'Berpikir', '“' + said + '”');
    const c = await api.aiChat(V.history);
    if (id !== V.run) return;
    if (!c.ok) { V.history.pop(); return fail('AI tidak menjawab', c.error, id); }
    const answer = String(c.value || '').trim() || 'Maaf, saya tidak punya jawaban untuk itu.';
    V.history.push({ role: 'assistant', content: answer });
    V.history = V.history.slice(-12);
    V.lastAt = Date.now();
    logA('INFO', 'asisten', `Tanya: ${said.slice(0, 80)} | Jawab: ${answer.slice(0, 80)}`);

    $('#voTitle').textContent = 'Menyiapkan suara';
    render();
    const sp = await api.aiSpeech(answer);
    if (id !== V.run) return;
    setState('speak', 'Pulau', answer);
    if (!sp.ok) {
      $('#voTitle').textContent = 'Pulau (suara gagal)';
      logA('WARN', 'asisten', 'Suara gagal: ' + sp.error);
      await new Promise((r) => { holdT = setTimeout(r, clamp(answer.length * 65, 3500, 16000)); });
    } else {
      await play(sp.value, id);
    }
    if (id !== V.run) return;
    if (S().aiFollow) { listen(); return; }
    holdT = setTimeout(() => { if (id === V.run) close(); }, 1400);
  }

  function play(bytes, id) {
    return new Promise((res) => {
      url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      audio = new Audio(url);
      const c = ac();
      an = c.createAnalyser(); an.fftSize = 1024;
      c.createMediaElementSource(audio).connect(an);
      an.connect(c.destination);
      let smooth = 0, ended = false;
      const end = () => { if (ended) return; ended = true; clearInterval(tick); paint(0, true); res(); };
      audio.onended = end;
      audio.onerror = end;
      audio.play().catch(end);
      const sub = $('#voSub'), box = sub.parentElement;
      tick = setInterval(() => {
        if (id !== V.run || !an) return end();
        smooth = Math.max(rms(), smooth * 0.8);
        paint(Math.min(1, smooth * 8));
        // teks panjang bergulir pelan mengikuti jalannya suara
        const over = sub.scrollHeight - box.clientHeight;
        box.classList.toggle('long', over > 2);
        if (over > 2 && audio && audio.duration > 0) {
          const f = clamp((audio.currentTime / audio.duration - 0.12) / 0.76, 0, 1);
          sub.style.transform = `translateY(${(-over * f).toFixed(1)}px)`;
        }
      }, 50);
    });
  }

  /* ---------- pemicu ---------- */
  function toggle() {
    if (!V.state || V.state === 'error') listen();
    else if (V.state === 'listen') { if (V.spoke) finish(V.run); else close(); }
    else close(); // berpikir atau berbicara: tekan lagi untuk berhenti
  }
  V.toggle = toggle;
  V.close = close;
  api.onVoice(toggle);
  if (api.onVoiceKeyFail) api.onVoiceKeyFail((k) => notify({ id: 'voice', icon: G.mic, title: 'Shortcut dipakai aplikasi lain', sub: k.replace('Control', 'Ctrl') + '. Pilih yang lain di Pengaturan.', dur: 5000 }));
  $('#voView').addEventListener('click', toggle);
  $('#bMic').addEventListener('click', (e) => { e.stopPropagation(); P.hover = false; toggle(); });
})();
