// js/canvas/draw-cuts.js
import { state } from '../state.js';

export function drawCuts(ctx, sheet, si, v) {
  if (!sheet || !sheet.cuts || !sheet.cuts.length) return;

  const params = v.params;
  const scale = v.scale;
  const originX = v.originX;
  const originY = v.originY;
  const gapBetween = v.gapBetween;
  const pxPerMm = 1 / scale;
  const sx = si * (params.sheetW + gapBetween);

  // ─── 1. Линии резов и точки (в мировых координатах) ───
  ctx.save();
  ctx.strokeStyle = '#ff6400';
  ctx.lineWidth = 3 * pxPerMm;
  ctx.setLineDash([14 * pxPerMm, 6 * pxPerMm]);
  for (const c of sheet.cuts) {
    ctx.beginPath();
    ctx.moveTo(sx + c.x1, c.y1);
    ctx.lineTo(sx + c.x2, c.y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff6400';
  for (const c of sheet.cuts) {
    ctx.beginPath(); ctx.arc(sx + c.x1, c.y1, 3.5 * pxPerMm, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + c.x2, c.y2, 3.5 * pxPerMm, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ─── 2. Текст длины реза (в ПИКСЕЛЬНЫХ координатах) ───
  // drawCuts вызывается ВНУТРИ ctx.scale(scale, -scale),
  // поэтому отменяем масштаб, чтобы текст был стабильного размера.
  ctx.save();
  ctx.scale(1 / scale, -1 / scale);

  const toPxX = x => originX + x * scale;
  const toPxY = y => originY - y * scale;

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const c of sheet.cuts) {
    const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
    const mx = toPxX(sx + (c.x1 + c.x2) / 2);
    const my = toPxY((c.y1 + c.y2) / 2) - 6;
    const label = `${len.toFixed(0)} мм`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(mx - tw/2 - 4, my - 13, tw + 8, 15);
    ctx.fillStyle = '#a84000';
    ctx.fillText(label, mx, my);
  }

  ctx.restore();
}