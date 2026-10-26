import { $, escapeHtml, setStatus } from './utils.js';
import { state, HAS_OPEN_PICKER, FS_IDS, getActiveJob, createJob, switchJob, deleteJob, renameJob } from './state.js';
import { parseDxfText } from './dxf-import.js';
import { draw } from './canvas.js';
import { applyParams } from './params.js';
import { placedCountsByIdx, statusOf, refreshPartsStatus } from './part-status.js';
import { pushHistory, initHistory, updateButtons } from './history.js';

// ─── Авто-выделение содержимого поля при фокусе ───
function attachAutoSelect(el){
  if(!el) return;
  let mouseDownStarted = false;
  el.addEventListener('mousedown', () => { mouseDownStarted = true; });
  el.addEventListener('mouseup', (e) => {
    if(!mouseDownStarted) return;
    mouseDownStarted = false;
    if(el.selectionStart === el.selectionEnd){
      e.preventDefault();
      try { el.select(); } catch(_){}
    }
  });
  el.addEventListener('focus', () => {
    setTimeout(() => { try { el.select(); } catch(_){} }, 0);
  });
  el.addEventListener('dblclick', () => {
    try { el.select(); } catch(_){}
  });
}

function getQtyInputs(wrap){
  if(!wrap) return [];
  return [...wrap.querySelectorAll('input[type=number][data-idx]')];
}

export function renderPartsTable(){
  const wrap = $('partsTableWrap');
  if(!wrap) return;
  if(!state.parts.length){
    wrap.innerHTML = '<div class="empty">Файлы не добавлены. Перетащите DXF сюда.</div>';
    updateSelInfo(); return;
  }
  const placed = placedCountsByIdx();
  const rows = state.parts.map((p, i) => {
    const sel = state.selectedRows.has(i) ? ' selected' : '';
    const lenStr = (p.length >= 10000) ? (p.length/1000).toFixed(2)+' м' : Math.round(p.length)+' мм';
    const st = statusOf(placed[i] || 0, p.qty || 0);
    return `<tr data-row="${i}" class="${sel} row-${st.key}">
<td class="status ${st.key}" title="${st.title}">${st.icon}</td>
<td data-edit="name" data-idx="${i}" style="cursor:text" title="Клик — ввод количества · 2× клик — переименовать">${escapeHtml(p.name)}</td>
<td class="num" style="cursor:default">${p.width.toFixed(1)}×${p.height.toFixed(1)}</td>
<td class="num" style="cursor:default" title="Длина контуров">${lenStr}</td>
<td class="num qty-cell" title="Клик — редактировать количество"><input type="number" min="1" value="${p.qty}" data-idx="${i}"></td>
<td class="del" data-del="${i}" title="Удалить">✕</td></tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead><tr>
<th style="width:26px" title="✓ — разложено полностью, ◐ — частично, ○ — не разложено"></th>
<th style="min-width:110px">Деталь (клик — кол-во, 2× — правка)</th>
<th style="width:80px">Размер</th>
<th style="width:80px">Длина 1 шт</th>
<th style="width:60px">Кол-во</th>
<th style="width:30px"></th></tr></thead><tbody>${rows}</tbody></table>`;

  wrap.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if(e.target.closest('input[type=number], [data-del]')) return;
      const idx = +tr.dataset.row;
      if(e.ctrlKey || e.metaKey){
        if(state.selectedRows.has(idx)) state.selectedRows.delete(idx);
        else state.selectedRows.add(idx);
      } else if(e.shiftKey && state.selectedRows.size){
        const arr = [...state.selectedRows].sort((a,b)=>a-b);
        const from = Math.min(arr[arr.length-1], idx), to = Math.max(arr[arr.length-1], idx);
        for(let k=from;k<=to;k++) state.selectedRows.add(k);
      } else {
        state.selectedRows.clear();
        state.selectedRows.add(idx);
      }
      updateSelectionUI();
    });

    let dragStartTarget = null;
    tr.setAttribute('draggable', 'true');
    tr.addEventListener('mousedown', e => { dragStartTarget = e.target; });

    tr.addEventListener('dragstart', e => {
      const t = dragStartTarget;
      dragStartTarget = null;
      if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('[data-del]'))){
        e.preventDefault(); return;
      }
      const idx = +tr.dataset.row;
      const part = state.parts[idx];
      if(!part){ e.preventDefault(); return; }
      state.draggedPartIdx = idx;
      state._dropHandled = false;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('text/plain', String(idx)); } catch(_){}
      setStatus(`Перетащите «${part.name}» на холст`);
    });

    tr.addEventListener('dragend', () => {
      const handled = state._dropHandled;
      state._dropHandled = false;
      state.draggedPartIdx = null;
      state.dropPreview = null;
      draw();
      if(!handled) setStatus('');
    });
  });

  // ─── Поля количества в таблице ───
  let _qtyTimer = null;
  const inputs = getQtyInputs(wrap);

  inputs.forEach((inp, i) => {
    attachAutoSelect(inp);

    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.idx;
      state.parts[idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      refreshPartsStatus();
      updateSelInfo();
      if(_qtyTimer) clearTimeout(_qtyTimer);
      _qtyTimer = setTimeout(() => { _qtyTimer = null; pushHistory(); }, 500);
    });

    inp.addEventListener('blur', () => {
      if(_qtyTimer){ clearTimeout(_qtyTimer); _qtyTimer = null; pushHistory(); }
    });

    inp.addEventListener('keydown', e => {
      if(e.key === 'ArrowDown'){
        e.preventDefault();
        const next = inputs[i + 1];
        if(next){ next.focus(); }
        else { const bq = $('batchQty'); if(bq) bq.focus(); }
        return;
      }
      if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[i - 1];
        if(prev){ prev.focus(); }
        else { const bq = $('batchQty'); if(bq) bq.focus(); }
        return;
      }
      if(e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[i + 1];
        if(next) next.focus();
        else inp.blur();
        return;
      }
      if(e.key === 'Escape'){
        e.preventDefault();
        inp.blur();
      }
    });
  });

  // ─── Клик по имени: одиночный → фокус в кол-во, двойной → переименование ───
  wrap.querySelectorAll('[data-edit=name]').forEach(td => {
    let clickTimer = null;
    td.addEventListener('click', e => {
      if(e.detail > 1) return;        // двойной/тройной — обработает dblclick
      if(clickTimer) return;          // уже идёт отсчёт
      const idx = +td.dataset.idx;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const inp = wrap.querySelector(`input[type=number][data-idx="${idx}"]`);
        if(inp){ inp.focus(); }
      }, 220);
    });
    td.addEventListener('dblclick', e => {
      if(clickTimer){ clearTimeout(clickTimer); clickTimer = null; }
      const idx = +td.dataset.idx;
      const old = state.parts[idx].name;
      const v = prompt('Новое имя детали:', old);
      if(v !== null && v.trim() && v.trim() !== old){
        state.parts[idx].name = v.trim();
        renderPartsTable();
        pushHistory();
      }
    });
  });

  // ─── Клик по пустому месту в ячейке «Кол-во» → фокус в input ───
  wrap.querySelectorAll('td.qty-cell').forEach(td => {
    td.addEventListener('click', e => {
      if(e.target.tagName === 'INPUT') return; // клик по самому input обрабатывается штатно
      const inp = td.querySelector('input');
      if(inp){ inp.focus(); }
    });
  });

  wrap.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', e => {
      const idx = +e.target.dataset.del;
      const had = !!state.parts[idx];
      removePartByIndex(idx);
      if(had) pushHistory();
    });
  });

  updateSelInfo();
  updateSelectionUI();
}

function removePartByIndex(idx){
  state.parts.splice(idx, 1);
  for(const sh of state.sheets){
    sh.placed = sh.placed.filter(pl => pl.partIdx !== idx);
    for(const pl of sh.placed) if(pl.partIdx > idx) pl.partIdx--;
  }
  const ns = new Set();
  for(const s of state.selectedRows){
    if(s < idx) ns.add(s); else if(s > idx) ns.add(s-1);
  }
  state.selectedRows.clear();
  for(const s of ns) state.selectedRows.add(s);
  renderPartsTable();
  draw();
}

export function updateSelectionUI(){
  const wrap = $('partsTableWrap');
  if(!wrap) return;
  wrap.querySelectorAll('tr').forEach(tr => {
    tr.classList.toggle('selected', state.selectedRows.has(+tr.dataset.row));
  });
  updateSelInfo();
}

export function updateSelInfo(){
  const el = $('selInfo');
  if(!el) return;
  const n = state.selectedRows.size;
  if(!n){ el.textContent = ''; return; }
  const qtySet = new Set();
  for(const idx of state.selectedRows){
    const p = state.parts[idx];
    if(p) qtySet.add(p.qty || 1);
  }
  const cur = [...qtySet].sort((a,b) => a - b);
  let curText = '';
  if(cur.length === 1){
    curText = `, кол-во: ${cur[0]}`;
  } else if(cur.length > 1 && cur.length <= 4){
    curText = `, кол-во: ${cur.join(', ')}`;
  } else if(cur.length > 4){
    curText = `, кол-во: разное`;
  }
  el.textContent = `выделено: ${n}${curText}`;
}

function fallbackOpen(){
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

  renderPartsTable();
  draw();

  let msg = `Загружено: ${ok}`;
  if(dup) msg += `, дубликатов пропущено: ${dup}`;
  if(fail) msg += `, ошибок: ${fail}`;
  setStatus(msg);
  if(errors.length) console.warn('Ошибки загрузки:\n' + errors.join('\n'));
  if(ok > 0) pushHistory();
}

export function renderJobSelect(){
  const sel = $('jobSelect'); if(!sel) return;
  sel.innerHTML = '';
  for(const j of state.jobs){
    const partsCount = j.parts.reduce((s, p) => s + (p.qty || 0), 0);
    const opt = document.createElement('option');
    opt.value = j.id;
    opt.textContent = `${j.name} — ${partsCount} дет.`;
    if(j.id === state.activeJobId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function refreshJobView(){
  renderJobSelect();
  renderPartsTable();
  draw();
  import('./report.js').then(m => m.updateReport()).catch(() => {});
}

export function bindJobUI(){
  $('jobSelect')?.addEventListener('change', e => {
    const job = switchJob(e.target.value);
    if(job && job.paramsSnapshot){ try { applyParams(job.paramsSnapshot); } catch(_){} }
    refreshJobView();
    initHistory();
    updateButtons();
    if(job) setStatus('Активное задание: ' + job.name);
  });

  $('btnNewJob')?.addEventListener('click', () => {
    const suggested = `Задание №${state.jobs.length + 1}`;
    const name = prompt('Название нового задания:', suggested);
    if(name === null) return;
    const job = createJob((name || '').trim() || suggested);
    switchJob(job.id);
    refreshJobView();
    initHistory();
    setStatus(`Создано: ${job.name}`);
  });

  $('btnRenameJob')?.addEventListener('click', () => {
    const job = getActiveJob(); if(!job) return;
    const old = job.name;
    const v = prompt('Новое имя задания:', old);
    if(v === null) return;
    const newName = v.trim() || old;
    if(newName === old) return;
    renameJob(job.id, newName);
    renderJobSelect();
    setStatus('Задание переименовано: ' + job.name);
    pushHistory();
  });

  $('btnDeleteJob')?.addEventListener('click', () => {
    if(state.jobs.length <= 1){ alert('Нельзя удалить последнее задание'); return; }
    const job = getActiveJob(); if(!job) return;
    if(!confirm(`Удалить «${job.name}» со всеми деталями и раскладкой?`)) return;
    deleteJob(job.id);
    const next = getActiveJob();
    if(next && next.paramsSnapshot){ try { applyParams(next.paramsSnapshot); } catch(_){} }
    refreshJobView();
    initHistory();
    updateButtons();
    if(next) setStatus('Активное задание: ' + next.name);
  });

  $('btnTransferUnplaced')?.addEventListener('click', transferUnplaced);
}

function transferUnplaced(){
  if(!state.parts.length){ setStatus('Нет деталей в задании'); return; }

  if(!state.sheets.length){
    const totalQty = state.parts.reduce((s, p) => s + p.qty, 0);
    if(!totalQty){ setStatus('Нечего переносить'); return; }
    if(!confirm(`Раскладка не выполнена. Перенести все ${totalQty} дет. в новое задание?`)) return;
    const name = `Задание №${state.jobs.length + 1} (остатки)`;
    const newJob = createJob(name);
    newJob.parts = state.parts.map(p => ({...p}));
    newJob.paramsSnapshot = getActiveJob()?.paramsSnapshot || null;
    switchJob(newJob.id);
    refreshJobView();
    initHistory();
    setStatus(`Перенесено ${totalQty} дет. в «${name}»`);
    return;
  }

  const placed = placedCountsByIdx();
  const remaining = [];
  for(let i = 0; i < state.parts.length; i++){
    const p = state.parts[i];
    const left = (p.qty || 0) - (placed[i] || 0);
    if(left > 0) remaining.push({ ...p, qty: left });
  }

  const totalLeft = remaining.reduce((s, p) => s + p.qty, 0);
  if(!totalLeft){ setStatus('Все детали разложены — переносить нечего'); return; }
  if(!confirm(`Перенести ${totalLeft} дет. (не поместившихся) в новое задание?`)) return;

  const name = `Задание №${state.jobs.length + 1} (остатки)`;
  const newJob = createJob(name);
  newJob.parts = remaining;
  newJob.paramsSnapshot = getActiveJob()?.paramsSnapshot || null;
  switchJob(newJob.id);
  refreshJobView();
  initHistory();
  setStatus(`Перенесено ${totalLeft} дет. в «${name}»`);
}

function applyQtyModifier(modifier, statusTemplate){
  if(!state.selectedRows.size){ setStatus('Ничего не выделено'); return; }
  let changed = 0;
  for(const idx of state.selectedRows){
    const p = state.parts[idx];
    if(!p) continue;
    const cur = Math.max(1, p.qty || 1);
    let nv = modifier(cur);
    if(!isFinite(nv)) nv = cur;
    nv = Math.max(1, Math.round(nv));
    if(nv !== cur){ p.qty = nv; changed++; }
  }
  renderPartsTable();
  refreshPartsStatus();
  if(changed > 0){
    setStatus(statusTemplate.replace('{n}', changed));
    pushHistory();
  } else {
    setStatus('Количество не изменилось');
  }
}

export function bindPartsUI(){
  $('btnAdd')?.addEventListener('click', async () => {
    setStatus('');
    let files = [];

    if(HAS_OPEN_PICKER){
      try {
        const handles = await window.showOpenFilePicker({
          id: FS_IDS.open,
          multiple: true,
          types: [{ description: 'DXF', accept: { 'application/dxf': ['.dxf'] } }]
        });
        for(const h of handles) files.push(await h.getFile());
        if(files.length){ await loadFiles(files); return; }
        return;
      } catch(e){
        if(e.name === 'AbortError') return;
        console.warn('showOpenFilePicker failed:', e.name, e.message);
        files = [];
      }
    }

    files = await fallbackOpen();
    if(files.length) await loadFiles(files);
  });

  $('btnClear')?.addEventListener('click', () => {
    if(!state.parts.length) return;
    if(!confirm('Удалить все детали?')) return;
    state.parts = []; state.sheets = [];
    state.selectedRows.clear();
    state.selectedPart = null;
    renderPartsTable();
    import('./report.js').then(m => m.updateReport()).catch(() => {});
    draw();
    pushHistory();
  });

  const dropOverlay = $('dropOverlay');
  let dragCounter = 0;
  window.addEventListener('dragenter', e => {
    if(!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    dropOverlay?.classList.add('active');
  });
  window.addEventListener('dragleave', () => {
    dragCounter--;
    if(dragCounter <= 0){ dragCounter = 0; dropOverlay?.classList.remove('active'); }
  });
  window.addEventListener('dragover', e => {
    if(!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', async e => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay?.classList.remove('active');
    const files = [...e.dataTransfer.files].filter(f => /\.dxf$/i.test(f.name));
    if(!files.length){ setStatus('Нет DXF-файлов среди перетащенных'); return; }
    await loadFiles(files);
  });

  const batchQtyEl = $('batchQty');
  if(batchQtyEl){
    attachAutoSelect(batchQtyEl);
    batchQtyEl.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); $('btnApplyQty')?.click(); return; }
      if(e.key === 'ArrowDown'){
        e.preventDefault();
        const inputs = getQtyInputs($('partsTableWrap'));
        if(inputs.length) inputs[0].focus();
        return;
      }
      if(e.key === 'ArrowUp'){
        e.preventDefault();
        const inputs = getQtyInputs($('partsTableWrap'));
        if(inputs.length) inputs[inputs.length - 1].focus();
        return;
      }
      if(e.key === 'Escape'){ e.preventDefault(); batchQtyEl.blur(); }
    });
  }

  $('btnApplyQty')?.addEventListener('click', () => {
    if(!state.selectedRows.size){ setStatus('Ничего не выделено'); return; }
    const q = Math.max(1, parseInt($('batchQty').value, 10) || 1);
    let changed = false;
    for(const idx of state.selectedRows){
      if(state.parts[idx] && state.parts[idx].qty !== q){
        state.parts[idx].qty = q;
        changed = true;
      }
    }
    renderPartsTable();
    setStatus(`Установлено кол-во ${q} для ${state.selectedRows.size} деталей`);
    if(changed) pushHistory();
  });

  $('btnQtyInc')?.addEventListener('click', () => {
    applyQtyModifier(q => q + 1, 'Прибавлено +1 к {n} дет.');
  });
  $('btnQtyDec')?.addEventListener('click', () => {
    applyQtyModifier(q => q - 1, 'Отнято −1 у {n} дет.');
  });
  $('btnQtyMul2')?.addEventListener('click', () => {
    applyQtyModifier(q => q * 2, 'Умножено ×2 у {n} дет.');
  });
  $('btnQtyDiv2')?.addEventListener('click', () => {
    applyQtyModifier(q => Math.max(1, Math.floor(q / 2)), 'Разделено ÷2 у {n} дет.');
  });

  $('btnDupSelected')?.addEventListener('click', () => {
    if(!state.selectedRows.size){ setStatus('Ничего не выделено'); return; }
    const sorted = [...state.selectedRows].sort((a,b)=>a-b);
    const copies = sorted.map(i => ({...state.parts[i]}));
    for(const c of copies) state.parts.push(c);
    state.selectedRows.clear();
    renderPartsTable();
    setStatus(`Дублировано ${copies.length} деталей`);
    pushHistory();
  });
  $('btnDelSelected')?.addEventListener('click', () => {
    if(!state.selectedRows.size){ setStatus('Ничего не выделено'); return; }
    if(!confirm(`Удалить ${state.selectedRows.size} выделенных?`)) return;
    const sorted = [...state.selectedRows].sort((a,b)=>b-a);
    for(const i of sorted) removePartByIndex(i);
    state.selectedRows.clear();
    renderPartsTable();
    pushHistory();
  });

  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key === 'a'){
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      for(let i=0;i<state.parts.length;i++) state.selectedRows.add(i);
      updateSelectionUI();
    }
    if(e.key === 'Delete'){
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea') return;
      if(!state.selectedPart && state.selectedRows.size) $('btnDelSelected')?.click();
    }
  });
}