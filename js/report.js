import { $, escapeHtml as esc } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';

function pad2(n){ return String(n).padStart(2,'0'); }

export function computeUnplacedList(){
  const planned = {}; const placed = {};
  for(const p of state.parts) planned[p.name] = (planned[p.name]||0) + p.qty;
  for(const sh of state.sheets) for(const pl of sh.placed){
    const name = state.parts[pl.partIdx]?.name;
    if(name) placed[name] = (placed[name]||0) + 1;
  }
  const result = [];
  for(const [name, total] of Object.entries(planned)){
    const done = placed[name] || 0;
    for(let i=0; i<total - done; i++) result.push(name);
  }
  return result;
}

export function updateReport(unplaced, dt){
  const el = $('report');
  if(!state.sheets.length){ el.textContent = '—'; return; }
  const params = readParams();
  const unplacedList = (unplaced && unplaced.length) ? unplaced : computeUnplacedList();

  const totalPlaced = state.sheets.reduce((s,sh) => s + sh.placed.length, 0);
  const totalTask = state.parts.reduce((s,p) => s + p.qty, 0);
  const totalUnplaced = unplacedList.length;

  let totalArea = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) totalArea += state.parts[pl.partIdx].area;

  let totalCutLength = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) totalCutLength += state.parts[pl.partIdx].length || 0;

  const usedArea = state.sheets.length * params.sheetW * params.sheetH;
  const eff = usedArea ? (100 * totalArea / usedArea) : 0;
  const lenMm = Math.round(totalCutLength);
  const lenM = (totalCutLength/1000).toFixed(2);

  let remnantArea = 0, remnantCount = 0;
  for(const sh of state.sheets){
    if(!sh.remnants) continue;
    for(const r of sh.remnants){ remnantArea += r.w * r.h; remnantCount++; }
  }
  const remM2 = (remnantArea/1e6).toFixed(3);

  let cutCount = 0, cutLen = 0;
  for(const sh of state.sheets){
    if(!sh.cuts) continue;
    for(const c of sh.cuts){
      cutCount++;
      cutLen += Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
    }
  }

  el.innerHTML =
    `Листов: <b>${state.sheets.length}</b> (лимит ${params.maxSheets})\n` +
    `Задано деталей: <b>${totalTask}</b>\n` +
    `Разложено деталей: <b class="good">${totalPlaced}</b>\n` +
    `Не поместилось: <b class="${totalUnplaced>0?'warn':'good'}">${totalUnplaced}</b>\n` +
    `Длина реза (разложено): <b class="len">${lenMm.toLocaleString('ru-RU')} мм (${lenM} м)</b>\n` +
    `КПД: <b>${eff.toFixed(1)}%</b>` +
    (remnantCount>0 ? `\nДеловой отход: <b class="rem">${remnantCount} шт, ${remM2} м²</b>` : '') +
    (cutCount>0 ? `\nРезы листа: <b>${cutCount} шт, ${cutLen.toFixed(0)} мм</b>` : '') +
    (dt !== undefined ? `\nВремя: ${dt} мс` : '') +
    (unplacedList.length ? (() => {
      const counts = {};
      for(const n of unplacedList) counts[n] = (counts[n]||0) + 1;
      let s = `\n\nНе поместились (${unplacedList.length}):\n`;
      for(const [n,c] of Object.entries(counts)) s += `  ${n} ×${c}\n`;
      return s;
    })() : '');
}

export function openReportModal(){
  const src = $('report'); const dst = $('reportContent');
  if(src && dst) dst.innerHTML = src.innerHTML || '—';
  $('reportModal').classList.add('active');
}
export function closeReportModal(){ $('reportModal').classList.remove('active'); }

function escXml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function buildSheetSvg(sheet, si, params, counterRef){
  const SW = params.sheetW, SH = params.sheetH;
  const m = Math.max(SW, SH);
  const strokeSheet = m/900, strokePart = m/1100, strokeMargin = m/1600, strokeRem = m/700;
  const dashA = m/70, dashB = m/110;
  const labelSize = Math.max(m/110, 5), nameSize = Math.max(m/165, 3.5), remSize = Math.max(m/120, 6);
  let body = '';

  if(params.sheetPolygons && params.sheetPolygons.length){
    for(const ring of params.sheetPolygons){
      if(ring.length < 2) continue;
      const pts = ring.map(([x,y]) => `${x.toFixed(2)},${(SH-y).toFixed(2)}`).join(' ');
      body += `<polygon points="${pts}" fill="#ffffff" stroke="#000" stroke-width="${strokeSheet}" fill-rule="evenodd"/>`;
    }
  } else {
    body += `<rect x="0" y="0" width="${SW}" height="${SH}" fill="#ffffff" stroke="#000" stroke-width="${strokeSheet}"/>`;
    if(params.edge > 0) body += `<rect x="${params.edge}" y="${params.edge}" width="${SW-2*params.edge}" height="${SH-2*params.edge}" fill="none" stroke="#888" stroke-width="${strokeMargin}" stroke-dasharray="${dashA} ${dashB}"/>`;
  }

  if(sheet.remnants && sheet.remnants.length){
    for(const r of sheet.remnants){
      const rx = r.rect.x1, ry = SH - r.rect.y2;
      const rw = r.rect.x2 - r.rect.x1, rh = r.rect.y2 - r.rect.y1;
      body += `<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="#c8f0cd" fill-opacity="0.35" stroke="none"/>`;
    }
  }
  for(const pl of sheet.placed){
    const part = state.parts[pl.partIdx]; if(!part) continue;
    counterRef.n++;
    const num = counterRef.n;
    if(!counterRef.byPart.has(pl.partIdx)) counterRef.byPart.set(pl.partIdx, { name: part.name, w: part.width, h: part.height, qty: 0, sheets: new Set() });
    const rec = counterRef.byPart.get(pl.partIdx);
    rec.qty++; rec.sheets.add(si+1);
    for(const ring of pl.polygons){
      if(ring.length < 2) continue;
      const pts = ring.map(([x,y]) => {
        const ax = params.edge + pl.x + x, ay = SH - (params.edge + pl.y + y);
        return `${ax.toFixed(2)},${ay.toFixed(2)}`;
      }).join(' ');
      body += `<polygon points="${pts}" fill="none" stroke="#d00000" stroke-width="${strokePart}"/>`;
    }
    const pw = pl.bbox[2] - pl.bbox[0], ph = pl.bbox[3] - pl.bbox[1];
    const cx = params.edge + pl.x + pw/2, cy = SH - (params.edge + pl.y + ph/2);
    const nameLen = String(part.name).length;
    const estNameWidth = nameLen * nameSize * 0.55;
    const fitsInside = estNameWidth <= pw * 0.95;
    const fitsHeight = ph >= (labelSize + nameSize) * 1.6;
    const numY = fitsHeight ? cy - nameSize * 0.15 : cy + labelSize / 3;
    body += `<text x="${cx.toFixed(2)}" y="${numY.toFixed(2)}" font-size="${labelSize}" font-family="Arial, sans-serif" text-anchor="middle" fill="#004a99" font-weight="bold">${num}</text>`;
    if(fitsInside && fitsHeight){
      const nameY = numY + nameSize * 1.25;
      body += `<text x="${cx.toFixed(2)}" y="${nameY.toFixed(2)}" font-size="${nameSize}" font-family="Arial, sans-serif" text-anchor="middle" fill="#004a99">${escXml(part.name)}</text>`;
    } else if(!fitsHeight && estNameWidth > pw * 0.95){
      const topY = SH - (params.edge + pl.y + ph);
      const labelY = topY - Math.max(nameSize * 1.2, 3);
      const labelText = `${num}. ${escXml(part.name)}`;
      body += `<text x="${cx.toFixed(2)}" y="${labelY.toFixed(2)}" font-size="${nameSize}" font-family="Arial, sans-serif" text-anchor="middle" fill="#004a99">${labelText}</text>`;
    }
  }

  // ─── Резы листа ───
  if(sheet.cuts && sheet.cuts.length){
    for(const c of sheet.cuts){
      const y1 = SH - c.y1, y2 = SH - c.y2;
      body += `<line x1="${c.x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${c.x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#ff6400" stroke-width="${strokePart}" stroke-dasharray="${dashA} ${dashB}"/>`;
    }
  }

  if(sheet.remnants && sheet.remnants.length){
    for(const r of sheet.remnants){
      const x1 = r.cut.x1, y1 = SH - r.cut.y1, x2 = r.cut.x2, y2 = SH - r.cut.y2;
      body += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#2a9a3c" stroke-width="${strokeRem}"/>`;
      const cx = (r.rect.x1 + r.rect.x2)/2, cy = SH - (r.rect.y1 + r.rect.y2)/2;
      body += `<text x="${cx.toFixed(2)}" y="${(cy - remSize*0.1).toFixed(2)}" font-size="${remSize}" font-family="Arial, sans-serif" text-anchor="middle" fill="#1a6a25" font-weight="bold">ДЕЛОВОЙ ОТХОД</text>`;
      body += `<text x="${cx.toFixed(2)}" y="${(cy + remSize*0.9).toFixed(2)}" font-size="${(remSize*0.8).toFixed(2)}" font-family="Arial, sans-serif" text-anchor="middle" fill="#1a6a25">${Math.round(r.w)} × ${Math.round(r.h)} мм</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function buildLayoutHtml(){
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const now = new Date();
  const dt = `${pad2(now.getDate())}.${pad2(now.getMonth()+1)}.${pad2(now.getFullYear())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const counterRef = { n:0, byPart: new Map() };
  const pages = state.sheets.map((sheet, si) => {
    const svg = buildSheetSvg(sheet, si, params, counterRef);
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return `<div class="print-sheet-page"><div class="print-sheet-title">Лист ${si+1} из ${state.sheets.length} — ${Math.round(SW)} × ${Math.round(SH)} × ${params.thickness} мм — деталей: ${sheet.placed.length}</div>
<img class="print-sheet-img" src="${dataUri}" alt="Лист ${si+1}"></div>`;
  }).join('');
  let totalQty = 0;
  const legendRows = [...counterRef.byPart.values()].map((rec, i) => {
    totalQty += rec.qty;
    const sheetsList = [...rec.sheets].sort((a,b)=>a-b).join(', ');
    return `<tr><td class="num">${i+1}</td><td class="part">${escXml(rec.name)}</td>
<td class="num">${rec.w.toFixed(1)} × ${rec.h.toFixed(1)}</td>
<td class="num"><b>${rec.qty}</b></td><td class="num">${sheetsList}</td></tr>`;
  }).join('');
  const totalRow = counterRef.byPart.size
    ? `<tr class="totals-row"><td colspan="3" style="text-align:right">ИТОГО:</td><td class="num">${totalQty}</td><td class="num">—</td></tr>`
    : '';
  return `<h1>Карта раскроя</h1>
<div class="layout-print-sub">Дата: ${dt} • Листов: ${state.sheets.length} • Заготовка: ${Math.round(SW)} × ${Math.round(SH)} × ${params.thickness} мм • Отступ: ${params.edge} мм • Kerf: ${params.kerf} мм • Зазор: ${params.gap} мм</div>
${pages}
<div class="legend-page"><h3>Спецификация деталей на карте</h3>
<table class="report-table"><thead><tr><th style="width:44px">№</th><th>Наименование детали</th><th style="width:130px">Размер, мм</th><th style="width:70px">Кол-во, шт</th><th style="width:70px">Лист</th></tr></thead>
<tbody>${legendRows || '<tr><td colspan="5" style="text-align:center;font-style:italic">—</td></tr>'}${totalRow}</tbody></table></div>`;
}

function escapeHtmlPrint(s){ return esc(s); }
function fmtLen(mm){
  if(!isFinite(mm) || mm <= 0) return '0';
  if(mm >= 10000) return (mm/1000).toFixed(2) + ' м';
  return Math.round(mm).toLocaleString('ru-RU') + ' мм';
}

export function buildReportHtml(){
  const params = readParams();
  const now = new Date();
  const dt = `${pad2(now.getDate())}.${pad2(now.getMonth()+1)}.${pad2(now.getFullYear())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const map = new Map();
  for(const p of state.parts){
    const e = map.get(p.name) || { plan:0, placed:0, lengthOne:p.length||0 };
    e.plan += p.qty;
    e.lengthOne = p.length || 0;
    map.set(p.name, e);
  }
  for(const sh of state.sheets){
    for(const pl of sh.placed){
      const name = state.parts[pl.partIdx]?.name;
      if(!name) continue;
      const e = map.get(name);
      if(e) e.placed++;
    }
  }
  const rows = [...map.entries()].sort((a,b) => a[0].localeCompare(b[0], 'ru'));
  let totalPlan = 0, totalPlaced = 0, totalPlanLength = 0, totalPlacedLength = 0;
  const trs = rows.map(([name, e], i) => {
    totalPlan += e.plan; totalPlaced += e.placed;
    const lenPlan = e.lengthOne * e.plan;
    const lenPlaced = e.lengthOne * e.placed;
    totalPlanLength += lenPlan;
    totalPlacedLength += lenPlaced;
    const diff = e.plan - e.placed;
    const diffCell = diff > 0 ? `<span style="color:#b00">${diff}</span>` : (diff === 0 ? '<span style="color:#080">0</span>' : `${diff}`);
    return `<tr><td class="num">${i+1}</td><td class="part">${escapeHtmlPrint(name)}</td>
<td class="num">${e.plan}</td><td class="num">${e.placed}</td>
<td class="num">${diffCell}</td><td class="num">${fmtLen(lenPlan)}</td></tr>`;
  }).join('');
  const totalDiff = totalPlan - totalPlaced;
  const totalDiffCell = totalDiff > 0 ? `<span style="color:#b00">${totalDiff}</span>` : (totalDiff === 0 ? '<span style="color:#080">0</span>' : `${totalDiff}`);
  const sheetsCount = state.sheets.length, maxSheets = params.maxSheets;

  let totalArea = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) totalArea += state.parts[pl.partIdx]?.area || 0;
  const usedArea = sheetsCount * params.sheetW * params.sheetH;
  const eff = usedArea ? (100 * totalArea / usedArea) : 0;

  let remnantArea = 0, remnantCount = 0;
  for(const sh of state.sheets){
    if(!sh.remnants) continue;
    for(const r of sh.remnants){ remnantArea += r.w * r.h; remnantCount++; }
  }

  let cutCount = 0, cutLen = 0;
  for(const sh of state.sheets){
    if(!sh.cuts) continue;
    for(const c of sh.cuts){
      cutCount++;
      cutLen += Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
    }
  }

  const unplacedRows = rows.filter(([, e]) => e.plan > e.placed).map(([name, e], i) => {
    const diff = e.plan - e.placed;
    return `<tr><td class="num">${i+1}</td><td class="part">${escapeHtmlPrint(name)}</td>
<td class="num">${e.plan}</td><td class="num">${e.placed}</td>
<td class="num"><b style="color:#b00">${diff}</b></td>
<td class="num">${fmtLen(e.lengthOne * diff)}</td></tr>`;
  }).join('');
  const totalUnplacedQty = rows.reduce((s, [, e]) => s + Math.max(0, e.plan - e.placed), 0);
  const totalUnplacedLen = rows.reduce((s, [, e]) => s + Math.max(0, e.plan - e.placed) * e.lengthOne, 0);

  const unplacedBlock = unplacedRows
    ? `<div style="margin-top:18px;page-break-inside:avoid">
<h2 style="font-size:14px;margin:0 0 6px;border-top:2px solid #000;padding-top:8px">Детали, не вошедшие в раскладку (для следующего раза)</h2>
<div style="font-size:11px;color:#444;margin-bottom:8px">Эти детали нужно будет разложить на отдельном листе или добавить листов.</div>
<table class="report-table"><thead><tr>
<th style="width:36px">№</th><th>Наименование детали</th>
<th style="width:70px">План, шт</th><th style="width:90px">Разложено, шт</th>
<th style="width:90px">Осталось, шт</th><th style="width:120px">Длина линии, мм</th></tr></thead>
<tbody>${unplacedRows}
<tr class="totals-row"><td colspan="4" style="text-align:right">ИТОГО к следующему разу:</td>
<td class="num">${totalUnplacedQty}</td><td class="num">${fmtLen(totalUnplacedLen)}</td></tr>
</tbody></table></div>`
    : `<div style="margin-top:16px;font-size:13px;font-weight:bold;color:#080">✓ Все детали разложены</div>`;

  return `<h1>Отчёт по раскладке деталей</h1>
<div class="subtitle">Раскладка на листе ${Math.round(params.sheetW)} × ${Math.round(params.sheetH)} мм, толщина ${params.thickness} мм</div>
<div class="meta"><span>Дата: <b>${dt}</b></span><span>Листов: <b>${sheetsCount}</b> (лимит ${maxSheets})</span></div>
<table class="report-table"><thead><tr>
<th style="width:36px">№</th><th>Наименование детали</th>
<th style="width:80px">План, шт</th><th style="width:100px">Разложено, шт</th>
<th style="width:80px">Остаток, шт</th><th style="width:120px">Длина линии, мм</th></tr></thead>
<tbody>${trs || '<tr><td colspan="6" style="text-align:center;font-style:italic">Деталей нет</td></tr>'}
<tr class="totals-row"><td colspan="2" style="text-align:right">ИТОГО:</td>
<td class="num">${totalPlan}</td><td class="num">${totalPlaced}</td>
<td class="num">${totalDiffCell}</td><td class="num">${fmtLen(totalPlanLength)}</td></tr>
</tbody></table>
<div class="summary">
<b>Параметры раскладки:</b><br>
Отступ от края листа: ${params.edge} мм;
ширина реза (Kerf): ${params.kerf} мм;
зазор между деталями: ${params.gap} мм;
итоговый зазор (kerf + gap): ${(params.kerf+params.gap).toFixed(2)} мм;
поворот: ${params.rotMode===4?'4 угла':params.rotMode===2?'90°':'без поворота'}.<br>
Задано деталей: <b>${totalPlan}</b>; разложено: <b>${totalPlaced}</b>; остаток: <b>${totalDiff}</b>.<br>
Использовано листов: <b>${sheetsCount}</b>;
КПД использования площади: <b>${eff.toFixed(1)}%</b>.<br>
Длина реза (по разложенным деталям): <b>${fmtLen(totalPlacedLength)}</b>
(${Math.round(totalPlacedLength).toLocaleString('ru-RU')} мм).<br>
${remnantCount>0 ? `Деловой отход: <b>${remnantCount} шт, ${(remnantArea/1e6).toFixed(3)} м²</b>.<br>` : ''}
${cutCount>0 ? `Резы листа: <b>${cutCount} шт (${Math.round(cutLen)} мм)</b>.<br>` : ''}
<span style="font-size:11px;color:#444">Справочная длина реза — суммарный периметр всех контуров разложенных деталей (без учёта kerf и врезаний).</span>
</div>
${unplacedBlock}
<div class="signature">
<div>Составил: <span class="line"></span></div>
<div>Проверил: <span class="line"></span></div>
</div>`;
}

function setPrintPageOrientation(orientation){
  let el = document.getElementById('printPageStyle');
  if(!el){ el = document.createElement('style'); el.id = 'printPageStyle'; document.head.appendChild(el); }
  el.textContent = `@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`;
}
export function doPrint(html, orientation){
  const area = $('printArea');
  area.innerHTML = html;
  document.body.classList.add('printing');
  setPrintPageOrientation(orientation);
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.body.classList.remove('printing'); area.innerHTML = ''; }, 300);
  }, 80);
}