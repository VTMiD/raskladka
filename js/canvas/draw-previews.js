// js/canvas/draw-previews.js
import { state } from '../state.js';

export function drawPreviews(ctx, v, isPreview) {
  const params = v.params;
  const scale = v.scale, originX = v.originX, originY = v.originY;
  const gapBetween = v.gapBetween;
  const pxPerMm = 1 / scale;
  const SW = params.sheetW, SH = params.sheetH;

  const toPxX = x => originX + x * scale;
  const toPxY = y => originY - y * scale;

  // 1. Предпросмотр массива (Array Preview)
  if (state.sheets.length && state.arrayPreview && state.arrayPreview.positions) {
    const sx = 0;
    ctx.save();
    ctx.fillStyle = 'rgba(100, 180, 255, 0.12)';
    ctx.strokeStyle = 'rgba(0, 120, 255, 0.50)';
    ctx.lineWidth = 1.5 * pxPerMm;
    ctx.setLineDash([8*pxPerMm, 6*pxPerMm]);
    for (const pos of state.arrayPreview.positions) {
      for (const ring of pos.polygons) {
        if (ring.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(sx + params.edge + pos.x + ring[0][0], params.edge + pos.y + ring[0][1]);
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(sx + params.edge + pos.x + ring[i][0], params.edge + pos.y + ring[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 2. Предпросмотр остатка (Remnant Preview)
  if (state.remnantPreview && state.remnantPreview.sheetIdx < state.sheets.length && !state.remnantPreview.alreadyMarked) {
    const p = state.remnantPreview;
    const sx = p.sheetIdx * (SW + gapBetween);
    if (p.rect) {
      const isBad = p.tooSmall || p.hasParts;
      ctx.save();
      ctx.fillStyle = isBad ? 'rgba(255,80,80,0.18)' : 'rgba(80,200,100,0.22)';
      ctx.strokeStyle = isBad ? '#ff2020' : '#2a9a3c';
      ctx.lineWidth = 2 * pxPerMm;
      ctx.setLineDash([8*pxPerMm, 6*pxPerMm]);
      
      if (p.polygon && p.polygon.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(sx + p.polygon[0][0], p.polygon[0][1]);
        for (let i = 1; i < p.polygon.length; i++) ctx.lineTo(sx + p.polygon[i][0], p.polygon[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        const rx = sx + p.rect.x1, ry = p.rect.y1;
        const rw = p.rect.x2 - p.rect.x1, rh = p.rect.y2 - p.rect.y1;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ⚠️ БЛОК 3 (Линии привязки) УДАЛЕН ОТСЮДА И ПЕРЕНЕСЕН В canvas.js (БЛОК 2.5.3)
  // Это исправило баг с неправильным отображением розовых линий.

  // 4. Drag and Drop Preview
  if (state.dropPreview) {
    const dp = state.dropPreview;
    if (dp.sheetIdx < state.sheets.length) {
      const sx = dp.sheetIdx * (SW + gapBetween);
      const part = state.parts[dp.partIdx];
      if (part) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.12)';
        ctx.strokeStyle = 'rgba(0, 120, 220, 0.75)';
        ctx.lineWidth = 2 * pxPerMm;
        ctx.setLineDash([6 * pxPerMm, 4 * pxPerMm]);
        for (const ring of part.polygons) {
          if (ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(sx + params.edge + dp.x + ring[0][0], params.edge + dp.y + ring[0][1]);
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(sx + params.edge + dp.x + ring[i][0], params.edge + dp.y + ring[i][1]);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }

  // 5. Duplicate Ghost (Призрак копирования)
  if (state.duplicateGhost && state.duplicateSource && state.duplicateSource.sheetIdx < state.sheets.length) {
    const g = state.duplicateGhost;
    const src = state.duplicateSource;
    const sx = src.sheetIdx * (SW + gapBetween);

    ctx.save();
    if (g.items && g.items.length) {
      for (const it of g.items) {
        const itemCollides = g.collides || it.collides;
        ctx.fillStyle = itemCollides ? 'rgba(255, 60, 60, 0.20)' : 'rgba(0, 150, 255, 0.15)';
        ctx.strokeStyle = itemCollides ? 'rgba(200, 0, 0, 0.90)' : 'rgba(0, 120, 220, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash(itemCollides ? [6, 4] : [10, 5]);
        for (const ring of it.polygons) {
          if (ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(toPxX(sx + params.edge + it.x + ring[0][0]), toPxY(params.edge + it.y + ring[0][1]));
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(toPxX(sx + params.edge + it.x + ring[i][0]), toPxY(params.edge + it.y + ring[i][1]));
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // 6. Пустое выделение (Pending Empty Selection)
  if (state.pendingEmptySelection && state.sheets.length) {
    const pes = state.pendingEmptySelection;
    const sheet = state.sheets[pes.sheetIdx];
    if (sheet) {
      const sx = pes.sheetIdx * (SW + gapBetween);
      const rx = toPxX(sx + params.edge + pes.rect.x1);
      const ry = toPxY(params.edge + pes.rect.y2);
      const rw = (pes.rect.x2 - pes.rect.x1) * scale;
      const rh = (pes.rect.y2 - pes.rect.y1) * scale;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 160, 255, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#0080ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `📐 ${Math.round(pes.w)} × ${Math.round(pes.h)} мм`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(rx + rw/2 - tw/2 - 6, ry + rh/2 - 11, tw + 12, 22);
      ctx.fillStyle = '#0066cc';
      ctx.fillText(label, rx + rw/2, ry + rh/2);
      ctx.restore();
    }
  }

  // 7. Рамка группового выделения
  if (state.groupSelectDrag) {
    const rd = state.groupSelectDrag;
    const rx = Math.min(rd.x0, rd.x1), ry = Math.min(rd.y0, rd.y1);
    const rw = Math.abs(rd.x1 - rd.x0), rh = Math.abs(rd.y1 - rd.y0);
    ctx.save();
    ctx.fillStyle = 'rgba(0,128,255,0.10)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#0080ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    ctx.restore();
  }
}