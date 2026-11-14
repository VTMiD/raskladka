// js/report/report-csv.js
import { state } from '../state.js';
import { downloadBlob, setStatus, todayIso } from '../utils.js';

export function exportSpecToCSV() {
  if (!state.sheets || !state.sheets.length) {
    alert('Сначала выполните раскладку (нажмите «Разложить»).');
    return;
  }

  const headers = [
    'Лист', 'Рез №', 'Деталь', 'X (мм)', 'Y (мм)', 
    'Ширина (мм)', 'Высота (мм)', 'Площадь 1 шт (м²)', 
    'Кол-во', 'Общая площадь (м²)'
  ];

  const rows = [];
  // ═══ МАГИЯ ДЛЯ EXCEL: указываем разделитель ═══
  rows.push('sep=;'); 
  rows.push(headers.join(';'));

  const totalParts = {};

  for (let si = 0; si < state.sheets.length; si++) {
    const sheet = state.sheets[si];
    const sortedPlaced = [...sheet.placed].sort((a, b) => (a._cutOrder || 9999) - (b._cutOrder || 9999));

    for (const pl of sortedPlaced) {
      const part = state.parts[pl.partIdx];
      if (!part) continue;

      const w = (pl.bbox[2] - pl.bbox[0]).toFixed(1);
      const h = (pl.bbox[3] - pl.bbox[1]).toFixed(1);
      const areaM2 = (part.area / 1e6).toFixed(4);
      const cutOrder = pl._cutOrder || '—';

      if (!totalParts[pl.partIdx]) totalParts[pl.partIdx] = 0;
      totalParts[pl.partIdx]++;

      rows.push([
        si + 1,
        cutOrder,
        `"${part.name}"`,
        pl.x.toFixed(1),
        pl.y.toFixed(1),
        w,
        h,
        areaM2.replace('.', ','),
        '',
        ''
      ].join(';'));
    }
  }

  rows.push('');
  rows.push(['СВОДКА ПО ДЕТАЛЯМ'].join(';'));
  rows.push(['Деталь', 'Кол-во', 'Площадь 1 шт (м²)', 'Общая площадь (м²)'].join(';'));

  for (const partIdx in totalParts) {
    const p = state.parts[partIdx];
    if (!p) continue;
    const count = totalParts[partIdx];
    const area1 = (p.area / 1e6);
    const totalArea = (area1 * count);
    rows.push([
      `"${p.name}"`,
      count,
      area1.toFixed(4).replace('.', ','),
      totalArea.toFixed(4).replace('.', ',')
    ].join(';'));
  }

  const csvContent = rows.join('\r\n');
  
  // ═══ КОДИРОВКА WINDOWS-1251 ДЛЯ EXCEL ═══
  // Excel в РФ лучше всего понимает Windows-1251, а не UTF-8
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `Спецификация_${state.sheets.length}л_${todayIso()}.csv`;
  
  downloadBlob(blob, fileName);
  setStatus(`Экспортировано в CSV: ${fileName}`);
}