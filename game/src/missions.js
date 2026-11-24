// Story and side work. Mara Voss, a fixer who works the downtown corner,
// hands out a seven-mission campaign — theft, courier runs, a chase, an
// escape, a checkpoint run, a corner war and the Neon Exodus finale — while
// the taxi meter, the twenty hidden packages and the Marina street race run
// as repeatable side income. One generic step engine drives every mission:
// talk, go to, steal, deliver, chase, escape, checkpoints, shootout.

import { dist, randRange, clamp } from './random.js';
import { collideBuildings } from './city.js';
import { makeCar, paintCar, steerToward } from './vehicles.js';
import { makePed, sidewalkSpot } from './pedestrians.js';

const MARA_LINES = {
  intro1: [
    ['MARA', 'You must be the new driver. I am Mara Voss — I move things the city pretends not to see.'],
    ['YOU', 'And you need a wheelman.'],
    ['MARA', 'I need someone invisible. Start simple: a coral-pink sports car is parked up on Palm Beach, and its owner owes me. Bring it to the Marina garage.'],
  ],
  intro2: [
    ['MARA', 'Clean work. Next: a package waits at the Harbor dock, north-east pier. Pick it up and bring it back here.'],
    ['YOU', 'And if the PBPD notices?'],
    ['MARA', 'Then you drive like the bay is on fire. Go.'],
  ],
  intro3: [
    ['MARA', 'A courier from the Serrano crew is running my ledger across Downtown in a grey sedan. Catch him. Stop the car — I do not care how.'],
  ],
  intro4: [
    ['MARA', 'The dock job lit you up and the heat has not cooled. Take this heat off yourself — lose the PBPD completely, then come back.'],
    ['YOU', 'Respray or rooftops?'],
    ['MARA', 'Shine & Go on the south Downtown road sells clean paint. Or just vanish. Your call.'],
  ],
  intro5: [
    ['MARA', 'A client pays for speed, not excuses. Six checkpoints, one clock, any car you like. Break the route and the route breaks you.'],
  ],
  intro6: [
    ['MARA', 'The Serranos hold a corner in Industrial and my people cannot work. Take this SMG. Clear the corner — all of them.'],
    ['YOU', 'You are arming me now?'],
    ['MARA', 'I am investing in you. Do not depreciate.'],
  ],
  intro7: [
    ['MARA', 'Last job, driver. Tonight we move everything: the whole ledger, the dock cash, all of it. Meet my crew at the Harbor dock.'],
    ['YOU', 'And afterwards?'],
    ['MARA', 'Afterwards the Serranos shoot, the PBPD swarms, and you drive us out through all of it to the Marina. Neon Exodus, baby.'],
  ],
  outro7: [
    ['MARA', 'We made it. Every crew on this coast will hear how you drove tonight.'],
    ['YOU', 'And my cut?'],
    ['MARA', 'Paid in full — plus the city. Palmera Bay is yours now, driver. Do not wreck it.'],
  ],
};

export class Missions {
  constructor(G) {
    this.G = G;
    this.active = null; // { def, stepIndex, step, data }
    this.taxi = { phase: 'idle', timer: 6, ped: null, dest: null, fareStart: 0 };
    this.race = { phase: 'idle', cp: 0, points: [], rivals: [], t: 0, countdown: 0, pos: 1, result: '' };
    this.phoneT = 0;
  }

  // ---------- helpers ----------
  get save() { return this.G.save; }

  marker(x, y, label) {
    this.G.objective = { x, y, label };
  }

  clearMarker() {
    this.G.objective = null;
  }

  startDialogue(lines, onDone) {
    this.G.dialogue = { lines, index: 0, onDone };
    this.G.audio.phone();
  }

  cleanupEntities() {
    const G = this.G;
    G.cars = G.cars.filter((c) => !c.mission);
    G.peds = G.peds.filter((p) => !p.missionGang);
  }

  failMission(reason) {
    const G = this.G;
    if (!this.active) return;
    G.effects.floatText(G.player.x, G.player.y - 44, reason, '#ff5a4d');
    G.audio.blip(180, 0.4, 'sawtooth', 0.2, 90);
    this.cleanupEntities();
    this.active = null;
    this.clearMarker();
    G.objectiveText = 'Mission failed — go back to Mara.';
  }

  completeMission() {
    const G = this.G;
    const def = this.active.def;
    G.addMoney(def.pay, `MISSION: ${def.name}`);
    this.save.missionIndex = def.index + 1;
    G.persist();
    this.cleanupEntities();
    this.active = null;
    this.clearMarker();
    if (def.index === 6) {
      this.startDialogue(MARA_LINES.outro7, null);
      G.objectiveText = 'Campaign complete. The city is yours — race, taxi and packages remain.';
    } else {
      G.objectiveText = 'Mission complete. Mara has more work when you are ready.';
    }
  }

  onPlayerDown() {
    if (this.active) this.failMission('MISSION FAILED');
    if (this.race.phase === 'running' || this.race.phase === 'countdown') this.endRace('RACE OFF');
    this.taxi.phase = 'idle';
    this.taxi.ped = null;
  }

  // ---------- mission definitions ----------
  defs() {
    const L = this.G.city.landmarks;
    return [
      { index: 0, name: 'FIRST WHEELS', pay: 400, intro: 'intro1', steps: [
        { type: 'steal', x: 2900, y: 2330, carType: 'sports', label: 'Steal the sports car on Palm Beach' },
        { type: 'deliverCar', x: L.marinaSafe.x, y: L.marinaSafe.y, label: 'Deliver it to the Marina garage' },
      ] },
      { index: 1, name: 'DOCK RUNNER', pay: 550, intro: 'intro2', steps: [
        { type: 'pickup', x: L.dock.x, y: L.dock.y, label: 'Pick up the package at the Harbor dock', heat: 2 },
        { type: 'goto', x: L.maraCorner.x, y: L.maraCorner.y, label: 'Bring the package back to Mara' },
      ] },
      { index: 2, name: 'TAILSPIN', pay: 700, intro: 'intro3', steps: [
        { type: 'chase', x: 2500, y: 500, label: 'Stop the grey sedan — ram it out' },
      ] },
      { index: 3, name: 'HEAT ESCAPE', pay: 800, intro: 'intro4', steps: [
        { type: 'escape', stars: 3, label: 'Lose the PBPD completely' },
      ] },
      { index: 4, name: 'CHECKPOINT RUN', pay: 900, intro: 'intro5', steps: [
        { type: 'checkpoints', points: [[2820, 1250], [3620, 1250], [3620, 2050], [2820, 2050], [2020, 2050], [2020, 1250]], time: 100, label: 'Hit every checkpoint before the clock dies' },
      ] },
      { index: 5, name: 'CORNER WAR', pay: 1100, intro: 'intro6', gift: 'smg', steps: [
        { type: 'shootout', x: 700, y: 700, count: 5, label: 'Clear the Serrano corner in Industrial' },
      ] },
      { index: 6, name: 'NEON EXODUS', pay: 2500, intro: 'intro7', steps: [
        { type: 'goto', x: L.dock.x, y: L.dock.y, label: 'Meet the crew at the Harbor dock' },
        { type: 'shootout', x: L.dock.x, y: L.dock.y, count: 6, label: 'Hold the dock — clear the Serranos' },
        { type: 'finaleEscape', x: L.marinaSafe.x, y: L.marinaSafe.y, stars: 4, label: 'NEON EXODUS: reach the Marina, whatever it takes' },
      ] },
    ];
  }

  tryStartMission() {
    const G = this.G;
    const idx = this.save.missionIndex;
    if (idx >= 7) return false;
    const def = this.defs()[idx];
    if (def.gift === 'smg' && !G.player.hasSmg) {
      G.player.hasSmg = true;
      G.player.reserve += 140;
      G.effects.floatText(G.player.x, G.player.y - 40, 'SMG ACQUIRED (key 3)', '#22d3ee');
    }
    this.startDialogue(MARA_LINES[def.intro], () => {
      this.active = { def, stepIndex: 0, data: {} };
      this.setupStep();
    });
    return true;
  }

  setupStep() {
    const G = this.G;
    const m = this.active;
    const step = m.def.steps[m.stepIndex];
    m.data = {};
    G.objectiveText = step.label;
    if (step.type === 'steal') {
      const car = paintCar(G.rng, makeCar(step.carType, step.x, step.y, Math.PI, 'parked'));
      car.color = '#ff5e8a';
      car.mission = true;
      G.cars.push(car);
      m.data.car = car;
    } else if (step.type === 'chase') {
      const car = paintCar(G.rng, makeCar('sedan', step.x, step.y, 0, 'mission'));
      car.color = '#5a5f68';
      car.mission = true;
      car.fleeT = 0;
      G.cars.push(car);
      m.data.car = car;
    } else if (step.type === 'checkpoints') {
      m.data.cp = 0;
      m.data.timeLeft = step.time;
    } else if (step.type === 'shootout') {
      m.data.foes = [];
      for (let i = 0; i < step.count; i++) {
        const ped = makePed(G.rng, step.x + randRange(G.rng, -90, 90), step.y + randRange(G.rng, -70, 70), 'gang');
        const [nx, ny] = collideBuildings(G.city, ped.x, ped.y, 9);
        ped.x = nx;
        ped.y = ny;
        ped.missionGang = true;
        ped.hostile = true;
        ped.corner = { x: step.x, y: step.y };
        G.peds.push(ped);
        m.data.foes.push(ped);
      }
    } else if (step.type === 'escape') {
      G.police.setWanted(G, step.stars);
    } else if (step.type === 'finaleEscape') {
      G.police.setWanted(G, step.stars);
    }
  }

  advanceStep() {
    const m = this.active;
    m.stepIndex += 1;
    if (m.stepIndex >= m.def.steps.length) this.completeMission();
    else this.setupStep();
  }

  updateMission(G, dt) {
    const m = this.active;
    if (!m) return;
    const step = m.def.steps[m.stepIndex];
    const P = G.player;
    const d = m.data;

    switch (step.type) {
      case 'steal': {
        this.marker(step.x, step.y, 'TARGET CAR');
        if (d.car.health <= 0) return this.failMission('THE CAR IS WRECKED');
        if (P.car === d.car) return this.advanceStep();
        break;
      }
      case 'deliverCar': {
        this.marker(step.x, step.y, 'DELIVER');
        if (P.car && dist(P.x, P.y, step.x, step.y) < 62 && Math.abs(P.car.speed) < 30) return this.advanceStep();
        break;
      }
      case 'pickup': {
        this.marker(step.x, step.y, 'PACKAGE');
        if (!P.car && dist(P.x, P.y, step.x, step.y) < 30) {
          G.audio.pickup();
          G.effects.floatText(P.x, P.y - 30, 'PACKAGE SECURED', '#7dff9a');
          if (step.heat) G.police.setWanted(G, step.heat);
          return this.advanceStep();
        }
        break;
      }
      case 'goto': {
        this.marker(step.x, step.y, 'GO');
        if (dist(P.x, P.y, step.x, step.y) < 46) return this.advanceStep();
        break;
      }
      case 'chase': {
        const car = d.car;
        this.marker(car.x, car.y, 'TARGET');
        if (car.health <= 28) {
          car.driver = 'wreck';
          return this.advanceStep();
        }
        // The courier flees the player, sticking to speed when close.
        car.fleeT -= dt;
        const pd = dist(car.x, car.y, P.x, P.y);
        if (pd < 520) {
          const awayX = car.x + (car.x - P.x);
          const awayY = car.y + (car.y - P.y);
          steerToward(G, car, dt, awayX, awayY, 0.94);
        }
        break;
      }
      case 'escape': {
        this.clearMarker();
        G.objectiveText = `${step.label} — stars: ${G.police.wanted}`;
        if (G.police.wanted === 0) return this.advanceStep();
        break;
      }
      case 'checkpoints': {
        const pts = step.points;
        const [tx, ty] = pts[d.cp];
        this.marker(tx, ty, `CHECKPOINT ${d.cp + 1}/${pts.length}`);
        d.timeLeft -= dt;
        G.objectiveText = `${step.label} — ${Math.max(0, d.timeLeft).toFixed(0)}s`;
        if (d.timeLeft <= 0) return this.failMission('OUT OF TIME');
        if (P.car && dist(P.x, P.y, tx, ty) < 58) {
          d.cp += 1;
          G.audio.checkpoint();
          G.effects.burst(tx, ty, { count: 14, speed: 130, life: 0.5, size: 3, color: '#7dff9a' });
          if (d.cp >= pts.length) return this.advanceStep();
        }
        break;
      }
      case 'shootout': {
        this.marker(step.x, step.y, 'CLEAR THE CORNER');
        const alive = d.foes.filter((f) => !f.dead && f.state !== 'down');
        G.objectiveText = `${step.label} — ${alive.length} left`;
        if (alive.length === 0) return this.advanceStep();
        break;
      }
      case 'finaleEscape': {
        this.marker(step.x, step.y, 'MARINA — GO!');
        if (dist(P.x, P.y, step.x, step.y) < 70) {
          G.police.clearWanted();
          return this.advanceStep();
        }
        break;
      }
    }
  }

  // ---------- street race ----------
  racePoints() {
    return [[3620, 2850], [4420, 2850], [4420, 2050], [3620, 2050], [3620, 1250], [2820, 1250], [2820, 2050], [2820, 2850], [3620, 2850]];
  }

  tryStartRace() {
    const G = this.G;
    const P = G.player;
    if (!P.car || this.race.phase !== 'idle' || this.active) return false;
    const pts = this.racePoints();
    this.race = { phase: 'countdown', cp: 1, points: pts, rivals: [], t: 0, countdown: 3.2, pos: 1, result: '' };
    const starts = [[3620, 2920, -Math.PI / 2], [3550, 2920, -Math.PI / 2]];
    for (let i = 0; i < 2; i++) {
      const car = paintCar(G.rng, makeCar(i === 0 ? 'sports' : 'sedan', starts[i][0], starts[i][1], starts[i][2], 'race'));
      car.raceCp = 1;
      car.skill = i === 0 ? 0.97 : 0.9;
      G.cars.push(car);
      this.race.rivals.push(car);
    }
    G.objectiveText = 'MARINA RACE — wait for the lights…';
    return true;
  }

  endRace(result) {
    const G = this.G;
    for (const car of this.race.rivals) {
      if (car.driver === 'race') car.driver = 'traffic';
    }
    this.race = { phase: 'idle', cp: 0, points: [], rivals: [], t: 0, countdown: 0, pos: 1, result };
    this.clearMarker();
  }

  updateRace(G, dt) {
    const race = this.race;
    const P = G.player;
    if (race.phase === 'countdown') {
      race.countdown -= dt;
      G.raceLock = race.countdown > 0.4;
      if (race.countdown <= 0) {
        race.phase = 'running';
        G.raceLock = false;
        G.audio.checkpoint();
        G.objectiveText = 'GO! Beat the pack through every gate.';
      }
      return;
    }
    if (race.phase !== 'running') return;
    race.t += dt;
    const pts = race.points;
    // Player progress.
    const [ptx, pty] = pts[race.cp];
    this.marker(ptx, pty, `GATE ${race.cp}/${pts.length - 1}`);
    if (dist(P.x, P.y, ptx, pty) < 66) {
      race.cp += 1;
      G.audio.checkpoint();
      if (race.cp >= pts.length) {
        const ms = Math.floor(race.t * 1000);
        const prize = race.pos === 1 ? 900 : race.pos === 2 ? 350 : 100;
        if (race.pos === 1) {
          this.save.racesWon += 1;
          if (!this.save.raceBestMs || ms < this.save.raceBestMs) this.save.raceBestMs = ms;
        }
        G.addMoney(prize, `RACE ${race.pos}${race.pos === 1 ? 'st' : race.pos === 2 ? 'nd' : 'rd'} PLACE`);
        G.persist();
        this.endRace(`FINISHED ${race.pos} — $${prize}`);
        G.objectiveText = 'Race done. The flag at the Marina runs it again any time.';
        return;
      }
    }
    // Rivals.
    let ahead = 0;
    for (const car of race.rivals) {
      if (car.health <= 0) continue;
      const [tx, ty] = pts[Math.min(car.raceCp, pts.length - 1)];
      steerToward(G, car, dt, tx, ty, car.skill);
      if (dist(car.x, car.y, tx, ty) < 72 && car.raceCp < pts.length) car.raceCp += 1;
      const myScore = race.cp * 10000 - dist(P.x, P.y, ptx, pty);
      const theirScore = car.raceCp * 10000 - dist(car.x, car.y, tx, ty);
      if (theirScore > myScore) ahead += 1;
    }
    race.pos = ahead + 1;
  }

  // ---------- taxi ----------
  updateTaxi(G, dt) {
    const taxi = this.taxi;
    const P = G.player;
    if (this.active || this.race.phase !== 'idle') return;
    if (!P.car || P.car.type !== 'taxi') {
      if (taxi.phase !== 'idle') {
        taxi.phase = 'idle';
        taxi.ped = null;
        if (!this.active) this.clearMarker();
      }
      return;
    }
    if (taxi.phase === 'idle') {
      taxi.timer -= dt;
      if (taxi.timer <= 0) {
        const spot = sidewalkSpot(G.rng, P.x, P.y, 260, 520);
        taxi.ped = makePed(G.rng, spot.x, spot.y, 'passenger');
        taxi.ped.state = 'stand';
        G.peds.push(taxi.ped);
        taxi.phase = 'pickup';
        G.audio.phone();
        G.objectiveText = 'TAXI: pick up the fare.';
      }
      return;
    }
    if (taxi.phase === 'pickup') {
      this.marker(taxi.ped.x, taxi.ped.y, 'FARE');
      if (dist(P.x, P.y, taxi.ped.x, taxi.ped.y) < 44 && Math.abs(P.car.speed) < 26) {
        const idx = G.peds.indexOf(taxi.ped);
        if (idx >= 0) G.peds.splice(idx, 1);
        taxi.ped = null;
        let dest = null;
        for (let tries = 0; tries < 20 && !dest; tries++) {
          const cand = sidewalkSpot(G.rng, P.x, P.y, 650, 1500);
          if (dist(P.x, P.y, cand.x, cand.y) > 600) dest = cand;
        }
        taxi.dest = dest ?? { x: 2020, y: 1250 };
        taxi.fareStart = dist(P.x, P.y, taxi.dest.x, taxi.dest.y);
        taxi.phase = 'dropoff';
        G.objectiveText = 'TAXI: drop them off.';
      }
      return;
    }
    if (taxi.phase === 'dropoff') {
      this.marker(taxi.dest.x, taxi.dest.y, 'DROP-OFF');
      if (dist(P.x, P.y, taxi.dest.x, taxi.dest.y) < 48 && Math.abs(P.car.speed) < 26) {
        const pay = Math.round(36 + taxi.fareStart * 0.085);
        G.addMoney(pay, 'TAXI FARE');
        const ped = makePed(G.rng, taxi.dest.x + 14, taxi.dest.y + 8, 'walker');
        G.peds.push(ped);
        taxi.phase = 'idle';
        taxi.timer = randRange(G.rng, 5, 10);
        taxi.dest = null;
        this.clearMarker();
        G.objectiveText = 'Fare paid. Keep rolling for the next one.';
      }
    }
  }

  // ---------- packages ----------
  updatePackages(G) {
    const P = G.player;
    for (const pkg of G.city.packages) {
      if (pkg.taken) continue;
      if (dist(P.x, P.y, pkg.x, pkg.y) < 27) {
        pkg.taken = true;
        if (!this.save.packagesFound.includes(pkg.id)) this.save.packagesFound.push(pkg.id);
        G.addMoney(250, 'HIDDEN PACKAGE');
        G.audio.pickup();
        G.persist();
      }
    }
  }

  update(G, dt) {
    if (G.dialogue) return; // story beats pause the world logic
    this.updateMission(G, dt);
    this.updateRace(G, dt);
    this.updateTaxi(G, dt);
    this.updatePackages(G);
    // Idle objective: point at Mara until the campaign is done.
    if (!this.active && this.race.phase === 'idle' && this.taxi.phase === 'idle') {
      const L = G.city.landmarks;
      if (this.save.missionIndex < 7) {
        this.marker(L.maraCorner.x, L.maraCorner.y, 'MARA VOSS');
        G.objectiveText = 'Meet Mara Voss on the Downtown corner (E to talk).';
      }
    }
  }

  /** World-space markers: the objective pillar, packages, race gates. */
  drawWorld(ctx, G, t) {
    const obj = G.objective;
    if (obj) {
      const pulse = 0.75 + Math.sin(t * 5) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(0, obj.y - 190, 0, obj.y);
      grad.addColorStop(0, 'rgba(255,209,77,0)');
      grad.addColorStop(1, `rgba(255,209,77,${0.5 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(obj.x - 13, obj.y - 190, 26, 190);
      ctx.restore();
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.ellipse(obj.x, obj.y, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14141c';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obj.label, obj.x, obj.y + 3.4);
    }
    // Hidden packages: a glowing briefcase.
    for (const pkg of G.city.packages) {
      if (pkg.taken) continue;
      const bob = Math.sin(t * 3 + pkg.x) * 2.4;
      ctx.save();
      ctx.shadowColor = '#7dff6a';
      ctx.shadowBlur = 13;
      ctx.fillStyle = '#7dff6a';
      ctx.fillRect(pkg.x - 7, pkg.y - 5 + bob, 14, 10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#17351a';
      ctx.fillRect(pkg.x - 7, pkg.y - 1 + bob, 14, 2.2);
      ctx.restore();
    }
    // Race gate ring.
    if (this.race.phase === 'running') {
      const pts = this.race.points;
      const [gx, gy] = pts[Math.min(this.race.cp, pts.length - 1)];
      ctx.strokeStyle = 'rgba(125,255,154,0.85)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.arc(gx, gy, 34 + Math.sin(t * 6) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Race flag at the Marina.
    const flag = G.city.landmarks.raceFlag;
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(flag.x - 1.6, flag.y - 34, 3.2, 34);
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath();
    ctx.moveTo(flag.x + 1.6, flag.y - 34);
    ctx.lineTo(flag.x + 21, flag.y - 27);
    ctx.lineTo(flag.x + 1.6, flag.y - 20);
    ctx.closePath();
    ctx.fill();
  }
}
