// GsCAM/lead-in.js
// Тангенциальная врезка. Внешние контуры — в середину ребра, отверстия — в угол.

import { ringCentroid, ringArea } from './geometry-cam.js';

export function makeTangentLeadIn(ring, opts) {
  const {
    leadInRadius = 1.28,
    entryMode = 'lowest',
    entryIndex = null,
    isOuter = false,
    cw = true,
  } = opts || {};

  if (!ring || ring.length < 3) return null;

  if (isOuter && entryMode === 'lowest') {
    const edge = pickLowestEdgeMidpoint(ring, leadInRadius);
    if (edge) return buildLeadInFromEdge(ring, edge, leadInRadius, isOuter, cw);
  }

  const idx = (Number.isInteger(entryIndex) && entryMode === 'fixed')
    ? entryIndex
    : pickEntryIndex(ring, entryMode);

  return buildLeadInFromVertex(ring, idx, leadInRadius, isOuter, cw);
}

function pickLowestEdgeMidpoint(ring, leadInRadius) {
  const N = ring.length;
  const minLen = leadInRadius * 2.2;
  let best = null;

  for (let i = 0; i < N; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % N];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;

    const midY = (a[1] + b[1]) / 2;
    if (!best || midY < best.midY) {
      best = {
        startIdx: i,
        endIdx: (i + 1) % N,
        midX: (a[0] + b[0]) / 2,
        midY,
        length: len,
      };
    }
  }
  return best;
}

function pickEntryIndex(ring, mode) {
  let best = 0, bestVal = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    let v;
    switch (mode) {
      case 'highest':   v = -y; break;
      case 'leftmost':  v = x;  break;
      case 'rightmost': v = -x; break;
      case 'lowest':
      default:          v = y;  break;
    }
    if (v < bestVal) { bestVal = v; best = i; }
  }
  return best;
}

function buildLeadInFromEdge(ring, edge, R, isOuter, cw) {
  const a = ring[edge.startIdx];
  const b = ring[edge.endIdx];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const edgeDir = [dx / len, dy / len];

  const ringOrient = ringArea(ring) > 0 ? +1 : -1;
  const cutOrient  = cw ? -1 : +1;
  const walkDir = (ringOrient === cutOrient) ? +1 : -1;

  const tangent = walkDir > 0 ? edgeDir : [-edgeDir[0], -edgeDir[1]];

  const centroid = ringCentroid(ring);
  const P0 = [edge.midX, edge.midY];
  const toC = [centroid[0] - P0[0], centroid[1] - P0[1]];
  const n1 = [tangent[1], -tangent[0]];
  const n2 = [-tangent[1], tangent[0]];
  const nc = isOuter
    ? (dot(n1, toC) < 0 ? n1 : n2)
    : (dot(n1, toC) > 0 ? n1 : n2);

  const C = [P0[0] + R * nc[0], P0[1] + R * nc[1]];
  const S = [C[0] - R * tangent[0], C[1] - R * tangent[1]];

  return {
    entryType: 'edge',
    start: S,
    end: P0,
    center: C,
    radius: R,
    tangent,
    normal: nc,
    startVertexIdx: edge.startIdx,
    endVertexIdx: edge.endIdx,
    walkDir,
    arcCcw: !cw,
  };
}

function buildLeadInFromVertex(ring, idx, R, isOuter, cw) {
  const N = ring.length;
  const P0 = ring[idx];
  const tc = computeTangent(ring, idx, cw);

  const centroid = ringCentroid(ring);
  const toC = [centroid[0] - P0[0], centroid[1] - P0[1]];
  const n1 = [tc[1], -tc[0]];
  const n2 = [-tc[1], tc[0]];
  const nc = isOuter
    ? (dot(n1, toC) < 0 ? n1 : n2)
    : (dot(n1, toC) > 0 ? n1 : n2);

  const C = [P0[0] + R * nc[0], P0[1] + R * nc[1]];
  const S = [C[0] - R * tc[0], C[1] - R * tc[1]];

  const ringOrient = ringArea(ring) > 0 ? +1 : -1;
  const cutOrient  = cw ? -1 : +1;
  const walkDir = (ringOrient === cutOrient) ? +1 : -1;

  return {
    entryType: 'vertex',
    start: S,
    end: P0,
    center: C,
    radius: R,
    tangent: tc,
    normal: nc,
    entryIndex: idx,
    walkDir,
    arcCcw: !cw,
  };
}

function computeTangent(ring, idx, wantCw) {
  const N = ring.length;
  const prev = ring[(idx - 1 + N) % N];
  const next = ring[(idx + 1) % N];

  const ringOrient = ringArea(ring) > 0 ? +1 : -1;
  const cutOrient  = wantCw ? -1 : +1;
  const walkDir = (ringOrient === cutOrient) ? +1 : -1;

  const d = walkDir > 0
    ? [next[0] - prev[0], next[1] - prev[1]]
    : [prev[0] - next[0], prev[1] - next[1]];
  const len = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / len, d[1] / len];
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }