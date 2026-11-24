// GsCAM/player-template.js

export function getPlayerTemplate(dataJson) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Симуляция резки</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, sans-serif; }
  body { background: #1e1e1e; color: #ddd; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  header { padding: 10px 16px; background: #004a99; color: #fff; display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
  header .title { font-weight: 600; }
  header .meta { font-size: 12px; opacity: 0.8; margin-left: auto; display: flex; gap: 14px; }
  #btnSound { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; font-size: 16px; cursor: pointer; padding: 2px 8px; border-radius: 4px; margin-right: 8px;}
  #btnSound:hover { background: rgba(255,255,255,0.15); }
  #wrap { flex: 1 1 auto; position: relative; overflow: hidden; }
  #cv { display: block; width: 100%; height: 100%; }
  footer { padding: 10px 16px; background: #141414; border-top: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px; flex-shrink: 0; flex-wrap: wrap; }
  footer button { padding: 6px 14px; font-size: 13px; cursor: pointer; background: #3a3a3a; border: 1px solid #555; color: #ddd; border-radius: 4px; }
  footer button:hover { background: #4a4a4a; }
  footer button.primary { background: #0066cc; border-color: #0050a0; color: #fff; min-width: 50px; font-weight: bold; }
  footer button.primary:hover { background: #0050a0; }
  footer .speed { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 6px; }
  footer .speed select { padding: 3px 6px; background: #2a2a2a; color: #ddd; border: 1px solid #555; border-radius: 3px; font-size: 12px; }
  footer input[type=range] { flex: 1; min-width: 100px; accent-color: #0066cc; }
  footer .status { font-size: 12px; color: #ccc; min-width: 140px; text-align: right; font-weight: 600; }
  footer .info { font: 11px monospace; color: #999; }

  .sim-hud {
    position: absolute; left: 14px; top: 14px;
    background: rgba(15, 20, 30, 0.94);
    border: 1px solid rgba(100, 150, 255, 0.45);
    border-radius: 8px; padding: 12px 16px;
    font-family: 'Consolas', 'Monaco', monospace;
    color: #e0e0e0; min-width: 170px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.7);
    backdrop-filter: blur(6px); z-index: 10;
    pointer-events: none; user-select: none;
  }
  .sim-hud-section {
    font-size: 10px; text-transform: uppercase;
    color: #7a9ac5; margin-bottom: 6px;
    letter-spacing: 1px; font-family: system-ui, sans-serif;
    font-weight: 600;
  }
  .sim-hud-row {
    display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px;
  }
  .sim-hud-label { font-size: 14px; font-weight: bold; color: #4488ff; width: 18px; }
  .sim-hud-val {
    font-size: 20px; font-weight: bold; color: #fff;
    font-variant-numeric: tabular-nums; min-width: 80px;
    text-align: right; text-shadow: 0 0 8px rgba(80, 130, 255, 0.3);
  }
  .sim-hud-unit { font-size: 10px; color: #7a9ac5; }
  .sim-hud-divider { height: 1px; background: rgba(100, 150, 255, 0.25); margin: 10px 0; }
  .sim-hud-speed {
    font-size: 18px; font-weight: bold; color: #ffd24a;
    font-variant-numeric: tabular-nums; margin-bottom: 4px;
    transition: color 0.2s;
  }
  .sim-hud-speed.slow {
    color: #ff00ff; text-shadow: 0 0 12px rgba(255, 0, 255, 0.8);
    animation: hudPulse 0.7s ease-in-out infinite;
  }
  .sim-hud-speed.rapid { color: #90a0b0; }
  .sim-hud-state { font-size: 11px; color: #a0b0c0; font-family: system-ui, sans-serif; }
  @keyframes hudPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.65; transform: scale(1.03); }
  }
</style>
</head>
<body>
<header>
  <span class="title">▶ Симуляция резки</span>
  <span class="meta" id="metaInfo"></span>
  <button id="btnSound" title="Включить/выключить звук">🔊</button>
</header>
<div id="wrap">
  <canvas id="cv"></canvas>
  <div class="sim-hud">
    <div class="sim-hud-section">📐 Положение</div>
    <div class="sim-hud-row"><span class="sim-hud-label">X</span><span class="sim-hud-val" data-hud="x">0.0</span><span class="sim-hud-unit">мм</span></div>
    <div class="sim-hud-row"><span class="sim-hud-label">Y</span><span class="sim-hud-val" data-hud="y">0.0</span><span class="sim-hud-unit">мм</span></div>
    <div class="sim-hud-divider"></div>
    <div class="sim-hud-section">⚡ Подача</div>
    <div class="sim-hud-speed" data-hud="speed">F0</div>
    <div class="sim-hud-state" data-hud="state">—</div>
  </div>
</div>
<footer>
  <button id="btnReset" title="В начало">⏮</button>
  <button id="btnPlay" class="primary" title="Пуск/пауза">▶</button>
  <label class="speed">Скорость:
    <select id="speedSel">
      <option value="1">1×</option>
      <option value="5">5×</option>
      <option value="10">10×</option>
      <option value="20" selected>20×</option>
      <option value="50">50×</option>
      <option value="100">100×</option>
    </select>
  </label>
  <input type="range" id="prog" min="0" max="1000" value="0">
  <span class="status" id="status">Готов</span>
  <span class="info" id="info"></span>
</footer>
<script>
(function(){
  const DATA = ${dataJson};

  document.title = DATA.title + " — " + DATA.sheetName;
  document.querySelector('header .title').textContent = '▶ ' + DATA.title;
  document.getElementById('metaInfo').innerHTML = \`
    <span>\${DATA.sheetName}</span>
    <span>\${DATA.postName}</span>
    <span>\${DATA.date}</span>
  \`;

  function parseGcode(text) {
    const lines = String(text || '').split(/\\r?\\n/);
    const ops = [];
    let x = 0, y = 0, mode = 'G00', torch = false, lineNo = 0;
    let leadInPending = false, currentCid = 0;
    let currentFeed = 1500;

    for (const raw of lines) {
      lineNo++;
      const cmStart = raw.match(/\\(CONTOUR-START:(\\d+)\\)/i);
      if (cmStart) { currentCid = parseInt(cmStart[1], 10) || 0; continue; }
      if (/\\(CONTOUR-END:\\d+\\)/i.test(raw)) { currentCid = 0; continue; }
      if (/\\(LEAD-IN\\)/i.test(raw)) { leadInPending = true; continue; }

      let s = raw.replace(/\\(.*?\\)/g, '').replace(/;.*$/, '').trim();
      if (!s) continue;
      s = s.replace(/^N\\d+\\s+/i, '').trim();
      if (!s) continue;

      const fm = s.match(/F(-?\\d+(?:\\.\\d+)?)/i);
      if (fm) currentFeed = parseFloat(fm[1]);

      if (/\\bM03\\b/.test(s)) { torch = true; continue; }
      if (/\\bM05\\b/.test(s)) { torch = false; continue; }

      const gm = s.match(/G0?([0-3])\\b/i);
      if (gm) mode = 'G0' + parseInt(gm[1], 10);

      const xm = s.match(/X(-?\\d+(?:\\.\\d+)?)/i);
      const ym = s.match(/Y(-?\\d+(?:\\.\\d+)?)/i);
      const im = s.match(/I(-?\\d+(?:\\.\\d+)?)/i);
      const jm = s.match(/J(-?\\d+(?:\\.\\d+)?)/i);

      if (mode === 'G02' || mode === 'G03') {
        if (!xm && !ym) continue;
        const nx = xm ? parseFloat(xm[1]) : x;
        const ny = ym ? parseFloat(ym[1]) : y;
        const cx = x + (im ? parseFloat(im[1]) : 0);
        const cy = y + (jm ? parseFloat(jm[1]) : 0);
        ops.push({ type: 'arc', from: [x, y], to: [nx, ny], center: [cx, cy],
          ccw: mode === 'G03', torch, leadIn: leadInPending, cid: currentCid, lineNo, feed: currentFeed });
        leadInPending = false; x = nx; y = ny; continue;
      }

      if (!xm && !ym) continue;
      const nx = xm ? parseFloat(xm[1]) : x;
      const ny = ym ? parseFloat(ym[1]) : y;
      ops.push({ type: mode === 'G00' ? 'rapid' : 'cut', from: [x, y], to: [nx, ny],
        torch, leadIn: leadInPending, cid: currentCid, lineNo, feed: currentFeed });
      leadInPending = false; x = nx; y = ny;
    }
    return ops;
  }

  function arcPoints(op, steps) {
    const [sx, sy] = op.from, [ex, ey] = op.to, [cx, cy] = op.center;
    const r = Math.hypot(sx - cx, sy - cy);
    let a1 = Math.atan2(sy - cy, sx - cx);
    let a2 = Math.atan2(ey - cy, ex - cx);
    let sweep;
    if (op.ccw) { sweep = a2 - a1; while (sweep <= 0) sweep += Math.PI * 2; }
    else        { sweep = a2 - a1; while (sweep >= 0) sweep -= Math.PI * 2; }
    const n = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * steps * 2));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a1 + sweep * i / n;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return pts;
  }

  function segmentOps(ops, arcSteps) {
    const segs = [];
    let idx = 0;
    for (const op of ops) {
      if (op.type === 'arc') {
        const pts = arcPoints(op, arcSteps);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          segs.push({ type: 'cut', a, b, len: Math.hypot(b[0]-a[0], b[1]-a[1]),
            torch: op.torch, leadIn: !!op.leadIn, cid: op.cid || 0, lineNo: op.lineNo, idx, feed: op.feed || 1500 });
        }
      } else {
        const a = op.from, b = op.to;
        segs.push({ type: op.type, a, b, len: Math.hypot(b[0]-a[0], b[1]-a[1]),
          torch: op.torch, leadIn: !!op.leadIn, cid: op.cid || 0, lineNo: op.lineNo, idx, feed: op.feed || 1500 });
      }
      idx++;
    }
    return segs;
  }

  const PALETTES = {
    default: {
      bg: '#1e1e1e', axis: 'rgba(80,80,80,0.5)', sheetBorder: 'rgba(255,255,255,0.2)',
      rapid: 'rgba(130,130,130,0.75)', cutFuture: 'rgba(255,100,100,0.2)',
      cutCurrent: '#ff3333', cutDone: '#ffffff', leadIn: '#ffd24a',
      bbox: '#0080ff', bboxFill: 'rgba(0, 128, 255, 0.08)',
      toolGlow: 'rgba(255,220,80,0.9)', toolCore: '#ffd24a', toolStroke: '#fff',
    },
    sheetcam: {
      bg: '#4a1010', axis: 'rgba(255,200,200,0.15)', sheetBorder: 'rgba(255,255,255,0.25)',
      rapid: 'rgba(100,150,255,0.7)', cutFuture: 'rgba(255,255,255,0.1)',
      cutCurrent: '#ff8c2a', cutDone: '#ffffff', leadIn: '#00ffff',
      bbox: '#4488ff', bboxFill: 'rgba(68, 136, 255, 0.08)',
      toolGlow: 'rgba(255,255,255,0.9)', toolCore: '#ffffff', toolStroke: '#4488ff',
    },
  };
  const palette = PALETTES[DATA.theme] || PALETTES.default;

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

  const soundEngine = {
    ctx: null,
    masterGain: null,
    isPlaying: false,
    enabled: true,

    init: function() {
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
      } catch (e) {
        console.warn('Не удалось инициализировать звук:', e);
      }
    },

    setTorch: function(on) {
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
  };

  const ops = parseGcode(DATA.gcode);
  const segs = segmentOps(ops, 24);

  let maxFeed = 1500;
  for (const s of segs) {
    if (s.feed && s.feed > maxFeed) maxFeed = s.feed;
  }

  const SP_KEY = 'raskladka.embeddedPlayer.speed';
  const SND_KEY = 'raskladka.embeddedPlayer.sound';
  const SPEED_OPTIONS = [1, 5, 10, 20, 50, 100];
  
  function loadSpeed() {
    try {
      const v = parseFloat(localStorage.getItem(SP_KEY));
      if (isFinite(v) && SPEED_OPTIONS.includes(v)) return v;
    } catch (_) {}
    return 20;
  }
  
  function saveSpeed(v) {
    try { localStorage.setItem(SP_KEY, String(v)); } catch (_) {}
  }

  function loadSoundEnabled() {
    try { return localStorage.getItem(SND_KEY) !== 'false'; } catch (_) { return true; }
  }
  
  function saveSoundEnabled(v) {
    try { localStorage.setItem(SND_KEY, String(v)); } catch (_) {}
  }

  soundEngine.enabled = loadSoundEnabled();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let sheetPolys = DATA.sheetPolygons;
  if (sheetPolys && sheetPolys.length) {
    for (const ring of sheetPolys) for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  } else if (DATA.sheetW > 0 && DATA.sheetH > 0) {
    minX = 0; minY = 0; maxX = DATA.sheetW; maxY = DATA.sheetH;
  }
  const contourBBox = new Map();
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    if (s.cid > 0) {
      let bb = contourBBox.get(s.cid);
      if (!bb) { bb = [Infinity, Infinity, -Infinity, -Infinity]; contourBBox.set(s.cid, bb); }
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

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const btnPlay = document.getElementById('btnPlay');
  const btnReset = document.getElementById('btnReset');
  const btnSound = document.getElementById('btnSound');
  const speedSel = document.getElementById('speedSel');
  const progEl = document.getElementById('prog');
  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('info');
  
  const hudX = document.querySelector('[data-hud="x"]');
  const hudY = document.querySelector('[data-hud="y"]');
  const hudSpeed = document.querySelector('[data-hud="speed"]');
  const hudState = document.querySelector('[data-hud="state"]');

  if (!soundEngine.enabled) btnSound.textContent = '🔇';

  const st = {
    progress: 0, playing: false, speed: loadSpeed(),
    lastTs: 0, rafId: null, view: null,
    slowPierceUntil: 0, lastSlowFeed: 0,
  };
  speedSel.value = String(st.speed);

  const MM_PER_SEC = 40;

  function computeView() {
    const rect = cv.getBoundingClientRect();
    const m = 20;
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min((rect.width - 2*m) / w, (rect.height - 2*m) / h);
    const remX = (rect.width - w * scale) / 2;
    const remY = (rect.height - h * scale) / 2;
    return { scale, ox: remX - minX * scale, oy: remY + maxY * scale };
  }

  function resize() {
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st.view = computeView();
  }

  function toPx(p) {
    const v = st.view;
    return [v.ox + p[0] * v.scale, v.oy - p[1] * v.scale];
  }

  function draw() {
    const v = st.view;
    if (!v) return;
    const rect = cv.getBoundingClientRect();

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
    } else if (DATA.sheetW > 0 && DATA.sheetH > 0) {
      const [p1x, p1y] = toPx([0, DATA.sheetH]);
      const [p2x, p2y] = toPx([DATA.sheetW, 0]);
      const x = Math.min(p1x, p2x), y = Math.min(p1y, p2y);
      const w = Math.abs(p2x - p1x), h = Math.abs(p2y - p1y);
      ctx.strokeRect(x, y, w, h);
    }

    let currentCid = 0, curOpIdx = -1, curLineNo = 0, curKind = '—';
    let isTorchOn = false;
    let currentFeed = maxFeed;
    
    const done = new Set();
    let scanLen = 0;

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      scanLen += s.len;

      const nextCid = (i + 1 < segs.length) ? segs[i + 1].cid : 0;
      if (s.cid > 0 && s.cid !== nextCid && scanLen <= st.progress) done.add(s.cid);

      const segStart = scanLen - s.len;
      if (segStart < st.progress && scanLen >= st.progress) {
        currentCid = s.cid || 0;
        curOpIdx = s.idx;
        curLineNo = s.lineNo || 0;
        curKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
        isTorchOn = s.torch && s.type !== 'rapid';
        currentFeed = s.feed || maxFeed;
      }
    }

    if (st.playing) {
      if (isTorchOn) soundEngine.setTorch(true);
      else soundEngine.setTorch(false);
    } else {
      soundEngine.setTorch(false);
    }

    let curLen = 0;
    for (const s of segs) {
      const segStart = curLen;
      const segEnd = curLen + s.len;
      const isDone = segStart >= st.progress;
      const isPartial = !isDone && segEnd > st.progress;

      let endT = 1;
      if (isDone) { curLen += s.len; continue; }
      if (isPartial) endT = (st.progress - segStart) / s.len;

      const a = s.a, b = s.b;
      const bx = a[0] + (b[0] - a[0]) * endT;
      const by = a[1] + (b[1] - a[1]) * endT;
      const [pax, pay] = toPx(a);
      const [pbx, pby] = toPx([bx, by]);

      const isCur = currentCid > 0 && s.cid === currentCid;
      const isDoneC = s.cid > 0 && done.has(s.cid) && !isCur;

      if (s.type === 'rapid') {
        ctx.strokeStyle = palette.rapid;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
      } else if (s.leadIn) {
        ctx.strokeStyle = isDoneC ? palette.cutDone : palette.leadIn;
        ctx.lineWidth = isCur ? 3 : 2;
        ctx.setLineDash([]);
      } else if (s.torch) {
        if (isCur) { ctx.strokeStyle = palette.cutCurrent; ctx.lineWidth = 3; }
        else if (isDoneC) { ctx.strokeStyle = palette.cutDone; ctx.lineWidth = 2; }
        else { ctx.strokeStyle = palette.cutFuture; ctx.lineWidth = 1.5; }
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = palette.rapid;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(pax, pay); ctx.lineTo(pbx, pby);
      ctx.stroke();
      ctx.setLineDash([]);
      curLen += s.len;
    }

    if (currentCid > 0) {
      const bb = contourBBox.get(currentCid);
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

    const pos = pointAt(segs, st.progress);
    if (pos) {
      const [px, py] = toPx(pos);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 16);
      grad.addColorStop(0, palette.toolGlow);
      grad.addColorStop(0.4, 'rgba(255,180,40,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = palette.toolCore;
      ctx.strokeStyle = palette.toolStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      const showSlowBadge = st.slowPierceUntil && performance.now() < st.slowPierceUntil;

      if (showSlowBadge) {
        ctx.fillStyle = '#ff00ff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 12;
        ctx.fillText('⚡ МЕДЛЕННЫЙ ВРЕЗ (F' + Math.round(st.lastSlowFeed) + ')', px + 20, py - 20);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ═══ БЕЙДЖ ДЛЯ ЕДИНОГО РЕЗА ═══
      if (curKind === 'rapid' && st.progress > 0) {
        let prevKind = '—';
        let prevLen = 0;
        for (const s of segs) {
          if (prevLen + s.len >= st.progress - 1) {
            prevKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
            break;
          }
          prevLen += s.len;
        }
        if (prevKind === 'cut') {
          ctx.fillStyle = '#00ccff';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'left';
          ctx.shadowColor = '#00ccff';
          ctx.shadowBlur = 12;
          ctx.fillText('✂ ЕДИНЫЙ РЕЗ (холостой ход)', px + 20, py - 20);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#00ccff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      hudX.textContent = pos[0].toFixed(1);
      hudY.textContent = pos[1].toFixed(1);
    } else {
      hudX.textContent = '—';
      hudY.textContent = '—';
    }

    if (st.slowPierceUntil && performance.now() < st.slowPierceUntil) {
      hudSpeed.textContent = 'F' + Math.round(st.lastSlowFeed);
      hudSpeed.className = 'sim-hud-speed slow';
      hudState.textContent = '⚡ Медленный врез';
    } else if (curKind === 'rapid') {
      hudSpeed.classList.add('rapid');
      let prevKind = '—';
      let prevLen = 0;
      for (const s of segs) {
        if (prevLen + s.len >= st.progress - 1) {
          prevKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
          break;
        }
        prevLen += s.len;
      }
      hudState.textContent = (prevKind === 'cut') ? '✂ Единый рез' : '⏩ Холостой ход';
    } else if (curKind === 'lead-in') {
      hudState.textContent = '🎯 Врезание';
    } else if (curKind === 'cut') {
      hudState.textContent = '🔥 Резка (F' + Math.round(currentFeed) + ')';
    } else {
      hudState.textContent = '—';
    }

    const pct = totalLen > 0 ? Math.round(100 * st.progress / totalLen) : 0;
    progEl.value = String(Math.round(1000 * st.progress / Math.max(1, totalLen)));
    infoEl.textContent = \`\${pct}% · \${DATA.sheetName}\`;
    
    if (st.slowPierceUntil && performance.now() < st.slowPierceUntil) {
      statusEl.textContent = '⚡ Медленный врез (был F' + Math.round(st.lastSlowFeed) + ')';
    } else if (curKind === 'rapid') {
      statusEl.textContent = '⏩ Холостой ход';
    } else if (curKind === 'lead-in') {
      statusEl.textContent = '🎯 Врезание';
    } else if (curKind === 'cut') {
      statusEl.textContent = '🔥 Резка (F' + Math.round(currentFeed) + ')';
    } else {
      statusEl.textContent = st.playing ? '…' : 'Пауза';
    }
  }

  function pointAt(segs, target) {
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

  function checkSlowPierceBetween(p1, p2) {
    let curLen = 0;
    for (const s of segs) {
      const segStart = curLen;
      const segEnd = curLen + s.len;
      
      if (segStart < p2 && segEnd > p1) {
        if (s.leadIn && s.feed < maxFeed * 0.9) {
          st.slowPierceUntil = performance.now() + 2000;
          st.lastSlowFeed = s.feed;
          break;
        }
      }
      curLen = segEnd;
    }
  }

  function tick(ts) {
    if (!st.playing) { st.rafId = null; return; }
    if (!st.lastTs) st.lastTs = ts;
    const dt = (ts - st.lastTs) / 1000;
    st.lastTs = ts;

    let currentFeed = maxFeed;
    let curKind = 'cut';
    let curLen = 0;
    for (const s of segs) {
      if (curLen + s.len >= st.progress) {
        currentFeed = s.feed || maxFeed;
        curKind = s.type === 'rapid' ? 'rapid' : s.leadIn ? 'lead-in' : s.torch ? 'cut' : 'idle';
        break;
      }
      curLen += s.len;
    }

    let speedFactor = 1.0;
    if (curKind === 'rapid') speedFactor = 3.0;
    else if (curKind === 'lead-in') {
      speedFactor = currentFeed / maxFeed;
      if (speedFactor < 0.9) speedFactor = 0.1;
    }

    const oldProgress = st.progress;
    st.progress = Math.min(totalLen, st.progress + MM_PER_SEC * st.speed * speedFactor * dt);
    
    if (st.progress > oldProgress) {
      checkSlowPierceBetween(oldProgress, st.progress);
    }
    
    draw();
    
    if (st.progress >= totalLen) {
      st.playing = false;
      btnPlay.textContent = '▶';
      statusEl.textContent = 'Готово';
      st.rafId = null;
      soundEngine.setTorch(false);
      return;
    }
    st.rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (st.progress >= totalLen) st.progress = 0;
    st.playing = true;
    st.lastTs = 0;
    btnPlay.textContent = '⏸';
    statusEl.textContent = 'Идёт резка…';
    soundEngine.init();
    if (!st.rafId) st.rafId = requestAnimationFrame(tick);
  }

  function pause() {
    st.playing = false;
    btnPlay.textContent = '▶';
    statusEl.textContent = 'Пауза';
    soundEngine.setTorch(false);
    if (st.rafId) { cancelAnimationFrame(st.rafId); st.rafId = null; }
  }

  btnPlay.addEventListener('click', () => { st.playing ? pause() : play(); });
  btnReset.addEventListener('click', () => { 
    pause(); 
    st.progress = 0; 
    st.slowPierceUntil = 0;
    st.lastSlowFeed = 0;
    draw(); 
  });
  
  btnSound.addEventListener('click', () => {
    soundEngine.enabled = !soundEngine.enabled;
    saveSoundEnabled(soundEngine.enabled);
    btnSound.textContent = soundEngine.enabled ? '🔊' : '🔇';
    if (!soundEngine.enabled) {
      soundEngine.setTorch(false);
    } else {
      soundEngine.init();
    }
  });

  speedSel.addEventListener('change', () => { st.speed = parseFloat(speedSel.value) || 20; saveSpeed(st.speed); });
  progEl.addEventListener('input', () => {
    st.progress = totalLen * (parseInt(progEl.value, 10) / 1000);
    soundEngine.setTorch(false);
    draw();
  });
  window.addEventListener('resize', () => { resize(); draw(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); st.playing ? pause() : play(); }
    if (e.key === 'Escape' && st.playing) pause();
  });

  requestAnimationFrame(() => {
    resize();
    draw();
    setTimeout(play, 300);
  });
})();
</script>
</body>
</html>`;
}