// Bullet impacts in the world: decals (ring buffer of 40) + spark particles (one Points object, 120 slots).
// Nothing is allocated per shot — the same objects are reused. Sim coords (x, y, z cells) → world metres.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../../config.js';
import { getWeaponTextures } from '../weapons/weapon-textures.js';

const DECALS = 40, SPARKS = 120;

export function createImpacts(scene) {
  const tex = getWeaponTextures();
  const decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
  const decalMat = new THREE.MeshBasicMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: true });
  const decals = new THREE.InstancedMesh(decalGeo, decalMat, DECALS);
  decals.frustumCulled = false; decals.count = 0; scene.add(decals);
  let next = 0, placed = 0;

  const pos = new Float32Array(SPARKS * 3), col = new Float32Array(SPARKS * 3);
  const vel = new Float32Array(SPARKS * 3), life = new Float32Array(SPARKS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  let sNext = 0, activeSparks = 0;
  for (let i = 0; i < SPARKS; i++) pos[i * 3 + 1] = -100; // parked below the floor

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), n = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), zAxis = new THREE.Vector3(0, 0, 1);
  const stats = { decals: 0, sparks: 0 };

  function impact({ point, normal, kind }) {
    p.set(point.x * S, point.z * S, point.y * S);
    n.set(normal.x, normal.z, normal.y).normalize();
    q.setFromUnitVectors(zAxis, n);
    const s = 0.8 + Math.random() * 0.5; sc.set(s, s, s);
    m.compose(p.clone().addScaledVector(n, 0.004), q, sc);
    decals.setMatrixAt(next, m); decals.instanceMatrix.needsUpdate = true;
    next = (next + 1) % DECALS; placed = Math.min(DECALS, placed + 1); decals.count = placed; stats.decals++;
    const nSp = kind === 'wall' ? 7 : 5;
    for (let i = 0; i < nSp; i++) {
      const k = sNext; sNext = (sNext + 1) % SPARKS;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      const sp = 1.5 + Math.random() * 2.5;
      vel[k * 3] = (n.x + (Math.random() - 0.5) * 1.2) * sp; vel[k * 3 + 1] = (n.y + Math.random() * 0.8) * sp; vel[k * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.2) * sp;
      life[k] = 0.18 + Math.random() * 0.2;
      col[k * 3] = 1; col[k * 3 + 1] = 0.75 + Math.random() * 0.2; col[k * 3 + 2] = 0.4;
    }
    stats.sparks += nSp;
  }

  function update(dt) {
    activeSparks = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      activeSparks++;
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = Math.min(1, life[i] * 5); col[i * 3] *= 0.995; col[i * 3 + 1] = Math.min(col[i * 3 + 1], 0.9 * f); col[i * 3 + 2] = 0.4 * f;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  }
  return { impact, update, stats, get activeSparks() { return activeSparks; }, get decalCount() { return decals.count; } };
}
