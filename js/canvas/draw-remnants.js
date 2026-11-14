// js/canvas/draw-remnants.js
import { state } from '../state.js';

function drawRemnantShape(ctx, r, sx, params, pxPerMm) {
  const x1 = sx + r.rect.x1, y1 = r.rect.y1;
  const w = r.rect.x2 - r.rect.x1, h = r.rect.y2 - r.rect.y1;
  
  if (r._manual) {
    ctx.fillStyle = 'rgba(80,200,100,0.22)';
    ctx.strokeStyle = '#2a9a3c';
    ctx.lineWidth = 2 * pxPerMm;
    ctx.setLineDash([8*pxPerMm, 6*pxPerMm]);
  } else {
    ctx.fillStyle = 'rgba(80,200,100,0.13)';
    ctx.strokeStyle = '#2a9a3c';
    ctx.lineWidth = 1.2 * pxPerMm;
    ctx.setLineDash([]);
  }

  if (r.polygon && r.polygon.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(sx + r.polygon[0][0], r.polygon[0][1]);
    for (let i = 1; i < r.polygon.length; i++) {
      ctx.lineTo(sx + r.polygon[i][0], r.polygon[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    if (r._manual) ctx.stroke();
  } else {
    ctx.fillRect(x1, y1, w, h);
    if (r._manual) ctx.strokeRect(x1, y1, w, h);
  }
  ctx.setLineDash([]);
}

export function drawRemnants(ctx, sheet, si, v) {
  if (!sheet || !sheet.remnants || !sheet.remnants.length) return;
  
  const params = v.params;
  const scale = v.scale;
  const gapBetween = v.gapBetween;
  const pxPerMm = 1 / scale;
  const sx = si * (params.sheetW + gapBetween);

  for (let ri = 0; ri < sheet.remnants.length; ri++) {
    const r = sheet.remnants[ri];
    drawRemnantShape(ctx, r, sx, params, pxPerMm);

    if (state._highlightRemnant && state._highlightRemnant.sheetIdx === si && state._highlightRemnant.remnantIdx === ri) {
      const x1 = sx + r.rect.x1;
      const y1 = r.rect.y1;
      const w = r.rect.x2 - r.rect.x1;
      const h = r.rect.y2 - r.rect.y1;
      ctx.save();
      ctx.strokeStyle = '#ff2020';
      ctx.lineWidth = 4 * pxPerMm;
      ctx.setLineDash([]);
      ctx.strokeRect(x1, y1, w, h);
      ctx.restore();
    }
  }
}