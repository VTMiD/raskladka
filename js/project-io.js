// js/project-io.js
import { setStatus, downloadBlob } from './utils.js';
import { state } from './state.js';

const APP_ID = 'dxf-nesting';
const SUPPORTED_VERSION = 1;
const FILE_SUFFIX = '.dxfnest.json';

let currentProjectName = '';

export function getCurrentProjectName() {
    return currentProjectName;
}

export function setCurrentProjectName(name) {
    currentProjectName = name || '';
}

export function buildProjectName(num) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    
    const dateStr = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
    const numStr = String(num).padStart(2, '0');

    let shift = '1';
    try {
        const raw = localStorage.getItem('raskladka.shift.v1') || '';
        const m = raw.match(/(\d+)/);
        if (m) shift = m[1];
    } catch (_) {}

    let thickness = 3;
    try {
        const tEl = document.getElementById('inThick');
        if (tEl) {
            const v = parseFloat(tEl.value);
            if (isFinite(v)) thickness = Math.round(v * 10) / 10;
        }
    } catch (_) {}

    const sheetCount = (state.sheets || []).length;
    const placedQty = (state.sheets || []).reduce(
        (s, sh) => s + ((sh.placed || []).length), 0
    );

    return `PR${numStr}D${dateStr}Sm${shift}L${sheetCount}T${thickness}Dt${placedQty}${FILE_SUFFIX}`;
}

export function buildDefaultFileName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const todayStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

    let projectNum = 1;
    try {
        const savedData = JSON.parse(localStorage.getItem('raskladka.lastProjectInfo') || '{}');
        if (savedData.date === todayStr && savedData.num > 0) {
            projectNum = savedData.num + 1;
        } else {
            projectNum = 1;
        }
    } catch (_) {
        projectNum = 1;
    }

    return buildProjectName(projectNum);
}

export function initProjectIO(){
  const btnSave = document.getElementById('btnSaveProject');
  const btnLoad = document.getElementById('btnLoadProject');
  const fileInput = document.getElementById('projectFileInput');

  if (btnSave) btnSave.addEventListener('click', onSave);
  if (btnLoad) btnLoad.addEventListener('click', () => fileInput?.click());
  if (fileInput) fileInput.addEventListener('change', onFileChosen);
}

function getHooks(){
  const h = window.ProjectHooks;
  if(!h || typeof h.collect !== 'function' || typeof h.restore !== 'function'){
    alert('Сохранение/загрузка проекта не подключены.\n\nВ main.js задайте window.ProjectHooks = { collect, restore }.');
    return null;
  }
  return h;
}

async function onSave(){
  const h = getHooks();
  if(!h) return;
  try {
    const stateData = h.collect();
    if(!stateData || typeof stateData !== 'object') throw new Error('collect() вернул пустое состояние');

    stateData.layers = state.layers;

    const envelope = {
      app: APP_ID,
      version: SUPPORTED_VERSION,
      savedAt: new Date().toISOString(),
      state: stateData,
    };

    const json = JSON.stringify(envelope);
    const sizeMb = (new Blob([json]).size / 1024 / 1024).toFixed(2);

    if(sizeMb > 50 && !confirm(`Размер файла ~${sizeMb} МБ.\nСохранение может занять время. Продолжить?`)) {
      window.__projectSaveName = null;
      return;
    }

    const fileName = buildFileName();

    try {
      const chk = await fetch('/api/file-exists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'projects', subfolder: '', fileName }),
      });
      if (chk.ok) {
        const j = await chk.json().catch(() => null);
        if (j && j.ok && j.exists) {
          if (!confirm(`Файл «${fileName}» уже существует в папке Проектов.\n\nПерезаписать его?`)) {
            window.__projectSaveName = null;
            setStatus('Сохранение отменено');
            return;
          }
        }
      }
    } catch (_) {}

    try {
      const res = await fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'projects', subfolder: '', fileName, content: json }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          setStatus(`Проект сохранён: ${fileName}`);
          return;
        }
        throw new Error((data && data.error) || 'Сервер не подтвердил сохранение');
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (serverErr) {
      console.warn('[ProjectIO] server save failed:', serverErr);
      const goToSettings = confirm('Не удалось сохранить в папку Проектов.\n\nСкачать проект в папку загрузок браузера как резервную копию?');
      if (goToSettings) {
        downloadLocally(json, fileName);
        setStatus(`Проект скачан: ${fileName}`);
      } else {
        setStatus('');
      }
    }
  } catch(err){
    window.__projectSaveName = null;
    console.error('[ProjectIO] save failed:', err);
    alert('Ошибка сохранения проекта:\n' + (err.message || err));
  }
}

function downloadLocally(json, fileName){
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, fileName, 3000);
}

function buildFileName(){
  if (window.__projectSaveName){
    const n = String(window.__projectSaveName).trim();
    window.__projectSaveName = null;
    if (n){
      const low = n.toLowerCase();
      let finalName;
      if (low.endsWith(FILE_SUFFIX)) finalName = n;
      else if (low.endsWith('.json')) finalName = n;
      else finalName = n + FILE_SUFFIX;
      
      setCurrentProjectName(finalName);
      
      const m = finalName.match(/^PR(\d+)/i) || finalName.match(/(\d+)/);
      if (m && m[1]) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num)) {
              const d = new Date();
              const p = n => String(n).padStart(2, '0');
              const todayStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
              localStorage.setItem('raskladka.lastProjectInfo', JSON.stringify({ date: todayStr, num: num }));
          }
      }
      return finalName;
    }
  }
  const defaultName = buildDefaultFileName();
  setCurrentProjectName(defaultName);
  
  const m = defaultName.match(/^PR(\d+)/i);
  if (m && m[1]) {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const todayStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      localStorage.setItem('raskladka.lastProjectInfo', JSON.stringify({ date: todayStr, num: parseInt(m[1], 10) }));
  }
  return defaultName;
}

async function onFileChosen(e){
  const file = e.target.files?.[0];
  e.target.value = '';
  if(!file) return;

  const h = getHooks();
  if(!h) return;

  let envelope;
  try {
    const text = await file.text();
    envelope = JSON.parse(text);
  } catch(err){
    alert('Не удалось прочитать файл: ' + (err.message || err));
    return;
  }

  if(!envelope || typeof envelope !== 'object' || !envelope.state){
    alert('Файл не похож на проект (нет поля "state").');
    return;
  }
  if(envelope.app && envelope.app !== APP_ID){
    if(!confirm('Файл создан другим приложением. Продолжить?')) return;
  }
  if(typeof envelope.version === 'number' && envelope.version > SUPPORTED_VERSION){
    if(!confirm(`Файл создан в более новой версии (${envelope.version} > ${SUPPORTED_VERSION}).\nВозможны ошибки. Продолжить?`)) return;
  }
  if(!confirm('Текущий проект будет заменён. Продолжить?')) return;

  try {
    if (envelope.state.layers && Array.isArray(envelope.state.layers)) {
      state.layers = envelope.state.layers;
    }
    await h.restore(envelope.state);
    
    setCurrentProjectName(file.name);
    import('./canvas/render.js').then(m => m.draw());
  } catch(err){
    console.error('[ProjectIO] restore failed:', err);
    alert('Ошибка загрузки проекта:\n' + (err.message || err));
  }
}
// ─── Горячие клавиши для сохранения/открытия проекта ───
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

  // Ctrl+S — Сохранить
  if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы') {
    e.preventDefault();
    const btn = document.getElementById('btnSaveProject');
    if (btn) btn.click();
  }

  // Ctrl+O — Открыть
  if (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'щ') {
    e.preventDefault();
    const btn = document.getElementById('btnLoadProject');
    if (btn) btn.click();
  }
});