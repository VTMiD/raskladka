import { state } from './state.js';
import { setStatus } from './utils.js';
import { pushHistory } from './history.js';
import { draw } from './canvas/render.js';

export function openLayersModal() {
  let modal = document.getElementById('layersModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'layersModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  
  modal.classList.add('active');
  renderList();
}

function closeLayersModal() {
  const modal = document.getElementById('layersModal');
  if (modal) modal.classList.remove('active');
}

function renderList() {
  const modal = document.getElementById('layersModal');
  if (!modal) return;

  const sorted = [...state.layers].sort((a, b) => a.order - b.order);

  const rows = sorted.map((l, idx) => `
    <tr data-id="${l.id}">
      <td class="num" style="width:30px">${idx + 1}</td>
      <td style="width:40px">
        <input type="color" value="${l.color}" data-role="color" style="width:32px;height:24px;padding:0;border:none;cursor:pointer;background:none;">
      </td>
      <td>
        <input type="text" value="${l.name}" data-role="name" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:3px;font-size:13px;">
      </td>
      <td style="width:40px;text-align:center">
        <button data-role="vis" style="background:none; border:none; font-size:16px; cursor:pointer; padding:4px;" title="${l.visible !== false ? 'Скрыть слой' : 'Показать слой'}">
          ${l.visible !== false ? '👁' : '🙈'}
        </button>
      </td>
      <td style="width:80px;text-align:center; white-space:nowrap;">
        <button data-role="up" title="Выше" style="padding:2px 6px;font-size:12px" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button data-role="down" title="Ниже" style="padding:2px 6px;font-size:12px" ${idx === sorted.length - 1 ? 'disabled' : ''}>▼</button>
      </td>
      <td style="width:40px;text-align:center">
        <button data-role="del" class="danger" style="padding:2px 6px;font-size:12px" ${sorted.length === 1 ? 'disabled' : ''}>🗑</button>
      </td>
    </tr>
  `).join('');

  modal.innerHTML = `
    <div class="modal-window" style="width:600px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>🎨 Управление слоями</span>
        <button class="close-btn" id="btnCloseLayers" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body">
        <div class="hint" style="margin-bottom:10px">Детали режутся по порядку слоев (сверху вниз). Глазок скрывает слой только визуально (в G-код он попадет).</div>
        <table class="report-table">
          <thead><tr><th>№</th><th>Цвет</th><th>Название</th><th>Вид</th><th>Порядок</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button id="btnAddLayer" class="primary" style="margin-top:10px;width:100%;padding:8px">+ Добавить слой</button>
      </div>
      <div class="modal-footer">
        <button id="btnCloseLayers2">Закрыть</button>
      </div>
    </div>
  `;

  document.getElementById('btnCloseLayers').onclick = closeLayersModal;
  document.getElementById('btnCloseLayers2').onclick = closeLayersModal;
  
  document.getElementById('btnAddLayer').onclick = () => {
    const newId = Math.max(...state.layers.map(l => l.id), 0) + 1;
    const newOrder = Math.max(...state.layers.map(l => l.order), 0) + 1;
    state.layers.push({ id: newId, name: `Слой ${newId}`, color: '#888888', order: newOrder, visible: true });
    renderList();
    draw();
    pushHistory();
  };

  modal.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = parseInt(tr.dataset.id, 10);
    const layer = state.layers.find(l => l.id === id);
    if (!layer) return;

    tr.querySelector('[data-role="color"]').addEventListener('input', (e) => {
      layer.color = e.target.value;
      draw();
    });
    tr.querySelector('[data-role="color"]').addEventListener('change', () => pushHistory());

    tr.querySelector('[data-role="name"]').addEventListener('input', (e) => {
      layer.name = e.target.value;
    });
    tr.querySelector('[data-role="name"]').addEventListener('blur', () => {
      renderList();
      draw();
      pushHistory();
    });

    tr.querySelector('[data-role="vis"]').onclick = () => {
      layer.visible = layer.visible === false ? true : false;
      renderList();
      draw();
      pushHistory();
    };

    tr.querySelector('[data-role="up"]').onclick = () => {
      if (layer.order > 1) {
        const prev = state.layers.find(l => l.order === layer.order - 1);
        if (prev) {
          prev.order += 1;
          layer.order -= 1;
          renderList();
          pushHistory();
          setStatus('Порядок слоев изменён');
        }
      }
    };
    tr.querySelector('[data-role="down"]').onclick = () => {
      const maxOrder = Math.max(...state.layers.map(l => l.order));
      if (layer.order < maxOrder) {
        const next = state.layers.find(l => l.order === layer.order + 1);
        if (next) {
          next.order -= 1;
          layer.order += 1;
          renderList();
          pushHistory();
          setStatus('Порядок слоев изменён');
        }
      }
    };

    tr.querySelector('[data-role="del"]').onclick = () => {
      if (state.layers.length <= 1) return;
      if (!confirm(`Удалить слой «${layer.name}»? Все детали из него вернутся в Слой 1.`)) return;
      
      const fallbackLayer = state.layers.find(l => l.id !== id) || state.layers[0];
      for (const sh of state.sheets) {
        for (const pl of sh.placed) {
          if (pl.layerId === id) pl.layerId = fallbackLayer.id;
        }
      }
      
      state.layers = state.layers.filter(l => l.id !== id);
      
      const sorted = [...state.layers].sort((a, b) => a.order - b.order);
      sorted.forEach((l, i) => l.order = i + 1);
      
      renderList();
      draw();
      pushHistory();
    };
  });
}

export function bindLayersUI() {
  const btn = document.getElementById('btnLayers');
  if (btn) btn.addEventListener('click', openLayersModal);
}