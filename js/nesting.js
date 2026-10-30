import { rotatePart, polysCollide, isPartInsideSheetPolygon } from './geometry.js';
import { sleep } from './utils.js';

export const STRATEGIES = [
  { key:'area',   name:'по площади',    cmp:(a,b)=>b.area-a.area       || b.maxDim-a.maxDim },
  { key:'width',  name:'по длине (X)',  cmp:(a,b)=>b.width-a.width     || b.height-a.height || b.area-a.area },
  { key:'height', name:'по ширине (Y)', cmp:(a,b)=>b.height-a.height   || b.width-a.width   || b.area-a.area },
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

  if (sheet.obstacles && sheet.obstacles.length) {
    for (const obs of sheet.obstacles) {
      if (x < obs.x2 && x + w > obs.x1 && y < obs.y2 && y + h > obs.y1) return true;
    }
  }

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

function calcScore(cx, cy, order){
  if (order === 'col') return cx * 1e6 + cy;
  return cy * 1e6 + cx;
}

// ─── Декартовы кандидаты (X-якоря × Y-якоря) ──────────────────
// Для каждого соседа добавляем якоря по каждой оси:
//   X: справа с зазором (bb[2]+buffer), выравнивание по левому краю (bb[0])
//   Y: сверху с зазором (bb[3]+buffer), выравнивание по низу (bb[1])
// + два якоря листа по каждой оси: 0 и W-w / H-h.
// Пары сортируются в порядке bottom-left (или bottom-col при order='col'),
// затем обрезаются до MAX_CARTESIAN_PAIRS с равномерным сэмплированием,
// чтобы покрыть и верхние зоны листа, а не только нижнюю congested.
const MAX_CARTESIAN_PAIRS = 2000;

function buildCartesianPairs(sheet, w, h, buffer, W, H, order){
  const xSet = new Set([0, W - w]);
  const ySet = new Set([0, H - h]);

  for (const pl of sheet.placed){
    const bb = pl.bbox;

    const xRight = bb[2] + buffer;
    if (xRight + w <= W + 1e-3) xSet.add(xRight);

    const xLeft = bb[0];
    if (xLeft >= -1e-3) xSet.add(xLeft);

    const yTop = bb[3] + buffer;
    if (yTop + h <= H + 1e-3) ySet.add(yTop);

    const yBot = bb[1];
    if (yBot >= -1e-3) ySet.add(yBot);
  }

  const pairs = [];
  for (const x of xSet){
    if (x < -1e-3 || x + w > W + 1e-3) continue;
    for (const y of ySet){
      if (y < -1e-3 || y + h > H + 1e-3) continue;
      pairs.push({ x, y, score: calcScore(x, y, order) });
    }
  }
  pairs.sort((a, b) => a.score - b.score);

  if (pairs.length <= MAX_CARTESIAN_PAIRS) return pairs;

  const half = Math.floor(MAX_CARTESIAN_PAIRS / 2);
  const head = pairs.slice(0, half);
  const tail = pairs.slice(half);
  const step = tail.length / (MAX_CARTESIAN_PAIRS - half);
  const sampled = head.slice();
  for (let i = 0; i < tail.length; i += step){
    sampled.push(tail[Math.floor(i)]);
  }
  return sampled;
}

function tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge, order){
  const cellSize = Math.max(150, buffer * 4);

  let grid;
  if (sheet._grid && sheet._grid.cellSize === cellSize){
    grid = sheet._grid.grid;
  } else {
    grid = buildGrid(sheet, cellSize);
    sheet._grid = { cellSize, grid };
  }

  // ── 1. Быстрая проба [0,0] ──
  for (const variant of inst.variants){
    const { w, h } = variant;
    if (w > W + 0.001 || h > H + 0.001) continue;
    if (!collidesAtVariant(sheet, variant, 0, 0, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)){
      placePart(sheet, inst, variant, 0, 0, grid, cellSize);
      return true;
    }
  }

  // ── 2. Пустой лист + DXF-контур ──
  if (sheet.placed.length === 0 && sheetPolygons && sheetPolygons.length){
    for (const variant of inst.variants){
      const { w, h } = variant;
      if (w > W + 0.001 || h > H + 0.001) continue;

      const minDim = Math.min(w, h);
      const step = Math.max(5, Math.min(20, Math.ceil(minDim / 8)));

      let found = false;
      const tryAt = (gx, gy) => {
        if (collidesAtVariant(sheet, variant, gx, gy, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) return false;
        let bestX = gx, bestY = gy;
        for (let fine = 1; fine <= step; fine++){
          if (bestX > 0 && !collidesAtVariant(sheet, variant, bestX - fine, bestY, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) bestX -= fine;
          if (bestY > 0 && !collidesAtVariant(sheet, variant, bestX, bestY - fine, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) bestY -= fine;
        }
        placePart(sheet, inst, variant, bestX, bestY, grid, cellSize);
        return true;
      };

      if (order === 'col'){
        for (let gx = 0; gx <= W - w + 1e-3 && !found; gx += step)
          for (let gy = 0; gy <= H - h + 1e-3 && !found; gy += step)
            found = tryAt(gx, gy);
      } else {
        for (let gy = 0; gy <= H - h + 1e-3 && !found; gy += step)
          for (let gx = 0; gx <= W - w + 1e-3 && !found; gx += step)
            found = tryAt(gx, gy);
      }
      if (found) return true;
    }
  }

  // ── Сбор hole-кандидатов ──
  const holeCands = [];
  if (nestInHoles){
    for (const pl of sheet.placed){
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

  let bestVariant = null, bestPos = null, bestScore = Infinity;

  // ── 3. Декартовы кандидаты ──
  for (const variant of inst.variants){
    const { w, h } = variant;
    if (w > W + 0.001 || h > H + 0.001) continue;

    const pairs = buildCartesianPairs(sheet, w, h, buffer, W, H, order);
    for (const { x, y, score } of pairs){
      if (score >= bestScore) break;
      if (collidesAtVariant(sheet, variant, x, y, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) continue;
      bestScore = score;
      bestVariant = variant;
      bestPos = { x, y };
      break;
    }
  }

  // ── 4. Hole-кандидаты (с бонусом −100000) ──
  if (holeCands.length){
    for (const variant of inst.variants){
      const { w, h } = variant;
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

        for (const [x, y] of positions){
          if (x < -0.001 || y < -0.001) continue;
          if (x + w > W + 0.001 || y + h > H + 0.001) continue;
          const score = calcScore(x, y, order) - 100000;
          if (score >= bestScore) continue;
          if (collidesAtVariant(sheet, variant, x, y, buffer, W, H, grid, cellSize, nestInHoles, sheetPolygons, edge)) continue;
          bestScore = score;
          bestVariant = variant;
          bestPos = { x, y };
        }
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
  return {
    placed: sheet.placed.map(clonePlaced),
    obstacles: (sheet.obstacles || []).map(o => ({ ...o })),
  };
}

export async function nestWithOrder(parts, params, cmp, onProgress, seedSheets, shouldStop, strategyKey = 'area', forcedOrder = null){
  const { sheetW, sheetH, edge, kerf, gap, rotMode, maxSheets, sheetPolygons } = params;
  const nestInHoles = params.nestInHoles !== false;
  const W = sheetW - 2*edge, H = sheetH - 2*edge;
  if (W <= 0 || H <= 0) throw new Error('Слишком большой отступ от края');
  const buffer = kerf + gap;
  const angles = rotMode === 4 ? [0,90,180,270] : rotMode === 2 ? [0,90] : [0];

  let order = forcedOrder || (strategyKey === 'height' ? 'col' : 'row');

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

  if (strategyKey === 'width'){
    for (const inst of instances){
      inst.variants.sort((v1, v2) => (v2.w - v1.w) || (v2.h - v1.h));
    }
  } else if (strategyKey === 'height'){
    for (const inst of instances){
      inst.variants.sort((v1, v2) => (v2.h - v1.h) || (v2.w - v1.w));
    }
  }

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
      if (tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge, order)){ placed = true; break; }
    }
    if (!placed){
      if (sheets.length < limit){
        const sheet = { placed: [], obstacles: [] };
        if (tryPlaceInSheet(sheet, inst, W, H, buffer, nestInHoles, sheetPolygons, edge, order)){ sheets.push(sheet); placed = true; }
      }
    }
    if (!placed) unplaced.push(inst.name);

    if (onProgress && (i % 10 === 9 || i === total - 1)) onProgress((i + 1) / total);
    if (i % 25 === 24) await sleep(0);
  }

  const filtered = sheets.filter(sh => sh.placed.length > 0 || (sh.obstacles && sh.obstacles.length > 0));
  return { sheets: filtered, unplaced };
}

export async function nest(parts, params, onProgress, strategyKey, seedSheets, shouldStop){
  let useStrategies;
  if (strategyKey === 'all') useStrategies = STRATEGIES;
  else useStrategies = STRATEGIES.filter(s => s.key === strategyKey);
  if (!useStrategies.length) useStrategies = [STRATEGIES[0]];

  const runs = [];
  for (const strat of useStrategies){
    if (strat.key === 'area'){
      runs.push({ strat, order: 'row', label: 'площадь (построчно)' });
      runs.push({ strat, order: 'col', label: 'площадь (постолбцово)' });
    } else {
      runs.push({ strat, order: null, label: strat.name });
    }
  }

  let best = null;
  const N = runs.length;
  for (let s = 0; s < N; s++){
    if (shouldStop && shouldStop()){
      return best ? { ...best, cancelled: true } : { sheets: [], unplaced: [], cancelled: true };
    }
    const run = runs[s];
    const r = await nestWithOrder(parts, params, run.strat.cmp, p => {
      if (onProgress) onProgress((s + p) / N, `Стратегия ${s + 1} из ${N}: ${run.label}`);
    }, seedSheets, shouldStop, run.strat.key, run.order);

    if (r.cancelled){
      return best ? { ...best, cancelled: true } : { ...r, cancelled: true };
    }

    r.strategyUsed = run.label;
    r.strategyKey = run.strat.key;

    const totalR = r.sheets.reduce((sum, sh) => sum + sh.placed.length, 0);
    const totalB = best ? best.sheets.reduce((sum, sh) => sum + sh.placed.length, 0) : -1;
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

  for (const sheet of sheets) {
    if (!sheet.remnants) sheet.remnants = [];
    sheet.remnants = sheet.remnants.filter(r => r._manual);
  }

  if (!params.remnantOn) return;
  if (params.sheetPolygons && params.sheetPolygons.length) return;

  const minR = Math.max(20, params.remnantMin);
  const SW = params.sheetW, SH = params.sheetH, edge = params.edge;

  function overlapsManual(sheet, rect) {
    for (const r of sheet.remnants) {
      if (!r._manual) continue;
      if (rect.x1 < r.rect.x2 && rect.x2 > r.rect.x1 &&
          rect.y1 < r.rect.y2 && rect.y2 > r.rect.y1) return true;
    }
    return false;
  }

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
      const rect = { x1: xCutAbs, y1: 0, x2: SW, y2: SH };
      if (!overlapsManual(sheet, rect)) {
        sheet.remnants.push({
          type:'right',
          cut:{x1:xCutAbs, y1:0, x2:xCutAbs, y2:SH},
          rect,
          w:wRight, h:SH
        });
      }
    }

    const yCutAbs = edge + usedY + gapCut;
    const hTop = SH - yCutAbs;
    if (hTop >= minR){
      const rightCut = SW;
      const wTop = rightCut;
      if (wTop >= minR){
        const rect = { x1: 0, y1: yCutAbs, x2: rightCut, y2: SH };
        if (!overlapsManual(sheet, rect)) {
          sheet.remnants.push({
            type:'top',
            cut:{x1:0, y1:yCutAbs, x2:rightCut, y2:yCutAbs},
            rect,
            w:wTop, h:hTop
          });
        }
      }
    }
  }
}