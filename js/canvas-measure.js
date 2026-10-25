import { canvas, screenToWorld, DEFAULT_HINT } from './canvas-core.js';
import { draw } from './canvas-draw.js';
import { state } from './state.js';
import { setStatus } from './utils.js';

export function enterMeasureMode(){
  state.measureMode = true;
  state.measurePoints = [];
  state.measurePreview = null;
  canvas.style.cursor = 'crosshair';
  const btn = document.getElementById('btnMeasure');
  if(btn) btn.classList.add('active');
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = 'Измерение: клик — точка A, клик — точка B · ПКМ / Esc — выход';
  setStatus('Режим измерения: укажите первую точку');
  draw();
}

export function exitMeasureMode(){
  state.measureMode = false;
  state.measurePoints = [];
  state.measurePreview = null;
  canvas.style.cursor = '';
  const btn = document.getElementById('btnMeasure');
  if(btn) btn.classList.remove('active');
  const hint = document.getElementById('canvasHint');
  if(hint) hint.textContent = DEFAULT_HINT;
  setStatus('');
  draw();
}

export function handleMeasureClick(w){
  if(state.measurePoints.length === 0){
    state.measurePoints = [{ x: w.x, y: w.y }];
    state.measurePreview = null;
    setStatus('Точка A задана. Укажите точку B');
  } else {
    const a = state.measurePoints[0];
    const b = { x: w.x, y: w.y };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if(len > 0.01){
      state.measurements.push({ a: { ...a }, b: { ...b } });
      setStatus(`Измерено: ${len.toFixed(1)} мм`);
    }
    state.measurePoints = [];
    state.measurePreview = null;
  }
  draw();
}