// js/GsCAM/geometry-cam.js
// Полигональная математика для CAM. Никаких зависимостей.
// Чистые функции: вход — числа/массивы, выход — числа/массивы.

/**
 * Знаковая площадь кольца.
 * > 0 — против часовой (CCW), < 0 — по часовой (CW).
 * Знак используется для определения направления нормали.
 */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/** Центроид кольца (площадной, не среднее точек). */
export function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cr = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cr;
    cx += (ring[j][0] + ring[i][0]) * cr;
    cy += (ring[j][1] + ring[i][1]) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    // Вырожденный — среднее точек
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Периметр кольца. */
export function ringLength(ring) {
  let L = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

/** BBox: [x1, y1, x2, y2]. */
export function ringBBox(ring) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x1) x1 = x; if (x > x2) x2 = x;
    if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  return [x1, y1, x2, y2];
}

/** Луч-каст: точка в кольце. */
export function pointInRing(p, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Удалить подряд идущие дубликаты + замкнуть (без повторов). */
export function dedupeRing(pts, tol = 1e-4) {
  if (pts.length < 2) return pts.map(p => [p[0], p[1]]);
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tol) {
      out.push([p[0], p[1]]);
    }
  }
  if (out.length >= 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < tol) out.pop();
  }
  return out;
}

/** Реверс кольца (сохранить как новый массив). */
export function reverseRing(ring) {
  return ring.slice().reverse();
}

/** Приведение ориентации: CCW = true. Возвращает новый массив при необходимости. */
export function ensureOrientation(ring, ccw = true) {
  const a = ringArea(ring);
  const isCCW = a > 0;
  if (isCCW === ccw) return ring.slice();
  return reverseRing(ring);
}

/** Пересечение двух бесконечных прямых. null если параллельны. */
export function lineIntersect(p1, p2, p3, p4) {
  const a1 = p2[1] - p1[1], b1 = p1[0] - p2[0], c1 = a1 * p1[0] + b1 * p1[1];
  const a2 = p4[1] - p3[1], b2 = p3[0] - p4[0], c2 = a2 * p3[0] + b2 * p3[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return null;
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/**
 * Offset кольца на константу.
 *   offset > 0 — наружу (для внешнего контура)
 *   offset < 0 — внутрь  (для отверстий)
 * Работает через смещение каждого ребра + пересечение соседних.
 *
 * ⚠ При offset внутрь и малых радиусах (< |offset|) углы могут «сложиться»
 *   (самопересечение). Для сложных случаев — clipper-lib. Для DXF с фасками
 *   и скруглениями (типичная плазменная резка) этого достаточно.
 */
export function offsetRing(ring, offset) {
  const n = ring.length;
  if (n < 3 || Math.abs(offset) < 1e-9) return ring.map(p => [p[0], p[1]]);

  const sign = ringArea(ring) > 0 ? 1 : -1; // CCW=+1, CW=-1

  // Нормали наружу для каждого ребра
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) { normals.push([0, 0]); continue; }
    normals.push([sign * dy / len, -sign * dx / len]);
  }

  // Смещённые рёбра
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const [nx, ny] = normals[i];
    edges.push([
      [a[0] + nx * offset, a[1] + ny * offset],
      [b[0] + nx * offset, b[1] + ny * offset],
    ]);
  }

  // Пересечение соседних рёбер
  const out = [];
  for (let i = 0; i < n; i++) {
    const e1 = edges[(i - 1 + n) % n];
    const e2 = edges[i];
    const pt = lineIntersect(e1[0], e1[1], e2[0], e2[1]);
    out.push(pt ? [pt[0], pt[1]] : [e2[0][0], e2[0][1]]);
  }
  return dedupeRing(out);
}

/**
 * Простое зеркалирование нормали на «самопересечениях»:
 * если после offset кольцо изменило ориентацию — значит, оно «схлопнулось».
 * Возвращает null в этом случае (сигнал: деталь слишком тонкая для такого kerf).
 */
export function offsetRingSafe(ring, offset) {
  const a0 = ringArea(ring);
  const out = offsetRing(ring, offset);
  if (out.length < 3) return null;
  const a1 = ringArea(out);
  if (Math.sign(a0) !== Math.sign(a1)) return null;
  return out;
}