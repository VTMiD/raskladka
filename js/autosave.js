import { $, setStatus } from './utils.js';

const KEY = 'raskladka.autosave.v1';
const MAX_SIZE = 4 * 1024 * 1024;   // 4 МБ — предел для localStorage
const INTERVAL_MS = 15000;           // автосохранение каждые 15 сек
const DEBOUNCE_MS = 2000;            // через 2 сек после pushHistory

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
  if (!pending) return false;
  if (!window.ProjectHooks || typeof window.ProjectHooks.restore !== 'function') return false;
  try {
    await window.ProjectHooks.restore(pending.state);
    _lastSavedAt = pending.savedAt;
    _lastError = null;
    updateIndicator();
    return true;
  } catch (e){
    console.error('[autosave] restore failed:', e);
    return false;
  }
}

export function discardAutosave(){
  try { localStorage.removeItem(KEY); } catch (e){}
  _lastSavedAt = 0;
  _lastError = null;
  updateIndicator();
}

function _showBanner(savedAt){
  const el = document.getElementById('autosaveBanner');
  if (!el) return;
  const dateEl = document.getElementById('autosaveBannerDate');
  if (dateEl) dateEl.textContent = _fmtTime(savedAt);
  el.style.display = 'flex';
}

function _hideBanner(){
  const el = document.getElementById('autosaveBanner');
  if (!el) return;
  el.style.display = 'none';
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

  const pending = hasPendingAutosave();
  if (pending) _showBanner(pending.savedAt);

  const btnRestore = document.getElementById('btnAutosaveRestore');
  if (btnRestore && !btnRestore._bound){
    btnRestore._bound = true;
    btnRestore.addEventListener('click', async () => {
      const ok = await restoreFromAutosave();
      _hideBanner();
      setStatus(ok ? 'Проект восстановлен из автосохранения' : 'Не удалось восстановить автосохранение');
    });
  }
  const btnDiscard = document.getElementById('btnAutosaveDiscard');
  if (btnDiscard && !btnDiscard._bound){
    btnDiscard._bound = true;
    btnDiscard.addEventListener('click', () => {
      if (!confirm('Удалить автосохранение? Текущая работа останется открытой.')) return;
      discardAutosave();
      _hideBanner();
      setStatus('Автосохранение удалено');
    });
  }
  const btnClose = document.getElementById('btnAutosaveClose');
  if (btnClose && !btnClose._bound){
    btnClose._bound = true;
    btnClose.addEventListener('click', () => {
      _hideBanner();
    });
  }

  updateIndicator();
}