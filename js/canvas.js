import { state } from './state.js';
import { readParams } from './params.js';
import { setStatus } from './utils.js';
import { updateReport } from './report.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory } from './history.js';
import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';
import { computeSnap } from './snap.js';

import {
  canvas, screenToWorld, hitTest, isInGroup,
  partCollidesAt, findNearestFreePosition,
} from './canvas-core.js';
import { draw } from './canvas-draw.js';
import {
  moveDraggedPart,
  enterGroupSelectMode, exitGroupSelectMode,
  finalizeGroupSelect, startGroupDrag, moveGroup, endGroupDrag,
} from './canvas-drag.js';
import {
  rotateSelected, mirrorSelected, removePlacedPart,
  rotateSelectedGroup, mirrorSelectedGroup, deleteSelectedGroup,
  toggleFixGroup,
  startDuplicateDrag, updateDuplicateGhost, commitDuplicateGhost, cancelDuplicateDrag,
} from './canvas-ops.js';
import { enterMeasureMode, exitMeasureMode, handleMeasureClick } from './canvas-measure.js';
import { showContextMenu, hideContextMenu } from './canvas-context.js';
import {
  handleCutClick, updateCutPreview, enterCutMode, exitCutMode,
} from './canvas-cut.js';

// Re-export
export { draw } from './canvas-draw.js';
export { enterMeasureMode, exitMeasureMode } from './canvas-measure.js';
export { enterGroupSelectMode, exitGroupSelectMode } from './canvas-drag.js';
export { enterCutMode, exitCutMode } from './canvas-cut.js';

// ═══════════════════════════════════════════════════════════════
// Глобальные обработчики
// ═══════════════════════════════════════════════════════════════

document.addEventListener('mousedown', e => {
  const el = document.getElementById('contextMenu');
  if(el && el.style.display !== 'none' && !el.contains(e.target)) hideContextMenu();
}, true);

document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !state.measureMode && !state.cutMode) hideContextMenu();
});

window.addEventListener('resize', () => hideContextMenu());
window.addEventListener('scroll', () => hideContextMenu(), true);

// Перехват для групповой фиксации
const _btnFixToggle = document.getElementById('btnFixToggle');
if(_btnFixToggle){
  _btnFixToggle.addEventListener('click', e => {
    if(state.selectedParts && state.selectedParts.length){
      e.stopImmediatePropagation();
      toggleFixGroup();
    }
  }, true);
}

// ─── Mouse down ───

canvas.addEventListener('mousedown', e => {
  if(e.button !== 0) return;

  if(state.cutMode){
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if(w) handleCutClick(w.x, w.y, e.shiftKey, e.ctrlKey || e.metaKey);
    return;
  }

  if(state.measureMode){
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if(w) handleMeasureClick(w);
    return;
  }

  if(state.groupSelectMode){
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    state.groupSelectDrag = { x0: lx, y0: ly, x1: lx, y1: ly, _shift: !!e.shiftKey, _fromMouse: false };
    draw();
    return;
  }

  if(!state.sheets.length) return;

  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const w = screenToWorld(px, py); if(!w) return;
  const hit = hitTest(w.x, w.y);

  // ─── РЕЖИМ ДУБЛИРОВАНИЯ ───
  if(state.duplicateMode){
    e.preventDefault();

    if(state.duplicateGhost){
      state.duplicateGhost._attached = true;
      state.duplicateGhost._dragging = true;
      updateDuplicateGhost(w);
      canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
      draw();
      return;
    }

    if(hit){
      if(startDuplicateDrag(w, hit)){
        state.duplicateGhost._dragging = true;
        canvas.style.cursor = 'copy';
        draw();
      }
      return;
    }

    return;
  }

  if(!hit){
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    state.groupSelectDrag = { x0: lx, y0: ly, x1: lx, y1: ly, _shift: !!e.shiftKey, _fromMouse: true };
    draw();
    return;
  }

  const pl = state.sheets[hit.sheetIdx].placed[hit.placedIdx];
  const inGroup = isInGroup(hit.sheetIdx, hit.placedIdx);

  if(inGroup){
    state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };
    if(pl._fixed){
      draw();
      setStatus('Деталь зафиксирована — снимите фиксацию, чтобы переместить');
      return;
    }
    if(!startGroupDrag(w)){
      draw();
      setStatus('Все выделенные детали зафиксированы — двигать нечего');
      return;
    }
    canvas.style.cursor = 'grabbing';
    draw();
    return;
  }

  state.selectedParts = [];
  state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };

  if(pl._fixed){
    canvas.style.cursor = '';
    draw();
    setStatus('Деталь зафиксирована — снимите фиксацию, чтобы переместить');
    return;
  }

  state.drag = {
    grabDx: w.x - hit.worldX,
    grabDy: w.y - hit.worldY,
    startX: w.x, startY: w.y,
    _moved: false,
    orig: {
      sheetIdx: hit.sheetIdx,
      placedIdx: hit.placedIdx,
      x: pl.x, y: pl.y,
      bbox: [...pl.bbox]
    }
  };
  canvas.style.cursor = 'grabbing';
  draw();
});

// ─── Mouse move ───

window.addEventListener('mousemove', e => {
  if(state.cutMode){
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if(w){ updateCutPreview(w.x, w.y, e.shiftKey, e.ctrlKey || e.metaKey); draw(); }
    return;
  }
  if(state.measureMode){
    if(state.measurePoints.length === 1){
      const rect = canvas.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if(w){
        state.measurePreview = { a: state.measurePoints[0], b: { x: w.x, y: w.y } };
        draw();
      }
    }
    return;
  }

  if(state.duplicateMode && state.duplicateGhost){
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if(px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    const w = screenToWorld(px, py);
    if(w){
      state.duplicateGhost._attached = true;
      updateDuplicateGhost(w);
      canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
      draw();
    }
    return;
  }

  if(state.groupSelectDrag){
    const rect = canvas.getBoundingClientRect();
    state.groupSelectDrag.x1 = e.clientX - rect.left;
    state.groupSelectDrag.y1 = e.clientY - rect.top;
    draw();
    return;
  }
  if(state.groupDrag){
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if(w){ moveGroup(w); draw(); }
    return;
  }
  if(!state.drag) return;
  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if(!w) return;
  moveDraggedPart(w);
  draw();
});

// ─── Mouse up ───

window.addEventListener('mouseup', e => {
  if(state.cutMode) return;
  if(state.measureMode) return;

  // ─── РЕЖИМ ДУБЛИРОВАНИЯ: фиксация группы копий ───
  if(state.duplicateMode && state.duplicateGhost && state.duplicateGhost._dragging){
    const savedSrc = state.duplicateSource
      ? { sheetIdx: state.duplicateSource.sheetIdx, indices: (state.duplicateSource.indices || []).slice() }
      : null;
    const success = commitDuplicateGhost();

    if(success && savedSrc && savedSrc.indices.length){
      const newSel = savedSrc.indices.map(idx => ({ sheetIdx: savedSrc.sheetIdx, placedIdx: idx }));
      import('./canvas-ops.js').then(m => {
        if(m && typeof m.startDuplicateDragFromSelection === 'function'){
          m.startDuplicateDragFromSelection(newSel);
          if(state.duplicateGhost){
            state.duplicateGhost._attached = true;
            state.duplicateGhost._dragging = false;
            const rect = canvas.getBoundingClientRect();
            if(e.clientX >= rect.left && e.clientX <= rect.right &&
               e.clientY >= rect.top  && e.clientY <= rect.bottom){
              const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
              if(w) updateDuplicateGhost(w);
            }
            canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
          }
          draw();
        }
      });
    } else if(state.duplicateGhost){
      state.duplicateGhost._dragging = false;
      canvas.style.cursor = 'not-allowed';
    }
    draw();
    return;
  }

  if(state.groupSelectDrag){ finalizeGroupSelect(); return; }
  if(state.groupDrag){ endGroupDrag(); return; }
  if(!state.drag) return;

  const drag = state.drag;
  const sheet = state.sheets[drag.orig.sheetIdx];
  const pl = sheet && sheet.placed[drag.orig.placedIdx];
  const moved = !!drag._moved;

  state.snapGuides = null;
  canvas.style.cursor = '';

  if(pl && moved){
    const params = readParams();
    const W = params.sheetW - 2*params.edge;
    const H = params.sheetH - 2*params.edge;
    const buffer = params.kerf + params.gap;
    const myW = pl.bbox[2] - pl.bbox[0];
    const myH = pl.bbox[3] - pl.bbox[1];

    if(pl._collides){
      const free = findNearestFreePosition(sheet, pl, pl.x, pl.y, W, H, buffer);
      if(free.found){
        pl.x = free.x; pl.y = free.y;
        pl.bbox = [pl.x, pl.y, pl.x + myW, pl.y + myH];
        pl._collides = false;
        setStatus('Деталь сдвинута встык, чтобы избежать наложения');
        if(!drag._gridUsed && !state.snapDisabled && params.snapThreshold > 0){
          const snap = computeSnap(sheet, pl, pl.x, pl.y, W, H, myW, myH, buffer, params.snapThreshold);
          if((snap.x !== pl.x || snap.y !== pl.y) &&
             !partCollidesAt(sheet, pl, snap.x, snap.y, buffer, W, H)){
            pl.x = snap.x; pl.y = snap.y;
            pl.bbox = [snap.x, snap.y, snap.x + myW, snap.y + myH];
          }
        }
      } else {
        pl.x = drag.orig.x;
        pl.y = drag.orig.y;
        pl.bbox = [...drag.orig.bbox];
        pl._collides = false;
        setStatus('Наложение — нет места рядом, позиция восстановлена');
      }
    } else if(!drag._gridUsed && !state.snapDisabled && params.snapThreshold > 0){
      const snap = computeSnap(sheet, pl, pl.x, pl.y, W, H, myW, myH, buffer, params.snapThreshold);
      if((snap.x !== pl.x || snap.y !== pl.y) &&
         !partCollidesAt(sheet, pl, snap.x, snap.y, buffer, W, H)){
        pl.x = snap.x; pl.y = snap.y;
        pl.bbox = [snap.x, snap.y, snap.x + myW, snap.y + myH];
        pl._collides = false;
      }
    }
  }

  state.drag = null;
  draw();
  updateReport();
  if(moved) pushHistory();
});

// ─── Context menu ───

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();

  if(state.duplicateGhost){
    cancelDuplicateDrag();
    return;
  }

  if(state.cutMode){ exitCutMode(); return; }
  if(state.measureMode){ exitMeasureMode(); return; }
  if(state.groupSelectMode){ exitGroupSelectMode(); return; }
  if(!state.sheets.length) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const w = screenToWorld(px, py); if(!w) return;
  const hit = hitTest(w.x, w.y);
  if(hit){
    const inGroup = isInGroup(hit.sheetIdx, hit.placedIdx);
    if(!inGroup){
      state.selectedParts = [];
      state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };
      draw();
    }
  }
  showContextMenu(e.clientX, e.clientY, hit);
});

// ─── Клавиатура ───

document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    if(state.cutMode){
      if(state.cutPoints.length > 0){
        state.cutPoints = [];
        state.cutPreview = null;
        setStatus('Рез отменён');
        draw();
      } else exitCutMode();
      return;
    }
    if(state.measureMode){
      if(state.measurePoints.length > 0){
        state.measurePoints = [];
        state.measurePreview = null;
        setStatus('Измерение отменено');
        draw();
      } else exitMeasureMode();
      return;
    }
    if(state.groupSelectMode || state.groupSelectDrag){
      exitGroupSelectMode();
      return;
    }
    if(state.duplicateGhost){
      cancelDuplicateDrag();
      setStatus('Копия отменена. Продолжайте перетаскивать или нажмите Esc для выхода.');
      return;
    }
    if(state.duplicateMode){
      state.duplicateMode = false;
      state.duplicateGhost = null;
      state.duplicateSource = null;
      canvas.style.cursor = '';
      const btn = document.getElementById('btnDuplicateSelected');
      if(btn) btn.classList.remove('active');
      setStatus('Режим дублирования выключен');
      draw();
      return;
    }
    if(state.selectedParts && state.selectedParts.length){
      state.selectedParts = [];
      draw();
      setStatus('');
      return;
    }
    if(state.selectedPart){ state.selectedPart = null; draw(); }
    return;
  }

  if(e.key === 'Delete' || e.key === 'Backspace'){
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    if(state.selectedParts && state.selectedParts.length){
      e.preventDefault();
      deleteSelectedGroup();
      return;
    }
    if(state.selectedPart){
      e.preventDefault();
      if(removePlacedPart(state.selectedPart.sheetIdx, state.selectedPart.placedIdx)) pushHistory();
    }
    return;
  }

  if(e.ctrlKey || e.metaKey) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if(tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

  if(e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К'){
    if(state.selectedParts && state.selectedParts.length){
      e.preventDefault();
      if(rotateSelectedGroup(e.shiftKey ? -1 : 1)) pushHistory();
      return;
    }
    if(!state.selectedPart) return;
    e.preventDefault();
    if(rotateSelected(e.shiftKey ? -1 : 1)) pushHistory();
    return;
  }

  if(e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я'){
    if(state.selectedParts && state.selectedParts.length){
      e.preventDefault();
      if(mirrorSelectedGroup(e.shiftKey ? 'y' : 'x')) pushHistory();
      return;
    }
    if(!state.selectedPart) return;
    e.preventDefault();
    if(mirrorSelected(e.shiftKey ? 'y' : 'x')) pushHistory();
    return;
  }
});

// ─── Drag-drop деталей из таблицы на холст ───

function findDropTarget(wx, wy){
  const v = state.view;
  if(!v) return null;
  const { SW, SH, gapBetween, params } = v;
  for(let si=0; si<state.sheets.length; si++){
    const x0 = si * (SW + gapBetween);
    if(wx >= x0 && wx <= x0 + SW && wy >= 0 && wy <= SH){
      return { sheetIdx: si, x: wx - x0 - params.edge, y: wy - params.edge };
    }
  }
  if(!state.sheets.length) return null;
  let bestSi = 0, bestD = Infinity;
  for(let si=0; si<state.sheets.length; si++){
    const x0 = si * (SW + gapBetween);
    const cx = x0 + SW / 2, cy = SH / 2;
    const d = Math.hypot(wx - cx, wy - cy);
    if(d < bestD){ bestD = d; bestSi = si; }
  }
  const x0 = bestSi * (SW + gapBetween);
  return { sheetIdx: bestSi, x: wx - x0 - params.edge, y: wy - params.edge };
}

function computePartPlacement(part, tx, ty, W, H){
  let x = tx - part.width / 2;
  let y = ty - part.height / 2;
  if(x < 0) x = 0;
  if(y < 0) y = 0;
  if(x + part.width > W) x = Math.max(0, W - part.width);
  if(y + part.height > H) y = Math.max(0, H - part.height);
  return { x, y };
}

canvas.addEventListener('dragover', e => {
  if(state.draggedPartIdx == null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';

  const hint = document.getElementById('canvasHint');
  if(!state.sheets.length){
    if(hint) hint.textContent = 'Отпустите — будет создан новый лист';
    return;
  }
  const v = state.view;
  if(!v) return;
  const { SW, params } = v;

  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if(!w) return;

  const part = state.parts[state.draggedPartIdx];
  if(!part) return;

  const target = findDropTarget(w.x, w.y);
  if(!target){ state.dropPreview = null; draw(); return; }

  const W = SW - 2 * params.edge;
  const H = v.SH - 2 * params.edge;
  const pos = computePartPlacement(part, target.x, target.y, W, H);

  const prev = state.dropPreview;
  const changed = !prev || prev.partIdx !== state.draggedPartIdx ||
                  prev.sheetIdx !== target.sheetIdx ||
                  Math.abs(prev.x - pos.x) > 0.5 || Math.abs(prev.y - pos.y) > 0.5;
  if(!changed) return;

  state.dropPreview = {
    partIdx: state.draggedPartIdx,
    sheetIdx: target.sheetIdx,
    x: pos.x, y: pos.y,
    w: part.width, h: part.height,
  };
  draw();
});

canvas.addEventListener('dragleave', e => {
  const rect = canvas.getBoundingClientRect();
  if(e.clientX <= rect.left || e.clientX >= rect.right ||
     e.clientY <= rect.top  || e.clientY >= rect.bottom){
    if(state.dropPreview){ state.dropPreview = null; draw(); }
  }
});

canvas.addEventListener('drop', e => {
  if(state.draggedPartIdx == null) return;
  e.preventDefault();
  e.stopPropagation();

  const partIdx = state.draggedPartIdx;
  state.draggedPartIdx = null;
  state.dropPreview = null;
  state._dropHandled = true;
  state.snapGuides = null;

  const part = state.parts[partIdx];
  if(!part){ draw(); return; }

  if(!state.sheets.length){
    state.sheets.push({ placed: [], cuts: [], remnants: [] });
    draw();
  }

  const v = state.view;
  if(!v) return;
  const { SW, SH, params } = v;

  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if(!w) return;

  const target = findDropTarget(w.x, w.y);
  if(!target) return;

  const W = SW - 2 * params.edge;
  const H = SH - 2 * params.edge;
  const pos = computePartPlacement(part, target.x, target.y, W, H);

  const newPolygons = part.polygons.map(r => r.map(([x, y]) => [x, y]));
  const newPlaced = {
    partIdx,
    polygons: newPolygons,
    x: pos.x, y: pos.y,
    bbox: [pos.x, pos.y, pos.x + part.width, pos.y + part.height],
    _manual: true,
  };

  const sheet = state.sheets[target.sheetIdx];
  sheet.placed.push(newPlaced);
  state.selectedPart = { sheetIdx: target.sheetIdx, placedIdx: sheet.placed.length - 1 };
  state.selectedParts = [];

  const buffer = params.kerf + params.gap;
  const absA = newPolygons.map(r => r.map(([x, y]) => [x + pos.x, y + pos.y]));
  let collides = false;
  for(const other of sheet.placed){
    if(other === newPlaced) continue;
    const absB = other.polygons.map(r => r.map(([x, y]) => [x + other.x, y + other.y]));
    if(polysCollide(absA, absB, buffer)){ collides = true; break; }
  }

  if(params.sheetPolygons && params.sheetPolygons.length){
    const absPolys = newPolygons.map(r => r.map(([x,y]) => [x + pos.x + params.edge, y + pos.y + params.edge]));
    if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){
      setStatus(`⚠ Деталь размещена вне контура заготовки: ${part.name}`);
    }
  }

  draw();
  updateReport();
  refreshPartsStatus();
  setStatus(collides
    ? `⚠ Деталь размещена с наложением: ${part.name}`
    : `Деталь размещена: ${part.name}`);
  pushHistory();
});

// ─── Shift / Alt ───

document.addEventListener('keydown', e => {
  if(e.key === 'Shift' && !state.snapDisabled){
    state.snapDisabled = true;
    if(state.drag) state.snapGuides = null;
  }
  if(e.key === 'Alt'){
    state.gridSnapMode = true;
    if(state.drag) state.snapGuides = null;
  }
});
document.addEventListener('keyup', e => {
  if(e.key === 'Shift') state.snapDisabled = false;
  if(e.key === 'Alt')   state.gridSnapMode = false;
});
window.addEventListener('blur', () => {
  state.snapDisabled = false;
  state.gridSnapMode = false;
});

window.addEventListener('resize', draw);

draw();