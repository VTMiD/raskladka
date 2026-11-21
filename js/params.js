// js/params.js
import { state, DEFAULT_PARAMS, profilesStore, PROFILES_KEY, ACTIVE_KEY, genId } from './state.js';
import { $, setStatus, sanitizeFileName } from './utils.js';
import { parseDxfText } from './dxf-import.js';
import { schedulePush } from './history.js';
import { getCurrentProjectName } from './project-io.js';

// ─── DXF заготовки ───
let _stockDxfBound = false;

export function bindStockDxfUI() {
  if (_stockDxfBound) return;
  _stockDxfBound = true;

  const btnLoad = $('btnLoadStockDxf');
  const fileInput = $('stockDxfInput');
  const btnClear = $('btnClearStockDxf');

  if (btnLoad && fileInput) {
    btnLoad.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        setStatus('Загрузка контура заготовки...');
        const text = await file.text();
        const parsed = parseDxfText(text, file.name);
        window.stockPolygons = parsed.polygons;
        window.stockDxfName = file.name;
        window.stockDxfText = text;

        const inW = $('inW');
        const inH = $('inH');
        if (inW && parsed.width) inW.value = Math.round(parsed.width);
        if (inH && parsed.height) inH.value = Math.round(parsed.height);

        updateStockDxfUI();
        updateStockMiniInfo();
        setStatus(`Контур заготовки загружен: ${Math.round(parsed.width)}×${Math.round(parsed.height)} мм`);
        import('./canvas.js').then(m => m.draw()).catch(() => {});
        schedulePush(500);
      } catch (err) {
        setStatus('Ошибка загрузки контура: ' + err.message);
        alert('Ошибка загрузки DXF: ' + err.message);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      window.stockPolygons = null;
      window.stockDxfName = null;
      window.stockDxfText = null;
      updateStockDxfUI();
      updateStockMiniInfo();
      setStatus('Контур заготовки сброшен');
      import('./canvas.js').then(m => m.draw()).catch(() => {});
      schedulePush(500);
    });
  }
}

// ─── Профили ───
export function loadProfiles() {
  try {
    const saved = localStorage.getItem(PROFILES_KEY);
    if (saved) {
      profilesStore.profiles = JSON.parse(saved);
    }
  } catch(e) { console.warn('loadProfiles error:', e); }

  if (!profilesStore.profiles || !profilesStore.profiles.length) {
    profilesStore.profiles = [{
      id: genId(),
      name: 'Стандарт',
      nameCustom: false,
      params: { ...DEFAULT_PARAMS }
    }];
    saveProfiles();
  }

  try {
    profilesStore.activeId = localStorage.getItem(ACTIVE_KEY);
  } catch(e) {}

  if (!profilesStore.activeId || !profilesStore.profiles.some(p => p.id === profilesStore.activeId)) {
    profilesStore.activeId = profilesStore.profiles[0].id;
  }
}

export function saveProfiles() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profilesStore.profiles));
    if (profilesStore.activeId) localStorage.setItem(ACTIVE_KEY, profilesStore.activeId);
  } catch(e) { console.warn('saveProfiles error:', e); }
}

export function getActiveProfile() {
  return profilesStore.profiles.find(p => p.id === profilesStore.activeId);
}

export function updateActiveProfileFromFields() {
  const p = getActiveProfile();
  if (!p) return;
  p.params = readParams();
  saveProfiles();
}

// ─── Чтение параметров ───
export function readParams() {
  const p = { ...DEFAULT_PARAMS };

  const getVal = (id, defaultVal) => {
    const el = $(id);
    if (!el) return defaultVal;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const v = parseFloat(el.value);
      return isNaN(v) ? defaultVal : v;
    }
    return el.value;
  };

  p.sheetW = getVal('inW', 3000);
  p.sheetH = getVal('inH', 1500);
  p.thickness = getVal('inThick', 6);
  p.edge = getVal('inEdge', 5);
  p.kerf = getVal('inKerf', 5);
  p.gap = getVal('inGap', 2);
  p.rotMode = parseInt(getVal('inRot', '4'), 10) || 4;
  p.strategy = getVal('inStrategy', 'all');
  p.maxSheets = getVal('inMaxSheets', 5);
  p.remnantOn = getVal('inRemnantOn', false);
  p.remnantMin = getVal('inRemnantMin', 300);
  p.remnantGridStep = getVal('inRemnantGridStep', 10);
  p.snapThreshold = getVal('inSnapThreshold', 10);
  p.gridStep = getVal('inGridStep', 10);
  p.gridShow = getVal('inGridShow', false);
  p.pricePerM2 = getVal('inPricePerM2', 0);

  p.gaPop = getVal('inGaPop', 16);
  p.gaGen = getVal('inGaGen', 25);
  p.gaMut = getVal('inGaMut', 20);

  p.afMode = getVal('afMode', 'fixX');
  p.afCriterion = getVal('afCriterion', 'area');
  p.afXFrom = getVal('afXFrom', 2000);
  p.afXTo = getVal('afXTo', 4000);
  p.afXStep = getVal('afXStep', 100);
  p.afYFrom = getVal('afYFrom', 500);
  p.afYTo = getVal('afYTo', 1000);
  p.afYStep = getVal('afYStep', 50);

  p.sheetPolygons = window.stockPolygons || null;

  return p;
}

// ─── Применение параметров ───
export function applyParams(params) {
  if (!params) return;

  const setVal = (id, val) => {
    const el = $(id);
    if (!el || val === undefined || val === null) return;
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else {
      el.value = String(val);
    }
  };

  setVal('inW', params.sheetW);
  setVal('inH', params.sheetH);
  setVal('inThick', params.thickness);
  setVal('inEdge', params.edge);
  setVal('inKerf', params.kerf);
  setVal('inGap', params.gap);
  setVal('inRot', params.rotMode);
  setVal('inStrategy', params.strategy);
  setVal('inMaxSheets', params.maxSheets);
  setVal('inRemnantOn', params.remnantOn);
  setVal('inRemnantMin', params.remnantMin);
  setVal('inRemnantGridStep', params.remnantGridStep);
  setVal('inSnapThreshold', params.snapThreshold);
  setVal('inGridStep', params.gridStep);
  setVal('inGridShow', params.gridShow);
  setVal('inPricePerM2', params.pricePerM2);

  setVal('inGaPop', params.gaPop);
  setVal('inGaGen', params.gaGen);
  setVal('inGaMut', params.gaMut);

  setVal('afMode', params.afMode);
  setVal('afCriterion', params.afCriterion);
  setVal('afXFrom', params.afXFrom);
  setVal('afXTo', params.afXTo);
  setVal('afXStep', params.afXStep);
  setVal('afYFrom', params.afYFrom);
  setVal('afYTo', params.afYTo);
  setVal('afYStep', params.afYStep);

  if (params.sheetPolygons !== undefined) {
    if (!params.sheetPolygons || params.sheetPolygons.length === 0) {
      window.stockPolygons = null;
      window.stockDxfText = null;
      window.stockDxfName = null;
    } else {
      window.stockPolygons = params.sheetPolygons;
    }
    updateStockDxfUI();
  }

  updateSumGap();
  updateGaParamsUI();
}

// ─── UI ───
export function renderProfileSelect() {
  const sel = $('profileSelect');
  if (!sel) return;
  sel.innerHTML = '';
  for (const p of profilesStore.profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === profilesStore.activeId) opt.selected = true;
    sel.appendChild(opt);
  }
}

export function bindProfileUI() {
  bindStockDxfUI();

  $('profileSelect')?.addEventListener('change', (e) => {
    profilesStore.activeId = e.target.value;
    const p = getActiveProfile();
    if (p) {
      applyParams(p.params);
      saveProfiles();
      updateStockMiniInfo();
      schedulePush(100);
    }
  });

  $('btnNewProfile')?.addEventListener('click', () => {
    const p = readParams();
    const name = prompt('Название нового профиля:', `Профиль ${profilesStore.profiles.length + 1}`);
    if (name === null) return;
    const newProf = {
      id: genId(),
      name: (name || '').trim() || 'Новый профиль',
      nameCustom: true,
      params: p
    };
    profilesStore.profiles.push(newProf);
    profilesStore.activeId = newProf.id;
    saveProfiles();
    renderProfileSelect();
    setStatus(`Создан профиль: ${newProf.name}`);
  });

  $('btnSaveProfile')?.addEventListener('click', () => {
    const p = getActiveProfile();
    if (!p) return;
    p.params = readParams();
    saveProfiles();
    setStatus(`Профиль «${p.name}» сохранён`);
  });

  $('btnRenameProfile')?.addEventListener('click', () => {
    const p = getActiveProfile();
    if (!p) return;
    const name = prompt('Новое имя профиля:', p.name);
    if (name === null) return;
    p.name = (name || '').trim() || p.name;
    p.nameCustom = true;
    saveProfiles();
    renderProfileSelect();
    setStatus(`Профиль переименован: ${p.name}`);
  });

  $('btnDeleteProfile')?.addEventListener('click', () => {
    if (profilesStore.profiles.length <= 1) {
      alert('Нельзя удалить единственный профиль');
      return;
    }
    const p = getActiveProfile();
    if (!p) return;
    if (!confirm(`Удалить профиль «${p.name}»?`)) return;
    profilesStore.profiles = profilesStore.profiles.filter(x => x.id !== p.id);
    profilesStore.activeId = profilesStore.profiles[0].id;
    saveProfiles();
    renderProfileSelect();
    applyParams(profilesStore.profiles[0].params);
    setStatus('Профиль удалён');
  });

  const inputs = ['inW', 'inH', 'inThick', 'inEdge', 'inKerf', 'inGap', 'inRot', 'inStrategy', 'inMaxSheets', 'inRemnantMin', 'inRemnantGridStep', 'inSnapThreshold', 'inGridStep', 'inPricePerM2', 'inGaPop', 'inGaGen', 'inGaMut'];
  for (const id of inputs) {
    $(id)?.addEventListener('input', () => {
      updateSumGap();
      updateStockMiniInfo();
      updateActiveProfileFromFields();
      schedulePush(600);
    });
    $(id)?.addEventListener('change', () => {
      updateSumGap();
      updateStockMiniInfo();
      updateActiveProfileFromFields();
      schedulePush(100);
    });
  }
  
  $('inRemnantOn')?.addEventListener('change', () => {
    updateActiveProfileFromFields();
    schedulePush(100);
  });
  
  $('inGridShow')?.addEventListener('change', () => {
    updateActiveProfileFromFields();
    import('./canvas.js').then(m => m.draw()).catch(() => {});
    schedulePush(100);
  });
}

export function updateSumGap() {
  const el = $('sumGap');
  if (!el) return;
  const kerf = parseFloat($('inKerf')?.value) || 0;
  const gap = parseFloat($('inGap')?.value) || 0;
  el.textContent = (kerf + gap).toFixed(1).replace(/\.0$/, '');
}

export function updateGaParamsUI() {
  const strategy = $('inStrategy')?.value;
  const gaWrap = document.querySelector('.ga-params');
  if (gaWrap) {
    gaWrap.style.display = strategy === 'genetic' ? 'block' : 'none';
  }
}

export function updateStockDxfUI() {
  const info = $('stockDxfInfo');
  const btnClear = $('btnClearStockDxf');
  const inW = $('inW');
  const inH = $('inH');

  if (window.stockPolygons && window.stockPolygons.length) {
    if (info) {
      info.style.display = 'block';
      info.textContent = `Заготовка из DXF: ${window.stockDxfName || 'контур'}`;
    }
    if (btnClear) btnClear.style.display = 'inline-block';
    if (inW) inW.readOnly = true;
    if (inH) inH.readOnly = true;
  } else {
    if (info) info.style.display = 'none';
    if (btnClear) btnClear.style.display = 'none';
    if (inW) inW.readOnly = false;
    if (inH) inH.readOnly = false;
  }
}

export function updateStockMiniInfo() {
  const el = $('stockMiniInfo');
  if (!el) return;
  const p = readParams();
  el.textContent = `${Math.round(p.sheetW)}×${Math.round(p.sheetH)}×${p.thickness}`;
}

// ─── Autofit ───
export function getAutofitValues() {
  const getVal = (id, def) => {
    const el = $(id);
    return el ? (parseFloat(el.value) || def) : def;
  };
  const mode = $('afMode')?.value || 'fixX';
  const xs = [];
  const ys = [];

  const xFrom = getVal('afXFrom', 2000);
  const xTo = getVal('afXTo', 4000);
  const xStep = Math.max(1, getVal('afXStep', 100));

  const yFrom = getVal('afYFrom', 500);
  const yTo = getVal('afYTo', 1000);
  const yStep = Math.max(1, getVal('afYStep', 50));

  if (mode === 'fixX' || mode === 'both') {
    for (let x = xFrom; x <= xTo; x += xStep) xs.push(x);
  } else {
    xs.push(getVal('inW', 3000));
  }

  if (mode === 'fixY' || mode === 'both') {
    for (let y = yFrom; y <= yTo; y += yStep) ys.push(y);
  } else {
    ys.push(getVal('inH', 1500));
  }

  return { xs, ys };
}

export function updateAutofitCount() {
  const el = $('afCount');
  if (!el) return;
  const { xs, ys } = getAutofitValues();
  const n = xs.length * ys.length;
  el.textContent = `Вариантов: ${n}`;
  el.className = n > 30 ? 'af-count warn' : 'af-count ok';
}

// ─── Base Name ───
export function makeBaseName() {
  const p = readParams();
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return `Раскладка_${Math.round(p.sheetW)}x${Math.round(p.sheetH)}x${p.thickness}_${dateStr}`;
}

export function makeSafeBaseName() {
  return sanitizeFileName(makeBaseName(), 100, true);
}

/**
 * Формирует имя для экспорта DXF.
 * Пример: Rs01 PR02 L1500x1250x3 Dt8
 */
export function makeDxfExportName(sheetIndex = null, rsNum = '01', prNum = '01') {
  const p = readParams();
  
  const sheetDim = `L${Math.round(p.sheetW)}x${Math.round(p.sheetH)}x${p.thickness}`;

  let dtCount = 0;
  if (state && state.sheets) {
    if (sheetIndex !== null && state.sheets[sheetIndex]) {
      dtCount = state.sheets[sheetIndex].placed.length;
    } else {
      dtCount = state.sheets.reduce((sum, sh) => sum + sh.placed.length, 0);
    }
  }
  
  const dtStr = `Dt${dtCount}`;

  return `Rs${rsNum} PR${prNum} ${sheetDim} ${dtStr}`;
}