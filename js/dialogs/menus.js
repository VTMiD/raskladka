// js/dialogs/menus.js
import { state } from '../state.js';
import { askFileNameWithPath, makeDestinationHint, setStatus } from '../utils.js';
import { createDropdownMenu } from '../ui.js';
import { buildReportHtml, buildLayoutHtml, doPrint } from '../report/report.js';
import { buildLabelsHtml, buildSheetLabelsHtml, buildRemnantLabelsHtml } from '../report/labels.js';
import { getCurrentProjectName, buildDefaultFileName } from '../project-io.js';

// Импорты из наших новых модулей
import { ensureProjectSaved, openSaveProjectDialog, loadProjectFromServer, openQrProjectDialog } from './project-manager.js';
import { saveReportToFolder } from './pdf-maker.js';
import { openQrScanner } from './qr-scanner.js';
import { openImportListModal } from './import-list.js';

function makeDefaultReportName(prefix) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${prefix}_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function makeProjectReportName(prefix) {
    let projectName = '';
    try {
        projectName = typeof getCurrentProjectName === 'function' ? getCurrentProjectName() : '';
        if (!projectName && typeof buildDefaultFileName === 'function') projectName = buildDefaultFileName();
    } catch (_) {}

    const mDef = String(projectName || '').match(/^PR(\d+)(.+)\.dxfnest\.json$/i);
    if (mDef) return `${prefix}_Pr${mDef[1]}${mDef[2]}`;

    const base = String(projectName || '').replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
    if (base) {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        const dateStr = `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`;
        return `${prefix}_${base}_${dateStr}`;
    }

    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${prefix}_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function setupReports() {
    const oldModal = document.getElementById('reportsChoiceModal');
    if (oldModal) oldModal.style.display = 'none';
    const btn = document.getElementById('btnOpenReportsMenu');
    if (!btn) return;

    createDropdownMenu({
        id: 'reportsDropdown',
        triggerBtn: btn,
        items: [
            { action: 'save-report-pdf', icon: '📄', title: 'Сохранить отчёт PDF', desc: '→ Проекты\\Отчеты' },
            { action: 'save-map-pdf',    icon: '📄', title: 'Сохранить карту PDF', desc: '→ Проекты\\Отчеты' },
            { action: 'save-report-jpg', icon: '🖼', title: 'Сохранить отчёт JPG', desc: '→ Картинка в загрузки' },
            { action: 'save-map-jpg',    icon: '🖼', title: 'Сохранить карту JPG', desc: '→ Изображения листов по одному' },
            { type: 'sep' },
            { action: 'save-player-html', icon: '🎬', title: 'Сохранить HTML-плеер', desc: 'Автономная симуляция резки' },
            { type: 'sep' },
            { action: 'print-report', icon: '🖨', title: 'Печать отчёта', desc: 'Диалог печати' },
            { action: 'print-layout', icon: '🖨', title: 'Печать карты', desc: 'Диалог печати' },
        ],
        onAction: async (action) => {
            if (action === 'save-report-pdf') {
                if (!state.parts.length) { alert('Сначала добавьте детали'); return; }
                await ensureProjectSaved();
                await saveReportToFolder({
                    key: null, defaultName: makeProjectReportName('OtchetRS'), dialogTitle: '📄 Сохранить отчёт PDF',
                    html: buildReportHtml(), orientation: 'portrait', category: 'projects', subfolder: 'Отчеты',
                    destinationHint: makeDestinationHint('projects', 'Отчеты'),
                });
            } else if (action === 'save-map-pdf') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                await ensureProjectSaved();
                await saveReportToFolder({
                    key: null, defaultName: makeProjectReportName('KartaRs'), dialogTitle: '📄 Сохранить карту PDF',
                    html: buildLayoutHtml(), orientation: 'landscape', category: 'projects', subfolder: 'Отчеты',
                    destinationHint: makeDestinationHint('projects', 'Отчеты'),
                });
            } else if (action === 'save-report-jpg') {
                await ensureProjectSaved();
                const oldBtn = document.getElementById('btnSaveHtml'); if (oldBtn) oldBtn.click();
            } else if (action === 'save-map-jpg') {
                await ensureProjectSaved();
                const oldBtn = document.getElementById('btnSaveJpgSheets'); if (oldBtn) oldBtn.click();
            } else if (action === 'save-player-html') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                import('../../GsCAM/export-player.js').then(m => {
                    const projName = makeProjectReportName('Player').replace(/[^a-zA-Z0-9_\-]/g, '_');
                    m.downloadPlayerHtmlForSheet(0, { projectBase: projName, theme: localStorage.getItem('raskladka.theme') || 'default' });
                    setStatus('Автономный HTML-плеер скачан');
                });
            } else if (action === 'print-report') {
                if (!state.parts.length) { alert('Сначала добавьте детали'); return; }
                if (!state.sheets.length && !confirm('Раскладка не выполнена. Напечатать отчёт только по заданию (план)?')) return;
                await ensureProjectSaved();
                const name = await askFileNameWithPath({ title: '🖨 Печать отчёта', defaultName: makeProjectReportName('OtchetRS'), saveLabel: '🖨 Печать' });
                if (!name) return;
                doPrint(buildReportHtml(), 'portrait', name);
            } else if (action === 'print-layout') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                await ensureProjectSaved();
                const name = await askFileNameWithPath({ title: '🖨 Печать карты', defaultName: makeProjectReportName('KartaRs'), saveLabel: '🖨 Печать' });
                if (!name) return;
                doPrint(buildLayoutHtml(), 'landscape', name);
            }
        },
    });
}

function setupExport() {
    const oldBtnAll = document.getElementById('btnExport');
    const oldBtnSplit = document.getElementById('btnExportSplit');
    if (!oldBtnAll || !oldBtnSplit) return;
    oldBtnAll.style.display = 'none'; oldBtnSplit.style.display = 'none';

    const newBtn = document.createElement('button');
    newBtn.id = 'btnExportMenu'; newBtn.textContent = '💾 Экспорт DXF'; newBtn.title = 'Экспорт в DXF';
    oldBtnAll.parentNode.insertBefore(newBtn, oldBtnAll);

    createDropdownMenu({
        id: 'exportDropdown', triggerBtn: newBtn,
        items: [
            { action: 'export-all', icon: '🗂', title: 'Все листы', desc: 'Все листы в один DXF (в папку Листы)' },
            { action: 'export-split', icon: '📄', title: 'По листам', desc: 'Каждый лист — отдельный DXF' },
        ],
        onAction: (action) => {
            if (action === 'export-all') oldBtnAll.click();
            else if (action === 'export-split') oldBtnSplit.click();
        },
    });
}

function setupLabels() {
    const oldModal = document.getElementById('labelsChoiceModal');
    if (oldModal) oldModal.style.display = 'none';
    const btn = document.getElementById('btnPrintLabels');
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    newBtn.id = 'btnPrintLabelsMenu'; newBtn.textContent = '🏷 Этикетки';
    btn.parentNode.replaceChild(newBtn, btn);

    createDropdownMenu({
        id: 'labelsDropdown', triggerBtn: newBtn,
        items: [
            { action: 'save-parts-labels-pdf', icon: '📄', title: 'Сохранить этикетки деталей PDF', desc: '→ Детали\\Отчеты' },
            { action: 'save-sheets-labels-pdf', icon: '📄', title: 'Сохранить этикетки листов PDF', desc: '→ Листы\\Отчеты' },
            { action: 'save-remnants-labels-pdf', icon: '📄', title: 'Сохранить этикетки остатков PDF', desc: '→ Остаток\\Отчеты' },
            { type: 'sep' },
            { action: 'print-parts-labels', icon: '🖨', title: 'Печать этикеток деталей', desc: 'Диалог печати' },
            { action: 'print-sheets-labels', icon: '🖨', title: 'Печать этикеток листов', desc: 'Диалог печати' },
            { action: 'print-remnants-labels', icon: '🖨', title: 'Печать этикеток остатков', desc: 'Диалог печати' },
        ],
        onAction: async (action) => {
            if (action === 'save-parts-labels-pdf') {
                if (!state.parts.length) { alert('Сначала добавьте детали'); return; }
                await saveReportToFolder({ key: 'labelsParts', defaultName: makeDefaultReportName('Этикетки_деталей'), dialogTitle: '📄 Сохранить этикетки деталей PDF', html: buildLabelsHtml(), orientation: 'portrait', category: 'parts', subfolder: 'Отчеты', destinationHint: makeDestinationHint('parts', 'Отчеты') });
            } else if (action === 'save-sheets-labels-pdf') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                await saveReportToFolder({ key: 'labelsSheets', defaultName: makeDefaultReportName('Этикетки_листов'), dialogTitle: '📄 Сохранить этикетки листов PDF', html: buildSheetLabelsHtml(), orientation: 'portrait', category: 'sheets', subfolder: 'Отчеты', destinationHint: makeDestinationHint('sheets', 'Отчеты') });
            } else if (action === 'save-remnants-labels-pdf') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                await saveReportToFolder({ key: 'labelsRemnants', defaultName: makeDefaultReportName('Этикетки_остатков'), dialogTitle: '📄 Сохранить этикетки остатков PDF', html: buildRemnantLabelsHtml(), orientation: 'portrait', category: 'remnants', subfolder: 'Отчеты', destinationHint: makeDestinationHint('remnants', 'Отчеты') });
            } else if (action === 'print-parts-labels') {
                if (!state.parts.length) { alert('Сначала добавьте детали'); return; }
                const name = await askFileNameWithPath({ title: '🖨 Печать этикеток деталей', defaultName: makeDefaultReportName('Этикетки_деталей'), storageKey: 'labelsParts', saveLabel: '🖨 Печать' });
                if (name) doPrint(buildLabelsHtml(), 'portrait', name);
            } else if (action === 'print-sheets-labels') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                const name = await askFileNameWithPath({ title: '🖨 Печать этикеток листов', defaultName: makeDefaultReportName('Этикетки_листов'), storageKey: 'labelsSheets', saveLabel: '🖨 Печать' });
                if (name) doPrint(buildSheetLabelsHtml(), 'portrait', name);
            } else if (action === 'print-remnants-labels') {
                if (!state.sheets.length) { alert('Сначала нажмите «Разложить»'); return; }
                const name = await askFileNameWithPath({ title: '🖨 Печать этикеток остатков', defaultName: makeDefaultReportName('Этикетки_остатков'), storageKey: 'labelsRemnants', saveLabel: '🖨 Печать' });
                if (name) doPrint(buildRemnantLabelsHtml(), 'portrait', name);
            }
        },
    });
}

async function setupProject() {
    const btnSave = document.getElementById('btnSaveProject');
    const btnLoad = document.getElementById('btnLoadProject');
    if (!btnSave || !btnLoad) return;
    btnSave.style.display = 'none'; btnLoad.style.display = 'none';
    
    const newBtn = document.createElement('button');
    newBtn.id = 'btnProjectMenu'; newBtn.textContent = '📁 Проект'; newBtn.title = 'Управление проектом';
    btnSave.parentNode.insertBefore(newBtn, btnSave);

    let recentItems = [];
    try {
        const res = await fetch('/api/list-projects');
        const data = await res.json();
        if (data.ok && data.files) {
            for (const f of data.files.slice(0, 5)) {
                recentItems.push({ action: `load-${f.name}`, icon: '🕒', title: f.name, desc: 'Недавний проект' });
            }
        }
    } catch (_) {}

    const items = [
        { action: 'load', icon: '📂', title: 'Открыть проект', desc: 'Выбрать файл в проводнике' },
        { action: 'save', icon: '💾', title: 'Сохранить проект…', desc: 'Сохранить в папку Проектов', hotkey: 'Ctrl+S' },
    ];
    if (recentItems.length) { items.push({ type: 'sep' }); items.push(...recentItems); }
    items.push({ type: 'sep' });
    items.push({ action: 'qr-project', icon: '📱', title: 'QR-код проекта…', desc: 'Сгенерировать QR для быстрого доступа' });

    createDropdownMenu({
        id: 'projectDropdown', triggerBtn: newBtn, items: items,
        onAction: (action) => {
            if (action === 'save') openSaveProjectDialog(btnSave);
            else if (action === 'load') btnLoad.click();
            else if (action === 'qr-project') openQrProjectDialog();
            else if (action.startsWith('load-')) {
                const fname = action.replace('load-', '');
                setStatus(`Загрузка ${fname}...`);
                const dummyEl = document.createElement('div');
                dummyEl.style.display = 'none';
                document.body.appendChild(dummyEl);
                loadProjectFromServer(fname, dummyEl).then(() => dummyEl.remove());
            }
        },
    });
}

function setupTools() {
    const btnAutofit = document.getElementById('btnOpenAutofit');
    const btnCatalog = document.getElementById('btnOpenRemnantCatalog');
    const btnInfo = document.getElementById('btnOpenReport');
    if (!btnAutofit || !btnCatalog || !btnInfo) return;

    btnAutofit.style.display = 'none'; btnCatalog.style.display = 'none';

    const newBtn = document.createElement('button');
    newBtn.id = 'btnToolsMenu'; newBtn.textContent = '🛠 Инструменты'; newBtn.title = 'Дополнительные инструменты';
    btnInfo.parentNode.insertBefore(newBtn, btnInfo);

    createDropdownMenu({
        id: 'toolsDropdown', triggerBtn: newBtn,
        items: [
            { action: 'scan-qr', icon: '📷', title: 'Сканировать QR', desc: 'Считать параметры листа или загрузить деталь/проект', hotkey: 'Ctrl+Q' },
            { action: 'import-list', icon: '📋', title: 'Импорт из списка', desc: 'Вставить номера деталей из мессенджера', serverOnly: true, serverTip: 'Детали ищутся в папке «Детали» на сервере.' },
            { type: 'sep' },
            { action: 'autofit', icon: '🎯', title: 'Подбор заготовки', desc: 'Автоматический подбор размера листа' },
            { action: 'catalog', icon: '📚', title: 'Каталог остатков', desc: 'Список остатков со всех листов' },
            { action: 'shipment', icon: '📦', title: 'Подготовить в цех', desc: 'Комплект документов' },
            { action: 'toggle-names', icon: '🔤', title: 'Показывать названия', desc: 'Отображать имена деталей на холсте', type: 'checkbox', checked: state.showNames !== false },
            { action: 'toggle-cut-order', icon: '🔢', title: 'Показывать номера реза', desc: 'Номера в правом верхнем углу деталей', type: 'checkbox', checked: state.showCutOrder !== false },
        ],
        onAction: (action, isChecked) => {
            if (action === 'scan-qr') openQrScanner();
            else if (action === 'import-list') openImportListModal();
            else if (action === 'autofit') btnAutofit.click();
            else if (action === 'catalog') btnCatalog.click();
            else if (action === 'shipment') import('../../GsCAM/shipment.js').then(m => m.openShipmentModal());
            else if (action === 'toggle-names') { state.showNames = isChecked; import('../canvas.js').then(m => m.draw()); }
            else if (action === 'toggle-cut-order') { state.showCutOrder = isChecked; import('../canvas.js').then(m => m.draw()); }
        },
    });
}

export function setupMenus() {
    setupReports();
    setupExport();
    setupLabels();
    setupProject();
    setupTools();
}