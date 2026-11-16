// js/dialogs/project-manager.js
import { state } from '../state.js';
import { setStatus, isServerAvailable } from '../utils.js';
import { makeQrSvg } from '../qr-barcode.js';
import { buildDefaultFileName, getCurrentProjectName, buildProjectName, setCurrentProjectName } from '../project-io.js';

export async function ensureProjectSaved() {
    const projName = getCurrentProjectName();
    const isNotSaved = !projName || projName === 'Без_имени.dxfnest.json' || projName.toLowerCase().includes('без_имени');
    if (isNotSaved) {
        if (confirm('⚠️ Проект ещё НЕ СОХРАНЁН!\n\nЕсли сгенерировать отчёт сейчас, QR-код будет содержать заглушку.\n\nСохранить проект сейчас?')) {
            const btnSave = document.getElementById('btnSaveProject');
            if (btnSave) openSaveProjectDialog(btnSave);
        }
        return false;
    }
    return true;
}

async function showProjectPickerDialog(expectedName, availableFiles) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
        <div class="modal-window" style="width:560px; max-width:95vw">
          <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
            <span>📂 Выберите проект</span>
            <button class="close-btn" id="ppClose" style="color:#004a99">✕</button>
          </div>
          <div class="modal-body">
            <div class="hint" style="margin-bottom:10px">
              Файл «<b>${expectedName}</b>» не найден.<br>
              Возможно, проект был сохранён под другим именем. Выберите из списка:
            </div>
            <div id="ppList" style="max-height:350px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; background:#fff;">
              ${availableFiles.map(f => `
                <div class="pp-item" data-name="${f.name}" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f0f0f0; font-family:monospace; font-size:12px; transition:background .15s;">
                  ${f.name}
                </div>
              `).join('')}
            </div>
            <div class="hint" style="margin-top:10px;font-size:11px;color:#888">
              Файлы найдены в папке Проекты.
            </div>
          </div>
          <div class="modal-footer">
            <button id="ppCancel">Отмена</button>
          </div>
        </div>`;
        document.body.appendChild(modal);

        const close = (result) => { modal.remove(); resolve(result); };

        modal.querySelector('#ppClose').onclick = () => close(null);
        modal.querySelector('#ppCancel').onclick = () => close(null);
        modal.addEventListener('click', e => { if (e.target === modal) close(null); });

        modal.querySelectorAll('.pp-item').forEach(item => {
            item.onmouseover = () => item.style.background = '#eaf4ff';
            item.onmouseout = () => item.style.background = '#fff';
            item.onclick = () => close(item.dataset.name);
        });
    });
}

export async function loadProjectFromServer(fileName, resultEl) {
    if (!isServerAvailable()) {
        const msg = '⚠ Открытие проектов по имени доступно только при запущенном локальном сервере.';
        setStatus(msg);
        if (resultEl) { resultEl.textContent = msg; resultEl.style.color = '#b00'; }
        return;
    }
    resultEl.textContent = `Поиск проекта: ${fileName}...`;
    resultEl.style.color = '#555';

    const variants = [
        fileName,
        fileName.replace(/\.dxfnest\.json$/i, '.json'),
        fileName.replace(/\.json$/i, ''),
        fileName.replace(/\.dxfnest\.json$/i, '') + '.dxfnest.json',
    ];
    const uniqueVariants = [...new Set(variants)];

    let lastError = null;
    for (const variant of uniqueVariants) {
        try {
            const res = await fetch('/api/find-project?name=' + encodeURIComponent(variant));
            if (res.ok) {
                const data = await res.json();
                const envelope = JSON.parse(data.content);
                if (!envelope || !envelope.state) throw new Error('Неверный формат файла проекта');

                if (envelope.state.layers && Array.isArray(envelope.state.layers)) {
                    state.layers = envelope.state.layers;
                }

                await window.ProjectHooks.restore(envelope.state);
                setCurrentProjectName(variant);

                const msg = `✅ Проект «${variant}» успешно загружен`;
                setStatus(msg);
                resultEl.textContent = msg;
                resultEl.style.color = '#080';

                import('../canvas.js').then(m => m.draw());
                setTimeout(() => { resultEl.textContent = 'Проект открыт! Закройте окно.'; }, 1500);
                return;
            } else {
                lastError = await res.text();
            }
        } catch (err) { lastError = err.message; }
    }

    resultEl.textContent = `Файл не найден. Получаю список доступных проектов...`;
    try {
        const listRes = await fetch('/api/list-projects');
        const listData = await listRes.json();
        if (listData.ok && listData.files && listData.files.length) {
            const picked = await showProjectPickerDialog(fileName, listData.files);
            if (picked) return loadProjectFromServer(picked, resultEl);
            resultEl.textContent = 'Проект не выбран';
            resultEl.style.color = '#888';
            return;
        }
    } catch (_) {}

    const msg = `❌ Проект «${fileName}» не найден.\n\n💡 Проверьте:\n1. Проект был сохранён?\n2. Файл лежит в папке «Проекты»?\n3. Путь указан в настройках (⚙)?`;
    setStatus(msg);
    resultEl.textContent = msg;
    resultEl.style.color = '#b00';
}

export function openSaveProjectDialog(btnSave) {
    const defaultName = (typeof buildDefaultFileName === 'function')
        ? buildDefaultFileName()
        : `PR${new Date().toISOString().slice(0,10)}_${new Date().getHours()}${new Date().getMinutes()}.dxfnest.json`;

    let currentNum = 1;
    const match = defaultName.match(/^PR(\d+)/i);
    if (match) currentNum = parseInt(match[1], 10);

    const currentNumStr = String(currentNum).padStart(2, '0');
    const currentProject = (typeof getCurrentProjectName === 'function') ? getCurrentProjectName() : '';

    // Убираем расширение для отображения в поле ввода
    const defaultNameClean = defaultName.replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
    <div class="modal-window" style="width:540px; max-width:95vw">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>💾 Сохранить проект</span>
        <button class="close-btn" id="spClose" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; background:#fff8e1; padding:10px 15px; border:1px solid #f0d9a8; border-radius:6px;">
            <label style="font-weight:bold; color:#a05200; font-size:14px; margin:0;">Номер проекта:</label>
            <input id="spNum" type="text" inputmode="numeric" value="${currentNumStr}" style="width:80px; padding:6px; border:1px solid #d4a373; border-radius:4px; font-size:16px; font-weight:bold; text-align:center; color:#a05200;">
            <span style="font-size:12px; color:#888;">(изменение номера обновит имя ниже)</span>
        </div>
        <div class="hint" style="margin-bottom:8px">Имя файла (расширение <b>.dxfnest.json</b> добавится автоматически).</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <input id="spName" type="text" style="width:100%;padding:8px 10px;border:1px solid #bbb;border-radius:4px;font-size:16px;font-family:monospace" autocomplete="off" spellcheck="false">
        </div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          ${currentProject ? `<button id="spCurrent" class="small" style="padding:4px 10px; font-size:12px;">↩ Текущий проект: ${currentProject.replace(/\.dxfnest\.json$/i, '')}</button>` : ''}
          <button id="spNext" class="small" style="padding:4px 10px; font-size:12px;">🔄 Следующий номер +1</button>
        </div>
      </div>
      <div class="modal-footer">
        <button id="spSave" class="primary">💾 Сохранить</button>
        <button id="spCancel">Отмена</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const inpName = modal.querySelector('#spName');
    const inpNum = modal.querySelector('#spNum');
    
    // Устанавливаем имя без расширения
    inpName.value = defaultNameClean;
    setTimeout(() => { inpName.focus(); inpName.select(); }, 0);

    inpNum.addEventListener('input', () => {
        let n = parseInt(inpNum.value, 10);
        if (isNaN(n) || n < 1) n = 1;
        inpNum.value = String(n).padStart(2, '0');
        if (typeof buildProjectName === 'function') {
            let newName = buildProjectName(n);
            // Убираем расширение перед установкой в поле
            newName = newName.replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
            inpName.value = newName;
        }
    });

    const close = () => modal.remove();
    modal.querySelector('#spClose').onclick = close;
    modal.querySelector('#spCancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#spSave').onclick = () => {
        let raw = inpName.value.trim();
        if (!raw) { inpName.focus(); return; }
        
        // При сохранении возвращаем расширение обратно, если его нет
        if (!raw.toLowerCase().endsWith('.json')) {
            raw += '.dxfnest.json';
        }
        
        window.__projectSaveName = raw;
        close();
        btnSave.click();
    };
}

// ═══════════════════════════════════════════════════════════════
// ГЕНЕРАЦИЯ И ПОКАЗ QR-КОДА
// ═══════════════════════════════════════════════════════════════
export function generateProjectQr(projectName) {
    const qrSvg = makeQrSvg(`PROJECT:${projectName}`, { cellSize: 10, margin: 4 });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
    <div class="modal-window" style="width:460px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📱 QR-код проекта</span>
        <button class="close-btn" id="btnCloseQrProj" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body" style="text-align:center">
        <div id="qrProjContainer" style="width:320px;height:320px;margin:0 auto 10px; border: 1px solid #eee; padding: 10px; background: #fff; border-radius: 8px;"></div>
        <div style="font-size:13px;color:#666;word-break:break-all; margin-bottom: 15px;">Имя файла: <b>${projectName}</b></div>
        
        <button id="btnFullscreenQr" class="primary" style="width: 100%; padding: 12px; font-size: 16px; background: #0066cc;">🔍 Показать на весь экран</button>
        <div class="hint" style="margin-top:8px">Идеально для показа с планшета или монитора в цеху.</div>
      </div>
      <div class="modal-footer"><button id="btnCloseQrProj2">Закрыть</button></div>
    </div>`;
    document.body.appendChild(modal);

    document.getElementById('qrProjContainer').innerHTML = qrSvg;

    if (isServerAvailable()) {
        fetch('/api/save-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'projects', subfolder: 'Q-KOD', fileName: projectName.replace(/\.json$/i, '') + '.svg', content: qrSvg }),
        }).catch(console.error);
    }

    const close = () => modal.remove();
    document.getElementById('btnCloseQrProj').onclick = close;
    document.getElementById('btnCloseQrProj2').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('btnFullscreenQr').onclick = () => {
        const fsModal = document.createElement('div');
        fsModal.style.cssText = 'position: fixed; inset: 0; background: #000; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;';
        fsModal.innerHTML = `
            <div style="color: #fff; font-size: 24px; margin-bottom: 20px; font-weight: bold; text-align: center;">
                Наведите камеру телефона
            </div>
            <div style="background: #fff; padding: 15px; border-radius: 10px; width: 80vmin; height: 80vmin; max-width: 800px; max-height: 800px;">
                ${qrSvg}
            </div>
            <div style="color: #888; font-size: 16px; margin-top: 20px; text-align: center; word-break: break-all;">
                ${projectName}
            </div>
            <button style="margin-top: 30px; padding: 10px 30px; font-size: 18px; background: #333; color: #fff; border: 1px solid #555; border-radius: 6px;">Закрыть</button>
        `;
        fsModal.onclick = () => fsModal.remove();
        document.body.appendChild(fsModal);
    };
}

export function openQrProjectDialog() {
    const defaultName = (typeof getCurrentProjectName === 'function' && getCurrentProjectName())
        ? getCurrentProjectName()
        : (typeof buildDefaultFileName === 'function' ? buildDefaultFileName() : `PR01.dxfnest.json`);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
    <div class="modal-window" style="width:520px; max-width:95vw">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📱 QR-код проекта</span>
        <button class="close-btn" id="qpClose" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label for="qpName" style="font-weight:600;font-size:13px;color:#333">Имя проекта</label>
          <input id="qpName" type="text" style="width:100%;padding:8px 10px;border:1px solid #bbb;border-radius:4px;font-size:14px;font-family:monospace" autocomplete="off" spellcheck="false">
        </div>
      </div>
      <div class="modal-footer">
        <button id="qpGenerate" class="primary">📱 Сгенерировать QR</button>
        <button id="qpCancel">Отмена</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const inp = modal.querySelector('#qpName');
    // Убираем расширение для отображения
    inp.value = defaultName.replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
    setTimeout(() => { inp.focus(); inp.select(); }, 0);

    const close = () => modal.remove();
    modal.querySelector('#qpClose').onclick = close;
    modal.querySelector('#qpCancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#qpGenerate').onclick = () => {
        let raw = inp.value.trim();
        if (!raw) { inp.focus(); return; }
        const low = raw.toLowerCase();
        // При генерации QR возвращаем расширение, если его нет
        if (!low.endsWith('.dxfnest.json') && !low.endsWith('.json')) raw += '.dxfnest.json';
        close();
        generateProjectQr(raw);
    };
}