// js/canvas.js
import { state } from './state.js';
import { readParams } from './params.js';
import { setStatus } from './utils.js';
import { updateReport } from './report/report.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory, schedulePush } from './history.js';
import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';
import { computeSnap } from './snap.js';

import {
  canvas, screenToWorld, hitTest, isInGroup,
  partCollidesAt, findNearestFreePosition,
} from './canvas-core.js';

// Отрисовка берется из папки canvas
import { draw, resetCamera } from './canvas/render.js';

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
import {
  enterRemnantMode, exitRemnantMode,
  handleRemnantClick, updateRemnantPreview,
} from './canvas-remnant.js';

export { draw, resetCamera } from './canvas/render.js';
export { enterMeasureMode, exitMeasureMode } from './canvas-measure.js';
export { enterGroupSelectMode, exitGroupSelectMode } from './canvas-drag.js';
export { enterCutMode, exitCutMode } from './canvas-cut.js';
export { enterRemnantMode, exitRemnantMode } from './canvas-remnant.js';

function togglePartInSelection(sheetIdx, placedIdx) {
  if (!Array.isArray(state.selectedParts)) state.selectedParts = [];
  if (state.selectedPart && state.selectedParts.length === 0) {
    state.selectedParts = [{ sheetIdx: state.selectedPart.sheetIdx, placedIdx: state.selectedPart.placedIdx }];
    state.selectedPart = null;
  }
  const idx = state.selectedParts.findIndex(sp => sp.sheetIdx === sheetIdx && sp.placedIdx === placedIdx);
  if (idx >= 0) state.selectedParts.splice(idx, 1);
  else state.selectedParts.push({ sheetIdx, placedIdx });
  
  if (state.selectedParts.length === 0) state.selectedPart = null;
  else if (state.selectedParts.length === 1) state.selectedPart = state.selectedParts[0];
  else state.selectedPart = null;
}

document.addEventListener('mousedown', e => {
  const el = document.getElementById('contextMenu');
  if (el && el.style.display !== 'none' && !el.contains(e.target)) hideContextMenu();
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !state.measureMode && !state.cutMode && !state.remnantMode) hideContextMenu();
});

window.addEventListener('resize', () => { hideContextMenu(); draw(); });
window.addEventListener('scroll', () => hideContextMenu(), true);

// ─── Зум колесом мыши ───
canvas.addEventListener('wheel', e => {
  const v = state.view;
  if (!v) return;
  if (state.drag || state.groupDrag || state.duplicateGhost) return;

  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const wx = (px - v.originX) / v.scale;
  const wy = (v.originY - py) / v.scale;
  const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
  const newScale = Math.max(0.02, Math.min(80, v.scale * factor));
  if (Math.abs(newScale - v.scale) < 1e-6) return;

  if (!state.camera) state.camera = {};
  state.camera.scale = newScale;
  state.camera.originX = px - wx * newScale;
  state.camera.originY = py + wy * newScale;
  draw();
}, { passive: false });

// ─── Панорамирование ───
let panState = null;
canvas.addEventListener('mousedown', e => {
  const inSpecialMode = state.cutMode || state.measureMode || state.remnantMode || state.duplicateMode || state.groupSelectMode;
  const isPanButton = (e.button === 1) || (e.button === 2 && !inSpecialMode);
  if (!isPanButton) return;
  if (!state.view) return;

  e.preventDefault();
  panState = {
    startX: e.clientX, startY: e.clientY,
    startOX: state.view.originX, startOY: state.view.originY,
    startScale: state.view.scale, moved: false, button: e.button,
  };
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

const _btnFixToggle = document.getElementById('btnFixToggle');
if (_btnFixToggle) {
  _btnFixToggle.addEventListener('click', e => {
    if (state.selectedParts && state.selectedParts.length) {
      e.stopImmediatePropagation();
      toggleFixGroup();
    }
  }, true);
}

// ─── Клик ЛКМ ───
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (panState) return;

  if (state.pendingEmptySelection && !state.groupSelectMode) {
    state.pendingEmptySelection = null;
    draw();
  }

  if (state.remnantMode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) handleRemnantClick(w.x, w.y);
    return;
  }

  if (state.cutMode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) handleCutClick(w.x, w.y, e.shiftKey, e.ctrlKey || e.metaKey);
    return;
  }

  if (state.measureMode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) handleMeasureClick(w);
    return;
  }

  if (state.groupSelectMode) {
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    state.groupSelectDrag = { x0: lx, y0: ly, x1: lx, y1: ly, _shift: !!e.shiftKey, _ctrl: !!(e.ctrlKey || e.metaKey), _fromMouse: false };
    draw();
    return;
  }

  if (!state.sheets.length) return;

  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const w = screenToWorld(px, py); if (!w) return;
  const hit = hitTest(w.x, w.y);

  if (state.duplicateMode) {
    e.preventDefault();
    if (state.duplicateGhost) {
      state.duplicateGhost._attached = true;
      state.duplicateGhost._dragging = true;
      updateDuplicateGhost(w);
      canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
      draw();
      return;
    }
    if (hit) {
      if (startDuplicateDrag(w, hit)) {
        state.duplicateGhost._dragging = true;
        canvas.style.cursor = 'copy';
        draw();
      }
      return;
    }
    return;
  }

  if (!hit) {
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    state.groupSelectDrag = { x0: lx, y0: ly, x1: lx, y1: ly, _shift: !!e.shiftKey, _ctrl: !!(e.ctrlKey || e.metaKey), _fromMouse: true };
    draw();
    return;
  }

  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    togglePartInSelection(hit.sheetIdx, hit.placedIdx);
    draw();
    updateReport();
    import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
    return;
  }

  const pl = state.sheets[hit.sheetIdx].placed[hit.placedIdx];
  const inGroup = isInGroup(hit.sheetIdx, hit.placedIdx);

  if (inGroup) {
    state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };
    if (pl._fixed) { draw(); setStatus('Деталь зафиксирована — снимите фиксацию'); return; }
    if (!startGroupDrag(w)) { draw(); setStatus('Все выделенные зафиксированы — двигать нечего'); return; }
    canvas.style.cursor = 'grabbing';
    draw();
    return;
  }

  state.selectedParts = [];
  state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };

  if (pl._fixed) { canvas.style.cursor = ''; draw(); setStatus('Деталь зафиксирована'); return; }

  state.drag = {
    grabDx: w.x - hit.worldX, grabDy: w.y - hit.worldY,
    startX: w.x, startY: w.y, _moved: false,
    orig: { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx, x: pl.x, y: pl.y, bbox: [...pl.bbox] }
  };
  canvas.style.cursor = 'grabbing';
  draw();
});

canvas.addEventListener('dblclick', e => {
  if (state.cutMode || state.measureMode || state.remnantMode || state.duplicateMode) return;
  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if (!w) return;
  const hit = hitTest(w.x, w.y);
  if (hit) return;
  resetCamera(); draw(); setStatus('Показать всё');
});

window.addEventListener('mousemove', e => {
  if (panState) {
    const dx = e.clientX - panState.startX;
    const dy = e.clientY - panState.startY;
    if (Math.hypot(dx, dy) > 3) panState.moved = true;
    if (panState.moved) {
      if (!state.camera) state.camera = {};
      state.camera.scale = panState.startScale;
      state.camera.originX = panState.startOX + dx;
      state.camera.originY = panState.startOY + dy;
      draw();
    }
    return;
  }

  if (state.remnantMode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) updateRemnantPreview(w.x, w.y);
    return;
  }
  if (state.cutMode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) { updateCutPreview(w.x, w.y, e.shiftKey, e.ctrlKey || e.metaKey); draw(); }
    return;
  }
  if (state.measureMode) {
    if (state.measurePoints.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (w) { state.measurePreview = { a: state.measurePoints[0], b: { x: w.x, y: w.y } }; draw(); }
    }
    return;
  }
  if (state.duplicateMode && state.duplicateGhost) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    const w = screenToWorld(px, py);
    if (w) {
      state.duplicateGhost._attached = true;
      updateDuplicateGhost(w);
      canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
      draw();
    }
    return;
  }
  if (state.groupSelectDrag) {
    const rect = canvas.getBoundingClientRect();
    state.groupSelectDrag.x1 = e.clientX - rect.left;
    state.groupSelectDrag.y1 = e.clientY - rect.top;
    draw();
    return;
  }
  if (state.groupDrag) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (w) { moveGroup(w); draw(); }
    return;
  }
  if (!state.drag) return;
  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if (!w) return;
  moveDraggedPart(w);
  draw();
});

window.addEventListener('mouseup', e => {
  if (panState) {
    const wasPanning = panState.moved;
    const panButton = panState.button;
    panState = null;
    canvas.style.cursor = '';
    if (wasPanning) {
      state._suppressContextMenu = true;
      setTimeout(() => { state._suppressContextMenu = false; }, 200);
      return;
    }
    if (panButton === 1) return;
  }

  if (state.remnantMode) return;
  if (state.cutMode) return;
  if (state.measureMode) return;

  if (state.duplicateMode && state.duplicateGhost && state.duplicateGhost._dragging) {
    const savedSrc = state.duplicateSource ? { sheetIdx: state.duplicateSource.sheetIdx, indices: (state.duplicateSource.indices || []).slice() } : null;
    const success = commitDuplicateGhost();

    if (success && savedSrc && savedSrc.indices.length) {
      const newSel = savedSrc.indices.map(idx => ({ sheetIdx: savedSrc.sheetIdx, placedIdx: idx }));
      import('./canvas-ops.js').then(m => {
        if (m && typeof m.startDuplicateDragFromSelection === 'function') {
          m.startDuplicateDragFromSelection(newSel);
          if (state.duplicateGhost) {
            state.duplicateGhost._attached = true;
            state.duplicateGhost._dragging = false;
            const rect = canvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
              const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
              if (w) updateDuplicateGhost(w);
            }
            canvas.style.cursor = state.duplicateGhost.valid ? 'copy' : 'not-allowed';
          }
          draw();
        }
      });
    } else if (state.duplicateGhost) {
      state.duplicateGhost._dragging = false;
      canvas.style.cursor = 'not-allowed';
    }
    draw();
    return;
  }

  if (state.groupSelectDrag) { finalizeGroupSelect(); return; }
  if (state.groupDrag) { endGroupDrag(); return; }
  if (!state.drag) return;

  const drag = state.drag;
  const sheet = state.sheets[drag.orig.sheetIdx];
  const pl = sheet && sheet.placed[drag.orig.placedIdx];
  const moved = !!drag._moved;

  state.snapGuides = null;
  canvas.style.cursor = '';

  if (pl && moved) {
    const params = readParams();
    const W = params.sheetW - 2 * params.edge;
    const H = params.sheetH - 2 * params.edge;
    const buffer = params.kerf + params.gap;
    const myW = pl.bbox[2] - pl.bbox[0];
    const myH = pl.bbox[3] - pl.bbox[1];

    if (pl._collides) {
      const free = findNearestFreePosition(sheet, pl, pl.x, pl.y, W, H, buffer);
      if (free.found) {
        pl.x = free.x; pl.y = free.y;
        pl.bbox = [pl.x, pl.y, pl.x + myW, pl.y + myH];
        pl._collides = false;
        setStatus('Деталь сдвинута встык');
        if (!drag._gridUsed && !state.snapDisabled && params.snapThreshold > 0) {
          const snap = computeSnap(sheet, pl, pl.x, pl.y, W, H, myW, myH, buffer, params.snapThreshold);
          if ((snap.x !== pl.x || snap.y !== pl.y) && !partCollidesAt(sheet, pl, snap.x, snap.y, buffer, W, H)) {
            pl.x = snap.x; pl.y = snap.y;
            pl.bbox = [snap.x, snap.y, snap.x + myW, snap.y + myH];
          }
        }
      } else {
        pl.x = drag.orig.x; pl.y = drag.orig.y;
        pl.bbox = [...drag.orig.bbox];
        pl._collides = false;
        setStatus('Наложение — позиция восстановлена');
      }
    } else if (!drag._gridUsed && !state.snapDisabled && params.snapThreshold > 0) {
      const snap = computeSnap(sheet, pl, pl.x, pl.y, W, H, myW, myH, buffer, params.snapThreshold);
      if ((snap.x !== pl.x || snap.y !== pl.y) && !partCollidesAt(sheet, pl, snap.x, snap.y, buffer, W, H)) {
        pl.x = snap.x; pl.y = snap.y;
        pl.bbox = [snap.x, snap.y, snap.x + myW, snap.y + myH];
        pl._collides = false;
      }
    }
  }

  state.drag = null;
  draw();
  updateReport();
  if (moved) pushHistory();
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (state._suppressContextMenu) return;

  if (state.remnantMode) { exitRemnantMode(); return; }
  if (state.duplicateGhost) { cancelDuplicateDrag(); return; }
  if (state.cutMode) { exitCutMode(); return; }
  if (state.measureMode) { exitMeasureMode(); return; }
  if (state.groupSelectMode) { exitGroupSelectMode(); return; }
  if (!state.sheets.length) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const w = screenToWorld(px, py); if (!w) return;
  const hit = hitTest(w.x, w.y);
  if (hit) {
    const inGroup = isInGroup(hit.sheetIdx, hit.placedIdx);
    if (!inGroup) {
      state.selectedParts = [];
      state.selectedPart = { sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx };
      draw();
    }
  }
  showContextMenu(e.clientX, e.clientY, hit);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.pendingEmptySelection) { state.pendingEmptySelection = null; draw(); setStatus(''); return; }
    if (state.remnantMode) { exitRemnantMode(); return; }
    if (state.cutMode) {
      if (state.cutPoints.length > 0) { state.cutPoints = []; state.cutPreview = null; setStatus('Рез отменён'); draw(); }
      else exitCutMode();
      return;
    }
    if (state.measureMode) {
      if (state.measurePoints.length > 0) { state.measurePoints = []; state.measurePreview = null; setStatus('Измерение отменено'); draw(); }
      else exitMeasureMode();
      return;
    }
    if (state.groupSelectMode || state.groupSelectDrag) { exitGroupSelectMode(); return; }
    if (state.duplicateGhost) { cancelDuplicateDrag(); setStatus('Копия отменена.'); return; }
    if (state.duplicateMode) {
      state.duplicateMode = false; state.duplicateGhost = null; state.duplicateSource = null;
      canvas.style.cursor = '';
      const btn = document.getElementById('btnDuplicateSelected');
      if (btn) btn.classList.remove('active');
      setStatus('Режим дублирования выключен');
      draw();
      return;
    }
    if ((state.selectedParts && state.selectedParts.length) || state.selectedPart) {
      state.selectedParts = []; state.selectedPart = null; state.selectedRows.clear();
      import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
      draw(); setStatus('');
      return;
    }
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    const hadGroup = state.selectedParts && state.selectedParts.length > 0;
    const hadSingle = !!state.selectedPart;
    if (!hadGroup && !hadSingle) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    if (hadGroup) deleteSelectedGroup();
    else if (hadSingle) { if (removePlacedPart(state.selectedPart.sheetIdx, state.selectedPart.placedIdx)) pushHistory(); }

    if (state.selectedRows && state.selectedRows.size) {
      state.selectedRows.clear();
      import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'ф')) {
    e.preventDefault();
    const newSel = [];
    for (let si = 0; si < state.sheets.length; si++) {
      for (let pi = 0; pi < state.sheets[si].placed.length; pi++) {
        newSel.push({ sheetIdx: si, placedIdx: pi });
      }
    }
    if (newSel.length) {
      state.selectedParts = newSel;
      state.selectedPart = newSel.length === 1 ? newSel[0] : null;
      import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
      draw();
      setStatus(`Выделено деталей: ${newSel.length}`);
    }
    return;
  }

  if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
    e.preventDefault();
    const v = state.view;
    if (!v) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const wx = (cx - v.originX) / v.scale;
    const wy = (v.originY - cy) / v.scale;
    const factor = (e.key === '+' || e.key === '=') ? 1.15 : (1 / 1.15);
    const newScale = Math.max(0.02, Math.min(80, v.scale * factor));
    if (!state.camera) state.camera = {};
    state.camera.scale = newScale;
    state.camera.originX = cx - wx * newScale;
    state.camera.originY = cy + wy * newScale;
    draw();
    return;
  }

  if (['1', '2', '3'].includes(e.key)) {
    const si = parseInt(e.key) - 1;
    if (si < state.sheets.length) {
      const params = readParams();
      const SW = params.sheetW;
      const SH = params.sheetH;
      const gap = Math.max(SW * 0.05, 100);
      const rect = canvas.getBoundingClientRect();
      const margin = 40;
      const scale = Math.min((rect.width - 2 * margin) / (SW + 200), (rect.height - 2 * margin) / SH);
      if (!state.camera) state.camera = {};
      state.camera.scale = scale;
      const sheetCenterX = si * (SW + gap) + SW / 2;
      state.camera.originX = rect.width / 2 - sheetCenterX * scale;
      state.camera.originY = (rect.height - SH * scale) / 2 + SH * scale;
      draw();
      setStatus(`Показан лист ${si + 1}`);
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

  // ─── ПЕРЕМЕЩЕНИЕ СТРЕЛКАМИ ───
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const hasGroup = state.selectedParts && state.selectedParts.length > 0;
    const hasSingle = !!state.selectedPart;
    if (!hasGroup && !hasSingle) return;

    e.preventDefault();

    const params = readParams();
    let step = params.gridShow ? Math.max(1, params.gridStep || 10) : Math.max(1, (params.gap + params.kerf) || 7);
    if (e.shiftKey) step *= 10;

    let dx = 0, dy = 0;
    if (e.key === 'ArrowUp') dy = step;
    if (e.key === 'ArrowDown') dy = -step;
    if (e.key === 'ArrowLeft') dx = -step;
    if (e.key === 'ArrowRight') dx = step;

    const W = params.sheetW - 2 * params.edge;
    const H = params.sheetH - 2 * params.edge;
    const buffer = params.kerf + params.gap;

    if (hasSingle && !hasGroup) {
      const { sheetIdx, placedIdx } = state.selectedPart;
      const sheet = state.sheets[sheetIdx];
      if (!sheet) return;
      const pl = sheet.placed[placedIdx];
      if (!pl || pl._fixed) return;

      const w = pl.bbox[2] - pl.bbox[0];
      const h = pl.bbox[3] - pl.bbox[1];

      let nx = pl.x + dx;
      let ny = pl.y + dy;

      if (nx < 0) nx = 0;
      if (ny < 0) ny = 0;
      if (nx + w > W) nx = W - w;
      if (ny + h > H) ny = H - h;

      if (!partCollidesAt(sheet, pl, nx, ny, buffer, W, H)) {
        pl.x = nx; pl.y = ny;
        pl.bbox = [nx, ny, nx + w, ny + h];
        pl._collides = false;
        state.snapGuides = null;
        draw();
        schedulePush(500);
        return;
      }

      let safeT = 0, unsafeT = 1;
      for (let i = 0; i < 12; i++) {
        const midT = (safeT + unsafeT) / 2;
        const testX = pl.x + (nx - pl.x) * midT;
        const testY = pl.y + (ny - pl.y) * midT;
        if (!partCollidesAt(sheet, pl, testX, testY, buffer, W, H)) safeT = midT;
        else unsafeT = midT;
      }
      if (safeT > 0.001) {
        const finalX = pl.x + (nx - pl.x) * safeT;
        const finalY = pl.y + (ny - pl.y) * safeT;
        pl.x = finalX; pl.y = finalY;
        pl.bbox = [finalX, finalY, finalX + w, finalY + h];
        pl._collides = false;
        state.snapGuides = null;
        draw();
        schedulePush(500);
      }
      return;
    }

    if (hasGroup) {
      const items = [];
      for (const sp of state.selectedParts) {
        const sheet = state.sheets[sp.sheetIdx];
        const pl = sheet && sheet.placed[sp.placedIdx];
        if (pl && !pl._fixed) {
          items.push({ pl, sheet, w: pl.bbox[2] - pl.bbox[0], h: pl.bbox[3] - pl.bbox[1], origX: pl.x, origY: pl.y });
        }
      }
      if (!items.length) return;

      let boundDx = dx, boundDy = dy;
      for (const it of items) {
        if (it.origX + boundDx < 0) boundDx = -it.origX;
        if (it.origY + boundDy < 0) boundDy = -it.origY;
        if (it.origX + boundDx + it.w > W) boundDx = W - it.w - it.origX;
        if (it.origY + boundDy + it.h > H) boundDy = H - it.h - it.origY;
      }
      if (boundDx === 0 && boundDy === 0) return;

      const checkGroupCollision = (testDx, testDy) => {
        for (const it of items) {
          if (partCollidesAt(it.sheet, it.pl, it.origX + testDx, it.origY + testDy, buffer, W, H)) return true;
        }
        return false;
      };

      if (!checkGroupCollision(boundDx, boundDy)) {
        for (const it of items) {
          it.pl.x = it.origX + boundDx;
          it.pl.y = it.origY + boundDy;
          it.pl.bbox = [it.pl.x, it.pl.y, it.pl.x + it.w, it.pl.y + it.h];
        }
        state.snapGuides = null;
        draw();
        schedulePush(500);
        return;
      }

      let safeT = 0, unsafeT = 1;
      for (let i = 0; i < 12; i++) {
        const midT = (safeT + unsafeT) / 2;
        if (!checkGroupCollision(boundDx * midT, boundDy * midT)) safeT = midT;
        else unsafeT = midT;
      }
      if (safeT > 0.001) {
        const finalDx = boundDx * safeT, finalDy = boundDy * safeT;
        for (const it of items) {
          it.pl.x = it.origX + finalDx;
          it.pl.y = it.origY + finalDy;
          it.pl.bbox = [it.pl.x, it.pl.y, it.pl.x + it.w, it.pl.y + it.h];
        }
        state.snapGuides = null;
        draw();
        schedulePush(500);
      }
      return;
    }
  }

  // ─── TAB: Переключение по деталям (КАМЕРА НЕ ДВИГАЕТСЯ) ───
  if (e.key === 'Tab') {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

    e.preventDefault();

    const allParts = [];
    for (let si = 0; si < state.sheets.length; si++) {
      const sheet = state.sheets[si];
      for (let pi = 0; pi < sheet.placed.length; pi++) {
        const pl = sheet.placed[pi];
        allParts.push({
          sheetIdx: si,
          placedIdx: pi,
          cutOrder: pl._cutOrder || 999999,
        });
      }
    }

    if (!allParts.length) return;

    allParts.sort((a, b) => {
      if (a.sheetIdx !== b.sheetIdx) return a.sheetIdx - b.sheetIdx;
      if (a.cutOrder !== b.cutOrder) return a.cutOrder - b.cutOrder;
      return a.placedIdx - b.placedIdx;
    });

    let currentIdx = -1;
    if (state.selectedPart) {
      currentIdx = allParts.findIndex(p => p.sheetIdx === state.selectedPart.sheetIdx && p.placedIdx === state.selectedPart.placedIdx);
    }

    let nextIdx = currentIdx;
    if (e.shiftKey) {
      nextIdx = currentIdx <= 0 ? allParts.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= allParts.length - 1 ? 0 : currentIdx + 1;
    }

    const nextPart = allParts[nextIdx];
    state.selectedParts = [];
    state.selectedPart = { sheetIdx: nextPart.sheetIdx, placedIdx: nextPart.placedIdx };
    
    state.selectedRows.clear();
    const plObj = state.sheets[nextPart.sheetIdx].placed[nextPart.placedIdx];
    if (plObj) state.selectedRows.add(plObj.partIdx);
    state._selectedRowsFromCanvas = true;

    draw();
    updateReport();
    import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
    
    const partName = state.parts[plObj.partIdx]?.name || 'Деталь';
    const cutNum = nextPart.cutOrder === 999999 ? '—' : nextPart.cutOrder;
    setStatus(`Выделена деталь: ${partName} (Рез №${cutNum}) · Лист ${nextPart.sheetIdx + 1}`);
    return;
  }

  if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
    if (state.selectedParts && state.selectedParts.length) {
      e.preventDefault(); if (rotateSelectedGroup(e.shiftKey ? -1 : 1)) pushHistory(); return;
    }
    if (!state.selectedPart) return;
    e.preventDefault(); if (rotateSelected(e.shiftKey ? -1 : 1)) pushHistory(); return;
  }

  if (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') {
    if (state.selectedParts && state.selectedParts.length) {
      e.preventDefault(); if (mirrorSelectedGroup(e.shiftKey ? 'y' : 'x')) pushHistory(); return;
    }
    if (!state.selectedPart) return;
    e.preventDefault(); if (mirrorSelected(e.shiftKey ? 'y' : 'x')) pushHistory(); return;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Shift' && !state.snapDisabled) { state.snapDisabled = true; if (state.drag) state.snapGuides = null; }
  if (e.key === 'Alt') { state.gridSnapMode = true; if (state.drag) state.snapGuides = null; }
});
document.addEventListener('keyup', e => {
  if (e.key === 'Shift') state.snapDisabled = false;
  if (e.key === 'Alt') state.gridSnapMode = false;
});
window.addEventListener('blur', () => { state.snapDisabled = false; state.gridSnapMode = false; });

document.addEventListener('keydown', e => {
  if (e.key !== ' ' && e.code !== 'Space') return;
  if (e.repeat) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (state.cutMode || state.measureMode || state.remnantMode || state.duplicateMode || state.groupSelectMode) return;
  if (state.drag || state.groupDrag) return;
  e.preventDefault();
  resetCamera(); draw(); setStatus('Показать всё');
});

function findDropTarget(wx, wy){
  const v = state.view; if(!v) return null;
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
  if(x < 0) x = 0; if(y < 0) y = 0;
  if(x + part.width > W) x = Math.max(0, W - part.width);
  if(y + part.height > H) y = Math.max(0, H - part.height);
  return { x, y };
}

canvas.addEventListener('dragover', e => {
  if(state.draggedPartIdx == null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  const hint = document.getElementById('canvasHint');
  if(!state.sheets.length){ if(hint) hint.textContent = 'Отпустите — будет создан новый лист'; return; }
  const v = state.view; if(!v) return;
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
  const changed = !prev || prev.partIdx !== state.draggedPartIdx || prev.sheetIdx !== target.sheetIdx ||
      Math.abs(prev.x - pos.x) > 0.5 || Math.abs(prev.y - pos.y) > 0.5;
  if(!changed) return;
  state.dropPreview = { partIdx: state.draggedPartIdx, sheetIdx: target.sheetIdx, x: pos.x, y: pos.y, w: part.width, h: part.height };
  draw();
});

canvas.addEventListener('dragleave', e => {
  const rect = canvas.getBoundingClientRect();
  if(e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom){
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
  if(!state.sheets.length){ state.sheets.push({ placed: [], cuts: [], remnants: [], obstacles: [] }); draw(); }
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
  const newPlaced = { partIdx, polygons: newPolygons, x: pos.x, y: pos.y, bbox: [pos.x, pos.y, pos.x + part.width, pos.y + part.height], _manual: true };
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
    const absPolys = newPolygons.map(r => r.map(([x, y]) => [x + pos.x + params.edge, y + pos.y + params.edge]));
    if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) setStatus(`⚠ Деталь вне контура: ${part.name}`);
  }
  draw();
  updateReport();
  refreshPartsStatus();
  setStatus(collides ? `⚠ Наложение: ${part.name}` : `Деталь размещена: ${part.name}`);
  pushHistory();
});

window.addEventListener('resize', draw);
draw();