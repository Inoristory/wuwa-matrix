(function() {
  var FALLBACK_CONFIG = {
    max: 4,
    spawnMin: 150,
    spawnMax: 280,
    directionX: 0.025,
    directionY: -0.012,
    sway: 0.045,
    rotation: 0.0015,
    sizeMin: 8,
    sizeMax: 14
  };
  var FALLBACK_PALETTE = {
    feather: '230, 196, 106',
    featherHighlight: '255, 240, 184',
    featherGlow: '184, 135, 47'
  };
  var MAX_LIFE = 760;

  function getConfig() {
    return window._backgroundParticleConfig || FALLBACK_CONFIG;
  }

  function getPalette() {
    return window._backgroundThemePalette || FALLBACK_PALETTE;
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb + ', ' + alpha + ')';
  }

  function Feather(cw, ch) {
    this.reset(cw, ch, true);
  }

  Feather.prototype.reset = function(cw, ch, initial) {
    var config = getConfig();
    var directionX = Number(config.directionX) || 0;
    var directionY = Number(config.directionY) || 0;
    var sizeMin = Number(config.sizeMin) || 8;
    var sizeMax = Number(config.sizeMax) || sizeMin + 4;

    this.size = sizeMin + Math.random() * Math.max(1, sizeMax - sizeMin);
    this.x = initial
      ? Math.random() * cw
      : (directionX < 0 ? cw + this.size * 2 : -this.size * 2);
    this.y = initial
      ? ch * (0.14 + Math.random() * 0.68)
      : (directionY > 0 ? -this.size * 2 : ch + this.size * 2);
    this.vx = directionX * (0.72 + Math.random() * 0.58);
    this.vy = directionY * (0.72 + Math.random() * 0.58);
    this.phase = Math.random() * Math.PI * 2;
    this.phaseSpeed = 0.014 + Math.random() * 0.010;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Number(config.rotation) || 0.0015) * (0.72 + Math.random() * 0.58);
    this.sway = Number(config.sway) || 0.04;
    this.opacity = 0;
    this.age = initial ? Math.floor(Math.random() * 240) : 0;
    this.life = MAX_LIFE + Math.floor(Math.random() * 180);
  };

  Feather.prototype.update = function(cw, ch) {
    this.age++;
    var config = getConfig();
    var sway = Math.sin(this.phase + this.age * this.phaseSpeed) * this.sway;
    this.x += this.vx + sway;
    this.y += this.vy + Math.cos(this.phase + this.age * this.phaseSpeed) * this.sway * 0.45;
    this.rotation += this.rotationSpeed;

    var fadeIn = Math.min(this.age / 70, 1);
    var fadeOut = Math.min((this.life - this.age) / 100, 1);
    this.opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.48;

    if (
      this.age >= this.life ||
      this.x < -this.size * 3 ||
      this.x > cw + this.size * 3 ||
      this.y < -this.size * 3 ||
      this.y > ch + this.size * 3
    ) {
      this.reset(cw, ch, false);
    }
  };

  Feather.prototype.draw = function(ctx) {
    if (this.opacity < 0.01) return;
    var palette = getPalette();
    var s = this.size;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = this.opacity;
    ctx.shadowBlur = s * 0.8;
    ctx.shadowColor = rgba(palette.featherGlow, 0.24);

    var fill = ctx.createLinearGradient(-s, 0, s, 0);
    fill.addColorStop(0, rgba(palette.featherGlow, 0.12));
    fill.addColorStop(0.48, rgba(palette.feather, 0.55));
    fill.addColorStop(1, rgba(palette.featherHighlight, 0.72));
    ctx.fillStyle = fill;
    ctx.strokeStyle = rgba(palette.featherHighlight, 0.48);
    ctx.lineWidth = 0.65;

    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.52, -s * 0.72, s * 0.78, -s * 0.18, s * 0.10, s * 0.90);
    ctx.bezierCurveTo(-s * 0.18, s * 0.58, -s * 0.62, s * 0.18, 0, -s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(palette.featherHighlight, 0.62);
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-s * 0.04, -s * 0.86);
    ctx.quadraticCurveTo(-s * 0.02, 0, s * 0.04, s * 0.84);
    ctx.stroke();

    for (var i = 0; i < 4; i++) {
      var y = -s * 0.52 + i * s * 0.28;
      var spread = s * (0.25 + i * 0.07);
      ctx.strokeStyle = rgba(palette.featherHighlight, 0.26);
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, y);
      ctx.lineTo(-spread, y - s * 0.10);
      ctx.moveTo(s * 0.01, y + s * 0.02);
      ctx.lineTo(spread * 0.72, y - s * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  };

  var feathers = [];
  var timeToSpawn = 45;

  function update(cw, ch) {
    var config = getConfig();
    var max = Math.max(0, Number(config.max) || 0);
    while (feathers.length > max) feathers.pop();

    timeToSpawn--;
    if (timeToSpawn <= 0) {
      if (feathers.length < max) feathers.push(new Feather(cw, ch));
      timeToSpawn = Number(config.spawnMin) + Math.random() * Math.max(1, Number(config.spawnMax) - Number(config.spawnMin));
    }

    for (var i = feathers.length - 1; i >= 0; i--) {
      feathers[i].update(cw, ch);
    }
  }

  function draw(ctx) {
    for (var i = 0; i < feathers.length; i++) feathers[i].draw(ctx);
  }

  window._specks = { update: update, draw: draw };
})();
