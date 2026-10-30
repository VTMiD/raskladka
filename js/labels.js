import { $, escapeHtml as esc } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { makeQrSvg, makeBarcodeSvg } from './qr-barcode.js';

function collectLabelData() {
  const params = readParams();

  if (state.sheets.length) {
    const placedMap = new Map();
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
            part,
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

  const result = [];
  for (const part of state.parts) {
    result.push({
      name: part.name,
      w: part.width,
      h: part.height,
      part,
      totalQty: part.qty,
      sheetsList: '—'
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return result;
}

function buildPartContourSvg(part) {
  if (!part || !part.polygons || !part.polygons.length) return '';

  const w = part.width > 0 ? part.width : 1;
  const h = part.height > 0 ? part.height : 1;
  const diag = Math.hypot(w, h);
  const stroke = Math.max(0.4, diag / 180);

  let body = '';
  for (const ring of part.polygons) {
    if (!ring || ring.length < 2) continue;
    const pts = ring
      .map(([x, y]) => `${x.toFixed(2)},${(h - y).toFixed(2)}`)
      .join(' ');
    body += `<polygon points="${pts}" fill="none" stroke="#1a3a5c" stroke-width="${stroke.toFixed(3)}" stroke-linejoin="round"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function buildLabelsHtml() {
  const data = collectLabelData();
  if (!data.length) return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Нет деталей для печати этикеток.</p>';

  const params = readParams();
  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;

  const labelsPerPage = 10;
  const pages = [];
  for (let pageStart = 0; pageStart < data.length; pageStart += labelsPerPage) {
    const pageData = data.slice(pageStart, pageStart + labelsPerPage);
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
      <div class="labels-footer">Страниц: ${pages.length}</div>
    </div>`;
}

function buildLabelCell(item, dateStr, params) {
  const svg = buildPartContourSvg(item.part);
  const dimsText = `${item.w.toFixed(1)} × ${item.h.toFixed(1)} мм`;
  const qrText = `${item.name}|${item.w.toFixed(0)}x${item.h.toFixed(0)}|${item.totalQty}шт`;
  const qrSvg = makeQrSvg(qrText, { cellSize: 2, margin: 0 });
  return `
    <div class="label">
      ${qrSvg ? `<div class="label-qr-abs" title="QR: ${esc(qrText)}">${qrSvg}</div>` : ''}
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
  import('./report.js').then(m => {
    m.doPrint(buildLabelsHtml(), 'portrait');
  });
}

export function buildRemnantLabelsHtml() {
  const pad2 = n => String(n).padStart(2, '0');
  const params = readParams();
  const now = new Date();
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;
  const dateIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const remnants = [];
  for (let si = 0; si < state.sheets.length; si++) {
    const sh = state.sheets[si];
    if (!sh.remnants) continue;
    for (const r of sh.remnants) {
      const W = Math.round(r.w);
      const H = Math.round(r.h);
      if (W < 20 || H < 20) continue;
      remnants.push({
        w: W,
        h: H,
        sheet: si + 1,
        name: `Остаток_${W}x${H}x${params.thickness}_${dateIso}`,
      });
    }
  }

  if (!remnants.length) {
    return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Остатков не найдено.<br>Включите «Отрез делового отхода» или отметьте остаток кнопкой «📦 Остаток».</p>';
  }

  const perPage = 6;
  const pages = [];
  for (let i = 0; i < remnants.length; i += perPage) {
    const chunk = remnants.slice(i, i + perPage);
    while (chunk.length < perPage) chunk.push(null);
    const rows = [];
    for (let row = 0; row < 3; row++) {
      const l = chunk[row * 2];
      const r = chunk[row * 2 + 1];
      rows.push(`<tr>
        <td class="label-cell">${l ? buildRemnantCell(l, dateStr, params.thickness) : '<div class="label-empty"></div>'}</td>
        <td class="label-cell">${r ? buildRemnantCell(r, dateStr, params.thickness) : '<div class="label-empty"></div>'}</td>
      </tr>`);
    }
    pages.push(`<div class="labels-page"><table class="labels-table"><tbody>${rows.join('')}</tbody></table></div>`);
  }

  return `<div class="labels-print-wrap">
    <div class="labels-header">
      <h1>Этикетки остатков</h1>
      <div class="labels-meta">
        <span>Дата: ${dateStr}</span>
        <span>Толщина: ${params.thickness} мм</span>
        <span>Всего остатков: ${remnants.length}</span>
      </div>
    </div>
    ${pages.join('')}
    <div class="labels-footer">Страниц: ${pages.length}</div>
  </div>`;
}

function buildRemnantCell(item, dateStr, thickness) {
  const qrSvg = makeQrSvg(item.name, { cellSize: 2, margin: 0 });
  const barcodeText = `R${item.sheet}-${item.w}x${item.h}`;
  const bcSvg = makeBarcodeSvg(barcodeText, { width: 0.9, height: 32 });
  return `<div class="label">
    <div class="label-name" title="${esc(item.name)}">${esc(item.name)}</div>
    <div class="remnant-code-row">
      ${qrSvg ? `<div class="remnant-qr">${qrSvg}</div>` : ''}
      <div class="remnant-barcode">
        ${bcSvg}
        <div class="remnant-dims">${item.w}×${item.h}×${thickness}</div>
      </div>
    </div>
    <div class="label-info">
      <span class="label-qty">Лист ${item.sheet}</span>
      <span class="label-sheets">${dateStr}</span>
    </div>
  </div>`;
}