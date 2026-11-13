import { $, sleep, setStatus, downloadBlob } from './utils.js';
import { state } from './state.js';
import { readParams } from './params.js';
import { buildSheetSvg, buildReportHtml, buildLayoutHtml } from './report/report.js';
import { getCurrentProjectName, buildDefaultFileName } from './project-io.js';

// ─── Имя файла: базовое имя проекта + суффикс ───
function makeProjectReportName(suffix) {
    let projectName = '';
    try {
        projectName = typeof getCurrentProjectName === 'function' ? getCurrentProjectName() : '';
        if (!projectName && typeof buildDefaultFileName === 'function') {
            projectName = buildDefaultFileName();
        }
    } catch (_) {}

    const base = String(projectName || 'Проект')
        .replace(/\.dxfnest\.json$/i, '')
        .replace(/\.json$/i, '');

    return `${base}_${suffix}`;
}

async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/lib/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('Не удалось загрузить html2canvas'));
    document.head.appendChild(script);
  });
}

async function htmlToJpegBlob(html, widthMm, quality = 0.92) {
  const html2canvas = await loadHtml2Canvas();

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position: absolute; left: -9999px; top: 0;
    width: ${widthMm}mm; background: #fff; padding: 0; margin: 0;
    box-sizing: border-box;
  `;
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const imgs = [...wrap.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(res => {
      img.onload = res;
      img.onerror = res;
      setTimeout(res, 3000);
    });
  }));
  await new Promise(r => setTimeout(r, 150));

  try {
    const canvas = await html2canvas(wrap, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: wrap.scrollWidth,
      height: wrap.scrollHeight,
      windowWidth: wrap.scrollWidth,
      windowHeight: wrap.scrollHeight,
    });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  } finally {
    document.body.removeChild(wrap);
  }
}

/**
 * Генерирует массив JPG-blob'ов по страницам HTML-документа.
 * Если в HTML нет .pdf-page обёрток, вернёт один JPG для всего документа.
 */
export async function generateJpgPages(html, quality = 0.92) {
  const html2canvas = await loadHtml2Canvas();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute; left:-9999px; top:0; background:#fff; padding:0; margin:0;';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const imgs = [...wrap.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(res => {
      img.onload = res;
      img.onerror = res;
      setTimeout(res, 3000);
    });
  }));
  await new Promise(r => setTimeout(r, 150));

  try {
    const pages = wrap.querySelectorAll('.pdf-page');
    const blobs = [];

    if (!pages.length) {
      const canvas = await html2canvas(wrap, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: wrap.scrollWidth,
        height: wrap.scrollHeight,
        windowWidth: wrap.scrollWidth,
        windowHeight: wrap.scrollHeight,
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob) blobs.push(blob);
      return blobs;
    }

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const canvas = await html2canvas(pageEl, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: pageEl.offsetWidth,
        height: pageEl.offsetHeight,
        windowWidth: pageEl.offsetWidth,
        windowHeight: pageEl.offsetHeight,
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob) blobs.push(blob);
    }
    return blobs;
  } finally {
    document.body.removeChild(wrap);
  }
}

async function svgToRasterBlob(svgString, wMm, hMm, mimeType = 'image/jpeg', quality = 0.92) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Не удалось отрисовать SVG'));
      i.src = url;
    });
    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wMm * scale));
    canvas.height = Math.max(1, Math.round(hMm * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), mimeType, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function bindExportsUI() {
  $('btnSaveHtml').addEventListener('click', async () => {
    if (!state.parts.length) {
      alert('Сначала добавьте детали');
      return;
    }
    try {
      setStatus('Формирование отчёта JPG...');
      await sleep(30);

      const html = buildReportHtml();
      const blob = await htmlToJpegBlob(html, 210, 0.92);

      if (!blob) {
        setStatus('Не удалось создать JPG');
        return;
      }
      const name = makeProjectReportName('Otchet') + '.jpg';
      downloadBlob(blob, name);
      setStatus('Сохранено: ' + name);
    } catch (e) {
      console.error(e);
      setStatus('Ошибка: ' + e.message);
    }
  });

  const btnJpg = $('btnSaveJpgSheets');
  if (btnJpg) {
    btnJpg.addEventListener('click', async () => {
      if (!state.sheets.length) {
        alert('Сначала нажмите «Разложить»');
        return;
      }
      
      btnJpg.disabled = true;
      setStatus('Формирование карты JPG...');
      await sleep(30);

      let wrap = null;
      try {
        const html = buildLayoutHtml();
        const html2canvas = await loadHtml2Canvas();
        
        wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute; left:-9999px; top:0; background:#fff; padding:0; margin:0;';
        wrap.innerHTML = html;
        document.body.appendChild(wrap);

        const imgs = [...wrap.querySelectorAll('img')];
        await Promise.all(imgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(res => {
            img.onload = res;
            img.onerror = res;
            setTimeout(res, 3000);
          });
        }));
        await new Promise(r => setTimeout(r, 150));

        const pages = wrap.querySelectorAll('.pdf-page');
        if (!pages.length) {
          throw new Error('Не найдено страниц для экспорта');
        }

        const base = makeProjectReportName('Karta');
        
        for (let i = 0; i < pages.length; i++) {
          setStatus(`JPG: страница ${i + 1} из ${pages.length}...`);
          
          const pageEl = pages[i];
          const canvas = await html2canvas(pageEl, {
            scale: 3,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: pageEl.offsetWidth,
            height: pageEl.offsetHeight,
            windowWidth: pageEl.offsetWidth,
            windowHeight: pageEl.offsetHeight,
          });

          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
          if (!blob) continue;

          const fileName = `${base}_${i + 1}.jpg`;
          downloadBlob(blob, fileName);
          
          await sleep(200);
        }

        setStatus(`Готово: ${pages.length} JPG-файлов карты`);
      } catch (e) {
        console.error(e);
        setStatus('Ошибка: ' + e.message);
      } finally {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        btnJpg.disabled = false;
      }
    });
  }
}