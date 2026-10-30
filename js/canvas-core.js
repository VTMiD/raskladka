import { state } from './state.js';
import { readParams } from './params.js';
import { pointInRing, polysCollide, isPartInsideSheetPolygon } from './geometry.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

export const DEFAULT_HINT = 'ЛКМ на пустом — рамка выделения · ЛКМ на детали — тащить · Shift+рамка — добавить · R/Z — поворот/зеркало · Delete — убрать · Esc — снять выделение · Alt — шаг сетки';

export function screenToWorld(px, py){
  const v = state.view; if(!v) return null;
  return { x: (px - v.originX) / v.scale, y: (v.originY - py) / v.scale };
}

export function worldToSheet(wx, wy){
  const v = state.view; if(!v) return null;
  const { SW, SH, gapBetween } = v;
  if(wy < 0 || wy > SH) return null;
  for(let si=0; si<state.sheets.length; si++){
    const x0 = si * (SW + gapBetween);
    if(wx >= x0 && wx <= x0 + SW) return { sheetIdx: si, x: wx - x0, y: wy };
  }
  return null;
}

export function hitTest(wx, wy){
  const v = state.view; if(!v) return null;
  const { SW, gapBetween, params } = v;
  for(let si=0; si<state.sheets.length; si++){
    const sheet = state.sheets[si];
    const x0 = si * (SW + gapBetween);
    if(wx < x0 || wx > x0 + SW) continue;
    const lx = wx - x0 - params.edge;
    const ly = wy - params.edge;
    for(let pi=sheet.placed.length-1; pi>=0; pi--){
      const pl = sheet.placed[pi];
      for(const ring of pl.polygons){
        const abs = ring.map(([x,y]) => [x + pl.x, y + pl.y]);
        if(pointInRing([lx, ly], abs)){
          return {
            sheetIdx: si, placedIdx: pi,
            worldX: x0 + params.edge + pl.x,
            worldY: params.edge + pl.y
          };
        }
      }
    }
  }
  return null;
}

export function getPlaced(sp){
  if(!sp) return null;
  const sheet = state.sheets[sp.sheetIdx];
  if(!sheet) return null;
  return sheet.placed[sp.placedIdx] || null;
}

export function isInGroup(si, pi){
  const list = state.selectedParts;
  if(!list || !list.length) return false;
  for(const sp of list){
    if(sp.sheetIdx === si && sp.placedIdx === pi) return true;
  }
  return false;
}

export function partCollidesAt(sheet, pl, x, y, buffer, W, H){
  if(x < -1e-3 || y < -1e-3) return true;
  const w = pl.bbox[2] - pl.bbox[0];
  const h = pl.bbox[3] - pl.bbox[1];
  if(x + w > W + 1e-3 || y + h > H + 1e-3) return true;

  const params = readParams();
  if(params.sheetPolygons && params.sheetPolygons.length){
    const absPolys = pl.polygons.map(r => r.map(([px,py]) => [px + x + params.edge, py + y + params.edge]));
    if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) return true;
  }

  // ─── Проверка запретных зон (obstacles) ───
  if (sheet.obstacles && sheet.obstacles.length) {
    for (const obs of sheet.obstacles) {
      if (x < obs.x2 && x + w > obs.x1 && y < obs.y2 && y + h > obs.y1) return true;
    }
  }

  const absA = pl.polygons.map(r => r.map(([px,py]) => [px + x, py + y]));
  for(const other of sheet.placed){
    if(other === pl) continue;
    const absB = other.polygons.map(r => r.map(([px,py]) => [px + other.x, py + other.y]));
    if(polysCollide(absA, absB, buffer)) return true;
  }
  return false;
}

export function findNearestFreePosition(sheet, pl, x, y, W, H, buffer){
  const myW = pl.bbox[2] - pl.bbox[0];
  const myH = pl.bbox[3] - pl.bbox[1];

  if(!partCollidesAt(sheet, pl, x, y, buffer, W, H)){
    return { x, y, found: true };
  }

  const xSet = new Set();
  const ySet = new Set();
  xSet.add(0); xSet.add(W - myW); xSet.add(x);
  ySet.add(0); ySet.add(H - myH); ySet.add(y);

  for(const other of sheet.placed){
    if(other === pl) continue;
    const ob = other.bbox;
    xSet.add(ob[0] - myW - buffer);
    xSet.add(ob[2] + buffer);
    xSet.add(ob[0]);
    xSet.add(ob[2] - myW);
    ySet.add(ob[1] - myH - buffer);
    ySet.add(ob[3] + buffer);
    ySet.add(ob[1]);
    ySet.add(ob[3] - myH);
  }

  // Учитываем запретные зоны как препятствия
  if (sheet.obstacles && sheet.obstacles.length) {
    for (const obs of sheet.obstacles) {
      xSet.add(obs.x1 - myW - buffer);
      xSet.add(obs.x2 + buffer);
      xSet.add(obs.x1);
      xSet.add(obs.x2 - myW);
      ySet.add(obs.y1 - myH - buffer);
      ySet.add(obs.y2 + buffer);
      ySet.add(obs.y1);
      ySet.add(obs.y2 - myH);
    }
  }

  const candidates = [];
  for(const cx of xSet){
    if(cx < -1e-3 || cx + myW > W + 1e-3) continue;
    for(const cy of ySet){
      if(cy < -1e-3 || cy + myH > H + 1e-3) continue;
      const d = Math.hypot(cx - x, cy - y);
      if(d < 1e-3) continue;
      candidates.push({ x: cx, y: cy, _d: d });
    }
  }
  candidates.sort((a, b) => a._d - b._d);

  for(const c of candidates){
    if(!partCollidesAt(sheet, pl, c.x, c.y, buffer, W, H)){
      return { x: c.x, y: c.y, found: true };
    }
  }
  return { x, y, found: false };
}

export function updateFixCount(){
  const el = document.getElementById('fixCount');
  if(!el) return;
  let n = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) if(pl._fixed) n++;
  el.textContent = `📌 Зафиксировано: ${n}`;
}