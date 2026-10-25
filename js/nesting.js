import { rotatePart, polysCollide, isPartInsideSheetPolygon } from './geometry.js';
import { sleep } from './utils.js';

export const STRATEGIES = [
  { key:'area',   name:'по площади', cmp:(a,b)=>b.area-a.area || b.maxDim-a.maxDim },
  { key:'maxDim', name:'по длине',   cmp:(a,b)=>b.maxDim-a.maxDim || b.area-a.area },
  { key:'height', name:'по высоте',  cmp:(a,b)=>b.height-a.height || b.width-a.width },
  { key:'width',  name:'по ширине',  cmp:(a,b)=>b.width-a.width || b.height-a.height }
];

function cellKey(gx, gy){ return gx * 1000000 + gy; }

function addToGrid(grid, pl, cellSize){
  const bb = pl.bbox;
  const x0 = Math.floor(bb[0] / cellSize), y0 = Math.floor(bb[1] / cellSize);
  const x1 = Math.floor(bb[2] / cellSize), y1 = Math.floor(bb[3] / cellSize);
  for(let gx = x0; gx <= x1; gx++){
    for(let gy = y0; gy <= y1; gy++){
      const k = cellKey(gx, gy);
      let arr = grid.get(k);
      if(!arr){ arr = []; grid.set(k, arr); }
      arr.push(pl);
    }
  }
}

function getNeighbors(grid, x, y, w, h, cellSize, buffer){
  const seen = new Set(), out = [];
  const x0 = Math.floor((x - buffer) / cellSize), y0 = Math.floor((y - buffer) / cellSize);
  const x1 = Math.floor((x + w + buffer) / cellSize), y1 = Math.floor((y + h + buffer) / cellSize);
  for(let gx = x0; gx <= x1; gx++){
    for(let gy = y0; gy <= y1; gy++){
      const arr = grid.get(cellKey(gx, gy));
      if(!arr) continue;
      for(const pl of arr){ if(!seen.has(pl)){ seen.add(pl); out.push(pl); } }
    }
  }
  return out;
}

function buildGrid(sheet, cellSize){
  const grid = new Map();
  for(const pl of sheet.placed) addToGrid(grid, pl, cellSize);
  return grid;
}

function _cross(o, a, b){
  return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
}
function _onSeg(a, b, p){
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
         Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}
function _segDist(p, a, b){
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-12) return Math.hypot(p[0]-a[0], p[1]-a[1]);
  let t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
function _segmentsIntersect(p1, p2, p3, p4){
  const d1 = _cross(p3, p4, p1), d2 = _cross(p3, p4, p2);
  const d3 = _cross(p1, p2, p3), d4 = _cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && _onSeg(p3, p4, p1)) return true;
  if (d2 === 0 && _onSeg(p3, p4, p2)) return true;
  if (d3 === 0 && _onSeg(p1, p2, p3)) return true;
  if (d4 === 0 && _onSeg(p1, p2, p4)) return true;
  return false;
}
function _ringArea(ring){
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += ring[j][0]*ring[i][1] - ring[i][0]*ring[j][1];
  return Math.abs(a / 2);
}
function _ringBBox(ring){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
function _pointInRing(p, ring){
  let inside = false; const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++){
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function getOuterAndHoles(polygons){
  if (!polygons || !polygons.length) return { outer: null, holes: [] };
  if (polygons.length === 1) return { outer: polygons[0], holes: [] };

  let outer = polygons[0], maxArea = _ringArea(polygons[0]);
  for (let i = 1; i < polygons.length; i++){
    const a = _ringArea(polygons[i]);
    if (a > maxArea){ maxArea = a; outer = polygons[i]; }
  }

  const holes = [];
  for (const r of polygons){
    if (r === outer) continue;
    const testP = r[0];
    if (_pointInRing(testP, outer)){
      holes.push({ ring: r, bbox: _ringBBox(r) });
    }
  }
  return { outer, holes };
}

function ensureGeometry(pl){
  if (!pl._geometry || pl._geometry._polyRef !== pl.polygons){
    pl._geometry = getOuterAndHoles(pl.polygons);
    pl._geometry._polyRef = pl.polygons;
  }
  return pl._geometry;
}

function fitsInHole(outerAAbs, holeRingAbs, buffer){
  const abb = _ringBBox(outerAAbs);
  const hbb = _ringBBox(holeRingAbs);
  if (abb[0] < hbb[0] + buffer - 1e-3) return false;
  if (abb[1] < hbb[1] + buffer - 1e-3) return false;
  if (abb[2] > hbb[2] - buffer + 1e-3) return false;
  if (abb[3] > hbb[3] - buffer + 1e-3) return false;

  for (const [px, py] of outerAAbs){
    if (!_pointInRing([px, py], holeRingAbs)) return false;
    let minD = Infinity;
    for (let i = 0; i < holeRingAbs.length; i++){
      const a = holeRingAbs[i], b = holeRingAbs[(i + 1) % holeRingAbs.length];
      const d = _segDist([px, py], a, b);
      if (d < minD) minD = d;
      if (minD < buffer) return false;
    }
  }

  const na = outerAAbs.length, nb = holeRingAbs.length;
  for (let i = 0; i < na; i++){
    const a1 = outerAAbs[i], a2 = outerAAbs[(i + 1) % na];
    for (let j = 0; j < nb; j++){
      const b1 = holeRingAbs[j], b2 = holeRingAbs[(j + 1) % nb];
      if (_segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function collidesAtVariant(sheet, variant, x, y, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge){
  const { polygons, w, h } = variant;
  if (x < -0.001 || y < -0.001) return true;
  if (x + w > W + 0.001 || y + h > H + 0.001) return true;

  if (sheetPolygons && sheetPolygons.length){
    const absPolys = polygons.map(r => r.map(([px,py]) => [px + x + edge, py + y + edge]));
    if (!isPartInsideSheetPolygon(absPolys, sheetPolygons, edge)) return true;
  }

  const neighbors = getNeighbors(grid, x, y, w, h, cellSize, buffer);
  if (neighbors.length === 0) return false;

  const geoA = getOuterAndHoles(polygons);
  const outerAAbs = geoA.outer.map(([px, py]) => [px + x, py + y]);
  const outerABBox = [x, y, x + w, y + h];

  const standardChecks = [];

  for (const other of neighbors){
    const ob = other.bbox;
    if (x + w + buffer <= ob[0]) continue;
    if (x - buffer      >= ob[2]) continue;
    if (y + h + buffer <= ob[1]) continue;
    if (y - buffer      >= ob[3]) continue;

    let fits = false;
    if (nestInHoles){
      const geo = ensureGeometry(other);
      for (const hole of geo.holes){
        const hbb = [
          hole.bbox[0] + other.x, hole.bbox[1] + other.y,
          hole.bbox[2] + other.x, hole.bbox[3] + other.y
        ];
        if (outerABBox[0] < hbb[0] + buffer - 1e-3) continue;
        if (outerABBox[1] < hbb[1] + buffer - 1e-3) continue;
        if (outerABBox[2] > hbb[2] - buffer + 1e-3) continue;
        if (outerABBox[3] > hbb[3] - buffer + 1e-3) continue;

        const holeAbs = hole.ring.map(([px, py]) => [px + other.x, py + other.y]);
        if (fitsInHole(outerAAbs, holeAbs, buffer)){ fits = true; break; }
      }
    }
    if (fits) continue;

    standardChecks.push(other);
  }

  if (standardChecks.length === 0) return false;

  const allAbsA = polygons.map(r => r.map(([px, py]) => [px + x, py + y]));
  for (const other of standardChecks){
    const allAbsB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if (polysCollide(allAbsA, allAbsB, buffer)) return true;
  }
  return false;
}

function placePart(sheet, inst, variant, x, y, grid, cellSize){
  const { w, h, polygons } = variant;
  const newPlaced = {
    partIdx: inst.partIdx,
    polygons,
    x, y,
    bbox: [x, y, x + w, y + h]
  };
  newPlaced._geometry = getOuterAndHoles(polygons);
  newPlaced._geometry._polyRef = polygons;
  sheet.placed.push(newPlaced);
  addToGrid(grid, newPlaced, cellSize);
}

function tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge){
  const cellSize = Math.max(150, buffer * 4);

  let grid;
  if (sheet._grid && sheet._grid.cellSize === cellSize){
    grid = sheet._grid.grid;
  } else {
    grid = buildGrid(sheet, cellSize);
    sheet._grid = { cellSize, grid };
  }

  // 1. Быстрая попытка (0,0) — если контур позволяет
  for (const variant of inst.variants){
    const { w, h } = variant;
    if (w > W + 0.001 || h > H + 0.001) continue;
    if (!collidesAtVariant(sheet, variant, 0, 0, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)){
      placePart(sheet, inst, variant, 0, 0, grid, cellSize);
      return true;
    }
  }

  // 2. Мелкий скан угла для ПЕРВОЙ детали на пустом листе.
  //    Идём построчно: сначала y=0, потом y=step и т.д.,
  //    внутри строки — слева-направо. Первая подходящая = ближайшая к (0,0).
  //    Шаг адаптивный: 5…20 мм, чтобы не мельчить слишком сильно,
  //    но и не проскочить «ступеньку» контура с вырезом.
  if (sheet.placed.length === 0 && sheetPolygons && sheetPolygons.length){
    for (const variant of inst.variants){
      const { w, h } = variant;
      if (w > W + 0.001 || h > H + 0.001) continue;

      // Шаг скана — не крупнее 1/8 меньшей стороны детали,
      // но не меньше 5 мм и не больше 20 мм.
      const minDim = Math.min(w, h);
      const step = Math.max(5, Math.min(20, Math.ceil(minDim / 8)));

      let found = false;
      for (let gy = 0; gy <= H - h + 1e-3 && !found; gy += step){
        for (let gx = 0; gx <= W - w + 1e-3 && !found; gx += step){
          if (collidesAtVariant(sheet, variant, gx, gy, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) continue;

          // Финальная доводка: «сдвигаем» точку к углу с точностью 1 мм,
          // насколько позволит контур. Это дотягивает положение до реальной
          // кромки, если шаг скана дал небольшой зазор.
          let bestX = gx, bestY = gy;
          for (let fine = 1; fine <= step; fine++){
            if (bestX > 0 && !collidesAtVariant(sheet, variant, bestX - fine, bestY, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)){
              bestX -= fine;
            }
            if (bestY > 0 && !collidesAtVariant(sheet, variant, bestX, bestY - fine, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)){
              bestY -= fine;
            }
          }

          placePart(sheet, inst, variant, bestX, bestY, grid, cellSize);
          found = true;
        }
      }
      if (found) return true;
    }
  }

  // 3. Кандидаты от уже размещённых деталей
  const baseCandMap = new Map();
  baseCandMap.set('0:0', [0, 0]);
  const holeCands = [];

  for (const pl of sheet.placed){
    for (const ring of pl.polygons){
      for (const [vx, vy] of ring){
        const x = pl.x + vx, y = pl.y + vy;
        const key = Math.round(x*10) + ':' + Math.round(y*10);
        if (!baseCandMap.has(key)) baseCandMap.set(key, [x, y]);
      }
    }
    const bb = pl.bbox;
    for (const [x, y] of [
      [bb[2] + buffer, bb[1]],
      [bb[0], bb[3] + buffer],
      [bb[2] + buffer, bb[3] + buffer]
    ]){
      const key = Math.round(x*10) + ':' + Math.round(y*10);
      if (!baseCandMap.has(key)) baseCandMap.set(key, [x, y]);
    }
    if (nestInHoles){
      const geo = ensureGeometry(pl);
      for (const hole of geo.holes){
        const hbb = [
          hole.bbox[0] + pl.x, hole.bbox[1] + pl.y,
          hole.bbox[2] + pl.x, hole.bbox[3] + pl.y
        ];
        let cx = 0, cy = 0;
        for (const [px, py] of hole.ring){ cx += px + pl.x; cy += py + pl.y; }
        cx /= hole.ring.length; cy /= hole.ring.length;
        holeCands.push({ bbox: hbb, centroid: [cx, cy] });
      }
    }
  }

  const baseCandArr = Array.from(baseCandMap.values());
  let bestVariant = null, bestPos = null, bestScore = Infinity;

  for (const variant of inst.variants){
    const { w, h } = variant;
    if (w > W + 0.001 || h > H + 0.001) continue;

    for (const [cx, cy] of baseCandArr){
      if (cx < -0.001 || cy < -0.001) continue;
      if (cx + w > W + 0.001) continue;
      if (cy + h > H + 0.001) continue;
      const score = cy * 1e6 + cx;
      if (score >= bestScore) continue;
      if (collidesAtVariant(sheet, variant, cx, cy, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) continue;
      bestScore = score;
      bestVariant = variant;
      bestPos = { x: cx, y: cy };
    }

    for (const hc of holeCands){
      const [hx0, hy0, hx1, hy1] = hc.bbox;
      const hw = hx1 - hx0, hh = hy1 - hy0;
      if (w + 2*buffer > hw + 1e-3) continue;
      if (h + 2*buffer > hh + 1e-3) continue;

      const positions = [
        [hx0 + buffer, hy0 + buffer],
        [hx1 - w - buffer, hy0 + buffer],
        [hx0 + buffer, hy1 - h - buffer],
        [hx1 - w - buffer, hy1 - h - buffer],
        [(hx0 + hx1 - w) / 2, (hy0 + hy1 - h) / 2],
        [hc.centroid[0] - w/2, hc.centroid[1] - h/2]
      ];

      for (const [cx, cy] of positions){
        if (cx < -0.001 || cy < -0.001) continue;
        if (cx + w > W + 0.001) continue;
        if (cy + h > H + 0.001) continue;
        const score = cy * 1e6 + cx - 100000;
        if (score >= bestScore) continue;
        if (collidesAtVariant(sheet, variant, cx, cy, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) continue;
        bestScore = score;
        bestVariant = variant;
        bestPos = { x: cx, y: cy };
      }
    }
  }

  if (bestPos){
    placePart(sheet, inst, bestVariant, bestPos.x, bestPos.y, grid, cellSize);
    return true;
  }
  return false;
}

function clonePlaced(pl){
  return {
    partIdx: pl.partIdx,
    polygons: pl.polygons.map(r => r.map(([x, y]) => [x, y])),
    x: pl.x, y: pl.y,
    bbox: [...pl.bbox],
    _fixed: !!pl._fixed,
    _fromArray: !!pl._fromArray,
  };
}
function cloneSheet(sheet){
  return { placed: sheet.placed.map(clonePlaced) };
}

export async function nestWithOrder(parts, params, cmp, onProgress, seedSheets, shouldStop){
  const { sheetW, sheetH, edge, kerf, gap, rotMode, maxSheets, sheetPolygons } = params;
  const nestInHoles = params.nestInHoles !== false;
  const W = sheetW - 2*edge, H = sheetH - 2*edge;
  if (W <= 0 || H <= 0) throw new Error('Слишком большой отступ от края');
  const buffer = kerf + gap;
  const angles = rotMode === 4 ? [0,90,180,270] : rotMode === 2 ? [0,90] : [0];

  const instances = [];
  for (let pi = 0; pi < parts.length; pi++){
    const part = parts[pi];
    const variants = angles.map(a => rotatePart(part, a));
    for (let k = 0; k < part.qty; k++){
      instances.push({
        partIdx: pi, name: part.name, area: part.area,
        width: part.width, height: part.height,
        maxDim: Math.max(part.width, part.height),
        variants
      });
    }
  }
  instances.sort(cmp);

  const sheets = seedSheets ? seedSheets.map(cloneSheet) : [];
  const unplaced = [];
  const total = instances.length;
  const limit = Math.max(1, maxSheets | 0);

  for (let i = 0; i < total; i++){
    if (shouldStop && shouldStop()){
      return { sheets, unplaced, cancelled: true };
    }
    const inst = instances[i];
    let placed = false;
    for (const sheet of sheets){
      if (tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge)){ placed = true; break; }
    }
    if (!placed){
      if (sheets.length < limit){
        const sheet = { placed: [] };
        if (tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge)){ sheets.push(sheet); placed = true; }
      }
    }
    if (!placed) unplaced.push(inst.name);

    if (onProgress && (i % 10 === 9 || i === total - 1)) onProgress((i + 1) / total);
    if (i % 25 === 24) await sleep(0);
  }
  return { sheets, unplaced };
}

export async function nest(parts, params, onProgress, strategyKey, seedSheets, shouldStop){
  let useStrategies;
  if (strategyKey === 'all') useStrategies = STRATEGIES;
  else useStrategies = STRATEGIES.filter(s => s.key === strategyKey);
  if (!useStrategies.length) useStrategies = [STRATEGIES[0]];

  let best = null;
  const N = useStrategies.length;
  for (let s = 0; s < N; s++){
    if (shouldStop && shouldStop()){
      return best ? { ...best, cancelled: true } : { sheets: [], unplaced: [], cancelled: true };
    }
    const strat = useStrategies[s];
    const r = await nestWithOrder(parts, params, strat.cmp, p => {
      if (onProgress) onProgress((s + p) / N, `Стратегия ${s+1} из ${N}: ${strat.name}`);
    }, seedSheets, shouldStop);
    if (r.cancelled){
      return best ? { ...best, cancelled: true } : { ...r, cancelled: true };
    }
    const totalR = r.sheets.reduce((s, sh) => s + sh.placed.length, 0);
    const totalB = best ? best.sheets.reduce((s, sh) => s + sh.placed.length, 0) : -1;
    if (!best
        || r.sheets.length < best.sheets.length
        || (r.sheets.length === best.sheets.length && totalR > totalB)){
      best = r;
    }
  }
  return best;
}

export function computeRemnants(sheets, params){
  const gapCut = Math.max(2, params.kerf);
  for (const sheet of sheets) sheet.remnants = [];
  if (!params.remnantOn) return;
  if (params.sheetPolygons && params.sheetPolygons.length) return;
  const minR = Math.max(20, params.remnantMin);
  const SW = params.sheetW, SH = params.sheetH, edge = params.edge;
  for (const sheet of sheets){
    if (!sheet.placed.length) continue;
    let usedX = 0, usedY = 0;
    for (const pl of sheet.placed){
      if (pl.bbox[2] > usedX) usedX = pl.bbox[2];
      if (pl.bbox[3] > usedY) usedY = pl.bbox[3];
    }
    const xCutAbs = edge + usedX + gapCut;
    const wRight = SW - xCutAbs;
    if (wRight >= minR){
      sheet.remnants.push({
        type:'right',
        cut:{x1:xCutAbs, y1:0, x2:xCutAbs, y2:SH},
        rect:{x1:xCutAbs, y1:0, x2:SW, y2:SH},
        w:wRight, h:SH
      });
    }
    const yCutAbs = edge + usedY + gapCut;
    const hTop = SH - yCutAbs;
    if (hTop >= minR){
      const rightCut = sheet.remnants.length ? sheet.remnants[0].cut.x1 : SW;
      const wTop = rightCut;
      if (wTop >= minR){
        sheet.remnants.push({
          type:'top',
          cut:{x1:0, y1:yCutAbs, x2:rightCut, y2:yCutAbs},
          rect:{x1:0, y1:yCutAbs, x2:rightCut, y2:SH},
          w:wTop, h:hTop
        });
      }
    }
  }
}