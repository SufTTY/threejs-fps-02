// The arena: a 34 x 30 m closed combat yard with cover in three rings, two raised flanks,
// and four enemy spawn gates in the walls. Every box is a collider for players and units
// and a surface bullets stop on. Plain geometry only, no models, no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const GATES = [
  { x: -11.0, z: -13.0, face: 0 },
  { x: 11.0, z: -13.0, face: 0 },
  { x: -13.0, z: 6.0, face: 1 },
  { x: 13.0, z: 6.0, face: 1 },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the four walls; open sky so one directional light reaches every corner.
  box(34.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5.0, 30.4, -17.2, 2.5, 0, 'surface');
  box(0.4, 5.0, 30.4, 17.2, 2.5, 0, 'surface');
  box(34.4, 5.0, 0.4, 0, 2.5, -15.2, 'surface');
  box(34.4, 5.0, 0.4, 0, 2.5, 15.2, 'surface');

  // Spawn gates: recessed dark frames in the north and side walls, where units appear.
  for (const gate of GATES) {
    if (gate.face === 0) box(2.6, 3.0, 0.3, gate.x, 1.5, -14.9, 'hairline');
    else box(0.3, 3.0, 2.6, gate.x + (gate.x > 0 ? 0.2 : -0.2), 1.5, gate.z, 'hairline');
  }

  // Central structure: a broken pillar court with waist-high cover to fight around.
  box(1.4, 3.6, 1.4, 0, 1.8, -1.5, 'hairline');
  box(1.4, 3.6, 1.4, -3.0, 1.8, 2.4, 'hairline');
  box(1.4, 3.6, 1.4, 3.0, 1.8, 2.4, 'hairline');
  box(4.2, 1.0, 1.2, -2.2, 0.5, -4.6, 'hairline');
  box(1.2, 1.0, 4.2, 5.4, 0.5, -2.0, 'hairline');
  box(1.2, 1.0, 4.2, -5.4, 0.5, 0.4, 'hairline');

  // Lane cover: crates and low walls scattered for peek-and-shoot play.
  box(2.6, 1.2, 1.4, -8.5, 0.6, -6.5, 'hairline');
  box(1.4, 1.2, 2.6, 8.5, 0.6, -6.5, 'hairline');
  box(2.6, 1.2, 1.4, 9.0, 0.6, 3.0, 'hairline');
  box(1.4, 1.2, 2.6, -9.0, 0.6, 3.0, 'hairline');
  box(3.4, 1.4, 1.2, -5.0, 0.7, 8.5, 'hairline');
  box(1.2, 1.4, 3.4, 5.0, 0.7, 8.5, 'hairline');
  box(2.0, 0.8, 2.0, -13.0, 0.4, -8.0, 'hairline');
  box(2.0, 0.8, 2.0, 13.0, 0.4, -8.0, 'hairline');
  box(2.0, 0.8, 2.0, 13.0, 0.4, 11.0, 'hairline');
  box(2.0, 0.8, 2.0, -13.0, 0.4, 11.0, 'hairline');

  // Raised flanks at the back corners: ramp ground you can jump onto for sight lines.
  box(6.0, 0.5, 3.0, 12.5, 0.25, 12.0, 'surface');
  box(3.0, 1.4, 1.2, 9.0, 0.7, 13.5, 'surface');
  box(6.0, 0.5, 3.0, -12.5, 0.25, 12.0, 'surface');
  box(3.0, 1.4, 1.2, -9.0, 0.7, 13.5, 'surface');

  // Accent beacons: slim emissive posts marking the gates, readable at a glance.
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (const gate of GATES) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), beaconMaterial);
    post.position.set(gate.x, 1.3, gate.face === 0 ? -13.4 : gate.z + (gate.z > 0 ? 1.4 : -1.4));
    group.add(post);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 7);
    light.position.copy(post.position).add(new THREE.Vector3(0, 0.8, 0));
    group.add(light);
  }

  // Lighting: warm hemisphere fill, one shadowed key, one cool rim.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.5));
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.6);
  key.position.set(11, 15, 9);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 55;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.7);
  rim.position.set(-9, 10, -11);
  scene.add(rim);

  return { colliders, shootables, group };
}
