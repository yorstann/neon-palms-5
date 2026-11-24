// The people of Palmera Bay: pedestrians stroll the sidewalks, scatter when
// trouble starts and drop their wallets when they go down; gang members
// hold their corners in Industrial and the Harbor and answer gunfire in
// kind. Officers reuse the same body renderer (see police.js).

import { randRange, pick, clamp, dist } from './random.js';
import { V_ROADS, H_ROADS, ROAD_W, WORLD_W, WORLD_H, collideBuildings, pointInBuilding } from './city.js';

const SHIRTS = ['#d95f4b', '#4b7dd9', '#59b368', '#d9b84b', '#9a6ad9', '#e8e4da', '#4bd0d9', '#d94b9e'];
const PANTS = ['#2c3242', '#4a3a2c', '#31443a', '#585c66', '#22222a'];
const SKIN = ['#f2c79b', '#c98d5e', '#8a5a34', '#6e4525', '#ffd9b3'];

let pedSeq = 1;

export function makePed(rng, x, y, kind = 'walker') {
  return {
    id: pedSeq++,
    kind, // walker | gang | officer | passenger
    x, y,
    angle: randRange(rng, 0, Math.PI * 2),
    speed: 0,
    walkSpeed: randRange(rng, 42, 68),
    state: 'walk', // walk | flee | down | stand | strafe
    timer: randRange(rng, 2, 6),
    shirt: pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    skin: pick(rng, SKIN),
    health: kind === 'gang' ? 42 : 20,
    shootCd: randRange(rng, 0.4, 1.2),
    hostile: false,
    corner: null,
    downT: 0,
    dead: false,
  };
}

/** A sidewalk point near (x, y): just off a random road's edge. */
export function sidewalkSpot(rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 20; tries++) {
    const vertical = rng() < 0.5;
    const road = vertical ? pick(rng, V_ROADS) : pick(rng, H_ROADS);
    const along = vertical ? randRange(rng, 60, WORLD_H - 60) : randRange(rng, 60, WORLD_W - 260);
    const side = rng() < 0.5 ? -1 : 1;
    const px = vertical ? road + side * (ROAD_W / 2 + 15) : along;
    const py = vertical ? along : road + side * (ROAD_W / 2 + 15);
    const d = dist(x, y, px, py);
    if (d >= minD && d <= maxD) return { x: px, y: py };
  }
  return { x: 2100, y: 560 };
}

function walkTarget(ped, rng) {
  // Stroll along the current sidewalk: mostly straight, sometimes cross.
  const turn = rng();
  if (turn < 0.62) return;
  if (turn < 0.86) ped.angle += Math.PI / 2;
  else ped.angle -= Math.PI / 2;
}

export function updatePed(G, ped, dt) {
  if (ped.dead) return;
  const P = G.player;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) ped.dead = true;
    return;
  }

  const threat = G.threat; // {x, y, until} set by gunfire and crashes
  const nearThreat = threat && G.t < threat.until && dist(ped.x, ped.y, threat.x, threat.y) < 300;
  const carDanger = G.cars.some((c) => Math.abs(c.speed) > 190 && dist(ped.x, ped.y, c.x, c.y) < 90);

  if (ped.kind === 'gang') {
    updateGang(G, ped, dt);
    return;
  }

  if (nearThreat || carDanger) ped.state = 'flee';
  else if (ped.state === 'flee' && !nearThreat) ped.state = 'walk';

  if (ped.state === 'flee') {
    const sx = threat ? threat.x : P.x;
    const sy = threat ? threat.y : P.y;
    ped.angle = Math.atan2(ped.y - sy, ped.x - sx);
    ped.speed = 148;
  } else {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.timer = randRange(G.rng, 2.5, 7);
      walkTarget(ped, G.rng);
    }
    ped.speed = ped.walkSpeed;
  }

  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const [cx, cy] = collideBuildings(G.city, ped.x, ped.y, 7);
  if (cx !== ped.x || cy !== ped.y) {
    ped.x = cx;
    ped.y = cy;
    ped.angle += Math.PI / 2; // slide along the wall by turning
  }
  ped.x = clamp(ped.x, 14, WORLD_W - 190);
  ped.y = clamp(ped.y, 14, WORLD_H - 14);

  // Stepped into the road and met a car: down, wallet out, heat if seen.
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 60) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 24) {
      knockDown(G, ped, car.driver === 'player');
      break;
    }
  }
}

export function knockDown(G, ped, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = 6;
  ped.speed = 0;
  G.effects.bloodPuff(ped.x, ped.y);
  G.pickups.push({ x: ped.x + randRange(G.rng, -12, 12), y: ped.y + randRange(G.rng, -12, 12), kind: 'cash', amount: randRange(G.rng, 8, 42) | 0, t: 0 });
  if (byPlayer) G.police.reportCrime('hitandrun', ped.x, ped.y);
}

function updateGang(G, ped, dt) {
  const P = G.player;
  const d = dist(ped.x, ped.y, P.x, P.y);
  if (!ped.hostile) {
    // Idle on the corner until the player starts something.
    if (G.threat && G.t < G.threat.until && dist(ped.x, ped.y, G.threat.x, G.threat.y) < 340) ped.hostile = true;
    if (!P.car && P.aiming && d < 170) ped.hostile = true;
    if (d < 56) ped.hostile = true;
    if (ped.hostile) G.effects.floatText(ped.x, ped.y - 26, '!', '#ff5a4d');
    return;
  }
  // Hostile: keep a firing distance, strafe, and shoot in bursts.
  const want = 165;
  const away = d < want - 30 ? 1 : d > want + 60 ? -1 : 0;
  const baseAng = Math.atan2(P.y - ped.y, P.x - ped.x);
  const strafeDir = (ped.id % 2 === 0 ? 1 : -1);
  const moveAng = baseAng + Math.PI / 2 * strafeDir * 0.7 + away * Math.PI * 0.9;
  if (d < 430) {
    ped.x += Math.cos(moveAng) * 52 * dt;
    ped.y += Math.sin(moveAng) * 52 * dt;
    const [cx, cy] = collideBuildings(G.city, ped.x, ped.y, 7);
    ped.x = cx;
    ped.y = cy;
  }
  ped.angle = baseAng;
  ped.shootCd -= dt;
  if (ped.shootCd <= 0 && d < 360 && P.alive) {
    ped.shootCd = randRange(G.rng, 0.75, 1.35);
    const spread = randRange(G.rng, -0.13, 0.13) + clamp(d / 2600, 0, 0.12);
    const ang = baseAng + spread;
    G.bullets.push({ x: ped.x, y: ped.y, vx: Math.cos(ang) * 540, vy: Math.sin(ang) * 540, from: 'gang', dmg: 9, life: 0.75 });
    G.audio.gunshot();
    G.effects.muzzleSmoke(ped.x, ped.y, ang);
    G.threat = { x: ped.x, y: ped.y, until: G.t + 2.5 };
  }
}

export function hurtPed(G, ped, dmg, byPlayer) {
  if (ped.dead || ped.state === 'down') return;
  ped.health -= dmg;
  if (ped.kind === 'gang') ped.hostile = true;
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.downT = 9;
    ped.speed = 0;
    G.effects.bloodPuff(ped.x, ped.y);
    if (ped.kind === 'gang') {
      G.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: randRange(G.rng, 35, 95) | 0, t: 0 });
      if (byPlayer) G.police.reportCrime('shootout', ped.x, ped.y);
    } else if (byPlayer) {
      G.police.reportCrime('assault', ped.x, ped.y);
    }
  } else if (ped.kind !== 'gang') {
    ped.state = 'flee';
  }
}

export function drawPed(ctx, ped, t) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(20,20,26,0.35)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-11, -3.4, 12, 6.8);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(0, -4.4, 10, 8.8);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(13.5, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Shadow, legs (scissoring while moving), torso, head.
  ctx.fillStyle = 'rgba(15,15,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 7.5, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const moving = ped.speed > 4;
  const swing = moving ? Math.sin(t * (ped.state === 'flee' ? 13 : 9) + ped.id * 2.1) * 4.4 : 0;
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.cos(ped.angle) * 2 + Math.cos(ped.angle + Math.PI / 2) * swing * 0.4 - Math.sin(ped.angle) * swing * 0.5, Math.abs(swing) * 0.4 + 4.6);
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.cos(ped.angle) * 2 - Math.cos(ped.angle + Math.PI / 2) * swing * 0.4 + Math.sin(ped.angle) * swing * 0.5, Math.abs(swing) * 0.4 + 4.6);
  ctx.stroke();
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.kind === 'officer' ? '#274b8f' : ped.kind === 'gang' ? '#7d2430' : ped.shirt;
  ctx.beginPath();
  ctx.roundRect(-5.4, -5.4, 10.8, 10.8, 3.4);
  ctx.fill();
  if (ped.kind === 'gang') {
    ctx.fillStyle = '#c8a03a';
    ctx.fillRect(1.4, -4.6, 2.2, 9.2); // chain stripe
  }
  if (ped.kind === 'officer') {
    ctx.fillStyle = '#d8b93a';
    ctx.fillRect(2.6, -1.4, 2.8, 2.8); // badge
  }
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(1.8, 0, 3.9, 0, Math.PI * 2);
  ctx.fill();
  if (ped.kind === 'gang' && ped.hostile) {
    ctx.fillStyle = '#1c1c22';
    ctx.fillRect(6, -1.4, 10.5, 2.8); // pistol
  }
  ctx.restore();

  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 15);
  }
}
