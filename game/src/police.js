// The PBPD: a witnessed-crime heat system behind the 0-5 wanted stars,
// pursuit cars that ram, officers on foot who fill the busted meter,
// roadblocks with spike strips at three stars and up, and — at four — a
// helicopter whose searchlight pins the player on the minimap and the
// street alike.

import { clamp, dist } from './random.js';
import { makeCar, paintCar, steerToward, roadSpotNear, NODES } from './vehicles.js';
import { makePed, drawPed } from './pedestrians.js';

const CRIME_HEAT = { shots: 20, carjack: 32, assault: 26, hitandrun: 36, shootout: 30, copkill: 55 };

export class Police {
  constructor(G) {
    this.G = G;
    this.wanted = 0;
    this.heat = 0;
    this.officers = [];
    this.roadblocks = [];
    this.heli = { active: false, x: 0, y: 0, phase: 0 };
    this.busted = 0;
    this.lastSeenT = -99;
    this.crimeQuietT = 0;
    this.spawnT = 0;
    this.blockT = 6;
    this.rng = G.rng;
  }

  copCars(G) {
    return G.cars.filter((c) => c.type === 'police' && (c.driver === 'police' || c.driver === 'block'));
  }

  /** Crimes only count when someone sees them: a ped, officer or cruiser. */
  witnessed(G, x, y) {
    for (const ped of G.peds) if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 270) return true;
    for (const off of this.officers) if (off.state !== 'down' && dist(x, y, off.x, off.y) < 330) return true;
    for (const car of G.cars) if (car.type === 'police' && dist(x, y, car.x, car.y) < 360) return true;
    return false;
  }

  reportCrime(kind, x, y) {
    // G is reached through the last update's context; set in update().
    const G = this.G;
    if (!G || G.state !== 'play') return;
    if (!this.witnessed(G, x, y)) return;
    this.heat += CRIME_HEAT[kind] ?? 15;
    this.crimeQuietT = 0;
    if (this.heat >= 100 && this.wanted < 5) {
      this.wanted += 1;
      this.heat = 35;
      G.effects.floatText(G.player.x, G.player.y - 40, '★'.repeat(this.wanted), '#ffd94d');
    } else if (this.wanted >= 5) {
      this.heat = Math.min(100, this.heat);
    }
    if (this.wanted === 0 && this.heat > 45) {
      this.wanted = 1;
      this.heat = 30;
    }
  }

  setWanted(G, stars) {
    this.wanted = clamp(stars, 0, 5);
    this.heat = Math.max(this.heat, 30);
    this.lastSeenT = G.t;
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.busted = 0;
  }

  hurtOfficer(G, off, dmg) {
    if (off.state === 'down' || off.dead) return;
    off.health -= dmg;
    if (off.health <= 0) {
      off.state = 'down';
      off.downT = 10;
      G.effects.bloodPuff(off.x, off.y);
      this.heat += CRIME_HEAT.copkill;
      if (this.wanted < 5) this.wanted += 1;
    }
  }

  desiredCops() {
    return [0, 1, 2, 3, 4, 5][this.wanted];
  }

  update(G, dt) {
    this.G = G;
    const P = G.player;
    this.crimeQuietT += dt;

    // Seeing the player keeps the heat on; hiding bleeds stars away.
    let seen = false;
    for (const car of G.cars) {
      if (car.type === 'police' && car.driver === 'police' && dist(car.x, car.y, P.x, P.y) < 430) seen = true;
    }
    for (const off of this.officers) {
      if (off.state !== 'down' && dist(off.x, off.y, P.x, P.y) < 300) seen = true;
    }
    if (this.heli.active && this.wanted >= 4) seen = true;
    if (seen) this.lastSeenT = G.t;
    if (this.wanted > 0 && G.t - this.lastSeenT > 8 + this.wanted * 2.2) {
      this.wanted -= 1;
      this.heat = 20;
      this.lastSeenT = G.t;
      if (this.wanted === 0) G.effects.floatText(P.x, P.y - 36, 'LOST THEM', '#7dff9a');
    }
    if (this.crimeQuietT > 5 && this.wanted === 0) this.heat = Math.max(0, this.heat - dt * 6);

    // Spawn and drive pursuit cars.
    const cops = G.cars.filter((c) => c.type === 'police' && c.driver === 'police');
    this.spawnT -= dt;
    if (this.wanted > 0 && cops.length < this.desiredCops() && this.spawnT <= 0) {
      this.spawnT = 1.6;
      const spot = roadSpotNear(this.rng, P.x, P.y, 620, 900);
      const car = paintCar(this.rng, makeCar('police', spot.x, spot.y, spot.angle, 'police'));
      G.cars.push(car);
    }
    for (const car of cops) {
      const lead = P.car ? 0.35 : 0.12;
      const tx = P.x + Math.cos(P.angle) * (P.speed ?? 0) * lead;
      const ty = P.y + Math.sin(P.angle) * (P.speed ?? 0) * lead;
      steerToward(G, car, dt, tx, ty, 1);
      // A cruiser that catches a pedestrian player at speed knocks them down.
      if (!P.car && P.alive && dist(car.x, car.y, P.x, P.y) < 25 && Math.abs(car.speed) > 110) {
        G.hurtPlayer(11);
        P.x += Math.cos(car.angle) * 16;
        P.y += Math.sin(car.angle) * 16;
      }
    }
    const anyCopNear = cops.some((c) => dist(c.x, c.y, P.x, P.y) < 700) || this.officers.length > 0;
    G.audio.setLoop('siren', this.wanted > 0 && anyCopNear, 0.045);

    this.updateOfficers(G, dt, cops);
    this.updateRoadblocks(G, dt);
    this.updateHeli(G, dt);
  }

  updateOfficers(G, dt, cops) {
    const P = G.player;
    // Officers pile out when the player is on foot and the heat is real.
    const wantOfficers = !P.car && this.wanted >= 2 ? Math.min(3, this.wanted - 1) : 0;
    if (this.officers.filter((o) => o.state !== 'down').length < wantOfficers && cops.length > 0) {
      const car = cops[0];
      const off = makePed(this.rng, car.x + 18, car.y + 10, 'officer');
      off.health = 34;
      this.officers.push(off);
    }
    let busting = false;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const off = this.officers[i];
      if (off.dead || (off.state === 'down' && (off.downT -= dt) <= 0)) {
        this.officers.splice(i, 1);
        continue;
      }
      if (off.state === 'down') continue;
      const d = dist(off.x, off.y, P.x, P.y);
      if (this.wanted === 0 || d > 950) {
        // Heat's gone or they lost him: they melt away.
        if (d > 950 || this.wanted === 0) this.officers.splice(i, 1);
        continue;
      }
      off.angle = Math.atan2(P.y - off.y, P.x - off.x);
      if (d > 20) {
        off.speed = 138;
        off.x += Math.cos(off.angle) * off.speed * dt;
        off.y += Math.sin(off.angle) * off.speed * dt;
      } else {
        off.speed = 0;
        if (!P.car && P.speed < 70 && P.alive) busting = true;
      }
      // At five stars officers stop asking nicely.
      off.shootCd -= dt;
      if (this.wanted >= 5 && off.shootCd <= 0 && d < 300 && d > 30 && !P.car) {
        off.shootCd = 1.1 + Math.random() * 0.8;
        const ang = off.angle + (Math.random() - 0.5) * 0.22;
        G.bullets.push({ x: off.x, y: off.y, vx: Math.cos(ang) * 540, vy: Math.sin(ang) * 540, from: 'police', dmg: 7, life: 0.7 });
        G.audio.gunshot();
      }
    }
    if (busting) {
      this.busted = Math.min(1, this.busted + dt / 1.5);
      if (this.busted >= 1) G.onBusted();
    } else {
      this.busted = Math.max(0, this.busted - dt / 2.2);
    }
  }

  updateRoadblocks(G, dt) {
    const P = G.player;
    // Retire blocks the player has left behind.
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const block = this.roadblocks[i];
      if (dist(block.x, block.y, P.x, P.y) > 1000) {
        for (const car of block.cars) {
          const idx = G.cars.indexOf(car);
          if (idx >= 0) G.cars.splice(idx, 1);
        }
        this.roadblocks.splice(i, 1);
      }
    }
    this.blockT -= dt;
    if (this.wanted < 3 || !P.car || this.blockT > 0 || this.roadblocks.length >= 2) return;
    this.blockT = 13 + Math.random() * 6;
    // Find a node ahead of the player's heading and seal its road.
    const fx = Math.cos(P.angle);
    const fy = Math.sin(P.angle);
    let best = null;
    let bestScore = -Infinity;
    for (const node of NODES) {
      const dx = node.x - P.x;
      const dy = node.y - P.y;
      const d = Math.hypot(dx, dy);
      if (d < 380 || d > 780) continue;
      const ahead = (dx * fx + dy * fy) / (d || 1);
      if (ahead < 0.55) continue;
      if (ahead - d / 3000 > bestScore) { bestScore = ahead - d / 3000; best = node; }
    }
    if (!best) return;
    // Orientation: block whichever road runs through the node toward player.
    const vertical = Math.abs(fx) < Math.abs(fy); // player moving vertically → block the vertical road... use approach axis
    const cars = [];
    const offs = [-46, 46];
    for (const o of offs) {
      const cx = vertical ? best.x + o : best.x;
      const cy = vertical ? best.y : best.y + o;
      const car = paintCar(this.rng, makeCar('police', cx, cy, vertical ? 0 : Math.PI / 2, 'block'));
      car.blockade = true;
      G.cars.push(car);
      cars.push(car);
    }
    const spikes = this.wanted >= 4
      ? { x: best.x - fx * 120, y: best.y - fy * 120, vertical: Math.abs(fx) > Math.abs(fy), hit: false }
      : null;
    this.roadblocks.push({ x: best.x, y: best.y, cars, spikes, cones: offs.map((o) => ({ x: vertical ? best.x + o * 0.4 : best.x + 26, y: vertical ? best.y + 26 : best.y + o * 0.4 })) });
    G.effects.floatText(best.x, best.y - 60, 'ROADBLOCK', '#ffd94d');
  }

  /** Spike strips bite once: the player's tyres are done for a while. */
  checkSpikes(G) {
    const P = G.player;
    if (!P.car) return;
    for (const block of this.roadblocks) {
      const s = block.spikes;
      if (!s || s.hit) continue;
      if (Math.abs(P.car.x - s.x) < 52 && Math.abs(P.car.y - s.y) < 52) {
        s.hit = true;
        P.car.popped = 9;
        G.audio.crash(0.5);
        G.effects.floatText(P.car.x, P.car.y - 36, 'TYRES POPPED!', '#ff5a4d');
      }
    }
  }

  updateHeli(G, dt) {
    const P = G.player;
    const heli = this.heli;
    if (this.wanted >= 4 && P.alive) {
      if (!heli.active) {
        heli.active = true;
        heli.x = P.x + 420;
        heli.y = P.y - 320;
      }
      heli.phase += dt * 31;
      const tx = P.x + Math.sin(G.t * 0.6) * 60;
      const ty = P.y + Math.cos(G.t * 0.45) * 50 - 30;
      heli.x += (tx - heli.x) * Math.min(1, dt * 1.6);
      heli.y += (ty - heli.y) * Math.min(1, dt * 1.6);
      G.audio.setLoop('rotor', true, 0.05);
    } else if (heli.active) {
      heli.active = false;
      G.audio.setLoop('rotor', false);
    }
  }

  drawOfficers(ctx, t) {
    for (const off of this.officers) drawPed(ctx, off, t);
  }

  /** Roadblock dressing: cones and the spike strip (cars draw as cars). */
  drawBlockades(ctx) {
    for (const block of this.roadblocks) {
      for (const cone of block.cones) {
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.moveTo(cone.x - 5, cone.y + 5);
        ctx.lineTo(cone.x, cone.y - 7);
        ctx.lineTo(cone.x + 5, cone.y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(cone.x - 3, cone.y - 1, 6, 2.4);
      }
      const s = block.spikes;
      if (s && !s.hit) {
        ctx.fillStyle = '#3a3a40';
        if (s.vertical) ctx.fillRect(s.x - 4, s.y - 52, 8, 104);
        else ctx.fillRect(s.x - 52, s.y - 4, 104, 8);
        ctx.fillStyle = '#cfd4da';
        for (let i = -4; i <= 4; i++) {
          if (s.vertical) ctx.fillRect(s.x - 1.4, s.y + i * 12 - 1.4, 2.8, 2.8);
          else ctx.fillRect(s.x + i * 12 - 1.4, s.y - 1.4, 2.8, 2.8);
        }
      }
    }
  }

  /** The helicopter and its searchlight, drawn over the night city. */
  drawHeli(ctx, G) {
    const heli = this.heli;
    if (!heli.active) return;
    const P = G.player;
    // Searchlight: a cone from the heli to a bright pool on the player.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(P.x, P.y, 6, P.x, P.y, 92);
    grad.addColorStop(0, 'rgba(255,250,215,0.5)');
    grad.addColorStop(1, 'rgba(255,250,215,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,215,0.10)';
    ctx.beginPath();
    ctx.moveTo(heli.x - 7, heli.y + 6);
    ctx.lineTo(P.x - 58, P.y + 20);
    ctx.lineTo(P.x + 58, P.y + 20);
    ctx.lineTo(heli.x + 7, heli.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Airframe.
    ctx.save();
    ctx.translate(heli.x, heli.y);
    ctx.fillStyle = 'rgba(10,10,14,0.35)';
    ctx.beginPath();
    ctx.ellipse(4, 66, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,235,240,0.85)';
    ctx.lineWidth = 3;
    const r = 46;
    const a = heli.phase;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.24);
    ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r * 0.24);
    ctx.moveTo(Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r * 0.24);
    ctx.lineTo(-Math.cos(a + Math.PI / 2) * r, -Math.sin(a + Math.PI / 2) * r * 0.24);
    ctx.stroke();
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-52, -2.6, 34, 5.2);
    ctx.fillStyle = '#31435f';
    ctx.beginPath();
    ctx.ellipse(7, 0, 9, 6.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.floor(G.t * 2) % 2 ? '#ff4040' : '#7a1010';
    ctx.beginPath();
    ctx.arc(-52, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
