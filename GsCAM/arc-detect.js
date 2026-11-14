// GsCAM/arc-detect.js
// Распознавание дуг в полилинии.

export function detectArcs(ring, opts = {}) {
  const {
    tolerance = 0.15,
    minArcAngle = 0.15,
    maxRadius = 2000,
    minSegmentsForArc = 2,
  } = opts;

  const N = ring.length;
  if (N < 3) return [{ type: 'line', startIdx: 0, endIdx: N - 1, length: 1 }];

  const segments = [];
  const used = new Array(N).fill(false);
  let i = 0;
  let guard = 0;

  while (i < N && guard < N * 2) {
    guard++;
    if (used[i]) { i++; continue; }

    const arc = tryBuildArc(ring, i, tolerance, minArcAngle, maxRadius, minSegmentsForArc);
    if (arc) {
      segments.push({ type: 'arc', ...arc });
      for (let k = 0; k < arc.length; k++) used[(arc.startIdx + k) % N] = true;
      const nextIdx = (arc.startIdx + arc.length) % N;
      i = nextIdx === i ? N : nextIdx;
    } else {
      const j = (i + 1) % N;
      segments.push({ type: 'line', startIdx: i, endIdx: j, length: 1 });
      used[i] = true;
      i++;
    }
  }

  // Замыкание: если последний сегмент не пришёл в startIdx — добавить line
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    const firstStart = segments[0].startIdx;
    if (last.endIdx !== firstStart) {
      segments.push({ type: 'line', startIdx: last.endIdx, endIdx: firstStart, length: 1 });
    }
  }

  return segments;
}

function tryBuildArc(ring, startIdx, tol, minAngle, maxR, minSegs) {
  const N = ring.length;
  if (N < minSegs + 1) return null;

  const p0 = ring[startIdx];
  const p1 = ring[(startIdx + 1) % N];
  const p2 = ring[(startIdx + 2) % N];

  const center = circumcenter(p0, p1, p2);
  if (!center) return null;
  const R = Math.hypot(p0[0] - center[0], p0[1] - center[1]);
  if (R < 1e-3 || R > maxR) return null;

  let lastOnArcIdx = (startIdx + 2) % N;
  let length = 3;

  for (let k = 3; k < N; k++) {
    const idx = (startIdx + k) % N;
    if (idx === startIdx) break;
    const p = ring[idx];
    const d = Math.abs(Math.hypot(p[0] - center[0], p[1] - center[1]) - R);
    if (d > tol) break;
    lastOnArcIdx = idx;
    length = k + 1;
  }

  if (length < minSegs + 1) return null;

  const a0 = Math.atan2(p0[1] - center[1], p0[0] - center[0]);
  const a1 = Math.atan2(p1[1] - center[1], p1[0] - center[0]);
  const aEnd = Math.atan2(ring[lastOnArcIdx][1] - center[1], ring[lastOnArcIdx][0] - center[0]);

  const du = a1 - a0;
  const ccw = Math.abs(du) < Math.PI ? du > 0 : du < 0;

  let sweep = aEnd - a0;
  if (ccw) {
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
  } else {
    while (sweep > 0) sweep -= 2 * Math.PI;
    while (sweep < -2 * Math.PI) sweep += 2 * Math.PI;
  }

  if (Math.abs(sweep) < minAngle) return null;

  return {
    startIdx,
    endIdx: lastOnArcIdx,
    length,
    center,
    radius: R,
    ccw,
    sweep,
  };
}

function circumcenter(p1, p2, p3) {
  const ax = p1[0], ay = p1[1];
  const bx = p2[0], by = p2[1];
  const cx = p3[0], cy = p3[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx*cx + cy*cy) * (ay - by)) / d;
  const uy = ((ax*ax + ay*ay) * (cx - bx) + (bx*bx + by*by) * (ax - cx) + (cx*cx + cy*cy) * (bx - ax)) / d;
  return [ux, uy];
}