// The player: on foot (walk, run, aim, shoot, punch) and behind the wheel
// (arcade driving through vehicles.js). Handles entering and stealing cars,
// both weapons, and the bullets everyone fires.

import { clamp, dist } from './random.js';
import { WORLD_W, WORLD_H, WATER_X, collideBuildings, pointInBuilding } from './city.js';
import { driveCar } from './vehicles.js';
import { hurtPed, makePed } from './pedestrians.js';

export const WEAPONS = {
  fists: { name: 'FISTS', dmg: 12, rate: 0.34, mag: Infinity, spread: 0, auto: false, range: 30 },
  pistol: { name: 'PISTOL', dmg: 34, rate: 0.3, mag: 12, spread: 0.028, auto: false, range: 999 },
  smg: { name: 'SMG', dmg: 17, rate: 0.095, mag: 32, spread: 0.075, auto: true, range: 999 },
};

export function makePlayer(save) {
  return {
    x: 2060, y: 1420,
    angle: -Math.PI / 2,
    speed: 0,
    health: 100,
    armor: 0,
    alive: true,
    car: null,
    weapon: 'pistol',
    hasSmg: false,
    mag: WEAPONS.pistol.mag,
    reserve: 96,
    fireCd: 0,
    reloadT: 0,
    aiming: false,
    walkPhase: 0,
    hurtT: 0,
  };
}

export function hurtPlayer(G, dmg) {
  const P = G.player;
  if (!P.alive || G.state !== 'play') return;
  const absorbed = Math.min(P.armor, dmg * 0.6);
  P.armor -= absorbed;
  P.health -= dmg - absorbed;
  P.hurtT = 0.35;
  G.effects.addShake(2.2);
  if (P.health <= 0) {
    P.health = 0;
    P.alive = false;
    G.onWasted();
  }
}

function nearestCar(G, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(G, car) {
  const P = G.player;
  if (car.driver === 'traffic') {
    // Yank the driver out: they hit the pavement running.
    const ped = makePed(G.rng, car.x - Math.sin(car.angle) * 20, car.y + Math.cos(car.angle) * 20, 'walker');
    ped.state = 'flee';
    ped.angle = car.angle + Math.PI / 2;
    G.peds.push(ped);
    G.police.reportCrime('carjack', car.x, car.y);
    G.effects.floatText(car.x, car.y - 30, 'JACKED!', '#ffb020');
  } else if (car.type === 'police') {
    G.police.reportCrime('carjack', car.x, car.y);
  }
  car.driver = 'player';
  car.speed = 0;
  P.car = car;
  G.audio.setLoop('engine', true, 0.06);
}

function exitCar(G) {
  const P = G.player;
  const car = P.car;
  if (!car) return;
  car.driver = 'parked';
  const side = Math.PI / 2;
  P.x = car.x + Math.cos(car.angle + side) * -26;
  P.y = car.y + Math.sin(car.angle + side) * -26;
  const [cx, cy] = collideBuildings(G.city, P.x, P.y, 8);
  P.x = cx;
  P.y = cy;
  P.car = null;
  G.audio.setLoop('engine', false);
}

function startReload(G) {
  const P = G.player;
  const w = WEAPONS[P.weapon];
  if (P.reloadT > 0 || P.mag >= w.mag || P.reserve <= 0 || P.weapon === 'fists') return;
  P.reloadT = 0.9;
}

function finishReload(G) {
  const P = G.player;
  const w = WEAPONS[P.weapon];
  const take = Math.min(w.mag - P.mag, P.reserve);
  P.mag += take;
  P.reserve -= take;
}

function shoot(G) {
  const P = G.player;
  const w = WEAPONS[P.weapon];
  const target = G.mouseWorld;
  const base = Math.atan2(target.y - P.y, target.x - P.x);
  const ang = base + (Math.random() - 0.5) * 2 * w.spread;
  G.bullets.push({ x: P.x + Math.cos(base) * 13, y: P.y + Math.sin(base) * 13, vx: Math.cos(ang) * 640, vy: Math.sin(ang) * 640, from: 'player', dmg: w.dmg, life: 0.8 });
  P.mag -= 1;
  P.fireCd = w.rate;
  G.audio.gunshot();
  G.effects.muzzleSmoke(P.x, P.y, base);
  G.effects.burst(P.x + Math.cos(base) * 15, P.y + Math.sin(base) * 15, { count: 2, speed: 30, life: 0.07, size: 3.4, color: '#ffd76a' });
  G.threat = { x: P.x, y: P.y, until: G.t + 3 };
  G.police.reportCrime('shots', P.x, P.y);
  if (P.mag <= 0) startReload(G);
}

function punch(G) {
  const P = G.player;
  P.fireCd = WEAPONS.fists.rate;
  G.audio.melee();
  const fx = P.x + Math.cos(P.angle) * 24;
  const fy = P.y + Math.sin(P.angle) * 24;
  for (const ped of G.peds) {
    if (dist(fx, fy, ped.x, ped.y) < 20 && ped.state !== 'down') {
      hurtPed(G, ped, WEAPONS.fists.dmg, true);
      ped.x += Math.cos(P.angle) * 9;
      ped.y += Math.sin(P.angle) * 9;
      return;
    }
  }
  for (const car of G.cars) {
    if (dist(fx, fy, car.x, car.y) < car.spec.len * 0.55) {
      G.effects.sparks(fx, fy);
      return;
    }
  }
}

export function updatePlayer(G, dt) {
  const P = G.player;
  const input = G.input;
  if (!P.alive) return;
  P.fireCd -= dt;
  P.hurtT = Math.max(0, P.hurtT - dt);
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) finishReload(G);
  }

  if (P.car) {
    const car = P.car;
    const up = input.down('KeyW', 'ArrowUp');
    const downKey = input.down('KeyS', 'ArrowDown');
    const left = input.down('KeyA', 'ArrowLeft');
    const right = input.down('KeyD', 'ArrowRight');
    const throttle = up ? 1 : downKey ? -1 : 0;
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const handbrake = input.down('Space');
    driveCar(G, car, dt, throttle, steer, handbrake);
    P.x = car.x;
    P.y = car.y;
    P.angle = car.angle;
    P.speed = Math.abs(car.speed);
    G.audio.setLoop('engine', true, 0.05 + Math.min(0.13, Math.abs(car.speed) / 2600));
    if (input.hit('KeyE') && Math.abs(car.speed) < 250) exitCar(G);
    if (input.hit('KeyR')) G.audio.cycleStation() && G.effects.floatText(car.x, car.y - 34, G.audio.stationName(), '#22d3ee');
    // Running someone down in a car is the car's problem (pedestrians.js
    // checks), but ramming a police car is noticed here via collisions.
    return;
  }

  // On foot.
  let mx = 0;
  let my = 0;
  if (input.down('KeyW', 'ArrowUp')) my -= 1;
  if (input.down('KeyS', 'ArrowDown')) my += 1;
  if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.down('KeyD', 'ArrowRight')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  const running = input.down('ShiftLeft', 'ShiftRight');
  const speed = running ? 178 : 108;
  if (moving) {
    const len = Math.hypot(mx, my);
    P.x += (mx / len) * speed * dt;
    P.y += (my / len) * speed * dt;
    P.walkPhase += dt * (running ? 11 : 8);
    if (!input.mouseDown) P.angle = Math.atan2(my, mx);
  }
  P.speed = moving ? speed : 0;
  const [cx, cy] = collideBuildings(G.city, P.x, P.y, 8);
  P.x = cx;
  P.y = cy;
  P.x = clamp(P.x, 12, WATER_X - 30);
  P.y = clamp(P.y, 12, WORLD_H - 12);

  P.aiming = input.mouseDown || input.down('KeyF');
  if (P.aiming) P.angle = Math.atan2(G.mouseWorld.y - P.y, G.mouseWorld.x - P.x);

  // Weapon swap: 1 fists, 2 pistol, 3 smg (once owned).
  if (input.hit('Digit1')) { P.weapon = 'fists'; P.reloadT = 0; }
  if (input.hit('Digit2')) { P.weapon = 'pistol'; P.reloadT = 0; P.mag = Math.min(P.mag, WEAPONS.pistol.mag); }
  if (input.hit('Digit3') && P.hasSmg) { P.weapon = 'smg'; P.reloadT = 0; }
  if (input.hit('KeyR')) startReload(G);

  if (P.weapon === 'fists') {
    if ((input.mouseClicked || input.hit('KeyF')) && P.fireCd <= 0) punch(G);
  } else if (input.mouseDown && P.fireCd <= 0 && P.reloadT <= 0) {
    if (P.mag > 0) shoot(G);
    else startReload(G);
  }

  if (input.hit('KeyE')) {
    const car = nearestCar(G, P.x, P.y, 50);
    if (car && car.health > 0) {
      enterCar(G, car);
      return;
    }
  }
}

/** Bullets for everyone: travel, walls, cars, people. */
export function updateBullets(G, dt) {
  const P = G.player;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let kill = b.life <= 0;
    if (!kill && pointInBuilding(G.city, b.x, b.y, 0)) {
      G.effects.sparks(b.x, b.y);
      kill = true;
    }
    if (!kill) {
      for (const car of G.cars) {
        if (dist(b.x, b.y, car.x, car.y) < car.spec.len * 0.52) {
          G.effects.sparks(b.x, b.y);
          if (b.from === 'player') {
            car.health -= b.dmg * 0.24;
            if (car.type === 'police') G.police.reportCrime('shots', b.x, b.y);
            if (car.driver === 'traffic') car.driver = 'fleeing';
          } else if (car.driver === 'player') {
            hurtPlayer(G, b.dmg * 0.45);
          }
          kill = true;
          break;
        }
      }
    }
    if (!kill && b.from === 'player') {
      for (const ped of G.peds) {
        if (ped.state === 'down' || ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 9.5) {
          hurtPed(G, ped, b.dmg, true);
          kill = true;
          break;
        }
      }
      if (!kill) {
        for (const off of G.police.officers) {
          if (off.state === 'down' || off.dead) continue;
          if (dist(b.x, b.y, off.x, off.y) < 9.5) {
            G.police.hurtOfficer(G, off, b.dmg);
            kill = true;
            break;
          }
        }
      }
    }
    if (!kill && b.from !== 'player' && !P.car && P.alive) {
      if (dist(b.x, b.y, P.x, P.y) < 9.5) {
        hurtPlayer(G, b.dmg);
        kill = true;
      }
    }
    if (kill) G.bullets.splice(i, 1);
  }
}

export function drawPlayer(ctx, P, t) {
  if (P.car) return; // hidden inside the car; the car is drawn instead
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.fillStyle = 'rgba(15,15,20,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 3.4, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const swing = P.speed > 4 ? Math.sin(P.walkPhase) * 4.6 : 0;
  ctx.strokeStyle = '#23232e';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.cos(P.angle) * 2 - Math.sin(P.angle) * swing * 0.5, 5.4);
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.cos(P.angle) * 2 + Math.sin(P.angle) * swing * 0.5, 5.4);
  ctx.stroke();
  ctx.rotate(P.angle);
  // Teal jacket — the player's silhouette in every screenshot.
  ctx.fillStyle = P.hurtT > 0 ? '#d94848' : '#0e7d86';
  ctx.beginPath();
  ctx.roundRect(-5.8, -5.8, 11.6, 11.6, 3.6);
  ctx.fill();
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(1.8, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12242e';
  ctx.fillRect(0.4, -4.1, 3.6, 8.2); // cap brim band
  if (P.weapon !== 'fists') {
    ctx.fillStyle = '#17171d';
    ctx.fillRect(6.4, -1.5, P.weapon === 'smg' ? 13 : 9.6, 3);
  }
  ctx.restore();
}

export function drawBullets(ctx, bullets) {
  ctx.strokeStyle = 'rgba(255,230,150,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const b of bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
  }
  ctx.stroke();
}
