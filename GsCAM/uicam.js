// GsCAM/uicam.js
import { $, setStatus, todayIso, sanitizeFileName, attachTranslitOnBlur, attachLiveTranslit } from '../js/utils.js';
import { state } from '../js/state.js';
import { readParams, makeSafeBaseName } from '../js/params.js';
import { listPosts, getPost, DEFAULT_POST_ID } from './posts/index.js';
import { sheetToGcode } from './sheet-to-gcode.js';
import { openSimulation } from './simulation.js';
import { openShipmentModal } from './shipment.js';
import { downloadPlayerHtmlForSheet } from './export-player.js';
import { getCurrentProjectName, buildDefaultFileName } from '../js/project-io.js';

export function bindGsCamUI() {
  injectStyles();

  const btn = createButton();
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', openModal);

  const shipBtn = createShipmentButton();
  const shipFresh = shipBtn.cloneNode(true);
  shipBtn.parentNode.replaceChild(shipFresh, shipBtn);
  shipFresh.addEventListener('click', openShipmentModal);
}

function createButton() {
  let btn = document.getElementById('btnExportGcode');
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = 'btnExportGcode';
  btn.textContent = '⚙ G-code';
  btn.title = 'Экспорт G-code (постпроцессор AMN Tech THC)';
  const ref = document.getElementById('btnExportMenu');
  if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref.nextSibling);
  else document.body.appendChild(btn);
  return btn;
}

function createShipmentButton() {
  let btn = document.getElementById('btnShipment');
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = 'btnShipment';
  btn.textContent = '📦 В цех';
  btn.title = 'Подготовить комплект документов в цех';
  const ref = document.getElementById('btnExportGcode');
  if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref.nextSibling);
  else document.body.appendChild(btn);
  return btn;
}

function injectStyles() {
  if (document.getElementById('gscam-styles')) return;
  const s = document.createElement('style');
  s.id = 'gscam-styles';
  s.textContent = `
    .gscam-modal { width: 580px; }
    .gscam-modal .row label { flex: 0 0 200px; }
    .gscam-modal .row input,
    .gscam-modal .row select { flex: 1; width: auto; }
    .gscam-hint { font-size: 11px; color: #888; margin-top: 8px; line-height: 1.5; }
    .gscam-preview { background: #1e1e1e; color: #d4d4d4; font: 11px monospace;
      padding: 8px 10px; border-radius: 4px; max-height: 200px; overflow: auto;
      white-space: pre; margin-top: 8px; }
    .gscam-preview-header { display: flex; justify-content: space-between;
      align-items: center; margin-top: 10px; font-size: 12px; color: #333; gap: 8px; }
    .gscam-preview-header button { padding: 2px 8px; font-size: 11px; }
    .gscam-btn-sim { background: #0066cc !important; color: #fff !important; border-color: #0050a0 !important; }
    .gscam-btn-sim:hover { background: #0050a0 !important; }
    .gscam-warn { font-size: 11px; color: #a05a00; padding: 4px 8px; background: #fff8e1;
      border: 1px solid #f0d9a8; border-radius: 4px; margin-top: 4px; }
    .gscam-stat { font-size: 11px; color: #555; padding: 4px 8px; background:#f5f5f5; border-radius:3px; margin-top:6px }
    
    .gscam-feed-box {
      display: flex; align-items: center; justify-content: space-between;
      background: #eaf4ff; border: 1px solid #c9e0f5; border-radius: 6px;
      padding: 8px 12px; margin: 8px 0;
    }
    .gscam-feed-box label { font-weight: bold; color: #004a99; flex: none; }
    .gscam-feed-box input { width: 100px; font-weight: bold; color: #004a99; padding: 4px 8px; }
    
    .gscam-checkbox-row {
      display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0;
      padding: 8px 12px; background: #f9f9f9; border-radius: 6px; border: 1px solid #eee;
    }
    .gscam-checkbox-row label {
      display: flex; align-items: center; gap: 4px; font-weight: normal;
      font-size: 12px; color: #333; cursor: pointer; flex: none;
    }
    
    .gscam-filename-row { display: flex; gap: 6px; align-items: stretch; }
    .gscam-filename-row input { flex: 1; }
    .gscam-filename-row button { padding: 4px 12px; font-size: 12px; white-space: nowrap; }
    
    .gscam-filename-preview {
      font-size: 11px; color: #0066cc; margin-top: 4px;
      font-family: monospace; padding: 4px 8px;
      background: #f0f8ff; border-radius: 3px;
    }

    /* ─── Улучшенный блок мостиков ─── */
    .gscam-bridge-block {
      margin-top: 10px;
      background: #f0f9ec;
      border: 1px solid #9ed5a4;
      border-radius: 6px;
      padding: 8px 12px;
      transition: border-color .2s;
    }
    .gscam-bridge-block.off {
      border-color: #ddd;
      background: #fafafa;
    }
    .gscam-bridge-header {
      display: flex; align-items: center; gap: 10px;
    }
    .gscam-bridge-title {
      font-weight: bold; color: #1a6a25; flex: none;
    }
    .gscam-bridge-mini {
      font-size: 12px; color: #1a6a25; opacity: 0.9; flex: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .gscam-bridge-block.off .gscam-bridge-mini {
      color: #888; opacity: 0.6;
    }
    
    .gscam-bridge-enable-wrap {
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; user-select: none;
      font-size: 12px; color: #1a6a25; font-weight: 600;
    }
    .gscam-bridge-block.off .gscam-bridge-enable-wrap {
      color: #888;
    }
    .gscam-bridge-enable-wrap input[type="checkbox"] {
      width: 18px; height: 18px; cursor: pointer; accent-color: #2a9a3c;
    }
    
    .gscam-bridge-toggle {
      background: transparent; border: 1px solid transparent;
      color: #1a6a25; font-size: 13px; line-height: 1;
      padding: 2px 6px; border-radius: 3px; cursor: pointer; min-width: 24px;
    }
    .gscam-bridge-toggle:hover {
      background: #e6f7e9; border-color: #9ed5a4;
    }
    
    .gscam-bridge-params {
      display: none;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #9ed5a4;
    }
    .gscam-bridge-params.active { display: block; }
    
    .gscam-bridge-params .row { margin: 6px 0; }
    .gscam-bridge-params .row label {
      color: #1a6a25; font-weight: 600; font-size: 12px;
    }
    .gscam-bridge-params .row input {
      border-color: #9ed5a4; color: #1a6a25; font-weight: 600;
    }
    .gscam-bridge-hint {
      font-size: 11px; color: #2a6a30; margin-top: 6px;
      padding: 6px 8px; background: #e6f7e9; border-radius: 4px;
      line-height: 1.4;
    }
  `;
  document.head.appendChild(s);
}

function suggestGcodeBase(sheetIdx, thickness) {
  let projectName = '';
  try {
    projectName = getCurrentProjectName() || '';
    if (!projectName) projectName = buildDefaultFileName();
  } catch (_) {}

  const m = String(projectName || '').match(/^PR(\d+)(?:D\d+Sm\d+L\d+(?:T[\d.]+)?)?(?:Dt(\d+))?/i);

  let projectNum = '01';
  let partsCount = '';

  if (m) {
    projectNum = String(m[1] || '01').padStart(2, '0');
    if (m[2]) partsCount = String(m[2]);
  }

  if (!partsCount) {
    try {
      let total = 0;
      for (const sh of state.sheets) total += (sh.placed || []).length;
      partsCount = String(total);
    } catch (_) {}
  }

  let base = `PR${projectNum}L${sheetIdx + 1}`;

  if (thickness && isFinite(thickness)) {
    const t = Math.round(thickness * 10) / 10;
    base += `T${t}`;
  }
  if (partsCount) {
    base += `Dt${partsCount}`;
  }

  return base;
}

function askGcodeOptions() {
  return new Promise(resolve => {
    if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); resolve(null); return; }

    const params = readParams();
    const posts = listPosts();
    const defaultPost = getPost(DEFAULT_POST_ID);
    const totalSheets = state.sheets.length;

    const defaultFeed = defaultPost.getCutFeed
      ? defaultPost.getCutFeed(params.thickness)
      : (defaultPost.defaults?.cutFeed || 1500);

    const suggestedBase = suggestGcodeBase(0, params.thickness);

    let totalContours = 0;
    for (const sh of state.sheets) {
      for (const pl of sh.placed) {
        if (pl && Array.isArray(pl.polygons)) totalContours += pl.polygons.length;
      }
    }

    let savedCutOrderStrategy = 'snake';
    try {
      savedCutOrderStrategy = localStorage.getItem('raskladka.cutOrderStrategy.v1') || 'snake';
    } catch (_) {}

    let savedBridgesEnabled = false;
    let savedBridgeLength = 4;
    let savedBridgeCount = 2;
    try {
      savedBridgesEnabled = localStorage.getItem('raskladka.bridgesEnabled.v1') === 'true';
      const len = localStorage.getItem('raskladka.bridgeLength.v1');
      if (len && !isNaN(parseFloat(len))) savedBridgeLength = parseFloat(len);
      const cnt = localStorage.getItem('raskladka.bridgeCount.v1');
      if (cnt && !isNaN(parseInt(cnt, 10))) savedBridgeCount = parseInt(cnt, 10);
    } catch (_) {}

    // ═══ ЗАГРУЗКА СОСТОЯНИЯ ДЛЯ ОБЩЕЙ ЛИНИИ ═══
    let savedCommonLine = false;
    try {
      savedCommonLine = localStorage.getItem('raskladka.commonLine.v1') === 'true';
    } catch (_) {}

    let savedSlowPierceHoles = false;
    let savedSlowPiercePercent = 40;
    try {
      savedSlowPierceHoles = localStorage.getItem('raskladka.slowPierceHoles.v1') === 'true';
      const p = localStorage.getItem('raskladka.slowPiercePercent.v1');
      if (p && !isNaN(parseFloat(p))) savedSlowPiercePercent = parseFloat(p);
    } catch (_) {}

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-window gscam-modal">
        <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
          <span>⚙ Экспорт G-code</span>
          <button class="close-btn" data-role="close" style="color:#004a99">✕</button>
        </div>
        <div class="modal-body">
          <div class="row">
            <label>Постпроцессор</label>
            <select data-role="post">
              ${posts.map(p => `<option value="${p.id}" ${p.id === DEFAULT_POST_ID ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <label>Толщина, мм (из заготовки)</label>
            <input data-role="thickness" type="number" value="${params.thickness}" readonly style="background:#f0f0f0">
          </div>
          <div class="row">
            <label>Kerf (компенсация), мм</label>
            <input data-role="kerf" type="number" value="${params.kerf}" step="0.1" min="0">
          </div>
          <div class="row">
            <label>Радиус врезки, мм</label>
            <input data-role="leadInRadius" type="number" value="1.28" step="0.1" min="0.1">
          </div>
          
          <div class="gscam-feed-box">
            <label>Скорость резания (F), мм/мин</label>
            <input data-role="cutFeed" type="number" value="${defaultFeed}" step="10" min="10">
          </div>
          <div class="gscam-hint" data-role="feed-hint" style="margin-top:-4px; margin-bottom:10px; color:#004a99; font-weight:500;">
            * По умолчанию для толщины ${params.thickness} мм: <b>${defaultFeed}</b> мм/мин (из поста).
          </div>

          <div class="gscam-checkbox-row">
            <label><input type="checkbox" data-role="useTsp" checked> TSP-сортировка</label>
            <label><input type="checkbox" data-role="cutCw" checked> По часовой</label>
            <label><input type="checkbox" data-role="partByPart" checked> Подетально</label>
            <label><input type="checkbox" data-role="useArcs"> Arc-fitting</label>
            
            <label title="Режет общие линии между деталями один раз (требует зазора 0 мм)" style="display:flex; align-items:center; gap:4px;">
              <input type="checkbox" data-role="commonLine" ${savedCommonLine ? 'checked' : ''}> Единый рез
            </label>

            <label title="Замедляет скорость подачи при врезании во внутренние отверстия" style="display:flex; align-items:center; gap:4px;">
              <input type="checkbox" data-role="slowPierceHoles" ${savedSlowPierceHoles ? 'checked' : ''}> Медленный врез
              <input type="number" data-role="slowPiercePercent" value="${savedSlowPiercePercent}" step="5" min="5" max="100" style="width:45px; padding:1px 3px; font-size:11px; margin-left:4px; border:1px solid #ccc; border-radius:3px;"> %
            </label>
          </div>

          <div class="row" style="margin-top:10px">
            <label style="color:#8a2a00; font-weight:bold;">Порядок реза (G-code)</label>
            <select data-role="cutOrderStrategy" style="flex:1; padding:4px; border:1px solid #d5a49e; border-radius:4px; color:#8a2a00; font-weight:bold;">
              <option value="snake" ${savedCutOrderStrategy === 'snake' ? 'selected' : ''}>Умный обход (TSP)</option>
              <option value="width" ${savedCutOrderStrategy === 'width' ? 'selected' : ''}>Слева направо (по X)</option>
              <option value="height" ${savedCutOrderStrategy === 'height' ? 'selected' : ''}>Снизу вверх (по Y)</option>
            </select>
          </div>

          <div class="gscam-bridge-block ${savedBridgesEnabled ? '' : 'off'}" id="bridgeBlock" style="margin-top:12px">
            <div class="gscam-bridge-header">
              <span class="gscam-bridge-title">🌉 Мостики (перемычки)</span>
              <span class="gscam-bridge-mini" id="bridgeMini">Мд-${savedBridgeLength} мм · Мк-${savedBridgeCount} шт</span>
              
              <label class="gscam-bridge-enable-wrap">
                <input type="checkbox" id="chkBridges" data-role="bridgesEnabled" ${savedBridgesEnabled ? 'checked' : ''}>
                вкл
              </label>
              
              <button type="button" class="gscam-bridge-toggle" id="bridgeToggle" title="Настроить значения">▸</button>
            </div>
            
            <div class="gscam-bridge-params" id="bridgeParams">
              <div class="row" style="margin-bottom:8px">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:bold; color:#1a6a25;">
                  <input type="checkbox" id="chkBridgesInner" checked style="width:16px; height:16px; margin:0; cursor:pointer; accent-color:#2a9a3c;">
                  Использовать мостики
                </label>
              </div>
              <div class="row">
                <label>Длина мостика, мм</label>
                <input data-role="bridgeLength" type="number" value="${savedBridgeLength}" step="0.5" min="1" max="20">
              </div>
              <div class="row">
                <label>Мостиков на контур</label>
                <input data-role="bridgeCount" type="number" value="${savedBridgeCount}" step="1" min="1" max="8">
              </div>
              <div class="gscam-bridge-hint">
                💡 Мостик — непрорезанное место (2–5 мм). Деталь остаётся «на ножках» и не падает во время резки.
              </div>
            </div>
          </div>

          <div class="gscam-warn" style="margin-top:8px;">
            ⚠ Arc-fitting может склеивать прямые в «фантомные дуги» — включайте только если уверены в геометрии.
          </div>
          <div class="gscam-stat">
            📊 Листов: <b>${totalSheets}</b> · Контуров всего: <b>${totalContours}</b>
          </div>
          
          <div class="row" style="margin-top:10px">
            <label>Имя файла (без расширения)</label>
            <div class="gscam-filename-row">
              <input data-role="baseName" type="text" value="${suggestedBase}" style="font-family:monospace;">
              <button data-role="reset-name" type="button" title="Взять имя из проекта">↻ По проекту</button>
            </div>
          </div>
          <div class="gscam-filename-preview" data-role="filename-preview">
            Пример: ${suggestedBase}.tap
          </div>
          <div class="gscam-hint">
            💡 Формат: <code>PR02L1T3Dt13</code> = проект · лист · толщина · детали.
            Сохранение в папку <b>«Листы»</b>.
          </div>
          <div class="gscam-preview-header">
            <span>Предпросмотр (лист 1, первые 40 строк):</span>
            <div style="display:flex;gap:6px">
              <button data-role="preview" type="button">↻ Обновить</button>
              <button data-role="simulate" type="button" class="gscam-btn-sim">▶ Симуляция</button>
              <button data-role="save-html" type="button" class="gscam-btn-sim" title="Автономный HTML — открывается в браузере без сервера">📄 HTML</button>
            </div>
          </div>
          <pre class="gscam-preview" data-role="preview-area">—</pre>
        </div>
        <div class="modal-footer">
          <button class="primary" data-role="export" type="button">💾 Экспортировать все листы</button>
          <button data-role="cancel" type="button">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const q = sel => modal.querySelector(sel);
    const close = (result) => { modal.remove(); resolve(result); };

    q('[data-role="close"]').onclick = () => close(null);
    q('[data-role="cancel"]').onclick = () => close(null);
    modal.addEventListener('click', e => { if (e.target === modal) close(null); });
    const escH = e => { if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);

    const postSel = q('[data-role="post"]');
    const feedInput = q('[data-role="cutFeed"]');
    const feedHint = q('[data-role="feed-hint"]');
    const baseNameEl = q('[data-role="baseName"]');
    const filenamePreview = q('[data-role="filename-preview"]');
    const cutOrderSel = q('[data-role="cutOrderStrategy"]');
    
    const bridgeBlock = q('#bridgeBlock');
    const bridgeToggle = q('#bridgeToggle');
    const bridgeParams = q('#bridgeParams');
    const bridgeMini = q('#bridgeMini');
    const chkBridges = q('#chkBridges');
    const chkBridgesInner = q('#chkBridgesInner');
    const bridgeLengthEl = q('[data-role="bridgeLength"]');
    const bridgeCountEl = q('[data-role="bridgeCount"]');

    let isBridgeExpanded = false;
    bridgeToggle.onclick = () => {
      isBridgeExpanded = !isBridgeExpanded;
      bridgeParams.classList.toggle('active', isBridgeExpanded);
      bridgeToggle.textContent = isBridgeExpanded ? '▾' : '▸';
    };

    const updateBridgeMini = () => {
      const len = bridgeLengthEl.value || 4;
      const cnt = bridgeCountEl.value || 2;
      const on = chkBridges.checked;
      
      bridgeMini.textContent = `Мд-${len} мм · Мк-${cnt} шт`;
      bridgeBlock.classList.toggle('off', !on);
      
      chkBridgesInner.checked = on;
      
      try {
        localStorage.setItem('raskladka.bridgesEnabled.v1', String(on));
        localStorage.setItem('raskladka.bridgeLength.v1', String(len));
        localStorage.setItem('raskladka.bridgeCount.v1', String(cnt));
      } catch (_) {}
    };

    chkBridges.addEventListener('change', () => {
      updateBridgeMini();
      doPreview();
    });

    chkBridgesInner.addEventListener('change', () => {
      chkBridges.checked = chkBridgesInner.checked;
      updateBridgeMini();
      doPreview();
    });

    bridgeLengthEl.addEventListener('input', () => { updateBridgeMini(); doPreview(); });
    bridgeCountEl.addEventListener('input', () => { updateBridgeMini(); doPreview(); });

    updateBridgeMini();

    cutOrderSel.addEventListener('change', async () => {
      localStorage.setItem('raskladka.cutOrderStrategy.v1', cutOrderSel.value);
      try {
        const { assignCutOrderAllSheets } = await import('../js/cut-order.js');
        const { draw } = await import('../js/canvas.js');
        assignCutOrderAllSheets();
        draw();
      } catch (e) {}
    });

    const chkSlowPierce = q('[data-role="slowPierceHoles"]');
    const percentSlowPierce = q('[data-role="slowPiercePercent"]');
    const chkCommonLine = q('[data-role="commonLine"]');

    chkCommonLine.addEventListener('change', (e) => {
      try { localStorage.setItem('raskladka.commonLine.v1', e.target.checked ? 'true' : 'false'); } catch (_) {}
      doPreview();
    });

    chkSlowPierce.addEventListener('change', (e) => {
      try { localStorage.setItem('raskladka.slowPierceHoles.v1', e.target.checked ? 'true' : 'false'); } catch (_) {}
      doPreview();
    });

    percentSlowPierce.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 5) val = 5;
      if (val > 100) val = 100;
      e.target.value = val;
      try { localStorage.setItem('raskladka.slowPiercePercent.v1', String(val)); } catch (_) {}
      doPreview();
    });

    let nameAuto = true;

    const updateFilenamePreview = () => {
      const post = getPost(postSel.value);
      const ext = post.ext || '.tap';
      const base = baseNameEl.value.trim() || 'file';

      if (totalSheets === 1) {
        filenamePreview.textContent = `Пример: ${base}${ext}`;
      } else if (nameAuto) {
        const examples = [];
        for (let i = 0; i < Math.min(totalSheets, 3); i++) {
          const b = suggestGcodeBase(i, params.thickness);
          examples.push(`${b}${ext}`);
        }
        filenamePreview.textContent = `Примеры: ${examples.join(', ')}${totalSheets > 3 ? ', …' : ''}`;
      } else {
        const examples = [ `${base}${ext}` ];
        for (let i = 1; i < Math.min(totalSheets, 3); i++) {
          examples.push(`${base}_L${i + 1}${ext}`);
        }
        filenamePreview.textContent = `Примеры: ${examples.join(', ')}${totalSheets > 3 ? ', …' : ''}`;
      }
    };

    baseNameEl.addEventListener('input', () => {
      nameAuto = false;
      updateFilenamePreview();
      doPreview();
    });

    q('[data-role="reset-name"]').onclick = () => {
      nameAuto = true;
      const auto = suggestGcodeBase(0, params.thickness);
      baseNameEl.value = auto;
      updateFilenamePreview();
      doPreview();
    };

    postSel.addEventListener('change', () => {
      const newPost = getPost(postSel.value);
      const newDefault = newPost.getCutFeed
        ? newPost.getCutFeed(params.thickness)
        : (newPost.defaults?.cutFeed || 1500);
      feedInput.value = newDefault;
      feedHint.innerHTML = `* По умолчанию для толщины ${params.thickness} мм: <b>${newDefault}</b> мм/мин (из поста).`;

      if (nameAuto) {
        baseNameEl.value = suggestGcodeBase(0, params.thickness);
      }
      updateFilenamePreview();
      doPreview();
    });

    const readOpts = () => {
      const opts = {
        postId: postSel.value,
        kerf: parseFloat(q('[data-role="kerf"]').value) || 0,
        leadInRadius: parseFloat(q('[data-role="leadInRadius"]').value) || 1.28,
        cutFeed: parseFloat(feedInput.value) || null,
        useTsp: q('[data-role="useTsp"]').checked,
        cutCw: q('[data-role="cutCw"]').checked,
        partByPart: q('[data-role="partByPart"]').checked,
        useArcs: q('[data-role="useArcs"]').checked,
        slowPierceHoles: chkSlowPierce.checked,
        slowPiercePercent: parseFloat(percentSlowPierce.value) || 40,
        commonLine: chkCommonLine.checked,
        baseName: baseNameEl.value.trim(),
        cutOrderStrategy: cutOrderSel.value,
        bridgesEnabled: chkBridges.checked,
        bridgeLength: parseFloat(bridgeLengthEl.value) || 4,
        bridgeCount: parseInt(bridgeCountEl.value, 10) || 2,
      };
      if (opts.cutFeed && opts.cutFeed > 0) {
        try { localStorage.setItem('raskladka.cutFeed.v1', String(opts.cutFeed)); } catch (_) {}
      }
      return opts;
    };

    const buildGcode = (sheetIdx) => {
      const opts = readOpts();
      const post = getPost(opts.postId);

      let perSheetBase;
      if (nameAuto) {
        perSheetBase = suggestGcodeBase(sheetIdx, params.thickness);
      } else {
        const safeBase = sanitizeFileName(opts.baseName || 'file', 100);
        perSheetBase = (totalSheets === 1 || sheetIdx === 0)
          ? safeBase
          : `${safeBase}_L${sheetIdx + 1}`;
      }

      const fileName = `${perSheetBase}${post.ext}`;

      const ctx = {
        fileName,
        postName: post.name + '.scpost',
        date: todayIso(),
        units: post.units,
        sheetIndex: sheetIdx,
      };

      const gcode = sheetToGcode(
        state.sheets[sheetIdx],
        { ...params, kerf: opts.kerf },
        post, ctx,
        {
          leadInRadius: opts.leadInRadius,
          useTsp: opts.useTsp,
          cutCw: opts.cutCw,
          useArcs: opts.useArcs,
          partByPart: opts.partByPart,
          cutFeed: opts.cutFeed,
          bridgesEnabled: opts.bridgesEnabled,
          bridgeLength: opts.bridgeLength,
          bridgeCount: opts.bridgeCount,
          slowPierceHoles: opts.slowPierceHoles,
          slowPiercePercent: opts.slowPiercePercent,
          commonLine: opts.commonLine,
        }
      );

      return { gcode, fileName };
    };

    const doPreview = () => {
      try {
        const { gcode } = buildGcode(0);
        q('[data-role="preview-area"]').textContent =
          gcode.split('\n').slice(0, 40).join('\n') + '\n…';
      } catch (e) {
        q('[data-role="preview-area"]').textContent = 'Ошибка: ' + e.message;
      }
    };
    q('[data-role="preview"]').onclick = doPreview;

    q('[data-role="simulate"]').onclick = () => {
      try {
        const { gcode } = buildGcode(0);
        const title = totalSheets > 1 ? 'Симуляция — лист 1 из ' + totalSheets : 'Симуляция — лист';
        openSimulation(gcode, title);
      } catch (e) { alert('Ошибка симуляции: ' + e.message); }
    };
    
    q('[data-role="save-html"]').onclick = () => {
      const opts = readOpts();
      downloadPlayerHtmlForSheet(0, {
        projectBase: sanitizeFileName(opts.baseName || 'Raskladka', 100),
        theme: localStorage.getItem('raskladka.theme') || 'default',
      });
      setStatus('Автономный HTML-плеер скачан');
    };

    attachLiveTranslit(baseNameEl);
    attachTranslitOnBlur(baseNameEl);

    feedInput.addEventListener('input', doPreview);
    feedInput.addEventListener('change', doPreview);

    updateFilenamePreview();
    setTimeout(doPreview, 50);

    q('[data-role="export"]').onclick = async () => {
      const opts = readOpts();
      if (!opts.baseName) { alert('Укажите имя файла'); return; }

      // ═══ ПРОВЕРКА ДЛЯ ОБЩЕЙ ЛИНИИ РЕЗА ═══
      if (opts.commonLine) {
        const layoutParams = readParams();
        if (layoutParams.gap > 0.1) {
          alert('⚠ Для работы функции «Единый рез» (Общая линия) необходимо установить зазор между деталями равным 0 мм.\n\nСейчас в параметрах заготовки стоит зазор: ' + layoutParams.gap + ' мм.\n\nПожалуйста, измените зазор на 0 и нажмите «Разложить» заново.');
          return;
        }
      }
      // ═══════════════════════════════════════

      const btn = q('[data-role="export"]');
      btn.disabled = true;
      btn.textContent = '⏳ Сохранение…';

      try {
        const total = totalSheets;
        for (let si = 0; si < total; si++) {
          const { gcode, fileName } = buildGcode(si);

          const res = await fetch('/api/save-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'sheets', subfolder: '', fileName, content: gcode }),
          }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

          if (!res.ok) {
            alert(`Ошибка на листе ${si + 1}: ${res.error}`);
            btn.disabled = false;
            btn.textContent = '💾 Экспортировать все листы';
            return;
          }
          setStatus(`Сохранено ${si + 1} / ${total}: ${fileName}`);
        }
        close(opts);
      } catch (e) {
        alert('Ошибка: ' + e.message);
        btn.disabled = false;
        btn.textContent = '💾 Экспортировать все листы';
      }
    };
  });
}

function openModal() { askGcodeOptions(); }