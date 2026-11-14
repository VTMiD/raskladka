// js/dialogs/dialogs.js
import { state } from '../state.js';
import { askFileNameWithPath } from '../utils.js';
import { doPrint, buildReportHtml } from '../report/report.js';
import { setupMenus } from './menus.js';
import { generatePdfBlob, saveReportToFolder } from './pdf-maker.js';
import { openSaveProjectDialog, loadProjectFromServer, openQrProjectDialog } from './project-manager.js';
import { openQrScanner } from './qr-scanner.js';
import { openImportListModal } from './import-list.js';

function initHotkeys() {
    document.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey)) return;

        if (e.key === 's' || e.key === 'ы') {
            e.preventDefault();
            const btnSave = document.getElementById('btnSaveProject');
            if (btnSave) openSaveProjectDialog(btnSave);
        }
        if (e.key === 'q' || e.key === 'й') {
            e.preventDefault();
            openQrScanner();
        }
        if (e.key === 'p' || e.key === 'з') {
            e.preventDefault();
            if (!state.parts.length) return;
            // Логика печати отчета
            import('./project-manager.js').then(async m => {
                await m.ensureProjectSaved();
                // Здесь используется makeProjectReportName из menus.js, но для хоткея можно использовать дефолтное имя
                const name = await askFileNameWithPath({
                    title: '🖨 Печать отчёта',
                    defaultName: 'Otchet_' + new Date().toISOString().slice(0,10),
                    saveLabel: '🖨 Печать',
                });
                if (!name) return;
                doPrint(buildReportHtml(), 'portrait', name);
            });
        }
    });
}

export function initDialogs() {
    setupMenus();
    initHotkeys();
}

// Реэкспорт для обратной совместимости (чтобы другие файлы не сломались)
export { generatePdfBlob, saveReportToFolder, openSaveProjectDialog, loadProjectFromServer, openQrProjectDialog, openQrScanner, openImportListModal };