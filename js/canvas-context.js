import { state } from './state.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';
import {
  rotateSelected, mirrorSelected, removePlacedPart, duplicatePlacedPart,
  toggleFixSelected, unfixAllPlaced,
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

  if(hit){
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

  if(hit){
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

  const menuW = 260;
  const menuH = el.offsetHeight || 320;
  let x = screenX, y = screenY;
  if(x + menuW > window.innerWidth - 8)  x = window.innerWidth  - menuW - 8;
  if(y + menuH > window.innerHeight - 8) y = window.innerHeight - menuH - 8;
  el.style.left = Math.max(4, x) + 'px';
  el.style.top  = Math.max(4, y) + 'px';
}