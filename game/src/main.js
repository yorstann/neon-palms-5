// Neon Palms — boot, the fixed-step loop, and the render pipeline.
//
// Palmera Bay is an original top-down open-world crime game: six districts,
// traffic and pedestrians, a witnessed-crime wanted system with pursuit
// cars, roadblocks, spike strips and a searchlight helicopter, a
// seven-mission story for fixer Mara Voss, taxi fares, hidden packages, a
// checkpoint street race, dynamic rain weather and a full day/night cycle.
// Everything is drawn in code on one canvas and every sound is synthesized
// with WebAudio — no external assets at all.
//
// ?seed=N fixes the city. ?shot=title|downtown|chase|race stages a
// deterministic scene (see shots.js), runs fixed steps and sets
// window.__shotReady for the screenshot harness.

import { makeRng, clamp, dist, pick } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import {
  buildCity, drawGround, drawBuildings, drawWetReflections, drawLightPools,
  WORLD_W, WORLD_H, WATER_X, collideBuildings, pointInBuilding,
} from './city.js';
import { Weather } from './weather.js';
import { makeCar, paintCar, updateTrafficCar, resolveCarCollisions, roadSpotNear, drawCar, drawHeadlights, NODES } from './vehicles.js';
import { makePed, updatePed, drawPed, sidewalkSpot } from './pedestrians.js';
import { Police } from './police.js';
import { makePlayer, updatePlayer, updateBullets, drawPlayer, drawBullets, hurtPlayer } from './player.js';
import { Missions } from './missions.js';
import { loadSave, storeSave, defaultSave, wipeSave } from './save.js';
import { drawHUD, drawRace, drawDialogue, drawPhone, drawTitle, drawPause, drawHelp, drawBusted, drawWasted } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const VIEW = { w: 1280, h: 720 };

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261124;

const canvas = document.getElementById('game');
canvas.width = VIEW.w;
canvas.height = VIEW.h;
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const G = {
  canvas, ctx, view: VIEW,
  t: 0,
  timeMin: 17 * 60 + 20,
  dark: 0,
  dusk: 0,
  state: 'title',
  seed,
  rng: makeRng(seed ^ 0x51ab),
  city: buildCity(seed),
  cars: [],
  peds: [],
  bullets: [],
  pickups: [],
  threat: null,
  objective: null,
  objectiveText: '',
  prompt: null,
  dialogue: null,
  raceLock: false,
  showHelp: false,
  lastFine: 0,
  lastBill: 0,
  cam: { x: 1400, y: 900 },
  camSnap: null,
  mouseWorld: { x: 0, y: 0 },
  spawnT: 0,
  save: loadSave(),
};
G.input = new Input(canvas);
G.effects = new Effects();
G.weather = new Weather(makeRng(seed ^ 0x77c1));
G.audio = new AudioEngine(G.save);
G.player = makePlayer(G.save);
G.police = new Police(G);
G.missions = new Missions(G);
G.hurtPlayer = (dmg) => hurtPlayer(G, dmg);
G.persist = () => storeSave(G.save);
G.addMoney = (amount, why) => {
  G.save.money += amount;
  if (amount > 0) G.save.totalEarned += amount;
  if (why) G.effects.floatText(G.player.x, G.player.y - 34, `+$${amount} ${why}`, '#7dff9a');
  G.audio.cash();
};

G.city.packages.forEach((pkg, i) => {
  pkg.id = i;
  if (G.save.packagesFound.includes(i)) pkg.taken = true;
});

function announce(msg) {
  if (status) status.textContent = msg;
}

// ---------- world population ----------

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'sports', 'truck'];

function spawnTraffic(nearX, nearY, minD, maxD) {
  const spot = roadSpotNear(G.rng, nearX, nearY, minD, maxD);
  const car = paintCar(G.rng, makeCar(pick(G.rng, TRAFFIC_TYPES), spot.x, spot.y, spot.angle, 'traffic'));
  G.cars.push(car);
  return car;
}

function spawnParked() {
  const node = pick(G.rng, NODES);
  const vertical = G.rng() < 0.5;
  const side = G.rng() < 0.5 ? -1 : 1;
  const x = vertical ? node.x + side * 62 : node.x + (G.rng() * 360 - 180);
  const y = vertical ? node.y + (G.rng() * 360 - 180) : node.y + side * 62;
  if (pointInBuilding(G.city, x, y, 20) || x > WATER_X - 60) return;
  const car = paintCar(G.rng, makeCar(pick(G.rng, TRAFFIC_TYPES), x, y, vertical ? Math.PI / 2 : 0, 'parked'));
  G.cars.push(car);
}

function spawnGangAt(corner) {
  const alive = G.peds.filter((p) => p.kind === 'gang' && p.corner === corner && !p.dead && p.state !== 'down').length;
  for (let i = alive; i < 3; i++) {
    const ped = makePed(G.rng, corner.x + (G.rng() * 90 - 45), corner.y + (G.rng() * 70 - 35), 'gang');
    const [cx, cy] = collideBuildings(G.city, ped.x, ped.y, 9);
    ped.x = cx;
    ped.y = cy;
    ped.corner = corner;
    G.peds.push(ped);
  }
}

function populateWorld() {
  for (let i = 0; i < 11; i++) {
    const node = pick(G.rng, NODES);
    spawnTraffic(node.x, node.y, 0, 500);
  }
  for (let i = 0; i < 16; i++) spawnParked();
  for (const corner of G.city.gangCorners) spawnGangAt(corner);
  for (let i = 0; i < 20; i++) {
    const spot = sidewalkSpot(G.rng, 2400, 1600, 100, 1500);
    G.peds.push(makePed(G.rng, spot.x, spot.y, 'walker'));
  }
}

function ambient(dt) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = 0.7;
  const P = G.player;
  const trafficNear = G.cars.filter((c) => (c.driver === 'traffic' || c.driver === 'fleeing') && dist(P.x, P.y, c.x, c.y) < 1450);
  if (trafficNear.length < 13) spawnTraffic(P.x, P.y, 800, 1300);
  G.cars = G.cars.filter((c) => {
    if ((c.driver === 'traffic' || c.driver === 'fleeing') && dist(P.x, P.y, c.x, c.y) > 1750) return false;
    return true;
  });
  const walkersNear = G.peds.filter((p) => p.kind === 'walker' && dist(P.x, P.y, p.x, p.y) < 1050);
  if (walkersNear.length < 22) {
    const spot = sidewalkSpot(G.rng, P.x, P.y, 400, 900);
    G.peds.push(makePed(G.rng, spot.x, spot.y, 'walker'));
  }
  G.peds = G.peds.filter((p) => {
    if (p.dead) return false;
    if (p.kind === 'walker' && dist(P.x, P.y, p.x, p.y) > 1300) return false;
    return true;
  });
  for (const corner of G.city.gangCorners) {
    corner.timer = (corner.timer ?? 20) - 0.7;
    if (corner.timer <= 0) {
      corner.timer = 45;
      spawnGangAt(corner);
    }
  }
}

// ---------- busted / wasted ----------

G.onBusted = () => {
  if (G.state !== 'play') return;
  const fine = Math.min(G.save.money, 120 + G.police.wanted * 110);
  G.save.money -= fine;
  G.lastFine = fine;
  G.persist();
  endRunCommon();
  const L = G.city.landmarks.policeStation;
  G.player.x = L.x + 30;
  G.player.y = L.y + 46;
  G.player.health = Math.max(70, G.player.health);
  G.state = 'busted';
  announce(`Busted. Fine $${fine}.`);
};

G.onWasted = () => {
  if (G.state !== 'play') return;
  const bill = Math.min(G.save.money, 220);
  G.save.money -= bill;
  G.lastBill = bill;
  G.persist();
  endRunCommon();
  const L = G.city.landmarks.hospital;
  G.player.x = L.x + 30;
  G.player.y = L.y + 46;
  G.player.alive = true;
  G.player.health = 100;
  G.player.armor = 0;
  G.state = 'wasted';
  announce(`Wasted. Hospital bill $${bill}.`);
};

function endRunCommon() {
  const P = G.player;
  if (P.car) {
    P.car.driver = 'parked';
    P.car = null;
  }
  G.police.clearWanted();
  G.missions.onPlayerDown();
  G.bullets = [];
  G.audio.setLoop('engine', false);
  G.audio.setLoop('siren', false);
  G.audio.setLoop('rotor', false);
}

function resetWorld() {
  wipeSave();
  G.save = defaultSave();
  G.audio.save = G.save;
  G.persist();
  G.player = makePlayer(G.save);
  G.police = new Police(G);
  G.missions = new Missions(G);
  G.cars = [];
  G.peds = [];
  G.bullets = [];
  G.pickups = [];
  for (const pkg of G.city.packages) pkg.taken = false;
  G.timeMin = 17 * 60 + 20;
  populateWorld();
}

// ---------- interactions ----------

function interactions() {
  const G_ = G;
  const P = G.player;
  const L = G.city.landmarks;
  G.prompt = null;
  if (G.dialogue || G.state !== 'play') return;

  // Mara: start the next story mission.
  if (!G.missions.active && G.save.missionIndex < 7 && !P.car && dist(P.x, P.y, L.maraCorner.x, L.maraCorner.y) < 58) {
    G.prompt = 'E — Talk to Mara Voss';
    if (G.input.hit('KeyE')) {
      G.input.pressed.delete('KeyE');
      G.missions.tryStartMission();
    }
    return;
  }
  // Race flag: needs a car.
  if (G.missions.race.phase === 'idle' && !G.missions.active && dist(P.x, P.y, L.raceFlag.x, L.raceFlag.y) < 78) {
    if (P.car) {
      G.prompt = 'E — Start the Marina Race';
      if (G.input.hit('KeyE')) {
        G.input.pressed.delete('KeyE');
        G.missions.tryStartRace();
      }
    } else {
      G.prompt = 'The Marina Race — bring a car';
    }
    return;
  }
  // Shine & Go respray.
  if (P.car && G.police.wanted > 0 && dist(P.x, P.y, L.respray.x, L.respray.y) < 92) {
    G.prompt = G.save.money >= 150 ? 'E — Respray at Shine & Go ($150)' : 'Shine & Go needs $150';
    if (G.input.hit('KeyE') && G.save.money >= 150) {
      G.input.pressed.delete('KeyE');
      G.save.money -= 150;
      G.persist();
      G.police.clearWanted();
      P.car.color = pick(G.rng, ['#22d3ee', '#ff2e88', '#ffb020', '#e8e8f0', '#7dff6a']);
      P.car.health = Math.min(100, P.car.health + 25);
      G.effects.burst(P.x, P.y, { count: 16, speed: 120, life: 0.6, size: 3, color: '#bfe9ff' });
      G.audio.pickup();
      G.effects.floatText(P.x, P.y - 38, 'CLEAN PLATES', '#7dff9a');
    }
  }
}

// ---------- simulation step ----------

function computeLight() {
  const h = G.timeMin / 60;
  let day = 0;
  if (h > 6 && h < 19) day = Math.sin(((h - 6) / 13) * Math.PI);
  G.dark = clamp(1 - Math.pow(clamp(day, 0, 1), 0.55), 0, 1);
  G.dusk = clamp(1 - Math.abs(h - 18.6) / 1.15, 0, 1) * (1 - G.dark * 0.35);
}

function stepWorld(dt) {
  G.t += dt;
  G.timeMin = (G.timeMin + dt * 4) % 1440;
  G.weather.camX = G.cam.x;
  G.weather.camY = G.cam.y;
  G.weather.update(dt, G.effects, G.audio);
  computeLight();
  G.mouseWorld.x = G.cam.x + G.input.mouseX;
  G.mouseWorld.y = G.cam.y + G.input.mouseY;

  if (G.state === 'title') {
    for (const car of G.cars) if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
    for (const ped of G.peds) updatePed(G, ped, dt);
    G.effects.update(dt);
    updateCamera(dt);
    G.input.endFrame();
    return;
  }
  if (G.state !== 'play') {
    G.input.endFrame();
    return;
  }

  // Dialogue advances on E / click and freezes the story logic.
  if (G.dialogue) {
    if (G.input.hit('KeyE') || G.input.mouseClicked) {
      const dlg = G.dialogue;
      dlg.index += 1;
      if (dlg.index >= dlg.lines.length) {
        G.dialogue = null;
        if (dlg.onDone) dlg.onDone();
      }
    }
  } else {
    interactions();
    if (!G.raceLock) updatePlayer(G, dt);
  }

  for (const car of G.cars) {
    if (car.driver === 'traffic' || car.driver === 'fleeing') updateTrafficCar(G, car, dt);
    if (car.health > 0 && car.health < 55) {
      car.smokeT += dt;
      if (car.smokeT > 0.34) {
        car.smokeT = 0;
        G.effects.smoke(car.x + Math.cos(car.angle) * 12, car.y + Math.sin(car.angle) * 12, car.health < 26);
      }
    }
  }
  for (const ped of G.peds) updatePed(G, ped, dt);
  G.police.update(G, dt);
  G.missions.update(G, dt);
  resolveCarCollisions(G);
  updateBullets(G, dt);
  G.police.checkSpikes(G);

  // Cash pickups.
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.t += dt;
    if (pk.t > 26) {
      G.pickups.splice(i, 1);
      continue;
    }
    if (dist(G.player.x, G.player.y, pk.x, pk.y) < 27) {
      G.addMoney(pk.amount, '');
      G.pickups.splice(i, 1);
    }
  }

  ambient(dt);
  G.effects.update(dt);
  const inten = G.weather.intensity();
  G.audio.setLoop('rain', inten > 0.02, 0.03 + inten * 0.08);
  G.audio.updateRadio(dt, !!G.player.car);
  updateCamera(dt);
  G.input.endFrame();
}

function updateCamera(dt) {
  // G.cam is the view's top-left corner in world space; targets are points
  // the view should centre on.
  let tx;
  let ty;
  if (G.camSnap) {
    tx = G.camSnap.x;
    ty = G.camSnap.y;
  } else if (G.state === 'title') {
    tx = 2020 + Math.sin(G.t * 0.05) * 260;
    ty = 1250 + Math.cos(G.t * 0.04) * 150;
  } else {
    tx = G.player.x;
    ty = G.player.y;
  }
  const destX = clamp(tx - VIEW.w / 2, 0, WORLD_W - VIEW.w);
  const destY = clamp(ty - VIEW.h / 2, 0, WORLD_H - VIEW.h);
  const k = G.camSnap ? 1 : Math.min(1, dt * 4.5);
  G.cam.x += (destX - G.cam.x) * k;
  G.cam.y += (destY - G.cam.y) * k;
}

// ---------- render ----------

function draw() {
  const cam = G.cam;
  const shakeX = G.effects.shake ? (Math.random() * 2 - 1) * G.effects.shake : 0;
  const shakeY = G.effects.shake ? (Math.random() * 2 - 1) * G.effects.shake : 0;
  const rx = cam.x + shakeX;
  const ry = cam.y + shakeY;
  const camView = { x: rx, y: ry };

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.save();
  ctx.translate(-rx, -ry);

  drawGround(ctx, G.city, camView, VIEW, G.dark);
  G.effects.drawSkids(ctx);
  drawWetReflections(ctx, G.city, camView, VIEW, G.weather.wet, G.dark, G.t);
  G.missions.drawWorld(ctx, G, G.t);
  G.police.drawBlockades(ctx);
  drawBuildings(ctx, G.city, camView, VIEW);

  for (const car of G.cars) drawCar(ctx, car, G);
  for (const ped of G.peds) drawPed(ctx, ped, G.t);
  G.police.drawOfficers(ctx, G.t);
  drawPlayer(ctx, G.player, G.t);
  drawBullets(ctx, G.bullets);
  // Cash pickups.
  for (const pk of G.pickups) {
    ctx.fillStyle = '#7dff9a';
    ctx.fillRect(pk.x - 5, pk.y - 3.4, 10, 6.8);
    ctx.fillStyle = '#17351a';
    ctx.fillRect(pk.x - 5, pk.y - 1, 10, 2);
  }
  G.effects.drawParticles(ctx);
  G.effects.drawTexts(ctx);

  // Night and weather gloom wash, then the lights punch back through.
  const wash = clamp(G.dark * 0.46 + G.weather.gloom() * 0.2, 0, 0.52);
  if (wash > 0.02) {
    ctx.fillStyle = `rgba(9,11,34,${wash})`;
    ctx.fillRect(rx, ry, VIEW.w, VIEW.h);
  }
  if (G.dusk > 0.03) {
    ctx.fillStyle = `rgba(255,110,40,${G.dusk * 0.1})`;
    ctx.fillRect(rx, ry, VIEW.w, VIEW.h);
  }
  drawLightPools(ctx, G.city, camView, VIEW, G.dark);
  for (const car of G.cars) drawHeadlights(ctx, car, G.dark);
  G.police.drawHeli(ctx, G);
  ctx.restore();

  G.weather.drawRain(ctx, VIEW, G.t);
  G.weather.drawFlash(ctx, VIEW);

  // Hurt vignette.
  const P = G.player;
  if (G.state === 'play' && P.alive && (P.hurtT > 0 || P.health < 28)) {
    const a = Math.max(P.hurtT * 0.5, P.health < 28 ? 0.16 + Math.sin(G.t * 5) * 0.05 : 0);
    const grad = ctx.createRadialGradient(640, 360, 300, 640, 360, 640);
    grad.addColorStop(0, 'rgba(200,20,30,0)');
    grad.addColorStop(1, `rgba(200,20,30,${clamp(a, 0, 0.55)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  if (G.state === 'title') drawTitle(ctx, G);
  else if (G.state === 'busted') drawBusted(ctx, G);
  else if (G.state === 'wasted') drawWasted(ctx, G);
  else {
    drawHUD(ctx, G);
    drawRace(ctx, G);
    drawPhone(ctx, G);
    drawDialogue(ctx, G);
    if (G.state === 'pause') drawPause(ctx, G);
    if (G.showHelp) drawHelp(ctx, G);
  }
}

// ---------- top-level input & loop ----------

window.addEventListener('keydown', () => G.audio.unlock(), { once: false });
window.addEventListener('pointerdown', () => G.audio.unlock());

function frameInput() {
  const input = G.input;
  if (input.hit('KeyM')) {
    G.audio.unlock();
    G.audio.setMuted(!G.audio.muted);
    G.persist();
  }
  if (G.state === 'title') {
    if (input.hit('Enter')) {
      G.state = 'play';
      announce('Playing Neon Palms.');
    } else if (input.hit('KeyN')) {
      resetWorld();
      G.state = 'play';
      announce('New game. Playing Neon Palms.');
    }
    return;
  }
  if (G.state === 'busted' || G.state === 'wasted') {
    if (input.hit('Enter')) G.state = 'play';
    return;
  }
  if (input.hit('KeyH')) G.showHelp = !G.showHelp;
  if (input.hit('KeyP', 'Escape')) {
    if (G.showHelp) G.showHelp = false;
    else if (G.state === 'play') G.state = 'pause';
    else if (G.state === 'pause') G.state = 'play';
  }
}

function runGame() {
  populateWorld();
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, 0.12);
    last = now;
    frameInput();
    if (G.state === 'pause' || G.showHelp) {
      G.input.endFrame();
      draw();
      return;
    }
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP && steps < 3) {
      stepWorld(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 3) acc = 0;
    draw();
  }
  announce('Neon Palms. Press Enter to drive.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  populateWorld();
  stageShot(G, name);
  if (name === 'chase' || name === 'race') G.input.keys.add('KeyW');
  const steps = { title: 90, downtown: 60, chase: 48, race: 50 }[name] ?? 60;
  for (let i = 0; i < steps; i++) {
    stepWorld(1 / 30);
    if (i === 0) G.camSnap = null; // first frame staged; then the follow cam takes over
  }
  let painted = 0;
  function paint() {
    draw();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// A small debug handle for the scripted play test (and curious players).
window.__neon = {
  get screen() { return G.state; },
  get dialogue() { return G.dialogue; },
  get player() { return G.player; },
  get cars() { return G.cars; },
  get peds() { return G.peds; },
  get wanted() { return G.police.wanted; },
  get heat() { return G.police.heat; },
  get objective() { return G.objectiveText; },
  get missionActive() { return !!G.missions.active; },
  get money() { return G.save.money; },
  G,
};

if (shotName) runShot(shotName);
else runGame();
