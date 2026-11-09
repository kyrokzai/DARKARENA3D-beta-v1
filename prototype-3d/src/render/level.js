// Builds three.js objects from the simulation World (read-only). Sim cell (x, y) → world (x·S, ·, y·S).
import * as THREE from 'three';
import { CELL_SIZE as S, WALL_HEIGHT } from '../config.js';
import { createTextures } from './textures.js';

export function buildLevel(scene, world) {
  const map = world.map, tex = createTextures(map);
  const W = world.width, H = world.height;
  const group = new THREE.Group();
  group.name = 'level';

  // Walls: one InstancedMesh per wall type → 1 draw call per type.
  const box = new THREE.BoxGeometry(S, WALL_HEIGHT, S);
  const byType = {};
  for (const c of world.solidCells()) (byType[c.type] ||= []).push(c);
  const m = new THREE.Matrix4();
  let wallCount = 0;
  for (const [type, cells] of Object.entries(byType)) {
    const name = map.legend[type] || 'concrete';
    const mat = new THREE.MeshLambertMaterial({ map: tex[name] || tex.concrete });
    const mesh = new THREE.InstancedMesh(box, mat, cells.length);
    cells.forEach((c, i) => mesh.setMatrixAt(i, m.makeTranslation((c.x + 0.5) * S, WALL_HEIGHT / 2, (c.y + 0.5) * S)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'walls-' + name;
    group.add(mesh);
    wallCount += cells.length;
  }

  // Floor and ceiling: single quads with a repeating 1-cell texture.
  const plane = new THREE.PlaneGeometry(W * S, H * S);
  const floor = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ map: tex.floor }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * S / 2, 0, H * S / 2);
  floor.name = 'floor';
  const ceiling = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ map: tex.ceiling }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(W * S / 2, WALL_HEIGHT, H * S / 2);
  ceiling.name = 'ceiling';
  group.add(floor, ceiling);

  // Atmosphere: dim hemisphere fill + a few warm/coloured ceiling lamps.
  group.add(new THREE.HemisphereLight(0x7d8aa8, 0x22161a, 1.1));
  const lampGeo = new THREE.BoxGeometry(0.6, 0.08, 0.6);
  for (const l of map.lamps || []) {
    const light = new THREE.PointLight(l.color, 18, 18, 1.5);
    light.position.set(l.x * S, WALL_HEIGHT - 0.35, l.y * S);
    const fixture = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: l.color }));
    fixture.position.set(l.x * S, WALL_HEIGHT - 0.04, l.y * S);
    group.add(light, fixture);
  }
  scene.add(group);
  return { group, wallCount };
}
