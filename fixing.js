import { $, sleep, setStatus } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { nest, computeRemnants } from './nesting.js';
import { draw } from './canvas.js';
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
  const seeds = [];
  for(const sheet of state.sheets){
    const fixed = sheet.placed.filter(pl => pl._fixed);
    if(fixed.length) seeds.push({ placed: fixed });
  }
  return seeds;
}

export function buildPoolParts(seeds){
  const fixedCount = {};
  for(const s of seeds) for(const pl of s.placed) fixedCount[pl.partIdx] = (fixedCount[pl.partIdx] || 0) + 1;
  return state.parts.map((p, i) => ({ ...p, qty: Math.max(0, p.qty - (fixedCount[i] || 0)) }));
}

function fixSelectedToggle(){
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
  let n = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) if(pl._fixed){ pl._fixed = false; n++; }
  draw();
  setStatus(n ? `Фиксация снята с ${n} дет.` : 'Нет зафиксированных деталей');
  if(n > 0) pushHistory();
}

export async function nestRemainder(){
  if(!state.parts.length){ setStatus('Нет деталей'); return; }
  if(!state.sheets.length){ setStatus('Сначала выполните раскладку («Разложить»)'); return; }

  const seeds = collectFixedSeeds();
  const fixedTotal = seeds.reduce((s, sh) => s + sh.placed.length, 0);
  if(!fixedTotal){
    if(!confirm('Зафиксированных деталей нет — будет выполнена полная перекладка заново. Продолжить?')) return;
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
    const result = await nest(poolParts, params, setProgress, strategy, seeds, shouldStop);

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