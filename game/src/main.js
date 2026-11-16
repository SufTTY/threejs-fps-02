// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// Every random decision flows through one seeded stream (?seed=N, default 1337), so spawns,
// wave makeup and enemy aim are fully deterministic for a given seed.
// ?shot=start|play|end sets up a deterministic frame for a capture, renders it twice, then
// freezes and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createRng } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createEnemies } from './enemies.js';
import { createWaves } from './waves.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1337', 10) || 1337;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 52);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const rng = createRng(seed);
const world = createWorld(scene);
const weapon = createWeapon(scene, camera);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const body = player.state;

const hooks = {
  enemyFire(unit, eye, aimError) {
    const from = new THREE.Vector3(unit.position.x, unit.position.y + 1.2, unit.position.z);
    const dir = eye.clone().sub(from).normalize();
    dir.x += (rng() * 2 - 1) * aimError;
    dir.y += (rng() * 2 - 1) * aimError * 0.6;
    dir.z += (rng() * 2 - 1) * aimError;
    dir.normalize();
    const ray = new THREE.Raycaster();
    ray.set(from, dir);
    ray.far = 60;
    weapon.addTracer(from, from.clone().add(dir.multiplyScalar(Math.min(60, from.distanceTo(eye)))));
    audio.enemyShot();
    // The unit's own shot resolves after the world's cover: walls already stop it because the
    // ray above is cast in the enemies' shared raycaster; here we check distance and cover.
    const hits = [];
    const targetRay = new THREE.Raycaster();
    targetRay.set(from, dir);
    targetRay.far = 60;
    const worldHit = targetRay.intersectObjects(world.shootables, false)[0];
    const distance = from.distanceTo(eye);
    if (!worldHit || worldHit.distance > distance) {
      hits.push({ distance, resolve: () => resolveEnemyHit() });
    }
    for (const hit of hits) hit.resolve();
  },
  onWave(number) {
    hud.bannerWave(number);
    audio.wave();
  },
  onWaveCleared(number) {
    const bonus = number * 250;
    score += bonus;
    hud.setScore(score);
    hud.bannerClear(bonus);
  },
  onSpawn() {},
};

function resolveEnemyHit() {
  const survived = player.hurt(11, player.time());
  hud.setHealth(body.health);
  hud.flashHurt();
  audio.hurt();
  if (!survived) {
    dead = true;
    audio.death();
    hud.showOverlay('dead', score, waves.state.wave);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

const enemies = createEnemies(scene, world, rng, hooks);
const waves = createWaves(enemies, rng, hooks);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();

let score = 0;
let elapsed = 0;
let dead = false;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setScore(0);
hud.setHealth(body.health);
hud.setWave(0);
hud.onPlay(() => {
  if (shot) return;
  audio.resume();
  if (dead) restart();
  input.requestLock();
});

function restart() {
  dead = false;
  score = 0;
  elapsed = 0;
  enemies.clear();
  waves.reset();
  weapon.refill();
  player.revive();
  player.resetTime();
  hud.setScore(0);
  hud.setHealth(body.health);
  hud.setWave(0);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (!dead) {
    hud.showOverlay(started ? 'paused' : 'start', score, waves.state.wave);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.empty();
    return false;
  }
  syncCamera();
  camera.getWorldDirection(direction);
  direction.x += (rng() * 2 - 1) * spread;
  direction.y += (rng() * 2 - 1) * spread;
  direction.z += (rng() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  // Live lists: units spawn and die mid-run, so never freeze the hit list at boot.
  const hit = raycaster.intersectObjects(world.shootables.concat(enemies.hitMeshes), false)[0];
  const muzzle = weapon.muzzleWorld();
  const end = hit ? hit.point.clone() : camera.position.clone().add(direction.clone().multiplyScalar(60));
  weapon.addTracer(muzzle, end);
  if (hit && hit.object.userData.unit && hit.object.userData.unit.alive) {
    const headshot = hit.object.userData.part === 'head';
    const result = enemies.damage(hit.object.userData.unit, headshot ? 70 : 32, headshot);
    const points = headshot ? 200 : 100;
    score += result.killed ? result.reward + points : 10;
    hud.setScore(score);
    hud.hitMarker(result.killed, shot ? 4000 : 90);
    if (result.killed) {
      audio.kill();
      if (headshot) audio.headshot();
      hud.feedLine(headshot ? 'HEADSHOT  +' + (result.reward + points) : 'DRONE DOWN  +' + (result.reward + points), headshot);
    } else {
      audio.hit();
    }
  }
  weapon.pullTrigger();
  audio.shot();
  player.recoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function step(dt) {
  elapsed += dt;
  player.step(dt, input.state.keys);
  weapon.step(dt);
  waves.step(dt, body);
  enemies.step(dt, body, elapsed);
  // Firing and reload live in the fixed step, so scripted and live play behave identically.
  if (input.state.firing && weapon.ready() && body.alive) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
  if (input.state.keys.has('KeyR')) weapon.reload();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setHealth(body.health);
    hud.setSpread(1 + weapon.spread(player.groundSpeed()) * 55);
    hud.setWave(waves.state.wave, `Wave ${waves.state.wave}`);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0, 0, 10.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.showOverlay('start', 0, 0);
  } else if (name === 'play') {
    body.position.set(0, 0, 8.0);
    settle(20);
    waves.step(0.001, body);
    // Bring one wave online fast and shoot the nearest units to mid-fight action.
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      enemies.spawn(Math.cos(angle) * 9, Math.sin(angle) * 9 - 2, 1);
    }
    waves.state.wave = 1;
    waves.state.toSpawn = 3;
    settle(30);
    const unit = enemies.items[0];
    if (unit) {
      aimAt(new THREE.Vector3(unit.position.x, 1.5, unit.position.z));
      shoot(0);
      settle(6);
      aimAt(new THREE.Vector3(unit.position.x, 1.5, unit.position.z));
      shoot(0);
      settle(4);
    }
    hud.setWave(1);
    hud.setHealth(72);
  } else if (name === 'end') {
    body.position.set(0, 0, 8.0);
    settle(20);
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 + 0.6;
      enemies.spawn(Math.cos(angle) * 7.5, Math.sin(angle) * 7.5 - 3, 2);
    }
    waves.state.wave = 2;
    waves.state.toSpawn = 2;
    settle(35);
    for (let index = 0; index < Math.min(3, enemies.items.length); index += 1) {
      const unit = enemies.items[index];
      if (unit) {
        aimAt(new THREE.Vector3(unit.position.x, 1.62, unit.position.z));
        shoot(0);
        settle(4);
      }
    }
    score = 2450;
    hud.setScore(score);
    hud.setWave(2);
    hud.setHealth(38);
    hud.feedLine('HEADSHOT  +340', true);
    hud.feedLine('DRONE DOWN  +170');
    settle(2);
  }
  hud.setScore(score);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  get stats() { return { score, wave: waves.state.wave, enemies: enemies.alive(), health: body.health, dead, seed, elapsed }; },
  // Deterministic test hook: advance the fixed-step simulation without wall-clock dependence.
  input: input.state,
  // Test hook: freeze the rAF-driven stepping so a scripted advance is the only sim source.
  freeze() {
    frozen = true;
  },
  // Test/dev hook: spawn a unit directly ahead of the player for scripted combat drills.
  spawnAhead(distance = 7) {
    enemies.spawn(body.position.x - Math.sin(body.yaw) * distance, body.position.z - Math.cos(body.yaw) * distance, 1);
  },
  advance(steps) {
    for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
    syncCamera();
    hud.setHealth(body.health);
    hud.setWave(waves.state.wave);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  },
};

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
