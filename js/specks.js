(function() {
  var MAX = 12;
  var SPAWN_MIN = 30;
  var SPAWN_MAX = 120;
  var ACCEL_FRAMES = 50;
  var DECEL_FRAMES = 20;
  var SHRINK_FRAMES = 40;

  function Speck(cw, ch) {
    this.x = cw * 0.5 + 20 + Math.random() * (cw * 0.5 - 40);
    this.y = 10 + Math.random() * (ch * 0.5 - 20);
    this.peakVx = -(10 + Math.random() * 4);
    this.driftVx = -(0.125 + Math.random() * 0.125);
    var angle = (17 + Math.random() * 6) * Math.PI / 180;
    var tanA = Math.tan(angle);
    this.peakVy = -this.peakVx * tanA;
    this.driftVy = -this.driftVx * tanA;
    this.gravity = 0.0002 + Math.random() * 0.0003;
    this.targetSize = 7 + Math.random() * 9;
    this.size = 0;
    this.opacity = 0;
    this.rotation = 0;
    this.lineWidth = 2 + Math.random() * 1.5;
    this.alive = true;
    this.frame = 0;
    this.lifeStart = 0;
    this.shrinking = false;
    this.trail = [];
  }

  var TRAIL_MAX_AGE = 240;

  Speck.prototype.update = function(cw, ch) {
    if (!this.alive) return;
    this.frame++;

    var growFrames = ACCEL_FRAMES + 15;
    if (this.frame <= growFrames) {
      this.size = this.targetSize * (this.frame / growFrames);
      this.opacity = 1.0 * (this.frame / growFrames);
    } else if (!this.shrinking) {
      this.size = this.targetSize;
      this.opacity = 1.0;
      var shrinkStart = ACCEL_FRAMES + DECEL_FRAMES + 100 + Math.random() * 300;
      if (this.frame >= shrinkStart) {
        this.shrinking = true;
        this.lifeStart = this.frame;
      }
    }

    if (this.shrinking) {
      var sf = this.frame - this.lifeStart;
      var t = Math.min(sf / SHRINK_FRAMES, 1);
      this.size = this.targetSize * (1 - t);
      this.opacity = 1.0 * (1 - t);
      if (t >= 1) { this.alive = false; return; }
    }

    if (this.frame <= ACCEL_FRAMES) {
      var t = this.frame / ACCEL_FRAMES;
      this.vx = this.peakVx * t;
      this.vy = this.peakVy * t;
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

    var trailLen = this.trail.length;
    if (trailLen > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([3, 3]);
      var now = this.frame;
      var w = this.trail[trailLen - 1].w;
      for (var i = 1; i < trailLen; i++) {
        var p0 = this.trail[i - 1];
        var age = now - p0.born;
        var alpha;
        if (age < 60) {
          alpha = 0.55;
        } else if (age < 240) {
          alpha = 0.55 * (1 - (age - 60) / 180);
          if (alpha < 0.005) continue;
        } else {
          continue;
        }
        ctx.strokeStyle = 'rgba(200, 215, 255, ' + alpha + ')';
        ctx.lineWidth = w;
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
    grad.addColorStop(0, 'rgba(76, 80, 190, 0.95)');
    grad.addColorStop(0.3, 'rgba(76, 80, 190, 0.7)');
    grad.addColorStop(0.6, 'rgba(76, 80, 190, 0.35)');
    grad.addColorStop(1, 'rgba(76, 80, 190, 0)');
    ctx.shadowBlur = s * 0.8;
    ctx.shadowColor = 'rgba(76, 80, 190, 0.5)';
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
    ctx.strokeStyle = 'rgba(76, 80, 190, ' + (this.opacity * 0.5) + ')';
    ctx.lineWidth = this.lineWidth * 0.5;
    ctx.stroke();
    ctx.restore();
  };

  var specks = [];
  var timeToSpawn = 30;

  function update(cw, ch) {
    timeToSpawn--;
    if (timeToSpawn <= 0) {
      if (specks.length < MAX) specks.push(new Speck(cw, ch));
      timeToSpawn = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
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
