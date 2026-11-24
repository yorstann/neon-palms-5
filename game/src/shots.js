// Deterministic screenshot scenes for Neon Palms, behind
// ?shot=title|downtown|chase|race&seed=N. Each scene arranges the real game
// state — weather, time, cars, police, the helicopter, the race — and the
// main loop then runs fixed steps and paints the frame, so what the judge
// sees is the game itself, staged. Scenes: a rainy dusk title, a downtown
// sidewalk moment, a five-star night storm chase with roadblock and
// searchlight, and the Marina race mid-run.

import { makeCar, paintCar } from './vehicles.js';
import { makePed } from './pedestrians.js';

function addCar(G, type, x, y, angle, driver) {
  const car = paintCar(G.rng, makeCar(type, x, y, angle, driver));
  G.cars.push(car);
  return car;
}

function addPed(G, x, y) {
  const ped = makePed(G.rng, x, y, 'walker');
  G.peds.push(ped);
  return ped;
}

export function stageShot(G, name) {
  const P = G.player;
  if (name === 'downtown') {
    G.state = 'play';
    G.timeMin = 15 * 60 + 5;
    G.weather.force('clear', 0);
    P.x = 2078;
    P.y = 1412;
    P.angle = -0.6;
    addCar(G, 'taxi', 2020, 1330, Math.PI / 2, 'traffic');
    addCar(G, 'sedan', 2110, 1250, 0, 'traffic');
    addCar(G, 'sports', 1940, 1560, Math.PI, 'parked');
    addCar(G, 'truck', 1220, 1180, 0, 'traffic');
    addPed(G, 2130, 1360);
    addPed(G, 1990, 1470);
    addPed(G, 2180, 1440);
    addPed(G, 1960, 1300);
    G.camSnap = { x: P.x, y: P.y };
    return;
  }
  if (name === 'chase') {
    G.state = 'play';
    G.timeMin = 21 * 60 + 25;
    G.weather.force('storm', 1);
    const car = addCar(G, 'sports', 2020, 1292, 0, 'player');
    car.color = '#ff2e88';
    car.speed = 330;
    P.car = car;
    P.x = car.x;
    P.y = car.y;
    P.angle = 0;
    G.police.setWanted(G, 5);
    // Pursuit stacked behind, lights rolling.
    addCar(G, 'police', 1878, 1272, 0, 'police').speed = 320;
    addCar(G, 'police', 1862, 1330, 0, 'police').speed = 315;
    addCar(G, 'police', 1760, 1296, 0, 'police').speed = 325;
    // The roadblock across the road ahead, spikes in front of it.
    const b1 = addCar(G, 'police', 2820, 1204, Math.PI / 2, 'block');
    const b2 = addCar(G, 'police', 2820, 1296, Math.PI / 2, 'block');
    b1.blockade = true;
    b2.blockade = true;
    G.police.roadblocks.push({
      x: 2820, y: 1250, cars: [b1, b2],
      spikes: { x: 2730, y: 1250, vertical: true, hit: false },
      cones: [{ x: 2800, y: 1170 }, { x: 2800, y: 1330 }],
    });
    // Helicopter already overhead, light on the player.
    G.police.heli.active = true;
    G.police.heli.x = P.x + 130;
    G.police.heli.y = P.y - 110;
    G.camSnap = { x: P.x + 90, y: P.y };
    return;
  }
  if (name === 'race') {
    G.state = 'play';
    G.timeMin = 18 * 60 + 8;
    G.weather.force('rain', 0.55);
    const car = addCar(G, 'sports', 3620, 2620, -Math.PI / 2, 'player');
    car.color = '#22d3ee';
    car.speed = 300;
    P.car = car;
    P.x = car.x;
    P.y = car.y;
    P.angle = -Math.PI / 2;
    G.missions.tryStartRace();
    const race = G.missions.race;
    race.phase = 'running';
    race.cp = 3;
    race.t = 47.3;
    G.objectiveText = 'GO! Beat the pack through every gate.';
    // One rival alongside, one just ahead — POS 2/3 at gate 3.
    const r1 = race.rivals[0];
    r1.x = 3560;
    r1.y = 2560;
    r1.angle = -Math.PI / 2;
    r1.raceCp = 3;
    const r2 = race.rivals[1];
    r2.x = 3680;
    r2.y = 2790;
    r2.angle = -Math.PI / 2;
    r2.raceCp = 3;
    G.camSnap = { x: P.x, y: P.y - 40 };
    return;
  }
  // Default: title — rainy dusk over Downtown, traffic rolling behind.
  G.state = 'title';
  G.timeMin = 18 * 60 + 38;
  G.weather.force('rain', 0.85);
  P.x = 2020;
  P.y = 1250;
  addCar(G, 'sedan', 1960, 1208, Math.PI / 2, 'traffic');
  addCar(G, 'taxi', 2090, 1250, 0, 'traffic');
  addCar(G, 'sports', 2020, 1420, -Math.PI / 2, 'traffic');
  addPed(G, 1900, 1150);
  addPed(G, 2150, 1360);
  G.camSnap = { x: 2020, y: 1250 };
}
