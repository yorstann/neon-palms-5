// Palmera Bay weather: a slow front rolls through clear skies, cloud,
// rain and the odd tropical storm, then clears again. Wetness lags the rain
// (streets take time to soak and to dry) and drives the reflection pass.
// Storms throw lightning: a flash, then thunder a beat later.

import { randRange } from './random.js';

const SEQUENCE = [
  { kind: 'clear', min: 34, max: 62 },
  { kind: 'cloud', min: 18, max: 34 },
  { kind: 'rain', min: 30, max: 58 },
  { kind: 'clear', min: 24, max: 48 },
  { kind: 'cloud', min: 14, max: 26 },
  { kind: 'storm', min: 22, max: 40 },
  { kind: 'rain', min: 16, max: 30 },
];

export const WEATHER_LABEL = {
  clear: 'CLEAR',
  cloud: 'OVERCAST',
  rain: 'RAIN',
  storm: 'STORM',
};

export class Weather {
  constructor(rng) {
    this.rng = rng;
    this.index = 0;
    this.kind = 'clear';
    this.timer = 26;
    this.wet = 0;
    this.flash = 0; // lightning flash strength 0..1
    this.thunderIn = -1; // seconds until the thunder sound, -1 = none
    this.drops = [];
    for (let i = 0; i < 240; i++) {
      this.drops.push({ x: Math.random() * 1400 - 60, y: Math.random() * 800 - 40, len: randRange(rng, 11, 22), speed: randRange(rng, 620, 900) });
    }
  }

  /** Force a kind (screenshot scenes and the finale use this). */
  force(kind, wet = 0.8) {
    this.kind = kind;
    this.wet = wet;
    this.timer = 9999;
  }

  intensity() {
    if (this.kind === 'rain') return 0.55;
    if (this.kind === 'storm') return 1;
    return 0;
  }

  /** Cloud cover dims daylight: 0 clear .. 0.5 storm at noon. */
  gloom() {
    if (this.kind === 'cloud') return 0.16;
    if (this.kind === 'rain') return 0.26;
    if (this.kind === 'storm') return 0.4;
    return 0;
  }

  update(dt, effects, audio) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.index = (this.index + 1) % SEQUENCE.length;
      const step = SEQUENCE[this.index];
      this.kind = step.kind;
      this.timer = randRange(this.rng, step.min, step.max);
    }
    const target = this.kind === 'rain' ? 0.75 : this.kind === 'storm' ? 1 : 0;
    const rate = target > this.wet ? 0.05 : 0.016; // soak fast, dry slow
    this.wet += Math.sign(target - this.wet) * Math.min(Math.abs(target - this.wet), rate * dt * 3);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    if (this.thunderIn > 0) {
      this.thunderIn -= dt;
      if (this.thunderIn <= 0) {
        audio.thunder();
        this.thunderIn = -1;
      }
    }
    if (this.kind === 'storm' && this.rng() < dt * 0.14) {
      this.flash = 0.75 + this.rng() * 0.25;
      this.thunderIn = 0.4 + this.rng() * 1.1;
    }

    // Rain splashes on the ground around the camera view.
    const inten = this.intensity();
    if (inten > 0 && effects) {
      const n = Math.floor(inten * 3);
      for (let i = 0; i < n; i++) {
        if (this.rng() < 0.6) {
          effects.splash(this.camX + this.rng() * 1280, this.camY + this.rng() * 720);
        }
      }
    }
  }

  /** Rain streaks, drawn in screen space over the world, under the HUD. */
  drawRain(ctx, view, t) {
    const inten = this.intensity();
    if (inten <= 0) return;
    const count = Math.floor(this.drops.length * inten);
    ctx.strokeStyle = 'rgba(175,205,240,0.5)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      const x = ((d.x + t * d.speed * 0.22) % (view.w + 120)) - 60;
      const y = ((d.y + t * d.speed) % (view.h + 80)) - 40;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.len * 0.22, y + d.len);
    }
    ctx.stroke();
  }

  /** The white-out of a lightning flash, drawn over everything but HUD. */
  drawFlash(ctx, view) {
    if (this.flash <= 0) return;
    ctx.fillStyle = `rgba(230,238,255,${this.flash * 0.5})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}
