// Everything drawn in screen space: the HUD (health, cash, clock, stars,
// weapon, speedo, minimap), the objective line, dialogue and phone UI, the
// race standings, interaction prompts, and the title / pause / help /
// busted / wasted screens.

import { V_ROADS, H_ROADS, WORLD_W, WORLD_H, WATER_X, districtAt } from './city.js';
import { WEATHER_LABEL } from './weather.js';
import { WEAPONS } from './player.js';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(10,12,20,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
}

function bar(ctx, x, y, w, h, frac, color, back = 'rgba(255,255,255,0.14)') {
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2);
    ctx.fill();
  }
}

function fmtTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtRaceTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function drawMinimap(ctx, G) {
  const W = 196;
  const H = 150;
  const x = 14;
  const y = G.view.h - H - 14;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  panel(ctx, x - 4, y - 4, W + 8, H + 8, 0.62);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, W, H);
  ctx.clip();
  ctx.fillStyle = '#232830';
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(x + WATER_X * sx, y, (WORLD_W - WATER_X) * sx, H);
  ctx.strokeStyle = 'rgba(200,205,215,0.5)';
  ctx.lineWidth = 2.4;
  for (const rx of V_ROADS) {
    ctx.beginPath();
    ctx.moveTo(x + rx * sx, y);
    ctx.lineTo(x + rx * sx, y + H);
    ctx.stroke();
  }
  for (const ry of H_ROADS) {
    ctx.beginPath();
    ctx.moveTo(x, y + ry * sy);
    ctx.lineTo(x + W, y + ry * sy);
    ctx.stroke();
  }
  // Packages still out there.
  ctx.fillStyle = 'rgba(125,255,106,0.8)';
  for (const pkg of G.city.packages) {
    if (!pkg.taken) ctx.fillRect(x + pkg.x * sx - 1, y + pkg.y * sy - 1, 2, 2);
  }
  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Objective, rivals, police, helicopter.
  if (G.objective) dot(G.objective.x, G.objective.y, '#ffd94d', 3.6);
  for (const car of G.cars) {
    if (car.driver === 'race') dot(car.x, car.y, '#ff2e88', 3);
    else if (car.type === 'police' && car.driver !== 'parked') dot(car.x, car.y, Math.floor(G.t * 3) % 2 ? '#3f8cff' : '#ff4040', 3);
  }
  if (G.police.heli.active) dot(G.police.heli.x, G.police.heli.y, '#e8ecf2', 3);
  for (const off of G.police.officers) dot(off.x, off.y, '#3f8cff', 2.2);
  // Player arrow.
  const P = G.player;
  ctx.save();
  ctx.translate(x + P.x * sx, y + P.y * sy);
  ctx.rotate(P.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.8);
  ctx.lineTo(-4.4, 3.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function drawHUD(ctx, G) {
  const P = G.player;
  const view = G.view;
  ctx.textAlign = 'left';

  // Health and armour, bottom-right above the weapon readout.
  const bx = view.w - 234;
  bar(ctx, bx, view.h - 66, 220, 13, P.health / 100, P.health > 30 ? '#3ddc68' : '#ff4040');
  if (P.armor > 0) bar(ctx, bx, view.h - 48, 220, 8, P.armor / 100, '#7db8ff');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('HEALTH', bx + 2, view.h - 70);

  // Weapon and ammo.
  const w = WEAPONS[P.weapon];
  ctx.textAlign = 'right';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText(w.name, view.w - 16, view.h - 78);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#b8c0cc';
  if (P.weapon !== 'fists') ctx.fillText(P.reloadT > 0 ? 'RELOADING…' : `${P.mag} / ${P.reserve}`, view.w - 16, view.h - 20);

  // Cash, clock, district, weather — top-right cluster.
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillStyle = '#7dff9a';
  ctx.fillText(`$${G.save.money.toLocaleString('en-US')}`, view.w - 16, 32);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf2';
  const district = districtAt(P.x, P.y).name;
  ctx.fillText(`${fmtTime(G.timeMin)}  ·  ${district}  ·  ${WEATHER_LABEL[G.weather.kind]}`, view.w - 16, 54);

  // Wanted stars, top-centre-right.
  const stars = G.police.wanted;
  ctx.font = '21px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd94d' : 'rgba(255,255,255,0.18)';
    ctx.fillText('★', view.w - 240 - (4 - i) * 24, 33);
  }
  if (G.police.heat > 4 && stars < 5) {
    bar(ctx, view.w - 364, 40, 120, 5, G.police.heat / 100, 'rgba(255,217,77,0.75)');
  }

  // Objective line, top-centre.
  if (G.objectiveText) {
    ctx.font = 'bold 14.5px system-ui, sans-serif';
    const tw = ctx.measureText(G.objectiveText).width;
    panel(ctx, (view.w - tw) / 2 - 14, 12, tw + 28, 30, 0.5);
    ctx.fillStyle = '#ffd94d';
    ctx.textAlign = 'center';
    ctx.fillText(G.objectiveText, view.w / 2, 32);
  }

  // Speedo while driving.
  if (P.car) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.round(Math.abs(P.car.speed) * 0.32)}`, view.w - 62, view.h - 96);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#b8c0cc';
    ctx.fillText('km/h', view.w - 16, view.h - 96);
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(`♪ ${G.audio.stationName()}`, view.w - 16, view.h - 118);
    if (P.car.popped > 0) {
      ctx.fillStyle = '#ff5a4d';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('TYRES POPPED', view.w - 16, view.h - 138);
    }
  }

  // Busted meter.
  if (G.police.busted > 0.02) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#ff5a4d';
    ctx.fillText('BUSTED?', view.w / 2, view.h / 2 - 64);
    bar(ctx, view.w / 2 - 110, view.h / 2 - 54, 220, 11, G.police.busted, '#ff4040');
  }

  // Interaction prompt.
  if (G.prompt) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const tw = ctx.measureText(G.prompt).width;
    panel(ctx, (view.w - tw) / 2 - 14, view.h - 108, tw + 28, 32, 0.6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.prompt, view.w / 2, view.h - 86);
  }

  drawMinimap(ctx, G);
}

/** Race standings and the countdown, centred on screen. */
export function drawRace(ctx, G) {
  const race = G.missions.race;
  const view = G.view;
  if (race.phase === 'countdown') {
    const n = Math.ceil(race.countdown - 0.2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillStyle = n <= 0 ? '#7dff9a' : '#ffd94d';
    ctx.fillText(n <= 0 ? 'GO!' : String(n), view.w / 2, view.h / 2 - 40);
    return;
  }
  if (race.phase !== 'running') return;
  panel(ctx, view.w / 2 - 128, 52, 256, 40, 0.55);
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(`POS ${race.pos}/3   ·   GATE ${Math.min(race.cp, race.points.length - 1)}/${race.points.length - 1}   ·   ${fmtRaceTime(race.t)}`, view.w / 2, 79);
}

/** Dialogue box (story beats) — name, line, advance hint. */
export function drawDialogue(ctx, G) {
  const dlg = G.dialogue;
  if (!dlg) return;
  const view = G.view;
  const [who, text] = dlg.lines[dlg.index];
  panel(ctx, 190, view.h - 128, view.w - 380, 96, 0.78);
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = who === 'MARA' ? '#ff8ad4' : '#7dd7ff';
  ctx.fillText(who, 214, view.h - 100);
  ctx.font = '15.5px system-ui, sans-serif';
  ctx.fillStyle = '#f2f4f8';
  wrapText(ctx, text, 214, view.h - 74, view.w - 428, 21);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#9aa4b2';
  ctx.textAlign = 'right';
  ctx.fillText('E / click ▸', view.w - 214, view.h - 44);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

/** Phone buzz when Mara has work and the player is far from her corner. */
export function drawPhone(ctx, G) {
  if (G.dialogue || G.missions.active || G.save.missionIndex >= 7) return;
  const L = G.city.landmarks.maraCorner;
  const d = Math.hypot(G.player.x - L.x, G.player.y - L.y);
  if (d < 340) return;
  const bob = Math.sin(G.t * 6) * 2;
  panel(ctx, G.view.w - 218, 74 + bob, 202, 52, 0.66);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#ff8ad4';
  ctx.fillText('📱 MARA VOSS', G.view.w - 202, 96 + bob);
  ctx.font = '12.5px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText('Got work. Come see me.', G.view.w - 202, 115 + bob);
}

// ---------- full screens ----------

function centreLines(ctx, view, lines, startY, gap) {
  ctx.textAlign = 'center';
  let y = startY;
  for (const [text, font, color] of lines) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, view.w / 2, y);
    y += gap;
  }
}

export function drawTitle(ctx, G) {
  const view = G.view;
  const grad = ctx.createLinearGradient(0, 90, 0, 210);
  grad.addColorStop(0, '#22d3ee');
  grad.addColorStop(0.55, '#ff2e88');
  grad.addColorStop(1, '#ffb020');
  ctx.textAlign = 'center';
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.save();
  ctx.shadowColor = 'rgba(255,46,136,0.65)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = grad;
  ctx.fillText('NEON PALMS', view.w / 2, 196);
  ctx.restore();
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText('a n   o p e n - w o r l d   c r i m e   s t o r y   i n   P a l m e r a   B a y', view.w / 2, 234);
  centreLines(ctx, view, [
    ['Six districts. One fixer. A city that never dries off.', '15.5px system-ui, sans-serif', '#c8d2de'],
    ['Work Mara Voss\'s seven jobs, outrun the PBPD, race the Marina,', '15.5px system-ui, sans-serif', '#c8d2de'],
    ['and find the twenty packages hidden around the bay.', '15.5px system-ui, sans-serif', '#c8d2de'],
  ], 292, 24);
  centreLines(ctx, view, [
    ['ENTER — DRIVE', 'bold 22px system-ui, sans-serif', '#7dff9a'],
    ['N — NEW GAME (wipes the save)', '13.5px system-ui, sans-serif', '#9aa4b2'],
    ['WASD drive & walk · E enter cars / talk · mouse aim, click shoot · 1/2/3 weapons', '13.5px system-ui, sans-serif', '#9aa4b2'],
    ['R reload / radio · Space handbrake · H help · P pause · M mute', '13.5px system-ui, sans-serif', '#9aa4b2'],
  ], 420, 30);
  if (G.save.missionIndex > 0) {
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(`Save found: ${G.save.missionIndex}/7 missions done · $${G.save.money.toLocaleString('en-US')} · packages ${G.save.packagesFound.length}/20`, view.w / 2, 580);
  }
}

export function drawPause(ctx, G) {
  const view = G.view;
  ctx.fillStyle = 'rgba(6,8,14,0.72)';
  ctx.fillRect(0, 0, view.w, view.h);
  centreLines(ctx, view, [
    ['PAUSED', 'bold 44px system-ui, sans-serif', '#fff'],
    [`Missions ${Math.min(7, G.save.missionIndex)}/7 · Packages ${G.save.packagesFound.length}/20 · Races won ${G.save.racesWon}`, '15px system-ui, sans-serif', '#c8d2de'],
    [`Cash $${G.save.money.toLocaleString('en-US')} · Earned all-time $${G.save.totalEarned.toLocaleString('en-US')}`, '15px system-ui, sans-serif', '#c8d2de'],
    ['P / ESC — resume      H — help      M — mute', '14px system-ui, sans-serif', '#9aa4b2'],
  ], 250, 40);
}

export function drawHelp(ctx, G) {
  const view = G.view;
  ctx.fillStyle = 'rgba(6,8,14,0.82)';
  ctx.fillRect(0, 0, view.w, view.h);
  centreLines(ctx, view, [
    ['HOW TO PLAY', 'bold 34px system-ui, sans-serif', '#22d3ee'],
    ['WASD / arrows — walk and drive · Shift — run', '15px system-ui, sans-serif', '#e8ecf2'],
    ['E — enter/exit cars, talk to Mara, start the race at the flag', '15px system-ui, sans-serif', '#e8ecf2'],
    ['Mouse — aim · click — shoot · F — punch · 1/2/3 — weapons · R — reload (radio in a car)', '15px system-ui, sans-serif', '#e8ecf2'],
    ['Space — handbrake · P/Esc — pause · M — mute', '15px system-ui, sans-serif', '#e8ecf2'],
    ['Crimes only count when witnessed. Break line of sight to cool the stars.', '15px system-ui, sans-serif', '#ffd94d'],
    ['Shine & Go respray clears your wanted level for $150. Rain makes the neon bleed.', '15px system-ui, sans-serif', '#ffd94d'],
    ['H / Esc — back', '14px system-ui, sans-serif', '#9aa4b2'],
  ], 190, 33);
}

export function drawBusted(ctx, G) {
  const view = G.view;
  ctx.fillStyle = 'rgba(10,16,40,0.68)';
  ctx.fillRect(0, 0, view.w, view.h);
  centreLines(ctx, view, [
    ['BUSTED', 'bold 72px system-ui, sans-serif', '#5e9dff'],
    [`The PBPD took $${G.lastFine} in fines and impound fees.`, '16px system-ui, sans-serif', '#e8ecf2'],
    ['ENTER — walk out of the station', '15px system-ui, sans-serif', '#9aa4b2'],
  ], 300, 46);
}

export function drawWasted(ctx, G) {
  const view = G.view;
  ctx.fillStyle = 'rgba(40,6,8,0.66)';
  ctx.fillRect(0, 0, view.w, view.h);
  centreLines(ctx, view, [
    ['WASTED', 'bold 72px system-ui, sans-serif', '#ff4040'],
    [`St. Palm patched you up for $${G.lastBill}.`, '16px system-ui, sans-serif', '#e8ecf2'],
    ['ENTER — leave the hospital', '15px system-ui, sans-serif', '#9aa4b2'],
  ], 300, 46);
}
