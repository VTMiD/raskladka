// js/help/help-content.js

export const HELP_STYLES = `
  .help-table { width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
  .help-table th { background:#eaf4ff; color:#004a99; text-align:left; padding:8px 10px; border:1px solid #c9e0f5; }
  .help-table td { padding:6px 10px; border:1px solid #e0e0e0; }
  .help-table tr:nth-child(even) { background:#fafafa; }
  .help-key { display:inline-block; background:#fff; border:1px solid #bbb; border-bottom-width:2px; border-radius:4px; padding:1px 6px; font-family:monospace; font-weight:bold; font-size:12px; color:#333; box-shadow:0 1px 0 rgba(0,0,0,0.1); }
  .help-tab-btn:hover { background:#eaf4ff !important; }
  .help-tab-btn.active { background:#fff !important; border-left-color:#004a99 !important; color:#004a99 !important; font-weight:bold; }
  .help-h2 { color:#004a99; font-size:16px; margin-top:0; margin-bottom:12px; border-bottom:2px solid #c9e0f5; padding-bottom:6px; }
  .help-h3 { color:#555; font-size:14px; margin:16px 0 6px; }
  .help-note { background:#fff8e1; border-left:4px solid #f0c419; padding:8px 12px; margin:10px 0; font-size:13px; color:#6a4c00; }
`;

export const HELP_HTML_TEMPLATE = `
  <div class="modal-window" style="width:800px; max-width:95vw; height:650px; max-height:90vh;">
    <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99; display: flex; align-items: center; gap: 10px;">
      <span style="font-size:16px; flex: 1;">📖 Справка — Раскладка DXF</span>
      <button class="close-btn" id="btnCloseHelp" style="color:#004a99;font-size:20px;">✕</button>
    </div>
    <div class="modal-body" style="display:flex; padding:0; overflow:hidden;">
      <!-- Левое меню (вкладки) -->
      <div style="width:210px; background:#f5f7fa; border-right:1px solid #ddd; display:flex; flex-direction:column; flex-shrink:0; overflow-y: auto;">
        <button class="help-tab-btn active" data-tab="hotkeys" style="padding:10px 15px; text-align:left; background:#fff; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; font-weight:bold; color:#004a99; border-left:4px solid #004a99;">🔥 Горячие клавиши</button>
        <button class="help-tab-btn" data-tab="basics" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">📌 Основы работы</button>
        <button class="help-tab-btn" data-tab="topbar" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">🔝 Верхняя панель</button>
        <button class="help-tab-btn" data-tab="stock" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">📋 Заготовка и параметры</button>
        <button class="help-tab-btn" data-tab="tools" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">🛠 Инструменты</button>
        <button class="help-tab-btn" data-tab="jobs" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">📁 Задания и поиск</button>
        <button class="help-tab-btn" data-tab="gcode" style="padding:10px 15px; text-align:left; background:transparent; border:none; border-bottom:1px solid #eee; cursor:pointer; font-size:13px; color:#333; border-left:4px solid transparent;">⚙ G-код</button>
      </div>
      
      <!-- Контент -->
      <div id="helpContent" style="flex:1; padding:20px; overflow-y:auto; font-size:14px; line-height:1.6; color:#333;">
        <!-- Сюда JS будет вставлять текст -->
      </div>
    </div>
  </div>
`;

export function renderContent(tabId) {
  const el = document.getElementById('helpContent');
  if (!el) return;

  if (tabId === 'hotkeys') {
    el.innerHTML = `
      <h2 class="help-h2">🔥 Горячие клавиши</h2>
      <table class="help-table">
        <thead><tr><th style="width:40%">Действие</th><th>Клавиша</th></tr></thead>
        <tbody>
          <tr><td>Запустить раскладку</td><td><span class="help-key">F7</span></td></tr>
          <tr><td>Сохранить проект</td><td><span class="help-key">Ctrl</span> + <span class="help-key">S</span></td></tr>
          <tr><td>Открыть проект</td><td><span class="help-key">Ctrl</span> + <span class="help-key">O</span></td></tr>
          <tr><td>Отменить действие (Undo)</td><td><span class="help-key">Ctrl</span> + <span class="help-key">Z</span></td></tr>
          <tr><td>Вернуть действие (Redo)</td><td><span class="help-key">Ctrl</span> + <span class="help-key">Shift</span> + <span class="help-key">Z</span> или <span class="help-key">Ctrl</span> + <span class="help-key">Y</span></td></tr>
          <tr><td>Показать всё (сброс зума)</td><td><span class="help-key">Пробел</span></td></tr>
          <tr><td>Повернуть деталь на 90°</td><td><span class="help-key">R</span></td></tr>
          <tr><td>Зеркально отразить</td><td><span class="help-key">Z</span></td></tr>
          <tr><td>Удалить выделенное</td><td><span class="help-key">Delete</span> или <span class="help-key">Backspace</span></td></tr>
          <tr><td>Снять всё выделение</td><td><span class="help-key">Esc</span></td></tr>
          <tr><td>Выделить всё на холсте</td><td><span class="help-key">Ctrl</span> + <span class="help-key">A</span></td></tr>
          <tr><td>Дублировать выделенное</td><td><span class="help-key">Ctrl</span> + <span class="help-key">D</span></td></tr>
          <tr><td>Переключение по деталям (по порядку реза)</td><td><span class="help-key">Tab</span> (вперед) / <span class="help-key">Shift</span> + <span class="help-key">Tab</span> (назад)</td></tr>
          <tr><td>Перемещение детали стрелками</td><td><span class="help-key">←</span> <span class="help-key">↑</span> <span class="help-key">→</span> <span class="help-key">↓</span> (ускоренно — с <span class="help-key">Shift</span>)</td></tr>
          <tr><td>Приблизить / Отдалить</td><td><span class="help-key">+</span> / <span class="help-key">-</span> или колесо мыши</td></tr>
          <tr><td>Переключить на лист 1 / 2 / 3</td><td><span class="help-key">1</span> / <span class="help-key">2</span> / <span class="help-key">3</span></td></tr>
          <tr><td>Шаг сетки при перетаскивании</td><td><span class="help-key">Alt</span> (удерживать)</td></tr>
          <tr><td>Отключить привязку</td><td><span class="help-key">Shift</span> (удерживать)</td></tr>
        </tbody>
      </table>
    `;
  } else if (tabId === 'basics') {
    el.innerHTML = `
      <h2 class="help-h2">📌 Основы работы</h2>
      <p>Программа предназначена для быстрой раскладки деталей (DXF) на листе металла.</p>
      
      <h3 class="help-h3">1. Загрузка деталей</h3>
      <p>Перетащите DXF-файлы в левую панель или нажмите кнопку <b>«+ Добавить DXF»</b>. Программа автоматически определит контуры и размеры.</p>
      
      <h3 class="help-h3">2. Настройка листа</h3>
      <p>В левой панели («Заготовка») укажите ширину, высоту, толщину металла, отступ от края и зазор между деталями. Эти настройки сохраняются в профилях.</p>
      
      <h3 class="help-h3">3. Раскладка</h3>
      <p>Нажмите <b>«▶ Разложить»</b> (или F7). Программа подберет оптимальное расположение деталей. Если детали не поместились, можно использовать кнопку «Перенести не поместившиеся».</p>
      
      <h3 class="help-h3">4. Работа с холстом</h3>
      <ul>
        <li><b>ЛКМ по детали</b> — выделить и перетащить.</li>
        <li><b>ЛКМ по пустому месту</b> — рамка выделения (можно выделить несколько деталей).</li>
        <li><b>ПКМ</b> — контекстное меню (поворот, зеркало, перенос в задание, удаление и т.д.).</li>
        <li><b>ПКМ + движение</b> — панорамирование (сдвиг холста).</li>
        <li><b>Колесо мыши</b> — зум.</li>
      </ul>
      
      <h3 class="help-h3">5. Задания</h3>
      <p>Используйте вкладки над холстом для переключения между заданиями. Чтобы перенести детали в другое задание, выделите их и нажмите <b>ПКМ → «Перенести в задание»</b>.</p>
      
      <h3 class="help-h3">6. Экспорт</h3>
      <p>Готовую раскладку можно экспортировать в DXF (кнопка «Экспорт DXF»), G-код для станка (кнопка «⚙ G-code») или распечатать отчёты (кнопка «📄 Отчёты»).</p>
    `;
  } else if (tabId === 'topbar') {
    el.innerHTML = `
      <h2 class="help-h2">🔝 Верхняя панель (слева направо)</h2>
      
      <table class="help-table">
        <thead><tr><th style="width:35%">Кнопка</th><th>Описание</th></tr></thead>
        <tbody>
          <tr><td><b>▶ Разложить</b></td><td>Запускает автоматическую раскладку всех загруженных деталей на листы. Горячая клавиша — <span class="help-key">F7</span>.</td></tr>
          <tr><td><b>▶ На остатке</b></td><td>Доразложить детали вокруг уже зафиксированных на листе или запретных зон.</td></tr>
          <tr><td><b>🎯 Подбор заготовки</b></td><td>Автоматически подбирает оптимальный размер листа.</td></tr>
          <tr><td><b>📚 Остатки</b></td><td>Открывает каталог всех остатков со всех листов.</td></tr>
          <tr><td><b>💾 Сохранить проект</b></td><td>Сохраняет весь проект в один файл <b>.dxfnest.json</b>.</td></tr>
          <tr><td><b>📂 Открыть проект</b></td><td>Загружает ранее сохраненный проект из файла.</td></tr>
          <tr><td><b>Экспорт DXF (всё)</b></td><td>Сохраняет все листы в один DXF-файл.</td></tr>
          <tr><td><b>Экспорт DXF (по листам)</b></td><td>Сохраняет каждый лист в отдельный DXF-файл.</td></tr>
          <tr><td><b>📦 В цех</b></td><td>Собирает полный комплект документов для отправки в цех.</td></tr>
          <tr><td><b>🎨 Слои</b></td><td>Управление слоями и порядком реза.</td></tr>
          <tr><td><b>⚙ G-code</b></td><td>Генерация G-кода для станка.</td></tr>
          <tr><td><b>📄 Отчёты</b></td><td>Печать и экспорт отчётов, карт раскроя, CSV.</td></tr>
          <tr><td><b>🏷 Этикетки</b></td><td>Печать этикеток для деталей и остатков.</td></tr>
          <tr><td><b>ℹ Информация</b></td><td>Статистика по раскладке.</td></tr>
        </tbody>
      </table>

      <h3 class="help-h3">Второй ряд (работа с холстом)</h3>
      <table class="help-table">
        <thead><tr><th style="width:35%">Кнопка</th><th>Описание</th></tr></thead>
        <tbody>
          <tr><td><b>📁 Задания</b></td><td>Открывает окно управления заданиями.</td></tr>
          <tr><td><b>📐 Область</b></td><td>Режим выделения рамкой.</td></tr>
          <tr><td><b>📌 Фиксация</b></td><td>Фиксирует выделенные детали на листе.</td></tr>
          <tr><td><b>🔓 Отменить фиксацию</b></td><td>Снимает фиксацию со всех деталей.</td></tr>
          <tr><td><b>⧉ Дублировать</b></td><td>Создает копию выделенных деталей.</td></tr>
          <tr><td><b>🔲 Массив</b></td><td>Создает сетку из копий детали.</td></tr>
          <tr><td><b>✂ Резать лист</b></td><td>Добавление прямых резов на лист.</td></tr>
          <tr><td><b>📦 Остаток</b></td><td>Отметить область как «деловой отход».</td></tr>
          <tr><td><b>📏 Линейка</b></td><td>Измеряет расстояние на холсте.</td></tr>
        </tbody>
      </table>

      <h3 class="help-h3">Правый верхний угол</h3>
      <table class="help-table">
        <thead><tr><th style="width:35%">Кнопка / поле</th><th>Описание</th></tr></thead>
        <tbody>
          <tr><td><b>Смена (поле ввода)</b></td><td>Номер смены или имя оператора.</td></tr>
          <tr><td><b>💰 Финансы</b></td><td>Настройка цен для расчёта себестоимости.</td></tr>
          <tr><td><b>ℹ История действий</b></td><td>Журнал всех действий и сообщений.</td></tr>
          <tr><td><b>⚙ Настройки</b></td><td>Данные для штампа, настройки хранения, темы, автосохранение.</td></tr>
        </tbody>
      </table>
    `;
  } else if (tabId === 'stock') {
    el.innerHTML = `
      <h2 class="help-h2">📋 Заготовка и параметры</h2>
      <p>В левой панели («Заготовка») настраиваются все основные параметры листа и раскладки.</p>
      
      <h3 class="help-h3">Профиль</h3>
      <p>Сохраненный набор настроек (толщина, материал, отступ и т.д.).</p>
      
      <h3 class="help-h3">X (ширина) и Y (высота)</h3>
      <p>Размеры листа металла в миллиметрах.</p>
      
      <h3 class="help-h3">Толщина, мм</h3>
      <p>Толщина металла для расчёта веса и G-кода.</p>
      
      <h3 class="help-h3">Плотность, кг/м³</h3>
      <p>Плотность материала (Сталь — 7850, Нержавейка — 7900, Алюминий — 2700, Латунь — 8500).</p>
      
      <h3 class="help-h3">Отступ от края, мм</h3>
      <p>Технологический отступ от кромки листа.</p>
      
      <h3 class="help-h3">Ширина реза, мм (Kerf)</h3>
      <p>Ширина реза плазмы.</p>
      
      <h3 class="help-h3">Зазор между деталями, мм</h3>
      <p>Минимальное расстояние между контурами деталей.</p>
      
      <h3 class="help-h3">Привязка, мм</h3>
      <p>Радиус притягивания детали при перемещении.</p>
      
      <h3 class="help-h3">Шаг сетки (Alt), мм</h3>
      <p>Шаг движения детали с зажатой клавишей Alt.</p>
      
      <h3 class="help-h3">Поворот</h3>
      <p>Возможные углы поворота детали при раскладке.</p>
      
      <h3 class="help-h3">Стратегия расчёта</h3>
      <p>Алгоритм раскладки (Авто, По площади, По длине, По ширине).</p>
      
      <h3 class="help-h3">Макс. листов</h3>
      <p>Лимит количества листов.</p>
      
      <h3 class="help-h3">Отрез делового отхода</h3>
      <p>Автоматическое отрезание пустой части листа для сохранения остатка.</p>
    `;
  } else if (tabId === 'tools') {
    el.innerHTML = `
      <h2 class="help-h2">🛠 Инструменты</h2>
      <h3 class="help-h3">📐 Область</h3>
      <p>Выделение рамкой группы деталей или пустой области.</p>
      <h3 class="help-h3">📌 Фиксация</h3>
      <p>Блокировка деталей от перемещения и удаления.</p>
      <h3 class="help-h3">🔓 Отменить фиксацию</h3>
      <p>Снимает фиксацию со всех деталей.</p>
      <h3 class="help-h3">⧉ Дублировать</h3>
      <p>Создает копию выделенной детали или группы.</p>
      <h3 class="help-h3">🔲 Массив</h3>
      <p>Создает сетку из копий детали.</p>
      <h3 class="help-h3">✂ Резать лист</h3>
      <p>Добавление прямых резов на лист.</p>
      <h3 class="help-h3">📦 Остаток</h3>
      <p>Отметить область как «деловой отход».</p>
      <h3 class="help-h3">📏 Линейка</h3>
      <p>Измерение расстояния между точками.</p>
    `;
  } else if (tabId === 'jobs') {
    el.innerHTML = `
      <h2 class="help-h2">📁 Задания и поиск</h2>
      <h3 class="help-h3">Переключение между заданиями</h3>
      <p>Используйте вкладки над холстом или выпадающий список в левой панели.</p>
      <h3 class="help-h3">Создание нового задания</h3>
      <p>Кнопка «+» рядом с вкладками или выпадающим списком.</p>
      <h3 class="help-h3">Перенос деталей в другое задание</h3>
      <p>Выделите детали и нажмите ПКМ → «Перенести в задание».</p>
      <h3 class="help-h3">Как работает поиск деталей</h3>
      <p>Поле поиска над таблицей деталей ищет по имени, размеру (100x50), количеству и длине.</p>
    `;
  } else if (tabId === 'gcode') {
    el.innerHTML = `
      <h2 class="help-h2">⚙ Генерация G-кода</h2>
      <h3 class="help-h3">Экспорт</h3>
      <p>Кнопка «⚙ G-code» в верхней панели.</p>
      <h3 class="help-h3">Основные параметры</h3>
      <ul>
        <li>Скорость резания (F)</li>
        <li>Kerf (компенсация)</li>
        <li>Радиус врезки</li>
        <li>TSP-сортировка</li>
        <li>По часовой / Подетально</li>
      </ul>
      <h3 class="help-h3">Медленный врез отверстий</h3>
      <p>Снижение скорости при врезании во внутренние отверстия.</p>
      <h3 class="help-h3">Мостики (перемычки)</h3>
      <p>Непрорезанные участки, чтобы деталь не упала.</p>
      <h3 class="help-h3">Симуляция</h3>
      <p>Анимация резки в реальном времени.</p>
    `;
  }
}