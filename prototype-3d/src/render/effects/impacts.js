// Bullet impacts in the world: decals (ring buffer of 40) + spark particles (one Points object, 120 slots).
// M2.0: surface-aware — metal (equipment props) throws more, brighter sparks; concrete (walls, floor) fewer sparks and
// a grey dust puff (own Points, 60 slots, normal blending). Blood splats on the floor (kills / headshots, ring of 24).
// Every pool has a fixed size: a KRAIT volley (8 pellets) never allocates and never exceeds the limits.
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
  const stats = { decals: 0, sparks: 0, dust: 0, metal: 0, concrete: 0, blood: 0 };

  // ---- concrete dust (grey, slow, fades) ----
  const DUST = 60, dpos = new Float32Array(DUST * 3), dvel = new Float32Array(DUST * 3), dlife = new Float32Array(DUST), dcol = new Float32Array(DUST * 3);
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dgeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);
  for (let i = 0; i < DUST; i++) dpos[i * 3 + 1] = -100;
  let dNext = 0, activeDust = 0;
  // ---- blood splats on the floor (procedural texture, ring buffer) ----
  const BLOOD = 24;
  const bc = document.createElement('canvas'); bc.width = bc.height = 64; const bg = bc.getContext('2d');
  { let sd = 5; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 18, rad = 4 + r() * 9; const gr = bg.createRadialGradient(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 0, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rad);
      gr.addColorStop(0, 'rgba(70,6,8,0.95)'); gr.addColorStop(0.7, 'rgba(48,4,6,0.7)'); gr.addColorStop(1, 'rgba(30,2,4,0)'); bg.fillStyle = gr; bg.beginPath(); bg.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rad, 0, 6.28); bg.fill(); } }
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const blood = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: btex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), BLOOD);
  blood.frustumCulled = false; blood.count = 0; scene.add(blood);
  let bNext = 0, bPlaced = 0;
  /** A splat on the floor at sim (x, y) — size 0.4…1.2 (kills larger than headshots). */
  function bloodSplat(x, y, size = 1) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2); const s = size * (0.75 + Math.random() * 0.4); sc.set(s, 1, s);
    m.compose(p.set(x * S, 0.006 + bNext * 0.0002, y * S), q, sc); blood.setMatrixAt(bNext, m); blood.instanceMatrix.needsUpdate = true;
    bNext = (bNext + 1) % BLOOD; bPlaced = Math.min(BLOOD, bPlaced + 1); blood.count = bPlaced; stats.blood++;
  }

  function impact({ point, normal, kind, surface = 'concrete' }) {
    p.set(point.x * S, point.z * S, point.y * S);
    n.set(normal.x, normal.z, normal.y).normalize();
    q.setFromUnitVectors(zAxis, n);
    const s = 0.8 + Math.random() * 0.5; sc.set(s, s, s);
    m.compose(p.clone().addScaledVector(n, 0.004), q, sc);
    decals.setMatrixAt(next, m); decals.instanceMatrix.needsUpdate = true;
    next = (next + 1) % DECALS; placed = Math.min(DECALS, placed + 1); decals.count = placed; stats.decals++;
    const metal = surface === 'metal'; stats[metal ? 'metal' : 'concrete']++;
    const nSp = metal ? 10 : kind === 'wall' ? 4 : 3;
    for (let i = 0; i < nSp; i++) {
      const k = sNext; sNext = (sNext + 1) % SPARKS;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      const sp = 1.5 + Math.random() * 2.5;
      vel[k * 3] = (n.x + (Math.random() - 0.5) * 1.2) * sp; vel[k * 3 + 1] = (n.y + Math.random() * 0.8) * sp; vel[k * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.2) * sp;
      life[k] = 0.18 + Math.random() * 0.2;
      col[k * 3] = 1; col[k * 3 + 1] = metal ? 0.85 + Math.random() * 0.15 : 0.75 + Math.random() * 0.2; col[k * 3 + 2] = metal ? 0.6 : 0.4;
      if (metal) life[k] *= 1.3;
    }
    stats.sparks += nSp;
    if (!metal) for (let i = 0; i < 4; i++) { // concrete: a small grey puff drifting off the surface
      const k = dNext; dNext = (dNext + 1) % DUST;
      dpos[k * 3] = p.x; dpos[k * 3 + 1] = p.y; dpos[k * 3 + 2] = p.z;
      const sp = 0.25 + Math.random() * 0.45;
      dvel[k * 3] = (n.x + (Math.random() - 0.5) * 0.8) * sp; dvel[k * 3 + 1] = (n.y + 0.3 + Math.random() * 0.4) * sp; dvel[k * 3 + 2] = (n.z + (Math.random() - 0.5) * 0.8) * sp;
      dlife[k] = 0.6 + Math.random() * 0.4; const g = 0.42 + Math.random() * 0.12; dcol[k * 3] = g; dcol[k * 3 + 1] = g * 0.97; dcol[k * 3 + 2] = g * 0.92;
      stats.dust++;
    }
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
    activeDust = 0;
    for (let i = 0; i < DUST; i++) {
      if (dlife[i] <= 0) continue;
      dlife[i] -= dt; if (dlife[i] <= 0) { dpos[i * 3 + 1] = -100; continue; }
      activeDust++;
      dvel[i * 3] *= 0.96; dvel[i * 3 + 1] = dvel[i * 3 + 1] * 0.96 - 0.15 * dt; dvel[i * 3 + 2] *= 0.96;
      dpos[i * 3] += dvel[i * 3] * dt; dpos[i * 3 + 1] += dvel[i * 3 + 1] * dt; dpos[i * 3 + 2] += dvel[i * 3 + 2] * dt;
      const f = Math.min(1, dlife[i] * 2); dcol[i * 3] *= 0.995; dcol[i * 3 + 1] *= 0.995; dcol[i * 3 + 2] *= 0.995;
      if (f < 1) { dcol[i * 3] = Math.min(dcol[i * 3], 0.5 * f); dcol[i * 3 + 1] = Math.min(dcol[i * 3 + 1], 0.5 * f); dcol[i * 3 + 2] = Math.min(dcol[i * 3 + 2], 0.48 * f); }
    }
    dgeo.attributes.position.needsUpdate = true; dgeo.attributes.color.needsUpdate = true;
  }
  return { impact, update, bloodSplat, stats, limits: { decals: DECALS, sparks: SPARKS, dust: DUST, blood: BLOOD }, get activeSparks() { return activeSparks; }, get activeDust() { return activeDust; }, get decalCount() { return decals.count; }, get bloodCount() { return blood.count; } };
}
