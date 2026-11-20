// js/parts-table.js
import { $, escapeHtml, setStatus } from './utils.js';
import { state } from './state.js';
import { draw } from './canvas.js';
import { placedCountsByIdx, statusOf, refreshPartsStatus } from './part-status.js';
import { pushHistory } from './history.js';
// Импортируем функцию открытия окна
import { openJobsModal } from './parts.js'; 

// ─── Авто-выделение содержимого поля при фокусе ───
function attachAutoSelect(el){
  if(!el) return;
  let mouseDownStarted = false;
  el.addEventListener('mousedown', () => { mouseDownStarted = true; });
  el.addEventListener('mouseup', (e) => {
    if(!mouseDownStarted) return;
    mouseDownStarted = false;
    if(el.selectionStart === el.selectionEnd){
      e.preventDefault();
      try { el.select(); } catch(_){}
    }
  });
  el.addEventListener('focus', () => {
    setTimeout(() => { try { el.select(); } catch(_){} }, 0);
  });
  el.addEventListener('dblclick', () => {
    try { el.select(); } catch(_){}
  });
}

function getQtyInputs(wrap){
  if(!wrap) return [];
  return [...wrap.querySelectorAll('input[type=number][data-idx]')];
}

// ─── Поиск: нормализация и матчинг ───
function normalizeQuery(s){
  return String(s || '')
    .toLowerCase()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesQuery(p, placedCount, query){
  const q = normalizeQuery(query);
  if(!q) return true;
  const tokens = q.split(' ').filter(Boolean);
  if(!tokens.length) return true;

  const w = Number(p.width || 0);
  const h = Number(p.height || 0);
  const qty = Number(p.qty || 0);
  const len = Number(p.length || 0);
  const done = Number(placedCount || 0);

  const haystacks = [
    normalizeQuery(String(p.name || '')),
    normalizeQuery(`${w.toFixed(1)}x${h.toFixed(1)}`),
    normalizeQuery(`${Math.round(w)}x${Math.round(h)}`),
    normalizeQuery(`${Math.round(w)} ${Math.round(h)}`),
    normalizeQuery(String(qty)),
    normalizeQuery(String(done)),
    normalizeQuery(String(Math.round(len))),
  ];
  const joined = ' | ' + haystacks.join(' | ') + ' | ';

  for(const t of tokens){
    if(joined.indexOf(t) === -1) return false;
  }
  return true;
}

// ─── Подсветка совпадений в имени ───
function highlightName(text, query){
  const original = String(text || '');
  const q = normalizeQuery(query);
  if(!q) return escapeHtml(original);

  const tokens = q.split(' ').filter(Boolean);
  if(!tokens.length) return escapeHtml(original);

  const lower = original.toLowerCase();
  const ranges = [];

  for(const t of tokens){
    let i = 0;
    while((i = lower.indexOf(t, i)) !== -1){
      ranges.push([i, i + t.length]);
      i += t.length;
    }
  }

  if(!ranges.length) return escapeHtml(original);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for(const r of ranges){
    if(merged.length && merged[merged.length - 1][1] >= r[0]){
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }

  let out = '';
  let last = 0;
  for(const [s, e] of merged){
    out += escapeHtml(original.slice(last, s));
    out += '<mark>' + escapeHtml(original.slice(s, e)) + '</mark>';
    last = e;
  }
  out += escapeHtml(original.slice(last));
  return out;
}

// ─── Фильтр таблицы — «навигатор» ───
export function applyPartsFilter(){
  const wrap = $('partsTableWrap');
  if(!wrap) return;
  const rawQ = String(state.partsSearchQuery || '').trim();
  const onlyUnplaced = !!state.partsFilterUnplaced;
  const placed = placedCountsByIdx();
  const total = state.parts.length;

  let visible = 0;
  let firstHit = null;

  wrap.querySelectorAll('tr[data-row]').forEach(tr => {
    const idx = +tr.dataset.row;
    const p = state.parts[idx];
    if(!p){ tr.style.display = 'none'; return; }

    let hideByUnplaced = false;
    if(onlyUnplaced){
      const st = statusOf(placed[idx] || 0, p.qty || 0);
      if(st.key === 'full') hideByUnplaced = true;
    }
    tr.style.display = hideByUnplaced ? 'none' : '';

    const nameCell = tr.querySelector('[data-edit=name]');
    if(nameCell){
      nameCell.innerHTML = highlightName(p.name, rawQ);
    }

    tr.classList.remove('filter-hit');

    if(hideByUnplaced) return;
    visible++;

    if(rawQ && !firstHit && matchesQuery(p, placed[idx] || 0, rawQ)){
      firstHit = tr;
    }
  });

  if(firstHit){
    firstHit.classList.add('filter-hit');
    try {
      firstHit.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch(_) {}
  }

  const info = $('partsFilterInfo');
  if(info){
    if(rawQ || onlyUnplaced){
      const foundStr = rawQ ? `Найдено: ${visible} из ${total}` : `Показано: ${visible} из ${total}`;
      info.textContent = foundStr;
      info.className = 'parts-filter-info active';
    } else {
      info.textContent = total ? `Всего ${total}` : '';
      info.className = 'parts-filter-info';
    }
  }
}

export function renderPartsTable(){
  const wrap = $('partsTableWrap');
  if(!wrap) return;
  if(!state.parts.length){
    wrap.innerHTML = '<div class="empty">Файлы не добавлены. Перетащите DXF сюда.</div>';
    updateSelInfo(); return;
  }
  const placed = placedCountsByIdx();
  const rows = state.parts.map((p, i) => {
    const sel = state.selectedRows.has(i) ? ' selected' : '';
    const lenStr = (p.length >= 10000) ? (p.length/1000).toFixed(2)+' м' : Math.round(p.length)+' мм';
    const st = statusOf(placed[i] || 0, p.qty || 0);
    return `<tr data-row="${i}" class="${sel} row-${st.key}">
<td class="status ${st.key}" title="${st.title}">${st.icon}</td>
<td data-edit="name" data-idx="${i}" style="cursor:text" title="Клик — ввод количества · 2× клик — переименовать">${escapeHtml(p.name)}</td>
<td class="num" style="cursor:default">${p.width.toFixed(1)}×${p.height.toFixed(1)}</td>
<td class="num" style="cursor:default" title="Длина контуров">${lenStr}</td>
<td class="num qty-cell" title="Клик — редактировать количество"><input type="number" min="1" value="${p.qty}" data-idx="${i}"></td>
<td class="del" data-del="${i}" title="Удалить">✕</td></tr>`;
  }).join('');
  wrap.innerHTML = `<table><thead><tr>
<th style="width:26px" title="✓ — разложено полностью, ◐ — частично, ○ — не разложено"></th>
<th style="min-width:110px">Деталь (клик — кол-во, 2× — правка)</th>
<th style="width:80px">Размер</th>
<th style="width:80px">Длина 1 шт</th>
<th style="width:60px">Кол-во</th>
<th style="width:30px"></th></tr></thead><tbody>${rows}</tbody></table>`;

  wrap.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if(e.target.closest('input[type=number], [data-del]')) return;
      const idx = +tr.dataset.row;
      if(e.ctrlKey || e.metaKey){
        if(state.selectedRows.has(idx)) state.selectedRows.delete(idx);
        else state.selectedRows.add(idx);
      } else if(e.shiftKey && state.selectedRows.size){
        const arr = [...state.selectedRows].sort((a,b)=>a-b);
        const from = Math.min(arr[arr.length-1], idx), to = Math.max(arr[arr.length-1], idx);
        for(let k=from;k<=to;k++) state.selectedRows.add(k);
      } else {
        state.selectedRows.clear();
        state.selectedRows.add(idx);
      }
      state._selectedRowsFromCanvas = false;
      updateSelectionUI();
    });

    // ═══ ОБРАБОТЧИК ПКМ ДЛЯ ТАБЛИЦЫ ═══
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = +tr.dataset.row;
      
      // Если строка не выделена, выделяем её
      if (!state.selectedRows.has(idx)) {
        state.selectedRows.clear();
        state.selectedRows.add(idx);
        updateSelectionUI();
      }

      // Показываем контекстное меню
      const menu = document.getElementById('contextMenu');
      if (!menu) return;
      
      menu.innerHTML = '';
      menu.style.display = 'block';
      
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = `📁 Перенести выделенные (${state.selectedRows.size}) в задание...`;
      item.onclick = () => {
        menu.style.display = 'none';
        // Вызываем НАШУ новую функцию
        openJobsModal(); 
      };
      
      menu.appendChild(item);
      
      // Позиционируем меню
      menu.style.left = Math.min(e.clientX, window.innerWidth - 300) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 100) + 'px';
    });

    let dragStartTarget = null;
    tr.setAttribute('draggable', 'true');
    tr.addEventListener('mousedown', e => { dragStartTarget = e.target; });

    tr.addEventListener('dragstart', e => {
      const t = dragStartTarget;
      dragStartTarget = null;
      if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('[data-del]'))){
        e.preventDefault(); return;
      }
      const idx = +tr.dataset.row;
      const part = state.parts[idx];
      if(!part){ e.preventDefault(); return; }
      state.draggedPartIdx = idx;
      state._dropHandled = false;
      e.dataTransfer.effectAllowed = 'copy';
      try { e.dataTransfer.setData('text/plain', String(idx)); } catch(_){}
      setStatus(`Перетащите «${part.name}» на холст`);
    });

    tr.addEventListener('dragend', () => {
      const handled = state._dropHandled;
      state._dropHandled = false;
      state.draggedPartIdx = null;
      state.dropPreview = null;
      draw();
      if(!handled) setStatus('');
    });
  });

  let _qtyTimer = null;
  const inputs = getQtyInputs(wrap);

  inputs.forEach((inp, i) => {
    attachAutoSelect(inp);

    inp.addEventListener('input', e => {
      const idx = +e.target.dataset.idx;
      state.parts[idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      refreshPartsStatus();
      updateSelInfo();
      if(_qtyTimer) clearTimeout(_qtyTimer);
      _qtyTimer = setTimeout(() => { _qtyTimer = null; pushHistory(); }, 500);
    });

    inp.addEventListener('blur', () => {
      if(_qtyTimer){ clearTimeout(_qtyTimer); _qtyTimer = null; pushHistory(); }
    });

    inp.addEventListener('keydown', e => {
      if(e.key === 'ArrowDown'){
        e.preventDefault();
        const next = inputs[i + 1];
        if(next){ next.focus(); }
        else { const bq = $('batchQty'); if(bq) bq.focus(); }
        return;
      }
      if(e.key === 'ArrowUp'){
        e.preventDefault();
        const prev = inputs[i - 1];
        if(prev){ prev.focus(); }
        else { const bq = $('batchQty'); if(bq) bq.focus(); }
        return;
      }
      if(e.key === 'Enter'){
        e.preventDefault();
        const next = inputs[i + 1];
        if(next) next.focus();
        else inp.blur();
        return;
      }
      if(e.key === 'Escape'){
        e.preventDefault();
        inp.blur();
      }
    });
  });

  wrap.querySelectorAll('[data-edit=name]').forEach(td => {
    let clickTimer = null;
    td.addEventListener('click', e => {
      if(e.detail > 1) return;
      if(clickTimer) return;
      const idx = +td.dataset.idx;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const inp = wrap.querySelector(`input[type=number][data-idx="${idx}"]`);
        if(inp){ inp.focus(); }
      }, 220);
    });
    td.addEventListener('dblclick', e => {
      if(clickTimer){ clearTimeout(clickTimer); clickTimer = null; }
      const idx = +td.dataset.idx;
      const old = state.parts[idx].name;
      const v = prompt('Новое имя детали:', old);
      if(v !== null && v.trim() && v.trim() !== old){
        state.parts[idx].name = v.trim();
        renderPartsTable();
        pushHistory();
      }
    });
  });

  wrap.querySelectorAll('td.qty-cell').forEach(td => {
    td.addEventListener('click', e => {
      if(e.target.tagName === 'INPUT') return;
      const inp = td.querySelector('input');
      if(inp){ inp.focus(); }
    });
  });

  wrap.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', e => {
      const idx = +e.target.dataset.del;
      const had = !!state.parts[idx];
      removePartByIndex(idx);
      if(had) pushHistory();
    });
  });

  updateSelInfo();
  updateSelectionUI();
  applyPartsFilter();
}

function removePartByIndex(idx){
  state.parts.splice(idx, 1);
  for(const sh of state.sheets){
    sh.placed = sh.placed.filter(pl => pl.partIdx !== idx);
    for(const pl of sh.placed) if(pl.partIdx > idx) pl.partIdx--;
  }
  const ns = new Set();
  for(const s of state.selectedRows){
    if(s < idx) ns.add(s); else if(s > idx) ns.add(s-1);
  }
  state.selectedRows.clear();
  for(const s of ns) state.selectedRows.add(s);

  // ─── Сброс выделения на холсте, т.к. placedIdx сдвинулись ───
  state.selectedPart = null;
  state.selectedParts = [];

  renderPartsTable();
  draw();
}

export function updateSelectionUI(){
  const wrap = $('partsTableWrap');
  if(!wrap) return;
  wrap.querySelectorAll('tr').forEach(tr => {
    tr.classList.toggle('selected', state.selectedRows.has(+tr.dataset.row));
  });
  updateSelInfo();

  if (state.selectedRows.size) {
    const firstIdx = Math.min(...state.selectedRows);
    const tr = wrap.querySelector(`tr[data-row="${firstIdx}"]`);
    if (tr && tr.style.display !== 'none') {
      try { tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(_) {}
    }
  }
}

export function updateSelInfo(){
  const el = $('selInfo');
  if(!el) return;
  const n = state.selectedRows.size;
  if(!n){ el.textContent = ''; return; }
  const qtySet = new Set();
  for(const idx of state.selectedRows){
    const p = state.parts[idx];
    if(p) qtySet.add(p.qty || 1);
  }
  const cur = [...qtySet].sort((a,b) => a - b);
  let curText = '';
  if(cur.length === 1){
    curText = `, кол-во: ${cur[0]}`;
  } else if(cur.length > 1 && cur.length <= 4){
    curText = `, кол-во: ${cur.join(', ')}`;
  } else if(cur.length > 4){
    curText = `, кол-во: разное`;
  }
  el.textContent = `выделено: ${n}${curText}`;
}