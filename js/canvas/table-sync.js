// js/canvas/table-sync.js
import { state } from '../state.js';

let _lastScrolledPlacement = '';

function scrollTableToRow(partIdx, placementKey) {
  if (placementKey === _lastScrolledPlacement) return;
  _lastScrolledPlacement = placementKey;
  setTimeout(() => {
    const wrap = document.getElementById('partsTableWrap');
    if (!wrap) return;
    const tr = wrap.querySelector(`tr[data-row="${partIdx}"]`);
    if (!tr) return;
    try { tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(_){}
    tr.classList.add('flash-scroll');
    setTimeout(() => tr.classList.remove('flash-scroll'), 1200);
  }, 0);
}

export function syncTableScrollToCanvasSelection() {
  if (state.selectedPart) {
    const sp = state.selectedPart;
    const sh = state.sheets[sp.sheetIdx];
    const pl = sh && sh.placed && sh.placed[sp.placedIdx];
    if (pl && Number.isInteger(pl.partIdx)) {
      scrollTableToRow(pl.partIdx, sp.sheetIdx + ':' + sp.placedIdx);
    }
    return;
  }
  if (state.selectedParts && state.selectedParts.length) {
    const sp = state.selectedParts[0];
    const sh = state.sheets[sp.sheetIdx];
    const pl = sh && sh.placed && sh.placed[sp.placedIdx];
    if (pl && Number.isInteger(pl.partIdx)) {
      scrollTableToRow(pl.partIdx, sp.sheetIdx + ':' + sp.placedIdx);
    }
    return;
  }
  _lastScrolledPlacement = '';
}

export function syncTableHighlightToCanvasSelection() {
  const hasSel = !!state.selectedPart || (state.selectedParts && state.selectedParts.length > 0);

  if (!hasSel) {
    if (state._selectedRowsFromCanvas) {
      state._selectedRowsFromCanvas = false;
      if (state.selectedRows && state.selectedRows.size) {
        state.selectedRows.clear();
        setTimeout(() => {
          import('../parts.js').then(m => m.updateSelectionUI()).catch(() => {});
        }, 0);
      }
    }
    return;
  }

  const expectedRows = new Set();
  if (state.selectedPart) {
    const sh = state.sheets[state.selectedPart.sheetIdx];
    const pl = sh && sh.placed && sh.placed[state.selectedPart.placedIdx];
    if (pl && Number.isInteger(pl.partIdx)) expectedRows.add(pl.partIdx);
  }
  for (const sp of state.selectedParts || []) {
    const sh = state.sheets[sp.sheetIdx];
    const pl = sh && sh.placed && sh.placed[sp.placedIdx];
    if (pl && Number.isInteger(pl.partIdx)) expectedRows.add(pl.partIdx);
  }
  if (!expectedRows.size) return;

  let same = expectedRows.size === state.selectedRows.size;
  if (same) {
    for (const v of expectedRows) {
      if (!state.selectedRows.has(v)) { same = false; break; }
    }
  }

  if (!same || !state._selectedRowsFromCanvas) {
    state.selectedRows.clear();
    for (const v of expectedRows) state.selectedRows.add(v);
    state._selectedRowsFromCanvas = true;
    setTimeout(() => {
      import('../parts.js').then(m => m.updateSelectionUI()).catch(() => {});
    }, 0);
  }
}