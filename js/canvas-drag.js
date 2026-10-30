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

export function enterGroupSelectMode(){
  state.remnantMode = false;
  state.remnantPreview = null;
  state.pendingEmptySelection = null;
  const mr = document.getElementById('btnMarkRemnant');
  if (mr) mr.classList.remove('active');

  state.groupSelectMode = true;
  state.groupSelectDrag = null;
  state.selectedPart = null;
  canvas.style.cursor = 'crosshair';
  const btn = document.getElementById('btnSelectFrame');
  if(btn) btn.classList.add('active');
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = 'Обведите рамкой: детали — выделение, пустую область — запомним её для Фиксации/Остатка · Shift+рамка — добавить к выделению · Esc — отмена';
  setStatus('Режим области: обведите детали или пустое место');
  draw();
}

export function exitGroupSelectMode(){
  state.groupSelectMode = false;
  state.groupSelectDrag = null;
  state.pendingEmptySelection = null;
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
  const distPx = Math.hypot(maxX - minX, maxY - minY);

  // Клик без протяжки — снять выделение (таблицу не трогаем)
  if(distPx < 2){
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

  // ─── 0. Лист, где НАЧАТА рамка (по mousedown-точке) ───
  const startWX = (rd.x0 - v.originX) / v.scale;
  const startWY = (v.originY - rd.y0) / v.scale;
  let startSheetIdx = -1;
  for(let si=0; si<state.sheets.length; si++){
    const x0 = si * (v.SW + v.gapBetween);
    if(startWX >= x0 && startWX <= x0 + v.SW && startWY >= 0 && startWY <= v.SH){
      startSheetIdx = si;
      break;
    }
  }

  // ─── 1. Выделение деталей по центрам ───
  const selected = [];
  for(let si=0; si<state.sheets.length; si++){
    // Если рамка начата на конкретном листе — выделяем только там
    if(startSheetIdx >= 0 && si !== startSheetIdx) continue;

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

  if(state.selectedParts.length){
    state.pendingEmptySelection = null;
    draw();
    setStatus('Выделено: ' + state.selectedParts.length + ' дет. Тащите любую — двинется вся группа. R/Z — повернуть/зеркалить. Delete — удалить.');
    return;
  }

  // ─── 2. Определяем лист для «пустой области» ───
  let targetSi = -1;

  // 2a. Приоритет — лист, где начата рамка
  if(startSheetIdx >= 0){
    targetSi = startSheetIdx;
  } else {
    // 2b. Иначе — по центру рамки
    const cxWorld = (wx0 + wx1) / 2;
    const cyWorld = (wy0 + wy1) / 2;
    for(let si=0; si<state.sheets.length; si++){
      const x0 = si * (v.SW + v.gapBetween);
      if(cxWorld >= x0 && cxWorld <= x0 + v.SW && cyWorld >= 0 && cyWorld <= v.SH){
        targetSi = si;
        break;
      }
    }
    // 2c. Иначе — по максимальной площади пересечения
    if(targetSi < 0){
      let bestArea = 0;
      for(let si=0; si<state.sheets.length; si++){
        const x0 = si * (v.SW + v.gapBetween);
        const ix0 = Math.max(wx0, x0), ix1 = Math.min(wx1, x0 + v.SW);
        const iy0 = Math.max(wy0, 0),  iy1 = Math.min(wy1, v.SH);
        if(ix0 < ix1 && iy0 < iy1){
          const area = (ix1 - ix0) * (iy1 - iy0);
          if(area > bestArea){ bestArea = area; targetSi = si; }
        }
      }
    }
  }

  if(targetSi < 0){
    setStatus('Рамка вне листа');
    draw();
    return;
  }

  const ox = targetSi * (v.SW + v.gapBetween);
  let lx0 = wx0 - ox, lx1 = wx1 - ox;
  let ly0 = wy0, ly1 = wy1;

  // ─── 3. Обрезка до [0, SW] × [0, SH] ───
  lx0 = Math.max(0, Math.min(v.SW, lx0));
  lx1 = Math.max(0, Math.min(v.SW, lx1));
  ly0 = Math.max(0, Math.min(v.SH, ly0));
  ly1 = Math.max(0, Math.min(v.SH, ly1));

  // ─── 4. Привязка к сетке с магнитом к краям ───
  const params = v.params;
  const step = Math.max(1, params.gridStep || 10);
  const snapEdge = Math.max(50, step * 3);

  const snapToGrid = function(val, max){
    if (val <= snapEdge) return 0;
    if (val >= max - snapEdge) return max;
    return Math.round(val / step) * step;
  };

  lx0 = snapToGrid(lx0, v.SW);
  lx1 = snapToGrid(lx1, v.SW);
  ly0 = snapToGrid(ly0, v.SH);
  ly1 = snapToGrid(ly1, v.SH);

  if (lx0 > lx1) { const t = lx0; lx0 = lx1; lx1 = t; }
  if (ly0 > ly1) { const t = ly0; ly0 = ly1; ly1 = t; }

  const w = lx1 - lx0, h = ly1 - ly0;
  if(w < 20 || h < 20){
    setStatus('Область слишком мала (мин. 20×20 мм)');
    draw();
    return;
  }

  // ─── 5. В области не должно быть деталей ───
  const sheet = state.sheets[targetSi];
  if (sheet){
    for (const pl of sheet.placed){
      if (pl.bbox[0] < lx1 && pl.bbox[2] > lx0 &&
          pl.bbox[1] < ly1 && pl.bbox[3] > ly0){
        setStatus('В области есть детали — уберите их или выделите рамкой вместе с ними');
        draw();
        return;
      }
    }
  }

  // ─── 6. Сохраняем ───
  state.pendingEmptySelection = {
    sheetIdx: targetSi,
    rect: { x1: lx0, y1: ly0, x2: lx1, y2: ly1 },
    w: w, h: h
  };

  const touchesEdge =
    lx0 <= 1e-3 || lx1 >= v.SW - 1e-3 ||
    ly0 <= 1e-3 || ly1 >= v.SH - 1e-3;
  const edgeNote = touchesEdge ? ' (до края листа)' : '';
  const sheetNote = 'Лист ' + (targetSi + 1) + ': ';
  setStatus(sheetNote + 'Область' + edgeNote + ' — ' + Math.round(w) + ' x ' + Math.round(h) + ' мм. Нажмите Фиксация (запрет) или Остаток (сохранить)');
  draw();
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
      origBBox: [...pl.bbox],
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
    if(!collides && sheet.obstacles && sheet.obstacles.length){
      const bb = pl.bbox;
      for (const obs of sheet.obstacles){
        if (bb[0] < obs.x2 && bb[2] > obs.x1 && bb[1] < obs.y2 && bb[3] > obs.y1){
          collides = true; break;
        }
      }
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
      it.pl.bbox = [...it.origBBox];
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