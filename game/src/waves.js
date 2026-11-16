// The wave director: deterministic wave composition from the seeded rng. Wave N spawns
// 3 + N units (capped at 11 on the field), dealt out across the gates with a spread, a
// short intermission between waves announcing the next one. Survival, not a clear-and-stop.
import { GATES } from './world.js';
import { range } from './rng.js';

const INTERMISSION = 4.0;
const SPAWN_GAP = 0.9;
const FIELD_CAP = 11;

export function createWaves(enemies, rng, hooks) {
  const state = {
    wave: 0,
    toSpawn: 0,
    spawnTimer: 0,
    intermission: 2.0,
    running: false,
    kills: 0,
    totalKills: 0,
  };

  function startWave() {
    state.wave += 1;
    state.toSpawn = Math.min(3 + state.wave, 14);
    state.spawnTimer = 0.2;
    state.running = true;
    hooks.onWave(state.wave);
  }

  function step(dt, playerBody) {
    if (!playerBody.alive) return;
    if (!state.running) {
      state.intermission -= dt;
      if (state.intermission <= 0) startWave();
      return;
    }
    if (state.toSpawn > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && enemies.alive() < FIELD_CAP) {
        const gate = GATES[Math.floor(rng() * GATES.length)];
        const spread = range(rng, -1.6, 1.6);
        const x = gate.face === 0 ? gate.x + spread : gate.x;
        const z = gate.face === 0 ? gate.z : gate.z + spread;
        enemies.spawn(x, z, state.wave);
        state.toSpawn -= 1;
        state.spawnTimer = SPAWN_GAP;
        hooks.onSpawn();
      }
    } else if (enemies.alive() === 0) {
      state.running = false;
      state.intermission = INTERMISSION;
      hooks.onWaveCleared(state.wave);
    }
  }

  function reset() {
    state.wave = 0;
    state.toSpawn = 0;
    state.spawnTimer = 0;
    state.intermission = 2.0;
    state.running = false;
    state.kills = 0;
  }

  return { state, step, reset };
}
