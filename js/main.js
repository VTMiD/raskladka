import { $, sleep, setStatus } from './utils.js';
import { state, HAS_OPEN_PICKER, HAS_SAVE_PICKER, createJob, getActiveJob, profilesStore } from './state.js';
import { loadProfiles, getActiveProfile, applyParams, renderProfileSelect, bindProfileUI, readParams, updateGaParamsUI, updateStockDxfUI, updateStockMiniInfo, saveProfiles } from './params.js';
import { nest, computeRemnants } from './nesting.js';
import { nestGA } from './nesting-ga.js';
import { bindPartsUI, bindJobUI, renderPartsTable, renderJobSelect } from './parts.js';
import { bindAutofitUI, closeAutofitModal } from './autofit.js';
import { updateReport, openReportModal, closeReportModal, doPrint, buildReportHtml, buildLayoutHtml } from './report.js';
import { bindDxfExportUI } from './dxf-export.js';
import { bindExportsUI } from './exports.js';
import { printLabels } from './labels.js';
import { bindArrayUI } from './array.js';
import { bindFixingUI, collectFixedSeeds, buildPoolParts } from './fixing.js';
import { showProgress, hideProgress, setProgress, requestCancel, isCancelRequested } from './progress.js';
import { refreshPartsStatus } from './part-status.js';
import { draw, enterMeasureMode, exitMeasureMode, enterGroupSelectMode, exitGroupSelectMode } from './canvas.js';
import { bindCutUI } from './canvas-cut.js';
import { initHistory, bindHistoryUI, schedulePush, flushScheduledPush, pushHistory } from './history.js';
import { parseDxfText } from './dxf-import.js';
import { initProjectIO } from './project-io.js';

const STOCK_COLLAPSED_KEY = 'raskladka.stockCollapsed.v1';

function applyStockCollapsed(collapsed){
  const group = document.getElementById('stockGroup');
  const btn = document.getElementById('btnToggleStock');
  if(!group) return;
  group.classList.toggle('collapsed', !!collapsed);
  if(btn){
    btn.textContent = collapsed ? '▸' : '▾';
    btn.title = collapsed ? 'Развернуть заготовку' : 'Свернуть заготовку';
  }
  if(collapsed) { try { updateStockMiniInfo(); } catch(_){} }
  try { localStorage.setItem(STOCK_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch(_){}
}

function initStockCollapse(){
  const btn = document.getElementById('btnToggleStock');
  if(!btn) return;
  let collapsed = false;
  try { collapsed = localStorage.getItem(STOCK_COLLAPSED_KEY) === '1'; } catch(_){}
  applyStockCollapsed(collapsed);
  btn.addEventListener('click', () => {
    const group = document.getElementById('stockGroup');
    if(!group) return;
    applyStockCollapsed(!group.classList.contains('collapsed'));
  });
}

let activeHelpBtn = null, activeHelpTip = null;
function closeHelpTip(){
  if(activeHelpTip){ activeHelpTip.remove(); activeHelpTip = null; }
  if(activeHelpBtn){ activeHelpBtn.classList.remove('active'); activeHelpBtn = null; }
}
function openHelpTip(btn){
  closeHelpTip();
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  tip.textContent = btn.dataset.help;
  document.body.appendChild(tip);
  const r = btn.getBoundingClientRect();
  let left = r.left;
  if(left + tip.offsetWidth > window.innerWidth - 10) left = window.innerWidth - tip.offsetWidth - 10;
  tip.style.left = left + 'px';
  tip.style.top = (r.bottom + 8) + 'px';
  btn.classList.add('active');
  activeHelpBtn = btn; activeHelpTip = tip;
}
document.querySelectorAll('.help-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if(activeHelpBtn === btn) closeHelpTip();
    else openHelpTip(btn);
  });
});
document.addEventListener('click', () => closeHelpTip());
window.addEventListener('resize', () => closeHelpTip());
window.addEventListener('scroll', () => closeHelpTip(), true);

$('btnOpenReport').addEventListener('click', openReportModal);
$('btnCloseReport').addEventListener('click', closeReportModal);
$('btnCloseReport2').addEventListener('click', closeReportModal);
$('reportModal').addEventListener('click', e => { if(e.target === $('reportModal')) closeReportModal(); });
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && $('reportModal').classList.contains('active')) closeReportModal();
});

$('btnNest').addEventListener('click', async () => {
  if(!state.parts.length){ alert('Добавьте хотя бы один DXF'); return; }
  if(state.sheets.some(sh => sh.cuts && sh.cuts.length)){
    if(!confirm('Внимание: при новой раскладке все резы листа будут удалены. Продолжить?')) return;
  }
  const btn = $('btnNest');
  btn.disabled = true;
  setStatus('');
  setProgress(0, 'Подготовка...');
  showProgress();
  await sleep(60);
  try {
    const params = readParams();
    const t0 = performance.now();
    const seeds = collectFixedSeeds();
    const hasFixed = seeds.some(s => s.placed.length > 0);
    const nestParts = hasFixed ? buildPoolParts(seeds) : state.parts;
    const shouldStop = () => isCancelRequested();
    let result;
    if(params.strategy === 'genetic' && !hasFixed){
      result = await nestGA(state.parts, params, setProgress, shouldStop);
    } else {
      const strategy = params.strategy === 'genetic' ? 'area' : params.strategy;
      result = await nest(nestParts, params, setProgress, strategy, hasFixed ? seeds : undefined, shouldStop);
    }

    if((result && result.cancelled) || isCancelRequested()){
      setStatus('Раскладка отменена');
      return;
    }

    const { sheets, unplaced } = result;
    computeRemnants(sheets, params);
    const dt = (performance.now() - t0).toFixed(0);
    state.sheets = sheets;
    state.selectedPart = null;
    state.selectedParts = [];
    state.measurements = [];
    state.measurePoints = [];
    state.measurePreview = null;
    state.cutMode = false;
    state.cutPoints = [];
    state.cutPreview = null;

    const job = getActiveJob();
    if(job) job.paramsSnapshot = { ...params };

    setProgress(1, 'Готово');
    updateReport(unplaced, dt);

    const stratInfo = result.strategyUsed ? ` · ${result.strategyUsed}` : '';
    const baseMsg = unplaced.length
      ? `Не поместилось ${unplaced.length} дет. (лимит ${params.maxSheets} л.)`
      : `Готово · ${sheets.reduce((s, sh) => s + sh.placed.length, 0)} дет. на ${sheets.length} л.`;
    setStatus(baseMsg + stratInfo);

    draw();
    refreshPartsStatus();
    await sleep(250);
    pushHistory();
  } catch(err){
    setStatus('');
    alert('Ошибка: ' + err.message);
  } finally {
    hideProgress();
    btn.disabled = false;
  }
});

document.addEventListener('keydown', e => {
  if(e.key !== 'F7') return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if(tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
  e.preventDefault();
  const btn = $('btnNest');
  if(btn && !btn.disabled) btn.click();
});

$('btnPrintReport').addEventListener('click', () => {
  if(!state.parts.length){ alert('Сначала добавьте детали'); return; }
  if(!state.sheets.length){
    if(!confirm('Раскладка не выполнена. Напечатать отчёт только по заданию (план)?')) return;
  }
  doPrint(buildReportHtml(), 'portrait');
});

$('btnPrintLayout').addEventListener('click', () => {
  if(!state.sheets.length){ alert('Сначала нажмите «Разложить»'); return; }
  doPrint(buildLayoutHtml(), 'landscape');
});

$('btnPrintLabels').addEventListener('click', printLabels);

try {
  loadProfiles();
  const initP = getActiveProfile();
  if(initP){ try { applyParams(initP.params); } catch(_){} }
  renderProfileSelect();
} catch(e){ console.error('Ошибка инициализации профилей:', e); }

if(!state.jobs.length){
  createJob('Задание №1');
}

initHistory();

bindProfileUI();
bindPartsUI();
bindJobUI();
bindAutofitUI();
bindDxfExportUI();
bindExportsUI();
bindArrayUI();
bindFixingUI();
bindHistoryUI();
bindCutUI();

$('btnCancelNest')?.addEventListener('click', () => requestCancel());

// ===== Линейка =====
const btnMeasure = document.getElementById('btnMeasure');
if(btnMeasure){
  btnMeasure.addEventListener('click', () => {
    if(state.measureMode) exitMeasureMode();
    else enterMeasureMode();
  });
}
const btnMeasureClear = document.getElementById('btnMeasureClear');
if(btnMeasureClear){
  btnMeasureClear.addEventListener('click', () => {
    state.measurements = [];
    state.measurePoints = [];
    state.measurePreview = null;
    draw();
    setStatus('Измерения очищены');
  });
}

// ===== Групповое выделение рамкой =====
const btnSelectFrame = document.getElementById('btnSelectFrame');
if(btnSelectFrame){
  btnSelectFrame.addEventListener('click', () => {
    if(state.groupSelectMode) exitGroupSelectMode();
    else enterGroupSelectMode();
  });
}

// ===== Режим дублирования перетаскиванием =====
let duplicateModeActive = false;

function syncDuplicateButton(){
  const btn = $('btnDuplicateSelected');
  if(!btn) return;
  if(duplicateModeActive){
    btn.classList.add('active');
    btn.title = 'Режим дублирования активен (Esc — выход)';
  } else {
    btn.classList.remove('active');
    btn.title = 'Дублировать выделенные детали (Ctrl+D)';
  }
}

function exitDuplicateMode(){
  duplicateModeActive = false;
  state.duplicateMode = false;
  state.duplicateGhost = null;
  state.duplicateSource = null;
  const canvas = document.getElementById('canvas');
  if(canvas) canvas.style.cursor = '';
  syncDuplicateButton();
  draw();
  setStatus('');
}

function enterDuplicateMode(){
  const hasSel = (state.selectedParts && state.selectedParts.length) || state.selectedPart;
  if(!hasSel){
    setStatus('Сначала выделите детали для дублирования');
    return;
  }
  duplicateModeActive = true;
  state.duplicateMode = true;

  const sel = (state.selectedParts && state.selectedParts.length)
    ? state.selectedParts.map(sp => ({ sheetIdx: sp.sheetIdx, placedIdx: sp.placedIdx }))
    : [{ sheetIdx: state.selectedPart.sheetIdx, placedIdx: state.selectedPart.placedIdx }];

  import('./canvas-ops.js').then(m => {
    if(m && typeof m.startDuplicateDragFromSelection === 'function'){
      m.startDuplicateDragFromSelection(sel);
      draw();
    }
  });

  syncDuplicateButton();
  const n = sel.length;
  setStatus(`Режим дублирования (${n} дет.): ведите мышь по холсту, клик+отпускание — копия. Esc — выход.`);
}

function onDuplicateButtonClick(){
  if(!duplicateModeActive){
    enterDuplicateMode();
  } else {
    setStatus('Режим дублирования активен: ведите мышь, клик+отпускание — копия. Esc — выход.');
  }
}

const btnDuplicateSelected = $('btnDuplicateSelected');
if(btnDuplicateSelected){
  btnDuplicateSelected.addEventListener('click', onDuplicateButtonClick);
}

document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && duplicateModeActive){
    if(state.duplicateGhost){
      e.preventDefault();
      e.stopPropagation();
      import('./canvas-ops.js').then(m => m.cancelDuplicateDrag && m.cancelDuplicateDrag());
      setStatus('Копия отменена. Продолжайте перетаскивать или Esc — выход.');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    exitDuplicateMode();
  }
}, true);

document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В')){
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    onDuplicateButtonClick();
  }
});

try { updateGaParamsUI(); } catch(_){}
try { updateStockDxfUI(); } catch(_){}
try { updateStockMiniInfo(); } catch(_){}
try { initStockCollapse(); } catch(e){ console.error('initStockCollapse:', e); }

if(typeof DxfParser === 'undefined'){
  window.addEventListener('load', () => setStatus('⚠ Не удалось загрузить dxf-parser. Проверьте интернет.'));
}
if(!HAS_OPEN_PICKER) setStatus('⚠ Запоминание папки — только Chrome/Edge.');

renderJobSelect();
renderPartsTable();
draw();

const UNDO_PARAM_FIELDS = [
  'inW','inH','inThick','inEdge','inKerf','inGap','inRot',
  'inMaxSheets','inRemnantOn','inRemnantMin','inSnapThreshold','inGridStep',
];
for(const id of UNDO_PARAM_FIELDS){
  const el = $(id); if(!el) continue;
  const onChange = () => schedulePush(500);
  el.addEventListener('input', onChange);
  el.addEventListener('change', onChange);
  el.addEventListener('blur', () => flushScheduledPush());
}

// ============================================================================
//                    СОХРАНЕНИЕ / ЗАГРУЗКА ПРОЕКТА
// ============================================================================
// Контракт с project-io.js: window.ProjectHooks = { collect(), restore(s) }
//
// Сохраняется:
//   • Все профили заготовок (лист + контур DXF)
//   • Активный профиль
//   • Все задания со всеми деталями (имя, qty, bbox, ИСХОДНЫЙ ТЕКСТ DXF)
//   • Раскладка каждого задания (позиции, поворот, зеркало, резы, отход)
//   • Измерения (линейка)
// ============================================================================

function collectPartForSave(p){
  const rec = {
    name:     p.name,
    qty:      p.qty,
    dxfText:  p.dxfText || null,
    bbox:     p.bbox || null,
    area:     p.area || 0,
    width:    p.width || 0,
    height:   p.height || 0,
    length:   p.length || 0,
  };
  // Fallback: если исходного текста нет (старый формат), сохраняем геометрию
  if(!p.dxfText && Array.isArray(p.polygons)){
    rec.polygons = p.polygons;
  }
  return rec;
}

function collectSheetForSave(s){
  return {
    placed: (s.placed || []).map(pl => ({
      partIdx:        pl.partIdx,
      polygons:       pl.polygons || [],
      x:              pl.x || 0,
      y:              pl.y || 0,
      bbox:           pl.bbox || [0,0,0,0],
      _fixed:         !!pl._fixed,
      _manual:        !!pl._manual,
      _fromArray:     !!pl._fromArray,
      _fromDuplicate: !!pl._fromDuplicate,
    })),
    cuts:     Array.isArray(s.cuts) ? s.cuts.map(c => ({ ...c })) : [],
    remnants: Array.isArray(s.remnants) ? s.remnants.map(r => ({
      type: r.type,
      cut:  { ...r.cut },
      rect: { ...r.rect },
      w: r.w, h: r.h,
    })) : null,
  };
}

function collectProject(){
  let params = {};
  try { params = readParams(); } catch(e){ console.warn('readParams:', e); }

  return {
    params,
    activeProfileId: profilesStore.activeId,
    profiles: profilesStore.profiles.map(p => ({
      id:         p.id,
      name:       p.name,
      nameCustom: !!p.nameCustom,
      params:     { ...(p.params || {}) },
    })),
    stockDxfText: window.stockDxfText || null,
    stockDxfName: window.stockDxfName || null,
    jobs: state.jobs.map(job => ({
      id:             job.id,
      name:           job.name,
      paramsSnapshot: job.paramsSnapshot || null,
      createdAt:      job.createdAt || null,
      parts:  (job.parts || []).map(collectPartForSave),
      sheets: (job.sheets || []).map(collectSheetForSave),
    })),
    activeJobId:  state.activeJobId,
    measurements: (state.measurements || []).map(m => ({
      a: { ...m.a }, b: { ...m.b }
    })),
  };
}

function restorePartFromSave(pd){
  const part = {
    name:     pd.name || 'part.dxf',
    qty:      Math.max(1, +pd.qty || 1),
    dxfText:  pd.dxfText || null,
    bbox:     pd.bbox || null,
    area:     pd.area || 0,
    width:    pd.width || 0,
    height:   pd.height || 0,
    length:   pd.length || 0,
    polygons: Array.isArray(pd.polygons) ? pd.polygons : null,
  };
  // Пере-парсим геометрию из dxfText — приоритет над сохранёнными полигонами
  if(part.dxfText){
    try {
      const parsed = parseDxfText(part.dxfText, part.name);
      part.polygons = parsed.polygons;
      part.bbox     = parsed.bbox     || part.bbox;
      part.area     = parsed.area     || part.area;
      part.width    = parsed.width    || part.width;
      part.height   = parsed.height   || part.height;
      part.length   = parsed.length   || part.length;
    } catch(e){
      console.warn('[ProjectIO] re-parse DXF failed:', part.name, e);
    }
  }
  if(!part.polygons) part.polygons = [];
  return part;
}

function restoreSheetFromSave(sd){
  return {
    placed: (sd.placed || []).map(pl => ({
      partIdx:        pl.partIdx,
      polygons:       pl.polygons || [],
      x:              pl.x || 0,
      y:              pl.y || 0,
      bbox:           pl.bbox || [0,0,0,0],
      _fixed:         !!pl._fixed,
      _manual:        !!pl._manual,
      _fromArray:     !!pl._fromArray,
      _fromDuplicate: !!pl._fromDuplicate,
    })),
    cuts:     Array.isArray(sd.cuts) ? sd.cuts.map(c => ({ ...c })) : [],
    remnants: Array.isArray(sd.remnants) ? sd.remnants.map(r => ({
      type: r.type, cut: { ...r.cut }, rect: { ...r.rect }, w: r.w, h: r.h,
    })) : null,
  };
}

async function restoreProject(s){
  if(!s || typeof s !== 'object') return;

  // 1. Профили (заготовки)
  if(Array.isArray(s.profiles) && s.profiles.length){
    profilesStore.profiles = s.profiles.map(p => ({
      id:         p.id || ('p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6)),
      name:       p.name || 'Профиль',
      nameCustom: !!p.nameCustom,
      params:     p.params || {},
    }));
    profilesStore.activeId = s.activeProfileId || profilesStore.profiles[0].id;
    saveProfiles();
    renderProfileSelect();
  }

  // 2. Параметры текущей заготовки
  if(s.params){
    try { applyParams(s.params); } catch(e){ console.warn('applyParams:', e); }
  }
  try { updateGaParamsUI(); } catch(_){}
  try { updateStockDxfUI(); } catch(_){}

  // 3. Контур заготовки (исходный текст)
  window.stockDxfText = s.stockDxfText || null;
  window.stockDxfName = s.stockDxfName || null;

  // 4. Задания: очищаем и пересоздаём
  const savedJobs = Array.isArray(s.jobs) ? s.jobs : [];
  const activeIdx = s.activeJobId
    ? savedJobs.findIndex(j => j.id === s.activeJobId)
    : 0;

  state.jobs.length = 0;
  state.activeJobId = null;

  for(const jd of savedJobs){
    const job = createJob(jd.name || 'Задание');
    job.paramsSnapshot = jd.paramsSnapshot || null;
    if(jd.createdAt) job.createdAt = jd.createdAt;
    job.parts  = (jd.parts  || []).map(restorePartFromSave);
    job.sheets = (jd.sheets || []).map(restoreSheetFromSave);
  }

  if(!state.jobs.length){
    createJob('Задание №1');
  }

  // 5. Активируем нужное задание (по индексу — ID при загрузке перегенерированы)
  if(activeIdx >= 0 && activeIdx < state.jobs.length){
    state.activeJobId = state.jobs[activeIdx].id;
  } else {
    state.activeJobId = state.jobs[0].id;
  }

  // 6. Измерения
  state.measurements = (s.measurements || []).map(m => ({
    a: { ...m.a }, b: { ...m.b }
  }));

  // 7. Сброс режимов
  state.measurePoints = [];
  state.measurePreview = null;
  state.selectedPart = null;
  state.selectedParts = [];
  state.selectedRows = new Set();
  state.cutMode = false;
  state.cutPoints = [];
  state.cutPreview = null;
  state.duplicateMode = false;
  state.duplicateGhost = null;
  state.duplicateSource = null;
  state.drag = null;
  state.groupDrag = null;
  state.groupSelectDrag = null;
  state.dropPreview = null;
  state.draggedPartIdx = null;

  // 8. Обновляем UI
  renderJobSelect();
  renderPartsTable();
  try { updateReport([], '0'); } catch(_){}
  try { refreshPartsStatus(); } catch(_){}
  try { updateStockDxfUI(); } catch(_){}
  try { updateStockMiniInfo(); } catch(_){}
  draw();
  try { initHistory(); } catch(_){}
  try { pushHistory(); } catch(_){}
}

window.ProjectHooks = {
  collect: collectProject,
  restore: restoreProject,
};

initProjectIO();