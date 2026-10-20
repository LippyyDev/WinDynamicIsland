'use strict';
// Asisten suara: jembatan ke API kompatibel OpenAI (misalnya Aivene).
// Hanya tiga hal: ucapan ke teks, percakapan, teks ke ucapan. Tidak ada kendali komputer.
// Semua panggilan jaringan ada di main process supaya kunci API tidak pernah sampai ke antarmuka.
const { safeStorage } = require('electron');

const DEF_BASE = 'https://api.aivene.com/v1';
const FALLBACK = {
  chat: ['gpt-4o-mini', 'gpt-4o', 'gemini-2.5-flash', 'claude-sonnet-4'],
  stt: ['whisper-1'],
  tts: ['tts-1', 'tts-1-hd']
};
const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

const RE_STT = /whisper|transcri|speech-to-text|\bstt\b|asr/i;
const RE_TTS = /(^|[-_/])tts|text-to-speech|speech(?!-to-text)/i;
const RE_NOT_CHAT = /embed|whisper|transcri|tts|speech|dall-?e|image|imagen|sora|veo|video|moderation|rerank|flux|stable-diffusion|midjourney|kling|seedance/i;

// Menebak jenis model dari metadata bila ada, lalu dari ID-nya.
function kindOf(m) {
  const meta = [m.type, m.category, m.modality, m.task, m.object === 'model' ? '' : m.object,
    ...(m.architecture && Array.isArray(m.architecture.output_modalities) ? m.architecture.output_modalities : [])]
    .filter(Boolean).join(' ').toLowerCase();
  const id = String(m.id || '');
  if (/transcri|speech[-_ ]?to[-_ ]?text|stt|asr/.test(meta) || RE_STT.test(id)) return 'stt';
  if (/text[-_ ]?to[-_ ]?speech|tts|\bspeech\b/.test(meta) || RE_TTS.test(id)) return 'tts';
  if (/embed|image|video|rerank|moderation/.test(meta) || RE_NOT_CHAT.test(id)) return 'other';
  return 'chat';
}

function friendly(status, body) {
  let msg = '';
  try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (_) { msg = String(body || '').slice(0, 160); }
  if (status === 401 || status === 403) return 'Kunci API ditolak. Periksa kunci di Pengaturan > Asisten Suara.';
  if (status === 402) return 'Kredit Aivene habis atau batas pengeluaran kunci tercapai.';
  if (status === 404) return 'Model atau alamat API tidak ditemukan' + (msg ? ': ' + msg : '.');
  if (status === 429) return 'Terlalu banyak permintaan. Coba lagi sebentar lagi.';
  if (status >= 500) return 'Server AI sedang bermasalah (' + status + ').';
  return msg || 'Permintaan gagal (' + status + ').';
}

class AI {
  constructor({ store, log }) { this.store = store; this.log = log; this.ctl = new Set(); }

  S() { return this.store.get('settings') || {}; }
  base() { return String(this.S().aiBase || DEF_BASE).trim().replace(/\/+$/, '') || DEF_BASE; }

  /* ---------- kunci ---------- */
  key() {
    const raw = this.store.get('aiKey');
    if (!raw) return '';
    try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(raw, 'base64')) : ''; } catch (_) { return ''; }
  }
  hasKey() { return !!this.key(); }
  setKey(k) {
    k = String(k || '').trim();
    if (k.length < 8 || /\s/.test(k)) return { ok: false, error: 'Format kunci tidak valid.' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Enkripsi Windows tidak tersedia, kunci tidak bisa disimpan aman.' };
    this.store.set('aiKey', safeStorage.encryptString(k).toString('base64'));
    this.store.flush();
    this.log.info('asisten', 'Kunci API disimpan');
    return { ok: true };
  }
  clearKey() { this.store.set('aiKey', ''); this.store.flush(); this.log.info('asisten', 'Kunci API dihapus'); }

  /* ---------- HTTP ---------- */
  async req(pathName, init = {}, timeoutMs = 45000) {
    const key = this.key();
    if (!key) throw new Error('Kunci API belum disimpan. Buka Pengaturan > Asisten Suara.');
    const ctl = new AbortController();
    this.ctl.add(ctl);
    const t = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
    try {
      const r = await fetch(this.base() + pathName, {
        ...init, signal: ctl.signal,
        headers: { Authorization: 'Bearer ' + key, 'X-Title': 'Pulau', ...(init.headers || {}) }
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        const e = new Error(friendly(r.status, body));
        e.status = r.status;
        throw e;
      }
      return r;
    } catch (e) {
      if (e.name === 'AbortError' || e.message === 'timeout') {
        throw new Error(ctl.signal.reason && ctl.signal.reason.message === 'timeout' ? 'Server AI tidak menjawab (batas waktu habis).' : 'Dibatalkan');
      }
      if (e.status) throw e;
      throw new Error('Tidak bisa menghubungi server AI. Periksa koneksi internet dan URL API.');
    } finally { clearTimeout(t); this.ctl.delete(ctl); }
  }
  cancel() { for (const c of this.ctl) { try { c.abort(); } catch (_) {} } this.ctl.clear(); }

  /* ---------- daftar model untuk dropdown ---------- */
  async models() {
    const r = await this.req('/models', { method: 'GET' }, 20000);
    const j = await r.json();
    const list = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    const out = { chat: [], stt: [], tts: [] };
    for (const m of list) {
      const id = typeof m === 'string' ? m : m && m.id;
      if (!id) continue;
      const k = kindOf(typeof m === 'string' ? { id } : m);
      if (out[k] && !out[k].includes(id)) out[k].push(id);
    }
    for (const k of Object.keys(out)) { out[k].sort(); if (!out[k].length) out[k] = FALLBACK[k].slice(); }
    this.log.info('asisten', `Daftar model: ${out.chat.length} percakapan, ${out.stt.length} transkripsi, ${out.tts.length} suara`);
    return { ok: true, ...out, voices: VOICES };
  }

  /* ---------- ucapan ke teks ---------- */
  async transcribe(bytes, mime) {
    const s = this.S();
    const type = String(mime || 'audio/webm').split(';')[0];
    const ext = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : 'webm';
    const fd = new FormData();
    fd.append('model', s.aiStt || 'whisper-1');
    fd.append('file', new Blob([Buffer.from(bytes)], { type }), 'ucapan.' + ext);
    if (s.aiLang && s.aiLang !== 'auto') fd.append('language', s.aiLang);
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    const r = await this.req('/audio/transcriptions', { method: 'POST', body: fd }, 60000);
    const txt = await r.text();
    let text = '';
    try { const j = JSON.parse(txt); text = j.text || ''; } catch (_) { text = txt; }
    return String(text).trim();
  }

  /* ---------- percakapan ---------- */
  async chat(history) {
    const s = this.S();
    const now = new Date();
    const sys = [
      'Kamu adalah Pulau, asisten suara di Dynamic Island pada komputer Windows pengguna.',
      'Jawabanmu akan diucapkan lewat text-to-speech, jadi tulis seperti orang berbicara: singkat, jelas, tanpa markdown, tanpa daftar bernomor, tanpa emoji, tanpa tautan.',
      'Biasanya cukup satu sampai tiga kalimat. Jawab lebih panjang hanya bila pengguna memintanya.',
      'Gunakan bahasa yang sama dengan pengguna. Kamu tidak bisa membuka aplikasi atau mengendalikan komputer; bila diminta, jelaskan singkat cara melakukannya sendiri.',
      'Waktu sekarang: ' + now.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) + '.',
      s.aiPersona ? 'Instruksi tambahan dari pengguna: ' + String(s.aiPersona).slice(0, 500) : ''
    ].filter(Boolean).join('\n');
    const msgs = [{ role: 'system', content: sys }, ...history.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }))];
    const r = await this.req('/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: s.aiModel || 'gpt-4o-mini', messages: msgs, max_tokens: 350, temperature: 0.7 })
    }, 60000);
    const j = await r.json();
    const c = j.choices && j.choices[0];
    let text = c && c.message ? c.message.content : '';
    if (Array.isArray(text)) text = text.map((p) => p.text || '').join('');
    text = String(text || '').replace(/[*_#`>]+/g, '').replace(/\n{2,}/g, '\n').trim();
    if (j.usage) this.log.info('asisten', `Token: ${j.usage.prompt_tokens || 0} masuk, ${j.usage.completion_tokens || 0} keluar`);
    return text;
  }

  /* ---------- teks ke ucapan ---------- */
  async speech(text) {
    const s = this.S();
    const speed = Math.max(0.5, Math.min(2, Number(s.aiSpeed) || 1));
    const r = await this.req('/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: s.aiTts || 'tts-1', voice: VOICES.includes(s.aiVoice) ? s.aiVoice : 'nova', input: String(text).slice(0, 3000), speed, response_format: 'mp3' })
    }, 60000);
    return new Uint8Array(await r.arrayBuffer());
  }
}

module.exports = { AI, VOICES, FALLBACK, kindOf };
