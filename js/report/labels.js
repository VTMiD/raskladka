// js/report/labels.js
import { state } from '../state.js';
import { readParams } from '../params.js';
import { makeQrSvg } from '../qr-barcode.js';
import { doPrint } from './report-print.js';
import { getCurrentProjectName } from '../project-io.js';

function pad2(n) { return String(n).padStart(2, '0'); }

function escapeXml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function paginateCards(cardsArray, perPage = 4) {
  let html = '';
  for (let i = 0; i < cardsArray.length; i += perPage) {
    const chunk = cardsArray.slice(i, i + perPage);
    html += `<div class="pdf-page">
      <div class="part-labels-grid">${chunk.join('')}</div>
    </div>`;
  }
  return html;
}

function buildPartSvg(part) {
  if (!part || !part.polygons || !part.polygons.length) return '';
  
  const W = part.width || 100;
  const H = part.height || 100;
  const pad = Math.max(W, H) * 0.05;
  const vbW = W + pad * 2;
  const vbH = H + pad * 2;

  const strokeWidth = Math.max(0.5, Math.min(2, Math.max(W, H) / 200));

  let pathStr = '';

  for (const ring of part.polygons) {
    if (ring.length < 2) continue;
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const x = ring[i][0] + pad;
      const y = (H - ring[i][1]) + pad; 
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    d += 'Z '; 
    pathStr += `<path d="${d}" fill="none" stroke="#1a1a1a" stroke-width="${strokeWidth.toFixed(2)}" stroke-linejoin="round" />`;
  }

  if (Array.isArray(part.dimLines)) {
    for (const dl of part.dimLines) {
      if (dl.type === 'line') {
        const x1 = (dl.x1 + pad).toFixed(2);
        const y1 = (H - dl.y1 + pad).toFixed(2);
        const x2 = (dl.x2 + pad).toFixed(2);
        const y2 = (H - dl.y2 + pad).toFixed(2);
        pathStr += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1a1a1a" stroke-width="${(strokeWidth*0.7).toFixed(2)}"/>`;
      } else if (dl.type === 'solid' && Array.isArray(dl.points) && dl.points.length >= 3) {
        const pts = dl.points.map(([x, y]) => `${(x + pad).toFixed(2)},${(H - y + pad).toFixed(2)}`).join(' ');
        pathStr += `<polygon points="${pts}" fill="#1a1a1a" stroke="none"/>`;
      }
    }
  }

  if (Array.isArray(part.annotations)) {
    for (const an of part.annotations) {
      if (!an.text) continue;
      const txt = String(an.text).trim();
      if (!txt) continue;

      const ax = (an.x + pad);
      const ay = (H - an.y + pad);
      const fh = Math.max(1.5, (an.height || 5) * 0.9);
      const rotDeg = Number(an.rotation || 0);
      const rot = -rotDeg;

      if (Math.abs(rot) > 0.5) {
        pathStr += `<text x="${ax.toFixed(2)}" y="${ay.toFixed(2)}" font-size="${fh.toFixed(2)}"
          font-family="Arial, sans-serif" fill="#1a1a1a" text-anchor="middle"
          transform="rotate(${rot.toFixed(2)} ${ax.toFixed(2)} ${ay.toFixed(2)})">${escapeXml(txt)}</text>`;
      } else {
        pathStr += `<text x="${ax.toFixed(2)}" y="${ay.toFixed(2)}" font-size="${fh.toFixed(2)}"
          font-family="Arial, sans-serif" fill="#1a1a1a" text-anchor="middle">${escapeXml(txt)}</text>`;
      }
    }
  }

  const cx = vbW / 2;
  const cy = vbH / 2;
  const textStr = `${Math.round(W)} × ${Math.round(H)}`;
  const fontSize = Math.max(10, Math.min(30, Math.max(W, H) / 8));
  const textW = textStr.length * fontSize * 0.6;

  pathStr += `<rect x="${cx - textW / 2}" y="${cy - fontSize * 0.7}" width="${textW}" height="${fontSize * 1.4}" fill="rgba(255,255,255,0.85)" rx="2" />`;
  pathStr += `<text x="${cx}" y="${cy + fontSize * 0.35}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#004a99" text-anchor="middle" font-weight="bold">${textStr}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" style="width:100%;height:100%;display:block;">${pathStr}</svg>`;
}

function buildPartCell(part, qty, dateStr) {
  let shift = '';
  try { shift = localStorage.getItem('raskladka.shift.v1') || 'Смена №1'; } catch(_){}
  
  let jobName = 'Задание';
  if (state.jobs && state.activeJobId) {
    const job = state.jobs.find(j => j.id === state.activeJobId);
    if (job) jobName = job.name;
  }

  const params = readParams();
  const qrData = `PART:${part.name}`;
  const qrSvg = makeQrSvg(qrData, { cellSize: 14, margin: 2 });
  const svgDrawing = buildPartSvg(part);

  return `<div class="part-label-card">
    <div class="part-label-header">
      <div class="part-label-title">ДЕТАЛЬ</div>
      <div class="part-label-name">${part.name}</div>
      <div class="part-label-top-info">
        <span>Габариты: <b>${Math.round(part.width)}×${Math.round(part.height)}</b></span>
        <span>Толщина: <b>${params.thickness} мм</b></span>
        <span>Кол-во: <b>${qty} шт</b></span>
      </div>
      <div class="part-label-sub-info">
        <span>${jobName}</span>
        <span>${shift}</span>
        <span>${dateStr}</span>
      </div>
    </div>
    <div class="part-label-drawing">${svgDrawing}</div>
    <div class="part-label-qr-big">${qrSvg}</div>
  </div>`;
}

function buildRemnantCell(r, dateStr) {
  const qrData = `R${Math.round(r.w)}X${Math.round(r.h)}`;
  const qrSvg = makeQrSvg(qrData, { cellSize: 12, margin: 2 });
  let shift = '';
  try { shift = localStorage.getItem('raskladka.shift.v1') || 'Смена №1'; } catch(_){}

  return `<div class="part-label-card">
    <div class="part-label-header">
      <div class="part-label-title">ОСТАТОК</div>
      <div class="part-label-name">Деловой отход</div>
      <div class="part-label-top-info">
        <span>Габариты: <b>${Math.round(r.w)}×${Math.round(r.h)}</b></span>
        <span>Площадь: <b>${((r.w * r.h) / 1e6).toFixed(3)} м²</b></span>
        <span>${shift}</span>
      </div>
    </div>
    <div class="part-label-qr-big" style="flex:1; align-items:center;">${qrSvg}</div>
  </div>`;
}

function buildSheetCell(item, dateStr) {
  const qrData = `SHEET:${item.W}x${item.H}x${item.T}`;
  const qrSvg = makeQrSvg(qrData, { cellSize: 12, margin: 2 });
  let shift = '';
  try { shift = localStorage.getItem('raskladka.shift.v1') || 'Смена №1'; } catch(_){}

  return `<div class="part-label-card">
    <div class="part-label-header">
      <div class="part-label-title">ЛИСТ ${item.num} из ${item.total}</div>
      <div class="part-label-name">Готовый раскрой</div>
      <div class="part-label-top-info">
        <span>Габариты: <b>${item.W}×${item.H}×${item.T}</b></span>
        <span>Деталей: <b>${item.placed} шт</b></span>
        <span>${shift}</span>
      </div>
    </div>
    <div class="part-label-qr-big" style="flex:1; align-items:center;">${qrSvg}</div>
  </div>`;
}

export function buildLabelsHtml() {
  if (!state.parts.length) return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Нет деталей для печати.</p>';

  const now = new Date();
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;
  
  let projectName = 'Без проекта';
  try {
    const pName = getCurrentProjectName();
    if (pName) projectName = pName.replace(/\.dxfnest\.json$/i, '');
  } catch(e){}

  const cards = state.parts.map(part => buildPartCell(part, part.qty, dateStr));
  const pagesHtml = paginateCards(cards, 4);
  
  const totalQty = state.parts.reduce((s, p) => s + p.qty, 0);

  return `<div class="labels-print-wrap">
    <div class="labels-header">
      <h1>Этикетки деталей</h1>
      <div class="labels-meta">
        <span>Проект: <b>${projectName}</b></span>
        <span>Дата: ${dateStr}</span>
        <span>Типов: ${state.parts.length} (Всего шт: ${totalQty})</span>
      </div>
    </div>
    ${pagesHtml}
    <div class="labels-footer">Сгенерировано автоматически</div>
  </div>`;
}

export function printLabels() {
  if (!state.parts.length) { alert('Сначала добавьте детали'); return; }
  doPrint(buildLabelsHtml(), 'portrait');
}

export function buildRemnantLabelsHtml() {
  const remnants = [];
  for (const sh of state.sheets) {
    if (!sh.remnants) continue;
    for (const r of sh.remnants) {
      if (r.w >= 20 && r.h >= 20) remnants.push(r);
    }
  }

  if (!remnants.length) return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Остатков не найдено.</p>';

  const now = new Date();
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;
  let projectName = 'Без проекта';
  try {
    const pName = getCurrentProjectName();
    if (pName) projectName = pName.replace(/\.dxfnest\.json$/i, '');
  } catch(e){}

  const cards = remnants.map(r => buildRemnantCell(r, dateStr));
  const pagesHtml = paginateCards(cards, 4);

  return `<div class="labels-print-wrap">
    <div class="labels-header">
      <h1>Этикетки остатков</h1>
      <div class="labels-meta">
        <span>Проект: <b>${projectName}</b></span>
        <span>Дата: ${dateStr}</span>
        <span>Всего: ${remnants.length}</span>
      </div>
    </div>
    ${pagesHtml}
    <div class="labels-footer">Сгенерировано автоматически</div>
  </div>`;
}

export function buildSheetLabelsHtml() {
  if (!state.sheets.length) return '<p style="text-align:center;padding:40px;font-size:16px;color:#999">Раскладка не выполнена.</p>';

  const params = readParams();
  const now = new Date();
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;
  let projectName = 'Без проекта';
  try {
    const pName = getCurrentProjectName();
    if (pName) projectName = pName.replace(/\.dxfnest\.json$/i, '');
  } catch(e){}

  const sheets = state.sheets.map((sh, si) => {
    const W = Math.round(params.sheetW);
    const H = Math.round(params.sheetH);
    const T = params.thickness;
    return { num: si + 1, total: state.sheets.length, placed: sh.placed.length, W, H, T };
  });

  const cards = sheets.map(item => buildSheetCell(item, dateStr));
  const pagesHtml = paginateCards(cards, 4);

  return `<div class="labels-print-wrap">
    <div class="labels-header">
      <h1>Этикетки листов</h1>
      <div class="labels-meta">
        <span>Проект: <b>${projectName}</b></span>
        <span>Дата: ${dateStr}</span>
      </div>
    </div>
    ${pagesHtml}
    <div class="labels-footer">Сгенерировано автоматически</div>
  </div>`;
}

export function buildTestLabelsHtml() {
  const testData = { kind: 'test', msg: 'Camera test successful' };
  const qrSvg = makeQrSvg(JSON.stringify(testData), { cellSize: 14, margin: 2 });
  const now = new Date();
  const dateStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${pad2(now.getFullYear())}`;

  return `<div class="test-labels-wrap">
    <div class="test-labels-header">
      <h1>Тест камеры</h1>
      <div class="test-labels-meta">Дата: ${dateStr}</div>
    </div>
    <div class="test-labels-page pdf-page">
      <div class="test-label">
        <div class="test-label-name">Тестовый QR-код</div>
        <div class="test-label-qr">${qrSvg}</div>
        <div class="test-label-info">Наведите камеру для проверки</div>
        <div class="test-label-date">${dateStr}</div>
      </div>
    </div>
  </div>`;
}