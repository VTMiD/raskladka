// GsCAM/simulation.js
import { parseGcode, segmentOps } from './gcode-parser.js';
import { readParams } from '../js/params.js';

const SIM_SPEED_KEY = 'raskladka.simSpeed.v1';
const SIM_SOUND_KEY = 'raskladka.simSound.v1';
const SPEED_OPTIONS = [1, 5, 10, 20, 30, 50, 100];

function loadSimSpeed() {
  try {
    const v = parseFloat(localStorage.getItem(SIM_SPEED_KEY));
    if (isFinite(v) && SPEED_OPTIONS.includes(v)) return v;
  } catch (_) {}
  return 20;
}
function saveSimSpeed(v) { try { localStorage.setItem(SIM_SPEED_KEY, String(v)); } catch (_) {} }
function loadSoundEnabled() { try { return localStorage.getItem(SIM_SOUND_KEY) !== 'false'; } catch (_) { return true; } }
function saveSoundEnabled(v) { try { localStorage.setItem(SIM_SOUND_KEY, String(v)); } catch (_) {} }

const PALETTES = {
  default: {
    bg: '#1e1e1e', axis: 'rgba(80,80,80,0.5)', sheetBorder: 'rgba(255,255,255,0.2)',
    rapid: 'rgba(130,130,130,0.75)',
    cutFuture: 'rgba(255,100,100,0.2)', cutCurrent: '#ff3333', cutDone: '#ffffff',
    leadIn: '#ffd24a',
    bbox: '#0080ff', bboxFill: 'rgba(0, 128, 255, 0.08)',
    toolGlow: 'rgba(255,220,80,0.9)', toolCore: '#ffd24a', toolStroke: '#fff'
  },
  sheetcam: {
    bg: '#4a1010', axis: 'rgba(255,200,200,0.15)', sheetBorder: 'rgba(255,255,255,0.25)',
    rapid: 'rgba(100,150,255,0.7)',
    cutFuture: 'rgba(255,255,255,0.1)', cutCurrent: '#ff8c2a', cutDone: '#ffffff',
    leadIn: '#00ffff',
    bbox: '#4488ff', bboxFill: 'rgba(68, 136, 255, 0.08)',
    toolGlow: 'rgba(255,255,255,0.9)', toolCore: '#ffffff', toolStroke: '#4488ff'
  }
};

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

class PlasmaSound {
  constructor() { this.ctx = null; this.masterGain = null; this.isPlaying = false; this.enabled = loadSoundEnabled(); }
  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 2500;
      noiseFilter.Q.value = 1.5;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 30;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.4;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = 0.6;
      lfo.connect(lfoGain);
      lfoGain.connect(noiseGain.gain);
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      const oscFilter = this.ctx.createBiquadFilter();
      oscFilter.type = 'lowpass';
      oscFilter.frequency.value = 400;
      const oscGain = this.ctx.createGain();
      oscGain.gain.value = 0.3;
      const distortion = this.ctx.createWaveShaper();
      distortion.curve = makeDistortionCurve(50);
      distortion.oversample = '4x';
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(distortion);
      osc.connect(oscFilter);
      oscFilter.connect(oscGain);
      oscGain.connect(distortion);
      distortion.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      noise.start(0);
      osc.start(0);
      lfo.start(0);
    } catch (e) { console.warn('Не удалось инициализировать звук:', e); }
  }
  setTorch(on) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (on && !this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.1);
      this.isPlaying = true;
    } else if (!on && this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.isPlaying = false;
    }
  }
  setEnabled(val) { this.enabled = val; saveSoundEnabled(val); if (!val) this.setTorch(false); }
  stop() { this.setTorch(false); if (this.ctx) { try { this.ctx.close(); } catch (_) {} this.ctx = null; } }
}

export function openSimulation(gcodeText, title = 'Симуляция резки') {
  const existing = document.getElementById('gscam-sim-overlay');
  if (existing) existing.remove();

  const ops = parseGcode(gcodeText);
  if (!ops.length) { alert('В G-коде нет движений — нечего симулировать'); return; }
  const segs = segmentOps(ops);

  let maxFeed = 1500;
  for (const s of segs) if (s.feed && s.feed > maxFeed) maxFeed = s.feed;

  let sheetW = 0, sheetH = 0, sheetPolys = null;
  try {
    const params = readParams();
    sheetW = params.sheetW;
    sheetH = params.sheetH;
    sheetPolys = params.sheetPolygons;
  } catch (_) {}

  const theme = localStorage.getItem('raskladka.theme') || 'default';
  const palette = PALETTES[theme] || PALETTES.default;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (sheetPolys && sheetPolys.length) {
    for (const ring of sheetPolys) for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  } else if (sheetW > 0 && sheetH > 0) {
    minX = 0; minY = 0; maxX = sheetW; maxY = sheetH;
  }

  const contourBBox = new Map();
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    if (s.contourId > 0) {
      let bb = contourBBox.get(s.contourId);
      if (!bb) { bb = [Infinity, Infinity, -Infinity, -Infinity]; contourBBox.set(s.contourId, bb); }
      bb[0] = Math.min(bb[0], s.a[0], s.b[0]);
      bb[1] = Math.min(bb[1], s.a[1], s.b[1]);
      bb[2] = Math.max(bb[2], s.a[0], s.b[0]);
      bb[3] = Math.max(bb[3], s.a[1], s.b[1]);
    }
  }
  const pad = 20;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  let totalLen = 0;
  for (const s of segs) totalLen += s.len;

  const savedSpeed = loadSimSpeed();
  const soundEngine = new PlasmaSound();

  injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'gscam-sim-overlay';
  overlay.className = 'gscam-sim-overlay';
  overlay.innerHTML = `
    <div class="gscam-sim-panel">
      <div class="gscam-sim-header">
        <span>▶ ${title}</span>
        <span class="gscam-sim-title-info">${ops.length} операций · ${Math.round(totalLen)} мм · контуров: ${contourBBox.size}</span>
        <button class="gscam-sim-sound-btn" id="btnSimSound" title="${soundEngine.enabled ? 'Выключить звук' : 'Включить звук'}">
          ${soundEngine.enabled ? '🔊' : '🔇'}
        </button>
        <button class="gscam-sim-close" title="Закрыть">✕</button>
      </div>
      <div class="gscam-sim-canvas-wrap">
        <canvas class="gscam-sim-canvas"></canvas>
        <div class="gscam-sim-hud">
          <div class="gscam-sim-hud-section">📐 Положение</div>
          <div class="gscam-sim-hud-row">
            <span class="gscam-sim-hud-label">X</span>
            <span class="gscam-sim-hud-val" data-hud="x">0.0</span>
            <span class="gscam-sim-hud-unit">мм</span>
          </div>
          <div class="gscam-sim-hud-row">
            <span class="gscam-sim-hud-label">Y</span>
            <span class="gscam-sim-hud-val" data-hud="y">0.0</span>
            <span class="gscam-sim-hud-unit">мм</span>
          </div>
          <div class="gscam-sim-hud-divider"></div>
          <div class="gscam-sim-hud-section">⚡ Подача</div>
          <div class="gscam-sim-hud-speed" data-hud="speed">F0</div>
          <div class="gscam-sim-hud-state" data-hud="state">—</div>
        </div>
      </div>
      <div class="gscam-sim-controls">
        <button class="gscam-sim-btn" data-act="reset" title="В начало">⏮</button>
        <button class="gscam-sim-btn primary" data-act="play" title="Пуск/пауза">▶</button>
        <label class="gscam-sim-speed">
          Скорость:
          <select>
            ${SPEED_OPTIONS.map(v => `<option value="${v}" ${v === savedSpeed ? 'selected' : ''}>${v}×</option>`).join('')}
          </select>
        </label>
        <input type="range" class="gscam-sim-progress" min="0" max="1000" value="0">
        <span class="gscam-sim-status">Готов</span>
      </div>
      <div class="gscam-sim-info">
        <span data-info="line">Строка: —</span>
        <span data-info="op">Операция: —</span>
        <span data-info="contour">Контур: —</span>
        <span data-info="prog">0%</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.gscam-sim-canvas');
  const ctx = canvas.getContext('2d');
  const btnPlay = overlay.querySelector('[data-act="play"]');
  const btnReset = overlay.querySelector('[data-act="reset"]');
  const btnSound = overlay.querySelector('#btnSimSound');
  const speedSel = overlay.querySelector('.gscam-sim-speed select');
  const progressEl = overlay.querySelector('.gscam-sim-progress');
  const statusEl = overlay.querySelector('.gscam-sim-status');
  const lineEl = overlay.querySelector('[data-info="line"]');
  const opEl = overlay.querySelector('[data-info="op"]');
  const contourEl = overlay.querySelector('[data-info="contour"]');
  const progEl = overlay.querySelector('[data-info="prog"]');

  const hudX = overlay.querySelector('[data-hud="x"]');
  const hudY = overlay.querySelector('[data-hud="y"]');
  const hudSpeed = overlay.querySelector('[data-hud="speed"]');
  const hudState = overlay.querySelector('[data-hud="state"]');

  const state = { 
    progress: 0, playing: false, speed: savedSpeed, 
    lastTs: 0, rafId: null, view: null,
    slowPierceUntil: 0, lastSlowFeed: 0 
  };
  const MM_PER_SEC = 40;

  function computeView() {
    const rect = canvas.getBoundingClientRect();
    const m = 20;
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min((rect.width - 2 * m) / w, (rect.height - 2 * m) / h);
    return {
      scale,
      ox: (rect.width - w * scale) / 2 - minX * scale,
      oy: (rect.height - h * scale) / 2 + maxY * scale,
    };
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.view = computeView();
  }
  function toPx(p) { const v = state.view; return [v.ox + p[0] * v.scale, v.oy - p[1] * v.scale]; }

  function draw() {
    const v = state.view;
    if (!v) return;
    const rect = canvas.getBoundingClientRect();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    const [x0, y0] = toPx([0, 0]);
    ctx.beginPath();
    ctx.moveTo(x0, 0); ctx.lineTo(x0, rect.height);
    ctx.moveTo(0, y0); ctx.lineTo(rect.width, y0);
    ctx.stroke();

    ctx.strokeStyle = palette.sheetBorder;
    ctx.lineWidth = 1.5;
    if (sheetPolys && sheetPolys.length) {
      for (const ring of sheetPolys) {
        if (ring.length < 2) continue;
        ctx.beginPath();
        const [rx0, ry0] = toPx(ring[0]);
        ctx.moveTo(rx0, ry0);
        for (let i = 1; i < ring.length; i++) {
          const [rx, ry] = toPx(ring[i]);
          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (sheetW > 0 && sheetH > 0) {
      const [p1x, p1y] = toPx([0, sheetH]);
      const [p2x, p2y] = toPx([sheetW, 0]);
      const x = Math.min(p1x, p2x), y = Math.min(p1y, p2y);
      const w = Math.abs(p2x - p1x), h = Math.abs(p2y - p1y);
      ctx.strokeRect(x, y, w, h);
    }

    let currentContourId = 0, currentOpIdx = -1, currentLineNo = 0;
    let currentKind = '—', isTorchOn = false, currentFeed = maxFeed;
    const completedContours = new Set();
    let scanLen = 0;

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      scanLen += s.len;
      const nextCid = (i + 1 < segs.length) ? segs[i + 1].contourId : 0;
      if (s.contourId > 0 && s.contourId !== nextCid && scanLen <= state.progress) completedContours.add(s.contourId);
      const segStart = scanLen - s.len;
      if (segStart < state.progress && scanLen >= state.progress) {
        currentContourId = s.contourId || 0;
        currentOpIdx = s.opIdx;
        currentLineNo = s.lineNo || 0;
        currentKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
        isTorchOn = s.torch && s.type !== 'rapid';
        currentFeed = s.feed || maxFeed;
      }
    }

    if (state.playing) soundEngine.setTorch(isTorchOn);
    else soundEngine.setTorch(false);

    let curLen = 0;
    for (const s of segs) {
      const segStart = curLen;
      const segEnd = curLen + s.len;
      const isDone = segStart >= state.progress;
      const isPartial = !isDone && segEnd > state.progress;
      let endT = 1;
      if (isDone) { curLen += s.len; continue; }
      if (isPartial) endT = (state.progress - segStart) / s.len;

      const a = s.a, b = s.b;
      const bx = a[0] + (b[0] - a[0]) * endT;
      const by = a[1] + (b[1] - a[1]) * endT;
      const [pax, pay] = toPx(a);
      const [pbx, pby] = toPx([bx, by]);

      const isCurrentContour = currentContourId > 0 && s.contourId === currentContourId;
      const isDoneContour = s.contourId > 0 && completedContours.has(s.contourId) && !isCurrentContour;

      if (s.type === 'rapid') { ctx.strokeStyle = palette.rapid; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); }
      else if (s.leadIn) { ctx.strokeStyle = isDoneContour ? palette.cutDone : palette.leadIn; ctx.lineWidth = isCurrentContour ? 3 : 2; ctx.setLineDash([]); }
      else if (s.torch) {
        if (isCurrentContour) { ctx.strokeStyle = palette.cutCurrent; ctx.lineWidth = 3; }
        else if (isDoneContour) { ctx.strokeStyle = palette.cutDone; ctx.lineWidth = 2; }
        else { ctx.strokeStyle = palette.cutFuture; ctx.lineWidth = 1.5; }
        ctx.setLineDash([]);
      } else { ctx.strokeStyle = palette.rapid; ctx.lineWidth = 1; ctx.setLineDash([]); }

      ctx.beginPath();
      ctx.moveTo(pax, pay); ctx.lineTo(pbx, pby);
      ctx.stroke();
      ctx.setLineDash([]);

      if (s.leadIn && endT > 0 && endT < 1 && !isDoneContour) {
        ctx.fillStyle = palette.leadIn;
        ctx.beginPath();
        ctx.arc(pax, pay, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      curLen += s.len;
    }

    if (currentContourId > 0) {
      const bb = contourBBox.get(currentContourId);
      if (bb) {
        const [p1x, p1y] = toPx([bb[0], bb[3]]);
        const [p2x, p2y] = toPx([bb[2], bb[1]]);
        const x = Math.min(p1x, p2x), y = Math.min(p1y, p2y);
        const w = Math.abs(p2x - p1x), h = Math.abs(p2y - p1y);
        ctx.fillStyle = palette.bboxFill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = palette.bbox;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    }

    const pos = pointAtProgress(segs, state.progress);
    if (pos) {
      const [px, py] = toPx(pos);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 16);
      grad.addColorStop(0, palette.toolGlow);
      grad.addColorStop(0.4, palette.toolGlow.replace('0.9', '0.5'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = palette.toolCore;
      ctx.strokeStyle = palette.toolStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      const showSlowBadge = state.slowPierceUntil && performance.now() < state.slowPierceUntil;

      if (showSlowBadge) {
        ctx.fillStyle = '#ff00ff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 12;
        ctx.fillText(`⚡ МЕДЛЕННЫЙ ВРЕЗ (F${Math.round(state.lastSlowFeed)})`, px + 20, py - 20);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      hudX.textContent = pos[0].toFixed(1);
      hudY.textContent = pos[1].toFixed(1);
    } else {
      hudX.textContent = '—';
      hudY.textContent = '—';
    }

    if (state.slowPierceUntil && performance.now() < state.slowPierceUntil) {
      hudSpeed.textContent = `F${Math.round(state.lastSlowFeed)}`;
      hudSpeed.className = 'gscam-sim-hud-speed slow';
      hudState.textContent = '⚡ Медленный врез';
    } else {
      hudSpeed.textContent = `F${Math.round(currentFeed)}`;
      hudSpeed.className = 'gscam-sim-hud-speed';
      if (currentKind === 'rapid') {
        hudSpeed.classList.add('rapid');
        hudState.textContent = '⏩ Холостой ход';
      } else if (currentKind === 'lead-in') {
        hudState.textContent = '🎯 Врезание';
      } else if (currentKind === 'cut') {
        hudState.textContent = '🔥 Резка';
      } else {
        hudState.textContent = '—';
      }
    }

    drawLegend(rect);

    ctx.fillStyle = theme === 'sheetcam' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.5)';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(`1 px = ${(1 / v.scale).toFixed(2)} мм`, 10, rect.height - 70);

    const pct = totalLen > 0 ? Math.round(100 * state.progress / totalLen) : 0;
    progEl.textContent = pct + '%';
    lineEl.textContent = currentLineNo ? `Строка: N${String(currentLineNo).padStart(4, '0')}` : 'Строка: —';
    opEl.textContent = `Операция: ${currentOpIdx >= 0 ? '#' + (currentOpIdx + 1) : '—'}`;
    contourEl.textContent = currentContourId > 0 ? `Контур: #${currentContourId} / ${contourBBox.size}` : `Контур: — / ${contourBBox.size}`;
    progressEl.value = String(Math.round(1000 * state.progress / Math.max(1, totalLen)));

    if (state.slowPierceUntil && performance.now() < state.slowPierceUntil) {
      statusEl.textContent = `⚡ Медленный врез (был F${Math.round(state.lastSlowFeed)})`;
    } else if (currentKind === 'rapid') {
      statusEl.textContent = '⏩ Холостой ход';
    } else if (currentKind === 'lead-in') {
      statusEl.textContent = '🎯 Врезание';
    } else if (currentKind === 'cut') {
      statusEl.textContent = `🔥 Резка (F${Math.round(currentFeed)})`;
    } else {
      statusEl.textContent = state.playing ? '…' : 'Пауза';
    }
  }

  function drawLegend(rect) {
    const x = 12, y = rect.height - 55;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const items = [
      { color: palette.cutDone, label: 'Вырезано', dash: [] },
      { color: palette.cutCurrent, label: 'Текущий рез', dash: [] },
      { color: palette.leadIn, label: 'Врезание', dash: [] },
      { color: palette.rapid, label: 'Холостой ход', dash: [4, 4] },
      { color: palette.bbox, label: 'Рамка контура', dash: [6, 4] },
    ];
    let cx = x;
    for (const it of items) {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(it.dash);
      ctx.beginPath();
      ctx.moveTo(cx, y); ctx.lineTo(cx + 18, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = theme === 'sheetcam' ? '#aaa' : '#bbb';
      ctx.fillText(it.label, cx + 23, y + 1);
      cx += 23 + ctx.measureText(it.label).width + 14;
    }
    ctx.restore();
  }

  function pointAtProgress(segs, target) {
    let cur = 0;
    for (const s of segs) {
      if (cur + s.len >= target) {
        const t = s.len > 0 ? (target - cur) / s.len : 0;
        return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      }
      cur += s.len;
    }
    const last = segs[segs.length - 1];
    return last ? last.b : null;
  }

  // ═══ ФУНКЦИЯ ПРОВЕРКИ ПРОСКОКА ЧЕРЕЗ МЕДЛЕННЫЙ ВРЕЗ ═══
  function checkSlowPierceBetween(p1, p2) {
    let curLen = 0;
    for (const s of segs) {
      const segStart = curLen;
      const segEnd = curLen + s.len;
      
      // Если интервал (p1, p2] пересекается с [segStart, segEnd)
      if (segStart < p2 && segEnd > p1) {
        if (s.leadIn && s.feed < maxFeed * 0.9) {
          state.slowPierceUntil = performance.now() + 2000;
          state.lastSlowFeed = s.feed;
          break;
        }
      }
      curLen = segEnd;
    }
  }

  function tick(ts) {
    if (!state.playing) { state.rafId = null; return; }
    if (!state.lastTs) state.lastTs = ts;
    const dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;

    let currentFeed = maxFeed, currentKind = 'cut', curLen = 0;
    for (const s of segs) {
      if (curLen + s.len >= state.progress) {
        currentFeed = s.feed || maxFeed;
        currentKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
        break;
      }
      curLen += s.len;
    }

    let speedFactor = 1.0;
    if (currentKind === 'rapid') speedFactor = 3.0;
    else if (currentKind === 'lead-in') {
      speedFactor = currentFeed / maxFeed;
      if (speedFactor < 0.9) speedFactor = 0.1;
    }

    const oldProgress = state.progress;
    const mmPerSec = MM_PER_SEC * state.speed;
    state.progress = Math.min(totalLen, state.progress + mmPerSec * speedFactor * dt);
    
    // ═══ ПРОВЕРКА: не проскочили ли мы медленный врез? ═══
    if (state.progress > oldProgress) {
      checkSlowPierceBetween(oldProgress, state.progress);
    }
    
    draw();

    if (state.progress >= totalLen) {
      state.playing = false;
      btnPlay.textContent = '▶';
      statusEl.textContent = 'Готово';
      state.rafId = null;
      soundEngine.setTorch(false);
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (state.progress >= totalLen) state.progress = 0;
    state.playing = true;
    state.lastTs = 0;
    btnPlay.textContent = '⏸';
    statusEl.textContent = 'Идёт резка…';
    soundEngine.init();
    if (!state.rafId) state.rafId = requestAnimationFrame(tick);
  }
  function pause() {
    state.playing = false;
    btnPlay.textContent = '▶';
    statusEl.textContent = 'Пауза';
    soundEngine.setTorch(false);
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  btnPlay.addEventListener('click', () => { if (state.playing) pause(); else play(); });
  
  btnReset.addEventListener('click', () => { 
    pause(); 
    state.progress = 0; 
    state.slowPierceUntil = 0;
    state.lastSlowFeed = 0;
    statusEl.textContent = 'В начало'; 
    soundEngine.setTorch(false); 
    draw(); 
  });
  
  btnSound.addEventListener('click', () => {
    const newVal = !soundEngine.enabled;
    soundEngine.setEnabled(newVal);
    btnSound.textContent = newVal ? '🔊' : '🔇';
    btnSound.title = newVal ? 'Выключить звук' : 'Включить звук';
  });
  
  speedSel.addEventListener('change', () => { state.speed = parseFloat(speedSel.value) || 20; saveSimSpeed(state.speed); });
  
  progressEl.addEventListener('input', () => {
    const v = parseInt(progressEl.value, 10) / 1000;
    state.progress = totalLen * v;
    soundEngine.setTorch(false);
    draw();
  });
  
  overlay.querySelector('.gscam-sim-close').addEventListener('click', () => { pause(); soundEngine.stop(); overlay.remove(); });
  
  window.addEventListener('resize', () => { if (!document.body.contains(overlay)) return; resize(); draw(); });
  
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      pause(); soundEngine.stop(); overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  requestAnimationFrame(() => {
    resize();
    draw();
    setTimeout(() => { if (document.body.contains(overlay)) play(); }, 300);
  });
}

function injectStyles() {
  if (document.getElementById('gscam-sim-styles')) return;
  const s = document.createElement('style');
  s.id = 'gscam-sim-styles';
  s.textContent = `
    .gscam-sim-overlay {
      position: fixed; inset: 0; z-index: 3000;
      background: rgba(10, 12, 20, 0.95);
      display: flex; align-items: center; justify-content: center;
    }
    .gscam-sim-panel {
      width: min(95vw, 1200px);
      height: min(90vh, 800px);
      background: #2b2b2b;
      border-radius: 8px;
      display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,0.6);
      overflow: hidden;
      border: 1px solid #444;
    }
    .gscam-sim-header {
      padding: 10px 16px;
      background: #004a99;
      color: #fff;
      font-weight: 600;
      display: flex; align-items: center; gap: 14px;
      flex-shrink: 0;
    }
    .gscam-sim-title-info {
      font-size: 12px; font-weight: 400; opacity: 0.8; margin-left: auto;
    }
    .gscam-sim-sound-btn {
      background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff;
      font-size: 16px; cursor: pointer; padding: 2px 8px; border-radius: 4px;
      margin-right: 8px;
    }
    .gscam-sim-sound-btn:hover { background: rgba(255,255,255,0.15); }
    .gscam-sim-close {
      background: transparent; border: none; color: #fff;
      font-size: 18px; cursor: pointer; padding: 2px 8px; border-radius: 4px;
    }
    .gscam-sim-close:hover { background: rgba(255,255,255,0.15); }
    .gscam-sim-canvas-wrap {
      flex: 1 1 auto; position: relative; overflow: hidden;
    }
    .gscam-sim-canvas {
      display: block; width: 100%; height: 100%;
      cursor: crosshair;
    }

    .gscam-sim-hud {
      position: absolute;
      left: 14px;
      top: 14px;
      background: rgba(15, 20, 30, 0.94);
      border: 1px solid rgba(100, 150, 255, 0.45);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      color: #e0e0e0;
      min-width: 170px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.7);
      backdrop-filter: blur(6px);
      z-index: 10;
      pointer-events: none;
      user-select: none;
    }
    .gscam-sim-hud-section {
      font-size: 10px;
      text-transform: uppercase;
      color: #7a9ac5;
      margin-bottom: 6px;
      letter-spacing: 1px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-weight: 600;
    }
    .gscam-sim-hud-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 5px;
    }
    .gscam-sim-hud-label {
      font-size: 14px;
      font-weight: bold;
      color: #4488ff;
      width: 18px;
    }
    .gscam-sim-hud-val {
      font-size: 20px;
      font-weight: bold;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
      min-width: 80px;
      text-align: right;
      text-shadow: 0 0 8px rgba(80, 130, 255, 0.3);
    }
    .gscam-sim-hud-unit {
      font-size: 10px;
      color: #7a9ac5;
    }
    .gscam-sim-hud-divider {
      height: 1px;
      background: rgba(100, 150, 255, 0.25);
      margin: 10px 0;
    }
    .gscam-sim-hud-speed {
      font-size: 18px;
      font-weight: bold;
      color: #ffd24a;
      font-variant-numeric: tabular-nums;
      margin-bottom: 4px;
      transition: color 0.2s;
    }
    .gscam-sim-hud-speed.slow {
      color: #ff00ff;
      text-shadow: 0 0 12px rgba(255, 0, 255, 0.8);
      animation: hudPulse 0.7s ease-in-out infinite;
    }
    .gscam-sim-hud-speed.rapid {
      color: #90a0b0;
    }
    .gscam-sim-hud-state {
      font-size: 11px;
      color: #a0b0c0;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    @keyframes hudPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.65; transform: scale(1.03); }
    }

    .gscam-sim-controls {
      padding: 10px 16px; background: #1e1e1e;
      display: flex; align-items: center; gap: 12px;
      border-top: 1px solid #444;
      flex-shrink: 0;
    }
    .gscam-sim-btn {
      padding: 6px 14px; font-size: 14px; cursor: pointer;
      background: #3a3a3a; border: 1px solid #555; color: #ddd;
      border-radius: 4px;
    }
    .gscam-sim-btn:hover { background: #4a4a4a; }
    .gscam-sim-btn.primary {
      background: #0066cc; border-color: #0050a0; color: #fff;
      min-width: 50px; font-weight: bold;
    }
    .gscam-sim-btn.primary:hover { background: #0050a0; }
    .gscam-sim-speed {
      font-size: 12px; color: #aaa;
      display: flex; align-items: center; gap: 6px;
    }
    .gscam-sim-speed select {
      padding: 3px 6px; background: #2a2a2a; color: #ddd;
      border: 1px solid #555; border-radius: 3px;
      font-size: 12px;
    }
    .gscam-sim-progress {
      flex: 1; min-width: 100px;
      accent-color: #0066cc;
    }
    .gscam-sim-status {
      font-size: 12px; color: #ccc;
      min-width: 160px; text-align: right;
      font-weight: 600;
    }
    .gscam-sim-info {
      padding: 6px 16px; background: #141414;
      display: flex; gap: 20px;
      font: 11px monospace; color: #999;
      border-top: 1px solid #2a2a2a;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(s);
}