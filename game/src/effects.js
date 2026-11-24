// Transient visual effects for Neon Palms: particle bursts (sparks, smoke,
// rain splashes, muzzle smoke), skid marks that fade off the asphalt,
// floating score text and a camera shake. Particle counts are capped so a
// five-star pile-up stays at 60 fps.

const MAX_PARTICLES = 420;
const MAX_SKIDS = 260;

export class Effects {
  constructor() {
    this.particles = [];
    this.skids = [];
    this.texts = [];
    this.shake = 0;
  }

  addShake(amount) {
    this.shake = Math.min(14, this.shake + amount);
  }

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, opts) {
    const count = opts.count ?? 8;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = (opts.speed ?? 90) * (0.3 + Math.random() * 0.9);
      const life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8);
      this.spawn({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life, maxLife: life,
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.9),
        color: opts.color ?? '#ffd76a',
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 0.9,
        grow: opts.grow ?? 0,
        alpha: opts.alpha ?? 1,
      });
    }
  }

  sparks(x, y) {
    this.burst(x, y, { count: 10, speed: 220, life: 0.35, size: 2.4, color: '#ffcf5e', gravity: 300 });
    this.burst(x, y, { count: 4, speed: 120, life: 0.25, size: 2, color: '#fff3b0' });
  }

  smoke(x, y, dark = false) {
    this.burst(x, y, {
      count: 3, speed: 26, life: 1.1, size: 7,
      color: dark ? 'rgba(40,40,46,0.5)' : 'rgba(200,200,205,0.45)',
      grow: 9, alpha: 0.55,
    });
  }

  muzzleSmoke(x, y, ang) {
    this.spawn({
      x: x + Math.cos(ang) * 14, y: y + Math.sin(ang) * 14,
      vx: Math.cos(ang) * 42, vy: Math.sin(ang) * 42 - 8,
      life: 0.7, maxLife: 0.7, size: 4.5,
      color: 'rgba(210,210,215,0.4)', gravity: -30, drag: 0.92, grow: 10, alpha: 0.5,
    });
  }

  splash(x, y) {
    this.spawn({
      x, y, vx: 0, vy: 0, life: 0.38, maxLife: 0.38, size: 2,
      color: 'rgba(170,210,255,0.7)', gravity: 0, drag: 1, grow: 16, alpha: 0.7, ring: true,
    });
  }

  bloodPuff(x, y) {
    this.burst(x, y, { count: 6, speed: 80, life: 0.4, size: 3.4, color: 'rgba(178,34,52,0.8)', gravity: 120 });
  }

  skid(x, y, ang) {
    if (this.skids.length >= MAX_SKIDS) this.skids.shift();
    this.skids.push({ x, y, ang, life: 5 });
  }

  floatText(x, y, text, color = '#7dff9a') {
    this.texts.push({ x, y, text, color, life: 1.4 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity ?? 0) * dt;
      p.vx *= p.drag ?? 1;
      p.vy *= p.drag ?? 1;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 26);
  }

  drawSkids(ctx) {
    ctx.fillStyle = 'rgba(18,18,22,1)';
    for (const s of this.skids) {
      ctx.globalAlpha = Math.min(0.5, s.life * 0.16);
      ctx.fillRect(s.x - 2.4, s.y - 2.4, 4.8, 4.8);
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = (p.alpha ?? 1) * t;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.fillStyle = '#101018';
      ctx.fillText(t.text, t.x + 1.5, t.y + 1.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
