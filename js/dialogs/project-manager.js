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
          ${currentProject ? (() => {
            let currClean = currentProject.replace(/\.dxfnest\.json$/i, '');
            const cm = currClean.match(/^(PR\d+)(D\d+)(Sm\d+)(L\d+)?(T[\d.]+)?(Dt\d+)?$/i);
            if (cm) currClean = [cm[1], cm[2], cm[3], cm[4], cm[5], cm[6]].filter(Boolean).join(' ');
            return `<button id="spCurrent" class="small" style="padding:4px 10px; font-size:12px;">↩ Текущий: ${currClean}</button>`;
          })() : ''}
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
    
    // Функция для добавления пробелов для удобства чтения (PR01 D11112026 Sm1...)
    const applyDisplayFormat = (str) => {
        const m = str.match(/^(PR\d+)(D\d+)(Sm\d+)(L\d+)?(T[\d.]+)?(Dt\d+)?$/i);
        if (m) {
            return [m[1], m[2], m[3], m[4], m[5], m[6]].filter(Boolean).join(' ');
        }
        return str;
    };

    // Устанавливаем имя с пробелами
    inpName.value = applyDisplayFormat(defaultNameClean);
    setTimeout(() => { inpName.focus(); inpName.select(); }, 0);

    inpNum.addEventListener('input', () => {
        let n = parseInt(inpNum.value, 10);
        if (isNaN(n) || n < 1) n = 1;
        inpNum.value = String(n).padStart(2, '0');
        if (typeof buildProjectName === 'function') {
            let newName = buildProjectName(n);
            newName = newName.replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
            // Добавляем пробелы для отображения
            inpName.value = applyDisplayFormat(newName);
        }
    });

    const close = () => modal.remove();
    modal.querySelector('#spClose').onclick = close;
    modal.querySelector('#spCancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#spSave').onclick = () => {
        let raw = inpName.value.trim();
        if (!raw) { inpName.focus(); return; }
        
        // ═══ УБИРАЕМ ПРОБЕЛЫ ПЕРЕД СОХРАНЕНИЕМ ═══
        raw = raw.replace(/\s+/g, '');
        
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

/**
 * Красивое окно выбора проекта из папки с поиском по имени и деталям.
 */
export async function openProjectPicker() {
  if (!isServerAvailable()) {
    alert('Для просмотра списка проектов нужен запущенный локальный сервер.');
    return;
  }

  // Показываем индикатор загрузки
  const loadingModal = document.createElement('div');
  loadingModal.className = 'modal-overlay active';
  loadingModal.innerHTML = `
    <div class="modal-window" style="width:500px; text-align:center; padding: 20px;">
      <div class="spinner" style="margin: 0 auto 10px;"></div>
      <div>Загрузка списка проектов...</div>
    </div>`;
  document.body.appendChild(loadingModal);

  try {
    const res = await fetch('/api/list-projects');
    const data = await res.json();
    
    loadingModal.remove();

    if (!data.ok || !data.files || !data.files.length) {
      alert('В папке «Проекты» пока нет сохранённых файлов.');
      return;
    }

    const files = data.files;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    
    // Генерируем HTML для списка
    const listHtml = files.map((f, idx) => {
      // Форматируем имя для отображения (с пробелами)
      let cleanName = f.name.replace(/\.dxfnest\.json$/i, '').replace(/\.json$/i, '');
      if (!cleanName.includes(' ')) {
        const m = cleanName.match(/^(PR\d+)(D\d+)(Sm\d+)(L\d+)?(T[\d.]+)?(Dt\d+)?$/i);
        if (m) cleanName = [m[1], m[2], m[3], m[4], m[5], m[6]].filter(Boolean).join(' ');
      }
      
      // Форматируем дату
      const d = new Date(f.mtime);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      return `
        <div class="project-item" data-name="${f.name}" data-date="${dateStr}" data-parts="" style="display:flex; justify-content:space-between; align-items:center; padding:10px 15px; border-bottom:1px solid #eee; cursor:pointer; transition: background 0.15s;">
          <div>
            <div class="project-title" style="font-weight:bold; color:#004a99; font-family:monospace; font-size:14px;">${cleanName}</div>
            <div class="project-details" style="font-size:11px; color:#888;">${dateStr}</div>
          </div>
          <button class="small primary" style="background:#eaf4ff; color:#004a99; border-color:#4a90d9; pointer-events:none;">Открыть</button>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="modal-window" style="width:650px; max-width:95vw;">
        <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
          <span>📂 Выберите проект для открытия</span>
          <button class="close-btn" id="ppClose" style="color:#004a99">✕</button>
        </div>
        <div class="modal-body" style="padding: 0;">
          <div style="padding: 10px 15px; background: #f9f9f9; border-bottom: 1px solid #ddd; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; gap:8px;">
              <input type="text" id="ppSearchName" placeholder="🔍 Поиск по имени или дате..." style="flex:1; padding:8px 10px; border:1px solid #bbb; border-radius:4px; font-size:14px; box-sizing:border-box;">
              <input type="text" id="ppSearchPart" placeholder="🔍 Поиск по детали (номер)..." style="flex:1; padding:8px 10px; border:1px solid #bbb; border-radius:4px; font-size:14px; box-sizing:border-box;">
            </div>
            <div style="font-size:11px; color:#888; text-align:right;">Шаблонный поиск: «24» найдёт 240, 241, 243...</div>
          </div>
          <div id="ppList" style="max-height: 400px; overflow-y: auto;">
            ${listHtml}
          </div>
        </div>
        <div class="modal-footer">
          <button id="ppCancel">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#ppClose').onclick = close;
    modal.querySelector('#ppCancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // ═══ АСИНХРОННАЯ ЗАГРУЗКА ДЕТАЛЕЙ ДЛЯ ПОИСКА ═══
    // Запускаем в фоне, чтобы не блокировать интерфейс
    (async () => {
      for (const item of modal.querySelectorAll('.project-item')) {
        const fileName = item.dataset.name;
        try {
          const res = await fetch('/api/find-project?name=' + encodeURIComponent(fileName));
          if (res.ok) {
            const data = await res.json();
            const envelope = JSON.parse(data.content);
            const jobs = envelope.state?.jobs || [];
            const parts = jobs[0]?.parts || [];
            // Сохраняем список деталей в data-атрибут для быстрого поиска
            const partNames = parts.map(p => p.name.toLowerCase()).join(' ');
            item.dataset.parts = partNames;
          }
        } catch (_) {}
      }
    })();

    // Обработка клика по проекту
    modal.querySelectorAll('.project-item').forEach(item => {
      item.onmouseover = () => item.style.background = '#eaf4ff';
      item.onmouseout = () => item.style.background = '#fff';
      
      item.onclick = async () => {
        const fileName = item.dataset.name;
        close();
        setStatus(`Загрузка проекта: ${fileName}...`);
        const dummyEl = document.createElement('div');
        dummyEl.style.display = 'none';
        document.body.appendChild(dummyEl);
        await loadProjectFromServer(fileName, dummyEl);
        dummyEl.remove();
      };
    });

    // ═══ ЛОГИКА ФИЛЬТРАЦИИ ═══
    const searchNameInput = modal.querySelector('#ppSearchName');
    const searchPartInput = modal.querySelector('#ppSearchPart');

    const applyFilters = () => {
      const qName = searchNameInput.value.toLowerCase().trim();
      const qPart = searchPartInput.value.toLowerCase().trim();
      
      modal.querySelectorAll('.project-item').forEach(item => {
        const title = item.querySelector('.project-title').textContent.toLowerCase();
        const date = item.dataset.date.toLowerCase();
        const parts = (item.dataset.parts || '').toLowerCase();

        const matchName = !qName || title.includes(qName) || date.includes(qName);
        const matchPart = !qPart || parts.includes(qPart);

        item.style.display = (matchName && matchPart) ? 'flex' : 'none';
      });
    };

    searchNameInput.oninput = applyFilters;
    searchPartInput.oninput = applyFilters;

  } catch (err) {
    if (loadingModal.parentNode) loadingModal.remove();
    alert('Ошибка загрузки списка проектов: ' + err.message);
  }
}