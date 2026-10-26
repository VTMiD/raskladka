import { state } from './state.js';
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

export function showContextMenu(screenX, screenY, hit){
  const el = contextMenuEl();
  if(!el) return;
  el.innerHTML = '';
  el.style.display = 'block';

  // Групповой режим: есть выделенные детали (2+ или 1 в selectedParts)
  const isGroup = !!(state.selectedParts && state.selectedParts.length > 0);

  // ─── Блок фиксации ───
  if(isGroup){
    // Определяем, все ли выделенные уже зафиксированы (для подписи)
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

  el.appendChild(buildContextMenuItem('🔓 Снять фиксацию со всех', () => unfixAllPlaced()));
  el.appendChild(buildContextMenuItem('▶ На остатке', () => runNestRemainder()));

  // ─── Блок действий с выделением / деталью ───
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