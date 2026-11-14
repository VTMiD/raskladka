// js/dialogs/pdf-maker.js
import { askFileNameWithPath, downloadBlob, saveFileToServer, setStatus } from '../utils.js';

async function loadPdfLibs() {
    if (window.jspdf && window.html2canvas) return;
    const loadScript = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error('Не удалось загрузить: ' + src));
        document.head.appendChild(s);
    });
    
    const jspdfSources = ['js/lib/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
    const h2cSources = ['js/lib/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'];

    if (!window.jspdf) {
        for (const src of jspdfSources) { try { await loadScript(src); break; } catch (_) {} }
    }
    if (!window.html2canvas) {
        for (const src of h2cSources) { try { await loadScript(src); break; } catch (_) {} }
    }
}

export async function generatePdfBlob(html, orientation) {
    try { await loadPdfLibs(); }
    catch (err) { throw new Error('Не удалось загрузить библиотеки PDF. Проверьте интернет.\n' + err.message); }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: orientation || 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;left:0;top:0;transform:translateX(-300vw);background:#fff;padding:0;margin:0;box-sizing:border-box;z-index:-1;`;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .pdf-page { padding: 0 !important; box-sizing: border-box !important; background: #fff !important; position: relative !important; overflow: hidden !important; margin: 0 !important; page-break-after: always; }
        .pdf-page.test-labels-page { padding: 8mm !important; }
        .pdf-page:last-child { page-break-after: auto; }
    `;
    wrap.appendChild(styleEl);
    wrap.innerHTML += `<div id="printArea" style="display:block !important">${html}</div>`;
    document.body.appendChild(wrap);

    const imgs = [...wrap.querySelectorAll('img')];
    await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
    }));
    await new Promise(r => setTimeout(r, 120));

    try {
        const pdfPages = wrap.querySelectorAll('.pdf-page');
        if (pdfPages.length > 0) {
            let isFirstPage = true;
            for (let i = 0; i < pdfPages.length; i++) {
                const pageEl = pdfPages[i];
                await new Promise(r => setTimeout(r, 50));
                const canvas = await window.html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
                if (canvas.width < 10 || canvas.height < 10) continue;
                if (!isFirstPage) pdf.addPage();
                isFirstPage = false;
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
            }
        } else {
            const canvas = await window.html2canvas(wrap, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const imgWidth = canvas.width, imgHeight = canvas.height;
            const pageHeightPx = Math.floor(imgWidth * (pageH / pageW));
            let position = 0, pageIndex = 0;
            while (position < imgHeight - 20) {
                if (pageIndex > 0) pdf.addPage();
                const sliceH = Math.min(pageHeightPx, imgHeight - position);
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = imgWidth; pageCanvas.height = sliceH;
                const ctx = pageCanvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(canvas, 0, position, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
                pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, (sliceH / imgWidth) * pageW);
                position += pageHeightPx;
                pageIndex++;
            }
        }
        return pdf.output('blob');
    } finally {
        document.body.removeChild(wrap);
    }
}

export async function savePdfBlob(blob, fileName, category, subfolder) {
    let base64 = null;
    try {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        base64 = btoa(binary);
    } catch (e) { console.warn('[PDF] base64 encode failed:', e); }

    if (base64) {
        const res = await saveFileToServer(category, subfolder, fileName, base64, true);
        if (res.ok) return res;
    }
    downloadBlob(blob, fileName, 3000);
    return { ok: true, name: fileName, viaServer: false };
}

export async function saveReportToFolder({ key, defaultName, dialogTitle, html, orientation, category, subfolder, destinationHint }) {
    const name = await askFileNameWithPath({
        title: dialogTitle, defaultName, destinationHint, storageKey: key, saveLabel: '💾 Сохранить PDF',
    });
    if (!name) return;

    setStatus('Формирование PDF…');
    try {
        const blob = await generatePdfBlob(html, orientation);
        const res = await savePdfBlob(blob, name + '.pdf', category, subfolder);
        if (res.ok) {
            setStatus(res.viaServer ? `✓ PDF сохранён: ${res.path}` : `PDF скачан в загрузки`);
        }
    } catch (err) {
        console.error('PDF error:', err);
        alert('Ошибка PDF: ' + err.message);
        setStatus('');
    }
}