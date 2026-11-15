// js/dialogs/shipment-settings.js

const STORAGE_KEY = 'raskladka.shipmentProfiles.v1';
const LAST_KEY = 'raskladka.shipmentLastState.v1';
const LAST_PROFILE_KEY = 'raskladka.lastShipmentProfile.v1';

// Получить все сохранённые профили
export function getShipmentProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

// Сохранить профиль по имени
export function saveProfile(name, checkboxIds) {
  const profiles = getShipmentProfiles();
  const settings = {};
  for (const id of checkboxIds) {
    const el = document.getElementById(id);
    if (el) settings[id] = el.checked;
  }
  profiles[name] = settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) { console.warn('Не удалось сохранить профиль:', e); }
}

// Загрузить профиль по имени
export function loadProfile(name, checkboxIds) {
  const profiles = getShipmentProfiles();
  const settings = profiles[name];
  if (!settings) return;
  for (const id of checkboxIds) {
    const el = document.getElementById(id);
    if (el && settings.hasOwnProperty(id)) {
      el.checked = settings[id];
    }
  }
}

// Удалить профиль
export function deleteProfile(name) {
  const profiles = getShipmentProfiles();
  if (profiles[name]) {
    delete profiles[name];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) { console.warn('Не удалось удалить профиль:', e); }
  }
}

// Сохранить последнее состояние (для запоминания при перезапуске)
export function saveLastState(checkboxIds) {
  const settings = {};
  for (const id of checkboxIds) {
    const el = document.getElementById(id);
    if (el) settings[id] = el.checked;
  }
  try { localStorage.setItem(LAST_KEY, JSON.stringify(settings)); } catch (_) {}
}

// Загрузить последнее состояние
export function loadLastState(checkboxIds) {
  let saved = {};
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (_) {}

  for (const id of checkboxIds) {
    const el = document.getElementById(id);
    if (el && saved.hasOwnProperty(id)) {
      el.checked = saved[id];
    }
  }
}

// Запомнить, какой профиль был выбран последним
export function saveLastSelectedProfile(name) {
  try {
    localStorage.setItem(LAST_PROFILE_KEY, name || '');
  } catch (_) {}
}

// Получить имя последнего выбранного профиля
export function getLastSelectedProfile() {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY) || '';
  } catch (_) { return ''; }
}