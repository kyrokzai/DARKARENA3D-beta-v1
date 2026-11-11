// Builds three.js objects from the simulation World (read-only). Sim cell (x, y) → world (x·S, ·, y·S).
import * as THREE from 'three';
import { CELL_SIZE as S, WALL_HEIGHT } from '../config.js';
import { createTextures } from './textures.js';
import { buildOutpost } from './outpost/outpost.js';

const LIGHT_POOL = 4; // real point lights (M1.5 had 4 lamps = 4 lights)

export function buildLevel(scene, world) {
  const map = world.map, tex = createTextures(map);
  const W = world.width, H = world.height;
  const group = new THREE.Group();
  group.name = 'level';

  // Walls: one InstancedMesh per wall type → 1 draw call per type.
  const box = new THREE.BoxGeometry(S, WALL_HEIGHT, S);
  // cells drawn as outpost props (M1.7) are not drawn as walls: the prop has exactly the cell footprint
  const propCells = new Set(); for (const pr of map.props || []) for (const [x, y] of pr.cells) propCells.add(x + ',' + y);
  const byType = {};
  for (const c of world.solidCells()) if (!propCells.has(c.x + ',' + c.y)) (byType[c.type] ||= []).push(c);
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

  // Atmosphere. M1.6 arena: dim hemisphere fill + lamps. OUTPOST ZERO (M1.7): brighter neutral-cool fill, window light carried by the
  // fill and the floor light pools (no extra light) and the same pooled lamps; red only for the alarm.
  const outpost = map.style === 'outpost';
  const hemi = outpost ? new THREE.HemisphereLight(0xa2acbe, 0x2c2628, 0.9) : new THREE.HemisphereLight(0x7d8aa8, 0x22161a, 1.1);
  group.add(hemi);
  const hemiSky = hemi.color.clone(), hemiGround = hemi.groundColor.clone(), alarmSky = new THREE.Color(0xd06058), alarmGround = new THREE.Color(0x5a1c1c);
  // (A directional "daylight" was tried and removed for performance: one extra light is evaluated for every lit
  //  pixel; the window light is carried by the hemisphere fill, the bright panes and the floor light pools.)
  const daylight = null;
  const dressing = (map.props || map.decor || map.windows) ? buildOutpost(group, world, map) : null;
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
  const LAMP_POWER = outpost ? 16 : 18, FADE = 3.5; // intensity, fade speed (1/s)
  const pool = [];
  for (let i = 0; i < Math.min(LIGHT_POOL, lamps.length); i++) {
    const light = new THREE.PointLight(lamps[i].color, LAMP_POWER, 18, 1.5);
    light.position.set(lamps[i].x * S, WALL_HEIGHT - 0.35, lamps[i].y * S);
    group.add(light); pool.push({ light, lamp: i, k: 1, base: new THREE.Color(lamps[i].color) });
  }
  const order = lamps.map((_, i) => i), dist = new Float32Array(lamps.length);
  let tick = 0;
  const byDist = (a, b) => dist[a] - dist[b]; // created once
  /** Re-assign pooled lights to the lamps nearest to the camera (checked a few times per second). */
  let alarmK = 0; const tint = new THREE.Color(), alarmRed = new THREE.Color(0xff3a2a);
  /** 0..1 alarm level (already scaled by the alarm-effects setting): red accents on fill and lamps, beacons pulse. */
  function setAlarm(k) {
    alarmK = k;
    hemi.color.copy(hemiSky).lerp(alarmSky, k * 0.5); hemi.groundColor.copy(hemiGround).lerp(alarmGround, k * 0.5);
    for (const p of pool) p.light.color.copy(p.base).lerp(alarmRed, k * 0.55);
  }
  function update(camPos, dt, dressDt = dt) { // dressDt = 0 while paused (beacons / monitors freeze)
    if (dressing) dressing.update(dressDt, alarmK);
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
        if (p.k <= 0) { p.k = 0; p.lamp = p.next; p.next = undefined; const l = lamps[p.lamp]; p.base.setHex(l.color); p.light.color.copy(p.base).lerp(alarmRed, alarmK * 0.55); p.light.position.set(l.x * S, WALL_HEIGHT - 0.35, l.y * S); }
      } else if (p.k < 1) p.k = Math.min(1, p.k + dt * FADE);
      p.light.intensity = LAMP_POWER * p.k;
    }
  }
  scene.add(group);
  void tint;
  return { group, wallCount, update, setAlarm, dressing, hemi, daylight, get lightCount() { return pool.length; }, get lampCount() { return lamps.length; }, get alarm() { return alarmK; } };
}
