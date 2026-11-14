export const $ = id => document.getElementById(id);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function pad2(n){ return String(n).padStart(2,'0'); }
export function makeTimestamp(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}
export function todayIso(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Обновленный setStatus, который шлет сигнал в main.js
export function setStatus(msg) {
  const el = $('status');
  if (el) el.textContent = msg || '';
  if (msg) {
    document.dispatchEvent(new CustomEvent('app-status', { detail: msg }));
  }
}

// ════════════════════════════════════════════════════════════════
// Доступность локального сервера (server.js)
// На хостинге без запущенного server.js часть функций недоступна.
// ════════════════════════════════════════════════════════════════
export const SERVER_TIP = 'Работает только при запущенном локальном сервере (server.js)';
let __serverAvailable = null;

export async function probeServer() {
  if (__serverAvailable !== null) return __serverAvailable;
  try {
    const res = await fetch('/api/ping', { cache: 'no-store' });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Важно: некоторые хостинги отдают index.html с кодом 200 на любой путь
    if (!res.ok || !ct.includes('application/json')) throw new Error('no-server');
    const data = await res.json();
    __serverAvailable = !!(data && data.ok);
  } catch (_) {
    __serverAvailable = false;
  }
  return __serverAvailable;
}

export function isServerAvailable() {
  return __serverAvailable === true;
}

// Помечает серверные контролы атрибутом data-server-only: без сервера они
// блокируются (клик не срабатывает, появляется подсказка на наведении).
export function applyServerGating(root = document) {
  const ok = isServerAvailable();
  root.querySelectorAll('[data-server-only]').forEach(el => {
    if (ok) {
      el.classList.remove('so-disabled');
      el.removeAttribute('aria-disabled');
      if (el.dataset.soOrigTitle !== undefined) el.setAttribute('title', el.dataset.soOrigTitle);
      return;
    }
    el.classList.add('so-disabled');
    el.setAttribute('aria-disabled', 'true');
    if (el.dataset.soOrigTitle === undefined) {
      el.dataset.soOrigTitle = el.getAttribute('title') || '';
    }
    el.setAttribute('title', '⚠ ' + SERVER_TIP + (el.dataset.serverTip ? '. ' + el.dataset.serverTip : ''));
  });

  if (!applyServerGating._bound) {
    applyServerGating._bound = true;
    // Capture-фаза: перехватываем клик по серверному элементу до его обработчиков
    document.addEventListener('click', (e) => {
      if (isServerAvailable()) return;
      const t = e.target;
      const hit = (t && t.closest) ? t.closest('[data-server-only]') : null;
      if (!hit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setStatus('⚠ ' + SERVER_TIP + (hit.dataset.serverTip ? '. ' + hit.dataset.serverTip : ''));
    }, true);
  }
}

// ─── Имена отчётов (запоминание последнего) ────────────────────
const REPORT_NAMES_KEY = 'raskladka.reportNames.v1';

export function getSavedReportName(key, fallback){
  try {
    const all = JSON.parse(localStorage.getItem(REPORT_NAMES_KEY) || '{}');
    return all[key] || fallback;
  } catch(_){ return fallback; }
}

export function saveReportName(key, name){
  try {
    const all = JSON.parse(localStorage.getItem(REPORT_NAMES_KEY) || '{}');
    all[key] = name;
    localStorage.setItem(REPORT_NAMES_KEY, JSON.stringify(all));
  } catch(_){}
}

// ─── Модальный диалог: имя файла + путь назначения ───────────
export function askFileNameWithPath({ title, defaultName, destinationHint, storageKey, saveLabel }) {
  return new Promise(resolve => {
    const saved = storageKey ? getSavedReportName(storageKey, defaultName) : defaultName;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-window" style="width:560px">
        <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
          <span>${title}</span>
          <button class="close-btn" data-role="close" style="color:#004a99">✕</button>
        </div>
        <div class="modal-body">
          ${destinationHint ? `<div class="hint" style="margin-bottom:8px;padding:6px 10px;background:#eaf9ec;border:1px solid #9ed5a4;border-radius:4px;color:#1a6a25">
            📁 <b>Куда сохранится:</b><br><span style="font-family:monospace;font-size:12px;word-break:break-all">${destinationHint}</span>
          </div>` : ''}
          <label style="font-weight:600;font-size:13px;color:#333;display:block;margin-bottom:4px">Имя файла (без расширения .dxf)</label>
          <input data-role="input" type="text"
                 style="width:100%;padding:8px 10px;border:1px solid #bbb;border-radius:4px;
                        font-size:13px;font-family:monospace;box-sizing:border-box"
                 autocomplete="off" spellcheck="false">
        </div>
        <div class="modal-footer">
          <button data-role="save" class="primary">${saveLabel || '💾 Сохранить'}</button>
          <button data-role="cancel">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const inp = modal.querySelector('[data-role="input"]');
    inp.value = saved;
    setTimeout(() => { inp.focus(); inp.select(); }, 0);

    // live-транслит в процессе ввода + финальный sanitize на blur
    attachLiveTranslit(inp);
    attachTranslitOnBlur(inp);

    const escH = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', escH);

    const close = (result) => {
      modal.remove();
      document.removeEventListener('keydown', escH);
      resolve(result);
    };

    modal.querySelector('[data-role="close"]').onclick = () => close(null);
    modal.querySelector('[data-role="cancel"]').onclick = () => close(null);
    modal.addEventListener('click', e => { if (e.target === modal) close(null); });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('[data-role="save"]').click(); }
    });

    modal.querySelector('[data-role="save"]').onclick = () => {
      let v = String(inp.value || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
      if (!v) { inp.focus(); return; }
      if (storageKey) saveReportName(storageKey, v);
      close(v);
    };
  });
}

// ─── Чтение сохранённых путей + подсказка «куда сохранится» ──
export function getSavedPaths(){
  try {
    const raw = localStorage.getItem('raskladka.paths.v1');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch(_){ return {}; }
}

export function makeDestinationHint(category, subfolder){
  const p = getSavedPaths();
  const base = p[category] || `(путь «${category}» не задан в ⚙ → Настройки хранения данных)`;
  return subfolder ? `${base.replace(/[\\/]$/, '')}\\${subfolder}` : base;
}

// ─── Скачивание файла браузером ─────────────────────────────
export function downloadBlob(blob, fileName, revokeDelayMs = 2000) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);
}

// ─── Сохранение файла через локальный сервер ────────────────
export async function saveFileToServer(category, subfolder, fileName, content, isBase64) {
  // Без сервера не стучимся в сеть — вызывающий код уйдёт в браузерный fallback
  if (!isServerAvailable()) return { ok: false, error: 'no-server' };
  try {
    const res = await fetch('/api/save-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        subfolder: subfolder || '',
        fileName,
        content,
        isBase64: !!isBase64,
      }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (res.ok && data && data.ok) {
      return { ok: true, name: fileName, viaServer: true, path: data.path };
    }
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════
// Транслитерация и нормализация имён файлов
// ════════════════════════════════════════════════════════════════

const TRANSLIT_TABLE = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
  'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
  'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y',
  'К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F',
  'Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
};

export function transliterate(str) {
  if (!str) return '';
  let out = '';
  for (const ch of String(str)) {
    const t = TRANSLIT_TABLE[ch];
    out += (t !== undefined ? t : ch);
  }
  return out;
}

export function sanitizeFileName(str, maxLen = 120, doTransliterate = true) {
  let s = String(str || '');
  if (doTransliterate) s = transliterate(s);
  s = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  s = s.replace(/\s+/g, '_').replace(/_+/g, '_');
  s = s.replace(/^[._]+|[._]+$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  if (!s) s = 'file';
  return s;
}

/**
 * Live-транслит для input: при каждом нажатии заменяет кириллицу на латиницу
 * с сохранением позиции курсора.
 */
export function attachLiveTranslit(input) {
  if (!input || input._translitLiveBound) return;
  input._translitLiveBound = true;

  input.addEventListener('input', () => {
    const raw = String(input.value || '');
    if (!/[а-яёА-ЯЁ]/.test(raw)) return; // нет кириллицы — ничего не делаем

    const safe = transliterate(raw);
    const pos = input.selectionStart ?? safe.length;
    const diff = safe.length - raw.length;

    input.value = safe;
    try { input.setSelectionRange(pos + diff, pos + diff); } catch (_) {}
  });
}

/**
 * Привязывает к input финальный sanitize при уходе с поля (blur).
 * Убирает недопустимые символы, схлопывает пробелы, обрезает длину.
 */
export function attachTranslitOnBlur(input) {
  if (!input || input._translitBlurBound) return;
  input._translitBlurBound = true;
  input.addEventListener('blur', () => {
    const v = String(input.value || '').trim();
    if (!v) return;
    const safe = sanitizeFileName(v, 100);
    if (safe !== v) input.value = safe;
  });
}