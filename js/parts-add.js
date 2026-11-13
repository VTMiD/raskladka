// js/parts-add.js
import { $, escapeHtml, setStatus } from './utils.js';
import { state, HAS_OPEN_PICKER, FS_IDS } from './state.js';
import { parseDxfText } from './dxf-import.js';
import { draw } from './canvas.js';
import { pushHistory } from './history.js';

// ─── Стили для модалки ───
function ensureAddPartsStyles() {
  if (document.getElementById('addPartsStyles')) return;
  const s = document.createElement('style');
  s.id = 'addPartsStyles';
  s.textContent = `
    .apm-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px; user-select: none; }
    .apm-item:hover { background: #eaf4ff; }
    .apm-item.apm-selected { background: #d6e8ff; }
    .apm-item.apm-selected:hover { background: #c2ddff; }
    .apm-item input.apm-check { margin: 0; cursor: pointer; pointer-events: none; }
    .apm-name { flex: 1; word-break: break-all; }
    .apm-size { color: #888; font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .apm-empty { padding: 30px; text-align: center; color: #888; font-style: italic; }
    .apm-warn { color: #8a5a00; background: #fff8e1; border: 1px solid #f0d9a8; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 8px; }
  `;
  document.head.appendChild(s);
}

function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return n + ' Б';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ';
  return (n / 1024 / 1024).toFixed(1) + ' МБ';
}

// ─── Загрузка файлов ───
export function fallbackOpen(){
  return new Promise(resolve => {
    const inp = $('fileInput');
    if(!inp){ resolve([]); return; }
    inp.value = '';
    let resolved = false;

    const finish = (files) => {
      if(resolved) return;
      resolved = true;
      inp.onchange = null;
      window.removeEventListener('focus', onFocus);
      resolve(files || []);
    };

    inp.onchange = () => finish([...inp.files]);

    const onFocus = () => {
      setTimeout(() => {
        if(!resolved) finish(inp.files ? [...inp.files] : []);
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    inp.click();
  });
}

export async function loadFiles(files){
  if(!files || !files.length) return;
  let ok=0, fail=0, dup=0; const errors=[];
  setStatus('Загрузка ' + files.length + ' файлов...');

  const existingNames = new Set(state.parts.map(p => p.name.toLowerCase()));
  const batchNames = new Set();

  for(const f of files){
    const base = f.name.replace(/\.dxf$/i, '');
    const lowerBase = base.toLowerCase();
    if(existingNames.has(lowerBase) || batchNames.has(lowerBase)){ dup++; continue; }

    try {
      const text = await f.text();
      const part = parseDxfText(text, base);
      part.qty = 1;
      part.dxfText = text;
      state.parts.push(part);
      batchNames.add(lowerBase);
      ok++;
    } catch(err){
      fail++; errors.push(f.name + ': ' + err.message);
    }
  }

  // Динамический импорт, чтобы избежать циклической зависимости
  import('./parts.js').then(m => m.renderPartsTable()).catch(() => {});
  draw();

  let msg = `Загружено: ${ok}`;
  if(dup) msg += `, дубликатов пропущено: ${dup}`;
  if(fail) msg += `, ошибок: ${fail}`;
  setStatus(msg);
  if(errors.length) console.warn('Ошибки загрузки:\n' + errors.join('\n'));
  if(ok > 0) pushHistory();
}

async function loadFilesFromTexts(items) {
  if (!items || !items.length) return;
  let ok = 0, fail = 0, dup = 0;
  const errors = [];
  setStatus('Загрузка ' + items.length + ' файлов...');

  const existingNames = new Set(state.parts.map(p => p.name.toLowerCase()));
  const batchNames = new Set();

  for (const it of items) {
    const base = (it.name || '').replace(/\.dxf$/i, '');
    const lowerBase = base.toLowerCase();
    if (!base) { fail++; continue; }
    if (existingNames.has(lowerBase) || batchNames.has(lowerBase)) { dup++; continue; }
    if (it.error) { fail++; errors.push(it.name + ': ' + it.error); continue; }

    try {
      const part = parseDxfText(it.content, base);
      part.qty = 1;
      part.dxfText = it.content;
      state.parts.push(part);
      batchNames.add(lowerBase);
      ok++;
    } catch (err) {
      fail++;
      errors.push(it.name + ': ' + err.message);
    }
  }

  import('./parts.js').then(m => m.renderPartsTable()).catch(() => {});
  draw();

  let msg = `Загружено: ${ok}`;
  if (dup) msg += `, дубликатов пропущено: ${dup}`;
  if (fail) msg += `, ошибок: ${fail}`;
  setStatus(msg);
  if (errors.length) console.warn('Ошибки загрузки:\n' + errors.join('\n'));
  if (ok > 0) pushHistory();
}

// ─── Модалка добавления ───
export async function openAddPartsModal() {
  ensureAddPartsStyles();

  let listData = null;
  let listError = null;
  try {
    const res = await fetch('/api/list-parts');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Не удалось получить список');
    listData = data;
    if (data.note) listError = data.note;
  } catch (e) {
    listError = e.message;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.id = 'addPartsModal';

  const hasFiles = listData && listData.files && listData.files.length > 0;
  const folderLine = listData
    ? `Папка: <b>${escapeHtml(listData.folder)}</b>${hasFiles ? ` · файлов: ${listData.files.length}` : ''}`
    : '';
  const warnLine = listError
    ? `<div class="apm-warn">⚠ ${escapeHtml(listError)}</div>`
    : '';

  const filesHtml = hasFiles
    ? listData.files.map(f => `
        <div class="apm-item">
          <input type="checkbox" class="apm-check" value="${escapeHtml(f.name)}" tabindex="-1">
          <span class="apm-name">${escapeHtml(f.name)}</span>
          <span class="apm-size">${fmtBytes(f.size)}</span>
        </div>
      `).join('')
    : '<div class="apm-empty">' + (listError ? 'Не удалось получить список файлов' : 'В папке нет DXF-файлов') + '</div>';

  modal.innerHTML = `
    <div class="modal-window" style="width:640px; max-width:95vw;">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>+ Добавить DXF (пакетно)</span>
        <button class="close-btn" id="apmClose" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        ${warnLine}
        <div style="font-size:12px;color:#555;margin-bottom:8px">${folderLine}</div>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <button type="button" class="small" id="apmSelectAll" ${hasFiles ? '' : 'disabled'}>Выбрать все</button>
          <button type="button" class="small" id="apmSelectNone" ${hasFiles ? '' : 'disabled'}>Снять выбор</button>
          <input type="text" id="apmSearch" placeholder="🔍 Поиск или список номеров (через запятую)…"
                 ${hasFiles ? '' : 'disabled'}
                 style="flex:1;min-width:140px;padding:4px 8px;border:1px solid #bbb;border-radius:3px;font-size:12px">
        </div>
        <div class="apm-list" style="max-height:400px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;background:#fff">
          ${filesHtml}
        </div>
        <div class="apm-status" style="margin-top:8px;font-size:12px;color:#555;min-height:18px"></div>
        <div class="apm-hint" style="margin-top:4px;font-size:11px;color:#888">
          Клик — выбрать одну · <b>Shift+клик</b> — диапазон · <b>Ctrl+клик</b> — добавить/убрать<br>
          <span style="color:#004a99;font-weight:bold">💡 Можно вставить список номеров (430, 432, 491...) — программа сама найдёт и отметит их.</span>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap">
        <button id="apmOtherFiles">📂 Выбрать другие файлы…</button>
        <div style="display:flex;gap:8px">
          <button id="apmAdd" class="primary" ${hasFiles ? '' : 'disabled'}>Добавить выбранные</button>
          <button id="apmCancel">Закрыть</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#apmClose').onclick = close;
  modal.querySelector('#apmCancel').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  const escHandler = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  const listEl = modal.querySelector('.apm-list');
  const statusEl = modal.querySelector('.apm-status');
  const getChecks = () => [...listEl.querySelectorAll('input.apm-check')];
  const getVisibleItems = () => [...listEl.querySelectorAll('.apm-item')].filter(it => it.style.display !== 'none');

  let lastClickedItem = null;

  function updateHighlight() {
    listEl.querySelectorAll('.apm-item').forEach(it => {
      const cb = it.querySelector('.apm-check');
      it.classList.toggle('apm-selected', !!(cb && cb.checked));
    });
  }

  listEl.addEventListener('click', e => {
    const item = e.target.closest('.apm-item');
    if (!item) return;
    e.preventDefault();

    const visible = getVisibleItems();
    const curIdx = visible.indexOf(item);
    if (curIdx === -1) return;

    const cb = item.querySelector('.apm-check');
    if (!cb) return;

    if (e.shiftKey && lastClickedItem) {
      const lastIdx = visible.indexOf(lastClickedItem);
      if (lastIdx >= 0) {
        const from = Math.min(lastIdx, curIdx);
        const to = Math.max(lastIdx, curIdx);
        for (let i = from; i <= to; i++) {
          const vcb = visible[i].querySelector('.apm-check');
          if (vcb) vcb.checked = true;
        }
      } else {
        cb.checked = true;
        lastClickedItem = item;
      }
    } else if (e.ctrlKey || e.metaKey) {
      cb.checked = !cb.checked;
      lastClickedItem = item;
    } else {
      visible.forEach(it => {
        const vcb = it.querySelector('.apm-check');
        if (vcb) vcb.checked = false;
      });
      cb.checked = true;
      lastClickedItem = item;
    }

    updateHighlight();
  });

  modal.querySelector('#apmSelectAll').onclick = () => {
    getVisibleItems().forEach(it => {
      const cb = it.querySelector('.apm-check');
      if (cb) cb.checked = true;
    });
    updateHighlight();
  };
  modal.querySelector('#apmSelectNone').onclick = () => {
    getChecks().forEach(cb => cb.checked = false);
    lastClickedItem = null;
    updateHighlight();
  };

  const searchEl = modal.querySelector('#apmSearch');
  searchEl.addEventListener('input', () => {
    const raw = searchEl.value;
    const q = raw.toLowerCase().trim();
    
    const tokens = q.split(/[\s,;\n]+/).filter(Boolean);
    const isBulk = tokens.length > 1 || /[,;\n]/.test(raw);

    listEl.querySelectorAll('.apm-item').forEach(item => {
      const name = item.querySelector('.apm-name').textContent.toLowerCase();
      const cb = item.querySelector('.apm-check');
      
      let match = false;
      if (isBulk) {
        match = tokens.some(t => name.includes(t));
      } else {
        match = !q || name.includes(q);
      }

      item.style.display = match ? '' : 'none';
      
      if (isBulk && match && cb) {
        cb.checked = true;
      }
    });
    
    if (lastClickedItem && lastClickedItem.style.display === 'none') {
      lastClickedItem = null;
    }
    
    updateHighlight();
  });

  modal.querySelector('#apmOtherFiles').onclick = async () => {
    close();
    let files = [];
    if (HAS_OPEN_PICKER) {
      try {
        const handles = await window.showOpenFilePicker({
          id: FS_IDS.open,
          multiple: true,
          types: [{ description: 'DXF', accept: { 'application/dxf': ['.dxf'] } }],
        });
        for (const h of handles) files.push(await h.getFile());
        if (files.length) { await loadFiles(files); return; }
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        files = [];
      }
    }
    files = await fallbackOpen();
    if (files.length) await loadFiles(files);
  };

  modal.querySelector('#apmAdd').onclick = async () => {
    const selected = getChecks().filter(cb => cb.checked).map(cb => cb.value);
    if (!selected.length) {
      statusEl.textContent = 'Ничего не выбрано';
      statusEl.style.color = '#8a5a00';
      return;
    }
    const btn = modal.querySelector('#apmAdd');
    btn.disabled = true;
    statusEl.textContent = `Загрузка ${selected.length} файлов…`;
    statusEl.style.color = '#555';
    try {
      const res = await fetch('/api/get-parts-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: selected }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Ошибка загрузки');
      await loadFilesFromTexts(data.files);
      close();
    } catch (e) {
      statusEl.textContent = '⚠ ' + e.message;
      statusEl.style.color = '#b00';
      btn.disabled = false;
    }
  };
}