// js/canvas/draw-ui.js
import { state } from '../state.js';

export function drawMeasurements(ctx, v) {
  if (!state.measurements.length && !state.measurePreview) return;
  
  const { originX, originY, scale } = v;
  const toPxX = x => originX + x * scale;
  const toPxY = y => originY - y * scale;

  const drawOne = (m, isPreview) => {
    const ax = toPxX(m.a.x), ay = toPxY(m.a.y);
    const bx = toPxX(m.b.x), by = toPxY(m.b.y);

    ctx.save();
    ctx.strokeStyle = isPreview ? 'rgba(255,140,0,0.75)' : '#ff8c00';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(isPreview ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff8c00';
    ctx.beginPath(); ctx.arc(ax, ay, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI*2); ctx.fill();

    const len = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    const text = len.toFixed(1) + ' мм';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(midX - tw/2 - 6, midY - 10, tw + 12, 20);
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 1;
    ctx.strokeRect(midX - tw/2 - 6, midY - 10, tw + 12, 20);
    ctx.fillStyle = '#a85200';
    ctx.fillText(text, midX, midY);
    ctx.restore();
  };

  for (const m of state.measurements) drawOne(m, false);
  if (state.measurePreview) drawOne(state.measurePreview, true);
}

export function drawUI(ctx, v, rect, isPreview, params, isSheetCam, COL_DIM) {
  const { originX, originY, scale } = v;
  const SW = params.sheetW, SH = params.sheetH;
  const toPxX = x => originX + x * scale;
  const toPxY = y => originY - y * scale;
  const hasDxfSheet = !!(params.sheetPolygons && params.sheetPolygons.length);

  if (isPreview) {
    // 1. Подсказка сверху
    ctx.save();
    ctx.fillStyle = COL_DIM;
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const hintText = hasDxfSheet
      ? 'Предпросмотр заготовки из DXF — добавьте детали и нажмите «Разложить»'
      : 'Добавьте детали и нажмите «Разложить»';
    ctx.fillText(hintText, originX + (SW * scale) / 2, originY - SH * scale - 12);
    ctx.restore();

    // 2. Размер листа по центру
    ctx.save();
    const minDim = Math.min(SW, SH);
    const sizeFont = Math.max(16, Math.min(56, Math.round(minDim / 30)));
    const subFont  = Math.max(10, Math.min(20, Math.round(minDim / 75)));
    const cxPx = toPxX(SW / 2);
    const cyPx = toPxY(SH / 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Убрали ctx.scale(1/scale, -1/scale) - теперь текст рисуется ровно!
    ctx.font = 'bold ' + sizeFont + 'px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = COL_DIM;
    ctx.fillText(Math.round(params.sheetW) + ' × ' + Math.round(params.sheetH) + ' мм', cxPx, cyPx);

    ctx.font = subFont + 'px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isSheetCam ? 'rgba(200,200,255,0.7)' : '#8fa8c5';
    ctx.fillText('толщина ' + params.thickness + ' мм · отступ ' + params.edge + ' мм',
                 cxPx, cyPx + Math.round(sizeFont * 1.05));
    ctx.restore();
  } else {
    // 3. Размер листа, когда раскладка уже выполнена (пишем в центре, но прозрачно, чтобы не мешало)
    ctx.save();
    const minDim = Math.min(SW, SH);
    const sizeFont = Math.max(16, Math.min(56, Math.round(minDim / 30)));
    const cxPx = toPxX(SW / 2);
    const cyPx = toPxY(SH / 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + sizeFont + 'px system-ui, -apple-system, sans-serif';
    // Делаем текст полупрозрачным, чтобы он не загораживал детали
    ctx.fillStyle = 'rgba(150, 170, 210, 0.15)'; 
    ctx.fillText(Math.round(params.sheetW) + ' × ' + Math.round(params.sheetH) + ' мм', cxPx, cyPx);
    ctx.restore();
  }

  // Масштаб в правом нижнем углу
  if (!isPreview) {
    const zoomPct = Math.round(scale * 100);
    ctx.save();
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const txt = 'Масштаб: ' + zoomPct + '%' + (state.camera && state.camera.scale != null ? '  ·  ⛶ Всё' : '');
    const tw = ctx.measureText(txt).width;
    const px = rect.width - 10;
    const py = rect.height - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - tw - 16, py - 20, tw + 22, 22);
    ctx.fillStyle = isSheetCam ? '#ffffff' : '#cfe4ff';
    ctx.fillText(txt, px - 4, py - 2);
    ctx.restore();
  }
}