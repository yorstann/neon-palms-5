// Cars for Neon Palms: five body types, a traffic system that routes
// between intersections on right-hand lanes, arcade driving physics for
// whoever is behind the wheel, and rendering with working brake lights,
// police light bars, night headlight cones and the player's neon underglow.

import { randRange, pick, clamp, turnToward, angleDelta, dist } from './random.js';
import { V_ROADS, H_ROADS, WORLD_W, WORLD_H, WATER_X, collideBuildings, intersections } from './city.js';

export const CAR_TYPES = {
  sedan: { len: 46, wid: 22, top: 318, accel: 300, grip: 3.4, colors: ['#b8433a', '#3a6ab8', '#c0c4cc', '#3f3f46', '#7a4fa3', '#2e8a6e'] },
  taxi: { len: 46, wid: 22, top: 306, accel: 290, grip: 3.4, colors: ['#f2b705'] },
  sports: { len: 48, wid: 22, top: 438, accel: 430, grip: 4.1, colors: ['#ff2e88', '#ffb020', '#22d3ee', '#e8e8f0', '#8aff5e'] },
  truck: { len: 66, wid: 26, top: 252, accel: 210, grip: 2.6, colors: ['#8a8f98', '#6e7f5c', '#7a4a3a', '#54606e'] },
  police: { len: 47, wid: 22, top: 402, accel: 390, grip: 3.8, colors: ['#e8ecf2'] },
};

export const NODES = intersections();
const LANE = 40;

let carSeq = 1;

export function makeCar(type, x, y, angle, driver = 'parked') {
  const spec = CAR_TYPES[type];
  return {
    id: carSeq++,
    type, x, y, angle,
    speed: 0,
    steer: 0,
    driver, // parked | traffic | player | police | race | mission | wreck
    color: null, // set by caller via paintCar
    health: 100,
    fromNode: -1,
    toNode: -1,
    braking: false,
    popped: 0, // seconds of spike-strip damage left
    smokeT: 0,
    honkT: 0,
    dead: false,
    spec,
  };
}

export function paintCar(rng, car) {
  car.color = pick(rng, car.spec.colors);
  return car;
}

function nodeIndex(x, y) {
  for (let i = 0; i < NODES.length; i++) {
    if (NODES[i].x === x && NODES[i].y === y) return i;
  }
  return -1;
}

function neighbours(idx) {
  const n = NODES[idx];
  const out = [];
  for (let i = 0; i < NODES.length; i++) {
    if (i === idx) continue;
    const m = NODES[i];
    if (m.x === n.x || m.y === n.y) {
      const isAdjacent =
        (m.x === n.x && Math.abs(H_ROADS.indexOf(m.y) - H_ROADS.indexOf(n.y)) === 1) ||
        (m.y === n.y && Math.abs(V_ROADS.indexOf(m.x) - V_ROADS.indexOf(n.x)) === 1);
      if (isAdjacent) out.push(i);
    }
  }
  return out;
}

/** Give a traffic car a route: it sits on the node it starts nearest. */
export function routeFromNearestNode(car) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = dist(car.x, car.y, NODES[i].x, NODES[i].y);
    if (d < bestD) { bestD = d; best = i; }
  }
  car.fromNode = best;
  const options = neighbours(best);
  car.toNode = options[Math.floor(Math.random() * options.length)];
}

/** Is something solid within `gap` px straight ahead of this car? */
function blockedAhead(G, car, gap) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * fx + oy * fy;
    if (ahead < 4 || ahead > gap) continue;
    const side = Math.abs(ox * -fy + oy * fx);
    if (side < 24) return other;
  }
  if (G.player && !G.player.car && G.player.alive) {
    const ox = G.player.x - car.x;
    const oy = G.player.y - car.y;
    const ahead = ox * fx + oy * fy;
    if (ahead > 4 && ahead < gap && Math.abs(ox * -fy + oy * fx) < 20) return G.player;
  }
  return null;
}

/** Shared low-level drive: accelerate along heading, roll, collide. */
export function driveCar(G, car, dt, throttle, steer, handbrake = false) {
  const spec = car.spec;
  const topSpeed = spec.top * (car.popped > 0 ? 0.42 : 1) * (car.health <= 0 ? 0 : 1);
  car.steer = steer;
  if (throttle > 0) car.speed += spec.accel * throttle * dt * (1 - Math.max(0, car.speed) / (topSpeed * 1.12));
  else if (throttle < 0) {
    if (car.speed > 12) car.speed -= spec.accel * 1.5 * dt;
    else car.speed = Math.max(-topSpeed * 0.32, car.speed - spec.accel * 0.7 * dt);
  } else {
    car.speed -= car.speed * 0.55 * dt;
  }
  if (handbrake) car.speed -= car.speed * 1.7 * dt;
  car.speed = clamp(car.speed, -topSpeed * 0.35, topSpeed);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const steerPower = clamp(Math.abs(car.speed) / 60, 0, 1) * (car.speed < 0 ? -1 : 1);
  let wobble = 0;
  if (car.popped > 0) wobble = Math.sin(G.t * 22 + car.id) * 0.14;
  car.angle += steer * 1.9 * steerPower * dt * (handbrake ? 1.5 : 1) + wobble * dt * steerPower;

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;

  // Skid marks and drift smoke when cornering hard or handbraking.
  const lateral = Math.abs(steer) * Math.abs(car.speed);
  if ((handbrake && Math.abs(car.speed) > 60) || lateral > 240) {
    const bx = car.x - Math.cos(car.angle) * spec.len * 0.36;
    const by = car.y - Math.sin(car.angle) * spec.len * 0.36;
    const px = -Math.sin(car.angle);
    const py = Math.cos(car.angle);
    G.effects.skid(bx + px * 9, by + py * 9, car.angle);
    G.effects.skid(bx - px * 9, by - py * 9, car.angle);
    if (handbrake && Math.random() < 0.4) G.effects.smoke(car.x, car.y);
  }

  // World bounds and the bay.
  car.x = clamp(car.x, 26, WATER_X - 6);
  car.y = clamp(car.y, 26, WORLD_H - 26);
  const before = { x: car.x, y: car.y };
  const [cx, cy] = collideBuildings(G.city, car.x, car.y, spec.wid * 0.86);
  if (cx !== before.x || cy !== before.y) {
    if (Math.abs(car.speed) > 130) {
      G.effects.sparks(car.x, car.y);
      G.audio.crash(Math.min(1, Math.abs(car.speed) / 320));
      G.effects.addShake(3);
      damageCar(G, car, Math.abs(car.speed) * 0.03);
    }
    car.x = cx;
    car.y = cy;
    car.speed *= 0.55;
  }
  if (car.popped > 0) car.popped -= dt;
  car.braking = throttle < 0 || handbrake;
}

export function damageCar(G, car, amount) {
  if (car.health <= 0) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.driver = 'wreck';
    G.effects.smoke(car.x, car.y, true);
  }
}

/** Traffic behaviour: follow the lane to the next node, then choose onward. */
export function updateTrafficCar(G, car, dt) {
  if (car.toNode < 0) routeFromNearestNode(car);
  const to = NODES[car.toNode];
  const from = NODES[car.fromNode];
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  // Right-hand traffic: the lane sits to the right of the direction of
  // travel — southbound side for eastbound cars, west side for southbound.
  const rx = -dy;
  const ry = dx;
  const tx = to.x + rx * LANE;
  const ty = to.y + ry * LANE;
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, targetAngle) * 2.2, -1, 1);
  const blocker = blockedAhead(G, car, 86);
  let throttle = blocker ? (blocker.speed !== undefined && car.speed > blocker.speed ? -0.4 : 0) : 1;
  if (blocker && dist(car.x, car.y, blocker.x ?? 0, blocker.y ?? 0) < 52) throttle = -0.5;
  driveCar(G, car, dt, throttle * 0.62, steer);

  if (dist(car.x, car.y, to.x, to.y) < 64) {
    const options = neighbours(car.toNode).filter((i) => i !== car.fromNode);
    const straight = neighbours(car.toNode).find((i) => {
      const n = NODES[i];
      return Math.sign(n.x - to.x) === dx && Math.sign(n.y - to.y) === dy;
    });
    let next;
    if (straight !== undefined && Math.random() < 0.55) next = straight;
    else next = options.length ? options[Math.floor(Math.random() * options.length)] : car.fromNode;
    car.fromNode = car.toNode;
    car.toNode = next;
  }
}

/** Free steering toward a point (police pursuit, racers, mission cars). */
export function steerToward(G, car, dt, tx, ty, throttleScale = 1, arriveRadius = 0) {
  const d = dist(car.x, car.y, tx, ty);
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, targetAngle) * 2.4, -1, 1);
  let throttle = throttleScale;
  if (arriveRadius > 0 && d < arriveRadius) throttle = clamp(d / arriveRadius, 0, 1) * throttleScale;
  if (d < 30) throttle = 0;
  driveCar(G, car, dt, throttle, steer);
  return d;
}

/** Car-to-car bumps: push apart, spark and dent on hard hits. */
export function resolveCarCollisions(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = (a.spec.wid + b.spec.wid) * 1.06;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = Math.abs(a.speed - b.speed);
      if (closing > 90) {
        G.effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2);
        G.audio.crash(Math.min(1, closing / 300));
        damageCar(G, a, closing * 0.02);
        damageCar(G, b, closing * 0.02);
        if (a.driver === 'player' || b.driver === 'player') G.effects.addShake(4);
      }
      const swap = (a.speed + b.speed) / 2;
      a.speed = swap * 0.9;
      b.speed = swap * 0.9;
    }
  }
}

/** A random drivable spot on a road near (x, y) — used for spawns. */
export function roadSpotNear(rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 24; tries++) {
    const node = NODES[Math.floor(rng() * NODES.length)];
    const d = dist(x, y, node.x, node.y);
    if (d < minD || d > maxD) continue;
    const vertical = rng() < 0.5;
    const along = randRange(rng, -260, 260);
    const px = vertical ? node.x + (rng() < 0.5 ? -LANE : LANE) : clamp(node.x + along, 60, WORLD_W - 200);
    const py = vertical ? clamp(node.y + along, 60, WORLD_H - 60) : node.y + (rng() < 0.5 ? -LANE : LANE);
    return { x: px, y: py, angle: vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI) };
  }
  return { x: 2020, y: 450, angle: 0 };
}

export function drawCar(ctx, car, G) {
  const spec = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  // Neon underglow on the player's ride after dark.
  if (car.driver === 'player' && G.dark > 0.25) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, spec.len * 0.85);
    const tint = car.type === 'sports' ? '255,47,160' : '34,211,238';
    glow.addColorStop(0, `rgba(${tint},${0.4 * G.dark})`);
    glow.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, spec.len * 0.85, spec.wid * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.rotate(car.angle);
  const L = spec.len;
  const W = spec.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(8,8,14,0.4)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Body.
  ctx.fillStyle = car.health <= 0 ? '#2c2c30' : car.color;
  if (car.type === 'truck') {
    ctx.fillRect(-L / 2, -W / 2, L * 0.34, W); // cab
    ctx.fillStyle = car.health <= 0 ? '#3a3a40' : '#d8d4cc';
    ctx.fillRect(-L / 2 + L * 0.36, -W / 2 + 1, L * 0.62, W - 2); // cargo box
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    ctx.fillRect(L / 2 - 4 - L * 0.66 + L * 0.32, -W / 2 + 3, 7, W - 6);
  } else {
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 6);
    ctx.fill();
    // Cabin glass.
    ctx.fillStyle = 'rgba(16,26,40,0.9)';
    ctx.beginPath();
    ctx.roundRect(-L * 0.08, -W / 2 + 3.4, L * 0.3, W - 6.8, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,180,220,0.35)';
    ctx.fillRect(L * 0.14, -W / 2 + 4.4, 3.4, W - 8.8);
    // Racing stripe on sports cars.
    if (car.type === 'sports') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-L / 2 + 3, -2.4, L - 6, 4.8);
    }
    if (car.type === 'police') {
      ctx.fillStyle = '#20304a';
      ctx.fillRect(-L * 0.3, -W / 2, L * 0.2, W);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PBPD', 0, 2.6);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#fff7cc';
      ctx.fillRect(-4, -5, 9, 10);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 6px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0.5, 2.2);
    }
  }
  // Wheels.
  ctx.fillStyle = '#101014';
  const ww = 8.4;
  const wh = 4.6;
  ctx.fillRect(L / 2 - ww - 3, -W / 2 - 1.6, ww, wh);
  ctx.fillRect(L / 2 - ww - 3, W / 2 - wh + 1.6, ww, wh);
  ctx.fillRect(-L / 2 + 3, -W / 2 - 1.6, ww, wh);
  ctx.fillRect(-L / 2 + 3, W / 2 - wh + 1.6, ww, wh);
  // Headlights and brake lights.
  ctx.fillStyle = '#fff6cf';
  ctx.fillRect(L / 2 - 2.4, -W / 2 + 2.6, 2.6, 4.4);
  ctx.fillRect(L / 2 - 2.4, W / 2 - 7, 2.6, 4.4);
  ctx.fillStyle = car.braking ? '#ff2e2e' : 'rgba(200,40,40,0.65)';
  ctx.fillRect(-L / 2 - 0.4, -W / 2 + 2.6, 2.6, 4.4);
  ctx.fillRect(-L / 2 - 0.4, W / 2 - 7, 2.6, 4.4);
  // Police light bar.
  if (car.type === 'police' && car.health > 0) {
    const phase = Math.floor(G.t * 6 + car.id) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2e4d' : '#2e7dff';
    ctx.fillRect(-4.4, -W / 2 + 3, 8.8, 5.4);
    ctx.fillStyle = phase ? '#2e7dff' : '#ff2e4d';
    ctx.fillRect(-4.4, W / 2 - 8.4, 8.8, 5.4);
  }
  // Damage smoke is spawned by main; a scorched roof marks a wreck.
  if (car.health <= 0) {
    ctx.fillStyle = 'rgba(10,10,10,0.5)';
    ctx.beginPath();
    ctx.roundRect(-L / 2 + 4, -W / 2 + 3, L - 8, W - 6, 5);
    ctx.fill();
  }
  ctx.restore();
}

/** Headlight cones for every car, drawn additively in the night pass. */
export function drawHeadlights(ctx, car, dark) {
  if (dark <= 0.15 || car.health <= 0) return;
  const spec = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const grad = ctx.createLinearGradient(spec.len / 2, 0, spec.len / 2 + 118, 0);
    grad.addColorStop(0, `rgba(255,240,190,${0.16 * dark})`);
    grad.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(spec.len / 2, side * (spec.wid / 2 - 4.8));
    ctx.lineTo(spec.len / 2 + 118, side * (spec.wid / 2 + 15));
    ctx.lineTo(spec.len / 2 + 118, side * (spec.wid / 2 - 22));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
