// js/report/report.js
import { $, escapeHtml as esc } from '../utils.js';
import { state } from '../state.js';
import { readParams } from '../params.js';
import { makeQrSvg } from '../qr-barcode.js';
import { getCurrentProjectName } from '../project-io.js';
import { getFinanceParams } from './finance.js';

// ИМПОРТ ВЫНЕСЕННЫХ ФУНКЦИЙ
import { buildReportHtml } from './report-table.js';
import { doPrint, printPartDrawing, printPartsDrawing, buildPartDrawingHtml } from './report-print.js';

// РЕЭКСПОРТ ДЛЯ СОВМЕСТИМОСТИ
export { buildReportHtml };
export { doPrint, printPartDrawing, printPartsDrawing, buildPartDrawingHtml };

const pad2 = n => String(n).padStart(2, '0');
const fmtLen = mm => (!isFinite(mm) || mm <= 0) ? '0'
  : (mm >= 10000 ? (mm / 1000).toFixed(2) + ' м' : Math.round(mm).toLocaleString('ru-RU') + ' мм');

export function computeUnplacedList(){
  const planned = {}, placed = {};
  for (const p of state.parts) planned[p.name] = (planned[p.name] || 0) + p.qty;
  for (const sh of state.sheets) for (const pl of sh.placed) {
    const n = state.parts[pl.partIdx]?.name;
    if (n) placed[n] = (placed[n] || 0) + 1;
  }
  const out = [];
  for (const [n, total] of Object.entries(planned)) {
    const done = placed[n] || 0;
    for (let i = 0; i < total - done; i++) out.push(n);
  }
  return out;
}

export function updateReport(unplaced, dt){
  const el = $('report');
  if (!state.sheets.length) { el.textContent = '—'; return; }
  const params = readParams();
  const unplacedList = (unplaced && unplaced.length) ? unplaced : computeUnplacedList();
  const totalPlaced = state.sheets.reduce((s, sh) => s + sh.placed.length, 0);
  const totalTask = state.parts.reduce((s, p) => s + p.qty, 0);
  const totalUnplaced = unplacedList.length;

  const density = params.density || 7850;
  const thicknessM = params.thickness / 1000;
  let totalWeight = 0;
  let totalArea = 0, totalCutLength = 0, totalPierces = 0;

  // ✅ ИСПРАВЛЕНО: убран лишний вложенный цикл по state.sheets,
  // который завышал площадь/вес/КПД в N раз (N = число листов).
  for (const sh of state.sheets) {
    for (const pl of sh.placed) {
      const part = state.parts[pl.partIdx];
      if (!part) continue;

      totalArea += part.area || 0;
      totalCutLength += part.length || 0;
      if (pl.polygons) totalPierces += pl.polygons.length;

      // Расчет веса
      totalWeight += ((part.area || 0) / 1e6) * thicknessM * density;
    }
  }

  const usedArea = state.sheets.length * params.sheetW * params.sheetH;
  const eff = usedArea ? (100 * totalArea / usedArea) : 0;

  // ─── РАСЧЕТ ФИНАНСОВ ───
  const fin = getFinanceParams();

  let costMaterial = (usedArea / 1e6) * (fin.materialPrice || 0);
  if (fin.kgPrice > 0) {
    costMaterial = totalWeight * fin.kgPrice;
  }
  const costPierce = totalPierces * (fin.piercePrice || 0);
  const costCut = (totalCutLength / 1000) * (fin.cutPrice || 0);
  const timeHours = (totalCutLength / 90) / 60;
  const costMachine = timeHours * (fin.machineHour || 0);

  const totalCost = costMaterial + costPierce + costCut + costMachine;

  let remnantArea = 0, remnantCount = 0, cutCount = 0, cutLen = 0;
  for (const sh of state.sheets) {
    if (sh.remnants) for (const r of sh.remnants) { remnantArea += r.w * r.h; remnantCount++; }
    if (sh.cuts) for (const c of sh.cuts) { cutCount++; cutLen += Math.hypot(c.x2 - c.x1, c.y2 - c.y1); }
  }

  // ─── БЛОК ФИНАНСОВ (ТАБЛИЦА) ───
  let finHtml = '';
  if (totalCost > 0) {
    finHtml = `
      <div style="margin-top: 15px; border-top: 2px solid #ccc; padding-top: 10px;">
        <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px; color:#a05200;">💰 Финансы</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.4;">
          <thead>
            <tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
              <th style="text-align: left; padding: 4px;">Наименование</th>
              <th style="text-align: center; padding: 4px;">Ед. изм.</th>
              <th style="text-align: center; padding: 4px;">Кол-во</th>
              <th style="text-align: right; padding: 4px;">Цена</th>
              <th style="text-align: right; padding: 4px;">Сумма</th>
            </tr>
          </thead>
          <tbody>
                      ${fin.kgPrice > 0 ? `
            <tr style="border-bottom: 1px solid #eee; background:#eaf4ff;">
              <td style="padding: 4px; font-weight:bold; color:#004a99;">Металл (вес)</td>
              <td style="text-align: center;">кг</td>
              <td style="text-align: center;">${totalWeight.toFixed(2)}</td>
              <td style="text-align: right;">${fin.kgPrice}</td>
              <td style="text-align: right; font-weight:600;">${(totalWeight * fin.kgPrice).toFixed(2)}</td>
            </tr>` : `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 4px;">Металл (площадь)</td>
              <td style="text-align: center;">м²</td>
              <td style="text-align: center;">${(usedArea/1e6).toFixed(2)}</td>
              <td style="text-align: right;">${fin.materialPrice}</td>
              <td style="text-align: right; font-weight:600;">${costMaterial.toFixed(2)}</td>
            </tr>`}
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 4px;">Работа станка</td>
              <td style="text-align: center;">ч</td>
              <td style="text-align: center;">${timeHours.toFixed(2)}</td>
              <td style="text-align: right;">${fin.machineHour}</td>
              <td style="text-align: right; font-weight:600;">${costMachine.toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 4px;">Резка (длина)</td>
              <td style="text-align: center;">м</td>
              <td style="text-align: center;">${(totalCutLength/1000).toFixed(2)}</td>
              <td style="text-align: right;">${fin.cutPrice}</td>
              <td style="text-align: right; font-weight:600;">${costCut.toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 4px;">Врезки</td>
              <td style="text-align: center;">шт</td>
              <td style="text-align: center;">${totalPierces}</td>
              <td style="text-align: right;">${fin.piercePrice}</td>
              <td style="text-align: right; font-weight:600;">${costPierce.toFixed(2)}</td>
            </tr>
            <tr style="font-weight: bold; font-size: 16px; background: #fff8e1;">
              <td colspan="4" style="text-align: right; padding: 6px;">ИТОГО:</td>
              <td style="text-align: right; padding: 6px; color: #a05200;">${totalCost.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  let unplacedHtml = '';
  if (unplacedList.length) {
    const c = {}; for (const n of unplacedList) c[n] = (c[n] || 0) + 1;
    const items = Object.entries(c).map(([n, k]) => `<div style="padding-left:10px; color:#b00;">• ${n} ×${k}</div>`).join('');
    unplacedHtml = `
      <div style="margin-top: 15px; padding: 10px; background: #fdeaea; border: 1px solid #f5c2c2; border-radius: 6px;">
        <div style="font-weight: bold; color: #b00; font-size: 15px; margin-bottom: 4px;">⚠ Не поместились (${unplacedList.length}):</div>
        ${items}
      </div>`;
  }

  el.innerHTML = `
    <div style="line-height: 1.5; font-size: 16px;">
      <div><b>Листов:</b> ${state.sheets.length} <span style="color:#888; font-size:14px;">(лимит ${params.maxSheets})</span></div>
      <div><b>Задано деталей:</b> ${totalTask}</div>
      <div><b>Разложено:</b> <span class="good">${totalPlaced}</span></div>
      <div><b>Врезок:</b> ${totalPierces}</div>
      <div><b>Длина реза:</b> <span class="len">${(totalCutLength/1000).toFixed(2)} м</span></div>
      <div><b>КПД:</b> ${eff.toFixed(1)}%</div>
	  <div><b>Вес металла:</b> <span style="color:#004a99; font-weight:bold;">${totalWeight.toFixed(2)} кг</span></div>
      
      ${remnantCount>0 ? `<div><b>Деловой отход:</b> <span class="rem">${remnantCount} шт (${(remnantArea/1e6).toFixed(2)} м²)</span></div>` : ''}
      ${cutCount>0 ? `<div><b>Резы листа:</b> ${cutCount} шт (${cutLen.toFixed(0)} мм)</div>` : ''}
      
      ${finHtml}
      ${unplacedHtml}
      
      ${dt !== undefined ? `<div style="font-size:12px; color:#888; text-align:right; margin-top:10px;">Расчет: ${dt} мс</div>` : ''}
    </div>
  `;
}

export function openReportModal(){
  const src = $('report'), dst = $('reportContent');
  if (src && dst) dst.innerHTML = src.innerHTML || '—';
  $('reportModal').classList.add('active');
}
export function closeReportModal(){ $('reportModal').classList.remove('active'); }

// ═══════════════════════════════════════════════════════════════
// КАРТА РАСКРОЯ
// ═══════════════════════════════════════════════════════════════
export function buildSheetSvg(sheet, si, params, counterRef){
  const SW = params.sheetW, SH = params.sheetH;
  const m = Math.max(SW, SH);
  
  const strokeSheet = m/400; 
  const strokePart = m/350; 
  const strokeMargin = m/1000; 
  const strokeRem = m/500;
  
  const dashA = m/70, dashB = m/110;
  const labelSize = Math.max(m/50, 10), nameSize = Math.max(m/80, 6), remSize = Math.max(m/100, 6);
  let body = '';

  if (params.sheetPolygons && params.sheetPolygons.length) {
    for (const ring of params.sheetPolygons) {
      if (ring.length < 2) continue;
      const pts = ring.map(([x, y]) => `${x.toFixed(2)},${(SH-y).toFixed(2)}`).join(' ');
      body += `<polygon points="${pts}" fill="#fff" stroke="#000" stroke-width="${strokeSheet}" fill-rule="evenodd"/>`;
    }
  } else {
    body += `<rect x="0" y="0" width="${SW}" height="${SH}" fill="#fff" stroke="#000" stroke-width="${strokeSheet}"/>`;
    if (params.edge > 0) body += `<rect x="${params.edge}" y="${params.edge}" width="${SW-2*params.edge}" height="${SH-2*params.edge}" fill="none" stroke="#888" stroke-width="${strokeMargin}" stroke-dasharray="${dashA} ${dashB}"/>`;
  }

  if (sheet.remnants) for (const r of sheet.remnants) {
    const rx = r.rect.x1, ry = SH - r.rect.y2, rw = r.rect.x2 - r.rect.x1, rh = r.rect.y2 - r.rect.y1;
    body += `<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="#c8f0cd" fill-opacity="0.35" stroke="none"/>`;
  }

  for (const pl of sheet.placed) {
    const part = state.parts[pl.partIdx];
    if (!part) continue;
    counterRef.n++;
    const num = counterRef.n;
    
    if (!counterRef.byPart.has(pl.partIdx)) {
      counterRef.byPart.set(pl.partIdx, { name: part.name, w: part.width, h: part.height, qty: 0, sheets: new Set(), layers: new Set(), cuts: new Set(), length: part.length || 0 });
    }
    const rec = counterRef.byPart.get(pl.partIdx);
    rec.qty++; rec.sheets.add(si + 1);
    rec.layers.add(pl.layerId || 1);
    if (pl._cutOrder) rec.cuts.add(pl._cutOrder);

    for (const ring of pl.polygons) {
      if (ring.length < 2) continue;
      const pts = ring.map(([x, y]) => `${(params.edge+pl.x+x).toFixed(2)},${(SH-(params.edge+pl.y+y)).toFixed(2)}`).join(' ');
      body += `<polygon points="${pts}" fill="none" stroke="#d00000" stroke-width="${strokePart}"/>`;
    }

    const pw = pl.bbox[2] - pl.bbox[0], ph = pl.bbox[3] - pl.bbox[1];
    if (pl._cutOrder) {
      const bx = params.edge + pl.bbox[2] - 10, by = SH - (params.edge + pl.bbox[3]) + 10;
      body += `<circle cx="${bx.toFixed(2)}" cy="${by.toFixed(2)}" r="8" fill="#ff8c00" stroke="#000" stroke-width="1.5"/>`;
      body += `<text x="${bx.toFixed(2)}" y="${(by+3).toFixed(2)}" font-size="11" font-family="Arial,sans-serif" text-anchor="middle" fill="#fff" font-weight="bold">${pl._cutOrder}</text>`;
    }

    const cx = params.edge + pl.x + pw/2, cy = SH - (params.edge + pl.y + ph/2);
    const estW = String(part.name).length * nameSize * 0.55;
    const fitsIn = estW <= pw * 0.95, fitsH = ph >= (labelSize + nameSize) * 1.6;
    const numY = fitsH ? cy - nameSize * 0.15 : cy + labelSize / 3;
    body += `<text x="${cx.toFixed(2)}" y="${numY.toFixed(2)}" font-size="${labelSize}" font-family="Arial,sans-serif" text-anchor="middle" fill="#004a99" font-weight="bold">${num}</text>`;
    if (fitsIn && fitsH) {
      body += `<text x="${cx.toFixed(2)}" y="${(numY+nameSize*1.25).toFixed(2)}" font-size="${nameSize}" font-family="Arial,sans-serif" text-anchor="middle" fill="#004a99">${esc(part.name)}</text>`;
    } else if (!fitsH) {
      const topY = SH - (params.edge + pl.y + ph);
      body += `<text x="${cx.toFixed(2)}" y="${(topY-Math.max(nameSize*1.2,3)).toFixed(2)}" font-size="${nameSize}" font-family="Arial,sans-serif" text-anchor="middle" fill="#004a99">${num}. ${esc(part.name)}</text>`;
    }
  }

  if (sheet.cuts) for (const c of sheet.cuts) {
    body += `<line x1="${c.x1.toFixed(2)}" y1="${(SH-c.y1).toFixed(2)}" x2="${c.x2.toFixed(2)}" y2="${(SH-c.y2).toFixed(2)}" stroke="#ff6400" stroke-width="${strokePart}" stroke-dasharray="${dashA} ${dashB}"/>`;
  }

  if (sheet.remnants) for (const r of sheet.remnants) {
    body += `<line x1="${r.cut.x1.toFixed(2)}" y1="${(SH-r.cut.y1).toFixed(2)}" x2="${r.cut.x2.toFixed(2)}" y2="${(SH-r.cut.y2).toFixed(2)}" stroke="#2a9a3c" stroke-width="${strokeRem}"/>`;
    const cx = (r.rect.x1 + r.rect.x2)/2, cy = SH - (r.rect.y1 + r.rect.y2)/2;
    body += `<text x="${cx.toFixed(2)}" y="${(cy-remSize*0.1).toFixed(2)}" font-size="${remSize}" font-family="Arial,sans-serif" text-anchor="middle" fill="#1a6a25" font-weight="bold">ДЕЛОВОЙ ОТХОД</text>`;
    body += `<text x="${cx.toFixed(2)}" y="${(cy+remSize*0.9).toFixed(2)}" font-size="${(remSize*0.8).toFixed(2)}" font-family="Arial,sans-serif" text-anchor="middle" fill="#1a6a25">${Math.round(r.w)} × ${Math.round(r.h)} мм</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function buildLayoutHtml(opts = {}){
  const { includeSpec = true } = opts;

  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const now = new Date();
  const dt = `${pad2(now.getDate())}.${pad2(now.getMonth()+1)}.${pad2(now.getFullYear())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  let projectFileName = '';
  try {
    projectFileName = typeof getCurrentProjectName === 'function' ? getCurrentProjectName() : '';
  } catch (_) {}
  if (!projectFileName) projectFileName = 'Без_имени.dxfnest.json';
  const projectLabel = projectFileName.replace(/\.dxfnest\.json$/i, '');

  let qrDataUri = '';
  try {
    const qrSvgStr = makeQrSvg(`PROJECT:${projectFileName}`, { cellSize: 12, margin: 2 });
    if (qrSvgStr) qrDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvgStr);
  } catch (_) {}

  const css = `<style>
    @page { size: A4 landscape; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff; overflow: hidden; height: 100%; }
    .print-container { margin: 0; padding: 0; overflow: hidden; height: 100%; }
    .pdf-page {
        width: 297mm; height: 209mm; padding: 0; margin: 0; box-sizing: border-box;
        background: #fff; page-break-after: always; break-after: page; overflow: hidden; position: relative; display: block;
        font-family: Arial, sans-serif; color: #000;
    }
    .pdf-page:last-child { page-break-after: auto; break-after: auto; }
    
    .pdf-page.legend-page { padding: 10mm 15mm !important; }
    .eskd-spec-title{text-align:center;font-size:22px;font-weight:bold;color:#004a99;margin:0 0 10px;}
    .eskd-spec-sub{text-align:center;font-size:14px;color:#555;margin-bottom:20px;}
    .legend-table{width:100%;border-collapse:collapse;font-size:14px;}
    .legend-table th,.legend-table td{border:1px solid #000;padding:6px 10px;text-align:left;}
    .legend-table th{background:#eaf2fc;font-weight:bold;text-align:center;}
    .legend-table .num{text-align:center;}
    .legend-table .totals-row td{background:#f5f5f5;font-weight:bold;}
  </style>`;

  const counterRef = { n: 0, byPart: new Map() };
  const cardPages = state.sheets.map((sheet, si) => {
    const svg = buildSheetSvg(sheet, si, params, counterRef);
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const sheetLabel = state.sheets.length > 1 ? `Лист ${si+1} из ${state.sheets.length}` : 'Лист 1';
    
    return `<div class="pdf-page layout-page">
  <div style="position: absolute; top: 5mm; left: 5mm; right: 5mm; bottom: 5mm; border: 2px solid #000; box-sizing: border-box;">
    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 10mm; border-bottom: 1.5px solid #000; background: #f5f8fc; display: flex; justify-content: space-between; align-items: center; padding: 0 3mm; box-sizing: border-box; font-size: 12px; font-weight: normal; white-space: nowrap;">
      <span>Карта раскроя по проекту: <b style="font-family:monospace; color:#004a99;">${esc(projectFileName)}</b></span>
      <span>Заготовка: <b>${Math.round(SW)}*${Math.round(SH)}</b> Толщина: <b>${params.thickness} мм</b></span>
      <span>Деталей: <b>${sheet.placed.length} шт.</b></span>
      <span>Дата проекта: <b>${dt.split(' ')[0]}</b></span>
      <span style="font-weight:bold; color:#004a99;">${sheetLabel}</span>
    </div>
    
    <div style="position: absolute; top: 12mm; left: 3mm; width: 78mm; height: 78mm; z-index: 100; background: #fff;">
        ${qrDataUri ? `<img src="${qrDataUri}" style="width: 100%; height: 100%; object-fit: contain; display: block;">` : ''}
    </div>

    <div style="position: absolute; top: 10mm; bottom: 30mm; left: 85mm; right: 0; display: flex; align-items: center; justify-content: center; padding: 2mm; box-sizing: border-box;">
        <img src="${dataUri}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;">
    </div>
    
    <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 30mm; border-top: 1.5px solid #000; box-sizing: border-box;">
      <table style="height: 100%; width: 100%; border-collapse: collapse; table-layout: fixed;">
        <tr style="height: 25%;">
          <td style="border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; width: 33.33%; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Изм.:</span><span style="font-weight: bold;">—</span></td>
          <td style="border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; width: 33.33%; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Лист:</span><span style="font-weight: bold;">${si+1}</span></td>
          <td style="border-bottom: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; width: 33.34%; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Листов:</span><span style="font-weight: bold;">${state.sheets.length}</span></td>
        </tr>
        <tr style="height: 25%;">
          <td colspan="3" style="border-bottom: 1px solid #000; padding-left: 3mm; vertical-align: middle; text-align: left; font-size: 13px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Наименование:</span><span style="font-weight: bold; word-break: break-all;">${esc(projectFileName)}</span></td>
        </tr>
        <tr style="height: 25%;">
          <td style="border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Заготовка:</span><span style="font-weight: bold;">${Math.round(SW)}×${Math.round(SH)}</span><span style="color: #555; text-transform: uppercase; margin-left: 4mm; margin-right: 2mm;">Толщина:</span><span style="font-weight: bold;">${params.thickness} мм</span></td>
          <td style="border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Деталей:</span><span style="font-weight: bold;">${sheet.placed.length}</span></td>
          <td style="border-bottom: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Масштаб:</span><span style="font-weight: bold;">1:1</span></td>
        </tr>
        <tr style="height: 25%;">
          <td style="border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Дата:</span><span style="font-weight: bold;">${dt.split(' ')[0]}</span></td>
          <td style="border-right: 1px solid #000; text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Отступ:</span><span style="font-weight: bold;">${params.edge} мм</span></td>
          <td style="text-align: left; padding-left: 3mm; vertical-align: middle; font-size: 12px;"><span style="color: #555; text-transform: uppercase; margin-right: 2mm;">Kerf/Зазор:</span><span style="font-weight: bold;">${params.kerf}/${params.gap} мм</span></td>
        </tr>
      </table>
    </div>
  </div>
</div>`;
  }).join('');

  let totalQty = 0;
  let totalLayoutLength = 0;
  const legendRows = [...counterRef.byPart.values()].map((rec, i) => {
    totalQty += rec.qty;
    const lineLen = (rec.length || 0) * rec.qty;
    totalLayoutLength += lineLen;
    const layerNames = [...(rec.layers || [])].sort((a,b)=>a-b).join(', ');
    const cutNames = [...(rec.cuts || [])].sort((a,b)=>a-b).join(', ');
    return `<tr>
      <td class="num">${i+1}</td>
      <td>${esc(rec.name)}</td>
      <td class="num">${layerNames}</td>
      <td class="num">${cutNames}</td>
      <td class="num">${rec.w.toFixed(1)} × ${rec.h.toFixed(1)}</td>
      <td class="num"><b>${rec.qty}</b></td>
      <td class="num">${fmtLen(lineLen)}</td>
      <td class="num">${[...rec.sheets].sort((a,b)=>a-b).join(', ')}</td>
    </tr>`;
  }).join('');

  const totalRow = counterRef.byPart.size
    ? `<tr class="totals-row"><td colspan="5" style="text-align:right">ИТОГО:</td><td class="num">${totalQty}</td><td class="num">${fmtLen(totalLayoutLength)}</td><td class="num">—</td></tr>`
    : '';

  const specPage = includeSpec ? `<div class="pdf-page legend-page">
  <div class="eskd-spec-title">${esc(projectLabel)} — Спецификация деталей</div>
  <div class="eskd-spec-sub">Дата: ${dt} · Листов: ${state.sheets.length} · Заготовка: ${Math.round(SW)} × ${Math.round(SH)} × ${params.thickness} мм</div>
  <table class="legend-table">
    <thead><tr>
      <th style="width:12mm">№</th>
      <th>Наименование детали</th>
      <th style="width:15mm">Слой</th>
      <th style="width:15mm">№ реза</th>
      <th style="width:38mm">Размер, мм</th>
      <th style="width:22mm">Кол-во, шт</th>
      <th style="width:40mm">Длина линии, мм</th>
      <th style="width:22mm">Лист</th>
    </tr></thead>
    <tbody>${legendRows || '<tr><td colspan="8" style="text-align:center;font-style:italic">—</td></tr>'}${totalRow}</tbody>
  </table>
</div>` : '';

  const content = `<div class="print-container">${cardPages}${specPage}</div>`;
  return (css + content).replace(/>\s+</g, '><');
}