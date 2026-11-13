// js/cut-order.js
import { state } from './state.js';

export function assignCutOrder(sheet) {
  if (!sheet || !sheet.placed || sheet.placed.length === 0) return;

  let strategy = 'snake';
  try {
    strategy = localStorage.getItem('raskladka.cutOrderStrategy.v1') || 'snake';
  } catch (_) {}

  // Создаем копию списка деталей
  const parts = sheet.placed.slice();
  
  // Если выбрана жесткая сортировка по X (Слева направо) или Y (Снизу вверх) - делаем её
  if (strategy === 'width') {
    parts.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 50) return a.y - b.y; // Снизу вверх
      return a.x - b.x; // Слева направо
    });
  } else if (strategy === 'height') {
    parts.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 50) return a.x - b.x; // Слева направо
      return a.y - b.y; // Снизу вверх
    });
  } else {
    // ═══ УМНЫЙ ОБХОД (TSP - Ближайший сосед) ═══
    // 1. Находим самую нижнюю левую деталь, чтобы начать с неё
    let startIdx = 0;
    let minScore = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const cx = p.x + (p.bbox[2] - p.bbox[0]) / 2;
      const cy = p.y + (p.bbox[3] - p.bbox[1]) / 2;
      const score = cy * 10 + cx; // Приоритет: низ (Y), потом лево (X)
      if (score < minScore) {
        minScore = score;
        startIdx = i;
      }
    }

    const sorted = [];
    const used = new Set();
    
    let current = parts[startIdx];
    used.add(startIdx);
    sorted.push(current);

    // 2. Идем по ближайшим соседям
    while (sorted.length < parts.length) {
      const cx = current.x + (current.bbox[2] - current.bbox[0]) / 2;
      const cy = current.y + (current.bbox[3] - current.bbox[1]) / 2;
      
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < parts.length; i++) {
        if (used.has(i)) continue;
        const p = parts[i];
        const px = p.x + (p.bbox[2] - p.bbox[0]) / 2;
        const py = p.y + (p.bbox[3] - p.bbox[1]) / 2;
        
        // Считаем расстояние между центрами
        const dist = Math.hypot(px - cx, py - cy);
        
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        current = parts[bestIdx];
        used.add(bestIdx);
        sorted.push(current);
      } else {
        break;
      }
    }
    
    // Перезаписываем массив отсортированным
    parts.length = 0;
    parts.push(...sorted);
  }

  // Присваиваем номера
  parts.forEach((p, i) => {
    p._cutOrder = i + 1;
    p._manualCutOrder = false;
  });
}

export function assignCutOrderAllSheets() {
  for (const sh of state.sheets) {
    assignCutOrder(sh);
  }
}