// GsCAM/export-player.js
import { todayIso, sanitizeFileName, downloadBlob } from '../js/utils.js';
import { readParams } from '../js/params.js';
import { state } from '../js/state.js';
import { getPost, DEFAULT_POST_ID } from './posts/index.js';
import { sheetToGcode } from './sheet-to-gcode.js';
import { getPlayerTemplate } from './player-template.js'; // <--- ИМПОРТ ШАБЛОНА

export function buildPlayerHtml(options) {
  const {
    gcode = '',
    sheetName = 'Лист',
    title = 'Симуляция резки',
    thickness = 6,
    sheetW = 0,
    sheetH = 0,
    sheetPolygons = null,
    theme = 'default',
    postName = 'AMN Tech THC',
    date = todayIso(),
  } = options;

  const data = JSON.stringify({
    gcode, title, sheetName, thickness, sheetW, sheetH, sheetPolygons, theme, postName, date,
  });

  // Возвращаем готовый HTML из шаблона
  return getPlayerTemplate(data);
}

// ═══════════════════════════════════════════════════════════════
// Возвращает HTML-строку плеера для листа (для shipment/сохранения).
// ═══════════════════════════════════════════════════════════════
export function getPlayerHtmlForSheet(sheetIndex, options = {}) {
  if (!state.sheets || !state.sheets[sheetIndex]) return '';

  const params = readParams();
  const post = getPost(DEFAULT_POST_ID);
  const date = todayIso();
  const projectBase = options.projectBase || 'Raskladka';
  const theme = options.theme || localStorage.getItem('raskladka.theme') || 'default';

  const m = String(projectBase || '').match(/^PR(\d+)/i);
  const projectNum = m ? String(m[1]).padStart(2, '0') : '01';
  let gcodeBase = `PR${projectNum}L${sheetIndex + 1}`;
  if (params.thickness && isFinite(params.thickness)) {
    gcodeBase += `T${Math.round(params.thickness * 10) / 10}`;
  }
  const totalPlaced = (state.sheets || []).reduce((s, sh) => s + (sh.placed || []).length, 0);
  if (totalPlaced) gcodeBase += `Dt${totalPlaced}`;

  const ctx = {
    fileName: `${gcodeBase}${post.ext}`,
    postName: post.name + '.scpost',
    date,
    units: post.units,
    sheetIndex,
  };

  let gcode = '';
  try {
    gcode = sheetToGcode(state.sheets[sheetIndex], params, post, ctx, {
      useTsp: true, cutCw: true, partByPart: true, leadInRadius: 1.28,
    });
  } catch (e) {
    console.error('Ошибка генерации G-кода для плеера:', e);
    return '';
  }

  return buildPlayerHtml({
    gcode,
    sheetName: `Лист ${sheetIndex + 1} из ${state.sheets.length}`,
    title: projectBase,
    thickness: params.thickness,
    sheetW: params.sheetW,
    sheetH: params.sheetH,
    sheetPolygons: params.sheetPolygons,
    theme,
    postName: post.name,
    date,
  });
}

export function downloadPlayerHtmlForSheet(sheetIndex, options = {}) {
  const html = getPlayerHtmlForSheet(sheetIndex, options);
  if (!html) {
    alert('Не удалось сгенерировать плеер');
    return;
  }

  const projectBase = options.projectBase || 'Raskladka';
  const fileName = sanitizeFileName(`${projectBase}_list${sheetIndex + 1}_simulation.html`, 120);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, fileName, 4000);
}