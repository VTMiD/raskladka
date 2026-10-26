import { $ } from './utils.js';

let _cancelRequested = false;

export function showProgress(){
  _cancelRequested = false;
  const overlay = $('progressOverlay');
  if(overlay) overlay.classList.add('active');
  const btn = $('btnCancelNest');
  if(btn){
    btn.disabled = false;
    btn.textContent = '✕ Отменить раскладку';
  }
}

export function hideProgress(){
  const overlay = $('progressOverlay');
  if(overlay) overlay.classList.remove('active');
  _cancelRequested = false;
}

export function setProgress(fraction, text){
  const pct = Math.max(0, Math.min(100, Math.round(fraction*100)));
  const fill = $('progressFill');
  const pctEl = $('progressPct');
  const subEl = $('progressSub');
  if(fill) fill.style.width = pct + '%';
  if(pctEl) pctEl.textContent = pct + '%';
  if(text && subEl) subEl.textContent = text;
}

export function requestCancel(){
  _cancelRequested = true;
  const btn = $('btnCancelNest');
  if(btn){
    btn.disabled = true;
    btn.textContent = '⏳ Отмена...';
  }
  const sub = $('progressSub');
  if(sub) sub.textContent = 'Останавливаю после текущего шага...';
}

export function isCancelRequested(){ return _cancelRequested; }