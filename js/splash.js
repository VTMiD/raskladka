// js/splash.js
let globalAudioCtx = null;

export function initSplash(force = false) {
  if (!force && localStorage.getItem('raskladka.splashEnabled') !== 'true') return;

  const mainContainer = document.getElementById('main');
  if (!mainContainer) return;

  mainContainer.style.position = 'relative';
  mainContainer.style.overflow = 'hidden';

  if (!globalAudioCtx) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      globalAudioCtx = new AudioContext();
    } catch (e) {
      console.warn('Аудио не поддерживается');
    }
  }

  const splash = document.createElement('div');
  splash.id = 'plasma-splash';
  
  const oldStyle = document.getElementById('plasma-splash-styles');
  if (oldStyle) oldStyle.remove();

  const style = document.createElement('style');
  style.id = 'plasma-splash-styles';
  // ═══ CSS АНИМАЦИИ (ТАЙМИНГИ ПОДОГНАНЫ ПОД 4.5 СЕК) ═══
  style.textContent = `
    #plasma-splash {
      position: absolute !important;
      top: 0 !important; left: 0 !important;
      width: 100% !important; height: 100% !important;
      z-index: 9999 !important;
      background: #1e1e1e;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: opacity 0.5s ease, visibility 0.5s; /* Уменьшили затухание */
      overflow: hidden;
    }
    #plasma-splash.fade-out { opacity: 0; visibility: hidden; }
    
    .splash-svg-container {
      width: 95%; max-width: 1200px;
      position: relative; z-index: 2;
      background: radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 70%);
    }
    
    .splash-text, .splash-text-glow, .sub-text, .sub-text-glow, .cutter-dot {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-weight: 900;
      text-anchor: middle;
    }

    #splash-sound-btn {
      position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
      z-index: 10000; background: #0066cc; color: #fff;
      padding: 10px 24px; border-radius: 6px; border: none;
      cursor: pointer; font-size: 15px; font-weight: bold;
      box-shadow: 0 4px 15px rgba(0,0,0,0.6);
      display: none; transition: background 0.2s;
    }
    #splash-sound-btn:hover { background: #0050a0; }

    .shape-cut, .shape-glow { fill: transparent; }
    
    .circle-shape {
      stroke-dasharray: 200; stroke-dashoffset: 200;
      animation: drawShape 0.8s ease-in-out forwards;
    }
    .rect-shape {
      stroke-dasharray: 300; stroke-dashoffset: 300;
      animation: drawShape 0.6s 3.6s ease-in-out forwards;
    }
    .shape-cut { stroke: #ffffff; stroke-width: 2px; }
    .shape-glow { stroke: #00ffff; stroke-width: 5px; filter: drop-shadow(0 0 15px #00ffff); }

    .cutter-shape {
      fill: transparent; stroke: #ffffff; stroke-width: 12px;
      stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: 0.1 300; stroke-dashoffset: 0; opacity: 0;
      filter: drop-shadow(0 0 8px #fff) drop-shadow(0 0 16px #00ffff) drop-shadow(0 0 24px #ff5500);
    }
    .cutter-circle { animation: runCutterShape 0.8s ease-in-out forwards; }
    .cutter-rect { animation: runCutterShape 0.6s 3.6s ease-in-out forwards; }

    @keyframes drawShape { to { stroke-dashoffset: 0; } }
    @keyframes runCutterShape {
      0% { opacity: 1; stroke-dashoffset: 0; }
      99% { opacity: 1; }
      100% { opacity: 0; stroke-dashoffset: -300; }
    }

    .sub-text, .sub-text-glow {
      font-size: 18px; letter-spacing: 1px;
      stroke-dasharray: 1000; stroke-dashoffset: 1000;
    }
    .sub-text {
      fill: transparent; stroke: #ffffff; stroke-width: 1px;
      animation: drawPathSub 0.4s linear forwards, fillTextSub 0.15s 0.4s forwards;
      animation-delay: 0.8s, 1.2s;
    }
    .sub-text-glow {
      fill: transparent; stroke: #00ffff; stroke-width: 4px;
      animation: drawPathSub 0.4s linear forwards, glowFadeSub 0.8s linear forwards;
      animation-delay: 0.8s, 0.9s; filter: drop-shadow(0 0 10px #00ffff);
    }
    @keyframes drawPathSub { to { stroke-dashoffset: 0; } }
    @keyframes fillTextSub { to { fill: #e0e0e0; stroke: transparent; } }
    @keyframes glowFadeSub {
      0% { stroke: #00ffff; filter: drop-shadow(0 0 10px #00ffff); }
      50% { stroke: #ff8c00; filter: drop-shadow(0 0 10px #ff5500); }
      100% { opacity: 0; }
    }

    .main-text, .main-text-glow {
      font-size: 45px; stroke-dasharray: 300; stroke-dashoffset: 300;
    }
    .main-text {
      fill: transparent; stroke: #ffffff; stroke-width: 2px;
      animation: drawPath 0.15s linear forwards, fillText 0.1s linear forwards;
      animation-delay: calc(1.2s + var(--i) * 0.15s), calc(1.2s + var(--i) * 0.15s + 0.15s);
    }
    .main-text-glow {
      fill: transparent; stroke: #ff8c00; stroke-width: 6px;
      animation: drawPath 0.15s linear forwards, glowFade 0.4s linear forwards;
      animation-delay: calc(1.2s + var(--i) * 0.15s), calc(1.2s + var(--i) * 0.15s + 0.1s);
      filter: drop-shadow(0 0 15px #ff5500);
    }
    @keyframes drawPath { to { stroke-dashoffset: 0; } }
    @keyframes fillText { to { fill: #ff8c00; stroke: #ff5500; } }
    @keyframes glowFade {
      0% { stroke: #ffffff; filter: drop-shadow(0 0 20px #ffffff); }
      50% { stroke: #ff8c00; filter: drop-shadow(0 0 15px #ff5500); }
      100% { stroke: #ff5500; filter: drop-shadow(0 0 5px #ff0000); opacity: 0; }
    }

    .cutter-dot {
      fill: transparent; stroke: #ffffff; stroke-width: 16px;
      stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: 0.1 300; stroke-dashoffset: 0; opacity: 0;
      filter: drop-shadow(0 0 6px #fff) drop-shadow(0 0 15px #00ffff) drop-shadow(0 0 30px #ff5500);
      animation: runCutter 0.15s linear forwards;
      animation-delay: calc(1.2s + var(--i) * 0.15s);
    }
    @keyframes runCutter {
      0% { opacity: 1; } 99% { opacity: 1; }
      100% { opacity: 0; stroke-dashoffset: -300; }
    }

    .sparks { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
    .spark {
      position: absolute; width: 2px; height: 2px; background: #fff;
      border-radius: 50%; box-shadow: 0 0 8px 2px #ff8c00;
      animation: sparkFly 0.3s ease-out forwards;
    }
    @keyframes sparkFly {
      0% { transform: translate(0, 0) scale(1); opacity: 1; }
      100% { transform: translate(calc(var(--dx) * 1px), calc(var(--dy) * 1px)) scale(0); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  const mainText = 'РАСКЛАДКА_JS_CAM';
  const viewBoxW = 1200; 
  const stepX = 45; 
  const yPos = 150;
  
  const textWidth = (mainText.length - 1) * stepX;
  const startX = (viewBoxW / 2) - (textWidth / 2);

  const lettersHtml = mainText.split('').map((char, i) => {
    const x = startX + i * stepX;
    return `
      <text x="${x}" y="${yPos}" class="main-text-glow" style="--i:${i}">${char}</text>
      <text x="${x}" y="${yPos}" class="main-text" style="--i:${i}">${char}</text>
      <text x="${x}" y="${yPos}" class="cutter-dot" style="--i:${i}">${char}</text>
    `;
  }).join('');

  splash.innerHTML = `
    <div class="splash-svg-container" style="position:relative;">
      <svg viewBox="0 0 ${viewBoxW} 200" width="100%" height="100%">
        <circle cx="100" cy="140" r="25" class="shape-glow circle-shape" />
        <circle cx="100" cy="140" r="25" class="shape-cut circle-shape" />
        <circle cx="100" cy="140" r="25" class="cutter-shape cutter-circle" />

        <text x="${viewBoxW/2}" y="80" class="sub-text-glow">Время творческой мысли и дела представляет:</text>
        <text x="${viewBoxW/2}" y="80" class="sub-text">Время творческой мысли и дела представляет:</text>
        
        ${lettersHtml}

        <rect x="1050" y="115" width="60" height="50" class="shape-glow rect-shape" />
        <rect x="1050" y="115" width="60" height="50" class="shape-cut rect-shape" />
        <rect x="1050" y="115" width="60" height="50" class="cutter-shape cutter-rect" />
      </svg>
    </div>
    <div class="sparks" id="splash-sparks"></div>
    <button id="splash-sound-btn">🔊 Включить звук</button>
  `;
  
  mainContainer.appendChild(splash);

  // ─── Звук (длительность 4.0 сек) ───
  function playContinuousCuttingSound() {
    if (!globalAudioCtx) return;

    if (globalAudioCtx.state === 'suspended') {
      const soundBtn = document.getElementById('splash-sound-btn');
      if (soundBtn) {
        soundBtn.style.display = 'block';
        soundBtn.onclick = () => {
          globalAudioCtx.resume().then(() => {
            splash.remove();
            const s = document.getElementById('plasma-splash-styles');
            if (s) s.remove();
            initSplash(true);
          });
        };
      }
      return; 
    }

    try {
      const ctx = globalAudioCtx;
      const duration = 4.0; 

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 90;
      
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
      oscGain.gain.setValueAtTime(0.15, ctx.currentTime + duration - 0.3);
      oscGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000; 
      filter.Q.value = 1.0;
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, ctx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05); 
      noiseGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.3);
      noiseGain.gain.setValueAtTime(0.2, ctx.currentTime + duration - 0.3);
      noiseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      osc.start();
      noise.start();
      
      osc.stop(ctx.currentTime + duration);
      noise.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Ошибка воспроизведения:', e);
    }
  }

  setTimeout(() => {
    playContinuousCuttingSound();
  }, 100);

  // ─── Искры (под 4.5 сек) ───
  const sparksContainer = document.getElementById('splash-sparks');
  const splashRect = splash.getBoundingClientRect();
  const startTime = performance.now();

  const sparksInterval = setInterval(() => {
    if (!document.body.contains(splash)) return;
    
    const now = performance.now();
    const elapsed = now - startTime;
    const svgContainer = splash.querySelector('.splash-svg-container');
    if (!svgContainer) return;
    const rect = svgContainer.getBoundingClientRect();

    // Круг (0 - 0.8 сек)
    if (elapsed >= 0 && elapsed < 800) {
      const randomX = 75 + Math.random() * 50;
      const randomY = 115 + Math.random() * 50;
      const screenX = rect.left + (randomX / viewBoxW) * rect.width;
      const screenY = rect.top + (randomY / 200) * rect.height;
      for (let k = 0; k < 4; k++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        spark.style.left = `${screenX - splashRect.left}px`;
        spark.style.top = `${screenY - splashRect.top}px`;
        const angle = Math.random() * Math.PI * 2; 
        const distance = 30 + Math.random() * 100;
        spark.style.setProperty('--dx', Math.cos(angle) * distance);
        spark.style.setProperty('--dy', Math.sin(angle) * distance);
        sparksContainer.appendChild(spark);
        setTimeout(() => spark.remove(), 300);
      }
      return;
    }

    // Буквы (1.2 - 3.6 сек)
    if (elapsed >= 1200 && elapsed < 3600) {
      const letterIndex = Math.floor((elapsed - 1200) / 150);
      if (letterIndex < 0 || letterIndex >= mainText.length) return;
      const activeLetter = splash.querySelector(`.main-text[style*="--i:${letterIndex}"]`);
      if (!activeLetter) return;
      const letterRect = activeLetter.getBoundingClientRect();
      for (let k = 0; k < 4; k++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        const randomX = (letterRect.left - splashRect.left) + Math.random() * letterRect.width;
        const randomY = (letterRect.top - splashRect.top) + Math.random() * letterRect.height;
        spark.style.left = `${randomX}px`;
        spark.style.top = `${randomY}px`;
        const angle = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI; 
        const distance = 30 + Math.random() * 100;
        spark.style.setProperty('--dx', Math.cos(angle) * distance);
        spark.style.setProperty('--dy', Math.sin(angle) * distance);
        sparksContainer.appendChild(spark);
        setTimeout(() => spark.remove(), 300);
      }
      return;
    }

    // Прямоугольник (3.6 - 4.5 сек)
    if (elapsed >= 3600 && elapsed < 4500) {
      const randomX = 1050 + Math.random() * 60;
      const randomY = 115 + Math.random() * 50;
      const screenX = rect.left + (randomX / viewBoxW) * rect.width;
      const screenY = rect.top + (randomY / 200) * rect.height;
      for (let k = 0; k < 4; k++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        spark.style.left = `${screenX - splashRect.left}px`;
        spark.style.top = `${screenY - splashRect.top}px`;
        const angle = Math.random() * Math.PI * 2; 
        const distance = 30 + Math.random() * 100;
        spark.style.setProperty('--dx', Math.cos(angle) * distance);
        spark.style.setProperty('--dy', Math.sin(angle) * distance);
        sparksContainer.appendChild(spark);
        setTimeout(() => spark.remove(), 300);
      }
    }
  }, 20);

  // Завершение заставки ровно через 4.5 секунды (4500 мс)
  setTimeout(() => {
    splash.classList.add('fade-out');
    clearInterval(sparksInterval);
    setTimeout(() => {
      splash.remove();
      const s = document.getElementById('plasma-splash-styles');
      if (s) s.remove();
    }, 500); // Затухание 0.5 сек
  }, 4500); 
}