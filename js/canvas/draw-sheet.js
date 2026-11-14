// js/canvas/draw-sheet.js
import { state } from '../state.js';

export function drawGrid(ctx, v, sheetsToDraw) {
  const params = v.params;
  const SW = params.sheetW, SH = params.sheetH;
  const scale = v.scale, originX = v.originX, originY = v.originY;
  const pxPerMm = 1 / scale;
  const gapBetween = v.gapBetween;
  
  const showPersist = !!params.gridShow;
  const showAlt = !!(state.gridSnapMode && (state.drag || state.groupDrag));

  if (showPersist || showAlt) {
    const baseStep = Math.max(1, params.gridStep || 10);
    let drawStep = baseStep;
    while (drawStep * scale < 4) drawStep *= 2;

    const W_inner = SW - 2 * params.edge;
    const H_inner = SH - 2 * params.edge;

    const sheetsToGrid = new Set();
    if (showPersist) {
      for (let i = 0; i < sheetsToDraw.length; i++) sheetsToGrid.add(i);
    }
    if (showAlt) {
      if (state.drag) sheetsToGrid.add(state.drag.orig.sheetIdx);
      if (state.groupDrag) for (const it of state.groupDrag.items) sheetsToGrid.add(it.sheetIdx);
    }

    for (const si of sheetsToGrid) {
      if (si < 0 || si >= sheetsToDraw.length) continue;
      const sx = si * (SW + gapBetween);

      ctx.save();
      
      // Сетка. Прозрачность 0.12 (бледная, как вы просили)
      ctx.strokeStyle = showAlt 
        ? 'rgba(0,120,220,0.55)' 
        : 'rgba(255, 255, 255, 0.12)'; 
      
      ctx.lineWidth = 1 * pxPerMm;

      ctx.beginPath();
      for (let gx = 0; gx <= W_inner + 1e-3; gx += drawStep) {
        ctx.moveTo(sx + params.edge + gx, params.edge);
        ctx.lineTo(sx + params.edge + gx, params.edge + H_inner);
      }
      for (let gy = 0; gy <= H_inner + 1e-3; gy += drawStep) {
        ctx.moveTo(sx + params.edge, params.edge + gy);
        ctx.lineTo(sx + params.edge + W_inner, params.edge + gy);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawSheetBase(ctx, si, sheet, v, isSheetCam, COL_SHEET) {
  const params = v.params;
  const SW = params.sheetW, SH = params.sheetH;
  const scale = v.scale, originX = v.originX, originY = v.originY;
  const gapBetween = v.gapBetween;
  const pxPerMm = 1 / scale;
  const sx = si * (SW + gapBetween);
  const hasDxfSheet = !!(params.sheetPolygons && params.sheetPolygons.length);

  // ═══════════════════════════════════════════════════════════════
  // КОРИЧНЕВЫЙ ФОН ЛИСТА ТЕПЕРЬ ДЛЯ ВСЕХ ТЕМ (Убрали if isSheetCam)
  // ═══════════════════════════════════════════════════════════════
  ctx.fillStyle = '#4a1010'; 
  ctx.fillRect(sx, 0, SW, SH);

  if (hasDxfSheet) {
    ctx.strokeStyle = COL_SHEET;
    ctx.lineWidth = 2 * pxPerMm;
    for (const ring of params.sheetPolygons) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx + ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(sx + ring[i][0], ring[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = COL_SHEET;
    ctx.lineWidth = 2 * pxPerMm;
    ctx.strokeRect(sx, 0, SW, SH);

    // Внутренняя рамка отступа
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1 * pxPerMm;
    ctx.setLineDash([15 * pxPerMm, 10 * pxPerMm]);
    ctx.strokeRect(sx + params.edge, params.edge, SW - 2 * params.edge, SH - 2 * params.edge);
    ctx.setLineDash([]);
  }

  if (sheet && sheet.obstacles && sheet.obstacles.length) {
    for (const obs of sheet.obstacles) {
      const x = sx + params.edge + obs.x1;
      const y = params.edge + obs.y1;
      const w = obs.x2 - obs.x1;
      const h = obs.y2 - obs.y1;
      ctx.save();
      ctx.fillStyle = 'rgba(200, 40, 40, 0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#cc2222';
      ctx.lineWidth = 2 * pxPerMm;
      ctx.setLineDash([10 * pxPerMm, 5 * pxPerMm]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}