import { state, profilesStore, genId } from './state.js';
import { readParams, saveProfiles, renderProfileSelect } from './params.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';

function pad2(n) { return String(n).padStart(2, '0'); }

export function saveRemnantsAsProfiles() {
  if (!state.sheets.length) {
    setStatus('Сначала выполните раскладку (нажмите «Разложить»)');
    return;
  }

  const params = readParams();
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  let count = 0;
  const added = [];

  for (const sh of state.sheets) {
    if (!sh.remnants) continue;
    for (const r of sh.remnants) {
      const W = Math.round(r.w);
      const H = Math.round(r.h);
      if (W < 20 || H < 20) continue;

      const id = genId();
      const name = `Остаток_${W}x${H}x${params.thickness}_${dateStr}`;

      profilesStore.profiles.push({
        id,
        name,
        nameCustom: true,
        params: {
          ...params,
          sheetW: W,
          sheetH: H,
          sheetPolygons: null,
        },
      });

      added.push(`${W}×${H}`);
      count++;
    }
  }

  if (!count) {
    setStatus('Остатков для сохранения не найдено. Включите «Отрез делового отхода» или отметьте остаток кнопкой «📦 Остаток».');
    return;
  }

  saveProfiles();
  renderProfileSelect();
  setStatus(`Сохранено профилей-остатков: ${count} (${added.join(', ')})`);
  pushHistory();
}