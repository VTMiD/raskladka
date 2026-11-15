// js/report/spec.js
import { state } from '../state.js';
import { readParams } from '../params.js';
import { todayIso } from '../utils.js';

export function buildSpecificationHtml() {
  const params = readParams();
  const date = todayIso();
  
  // Собираем список деталей
  const map = new Map();
  for (const p of state.parts) {
    const name = p.name;
    if (!map.has(name)) {
      map.set(name, { name, total: p.qty, placed: 0, size: `${p.width.toFixed(1)}x${p.height.toFixed(1)}` });
    }
  }

  // Считаем, сколько разложено
  for (const sh of state.sheets) {
    for (const pl of sh.placed) {
      const name = state.parts[pl.partIdx]?.name;
      if (name && map.has(name)) {
        map.get(name).placed++;
      }
    }
  }

  const rows = [...map.values()].map(item => `
    <tr>
      <td style="border: 1px solid #000; padding: 5px 8px;">${item.name}</td>
      <td style="border: 1px solid #000; padding: 5px 8px; text-align: center;">${item.size}</td>
      <td style="border: 1px solid #000; padding: 5px 8px; text-align: center;">${item.total}</td>
      <td style="border: 1px solid #000; padding: 5px 8px; text-align: center;">${item.placed}</td>
    </tr>
  `).join('');

  const totalParts = state.parts.reduce((s, p) => s + p.qty, 0);
  const totalPlaced = state.sheets.reduce((s, sh) => s + sh.placed.length, 0);

  return `
    <div class="pdf-page" style="width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; background: #fff;">
      <h1 style="text-align: center; font-size: 18px; margin-bottom: 5px;">Спецификация деталей</h1>
      <div style="text-align: center; font-size: 12px; color: #555; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px;">
        Дата: ${date} · Листов: ${state.sheets.length} · Параметры: ${params.sheetW}×${params.sheetH}×${params.thickness}
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; font-family: 'Times New Roman', serif;">
        <thead>
          <tr style="background: #eee;">
            <th style="border: 1px solid #000; padding: 6px 8px; text-align: left;">Наименование</th>
            <th style="border: 1px solid #000; padding: 6px 8px;">Размер, мм</th>
            <th style="border: 1px solid #000; padding: 6px 8px;">Кол-во</th>
            <th style="border: 1px solid #000; padding: 6px 8px;">Разложено</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background: #f0f0f0; font-weight: bold;">
            <td style="border: 1px solid #000; padding: 6px 8px;">ИТОГО</td>
            <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">—</td>
            <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${totalParts}</td>
            <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${totalPlaced}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 30px; font-size: 12px; display: flex; justify-content: space-between;">
        <div>Технолог: _________________</div>
        <div>Мастер: _________________</div>
      </div>
    </div>
  `;
}