'use strict';
const $ = (s) => document.querySelector(s);
const api = window.pulau;
const state = { running: false, askId: '' };

function setRunning(on) {
  state.running = on;
  $('#go').hidden = on; $('#stop').hidden = !on; $('#goal').disabled = on;
}
function addLog(level, text) {
  const box = $('#log');
  const nearEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const d = document.createElement('div');
  d.className = level; d.textContent = text;
  box.appendChild(d);
  while (box.childElementCount > 300) box.firstElementChild.remove();
  if (nearEnd) box.scrollTop = box.scrollHeight;
}
function setStatus(e) {
  $('#dot').className = e.phase || '';
  $('#stTitle').textContent = e.title || 'Siap';
  $('#stSub').textContent = e.sub || '';
  if (e.usage) $('#meta').textContent = `Langkah ${e.step || 0} · ${e.usage.input + e.usage.output} token (${e.usage.calls} panggilan)`;
}
function showAsk(e) {
  state.askId = e.id;
  const q = e.kind === 'question';
  $('#askKind').textContent = q ? 'Agen bertanya' : 'Izin diperlukan';
  $('#askText').textContent = e.text;
  $('#askInput').hidden = !q; $('#askBtns').hidden = q;
  $('#ask').hidden = false;
  if (q) { $('#askField').value = ''; $('#askField').focus(); }
}
function hideAsk(id) { if (!id || id === state.askId) { state.askId = ''; $('#ask').hidden = true; } }

api.onAgentEvent((e) => {
  if (e.type === 'log') addLog(e.level, e.text);
  else if (e.type === 'status') setStatus(e);
  else if (e.type === 'ask') showAsk(e);
  else if (e.type === 'resolved') hideAsk(e.id);
  else if (e.type === 'start') { setRunning(true); $('#log').textContent = ''; }
  else if (e.type === 'end') { setRunning(false); hideAsk(); }
});

$('#go').onclick = async () => {
  const goal = $('#goal').value.trim();
  if (!goal) { $('#goal').focus(); return; }
  const r = await api.agentStart(goal);
  if (r && !r.ok && r.error !== 'Dihentikan') { setStatus({ phase: 'error', title: 'Tidak bisa memulai', sub: r.error }); addLog('error', r.error); }
};
$('#stop').onclick = () => api.agentStop();
$('#goal').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) $('#go').click(); });
$('#askYes').onclick = () => api.agentAnswer(state.askId, true);
$('#askNo').onclick = () => api.agentAnswer(state.askId, false);
$('#askSend').onclick = () => api.agentAnswer(state.askId, $('#askField').value.trim() || '(kosong)');
$('#askField').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#askSend').click(); });

(async () => {
  const st = await api.agentState();
  for (const h of st.history || []) addLog(h.level, h.text);
  setStatus({ phase: st.running ? st.phase : '', title: st.running ? 'Agen berjalan' : 'Siap', sub: st.running ? '' : 'Tulis tugas di bawah lalu tekan Mulai.', step: st.step, usage: st.usage });
  setRunning(!!st.running);
  const p = (st.pending || [])[0]; if (p) showAsk(p);
  $('#goal').focus();
})();
