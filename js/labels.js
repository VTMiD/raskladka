import { $, escapeHtml as esc } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';

/**
 * Собирает данные для этикеток на основе раскладки (или задания, если раскладки нет).
 * Возвращает массив записей:
 *   { name, w, h, part, totalQty, sheetsList }
 */
function collectLabelData() {
  const params = readParams();

  if (state.sheets.length) {
    // Данные из раскладки: группируем placed детали по partIdx
    const placedMap = new Map(); // partIdx -> { name, w, h, part, count, sheets: Set }
    for (let si = 0; si < state.sheets.length; si++) {
      const sheet = state.sheets[si];
      for (const pl of sheet.placed) {
        const part = state.parts[pl.partIdx];
        if (!part) continue;
        let rec = placedMap.get(pl.partIdx);
        if (!rec) {
          rec = {
            name: part.name,
            w: part.width,
            h: part.height,
            part,              // ссылка на деталь — нужна для отрисовки контура
            count: 0,
            sheets: new Set()
          };
          placedMap.set(pl.partIdx, rec);
        }
        rec.count++;
        rec.sheets.add(si + 1);
      }
    }
    const result = [];
    for (const [, rec] of placedMap) {
      result.push({
        name: rec.name,
        w: rec.w,
        h: rec.h,
        part: rec.part,
        totalQty: rec.count,
        sheetsList: [...rec.sheets].sort((a, b) => a - b).join(', ')
      });
    }
    result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return result;
  }

  // Если раскладки нет — данные из задания
  const result = [];
  for (const part of state.parts) {
    result.push({
      name: part.name,
      w: part.width,
      h: part.height,
      part,               // ссылка на деталь — нужна для отрисовки контура
      totalQty: part.qty,
      sheetsList: '—'
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return result;
}

/**
 * Строит inline-SVG с контуром детали.
 * Координаты — в миллиметрах детали; viewBox = её габарит.
 * Масштабируется автоматически средствами SVG (preserveAspectRatio).
 */
function buildPartContourSvg(part) {
  if (!part || !part.polygons || !part.polygons.length) return '';

  const w = part.width > 0 ? part.width : 1;
  const h = part.height > 0 ? part.height : 1;

  // Толщина линии пропорциональна размеру детали — читается и на крупных,
  // и на мелких деталях. Ограничена снизу, чтобы совсем маленькие не «пропали».
  const diag = Math.hypot(w, h);
  const stroke = Math.max(0.4, diag / 180);

  let body = '';
  for (const ring of part.polygons) {
    if (!ring || ring.length < 2) continue;
    const pts = ring
      .map(([x, y]) => `${x.toFixed(2)},${(h - y).toFixed(2)}`) // flip Y для SVG
      .join(' ');
    body += `<polygon points="${pts}" fill="none" stroke="#1a3a5c" stroke-width="${stroke.toFixed(3)}" stroke-linejoin="round"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/**
 * Строит HTML для печати этикеток на A4.
 * Формат: 2 колонки × 5 рядов = 10 этикеток на листе.
 * Размер этикетки ~90×48 мм.
 *
 * Каждая этикетка содержит:
 *   - Наименование детали
 *   - Контур детали (SVG)
 *   - Габариты (Д × Ш)
 *   - Количество и номера листов
 *   - Дату
 */
export function buildLabelsHtml() {
  const data = collectLabelData();
  if (!data.length) return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Нет деталей для печати этикеток.</p>';

  const params = readParams();
  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;

  // Этикетки строчно, по 10 на страницу
  const labelsPerPage = 10; // 2 колонки × 5 рядов
  const pages = [];
  for (let pageStart = 0; pageStart < data.length; pageStart += labelsPerPage) {
    const pageData = data.slice(pageStart, pageStart + labelsPerPage);
    // Дозаполняем пустыми, если меньше 10
    while (pageData.length < labelsPerPage) {
      pageData.push(null);
    }

    const rows = [];
    for (let row = 0; row < 5; row++) {
      const left = pageData[row * 2];
      const right = pageData[row * 2 + 1];
      rows.push(`
        <tr>
          <td class="label-cell">${left ? buildLabelCell(left, dateStr, params) : '<div class="label-empty"></div>'}</td>
          <td class="label-cell">${right ? buildLabelCell(right, dateStr, params) : '<div class="label-empty"></div>'}</td>
        </tr>`);
    }

    pages.push(`
      <div class="labels-page">
        <table class="labels-table">
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`);
  }

  const totalPages = pages.length;
  return `
    <div class="labels-print-wrap">
      <div class="labels-header">
        <h1>Этикетки деталей</h1>
        <div class="labels-meta">
          <span>Дата: ${dateStr}</span>
          <span>Заготовка: ${Math.round(params.sheetW)} × ${Math.round(params.sheetH)} × ${params.thickness} мм</span>
          <span>Всего наименований: ${data.length}</span>
        </div>
      </div>
      ${pages.join('')}
      <div class="labels-footer">Страниц: ${totalPages}</div>
    </div>`;
}

function buildLabelCell(item, dateStr, params) {
  const svg = buildPartContourSvg(item.part);
  const dimsText = `${item.w.toFixed(1)} × ${item.h.toFixed(1)} мм`;
  return `
    <div class="label">
      <div class="label-name" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="label-contour">${svg}</div>
      <div class="label-dims">${dimsText}</div>
      <div class="label-info">
        <span class="label-qty">Кол-во: <b>${item.totalQty}</b> шт</span>
        <span class="label-sheets">Лист(ы): <b>${esc(item.sheetsList)}</b></span>
      </div>
      <div class="label-date">${dateStr}</div>
    </div>`;
}

export function printLabels() {
  if (!state.parts.length) {
    alert('Сначала добавьте детали');
    return;
  }
  // Используем существующий механизм печати из report.js
  import('./report.js').then(m => {
    m.doPrint(buildLabelsHtml(), 'portrait');
  });
}