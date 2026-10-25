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
  const w = orig.bbox[2] - orig.bbox[0];
  const h = orig.bbox[3] - orig.bbox[1];

  const offsets = [
    [w + buffer, 0], [-(w + buffer), 0],
    [0, h + buffer], [0, -(h + buffer)],
  ];
  for(let dy = -3; dy <= 3; dy++){
    for(let dx = -3; dx <= 3; dx++){
      if(dx === 0 && dy === 0) continue;
      offsets.push([dx * (w + buffer), dy * (h + buffer)]);
    }
  }

  const newPolygons = orig.polygons.map(r => r.map(([px, py]) => [px, py]));

  for(const [dx, dy] of offsets){
    const nx = orig.x + dx;
    const ny = orig.y + dy;
    if(nx < -1e-3 || ny < -1e-3) continue;
    if(nx + w > W + 1e-3 || ny + h > H + 1e-3) continue;

    if(params.sheetPolygons && params.sheetPolygons.length){
      const absPolys = newPolygons.map(r => r.map(([px,py]) => [px + nx + params.edge, py + ny + params.edge]));
      if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) continue;
    }

    const absA = newPolygons.map(r => r.map(([px, py]) => [px + nx, py + ny]));
    let collides = false;
    for(const other of sheet.placed){
      const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
      if(polysCollide(absA, absB, buffer)){ collides = true; break; }
    }
    if(collides) continue;

    const newPlaced = {
      partIdx: orig.partIdx,
      polygons: newPolygons,
      x: nx, y: ny,
      bbox: [nx, ny, nx + w, ny + h],
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

  setStatus('Не удалось найти свободное место рядом для копии');
  return false;
}

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