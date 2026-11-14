// js/GsCAM/offset.js
// Применение kerf к полигонам детали.
// Определяет внешний контур, применяет offset наружу/внутрь.

import { ringArea, dedupeRing, offsetRing, offsetRingSafe, ringBBox } from './geometry-cam.js';

/**
 * Индекс внешнего контура в массиве polygons (максимальная площадь).
 */
export function findOuterRingIndex(polygons) {
  let best = 0, bestArea = -1;
  for (let i = 0; i < polygons.length; i++) {
    const a = Math.abs(ringArea(polygons[i]));
    if (a > bestArea) { bestArea = a; best = i; }
  }
  return best;
}

/**
 * Применить компенсацию реза.
 *   polygons — массив колец в локальных координатах детали
 *   kerf     — ширина реза, мм
 *   mode     — 'outside' (по умолчанию): контур раздувается на kerf/2
 *              'inside'  : контур сжимается (редко)
 *
 * Возвращает:
 *   { outer: ring, inners: [ring,...], valid: bool }
 *
 * Если offset какого-то контура «схлопнулся» — valid=false,
 * соответствующий контур пропускается (лучше потерять отверстие,
 * чем прорезать кривой контур).
 */
export function applyKerf(polygons, kerf, mode = 'outside') {
  if (!polygons || polygons.length === 0) {
    return { outer: [], inners: [], valid: false };
  }

  const half = (kerf || 0) / 2;
  const dir = mode === 'inside' ? -1 : 1;
  const outerIdx = findOuterRingIndex(polygons);

  let outer = null;
  if (half < 1e-6) {
    outer = dedupeRing(polygons[outerIdx]);
  } else {
    outer = offsetRingSafe(polygons[outerIdx], dir * half);
  }

  const inners = [];
  let allValid = outer !== null;

  for (let i = 0; i < polygons.length; i++) {
    if (i === outerIdx) continue;
    const r = polygons[i];
    if (!r || r.length < 3) continue;
    if (half < 1e-6) {
      inners.push(dedupeRing(r));
      continue;
    }
    // Отверстия — offset в противоположную сторону от внешнего
    const inner = offsetRingSafe(r, -dir * half);
    if (inner) inners.push(inner);
    else allValid = false; // одно из отверстий не влезло — это не критично, но отмечаем
  }

  return { outer: outer || [], inners, valid: allValid };
}

/**
 * Подготовить контуры детали для G-code:
 *   - перевести в абсолютные координаты листа (x + pl.x + edge, y + pl.y + edge)
 *   - применить kerf
 *   - вернуть готовый список контуров с метаданными
 *
 * Вход:
 *   pl     — объект { polygons, x, y, bbox } из state.sheets[si].placed
 *   params — параметры раскладки (readParams)
 *
 * Выход: [{ ring, isOuter, partIdx? }]
 */
export function prepareContoursForPart(pl, params, opts = {}) {
  const edge = params.edge || 0;
  const kerf = params.kerf || 0;
  const mode = opts.mode || 'outside';

  // 1. В абсолютные
  const abs = pl.polygons.map(ring =>
    ring.map(([x, y]) => [x + pl.x + edge, y + pl.y + edge])
  );

  // 2. Kerf
  const { outer, inners } = applyKerf(abs, kerf, mode);

  // 3. Сборка
  const result = [];
  for (const inner of inners) {
    result.push({ ring: inner, isOuter: false });
  }
  if (outer.length >= 3) {
    result.push({ ring: outer, isOuter: true });
  }
  return result;
}