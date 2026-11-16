// js/help/help.js
import { HELP_HTML_TEMPLATE, HELP_STYLES, renderContent } from './help-content.js';

let initialized = false;

export function initHelp() {
  if (initialized) return;
  initialized = true;

  // 1. Вставляем стили
  if (!document.getElementById('helpStyles')) {
    const style = document.createElement('style');
    style.id = 'helpStyles';
    style.textContent = HELP_STYLES;
    document.head.appendChild(style);
  }

  // 2. Создаем модалку
  let modal = document.getElementById('helpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'helpModal';
    modal.style.zIndex = '3000';
    modal.innerHTML = HELP_HTML_TEMPLATE;
    document.body.appendChild(modal);

    // Привязка кнопок меню
    modal.querySelectorAll('.help-tab-btn').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // Кнопка закрытия
    modal.querySelector('#btnCloseHelp').onclick = closeHelpModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeHelpModal(); });

    // ═══ КНОПКА СОХРАНЕНИЯ В PDF ═══
    const btnPdf = modal.querySelector('#btnPrintHelp');
    if (btnPdf) {
      btnPdf.onclick = () => {
        generateHelpPdf();
      };
    }
  }

  // 3. Привязка кнопки справки в верхней панели (если она есть)
  const btnHelp = document.getElementById('btnOpenHelp');
  if (btnHelp) btnHelp.onclick = openHelpModal;

  // 4. Горячая клавиша F1
  document.addEventListener('keydown', e => {
    if (e.key === 'F1') {
      e.preventDefault();
      openHelpModal();
    }
  });
}

function switchTab(tabId) {
  const modal = document.getElementById('helpModal');
  if (!modal) return;

  modal.querySelectorAll('.help-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.style.background = '#fff';
      btn.style.borderLeftColor = '#004a99';
      btn.style.color = '#004a99';
      btn.style.fontWeight = 'bold';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderLeftColor = 'transparent';
      btn.style.color = '#333';
      btn.style.fontWeight = 'normal';
    }
  });
  renderContent(tabId);
}

export function openHelpModal() {
  const modal = document.getElementById('helpModal');
  if (modal) {
    modal.classList.add('active');
    // По умолчанию открываем вкладку "Горячие клавиши"
    const firstBtn = modal.querySelector('.help-tab-btn[data-tab="hotkeys"]');
    if (firstBtn) firstBtn.click();
  }
}

export function closeHelpModal() {
  const modal = document.getElementById('helpModal');
  if (modal) modal.classList.remove('active');
}

// ═══ ГЕНЕРАЦИЯ PDF ИЗ СПРАВКИ ═══
async function generateHelpPdf() {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
    alert('Библиотека для PDF не загружена. Проверьте подключение jspdf.umd.min.js.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Получаем HTML-контент текущей вкладки
  const contentEl = document.getElementById('helpContent');
  if (!contentEl) return;

  // Временный контейнер для рендера (стили для PDF)
  const tempWrap = document.createElement('div');
  tempWrap.style.cssText = 'position:absolute; left:-9999px; top:0; width:190mm; background:#fff; padding:0; margin:0; font-family:Arial, sans-serif; color:#000; font-size:11pt; line-height:1.5;';
  
  // Копируем стили таблиц из HELP_STYLES для корректного рендера
  tempWrap.innerHTML = `
    <style>
      .help-table { width:100%; border-collapse:collapse; margin-top:10px; font-size:10pt; }
      .help-table th { background:#eaf4ff; color:#004a99; text-align:left; padding:6px 8px; border:1px solid #c9e0f5; }
      .help-table td { padding:4px 8px; border:1px solid #e0e0e0; }
      .help-table tr:nth-child(even) { background:#fafafa; }
      .help-key { display:inline-block; background:#fff; border:1px solid #bbb; border-bottom-width:2px; border-radius:4px; padding:1px 6px; font-family:monospace; font-weight:bold; font-size:10pt; color:#333; }
      .help-h2 { color:#004a99; font-size:14pt; margin-top:0; margin-bottom:10px; border-bottom:2px solid #c9e0f5; padding-bottom:4px; }
      .help-h3 { color:#555; font-size:12pt; margin:12px 0 4px; }
      .help-note { background:#fff8e1; border-left:4px solid #f0c419; padding:6px 10px; margin:8px 0; font-size:10pt; color:#6a4c00; }
      ul { margin: 4px 0 4px 20px; padding: 0; }
      li { margin-bottom: 2px; }
      p { margin: 4px 0; }
    </style>
    ${contentEl.innerHTML}
  `;
  document.body.appendChild(tempWrap);

  try {
    // Генерируем PDF из HTML
    await doc.html(tempWrap, {
      callback: function (doc) {
        // Сохраняем файл
        doc.save('Справка_Раскладка_DXF.pdf');
        document.body.removeChild(tempWrap);
      },
      x: 10,
      y: 10,
      width: 190,
      windowWidth: 800,
      autoPaging: 'text',
      margin: [10, 10, 10, 10]
    });
  } catch (e) {
    console.error('Ошибка генерации PDF:', e);
    alert('Не удалось создать PDF: ' + e.message);
    if (tempWrap.parentNode) document.body.removeChild(tempWrap);
  }
}