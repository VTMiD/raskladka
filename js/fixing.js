import { $, sleep, setStatus } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { nest, computeRemnants } from './nesting.js';
import { draw } from './canvas.js';
import { canvas, screenToWorld } from './canvas-core.js';
import { updateReport } from './report.js';
import { showProgress, hideProgress, setProgress, isCancelRequested } from './progress.js';
import { refreshPartsStatus } from './part-status.js';
import { pushHistory } from './history.js';

function getSelectedPlaced(){
  if(!state.selectedPart) return null;
  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  return sheet ? (sheet.placed[placedIdx] || null) : null;
}

export function collectFixedSeeds(){
  const hasFixed = state.sheets.some(sh => sh.placed.some(pl => pl._fixed));
  const hasObstacles = state.sheets.some(sh => sh.obstacles && sh.obstacles.length);
  if (!hasFixed && !hasObstacles) return [];

  return state.sheets.map(sh => ({
    placed: sh.placed.filter(pl => pl._fixed),
    obstacles: (sh.obstacles || []).map(o => ({ ...o })),
  }));
}

export function buildPoolParts(seeds){
  const fixedCount = {};
  for(const s of seeds) for(const pl of s.placed) fixedCount[pl.partIdx] = (fixedCount[pl.partIdx] || 0) + 1;
  return state.parts.map((p, i) => ({ ...p, qty: Math.max(0, p.qty - (fixedCount[i] || 0)) }));
}

// ─── Поиск запретной зоны под курсором ───
function hitTestObstacle(wx, wy){
  const v = state.view; if(!v) return null;
  const { SW, SH, gapBetween, params } = v;
  for(let si = 0; si < state.sheets.length; si++){
    const sheet = state.sheets[si];
    if(!sheet.obstacles || !sheet.obstacles.length) continue;
    const x0 = si * (SW + gapBetween);
    if(wx < x0 || wx > x0 + SW) continue;
    if(wy < 0 || wy > SH) continue;
    const lx = wx - x0 - params.edge;
    const ly = wy - params.edge;
    for(let oi = 0; oi < sheet.obstacles.length; oi++){
      const o = sheet.obstacles[oi];
      if(lx >= o.x1 && lx <= o.x2 && ly >= o.y1 && ly <= o.y2){
        return { sheetIdx: si, obstacleIdx: oi, rect: o };
      }
    }
  }
  return null;
}

// ─── Клик ЛКМ по запретной зоне → удаляет её ───
// ВАЖНО: слушаем НА window с capture=true — иначе canvas.js,
// зарегистрировавший свой mousedown раньше, "съедает" клик первым
// (на целевом элементе порядок регистрации важнее capture).
window.addEventListener('mousedown', e => {
  if(e.button !== 0) return;
  if(e.target !== canvas) return;
  if(state.cutMode || state.measureMode || state.remnantMode) return;
  if(state.groupSelectMode || state.duplicateMode) return;
  if(!state.sheets.length) return;

  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  if(!w) return;

  const obsHit = hitTestObstacle(w.x, w.y);
  if(!obsHit) return;

  // Попали в зону — блокируем остальные обработчики (canvas.js, контекстное меню и т.п.)
  e.preventDefault();
  e.stopImmediatePropagation();

  // Принудительно закрываем контекстное меню, если было открыто
  const ctxMenu = document.getElementById('contextMenu');
  if(ctxMenu && ctxMenu.style.display !== 'none'){
    ctxMenu.style.display = 'none';
    ctxMenu.innerHTML = '';
  }

  const sheet = state.sheets[obsHit.sheetIdx];
  if(!sheet || !sheet.obstacles) return;

  const r = sheet.obstacles[obsHit.obstacleIdx];
  if(!r) return;
  const wMm = Math.round(r.x2 - r.x1);
  const hMm = Math.round(r.y2 - r.y1);

  sheet.obstacles.splice(obsHit.obstacleIdx, 1);

  draw();
  pushHistory();
  setStatus(`🗑 Запретная зона удалена (${wMm} × ${hMm} мм, лист ${obsHit.sheetIdx + 1}). Ctrl+Z — вернуть`);
}, true); // capture = true на window — срабатывает раньше ВСЕХ обработчиков на canvas

export function fixSelectedToggle(){
  // ─── Если есть запомненная пустая область — создаём запретную зону ───
  if (state.pendingEmptySelection) {
    const { sheetIdx, rect, w, h } = state.pendingEmptySelection;
    const sheet = state.sheets[sheetIdx];
    if (sheet) {
      let hasParts = false;
      for (const pl of sheet.placed) {
        if (pl.bbox[0] < rect.x2 && pl.bbox[2] > rect.x1 &&
            pl.bbox[1] < rect.y2 && pl.bbox[3] > rect.y1) {
          hasParts = true; break;
        }
      }
      if (hasParts) {
        setStatus('⚠ В области есть детали — уберите их или выберите другое место');
        return;
      }
      if (!sheet.obstacles) sheet.obstacles = [];
      sheet.obstacles.push({ ...rect });
      state.pendingEmptySelection = null;
      setStatus(`🚫 Запретная зона: ${Math.round(w)} × ${Math.round(h)} мм`);
      draw();
      pushHistory();
      return;
    }
  }

  // ─── Обычная фиксация деталей ───
  if(state.selectedParts && state.selectedParts.length){
    let anyFixed = false, count = 0;
    for(const sp of state.selectedParts){
      const sheet = state.sheets[sp.sheetIdx];
      const pl = sheet && sheet.placed[sp.placedIdx];
      if(!pl) continue;
      if(pl._fixed) anyFixed = true;
      count++;
    }
    if(!count){ setStatus('Нет деталей для фиксации'); return; }
    const newFixed = !anyFixed;
    for(const sp of state.selectedParts){
      const sheet = state.sheets[sp.sheetIdx];
      const pl = sheet && sheet.placed[sp.placedIdx];
      if(pl) pl._fixed = newFixed;
    }
    draw();
    setStatus(newFixed ? `Зафиксировано: ${count} дет.` : `Фиксация снята: ${count} дет.`);
    pushHistory();
    return;
  }
  const pl = getSelectedPlaced();
  if(!pl){ setStatus('Сначала выделите деталь на холсте'); return; }
  pl._fixed = !pl._fixed;
  draw();
  setStatus(pl._fixed ? 'Деталь зафиксирована 📌' : 'Фиксация снята');
  pushHistory();
}

function unfixAll(){
  let fixedCount = 0;
  for(const sh of state.sheets){
    for(const pl of sh.placed) if(pl._fixed){ pl._fixed = false; fixedCount++; }
  }

  let obstacleCount = 0;
  for(const sh of state.sheets){
    if(sh.obstacles && sh.obstacles.length){
      obstacleCount += sh.obstacles.length;
      sh.obstacles = [];
    }
  }

  draw();

  const parts = [];
  if(fixedCount) parts.push(`фиксация снята с ${fixedCount} дет.`);
  if(obstacleCount) parts.push(`удалено запретных зон: ${obstacleCount}`);

  if(parts.length){
    setStatus('🔓 ' + parts.join(', '));
    pushHistory();
  } else {
    setStatus('Нет зафиксированных деталей и запретных зон');
  }
}

export async function nestRemainder(){
  if(!state.parts.length){ setStatus('Нет деталей'); return; }
  if(!state.sheets.length){ setStatus('Сначала выполните раскладку («Разложить»)'); return; }

  const seeds = collectFixedSeeds();
  const fixedTotal = seeds.reduce((s, sh) => s + sh.placed.length, 0);
  const hasObstacles = seeds.some(sh => sh.obstacles && sh.obstacles.length);

  if(!fixedTotal && !hasObstacles){
    if(!confirm('Зафиксированных деталей и запретных зон нет — будет выполнена полная перекладка заново. Продолжить?')) return;
  }

  const poolParts = buildPoolParts(seeds);
  const btn = $('btnNestRemnant');
  if(btn) btn.disabled = true;
  showProgress();
  setProgress(0, 'Раскладка на остатке...');
  await sleep(60);
  try{
    const params = readParams();
    const strategy = params.strategy === 'genetic' ? 'area' : params.strategy;
    const shouldStop = () => isCancelRequested();
    const result = await nest(poolParts, params, setProgress, strategy, seeds.length ? seeds : undefined, shouldStop);

    if((result && result.cancelled) || isCancelRequested()){
      setStatus('Раскладка на остатке отменена');
      return;
    }

    const { sheets, unplaced } = result;
    computeRemnants(sheets, params);
    state.sheets = sheets;
    state.selectedPart = null;
    state.selectedParts = [];
    setProgress(1, 'Готово');
    updateReport(unplaced);
    draw();
    refreshPartsStatus();
    const placedTotal = sheets.reduce((s, sh) => s + sh.placed.length, 0);
    setStatus(`На остатке: зафиксировано ${fixedTotal}, всего на листах ${placedTotal}` +
      (unplaced.length ? `, не поместилось ${unplaced.length}` : ''));
    pushHistory();
  } catch(err){
    alert('Ошибка: ' + err.message);
  } finally {
    hideProgress();
    if(btn) btn.disabled = false;
  }
}

export function bindFixingUI(){
  const t = $('btnFixToggle');   if(t) t.addEventListener('click', fixSelectedToggle);
  const u = $('btnUnfixAll');    if(u) u.addEventListener('click', unfixAll);
  const n = $('btnNestRemnant'); if(n) n.addEventListener('click', nestRemainder);
}