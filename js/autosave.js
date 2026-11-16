import { $, setStatus } from './utils.js';

const KEY = 'raskladka.autosave.v1';
const MAX_SIZE = 4 * 1024 * 1024;
const INTERVAL_MS = 15000;
const DEBOUNCE_MS = 2000;

let _intervalId = null;
let _debounceId = null;
let _lastSavedAt = 0;
let _lastError = null;

function _fmtTime(ts){
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function _fmtShort(ts){
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function _setIndicator(text, cls){
  const el = document.getElementById('autosaveInfo');
  if (!el) return;
  el.textContent = text;
  el.className = 'autosave-info' + (cls ? ' ' + cls : '');
}

export function updateIndicator(){
  if (_lastError){
    if (_lastError === 'quota')          _setIndicator('⚠ Проект слишком большой', 'warn');
    else if (_lastError === 'unavailable') _setIndicator('Автосохранение недоступно', 'warn');
    else                                 _setIndicator('⚠ Ошибка автосохранения', 'warn');
    return;
  }
  if (_lastSavedAt){
    _setIndicator('💾 Сохранено ' + _fmtShort(_lastSavedAt), 'ok');
  } else {
    _setIndicator('💾 Автосохранение', '');
  }
}

export function saveNow(){
  if (!window.ProjectHooks || typeof window.ProjectHooks.collect !== 'function'){
    _lastError = 'unavailable';
    updateIndicator();
    return false;
  }
  let payload;
  try {
    payload = window.ProjectHooks.collect();
  } catch (e){
    console.warn('[autosave] collect failed:', e);
    _lastError = 'collect';
    updateIndicator();
    return false;
  }
  if (!payload) return false;

  let json;
  try {
    json = JSON.stringify({ savedAt: Date.now(), version: 1, state: payload });
  } catch (e){
    _lastError = 'quota';
    updateIndicator();
    return false;
  }

  if (json.length > MAX_SIZE){
    _lastError = 'quota';
    updateIndicator();
    return false;
  }

  try {
    localStorage.setItem(KEY, json);
  } catch (e){
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) _lastError = 'quota';
    else _lastError = 'unavailable';
    updateIndicator();
    return false;
  }

  _lastSavedAt = Date.now();
  _lastError = null;
  updateIndicator();
  return true;
}

export function scheduleAutosave(){
  if (_debounceId) clearTimeout(_debounceId);
  _debounceId = setTimeout(() => {
    _debounceId = null;
    saveNow();
  }, DEBOUNCE_MS);
}

export function hasPendingAutosave(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.state || !obj.savedAt) return null;
    return { savedAt: obj.savedAt, state: obj.state };
  } catch (e){
    return null;
  }
}

export async function restoreFromAutosave(){
  const pending = hasPendingAutosave();
  if (!pending) {
    alert('Файл автосохранения не найден в памяти браузера.');
    return false;
  }
  if (!window.ProjectHooks || typeof window.ProjectHooks.restore !== 'function') {
    alert('Ошибка: модуль восстановления (ProjectHooks) не подключен.');
    return false;
  }
  try {
    await window.ProjectHooks.restore(pending.state);
    _lastSavedAt = pending.savedAt;
    _lastError = null;
    updateIndicator();
    return true;
  } catch (e){
    console.error('[autosave] restore failed:', e);
    alert('Ошибка при восстановлении автосохранения:\n' + e.message);
    return false;
  }
}

export function discardAutosave(){
  try { localStorage.removeItem(KEY); } catch (e){}
  _lastSavedAt = 0;
  _lastError = null;
  updateIndicator();
}

// ═══ ВСПЛЫВАЮЩЕЕ ОКНО АВТОСОХРАНЕНИЯ ═══
export function showAutosavePopup() {
  const pending = hasPendingAutosave();
  if (!pending) {
    alert('Автосохранение не найдено. Подождите 15 секунд, пока программа его создаст, или внесите изменения в проект.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.style.zIndex = '2000';
  modal.innerHTML = `
    <div class="modal-window" style="width:400px">
      <div class="modal-header" style="background:#fff8e1;border-bottom-color:#f0c419;color:#6a4c00">
        <span>💾 Найдено автосохранение</span>
        <button class="close-btn" id="btnCloseAutoPopup" style="color:#6a4c00">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:15px; margin-bottom:12px; color:#333;">Автосохранение от <b>${_fmtTime(pending.savedAt)}</b></p>
        <p style="font-size:13px; color:#555;">Хотите восстановить проект или удалить автосохранение?</p>
      </div>
      <div class="modal-footer">
        <button id="btnPopupRestore" class="primary">Восстановить</button>
        <button id="btnPopupDiscard" class="danger">Удалить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#btnCloseAutoPopup').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#btnPopupRestore').onclick = async () => {
    close();
    const ok = await restoreFromAutosave();
    if (ok) {
      setStatus('Проект восстановлен из автосохранения');
    }
  };

  modal.querySelector('#btnPopupDiscard').onclick = () => {
    if (!confirm('Удалить автосохранение? Текущая работа останется открытой.')) return;
    close();
    discardAutosave();
    setStatus('Автосохранение удалено');
  };
}

export function initAutosave(){
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
  } catch (e){
    _lastError = 'unavailable';
    updateIndicator();
    return;
  }

  if (_intervalId) clearInterval(_intervalId);
  _intervalId = setInterval(saveNow, INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    try { saveNow(); } catch (e){}
  });

  updateIndicator();
}