import { $, sleep, setStatus } from './utils.js';
import { state } from './state.js';
import { nestWithOrder, STRATEGIES } from './nesting.js';
import { readParams, getAutofitValues, applyParams, updateAutofitCount } from './params.js';

let autofitStop = false;
let autofitRunning = false;

const autofitModal = () => $('autofitModal');

export function openAutofitModal(){
  autofitModal().classList.add('active');
  updateAutofitCount();
}
export function closeAutofitModal(){
  autofitModal().classList.remove('active');
}

export function bindAutofitUI(){
  $('btnOpenAutofit').addEventListener('click', openAutofitModal);
  $('btnCloseAutofit').addEventListener('click', closeAutofitModal);
  $('btnCloseAutofit2').addEventListener('click', closeAutofitModal);
  autofitModal().addEventListener('click', e => {
    if(e.target === autofitModal()) closeAutofitModal();
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && autofitModal().classList.contains('active')) closeAutofitModal();
  });

  $('btnAutoFitStop').addEventListener('click', () => {
    autofitStop = true;
    $('afStatus').textContent = 'Останавливаю после текущего шага...';
  });

  $('btnAutoFit').addEventListener('click', async () => {
    if(!state.parts.length){ alert('Добавьте детали'); return; }
    if(autofitRunning) return;
    const { xs, ys } = getAutofitValues();
    const n = xs.length * ys.length;
    if(n > 30){ alert('Слишком много вариантов'); return; }
    if(!n){ alert('Пустой диапазон'); return; }

    autofitRunning = true;
    autofitStop = false;
    $('btnAutoFit').disabled = true;
    $('btnAutoFitStop').disabled = false;
    $('btnNest').disabled = true;
    $('afResults').style.display = 'none';
    $('afResults').innerHTML = '';

    const baseParams = readParams();
    baseParams.strategy = 'area';
    const parts = state.parts;

    let step = 0;
    const total = xs.length * ys.length;
    const results = [];
    const t0 = performance.now();

    outer:
    for(const X of xs){
      for(const Y of ys){
        if(autofitStop) break outer;
        step++;
        $('afStatus').textContent = `Шаг ${step} из ${total} — X=${X} Y=${Y}`;
        await sleep(20);
        const p = { ...baseParams, sheetW:X, sheetH:Y, strategy:'area' };
        let result;
        try { result = await nestWithOrder(parts, p, STRATEGIES[0].cmp, null); }
        catch(_){ continue; }

        const sheetsCount = result.sheets.length;
        const totalPlaced = result.sheets.reduce((s,sh) => s + sh.placed.length, 0);
        const totalArea = result.sheets.reduce((sum,sh) => {
          let a = 0;
          for(const pl of sh.placed) a += parts[pl.partIdx].area;
          return sum + a;
        }, 0);
        const purchaseArea = sheetsCount * X * Y;
        const eff = purchaseArea ? (100 * totalArea / purchaseArea) : 0;
        results.push({ X, Y, sheetsCount, totalPlaced, unplacedCount: result.unplaced.length, eff, purchaseArea, m2: purchaseArea / 1e6 });
      }
    }

    const dt = (performance.now() - t0).toFixed(0);
    const criterion = $('afCriterion').value;
    let best = null;
    for(const r of results){
      if(!best){ best = r; continue; }
      if(isBetter(r, best, criterion)) best = r;
    }

    autofitRunning = false;
    $('btnAutoFitStop').disabled = true;
    $('btnNest').disabled = false;
    updateAutofitCount();
    $('afStatus').textContent = (autofitStop ? `Остановлено на шаге ${step} из ${total}.` : `Готово. Вариантов: ${results.length}.`) + ` Время: ${dt} мс.`;
    if(best) $('afStatus').textContent += ` Лучший: X=${best.X}, Y=${best.Y}, листов ${best.sheetsCount}, КПД ${best.eff.toFixed(1)}%.`;
    renderAutofitResults(results, best);
  });
}

function isBetter(a, b, criterion){
  if(criterion === 'sheets'){
    if(a.sheetsCount !== b.sheetsCount) return a.sheetsCount < b.sheetsCount;
    return a.eff > b.eff;
  }
  if(criterion === 'eff'){
    if(Math.abs(a.eff - b.eff) > 0.01) return a.eff > b.eff;
    return a.sheetsCount < b.sheetsCount;
  }
  if(Math.abs(a.purchaseArea - b.purchaseArea) > 1) return a.purchaseArea < b.purchaseArea;
  return a.sheetsCount < b.sheetsCount;
}
function sortByCriterion(a, b, criterion){
  if(criterion === 'sheets'){
    if(a.sheetsCount !== b.sheetsCount) return a.sheetsCount - b.sheetsCount;
    return b.eff - a.eff;
  }
  if(criterion === 'eff'){
    if(Math.abs(a.eff - b.eff) > 0.01) return b.eff - a.eff;
    return a.sheetsCount - b.sheetsCount;
  }
  if(Math.abs(a.purchaseArea - b.purchaseArea) > 1) return a.purchaseArea - b.purchaseArea;
  return a.sheetsCount - b.sheetsCount;
}

function renderAutofitResults(results, best){
  const box = $('afResults');
  if(!results.length){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  const criterion = $('afCriterion').value;
  const sorted = [...results].sort((a,b) => sortByCriterion(a,b,criterion));
  const MAX_SHOW = 5;
  const shown = sorted.slice(0, MAX_SHOW);
  const rows = shown.map(r => {
    const isBest = best && r.X === best.X && r.Y === best.Y;
    const cls = isBest ? 'best' : '';
    const star = isBest ? '★' : '';
    const unplacedStr = r.unplacedCount > 0 ? `<span style="color:#b00">${r.unplacedCount}</span>` : '0';
    return `<tr class="${cls}" data-x="${r.X}" data-y="${r.Y}"><td class="star">${star}</td><td>${r.X}</td><td>${r.Y}</td>
<td style="text-align:center">${r.sheetsCount}</td><td style="text-align:center">${r.totalPlaced}</td>
<td style="text-align:center">${unplacedStr}</td><td style="text-align:right">${r.eff.toFixed(1)}%</td>
<td style="text-align:right">${r.m2.toFixed(2)}</td></tr>`;
  }).join('');
  const footer = sorted.length > MAX_SHOW
    ? `Показаны ${MAX_SHOW} лучших из ${sorted.length}. Клик по строке — применить размер.`
    : `Клик по строке — применить размер.`;
  box.innerHTML = `<table><thead><tr><th></th><th>X</th><th>Y</th><th>Лист.</th><th>Разл.</th><th>Ост.</th><th>КПД</th><th>м²</th></tr></thead><tbody>${rows}</tbody></table>
<div style="font-size:11px;color:#666;padding:6px 8px;background:#f5f5f5">${footer}</div>`;
  box.querySelectorAll('tr[data-x]').forEach(tr => {
    tr.addEventListener('click', () => {
      const X = parseFloat(tr.dataset.x), Y = parseFloat(tr.dataset.y);
      applyAutofitResult(X, Y);
    });
  });
}

function applyAutofitResult(X, Y){
  if(autofitRunning) return;
  $('inW').value = X;
  $('inH').value = Y;
  const p = readParams(); // триггерит ничего; ниже переустановим профиль
  import('./params.js').then(m => { m.updateSumGap(); m.updateActiveProfileFromFields(); });
  closeAutofitModal();
  $('btnNest').click();
}