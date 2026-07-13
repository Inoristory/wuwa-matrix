// ==================== THEMED FEATHER BACKGROUND ====================
function initThemedBackground() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'themed-background';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const dpr = Math.min(
    window.devicePixelRatio || 1,
    window.matchMedia?.('(max-width: 700px)').matches ? 1.25 : 1.5
  );
  const ctx = canvas.getContext('2d');
  let cw = 0;
  let ch = 0;
  let rafId = null;
  let resizeRaf = null;
  let running = false;
  let hidden = false;
  let startTime = 0;
  let lastFrameTime = 0;
  const FRAME_INTERVAL = window.matchMedia?.('(max-width: 700px)').matches
    ? 1000 / 24
    : 1000 / 30;

  const themes = {
    light: {
      glow: ['230, 196, 106', '255, 240, 184'],
      wing: '184, 135, 47',
      wingHighlight: '255, 240, 184',
      feather: {
        max: 4,
        spawnMin: 150,
        spawnMax: 280,
        directionX: 0.025,
        directionY: -0.012,
        sway: 0.045,
        rotation: 0.0015,
        sizeMin: 8,
        sizeMax: 14
      }
    },
    dark: {
      glow: ['29, 93, 134', '109, 213, 238'],
      wing: '55, 132, 171',
      wingHighlight: '109, 213, 238',
      feather: {
        max: 6,
        spawnMin: 105,
        spawnMax: 220,
        directionX: -0.035,
        directionY: 0.018,
        sway: 0.032,
        rotation: -0.0018,
        sizeMin: 8,
        sizeMax: 15
      }
    }
  };

  function getThemeName() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function getTheme() {
    return themes[getThemeName()];
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb + ', ' + alpha + ')';
  }

  function drawCurve(target, points, color, width, alpha) {
    target.save();
    target.strokeStyle = rgba(color, alpha);
    target.lineWidth = width;
    target.lineCap = 'round';
    target.beginPath();
    target.moveTo(points[0], points[1]);
    target.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
    target.stroke();
    target.restore();
  }

  function drawLightPlumes(target, theme, time, animated) {
    const breath = animated ? Math.sin(time * 0.16) * 0.012 : 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const startX = cw * 0.5 + side * (i * 4);
        const startY = ch * 0.055 + i * 2;
        const endX = side < 0 ? cw * (0.04 + t * 0.34) : cw * (0.96 - t * 0.34);
        const endY = ch * (0.19 + t * 0.30);
        const bend = side * cw * (0.18 + t * 0.05);
        const alpha = 0.028 + t * 0.038 + breath;
        const color = i % 4 === 0 ? theme.wingHighlight : theme.wing;
        drawCurve(target, [startX, startY, startX + bend, ch * (0.035 + t * 0.03), endX - bend * 0.18, endY - ch * 0.10, endX, endY], color, 0.8 + t * 0.45, alpha);
      }
    }
  }

  function drawDarkPlumes(target, theme, time, animated) {
    const drift = animated ? Math.sin(time * 0.10) * 16 : 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const startX = side < 0 ? -cw * 0.08 : cw * 1.08;
        const startY = ch * (0.16 + t * 0.12) + drift * side * 0.10;
        const endX = side < 0 ? cw * (0.34 + t * 0.075) : cw * (0.66 - t * 0.075);
        const endY = ch * (0.40 + t * 0.22);
        const bend = side * cw * (0.22 + t * 0.04);
        const alpha = 0.026 + (1 - t) * 0.040;
        const color = i % 4 === 0 ? theme.wingHighlight : theme.wing;
        drawCurve(target, [startX, startY, startX + bend, startY - ch * 0.08, endX - bend * 0.28, endY + ch * 0.05, endX, endY], color, 0.8 + (1 - t) * 0.55, alpha);
      }
    }
  }

  function renderFrame(time, animated) {
    const theme = getTheme();
    ctx.clearRect(0, 0, cw, ch);
    if (getThemeName() === 'light') drawLightPlumes(ctx, theme, time, animated);
    else drawDarkPlumes(ctx, theme, time, animated);
  }

  function resize() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(0, false);
    const theme = getTheme();
    window._backgroundParticleConfig = theme.feather;
    window._backgroundThemePalette = getThemeName() === 'light'
      ? { feather: '230, 196, 106', featherHighlight: '255, 240, 184', featherGlow: '184, 135, 47' }
      : { feather: '55, 132, 171', featherHighlight: '109, 213, 238', featherGlow: '29, 93, 134' };
  }

  function draw(time) {
    if (!running || hidden) return;
    if (time - lastFrameTime < FRAME_INTERVAL) {
      rafId = requestAnimationFrame(draw);
      return;
    }
    lastFrameTime = time;
    if (!startTime) startTime = time;
    renderFrame((time - startTime) / 1000, true);
    if (window._specks) {
      window._specks.update(cw, ch);
      window._specks.draw(ctx);
    }
    rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (running) return;
    if (!canvas.isConnected) document.body.prepend(canvas);
    running = true;
    hidden = false;
    startTime = 0;
    lastFrameTime = 0;
    canvas.style.display = 'block';
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    canvas.style.display = 'none';
  }

  function onVisibilityChange() {
    if (!running) return;
    if (document.hidden) {
      hidden = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else {
      hidden = false;
      startTime = 0;
      lastFrameTime = 0;
      rafId = requestAnimationFrame(draw);
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window._themedBackgroundRestart = function() {
    stop();
    resize();
    start();
  };
  window._themedBackgroundCleanup = function() {
    stop();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', onResize);
    delete window._themedBackgroundCleanup;
    delete window._themedBackgroundRestart;
  };
  function onResize() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      resize();
    });
  }
  window.addEventListener('resize', onResize);

  resize();
  start();
}
