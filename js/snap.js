import { polysCollide, isPartInsideSheetPolygon } from './geometry.js';
import { readParams } from './params.js';

export function computeSnap(sheet, pl, desiredX, desiredY, W, H, myW, myH, buffer, thresholdMm){
  const empty = { x: desiredX, y: desiredY, guidesX: [], guidesY: [] };
  if(thresholdMm <= 0) return empty;

  const candX = [];
  candX.push({ value: 0,             ref: 0,     kind: 'edge' });
  candX.push({ value: W - myW,       ref: W,     kind: 'edge' });
  candX.push({ value: (W - myW) / 2, ref: W / 2, kind: 'center' });

  for(const other of sheet.placed){
    if(other === pl) continue;
    const ox  = other.x;
    const ow  = other.bbox[2] - other.bbox[0];
    const ocx = ox + ow / 2;
    candX.push({ value: ox - myW - buffer, ref: ox - buffer,       kind: 'adjacent-left' });
    candX.push({ value: ox + ow + buffer,  ref: ox + ow + buffer,  kind: 'adjacent-right' });
    candX.push({ value: ox,                ref: ox,                kind: 'align-left' });
    candX.push({ value: ox + ow - myW,     ref: ox + ow,           kind: 'align-right' });
    candX.push({ value: ocx - myW / 2,     ref: ocx,               kind: 'align-center' });
  }

  const candY = [];
  candY.push({ value: 0,             ref: 0,     kind: 'edge' });
  candY.push({ value: H - myH,       ref: H,     kind: 'edge' });
  candY.push({ value: (H - myH) / 2, ref: H / 2, kind: 'center' });

  for(const other of sheet.placed){
    if(other === pl) continue;
    const oy  = other.y;
    const oh  = other.bbox[3] - other.bbox[1];
    const ocy = oy + oh / 2;
    candY.push({ value: oy - myH - buffer, ref: oy - buffer,       kind: 'adjacent-bottom' });
    candY.push({ value: oy + oh + buffer,  ref: oy + oh + buffer,  kind: 'adjacent-top' });
    candY.push({ value: oy,                ref: oy,                kind: 'align-bottom' });
    candY.push({ value: oy + oh - myH,     ref: oy + oh,           kind: 'align-top' });
    candY.push({ value: ocy - myH / 2,     ref: ocy,               kind: 'align-center' });
  }

  let bestX = null, bestDistX = thresholdMm;
  for(const c of candX){
    const d = Math.abs(c.value - desiredX);
    if(d < bestDistX){ bestDistX = d; bestX = c; }
  }
  let bestY = null, bestDistY = thresholdMm;
  for(const c of candY){
    const d = Math.abs(c.value - desiredY);
    if(d < bestDistY){ bestDistY = d; bestY = c; }
  }

  let finalX = bestX ? bestX.value : desiredX;
  let finalY = bestY ? bestY.value : desiredY;

  const params = readParams();

  function collidesAt(x, y){
    if(x < -1e-3 || y < -1e-3) return true;
    if(x + myW > W + 1e-3 || y + myH > H + 1e-3) return true;

    if(params.sheetPolygons && params.sheetPolygons.length){
      const absPolys = pl.polygons.map(r => r.map(([px,py]) => [px + x + params.edge, py + y + params.edge]));
      if(!isPartInsideSheetPolygon(absPolys, params.sheetPolygons, params.edge)) return true;
    }

    const absA = pl.polygons.map(r => r.map(([px, py]) => [px + x, py + y]));
    for(const other of sheet.placed){
      if(other === pl) continue;
      const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
      if(polysCollide(absA, absB, buffer)) return true;
    }
    return false;
  }

  let pushed = null;

  if(collidesAt(finalX, finalY)){
    if(bestY && !collidesAt(desiredX, bestY.value)){
      finalX = desiredX;
    } else if(bestX && !collidesAt(bestX.value, desiredY)){
      finalY = desiredY;
    } else {
      finalX = desiredX;
      finalY = desiredY;
      bestX = null;
      bestY = null;

      const collidingOthers = [];
      const absA0 = pl.polygons.map(r => r.map(([px, py]) => [px + finalX, py + finalY]));
      for(const other of sheet.placed){
        if(other === pl) continue;
        const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
        if(polysCollide(absA0, absB, buffer)) collidingOthers.push(other);
      }

      let pushBest = null, pushBestD = Infinity;
      for(const other of collidingOthers){
        const ox = other.x, oy = other.y;
        const ow = other.bbox[2] - other.bbox[0];
        const oh = other.bbox[3] - other.bbox[1];
        const pushes = [
          { x: ox - myW - buffer, y: desiredY, ref: ox - buffer,      axis: 'x' },
          { x: ox + ow + buffer,  y: desiredY, ref: ox + ow + buffer, axis: 'x' },
          { x: desiredX, y: oy - myH - buffer, ref: oy - buffer,      axis: 'y' },
          { x: desiredX, y: oy + oh + buffer,  ref: oy + oh + buffer, axis: 'y' },
        ];
        for(const p of pushes){
          if(p.x < -1e-3 || p.y < -1e-3) continue;
          if(p.x + myW > W + 1e-3 || p.y + myH > H + 1e-3) continue;
          if(collidesAt(p.x, p.y)) continue;
          const d = Math.hypot(p.x - desiredX, p.y - desiredY);
          if(d < pushBestD){ pushBestD = d; pushBest = p; }
        }
      }

      if(pushBest){
        finalX = pushBest.x;
        finalY = pushBest.y;
        pushed = pushBest;
      }
    }
  }

  const guidesX = [];
  const guidesY = [];
  if(bestX) guidesX.push({ value: bestX.ref, kind: bestX.kind });
  if(bestY) guidesY.push({ value: bestY.ref, kind: bestY.kind });
  if(pushed){
    if(pushed.axis === 'x') guidesX.push({ value: pushed.ref, kind: 'push' });
    else                    guidesY.push({ value: pushed.ref, kind: 'push' });
  }

  return { x: finalX, y: finalY, guidesX, guidesY };
}