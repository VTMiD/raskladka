import { canvas, worldToSheet, DEFAULT_HINT } from './canvas-core.js';
import { draw } from './canvas-draw.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';

const EDGE_SNAP_MM  = 8;
const POINT_SNAP_MM = 6;

function snapCutPoint(sx, sy, sheetIdx, shiftKey, lastPoint, noGrid) {
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const edge = params.edge;
  const step = Math.max(1, params.gridStep || 10);
  const gridOn = !!params.gridShow && !noGrid;
  let x = sx, y = sy;

  // Орто-режим по Shift
  if (shiftKey && lastPoint && lastPoint.sheetIdx === sheetIdx) {
    const dx = Math.abs(x - lastPoint.x);
    const dy = Math.abs(y - lastPoint.y);
    if (dx > dy) y = lastPoint.y;
    else         x = lastPoint.x;
  }

  // Притяжение к краям листа
  let snappedX = false, snappedY = false;
  if (Math.abs(x) < EDGE_SNAP_MM)      { x = 0;  snappedX = true; }
  if (Math.abs(x - SW) < EDGE_SNAP_MM) { x = SW; snappedX = true; }
  if (Math.abs(y) < EDGE_SNAP_MM)      { y = 0;  snappedY = true; }
  if (Math.abs(y - SH) < EDGE_SNAP_MM) { y = SH; snappedY = true; }

  // Притяжение к конечным точкам существующих резов
  const sheet = state.sheets[sheetIdx];
  if (sheet && sheet.cuts) {
    let bestD = POINT_SNAP_MM;
    let bx = null, by = null;
    for (const c of sheet.cuts) {
      const d1 = Math.hypot(x - c.x1, y - c.y1);
      if (d1 < bestD) { bestD = d1; bx = c.x1; by = c.y1; }
      const d2 = Math.hypot(x - c.x2, y - c.y2);
      if (d2 < bestD) { bestD = d2; bx = c.x2; by = c.y2; }
    }
    if (bx !== null) { x = bx; y = by; snappedX = true; snappedY = true; }
  }

  // Притяжение к сетке (если включена)
  if (gridOn) {
    if (!snappedX) {
      const kx = Math.round((x - edge) / step);
      x = edge + kx * step;
      if (x < 0)  x = 0;
      if (x > SW) x = SW;
    }
    if (!snappedY) {
      const ky = Math.round((y - edge) / step);
      y = edge + ky * step;
      if (y < 0)  y = 0;
      if (y > SH) y = SH;
    }
  }

  return { x, y };
}

export function enterCutMode() {
  if (!state.sheets.length) {
    state.sheets.push({ placed: [], cuts: [], remnants: [] });
    draw();
  }
  state.cutMode = true;
  state.cutPoints = [];
  state.cutPreview = null;
  state.selectedPart = null;
  state.selectedParts = [];
  canvas.style.cursor = 'crosshair';
  const btn = document.getElementById('btnCut');
  if (btn) btn.classList.add('active');
  const hint = document.getElementById('canvasHint');
  if (hint) {
    const params = readParams();
    const gridInfo = params.gridShow
      ? ` · привязка к сетке ${params.gridStep} мм (Ctrl — без привязки)`
      : '';
    hint.textContent = '✂ Резать: клик → точка 1, клик → точка 2. Shift — орто, Ctrl — без привязки. Esc / ПКМ — выход.' + gridInfo;
  }
  setStatus('Режим реза листа: укажите первую точку');
  draw();
}

export function exitCutMode() {
  state.cutMode = false;
  state.cutPoints = [];
  state.cutPreview = null;
  canvas.style.cursor = '';
  const btn = document.getElementById('btnCut');
  if (btn) btn.classList.remove('active');
  const hint = document.getElementById('canvasHint');
  if (hint) hint.textContent = DEFAULT_HINT;
  setStatus('');
  draw();
}

export function handleCutClick(wx, wy, shiftKey, noGrid) {
  const tgt = worldToSheet(wx, wy);
  if (!tgt) { setStatus('Кликните внутри листа'); return; }

  const last = state.cutPoints[0] || null;
  const snapped = snapCutPoint(tgt.x, tgt.y, tgt.sheetIdx, shiftKey, last, noGrid);

  if (!state.cutPoints.length) {
    state.cutPoints = [{ sheetIdx: tgt.sheetIdx, x: snapped.x, y: snapped.y }];
    state.cutPreview = null;
    setStatus(`Точка 1: (${snapped.x.toFixed(1)}, ${snapped.y.toFixed(1)}). Укажите точку 2`);
    draw();
    return;
  }

  const p1 = state.cutPoints[0];
  if (p1.sheetIdx !== tgt.sheetIdx) {
    setStatus('Рез должен быть в пределах одного листа');
    return;
  }

  const len = Math.hypot(snapped.x - p1.x, snapped.y - p1.y);
  if (len < 1) {
    setStatus('Слишком короткий рез — отменено');
    state.cutPoints = [];
    state.cutPreview = null;
    draw();
    return;
  }

  const sheet = state.sheets[tgt.sheetIdx];
  if (!sheet.cuts) sheet.cuts = [];
  sheet.cuts.push({ x1: p1.x, y1: p1.y, x2: snapped.x, y2: snapped.y });

  state.cutPoints = [];
  state.cutPreview = null;
  setStatus(`✂ Рез добавлен: ${len.toFixed(1)} мм`);
  draw();
  pushHistory();
}

export function updateCutPreview(wx, wy, shiftKey, noGrid) {
  if (!state.cutMode || state.cutPoints.length !== 1) return;
  const tgt = worldToSheet(wx, wy);
  if (!tgt) { state.cutPreview = null; return; }
  const p1 = state.cutPoints[0];
  if (p1.sheetIdx !== tgt.sheetIdx) { state.cutPreview = null; return; }
  const snapped = snapCutPoint(tgt.x, tgt.y, tgt.sheetIdx, shiftKey, p1, noGrid);
  state.cutPreview = {
    sheetIdx: tgt.sheetIdx,
    a: { x: p1.x, y: p1.y },
    b: { x: snapped.x, y: snapped.y },
  };
}

export function removeLastCut() {
  for (let i = state.sheets.length - 1; i >= 0; i--) {
    const sh = state.sheets[i];
    if (sh.cuts && sh.cuts.length) {
      sh.cuts.pop();
      setStatus('Последний рез удалён');
      draw(); pushHistory();
      return;
    }
  }
  setStatus('Резов нет');
}

export function clearAllCuts() {
  let n = 0;
  for (const sh of state.sheets) {
    if (sh.cuts && sh.cuts.length) { n += sh.cuts.length; sh.cuts = []; }
  }
  if (!n) { setStatus('Резов нет'); return; }
  setStatus(`Удалено резов: ${n}`);
  draw(); pushHistory();
}

export function bindCutUI() {
  document.getElementById('btnCut')?.addEventListener('click', () => {
    state.cutMode ? exitCutMode() : enterCutMode();
  });
  document.getElementById('btnCutRemoveLast')?.addEventListener('click', removeLastCut);
  document.getElementById('btnCutClear')?.addEventListener('click', () => {
    if (confirm('Удалить все резы со всех листов?')) clearAllCuts();
  });
}