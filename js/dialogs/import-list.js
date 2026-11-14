// js/dialogs/import-list.js
import { state } from '../state.js';
import { parseDxfText } from '../dxf-import.js';
import { renderPartsTable } from '../parts.js';
import { draw } from '../canvas.js';
import { pushHistory } from '../history.js';

export function openImportListModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
    <div class="modal-window" style="width:500px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📋 Импорт деталей из списка</span>
        <button class="close-btn" id="btnCloseImportList" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div class="hint" style="margin-bottom:8px">Вставьте номера деталей, разделенные пробелом, запятой или переносом строки.</div>
        <textarea id="importListText" style="width:100%;height:150px;padding:8px;border:1px solid #ccc;border-radius:4px;font-family:monospace;font-size:13px;resize:vertical" placeholder="Пример: 57 88 89 93 115..."></textarea>
        <div id="importListStatus" style="margin-top:10px;font-size:13px;color:#555"></div>
      </div>
      <div class="modal-footer">
        <button id="btnDoImportList" class="primary">Импортировать</button>
        <button id="btnCancelImportList">Отмена</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('btnCloseImportList').onclick = close;
    document.getElementById('btnCancelImportList').onclick = close;

    document.getElementById('btnDoImportList').onclick = async () => {
        const text = document.getElementById('importListText').value;
        const statusEl = document.getElementById('importListStatus');
        const btn = document.getElementById('btnDoImportList');
        if (!text.trim()) { alert('Вставьте список номеров'); return; }

        const ids = text.split(/[\s,;\n]+/).filter(Boolean);
        btn.disabled = true;
        statusEl.textContent = `Поиск ${ids.length} деталей...`;

        try {
            const res = await fetch('/api/find-parts-by-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            let addedCount = 0;
            for (const file of data.files) {
                try {
                    const part = parseDxfText(file.content, file.name);
                    part.qty = 1;
                    part.dxfText = file.content;
                    const existing = state.parts.find(p => p.name.toLowerCase() === part.name.toLowerCase());
                    if (existing) existing.qty++;
                    else state.parts.push(part);
                    addedCount++;
                } catch (err) { console.warn('Ошибка парсинга', file.name, err); }
            }

            renderPartsTable();
            draw();
            pushHistory();

            let msg = `✅ Успешно загружено: ${addedCount} дет.`;
            if (data.notFound && data.notFound.length > 0) msg += `\n❌ Не найдены: ${data.notFound.join(', ')}`;
            statusEl.textContent = msg;
            statusEl.style.color = (data.notFound && data.notFound.length > 0) ? '#b00' : '#080';
            if (addedCount > 0) setTimeout(close, 2500);
        } catch (err) {
            statusEl.textContent = 'Ошибка: ' + err.message;
            statusEl.style.color = '#b00';
        } finally {
            btn.disabled = false;
        }
    };
}