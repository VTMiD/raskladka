import { state } from './state.js';
import { readParams } from './params.js';
import { getPlaced, updateFixCount } from './canvas-core.js';
import { draw } from './canvas-draw.js';
import { computeSnap } from './snap.js';
import { updateReport } from './report.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory } from './history.js';
import { setStatus } from './utils.js';
import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';

function _findFreeSpotForCopy(sheet, orig, W, H, buffer) {
  const params = readParams();
  const w = orig.bbox[2] - orig.bbox[0];
  const h = orig.bbox[3] - orig.bbox[1];

  const offsets = [
    [w + buffer, 0], [-(w + buffer), 0],
    [0, h + buffer], [0, -(h + buffer)],
  ];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push([dx * (w + buffer), dy * (h + buffer)]);
    }
  }

  const newPolygons = orig.polygons.map(r => r.map(([px, py]) => [px, py]));

  for (const [dx, dy] of offsets) {
    const nx = orig.x + dx;
    const ny = orig.y + dy;
    if (nx < -1e-3 || ny < -1e-3) continue;
    if (nx + w > W + 1e-3 || ny + h > H + 1e-3) continue;

    if (params.sheetPolygons && params.sheetPolygons.length) {
      const absPolys = newPolygons.map(r =>
        r.map(([px, py]) => [px + nx + params.edge, py + ny + params.edge]));
      if (!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) continue;
    }

    const absA = newPolygons.map(r => r.map(([px, py]) => [px + nx, py + ny]));
    let collides = false;
    for (const other of sheet.placed) {
      const absB = other.polygons.map(r =>
        r.map(([px, py]) => [px + other.x, py + other.y]));
      if (polysCollide(absA, absB, buffer)) { collides = true; break; }
    }
    if (collides) continue;

    return { x: nx, y: ny, w, h };
  }
  return null;
}

function _clearSelectedRows(){
  if(state.selectedRows && state.selectedRows.size){
    state.selectedRows.clear();
    setTimeout(() => {
      import('./parts.js').then(m => m.updateSelectionUI()).catch(() => {});
    }, 0);
  }
}

export function removePlacedPart(sheetIdx, placedIdx){
  const sheet = state.sheets[sheetIdx];
  if(!sheet || !sheet.placed[placedIdx]) return false;
  const removed = sheet.placed[placedIdx];
  if(removed._fixed){ setStatus('Деталь зафиксирована — снимите фиксацию, чтобы убрать'); return false; }
  sheet.placed.splice(placedIdx, 1);

  if(state.selectedParts && state.selectedParts.length){
    const newSel = [];
    for(const sp of state.selectedParts){
      if(sp.sheetIdx === sheetIdx){
        if(sp.placedIdx === placedIdx) continue;
        if(sp.placedIdx > placedIdx) newSel.push({ sheetIdx: sp.sheetIdx, placedIdx: sp.placedIdx - 1 });
        else newSel.push(sp);
      } else newSel.push(sp);
    }
    state.selectedParts = newSel;
  }

  state.selectedPart = null;
  _clearSelectedRows();

  draw();
  updateReport();
  refreshPartsStatus();
  setStatus('Деталь убрана: ' + (state.parts[removed.partIdx]?.name || ''));
  return true;
}

export function duplicatePlacedPart(sheetIdx, placedIdx){
  const sheet = state.sheets[sheetIdx];
  if(!sheet) return false;
  const orig = sheet.placed[placedIdx];
  if(!orig) return false;

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const spot = _findFreeSpotForCopy(sheet, orig, W, H, buffer);
  if(!spot){
    setStatus('Не удалось найти свободное место рядом для копии');
    return false;
  }

  const newPlaced = {
    partIdx: orig.partIdx,
    polygons: orig.polygons.map(r => r.map(([px, py]) => [px, py])),
    x: spot.x, y: spot.y,
    bbox: [spot.x, spot.y, spot.x + spot.w, spot.y + spot.h],
    _manual: true,
    _fixed: false,
  };
  sheet.placed.push(newPlaced);
  state.selectedPart = { sheetIdx, placedIdx: sheet.placed.length - 1 };
  setStatus(`Деталь «${state.parts[orig.partIdx]?.name || ''}» дублирована`);
  draw();
  updateReport();
  refreshPartsStatus();
  pushHistory();
  return true;
}

export function duplicateSelection(){
  let sel = [];
  if(state.selectedParts && state.selectedParts.length){
    sel = state.selectedParts.map(sp => ({ sheetIdx: sp.sheetIdx, placedIdx: sp.placedIdx }));
  } else if(state.selectedPart){
    sel = [{ sheetIdx: state.selectedPart.sheetIdx, placedIdx: state.selectedPart.placedIdx }];
  }
  if(!sel.length) return 0;

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const newSel = [];
  for(const sp of sel){
    const sheet = state.sheets[sp.sheetIdx];
    if(!sheet) continue;
    const orig = sheet.placed[sp.placedIdx];
    if(!orig) continue;

    const spot = _findFreeSpotForCopy(sheet, orig, W, H, buffer);
    if(!spot) continue;

    const newPlaced = {
      partIdx: orig.partIdx,
      polygons: orig.polygons.map(r => r.map(([px, py]) => [px, py])),
      x: spot.x, y: spot.y,
      bbox: [spot.x, spot.y, spot.x + spot.w, spot.y + spot.h],
      _manual: true,
      _fixed: false,
    };
    sheet.placed.push(newPlaced);
    newSel.push({ sheetIdx: sp.sheetIdx, placedIdx: sheet.placed.length - 1 });
  }

  if(newSel.length > 0){
    state.selectedPart = newSel[0];
    state.selectedParts = newSel.length > 1 ? newSel : [];
    draw();
    updateReport();
    refreshPartsStatus();
    pushHistory();
  }
  return newSel.length;
}

// ═══════════════════════════════════════════════════════════════
// ДУБЛИРОВАНИЕ ПЕРЕТАСКИВАНИЕМ — ГРУППОВОЙ GHOST
// ═══════════════════════════════════════════════════════════════

export function startDuplicateDragFromSelection(sel){
  let arr = Array.isArray(sel) ? sel.slice() : (sel ? [sel] : []);
  arr = arr.filter(sp => sp && Number.isFinite(sp.sheetIdx) && Number.isFinite(sp.placedIdx));
  if(!arr.length) return false;

  const firstSheetIdx = arr[0].sheetIdx;
  arr = arr.filter(sp => sp.sheetIdx === firstSheetIdx);
  if(!arr.length) return false;

  const sheet = state.sheets[firstSheetIdx];
  if(!sheet) return false;

  const seen = new Set();
  const uniq = [];
  for(const sp of arr){
    if(seen.has(sp.placedIdx)) continue;
    seen.add(sp.placedIdx);
    uniq.push(sp);
  }

  const items = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const sp of uniq){
    const pl = sheet.placed[sp.placedIdx];
    if(!pl) continue;
    const w = pl.bbox[2] - pl.bbox[0];
    const h = pl.bbox[3] - pl.bbox[1];
    items.push({
      partIdx: pl.partIdx,
      polygons: pl.polygons.map(r => r.map(([px, py]) => [px, py])),
      w, h,
      x: pl.x, y: pl.y,
      origX: pl.x, origY: pl.y,
      collides: false,
    });
    if(pl.x < minX) minX = pl.x;
    if(pl.y < minY) minY = pl.y;
    if(pl.x + w > maxX) maxX = pl.x + w;
    if(pl.y + h > maxY) maxY = pl.y + h;
  }
  if(!items.length) return false;

  state.duplicateSource = {
    sheetIdx: firstSheetIdx,
    indices: uniq.map(sp => sp.placedIdx),
  };
  state.duplicateGhost = {
    items,
    startX: null, startY: null,
    bbox: [minX, minY, maxX, maxY],
    collides: false,
    valid: true,
    _attached: false,
    _dragging: false,
  };
  return true;
}

export function startDuplicateDrag(worldXY, hit){
  if(!hit) return false;
  return startDuplicateDragFromSelection({ sheetIdx: hit.sheetIdx, placedIdx: hit.placedIdx });
}

export function updateDuplicateGhost(worldXY){
  const g = state.duplicateGhost;
  if(!g || !g.items || !g.items.length) return;

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  if(g.startX == null){
    const bw = g.bbox[2] - g.bbox[0];
    const bh = g.bbox[3] - g.bbox[1];
    const bcx = g.bbox[0] + bw / 2;
    const bcy = g.bbox[1] + bh / 2;
    const dx = worldXY.x - bcx;
    const dy = worldXY.y - bcy;
    for(const it of g.items){
      it.origX = it.x + dx;
      it.origY = it.y + dy;
    }
    g.startX = worldXY.x;
    g.startY = worldXY.y;

    let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity;
    for(const it of g.items){
      if(it.origX < nMinX) nMinX = it.origX;
      if(it.origY < nMinY) nMinY = it.origY;
      if(it.origX + it.w > nMaxX) nMaxX = it.origX + it.w;
      if(it.origY + it.h > nMaxY) nMaxY = it.origY + it.h;
    }
    g.bbox = [nMinX, nMinY, nMaxX, nMaxY];
  }

  let dx = worldXY.x - g.startX;
  let dy = worldXY.y - g.startY;

  if(state.gridSnapMode){
    const step = Math.max(1, params.gridStep || 10);
    dx = Math.round(dx / step) * step;
    dy = Math.round(dy / step) * step;
  }

  const bw = g.bbox[2] - g.bbox[0];
  const bh = g.bbox[3] - g.bbox[1];
  let groupX = g.bbox[0] + dx;
  let groupY = g.bbox[1] + dy;
  if(groupX < 0) dx -= groupX;
  if(groupY < 0) dy -= groupY;
  if(groupX + bw > W) dx -= (groupX + bw - W);
  if(groupY + bh > H) dy -= (groupY + bh - H);

  for(const it of g.items){
    it.x = it.origX + dx;
    it.y = it.origY + dy;
    it.collides = false;
  }

  const sheet = state.sheets[state.duplicateSource.sheetIdx];
  const sourceSet = new Set(state.duplicateSource.indices || []);
  let anyCollides = false;

  if(sheet){
    for(let i = 0; i < g.items.length; i++){
      const it = g.items[i];
      const absA = it.polygons.map(r => r.map(([px, py]) => [px + it.x, py + it.y]));

      for(let si = 0; si < sheet.placed.length; si++){
        if(sourceSet.has(si)) continue;
        const other = sheet.placed[si];
        const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
        if(polysCollide(absA, absB, buffer)){ it.collides = true; anyCollides = true; break; }
      }
      if(it.collides) continue;

      for(let j = 0; j < g.items.length; j++){
        if(i === j) continue;
        const other = g.items[j];
        const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
        if(polysCollide(absA, absB, buffer)){ it.collides = true; anyCollides = true; break; }
      }

      if(!it.collides && params.sheetPolygons && params.sheetPolygons.length){
        const absPolys = it.polygons.map(r => r.map(([px, py]) => [px + it.x + params.edge, py + it.y + params.edge]));
        if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){
          it.collides = true; anyCollides = true;
        }
      }
    }
  }

  g.collides = anyCollides;
  g.valid = !anyCollides;

  let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity;
  for(const it of g.items){
    if(it.x < nMinX) nMinX = it.x;
    if(it.y < nMinY) nMinY = it.y;
    if(it.x + it.w > nMaxX) nMaxX = it.x + it.w;
    if(it.y + it.h > nMaxY) nMaxY = it.y + it.h;
  }
  g.bbox = [nMinX, nMinY, nMaxX, nMaxY];
}

export function commitDuplicateGhost(){
  const g = state.duplicateGhost;
  const src = state.duplicateSource;
  if(!g || !src || !g.items || !g.items.length) return false;

  const sheet = state.sheets[src.sheetIdx];
  if(!sheet){ cancelDuplicateDrag(); return false; }

  if(g.collides){
    setStatus('Наложение — копии не созданы. Перетащите в свободное место.');
    return false;
  }

  const newSel = [];
  for(const it of g.items){
    const newPlaced = {
      partIdx: it.partIdx,
      polygons: it.polygons.map(r => r.map(([px, py]) => [px, py])),
      x: it.x, y: it.y,
      bbox: [it.x, it.y, it.x + it.w, it.y + it.h],
      _manual: true,
      _fixed: false,
      _fromDuplicate: true,
    };
    sheet.placed.push(newPlaced);
    newSel.push({ sheetIdx: src.sheetIdx, placedIdx: sheet.placed.length - 1 });
  }

  state.selectedParts = newSel.length > 1 ? newSel : [];
  state.selectedPart = newSel[0];

  state.duplicateGhost = null;
  state.duplicateSource = null;

  draw();
  updateReport();
  refreshPartsStatus();
  pushHistory();
  setStatus(`Создано копий: ${g.items.length}. Esc — выход.`);
  return true;
}

export function cancelDuplicateDrag(){
  state.duplicateGhost = null;
  state.duplicateSource = null;
  draw();
}

// ═══════════════════════════════════════════════════════════════
// Поворот / зеркало / фиксация — одиночная деталь
// ═══════════════════════════════════════════════════════════════

export function rotateSelected(direction){
  if(!state.selectedPart) return false;
  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  if(!sheet) return false;
  const pl = sheet.placed[placedIdx];
  if(!pl) return false;
  if(pl._fixed){ setStatus('Деталь зафиксирована — поворот недоступен'); return false; }

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const oldW = pl.bbox[2] - pl.bbox[0];
  const oldH = pl.bbox[3] - pl.bbox[1];
  const cx = pl.x + oldW/2, cy = pl.y + oldH/2;

  const ang = direction * Math.PI / 2;
  const c = Math.cos(ang), s = Math.sin(ang);
  const rotated = pl.polygons.map(ring => ring.map(([x,y]) => [x*c - y*s, x*s + y*c]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const r of rotated) for(const [x,y] of r){
    if(x < minX) minX = x; if(x > maxX) maxX = x;
    if(y < minY) minY = y; if(y > maxY) maxY = y;
  }
  const newPolys = rotated.map(r => r.map(([x,y]) => [x - minX, y - minY]));
  const newW = maxX - minX, newH = maxY - minY;

  let nx = cx - newW/2, ny = cy - newH/2;
  if(nx < 0) nx = 0; if(ny < 0) ny = 0;
  if(nx + newW > W) nx = W - newW;
  if(ny + newH > H) ny = H - newH;

  const savedPolygons = pl.polygons;
  const savedBbox = pl.bbox;
  pl.polygons = newPolys;
  pl.bbox = [nx, ny, nx + newW, ny + newH];

  const thresholdMm = state.snapDisabled ? 0 : (params.snapThreshold || 0);
  const snap = computeSnap(sheet, pl, nx, ny, W, H, newW, newH, buffer, thresholdMm);

  const absA = newPolys.map(r => r.map(([px, py]) => [px + snap.x, py + snap.y]));
  let collides = false;
  for(const other of sheet.placed){
    if(other === pl) continue;
    const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if(polysCollide(absA, absB, buffer)){ collides = true; break; }
  }

  if(collides){
    pl.polygons = savedPolygons;
    pl.bbox = savedBbox;
    setStatus('Поворот невозможен — нет свободного места рядом');
    return false;
  }

  if(params.sheetPolygons && params.sheetPolygons.length){
    const absPolys = newPolys.map(r => r.map(([px,py]) => [px + snap.x + params.edge, py + snap.y + params.edge]));
    if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){
      pl.polygons = savedPolygons;
      pl.bbox = savedBbox;
      setStatus('Поворот невозможен — деталь выходит за контур заготовки');
      return false;
    }
  }

  pl.polygons = newPolys;
  pl.x = snap.x; pl.y = snap.y;
  pl.bbox = [snap.x, snap.y, snap.x + newW, snap.y + newH];
  pl._collides = false;

  state.snapGuides = (snap.guidesX.length || snap.guidesY.length)
    ? { sheetIdx, x: snap.guidesX, y: snap.guidesY }
    : null;

  draw();
  updateReport();
  setStatus('Деталь повёрнута на 90\u00B0');
  return true;
}

export function mirrorSelected(axis){
  if(!state.selectedPart) return false;
  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  if(!sheet) return false;
  const pl = sheet.placed[placedIdx];
  if(!pl) return false;
  if(pl._fixed){ setStatus('Деталь зафиксирована — зеркало недоступно'); return false; }

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const oldW = pl.bbox[2] - pl.bbox[0];
  const oldH = pl.bbox[3] - pl.bbox[1];
  const cx = pl.x + oldW/2, cy = pl.y + oldH/2;

  const mirrored = pl.polygons.map(ring => ring.map(([x, y]) =>
    axis === 'x' ? [-x, y] : [x, -y]
  ));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const r of mirrored) for(const [x, y] of r){
    if(x < minX) minX = x; if(x > maxX) maxX = x;
    if(y < minY) minY = y; if(y > maxY) maxY = y;
  }
  const newPolys = mirrored.map(r => r.map(([x, y]) => [x - minX, y - minY]));
  const newW = maxX - minX, newH = maxY - minY;

  let nx = cx - newW/2, ny = cy - newH/2;
  if(nx < 0) nx = 0; if(ny < 0) ny = 0;
  if(nx + newW > W) nx = W - newW;
  if(ny + newH > H) ny = H - newH;

  const savedPolygons = pl.polygons;
  const savedBbox = pl.bbox;
  pl.polygons = newPolys;
  pl.bbox = [nx, ny, nx + newW, ny + newH];

  const thresholdMm = state.snapDisabled ? 0 : (params.snapThreshold || 0);
  const snap = computeSnap(sheet, pl, nx, ny, W, H, newW, newH, buffer, thresholdMm);

  const absA = newPolys.map(r => r.map(([px, py]) => [px + snap.x, py + snap.y]));
  let collides = false;
  for(const other of sheet.placed){
    if(other === pl) continue;
    const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if(polysCollide(absA, absB, buffer)){ collides = true; break; }
  }

  if(collides){
    pl.polygons = savedPolygons;
    pl.bbox = savedBbox;
    setStatus('Зеркало невозможно — нет свободного места рядом');
    return false;
  }

  if(params.sheetPolygons && params.sheetPolygons.length){
    const absPolys = newPolys.map(r => r.map(([px,py]) => [px + snap.x + params.edge, py + snap.y + params.edge]));
    if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){
      pl.polygons = savedPolygons;
      pl.bbox = savedBbox;
      setStatus('Зеркало невозможно — деталь выходит за контур заготовки');
      return false;
    }
  }

  pl.polygons = newPolys;
  pl.x = snap.x; pl.y = snap.y;
  pl.bbox = [snap.x, snap.y, snap.x + newW, snap.y + newH];
  pl._collides = false;

  state.snapGuides = (snap.guidesX.length || snap.guidesY.length)
    ? { sheetIdx, x: snap.guidesX, y: snap.guidesY }
    : null;

  draw();
  updateReport();
  setStatus(axis === 'x'
    ? 'Деталь отражена по вертикальной оси (↔)'
    : 'Деталь отражена по горизонтальной оси (↕)');
  return true;
}

export function toggleFixSelected(){
  if(!state.selectedPart) return;
  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  const pl = sheet && sheet.placed[placedIdx];
  if(!pl) return;
  pl._fixed = !pl._fixed;
  draw();
  updateFixCount();
  setStatus(pl._fixed ? 'Деталь зафиксирована 📌' : 'Фиксация снята');
  pushHistory();
}

export function unfixAllPlaced(){
  let n = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) if(pl._fixed){ pl._fixed = false; n++; }
  draw();
  updateFixCount();
  setStatus(n ? `Фиксация снята с ${n} дет.` : 'Нет зафиксированных деталей');
  if(n > 0) pushHistory();
}

export function rotateSelectedGroup(direction){
  const list = state.selectedParts;
  if(!list || !list.length) return false;
  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const saved = [];
  for(const sp of list){
    const pl = getPlaced(sp);
    if(!pl || pl._fixed) continue;
    saved.push({
      pl, sheetIdx: sp.sheetIdx,
      polygons: pl.polygons,
      x: pl.x, y: pl.y,
      bbox: [...pl.bbox],
    });
  }
  if(!saved.length){ setStatus('Все выделенные детали зафиксированы'); return false; }

  for(const it of saved){
    const pl = it.pl;
    const oldW = pl.bbox[2] - pl.bbox[0];
    const oldH = pl.bbox[3] - pl.bbox[1];
    const cx = pl.x + oldW/2, cy = pl.y + oldH/2;
    const ang = direction * Math.PI / 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const rotated = pl.polygons.map(ring => ring.map(([x,y]) => [x*c - y*s, x*s + y*c]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const r of rotated) for(const [x,y] of r){
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
    }
    const newPolys = rotated.map(r => r.map(([x,y]) => [x - minX, y - minY]));
    const newW = maxX - minX, newH = maxY - minY;
    let nx = cx - newW/2, ny = cy - newH/2;
    if(nx < 0) nx = 0; if(ny < 0) ny = 0;
    if(nx + newW > W) nx = W - newW;
    if(ny + newH > H) ny = H - newH;
    pl.polygons = newPolys;
    pl.x = nx; pl.y = ny;
    pl.bbox = [nx, ny, nx + newW, ny + newH];
    pl._collides = false;
  }

  let anyCollision = false;
  for(const it of saved){
    const pl = it.pl;
    const sheet = state.sheets[it.sheetIdx];
    if(!sheet) continue;
    const absA = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x, py + pl.y]));
    for(const other of sheet.placed){
      if(other === pl) continue;
      const ob = other.bbox, bb = pl.bbox;
      if(bb[2] + buffer <= ob[0]) continue;
      if(bb[0] - buffer >= ob[2]) continue;
      if(bb[3] + buffer <= ob[1]) continue;
      if(bb[1] - buffer >= ob[3]) continue;
      const absB = other.polygons.map(r => r.map(([px,py]) => [px + other.x, py + other.y]));
      if(polysCollide(absA, absB, buffer)){ anyCollision = true; break; }
    }
    if(anyCollision) break;
    if(params.sheetPolygons && params.sheetPolygons.length){
      const absPolys = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x + params.edge, py + pl.y + params.edge]));
      if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){ anyCollision = true; break; }
    }
  }

  if(anyCollision){
    for(const it of saved){
      it.pl.polygons = it.polygons;
      it.pl.x = it.x; it.pl.y = it.y;
      it.pl.bbox = [...it.bbox];
      it.pl._collides = false;
    }
    setStatus('Поворот группы невозможен — наложение');
    return false;
  }

  draw(); updateReport();
  setStatus(`Повёрнуто на 90°: ${saved.length} дет.`);
  return true;
}

export function mirrorSelectedGroup(axis){
  const list = state.selectedParts;
  if(!list || !list.length) return false;
  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const saved = [];
  for(const sp of list){
    const pl = getPlaced(sp);
    if(!pl || pl._fixed) continue;
    saved.push({
      pl, sheetIdx: sp.sheetIdx,
      polygons: pl.polygons,
      x: pl.x, y: pl.y,
      bbox: [...pl.bbox],
    });
  }
  if(!saved.length){ setStatus('Все выделенные детали зафиксированы'); return false; }

  for(const it of saved){
    const pl = it.pl;
    const oldW = pl.bbox[2] - pl.bbox[0];
    const oldH = pl.bbox[3] - pl.bbox[1];
    const cx = pl.x + oldW/2, cy = pl.y + oldH/2;
    const mirrored = pl.polygons.map(ring => ring.map(([x, y]) =>
      axis === 'x' ? [-x, y] : [x, -y]
    ));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const r of mirrored) for(const [x, y] of r){
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
    }
    const newPolys = mirrored.map(r => r.map(([x, y]) => [x - minX, y - minY]));
    const newW = maxX - minX, newH = maxY - minY;
    let nx = cx - newW/2, ny = cy - newH/2;
    if(nx < 0) nx = 0; if(ny < 0) ny = 0;
    if(nx + newW > W) nx = W - newW;
    if(ny + newH > H) ny = H - newH;
    pl.polygons = newPolys;
    pl.x = nx; pl.y = ny;
    pl.bbox = [nx, ny, nx + newW, ny + newH];
    pl._collides = false;
  }

  let anyCollision = false;
  for(const it of saved){
    const pl = it.pl;
    const sheet = state.sheets[it.sheetIdx];
    if(!sheet) continue;
    const absA = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x, py + pl.y]));
    for(const other of sheet.placed){
      if(other === pl) continue;
      const ob = other.bbox, bb = pl.bbox;
      if(bb[2] + buffer <= ob[0]) continue;
      if(bb[0] - buffer >= ob[2]) continue;
      if(bb[3] + buffer <= ob[1]) continue;
      if(bb[1] - buffer >= ob[3]) continue;
      const absB = other.polygons.map(r => r.map(([px,py]) => [px + other.x, py + other.y]));
      if(polysCollide(absA, absB, buffer)){ anyCollision = true; break; }
    }
    if(anyCollision) break;
    if(params.sheetPolygons && params.sheetPolygons.length){
      const absPolys = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x + params.edge, py + pl.y + params.edge]));
      if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)){ anyCollision = true; break; }
    }
  }

  if(anyCollision){
    for(const it of saved){
      it.pl.polygons = it.polygons;
      it.pl.x = it.x; it.pl.y = it.y;
      it.pl.bbox = [...it.bbox];
      it.pl._collides = false;
    }
    setStatus('Зеркало группы невозможно — наложение');
    return false;
  }

  draw(); updateReport();
  setStatus(`Отражено: ${saved.length} дет.`);
  return true;
}

export function deleteSelectedGroup(){
  const list = state.selectedParts;
  if(!list || !list.length) return false;

  const sorted = [...list].sort((a, b) => {
    if(a.sheetIdx !== b.sheetIdx) return b.sheetIdx - a.sheetIdx;
    return b.placedIdx - a.placedIdx;
  });

  let deleted = 0, skipped = 0;
  for(const sp of sorted){
    const sheet = state.sheets[sp.sheetIdx];
    if(!sheet) continue;
    const pl = sheet.placed[sp.placedIdx];
    if(!pl) continue;
    if(pl._fixed){ skipped++; continue; }
    sheet.placed.splice(sp.placedIdx, 1);
    deleted++;
  }

  state.selectedParts = [];
  state.selectedPart = null;
  _clearSelectedRows();

  draw();
  updateReport();
  refreshPartsStatus();
  if(deleted){
    setStatus(`Удалено: ${deleted} дет.` + (skipped ? ` (пропущено зафиксированных: ${skipped})` : ''));
    pushHistory();
  } else if(skipped){
    setStatus(`Нельзя удалить: все ${skipped} дет. зафиксированы`);
  }
  return deleted > 0;
}

export function toggleFixGroup(){
  const list = state.selectedParts;
  if(!list || !list.length) return false;
  let anyFixed = false, count = 0;
  for(const sp of list){
    const pl = getPlaced(sp);
    if(!pl) continue;
    if(pl._fixed) anyFixed = true;
    count++;
  }
  if(!count) return false;
  const newFixed = !anyFixed;
  for(const sp of list){
    const pl = getPlaced(sp);
    if(pl) pl._fixed = newFixed;
  }
  draw();
  updateFixCount();
  setStatus(newFixed ? `Зафиксировано: ${count} дет.` : `Фиксация снята: ${count} дет.`);
  pushHistory();
  return true;
}