// GsCAM/bridges.js
// Расчёт точек мостиков (перемычек) на контурах.

export function computeBridgePositions(perimeterMm, bridgeLengthMm, count) {
  if (!perimeterMm || perimeterMm <= 0) return [];
  if (!bridgeLengthMm || bridgeLengthMm <= 0) return [];
  if (!count || count <= 0) return [];

  if (bridgeLengthMm * count >= perimeterMm * 0.9) return [];

  const step = 1 / count;
  const halfBridge = (bridgeLengthMm / perimeterMm) / 2;

  const result = [];
  for (let i = 0; i < count; i++) {
    const center = i * step + step / 2;
    let start = center - halfBridge;
    let end = center + halfBridge;
    if (start < 0) { start += 1; end += 1; }
    if (end > 1) { start -= 1; end -= 1; }
    result.push({ start, end, center });
  }
  return result;
}

export function isInBridge(t, bridges) {
  if (!bridges || !bridges.length) return false;
  const tNorm = ((t % 1) + 1) % 1;
  for (const b of bridges) {
    let s = ((b.start % 1) + 1) % 1;
    let e = ((b.end % 1) + 1) % 1;
    if (s <= e) {
      if (tNorm >= s && tNorm < e) return true;
    } else {
      if (tNorm >= s || tNorm < e) return true;
    }
  }
  return false;
}