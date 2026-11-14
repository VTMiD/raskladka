// js/canvas/camera.js
import { canvas } from '../canvas-core.js';
import { state } from '../state.js';
import { readParams } from '../params.js';

export function resetCamera() {
  if (state.camera) {
    state.camera.scale = null;
    state.camera.originX = null;
    state.camera.originY = null;
  }
}

export function computeView() {
  const rect = canvas.getBoundingClientRect();
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const v = { rect, params, SW, SH, scale:1, originX:0, originY:0, gapBetween:0, totalW:0, totalH:SH };

  const nSheets = state.sheets.length || 1;
  const gapBetween = Math.max(SW * 0.05, 100);
  const totalW = nSheets * SW + (nSheets - 1) * gapBetween;
  const totalH = SH;

  if (state.camera && state.camera.scale != null) {
    v.scale = state.camera.scale;
    v.originX = state.camera.originX;
    v.originY = state.camera.originY;
    v.gapBetween = gapBetween;
    v.totalW = totalW;
    v.totalH = totalH;
    v.userCamera = true;
    return v;
  }

  const margin = 40;
  const scale = Math.min((rect.width - 2*margin) / totalW, (rect.height - 2*margin) / totalH);
  const offsetX = (rect.width  - totalW * scale) / 2;
  const offsetY = (rect.height - totalH * scale) / 2;
  v.scale = scale;
  v.originX = offsetX;
  v.originY = offsetY + totalH * scale;
  v.gapBetween = gapBetween;
  v.totalW = totalW;
  v.totalH = totalH;
  v.userCamera = false;
  return v;
}