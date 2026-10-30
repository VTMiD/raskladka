import { canvas, ctx, updateFixCount } from './canvas-core.js';
import { state } from './state.js';
import { readParams } from './params.js';

function computeView(){
  const rect = canvas.getBoundingClientRect();
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const v = { rect, params, SW, SH, scale:1, originX:0, originY:0, gapBetween:0, totalW:0, totalH:SH };

  const nSheets = state.sheets.length || 1;
  const gapBetween = Math.max(SW * 0.05, 100);
  const totalW = nSheets * SW + (nSheets - 1) * gapBetween;
  const totalH = SH;
  const margin = 40;
  const scale = Math.min((rect.width - 2*margin) / totalW, (rect.height - 2*margin) / totalH);
  const offsetX = (rect.width  - totalW * scale) / 2;
  const offsetY = (rect.height - totalH * scale) / 2;
  v.scale = scale;
  v.originX = offsetX;
  v.originY = offsetY + totalH * scale;
  v.gapBetween = gapBetween;
  v.totalW = totalW;
  return v;
}

function drawMeasurements(){
  const v = state.view; if(!v) return;
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

  for(const m of state.measurements) drawOne(m, false);
  if(state.measurePreview) drawOne(state.measurePreview, true);
}

function drawRemnantShape(r, sx, params, pxPerMm){
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

  if (r.polygon && r.polygon.length >= 3){
    ctx.beginPath();
    ctx.moveTo(sx + r.polygon[0][0], r.polygon[0][1]);
    for (let i = 1; i < r.polygon.length; i++){
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

export function draw(){
  updateFixCount();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.floor(rect.width * dpr));
  const ch = Math.max(1, Math.floor(rect.height * dpr));
  if(canvas.width !== cw) canvas.width = cw;
  if(canvas.height !== ch) canvas.height = ch;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const v = computeView();
  state.view = v;

  const params = v.params;
  const SW = params.sheetW, SH = params.sheetH;
  const hasDxfSheet = !!(params.sheetPolygons && params.sheetPolygons.length);
  const isPreview = !state.sheets.length;

  const gapBetween = v.gapBetween;
  const scale = v.scale;
  const originX = v.originX, originY = v.originY;
  const toPxX = sx => originX + sx * scale;
  const toPxY = sy => originY - sy * scale;
  const pxPerMm = 1 / scale;

  const groupKeys = new Set();
  if(state.selectedParts && state.selectedParts.length){
    for(const sp of state.selectedParts) groupKeys.add(sp.sheetIdx + ':' + sp.placedIdx);
  }

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, -scale);

  const sheetsToDraw = state.sheets.length ? state.sheets : [null];

  // ─── Сетка ───
  {
    const showPersist = !!params.gridShow;
    const showAlt = !!(state.gridSnapMode && (state.drag || state.groupDrag));

    if(showPersist || showAlt){
      const baseStep = Math.max(1, params.gridStep || 10);
      let drawStep = baseStep;
      while(drawStep * scale < 4) drawStep *= 2;

      const W_inner = SW - 2*params.edge;
      const H_inner = SH - 2*params.edge;

      const sheetsToGrid = new Set();
      if(showPersist){
        for(let i = 0; i < sheetsToDraw.length; i++) sheetsToGrid.add(i);
      }
      if(showAlt){
        if(state.drag) sheetsToGrid.add(state.drag.orig.sheetIdx);
        if(state.groupDrag) for(const it of state.groupDrag.items) sheetsToGrid.add(it.sheetIdx);
      }

      for(const si of sheetsToGrid){
        if(si < 0 || si >= sheetsToDraw.length) continue;
        const sx = si * (SW + gapBetween);

        ctx.save();
        ctx.strokeStyle = showAlt ? 'rgba(0,120,220,0.35)' : 'rgba(150,170,210,0.35)';
        ctx.lineWidth = 1 * pxPerMm;

        ctx.beginPath();
        for(let gx = 0; gx <= W_inner + 1e-3; gx += drawStep){
          ctx.moveTo(sx + params.edge + gx, params.edge);
          ctx.lineTo(sx + params.edge + gx, params.edge + H_inner);
        }
        for(let gy = 0; gy <= H_inner + 1e-3; gy += drawStep){
          ctx.moveTo(sx + params.edge, params.edge + gy);
          ctx.lineTo(sx + params.edge + W_inner, params.edge + gy);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  for(let si=0; si<sheetsToDraw.length; si++){
    const sheet = sheetsToDraw[si];
    const sx = si * (SW + gapBetween);

    // ─── Контур листа ───
    if(hasDxfSheet){
      ctx.beginPath();
      for(const ring of params.sheetPolygons){
        if(ring.length < 2) continue;
        ctx.moveTo(sx + ring[0][0], ring[0][1]);
        for(let i=1; i<ring.length; i++) ctx.lineTo(sx + ring[i][0], ring[i][1]);
        ctx.closePath();
      }
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2 * pxPerMm;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2 * pxPerMm;
      ctx.strokeRect(sx, 0, SW, SH);

      ctx.strokeStyle = 'rgba(120,140,200,0.6)';
      ctx.lineWidth = 1 * pxPerMm;
      ctx.setLineDash([15*pxPerMm, 10*pxPerMm]);
      ctx.strokeRect(sx + params.edge, params.edge, SW - 2*params.edge, SH - 2*params.edge);
      ctx.setLineDash([]);
    }

    if(!sheet) continue;

    // ─── Запретные зоны ───
    if (sheet.obstacles && sheet.obstacles.length) {
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

    if(sheet.remnants && sheet.remnants.length){
      for(const r of sheet.remnants){
        drawRemnantShape(r, sx, params, pxPerMm);
      }
    }

    // ─── ПРОХОД 1: невыделенные детали ───
    for(let pi=0; pi<sheet.placed.length; pi++){
      const pl = sheet.placed[pi];
      const isSingle = state.selectedPart && state.selectedPart.sheetIdx === si && state.selectedPart.placedIdx === pi;
      const isGroup  = groupKeys.has(si + ':' + pi);
      if (isSingle || isGroup) continue;

      const isFixed = !!pl._fixed;
      ctx.strokeStyle = isFixed ? '#6a1fb0' : '#ff5555';
      ctx.lineWidth = (isFixed ? 2 : 1.5) * pxPerMm;
      for(const ring of pl.polygons){
        if(ring.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(sx + params.edge + pl.x + ring[0][0], params.edge + pl.y + ring[0][1]);
        for(let i=1; i<ring.length; i++)
          ctx.lineTo(sx + params.edge + pl.x + ring[i][0], params.edge + pl.y + ring[i][1]);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // ─── ПРОХОД 2: выделенные — только контур, поверх всех ───
    for(let pi=0; pi<sheet.placed.length; pi++){
      const pl = sheet.placed[pi];
      const isSingle = state.selectedPart && state.selectedPart.sheetIdx === si && state.selectedPart.placedIdx === pi;
      const isGroup  = groupKeys.has(si + ':' + pi);
      if (!isSingle && !isGroup) continue;

      const colliding = !!pl._collides;
      ctx.strokeStyle = colliding ? '#ff2020' : '#0080ff';
      ctx.lineWidth = 3 * pxPerMm;
      for(const ring of pl.polygons){
        if(ring.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(sx + params.edge + pl.x + ring[0][0], params.edge + pl.y + ring[0][1]);
        for(let i=1; i<ring.length; i++)
          ctx.lineTo(sx + params.edge + pl.x + ring[i][0], params.edge + pl.y + ring[i][1]);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // ─── Резы листа ───
    if (sheet.cuts && sheet.cuts.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.95)';
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

      ctx.save();
      ctx.scale(1 / scale, -1 / scale);
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

    // ─── Предпросмотр массива ───
    if(si === 0 && state.arrayPreview && state.arrayPreview.positions){
      ctx.save();
      ctx.fillStyle = 'rgba(100, 180, 255, 0.12)';
      ctx.strokeStyle = 'rgba(0, 120, 255, 0.50)';
      ctx.lineWidth = 1.5 * pxPerMm;
      ctx.setLineDash([8*pxPerMm, 6*pxPerMm]);
      for(const pos of state.arrayPreview.positions){
        for(const ring of pos.polygons){
          if(ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(sx + params.edge + pos.x + ring[0][0], params.edge + pos.y + ring[0][1]);
          for(let i=1; i<ring.length; i++)
            ctx.lineTo(sx + params.edge + pos.x + ring[i][0], params.edge + pos.y + ring[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ─── Линии отреза остатков ───
    if(sheet.remnants && sheet.remnants.length){
      ctx.strokeStyle = '#2a9a3c';
      ctx.lineWidth = 3 * pxPerMm;
      ctx.setLineDash([20*pxPerMm, 8*pxPerMm]);
      for(const r of sheet.remnants){
        if (r._manual) continue;
        if (!r.cut) continue;
        ctx.beginPath();
        ctx.moveTo(sx + r.cut.x1, r.cut.y1);
        ctx.lineTo(sx + r.cut.x2, r.cut.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ─── Подпись листа + размер заготовки (всегда видна) ───
    ctx.save();
    ctx.scale(1/scale, -1/scale);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const labelY = toPxY(SH - 15);
    const labelX = toPxX(sx + 15);

    // Строка 1: "Лист 1 / 3"
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#9ec0e8';
    const sheetLabel = 'Лист ' + (si+1) + ' / ' + state.sheets.length;
    ctx.fillText(sheetLabel, labelX, labelY);
    const lw = ctx.measureText(sheetLabel).width;

    // Строка 2 (рядом): "· 3000 × 1500 × 6 мм"
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#7896b8';
    const dimLabel = '  ·  ' + Math.round(params.sheetW) + ' × ' + Math.round(params.sheetH) + ' × ' + params.thickness + ' мм';
    ctx.fillText(dimLabel, labelX + lw, labelY);

    ctx.restore();

    // ─── Остатки: подписи ───
    if(sheet.remnants && sheet.remnants.length){
      ctx.save();
      ctx.scale(1/scale, -1/scale);
      for(const r of sheet.remnants){
        const cx = toPxX(sx + (r.rect.x1 + r.rect.x2)/2);
        const cy = toPxY((r.rect.y1 + r.rect.y2)/2);
        const text = r._manual ? 'ОСТАТОК' : 'ДЕЛОВОЙ ОТХОД';
        ctx.font = 'bold 14px system-ui';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(cx - tw/2 - 6, cy - 11, tw + 12, 22);
        ctx.fillStyle = '#1a6a25';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
        const dimText = `${Math.round(r.w)} × ${Math.round(r.h)} мм`;
        ctx.font = '12px system-ui';
        ctx.fillStyle = '#1a6a25';
        ctx.fillText(dimText, cx, cy + 16);
      }
      ctx.restore();
    }

    // ─── Предпросмотр остатка ───
    if (state.remnantPreview
        && state.remnantPreview.sheetIdx === si
        && !state.remnantPreview.alreadyMarked) {
      const p = state.remnantPreview;
      if (p.rect){
        const isBad = p.tooSmall || p.hasParts;

        ctx.save();
        ctx.fillStyle = isBad ? 'rgba(255,80,80,0.18)' : 'rgba(80,200,100,0.22)';
        ctx.strokeStyle = isBad ? '#ff2020' : '#2a9a3c';
        ctx.lineWidth = 2 * pxPerMm;
        ctx.setLineDash([8*pxPerMm, 6*pxPerMm]);

        if (p.polygon && p.polygon.length >= 3){
          ctx.beginPath();
          ctx.moveTo(sx + p.polygon[0][0], p.polygon[0][1]);
          for (let i = 1; i < p.polygon.length; i++){
            ctx.lineTo(sx + p.polygon[i][0], p.polygon[i][1]);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const rx = sx + p.rect.x1;
          const ry = p.rect.y1;
          const rw = p.rect.x2 - p.rect.x1;
          const rh = p.rect.y2 - p.rect.y1;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        }
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.scale(1/scale, -1/scale);
        const cx = toPxX(sx + (p.rect.x1 + p.rect.x2) / 2);
        const cy = toPxY((p.rect.y1 + p.rect.y2) / 2);
        ctx.font = 'bold 13px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let label;
        if (p.tooSmall)       label = 'СЛИШКОМ МАЛО';
        else if (p.hasParts)  label = 'РЕЗ НЕ ДОШЁЛ ДО КРАЯ';
        else if (p.alreadyMarked) label = 'УЖЕ ОТМЕЧЕН';
        else                  label = `${Math.round(p.w)}×${Math.round(p.h)} мм`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(cx - tw/2 - 6, cy - 10, tw + 12, 20);
        ctx.fillStyle = isBad ? '#c00' : '#1a6a25';
        ctx.fillText(label, cx, cy);
        ctx.restore();
      }
    }

    // ─── Направляющие привязки ───
    if(state.snapGuides && state.snapGuides.sheetIdx === si){
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 128, 0.85)';
      ctx.lineWidth = 1 * pxPerMm;
      ctx.setLineDash([6 * pxPerMm, 4 * pxPerMm]);
      for(const gx of state.snapGuides.x){
        ctx.beginPath();
        ctx.moveTo(sx + params.edge + gx.value, 0);
        ctx.lineTo(sx + params.edge + gx.value, SH);
        ctx.stroke();
      }
      for(const gy of state.snapGuides.y){
        ctx.beginPath();
        ctx.moveTo(sx, params.edge + gy.value);
        ctx.lineTo(sx + SW, params.edge + gy.value);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ─── Предпросмотр drop ───
  if(state.dropPreview){
    const dp = state.dropPreview;
    if(dp.sheetIdx < state.sheets.length){
      const sx = dp.sheetIdx * (SW + gapBetween);
      const part = state.parts[dp.partIdx];
      if(part){
        ctx.fillStyle = 'rgba(0, 150, 255, 0.12)';
        ctx.strokeStyle = 'rgba(0, 120, 220, 0.75)';
        ctx.lineWidth = 2 * pxPerMm;
        ctx.setLineDash([6 * pxPerMm, 4 * pxPerMm]);
        for(const ring of part.polygons){
          if(ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(sx + params.edge + dp.x + ring[0][0], params.edge + dp.y + ring[0][1]);
          for(let i=1; i<ring.length; i++)
            ctx.lineTo(sx + params.edge + dp.x + ring[i][0], params.edge + dp.y + ring[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }

  ctx.restore();

  // ─── Ghost дублирования ───
  if(state.duplicateGhost && state.duplicateSource && state.duplicateSource.sheetIdx < state.sheets.length){
    const g = state.duplicateGhost;
    const src = state.duplicateSource;
    const sx = src.sheetIdx * (SW + gapBetween);

    ctx.save();

    if(g.items && g.items.length){
      for(const it of g.items){
        const itemCollides = g.collides || it.collides;
        ctx.fillStyle = itemCollides ? 'rgba(255, 60, 60, 0.20)' : 'rgba(0, 150, 255, 0.15)';
        ctx.strokeStyle = itemCollides ? 'rgba(200, 0, 0, 0.90)' : 'rgba(0, 120, 220, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash(itemCollides ? [6, 4] : [10, 5]);
        for(const ring of it.polygons){
          if(ring.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(toPxX(sx + params.edge + it.x + ring[0][0]), toPxY(params.edge + it.y + ring[0][1]));
          for(let i = 1; i < ring.length; i++)
            ctx.lineTo(toPxX(sx + params.edge + it.x + ring[i][0]), toPxY(params.edge + it.y + ring[i][1]));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      if(g.bbox){
        const cx = toPxX(sx + params.edge + (g.bbox[0] + g.bbox[2]) / 2);
        const cy = toPxY(params.edge + g.bbox[1]) - 6;
        const n = g.items.length;
        const label = g.collides ? 'НАЛОЖЕНИЕ' : (n > 1 ? `КОПИЯ ×${n}` : 'КОПИЯ');
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(cx - tw/2 - 6, cy - 16, tw + 12, 18);
        ctx.strokeStyle = g.collides ? '#c00' : '#0066cc';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - tw/2 - 6, cy - 16, tw + 12, 18);
        ctx.fillStyle = g.collides ? '#c00' : '#0066cc';
        ctx.fillText(label, cx, cy);
      }
    }

    ctx.restore();
  }

  // ─── Названия деталей и 📌 ───
  if(!isPreview){
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for(let si=0; si<state.sheets.length; si++){
      const sheet = state.sheets[si];
      const sx = si * (SW + gapBetween);
      for(const pl of sheet.placed){
        const part = state.parts[pl.partIdx];
        if(!part || !part.name) continue;
        const pw = pl.bbox[2] - pl.bbox[0];
        const ph = pl.bbox[3] - pl.bbox[1];
        const cx = toPxX(sx + params.edge + pl.x + pw/2);
        const cy = toPxY(params.edge + pl.y + ph/2);
        const partPxW = pw * scale, partPxH = ph * scale;
        if(partPxW < 18 || partPxH < 10) continue;
        const fontSize = Math.max(8, Math.min(16, Math.min(partPxW * 0.22, partPxH * 0.30)));
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
        const maxW = partPxW - 4;
        let text = String(part.name);
        if(ctx.measureText(text).width > maxW){
          while(text.length > 1 && ctx.measureText(text + '\u2026').width > maxW) text = text.slice(0, -1);
          text = text + '\u2026';
        }
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(text, cx + 1, cy + 1);
        ctx.fillStyle = '#004a99';
        ctx.fillText(text, cx, cy);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    for(let si=0; si<state.sheets.length; si++){
      const sheet = state.sheets[si];
      const sx = si * (SW + gapBetween);
      for(const pl of sheet.placed){
        if(!pl._fixed) continue;
        const ph = pl.bbox[3] - pl.bbox[1];
        ctx.fillText('📌', toPxX(sx + params.edge + pl.x) + 3, toPxY(params.edge + pl.y + ph) + 1);
      }
    }
  } else {
    // ─── Предпросмотр заготовки: крупный размер по центру ───
    ctx.save();
    ctx.fillStyle = '#7896b8';
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const hintText = hasDxfSheet
      ? 'Предпросмотр заготовки из DXF — добавьте детали и нажмите «Разложить»'
      : 'Добавьте детали и нажмите «Разложить»';
    ctx.fillText(hintText, originX + (SW * scale) / 2, originY - SH * scale - 12);
    ctx.restore();

    // Пропорциональный размер шрифта от размера листа
    ctx.save();
    ctx.scale(1/scale, -1/scale);
    const minDim = Math.min(SW, SH);
    const sizeFont = Math.max(16, Math.min(56, Math.round(minDim / 30)));
    const subFont  = Math.max(10, Math.min(20, Math.round(minDim / 75)));

    const cxPx = toPxX(SW / 2);
    const cyPx = toPxY(SH / 2);

    // Основная строка — размер (светло-голубой на тёмном фоне)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + sizeFont + 'px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#b8d4f0';
    ctx.fillText(Math.round(params.sheetW) + ' × ' + Math.round(params.sheetH) + ' мм', cxPx, cyPx);

    // Вторая строка — толщина/отступ (чуть приглушённее)
    ctx.font = subFont + 'px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#8fa8c5';
    ctx.fillText('толщина ' + params.thickness + ' мм · отступ ' + params.edge + ' мм',
                 cxPx, cyPx + Math.round(sizeFont * 1.05));

    ctx.restore();
  }

  // ─── Иконки 🚫 в запретных зонах ───
  if (!isPreview && state.sheets.length) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let si = 0; si < state.sheets.length; si++) {
      const sheet = state.sheets[si];
      if (!sheet.obstacles || !sheet.obstacles.length) continue;
      const sx = si * (SW + gapBetween);
      for (const obs of sheet.obstacles) {
        const cx = toPxX(sx + params.edge + (obs.x1 + obs.x2) / 2);
        const cy = toPxY(params.edge + (obs.y1 + obs.y2) / 2);
        const zW = (obs.x2 - obs.x1) * scale;
        const zH = (obs.y2 - obs.y1) * scale;
        if (zW < 20 || zH < 20) continue;
        const r = Math.min(28, zW * 0.4, zH * 0.4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cc2222';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#cc2222';
        ctx.font = `bold ${Math.min(26, r * 1.2)}px system-ui, sans-serif`;
        ctx.fillText('🚫', cx, cy + 1);
      }
    }
    ctx.restore();
  }

  // ─── Запомненная пустая область ───
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

  // ─── Рамка выделения ───
  if(state.groupSelectDrag){
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

  // ─── Первая точка реза ───
  if (state.cutMode && state.cutPoints.length > 0) {
    const p = state.cutPoints[0];
    const si = p.sheetIdx;
    if (si < state.sheets.length) {
      const sx = si * (SW + gapBetween);
      ctx.save();
      ctx.fillStyle = '#ff8c00';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toPxX(sx + p.x), toPxY(p.y), 6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  if (state.cutPreview) {
    const cp = state.cutPreview;
    const sx = cp.sheetIdx * (SW + gapBetween);
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
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(mx - tw/2 - 6, my - 10, tw + 12, 20);
      ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.strokeRect(mx - tw/2 - 6, my - 10, tw + 12, 20);
      ctx.fillStyle = '#a84000';
      ctx.fillText(text, mx, my);
    }
    ctx.restore();
  }

  drawMeasurements();

  // ─── Кнопки резов ───
  {
    const totalCuts = state.sheets.reduce((s, sh) => s + ((sh.cuts && sh.cuts.length) || 0), 0);
    const info = document.getElementById('cutInfo');
    if (info) info.textContent = totalCuts ? `Резов: ${totalCuts}` : '';
    const b1 = document.getElementById('btnCutRemoveLast');
    const b2 = document.getElementById('btnCutClear');
    if (b1) b1.disabled = !totalCuts;
    if (b2) b2.disabled = !totalCuts;
  }
}