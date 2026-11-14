// js/dialogs/qr-scanner.js
import { state, profilesStore, genId } from '../state.js';
import { setStatus, isServerAvailable } from '../utils.js';
import { parseDxfText } from '../dxf-import.js';
import { readParams, saveProfiles, renderProfileSelect, updateSumGap, updateActiveProfileFromFields } from '../params.js';
import { draw, resetCamera } from '../canvas.js';
import { renderPartsTable } from '../parts.js';
import { updateReport } from '../report/report.js';
import { pushHistory } from '../history.js';
import { loadProjectFromServer } from './project-manager.js';

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.15);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { console.warn('Звук не поддерживается:', e); }
}

async function loadPartFromFolder(fileName, resultEl) {
    if (!isServerAvailable()) {
        const msg = '⚠ Загрузка детали по QR доступна только при запущенном локальном сервере (папка «Детали»).';
        setStatus(msg);
        if (resultEl) resultEl.textContent = msg;
        return;
    }
    const fullName = fileName.toLowerCase().endsWith('.dxf') ? fileName : fileName + '.dxf';
    try {
        const response = await fetch('/api/get-dxf?name=' + encodeURIComponent(fullName));
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Файл не найден');
        }
        const text = await response.text();
        const part = parseDxfText(text, fullName);
        part.qty = 1;
        part.dxfText = text;
        const existing = state.parts.find(p => p.name.toLowerCase() === part.name.toLowerCase());
        let msg;
        if (existing) {
            existing.qty++;
            msg = `✅ Деталь «${part.name}» добавлена (кол-во: ${existing.qty})`;
        } else {
            state.parts.push(part);
            msg = `✅ Деталь «${part.name}» добавлена в список`;
        }
        setStatus(msg);
        if (resultEl) resultEl.textContent = msg;
        renderPartsTable();
        draw();
        pushHistory();
    } catch (err) {
        console.error(err);
        const msg = `❌ Ошибка: Файл ${fullName} не найден в папке Детали!`;
        setStatus(msg);
        if (resultEl) resultEl.textContent = msg;
    }
}

function applyScannedSheetData(data, resultEl) {
    if (!data || typeof data !== 'object') return;
    const map = { inW: data.w, inH: data.h, inThick: data.t !== undefined ? data.t : data.thickness, inEdge: data.edge, inKerf: data.kerf, inGap: data.gap };
    let applied = 0;
    for (const [id, val] of Object.entries(map)) {
        if (val === undefined || val === null || !isFinite(val)) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        el.value = String(val);
        applied++;
    }
    if (!applied) return;

    updateSumGap();
    updateActiveProfileFromFields();

    let msg = '';
    if (data.kind === 'remnant' || data.k === 'r') {
        const p = readParams();
        const name = `Остаток_${data.w}x${data.h}`;
        const newProf = { id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), name, nameCustom: true, params: p };
        profilesStore.profiles.push(newProf);
        profilesStore.activeId = newProf.id;
        saveProfiles();
        renderProfileSelect();
        msg = `✅ Остаток установлен в заготовку: ${data.w} × ${data.h} мм`;
    } else if (data.kind === 'sheet') {
        msg = `✅ Лист установлен в заготовку: ${data.w} × ${data.h} × ${data.t} мм`;
    }
    setStatus(msg);
    if (resultEl) resultEl.textContent = msg;

    resetCamera();
    draw();
    updateReport();
}

export async function openQrScanner() {
    if (!window.jsQR) {
        try {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'js/lib/jsQR.min.js';
                s.onload = res;
                s.onerror = () => rej(new Error('Не удалось загрузить локальный jsQR.min.js'));
                document.head.appendChild(s);
            });
        } catch (err) {
            alert('Не удалось загрузить jsQR.\nУбедитесь, что файл js/lib/jsQR.min.js существует.\n\n' + err.message);
            return;
        }
    }

    const modal = document.createElement('div');
    modal.id = 'qrScanModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
    <div class="modal-window" style="width:560px">
      <div class="modal-header" style="background:#eaf4ff;border-bottom-color:#c9e0f5;color:#004a99">
        <span>📷 Сканирование QR</span>
        <button class="close-btn" id="qrClose" style="color:#004a99">✕</button>
      </div>
      <div class="modal-body" style="text-align:center">
        <div style="position:relative;display:inline-block;max-width:100%">
          <video id="qrVideo" autoplay playsinline muted style="width:100%;max-width:500px;border-radius:6px;border:2px solid #004a99"></video>
          <canvas id="qrCanvas" style="display:none"></canvas>
        </div>
        <div id="qrStatus" style="margin-top:10px;font-size:15px;font-weight:bold;color:#555">Наведите камеру на QR-код:</div>
        <div id="qrResult" style="margin-top:10px;font-size:14px;color:#080;font-weight:bold;white-space:pre-line;text-align:center;background:#ecf9ec;padding:10px;border-radius:6px;border:1px solid #a8e8b8;display:none"></div>
      </div>
      <div class="modal-footer"><button id="qrCloseBtn">Закрыть</button></div>
    </div>`;
    document.body.appendChild(modal);

    const video = modal.querySelector('#qrVideo');
    const canvas = modal.querySelector('#qrCanvas');
    const statusEl = modal.querySelector('#qrStatus');
    const resultEl = modal.querySelector('#qrResult');
    let stream = null;
    let rafId = null;
    let detected = false;

    const stop = () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        video.srcObject = null;
    };
    const close = () => { stop(); modal.remove(); };

    modal.querySelector('#qrClose').addEventListener('click', close);
    modal.querySelector('#qrCloseBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        video.srcObject = stream;
        await video.play();
    } catch (err) {
        statusEl.textContent = '❌ Нет доступа к камере: ' + err.message;
        statusEl.style.color = '#c00';
        return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
        if (detected) return;
        if (!video.videoWidth) { rafId = requestAnimationFrame(scan); return; }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR ? window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }) : null;

        if (code && code.data) {
            detected = true;
            playBeep();
            statusEl.textContent = '✅ QR распознан';
            statusEl.style.color = '#080';
            resultEl.style.display = 'block';
            resultEl.textContent = 'Обработка данных...';

            const cleanData = String(code.data).trim();
            
            if (/^PART:/i.test(cleanData)) {
                loadPartFromFolder(cleanData.replace(/^PART:/i, '').trim(), resultEl);
            } else if (/^SHEET:/i.test(cleanData)) {
                const match = cleanData.match(/^SHEET:(\d+(?:\.\d+)?)[XxХх](\d+(?:\.\d+)?)[XxХх](\d+(?:\.\d+)?)$/i);
                if (match) applyScannedSheetData({ kind: 'sheet', w: parseFloat(match[1]), h: parseFloat(match[2]), t: parseFloat(match[3]) }, resultEl);
            } else if (/^PROJECT:/i.test(cleanData)) {
                const projName = cleanData.replace(/^PROJECT:/i, '').trim();
                loadProjectFromServer(projName, resultEl);
            } else {
                let parsed = null;
                try { parsed = JSON.parse(cleanData); }
                catch (_) {
                    const match = cleanData.match(/^R(\d+)X(\d+)$/i);
                    if (match) parsed = { kind: 'remnant', w: parseInt(match[1], 10), h: parseInt(match[2], 10) };
                }
                if (parsed && (parsed.kind === 'sheet' || parsed.kind === 'remnant' || parsed.k === 'r' || parsed.w || parsed.h)) {
                    applyScannedSheetData(parsed, resultEl);
                }
            }
            stop();
            return;
        }
        rafId = requestAnimationFrame(scan);
    };
    rafId = requestAnimationFrame(scan);
}