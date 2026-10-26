// js/project-io.js
/**
 * Сохранение / загрузка всего проекта в один файл (.dxfnest.json).
 *
 * Контракт с main.js:
 *   window.ProjectHooks = {
 *     collect(): object,          — вернуть полное состояние проекта
 *     restore(state): Promise<void> — восстановить состояние
 *   }
 *
 * Формат файла:
 * {
 *   "app": "dxf-nesting",
 *   "version": 1,
 *   "savedAt": "2026-...",
 *   "state": { ...то, что вернул collect()... }
 * }
 */

const APP_ID = 'dxf-nesting';
const SUPPORTED_VERSION = 1;
const FILE_SUFFIX = '.dxfnest.json';

export function initProjectIO(){
  const btnSave = document.getElementById('btnSaveProject');
  const btnLoad = document.getElementById('btnLoadProject');
  const fileInput = document.getElementById('projectFileInput');

  btnSave?.addEventListener('click', onSave);
  btnLoad?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', onFileChosen);
}

function getHooks(){
  const h = window.ProjectHooks;
  if(!h || typeof h.collect !== 'function' || typeof h.restore !== 'function'){
    alert(
      'Сохранение/загрузка проекта не подключены.\n\n' +
      'В main.js задайте window.ProjectHooks = { collect, restore }.'
    );
    return null;
  }
  return h;
}

/* ============================== SAVE ============================== */

function onSave(){
  const h = getHooks();
  if(!h) return;
  try {
    const state = h.collect();
    if(!state || typeof state !== 'object'){
      throw new Error('collect() вернул пустое состояние');
    }

    const envelope = {
      app: APP_ID,
      version: SUPPORTED_VERSION,
      savedAt: new Date().toISOString(),
      state,
    };

    const json = JSON.stringify(envelope);
    const sizeMb = (new Blob([json]).size / 1024 / 1024).toFixed(2);

    if(sizeMb > 50 && !confirm(
      `Размер файла ~${sizeMb} МБ.\nСохранение может занять время. Продолжить?`
    )) return;

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch(err){
    console.error('[ProjectIO] save failed:', err);
    alert('Ошибка сохранения проекта:\n' + (err.message || err));
  }
}

function buildFileName(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  return `project_${ts}${FILE_SUFFIX}`;
}

/* ============================== LOAD ============================== */

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
    if(!confirm(
      `Файл создан в более новой версии (${envelope.version} > ${SUPPORTED_VERSION}).\n` +
      'Возможны ошибки. Продолжить?'
    )) return;
  }
  if(!confirm('Текущий проект будет заменён. Продолжить?')) return;

  try {
    await h.restore(envelope.state);
  } catch(err){
    console.error('[ProjectIO] restore failed:', err);
    alert('Ошибка загрузки проекта:\n' + (err.message || err));
  }
}