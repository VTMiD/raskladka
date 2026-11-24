// GsCAM/shipment.js
import {
  setStatus, todayIso, sanitizeFileName, downloadBlob, saveFileToServer,
} from '../js/utils.js';
import { state } from '../js/state.js';
import { readParams } from '../js/params.js';
import { sheetToGcode } from './sheet-to-gcode.js';
import { getPost, DEFAULT_POST_ID } from './posts/index.js';
import { buildLayoutHtml, buildReportHtml } from '../js/report/report.js';
import { buildLabelsHtml } from '../js/report/labels.js';
import { buildSpecificationHtml } from '../js/report/spec.js';
import { buildDxfSingleSheet } from '../js/dxf-export.js';
import { getCurrentProjectName, buildDefaultFileName } from '../js/project-io.js';
import { getPlayerHtmlForSheet } from './export-player.js';
import { generatePdfBlob } from '../js/dialogs/pdf-maker.js';
import { generateJpgPages } from '../js/exports.js';
import { makeQrSvg } from '../js/qr-barcode.js';
import { 
  getShipmentProfiles, saveProfile, loadProfile, deleteProfile, 
  saveLastState, loadLastState,
  saveLastSelectedProfile, getLastSelectedProfile
} from '../js/dialogs/shipment-settings.js';

const PATHS_KEY = 'raskladka.paths.v1';

const CHECKBOX_IDS = [
  'chk-gcode', 'chk-report', 'chk-player', 'chk-qr', 'chk-map', 'chk-dxf',
  'chk-pdf-map', 'chk-pdf-report', 'chk-pdf-labels', 'chk-pdf-spec',
  'chk-jpg-map', 'chk-jpg-report', 'chk-jpg-labels',
  'chk-common-line' // <--- ДОБАВЛЕН ID ДЛЯ ГАЛОЧКИ ЕДИНОГО РЕЗА
];

function getShopPath() {
  try {
    const raw = localStorage.getItem(PATHS_KEY);
    if (!raw) return '';
    const p = JSON.parse(raw);
    return p.shop || '';
  } catch (_) { return ''; }
}

function getProjectBase() {
  // 1. Номер задания (Rs)
  let rsNum = '01';
  if (state.jobs && state.jobs.length) {
    const activeJob = state.jobs.find(j => j.id === state.activeJobId);
    if (activeJob && activeJob.name) {
      const match = activeJob.name.match(/\d+/);
      if (match) rsNum = match[0];
    }
  }

  // 2. Номер проекта (PR)
  let prNum = '01';
  try {
    const projName = getCurrentProjectName() || '';
    if (projName) {
      const m = projName.match(/^PR(\d+)/i);
      if (m) prNum = String(m[1]).padStart(2, '0');
    }
  } catch (_) {}

  // 3. Габариты и толщина
  const params = readParams();
  const sheetDim = `L${Math.round(params.sheetW)}x${Math.round(params.sheetH)}x${params.thickness}`;

  // 4. Количество деталей
  const totalParts = (state.sheets || []).reduce((s, sh) => s + (sh.placed || []).length, 0);
  const dtStr = `Dt${totalParts}`;

  return `Rs${rsNum} PR${prNum} ${sheetDim} ${dtStr}`;
}

function formatShipmentName(name) {
  if (!name) return '';
  const clean = String(name).replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
  if (!clean.includes(' ')) {
    const m = clean.match(/^(PR\d+)(D\d+)(Sm\d+)(L\d+)?(T[\d.]+)?(Dt\d+)?$/i);
    if (m) {
      return [m[1], m[2], m[3], m[4], m[5], m[6]].filter(Boolean).join(' ');
    }
  }
  return clean;
}

function getGcodeFileName(si, projectBase, thickness, ext) {
  let rsNum = '01';
  if (state.jobs && state.jobs.length) {
    const activeJob = state.jobs.find(j => j.id === state.activeJobId);
    if (activeJob && activeJob.name) {
      const match = activeJob.name.match(/\d+/);
      if (match) rsNum = match[0];
    }
  }

  let prNum = '01';
  const m = String(projectBase || '').match(/^PR(\d+)/i);
  if (m) prNum = String(m[1]).padStart(2, '0');

  const params = readParams();
  const sheetDim = `L${Math.round(params.sheetW)}x${Math.round(params.sheetH)}x${params.thickness}`;

  let dtCount = 0;
  if (state.sheets && state.sheets[si]) {
    dtCount = state.sheets[si].placed.length;
  }
  const dtStr = `Dt${dtCount}`;

  const cleanExt = String(ext || '.tap').replace(/^\./, '');
  return `Rs${rsNum} PR${prNum} ${sheetDim} ${dtStr}.${cleanExt}`;
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function openShipmentModal() {
  if (!state.sheets.length) {
    alert('Сначала выполните раскладку (кнопка «Разложить»).');
    return;
  }
  if (!state.parts.length) {
    alert('В задании нет деталей.');
    return;
  }

  const params = readParams();
  const totalPlaced = state.sheets.reduce((s, sh) => s + sh.placed.length, 0);
  const totalTask   = state.parts.reduce((s, p) => s + p.qty, 0);
  const unplaced    = Math.max(0, totalTask - totalPlaced);
  const shopPath    = getShopPath();
  const projectBase = getProjectBase();
  const fullProjectName = getCurrentProjectName() || (projectBase + '.dxfnest.json');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  
  modal.innerHTML = `
    <div class="modal-window" style="width:750px; max-width:95vw;">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📦 Собрать комплект в цех</span>
        <button class="close-btn" data-role="close" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px;">
        <div style="background:#f5f5f5;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:13px">
          Листов: <b>${state.sheets.length}</b> ·
          Разложено: <b>${totalPlaced}</b> из <b>${totalTask}</b>
          ${unplaced > 0 ? `<span style="color:#b00"> · не поместилось: <b>${unplaced}</b></span>` : ''}
          <br>
          Проект: <b style="font-family:monospace;">${projectBase}</b>
        </div>

        <div style="margin-bottom:16px; background:#fff; padding:10px; border:1px solid #c9e0f5; border-radius:6px;">
          
          <div style="display:flex; gap:10px; align-items:center; margin-bottom: 10px;">
            <div style="flex:1;">
              <label style="font-weight:600;font-size:13px;color:#004a99;display:block;margin-bottom:4px">
                Выбрать сохранённый комплект
              </label>
              <select id="shipment-profile-select" style="width:100%; padding:8px; border:1px solid #bbb; border-radius:4px; font-size:14px; font-weight: bold; color: #004a99;">
                <option value="">— Текущие настройки (не сохранён) —</option>
              </select>
            </div>
            <div style="display:flex; gap:6px; margin-top: 18px;">
               <button id="shipment-profile-save" style="padding:8px 12px; font-size:13px; background:#eaf9ec; border:1px solid #9ed5a4; color:#1a6a25; border-radius:4px; cursor:pointer; white-space:nowrap;" title="Сохранить текущий выбор как новый комплект">💾 Сохранить как...</button>
               <button id="shipment-profile-delete" style="padding:8px 12px; font-size:13px; background:#fdecec; border:1px solid #f0b8b8; color:#b00; border-radius:4px; cursor:pointer;" title="Удалить выбранный комплект">🗑</button>
            </div>
          </div>

          <label style="font-weight:600;font-size:13px;color:#004a99;display:block;margin-bottom:4px">
            Имя файлов (префикс)
          </label>
          <input type="text" data-role="base-name" value="${formatShipmentName(projectBase)}"
                 style="width:100%;padding:8px 10px;border:1px solid #bbb;border-radius:4px;font-size:18px;font-family:monospace;box-sizing:border-box; font-weight: bold; color:#004a99; background:#fff;">
        </div>

        <div style="display:flex; gap:16px; margin-bottom:12px;">
          <div style="flex:1.2; display:flex; flex-direction:column; gap:12px;">
            <div style="border:1px solid #c9e0f5; border-radius:6px; overflow:hidden;">
              <div style="background:#eaf4ff; padding:6px 12px; font-weight:bold; color:#004a99; font-size:13px;">
                Основной комплект
              </div>
              <div style="padding:6px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-gcode" data-role="include-gcode" checked>
                  <span><b>G-code (.tap)</b> — файлы для станка, по листам</span>
                </label>
                <!-- ═══ НОВАЯ ГАЛОЧКА ЕДИНОГО РЕЗА ═══ -->
                <label title="Режет общие линии между деталями один раз (требует зазора 0 мм)" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0; color:#004a99;">
                  <input type="checkbox" id="chk-common-line" data-role="common-line">
                  <span><b>Единый рез (Common Line)</b></span>
                </label>
                <!-- ═══════════════════════════════════ -->
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-report" data-role="include-report" checked>
                  <span><b>HTML Отчёт</b> — спецификация деталей</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:6px 8px; background:#fff8e1; border-radius:4px; margin-top:4px;">
                  <input type="checkbox" id="chk-player" data-role="include-player" checked>
                  <span><b>🎬 HTML Плеер</b> — анимация резки (по листам)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0; color:#004a99; font-weight:600;">
                  <input type="checkbox" id="chk-qr" data-role="include-qr">
                  <span><b>📱 QR-код проекта</b> — SVG для сканирования</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-map" data-role="include-map">
                  <span><b>HTML Карта раскроя</b> — открывается в браузере (только карты)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-dxf" data-role="include-dxf">
                  <span><b>DXF</b> — по листам (каждый отдельно)</span>
                </label>
              </div>
            </div>
          </div>

          <div style="flex:0.8; display:flex; flex-direction:column; gap:12px;">
            <div style="border:1px solid #ddd; border-radius:6px; overflow:hidden;">
              <div style="background:#f5f5f5; padding:6px 12px; font-weight:bold; color:#555; font-size:13px;">
                PDF (для печати)
              </div>
              <div style="padding:6px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-pdf-map" data-role="pdf-map">
                  <span>PDF Карта раскроя</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-pdf-spec" data-role="pdf-spec">
                  <span>PDF Спецификация</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-pdf-report" data-role="pdf-report">
                  <span>PDF Отчёт (полный)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-pdf-labels" data-role="pdf-labels">
                  <span>PDF Этикетки</span>
                </label>
              </div>
            </div>

            <div style="border:1px solid #ddd; border-radius:6px; overflow:hidden;">
              <div style="background:#f5f5f5; padding:6px 12px; font-weight:bold; color:#555; font-size:13px;">
                JPG (просмотр на телефоне)
              </div>
              <div style="padding:6px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-jpg-map" data-role="jpg-map" checked>
                  <span>JPG Карта раскроя</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-jpg-report" data-role="jpg-report">
                  <span>JPG Отчёт</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;">
                  <input type="checkbox" id="chk-jpg-labels" data-role="jpg-labels">
                  <span>JPG Этикетки</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style="padding:8px 10px;background:${shopPath ? '#eaf9ec' : '#fff8e1'};
                    border:1px solid ${shopPath ? '#9ed5a4' : '#f0d9a8'};
                    border-radius:4px;font-size:12px">
          📁 <b>Куда сохранится:</b><br>
          <span style="font-family:monospace;word-break:break-all">
            ${shopPath || '(путь не задан — файлы скачаются в загрузки браузера. Задайте путь в ⚙ → «Настройки хранения данных»)'}
          </span>
        </div>

        <div data-role="progress" style="display:none;margin-top:12px">
          <div style="background:#e0e0e0;border-radius:4px;height:8px;overflow:hidden">
            <div data-role="progress-bar" style="background:#0066cc;height:100%;width:0%;transition:width .2s"></div>
          </div>
          <div data-role="progress-text" style="font-size:11px;color:#555;margin-top:4px">Готов…</div>
        </div>
      </div>
      <div class="modal-footer">
        <button data-role="do" class="primary" style="font-size:14px; padding:8px 20px;">📦 Собрать и сохранить</button>
        <button data-role="cancel" style="font-size:14px; padding:8px 20px;">Отмена</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const q = sel => modal.querySelector(sel);
  const close = () => modal.remove();

  q('[data-role="close"]').onclick = close;
  q('[data-role="cancel"]').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  const escH = e => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escH); }
  };
  document.addEventListener('keydown', escH);

  const profileSelect = q('#shipment-profile-select');
  const btnSaveProfile = q('#shipment-profile-save');
  const btnDeleteProfile = q('#shipment-profile-delete');
  const baseNameInput = q('[data-role="base-name"]');

  function updateProfileList() {
    const profiles = getShipmentProfiles();
    const names = Object.keys(profiles).sort();
    
    profileSelect.innerHTML = '<option value="">— Текущие настройки (не сохранён) —</option>';
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      profileSelect.appendChild(opt);
    }
  }

  updateProfileList();
  
  const lastProfile = getLastSelectedProfile();
  if (lastProfile && getShipmentProfiles()[lastProfile]) {
    profileSelect.value = lastProfile;
    loadProfile(lastProfile, CHECKBOX_IDS);
  } else {
    loadLastState(CHECKBOX_IDS);
  }

  profileSelect.onchange = () => {
    const name = profileSelect.value;
    saveLastSelectedProfile(name);
    if (!name) return;
    loadProfile(name, CHECKBOX_IDS);
    if (baseNameInput) baseNameInput.value = formatShipmentName(getProjectBase());
  };

  btnSaveProfile.onclick = () => {
    const name = prompt('Введите название комплекта (например, "На станок", "Полный пакет"):');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    saveProfile(trimmed, CHECKBOX_IDS);
    updateProfileList();
    profileSelect.value = trimmed;
    saveLastSelectedProfile(trimmed);
    setStatus(`Комплект «${trimmed}» сохранён`);
  };

  btnDeleteProfile.onclick = () => {
    const name = profileSelect.value;
    if (!name) { alert('Выберите комплект для удаления'); return; }
    if (!confirm(`Удалить комплект «${name}»?`)) return;
    deleteProfile(name);
    updateProfileList();
    profileSelect.value = '';
    saveLastSelectedProfile('');
    setStatus(`Комплект «${name}» удалён`);
  };

  const progressBox  = q('[data-role="progress"]');
  const progressBar  = q('[data-role="progress-bar"]');
  const progressText = q('[data-role="progress-text"]');
  const doBtn        = q('[data-role="do"]');

  function setProgress(frac, text) {
    progressBox.style.display = 'block';
    progressBar.style.width = Math.round(frac * 100) + '%';
    if (text) progressText.textContent = text;
  }

  doBtn.onclick = async () => {
    const currentProfile = profileSelect.value;
    
    if (currentProfile) {
      const profiles = getShipmentProfiles();
      const savedSettings = profiles[currentProfile];
      
      if (savedSettings) {
        let isChanged = false;
        for (const id of CHECKBOX_IDS) {
          const el = document.getElementById(id);
          if (el && el.checked !== savedSettings[id]) {
            isChanged = true;
            break;
          }
        }
        
        if (isChanged) {
          const answer = confirm(`Вы изменили настройки комплекта «${currentProfile}».\n\nСохранить эти изменения в профиль «${currentProfile}»?`);
          if (answer) {
            saveProfile(currentProfile, CHECKBOX_IDS);
            setStatus(`Комплект «${currentProfile}» обновлён`);
          } else {
            setStatus(`Сборка без сохранения изменений в профиль`);
          }
        }
      }
    } else {
      saveLastState(CHECKBOX_IDS);
    }

    let rawBase = String(baseNameInput.value || '').trim() || 'Raskladka';
    rawBase = rawBase.replace(/\s+/g, '');
    const base = sanitizeFileName(rawBase, 100);
    
    const want = {
      gcode:      q('[data-role="include-gcode"]').checked,
      dxf:        q('[data-role="include-dxf"]').checked,
      mapHtml:    q('[data-role="include-map"]').checked,
      reportHtml: q('[data-role="include-report"]').checked,
      playerHtml: q('[data-role="include-player"]').checked,
      qr:         q('[data-role="include-qr"]').checked,
      mapPdf:     q('[data-role="pdf-map"]').checked,
      specPdf:    q('[data-role="pdf-spec"]').checked,
      reportPdf:  q('[data-role="pdf-report"]').checked,
      labelsPdf:  q('[data-role="pdf-labels"]').checked,
      mapJpg:     q('[data-role="jpg-map"]').checked,
      reportJpg:  q('[data-role="jpg-report"]').checked,
      labelsJpg:  q('[data-role="jpg-labels"]').checked,
      commonLine: q('[data-role="common-line"]').checked, // <--- НОВОЕ
    };

    const anyChecked = Object.values(want).some(v => v);
    if (!anyChecked) {
      alert('Выберите хотя бы один пункт.');
      return;
    }

    // ═══ ПРОВЕРКА ЗАЗОРА ДЛЯ ЕДИНОГО РЕЗА ═══
    if (want.commonLine) {
      const layoutParams = readParams();
      if (layoutParams.gap > 0.1) {
        alert('⚠ Для работы функции «Единый рез» (Общая линия) необходимо установить зазор между деталями равным 0 мм.\n\nСейчас в параметрах заготовки стоит зазор: ' + layoutParams.gap + ' мм.\n\nПожалуйста, измените зазор на 0 и нажмите «Разложить» заново.');
        return;
      }
    }
    // ═══════════════════════════════════════

    doBtn.disabled = true;
    doBtn.textContent = '⏳ Собираю…';

    try {
      const files = await buildShipmentFiles(base, fullProjectName, want, (frac, text) => {
        setProgress(frac * 0.5, text);
      });

      const total = files.length;
      let saved = 0, downloaded = 0, errors = 0;

      for (let i = 0; i < total; i++) {
        const f = files[i];
        setProgress(0.5 + 0.5 * (i + 1) / total, `Сохранение ${i + 1} из ${total}: ${f.name}`);
        try {
          const res = await saveShipmentFile(f);
          if (res.downloaded) downloaded++;
          else if (res.ok) saved++;
          else errors++;
        } catch (e) {
          console.error('[shipment] save error:', e);
          errors++;
        }
      }

      setProgress(1, `Готово: ${saved + downloaded} файлов` + (errors ? `, ошибок: ${errors}` : ''));
      setStatus(
        `Комплект: ${saved} на сервер, ${downloaded} скачано` +
        (errors ? `, ошибок: ${errors}` : '')
      );
      setTimeout(close, 1200);
    } catch (e) {
      console.error('[shipment]', e);
      alert('Ошибка сборки: ' + e.message);
      doBtn.disabled = false;
      doBtn.textContent = '📦 Собрать и сохранить';
    }
  };
}

async function buildShipmentFiles(base, fullProjectName, want, onProgress) {
  const params = readParams();
  const post   = getPost(DEFAULT_POST_ID);
  const date   = todayIso();
  const files  = [];
  const total  = state.sheets.length;

  const progress = (frac, text) => { if (onProgress) onProgress(frac, text); };

  const projectBase = base;
  const thickness = params.thickness;
  const ext = post.ext;

  if (want.gcode) {
    for (let si = 0; si < total; si++) {
      progress((si / Math.max(total, 1)) * 0.05, `G-code: лист ${si + 1} из ${total}...`);
      const fileName = getGcodeFileName(si, projectBase, thickness, ext);
      const ctx = {
        fileName,
        postName: post.name + '.scpost',
        date,
        units: post.units,
        sheetIndex: si,
      };
      try {
        const gcode = sheetToGcode(state.sheets[si], params, post, ctx, {
          leadInRadius: 1.28,
          useTsp: true,
          cutCw: true,
          partByPart: true,
          commonLine: want.commonLine, // <--- ПЕРЕДАЕМ ФЛАГ
        });
        files.push({ name: fileName, content: gcode, mime: 'text/plain;charset=utf-8' });
      } catch (e) {
        console.warn('[shipment] G-code лист ' + (si + 1) + ':', e);
      }
    }
  }

  if (want.dxf) {
    const { getCurrentProjectName } = await import('../js/project-io.js');
    let prNum = '01';
    try {
      const projName = getCurrentProjectName();
      if (projName) {
        const m = projName.match(/^PR(\d+)/i);
        if (m) prNum = String(m[1]).padStart(2, '0');
      }
    } catch (_) {}

    let rsNum = '01';
    if (state.jobs && state.jobs.length) {
      const activeJob = state.jobs.find(j => j.id === state.activeJobId);
      if (activeJob && activeJob.name) {
        const match = activeJob.name.match(/\d+/);
        if (match) rsNum = match[0];
      }
    }

    for (let si = 0; si < total; si++) {
      progress(0.05 + (si / Math.max(total, 1)) * 0.02, `DXF: лист ${si + 1} из ${total}...`);
      try {
        const dxfText = buildDxfSingleSheet(si);
        const countOnSheet = state.sheets[si].placed.length;
        const sheetDim = `L${Math.round(params.sheetW)}x${Math.round(params.sheetH)}x${params.thickness}`;
        const fileName = `Rs${rsNum} PR${prNum} ${sheetDim} Dt${countOnSheet}.dxf`;
        files.push({ name: fileName, content: dxfText, mime: 'application/dxf' });
      } catch (e) {
        console.warn('[shipment] DXF лист ' + (si + 1) + ':', e);
      }
    }
  }

  if (want.qr) {
    progress(0.06, 'QR-код проекта...');
    try {
      const svgStr = makeQrSvg(`PROJECT:${fullProjectName}`, { cellSize: 10, margin: 4 });
      if (svgStr) {
        files.push({ name: `${projectBase}_QR.svg`, content: svgStr, mime: 'image/svg+xml' });
      }
    } catch (e) { console.warn('[shipment] QR:', e); }
  }

  if (want.mapHtml) {
    progress(0.08, 'HTML карта (только карты)...');
    try {
      const html = buildLayoutHtml({ includeSpec: false });
      files.push({ name: `${projectBase}_Karta.html`, content: html, mime: 'text/html;charset=utf-8' });
    } catch (e) { console.warn('[shipment] HTML карта:', e); }
  }

  if (want.reportHtml) {
    progress(0.10, 'HTML отчёт...');
    try {
      const html = buildReportHtml();
      files.push({ name: `${projectBase}_Otchet.html`, content: html, mime: 'text/html;charset=utf-8' });
    } catch (e) { console.warn('[shipment] HTML отчёт:', e); }
  }

  if (want.playerHtml) {
    for (let si = 0; si < total; si++) {
      progress(0.12 + (si / Math.max(total, 1)) * 0.08, `Плеер: лист ${si + 1} из ${total}...`);
      try {
        const html = getPlayerHtmlForSheet(si, {
          projectBase,
          theme: localStorage.getItem('raskladka.theme') || 'default',
        });
        if (html) {
          files.push({
            name: `${projectBase}_Player_L${si + 1}.html`,
            content: html,
            mime: 'text/html;charset=utf-8',
          });
        }
      } catch (e) { console.warn('[shipment] Плеер лист ' + (si + 1) + ':', e); }
    }
  }

  if (want.mapPdf) {
    progress(0.22, 'PDF карта...');
    try {
      const html = buildLayoutHtml({ includeSpec: false });
      const blob = await generatePdfBlob(html, 'landscape');
      const base64 = await blobToBase64(blob);
      files.push({
        name: `${projectBase}_Karta.pdf`,
        content: base64,
        mime: 'application/pdf',
        isBase64: true,
      });
    } catch (e) { console.warn('[shipment] PDF карта:', e); }
  }

  if (want.specPdf) {
    progress(0.35, 'PDF спецификация...');
    try {
      const html = buildSpecificationHtml();
      const blob = await generatePdfBlob(html, 'portrait');
      const base64 = await blobToBase64(blob);
      files.push({
        name: `${projectBase}_Spec.pdf`,
        content: base64,
        mime: 'application/pdf',
        isBase64: true,
      });
    } catch (e) { console.warn('[shipment] PDF спецификация:', e); }
  }

  if (want.reportPdf) {
    progress(0.48, 'PDF отчёт...');
    try {
      const html = buildReportHtml();
      const blob = await generatePdfBlob(html, 'landscape');
      const base64 = await blobToBase64(blob);
      files.push({
        name: `${projectBase}_Otchet.pdf`,
        content: base64,
        mime: 'application/pdf',
        isBase64: true,
      });
    } catch (e) { console.warn('[shipment] PDF отчёт:', e); }
  }

  if (want.labelsPdf) {
    progress(0.55, 'PDF этикетки...');
    try {
      const html = buildLabelsHtml();
      const blob = await generatePdfBlob(html, 'portrait');
      const base64 = await blobToBase64(blob);
      files.push({
        name: `${projectBase}_Labels.pdf`,
        content: base64,
        mime: 'application/pdf',
        isBase64: true,
      });
    } catch (e) { console.warn('[shipment] PDF этикетки:', e); }
  }

  if (want.mapJpg) {
    progress(0.65, 'JPG карта...');
    try {
      const html = buildLayoutHtml({ includeSpec: false });
      const blobs = await generateJpgPages(html, 0.92);
      for (let i = 0; i < blobs.length; i++) {
        const base64 = await blobToBase64(blobs[i]);
        files.push({
          name: `${projectBase}_Karta_${i + 1}.jpg`,
          content: base64,
          mime: 'image/jpeg',
          isBase64: true,
        });
      }
    } catch (e) { console.warn('[shipment] JPG карта:', e); }
  }

  if (want.reportJpg) {
    progress(0.80, 'JPG отчёт...');
    try {
      const html = buildReportHtml();
      const blobs = await generateJpgPages(html, 0.92);
      for (let i = 0; i < blobs.length; i++) {
        const base64 = await blobToBase64(blobs[i]);
        files.push({
          name: `${projectBase}_Otchet_${i + 1}.jpg`,
          content: base64,
          mime: 'image/jpeg',
          isBase64: true,
        });
      }
    } catch (e) { console.warn('[shipment] JPG отчёт:', e); }
  }

  if (want.labelsJpg) {
    progress(0.90, 'JPG этикетки...');
    try {
      const html = buildLabelsHtml();
      const blobs = await generateJpgPages(html, 0.92);
      for (let i = 0; i < blobs.length; i++) {
        const base64 = await blobToBase64(blobs[i]);
        files.push({
          name: `${projectBase}_Labels_${i + 1}.jpg`,
          content: base64,
          mime: 'image/jpeg',
          isBase64: true,
        });
      }
    } catch (e) { console.warn('[shipment] JPG этикетки:', e); }
  }

  progress(1, `Готово к сохранению: ${files.length} файлов`);
  return files;
}

async function saveShipmentFile(file) {
  const res = await saveFileToServer('shop', '', file.name, file.content, !!file.isBase64);
  if (res.ok) return { ok: true, downloaded: false };

  let blob;
  if (file.isBase64) {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: file.mime || 'application/octet-stream' });
  } else {
    blob = new Blob([file.content], { type: file.mime || 'text/plain;charset=utf-8' });
  }
  downloadBlob(blob, file.name);
  return { ok: true, downloaded: true };
}