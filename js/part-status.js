import { $ } from './utils.js';
import { state } from './state.js';

// Сколько экземпляров каждой детали (по индексу строки) реально разложено
export function placedCountsByIdx(){
  const arr = new Array(state.parts.length).fill(0);
  for(const sh of state.sheets){
    for(const pl of sh.placed){
      if(pl.partIdx >= 0 && pl.partIdx < arr.length) arr[pl.partIdx]++;
    }
  }
  return arr;
}

// Статус раскладки для детали: { key, icon, title }
export function statusOf(done, qty){
  if(qty > 0 && done >= qty) return { key:'full',    icon:'✓', title:`Разложено полностью: ${done} из ${qty}` };
  if(done > 0)               return { key:'partial', icon:'◐', title:`Разложено частично: ${done} из ${qty}` };
  return                            { key:'none',    icon:'○', title:`Не разложено: 0 из ${qty}` };
}

// Обновить статус существующих строк таблицы без полной перерисовки
export function refreshPartsStatus(){
  const wrap = $('partsTableWrap');
  if(!wrap || !state.parts.length) return;
  const placed = placedCountsByIdx();
  wrap.querySelectorAll('tr[data-row]').forEach(tr => {
    const i = +tr.dataset.row;
    const p = state.parts[i];
    if(!p) return;
    const st = statusOf(placed[i] || 0, p.qty || 0);
    tr.classList.remove('row-full', 'row-partial', 'row-none');
    tr.classList.add('row-' + st.key);
    const cell = tr.querySelector('td.status');
    if(cell){ cell.className = 'status ' + st.key; cell.textContent = st.icon; cell.title = st.title; }
  });
}
