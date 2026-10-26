function rotateSelected(direction){
  if(!state.selectedPart) return false;
  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  if(!sheet) return false;
  const pl = sheet.placed[placedIdx];
  if(!pl) return false;
  if(pl._fixed){ setStatus('Деталь зафиксирована — поворот недоступен'); return false; }

  const params = readParams();
  const W = params.sheetW - 2*params.edge;
  const H = params.sheetH - 2*params.edge;
  const buffer = params.kerf + params.gap;

  const oldW = pl.bbox[2] - pl.bbox[0];
  const oldH = pl.bbox[3] - pl.bbox[1];
  const cx = pl.x + oldW/2;
  const cy = pl.y + oldH/2;

  const ang = direction * Math.PI / 2;
  const c = Math.cos(ang), s = Math.sin(ang);
  const rotated = pl.polygons.map(ring => ring.map(([x,y]) => [x*c - y*s, x*s + y*c]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const r of rotated) for(const [x,y] of r){
    if(x < minX) minX = x;
    if(x > maxX) maxX = x;
    if(y < minY) minY = y;
    if(y > maxY) maxY = y;
  }
  const newPolys = rotated.map(r => r.map(([x,y]) => [x - minX, y - minY]));
  const newW = maxX - minX;
  const newH = maxY - minY;

  let nx = cx - newW/2;
  let ny = cy - newH/2;
  if(nx < 0) nx = 0;
  if(ny < 0) ny = 0;
  if(nx + newW > W) nx = W - newW;
  if(ny + newH > H) ny = H - newH;

  // Временно подменяем полигоны и bbox, чтобы computeSnap видел новую форму
  const savedPolygons = pl.polygons;
  const savedBbox = pl.bbox;
  pl.polygons = newPolys;
  pl.bbox = [nx, ny, nx + newW, ny + newH];

  const thresholdMm = state.snapDisabled ? 0 : (params.snapThreshold || 0);
  const snap = computeSnap(sheet, pl, nx, ny, W, H, newW, newH, buffer, thresholdMm);

  // Проверка: не коллизирует ли после поворота и привязки
  const absA = newPolys.map(r => r.map(([px, py]) => [px + snap.x, py + snap.y]));
  let collides = false;
  for(const other of sheet.placed){
    if(other === pl) continue;
    const absB = other.polygons.map(r => r.map(([px, py]) => [px + other.x, py + other.y]));
    if(polysCollide(absA, absB, buffer)){ collides = true; break; }
  }

  if(collides){
    // Откатить и попробовать без снапа
    pl.polygons = savedPolygons;
    pl.bbox = savedBbox;
    setStatus('Поворот невозможен — нет свободного места рядом');
    return false;
  }

  pl.polygons = newPolys;
  pl.x = snap.x;
  pl.y = snap.y;
  pl.bbox = [snap.x, snap.y, snap.x + newW, snap.y + newH];
  pl._collides = false;

  state.snapGuides = (snap.guidesX.length || snap.guidesY.length)
    ? { sheetIdx, x: snap.guidesX, y: snap.guidesY }
    : null;

  draw();
  updateReport();
  setStatus('Деталь повёрнута на 90\u00B0');
  return true;
}