// js/finance.js
import { setStatus } from './utils.js';

const FINANCE_KEY = 'raskladka.finance.v1';

// Значения по умолчанию
const DEFAULT_FINANCE = {
  materialPrice: 0,   // руб/м2
  kgPrice: 0,         // руб/кг (ДОБАВЛЕНО)
  machineHour: 0,     // руб/час
  piercePrice: 0,     // руб/шт
  cutPrice: 0         // руб/метр
};

export function getFinanceParams() {
  try {
    const raw = localStorage.getItem(FINANCE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FINANCE, ...parsed };
    }
  } catch (_) {}
  return { ...DEFAULT_FINANCE };
}

export function saveFinanceParams(params) {
  try {
    localStorage.setItem(FINANCE_KEY, JSON.stringify(params));
  } catch (_) {}
}

export function openFinanceModal() {
  const params = getFinanceParams();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-window" style="width:520px">
      <div class="modal-header" style="background:#eaf9ec;border-bottom-color:#9ed5a4;color:#1a6a25">
        <span style="font-size:18px;">💰 Экономика и финансы</span>
        <button class="close-btn" id="finClose" style="color:#1a6a25;font-size:24px;">✕</button>
      </div>
      <div class="modal-body">
        <div class="hint" style="margin-bottom:15px; color:#555; font-size:15px;">
          Введите актуальные цены для расчета себестоимости раскроя.<br>
          Если какой-то параметр вам не нужен, оставьте <b>0</b>.
        </div>
        
        <div class="row" style="margin-bottom:12px">
          <label style="flex:1; font-size:16px; font-weight:500;">Цена металла (руб/м²)</label>
          <input id="finMaterial" type="number" min="0" step="10" value="${params.materialPrice}" style="font-size:18px; padding:8px; width:130px;">
        </div>

        <!-- ═══ НОВОЕ ПОЛЕ: ЦЕНА ЗА КГ ═══ -->
        <div class="row" style="margin-bottom:12px; background:#eaf4ff; padding:6px; border-radius:4px;">
          <label style="flex:1; font-size:16px; font-weight:500; color:#004a99;">Цена металла (руб/кг)</label>
          <input id="finKg" type="number" min="0" step="1" value="${params.kgPrice}" style="font-size:18px; padding:8px; width:130px; border-color:#4a90d9;">
        </div>
        
        <div class="row" style="margin-bottom:12px">
          <label style="flex:1; font-size:16px; font-weight:500;">Работа станка (руб/час)</label>
          <input id="finMachine" type="number" min="0" step="50" value="${params.machineHour}" style="font-size:18px; padding:8px; width:130px;">
        </div>
        
        <div class="row" style="margin-bottom:12px">
          <label style="flex:1; font-size:16px; font-weight:500;">Стоимость 1 врезки (руб/шт)</label>
          <input id="finPierce" type="number" min="0" step="0.5" value="${params.piercePrice}" style="font-size:18px; padding:8px; width:130px;">
        </div>
        
        <div class="row" style="margin-bottom:12px">
          <label style="flex:1; font-size:16px; font-weight:500;">Стоимость 1 метра реза (руб/м)</label>
          <input id="finCut" type="number" min="0" step="1" value="${params.cutPrice}" style="font-size:18px; padding:8px; width:130px;">
        </div>

      </div>
      <div class="modal-footer" style="padding:15px;">
        <button id="finSave" class="primary" style="background:#1a6a25;border-color:#114d19;font-size:16px; padding:8px 20px;">💾 Сохранить</button>
        <button id="finCancel" style="font-size:16px; padding:8px 20px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  
  modal.querySelector('#finClose').onclick = close;
  modal.querySelector('#finCancel').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#finSave').onclick = () => {
    const newParams = {
      materialPrice: parseFloat(modal.querySelector('#finMaterial').value) || 0,
      kgPrice: parseFloat(modal.querySelector('#finKg').value) || 0, // Сохраняем цену за кг
      machineHour: parseFloat(modal.querySelector('#finMachine').value) || 0,
      piercePrice: parseFloat(modal.querySelector('#finPierce').value) || 0,
      cutPrice: parseFloat(modal.querySelector('#finCut').value) || 0,
    };
    
    saveFinanceParams(newParams);
    close();
    setStatus('💰 Настройки финансов сохранены');
    
    // Обновляем отчет, чтобы новые цены сразу применились
    import('./report/report.js').then(m => m.updateReport()).catch(() => {});
  };
}