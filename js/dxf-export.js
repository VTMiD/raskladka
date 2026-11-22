import { $, setStatus, askFileNameWithPath, makeDestinationHint, downloadBlob, saveFileToServer } from './utils.js';
import { state, HAS_SAVE_PICKER, FS_IDS } from './state.js';
import { readParams, makeDxfExportName } from './params.js';
import { getCurrentProjectName } from './project-io.js';
import { todayIso } from './utils.js';

let _hCounter = 0x100;
function nextHandle(){ return (++_hCounter).toString(16).toUpperCase(); }

function writeLayerTable(lines){
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'TABLE'); p(2,'LAYER'); p(5,'2'); p(100,'AcDbSymbolTable'); p(70,5);
  p(0,'LAYER'); p(5,'10'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'SHEET'); p(70,0); p(62,8); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'11'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'CUT'); p(70,0); p(62,1); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'12'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'MARK'); p(70,0); p(62,3); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'13'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'REMNANT'); p(70,0); p(62,5); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'14'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'SHEETCUT'); p(70,0); p(62,30); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'LAYER'); p(5,'15'); p(100,'AcDbSymbolTableRecord'); p(100,'AcDbLayerTableRecord');
  p(2,'META'); p(70,0); p(62,3); p(6,'CONTINUOUS'); p(370,-3);
  p(0,'ENDTAB');
}
function writeLwPolyline(lines, points, closed, layer){
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'LWPOLYLINE'); p(5, nextHandle()); p(100,'AcDbEntity');
  p(8, layer||'0'); p(100,'AcDbPolyline');
  p(90, points.length); p(70, closed?1:0);
  for(const [x,y] of points){ p(10, x.toFixed(4)); p(20, y.toFixed(4)); }
}
function writeLineEntity(lines, x1,y1,x2,y2, layer){
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'LINE'); p(5, nextHandle()); p(100,'AcDbEntity');
  p(8, layer||'0'); p(100,'AcDbLine');
  p(10, x1.toFixed(4)); p(20, y1.toFixed(4)); p(30,'0.0');
  p(11, x2.toFixed(4)); p(21, y2.toFixed(4)); p(31,'0.0');
}
function writeTextEntity(lines, text, x, y, height, rotation, layer){
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'TEXT'); p(5, nextHandle()); p(100,'AcDbEntity');
  p(8, layer||'MARK'); p(100,'AcDbText');
  p(10, x.toFixed(4)); p(20, y.toFixed(4)); p(30,'0.0'); p(40, height.toFixed(4));
  p(1, String(text)); p(50, String(rotation||0)); p(7,'STANDARD');
}

function writeSheetMeta(lines, params, sheet, sheetIdx, totalSheets){
  const date = todayIso();
  const name = `List_${sheetIdx+1}_${Math.round(params.sheetW)}x${Math.round(params.sheetH)}x${params.thickness}_${date}`;
  const fields = {
    name,
    width: Math.round(params.sheetW),
    height: Math.round(params.sheetH),
    thickness: params.thickness,
    edge: params.edge,
    kerf: params.kerf,
    gap: params.gap,
    parts: (sheet.placed || []).length,
    number: sheetIdx + 1,
    total: totalSheets,
    date,
  };
  for (const [key, val] of Object.entries(fields)){
    writeTextEntity(lines, `SHEET|${key}=${val}`, 0, 0, 6, 0, 'META');
  }
}

function writeSheetEntities(lines, sheet, params, ox, SW, SH, sheetIdx, totalSheets){
  if(params.sheetPolygons && params.sheetPolygons.length){
    for(const ring of params.sheetPolygons){
      if(ring.length < 2) continue;
      const pts = ring.map(([x, y]) => [ox + x, y]);
      writeLwPolyline(lines, pts, true, 'SHEET');
    }
  } else {
    writeLwPolyline(lines, [[ox,0],[ox+SW,0],[ox+SW,SH],[ox,SH]], true, 'SHEET');
  }

  const textHeight = Math.max(8, Math.min(SW,SH)/55);
  let n = 0;
  for(const pl of sheet.placed){
    const part = state.parts[pl.partIdx]; if(!part) continue;
    for(const ring of pl.polygons){
      if(ring.length < 2) continue;
      const pts = ring.map(([x,y]) => [ox + params.edge + pl.x + x, params.edge + pl.y + y]);
      writeLwPolyline(lines, pts, true, 'CUT');
    }
    n++;
    const pw = pl.bbox[2] - pl.bbox[0], ph = pl.bbox[3] - pl.bbox[1];
    const cx = ox + params.edge + pl.x + pw/2;
    const cy = params.edge + pl.y + ph/2;
    const label = `${n}. ${part.name}`;
    const estWidth = label.length * textHeight * 0.55;
    writeTextEntity(lines, label, cx - estWidth/2, cy - textHeight*0.35, textHeight, 0, 'MARK');
  }
  if(sheet.remnants && sheet.remnants.length){
    for(const r of sheet.remnants){
      writeLineEntity(lines, ox + r.cut.x1, r.cut.y1, ox + r.cut.x2, r.cut.y2, 'REMNANT');
    }
  }
  if(sheet.cuts && sheet.cuts.length){
    for(const c of sheet.cuts){
      writeLineEntity(lines, ox + c.x1, c.y1, ox + c.x2, c.y2, 'SHEETCUT');
    }
  }
  if (sheetIdx != null && totalSheets != null){
    writeSheetMeta(lines, params, sheet, sheetIdx, totalSheets);
  }
}

export function buildDxfAllSheets(){
  _hCounter = 0x100;
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const gapBetween = Math.max(SW*0.05, 100);
  const lines = [];
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'SECTION'); p(2,'HEADER'); p(9,'$ACADVER'); p(1,'AC1015'); p(9,'$INSUNITS'); p(70,4); p(0,'ENDSEC');
  p(0,'SECTION'); p(2,'TABLES'); writeLayerTable(lines); p(0,'ENDSEC');
  p(0,'SECTION'); p(2,'ENTITIES');
  const total = state.sheets.length;
  for(let si=0; si<state.sheets.length; si++){
    const sheet = state.sheets[si];
    const ox = si * (SW + gapBetween);
    writeSheetEntities(lines, sheet, params, ox, SW, SH, si, total);
  }
  p(0,'ENDSEC'); p(0,'EOF');
  return lines.join('\r\n') + '\r\n';
}

export function buildDxfSingleSheet(sheetIndex){
  _hCounter = 0x100;
  const params = readParams();
  const SW = params.sheetW, SH = params.sheetH;
  const sheet = state.sheets[sheetIndex];
  const lines = [];
  const p = (c,v) => { lines.push(String(c)); lines.push(String(v)); };
  p(0,'SECTION'); p(2,'HEADER'); p(9,'$ACADVER'); p(1,'AC1015'); p(9,'$INSUNITS'); p(70,4); p(0,'ENDSEC');
  p(0,'SECTION'); p(2,'TABLES'); writeLayerTable(lines); p(0,'ENDSEC');
  p(0,'SECTION'); p(2,'ENTITIES');
  writeSheetEntities(lines, sheet, params, 0, SW, SH, sheetIndex, state.sheets.length);
  p(0,'ENDSEC'); p(0,'EOF');
  return lines.join('\r\n') + '\r\n';
}

async function saveDxfFile(text, suggestedName, pickerId, category){
  if (category) {
    const res = await saveFileToServer(category, '', suggestedName, text);
    if (res.ok) return res;
    console.warn('[DXF] server save failed:', res.error);
  }

  if(HAS_SAVE_PICKER){
    try {
      const handle = await window.showSaveFilePicker({
        id: pickerId, suggestedName, startIn:'documents',
        types:[{description:'DXF', accept:{'application/dxf':['.dxf']}}]
      });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return { ok:true, name: handle.name };
    } catch(e){
      if(e.name === 'AbortError') return { ok:false, cancelled:true };
    }
  }
  const blob = new Blob([text], {type:'application/dxf'});
  downloadBlob(blob, suggestedName);
  return { ok:true, name: suggestedName, downloaded:true };
}

export function bindDxfExportUI(){
  $('btnExport').addEventListener('click', async () => {
    if(!state.sheets.length){ alert('Сначала нажмите «Разложить»'); return; }
    
    let rsNum = '01';
    if (state.jobs && state.jobs.length) {
      const activeJob = state.jobs.find(j => j.id === state.activeJobId);
      if (activeJob && activeJob.name) {
        const match = activeJob.name.match(/\d+/);
        if (match) {
          rsNum = match[0];
        } else {
          const idx = state.jobs.findIndex(j => j.id === state.activeJobId);
          if (idx >= 0) rsNum = String(idx + 1).padStart(2, '0');
        }
      }
    }
    let prNum = '01';
    try {
      const projName = getCurrentProjectName();
      if (projName) {
        const m = projName.match(/^PR(\d+)/i);
        if (m) prNum = String(m[1]).padStart(2, '0');
      }
    } catch (_) {}

    const defaultName = makeDxfExportName(0, rsNum, prNum);
    
    const name = await askFileNameWithPath({
      title: '💾 Сохранить все листы в DXF',
      defaultName,
      destinationHint: makeDestinationHint('sheets', ''),
      storageKey: 'dxfAll',
      saveLabel: '💾 Сохранить DXF',
      width: 560,
    });
    if (!name) return;
    const dxfText = buildDxfAllSheets();
    const suggested = name + '.dxf';
    setStatus('Сохранение...');
    const res = await saveDxfFile(dxfText, suggested, FS_IDS.save, 'sheets');
    if(res.cancelled){ setStatus(''); return; }
    if(res.ok) {
      if (res.viaServer) setStatus(`Сохранено: ${res.path}`);
      else if (res.downloaded) setStatus(`Скачано: ${res.name}`);
      else setStatus(`Сохранено: ${res.name}`);
    }
  });

  $('btnExportSplit').addEventListener('click', async () => {
    if(!state.sheets.length){ alert('Сначала нажмите «Разложить»'); return; }
    
    let rsNum = '01';
    if (state.jobs && state.jobs.length) {
      const activeJob = state.jobs.find(j => j.id === state.activeJobId);
      if (activeJob && activeJob.name) {
        const match = activeJob.name.match(/\d+/);
        if (match) {
          rsNum = match[0];
        } else {
          const idx = state.jobs.findIndex(j => j.id === state.activeJobId);
          if (idx >= 0) rsNum = String(idx + 1).padStart(2, '0');
        }
      }
    }
    let prNum = '01';
    try {
      const projName = getCurrentProjectName();
      if (projName) {
        const m = projName.match(/^PR(\d+)/i);
        if (m) prNum = String(m[1]).padStart(2, '0');
      }
    } catch (_) {}

        // Берем имя для ПЕРВОГО листа (индекс 0), чтобы в окне было правильное Dt
    const defaultBase = makeDxfExportName(0, rsNum, prNum);
    
    const base = await askFileNameWithPath({
      title: '💾 Сохранить листы в DXF (каждый отдельно)',
      defaultName: defaultBase,
      // ...
    });
    if (!base) return;
    
    setStatus('Сохранение по листам...');
    
    for(let i=0; i<state.sheets.length; i++){
      const dxfText = buildDxfSingleSheet(i);
      let perSheetName = '';
      
      if (base === defaultBase) {
        perSheetName = makeDxfExportName(i, rsNum, prNum);
      } else {
        const baseWithoutDt = base.replace(/\s*Dt\d+$/i, '');
        const countOnSheet = state.sheets[i].placed.length;
        perSheetName = `${baseWithoutDt} Dt${countOnSheet}`;
      }
      
      const suggested = `${perSheetName}.dxf`;
      const res = await saveDxfFile(dxfText, suggested, FS_IDS.save + '-' + i, 'sheets');
      
      if(res.cancelled){ setStatus('Отменено на листе ' + (i+1)); return; }
      if(!res.ok){ setStatus('Ошибка на листе ' + (i+1)); return; }
      
      if (res.viaServer) setStatus(`Сохранено ${i+1} / ${state.sheets.length}: ${res.path}`);
      else setStatus(`Сохранено ${i+1} / ${state.sheets.length}: ${res.name}`);
    }
    setStatus(`Готово: ${state.sheets.length} файл(ов)`);
  });
}