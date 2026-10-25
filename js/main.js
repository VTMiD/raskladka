import { $, sleep, setStatus } from './utils.js';
import { state, HAS_OPEN_PICKER, HAS_SAVE_PICKER, createJob, getActiveJob } from './state.js';
import { loadProfiles, getActiveProfile, applyParams, renderProfileSelect, bindProfileUI, readParams, updateGaParamsUI, updateStockDxfUI, updateStockMiniInfo } from './params.js';
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
    setStatus(unplaced.length ? `Не поместилось ${unplaced.length} дет. (лимит ${params.maxSheets} л.)` : 'Готово');
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