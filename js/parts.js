// js/parts.js
import { $, setStatus } from './utils.js';
import { state, getActiveJob, createJob, switchJob, deleteJob, renameJob } from './state.js';
import { draw } from './canvas.js';
import { applyParams } from './params.js';
import { placedCountsByIdx, refreshPartsStatus } from './part-status.js';
import { pushHistory, initHistory, updateButtons } from './history.js';

// ИМПОРТ ВЫНЕСЕННЫХ ФУНКЦИЙ
import { openAddPartsModal, loadFiles } from './parts-add.js';
import { renderPartsTable, applyPartsFilter, updateSelectionUI } from './parts-table.js';

// Реэкспорт для совместимости с другими файлами
export { loadFiles, renderPartsTable, updateSelectionUI };

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
  import('./report/report.js').then(m => m.updateReport()).catch(() => {});
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
    openAddPartsModal();
  });

  $('btnClear')?.addEventListener('click', () => {
    if(!state.parts.length) return;
    if(!confirm('Удалить все детали?')) return;
    state.parts = []; state.sheets = [];
    state.selectedRows.clear();
    state.selectedPart = null;
    renderPartsTable();
    import('./report/report.js').then(m => m.updateReport()).catch(() => {});
    draw();
    pushHistory();
  });

  const searchEl = $('partsSearch');
  if(searchEl){
    searchEl.value = state.partsSearchQuery || '';
    let _searchTimer = null;
    searchEl.addEventListener('input', e => {
      const v = e.target.value;
      state.partsSearchQuery = v;
      if(_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        _searchTimer = null;
        applyPartsFilter();
      }, 120);
    });
    searchEl.addEventListener('keydown', e => {
      if(e.key === 'Escape'){
        searchEl.value = '';
        state.partsSearchQuery = '';
        applyPartsFilter();
        searchEl.blur();
      }
    });
  }
  const filterUnplacedEl = $('partsFilterUnplaced');
  if(filterUnplacedEl){
    filterUnplacedEl.checked = !!state.partsFilterUnplaced;
    filterUnplacedEl.addEventListener('change', e => {
      state.partsFilterUnplaced = e.target.checked;
      applyPartsFilter();
    });
  }

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
    batchQtyEl.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); $('btnApplyQty')?.click(); return; }
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

  $('btnQtyInc')?.addEventListener('click', () => applyQtyModifier(q => q + 1, 'Прибавлено +1 к {n} дет.'));
  $('btnQtyDec')?.addEventListener('click', () => applyQtyModifier(q => q - 1, 'Отнято −1 у {n} дет.'));
  $('btnQtyMul2')?.addEventListener('click', () => applyQtyModifier(q => q * 2, 'Умножено ×2 у {n} дет.'));
  $('btnQtyDiv2')?.addEventListener('click', () => applyQtyModifier(q => Math.max(1, Math.floor(q / 2)), 'Разделено ÷2 у {n} дет.'));

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
    for(const i of sorted){
      state.parts.splice(i, 1);
      for(const sh of state.sheets) sh.placed = sh.placed.filter(pl => pl.partIdx !== i);
    }
    state.selectedRows.clear();
    renderPartsTable();
    pushHistory();
  });

  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key === 'a'){
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea') return;
      e.preventDefault();

      const wrap = $('partsTableWrap');
      const visibleRows = [];
      if(wrap){
        wrap.querySelectorAll('tr[data-row]').forEach(tr => {
          if(tr.style.display !== 'none') visibleRows.push(+tr.dataset.row);
        });
      }
      state.selectedRows.clear();
      for(const idx of visibleRows) state.selectedRows.add(idx);
      state._selectedRowsFromCanvas = false;
      updateSelectionUI();
    }
  });
}

// ═══ УПРАВЛЕНИЕ ЗАДАНИЯМИ ═══

export function openJobsModal() {
  const modal = document.getElementById('jobsModal');
  if (!modal) return;
  renderJobsList();
  modal.classList.add('active');
}

export function closeJobsModal() {
  const modal = document.getElementById('jobsModal');
  if (modal) modal.classList.remove('active');
}

function renderJobsList() {
  const container = document.getElementById('jobsListContainer');
  if (!container) return;

  container.innerHTML = state.jobs.map(job => {
    const isActive = job.id === state.activeJobId;
    const partsCount = job.parts.reduce((s, p) => s + (p.qty || 0), 0);
    
    return `
      <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; background:${isActive ? '#eaf4ff' : '#fff'};">
        <div style="flex:1;">
          <div style="font-weight:bold; color:${isActive ? '#004a99' : '#333'};">
            ${job.name} ${isActive ? '(текущее)' : ''}
          </div>
          <div style="font-size:11px; color:#888;">Деталей: ${partsCount} · Листов: ${job.sheets.length}</div>
        </div>
        <div style="display:flex; gap:6px;">
          ${!isActive ? `<button class="small primary" data-job-id="${job.id}" data-action="switch">Перейти</button>` : ''}
          <button class="small" data-job-id="${job.id}" data-action="transfer" title="Перенести сюда выделенные детали из текущего задания" style="background:#e8f4ff; color:#004a99; border-color:#4a90d9;">
            ⬅ Перенести
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.onclick = () => {
      const jobId = btn.dataset.jobId;
      const action = btn.dataset.action;
      
      if (action === 'switch') {
        switchJob(jobId);
        closeJobsModal();
        refreshJobView();
      } else if (action === 'transfer') {
        transferSelectedToJob(jobId);
      }
    };
  });
}

export function transferSelectedToJob(targetJobId) {
  if (!state.selectedRows || !state.selectedRows.size) {
    alert('Сначала выделите детали в таблице слева (кликните по строкам в списке деталей).');
    return;
  }

  const targetJob = state.jobs.find(j => j.id === targetJobId);
  if (!targetJob) return;

  if (targetJobId === state.activeJobId) {
    alert('Это текущее задание. Выберите другое.');
    return;
  }

  if (!confirm(`Перенести ${state.selectedRows.size} выделенных деталей в задание «${targetJob.name}»?`)) return;

  const currentJob = getActiveJob();
  if (!currentJob) return;

  const selectedIndices = [...state.selectedRows].sort((a, b) => b - a);
  const transferredNames = [];

  for (const idx of selectedIndices) {
    const part = currentJob.parts[idx];
    if (!part) continue;
    
    targetJob.parts.push({ ...part });
    transferredNames.push(part.name);
    
    currentJob.parts.splice(idx, 1);
    
    for (const sheet of currentJob.sheets) {
      sheet.placed = sheet.placed.filter(pl => pl.partIdx !== idx);
      for (const pl of sheet.placed) {
        if (pl.partIdx > idx) pl.partIdx--;
      }
    }
  }

  state.selectedRows.clear();
  renderPartsTable();
  refreshJobView();
  pushHistory();
  
  alert(`Перенесено деталей: ${transferredNames.length}. Теперь можно переключиться на задание «${targetJob.name}» и разложить их.`);
}