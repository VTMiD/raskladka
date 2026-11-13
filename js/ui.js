// js/ui.js
import { $, setStatus } from './utils.js';
import { state } from './state.js';
import { draw, resetCamera } from './canvas.js';
import { updateStockMiniInfo } from './params.js';
import { enterMeasureMode, exitMeasureMode } from './canvas-measure.js';
import { enterGroupSelectMode, exitGroupSelectMode } from './canvas-drag.js';
import { enterRemnantMode, exitRemnantMode, clearManualRemnants } from './canvas-remnant.js';
import { saveRemnantDialog } from './remnant-io.js';
import { openReportModal, closeReportModal } from './report/report.js';
import { requestCancel } from './progress.js';
import { pushHistory } from './history.js';
import { initSplash } from './splash.js';
import { openStampSettingsModal } from './report/sheet-stamp-settings.js';
import { exportSpecToCSV } from './report/report-csv.js'; // <--- ДОБАВЛЕНО

(function injectGlobalStyles() {
    if (document.getElementById('customDropdownStyles')) return;
    const style = document.createElement('style');
    style.id = 'customDropdownStyles';
    style.textContent = `
    .dropdown-menu { position: fixed; z-index: 1000; background: #fff; border: 1px solid #b0b0b0; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.25); min-width: 320px; padding: 4px 0; animation: dropIn .15s ease-out; }
    @keyframes dropIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .dropdown-item { display: flex; align-items: center; gap: 12px; padding: 8px 14px; cursor: pointer; transition: background .15s; }
    .dropdown-item:hover { background: #eaf4ff; }
    .dropdown-item .dd-icon { font-size: 20px; flex-shrink: 0; width: 24px; text-align: center; }
    .dropdown-item .dd-text { flex: 1; min-width: 0; }
    .dropdown-item .dd-text b { display: block; font-size: 13px; color: #004a99; margin-bottom: 1px; }
    .dropdown-item .dd-desc { font-size: 11px; color: #888; line-height: 1.3; }
    .dd-checkbox { margin-left: auto; width: 16px; height: 16px; accent-color: #004a99; cursor: pointer; }
    .dropdown-sep { height: 1px; background: #e0e0e0; margin: 4px 0; }
    @media print { .dropdown-menu { display: none !important; } }

    .test-labels-wrap { font-family: 'Times New Roman', Times, serif; color: #000; }
    .test-labels-header { text-align: center; margin-bottom: 4mm; }
    .test-labels-header h1 { font-size: 18px; margin: 0 0 2px; }
    .test-labels-meta { font-size: 12px; color: #555; }
    .test-labels-page { width: 100%; padding: 8mm; box-sizing: border-box; display: flex; flex-direction: column; gap: 6mm; }
    .test-label {
      width: 100%; box-sizing: border-box;
      border: 2px solid #000; border-radius: 4px; padding: 6mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
    }
    .test-label-name { font-size: 22px; font-weight: bold; margin-bottom: 4mm; word-break: break-word; }
    .test-label-qr { width: 80mm; height: 80mm; margin: 0 auto 4mm; }
    .test-label-qr svg { width: 100%; height: 100%; display: block; }
    .test-label-info { font-size: 16px; margin-bottom: 2mm; }
    .test-label-date { font-size: 12px; color: #666; }

    #qrScanModal { z-index: 2000; }
    #qrScanModal video { background: #000; }

    .part-labels-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
      padding: 0 5mm;
    }
    .part-label-card {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 4mm;
      display: flex;
      flex-direction: column;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
      box-sizing: border-box;
      height: 125mm;
    }
    .part-label-header {
      text-align: center;
      width: 100%;
      margin-bottom: 2mm;
      border-bottom: 1.5px solid #000;
      padding-bottom: 2mm;
      flex-shrink: 0;
    }
    .part-label-title {
      font-size: 12px;
      font-weight: bold;
      color: #fff;
      background: #000;
      display: inline-block;
      padding: 1mm 6mm;
      border-radius: 3px;
      margin-bottom: 1mm;
    }
    .part-label-name {
      font-size: 18px;
      font-weight: bold;
      word-break: break-all;
      line-height: 1.1;
    }
    .part-label-content {
      display: flex;
      width: 100%;
      gap: 4mm;
      align-items: center;
      flex: 1 1 auto;
      margin-bottom: 2mm;
    }
    .part-label-qr {
      width: 52mm;
      height: 52mm;
      flex-shrink: 0;
    }
    .part-label-qr svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .part-label-details {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2mm;
      min-width: 0;
    }
    .part-label-dims {
      font-size: 16px;
      font-weight: bold;
      color: #004a99;
      line-height: 1.1;
    }
    .part-label-info {
      font-size: 12px;
      color: #333;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .part-label-info b {
      color: #000;
      font-size: 14px;
    }
    .part-label-date {
      font-size: 10px;
      color: #666;
      text-align: right;
      flex-shrink: 0;
      border-top: 1px solid #eee;
      padding-top: 1mm;
    }

    .gear-btn-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .unread-dot {
      position: absolute;
      top: 0px;
      right: 0px;
      width: 8px;
      height: 8px;
      background: #ff3b30;
      border-radius: 50%;
      display: none;
    }
    .unread-dot.active {
      display: block;
    }
    .status-modal-list {
      max-height: 400px;
      overflow-y: auto;
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px;
    }
    .status-item {
      padding: 6px 8px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
      display: flex;
      gap: 10px;
    }
    .status-item:last-child { border-bottom: none; }
    .status-time {
      color: #888;
      font-size: 11px;
      white-space: nowrap;
      font-family: monospace;
    }
    .status-text { flex: 1; word-break: break-word; }

    #fixBar .tools-group {
      margin-left: auto;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    #topbar {
      flex-wrap: wrap !important;
      overflow-x: hidden !important;
    }
    #fixBar {
      flex-basis: 100% !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
    }

    .path-settings-modal .modal-body { display: flex; flex-direction: column; gap: 12px; }
    .path-settings-modal label { font-weight: 600; font-size: 13px; color: #333; display: block; margin-bottom: 4px; }
    .path-settings-modal input[type="text"] { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; font-family: monospace; }
  `;
    document.head.appendChild(style);
})();

const allDropdowns = [];

export function createDropdownMenu({ id, triggerBtn, items, onAction }) {
    let dropdown = document.getElementById(id);
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = id;
        dropdown.className = 'dropdown-menu';
        dropdown.style.display = 'none';
        dropdown.innerHTML = items.map(item => {
            if (item.type === 'sep') return '<div class="dropdown-sep"></div>';
            if (item.type === 'checkbox') {
                return `<div class="dropdown-item" data-action="${item.action}" title="${item.title}">
          <span class="dd-icon">${item.icon}</span>
          <div class="dd-text"><b>${item.title}</b></div>
          <input type="checkbox" class="dd-checkbox" ${item.checked ? 'checked' : ''}>
        </div>`;
            }
            const titleAttr = item.hotkey ? `${item.title} (${item.hotkey})` : item.title;
            return `<div class="dropdown-item" data-action="${item.action}" title="${titleAttr}">
        <span class="dd-icon">${item.icon}</span>
        <div class="dd-text"><b>${item.title}</b><div class="dd-desc">${item.desc}</div></div>
      </div>`;
        }).join('');
        document.body.appendChild(dropdown);
    }

    const closeThis = () => { dropdown.style.display = 'none'; };
    const openThis = () => {
        for (const d of allDropdowns) if (d.dropdown !== dropdown) d.close();
        const rect = triggerBtn.getBoundingClientRect();
        dropdown.style.left = Math.max(10, rect.left) + 'px';
        dropdown.style.top = (rect.bottom + 6) + 'px';
        dropdown.style.display = 'block';
    };
    allDropdowns.push({ dropdown, close: closeThis });

    triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'block') closeThis();
        else openThis();
    });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== triggerBtn) closeThis();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeThis(); });

    dropdown.querySelectorAll('.dropdown-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const action = el.dataset.action;
            if (el.querySelector('.dd-checkbox')) {
                const cb = el.querySelector('.dd-checkbox');
                if (e.target !== cb) cb.checked = !cb.checked;
                onAction(action, cb.checked);
            } else {
                closeThis();
                onAction(action);
            }
        });
    });
}

const SHIFT_KEY = 'raskladka.shift.v1';
const PATHS_KEY = 'raskladka.paths.v1';
const statusHistory = [];

function initTopbarUI() {
    const fixBar = document.getElementById('fixBar');
    const topbar = document.getElementById('topbar');
    if (!topbar || !fixBar) return;

    const oldStatus = document.getElementById('status');
    if (oldStatus) oldStatus.style.display = 'none';

    const rightControls = document.createElement('div');
    rightControls.style.cssText = 'margin-left: auto; display: flex; align-items: center; gap: 8px; padding-left: 8px; flex-shrink: 0;';

    const shiftContainer = document.createElement('div');
    shiftContainer.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    shiftContainer.innerHTML = `
    <label style="font-size:12px; color:#cfe4ff; white-space:nowrap;">Смена:</label>
    <input id="inShiftTopbar" type="text" placeholder="Смена №1" style="width:90px;padding:4px 6px;border:1px solid #4a7fb5;border-radius:4px;font-size:12px;background:#2b5a8a;color:#fff;">
  `;

    const financeBtn = document.createElement('button');
    financeBtn.id = 'btnFinance';
    financeBtn.innerHTML = '💰';
    financeBtn.title = 'Экономика и финансы (себестоимость)';
    financeBtn.style.cssText = 'font-size:16px; padding:4px 8px; line-height:1; border-radius:4px; background:#2b5a8a; border:1px solid #4a7fb5; color:#fff; cursor:pointer;';
    financeBtn.onmouseover = () => financeBtn.style.background = '#3a70a5';
    financeBtn.onmouseout = () => financeBtn.style.background = '#2b5a8a';
    financeBtn.onclick = () => import('./report/finance.js').then(m => m.openFinanceModal());

    const infoWrapper = document.createElement('div');
    infoWrapper.className = 'gear-btn-wrapper';
    const infoBtn = document.createElement('button');
    infoBtn.id = 'btnStatusLog';
    infoBtn.innerHTML = 'ℹ';
    infoBtn.title = 'История сообщений';
    infoBtn.style.cssText = 'font-size:16px; padding:4px 8px; line-height:1; border-radius:4px; background:#2b5a8a; border:1px solid #4a7fb5; color:#fff; cursor:pointer;';
    infoBtn.onmouseover = () => infoBtn.style.background = '#3a70a5';
    infoBtn.onmouseout = () => infoBtn.style.background = '#2b5a8a';

    const unreadDot = document.createElement('div');
    unreadDot.className = 'unread-dot';
    unreadDot.id = 'statusUnreadDot';

    infoWrapper.appendChild(infoBtn);
    infoWrapper.appendChild(unreadDot);

    const gearBtn = document.createElement('button');
    gearBtn.id = 'btnGearMenu';
    gearBtn.innerHTML = '⚙';
    gearBtn.title = 'Настройки программы';
    gearBtn.style.cssText = 'font-size:18px; padding:4px 8px; line-height:1; border-radius:4px; background:#2b5a8a; border:1px solid #4a7fb5; color:#fff; cursor:pointer;';
    gearBtn.onmouseover = () => gearBtn.style.background = '#3a70a5';
    gearBtn.onmouseout = () => gearBtn.style.background = '#2b5a8a';

    rightControls.appendChild(shiftContainer);
    rightControls.appendChild(financeBtn);
    rightControls.appendChild(infoWrapper);
    rightControls.appendChild(gearBtn);
    topbar.insertBefore(rightControls, fixBar);

    const inShift = document.getElementById('inShiftTopbar');
    try { inShift.value = localStorage.getItem(SHIFT_KEY) || ''; } catch (_) {}
    inShift.addEventListener('input', () => {
        try { localStorage.setItem(SHIFT_KEY, inShift.value); } catch (_) {}
    });

    const unreadDotEl = document.getElementById('statusUnreadDot');
    document.addEventListener('app-status', (e) => {
        const msg = e.detail;
        if (!msg) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        statusHistory.unshift({ time: timeStr, text: msg });
        if (statusHistory.length > 50) statusHistory.pop();
        unreadDotEl.classList.add('active');
    });

    const logModal = document.createElement('div');
    logModal.id = 'statusLogModal';
    logModal.className = 'modal-overlay';
    logModal.innerHTML = `
    <div class="modal-window" style="width:500px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>ℹ История действий</span>
        <button class="close-btn" id="btnCloseLog" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div class="status-modal-list" id="statusLogList"></div>
      </div>
      <div class="modal-footer">
        <button id="btnClearLog">Очистить историю</button>
        <button id="btnCloseLog2">Закрыть</button>
      </div>
    </div>`;
    document.body.appendChild(logModal);

    const openLogModal = () => {
        const listEl = document.getElementById('statusLogList');
        if (!statusHistory.length) {
            listEl.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">История пуста</div>';
        } else {
            listEl.innerHTML = statusHistory.map(item => `
        <div class="status-item">
          <span class="status-time">${item.time}</span>
          <span class="status-text">${item.text}</span>
        </div>
      `).join('');
        }
        logModal.classList.add('active');
        unreadDotEl.classList.remove('active');
    };
    infoBtn.addEventListener('click', openLogModal);

    const closeLogModal = () => logModal.classList.remove('active');
    document.getElementById('btnCloseLog').addEventListener('click', closeLogModal);
    document.getElementById('btnCloseLog2').addEventListener('click', closeLogModal);
    logModal.addEventListener('click', (e) => { if (e.target === logModal) closeLogModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && logModal.classList.contains('active')) closeLogModal(); });

    document.getElementById('btnClearLog').addEventListener('click', () => {
        statusHistory.length = 0;
        document.getElementById('statusLogList').innerHTML = '<div style="text-align:center; color:#888; padding:20px;">История пуста</div>';
    });

    const pathModal = document.createElement('div');
    pathModal.className = 'modal-overlay path-settings-modal';
    pathModal.id = 'pathSettingsModal';
    pathModal.innerHTML = `
    <div class="modal-window" style="width:600px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📁 Настройки хранения данных</span>
        <button class="close-btn" id="btnClosePathSettings" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div>
          <label>Папка для Деталей</label>
          <input type="text" id="pathParts" placeholder="D:\\_Раскладка_Проект\\Детали">
          <div style="font-size:11px;color:#888;margin-top:4px">↳ Отчёты раскладки и этикетки деталей → <b>Отчеты\\</b></div>
        </div>
        <div>
          <label>Папка для Листов</label>
          <input type="text" id="pathSheets" placeholder="D:\\_Раскладка_Проект\\Листы">
          <div style="font-size:11px;color:#888;margin-top:4px">↳ Карта раскроя и этикетки листов → <b>Отчеты\\</b></div>
        </div>
        <div>
          <label>Папка для Остатков</label>
          <input type="text" id="pathRemnants" placeholder="D:\\_Раскладка_Проект\\Остаток">
          <div style="font-size:11px;color:#888;margin-top:4px">↳ Этикетки остатков → <b>Отчеты\\</b></div>
        </div>
        <div>
          <label>Папка для Проектов (.dxfnest.json)</label>
          <input type="text" id="pathProjects" placeholder="D:\\_Раскладка_Проект\\Проекты">
          <div style="font-size:11px;color:#888;margin-top:4px">↳ QR-коды → <b>Q-KOD\\</b></div>
        </div>
		<div>
         <label>Папка для документов в цех</label>
         <input type="text" id="pathShop" placeholder="D:\\_Раскладка_Проект\\В цех">
       <div style="font-size:11px;color:#888;margin-top:4px">↳ Комплект документов для отправки в цех</div>
       </div>
        <div class="hint" style="margin-top:10px">Внутри каждой папки автоматически создаются подпапки <b>Q-KOD</b> и <b>Отчеты</b>.</div>
      </div>
      <div class="modal-footer">
        <button id="btnSavePaths" class="primary">Сохранить</button>
        <button id="btnCancelPaths">Отмена</button>
      </div>
    </div>`;
    document.body.appendChild(pathModal);

    const openPathModal = () => {
        const saved = localStorage.getItem(PATHS_KEY);
        let paths = { parts: '', sheets: '', remnants: '', projects: '', shop: '' };
        if (saved) { try { paths = JSON.parse(saved); } catch (_) {} }
        document.getElementById('pathParts').value = paths.parts || 'D:\\_Раскладка_Проект\\Детали';
        document.getElementById('pathSheets').value = paths.sheets || 'D:\\_Раскладка_Проект\\Листы';
        document.getElementById('pathRemnants').value = paths.remnants || 'D:\\_Раскладка_Проект\\Остаток';
        document.getElementById('pathProjects').value = paths.projects || 'D:\\_Раскладка_Проект\\Проекты';
		document.getElementById('pathShop').value = paths.shop || 'D:\\_Раскладка_Проект\\В цех';
        pathModal.classList.add('active');
    };
    const closePathModal = () => pathModal.classList.remove('active');

    document.getElementById('btnClosePathSettings').addEventListener('click', closePathModal);
    document.getElementById('btnCancelPaths').addEventListener('click', closePathModal);
    pathModal.addEventListener('click', (e) => { if (e.target === pathModal) closePathModal(); });

    document.getElementById('btnSavePaths').addEventListener('click', async () => {
        const paths = {
            parts: document.getElementById('pathParts').value.trim(),
            sheets: document.getElementById('pathSheets').value.trim(),
            remnants: document.getElementById('pathRemnants').value.trim(),
            projects: document.getElementById('pathProjects').value.trim(),
            shop: document.getElementById('pathShop').value.trim(),
        };
        if (!paths.parts && !paths.sheets && !paths.remnants && !paths.projects && !paths.shop) {
            alert('Укажите хотя бы один путь');
            return;
        }
        try {
            setStatus('Проверка и создание папок...');
            const res = await fetch('/api/set-paths', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paths),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `HTTP статус: ${res.status}`);
            }
            const data = await res.json();
            if (data.ok) {
                localStorage.setItem(PATHS_KEY, JSON.stringify(paths));
                setStatus('✅ Пути сохранены, папки созданы');
                closePathModal();
            } else {
                alert('Ошибка при создании папок:\n' + data.error);
                setStatus('');
            }
        } catch (err) {
            console.error('[Path Settings]', err);
            alert('Ошибка настройки путей:\n' + err.message);
            setStatus('');
        }
    });

    createDropdownMenu({
        id: 'settingsDropdown',
        triggerBtn: gearBtn,
        items: [
            { action: 'stamp-settings', icon: '📐', title: 'Данные для штампа', desc: 'ФИО подписантов, материал, литера' },
            { type: 'sep' },
            { action: 'set-paths', icon: '📁', title: 'Настройки хранения данных', desc: 'Указать пути к папкам для деталей, листов, остатков и проектов' },
            { type: 'sep' },
            { action: 'theme-default', icon: '🎨', title: 'Тема: Стандартная', desc: 'Тёмный фон, красные контуры' },
            { action: 'theme-sheetcam', icon: '🎨', title: 'Тема: SheetCam', desc: 'Бордовый фон, белые детали, синий маршрут' },
            { type: 'sep' },
            { action: 'toggle-splash', icon: '🎬', title: 'Заставка при старте', desc: 'Показывать анимацию запуска', type: 'checkbox', checked: localStorage.getItem('raskladka.splashEnabled') !== 'false' },
            { action: 'test-splash', icon: '▶', title: 'Тест заставки', desc: 'Проиграть анимацию запуска сейчас' }
        ],
        onAction: (action, isChecked) => {
            if (action === 'stamp-settings') openStampSettingsModal();
            else if (action === 'set-paths') openPathModal();
            else if (action === 'theme-default') {
                localStorage.setItem('raskladka.theme', 'default');
                draw();
            }
            else if (action === 'theme-sheetcam') {
                localStorage.setItem('raskladka.theme', 'sheetcam');
                draw();
            }
            else if (action === 'toggle-splash') {
                localStorage.setItem('raskladka.splashEnabled', String(isChecked));
                setStatus(isChecked ? 'Заставка включена' : 'Заставка выключена');
            }
            else if (action === 'test-splash') {
                initSplash();
            }
        },
    });

    const savedPaths = localStorage.getItem(PATHS_KEY);
    if (savedPaths) {
        try {
            const paths = JSON.parse(savedPaths);
            if (paths.parts || paths.sheets || paths.remnants || paths.projects || paths.shop) {
                fetch('/api/set-paths', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(paths),
                }).catch(console.error);
            }
        } catch (_) {}
    }
}

let activeHelpBtn = null, activeHelpTip = null;
function closeHelpTip() {
    if (activeHelpTip) { activeHelpTip.remove(); activeHelpTip = null; }
    if (activeHelpBtn) { activeHelpBtn.classList.remove('active'); activeHelpBtn = null; }
}
function openHelpTip(btn) {
    closeHelpTip();
    const tip = document.createElement('div');
    tip.className = 'help-tip';
    tip.textContent = btn.dataset.help;
    document.body.appendChild(tip);
    const r = btn.getBoundingClientRect();
    let left = r.left;
    if (left + tip.offsetWidth > window.innerWidth - 10) left = window.innerWidth - tip.offsetWidth - 10;
    tip.style.left = left + 'px';
    tip.style.top = (r.bottom + 8) + 'px';
    btn.classList.add('active');
    activeHelpBtn = btn;
    activeHelpTip = tip;
}
function initHelpTips() {
    document.querySelectorAll('.help-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (activeHelpBtn === btn) closeHelpTip();
            else openHelpTip(btn);
        });
    });
    document.addEventListener('click', () => closeHelpTip());
    window.addEventListener('resize', () => closeHelpTip());
    window.addEventListener('scroll', () => closeHelpTip(), true);
}

const STOCK_COLLAPSED_KEY = 'raskladka.stockCollapsed.v1';

function applyStockCollapsed(collapsed) {
    const group = document.getElementById('stockGroup');
    const btn = document.getElementById('btnToggleStock');
    if (!group) return;
    group.classList.toggle('collapsed', !!collapsed);
    if (btn) {
        btn.textContent = collapsed ? '▸' : '▾';
        btn.title = collapsed ? 'Развернуть заготовку' : 'Свернуть заготовку';
    }
    if (collapsed) { try { updateStockMiniInfo(); } catch (_) {} }
    try { localStorage.setItem(STOCK_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (_) {}
}
function initStockCollapse() {
    const btn = document.getElementById('btnToggleStock');
    if (!btn) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(STOCK_COLLAPSED_KEY) === '1'; } catch (_) {}
    applyStockCollapsed(collapsed);
    btn.addEventListener('click', () => {
        const group = document.getElementById('stockGroup');
        if (!group) return;
        applyStockCollapsed(!group.classList.contains('collapsed'));
    });
}

function bindReportModal() {
    const btn = document.getElementById('btnOpenReport');
    if (btn) btn.addEventListener('click', openReportModal);
    document.getElementById('btnCloseReport')?.addEventListener('click', closeReportModal);
    document.getElementById('btnCloseReport2')?.addEventListener('click', closeReportModal);
    const modal = document.getElementById('reportModal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeReportModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal?.classList.contains('active')) closeReportModal();
    });
}

let duplicateModeActive = false;
function syncDuplicateButton() {
    const btn = $('btnDuplicateSelected');
    if (!btn) return;
    if (duplicateModeActive) {
        btn.classList.add('active');
        btn.title = 'Режим дублирования активен (Esc — выход)';
    } else {
        btn.classList.remove('active');
        btn.title = 'Дублировать выделенные детали (Ctrl+D)';
    }
}
function exitDuplicateMode() {
    duplicateModeActive = false;
    state.duplicateMode = false;
    state.duplicateGhost = null;
    state.duplicateSource = null;
    const canvas = document.getElementById('canvas');
    if (canvas) canvas.style.cursor = '';
    syncDuplicateButton();
    draw();
    setStatus('');
}
function enterDuplicateMode() {
    const hasSel = (state.selectedParts && state.selectedParts.length) || state.selectedPart;
    if (!hasSel) {
        setStatus('Сначала выделите детали для дублирования');
        return;
    }
    duplicateModeActive = true;
    state.duplicateMode = true;
    
    const sel = (state.selectedParts && state.selectedParts.length)
        ? state.selectedParts.map(sp => ({ sheetIdx: sp.sheetIdx, placedIdx: sp.placedIdx }))
        : [{ sheetIdx: state.selectedPart.sheetIdx, placedIdx: state.selectedPart.placedIdx }];

    import('./canvas-ops.js').then(m => {
        if (m && typeof m.startDuplicateDragFromSelection === 'function') {
            m.startDuplicateDragFromSelection(sel);
            draw();
        }
    });
    syncDuplicateButton();
    setStatus(`Режим дублирования (${sel.length} дет.): ведите мышь по холсту, клик+отпускание — копия. Esc — выход.`);
}
function onDuplicateButtonClick() {
    if (!duplicateModeActive) enterDuplicateMode();
    else setStatus('Режим дублирования активен: ведите мышь, клик+отпускание — копия. Esc — выход.');
}
function bindDuplicateMode() {
    const btn = $('btnDuplicateSelected');
    if (btn) btn.addEventListener('click', onDuplicateButtonClick);

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !duplicateModeActive) return;
        if (state.duplicateGhost) {
            e.preventDefault();
            e.stopPropagation();
            import('./canvas-ops.js').then(m => m.cancelDuplicateDrag && m.cancelDuplicateDrag());
            setStatus('Копия отменена. Продолжайте перетаскивать или Esc — выход.');
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        exitDuplicateMode();
    }, true);

    document.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (!['d', 'D', 'в', 'В'].includes(e.key)) return;
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
        e.preventDefault();
        onDuplicateButtonClick();
    });
}

function bindToolButtons() {
    const btnZoomFit = document.getElementById('btnZoomFit');
    if (btnZoomFit) btnZoomFit.addEventListener('click', () => { resetCamera(); draw(); setStatus('Показать всё'); });

    document.getElementById('btnCancelNest')?.addEventListener('click', () => requestCancel());

    const btnMeasure = document.getElementById('btnMeasure');
    if (btnMeasure) btnMeasure.addEventListener('click', () => {
        if (state.measureMode) exitMeasureMode(); else enterMeasureMode();
    });

    const btnMeasureClear = document.getElementById('btnMeasureClear');
    if (btnMeasureClear) btnMeasureClear.addEventListener('click', () => {
        state.measurements = []; state.measurePoints = []; state.measurePreview = null;
        draw(); setStatus('Измерения очищены');
    });

    const btnSelectFrame = document.getElementById('btnSelectFrame');
    if (btnSelectFrame) btnSelectFrame.addEventListener('click', () => {
        if (state.groupSelectMode) exitGroupSelectMode(); else enterGroupSelectMode();
    });

    const btnMarkRemnant = document.getElementById('btnMarkRemnant');
    if (btnMarkRemnant) btnMarkRemnant.addEventListener('click', () => {
        if (state.pendingEmptySelection) {
            const { sheetIdx, rect, w, h } = state.pendingEmptySelection;
            const sheet = state.sheets[sheetIdx];
            if (sheet) {
                if (!sheet.remnants) sheet.remnants = [];
                sheet.remnants.push({
                    type: 'manual', _manual: true, polygon: null,
                    rect: { ...rect }, area: w * h,
                    cut: { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y1 },
                    w, h,
                });
                state.pendingEmptySelection = null;
                setStatus(`📦 Остаток: ${Math.round(w)} × ${Math.round(h)} мм`);
                draw(); pushHistory(); return;
            }
        }
        if (state.remnantMode) exitRemnantMode(); else enterRemnantMode();
    });

    const btnClearRemnants = document.getElementById('btnClearRemnants');
    if (btnClearRemnants) btnClearRemnants.addEventListener('click', () => {
        if (confirm('Удалить все ручные остатки на всех листах?')) clearManualRemnants();
    });

    const btnSaveRemnant = document.getElementById('btnSaveRemnant');
    if (btnSaveRemnant) btnSaveRemnant.addEventListener('click', () => {
        saveRemnantDialog().catch(err => {
            console.error(err);
            alert('Ошибка сохранения остатка: ' + err.message);
        });
    });

    // ═══ НОВАЯ КНОПКА: Экспорт в CSV ═══
    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            exportSpecToCSV();
        });
    }
}

function initToolbarButtons() {
    bindReportModal();
    bindToolButtons();
    bindDuplicateMode();
}

export function initUI() {
    initTopbarUI();
    initHelpTips();
    initStockCollapse();
    initToolbarButtons();
}