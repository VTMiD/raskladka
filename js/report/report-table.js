// js/report/report-table.js
import { escapeHtml as esc } from '../utils.js';
import { state } from '../state.js';
import { readParams } from '../params.js';
import { makeQrSvg } from '../qr-barcode.js';
import { getCurrentProjectName } from '../project-io.js';
import { getFinanceParams } from './finance.js';

const pad2 = n => String(n).padStart(2, '0');
const fmtLen = mm => (!isFinite(mm) || mm <= 0) ? '0'
  : (mm >= 10000 ? (mm / 1000).toFixed(2) + ' м' : Math.round(mm).toLocaleString('ru-RU') + ' мм');

export function buildReportHtml(){
  const params = readParams();
  const now = new Date();
  const dt = `${pad2(now.getDate())}.${pad2(now.getMonth()+1)}.${pad2(now.getFullYear())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  let projectFileName = '';
  try {
    projectFileName = typeof getCurrentProjectName === 'function' ? getCurrentProjectName() : '';
  } catch (_) {}
  if (!projectFileName) projectFileName = 'Без_имени.dxfnest.json';

  let qrBlock = '';
  try {
    const qrSvgStr = makeQrSvg(`PROJECT:${projectFileName}`, { cellSize: 10, margin: 4 });
    if (qrSvgStr) {
      const qrDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvgStr);
      qrBlock = `<img src="${qrDataUri}" alt="QR" style="width: 60mm; height: 60mm; object-fit: contain; display: block;">`;
    }
  } catch (e) { console.warn('QR:', e); }

  const map = new Map();
  for (const p of state.parts) {
    const e = map.get(p.name) || { plan: 0, placed: 0, lengthOne: p.length || 0, layers: new Set(), cutOrders: [], firstLayer: 9999, firstCut: 9999 };
    e.plan += p.qty;
    e.lengthOne = p.length || 0;
    map.set(p.name, e);
  }
  
  let totalArea = 0, totalCutLength = 0, totalPierces = 0;

  for (let si = 0; si < state.sheets.length; si++) {
    for (const pl of state.sheets[si].placed) {
      const n = state.parts[pl.partIdx]?.name;
      if (n && map.has(n)) {
        const e = map.get(n);
        e.placed++;
        const layer = pl.layerId || 1;
        const cut = pl._cutOrder || 9999;
        e.layers.add(layer);
        if (cut !== 9999) e.cutOrders.push({ layer, cut, sheet: si + 1 });
        if (layer < e.firstLayer || (layer === e.firstLayer && cut < e.firstCut)) {
          e.firstLayer = layer;
          e.firstCut = cut;
        }
      }
      
      totalArea += state.parts[pl.partIdx]?.area || 0;
      totalCutLength += state.parts[pl.partIdx]?.length || 0;
      if (pl.polygons) totalPierces += pl.polygons.length;
    }
  }

  const density = params.density || 7850;
  const thicknessM = params.thickness / 1000;
  let totalWeight = 0;

  // ✅ Защита от «битых» ссылок: если деталь удалили, а placed остался,
  // не будет NaN в отчёте.
  for (const sh of state.sheets) {
    for (const pl of sh.placed) {
      const part = state.parts[pl.partIdx];
      if (!part) continue;
      totalWeight += ((part.area || 0) / 1e6) * thicknessM * density;
    }
  }

  const rows = [...map.entries()].sort((a, b) => {
    const eA = a[1], eB = b[1];
    if (eA.firstLayer !== eB.firstLayer) return eA.firstLayer - eB.firstLayer;
    if (eA.firstCut !== eB.firstCut) return eA.firstCut - eB.firstCut;
    return a[0].localeCompare(b[0], 'ru');
  });

  let totalPlan = 0, totalPlaced = 0, totalPlanLength = 0, totalPlacedLength = 0;
  const trs = rows.map(([name, e], i) => {
    totalPlan += e.plan; totalPlaced += e.placed;
    totalPlanLength += e.lengthOne * e.plan;
    totalPlacedLength += e.lengthOne * e.placed;
    const diff = e.plan - e.placed;
    const diffCell = diff > 0 ? `<span style="color:#b00">${diff}</span>` : (diff === 0 ? '<span style="color:#080">0</span>' : `${diff}`);
    
    const layerStr = [...e.layers].sort((a,b)=>a-b).join(', ');
    const cutSet = new Set(e.cutOrders.map(c => c.cut));
    const cutStr = [...cutSet].sort((a,b)=>a-b).join(', ');

    return `<tr>
      <td class="num">${i+1}</td>
      <td class="part">${esc(name)}</td>
      <td class="num">${layerStr}</td>
      <td class="num">${cutStr}</td>
      <td class="num">${e.plan}</td>
      <td class="num">${e.placed}</td>
      <td class="num">${diffCell}</td>
      <td class="num">${fmtLen(e.lengthOne * e.plan)}</td>
    </tr>`;
  }).join('');

  const totalDiff = totalPlan - totalPlaced;
  const totalDiffCell = totalDiff > 0 ? `<span style="color:#b00">${totalDiff}</span>` : (totalDiff === 0 ? '<span style="color:#080">0</span>' : `${totalDiff}`);
  const sheetsCount = state.sheets.length, maxSheets = params.maxSheets;

  const usedArea = sheetsCount * params.sheetW * params.sheetH;
  const eff = usedArea ? (100 * totalArea / usedArea) : 0;

  let remnantArea = 0, remnantCount = 0, cutCount = 0, cutLen = 0;
  for (const sh of state.sheets) {
    if (sh.remnants) for (const r of sh.remnants) { remnantArea += r.w * r.h; remnantCount++; }
    if (sh.cuts) for (const c of sh.cuts) { cutCount++; cutLen += Math.hypot(c.x2 - c.x1, c.y2 - c.y1); }
  }

  const unplacedRows = rows.filter(([, e]) => e.plan > e.placed).map(([name, e], i) => {
    const diff = e.plan - e.placed;
    return `<tr>
      <td class="num">${i+1}</td>
      <td class="part">${esc(name)}</td>
      <td class="num">—</td>
      <td class="num">—</td>
      <td class="num">${e.plan}</td>
      <td class="num">${e.placed}</td>
      <td class="num"><b style="color:#b00">${diff}</b></td>
      <td class="num">${fmtLen(e.lengthOne * diff)}</td>
    </tr>`;
  }).join('');
  
  const totalUnplacedQty = rows.reduce((s, [, e]) => s + Math.max(0, e.plan - e.placed), 0);
  const totalUnplacedLen = rows.reduce((s, [, e]) => s + Math.max(0, e.plan - e.placed) * e.lengthOne, 0);

  const unplacedBlock = unplacedRows
    ? `<div style="margin-top:6px;page-break-inside:avoid">
<h2 style="font-size:12px;margin:0 0 4px;border-top:1px solid #000;padding-top:4px">Детали, не вошедшие в раскладку</h2>
<table class="report-table"><thead><tr>
<th style="width:36px">№</th><th>Наименование</th><th style="width:60px">Слой</th>
<th style="width:70px">№ реза</th>
<th style="width:60px">План</th><th style="width:80px">Разл.</th>
<th style="width:60px">Ост.</th><th style="width:100px">Длина</th></tr></thead>
<tbody>${unplacedRows}
<tr class="totals-row"><td colspan="6" style="text-align:right">ИТОГО:</td>
<td class="num">${totalUnplacedQty}</td><td class="num">${fmtLen(totalUnplacedLen)}</td></tr>
</tbody></table></div>`
    : `<div style="margin-top:6px;font-size:11px;font-weight:bold;color:#080">✓ Все детали разложены</div>`;

  const fin = getFinanceParams();
  let finCostMaterial = (usedArea / 1e6) * (fin.materialPrice || 0);
  if (fin.kgPrice > 0) finCostMaterial = totalWeight * fin.kgPrice;
  
  const finCostPierce = totalPierces * (fin.piercePrice || 0);
  const finCostCut = (totalCutLength / 1000) * (fin.cutPrice || 0);
  const finTimeHours = (totalCutLength / 90) / 60;
  const finCostMachine = finTimeHours * (fin.machineHour || 0);
  const finTotal = finCostMaterial + finCostPierce + finCostCut + finCostMachine;

  let financeBlock = '';
  if (finTotal > 0) {
    financeBlock = `
      <div class="finance-block" style="margin-top: 6px; border: 1px solid #000; padding: 4px; page-break-inside: avoid; break-inside: avoid; background: #fafafa;">
        <div style="font-size: 11px; font-weight: bold; margin-bottom: 2px;">💰 Финансовая составляющая</div>
        <table style="width: 100%; font-size: 10px; border-collapse: collapse; line-height: 1.2;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 1px 0;">Наименование</th>
              <th style="text-align: center; padding: 1px 0; width: 40px;">Ед.</th>
              <th style="text-align: center; padding: 1px 0; width: 40px;">Кол-во</th>
              <th style="text-align: right; padding: 1px 0; width: 50px;">Цена</th>
              <th style="text-align: right; padding: 1px 0; width: 60px;">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${fin.kgPrice > 0 ? `
            <tr style="border-bottom: 1px solid #ccc; background:#eaf4ff;">
              <td style="padding: 1px 0; font-weight:bold; color:#004a99;">Металл (кг)</td>
              <td style="text-align: center;">кг</td>
              <td style="text-align: center;">${totalWeight.toFixed(2)}</td>
              <td style="text-align: right;">${fin.kgPrice}</td>
              <td style="text-align: right; font-weight: bold;">${finCostMaterial.toFixed(2)}</td>
            </tr>` : `
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 1px 0;">Металл (м²)</td>
              <td style="text-align: center;">м²</td>
              <td style="text-align: center;">${(usedArea/1e6).toFixed(2)}</td>
              <td style="text-align: right;">${fin.materialPrice}</td>
              <td style="text-align: right; font-weight: bold;">${finCostMaterial.toFixed(2)}</td>
            </tr>`}
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 1px 0;">Работа станка</td>
              <td style="text-align: center;">ч</td>
              <td style="text-align: center;">${finTimeHours.toFixed(2)}</td>
              <td style="text-align: right;">${fin.machineHour}</td>
              <td style="text-align: right; font-weight: bold;">${finCostMachine.toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 1px 0;">Резка (м)</td>
              <td style="text-align: center;">м</td>
              <td style="text-align: center;">${(totalCutLength/1000).toFixed(2)}</td>
              <td style="text-align: right;">${fin.cutPrice}</td>
              <td style="text-align: right; font-weight: bold;">${finCostCut.toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #000;">
              <td style="padding: 1px 0;">Врезки</td>
              <td style="text-align: center;">шт</td>
              <td style="text-align: center;">${totalPierces}</td>
              <td style="text-align: right;">${fin.piercePrice}</td>
              <td style="text-align: right; font-weight: bold;">${finCostPierce.toFixed(2)}</td>
            </tr>
            <tr style="font-size: 12px;">
              <td colspan="4" style="text-align: right; padding-top: 2px; font-weight: bold;">ИТОГО:</td>
              <td style="text-align: right; padding-top: 2px; font-weight: bold;">${finTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  const summaryBlock = `
  <div class="summary" style="margin:0; padding:0; line-height: 1.3;">
    <b>Параметры:</b> Отступ: ${params.edge}; Kerf: ${params.kerf}; Зазор: ${params.gap}; Итог: ${(params.kerf+params.gap).toFixed(1)}. Поворот: ${params.rotMode===4?'4 угла':params.rotMode===2?'90°':'нет'}.<br>
    Задано: <b>${totalPlan}</b>; разложено: <b>${totalPlaced}</b>; остаток: <b>${totalDiff}</b>. Листов: <b>${sheetsCount}</b>; КПД: <b>${eff.toFixed(1)}%</b>.<br>
    <b>Вес металла: ${totalWeight.toFixed(2)} кг</b>. Длина реза: <b>${fmtLen(totalPlacedLength)}</b>.<br>
    ${remnantCount>0 ? `Отход: <b>${remnantCount} шт, ${(remnantArea/1e6).toFixed(2)} м²</b>. ` : ''}
    ${cutCount>0 ? `Резы: <b>${cutCount} шт</b>.` : ''}
  </div>`;

  const bottomHtml = `
  <div style="margin-top: 8px; width: 100%; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
    <div style="flex: 1;">
      ${summaryBlock}
      ${unplacedBlock}
      ${financeBlock}
      
      <div class="signature" style="margin-top: 8px; page-break-inside: avoid; break-inside: avoid;">
        <div style="margin-bottom: 4px;">Составил: <span style="display:inline-block; width:120px; border-bottom:1px solid #000; margin-left:6px;"></span></div>
        <div>Проверил: <span style="display:inline-block; width:120px; border-bottom:1px solid #000; margin-left:6px;"></span></div>
      </div>
    </div>
    ${qrBlock ? `<div style="flex-shrink: 0; margin-top: 2px;">${qrBlock}</div>` : ''}
  </div>`;

  const html = `<style>
    @page { size: A4 landscape; margin: 6mm; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; }
    h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
    .subtitle { text-align: center; font-size: 10px; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .meta { font-size: 10px; margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid #ccc; }
    
    .report-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 9px; }
    .report-table th, .report-table td { border: 1px solid #000; padding: 1px 3px; text-align: left; }
    .report-table th { background-color: #f0f0f0; font-weight: bold; text-align: center; padding: 2px 1px; font-size: 8px; }
    .report-table .num { text-align: center; }
    .report-table .part { text-align: left; }
    .report-table .totals-row td { background-color: #f9f9f9; font-weight: bold; }
    
    .summary { font-size: 10px; line-height: 1.2 !important; }
    .finance-block { font-size: 9px !important; padding: 3px !important; margin-top: 4px !important; }
    .finance-block table { font-size: 9px !important; }
    .finance-block th, .finance-block td { padding: 1px 2px !important; }
    .signature { margin-top: 6px !important; font-size: 10px; }
  </style>
  <h1>Отчёт по раскладке деталей</h1>
<div class="subtitle">Раскладка: ${Math.round(params.sheetW)} × ${Math.round(params.sheetH)} мм, толщина ${params.thickness} мм</div>
<div class="meta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:15px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
  <span>Проект: <b style="font-family:monospace;">${esc(projectFileName)}</b></span>
  <span style="color: #555;">Дата: <b>${dt}</b> · Листов: <b>${sheetsCount}</b> (лимит ${maxSheets})</span>
</div>
<table class="report-table"><thead><tr>
<th style="width:30px">№</th><th>Наименование детали</th><th style="width:50px">Слой</th>
<th style="width:60px">№ реза</th>
<th style="width:50px">План</th><th style="width:60px">Разл.</th>
<th style="width:50px">Ост.</th><th style="width:80px">Длина</th></tr></thead>
<tbody>${trs || '<tr><td colspan="8" style="text-align:center;font-style:italic">Деталей нет</td></tr>'}
<tr class="totals-row"><td colspan="4" style="text-align:right">ИТОГО:</td>
<td class="num">${totalPlan}</td><td class="num">${totalPlaced}</td>
<td class="num">${totalDiffCell}</td><td class="num">${fmtLen(totalPlanLength)}</td></tr>
</tbody></table>
${bottomHtml}
</div>`;
  return html.replace(/>\s+</g, '><');
}