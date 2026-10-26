import { rotatePart, isPartInsideSheetPolygon } from './geometry.js';
import { sleep } from './utils.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function polysCollideSimple(A, B, buffer){
  // Упрощённая проверка для GA — bbox-фильтр + сегментная проверка
  for (const a of A){
    let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
    for (const [x, y] of a){
      if (x < ax0) ax0 = x; if (x > ax1) ax1 = x;
      if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
    }
    for (const b of B){
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y] of b){
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
      if (ax1 + buffer <= bx0) continue;
      if (ax0 - buffer >= bx1) continue;
      if (ay1 + buffer <= by0) continue;
      if (ay0 - buffer >= by1) continue;
      // Полная проверка
      const na = a.length, nb = b.length;
      for (let i = 0; i < na; i++){
        const a1 = a[i], a2 = a[(i + 1) % na];
        for (let j = 0; j < nb; j++){
          const b1 = b[j], b2 = b[(j + 1) % nb];
          const d1 = (b2[0]-b1[0])*(a1[1]-b1[1]) - (b2[1]-b1[1])*(a1[0]-b1[0]);
          const d2 = (b2[0]-b1[0])*(a2[1]-b1[1]) - (b2[1]-b1[1])*(a2[0]-b1[0]);
          const d3 = (a2[0]-a1[0])*(b1[1]-a1[1]) - (a2[1]-a1[1])*(b1[0]-a1[0]);
          const d4 = (a2[0]-a1[0])*(b2[1]-a1[1]) - (a2[1]-a1[1])*(b2[0]-a1[0]);
          if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
              ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
        }
      }
    }
  }
  return false;
}

function collidesAt(sheet, self, polygons, w, h, x, y, buffer, W, H, sheetPolygons, edge) {
  if (x < -1e-3 || y < -1e-3) return true;
  if (x + w > W + 1e-3 || y + h > H + 1e-3) return true;

  if (sheetPolygons && sheetPolygons.length) {
    const absPolys = polygons.map(r => r.map(([px, py]) => [px + x + edge, py + y + edge]));
    if (!isPartInsideSheetPolygon(absPolys, sheetPolygons, edge)) return true;
  }

  const absA = polygons.map(r => r.map(([px, py]) => [px + x, py + y]));
  for (const other of sheet.placed) {
    if (other === self) continue;
    const ob = other.bbox;
    if (x + w + buffer <= ob[0]) continue;
    if (x - buffer      >= ob[2]) continue;
    if (y + h + buffer <= ob[1]) continue;
    if (y - buffer      >= ob[3]) continue;
    const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if (polysCollideSimple(absA, absB, buffer)) return true;
  }
  return false;
}

function maxSlide(sheet, pl, dirX, dirY, W, H, buffer, sheetPolygons, edge) {
  const w = pl.bbox[2] - pl.bbox[0];
  const h = pl.bbox[3] - pl.bbox[1];
  let hi;
  if      (dirX < 0) hi = pl.x;
  else if (dirX > 0) hi = W - (pl.x + w);
  else if (dirY < 0) hi = pl.y;
  else if (dirY > 0) hi = H - (pl.y + h);
  else return 0;
  if (hi <= 1e-4) return 0;
  if (!collidesAt(sheet, pl, pl.polygons, w, h, pl.x + dirX*hi, pl.y + dirY*hi, buffer, W, H, sheetPolygons, edge)) return hi;
  let lo = 0;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (collidesAt(sheet, pl, pl.polygons, w, h, pl.x + dirX*mid, pl.y + dirY*mid, buffer, W, H, sheetPolygons, edge)) hi = mid;
    else lo = mid;
  }
  return lo;
}

function gravityCompact(sheet, pl, W, H, buffer, sheetPolygons, edge) {
  const w = pl.bbox[2] - pl.bbox[0];
  const h = pl.bbox[3] - pl.bbox[1];
  for (let iter = 0; iter < 12; iter++) {
    const dy = maxSlide(sheet, pl, 0, -1, W, H, buffer, sheetPolygons, edge);
    if (dy > 1e-3) { pl.y -= dy; pl.bbox = [pl.x, pl.y, pl.x + w, pl.y + h]; }
    const dx = maxSlide(sheet, pl, -1, 0, W, H, buffer, sheetPolygons, edge);
    if (dx > 1e-3) { pl.x -= dx; pl.bbox = [pl.x, pl.y, pl.x + w, pl.y + h]; }
    if (dy < 1e-3 && dx < 1e-3) break;
  }
}

function generateCandidates(sheet, w, h, buffer, W, H) {
  const cands = [[0, 0]];
  for (const pl of sheet.placed) {
    const ow = pl.bbox[2] - pl.bbox[0];
    const oh = pl.bbox[3] - pl.bbox[1];
    const x = pl.x, y = pl.y;
    cands.push([x + ow + buffer, y]);
    cands.push([x + ow + buffer, y + oh - h]);
    cands.push([x + ow + buffer, y + (oh - h) / 2]);
    cands.push([x - w - buffer, y]);
    cands.push([x - w - buffer, y + oh - h]);
    cands.push([x - w - buffer, y + (oh - h) / 2]);
    cands.push([x, y + oh + buffer]);
    cands.push([x + ow - w, y + oh + buffer]);
    cands.push([x + (ow - w) / 2, y + oh + buffer]);
    cands.push([x, y - h - buffer]);
    cands.push([x + ow - w, y - h - buffer]);
    cands.push([x + (ow - w) / 2, y - h - buffer]);
  }
  const seen = new Set();
  const out = [];
  for (const [cx, cy] of cands) {
    if (cx < -1e-3 || cy < -1e-3) continue;
    if (cx + w > W + 1e-3 || cy + h > H + 1e-3) continue;
    const k = Math.round(cx * 10) + ':' + Math.round(cy * 10);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([cx, cy]);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Укладка одной детали с ограничением числа кандидатов (для скорости)
// order: 'row' | 'col'
// ────────────────────────────────────────────────────────────────
const MAX_CANDIDATES_TO_TRY = 60;

function tryPlaceOnSheet(sheet, inst, W, H, buffer, sheetPolygons, edge, order) {
  const allCands = [];
  for (const variant of inst.variants) {
    const { w, h } = variant;
    if (w > W + 0.001 || h > H + 0.001) continue;
    const cands = generateCandidates(sheet, w, h, buffer, W, H);
    for (const [cx, cy] of cands) {
      const score = order === 'col' ? (cx * 1e6 + cy) : (cy * 1e6 + cx);
      allCands.push({ variant, cx, cy, score });
    }
  }
  allCands.sort((a, b) => a.score - b.score);

  const toTry = allCands.length > MAX_CANDIDATES_TO_TRY
    ? allCands.slice(0, MAX_CANDIDATES_TO_TRY)
    : allCands;

  for (const { variant, cx, cy } of toTry) {
    const { polygons, w, h } = variant;
    if (collidesAt(sheet, null, polygons, w, h, cx, cy, buffer, W, H, sheetPolygons, edge)) continue;
    const placed = {
      partIdx: inst.partIdx,
      polygons,
      x: cx, y: cy,
      bbox: [cx, cy, cx + w, cy + h]
    };
    sheet.placed.push(placed);
    gravityCompact(sheet, placed, W, H, buffer, sheetPolygons, edge);
    return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// Декодирование генома → результат укладки
// order: 'row' | 'col'
// ────────────────────────────────────────────────────────────────
function decode(genome, instances, params, order) {
  const { sheetW, sheetH, edge, kerf, gap, maxSheets, sheetPolygons } = params;
  const W = sheetW - 2*edge, H = sheetH - 2*edge;
  const buffer = kerf + gap;
  const limit = Math.max(1, maxSheets | 0);
  const sheets = [];
  const unplaced = [];
  for (const idx of genome) {
    const inst = instances[idx];
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlaceOnSheet(sheet, inst, W, H, buffer, sheetPolygons, edge, order)) { placed = true; break; }
    }
    if (!placed && sheets.length < limit) {
      const sheet = { placed: [] };
      if (tryPlaceOnSheet(sheet, inst, W, H, buffer, sheetPolygons, edge, order)) { sheets.push(sheet); placed = true; }
    }
    if (!placed) unplaced.push(inst.name);
  }
  return { sheets, unplaced };
}

// ────────────────────────────────────────────────────────────────
// Fitness: меньше — лучше
//   • Штраф за непомещённые (огромный)
//   • Штраф за лишние листы
//   • Площадь bbox на каждом листе (компактность)
//   • Бонус за плотное заполнение первого листа
// ────────────────────────────────────────────────────────────────
function fitnessOf(result) {
  let bboxSum = 0;
  for (const sh of result.sheets) {
    let mx = 0, my = 0;
    for (const pl of sh.placed) {
      if (pl.bbox[2] > mx) mx = pl.bbox[2];
      if (pl.bbox[3] > my) my = pl.bbox[3];
    }
    bboxSum += mx * my;
  }
  const firstCount = result.sheets.length > 0 ? result.sheets[0].placed.length : 0;
  return result.unplaced.length * 1e12
       + result.sheets.length * 1e9
       + bboxSum
       - firstCount * 1e3;
}

function randomPermutation(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function oxCrossover(p1, p2, rng) {
  const n = p1.length;
  const a = Math.floor(rng() * n), b = Math.floor(rng() * n);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const child = new Array(n).fill(-1);
  const taken = new Set();
  for (let i = lo; i <= hi; i++) { child[i] = p1[i]; taken.add(p1[i]); }
  let ptr = (hi + 1) % n;
  for (let k = 0; k < n; k++) {
    const g = p2[(hi + 1 + k) % n];
    if (taken.has(g)) continue;
    child[ptr] = g;
    taken.add(g);
    ptr = (ptr + 1) % n;
  }
  return child;
}

function mutate(perm, rate, rng) {
  for (let i = 0; i < perm.length; i++) {
    if (rng() < rate) {
      const j = Math.floor(rng() * perm.length);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
  }
}

function tournament(pop, fitness, size, rng) {
  let best = null, bestF = Infinity;
  for (let k = 0; k < size; k++) {
    const i = Math.floor(rng() * pop.length);
    if (fitness[i] < bestF) { bestF = fitness[i]; best = pop[i]; }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────
// Мультистарт: жадный геном по заданному компаратору
// ────────────────────────────────────────────────────────────────
function greedyGenome(instances, cmp) {
  return Array.from({ length: instances.length }, (_, i) => i)
    .sort((a, b) => cmp(instances[a], instances[b]));
}

// ────────────────────────────────────────────────────────────────
// Главная функция
// ────────────────────────────────────────────────────────────────
export async function nestGA(parts, params, onProgress, shouldStop) {
  const { rotMode } = params;
  const angles = rotMode === 4 ? [0, 90, 180, 270] : rotMode === 2 ? [0, 90] : [0];

  const instances = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    const variants = angles.map(a => rotatePart(part, a));
    for (let k = 0; k < part.qty; k++) {
      instances.push({
        partIdx: pi, name: part.name, variants,
        area: part.area, width: part.width, height: part.height,
        maxDim: Math.max(part.width, part.height)
      });
    }
  }
  const N = instances.length;
  if (!N) return { sheets: [], unplaced: [] };

  // Дефолты (мягкие): pop=12, gen=15 — быстро и качественно
  const POP   = Math.max(6,  Math.min(64,  params.gaPop || 12));
  const GEN   = Math.max(3,  Math.min(100, params.gaGen || 15));
  const MUT   = Math.max(0.01, Math.min(0.6, (params.gaMut || 20) / 100));
  const ELITE = Math.max(2, Math.floor(POP * 0.2));
  const TOURN = 3;
  const STALL_LIMIT = 4;

  const rng = mulberry32(0xDEADBEEF ^ N);

  // === Мультистарт: 3 жадных + их мутации + рандом ===
  const seeds = [];
  seeds.push(greedyGenome(instances, (a, b) => (b.area - a.area) || (b.maxDim - a.maxDim)));
  seeds.push(greedyGenome(instances, (a, b) => (b.width - a.width) || (b.height - a.height)));
  seeds.push(greedyGenome(instances, (a, b) => (b.height - a.height) || (b.width - a.width)));

  while (seeds.length < POP) {
    if (seeds.length < POP && rng() < 0.5) {
      // Мутация от жадного (лучше, чем чистый рандом)
      const base = seeds[Math.floor(rng() * 3)].slice();
      const nMut = Math.max(1, Math.floor(N * 0.25));
      for (let k = 0; k < nMut; k++) {
        const i = Math.floor(rng() * N);
        const j = Math.floor(rng() * N);
        [base[i], base[j]] = [base[j], base[i]];
      }
      seeds.push(base);
    } else {
      // Чистый рандом для разнообразия
      seeds.push(randomPermutation(N, rng));
    }
  }
  let population = seeds.slice(0, POP);

  let bestResult = null, bestFit = Infinity;
  let stall = 0;

  for (let gen = 0; gen < GEN; gen++) {
    if (shouldStop && shouldStop()) {
      if (onProgress) onProgress(gen / GEN, `Остановлено на поколении ${gen}/${GEN}`);
      break;
    }

    const fitness = new Array(POP);
    let cancelled = false;
    let improvedThisGen = false;

    for (let i = 0; i < POP; i++) {
      if (shouldStop && shouldStop()) { cancelled = true; break; }

      // DUAL decode: row и col, берём лучший
      const rRow = decode(population[i], instances, params, 'row');
      const rCol = decode(population[i], instances, params, 'col');
      const fRow = fitnessOf(rRow);
      const fCol = fitnessOf(rCol);
      const pick = fRow <= fCol
        ? { r: rRow, f: fRow }
        : { r: rCol, f: fCol };

      fitness[i] = pick.f;
      if (pick.f < bestFit - 1) {
        bestFit = pick.f;
        bestResult = pick.r;
        improvedThisGen = true;
      }
    }
    if (cancelled) break;

    if (improvedThisGen) stall = 0; else stall++;
    if (stall >= STALL_LIMIT && gen >= 2) break;

    if (onProgress) {
      onProgress(
        (gen + 1) / GEN,
        `🧬 Поколение ${gen + 1}/${GEN} • лучший: ${bestResult.sheets.length} л., ` +
        `непомещённых: ${bestResult.unplaced.length}` +
        (stall > 0 ? ` · без улучшений: ${stall}` : '')
      );
    }
    await sleep(0);

    // === Селекция + скрещивание ===
    const sorted = Array.from({ length: POP }, (_, i) => i).sort((a, b) => fitness[a] - fitness[b]);
    const newPop = [];
    for (let i = 0; i < ELITE; i++) newPop.push(population[sorted[i]].slice());
    while (newPop.length < POP) {
      const p1 = tournament(population, fitness, TOURN, rng);
      const p2 = tournament(population, fitness, TOURN, rng);
      const child = oxCrossover(p1, p2, rng);
      mutate(child, MUT, rng);
      newPop.push(child);
    }
    population = newPop;
  }

  return bestResult || { sheets: [], unplaced: [] };
}