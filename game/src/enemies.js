// Enemy units: humanoid hunter drones built from boxes, with a real brain in three states.
// HUNT: run at the player, sliding along cover, strafing when close. COMBAT: hold range,
// telegraph for 0.45 s (visor glows), then fire a hitscan shot with seed-driven inaccuracy.
// STAGGER: knocked back on a heavy hit. Death: the unit crumples and sinks, then despawns.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SPEED_HUNT = 3.1;
const SPEED_COMBAT = 1.6;
const ENGAGE_RANGE = 11;
const BREAK_RANGE = 15;
const FIRE_INTERVAL = 1.15;
const TELEGRAPH = 0.45;
const DAMAGE = 11;
const AIM_ERROR = 0.045;
const RADIUS = 0.36;
const HEIGHT = 1.7;
const STAGGER_TIME = 0.35;

function buildUnitMeshes(scene) {
  const shell = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.55, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.8 });
  const visor = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), shell);
  torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), dark);
  head.position.y = 1.62;
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.02), visor);
  visorMesh.position.set(0, 1.63, -0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.82, 0.22), shell);
  legL.position.set(-0.15, 0.41, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.14), shell);
  armL.position.set(-0.36, 1.14, -0.06);
  const armR = armL.clone();
  armR.position.x = 0.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.5), dark);
  gun.position.set(0.36, 1.2, -0.36);
  group.add(torso, head, visorMesh, legL, legR, armL, armR, gun);
  group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  scene.add(group);
  return { group, torso, head, visorMesh, legL, legR, gun };
}

export function createEnemies(scene, world, rng, hooks) {
  const items = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  const probe = new THREE.Box3();
  const toTarget = new THREE.Vector3();

  function blocked(from, to) {
    toTarget.copy(to).sub(from);
    const length = toTarget.length();
    if (length < 0.01) return false;
    raycaster.set(from, toTarget.normalize());
    raycaster.far = length;
    return raycaster.intersectObjects(world.shootables, false).length > 0;
  }

  function overlaps(x, z, y) {
    probe.min.set(x - RADIUS, y + 0.05, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function spawn(x, z, wave) {
    // Nudge into free space: a spawn overlapping cover would pin the unit in place forever.
    for (let attempt = 0; attempt < 10 && overlaps(x, z, 0); attempt += 1) {
      const away = Math.hypot(x, z) || 1;
      x -= (x / away) * 0.5;
      z -= (z / away) * 0.5;
    }
    const parts = buildUnitMeshes(scene);
    const unit = {
      parts,
      position: new THREE.Vector3(x, 0, z),
      yaw: 0,
      health: 100,
      alive: true,
      state: 'hunt',
      telegraph: 0,
      fireCooldown: 0.4 + rng() * 0.5,
      stagger: 0,
      dieTime: 0,
      strafeDir: rng() < 0.5 ? -1 : 1,
      strafeLeft: 1 + rng() * 1.5,
      walkPhase: rng() * Math.PI * 2,
      wave,
      reward: 100 + wave * 10,
    };
    parts.torso.userData.unit = unit;
    parts.head.userData.unit = unit;
    parts.head.userData.part = 'head';
    parts.torso.userData.part = 'torso';
    hitMeshes.push(parts.torso, parts.head);
    items.push(unit);
  }

  function damage(unit, amount, headshot) {
    if (!unit.alive) return { killed: false, damage: 0 };
    unit.health -= amount;
    if (unit.health <= 0) {
      unit.alive = false;
      unit.state = 'dead';
      unit.dieTime = 0;
      return { killed: true, damage: amount, reward: unit.reward * (headshot ? 2 : 1) };
    }
    if (amount >= 40 && unit.state !== 'combat') {
      unit.state = 'stagger';
      unit.stagger = STAGGER_TIME;
    }
    return { killed: false, damage: amount };
  }

  function step(dt, playerBody, time) {
    const eye = new THREE.Vector3(playerBody.position.x, playerBody.position.y + playerBody.eye, playerBody.position.z);
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const unit = items[index];
      const { group } = unit.parts;

      if (unit.state === 'dead') {
        unit.dieTime += dt;
        const fall = Math.min(1, unit.dieTime / 0.45);
        group.rotation.x = -fall * 1.5;
        group.position.y = -fall * 0.1;
        if (unit.dieTime > 0.45 && unit.dieTime < 1.6) {
          group.position.y = -(0.1 + (unit.dieTime - 0.45) * 0.5);
        }
        if (unit.dieTime > 1.6) {
          scene.remove(group);
          group.traverse((mesh) => { if (mesh.isMesh && mesh.material.dispose) mesh.material.dispose?.(); });
          items.splice(index, 1);
        }
        continue;
      }

      const feet = new THREE.Vector3(unit.position.x, unit.position.y + 1.35, unit.position.z);
      const canSee = playerBody.alive && !blocked(feet, eye);
      const distance = unit.position.distanceTo(playerBody.position);
      const dx = playerBody.position.x - unit.position.x;
      const dz = playerBody.position.z - unit.position.z;
      const flat = Math.hypot(dx, dz) || 1;

      let moveX = 0;
      let moveZ = 0;
      let speed = 0;

      if (unit.state === 'stagger') {
        unit.stagger -= dt;
        if (unit.stagger <= 0) unit.state = 'hunt';
      } else if (unit.state === 'hunt') {
        if (canSee && distance < ENGAGE_RANGE) {
          unit.state = 'combat';
          unit.telegraph = 0;
          unit.fireCooldown = Math.min(unit.fireCooldown, 0.3);
        } else {
          speed = SPEED_HUNT;
          moveX = (dx / flat) * speed;
          moveZ = (dz / flat) * speed;
        }
      } else if (unit.state === 'combat') {
        if (!canSee || distance > BREAK_RANGE || !playerBody.alive) {
          unit.state = 'hunt';
          unit.telegraph = 0;
        } else {
          // Hold the ring: back off when too close, sidestep otherwise.
          unit.strafeLeft -= dt;
          if (unit.strafeLeft <= 0) {
            unit.strafeDir = rng() < 0.5 ? -1 : 1;
            unit.strafeLeft = 0.8 + rng() * 1.4;
          }
          if (distance < 5) {
            speed = SPEED_COMBAT;
            moveX = (-dx / flat) * speed;
            moveZ = (-dz / flat) * speed;
          } else {
            speed = SPEED_COMBAT;
            moveX = (-dz / flat) * speed * unit.strafeDir * 0.8;
            moveZ = (dx / flat) * speed * unit.strafeDir * 0.8;
          }
          unit.telegraph += dt;
          if (unit.telegraph >= TELEGRAPH && unit.fireCooldown <= 0) {
            unit.fireCooldown = FIRE_INTERVAL * (0.8 + rng() * 0.4);
            unit.telegraph = 0;
            hooks.enemyFire(unit, eye, AIM_ERROR);
          }
        }
      }

      // Fire pacing runs in every state so cooldowns never stall.
      unit.fireCooldown = Math.max(0, unit.fireCooldown - dt);

      // Integrate with cover sliding: try the move, then each axis, so walls are respected.
      const nx = unit.position.x + moveX * dt;
      const nz = unit.position.z + moveZ * dt;
      if (!overlaps(nx, nz, unit.position.y)) {
        unit.position.x = nx;
        unit.position.z = nz;
      } else if (!overlaps(nx, unit.position.z, unit.position.y)) {
        unit.position.x = nx;
        unit.position.z += (rng() < 0.5 ? 1 : -1) * speed * dt * 0.6;
      } else if (!overlaps(unit.position.x, nz, unit.position.y)) {
        unit.position.z = nz;
        unit.position.x += (rng() < 0.5 ? 1 : -1) * speed * dt * 0.6;
      } else {
        unit.strafeDir = -unit.strafeDir;
      }

      // Face the player, animate legs, glow the visor while winding up.
      unit.yaw = Math.atan2(dx, dz);
      group.position.set(unit.position.x, unit.position.y, unit.position.z);
      group.rotation.y = unit.yaw;
      unit.walkPhase += speed * dt * 3.4;
      const swing = speed > 0.1 ? Math.sin(unit.walkPhase) * 0.5 : 0;
      unit.parts.legL.rotation.x = swing;
      unit.parts.legR.rotation.x = -swing;
      unit.parts.visorMesh.material.color.setHex(unit.telegraph > 0 ? 0xff5533 : parseInt(PALETTE.accent.slice(1), 16));
      unit.parts.visorMesh.scale.setScalar(unit.telegraph > 0 ? 1.5 : 1);
    }
  }

  return {
    items,
    hitMeshes,
    spawn,
    damage,
    step,
    alive() {
      return items.filter((unit) => unit.alive).length;
    },
    clear() {
      for (const unit of items) {
        scene.remove(unit.parts.group);
        unit.parts.group.traverse((mesh) => { if (mesh.isMesh && mesh.material?.dispose) mesh.material.dispose(); });
      }
      items.length = 0;
    },
  };
}
