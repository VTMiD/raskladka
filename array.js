import { $ } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { rotatePart } from './geometry.js';
import { draw } from './canvas.js';
import { updateReport } from './report.js';
import { setStatus } from './utils.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory } from './history.js';

// ─── Модальное окно ───

const MODAL_ID = 'arrayModal';

export function openArrayModal() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  populatePartSelect();
  applyArrayBySheetUI();
  updateArrayPreview();
  modal.classList.add('active');
}

export function closeArrayModal() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  modal.classList.remove('active');
  clearPreview();
}

// ─── UI ───

function populatePartSelect() {
  const sel = $('arrayPartSelect');
  if (!sel) return;
  sel.innerHTML = '';
  if (!state.parts.length) {
    sel.innerHTML = '<option value="">— нет деталей —</option>';
    return;
  }
  const seen = new Set();
  for (let i = 0; i < state.parts.length; i++) {
    const p = state.parts[i];
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const opt = document.createElement('option');
    opt.value = i.toString();
    opt.textContent = `${p.name} (${p.width.toFixed(1)}×${p.height.toFixed(1)})`;
    sel.appendChild(opt);
  }
}

function computeAutoGrid(partIdx, spacingX, spacingY, angle) {
  const part = state.parts[partIdx];
  if (!part) return null;
  const params = readParams();
  const W = Math.max(0, params.sheetW - 2 * params.edge);
  const H = Math.max(0, params.sheetH - 2 * params.edge);
  const variant = rotatePart(part, angle);
  const w = variant.w;
  const h = variant.h;
  const cols = w > 1e-6 ? Math.max(1, Math.floor((W + spacingX) / (w + spacingX) + 1e-6)) : 1;
  const rows = h > 1e-6 ? Math.max(1, Math.floor((H + spacingY) / (h + spacingY) + 1e-6)) : 1;
  return { rows, cols };
}

function getArraySettings() {
  const sel = $('arrayPartSelect');
  const partIdx = sel && sel.value !== '' ? parseInt(sel.value, 10) : -1;
  if (partIdx < 0 || partIdx >= state.parts.length) return null;

  const spacingX = Math.max(0, parseFloat($('arraySpacingX')?.value) || 0);
  const spacingY = Math.max(0, parseFloat($('arraySpacingY')?.value) || 0);
  const angle = parseInt($('arrayAngle')?.value, 10) || 0;
  const bySheet = !!$('arrayBySheet')?.checked;

  let rows, cols;
  if (bySheet) {
    const auto = computeAutoGrid(partIdx, spacingX, spacingY, angle);
    if (!auto) return null;
    rows = auto.rows;
    cols = auto.cols;
    const rowsEl = $('arrayRows');
    const colsEl = $('arrayCols');
    if (rowsEl) rowsEl.value = rows;
    if (colsEl) colsEl.value = cols;
  } else {
    rows = Math.max(1, parseInt($('arrayRows')?.value, 10) || 1);
    cols = Math.max(1, parseInt($('arrayCols')?.value, 10) || 1);
  }

  return { partIdx, rows, cols, spacingX, spacingY, angle, bySheet };
}

function applyArrayBySheetUI() {
  const bySheet = !!$('arrayBySheet')?.checked;
  const rowsEl = $('arrayRows');
  const colsEl = $('arrayCols');
  for (const el of [rowsEl, colsEl]) {
    if (el) el.disabled = bySheet;
  }
}

function generateArrayPositions(settings) {
  const { partIdx, rows, cols, spacingX, spacingY, angle } = settings;
  const part = state.parts[partIdx];
  if (!part) return null;

  const variant = rotatePart(part, angle);
  const { polygons } = variant;
  const w = variant.w;
  const h = variant.h;

  const positions = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (w + spacingX);
      const y = row * (h + spacingY);
      positions.push({
        x, y,
        polygons: polygons.map(r => r.map(([px, py]) => [px, py])),
        bbox: [x, y, x + w, y + h],
        w, h
      });
    }
  }
  return positions;
}

// ─── Проверка коллизий массива с уже размещёнными деталями ───
function arrayCollides(sheet, positions, buffer) {
  for (const pos of positions) {
    for (const other of sheet.placed) {
      const ob = other.bbox;
      if (pos.bbox[0] >= ob[2] + buffer) continue;
      if (pos.bbox[2] + buffer <= ob[0]) continue;
      if (pos.bbox[1] >= ob[3] + buffer) continue;
      if (pos.bbox[3] + buffer <= ob[1]) continue;
      return true;
    }
  }
  return false;
}

// ─── Предпросмотр ───

function updateArrayPreview() {
  const settings = getArraySettings();
  if (!settings) {
    clearPreview();
    updatePreviewInfo(null);
    return;
  }

  const positions = generateArrayPositions(settings);
  if (!positions || !positions.length) {
    clearPreview();
    updatePreviewInfo(null);
    return;
  }

  state.arrayPreview = {
    settings,
    positions,
    partIdx: settings.partIdx,
  };

  updatePreviewInfo(positions);
  draw();
}

function clearPreview() {
  if (state.arrayPreview) {
    state.arrayPreview = null;
    draw();
  }
  updatePreviewInfo(null);
}

function updatePreviewInfo(positions) {
  const el = $('arrayPreviewInfo');
  if (!el) return;
  if (!positions || !positions.length) {
    el.textContent = '—';
    el.className = '';
    return;
  }
  const total = positions.length;
  const last = positions[positions.length - 1];
  const totalW = last.x + last.w;
  const totalH = last.y + last.h;
  const settings = state.arrayPreview && state.arrayPreview.settings;
  const rc = settings ? ` (${settings.rows}×${settings.cols})` : '';
  el.textContent = `Деталей: ${total}${rc} · Габарит массива: ${totalW.toFixed(0)} × ${totalH.toFixed(0)} мм`;
  el.className = 'preview-ok';
}

// ─── Размещение ───

function placeArrayOnSheet() {
  if (!state.arrayPreview) {
    setStatus('Нет предпросмотра — настройте массив');
    return;
  }

  if (!state.sheets.length) {
    alert('Сначала выполните раскладку (нажмите «Разложить»), чтобы были листы для размещения.');
    return;
  }

  const settings = state.arrayPreview.settings;
  const partIdx = settings.partIdx;
  const positions = state.arrayPreview.positions;
  const params = readParams();
  const W = params.sheetW - 2 * params.edge;
  const H = params.sheetH - 2 * params.edge;
  const buffer = params.kerf + params.gap;

  // 1. Проверка выхода за границы
  let outOfBounds = false;
  for (const pos of positions) {
    if (pos.x + pos.w > W + 1e-3 || pos.y + pos.h > H + 1e-3) {
      outOfBounds = true;
      break;
    }
  }
  if (outOfBounds) {
    if (!confirm(`Массив выходит за границы рабочей области листа (${W.toFixed(0)}×${H.toFixed(0)} мм). Всё равно разместить?`)) {
      setStatus('Размещение отменено — массив слишком велик');
      return;
    }
  }

  // 2. Ищем лист, куда массив встаёт без наложений
  let targetSheet = -1;
  for (let si = 0; si < state.sheets.length; si++) {
    if (!arrayCollides(state.sheets[si], positions, buffer)) {
      targetSheet = si;
      break;
    }
  }

  // 3. Если ни один не подошёл — предлагаем наименее занятый
  if (targetSheet < 0) {
    let emptiest = 0;
    let minPlaced = Infinity;
    for (let si = 0; si < state.sheets.length; si++) {
      const n = state.sheets[si].placed.length;
      if (n < minPlaced) { minPlaced = n; emptiest = si; }
    }
    if (!confirm(`Массив накладывается на существующие детали на всех листах. Разместить на листе ${emptiest + 1} всё равно?`)) {
      setStatus('Размещение отменено');
      return;
    }
    targetSheet = emptiest;
  }

  const sheet = state.sheets[targetSheet];
  let placed = 0;
  for (const pos of positions) {
    sheet.placed.push({
      partIdx,
      polygons: pos.polygons,
      x: pos.x,
      y: pos.y,
      bbox: [...pos.bbox],
      _fromArray: true,
    });
    placed++;
  }

  closeArrayModal();
  draw();
  updateReport();
  refreshPartsStatus();
  setStatus(`Массив размещён: ${placed} копий «${state.parts[partIdx]?.name || ''}» на листе ${targetSheet + 1}`);
  pushHistory();
}

// ─── Привязка UI ───

export function bindArrayUI() {
  $('btnOpenArray').addEventListener('click', openArrayModal);

  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;

  const closeBtn = document.getElementById('btnCloseArray');
  const closeBtn2 = document.getElementById('btnCloseArray2');
  const cancelBtn = document.getElementById('btnArrayCancel');

  if (closeBtn) closeBtn.addEventListener('click', closeArrayModal);
  if (closeBtn2) closeBtn2.addEventListener('click', closeArrayModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeArrayModal);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeArrayModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeArrayModal();
  });

  const triggerFields = ['arrayPartSelect', 'arrayRows', 'arrayCols', 'arraySpacingX', 'arraySpacingY', 'arrayAngle'];
  for (const id of triggerFields) {
    const el = $(id);
    if (el) {
      el.addEventListener('change', updateArrayPreview);
      el.addEventListener('input', updateArrayPreview);
    }
  }

  const bySheetEl = $('arrayBySheet');
  if (bySheetEl) {
    bySheetEl.addEventListener('change', () => {
      applyArrayBySheetUI();
      updateArrayPreview();
    });
  }

  const placeBtn = document.getElementById('btnArrayPlace');
  if (placeBtn) placeBtn.addEventListener('click', placeArrayOnSheet);
}