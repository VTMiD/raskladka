import { $, setStatus } from './utils.js';
import { state } from './state.js';
import { draw, resetCamera } from './canvas.js';
import { pushHistory } from './history.js';
import { saveRemnantAsFile } from './remnant-io.js';
import { readParams } from './params.js';

let _filterText = '';
let _highlightTimer = null;

function collectRemnants() {
  const items = [];
  for (let si = 0; si < state.sheets.length; si++) {
    const sh = state.sheets[si];
    if (!sh.remnants || !sh.remnants.length) continue;
    for (let ri = 0; ri < sh.remnants.length; ri++) {
      const r = sh.remnants[ri];
      const W = Math.round(r.w || 0);
      const H = Math.round(r.h || 0);
      if (W < 20 || H < 20) continue;
      items.push({
        sheetIdx: si,
        remnantIdx: ri,
        remnant: r,
        w: W, h: H,
        area: W * H,
        manual: !!r._manual,
        polygon: !!r.polygon,
      });
    }
  }
  return items;
}

function filterItems(items, query) {
  if (!query) return items;
  const q = query.toLowerCase().trim();
  return items.filter(it => {
    const str = `${it.w}x${it.h} ${it.w} ${it.h} ${it.area} лист${it.sheetIdx+1} ${it.manual ? 'ручной' : 'деловой'}`;
    return str.toLowerCase().includes(q);
  });
}

function fmtArea(mm2) {
  return (mm2 / 1e6).toFixed(3) + ' м²';
}

export function renderRemnantCatalog() {
  const wrap = $('remnantCatalogList');
  if (!wrap) return;

  const all = collectRemnants();
  const items = filterItems(all, _filterText);

  if (!all.length) {
    wrap.innerHTML = '<div class="empty">Остатков не найдено.<br>Включите «Отрез делового отхода» или отметьте остаток кнопкой «📦 Остаток».</div>';
    updateStats(0, 0, 0);
    return;
  }

  if (!items.length) {
    wrap.innerHTML = '<div class="empty">Нет остатков, подходящих под фильтр.</div>';
    const totalArea = all.reduce((s, it) => s + it.area, 0);
    updateStats(all.length, 0, totalArea);
    return;
  }

  items.sort((a, b) => b.area - a.area);

  const rows = items.map(it => {
    const typeLabel = it.manual ? '✏ ручной' : '📐 деловой отход';
    const polyLabel = it.polygon ? ' · полигон' : '';
    return `<tr data-sheet="${it.sheetIdx}" data-rem="${it.remnantIdx}">
      <td class="num">${it.sheetIdx + 1}</td>
      <td class="num">${it.w} × ${it.h}</td>
      <td class="num">${fmtArea(it.area)}</td>
      <td class="num">${typeLabel}${polyLabel}</td>
      <td class="actions">
        <button class="small" data-action="find" title="Показать на холсте">📍</button>
        <button class="small" data-action="save" title="Сохранить в DXF">💾</button>
        ${it.manual ? '<button class="small danger" data-action="delete" title="Удалить остаток">🗑</button>' : ''}
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table>
    <thead><tr>
      <th style="width:50px">Лист</th>
      <th style="width:120px">Размер, мм</th>
      <th style="width:90px">Площадь</th>
      <th>Тип</th>
      <th style="width:120px">Действия</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  wrap.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const tr = e.target.closest('tr');
      const sheetIdx = +tr.dataset.sheet;
      const remnantIdx = +tr.dataset.rem;
      const action = e.target.dataset.action;
      handleAction(action, sheetIdx, remnantIdx);
    });
  });

  const totalArea = all.reduce((s, it) => s + it.area, 0);
  updateStats(all.length, items.length, totalArea);
}

function updateStats(total, shown, totalArea) {
  const el = $('remnantCatalogStats');
  if (!el) return;
  if (shown === total) {
    el.textContent = `Всего: ${total} · ${fmtArea(totalArea)}`;
  } else {
    el.textContent = `Показано: ${shown} из ${total} · ${fmtArea(totalArea)}`;
  }
}

function handleAction(action, sheetIdx, remnantIdx) {
  const sheet = state.sheets[sheetIdx];
  if (!sheet) return;
  const r = sheet.remnants && sheet.remnants[remnantIdx];
  if (!r) return;

  if (action === 'find') {
    closeRemnantCatalog();
    resetCamera();
    state._highlightRemnant = { sheetIdx, remnantIdx };
    if (_highlightTimer) clearTimeout(_highlightTimer);
    draw();
    setStatus(`📍 Остаток на листе ${sheetIdx + 1}: ${Math.round(r.w)} × ${Math.round(r.h)} мм`);
    _highlightTimer = setTimeout(() => {
      state._highlightRemnant = null;
      draw();
    }, 2500);
    return;
  }

  if (action === 'save') {
    const params = readParams();
    saveRemnantAsFile(r, params).then(res => {
      if (res.cancelled) return;
      if (res.ok) setStatus((res.downloaded ? 'Скачано: ' : 'Сохранено: ') + res.name);
      else setStatus('Ошибка сохранения: ' + (res.error || '?'));
    });
    return;
  }

  if (action === 'delete') {
    if (!r._manual) { setStatus('Деловые отходы удаляются через «🔓 Отменить фиксацию» или «🗑» в панели остатков'); return; }
    if (!confirm(`Удалить остаток ${Math.round(r.w)} × ${Math.round(r.h)} мм с листа ${sheetIdx + 1}?`)) return;
    sheet.remnants.splice(remnantIdx, 1);
    draw();
    pushHistory();
    renderRemnantCatalog();
    setStatus('Остаток удалён');
    return;
  }
}

export function openRemnantCatalog() {
  const modal = document.getElementById('remnantCatalogModal');
  if (!modal) return;
  _filterText = '';
  const inp = $('remnantCatalogSearch');
  if (inp) inp.value = '';
  renderRemnantCatalog();
  modal.classList.add('active');
}

export function closeRemnantCatalog() {
  const modal = document.getElementById('remnantCatalogModal');
  if (!modal) return;
  modal.classList.remove('active');
}

export function bindRemnantCatalogUI() {
  const btn = $('btnOpenRemnantCatalog');
  if (btn) btn.addEventListener('click', openRemnantCatalog);

  const modal = document.getElementById('remnantCatalogModal');
  if (!modal) return;

  const close1 = $('btnCloseRemnantCatalog');
  const close2 = $('btnCloseRemnantCatalog2');
  if (close1) close1.addEventListener('click', closeRemnantCatalog);
  if (close2) close2.addEventListener('click', closeRemnantCatalog);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeRemnantCatalog();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeRemnantCatalog();
  });

  const searchEl = $('remnantCatalogSearch');
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      _filterText = e.target.value;
      renderRemnantCatalog();
    });
  }
}