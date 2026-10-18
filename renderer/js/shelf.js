'use strict';
/* Rak file: simpan jalur file (bukan salinan) agar mudah diseret ke aplikasi lain. */
P.mods.shelf = (() => {
  const page = () => $('.page[data-page="shelf"]');
  const FILE_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>');
  let internalDrag = 0;

  async function add(items) {
    if (!items || !items.length) return;
    const list = P.data.shelf.filter((f) => !items.some((n) => n.path === f.path));
    P.data.shelf = [...items, ...list].slice(0, 40);
    logA('INFO', 'rak', 'Ditambahkan: ' + items.map((f) => f.name).join(', '));
    save('shelf'); paint();
  }
  async function addPaths(paths) {
    paths = paths.filter(Boolean);
    if (paths.length) add(await api.fileInfo(paths));
  }
  function remove(p) { logA('INFO', 'rak', 'Dihapus dari rak: ' + p); P.data.shelf = P.data.shelf.filter((f) => f.path !== p); save('shelf'); paint(); }

  function paint() {
    const files = P.data.shelf || [];
    page().classList.toggle('has-files', files.length > 0);
    const box = $('#files');
    box.innerHTML = '';
    for (const f of files) {
      const el = document.createElement('div');
      el.className = 'file';
      el.draggable = true;
      el.title = f.path + '\nKlik: buka · Klik kanan: tampilkan di folder · Seret: pindahkan ke aplikasi lain';
      el.innerHTML = `<img src="${f.icon || FILE_ICON}"><div class="nm">${esc(f.name)}</div>` +
        `<button class="x" title="Hapus dari rak"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
      el.addEventListener('click', (e) => { if (e.target.closest('.x')) { remove(f.path); return; } api.openFile(f.path); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); api.revealFile(f.path); });
      el.addEventListener('dragstart', (e) => { e.preventDefault(); internalDrag = Date.now(); api.dragFile(f.path, f.icon); });
      box.appendChild(el);
    }
  }

  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  function setDragging(on) {
    page().classList.toggle('dragging', on);
    $('#drop').classList.toggle('over', on);
  }

  return {
    title: 'Rak <em>File</em>',
    width: () => 580,
    onShow: paint,
    onData(k) { if (k === 'shelf') paint(); },
    init() {
      $('#drop').onclick = async () => add(await api.fileDialog());
      $('#shAdd').onclick = async () => add(await api.fileDialog());
      $('#shClear').onclick = () => { logA('INFO', 'rak', 'Rak dikosongkan'); P.data.shelf = []; save('shelf'); paint(); };
      document.addEventListener('dragenter', (e) => {
        if (!hasFiles(e) || Date.now() - internalDrag < 3000) return;
        e.preventDefault();
        if (!P.hover || P.page !== 'shelf') openIsland('shelf');
        setDragging(true);
      });
      document.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
      document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) setDragging(false); });
      document.addEventListener('drop', (e) => {
        e.preventDefault(); setDragging(false);
        if (Date.now() - internalDrag < 3000) return;
        addPaths([...(e.dataTransfer.files || [])].map((f) => api.pathForFile(f)));
      });
      paint();
    }
  };
})();
