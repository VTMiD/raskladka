import { readParams } from './params.js';
import { state } from './state.js';
import { setStatus, todayIso, askFileNameWithPath, makeDestinationHint, downloadBlob, saveFileToServer, sanitizeFileName } from './utils.js';

let _hCounter = 0x200;
function nh(){ return (++_hCounter).toString(16).toUpperCase(); }

function escapeDxfStr(s){
  return String(s).replace(/[\r\n]+/g, ' ').trim();
}

// ─── Построение DXF остатка ───
export function buildRemnantDxf(remnant, params, nameOverride){
  const W = Math.round(remnant.w);
  const H = Math.round(remnant.h);
  const T = params.thickness;
  const date = todayIso();
  const name = nameOverride || sanitizeFileName(`Остаток_${W}x${H}x${T}_${date}`, 100);

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
  p(2,'META'); p(70,0); p(62,3); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'ENDTAB'); p(0,'ENDSEC');

  p(0,'SECTION'); p(2,'ENTITIES');

  if (remnant.polygon && remnant.polygon.length >= 3){
    p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
    p(8,'SHEET'); p(100,'AcDbPolyline');
    p(90, remnant.polygon.length); p(70, 1);
    for (const [x, y] of remnant.polygon){ p(10, x.toFixed(4)); p(20, y.toFixed(4)); }
  } else {
    p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
    p(8,'SHEET'); p(100,'AcDbPolyline');
    p(90, 4); p(70, 1);
    p(10, '0.0000'); p(20, '0.0000');
    p(10, W.toFixed(4)); p(20, '0.0000');
    p(10, W.toFixed(4)); p(20, H.toFixed(4));
    p(10, '0.0000'); p(20, H.toFixed(4));
  }

  const metaFields = {
    name,
    width: W,
    height: H,
    thickness: T,
    date,
  };
  for (const [key, val] of Object.entries(metaFields)){
    p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'META'); p(100,'AcDbText');
    p(10, '0.0'); p(20, '0.0'); p(30,'0.0'); p(40,'6.0');
    p(1, `REMNANT|${key}=${escapeDxfStr(val)}`); p(50,'0'); p(7,'STANDARD');
  }

  p(0,'ENDSEC'); p(0,'EOF');
  return lines.join('\r\n') + '\r\n';
}

// ─── Построение DXF листа с метаданными ───
export function buildSheetDxf(sheet, sheetIdx, totalSheets, params){
  _hCounter = 0x200;
  const lines = [];
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  const W = Math.round(params.sheetW), H = Math.round(params.sheetH), T = params.thickness;
  const date = todayIso();
  const partsCount = (sheet.placed || []).length;
  const name = sanitizeFileName(`Лист_${sheetIdx+1}_${W}x${H}x${T}_${date}`, 100);

  p(0,'SECTION'); p(2,'HEADER');
  p(9,'$ACADVER'); p(1,'AC1015');
  p(9,'$INSUNITS'); p(70,4);
  p(0,'ENDSEC');

  p(0,'SECTION'); p(2,'TABLES');
  p(0,'TABLE'); p(2,'LAYER'); p(5,'2'); p(100,'AcDbSymbolTable'); p(70,5);
  p(0,'LAYER'); p(5,'10'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'SHEET'); p(70,0); p(62,8); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'11'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'CUT'); p(70,0); p(62,1); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'12'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'META'); p(70,0); p(62,3); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'ENDTAB'); p(0,'ENDSEC');

  p(0,'SECTION'); p(2,'ENTITIES');

  if (params.sheetPolygons && params.sheetPolygons.length){
    for (const ring of params.sheetPolygons){
      if (ring.length < 2) continue;
      p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
      p(8,'SHEET'); p(100,'AcDbPolyline');
      p(90, ring.length); p(70, 1);
      for (const [x, y] of ring){ p(10, x.toFixed(4)); p(20, y.toFixed(4)); }
    }
  } else {
    p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
    p(8,'SHEET'); p(100,'AcDbPolyline');
    p(90, 4); p(70, 1);
    p(10,'0.0000'); p(20,'0.0000');
    p(10, W.toFixed(4)); p(20,'0.0000');
    p(10, W.toFixed(4)); p(20, H.toFixed(4));
    p(10,'0.0000'); p(20, H.toFixed(4));
  }

  for (const pl of (sheet.placed || [])){
    for (const ring of pl.polygons){
      if (ring.length < 2) continue;
      p(0,'LWPOLYLINE'); p(5, nh()); p(100,'AcDbEntity');
      p(8,'CUT'); p(100,'AcDbPolyline');
      p(90, ring.length); p(70, 1);
      for (const [x, y] of ring){
        p(10, (params.edge + pl.x + x).toFixed(4));
        p(20, (params.edge + pl.y + y).toFixed(4));
      }
    }
  }

  const metaFields = {
    name,
    width: W,
    height: H,
    thickness: T,
    edge: params.edge,
    kerf: params.kerf,
    gap: params.gap,
    parts: partsCount,
    number: sheetIdx + 1,
    total: totalSheets,
    date,
  };
  for (const [key, val] of Object.entries(metaFields)){
    p(0,'TEXT'); p(5, nh()); p(100,'AcDbEntity'); p(8,'META'); p(100,'AcDbText');
    p(10, '0.0'); p(20, '0.0'); p(30,'0.0'); p(40,'6.0');
    p(1, `SHEET|${key}=${escapeDxfStr(val)}`); p(50,'0'); p(7,'STANDARD');
  }

  p(0,'ENDSEC'); p(0,'EOF');
  return lines.join('\r\n') + '\r\n';
}

// ─── Универсальный разбор метаданных ───
export function parseRemnantMeta(dxfText){
  if (!dxfText) return null;
  const meta = {};
  let kind = null;
  const re = /(REMNANT|SHEET)\|(\w+)=([^\r\n]+)/g;
  let m;
  while ((m = re.exec(dxfText)) !== null){
    const prefix = m[1].toLowerCase();
    const key = m[2].toLowerCase();
    const val = m[3].trim();
    kind = kind || prefix;
    const numKeys = ['width','height','thickness','edge','kerf','gap','parts','number','total'];
    if (numKeys.includes(key)){
      const n = parseFloat(val);
      if (isFinite(n)) meta[key] = n;
    } else {
      meta[key] = val;
    }
  }
  if (!Object.keys(meta).length) return null;
  return { kind: kind || 'unknown', ...meta };
}

// ─── Сохранение одного остатка с fallback ──────────
export async function saveRemnantAsFile(remnant, params, suggestedName){
  const dxfText = buildRemnantDxf(remnant, params, suggestedName?.replace(/\.dxf$/i, ''));
  const name = suggestedName
    ? sanitizeFileName(suggestedName.replace(/\.dxf$/i, ''), 100) + '.dxf'
    : sanitizeFileName(`Остаток_${Math.round(remnant.w)}x${Math.round(remnant.h)}x${params.thickness}_${todayIso()}`, 100) + '.dxf';

  // 1) Через сервер в папку Остаток\
  const serverRes = await saveFileToServer('remnants', '', name, dxfText);
  if (serverRes.ok) return serverRes;
  console.warn('[Remnant] server save failed:', serverRes.error);

  // 2) Fallback: showSaveFilePicker
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

  // 3) Fallback: скачивание в загрузки
  const blob = new Blob([dxfText], { type: 'application/dxf' });
  downloadBlob(blob, name);
  return { ok: true, name, downloaded: true };
}

// ─── Диалог сохранения остатка(ов) ───
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
  let baseName = null;

  if (all.length > 1){
    const list = all.map((x, i) =>
        `  ${i + 1}. Лист ${x.sheetIdx + 1}: ${Math.round(x.remnant.w)}×${Math.round(x.remnant.h)} мм` +
        (x.remnant.polygon ? ' (полигон)' : '') +
        (x.remnant._manual ? ' [ручной]' : '')
    ).join('\n');
    const v = prompt(
        `Найдено остатков: ${all.length}\n\n${list}\n\n` +
        `Введите номер (1…${all.length}) или «a» — сохранить все:`,
        'a'
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
    baseName = await askFileNameWithPath({
      title: '💾 Сохранить остатки в DXF',
      defaultName: sanitizeFileName(`Остатки_${todayIso()}`, 100),
      destinationHint: makeDestinationHint('remnants', ''),
      storageKey: 'remnantsBatch',
      saveLabel: '💾 Сохранить остатки',
    });
    if (!baseName) return;
  } else {
    const r = targets[0].remnant;
    const W = Math.round(r.w), H = Math.round(r.h), T = params.thickness;
    const defaultOne = sanitizeFileName(`Остаток_${W}x${H}x${T}_${todayIso()}`, 100);
    baseName = await askFileNameWithPath({
      title: '💾 Сохранить остаток в DXF',
      defaultName: defaultOne,
      destinationHint: makeDestinationHint('remnants', ''),
      storageKey: 'remnantSingle',
      saveLabel: '💾 Сохранить остаток',
    });
    if (!baseName) return;
  }

  const date = todayIso();
  let saved = 0, cancelled = 0, errors = 0;
  const savedPaths = [];

  for (let i = 0; i < targets.length; i++){
    const t = targets[i];
    const r = t.remnant;
    const W = Math.round(r.w), H = Math.round(r.h), T = params.thickness;
    const fileName = targets.length > 1
        ? sanitizeFileName(`${baseName}_L${t.sheetIdx + 1}-${i + 1}`, 100) + '.dxf'
        : sanitizeFileName(baseName, 100) + '.dxf';

    setStatus(`Сохранение ${i + 1} из ${targets.length}: ${fileName}...`);

    const res = await saveRemnantAsFile(r, params, fileName);
    if (res.cancelled) { cancelled++; continue; }
    if (!res.ok) { errors++; continue; }
    saved++;
    if (res.path) savedPaths.push(res.path);
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  const parts = [];
  if (saved) parts.push(`сохранено: ${saved}`);
  if (cancelled) parts.push(`отменено: ${cancelled}`);
  if (errors) parts.push(`ошибок: ${errors}`);
  setStatus(`Остатки — ${parts.join(', ')}`);
  if (savedPaths.length === 1) setStatus(`Сохранено: ${savedPaths[0]}`);
}