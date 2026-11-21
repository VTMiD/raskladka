// js/parts.js
import { $, setStatus } from './utils.js';
import { state, getActiveJob, createJob, switchJob, deleteJob, renameJob } from './state.js';
import { draw } from './canvas.js';
import { applyParams, readParams } from './params.js';
import { placedCountsByIdx, refreshPartsStatus } from './part-status.js';
import { pushHistory, initHistory, updateButtons } from './history.js';
import { partCollidesAt } from './canvas-core.js';
import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';

import { openAddPartsModal, loadFiles } from './parts-add.js';
import { renderPartsTable, applyPartsFilter, updateSelectionUI } from './parts-table.js';

export { loadFiles, renderPartsTable, updateSelectionUI };

export function renderJobSelect(){
  const sel = $('jobSelect'); 
  if(sel) {
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

  // ═══ ВКЛАДКИ ЗАДАНИЙ НАД ХОЛСТОМ ═══
  const tabsBar = document.getElementById('jobTabsBar');
  if (tabsBar) {
    tabsBar.innerHTML = '';

    for (const j of state.jobs) {
      const tab = document.createElement('div');
      tab.className = 'job-tab' + (j.id === state.activeJobId ? ' active' : '');
      tab.title = j.name;

      const label = document.createElement('span');
      label.className = 'job-tab-label';
      label.textContent = `📁 ${j.name}`;
      tab.appendChild(label);

      if (state.jobs.length > 1) {
        const closeBtn = document.createElement('span');
        closeBtn.className = 'job-tab-close';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть задание';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteJobDialog(j.id);
        });
        tab.appendChild(closeBtn);
      }

      tab.onclick = () => {
        if (j.id !== state.activeJobId) {
          switchJob(j.id);
          refreshJobView();
          setStatus(`Активное задание: ${j.name}`);
        }
      };

      tabsBar.appendChild(tab);
    }

    const addBtn = document.createElement('div');
    addBtn.className = 'job-tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Создать новое задание';
    addBtn.onclick = () => {
      const suggested = `Задание №${state.jobs.length + 1}`;
      const name = prompt('Название нового задания:', suggested);
      if (name === null) return;
      const job = createJob((name || '').trim() || suggested);
      switchJob(job.id);
      refreshJobView();
      setStatus(`Создано: ${job.name}`);
    };

    tabsBar.appendChild(addBtn);
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

// ═══════════════════════════════════════════════════════════════
// ДИАЛОГ ЗАКРЫТИЯ ЗАДАНИЯ (крестик на вкладке)
// ═══════════════════════════════════════════════════════════════
export function openDeleteJobDialog(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  if (state.jobs.length <= 1) {
    alert('Нельзя удалить последнее задание');
    return;
  }

  // Считаем, сколько деталей этого задания разложено на листах
  const placedCount = (job.sheets || []).reduce(
    (s, sh) => s + (sh.placed || []).length, 0
  );

  // Если деталей нет — просто подтверждение и удаление
  if (placedCount === 0) {
    if (!confirm(`Удалить задание «${job.name}»?`)) return;
    deleteJob(jobId);
    const next = getActiveJob();
    if (next && next.paramsSnapshot) {
      try { applyParams(next.paramsSnapshot); } catch (_) {}
    }
    refreshJobView();
    initHistory();
    updateButtons();
    if (next) setStatus('Активное задание: ' + next.name);
    return;
  }

  // Есть разложенные детали — открываем диалог
  const otherJobs = state.jobs.filter(j => j.id !== jobId);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-window" style="width:540px">
      <div class="modal-header" style="background:#fff8e1;border-bottom-color:#f0c419;color:#6a4c00">
        <span>⚠ Закрытие задания «${job.name}»</span>
        <button class="close-btn" id="btnCloseDelJob" style="color:#6a4c00">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:15px; margin:0 0 12px; color:#333;">
          В задании <b>${placedCount}</b> разложенных деталей на листах.
        </p>
        <p style="font-size:13px; color:#555; margin:0 0 14px;">
          Что сделать перед удалением задания?
        </p>

        <div style="display:flex; flex-direction:column; gap:10px;">
          
          <div style="border:1px solid #c9e0f5; background:#eaf4ff; border-radius:6px; padding:10px 12px;">
            <div style="font-weight:600; color:#004a99; margin-bottom:6px;">📁 Перенести детали в другое задание</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="delJobTarget" style="flex:1; padding:6px; border:1px solid #4a90d9; border-radius:4px; font-size:13px;">
                ${otherJobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('')}
              </select>
              <button id="btnTransferAndDelete" class="primary" style="background:#004a99; border-color:#003a7a; white-space:nowrap;">
                ➡ Перенести и закрыть
              </button>
            </div>
          </div>

          <!-- ═══ НОВАЯ КНОПКА: В СПИСОК ДЛЯ РАСПРЕДЕЛЕНИЯ ═══ -->
          <button id="btnUnplaceAndDelete" style="padding:10px 12px; text-align:left; background:#f0f9ec; border:1px solid #9ed5a4; color:#1a6a25; border-radius:6px; font-size:13px; cursor:pointer;">
            📋 <b>Перенести в список для распределения</b><br>
            <span style="font-size:11px; color:#2a6a30;">Детали станут неразложенными и перейдут в активное задание.</span>
          </button>

          <button id="btnDeleteJobForce" class="danger" style="padding:10px 12px; text-align:left; background:#fdeaea; border:1px solid #f5c2c2; color:#a00; border-radius:6px; font-size:13px;">
            🗑 <b>Удалить задание вместе с деталями</b><br>
            <span style="font-size:11px; color:#b66;">Разложенные детали будут потеряны (без возможности восстановления).</span>
          </button>

          <button id="btnCancelDeleteJob" style="padding:8px 12px;">Отмена</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#btnCloseDelJob').onclick = close;
  modal.querySelector('#btnCancelDeleteJob').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // 1. Перенос и удаление
  modal.querySelector('#btnTransferAndDelete').onclick = () => {
    const targetId = modal.querySelector('#delJobTarget').value;
    const targetJob = state.jobs.find(j => j.id === targetId);
    if (!targetJob) { alert('Задание не выбрано'); return; }

    transferAllPartsToJob(jobId, targetId);

    deleteJob(jobId);
    const next = getActiveJob();
    if (next && next.paramsSnapshot) {
      try { applyParams(next.paramsSnapshot); } catch (_) {}
    }
    refreshJobView();
    initHistory();
    updateButtons();
    close();
    setStatus(`Детали перенесены в «${targetJob.name}», задание «${job.name}» закрыто`);
  };

  // 2. ═══ ЛОГИКА ДЛЯ НОВОЙ КНОПКИ ═══
  modal.querySelector('#btnUnplaceAndDelete').onclick = () => {
    if (!confirm(`Все ${placedCount} разложенных деталей станут неразложенными и перейдут в список активного задания. Задание «${job.name}» будет удалено. Продолжить?`)) return;

    // Определяем целевое (активное) задание, в которое вернём детали
    let targetJob = getActiveJob();
    if (targetJob.id === jobId) {
      // Если удаляем активное задание, берём первое из оставшихся
      targetJob = state.jobs.find(j => j.id !== jobId);
    }

    // Возвращаем детали в список целевого задания
    for (const part of job.parts) {
      targetJob.parts.push({ ...part });
    }

    // Удаляем задание (листы и разложенные детали просто уничтожаются)
    deleteJob(jobId);

    // Переключаемся на целевое задание и обновляем вид
    if (targetJob.id !== state.activeJobId) {
      switchJob(targetJob.id);
    }
    
    if (targetJob.paramsSnapshot) {
      try { applyParams(targetJob.paramsSnapshot); } catch (_) {}
    }

    refreshJobView();
    initHistory();
    updateButtons();
    close();
    setStatus(`Задание «${job.name}» удалено, ${placedCount} дет. возвращены в список для распределения`);
  };

  // 3. Удаление без переноса
  modal.querySelector('#btnDeleteJobForce').onclick = () => {
    if (!confirm(`Точно удалить задание «${job.name}» вместе с ${placedCount} разложенными деталями?`)) return;
    deleteJob(jobId);
    const next = getActiveJob();
    if (next && next.paramsSnapshot) {
      try { applyParams(next.paramsSnapshot); } catch (_) {}
    }
    refreshJobView();
    initHistory();
    updateButtons();
    close();
    setStatus(`Задание «${job.name}» удалено`);
  };
}

function transferAllPartsToJob(sourceJobId, targetJobId) {
  const sourceJob = state.jobs.find(j => j.id === sourceJobId);
  const targetJob = state.jobs.find(j => j.id === targetJobId);
  if (!sourceJob || !targetJob) return;

  const offset = targetJob.parts.length;

  for (const part of sourceJob.parts) {
    targetJob.parts.push({ ...part });
  }

  if (sourceJob.sheets && sourceJob.sheets.length) {
    const tgtParams = targetJob.paramsSnapshot || readParams();
    const buffer = (tgtParams.kerf || 0) + (tgtParams.gap || 0);
    const W = (tgtParams.sheetW || 3000) - 2 * (tgtParams.edge || 0);
    const H = (tgtParams.sheetH || 1500) - 2 * (tgtParams.edge || 0);

    if (!targetJob.sheets) targetJob.sheets = [];

    for (const srcSheet of sourceJob.sheets) {
      for (const pl of srcSheet.placed) {
        const newPartIdx = pl.partIdx + offset;

        let placedOk = false;
        for (const tgtSheet of targetJob.sheets) {
          if (fitsOnSheet(tgtSheet, pl, buffer, W, H, tgtParams)) {
            tgtSheet.placed.push({ ...pl, partIdx: newPartIdx });
            placedOk = true;
            break;
          }
        }
        if (!placedOk) {
          const newSheet = { placed: [], cuts: [], remnants: [], obstacles: [] };
          newSheet.placed.push({ ...pl, partIdx: newPartIdx });
          targetJob.sheets.push(newSheet);
        }
      }
    }
  }

  sourceJob.parts = [];
  sourceJob.sheets = [];
}

function fitsOnSheet(sheet, pl, buffer, W, H, params) {
  if (!pl || !pl.polygons) return false;

  const w = pl.bbox[2] - pl.bbox[0];
  const h = pl.bbox[3] - pl.bbox[1];

  if (pl.x < -1e-3 || pl.y < -1e-3) return false;
  if (pl.x + w > W + 1e-3 || pl.y + h > H + 1e-3) return false;

  if (params.sheetPolygons && params.sheetPolygons.length) {
    const absPolys = pl.polygons.map(r => r.map(([px, py]) => [px + pl.x + params.edge, py + pl.y + params.edge]));
    if (!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) return false;
  }

  if (sheet.obstacles && sheet.obstacles.length) {
    for (const obs of sheet.obstacles) {
      if (pl.x < obs.x2 && pl.x + w > obs.x1 && pl.y < obs.y2 && pl.y + h > obs.y1) return false;
    }
  }

  const absA = pl.polygons.map(r => r.map(([px, py]) => [px + pl.x, py + pl.y]));
  for (const other of sheet.placed) {
    const ob = other.bbox;
    if (pl.x + w + buffer <= ob[0]) continue;
    if (pl.x - buffer >= ob[2]) continue;
    if (pl.y + h + buffer <= ob[1]) continue;
    if (pl.y - buffer >= ob[3]) continue;
    const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if (polysCollide(absA, absB, buffer)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// СТАРЫЙ ФУНКЦИОНАЛ: openJobsModal и связанные (восстановлено)
// ═══════════════════════════════════════════════════════════════

export function openJobsModal() {
  document.querySelectorAll('#jobsModal').forEach(el => el.remove());

  const modal = document.createElement('div');
  modal.id = 'jobsModal';
  modal.className = 'modal-overlay active';
  
  modal.innerHTML = `
    <div class="modal-window" style="width:500px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📁 Перенести в задание</span>
        <button class="close-btn" id="btnCloseJobs" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body" id="jobsListContainer" style="max-height:60vh; overflow-y:auto; padding: 0;">
      </div>
      <div class="modal-footer">
        <button id="btnCancelJobs">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#btnCloseJobs').onclick = close;
  modal.querySelector('#btnCancelJobs').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  renderJobsList();
}

export function closeJobsModal() {
  document.querySelectorAll('#jobsModal').forEach(el => el.remove());
}

function renderJobsList() {
  const container = document.getElementById('jobsListContainer');
  if (!container) return;

  let html = '';
  const otherJobs = state.jobs.filter(j => j.id !== state.activeJobId);
  const selectedCount = state.selectedRows ? state.selectedRows.size : 0;
  
  html += `
    <div style="padding: 15px; background:#f9f9f9; border-bottom:2px solid #c9e0f5;">
      
      <div style="font-weight:bold; margin-bottom:8px; font-size:13px; color:#004a99;">
        Распределить выделенные (${selectedCount} шт.) по новым заданиям:
      </div>
      
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
         <label style="font-size:12px; white-space:nowrap; color:#333;">По сколько деталей:</label>
         <input type="number" id="distributeCount" value="1" min="1" max="${Math.max(1, selectedCount)}" style="width:60px; padding:4px; border:1px solid #bbb; border-radius:4px; text-align:center;">
         <button id="btnDistributeJobs" class="primary" style="flex:1; padding:8px;">📄 Распределить</button>
      </div>

      <button id="btnCreateJobAndTransfer" class="primary" style="width:100%; padding:8px; background:#eaf4ff; color:#004a99; border:1px solid #4a90d9;">
        + Создать одно новое задание (все в одну)
      </button>
    </div>
  `;

  if (otherJobs.length > 0) {
    html += `<div class="hint" style="margin-top:15px; padding:0 10px; font-weight:600; color:#555;">Или выберите существующее задание:</div>`;
    
    html += otherJobs.map(job => {
      const partsCount = job.parts.reduce((s, p) => s + (p.qty || 0), 0);
      return `
        <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; background:#fff;">
          <div style="flex:1;">
            <div style="font-weight:bold; color:#333;">${job.name}</div>
            <div style="font-size:11px; color:#888;">Деталей: ${partsCount}</div>
          </div>
          <button class="small primary" data-job-id="${job.id}" data-action="transfer" style="background:#e8f4ff; color:#004a99; border-color:#4a90d9;">
            ⬅ Перенести
          </button>
        </div>
      `;
    }).join('');
  } else {
    html += `<div style="text-align:center; padding:15px; color:#888;">Нет других заданий.</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('button[data-action="transfer"]').forEach(btn => {
    btn.onclick = () => {
      transferSelectedToJob(btn.dataset.jobId);
    };
  });

  const btnCreateOne = container.querySelector('#btnCreateJobAndTransfer');
  if (btnCreateOne) {
    btnCreateOne.onclick = () => {
      if (!state.selectedRows || !state.selectedRows.size) {
        alert('Сначала выделите детали в таблице.');
        return;
      }
      const name = prompt('Название нового задания:', `Задание №${state.jobs.length + 1}`);
      if (!name) return;
      
      const currentJob = getActiveJob();
      const newJob = createJob(name.trim());
      newJob.paramsSnapshot = currentJob.paramsSnapshot ? { ...currentJob.paramsSnapshot } : null;
      
      const indices = [...state.selectedRows].sort((a, b) => b - a);
      const selectedParts = [...state.selectedRows].sort((a,b)=>a-b).map(idx => currentJob.parts[idx]).filter(Boolean);
      
      newJob.parts = selectedParts.map(p => ({ ...p }));
      
      for (const idx of indices) {
        for (const sheet of currentJob.sheets) {
          sheet.placed = sheet.placed.filter(pl => pl.partIdx !== idx);
          for (const pl of sheet.placed) if (pl.partIdx > idx) pl.partIdx--;
        }
        currentJob.parts.splice(idx, 1);
      }
      
      state.selectedRows.clear();
      closeJobsModal();
      refreshJobView();
      renderPartsTable();
      pushHistory();
      setStatus(`Все выделенные детали перенесены в «${name}»`);
    };
  }

  const btnDistribute = container.querySelector('#btnDistributeJobs');
  if (btnDistribute) {
    btnDistribute.onclick = () => {
      const countInput = container.querySelector('#distributeCount');
      const perJob = Math.max(1, parseInt(countInput.value, 10) || 1);
      
      if (!state.selectedRows || !state.selectedRows.size) {
        alert('Сначала выделите детали в таблице.');
        return;
      }
      
      distributeSelectedParts(perJob);
    };
  }
}

function distributeSelectedParts(perJob) {
  const currentJob = getActiveJob();
  if (!currentJob) return;

  const indices = [...state.selectedRows].sort((a, b) => b - a);
  const selectedParts = [...state.selectedRows].sort((a,b)=>a-b).map(idx => currentJob.parts[idx]).filter(Boolean);

  if (!confirm(`Создать новые задания по ${perJob} дет. (всего ${selectedParts.length} дет.)?`)) return;

  const paramsSnapshot = currentJob.paramsSnapshot ? { ...currentJob.paramsSnapshot } : null;
  const baseName = currentJob.name.replace(/№\d+/, '').trim() || 'Задание';
  let createdJobs = 0;

  for (let i = 0; i < selectedParts.length; i += perJob) {
    const chunk = selectedParts.slice(i, i + perJob);
    const jobName = `${baseName} — ${chunk[0].name.replace(/\.dxf$/i, '')}${chunk.length > 1 ? ' и др.' : ''}`;
    
    const newJob = createJob(jobName);
    newJob.paramsSnapshot = paramsSnapshot;
    newJob.parts = chunk.map(p => ({ ...p }));
    
    createdJobs++;
  }

  for (const idx of indices) {
    for (const sheet of currentJob.sheets) {
      sheet.placed = sheet.placed.filter(pl => pl.partIdx !== idx);
      for (const pl of sheet.placed) if (pl.partIdx > idx) pl.partIdx--;
    }
    currentJob.parts.splice(idx, 1);
  }

  state.selectedRows.clear();
  closeJobsModal();
  refreshJobView();
  renderPartsTable();
  pushHistory();
  setStatus(`Создано ${createdJobs} заданий (по ${perJob} дет.)`);
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