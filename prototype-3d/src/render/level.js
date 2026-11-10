// Builds three.js objects from the simulation World (read-only). Sim cell (x, y) → world (x·S, ·, y·S).
import * as THREE from 'three';
import { CELL_SIZE as S, WALL_HEIGHT } from '../config.js';
import { createTextures } from './textures.js';

const LIGHT_POOL = 4; // real point lights (M1.5 had 4 lamps = 4 lights)

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
  // Lamps: every lamp has a cheap emissive fixture, but only LIGHT_POOL real point lights exist (the same number
  // as the 4 lamps of M1.5 → identical shader cost on phones). The pool follows the camera: each light sits on one
  // of the nearest lamps and cross-fades when it has to move to another one (no popping, no shader recompiles).
  const lamps = map.lamps || [];
  const lampGeo = new THREE.BoxGeometry(0.6, 0.08, 0.6);
  if (lamps.length) { // all fixtures = one instanced draw call (per-instance colour)
    const fixtures = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps.length);
    const col = new THREE.Color();
    lamps.forEach((l, i) => { fixtures.setMatrixAt(i, m.makeTranslation(l.x * S, WALL_HEIGHT - 0.04, l.y * S)); fixtures.setColorAt(i, col.setHex(l.color)); });
    fixtures.instanceMatrix.needsUpdate = true; fixtures.instanceColor.needsUpdate = true; fixtures.frustumCulled = false; fixtures.name = 'lamp-fixtures';
    group.add(fixtures);
  }
  const LAMP_POWER = 18, FADE = 3.5; // intensity, fade speed (1/s)
  const pool = [];
  for (let i = 0; i < Math.min(LIGHT_POOL, lamps.length); i++) {
    const light = new THREE.PointLight(lamps[i].color, LAMP_POWER, 18, 1.5);
    light.position.set(lamps[i].x * S, WALL_HEIGHT - 0.35, lamps[i].y * S);
    group.add(light); pool.push({ light, lamp: i, k: 1 });
  }
  const order = lamps.map((_, i) => i), dist = new Float32Array(lamps.length);
  let tick = 0;
  const byDist = (a, b) => dist[a] - dist[b]; // created once
  /** Re-assign pooled lights to the lamps nearest to the camera (checked a few times per second). */
  function update(camPos, dt) {
    if (lamps.length <= pool.length) return;
    if ((tick++ & 7) === 0) {
      for (let i = 0; i < lamps.length; i++) dist[i] = Math.hypot(lamps[i].x * S - camPos.x, lamps[i].y * S - camPos.z);
      order.sort(byDist);
      for (const p of pool) {
        const rank = order.indexOf(p.lamp);
        p.want = rank < pool.length ? p.lamp : -1; // -1: its lamp is no longer among the nearest → move
        if (p.want !== -1 && p.next !== undefined) p.next = undefined; // its lamp is near again → cancel the move, fade back in
      }
      for (let r = 0; r < pool.length; r++) { // nearest lamps without a light get the pooled lights that must move
        const li = order[r];
        let covered = false, free = null;
        for (const p of pool) { if (p.lamp === li || p.next === li) covered = true; else if (!free && p.want === -1 && p.next === undefined) free = p; }
        if (!covered && free) free.next = li;
      }
    }
    for (const p of pool) {
      if (p.next !== undefined) { // fade out, jump, fade in
        p.k -= dt * FADE;
        if (p.k <= 0) { p.k = 0; p.lamp = p.next; p.next = undefined; const l = lamps[p.lamp]; p.light.color.setHex(l.color); p.light.position.set(l.x * S, WALL_HEIGHT - 0.35, l.y * S); }
      } else if (p.k < 1) p.k = Math.min(1, p.k + dt * FADE);
      p.light.intensity = LAMP_POWER * p.k;
    }
  }
  scene.add(group);
  return { group, wallCount, update, get lightCount() { return pool.length; }, get lampCount() { return lamps.length; } };
}
