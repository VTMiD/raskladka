import { $, sleep, setStatus } from './utils.js';
import { state } from './state.js';
import { readParams, makeBaseName } from './params.js';
import { buildSheetSvg } from './report.js';

function pad2(n){ return String(n).padStart(2,'0'); }

function downloadBlob(blob, fileName){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fmtLen(mm){
  if(!isFinite(mm) || mm <= 0) return '0';
  if(mm >= 10000) return (mm/1000).toFixed(2) + ' м';
  return Math.round(mm).toLocaleString('ru-RU') + ' мм';
}

async function svgToRasterBlob(svgString, wMm, hMm, mimeType, quality){
  const blob = new Blob([svgString], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Не удалось отрисовать SVG'));
      i.src = url;
    });
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wMm * scale));
    canvas.height = Math.max(1, Math.round(hMm * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), mimeType, quality));
  } finally { URL.revokeObjectURL(url); }
}

// ============================================================
// РЕНДЕР ОТЧЁТА НА CANVAS (для выгрузки в JPG)
// ============================================================
function renderReportToCanvas(){
  const params = readParams();
  const now = new Date();
  const dt = `${pad2(now.getDate())}.${pad2(now.getMonth()+1)}.${pad2(now.getFullYear())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // --- Сбор данных ---
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
  for(const [, e] of rows){
    totalPlan += e.plan;
    totalPlaced += e.placed;
    totalPlanLength += e.lengthOne * e.plan;
    totalPlacedLength += e.lengthOne * e.placed;
  }
  const totalDiff = totalPlan - totalPlaced;
  const sheetsCount = state.sheets.length;
  const maxSheets = params.maxSheets;

  let totalArea = 0;
  for(const sh of state.sheets) for(const pl of sh.placed) totalArea += state.parts[pl.partIdx]?.area || 0;
  const usedArea = sheetsCount * params.sheetW * params.sheetH;
  const eff = usedArea ? (100 * totalArea / usedArea) : 0;

  let remnantArea = 0, remnantCount = 0;
  for(const sh of state.sheets){
    if(!sh.remnants) continue;
    for(const r of sh.remnants){ remnantArea += r.w * r.h; remnantCount++; }
  }

  const unplacedRows = rows.filter(([, e]) => e.plan > e.placed);
  const totalUnplacedQty = unplacedRows.reduce((s, [, e]) => s + (e.plan - e.placed), 0);
  const totalUnplacedLen = unplacedRows.reduce((s, [, e]) => s + (e.plan - e.placed) * e.lengthOne, 0);

  // --- Параметры макета ---
  const PX_PER_MM = 8;                       // ≈200 DPI
  const MM = mm => mm * PX_PER_MM;
  const PT = pt => pt * 0.352778 * PX_PER_MM; // pt → px
  const SERIF   = px => `${px}px "Times New Roman", Times, serif`;
  const SERIF_B = px => `bold ${px}px "Times New Roman", Times, serif`;

  const pageW = 210;
  const margin = 12;
  const canvasW = Math.round(MM(pageW));
  const contentW = MM(pageW - 2*margin);

  const fsTitle = PT(18);
  const fsSub = PT(13);
  const fsMeta = PT(12);
  const fsTableHead = PT(11);
  const fsTable = PT(11);
  const fsSummary = PT(11);
  const fsSmall = PT(10);

  const titleH = fsTitle * 1.4;
  const subH = fsSub * 1.4;
  const metaH = fsMeta * 1.9;
  const rowH = fsTable * 2.3;
  const headRowH = fsTableHead * 2.5;
  const summaryLineH = fsSummary * 1.6;

  // --- Оценка высоты (с запасом) ---
  let estH = MM(margin) * 2 + 200;
  estH += titleH + subH + metaH + 8;
  estH += headRowH + rowH * (rows.length + 1);
  estH += 16 + summaryLineH * 8;
  if(unplacedRows.length){
    estH += 40 + fsSummary + 6 + fsSmall + 10 + headRowH + rowH * (unplacedRows.length + 1);
  }
  estH += 80;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = Math.ceil(estH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function drawRect(x1, y1, w, h, fill, stroke){
    if(fill){ ctx.fillStyle = fill; ctx.fillRect(x1, y1, w, h); }
    if(stroke){
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 0.5, y1 + 0.5, w - 1, h - 1);
    }
  }

  const x0 = MM(margin);
  let y = MM(margin);

  // Заголовок
  ctx.font = SERIF_B(fsTitle);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Отчёт по раскладке деталей', canvasW / 2, y);
  y += titleH;

  // Подзаголовок
  ctx.font = SERIF(fsSub);
  ctx.fillText(`Раскладка на листе ${Math.round(params.sheetW)} × ${Math.round(params.sheetH)} мм, толщина ${params.thickness} мм`, canvasW / 2, y);
  y += subH;
  ctx.beginPath();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.moveTo(x0, y + 3); ctx.lineTo(x0 + contentW, y + 3); ctx.stroke();
  y += 8;

  // Мета
  ctx.font = SERIF(fsMeta);
  ctx.textAlign = 'left';
  ctx.fillText(`Дата: ${dt}`, x0, y);
  ctx.textAlign = 'right';
  ctx.fillText(`Листов: ${sheetsCount} (лимит ${maxSheets})`, x0 + contentW, y);
  y += metaH;

  // Колонки основной таблицы
  const colFracs = [0.06, 0.36, 0.11, 0.15, 0.11, 0.21];
  const cols = colFracs.map(f => f * contentW);
  const colSum = cols.reduce((a, b) => a + b, 0);
  cols[cols.length - 1] += contentW - colSum;

  function drawRow(yPos, h, cells, opts = {}){
    let cx = x0;
    ctx.textBaseline = 'middle';
    for(let i = 0; i < cells.length; i++){
      const w = cols[i];
      drawRect(cx, yPos, w, h, opts.fill || '#fff', '#000');
      if(cells[i] !== '' && cells[i] != null){
        ctx.font = opts.font || SERIF(fsTable);
        ctx.fillStyle = opts.color || '#000';
        const align = (opts.align && opts.align[i]) || 'left';
        ctx.textAlign = align;
        const tx = align === 'center' ? cx + w / 2 : align === 'right' ? cx + w - 5 : cx + 5;
        ctx.fillText(String(cells[i]), tx, yPos + h / 2);
      }
      cx += w;
    }
    ctx.textBaseline = 'top';
  }

  // Шапка
  drawRow(y, headRowH, ['№', 'Наименование детали', 'План, шт', 'Разложено, шт', 'Остаток, шт', 'Длина линии, мм'],
    { fill: '#eeeeee', font: SERIF_B(fsTableHead), align: ['center', 'left', 'center', 'center', 'center', 'center'] });
  y += headRowH;

  // Строки
  for(let i = 0; i < rows.length; i++){
    const [name, e] = rows[i];
    const diff = e.plan - e.placed;
    drawRow(y, rowH, [i + 1, name, e.plan, e.placed, diff, fmtLen(e.lengthOne * e.plan)],
      { align: ['center', 'left', 'center', 'center', 'center', 'center'] });
    y += rowH;
  }

  // Итоговая строка
  drawRow(y, rowH, ['', 'ИТОГО:', totalPlan, totalPlaced, totalDiff, fmtLen(totalPlanLength)],
    { fill: '#f5f5f5', font: SERIF_B(fsTable), align: ['center', 'right', 'center', 'center', 'center', 'center'] });
  y += rowH;

  // Сводка
  y += 18;
  const summaryLines = [];
  summaryLines.push({ text: 'Параметры раскладки:', bold: true });
  summaryLines.push({ text: `Отступ от края листа: ${params.edge} мм; ширина реза (Kerf): ${params.kerf} мм; зазор между деталями: ${params.gap} мм; итоговый зазор (kerf + gap): ${(params.kerf + params.gap).toFixed(2)} мм; поворот: ${params.rotMode === 4 ? '4 угла' : params.rotMode === 2 ? '90°' : 'без поворота'}.` });
  summaryLines.push({ text: `Задано деталей: ${totalPlan}; разложено: ${totalPlaced}; остаток: ${totalDiff}.` });
  summaryLines.push({ text: `Использовано листов: ${sheetsCount}; КПД использования площади: ${eff.toFixed(1)}%.` });
  summaryLines.push({ text: `Длина реза (по разложенным деталям): ${fmtLen(totalPlacedLength)} (${Math.round(totalPlacedLength).toLocaleString('ru-RU')} мм).` });
  if(remnantCount > 0) summaryLines.push({ text: `Деловой отход: ${remnantCount} шт, ${(remnantArea / 1e6).toFixed(3)} м².` });
  summaryLines.push({ text: 'Справочная длина реза — суммарный периметр всех контуров разложенных деталей (без учёта kerf и врезаний).', small: true });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for(const line of summaryLines){
    if(line.small){ ctx.font = SERIF(fsSmall); ctx.fillStyle = '#444'; }
    else if(line.bold){ ctx.font = SERIF_B(fsSummary); ctx.fillStyle = '#000'; }
    else { ctx.font = SERIF(fsSummary); ctx.fillStyle = '#000'; }
    ctx.fillText(line.text, x0, y);
    y += summaryLineH;
  }

  // Блок «не поместились»
  if(unplacedRows.length){
    y += 14;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + contentW, y); ctx.stroke();
    y += 8;
    ctx.font = SERIF_B(fsSummary + 2);
    ctx.fillStyle = '#000';
    ctx.fillText('Детали, не вошедшие в раскладку (для следующего раза)', x0, y);
    y += fsSummary + 6;
    ctx.font = SERIF(fsSmall);
    ctx.fillStyle = '#444';
    ctx.fillText('Эти детали нужно будет разложить на отдельном листе или добавить листов.', x0, y);
    y += fsSmall + 10;

    const uColFracs = [0.07, 0.35, 0.14, 0.17, 0.15, 0.12];
    const uCols = uColFracs.map(f => f * contentW);
    const uColSum = uCols.reduce((a, b) => a + b, 0);
    uCols[uCols.length - 1] += contentW - uColSum;

    function drawURow(yPos, h, cells, opts = {}){
      let cx = x0;
      ctx.textBaseline = 'middle';
      for(let i = 0; i < cells.length; i++){
        const w = uCols[i];
        drawRect(cx, yPos, w, h, opts.fill || '#fff', '#000');
        if(cells[i] !== '' && cells[i] != null){
          ctx.font = opts.font || SERIF(fsTable);
          ctx.fillStyle = opts.color || '#000';
          const align = (opts.align && opts.align[i]) || 'center';
          ctx.textAlign = align;
          const tx = align === 'center' ? cx + w / 2 : align === 'right' ? cx + w - 5 : cx + 5;
          ctx.fillText(String(cells[i]), tx, yPos + h / 2);
        }
        cx += w;
      }
      ctx.textBaseline = 'top';
    }

    drawURow(y, headRowH, ['№', 'Наименование детали', 'План, шт', 'Разложено, шт', 'Осталось, шт', 'Длина, мм'],
      { fill: '#eeeeee', font: SERIF_B(fsTableHead) });
    y += headRowH;
    for(let i = 0; i < unplacedRows.length; i++){
      const [name, e] = unplacedRows[i];
      const diff = e.plan - e.placed;
      drawURow(y, rowH, [i + 1, name, e.plan, e.placed, diff, fmtLen(e.lengthOne * diff)]);
      y += rowH;
    }
    drawURow(y, rowH, ['', 'ИТОГО к следующему разу:', '', '', totalUnplacedQty, fmtLen(totalUnplacedLen)],
      { fill: '#f5f5f5', font: SERIF_B(fsTable) });
    y += rowH;
  } else {
    y += 18;
    ctx.font = SERIF_B(fsSummary + 2);
    ctx.fillStyle = '#080';
    ctx.textAlign = 'left';
    ctx.fillText('✓ Все детали разложены', x0, y);
    y += fsSummary + 8;
  }

  // Подписи
  y += 40;
  ctx.font = SERIF(fsSummary);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const sigY = y;
  const leftLabel = 'Составил:';
  ctx.fillText(leftLabel, x0, sigY);
  const leftLabelW = ctx.measureText(leftLabel).width;
  const lineLen = 160;
  ctx.beginPath();
  ctx.moveTo(x0 + leftLabelW + 8, sigY + fsSummary + 2);
  ctx.lineTo(x0 + leftLabelW + 8 + lineLen, sigY + fsSummary + 2);
  ctx.stroke();

  const rightLabel = 'Проверил:';
  const rightLabelW = ctx.measureText(rightLabel).width;
  const rightBlockW = rightLabelW + 8 + lineLen;
  const rightStart = x0 + contentW - rightBlockW;
  ctx.fillText(rightLabel, rightStart, sigY);
  ctx.beginPath();
  ctx.moveTo(rightStart + rightLabelW + 8, sigY + fsSummary + 2);
  ctx.lineTo(rightStart + rightLabelW + 8 + lineLen, sigY + fsSummary + 2);
  ctx.stroke();

  y += fsSummary + 20 + MM(margin);

  // Обрезка лишней пустой высоты
  const finalH = Math.ceil(Math.min(y, canvas.height));
  if(finalH < canvas.height){
    const out = document.createElement('canvas');
    out.width = canvasW;
    out.height = finalH;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    return out;
  }
  return canvas;
}

function reportCanvasToJpegBlob(canvas, quality){
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality == null ? 0.92 : quality);
  });
}

// ============================================================
// ПРИВЯЗКА КНОПОК
// ============================================================
export function bindExportsUI(){
  // 🖼 Отчёт JPG
  $('btnSaveHtml').addEventListener('click', async () => {
    if(!state.parts.length){ alert('Сначала добавьте детали'); return; }
    try {
      setStatus('Формирование отчёта JPG...');
      await sleep(30);
      const canvas = renderReportToCanvas();
      const blob = await reportCanvasToJpegBlob(canvas, 0.92);
      if(!blob){ setStatus('Не удалось создать JPG'); return; }
      const name = makeBaseName() + '_отчёт.jpg';
      downloadBlob(blob, name);
      setStatus('Сохранено: ' + name);
    } catch(e){
      console.error(e);
      setStatus('Ошибка: ' + e.message);
    }
  });

  // 🖼 Карта JPG (по листам)
  const btnJpg = $('btnSaveJpgSheets');
  if(btnJpg){
    btnJpg.addEventListener('click', async () => {
      if(!state.sheets.length){ alert('Сначала нажмите «Разложить»'); return; }
      const params = readParams();
      const base = makeBaseName();
      const total = state.sheets.length;
      btnJpg.disabled = true;
      try {
        for(let si = 0; si < total; si++){
          setStatus(`JPG: лист ${si + 1} из ${total} — формирование...`);
          await sleep(50);
          const counterRef = { n: 0, byPart: new Map() };
          const svgString = buildSheetSvg(state.sheets[si], si, params, counterRef);
          try {
            const blob = await svgToRasterBlob(svgString, params.sheetW, params.sheetH, 'image/jpeg', 0.92);
            if(!blob) throw new Error('canvas.toBlob вернул null');
            const fileName = `${base}_лист${si + 1}.jpg`;
            downloadBlob(blob, fileName);
            setStatus(`JPG: лист ${si + 1} из ${total} — сохранён ${fileName}`);
          } catch(e){
            console.error(e);
            setStatus(`Ошибка на листе ${si + 1}: ${e.message}`);
            return;
          }
          await sleep(400);
        }
        setStatus(`Готово: ${total} JPG-файлов`);
      } finally { btnJpg.disabled = false; }
    });
  }
}