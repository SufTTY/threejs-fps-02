# OVERRUN — Wave-Survival Tactical FPS

A polished, fully deterministic three.js first-person shooter built for the make.fun
bounty "Make the best three.js tactical FPS". You hold a closed combat yard against
waves of hunter drones that hunt you, take cover, strafe, telegraph and fire back.

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)

## What's in the game

- **Wave survival**: a wave director spawns `3 + wave` drones (field cap 11) from four
  gates around the arena, with an intermission banner and a clear bonus between waves.
- **Enemy AI**: three-state hunter drones — HUNT (chase with cover sliding), COMBAT
  (hold range, strafe, telegraph with a glowing visor, then hitscan-fire), STAGGER
  (knocked back by heavy hits). Death crumples and sinks the unit.
- **Gunplay**: hitscan rifle with recoil that kicks and recovers, movement-based spread
  bloom on the crosshair, tracers, muzzle flash, magazine + reserve reload, head shots
  pay double (70 damage vs 32 body).
- **Player**: sprint, crouch, jump, axis-separated box collision, health with regen
  after 4 s out of fire, damage vignette, death and restart flow.
- **HUD**: score, wave line, health bar, ammo, kill feed, wave banners, hit markers,
  spread-reactive crosshair — all DOM, zero textures.
- **Sound**: fully synthesized WebAudio (gunfire, hit/kill confirms, enemy shots, hurt,
  wave stingers) — no audio assets.
- **Determinism**: every random decision flows through one mulberry32 stream seeded by
  `?seed=` (default 1337); the simulation is a fixed 60 Hz step. Given a seed and an
  input script, a run is fully reproducible — verified by scripted headless runs.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open http://localhost:8080 and click to play (pointer lock).
Keys: WASD move, Shift sprint, Space jump, Ctrl crouch, mouse look/fire, R reload.

## Build & test entry artifacts

```sh
node main.ts                          # copies game/ + screenshots/ and writes /output/dossier.json
MAKEFUN_OUTPUT_DIR=out node main.ts   # outside the grader container
CHROME_BIN=<chromium> node tools/capture.mjs   # headless WebGL2 (SwiftShader) screenshots
                                               # + scripted gameplay smoke + determinism probe
```

`tools/capture.mjs` drives headless Chromium over raw CDP (Node 22 stdlib only, no
dependencies) with SwiftShader WebGL2, captures the three deterministic shot frames,
then plays the game via `window.__game.advance()` fixed-step hooks and checks that two
scripted runs produce identical stats.

## Approach

Plain three.js ES modules behind an import map, no build step, no textures, no models —
geometry, palette-driven materials and one shadowed directional key light. The dossier
the scorer reads is built with the kit's own `vendor/makefun-threejs.ts`.

## License

MIT
