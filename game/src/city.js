// Palmera Bay: the city itself. A fixed-seed generator lays a road grid over
// six named districts, fills the blocks with collidable buildings (each
// district has its own palette and signage), plants palms and streetlights,
// and marks the places the rest of the game cares about: the Shine & Go
// respray, the marina race flag, the harbor dock, Mara's corner, twenty
// hidden packages and the gang corners. Rendering paints ground, roads and
// rooftops; a wet pass mirrors neon and streetlight glow onto slick asphalt.

import { makeRng, randRange, randInt, pick, chance, clamp } from './random.js';

export const WORLD_W = 4800;
export const WORLD_H = 3600;
export const ROAD_W = 170;
export const V_ROADS = [420, 1220, 2020, 2820, 3620, 4420];
export const H_ROADS = [450, 1250, 2050, 2850];
export const WATER_X = 4610;

export const DISTRICTS = [
  { name: 'INDUSTRIAL', x: 0, y: 0, w: 1600, h: 1800, ground: '#5d6066', roofs: ['#7a6a58', '#6b6259', '#83776a', '#5f5a52'], neon: 0.04 },
  { name: 'DOWNTOWN', x: 1600, y: 0, w: 1600, h: 1800, ground: '#6a6d75', roofs: ['#4d5a74', '#5d4d6e', '#3f5a66', '#6e5548', '#54606e'], neon: 0.5 },
  { name: 'HARBOR', x: 3200, y: 0, w: 1600, h: 1800, ground: '#61666b', roofs: ['#71685c', '#5d6b74', '#6b5d4d', '#4f6157'], neon: 0.1 },
  { name: 'SUBURBS', x: 0, y: 1800, w: 1600, h: 1800, ground: '#5f7a52', roofs: ['#9c6b52', '#a87f5f', '#8a5f4a', '#b08a68'], neon: 0.0 },
  { name: 'PALM BEACH', x: 1600, y: 1800, w: 1600, h: 1800, ground: '#7d7468', roofs: ['#c2b49a', '#b5a58c', '#cbbca4', '#a89a80'], neon: 0.16 },
  { name: 'MARINA', x: 3200, y: 1800, w: 1600, h: 1800, ground: '#6d7276', roofs: ['#5d7a8a', '#6e8a99', '#4d6a7a', '#7d99a8'], neon: 0.22 },
];

const NEON_COLORS = ['#ff4fd8', '#22d3ee', '#ffb020', '#7dff6a', '#ff5a3c', '#b78cff'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[1];
}

export function onRoad(x, y) {
  for (const rx of V_ROADS) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of H_ROADS) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function onWater(x) {
  return x > WATER_X;
}

/** Intersections of the road grid, the nodes traffic routes between. */
export function intersections() {
  const nodes = [];
  for (const x of V_ROADS) for (const y of H_ROADS) nodes.push({ x, y });
  return nodes;
}

/** Is the point inside any building footprint (expanded by r)? */
export function pointInBuilding(city, x, y, r = 0) {
  for (const b of city.buildings) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

/** Push a circle out of every building it overlaps; returns corrected [x, y]. */
export function collideBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the box: push out along the smallest exit.
        const left = x - b.x + r;
        const right = b.x + b.w - x + r;
        const top = y - b.y + r;
        const bottom = b.y + b.h - y + r;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return [x, y];
}

export function buildCity(seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const buildings = [];
  const palms = [];
  const lights = [];
  const signs = [];

  // Fill each block (the cell between roads) with buildings, leaving a
  // sidewalk margin. Suburbs get small houses on grass, elsewhere slabs.
  const xEdges = [0, ...V_ROADS.flatMap((x) => [x - ROAD_W / 2, x + ROAD_W / 2]), WORLD_W];
  const yEdges = [0, ...H_ROADS.flatMap((y) => [y - ROAD_W / 2, y + ROAD_W / 2]), WORLD_H];
  for (let xi = 0; xi < xEdges.length - 1; xi += 2) {
    for (let yi = 0; yi < yEdges.length - 1; yi += 2) {
      const bx = xEdges[xi];
      const by = yEdges[yi];
      const bw = xEdges[xi + 1] - bx;
      const bh = yEdges[yi + 1] - by;
      if (bw < 200 || bh < 200) continue;
      const district = districtAt(bx + bw / 2, by + bh / 2);
      const margin = 34;
      const innerX = bx + margin;
      const innerY = by + margin;
      const innerW = bw - margin * 2;
      const innerH = bh - margin * 2;
      const cols = innerW > 520 ? 2 : 1;
      const rows = innerH > 520 ? 2 : 1;
      const cw = innerW / cols;
      const ch = innerH / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (district.name === 'SUBURBS' && chance(rng, 0.14)) continue;
          const pad = randRange(rng, 10, 26);
          const w = cw - pad * 2;
          const h = ch - pad * 2;
          const x = innerX + c * cw + pad;
          const y = innerY + r * ch + pad;
          if (x + w > WATER_X - 60) continue;
          const b = {
            x, y, w, h,
            color: pick(rng, district.roofs),
            trim: pick(rng, ['#2e3138', '#3c4048', '#26262c', '#474c55']),
            floors: randInt(rng, 2, district.name === 'DOWNTOWN' ? 14 : 6),
            district: district.name,
          };
          buildings.push(b);
          if (chance(rng, district.neon)) {
            signs.push({
              x: x + w / 2, y: y + 6, w: Math.min(w * 0.7, 92),
              color: pick(rng, NEON_COLORS),
              text: pick(rng, ['PALM', 'HOTEL', 'BAR', '24H', 'DINER', 'CLUB NOVA', 'VOSS', 'TACO', 'GYM', 'LIQUOR']),
              building: b,
            });
          }
        }
      }
    }
  }

  // Palms along sidewalks and the beach; streetlights at intersections.
  for (let i = 0; i < 260; i++) {
    const alongV = chance(rng, 0.5);
    const rx = pick(rng, V_ROADS);
    const ry = pick(rng, H_ROADS);
    const x = alongV ? rx + (chance(rng, 0.5) ? -1 : 1) * (ROAD_W / 2 + 16) : randRange(rng, 60, WORLD_W - 160);
    const y = alongV ? randRange(rng, 60, WORLD_H - 60) : ry + (chance(rng, 0.5) ? -1 : 1) * (ROAD_W / 2 + 16);
    if (pointInBuilding({ buildings }, x, y, 14) || onWater(x)) continue;
    palms.push({ x, y, lean: randRange(rng, -0.16, 0.16), scale: randRange(rng, 0.8, 1.25) });
  }
  for (const x of V_ROADS) {
    for (const y of H_ROADS) {
      lights.push({ x: x - ROAD_W / 2 + 12, y: y - ROAD_W / 2 + 12 });
      lights.push({ x: x + ROAD_W / 2 - 12, y: y + ROAD_W / 2 - 12 });
    }
  }
  for (const rx of V_ROADS) for (let y = 240; y < WORLD_H; y += 480) lights.push({ x: rx - ROAD_W / 2 + 12, y });
  for (const ry of H_ROADS) for (let x = 240; x < WATER_X; x += 480) lights.push({ x, y: ry - ROAD_W / 2 + 12 });

  // Landmarks and gameplay anchors.
  const landmarks = {
    respray: { x: 2020, y: 2050, name: 'SHINE & GO' },
    raceFlag: { x: 3660, y: 2980, name: 'MARINA RACE' },
    maraCorner: { x: 2085, y: 1335, name: 'MARA' },
    dock: { x: 3980, y: 452, name: 'HARBOR DOCK' },
    policeStation: { x: 2130, y: 560, name: 'PBPD' },
    hospital: { x: 2130, y: 2380, name: 'ST. PALM' },
    marinaSafe: { x: 3652, y: 2892, name: 'MARINA' },
  };

  // Twenty hidden packages tucked against buildings and in alleys.
  const packages = [];
  let guard = 0;
  while (packages.length < 20 && guard++ < 900) {
    const x = randRange(rng, 120, WATER_X - 120);
    const y = randRange(rng, 120, WORLD_H - 120);
    if (onRoad(x, y) || pointInBuilding({ buildings }, x, y, 6)) continue;
    if (packages.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 420)) continue;
    packages.push({ x, y, taken: false });
  }

  // Gang corners: free-roam shootout spots in Industrial and the Harbor.
  const gangCorners = [
    { x: 700, y: 700, district: 'INDUSTRIAL' },
    { x: 900, y: 1560, district: 'INDUSTRIAL' },
    { x: 3980, y: 700, district: 'HARBOR' },
    { x: 3350, y: 1500, district: 'HARBOR' },
  ];

  // Puddles live on the asphalt and only show when the streets are wet.
  const puddles = [];
  for (let i = 0; i < 130; i++) {
    const onV = chance(rng, 0.55);
    const x = onV ? pick(rng, V_ROADS) + randRange(rng, -55, 55) : randRange(rng, 80, WATER_X - 60);
    const y = onV ? randRange(rng, 80, WORLD_H - 80) : pick(rng, H_ROADS) + randRange(rng, -55, 55);
    puddles.push({ x, y, rx: randRange(rng, 26, 74), ry: randRange(rng, 10, 26), phase: randRange(rng, 0, 6.28) });
  }

  return { buildings, palms, lights, signs, landmarks, packages, gangCorners, puddles, rng };
}

/** Draw ground, water, roads and markings for the camera view. */
export function drawGround(ctx, city, cam, view, dark) {
  const x0 = cam.x - 40;
  const y0 = cam.y - 40;
  const x1 = cam.x + view.w + 40;
  const y1 = cam.y + view.h + 40;

  // District ground.
  for (const d of DISTRICTS) {
    if (d.x > x1 || d.y > y1 || d.x + d.w < x0 || d.y + d.h < y0) continue;
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  // Beach sand and the bay.
  ctx.fillStyle = '#c9b489';
  ctx.fillRect(WATER_X - 105, 0, 105, WORLD_H);
  const grad = ctx.createLinearGradient(WATER_X, 0, WORLD_W, 0);
  grad.addColorStop(0, '#2a7d9e');
  grad.addColorStop(1, '#155e7d');
  ctx.fillStyle = grad;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);

  // Sidewalk aprons around each block read as lighter slabs under buildings.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (const b of city.buildings) {
    if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
    ctx.fillRect(b.x - 16, b.y - 16, b.w + 32, b.h + 32);
  }

  // Asphalt.
  ctx.fillStyle = '#33363c';
  for (const x of V_ROADS) ctx.fillRect(x - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const y of H_ROADS) ctx.fillRect(0, y - ROAD_W / 2, Math.min(WORLD_W, WATER_X + 40), ROAD_W);

  // Lane dashes.
  ctx.fillStyle = 'rgba(240,220,130,0.55)';
  for (const x of V_ROADS) {
    for (let y = 14; y < WORLD_H; y += 56) {
      if (H_ROADS.some((hy) => Math.abs(y - hy) < ROAD_W / 2 + 8)) continue;
      ctx.fillRect(x - 2, y, 4, 30);
    }
  }
  for (const y of H_ROADS) {
    for (let x = 14; x < WATER_X; x += 56) {
      if (V_ROADS.some((vx) => Math.abs(x - vx) < ROAD_W / 2 + 8)) continue;
      ctx.fillRect(x, y - 2, 30, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(235,235,235,0.35)';
  for (const x of V_ROADS) {
    for (const y of H_ROADS) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(x + i * 22 - 7, y - ROAD_W / 2 + 4, 14, 9);
        ctx.fillRect(x + i * 22 - 7, y + ROAD_W / 2 - 13, 14, 9);
        ctx.fillRect(x - ROAD_W / 2 + 4, y + i * 22 - 7, 9, 14);
        ctx.fillRect(x + ROAD_W / 2 - 13, y + i * 22 - 7, 9, 14);
      }
    }
  }
  if (dark > 0.25) drawDistrictLabels(ctx, cam, view);
}

function drawDistrictLabels(ctx, cam, view) {
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const d of DISTRICTS) {
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    if (cx < cam.x - 500 || cy < cam.y - 300 || cx > cam.x + view.w + 500 || cy > cam.y + view.h + 300) continue;
    ctx.fillText(d.name, cx, cy);
  }
  ctx.restore();
}

/** Wet-street reflections: mirrored glow streaks under signs and lights. */
export function drawWetReflections(ctx, city, cam, view, wet, dark, t) {
  if (wet <= 0.03) return;
  const x0 = cam.x - 60;
  const y0 = cam.y - 60;
  const x1 = cam.x + view.w + 60;
  const y1 = cam.y + view.h + 60;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of city.signs) {
    if (s.x < x0 || s.y < y0 || s.x > x1 || s.y > y1 + 160) continue;
    const len = 60 + wet * 90;
    const grad = ctx.createLinearGradient(0, s.y, 0, s.y + len);
    grad.addColorStop(0, s.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.16 * wet * (0.4 + dark * 0.6);
    ctx.fillStyle = grad;
    ctx.fillRect(s.x - s.w / 2, s.y + 8, s.w, len);
  }
  for (const l of city.lights) {
    if (l.x < x0 || l.y < y0 || l.x > x1 || l.y > y1) continue;
    ctx.globalAlpha = 0.1 * wet * (0.3 + dark * 0.7);
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(l.x - 3, l.y + 4, 6, 34 + wet * 30);
  }
  ctx.restore();

  // Puddles: pale ellipses with a slow shimmer.
  for (const p of city.puddles) {
    if (p.x < x0 || p.y < y0 || p.x > x1 || p.y > y1) continue;
    const shimmer = 0.05 + 0.03 * Math.sin(t * 1.7 + p.phase);
    ctx.fillStyle = `rgba(165,205,235,${(shimmer + 0.05) * wet})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Buildings, palms and streetlight poles (lights glow in the night pass). */
export function drawBuildings(ctx, city, cam, view) {
  const x0 = cam.x - 80;
  const y0 = cam.y - 80;
  const x1 = cam.x + view.w + 80;
  const y1 = cam.y + view.h + 80;

  for (const p of city.palms) {
    if (p.x < x0 || p.y < y0 || p.x > x1 || p.y > y1) continue;
    ctx.strokeStyle = '#6d5136';
    ctx.lineWidth = 4 * p.scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + p.lean * 30, p.y - 16 * p.scale, p.x + p.lean * 52, p.y - 30 * p.scale);
    ctx.stroke();
    const tx = p.x + p.lean * 52;
    const ty = p.y - 30 * p.scale;
    ctx.strokeStyle = '#3f7d3a';
    ctx.lineWidth = 2.6 * p.scale;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.lean * 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * 13, ty + Math.sin(a) * 8 - 3, tx + Math.cos(a) * 21, ty + Math.sin(a) * 13 + 4);
      ctx.stroke();
    }
  }

  for (const b of city.buildings) {
    if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
    // Drop shadow, then the roof slab and its trim.
    ctx.fillStyle = 'rgba(10,10,16,0.35)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.trim;
    ctx.fillRect(b.x, b.y, b.w, 7);
    ctx.fillRect(b.x, b.y + b.h - 7, b.w, 7);
    ctx.fillRect(b.x, b.y, 7, b.h);
    ctx.fillRect(b.x + b.w - 7, b.y, 7, b.h);
    // Rooftop details: AC units and a water tank on the bigger slabs.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const seed = (b.x * 7 + b.y * 13) % 5;
    ctx.fillRect(b.x + 14 + seed * 9, b.y + 16, 22, 15);
    if (b.w > 190) ctx.fillRect(b.x + b.w - 52, b.y + b.h - 40, 26, 20);
    if (b.floors > 9) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lit windows speckle.
    ctx.fillStyle = 'rgba(255,236,170,0.16)';
    const step = 26;
    for (let wx = b.x + 14; wx < b.x + b.w - 12; wx += step) {
      for (let wy = b.y + 14; wy < b.y + b.h - 12; wy += step) {
        if (((wx * 31 + wy * 17) % 7) < 2) ctx.fillRect(wx, wy, 7, 5);
      }
    }
  }

  // Neon signs on the street edge of their buildings.
  for (const s of city.signs) {
    if (s.x < x0 || s.y < y0 || s.x > x1 || s.y > y1) continue;
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = s.color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.text, s.x, s.y + 4);
    ctx.restore();
  }

  // Streetlight poles.
  ctx.fillStyle = '#22242a';
  for (const l of city.lights) {
    if (l.x < x0 || l.y < y0 || l.x > x1 || l.y > y1) continue;
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }
}

/** Night pass light pools from streetlights (additive, cheap radial discs). */
export function drawLightPools(ctx, city, cam, view, dark) {
  if (dark <= 0.05) return;
  const x0 = cam.x - 90;
  const y0 = cam.y - 90;
  const x1 = cam.x + view.w + 90;
  const y1 = cam.y + view.h + 90;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of city.lights) {
    if (l.x < x0 || l.y < y0 || l.x > x1 || l.y > y1) continue;
    const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 62);
    grad.addColorStop(0, `rgba(255,205,130,${0.2 * dark})`);
    grad.addColorStop(1, 'rgba(255,205,130,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 62, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
