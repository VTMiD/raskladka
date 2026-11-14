// js/GsCAM/tsp.js
// Nearest-neighbor TSP. O(n²), для <1000 контуров норм.

export function nearestNeighborOrder(points, start = [0, 0]) {
  const n = points.length;
  if (n === 0) return [];
  const used = new Array(n).fill(false);
  const order = [];
  let cx = start[0], cy = start[1];

  for (let step = 0; step < n; step++) {
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const dx = points[i][0] - cx;
      const dy = points[i][1] - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI < 0) break;
    used[bestI] = true;
    order.push(bestI);
    cx = points[bestI][0];
    cy = points[bestI][1];
  }
  return order;
}