// js/report/report-print.js
import { escapeHtml as esc, todayIso } from '../utils.js';
import { readParams } from '../params.js';
import { getStampData } from './sheet-stamp-settings.js';

export async function doPrint(html, orientation, suggestedName){
  const { generatePdfBlob } = await import('../dialogs/pdf-maker.js');
  
  try {
    const blob = await generatePdfBlob(html, orientation);
    const url = URL.createObjectURL(blob);
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 10000);
    };
  } catch (e) {
    alert('Ошибка подготовки к печати: ' + e.message);
  }
}

function buildEskdFrame() {
  const pageW = 210, pageH = 297;
  let s = '';
  const margin = 2;
  s += `<rect x="${margin}" y="${margin}"
    width="${pageW - margin*2}" height="${pageH - margin*2}"
    fill="none" stroke="#000" stroke-width="0.4"/>`;
  const fx = 20, fy = 5, fw = 185, fh = 287;
  s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}"
    fill="none" stroke="#000" stroke-width="0.7"/>`;
  return s;
}

function buildEskdStamp(part, params, scale, pageW = 210, pageH = 297) {
  const stampX = 20;
  const stampY = pageH - 5 - 55;
  const stampW = 185;
  const stampH = 55;
  const leftW = 65;
  const rightX = stampX + leftW;
  const rightW = stampW - leftW;

  const data = getStampData();

  let s = '';
  s += `<rect x="${stampX}" y="${stampY}" width="${stampW}" height="${stampH}" fill="#fff" stroke="#000" stroke-width="0.7"/>`;

  for (let i = 1; i < 5; i++) {
    s += `<line x1="${stampX}" y1="${stampY + i * 5}" x2="${stampX + leftW}" y2="${stampY + i * 5}" stroke="#000" stroke-width="0.35"/>`;
  }
  s += `<line x1="${stampX + 7}" y1="${stampY}" x2="${stampX + 7}" y2="${stampY + 25}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${stampX + 17}" y1="${stampY}" x2="${stampX + 17}" y2="${stampY + 25}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${stampX + 40}" y1="${stampY}" x2="${stampX + 40}" y2="${stampY + 25}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${stampX + 55}" y1="${stampY}" x2="${stampX + 55}" y2="${stampY + 25}" stroke="#000" stroke-width="0.35"/>`;

  const hdr1 = [
    { label: 'Изм.', x: stampX + 3.5 },
    { label: 'Лист', x: stampX + 12 },
    { label: '№ докум.', x: stampX + 28.5 },
    { label: 'Подп.', x: stampX + 47.5 },
    { label: 'Дата', x: stampX + 60 },
  ];
  hdr1.forEach(h => {
    s += `<text x="${h.x}" y="${stampY + 3.5}" font-size="2.4" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">${h.label}</text>`;
  });

  for (let i = 1; i < 5; i++) {
    s += `<line x1="${stampX}" y1="${stampY + 25 + i * 6}" x2="${stampX + leftW}" y2="${stampY + 25 + i * 6}" stroke="#000" stroke-width="0.35"/>`;
  }
  s += `<line x1="${stampX + 17}" y1="${stampY + 25}" x2="${stampX + 17}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${stampX + 40}" y1="${stampY + 25}" x2="${stampX + 40}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${stampX + 55}" y1="${stampY + 25}" x2="${stampX + 55}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;

  const rows2 = [
    { label: 'Разраб.', value: data.developer },
    { label: 'Пров.',   value: data.checker },
    { label: 'Т.контр.', value: data.techControl },
    { label: 'Н.контр.', value: data.normControl },
    { label: 'Утв.',    value: data.approver },
  ];
  rows2.forEach((row, i) => {
    const y = stampY + 25 + i * 6 + 4;
    s += `<text x="${stampX + 2}" y="${y}" font-size="2.4" font-family="Arial, sans-serif" fill="#000">${row.label}</text>`;
    if (row.value) {
      s += `<text x="${stampX + 18}" y="${y}" font-size="2.4" font-family="Arial, sans-serif" fill="#000">${esc(row.value)}</text>`;
    }
  });

  s += `<line x1="${rightX}" y1="${stampY}" x2="${rightX}" y2="${stampY + stampH}" stroke="#000" stroke-width="0.5"/>`;
  s += `<line x1="${rightX}" y1="${stampY + 15}" x2="${stampX + stampW}" y2="${stampY + 15}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${rightX}" y1="${stampY + 40}" x2="${stampX + stampW}" y2="${stampY + 40}" stroke="#000" stroke-width="0.35"/>`;

  const designation = (part.name || 'ДЕТАЛЬ').replace(/\.dxf$/i, '').toUpperCase();
  s += `<text x="${rightX + rightW / 2}" y="${stampY + 9.5}" font-size="4.5" font-family="Arial, sans-serif" fill="#000" text-anchor="middle" font-weight="bold">${esc(designation)}</text>`;

  const W = part.width || 0;
  const H = part.height || 0;
  const nameShort = (part.name || '').replace(/\.dxf$/i, '');
  const scaleText = (() => {
    if (!scale || !isFinite(scale) || scale <= 0) return '1:1';
    const n = 1 / scale;
    if (n >= 0.95 && n <= 1.05) return '1:1';
    if (n >= 1.9 && n <= 2.1) return '1:2';
    if (n >= 4.8 && n <= 5.2) return '1:5';
    if (n >= 9.5 && n <= 10.5) return '1:10';
    if (n >= 19 && n <= 21) return '1:20';
    if (n >= 49 && n <= 51) return '1:50';
    if (n >= 99 && n <= 101) return '1:100';
    return '1:' + n.toFixed(2).replace(/\.00$/, '');
  })();

  const areaMm2 = (part.area && isFinite(part.area) && part.area > 0)
    ? part.area
    : (W * H);
  const thicknessMm = Number(params.thickness) || 0;
  const volumeCm3 = (areaMm2 * thicknessMm) / 1000;
  const massKg = volumeCm3 * 7.85 / 1000;

  s += `<text x="${rightX + rightW / 2}" y="${stampY + 21}" font-size="3" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">Деталь</text>`;
  s += `<text x="${rightX + rightW / 2}" y="${stampY + 26.5}" font-size="2.8" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">${esc(nameShort)}</text>`;
  s += `<text x="${rightX + rightW / 2}" y="${stampY + 32}" font-size="2.6" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">${esc(data.material || 'Ст3')}</text>`;
  s += `<text x="${rightX + rightW / 2}" y="${stampY + 37}" font-size="2.6" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">${Math.round(W)}×${Math.round(H)}×${thicknessMm} мм · ${massKg.toFixed(3)} кг · М ${scaleText}</text>`;

  s += `<line x1="${rightX + 15}" y1="${stampY + 40}" x2="${rightX + 15}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${rightX + 35}" y1="${stampY + 40}" x2="${rightX + 35}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;
  s += `<line x1="${rightX + 60}" y1="${stampY + 40}" x2="${rightX + 60}" y2="${stampY + 55}" stroke="#000" stroke-width="0.35"/>`;

  s += `<text x="${rightX + 7.5}" y="${stampY + 43.5}" font-size="2.4" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">Лит.</text>`;
  s += `<text x="${rightX + 25}" y="${stampY + 43.5}" font-size="2.4" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">Лист</text>`;
  s += `<text x="${rightX + 47.5}" y="${stampY + 43.5}" font-size="2.4" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">Листов</text>`;

  s += `<text x="${rightX + 7.5}" y="${stampY + 51}" font-size="3.5" font-family="Arial, sans-serif" fill="#000" text-anchor="middle" font-weight="bold">${esc(data.litera || 'О')}</text>`;
  s += `<text x="${rightX + 25}" y="${stampY + 51}" font-size="3.5" font-family="Arial, sans-serif" fill="#000" text-anchor="middle" font-weight="bold">1</text>`;
  s += `<text x="${rightX + 47.5}" y="${stampY + 51}" font-size="3.5" font-family="Arial, sans-serif" fill="#000" text-anchor="middle" font-weight="bold">1</text>`;

  s += `<text x="${rightX + 90}" y="${stampY + 43.5}" font-size="2.4" font-family="Arial, sans-serif" fill="#000" text-anchor="middle">${esc(data.organization || 'JS_CAM')}</text>`;
  s += `<text x="${rightX + 90}" y="${stampY + 51}" font-size="3.2" font-family="Arial, sans-serif" fill="#000" text-anchor="middle" font-weight="bold">РАСКЛАДКА</text>`;

  return s;
}

function computeFullBBox(part) {
  const W = part.width || 1;
  const H = part.height || 1;

  let minX = 0, minY = 0, maxX = W, maxY = H;

  if (Array.isArray(part.dimLines)) {
    for (const dl of part.dimLines) {
      if (dl.type === 'line') {
        if (isFinite(dl.x1)) { minX = Math.min(minX, dl.x1); maxX = Math.max(maxX, dl.x1); }
        if (isFinite(dl.x2)) { minX = Math.min(minX, dl.x2); maxX = Math.max(maxX, dl.x2); }
        if (isFinite(dl.y1)) { minY = Math.min(minY, dl.y1); maxY = Math.max(maxY, dl.y1); }
        if (isFinite(dl.y2)) { minY = Math.min(minY, dl.y2); maxY = Math.max(maxY, dl.y2); }
      } else if (dl.type === 'solid' && Array.isArray(dl.points)) {
        for (const [px, py] of dl.points) {
          if (isFinite(px)) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); }
          if (isFinite(py)) { minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
        }
      }
    }
  }

  if (Array.isArray(part.annotations)) {
    for (const an of part.annotations) {
      if (!isFinite(an.x) || !isFinite(an.y)) continue;
      const hh = Number(an.height) || 5;
      const txt = String(an.text || '');
      const approxW = hh * txt.length * 0.6;
      const rot = Number(an.rotation) || 0;
      const isVertical = Math.abs(rot) > 45 && Math.abs(rot) < 135;
      const bw = isVertical ? hh : approxW;
      const bh = isVertical ? approxW : hh;
      minX = Math.min(minX, an.x - bw / 2);
      maxX = Math.max(maxX, an.x + bw / 2);
      minY = Math.min(minY, an.y - bh / 2);
      maxY = Math.max(maxY, an.y + bh / 2);
    }
  }

  const fullW = Math.max(1, maxX - minX);
  const fullH = Math.max(1, maxY - minY);
  const padWorld = Math.max(fullW, fullH) * 0.04;
  minX -= padWorld; maxX += padWorld;
  minY -= padWorld; maxY += padWorld;

  return { minX, minY, maxX, maxY };
}

export function buildPartDrawingSvg(part, params){
  const pageW = 210, pageH = 297;

  const fx = 20, fy = 5, fw = 185, fh = 287;
  const stampH = 55;

  const areaLeft   = fx + 8;
  const areaRight  = fx + fw - 8;
  const areaTop    = fy + 8;
  const areaBottom = fy + fh - stampH - 8;

  const availW = areaRight - areaLeft;
  const availH = areaBottom - areaTop;

  const { minX, minY, maxX, maxY } = computeFullBBox(part);
  const fullW = maxX - minX;
  const fullH = maxY - minY;

  const scale = Math.min(availW / fullW, availH / fullH);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centerX = (areaLeft + areaRight) / 2;
  const centerY = (areaTop + areaBottom) / 2;

  const toPx = (x) => centerX + (x - cx) * scale;
  const toPy = (y) => centerY - (y - cy) * scale;

  let body = '';
  body += buildEskdFrame();

  for (const ring of part.polygons || []) {
    if (ring.length < 2) continue;
    const pts = ring.map(([x, y]) => `${toPx(x).toFixed(2)},${toPy(y).toFixed(2)}`).join(' ');
    body += `<polygon points="${pts}" fill="none" stroke="#000" stroke-width="0.35"/>`;
  }

  if (Array.isArray(part.dimLines)) {
    for (const dl of part.dimLines) {
      if (dl.type === 'line') {
        body += `<line x1="${toPx(dl.x1).toFixed(2)}" y1="${toPy(dl.y1).toFixed(2)}"
          x2="${toPx(dl.x2).toFixed(2)}" y2="${toPy(dl.y2).toFixed(2)}"
          stroke="#000" stroke-width="0.22"/>`;
      } else if (dl.type === 'solid' && Array.isArray(dl.points) && dl.points.length >= 3) {
        const pts = dl.points.map(([x, y]) => `${toPx(x).toFixed(2)},${toPy(y).toFixed(2)}`).join(' ');
        body += `<polygon points="${pts}" fill="#000" stroke="none"/>`;
      }
    }
  }

  if (Array.isArray(part.annotations)) {
    for (const an of part.annotations) {
      if (!an.text) continue;
      const txt = String(an.text).trim();
      if (!txt) continue;

      const ax = toPx(an.x);
      const ay = toPy(an.y);
      const fh = Math.max(2.2, Math.min(6, (Number(an.height) || 5) * scale * 1.05));
      const rotDeg = Number(an.rotation) || 0;
      const rot = -rotDeg;

      if (Math.abs(rot) > 0.5) {
        body += `<text x="${ax.toFixed(2)}" y="${ay.toFixed(2)}" font-size="${fh.toFixed(2)}"
          font-family="Arial, Helvetica, sans-serif" fill="#000"
          text-anchor="middle" transform="rotate(${rot.toFixed(2)} ${ax.toFixed(2)} ${ay.toFixed(2)})">${esc(txt)}</text>`;
      } else {
        body += `<text x="${ax.toFixed(2)}" y="${ay.toFixed(2)}" font-size="${fh.toFixed(2)}"
          font-family="Arial, Helvetica, sans-serif" fill="#000"
          text-anchor="middle">${esc(txt)}</text>`;
      }
    }
  }

  body += buildEskdStamp(part, params, scale, pageW, pageH);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}"
    preserveAspectRatio="xMidYMid meet"
    style="width:100%;height:100%;display:block;background:#fff;">${body}</svg>`;
}

export function buildPartDrawingHtml(part, params){
  const svg = buildPartDrawingSvg(part, params);
  return `<style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .esdk-sheet {
      width: 200mm; height: 276mm;
      max-width: 100%;
      margin: 0 auto; padding: 0;
      line-height: 0; font-size: 0;
      overflow: hidden;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      break-inside: avoid;
      display: block;
      box-sizing: border-box;
    }
  </style>
  <div class="esdk-sheet">${svg}</div>`;
}

export function buildMultiPartDrawingHtml(parts, params){
  const total = parts.length;
  const sheets = parts.map((part, i) => {
    const svg = buildPartDrawingSvg(part, params);
    const br = (i < total - 1) ? 'page-break-after: always; break-after: page;' : '';
    return `<div class="esdk-sheet" style="${br}">${svg}</div>`;
  }).join('');

  return `<style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .esdk-sheet {
      width: 200mm; height: 276mm;
      max-width: 100%;
      margin: 0 auto; padding: 0;
      line-height: 0; font-size: 0;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
      display: block;
      box-sizing: border-box;
    }
  </style>${sheets}`;
}

export function printPartDrawing(part, suggestedName){
  if (!part) { alert('Не выбрана деталь'); return; }
  const params = readParams();
  const html = buildPartDrawingHtml(part, params);
  const cleanName = String(part.name || 'деталь').replace(/\.[^.]+$/, '');
  doPrint(html, 'portrait', suggestedName || `Чертеж_${cleanName}_${todayIso()}`);
}

export function printPartsDrawing(parts, suggestedName){
  if (!parts || !parts.length) { alert('Не выбраны детали'); return; }
  const params = readParams();
  const html = buildMultiPartDrawingHtml(parts, params);
  doPrint(html, 'portrait', suggestedName || `Чертежи_${parts.length}шт_${todayIso()}`);
}