import { state, getActiveJob } from './state.js';
import { readParams, applyParams } from './params.js';
import { setStatus } from './utils.js';

const MAX_HISTORY = 50;

function cloneParts(parts){
  return parts.map(p => ({
    name: p.name,
    polygons: p.polygons.map(r => r.map(pt => [pt[0], pt[1]])),
    bbox: [...p.bbox],
    area: p.area, width: p.width, height: p.height,
    length: p.length, qty: p.qty,
  }));
}

function cloneSheets(sheets){
  return sheets.map(sh => ({
    placed: sh.placed.map(pl => ({
      partIdx: pl.partIdx,
      polygons: pl.polygons.map(r => r.map(pt => [pt[0], pt[1]])),
      x: pl.x, y: pl.y, bbox: [...pl.bbox],
      _fixed: !!pl._fixed,
      _fromArray: !!pl._fromArray,
      _manual: !!pl._manual,
    })),
    cuts: (sh.cuts || []).map(c => ({ x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 })),
    remnants: (sh.remnants || []).map(r => ({
      type: r.type, cut: { ...r.cut }, rect: { ...r.rect }, w: r.w, h: r.h,
    })),
  }));
}

function takeSnapshot(job){
  return {
    jobName: job.name,
    parts: cloneParts(job.parts),
    sheets: cloneSheets(job.sheets),
    params: { ...readParams() },
  };
}

function ensureHistory(job){
  if(!job) return null;
  if(!job._history) job._history = { stack: [], index: -1, limit: MAX_HISTORY };
  return job._history;
}

let _debounceTimer = null;

export function schedulePush(delayMs = 500){
  if(_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    pushHistory();
  }, delayMs);
}

export function flushScheduledPush(){
  if(_debounceTimer){
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    pushHistory();
  }
}

export function cancelScheduledPush(){
  if(_debounceTimer){ clearTimeout(_debounceTimer); _debounceTimer = null; }
}

export function initHistory(){
  const job = getActiveJob();
  if(!job) return;
  const h = ensureHistory(job);
  if(h.index < 0){
    h.stack.push(takeSnapshot(job));
    h.index = 0;
  }
  updateButtons();
}

export function pushHistory(){
  const job = getActiveJob();
  if(!job) return;
  const h = ensureHistory(job);
  if(h.index < 0){
    h.stack.push(takeSnapshot(job));
    h.index = 0;
  }
  if(h.index < h.stack.length - 1){
    h.stack = h.stack.slice(0, h.index + 1);
  }
  h.stack.push(takeSnapshot(job));
  if(h.stack.length > h.limit) h.stack.shift();
  h.index = h.stack.length - 1;
  updateButtons();
}

export async function undo(){
  cancelScheduledPush();
  const job = getActiveJob();
  if(!job) return false;
  const h = ensureHistory(job);
  if(h.index <= 0) return false;
  h.index--;
  applySnapshot(job, h.stack[h.index]);
  await refreshUI();
  updateButtons();
  setStatus('Отменено');
  return true;
}

export async function redo(){
  cancelScheduledPush();
  const job = getActiveJob();
  if(!job) return false;
  const h = ensureHistory(job);
  if(h.index >= h.stack.length - 1) return false;
  h.index++;
  applySnapshot(job, h.stack[h.index]);
  await refreshUI();
  updateButtons();
  setStatus('Возвращено');
  return true;
}

function applySnapshot(job, snap){
  if(snap.jobName) job.name = snap.jobName;
  job.parts = cloneParts(snap.parts);
  job.sheets = cloneSheets(snap.sheets);
  try { applyParams(snap.params); } catch(_) {}
  job.selectedPart = null;
  job.selectedRows = new Set();
  state.snapGuides = null;
  state.drag = null;
  state.dropPreview = null;
  state.draggedPartIdx = null;
  state._dropHandled = false;
  state.groupSelectMode = false;
  state.groupSelectDrag = null;
  state.groupDrag = null;
  state.cutMode = false;
  state.cutPoints = [];
  state.cutPreview = null;
}

async function refreshUI(){
  const [canvasMod, partsMod, reportMod, statusMod, paramsMod] = await Promise.all([
    import('./canvas.js'),
    import('./parts.js'),
    import('./report.js'),
    import('./part-status.js'),
    import('./params.js'),
  ]);
  try { partsMod.renderPartsTable(); } catch(_){}
  try { partsMod.renderJobSelect(); } catch(_){}
  try { statusMod.refreshPartsStatus(); } catch(_){}
  try { canvasMod.draw(); } catch(_){}
  try { reportMod.updateReport(); } catch(_){}
  try { paramsMod.renderProfileSelect(); } catch(_){}
  try { paramsMod.updateActiveProfileFromFields && paramsMod.updateActiveProfileFromFields(); } catch(_){}
}

export function updateButtons(){
  const job = getActiveJob();
  const undoBtn = document.getElementById('btnUndo');
  const redoBtn = document.getElementById('btnRedo');
  if(!undoBtn || !redoBtn) return;
  const h = job && job._history;
  undoBtn.disabled = !(h && h.index > 0);
  redoBtn.disabled = !(h && h.index < h.stack.length - 1);
}

function isUndoShortcut(e){
  const isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'я';
  return isZ && !e.shiftKey;
}
function isRedoShortcut(e){
  const isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'я';
  const isY = e.code === 'KeyY' || e.key === 'y' || e.key === 'н';
  return (isZ && e.shiftKey) || isY;
}

function isTextField(el){
  if(!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if(tag === 'textarea') return true;
  if(tag === 'input'){
    const type = (el.type || 'text').toLowerCase();
    return ['text','search','email','url','password','tel'].includes(type);
  }
  if(el.isContentEditable) return true;
  return false;
}

export function bindHistoryUI(){
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if(u) u.addEventListener('click', undo);
  if(r) r.addEventListener('click', redo);

  document.addEventListener('keydown', e => {
    if(!(e.ctrlKey || e.metaKey)) return;
    if(isTextField(e.target)) return;

    if(isUndoShortcut(e)){
      e.preventDefault();
      undo();
    } else if(isRedoShortcut(e)){
      e.preventDefault();
      redo();
    }
  });

  updateButtons();
}