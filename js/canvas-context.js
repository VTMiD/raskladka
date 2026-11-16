// js/canvas-context.js
import { state } from './state.js';
import { printPartDrawing, printPartsDrawing } from './report/report.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';
import {
  rotateSelected, mirrorSelected, removePlacedPart, duplicatePlacedPart,
  toggleFixSelected, unfixAllPlaced,
  rotateSelectedGroup, mirrorSelectedGroup, deleteSelectedGroup,
  toggleFixGroup, duplicateSelection,
} from './canvas-ops.js';

const contextMenuEl = () => document.getElementById('contextMenu');

export function hideContextMenu(){
  const el = contextMenuEl();
  if(el){ el.style.display = 'none'; el.innerHTML = ''; }
}

function buildContextMenuItem(label, handler, opts = {}){
  const el = document.createElement('div');
  el.className = 'context-menu-item'
    + (opts.danger ? ' danger' : '')
    + (opts.disabled ? ' disabled' : '');
  el.textContent = label;
  if(!opts.disabled){
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      hideContextMenu();
      try { handler(); } catch(err){ console.error(err); setStatus('Ошибка: ' + err.message); }
    });
  }
  return el;
}

function runNestRemainder(){
  import('./fixing.js')
    .then(m => m.nestRemainder())
    .catch(err => { console.error(err); setStatus('Ошибка: ' + err.message); });
}

function setLayerForSelection(layerId) {
  const isGroup = !!(state.selectedParts && state.selectedParts.length > 0);
  let count = 0;
  
  if (isGroup) {
    for (const sp of state.selectedParts) {
      const pl = state.sheets[sp.sheetIdx]?.placed[sp.placedIdx];
      if (pl) { pl.layerId = layerId; count++; }
    }
  } else if (state.selectedPart) {
    const pl = state.sheets[state.selectedPart.sheetIdx]?.placed[state.selectedPart.placedIdx];
    if (pl) { pl.layerId = layerId; count++; }
  }

  if (count > 0) {
    import('./canvas/render.js').then(m => m.draw());
    pushHistory();
    const layerName = state.layers.find(l => l.id === layerId)?.name || layerId;
    setStatus(`Перенесено в слой «${layerName}»: ${count} дет.`);
  }
}

function showLayerPicker() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '2000';
  
  const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
  
  const layerButtons = sortedLayers.map(l => `
    <button class="layer-select-btn" data-id="${l.id}" style="display:flex; align-items:center; gap:10px; width:100%; padding:10px; margin-bottom:6px; border:1px solid #ccc; background:#fff; border-radius:4px; cursor:pointer; text-align:left; transition:background .15s;">
      <span style="width:16px; height:16px; border-radius:50%; background:${l.color}; display:inline-block; border:1px solid rgba(0,0,0,0.2);"></span>
      <span style="font-size:13px; font-weight:500;">${l.name}</span>
    </button>
  `).join('');

  modal.innerHTML = `
    <div class="modal-window" style="width:300px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>🎨 Перенести на слой</span>
        <button class="close-btn" id="btnCloseLayerPicker" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body" style="padding:15px; max-height: 400px; overflow-y: auto;">
        ${layerButtons}
      </div>
      <div class="modal-footer">
        <button id="btnCancelLayerPicker">Отмена</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelectorAll('.layer-select-btn').forEach(btn => {
    btn.onmouseover = () => btn.style.background = '#eaf4ff';
    btn.onmouseout = () => btn.style.background = '#fff';
  });

  const close = () => modal.remove();
  
  modal.querySelector('#btnCloseLayerPicker').onclick = close;
  modal.querySelector('#btnCancelLayerPicker').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  
  modal.querySelectorAll('.layer-select-btn').forEach(btn => {
    btn.onclick = () => {
      const layerId = parseInt(btn.dataset.id, 10);
      setLayerForSelection(layerId);
      close();
    };
  });
}

// ─── Уникальные детали из выделенной группы ───
function collectUniqueSelectedParts() {
  const uniqueParts = [];
  const seen = new Set();
  const sel = state.selectedParts || [];
  for (const sp of sel) {
    const sh = state.sheets[sp.sheetIdx];
    const placed = sh && sh.placed[sp.placedIdx];
    if (!placed) continue;
    const pi = placed.partIdx;
    if (seen.has(pi)) continue;
    seen.add(pi);
    const p = state.parts[pi];
    if (p) uniqueParts.push(p);
  }
  return uniqueParts;
}

// ─── Логика переноса деталей в задание ───
function performTransfer(sel, targetJobId) {
  import('./state.js').then(m => {
    const targetJob = state.jobs.find(j => j.id === targetJobId);
    if (!targetJob) return;
    
    const currentJob = m.getActiveJob();
    if (!currentJob) return;

    // 1. Группируем выделенные экземпляры по partIdx
    const countByPart = {};
    for (const sp of sel) {
      const sheet = state.sheets[sp.sheetIdx];
      if (!sheet) continue;
      const pl = sheet.placed[sp.placedIdx];
      if (!pl) continue;
      const pi = pl.partIdx;
      if (!countByPart[pi]) countByPart[pi] = 0;
      countByPart[pi]++;
    }

    // 2. Переносим: для каждой детали создаём копию в целевом задании с нужным qty
    for (const [partIdxStr, count] of Object.entries(countByPart)) {
      const partIdx = parseInt(partIdxStr, 10);
      const part = currentJob.parts[partIdx];
      if (!part) continue;

      targetJob.parts.push({ ...part, qty: count });

      part.qty = (part.qty || 1) - count;
      if (part.qty <= 0) {
        const removedIdx = partIdx;
        currentJob.parts.splice(removedIdx, 1);
        for (const sh of currentJob.sheets) {
          for (const p of sh.placed) {
            if (p.partIdx > removedIdx) p.partIdx--;
          }
        }
      }
    }

    // 3. Удаляем выделенные экземпляры с холста
    const sortedSel = [...sel].sort((a, b) => {
      if (a.sheetIdx !== b.sheetIdx) return b.sheetIdx - a.sheetIdx;
      return b.placedIdx - a.placedIdx;
    });
    for (const sp of sortedSel) {
      const sheet = state.sheets[sp.sheetIdx];
      if (sheet) sheet.placed.splice(sp.placedIdx, 1);
    }

    // 4. ОСТАЕМСЯ В ТЕКУЩЕМ ЗАДАНИИ
    // Сбрасываем выделение, так как детали больше нет на холсте
    state.selectedPart = null;
    state.selectedParts = [];
    state.selectedRows.clear();

    // 5. Обновляем интерфейс текущего задания
    import('./parts.js').then(pm => {
      pm.renderPartsTable();
      pm.renderJobSelect();
      pm.updateSelectionUI();
      import('./canvas.js').then(cm => cm.draw());
      import('./report/report.js').then(rm => rm.updateReport());
    });
    
    setStatus(`Перенесено деталей: ${sel.length} в «${targetJob.name}»`);
  });
}

export function showContextMenu(screenX, screenY, hit){
  const el = contextMenuEl();
  if(!el) return;
  el.innerHTML = '';
  el.style.display = 'block';

  const isGroup = !!(state.selectedParts && state.selectedParts.length > 1);

  if(isGroup){
    let allFixed = true;
    for(const sp of state.selectedParts){
      const pl = state.sheets[sp.sheetIdx]?.placed[sp.placedIdx];
      if(!pl || !pl._fixed){ allFixed = false; break; }
    }
    el.appendChild(buildContextMenuItem(
      allFixed
        ? `🔓 Снять фиксацию (выделенные: ${state.selectedParts.length})`
        : `📌 Зафиксировать выделенные (${state.selectedParts.length})`,
      () => toggleFixGroup()
    ));
    el.appendChild(document.createElement('div')).className = 'context-menu-sep';
  } else if(hit){
    const pl = state.sheets[hit.sheetIdx]?.placed[hit.placedIdx];
    if(pl){
      const isFixed = !!pl._fixed;
      el.appendChild(buildContextMenuItem(
        isFixed ? '🔓 Снять фиксацию (деталь)' : '📌 Зафиксировать деталь',
        () => toggleFixSelected()
      ));
      el.appendChild(document.createElement('div')).className = 'context-menu-sep';
    }
  }

  if (isGroup || hit) {
    el.appendChild(buildContextMenuItem(
      '🎨 Перенести на слой...',
      () => showLayerPicker()
    ));

    // ═══ ПУНКТ: ПЕРЕНЕСТИ В ЗАДАНИЕ (выбор из списка) ═══
    el.appendChild(buildContextMenuItem(
      '📁 Перенести в задание...',
      () => {
        // 1. Собираем выделенные экземпляры с холста
        let sel = [];
        if (state.selectedParts && state.selectedParts.length) {
          sel = state.selectedParts.map(sp => ({ sheetIdx: sp.sheetIdx, placedIdx: sp.placedIdx }));
        } else if (state.selectedPart) {
          sel = [{ sheetIdx: state.selectedPart.sheetIdx, placedIdx: state.selectedPart.placedIdx }];
        }
        if (!sel.length) {
          setStatus('Сначала выделите детали');
          return;
        }

        // 2. Собираем список заданий (кроме текущего)
        const currentJobId = state.activeJobId;
        const otherJobs = state.jobs.filter(j => j.id !== currentJobId);

        // 3. Создаём модальное окно для выбора
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.style.zIndex = '2000';
        
        const jobButtons = otherJobs.map(j => `
          <button class="job-select-btn" data-id="${j.id}" style="display:flex; align-items:center; gap:10px; width:100%; padding:12px; margin-bottom:8px; border:1px solid #ccc; background:#fff; border-radius:4px; cursor:pointer; text-align:left; transition:background .15s;">
            <span style="font-size:20px;">📁</span>
            <div style="flex:1;">
              <div style="font-weight:bold; font-size:14px; color:#004a99;">${j.name}</div>
              <div style="font-size:11px; color:#888;">Деталей: ${j.parts.reduce((s, p) => s + (p.qty || 0), 0)}</div>
            </div>
          </button>
        `).join('');

        modal.innerHTML = `
          <div class="modal-window" style="width:400px">
            <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
              <span>📁 Перенести в задание</span>
              <button class="close-btn" id="btnCloseJobPicker" style="color:#004a99">✕</button>
            </div>
            <div class="modal-body" style="padding:15px; max-height: 400px; overflow-y: auto;">
              ${jobButtons || '<div style="text-align:center;color:#888;padding:20px;">Нет других заданий. Создайте новое.</div>'}
              <button id="btnCreateNewJobFromPicker" style="width:100%; padding:10px; margin-top:10px; background:#eaf4ff; border:1px dashed #4a90d9; border-radius:4px; cursor:pointer; color:#004a99; font-weight:bold;">+ Создать новое задание</button>
            </div>
            <div class="modal-footer">
              <button id="btnCancelJobPicker">Отмена</button>
            </div>
          </div>`;

        document.body.appendChild(modal);

        // Обработчики
        const close = () => modal.remove();
        
        modal.querySelector('#btnCloseJobPicker').onclick = close;
        modal.querySelector('#btnCancelJobPicker').onclick = close;
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        // Создать новое задание
        modal.querySelector('#btnCreateNewJobFromPicker').onclick = () => {
          close();
          const defaultName = `Задание №${state.jobs.length + 1}`;
          const name = prompt('Название нового задания:', defaultName);
          if (name === null) return;
          const finalName = (name || '').trim() || defaultName;
          
          import('./state.js').then(m => {
            const newJob = m.createJob(finalName);
            performTransfer(sel, newJob.id);
          });
        };

        // Выбор существующего задания
        modal.querySelectorAll('.job-select-btn').forEach(btn => {
          btn.onmouseover = () => btn.style.background = '#eaf4ff';
          btn.onmouseout = () => btn.style.background = '#fff';
          btn.onclick = () => {
            const jobId = btn.dataset.id;
            close();
            performTransfer(sel, jobId);
          };
        });
      }
    ));

    el.appendChild(document.createElement('div')).className = 'context-menu-sep';
  }

  el.appendChild(buildContextMenuItem('🔓 Снять фиксацию со всех', () => unfixAllPlaced()));
  el.appendChild(buildContextMenuItem('▶ На остатке', () => runNestRemainder()));

  if(isGroup){
    el.appendChild(document.createElement('div')).className = 'context-menu-sep';
    el.appendChild(buildContextMenuItem('🔄 Повернуть на 90° (R)', () => {
      if(rotateSelectedGroup(1)) pushHistory();
    }));
    el.appendChild(buildContextMenuItem('🔃 Зеркально ↔ (Z)', () => {
      if(mirrorSelectedGroup('x')) pushHistory();
    }));
    el.appendChild(buildContextMenuItem('🔃 Зеркально ↕ (Shift+Z)', () => {
      if(mirrorSelectedGroup('y')) pushHistory();
    }));
    el.appendChild(document.createElement('div')).className = 'context-menu-sep';

    const uniqueParts = collectUniqueSelectedParts();
    if (uniqueParts.length > 0) {
      el.appendChild(buildContextMenuItem(
        `📐 Печать выделенных чертежей (${uniqueParts.length} уник., A4)`,
        () => printPartsDrawing(uniqueParts)
      ));
      el.appendChild(document.createElement('div')).className = 'context-menu-sep';
    }

    el.appendChild(buildContextMenuItem(
      `⧉ Дублировать выделенные (${state.selectedParts.length})`,
      () => duplicateSelection()
    ));
    el.appendChild(buildContextMenuItem(
      `🗑 Удалить выделенные (${state.selectedParts.length})`,
      () => deleteSelectedGroup(),
      { danger: true }
    ));
  } else if(hit){
    const pl = state.sheets[hit.sheetIdx]?.placed[hit.placedIdx];
    const isFixed = !!(pl && pl._fixed);
    el.appendChild(document.createElement('div')).className = 'context-menu-sep';
    el.appendChild(buildContextMenuItem('🔄 Повернуть на 90° (R)', () => {
      if(rotateSelected(1)) pushHistory();
    }, { disabled: isFixed }));
    el.appendChild(buildContextMenuItem('🔃 Зеркально ↔ (Z)', () => {
      if(mirrorSelected('x')) pushHistory();
    }, { disabled: isFixed }));
    el.appendChild(buildContextMenuItem('🔃 Зеркально ↕ (Shift+Z)', () => {
      if(mirrorSelected('y')) pushHistory();
    }, { disabled: isFixed }));
    
    el.appendChild(document.createElement('div')).className = 'context-menu-sep';

    el.appendChild(buildContextMenuItem('🔢 Задать номер реза...', () => {
      const current = pl._cutOrder || '';
      const v = prompt('Введите номер реза (1, 2, 3...):', current);
      if (v === null) return;
      const num = parseInt(v, 10);
      
      if (!isNaN(num) && num > 0) {
        for (const p of state.sheets[hit.sheetIdx].placed) {
          p._manualCutOrder = false;
        }
        pl._cutOrder = num;
        pl._manualCutOrder = true;
        import('./cut-order.js').then(m => {
          m.assignCutOrder(state.sheets[hit.sheetIdx]);
          import('./canvas/render.js').then(d => d.draw());
          pushHistory();
          setStatus(`Деталь назначена номером ${num}`);
        });
      }
    }));

    el.appendChild(buildContextMenuItem('📐 Печать чертежа детали (A4)', () => {
      const part = state.parts[pl.partIdx];
      if (part) printPartDrawing(part);
    }));

    el.appendChild(buildContextMenuItem('⧉ Дублировать деталь', () => duplicatePlacedPart(hit.sheetIdx, hit.placedIdx)));
    el.appendChild(buildContextMenuItem('🗑 Удалить деталь', () => {
      if(removePlacedPart(hit.sheetIdx, hit.placedIdx)) pushHistory();
    }, { danger: true, disabled: isFixed }));
  }

  el.appendChild(document.createElement('div')).className = 'context-menu-sep';
  el.appendChild(buildContextMenuItem('✖ Закрыть', () => {}));

  const menuW = 280;
  const menuH = el.offsetHeight || 320;
  let x = screenX, y = screenY;
  if(x + menuW > window.innerWidth - 8)  x = window.innerWidth  - menuW - 8;
  if(y + menuH > window.innerHeight - 8) y = window.innerHeight - menuH - 8;
  el.style.left = Math.max(4, x) + 'px';
  el.style.top  = Math.max(4, y) + 'px';
}