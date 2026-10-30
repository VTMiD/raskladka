import { $, setStatus } from './utils.js';
import { state, DEFAULT_PARAMS, PROFILES_KEY, ACTIVE_KEY, profilesStore, genId, AUTOFIT_MAX_STEPS } from './state.js';
import { pushHistory } from './history.js';
import { parseDxfText } from './dxf-import.js';

function toMm(v){
  const n = Number(v);
  if(!isFinite(n)) return 1;
  return Math.max(1, Math.round(n));
}
function roundCoord(v){
  return Math.round(Number(v) * 1000) / 1000;
}

function clearCutsAndRemnants(){
  let cutCount = 0, remCount = 0;
  if (Array.isArray(state.sheets) && state.sheets.length) {
    for (const sh of state.sheets) {
      if (Array.isArray(sh.cuts)) cutCount += sh.cuts.length;
      if (Array.isArray(sh.remnants)) remCount += sh.remnants.length;
      sh.cuts = [];
      sh.remnants = [];
    }
  }

  state.cutPoints = [];
  state.cutPreview = null;
  state.remnantPreview = null;

  if (state.remnantMode) {
    state.remnantMode = false;
    const mr = document.getElementById('btnMarkRemnant');
    if (mr) mr.classList.remove('active');
  }

  return { cutCount, remCount };
}

export function readParams(){
  const profile = getActiveProfile();
  return {
    sheetW: toMm($('inW')?.value),
    sheetH: toMm($('inH')?.value),
    thickness: parseFloat($('inThick')?.value) || 1,
    edge: parseFloat($('inEdge')?.value) || 0,
    kerf: parseFloat($('inKerf')?.value) || 0,
    gap: parseFloat($('inGap')?.value) || 0,
    rotMode: parseInt($('inRot')?.value, 10) || 1,
    maxSheets: Math.max(1, parseInt($('inMaxSheets')?.value, 10) || 5),
    remnantOn: !!$('inRemnantOn')?.checked,
    remnantMin: Math.max(20, parseFloat($('inRemnantMin')?.value) || 300),
    remnantGridStep: Math.max(2, Math.min(50, parseFloat($('inRemnantGridStep')?.value) || 10)),
    snapThreshold: Math.max(0, Math.min(50, parseFloat($('inSnapThreshold')?.value) || 10)),
    gridStep: Math.max(1, Math.min(100, parseFloat($('inGridStep')?.value) || 10)),
    gridShow: !!$('inGridShow')?.checked,
    strategy: $('inStrategy')?.value || 'all',
    sheetPolygons: profile?.params?.sheetPolygons || null,
    afMode: $('afMode')?.value || 'fixX',
    afCriterion: $('afCriterion')?.value || 'area',
    afXFrom: parseFloat($('afXFrom')?.value) || 1,
    afXTo: parseFloat($('afXTo')?.value) || 1,
    afXStep: Math.max(1, parseFloat($('afXStep')?.value) || 1),
    afYFrom: parseFloat($('afYFrom')?.value) || 1,
    afYTo: parseFloat($('afYTo')?.value) || 1,
    afYStep: Math.max(1, parseFloat($('afYStep')?.value) || 1)
  };
}

export function updateSumGap(){
  try {
    const p = readParams();
    const el = $('sumGap'); if(el) el.textContent = (p.kerf + p.gap).toFixed(2);
  } catch(_){}
}

export function updateStockMiniInfo(){
  const el = document.getElementById('stockMiniInfo');
  if(!el) return;
  try {
    const p = readParams();
    const hasPoly = !!(p.sheetPolygons && p.sheetPolygons.length);
    const dims = `${p.sheetW} × ${p.sheetH} × ${p.thickness} мм`;
    el.textContent = dims + (hasPoly ? ' · контур DXF' : '');
  } catch(_){ el.textContent = ''; }
}

export function updateStockDxfUI(){
  const p = getActiveProfile();
  const hasPoly = !!(p?.params?.sheetPolygons?.length);
  const btnClr = document.getElementById('btnClearStockDxf');
  const info   = document.getElementById('stockDxfInfo');
  const inW    = document.getElementById('inW');
  const inH    = document.getElementById('inH');
  const afBtn  = document.getElementById('btnOpenAutofit');

  if(btnClr) btnClr.style.display = hasPoly ? '' : 'none';
  if(info){
    info.style.display = hasPoly ? '' : 'none';
    if(hasPoly){
      const polys = p.params.sheetPolygons;
      let area = 0;
      for(const r of polys){
        let a = 0;
        for(let i=0, j=r.length-1; i<r.length; j=i++)
          a += r[j][0]*r[i][1] - r[i][0]*r[j][1];
        area += Math.abs(a/2);
      }
      info.textContent = `Контур DXF · площадь ≈ ${(area/1e6).toFixed(3)} м² · отверстий: ${Math.max(0, polys.length - 1)}`;
    }
  }
  if(inW) inW.readOnly = hasPoly;
  if(inH) inH.readOnly = hasPoly;
  if(afBtn) afBtn.disabled = hasPoly;
}

export function applyParams(p){
  if(!p) return;
  if(isFinite(p.sheetW) && $('inW')) $('inW').value = String(toMm(p.sheetW));
  if(isFinite(p.sheetH) && $('inH')) $('inH').value = String(toMm(p.sheetH));
  if(isFinite(p.thickness) && $('inThick')) $('inThick').value = p.thickness;
  if(isFinite(p.edge) && $('inEdge')) $('inEdge').value = p.edge;
  if(isFinite(p.kerf) && $('inKerf')) $('inKerf').value = p.kerf;
  if(isFinite(p.gap) && $('inGap')) $('inGap').value = p.gap;
  if(p.rotMode && $('inRot')) $('inRot').value = p.rotMode;
  if(isFinite(p.maxSheets) && $('inMaxSheets')) $('inMaxSheets').value = p.maxSheets;
  if(typeof p.remnantOn === 'boolean' && $('inRemnantOn')) $('inRemnantOn').checked = p.remnantOn;
  if(isFinite(p.remnantMin) && $('inRemnantMin')) $('inRemnantMin').value = p.remnantMin;
  if(isFinite(p.remnantGridStep) && $('inRemnantGridStep')) $('inRemnantGridStep').value = p.remnantGridStep;
  if(isFinite(p.snapThreshold) && $('inSnapThreshold')) $('inSnapThreshold').value = p.snapThreshold;
  if(isFinite(p.gridStep) && $('inGridStep')) $('inGridStep').value = p.gridStep;
  if(typeof p.gridShow === 'boolean' && $('inGridShow')) $('inGridShow').checked = p.gridShow;
  if(p.strategy){
    let s = p.strategy;
    if (s === 'maxDim') s = 'width';
    if (s === 'genetic') s = 'all';
    const sel = $('inStrategy');
    if (sel){
      const exists = [...sel.options].some(o => o.value === s);
      sel.value = exists ? s : 'all';
    }
  }
  if(p.afMode && $('afMode')) $('afMode').value = p.afMode;
  if(p.afCriterion && $('afCriterion')) $('afCriterion').value = p.afCriterion;
  if(isFinite(p.afXFrom) && $('afXFrom')) $('afXFrom').value = p.afXFrom;
  if(isFinite(p.afXTo) && $('afXTo')) $('afXTo').value = p.afXTo;
  if(isFinite(p.afXStep) && $('afXStep')) $('afXStep').value = p.afXStep;
  if(isFinite(p.afYFrom) && $('afYFrom')) $('afYFrom').value = p.afYFrom;
  if(isFinite(p.afYTo) && $('afYTo')) $('afYTo').value = p.afYTo;
  if(isFinite(p.afYStep) && $('afYStep')) $('afYStep').value = p.afYStep;

  const inW = $('inW'), inH = $('inH');
  if(inW) inW.value = String(toMm(inW.value));
  if(inH) inH.value = String(toMm(inH.value));

  updateSumGap();
  updateAutofitCount();
  updateAutofitModeUI();
  try { updateStockDxfUI(); } catch(_){}
  try { updateStockMiniInfo(); } catch(_){}
}

export function autoProfileName(p){
  const w = toMm(p.sheetW||0), h = toMm(p.sheetH||0), t = p.thickness||0;
  return `Лист ${w}×${h} (${t} мм)`;
}

export function loadProfiles(){
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if(raw) profilesStore.profiles = JSON.parse(raw) || [];
  } catch(_){ profilesStore.profiles = []; }
  if(!Array.isArray(profilesStore.profiles) || !profilesStore.profiles.length){
    const id = genId();
    profilesStore.profiles = [{ id, name: autoProfileName(DEFAULT_PARAMS), nameCustom:false, params: {...DEFAULT_PARAMS} }];
  }
  profilesStore.profiles = profilesStore.profiles.filter(p => p && p.id && p.params);

  for(const p of profilesStore.profiles){
    const pr = p.params;
    if(!pr) continue;
    if(isFinite(pr.sheetW)) pr.sheetW = toMm(pr.sheetW);
    if(isFinite(pr.sheetH)) pr.sheetH = toMm(pr.sheetH);
    if(Array.isArray(pr.sheetPolygons)){
      pr.sheetPolygons = pr.sheetPolygons.map(r =>
        r.map(pt => [roundCoord(pt[0]), roundCoord(pt[1])])
      );
    }
    if (pr.strategy === 'maxDim') pr.strategy = 'width';
    if (pr.strategy === 'genetic') pr.strategy = 'all';
    if(!p.nameCustom) p.name = autoProfileName(pr);
  }

  try { profilesStore.activeId = localStorage.getItem(ACTIVE_KEY); } catch(_){ profilesStore.activeId = null; }
  if(!profilesStore.activeId || !profilesStore.profiles.some(p => p.id === profilesStore.activeId)){
    profilesStore.activeId = profilesStore.profiles[0].id;
  }
}

export function saveProfiles(){
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profilesStore.profiles));
    localStorage.setItem(ACTIVE_KEY, profilesStore.activeId);
  } catch(_){}
}
export function getActiveProfile(){
  return profilesStore.profiles.find(p => p.id === profilesStore.activeId) || profilesStore.profiles[0] || null;
}
export function renderProfileSelect(){
  const sel = $('profileSelect'); if(!sel) return;
  sel.innerHTML = '';
  for(const p of profilesStore.profiles){
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if(p.id === profilesStore.activeId) opt.selected = true;
    sel.appendChild(opt);
  }
}
export function updateActiveProfileFromFields(){
  try {
    const p = getActiveProfile(); if(!p) return;
    p.params = readParams();
    if(!p.nameCustom) p.name = autoProfileName(p.params);
    saveProfiles();
    const sel = $('profileSelect');
    if(sel) for(const opt of sel.options) if(opt.value === p.id){ opt.textContent = p.name; break; }
    updateStockMiniInfo();
  } catch(_){}
}

export function buildRange(from, to, step){
  const lo = Math.min(from, to), hi = Math.max(from, to), s = Math.max(1, step);
  const arr = [];
  for(let v = lo; v <= hi + 1e-6; v += s) arr.push(Math.round(v*100)/100);
  return arr;
}
export function getAutofitValues(){
  const p = readParams();
  const mode = p.afMode;
  let xs, ys;
  if(mode==='fixX'){ xs=[p.sheetW]; ys = buildRange(p.afYFrom, p.afYTo, p.afYStep); }
  else if(mode==='fixY'){ xs = buildRange(p.afXFrom, p.afXTo, p.afXStep); ys=[p.sheetH]; }
  else { xs = buildRange(p.afXFrom, p.afXTo, p.afXStep); ys = buildRange(p.afYFrom, p.afYTo, p.afYStep); }
  return { xs, ys, mode };
}
export function updateAutofitCount(){
  try {
    const { xs, ys } = getAutofitValues();
    const n = xs.length * ys.length;
    const el = $('afCount');
    if(!el) return;
    if(n > AUTOFIT_MAX_STEPS){
      el.className = 'af-count warn';
      el.textContent = `⚠ Вариантов: ${n} — превышает лимит ${AUTOFIT_MAX_STEPS}.`;
      const b = $('btnAutoFit'); if(b) b.disabled = true;
    } else {
      el.className = 'af-count ok';
      el.textContent = `Вариантов: ${n} (X: ${xs.length}, Y: ${ys.length})`;
      const b = $('btnAutoFit'); if(b) b.disabled = false;
    }
  } catch(_){}
}
export function updateAutofitModeUI(){
  const mode = $('afMode')?.value;
  if(!mode) return;
  const ax = $('afXDim'), ay = $('afYDim');
  if(ax) ax.style.opacity = (mode==='fixX') ? '0.45' : '1';
  if(ay) ay.style.opacity = (mode==='fixY') ? '0.45' : '1';
  const f1 = $('afXFrom'), f2 = $('afXTo'), f3 = $('afXStep');
  const g1 = $('afYFrom'), g2 = $('afYTo'), g3 = $('afYStep');
  if(f1) f1.disabled = mode==='fixX';
  if(f2) f2.disabled = mode==='fixX';
  if(f3) f3.disabled = mode==='fixX';
  if(g1) g1.disabled = mode==='fixY';
  if(g2) g2.disabled = mode==='fixY';
  if(g3) g3.disabled = mode==='fixY';
}

export function updateGaParamsUI(){ /* no-op */ }

export function makeBaseName(){
  const p = readParams();
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `Raskladka_${toMm(p.sheetW)}x${toMm(p.sheetH)}_${ts}`;
}

export function bindProfileUI(){
  $('profileSelect')?.addEventListener('change', e => {
    profilesStore.activeId = e.target.value;
    const p = getActiveProfile(); if(p) applyParams(p.params);
    saveProfiles();
    try { updateStockDxfUI(); } catch(_){}
    import('./canvas.js').then(m => m.draw()).catch(() => {});
  });

  $('btnNewProfile')?.addEventListener('click', () => {
    const cur = readParams();
    const name = prompt('Название новой заготовки:', autoProfileName(cur));
    if(name === null) return;
    const id = genId();
    const prof = { id, name: name.trim() || autoProfileName(cur), nameCustom:true, params:{...cur} };
    profilesStore.profiles.push(prof);
    profilesStore.activeId = id;
    renderProfileSelect(); saveProfiles();
    try { updateStockDxfUI(); } catch(_){}
  });
  $('btnSaveProfile')?.addEventListener('click', () => {
    const p = getActiveProfile(); if(!p) return;
    p.params = readParams();
    if(!p.nameCustom) p.name = autoProfileName(p.params);
    saveProfiles(); renderProfileSelect();
  });
  $('btnRenameProfile')?.addEventListener('click', () => {
    const p = getActiveProfile(); if(!p) return;
    const old = p.name;
    const v = prompt('Новое имя заготовки:', old);
    if(v === null) return;
    const newName = v.trim() || old;
    if(newName === old) return;
    p.name = newName;
    p.nameCustom = true;
    saveProfiles();
    renderProfileSelect();
    pushHistory();
  });
  $('btnDeleteProfile')?.addEventListener('click', () => {
    if(profilesStore.profiles.length <= 1){ alert('Нельзя удалить последний профиль'); return; }
    const p = getActiveProfile(); if(!p) return;
    if(!confirm('Удалить заготовку «' + p.name + '»?')) return;
    profilesStore.profiles = profilesStore.profiles.filter(x => x.id !== p.id);
    profilesStore.activeId = profilesStore.profiles[0].id;
    const next = getActiveProfile(); if(next) applyParams(next.params);
    renderProfileSelect(); saveProfiles();
    try { updateStockDxfUI(); } catch(_){}
  });

  const PARAM_FIELDS = ['inW','inH','inThick','inEdge','inKerf','inGap','inRot','inMaxSheets',
    'inRemnantOn','inRemnantMin','inRemnantGridStep','inSnapThreshold','inGridStep','inGridShow','inStrategy','afMode','afCriterion',
    'afXFrom','afXTo','afXStep','afYFrom','afYTo','afYStep'];

  PARAM_FIELDS.forEach(id => {
    const el = $(id); if(!el) return;
    const handler = () => {
      updateSumGap();
      updateActiveProfileFromFields();
      if(id === 'afMode') updateAutofitModeUI();
      if(id === 'afMode' || id.startsWith('af')) updateAutofitCount();
      // Живое обновление холста при изменении параметров заготовки
      if(id === 'inW' || id === 'inH' || id === 'inThick' || id === 'inEdge' ||
         id === 'inGridShow' || id === 'inGridStep'){
        import('./canvas.js').then(m => m.draw()).catch(() => {});
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  const roundField = (id) => {
    const el = $(id); if(!el) return;
    const round = () => {
      if(el.readOnly) return;
      const v = parseFloat(el.value);
      if(isFinite(v)){
        const r = Math.max(1, Math.round(v));
        const s = String(r);
        if(el.value !== s) el.value = s;
      }
    };
    el.addEventListener('blur', round);
    el.addEventListener('change', round);
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); round(); el.blur(); }
    });
  };
  roundField('inW');
  roundField('inH');

  const stockFile = document.getElementById('stockDxfInput');
  const stockBtn  = document.getElementById('btnLoadStockDxf');
  const stockClr  = document.getElementById('btnClearStockDxf');

  if(stockBtn && stockFile){
    stockBtn.addEventListener('click', () => stockFile.click());
    stockFile.addEventListener('change', async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if(!file) return;
      try {
        setStatus('Загрузка заготовки...');
        const text = await file.text();
        window.stockDxfText = text;
        window.stockDxfName = file.name;
        const parsed = parseDxfText(text, file.name);
        if(!parsed.polygons || !parsed.polygons.length){
          alert('В файле не найдено замкнутых контуров');
          setStatus('');
          return;
        }
        const prof = getActiveProfile();
        if(!prof) return;

        const W = toMm(parsed.width);
        const H = toMm(parsed.height);
        const sx = parsed.width  > 1e-6 ? W / parsed.width  : 1;
        const sy = parsed.height > 1e-6 ? H / parsed.height : 1;
        const polys = parsed.polygons.map(r =>
          r.map(([x, y]) => [roundCoord(x * sx), roundCoord(y * sy)])
        );

        prof.params = { ...prof.params, sheetPolygons: polys, sheetW: W, sheetH: H };

        if (parsed.meta && parsed.meta.kind === 'remnant') {
          if (parsed.meta.name) {
            prof.name = parsed.meta.name;
            prof.nameCustom = true;
          }
          if (isFinite(parsed.meta.thickness)) {
            prof.params.thickness = parsed.meta.thickness;
            if ($('inThick')) $('inThick').value = parsed.meta.thickness;
          }
        }

        saveProfiles();
        applyParams(prof.params);
        updateStockDxfUI();
        updateStockMiniInfo();
        renderProfileSelect();

        const { cutCount, remCount } = clearCutsAndRemnants();

        const tag = (parsed.meta && parsed.meta.kind === 'remnant') ? ' (остаток)' : '';
        let msg = `Заготовка загружена: ${W} × ${H} мм${tag}`;
        if (cutCount || remCount) {
          msg += ` · очищено: ${cutCount} рез., ${remCount} ост.`;
        }
        setStatus(msg);

        import('./canvas.js').then(m => m.draw()).catch(() => {});
        import('./report.js').then(m => m.updateReport()).catch(() => {});
      } catch(err){
        alert('Ошибка загрузки DXF заготовки: ' + err.message);
        setStatus('');
      }
    });
  }

  if(stockClr){
    stockClr.addEventListener('click', () => {
      const prof = getActiveProfile();
      if(!prof) return;
      delete prof.params.sheetPolygons;
      window.stockDxfText = null;
      window.stockDxfName = null;
      saveProfiles();
      applyParams(prof.params);
      updateStockDxfUI();
      updateStockMiniInfo();

      const { cutCount, remCount } = clearCutsAndRemnants();
      let msg = 'Заготовка: прямоугольник';
      if (cutCount || remCount) msg += ` · очищено: ${cutCount} рез., ${remCount} ост.`;
      setStatus(msg);

      import('./canvas.js').then(m => m.draw()).catch(() => {});
      import('./report.js').then(m => m.updateReport()).catch(() => {});
    });
  }
}