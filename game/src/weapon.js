// One hitscan rifle: a view model, a magazine, a reload, recoil and the spread that punishes
// movement. It owns the numbers and the tracer it draws; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAG_SIZE = 30;
const RESERVE = 150;
const FIRE_GAP = 0.098;
const RELOAD_TIME = 1.7;
const SPREAD_STILL = 0.0022;
const SPREAD_MOVING = 0.028;
const MOVE_REFERENCE = 5.2;
const MUZZLE_TIME = 0.06;
const TRACER_TIME = 0.055;

export function createWeapon(scene, camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.1), grip);
  sight.position.set(0, 0.08, -0.12);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // Tracer: a thin bright line from muzzle toward the hit, fading over a few frames.
  const tracerGeometry = new THREE.CylinderGeometry(0.008, 0.008, 1, 5, 1, true);
  tracerGeometry.rotateX(Math.PI / 2);
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false,
  });
  const tracers = [];

  function addTracer(from, to) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    const length = from.distanceTo(to);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(1, 1, length);
    mesh.lookAt(to);
    scene.add(mesh);
    tracers.push({ mesh, life: TRACER_TIME });
  }

  const state = { mag: MAG_SIZE, reserve: RESERVE, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (RELOAD_TIME - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = MAG_SIZE - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    for (let index = tracers.length - 1; index >= 0; index -= 1) {
      const tracer = tracers[index];
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / TRACER_TIME) * 0.85;
      if (tracer.life <= 0) {
        scene.remove(tracer.mesh);
        tracer.mesh.material.dispose();
        tracers.splice(index, 1);
      }
    }
  }

  return {
    state,
    model,
    step,
    addTracer,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = FIRE_GAP;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === MAG_SIZE || state.reserve === 0) return;
      state.reloadLeft = RELOAD_TIME;
    },
    spread(speed) {
      return SPREAD_STILL + Math.min(1, speed / MOVE_REFERENCE) * SPREAD_MOVING;
    },
    muzzleWorld() {
      return flash.getWorldPosition(new THREE.Vector3());
    },
    refill() {
      state.mag = MAG_SIZE;
      state.reserve = RESERVE;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
