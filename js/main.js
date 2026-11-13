// js/main.js — точка входа.
import { $, sleep, setStatus } from './utils.js';
import { state, createJob, getActiveJob, HAS_OPEN_PICKER } from './state.js';
import { readParams } from './params.js';
import { nest, computeRemnants } from './nesting.js';
import { nestGA } from './nesting-ga.js';
import { draw, resetCamera } from './canvas.js';
import { updateReport } from './report/report.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory, bindHistoryUI, initHistory } from './history.js';
import { collectFixedSeeds, buildPoolParts } from './fixing.js';
import { showProgress, hideProgress, setProgress, isCancelRequested } from './progress.js';
import { bindCutUI } from './canvas-cut.js';
import {
  loadProfiles, getActiveProfile, applyParams, renderProfileSelect,
  bindProfileUI, updateGaParamsUI, updateStockDxfUI, updateStockMiniInfo,
} from './params.js';
import { bindPartsUI, bindJobUI, renderPartsTable, renderJobSelect } from './parts.js';
import { bindAutofitUI } from './autofit.js';
import { bindDxfExportUI } from './dxf-export.js';
import { bindExportsUI } from './exports.js';
import { bindArrayUI } from './array.js';
import { bindFixingUI } from './fixing.js';
import { bindRemnantCatalogUI } from './remnant-catalog.js';
import { initProjectIO } from './project-io.js';
import { initAutosave } from './autosave.js';
import { initUI } from './ui.js';
import { initDialogs } from './dialogs/dialogs.js'; 
import { installProjectHooks } from './project-hooks.js';
import { bindLayersUI } from './layers.js';
import { initSplash } from './splash.js';

function initNestRunner() {
  const btnNest = $('btnNest');
  if (!btnNest) return;
  btnNest.title = '▶ Разложить (F7)';

  btnNest.addEventListener('click', async () => {
    if (!state.parts.length) { alert('Добавьте хотя бы один DXF'); return; }
    if (state.sheets.some(sh => sh.cuts && sh.cuts.length)) {
      if (!confirm('Внимание: при новой раскладке все резы листа будут удалены. Продолжить?')) return;
    }

    const originalText = btnNest.textContent;
    btnNest.disabled = true;
    btnNest.textContent = '⏳ 0%';
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

      const onProg = (pct, txt) => {
        setProgress(pct, txt);
        if (pct < 1) btnNest.textContent = `⏳ ${Math.round(pct * 100)}%`;
        else btnNest.textContent = originalText;
      };
	  import('./cut-order.js').then(m => m.assignCutOrderAllSheets());

      let result;
      if (params.strategy === 'genetic' && !hasFixed) {
        result = await nestGA(state.parts, params, onProg, shouldStop);
      } else {
        const strategy = params.strategy === 'genetic' ? 'area' : params.strategy;
        result = await nest(nestParts, params, onProg, strategy, seeds.length ? seeds : undefined, shouldStop);
      }

      if ((result && result.cancelled) || isCancelRequested()) {
        setStatus('Раскладка отменена');
        return;
      }

      const { sheets, unplaced } = result;
      computeRemnants(sheets, params);
      const dt = (performance.now() - t0).toFixed(0);

      state.sheets = sheets;
	  import('./cut-order.js').then(m => m.assignCutOrderAllSheets());
      state.selectedPart = null;
      state.selectedParts = [];
      state.measurements = [];
      state.measurePoints = [];
      state.measurePreview = null;
      state.cutMode = false;
      state.cutPoints = [];
      state.cutPreview = null;
      state.remnantMode = false;
      state.remnantPreview = null;
      state.pendingEmptySelection = null;

      resetCamera();
      const job = getActiveJob();
      if (job) job.paramsSnapshot = { ...params };

      setProgress(1, 'Готово');
      updateReport(unplaced, dt);

      const stratInfo = result.strategyUsed ? ` · ${result.strategyUsed}` : '';
      const placedTotal = sheets.reduce((s, sh) => s + sh.placed.length, 0);
      const baseMsg = unplaced.length
          ? `Не поместилось ${unplaced.length} дет. (лимит ${params.maxSheets} л.)`
          : `Готово · ${placedTotal} дет. на ${sheets.length} л.`;
      setStatus(baseMsg + stratInfo);

      draw();
      refreshPartsStatus();
      await sleep(250);
      pushHistory();
    } catch (err) {
      setStatus('');
      alert('Ошибка: ' + err.message);
    } finally {
      hideProgress();
      btnNest.disabled = false;
      btnNest.textContent = originalText;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'F7') return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    if (btnNest && !btnNest.disabled) btnNest.click();
  });
}

function safeBind(name, fn) {
  try { fn(); console.log(`[init] ✓ ${name}`); }
  catch (e) { console.error(`[init] ✗ ${name}:`, e); }
}

try {
  loadProfiles();
  const initP = getActiveProfile();
  if (initP) { try { applyParams(initP.params); } catch (_) {} }
  renderProfileSelect();
} catch (e) { console.error('Ошибка инициализации профилей:', e); }

if (!state.jobs.length) createJob('Задание №1');
try { initHistory(); } catch (e) { console.error('initHistory:', e); }

safeBind('bindProfileUI',        bindProfileUI);
safeBind('bindPartsUI',          bindPartsUI);
safeBind('bindJobUI',            bindJobUI);
safeBind('bindAutofitUI',        bindAutofitUI);
safeBind('bindDxfExportUI',      bindDxfExportUI);
safeBind('bindExportsUI',        bindExportsUI);
safeBind('bindArrayUI',          bindArrayUI);
safeBind('bindFixingUI',         bindFixingUI);
safeBind('bindRemnantCatalogUI', bindRemnantCatalogUI);
safeBind('bindLayersUI',         bindLayersUI);
safeBind('initUI',               initUI);
safeBind('initDialogs',          initDialogs);
safeBind('initNestRunner',       initNestRunner);
safeBind('installProjectHooks',  installProjectHooks);
safeBind('initProjectIO',        initProjectIO);
safeBind('initAutosave',         initAutosave);
safeBind('bindHistoryUI',        bindHistoryUI);
safeBind('bindCutUI',            bindCutUI);

try { updateGaParamsUI(); } catch (_) {}
try { updateStockDxfUI(); } catch (_) {}
try { updateStockMiniInfo(); } catch (_) {}

import('../GsCAM/uicam.js')
  .then(m => { if (m && typeof m.bindGsCamUI === 'function') m.bindGsCamUI(); })
  .catch(err => console.error('[init] ✗ GsCAM не подключён:', err));

try { renderJobSelect(); } catch (e) { console.error('renderJobSelect:', e); }
try { renderPartsTable(); } catch (e) { console.error('renderPartsTable:', e); }
try { draw(); } catch (e) { console.error('draw:', e); }

if (typeof DxfParser === 'undefined') {
  window.addEventListener('load', () => setStatus('⚠ Не удалось загрузить dxf-parser.'));
}
if (!HAS_OPEN_PICKER) setStatus('⚠ Запоминание папки — только Chrome/Edge.');

console.log('[init] Приложение запущено');
// ═══ ВРЕМЕННАЯ ВСТАВКА КНОПКИ CSV В МЕНЮ ОТЧЁТОВ ═══
setTimeout(() => {
  const btnReports = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Отчёты'));
  
  if (btnReports) {
    btnReports.addEventListener('click', () => {
      // Ждем 50 мс, пока меню отрисуется
      setTimeout(() => {
        // Ищем выпадающее меню (оно появляется в body)
        const menus = document.querySelectorAll('body > div');
        for (const menu of menus) {
          if (menu.style.display === 'block' && menu.textContent.includes('HTML-плеер')) {
            // Проверяем, нет ли уже нашей кнопки, чтобы не дублировать
            if (menu.querySelector('.csv-injected')) return;

            const csvBtn = document.createElement('div');
            csvBtn.className = menu.querySelector('.dropdown-item, button')?.className || '';
            csvBtn.classList.add('csv-injected');
            csvBtn.style.cssText = 'display:flex; align-items:center; gap:12px; padding:8px 14px; cursor:pointer; border-top:1px solid #eee;';
            csvBtn.innerHTML = `
              <span style="font-size:20px; width:24px; text-align:center;">📊</span>
              <div style="flex:1;">
                <b style="display:block; font-size:13px; color:#004a99;">Экспорт в CSV</b>
                <div style="font-size:11px; color:#888;">— Спецификация для Excel</div>
              </div>
            `;
            csvBtn.onclick = () => {
              import('./report/report-csv.js').then(m => m.exportSpecToCSV());
              menu.style.display = 'none';
            };
            menu.appendChild(csvBtn);
          }
        }
      }, 50);
    });
  }
}, 1000);

initSplash();