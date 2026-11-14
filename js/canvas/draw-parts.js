// js/canvas/draw-parts.js
import { state } from '../state.js';

export function drawPlacedParts(ctx, sheet, si, v, groupKeys, isSheetCam, COL_MARK) {
  const params = v.params;
  const scale = v.scale;
  const gapBetween = v.gapBetween;
  const pxPerMm = 1 / scale;
  const sx = si * (params.sheetW + gapBetween);

  // 1. Отрисовка обычных деталей (не выделенных)
  for (let pi = 0; pi < sheet.placed.length; pi++) {
    const pl = sheet.placed[pi];
    const isSingle = state.selectedPart && state.selectedPart.sheetIdx === si && state.selectedPart.placedIdx === pi;
    const isGroup  = groupKeys.has(si + ':' + pi);
    if (isSingle || isGroup) continue;

    const layer = state.layers.find(l => l.id === (pl.layerId || 1));
    if (layer && layer.visible === false) continue;

    const isFixed = !!pl._fixed;
    const partColor = layer ? layer.color : '#ff5555';

    ctx.strokeStyle = isFixed ? (isSheetCam ? '#ffffff' : '#6a1fb0') : partColor;
    ctx.lineWidth = (isFixed ? 2 : 1.5) * pxPerMm;
    for (const ring of pl.polygons) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx + params.edge + pl.x + ring[0][0], params.edge + pl.y + ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(sx + params.edge + pl.x + ring[i][0], params.edge + pl.y + ring[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  // 2. Отрисовка выделенных деталей
  for (let pi = 0; pi < sheet.placed.length; pi++) {
    const pl = sheet.placed[pi];
    const isSingle = state.selectedPart && state.selectedPart.sheetIdx === si && state.selectedPart.placedIdx === pi;
    const isGroup  = groupKeys.has(si + ':' + pi);
    if (!isSingle && !isGroup) continue;

    const layer = state.layers.find(l => l.id === (pl.layerId || 1));
    if (layer && layer.visible === false) continue;

    const colliding = !!pl._collides;
    ctx.strokeStyle = colliding ? '#ff2020' : COL_MARK;
    ctx.lineWidth = 3 * pxPerMm;
    for (const ring of pl.polygons) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx + params.edge + pl.x + ring[0][0], params.edge + pl.y + ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(sx + params.edge + pl.x + ring[i][0], params.edge + pl.y + ring[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
}