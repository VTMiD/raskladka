// js/canvas/render.js
import { canvas, ctx, updateFixCount } from '../canvas-core.js';
import { state } from '../state.js';
import { resetCamera, computeView } from './camera.js';
import { syncTableScrollToCanvasSelection, syncTableHighlightToCanvasSelection } from './table-sync.js';
import { drawGrid, drawSheetBase } from './draw-sheet.js';
import { drawRemnants } from './draw-remnants.js';
import { drawPlacedParts } from './draw-parts.js';
import { drawCuts } from './draw-cuts.js';
import { drawPreviews } from './draw-previews.js';
import { drawMeasurements, drawUI } from './draw-ui.js';

export { resetCamera } from './camera.js';

export function draw() {
  updateFixCount();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.floor(rect.width * dpr));
  const ch = Math.max(1, Math.floor(rect.height * dpr));
  
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const v = computeView();
  state.view = v;

  syncTableScrollToCanvasSelection();
  syncTableHighlightToCanvasSelection();

  const params = v.params;
  const SW = params.sheetW, SH = params.sheetH;
  const isPreview = !state.sheets.length;

  const theme = (localStorage.getItem('raskladka.theme') || 'default');
  const isSheetCam = theme === 'sheetcam';
  
  // ═══════════════════════════════════════════════════════════════
  // ЦВЕТА ФОНА "СТОЛА" (ВОКРУГ ЛИСТА)
  // ═══════════════════════════════════════════════════════════════
  const COL_BG = isSheetCam ? '#4a1010' : '#2b2b2b'; 
  
  const COL_SHEET = isSheetCam ? '#ffffff' : '#cccccc';
  const COL_MARK = isSheetCam ? '#4488ff' : '#ff8c00';
  const COL_DIM = isSheetCam ? '#8888ff' : '#9ec0e8';

  ctx.fillStyle = COL_BG;
  ctx.fillRect(0, 0, rect.width, rect.height);

  const groupKeys = new Set();
  if (state.selectedParts && state.selectedParts.length) {
    for (const sp of state.selectedParts) groupKeys.add(sp.sheetIdx + ':' + sp.placedIdx);
  }

  ctx.save();
  ctx.translate(v.originX, v.originY);
  ctx.scale(v.scale, -v.scale);

  const sheetsToDraw = state.sheets.length ? state.sheets : [null];

  // 1. Сначала рисуем листы
  for (let si = 0; si < sheetsToDraw.length; si++) {
    const sheet = sheetsToDraw[si];
    drawSheetBase(ctx, si, sheet, v, isSheetCam, COL_SHEET);
  }

  // 2. Потом сетку (поверх листов)
  drawGrid(ctx, v, sheetsToDraw);

  // 3. Потом детали
  for (let si = 0; si < sheetsToDraw.length; si++) {
    const sheet = sheetsToDraw[si];
    if (!sheet) continue;
    drawRemnants(ctx, sheet, si, v);
    drawPlacedParts(ctx, sheet, si, v, groupKeys, isSheetCam, COL_MARK);
    drawCuts(ctx, sheet, si, v);
  }

  ctx.restore();

  // ═══════════════════════════════════════════════════════════════
  // 2. ТЕКСТ И ИНТЕРФЕЙС
  // ═══════════════════════════════════════════════════════════════
  if (!isPreview) {
    const toPxX = x => v.originX + x * v.scale;
    const toPxY = y => v.originY - y * v.scale;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (let si = 0; si < state.sheets.length; si++) {
      const sheet = state.sheets[si];
      const sx = si * (SW + v.gapBetween);

      // 2.1. Имена деталей
      for (const pl of sheet.placed) {
        const part = state.parts[pl.partIdx];
        if (!part || !part.name || state.showNames === false) continue;
        
        const layer = state.layers.find(l => l.id === (pl.layerId || 1));
        if (layer && layer.visible === false) continue;

        const pw = pl.bbox[2] - pl.bbox[0];
        const ph = pl.bbox[3] - pl.bbox[1];
        
        const cx = toPxX(sx + params.edge + pl.x + pw / 2);
        const cy = toPxY(params.edge + pl.y + ph / 2);
        
        const partPxW = pw * v.scale, partPxH = ph * v.scale;
        if (partPxW < 18 || partPxH < 10) continue;

        const fontSize = Math.max(8, Math.min(16, Math.min(partPxW * 0.22, partPxH * 0.30)));
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
        
        const maxW = partPxW - 4;
        let text = String(part.name);
        if (ctx.measureText(text).width > maxW) {
          while (text.length > 1 && ctx.measureText(text + '\u2026').width > maxW) text = text.slice(0, -1);
          text = text + '\u2026';
        }
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(text, cx + 1, cy + 1);
        ctx.fillStyle = isSheetCam ? '#ffffff' : '#004a99';
        ctx.fillText(text, cx, cy);
      }

      // ═══════════════════════════════════════════════════════════
      // 2.1.5. ЗНАЧКИ ФИКСАЦИИ 📌 (ВОЗВРАЩЕНЫ!)
      // ═══════════════════════════════════════════════════════════
      for (const pl of sheet.placed) {
        if (!pl._fixed) continue;
        
        const layer = state.layers.find(l => l.id === (pl.layerId || 1));
        if (layer && layer.visible === false) continue;

        const pw = pl.bbox[2] - pl.bbox[0];
        const ph = pl.bbox[3] - pl.bbox[1];
        
        const cornerX = toPxX(sx + params.edge + pl.x);
        const cornerY = toPxY(params.edge + pl.y + ph);

        if (pw * v.scale > 20 && ph * v.scale > 20) {
          ctx.save();
          
          const iconSize = Math.max(12, Math.min(20, 14 * v.scale));
          const offsetX = iconSize * 0.6;
          const offsetY = iconSize * 0.6;
          const iconX = cornerX + offsetX;
          const iconY = cornerY + offsetY;

          // Белая подложка-кружок
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(iconX, iconY, iconSize * 0.7, 0, Math.PI * 2);
          ctx.fill();
          
          // Обводка кружка
          ctx.strokeStyle = '#6a1fb0';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Сам значок
          ctx.font = `${iconSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📌', iconX, iconY);
          
          ctx.restore();
        }
      }

      // 2.2. Номера резов
      if (state.showCutOrder !== false) {
        for (const pl of sheet.placed) {
          if (!pl._cutOrder) continue;
          
          const layer = state.layers.find(l => l.id === (pl.layerId || 1));
          if (layer && layer.visible === false) continue;

          const badgeR = Math.max(6, 8 * v.scale);
          const offsetMm = 6; 
          
          const bx = toPxX(sx + params.edge + pl.bbox[2] - offsetMm) - badgeR;
          const by = toPxY(params.edge + pl.bbox[3] - offsetMm) + badgeR;
          
          ctx.save();
          ctx.fillStyle = '#ff8c00';
          ctx.beginPath();
          ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, 2 * v.scale);
          ctx.stroke();
          
          const fontSize = Math.max(8, 10 * v.scale);
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillText(pl._cutOrder, bx, by + fontSize * 0.05);
          ctx.restore();
        }
      }

      // 2.3. Длина резов
      if (sheet.cuts && sheet.cuts.length) {
        ctx.save();
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
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 2.5. ИНТЕРАКТИВНЫЕ ЭЛЕМЕНТЫ
  // ═══════════════════════════════════════════════════════════════
  {
    const toPxX = x => v.originX + x * v.scale;
    const toPxY = y => v.originY - y * v.scale;

    if (state.cutMode && state.cutPoints.length > 0) {
      const p = state.cutPoints[0];
      const si = p.sheetIdx;
      if (si < state.sheets.length) {
        const sx = si * (SW + v.gapBetween);
        ctx.save();
        ctx.fillStyle = '#ff8c00';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(toPxX(sx + p.x), toPxY(p.y), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    if (state.cutPreview) {
      const cp = state.cutPreview;
      const si = cp.sheetIdx;
      if (si < state.sheets.length) {
        const sx = si * (SW + v.gapBetween);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(toPxX(sx + cp.a.x), toPxY(cp.a.y));
        ctx.lineTo(toPxX(sx + cp.b.x), toPxY(cp.b.y));
        ctx.stroke();
        ctx.setLineDash([]);

        const len = Math.hypot(cp.b.x - cp.a.x, cp.b.y - cp.a.y);
        if (len > 1) {
          const mx = toPxX(sx + (cp.a.x + cp.b.x) / 2);
          const my = toPxY((cp.a.y + cp.b.y) / 2) - 8;
          const text = len.toFixed(1) + ' мм';
          ctx.font = 'bold 12px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillRect(mx - tw/2 - 6, my - 10, tw + 12, 20);
          ctx.strokeStyle = '#ff8c00';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.strokeRect(mx - tw/2 - 6, my - 10, tw + 12, 20);
          ctx.fillStyle = '#a84000';
          ctx.fillText(text, mx, my);
        }
        ctx.restore();
      }
    }

    if (state.snapGuides && state.snapGuides.sheetIdx < state.sheets.length) {
      const si = state.snapGuides.sheetIdx;
      const sx = si * (SW + v.gapBetween);
      
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 128, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      
      for (const gx of state.snapGuides.x) {
        ctx.beginPath();
        ctx.moveTo(toPxX(sx + params.edge + gx.value), toPxY(SH));
        ctx.lineTo(toPxX(sx + params.edge + gx.value), toPxY(0));
        ctx.stroke();
      }
      
      for (const gy of state.snapGuides.y) {
        ctx.beginPath();
        ctx.moveTo(toPxX(sx), toPxY(params.edge + gy.value));
        ctx.lineTo(toPxX(sx + SW), toPxY(params.edge + gy.value));
        ctx.stroke();
      }
      
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  drawPreviews(ctx, v, isPreview);
  drawMeasurements(ctx, v);
  drawUI(ctx, v, rect, isPreview, params, isSheetCam, COL_DIM);

  const totalCuts = state.sheets.reduce((s, sh) => s + ((sh.cuts && sh.cuts.length) || 0), 0);
  const info = document.getElementById('cutInfo');
  if (info) info.textContent = totalCuts ? `Резов: ${totalCuts}` : '';
  const b1 = document.getElementById('btnCutRemoveLast');
  const b2 = document.getElementById('btnCutClear');
  if (b1) b1.disabled = !totalCuts;
  if (b2) b2.disabled = !totalCuts;
}