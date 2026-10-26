import { canvas, screenToWorld, worldToSheet, partCollidesAt, getPlaced, DEFAULT_HINT } from './canvas-core.js';
import { draw } from './canvas-draw.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { computeSnap } from './snap.js';
import { updateReport } from './report.js';
import { pushHistory } from './history.js';
import { setStatus } from './utils.js';
import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';

export function moveDraggedPart(worldXY){
  const v = state.view; if(!v) return;
  const params = v.params;
  const { SW, gapBetween } = v;
  const drag = state.drag;
  if(!drag) return;

  const gridStep = Math.max(1, params.gridStep || 10);

  const targetWorldX = worldXY.x - drag.grabDx;
  const targetWorldY = worldXY.y - drag.grabDy;

  let targetSi = drag.orig.sheetIdx;
  const cs = worldToSheet(worldXY.x, worldXY.y);
  if(cs) targetSi = cs.sheetIdx;
  else {
    let bestSi = drag.orig.sheetIdx, bestD = Infinity;
    for(let si=0; si<state.sheets.length; si++){
      const x0 = si * (SW + gapBetween);
      const cx = x0 + SW/2;
      const d = Math.abs(worldXY.x - cx);
      if(d < bestD){ bestD = d; bestSi = si; }
    }
    targetSi = bestSi;
  }

  const x0 = targetSi * (SW + gapBetween);
  let localX = targetWorldX - x0 - params.edge;
  let localY = targetWorldY - params.edge;

  const fromSheet = state.sheets[drag.orig.sheetIdx];
  if(!fromSheet) return;
  const pl = fromSheet.placed[drag.orig.placedIdx];
  if(!pl) return;

  if(targetSi !== drag.orig.sheetIdx){
    fromSheet.placed.splice(drag.orig.placedIdx, 1);
    state.sheets[targetSi].placed.push(pl);
    drag.orig.sheetIdx = targetSi;
    drag.orig.placedIdx = state.sheets[targetSi].placed.length - 1;
    state.selectedPart = { sheetIdx: targetSi, placedIdx: drag.orig.placedIdx };
    drag._moved = true;
  }

  const targetSheet = state.sheets[targetSi];
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;
  const myW = pl.bbox[2] - pl.bbox[0];
  const myH = pl.bbox[3] - pl.bbox[1];

  if(state.gridSnapMode && gridStep > 0){
    if(targetSi === drag.orig.sheetIdx){
      const ddx = localX - drag.orig.x;
      const ddy = localY - drag.orig.y;
      localX = drag.orig.x + Math.round(ddx / gridStep) * gridStep;
      localY = drag.orig.y + Math.round(ddy / gridStep) * gridStep;
    } else {
      localX = Math.round(localX / gridStep) * gridStep;
      localY = Math.round(localY / gridStep) * gridStep;
    }
    drag._gridUsed = true;
  }

  if(localX < 0) localX = 0;
  if(localY < 0) localY = 0;
  if(localX + myW > W) localX = W - myW;
  if(localY + myH > H) localY = H - myH;

  pl.x = localX;
  pl.y = localY;
  pl.bbox = [localX, localY, localX + myW, localY + myH];
  pl._collides = partCollidesAt(targetSheet, pl, localX, localY, buffer, W, H);

  if(!drag._moved && (localX !== drag.orig.x || localY !== drag.orig.y)){
    drag._moved = true;
  }

  if(!state.gridSnapMode && !state.snapDisabled && params.snapThreshold > 0){
    const snap = computeSnap(targetSheet, pl, localX, localY, W, H, myW, myH, buffer, params.snapThreshold);
    if(snap.guidesX.length || snap.guidesY.length){
      state.snapGuides = { sheetIdx: targetSi, x: snap.guidesX, y: snap.guidesY };
    } else {
      state.snapGuides = null;
    }
  } else {
    state.snapGuides = null;
  }
}

export function revertDrag(){
  const drag = state.drag; if(!drag) return;
  const sheet = state.sheets[drag.orig.sheetIdx];
  if(!sheet) return;
  const pl = sheet.placed[drag.orig.placedIdx];
  if(!pl) return;
  pl.x = drag.orig.x;
  pl.y = drag.orig.y;
  pl.bbox = [...drag.orig.bbox];
  pl._collides = false;
}

// ─── Групповое выделение и перемещение ───

export function enterGroupSelectMode(){
  state.groupSelectMode = true;
  state.groupSelectDrag = null;
  state.selectedPart = null;
  canvas.style.cursor = 'crosshair';
  const btn = document.getElementById('btnSelectFrame');
  if(btn) btn.classList.add('active');
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = 'Обведите рамкой детали · Shift+рамка — добавить к выделению · Esc — отмена';
  setStatus('Режим выделения рамкой: обведите группу деталей');
  draw();
}

export function exitGroupSelectMode(){
  state.groupSelectMode = false;
  state.groupSelectDrag = null;
  canvas.style.cursor = '';
  const btn = document.getElementById('btnSelectFrame');
  if(btn) btn.classList.remove('active');
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = DEFAULT_HINT;
  setStatus('');
  draw();
}

export function finalizeGroupSelect(){
  const rd = state.groupSelectDrag;
  const wasShift = rd && rd._shift;
  const fromMouse = rd && rd._fromMouse;
  state.groupSelectDrag = null;

  // Если это была рамка от кнопки — выключаем режим
  if(!fromMouse){
    state.groupSelectMode = false;
    canvas.style.cursor = '';
    const btn = document.getElementById('btnSelectFrame');
    if(btn) btn.classList.remove('active');
  }
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = DEFAULT_HINT;

  if(!rd){ draw(); return; }

  const minX = Math.min(rd.x0, rd.x1), maxX = Math.max(rd.x0, rd.x1);
  const minY = Math.min(rd.y0, rd.y1), maxY = Math.max(rd.y0, rd.y1);
  const dist = Math.hypot(maxX - minX, maxY - minY);

  // Клик без движения
  if(dist < 5){
    if(fromMouse){
      state.selectedParts = [];
      state.selectedPart = null;
      setStatus('');
    } else {
      setStatus('Выделение отменено (рамка слишком мала)');
    }
    draw();
    return;
  }

  const v = state.view; if(!v){ draw(); return; }
  const wx0 = (minX - v.originX) / v.scale, wx1 = (maxX - v.originX) / v.scale;
  const wy0 = (v.originY - maxY) / v.scale, wy1 = (v.originY - minY) / v.scale;

  const selected = [];
  for(let si=0; si<state.sheets.length; si++){
    const sheet = state.sheets[si];
    const x0 = si * (v.SW + v.gapBetween);
    for(let pi=0; pi<sheet.placed.length; pi++){
      const pl = sheet.placed[pi];
      const w = pl.bbox[2] - pl.bbox[0];
      const h = pl.bbox[3] - pl.bbox[1];
      const cx = x0 + v.params.edge + pl.x + w/2;
      const cy = v.params.edge + pl.y + h/2;
      if(cx >= wx0 && cx <= wx1 && cy >= wy0 && cy <= wy1){
        selected.push({ sheetIdx: si, placedIdx: pi });
      }
    }
  }

  if(wasShift && state.selectedParts && state.selectedParts.length){
    const existing = new Set(state.selectedParts.map(sp => sp.sheetIdx + ':' + sp.placedIdx));
    for(const s of selected){
      const k = s.sheetIdx + ':' + s.placedIdx;
      if(!existing.has(k)){ state.selectedParts.push(s); existing.add(k); }
    }
  } else {
    state.selectedParts = selected;
  }

  draw();
  const total = state.selectedParts.length;
  if(total){
    setStatus(`Выделено: ${total} дет. Тащите любую — двинется вся группа. R/Z — повернуть/зеркалить. Delete — удалить.`);
  } else {
    setStatus('В рамке нет деталей');
  }
}

export function startGroupDrag(worldXY){
  const selected = state.selectedParts;
  if(!selected || !selected.length) return false;

  const items = [];
  for(const sp of selected){
    const pl = getPlaced(sp);
    if(!pl) continue;
    if(pl._fixed) continue;
    items.push({
      sheetIdx: sp.sheetIdx,
      placedIdx: sp.placedIdx,
      pl,
      origX: pl.x,
      origY: pl.y,
      origBbox: [...pl.bbox],
      w: pl.bbox[2] - pl.bbox[0],
      h: pl.bbox[3] - pl.bbox[1],
    });
  }
  if(!items.length) return false;

  state.groupDrag = {
    items,
    startX: worldXY.x,
    startY: worldXY.y,
    _moved: false,
  };
  return true;
}

export function moveGroup(worldXY){
  const gd = state.groupDrag;
  if(!gd) return;
  const v = state.view; if(!v) return;
  const params = v.params;
  const buffer = params.kerf + params.gap;
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const gridStep = Math.max(1, params.gridStep || 10);

  let dx = worldXY.x - gd.startX;
  let dy = worldXY.y - gd.startY;

  if(state.gridSnapMode && gridStep > 0){
    dx = Math.round(dx / gridStep) * gridStep;
    dy = Math.round(dy / gridStep) * gridStep;
    gd._gridUsed = true;
  }

  if(Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return;
  gd._moved = true;

  for(const it of gd.items){
    let nx = it.origX + dx;
    let ny = it.origY + dy;
    if(nx < 0) nx = 0;
    if(ny < 0) ny = 0;
    if(nx + it.w > W) nx = W - it.w;
    if(ny + it.h > H) ny = H - it.h;
    it.pl.x = nx;
    it.pl.y = ny;
    it.pl.bbox = [nx, ny, nx + it.w, ny + it.h];
    it.pl._collides = false;
  }

  const movedSet = new Set(gd.items.map(it => it.pl));
  for(const it of gd.items){
    const pl = it.pl;
    const sheet = state.sheets[it.sheetIdx];
    if(!sheet) continue;
    let collides = false;

    const absA = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x, py + pl.y]));
    for(const other of sheet.placed){
      if(other === pl) continue;
      if(movedSet.has(other)) continue;
      const ob = other.bbox, bb = pl.bbox;
      if(bb[2] + buffer <= ob[0]) continue;
      if(bb[0] - buffer >= ob[2]) continue;
      if(bb[3] + buffer <= ob[1]) continue;
      if(bb[1] - buffer >= ob[3]) continue;
      const absB = other.polygons.map(r => r.map(([px,py]) => [px + other.x, py + other.y]));
      if(polysCollide(absA, absB, buffer)){ collides = true; break; }
    }
    if(!collides){
      for(const other of gd.items){
        if(other === it) continue;
        const op = other.pl;
        const ob = op.bbox, bb = pl.bbox;
        if(bb[2] + buffer <= ob[0]) continue;
        if(bb[0] - buffer >= ob[2]) continue;
        if(bb[3] + buffer <= ob[1]) continue;
        if(bb[1] - buffer >= ob[3]) continue;
        const absB = op.polygons.map(r => r.map(([px,py]) => [px + op.x, py + op.y]));
        if(polysCollide(absA, absB, buffer)){ collides = true; break; }
      }
    }
    if(!collides && params.sheetPolygons && params.sheetPolygons.length){
      const absPolys = pl.polygons.map(r => r.map(([px,py]) => [px + pl.x + params.edge, py + pl.y + params.edge]));
      if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) collides = true;
    }
    pl._collides = collides;
  }
}

export function endGroupDrag(){
  const gd = state.groupDrag;
  state.groupDrag = null;
  if(!gd) return;
  const moved = gd._moved;
  if(!moved){ draw(); return; }

  let anyCollision = false;
  for(const it of gd.items) if(it.pl._collides){ anyCollision = true; break; }

  if(anyCollision){
    for(const it of gd.items){
      it.pl.x = it.origX;
      it.pl.y = it.origY;
      it.pl.bbox = [...it.origBbox];
      it.pl._collides = false;
    }
    setStatus('Наложение при групповом перемещении — позиции восстановлены');
  } else {
    setStatus(`Группа перемещена: ${gd.items.length} дет.`);
  }

  draw();
  updateReport();
  pushHistory();
}