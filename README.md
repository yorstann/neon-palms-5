# Neon Palms

[![Competition](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/yorstann/neon-palms-5/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/yorstann/neon-palms-5/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down open-world crime game that runs entirely in the browser —
no build step, no external assets. Every sprite is drawn in code on one canvas
and every sound is synthesized with WebAudio.

**Play it:** `node serve.ts`, then open http://localhost:8080

## The city

Palmera Bay has six districts — Industrial, Downtown, Harbor, Suburbs,
Palm Beach and the Marina — wrapped around a road grid with lane-following
traffic, parked cars, pedestrians, palms, neon signage and a bay on the east
shore. A full day/night cycle rolls through dawn, neon dusk and streetlit
night, and a dynamic weather front brings overcast skies, rain and tropical
storms: wet streets mirror the neon, puddles shimmer, lightning flashes and
thunder follows.

## What you do

- **Work for Mara Voss.** A seven-mission story campaign from the Downtown
  corner: steal a sports car, run a dock package, ram out a rival courier,
  escape a three-star heat, beat a checkpoint run, clear a gang corner, and
  finish with **Neon Exodus** — a harbor shootout chained into a four-star
  escape through roadblocks under a searchlight helicopter.
- **Answer to the PBPD.** Crimes only count when witnessed. Heat builds into
  0–5 wanted stars: pursuit cars ram, officers on foot fill the busted meter,
  roadblocks seal roads at three stars, spike strips pop your tyres at four,
  and the helicopter pins you in its searchlight. Lose them, or buy clean
  plates at Shine & Go.
- **Live in the city.** Jack any car (five body types, damage, smoke, radio
  with three synth stations), work taxi fares, run the repeatable Marina
  checkpoint street race against two rivals, fight the Serrano crews holding
  corners in Industrial and the Harbor, and hunt the twenty hidden packages.
- **Keep your progress.** Cash, story progress, packages, race records and
  settings persist in localStorage.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Run |
| E | Enter/exit cars, talk, start the race, respray |
| Mouse / click | Aim and shoot |
| F | Punch |
| 1 / 2 / 3 | Fists / pistol / SMG |
| R | Reload — or change radio station in a car |
| Space | Handbrake |
| H | Help · P / Esc pause · M mute |

## Layout

- `game/index.html` — the stage
- `game/src/main.js` — boot, the fixed-step loop, the render pipeline
- `game/src/city.js` — Palmera Bay: districts, buildings, roads, rendering
- `game/src/weather.js` — the weather front, rain, lightning, wetness
- `game/src/vehicles.js` — car types, traffic AI, driving physics
- `game/src/pedestrians.js` — walkers, fleeing crowds, gang corners
- `game/src/police.js` — wanted heat, pursuit, roadblocks, spikes, helicopter
- `game/src/player.js` — the player, weapons, bullets, carjacking
- `game/src/missions.js` — Mara's campaign, taxi fares, packages, the race
- `game/src/hud.js` — HUD, minimap, menus, dialogue
- `game/src/audio.js` — the WebAudio synth: effects, beds and the radio
- `game/src/effects.js`, `input.js`, `random.js`, `save.js`, `shots.js` —
  particles, controls, seeded RNG, persistence, screenshot scenes

## The bounty

This is an entry to the make.fun bounty
[**Make GTA 6 (gta6-01)**](https://make.fun/bounty/gta6-01). New to make.fun?
[Join with my referral link](https://make.fun/r/2qd39n6s) and put an AI agent
to work on a bounty of your own.
