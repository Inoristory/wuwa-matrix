(function() {
  var FALLBACK_CONFIG = { max: 4, spawnMin: 110, spawnMax: 220 };
  var FALLBACK_PALETTE = {
    trail: '230, 196, 106',
    core: '230, 196, 106',
    halo: '184, 135, 47'
  };
  var ACCEL_FRAMES = 42;
  var DECEL_FRAMES = 18;
  var SHRINK_FRAMES = 48;
  var TRAIL_MAX_AGE = 150;

  function getConfig() {
    return window._backgroundParticleConfig || FALLBACK_CONFIG;
  }

  function getPalette() {
    return window._backgroundThemePalette || FALLBACK_PALETTE;
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb + ', ' + alpha + ')';
  }

  function Speck(cw, ch) {
    this.x = cw * 0.62 + Math.random() * (cw * 0.34);
    this.y = 10 + Math.random() * Math.max(40, ch * 0.42);
    this.peakVx = -(7 + Math.random() * 4);
    this.driftVx = -(0.09 + Math.random() * 0.10);
    var angle = (15 + Math.random() * 7) * Math.PI / 180;
    var tanA = Math.tan(angle);
    this.peakVy = -this.peakVx * tanA;
    this.driftVy = -this.driftVx * tanA;
    this.gravity = 0.00015 + Math.random() * 0.00025;
    this.targetSize = 5 + Math.random() * 6;
    this.size = 0;
    this.opacity = 0;
    this.lineWidth = 1.2 + Math.random() * 1.0;
    this.alive = true;
    this.frame = 0;
    this.lifeStart = 0;
    this.shrinking = false;
    this.trail = [];
  }

  Speck.prototype.update = function(cw, ch) {
    if (!this.alive) return;
    this.frame++;

    var growFrames = ACCEL_FRAMES + 12;
    if (this.frame <= growFrames) {
      this.size = this.targetSize * (this.frame / growFrames);
      this.opacity = 0.72 * (this.frame / growFrames);
    } else if (!this.shrinking) {
      this.size = this.targetSize;
      this.opacity = 0.72;
      var shrinkStart = ACCEL_FRAMES + DECEL_FRAMES + 80 + Math.random() * 240;
      if (this.frame >= shrinkStart) {
        this.shrinking = true;
        this.lifeStart = this.frame;
      }
    }

    if (this.shrinking) {
      var sf = this.frame - this.lifeStart;
      var t = Math.min(sf / SHRINK_FRAMES, 1);
      this.size = this.targetSize * (1 - t);
      this.opacity = 0.72 * (1 - t);
      if (t >= 1) { this.alive = false; return; }
    }

    if (this.frame <= ACCEL_FRAMES) {
      var at = this.frame / ACCEL_FRAMES;
      this.vx = this.peakVx * at;
      this.vy = this.peakVy * at;
    } else if (this.frame <= ACCEL_FRAMES + DECEL_FRAMES) {
      var dt = (this.frame - ACCEL_FRAMES) / DECEL_FRAMES;
      this.vx = this.peakVx * (1 - dt) + this.driftVx * dt;
      this.vy = this.peakVy * (1 - dt) + this.driftVy * dt;
    } else {
      this.vx = this.driftVx;
      this.vy = this.driftVy;
    }

    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;

    var emitEnd = ACCEL_FRAMES + DECEL_FRAMES;
    if (this.frame <= emitEnd) {
      this.trail.push({
        x: this.x,
        y: this.y,
        w: (this.lineWidth * 0.7) * (this.size / this.targetSize),
        born: this.frame
      });
    }
    while (this.trail.length > 0 && this.frame - this.trail[0].born > TRAIL_MAX_AGE) {
      this.trail.shift();
    }
    if (this.x < -40 || this.y > ch + 40) this.alive = false;
  };

  Speck.prototype.draw = function(ctx) {
    if (!this.alive || this.size < 0.5) return;
    var palette = getPalette();
    var trailLen = this.trail.length;

    if (trailLen > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      var now = this.frame;
      for (var i = 1; i < trailLen; i++) {
        var p0 = this.trail[i - 1];
        var age = now - p0.born;
        var alpha = age < 42 ? 0.28 : 0.28 * (1 - (age - 42) / TRAIL_MAX_AGE);
        if (alpha < 0.008) continue;
        ctx.strokeStyle = rgba(palette.trail, alpha);
        ctx.lineWidth = p0.w;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    var s = this.size;
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    grad.addColorStop(0, rgba(palette.core, 0.82));
    grad.addColorStop(0.34, rgba(palette.core, 0.52));
    grad.addColorStop(0.68, rgba(palette.halo, 0.20));
    grad.addColorStop(1, rgba(palette.halo, 0));
    ctx.shadowBlur = s * 0.72;
    ctx.shadowColor = rgba(palette.halo, 0.34);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.25, -s * 0.25);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.25, s * 0.25);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.25, s * 0.25);
    ctx.lineTo(-s, 0);
    ctx.lineTo(-s * 0.25, -s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  var specks = [];
  var timeToSpawn = 40;

  function update(cw, ch) {
    var config = getConfig();
    timeToSpawn--;
    if (timeToSpawn <= 0) {
      if (specks.length < config.max) specks.push(new Speck(cw, ch));
      timeToSpawn = config.spawnMin + Math.random() * (config.spawnMax - config.spawnMin);
    }
    for (var i = specks.length - 1; i >= 0; i--) {
      specks[i].update(cw, ch);
      if (!specks[i].alive) {
        specks[i] = specks[specks.length - 1];
        specks.pop();
      }
    }
  }

  function draw(ctx) {
    for (var i = 0; i < specks.length; i++) specks[i].draw(ctx);
  }

  window._specks = { update: update, draw: draw };
})();
