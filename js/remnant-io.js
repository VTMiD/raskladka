import { readParams } from './params.js';
import { state } from './state.js';
import { setStatus, todayIso } from './utils.js';

let _hCounter = 0x200;
function nh(){ return (++_hCounter).toString(16).toUpperCase(); }

// ─── Построение DXF ───
export function buildRemnantDxf(remnant, params, nameOverride){
  const W = Math.round(remnant.w);
  const H = Math.round(remnant.h);
  const T = params.thickness;
  const date = todayIso();
  const name = nameOverride || `Остаток_${W}x${H}x${T}_${date}`;

  _hCounter = 0x200;
  const lines = [];
  const p = (c, v) => { lines.push(String(c)); lines.push(String(v)); };

  p(0,'SECTION'); p(2,'HEADER');
  p(9,'$ACADVER'); p(1,'AC1015');
  p(9,'$INSUNITS'); p(70,4);
  p(0,'ENDSEC');

  p(0,'SECTION'); p(2,'TABLES');
  p(0,'TABLE'); p(2,'LAYER'); p(5,'2'); p(100,'AcDbSymbolTable'); p(70,5);
  p(0,'LAYER'); p(5,'10'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'SHEET'); p(70,0); p(62,8); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'11'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'REMNANT_META'); p(70,0); p(62,3); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'ENDTAB'); p(0,'ENDSEC');

  p(0,'SECTION'); p(2,'ENTITIES');

  // Контур
  if (remnant.polygon && remnant.polygon.length >= 3){
    p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
    p(8,'SHEET'); p(100,'AcDbPolyline');
    p(90, remnant.polygon.length); p(70, 1);
    for (const [x, y] of remnant.polygon){
      p(10, x.toFixed(4)); p(20, y.toFixed(4));
    }
  } else {
    p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
    p(8,'SHEET'); p(100,'AcDbPolyline');
    p(90, 4); p(70, 1);
    p(10, '0.0000'); p(20, '0.0000');
    p(10, W.toFixed(4)); p(20, '0.0000');
    p(10, W.toFixed(4)); p(20, H.toFixed(4));
    p(10, '0.0000'); p(20, H.toFixed(4));
  }

  // Метаданные
  const metaCenterX = W / 2;
  const metaCenterY = H * 0.75;
  const metaTH = 8;

  p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'REMNANT_META'); p(100,'AcDbText');
  p(10, metaCenterX.toFixed(4)); p(20, metaCenterY.toFixed(4)); p(30,'0.0'); p(40, metaTH.toFixed(4));
  p(1, `REMNANT|name=${name}`); p(50,'0'); p(7,'STANDARD');

  p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'REMNANT_META'); p(100,'AcDbText');
  p(10, metaCenterX.toFixed(4)); p(20, (H * 0.55).toFixed(4)); p(30,'0.0'); p(40, metaTH.toFixed(4));
  p(1, `REMNANT|thickness=${T}`); p(50,'0'); p(7,'STANDARD');

  p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'REMNANT_META'); p(100,'AcDbText');
  p(10, metaCenterX.toFixed(4)); p(20, (H * 0.35).toFixed(4)); p(30,'0.0'); p(40, metaTH.toFixed(4));
  p(1, `REMNANT|date=${date}`); p(50,'0'); p(7,'STANDARD');

  p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'REMNANT_META'); p(100,'AcDbText');
  p(10, metaCenterX.toFixed(4)); p(20, (H * 0.15).toFixed(4)); p(30,'0.0'); p(40, metaTH.toFixed(4));
  p(1, `${W} × ${H} × ${T} мм`); p(50,'0'); p(7,'STANDARD');

  p(0,'ENDSEC'); p(0,'EOF');
  return lines.join('\r\n') + '\r\n';
}

// ─── Разбор метаданных ───
export function parseRemnantMeta(dxfText){
  if (!dxfText) return null;
  const meta = { kind: 'remnant', name: null, thickness: null, date: null };
  const re = /REMNANT\|(\w+)=([^\r\n]+)/g;
  let m;
  while ((m = re.exec(dxfText)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'name') meta.name = val;
    else if (key === 'thickness') {
      const n = parseFloat(val);
      if (isFinite(n)) meta.thickness = n;
    }
    else if (key === 'date') meta.date = val;
  }
  if (!meta.name && meta.thickness == null) return null;
  return meta;
}

// ─── Сохранение ───
export async function saveRemnantAsFile(remnant, params, suggestedName){
  const dxfText = buildRemnantDxf(remnant, params, suggestedName?.replace(/\.dxf$/i, ''));
  const name = suggestedName || `Остаток_${Math.round(remnant.w)}x${Math.round(remnant.h)}x${params.thickness}_${todayIso()}.dxf`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        id: 'remnant-save',
        suggestedName: name,
        startIn: 'documents',
        types: [{ description: 'DXF', accept: { 'application/dxf': ['.dxf'] } }],
      });
      const w = await handle.createWritable();
      await w.write(dxfText);
      await w.close();
      return { ok: true, name: handle.name };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, cancelled: true };
      return { ok: false, error: e.message };
    }
  }

  const blob = new Blob([dxfText], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true, name, downloaded: true };
}

export async function saveRemnantDialog(){
  const params = readParams();
  const all = [];
  for (let si = 0; si < state.sheets.length; si++){
    const sh = state.sheets[si];
    if (!sh.remnants) continue;
    for (let ri = 0; ri < sh.remnants.length; ri++){
      const r = sh.remnants[ri];
      if (Math.round(r.w) < 20 || Math.round(r.h) < 20) continue;
      all.push({ sheetIdx: si, remnantIdx: ri, remnant: r });
    }
  }

  if (!all.length){
    alert('Нет остатков для сохранения.\nСначала отметьте остаток кнопкой «📦 Остаток» или «📐 Рамка».');
    return;
  }

  let targets = [all[0]];
  if (all.length > 1){
    const list = all.map((x, i) =>
      `  ${i + 1}. Лист ${x.sheetIdx + 1}: ${Math.round(x.remnant.w)}×${Math.round(x.remnant.h)} мм` +
      (x.remnant.polygon ? ' (полигон)' : '') +
      (x.remnant._manual ? ' [ручной]' : '')
    ).join('\n');
    const v = prompt(
      `Найдено остатков: ${all.length}\n\n${list}\n\n` +
      `Введите номер (1…${all.length}) или «a» — сохранить все:`,
      '1'
    );
    if (v === null) return;
    const trimmed = v.trim().toLowerCase();
    if (trimmed === 'a' || trimmed === 'all' || trimmed === 'все'){
      targets = all;
    } else {
      const n = parseInt(trimmed, 10);
      if (!n || n < 1 || n > all.length){ alert('Неверный номер'); return; }
      targets = [all[n - 1]];
    }
  }

  let dirHandle = null;
  if (targets.length > 1 && 'showDirectoryPicker' in window){
    try {
      dirHandle = await window.showDirectoryPicker({
        id: 'remnant-batch-save',
        mode: 'readwrite',
        startIn: 'documents',
      });
    } catch (e) {
      if (e.name === 'AbortError') { setStatus('Сохранение отменено'); return; }
      dirHandle = null;
    }
  }

  const date = todayIso();
  let saved = 0, cancelled = 0, errors = 0;

  for (let i = 0; i < targets.length; i++){
    const t = targets[i];
    const r = t.remnant;
    const W = Math.round(r.w), H = Math.round(r.h), T = params.thickness;
    const suffix = targets.length > 1 ? `_L${t.sheetIdx + 1}-${i + 1}` : '';
    const fileName = `Остаток_${W}x${H}x${T}_${date}${suffix}.dxf`;

    setStatus(`Сохранение ${i + 1} из ${targets.length}: ${fileName}...`);

    if (dirHandle){
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const w = await fileHandle.createWritable();
        await w.write(buildRemnantDxf(r, params, fileName.replace(/\.dxf$/i, '')));
        await w.close();
        saved++;
      } catch (e) {
        console.error('Ошибка записи:', e);
        errors++;
      }
    } else {
      const res = await saveRemnantAsFile(r, params, fileName);
      if (res.cancelled) { cancelled++; continue; }
      if (!res.ok) { errors++; continue; }
      saved++;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  const parts = [];
  if (saved) parts.push(`сохранено: ${saved}`);
  if (cancelled) parts.push(`отменено: ${cancelled}`);
  if (errors) parts.push(`ошибок: ${errors}`);
  setStatus(`Остатки — ${parts.join(', ')}`);
}