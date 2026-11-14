// js/sheet-stamp-settings.js
// Настройки данных для штампа ЕСКД

const KEY = 'raskladka.stampSettings.v1';

const DEFAULTS = {
  developer: '',
  checker: '',
  techControl: '',
  normControl: '',
  approver: '',
  material: 'Ст3',
  organization: 'JS_CAM',
  litera: 'О',
};

export function getStampSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch (_) {}
  return { ...DEFAULTS };
}

export function saveStampSettings(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch (_) {}
}

export function getStampData() {
  return getStampSettings();
}

export function openStampSettingsModal() {
  const settings = getStampSettings();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.id = 'stampSettingsModal';
  modal.innerHTML = `
    <div class="modal-window" style="width:520px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📐 Данные для штампа ЕСКД</span>
        <button class="close-btn" id="stampClose" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div class="hint" style="margin-bottom:10px;padding:6px 10px;background:#fff8e1;border:1px solid #f0d9a8;border-radius:4px;color:#8a5a00;font-size:12px">
          💡 Эти данные подставляются в штамп <b>всех чертежей деталей</b>.<br>
          Масса рассчитывается автоматически (площадь × толщина × 7.85 г/см³).
        </div>

        <div class="row"><label>Разраб.</label>
          <input id="stampDeveloper" type="text" placeholder="Иванов И.И." style="flex:1">
        </div>
        <div class="row"><label>Пров.</label>
          <input id="stampChecker" type="text" placeholder="Петров П.П." style="flex:1">
        </div>
        <div class="row"><label>Т.контр.</label>
          <input id="stampTechControl" type="text" placeholder="Сидоров С.С." style="flex:1">
        </div>
        <div class="row"><label>Н.контр.</label>
          <input id="stampNormControl" type="text" placeholder="Кузнецов К.К." style="flex:1">
        </div>
        <div class="row"><label>Утв.</label>
          <input id="stampApprover" type="text" placeholder="Директоров Д.Д." style="flex:1">
        </div>

        <div class="row"><label>Материал</label>
          <input id="stampMaterial" type="text" placeholder="Ст3, 09Г2С, AISI 304…" style="flex:1">
        </div>

        <div class="row"><label>Организация</label>
          <input id="stampOrganization" type="text" placeholder="JS_CAM" style="flex:1">
        </div>

        <div class="row"><label>Лит.</label>
          <select id="stampLitera" style="flex:1">
            <option value="—">— (без литеры)</option>
            <option value="У">У (учебный)</option>
            <option value="О">О (опытный)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button id="stampSave" class="primary">💾 Сохранить</button>
        <button id="stampCancel">Отмена</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const set = (id, v) => { const el = modal.querySelector(id); if (el) el.value = v || ''; };
  set('#stampDeveloper', settings.developer);
  set('#stampChecker', settings.checker);
  set('#stampTechControl', settings.techControl);
  set('#stampNormControl', settings.normControl);
  set('#stampApprover', settings.approver);
  set('#stampMaterial', settings.material);
  set('#stampOrganization', settings.organization);
  const litSel = modal.querySelector('#stampLitera');
  if (litSel) litSel.value = settings.litera || 'О';

  const close = () => modal.remove();
  modal.querySelector('#stampClose').onclick = close;
  modal.querySelector('#stampCancel').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#stampSave').onclick = () => {
    const get = (id) => {
      const el = modal.querySelector(id);
      return el ? String(el.value || '').trim() : '';
    };
    saveStampSettings({
      developer: get('#stampDeveloper'),
      checker: get('#stampChecker'),
      techControl: get('#stampTechControl'),
      normControl: get('#stampNormControl'),
      approver: get('#stampApprover'),
      material: get('#stampMaterial') || 'Ст3',
      organization: get('#stampOrganization') || 'JS_CAM',
      litera: (modal.querySelector('#stampLitera')?.value) || 'О',
    });
    close();
    document.dispatchEvent(new CustomEvent('app-status', { detail: '✅ Данные штампа сохранены' }));
  };
}