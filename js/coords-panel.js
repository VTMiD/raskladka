// js/coords-panel.js
import { state } from './state.js';
import { draw } from './canvas/render.js';
import { pushHistory } from './history.js';
import { readParams } from './params.js';

let panel, inputX, inputY, inputAngle;
let _historyTimer = null;

export function initCoordsPanel() {
  panel = document.getElementById('coordsPanel');
  inputX = document.getElementById('coordX');
  inputY = document.getElementById('coordY');
  inputAngle = document.getElementById('coordAngle');

  if (!panel || !inputX || !inputY) {
    console.warn('[coords] Элементы панели не найдены');
    return;
  }

  // ─── Функция применения координат ───
  const applyCoords = () => {
    if (!state.selectedPart) {
      syncCoordsPanel();
      return;
    }

    const { sheetIdx, placedIdx } = state.selectedPart;
    const sheet = state.sheets[sheetIdx];
    if (!sheet) return;
    const pl = sheet.placed[placedIdx];
    if (!pl) return;

    if (pl._fixed) {
      alert('Деталь зафиксирована — снимите фиксацию (📌), чтобы двигать.');
      syncCoordsPanel();
      return;
    }

    const newX = parseFloat(inputX.value);
    const newY = parseFloat(inputY.value);
    
    if (isNaN(newX) && isNaN(newY)) return;

    const params = readParams();
    const W = params.sheetW - 2 * params.edge;
    const H = params.sheetH - 2 * params.edge;
    const w = pl.bbox[2] - pl.bbox[0];
    const h = pl.bbox[3] - pl.bbox[1];

    // Привязка шага стрелочек к шагу сетки
    const step = Math.max(1, params.gridStep || 10);
    if (inputX) inputX.step = step;
    if (inputY) inputY.step = step;

    let targetX = isNaN(newX) ? pl.x : newX;
    let targetY = isNaN(newY) ? pl.y : newY;

    // Защита от выхода за края листа
    if (targetX < 0) targetX = 0;
    if (targetY < 0) targetY = 0;
    if (targetX + w > W) targetX = W - w;
    if (targetY + h > H) targetY = H - h;

    if (Math.abs(pl.x - targetX) < 0.01 && Math.abs(pl.y - targetY) < 0.01) {
      return;
    }

    // Применяем координаты
    pl.x = targetX;
    pl.y = targetY;
    pl.bbox = [targetX, targetY, targetX + w, targetY + h];
    pl._collides = false;

    // Мгновенная перерисовка холста
    draw();

    // Сохраняем историю с задержкой (чтобы клики по стрелочкам не забивали стек)
    if (_historyTimer) clearTimeout(_historyTimer);
    _historyTimer = setTimeout(() => {
      pushHistory();
      _historyTimer = null;
    }, 400);
  };

  // ─── Универсальный обработчик для координат X и Y ───
  const handleCoordEvent = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (e.type === 'keydown') e.preventDefault();
    
    applyCoords();
    
    if (e.type === 'keydown' && e.target) {
      e.target.blur();
    }
  };

  // ─── Обработчик для поля угла поворота (Z) ───
  const applyAngle = () => {
    if (!state.selectedPart || !inputAngle) return;

    const { sheetIdx, placedIdx } = state.selectedPart;
    const sheet = state.sheets[sheetIdx];
    if (!sheet) return;
    const pl = sheet.placed[placedIdx];
    if (!pl) return;

    if (pl._fixed) {
      alert('Деталь зафиксирована — снимите фиксацию, чтобы повернуть.');
      return;
    }

    const angle = Math.round(parseFloat(inputAngle.value) || 0);
    
    // В вашей программе поворот возможен только на 90 градусов
    if (angle === 0 || angle % 90 !== 0) {
      inputAngle.value = 0;
      return;
    }

    const turns = (angle / 90) % 4;
    
    import('./canvas-ops.js').then(m => {
      if (!m.rotateSelected) return;
      
      // Крутим деталь на нужное количество шагов по 90 градусов
      for (let i = 0; i < turns; i++) {
        m.rotateSelected(1);
      }
      draw();
      
      if (_historyTimer) clearTimeout(_historyTimer);
      _historyTimer = setTimeout(() => {
        pushHistory();
        _historyTimer = null;
      }, 400);
    });
  };

  const handleAngleEvent = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (e.type === 'keydown') e.preventDefault();
    
    applyAngle();
    
    if (e.type === 'keydown' && e.target) {
      e.target.blur();
    }
  };

  // ─── Навешиваем обработчики на X и Y ───
  inputX.addEventListener('keydown', handleCoordEvent);
  inputX.addEventListener('change', handleCoordEvent);

  inputY.addEventListener('keydown', handleCoordEvent);
  inputY.addEventListener('change', handleCoordEvent);

  // ─── Навешиваем обработчики на Поворот (Z) ───
  if (inputAngle) {
    inputAngle.addEventListener('keydown', handleAngleEvent);
    inputAngle.addEventListener('change', handleAngleEvent);
  }

  // ─── Защита от фонового обновления во время ввода ───
  const stopSync = (e) => { if(e.target) e.target._isUserEditing = true; };
  const startSync = (e) => { 
    if(e.target) e.target._isUserEditing = false; 
    syncCoordsPanel();
  };

  inputX.addEventListener('focus', stopSync);
  inputX.addEventListener('blur', startSync);
  inputY.addEventListener('focus', stopSync);
  inputY.addEventListener('blur', startSync);
  if (inputAngle) {
    inputAngle.addEventListener('focus', stopSync);
    inputAngle.addEventListener('blur', startSync);
  }
}

// ─── Синхронизация панели с состоянием ───
export function syncCoordsPanel() {
  if (!panel) return;

  // Находим контейнер с инпутами (он есть в HTML)
  const wrap = document.getElementById('coordInputsWrap');

  // Если ничего не выделено — блокируем поля и делаем их тусклыми
  if (!state.selectedPart) {
    if (wrap) wrap.style.opacity = '0.6';
    if (document.activeElement !== inputX) inputX.value = '';
    if (document.activeElement !== inputY) inputY.value = '';
    if (inputAngle && document.activeElement !== inputAngle) inputAngle.value = '0';
    
    inputX.disabled = true;
    inputY.disabled = true;
    if (inputAngle) inputAngle.disabled = true;
    return;
  }

  const { sheetIdx, placedIdx } = state.selectedPart;
  const sheet = state.sheets[sheetIdx];
  const pl = sheet && sheet.placed[placedIdx];
  
  if (!pl) {
    if (wrap) wrap.style.opacity = '0.6';
    inputX.disabled = true;
    inputY.disabled = true;
    if (inputAngle) inputAngle.disabled = true;
    return;
  }

  // Активируем поля
  if (wrap) wrap.style.opacity = '1';
  inputX.disabled = false;
  inputY.disabled = false;
  if (inputAngle) inputAngle.disabled = false;

  // Обновляем координаты (не трогаем поле, если в нем курсор)
  if (document.activeElement === inputX) {
    // ничего не делаем
  } else {
    inputX.value = Math.round(pl.x);
  }

  if (document.activeElement === inputY) {
    // ничего не делаем
  } else {
    inputY.value = Math.round(pl.y);
  }

  // Угол сбрасываем в 0 (так как программа не хранит абсолютный угол, 
  // а просто крутит на 90 при нажатии)
  if (inputAngle && document.activeElement !== inputAngle) {
    inputAngle.value = '0';
  }
}

// Автозапуск при загрузке страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCoordsPanel);
} else {
  initCoordsPanel();
}

// Фоновое обновление (для случаев, когда деталь двигают мышкой)
setInterval(() => {
  if (typeof syncCoordsPanel === 'function') syncCoordsPanel();
}, 200);