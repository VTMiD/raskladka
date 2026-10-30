import { canvas, worldToSheet, screenToWorld, DEFAULT_HINT } from './canvas-core.js';
import { draw } from './canvas-draw.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';
import { polygonArea } from './geometry.js';

const REMNANT_MIN_SIDE = 20;
const SAME_REMNANT_TOL = 1;
const DEFAULT_GRID_STEP = 10;

// ─── Геометрия ────────────────────────────────────────────────
function segsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  const d1 = (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1);
  const d2 = (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1);
  const d3 = (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1);
  const d4 = (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSeg = (ax, ay, bx, by, px, py) =>
    Math.min(ax, bx) <= px && px <= Math.max(ax, bx) &&
    Math.min(ay, by) <= py && py <= Math.max(ay, by);
  if (d1 === 0 && onSeg(bx1, by1, bx2, by2, ax1, ay1)) return true;
  if (d2 === 0 && onSeg(bx1, by1, bx2, by2, ax2, ay2)) return true;
  if (d3 === 0 && onSeg(ax1, ay1, ax2, ay2, bx1, by1)) return true;
  if (d4 === 0 && onSeg(ax1, ay1, ax2, ay2, bx2, by2)) return true;
  return false;
}

function markSegmentInGrid(occ, nx, ny, edge, step, c) {
  const dx = c.x2 - c.x1;
  const dy = c.y2 - c.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;

  const steps = Math.max(1, Math.ceil(len / 0.5));
  const nxDir = -dy / len;
  const nyDir = dx / len;
  const thickness = 0.1;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = c.x1 + dx * t;
    const py = c.y1 + dy * t;

    for (let d = -thickness; d <= thickness; d += thickness / 2) {
      const qx = px + nxDir * d;
      const qy = py + nyDir * d;
      const ci = Math.floor((qx - edge) / step);
      const cj = Math.floor((qy - edge) / step);
      if (ci >= 0 && ci < nx && cj >= 0 && cj < ny) {
        occ[cj * nx + ci] = 1;
      }
    }
  }

  const endpoints = [
    { x: c.x1, y: c.y1 },
    { x: c.x2, y: c.y2 }
  ];
  for (const pt of endpoints) {
    const ci = Math.floor((pt.x - edge) / step);
    const cj = Math.floor((pt.y - edge) / step);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni >= 0 && ni < nx && nj >= 0 && nj < ny) {
          occ[nj * nx + ni] = 1;
        }
      }
    }
  }
}

function findExistingRemnantAt(sheet, wx, wy) {
  if (!sheet.remnants) return null;
  for (const r of sheet.remnants) {
    const rr = r.rect;
    if (!rr) continue;
    if (wx >= rr.x1 && wx <= rr.x2 && wy >= rr.y1 && wy <= rr.y2) {
      return r;
    }
  }
  return null;
}

function isAlreadyMarked(sheet, rect, tol) {
  if (!sheet.remnants) return false;
  const t = tol || SAME_REMNANT_TOL;
  for (const r of sheet.remnants) {
    const rr = r.rect || r;
    if (Math.abs(rr.x1 - rect.x1) < t &&
        Math.abs(rr.y1 - rect.y1) < t &&
        Math.abs(rr.x2 - rect.x2) < t &&
        Math.abs(rr.y2 - rect.y2) < t) {
      return true;
    }
  }
  return false;
}

function dirOf(x1, y1, x2, y2){
  if (x2 > x1 && y2 === y1) return 0;
  if (x2 === x1 && y2 < y1) return 1;
  if (x2 < x1 && y2 === y1) return 2;
  if (x2 === x1 && y2 > y1) return 3;
  return -1;
}

function traceContours(region, nx, ny){
  const edges = [];

  for (let i = 0; i < nx; i++){
    for (let j = 0; j <= ny; j++){
      const above = (j < ny) ? region[j * nx + i] : 0;
      const below = (j > 0) ? region[(j - 1) * nx + i] : 0;
      if (above !== below){
        edges.push({ x1: i, y1: j, x2: i + 1, y2: j });
      }
    }
  }
  for (let i = 0; i <= nx; i++){
    for (let j = 0; j < ny; j++){
      const right = (i < nx) ? region[j * nx + i] : 0;
      const left = (i > 0) ? region[j * nx + (i - 1)] : 0;
      if (right !== left){
        edges.push({ x1: i, y1: j, x2: i, y2: j + 1 });
      }
    }
  }

  const nodeEdges = new Map();
  const nk = (i, j) => `${i},${j}`;
  edges.forEach((e, idx) => {
    const k1 = nk(e.x1, e.y1);
    const k2 = nk(e.x2, e.y2);
    if (!nodeEdges.has(k1)) nodeEdges.set(k1, []);
    if (!nodeEdges.has(k2)) nodeEdges.set(k2, []);
    nodeEdges.get(k1).push({ idx, end: 'end' });
    nodeEdges.get(k2).push({ idx, end: 'start' });
  });

  const used = new Uint8Array(edges.length);
  const contours = [];

  for (let startIdx = 0; startIdx < edges.length; startIdx++){
    if (used[startIdx]) continue;
    used[startIdx] = 1;
    const e = edges[startIdx];
    const contour = [[e.x1, e.y1], [e.x2, e.y2]];
    let curNode = { x: e.x2, y: e.y2 };
    let prevNode = { x: e.x1, y: e.y1 };
    let steps = 0;
    const maxSteps = edges.length * 2;

    while (steps++ < maxSteps){
      const cands = (nodeEdges.get(nk(curNode.x, curNode.y)) || []).filter(c => !used[c.idx]);
      if (!cands.length) break;

      let pick = null;
      if (cands.length === 1){
        pick = cands[0];
      } else {
        const inDir = dirOf(prevNode.x, prevNode.y, curNode.x, curNode.y);
        const tryDirs = [(inDir + 1) % 4, inDir, (inDir + 3) % 4, (inDir + 2) % 4];
        for (const td of tryDirs){
          for (const c of cands){
            const ce = edges[c.idx];
            const otherEnd = (c.end === 'start') ? { x: ce.x2, y: ce.y2 } : { x: ce.x1, y: ce.y1 };
            if (dirOf(curNode.x, curNode.y, otherEnd.x, otherEnd.y) === td){
              pick = c;
              break;
            }
          }
          if (pick) break;
        }
      }
      if (!pick) break;

      used[pick.idx] = 1;
      const pe = edges[pick.idx];
      const next = (pick.end === 'start') ? { x: pe.x2, y: pe.y2 } : { x: pe.x1, y: pe.y1 };
      contour.push([next.x, next.y]);
      prevNode = curNode;
      curNode = next;

      if (curNode.x === contour[0][0] && curNode.y === contour[0][1]) break;
    }

    if (contour.length >= 4) contours.push(contour);
  }

  return contours;
}

function simplifyContour(contour){
  if (contour.length < 3) return contour;
  const out = [contour[0]];
  for (let i = 1; i < contour.length - 1; i++){
    const prev = out[out.length - 1];
    const cur = contour[i];
    const next = contour[i + 1];
    const dx1 = cur[0] - prev[0], dy1 = cur[1] - prev[1];
    const dx2 = next[0] - cur[0], dy2 = next[1] - cur[1];
    if (dx1 * dy2 - dy1 * dx2 !== 0){
      out.push(cur);
    }
  }
  out.push(contour[contour.length - 1]);
  return out;
}

function polyBBox(poly){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function findRemnantPolygonAt(sheet, px, py, params){
  const SW = params.sheetW, SH = params.sheetH;
  const edge = params.edge || 0;
  const step = Math.max(2, Math.min(50, params.remnantGridStep || DEFAULT_GRID_STEP));
  const W = SW - 2 * edge, H = SH - 2 * edge;
  if (W <= 0 || H <= 0) return { reason: 'notFound' };

  const nx = Math.max(1, Math.ceil(W / step));
  const ny = Math.max(1, Math.ceil(H / step));

  const occParts = new Uint8Array(nx * ny);
  const occCuts = new Uint8Array(nx * ny);

  for (const pl of sheet.placed){
    const [x0, y0, x1, y1] = pl.bbox;
    const ci0 = Math.max(0, Math.floor(x0 / step));
    const ci1 = Math.min(nx - 1, Math.floor(x1 / step));
    const cj0 = Math.max(0, Math.floor(y0 / step));
    const cj1 = Math.min(ny - 1, Math.floor(y1 / step));
    for (let cj = cj0; cj <= cj1; cj++){
      for (let ci = ci0; ci <= ci1; ci++){
        occParts[cj * nx + ci] = 1;
      }
    }
  }

  for (const c of (sheet.cuts || [])){
    markSegmentInGrid(occCuts, nx, ny, edge, step, c);
  }

  if (px < 0 || py < 0 || px > SW || py > SH) return { reason: 'outside' };

  let ci0 = Math.floor((px - edge) / step);
  let cj0 = Math.floor((py - edge) / step);

  if (ci0 < 0) ci0 = 0;
  if (ci0 >= nx) ci0 = nx - 1;
  if (cj0 < 0) cj0 = 0;
  if (cj0 >= ny) cj0 = ny - 1;

  if (occParts[cj0 * nx + ci0]) {
    return { reason: 'onPart' };
  }

  let seed = null;
  if (occCuts[cj0 * nx + ci0]) {
    outer: for (let r = 1; r <= 10; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const ni = ci0 + di;
          const nj = cj0 + dj;
          if (ni < 0 || ni >= nx || nj < 0 || nj >= ny) continue;
          const k = nj * nx + ni;
          if (!occParts[k] && !occCuts[k]) {
            seed = { ci: ni, cj: nj };
            break outer;
          }
        }
      }
    }
    if (!seed) return { reason: 'nearCut' };
  } else {
    seed = { ci: ci0, cj: cj0 };
  }

  const occAll = new Uint8Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) {
    if (occParts[i] || occCuts[i]) occAll[i] = 1;
  }

  const region = new Uint8Array(nx * ny);
  const stack = [[seed.ci, seed.cj]];
  let visitedCount = 0;
  while (stack.length){
    const [ci, cj] = stack.pop();
    if (ci < 0 || ci >= nx || cj < 0 || cj >= ny) continue;
    const k = cj * nx + ci;
    if (occAll[k] || region[k]) continue;
    region[k] = 1;
    visitedCount++;
    stack.push([ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]);
  }

  if (visitedCount === 0) return { reason: 'notFound' };

  let hasParts = false;
  for (let i = 0; i < nx * ny; i++) {
    if (region[i] && occParts[i]) { hasParts = true; break; }
  }

  const contours = traceContours(region, nx, ny);

  if (!contours.length) {
    // Fallback: строим прямоугольник по крайним точкам залитой области
    let minCi = nx, maxCi = -1, minCj = ny, maxCj = -1;
    for (let cj = 0; cj < ny; cj++) {
      for (let ci = 0; ci < nx; ci++) {
        if (region[cj * nx + ci]) {
          if (ci < minCi) minCi = ci;
          if (ci > maxCi) maxCi = ci;
          if (cj < minCj) minCj = cj;
          if (cj > maxCj) maxCj = cj;
        }
      }
    }
    if (maxCi >= minCi && maxCj >= minCj) {
      const bb = [minCi, minCj, maxCi + 1, maxCj + 1];
      const mmContour = [
        [edge + bb[0] * step, edge + bb[1] * step],
        [edge + bb[2] * step, edge + bb[1] * step],
        [edge + bb[2] * step, edge + bb[3] * step],
        [edge + bb[0] * step, edge + bb[3] * step]
      ];
      const area = (bb[2] - bb[0]) * (bb[3] - bb[1]) * step * step;
      const w = (bb[2] - bb[0]) * step;
      const h = (bb[3] - bb[1]) * step;
      const rect = { x1: edge + bb[0] * step, y1: edge + bb[1] * step, x2: edge + bb[2] * step, y2: edge + bb[3] * step };
      return { polygon: mmContour, rect, w, h, area, hasParts, reason: 'ok' };
    }
    return { reason: 'notFound' };
  }

  let best = null, bestArea = 0;
  for (const cnt of contours){
    const a = Math.abs(polygonArea(cnt));
    if (a > bestArea){ bestArea = a; best = cnt; }
  }
  if (!best) return { reason: 'notFound' };

  const simplified = simplifyContour(best);
  const mmContour = simplified.map(([i, j]) => [edge + i * step, edge + j * step]);

  const bb = polyBBox(mmContour);
  const area = Math.abs(polygonArea(mmContour));
  const w = bb[2] - bb[0], h = bb[3] - bb[1];
  const rect = { x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] };

  return { polygon: mmContour, rect, w, h, area, hasParts, reason: 'ok' };
}

// ─── Публичный API ───────────────────────────────────────────
export function computeRemnantPreview(wx, wy){
  const tgt = worldToSheet(wx, wy);
  if (!tgt) return null;
  const sheet = state.sheets[tgt.sheetIdx];
  if (!sheet) return null;
  const params = readParams();

  const found = findRemnantPolygonAt(sheet, tgt.x, tgt.y, params);
  if (!found || !found.rect){
    return {
      sheetIdx: tgt.sheetIdx,
      rect: null, polygon: null,
      hasParts: false, hasCuts: false, tooSmall: true,
      alreadyMarked: false, valid: false,
      reason: found ? found.reason : 'notFound',
    };
  }

  const w = found.w, h = found.h;
  const tooSmall = w < REMNANT_MIN_SIDE || h < REMNANT_MIN_SIDE || !found.area || found.area < REMNANT_MIN_SIDE * REMNANT_MIN_SIDE;
  const alreadyMarked = isAlreadyMarked(sheet, found.rect, SAME_REMNANT_TOL);
  const hasParts = found.hasParts;
  const valid = !tooSmall && !alreadyMarked && !hasParts;

  return {
    sheetIdx: tgt.sheetIdx,
    rect: found.rect,
    polygon: found.polygon,
    area: found.area,
    w, h,
    hasParts,
    hasCuts: false,
    tooSmall,
    alreadyMarked,
    valid,
    reason: 'ok',
  };
}

export function enterRemnantMode(){
  if (!state.sheets.length){
    setStatus('Сначала выполните раскладку');
    return;
  }
  state.cutMode = false;
  state.cutPoints = [];
  state.cutPreview = null;
  state.measureMode = false;
  state.measurePoints = [];
  state.measurePreview = null;
  state.groupSelectMode = false;
  state.groupSelectDrag = null;
  state.pendingEmptySelection = null;

  state.remnantMode = true;
  state.remnantPreview = null;
  state.selectedPart = null;
  state.selectedParts = [];
  canvas.style.cursor = 'crosshair';

  const btn = document.getElementById('btnMarkRemnant');
  if (btn) btn.classList.add('active');

  const hint = document.getElementById('canvasHint');
  if (hint) hint.textContent = '📦 Остаток (полигон): кликните ВНУТРЬ замкнутой области. Esc — выход.';
  setStatus('Режим остатка: кликните в свободную область');
  draw();
}

export function exitRemnantMode(){
  state.remnantMode = false;
  state.remnantPreview = null;
  canvas.style.cursor = '';
  const btn = document.getElementById('btnMarkRemnant');
  if (btn) btn.classList.remove('active');
  const hint = document.getElementById('canvasHint');
  if (hint) hint.textContent = DEFAULT_HINT;
  setStatus('');
  draw();
}

export function updateRemnantPreview(wx, wy){
  if (!state.remnantMode) return;
  const preview = computeRemnantPreview(wx, wy);
  state.remnantPreview = preview;
  draw();
}

export function handleRemnantClick(wx, wy){
  const tgt = worldToSheet(wx, wy);
  if (!tgt) { setStatus('Кликните внутри листа'); return; }
  const sheet = state.sheets[tgt.sheetIdx];

  const existing = findExistingRemnantAt(sheet, tgt.x, tgt.y);
  if (existing) {
    setStatus('В этой области уже есть остаток. Нажмите «💾 Сохранить остаток», чтобы сохранить его в файл.');
    return;
  }

  const preview = computeRemnantPreview(wx, wy);
  if (!preview) { setStatus('Кликните внутри листа'); return; }

  if (!preview.rect) {
    if (preview.reason === 'onPart') {
      alert('Вы кликнули на деталь.\nКликните в свободное место рядом с деталью (но не на саму деталь).');
      setStatus('Кликните в свободное место (не на деталь)');
    } else if (preview.reason === 'nearCut') {
      alert('Слишком близко к линии реза.\nОтступите от реза на 1–2 см и попробуйте снова.');
      setStatus('Отступите от линии реза');
    } else if (preview.reason === 'outside') {
      alert('Клик был за пределами листа.\nКликните внутри листа.');
      setStatus('Кликните внутри листа');
    } else {
      alert('Не удалось определить остаток.\nЕсли вы вырезали прямоугольник, кликните ВНУТРЬ него. Если просто хотите выделить область — используйте кнопку «📐 Область».');
      setStatus('Кликните в свободную область');
    }
    return;
  }

  if (preview.alreadyMarked){
    setStatus('Остаток в этой области уже отмечен');
    return;
  }
  if (preview.tooSmall){
    alert(`Остаток слишком мал.\nМинимальный размер: ${REMNANT_MIN_SIDE}×${REMNANT_MIN_SIDE} мм.\nВаш размер: ${Math.round(preview.w)}×${Math.round(preview.h)} мм.`);
    setStatus(`⚠ Остаток слишком мал (минимум ${REMNANT_MIN_SIDE}×${REMNANT_MIN_SIDE} мм)`);
    return;
  }
  if (preview.hasParts){
    alert('Рез не образует полный барьер!\n\nОстаток захватывает область с деталями.\n\nПожалуйста, продлите рез до самого края листа или до другого реза, чтобы полностью отделить остаток.');
    setStatus('⚠ Рез не образует полный барьер: остаток захватывает область с деталями.');
    return;
  }

  if (!sheet.remnants) sheet.remnants = [];
  sheet.remnants.push({
    type: 'manual',
    _manual: true,
    polygon: preview.polygon ? preview.polygon.map(p => [p[0], p[1]]) : null,
    rect: { ...preview.rect },
    area: preview.area || 0,
    cut: { x1: preview.rect.x1, y1: preview.rect.y1, x2: preview.rect.x2, y2: preview.rect.y1 },
    w: preview.w,
    h: preview.h,
  });
  setStatus(`📦 Остаток добавлен: ${Math.round(preview.w)} × ${Math.round(preview.h)} мм (площадь ${(preview.area/1e6).toFixed(3)} м²)`);
  state.remnantPreview = null;
  draw();
  pushHistory();
}

export function clearManualRemnants(){
  let n = 0;
  for (const sh of state.sheets){
    if (!sh.remnants) continue;
    const before = sh.remnants.length;
    sh.remnants = sh.remnants.filter(r => !r._manual);
    n += before - sh.remnants.length;
  }
  if (!n){ setStatus('Ручных остатков нет'); return; }
  setStatus(`Удалено остатков: ${n}`);
  draw();
  pushHistory();
}