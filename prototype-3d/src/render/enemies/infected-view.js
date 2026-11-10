// Renders the infected from sim state. Instances are pooled (created once, reused across waves and restarts),
// geometry/materials are shared, and the hit/death effects reuse one fixed particle buffer.
// Reads the simulation; never writes it.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../../config.js';
import { createHollowInstance } from './hollow-model.js';
import { animateHollow, createAnimState } from './hollow-anim.js';

const MAX_PARTICLES = 160;

export function createInfectedView(scene) {
  const pool = [], active = new Map(); // id → slot
  let seed = 0;
  const stats = { instances: 0, created: 0, active: 0, bursts: 0, headBursts: 0, bodyBursts: 0 };

  function acquire() {
    let slot = pool.pop();
    if (!slot) { slot = { inst: createHollowInstance(), anim: null }; stats.created++; scene.add(slot.inst.group); }
    slot.anim = createAnimState(++seed * 0.37);
    slot.inst.group.visible = true;
    return slot;
  }
  function release(slot) { slot.inst.group.visible = false; pool.push(slot); }

  // ---- particles: dark blood mist on hits, dust + blood on deaths (one Points object, fixed size) ----
  const pos = new Float32Array(MAX_PARTICLES * 3), col = new Float32Array(MAX_PARTICLES * 3), vel = new Float32Array(MAX_PARTICLES * 3), life = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pos[i * 3 + 1] = -100;
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  let pNext = 0, pActive = 0;
  function burst(x, y, z, dx, dy, dz, n, kind) {
    stats.bursts++;
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % MAX_PARTICLES;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const sp = kind === 'dust' ? 0.6 : 1.6 + Math.random() * 1.6;
      vel[k * 3] = dx * sp + (Math.random() - 0.5) * 1.4; vel[k * 3 + 1] = dy * sp + Math.random() * (kind === 'dust' ? 0.5 : 1.2); vel[k * 3 + 2] = dz * sp + (Math.random() - 0.5) * 1.4;
      life[k] = kind === 'dust' ? 0.9 : 0.45 + Math.random() * 0.3;
      if (kind === 'dust') { col[k * 3] = 0.22; col[k * 3 + 1] = 0.2; col[k * 3 + 2] = 0.18; }
      else if (kind === 'head' && i % 3 === 0) { col[k * 3] = 0.62; col[k * 3 + 1] = 0.58; col[k * 3 + 2] = 0.5; life[k] *= 1.3; vel[k * 3 + 1] += 1.2; } // pale chips: a headshot reads differently
      else { const v = 0.25 + Math.random() * 0.2; col[k * 3] = v; col[k * 3 + 1] = 0.02; col[k * 3 + 2] = 0.03; }
    }
    pActive = MAX_PARTICLES;
  }
  function updateParticles(dt) {
    if (!pActive) return;
    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      alive++;
      vel[i * 3 + 1] -= 6 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.01, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    pActive = alive;
    pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
  }

  return {
    stats,
    /** enemies = game.enemies (sim). alpha = render interpolation. */
    update(enemies, dt, alpha = 1) {
      for (const e of enemies) {
        let slot = active.get(e);
        if (!slot) { slot = acquire(); active.set(e, slot); }
        const g = slot.inst.group;
        const x = e.prevX + (e.x - e.prevX) * alpha, y = e.prevY + (e.y - e.prevY) * alpha;
        const f = e.prevFacing + Math.atan2(Math.sin(e.facing - e.prevFacing), Math.cos(e.facing - e.prevFacing)) * alpha;
        g.position.set(x * S, 0, y * S);
        g.rotation.y = Math.PI / 2 - f; // model faces +Z; sim facing f points along (cos f, sin f) in (x, z)
        animateHollow(e, slot.inst.bones, slot.anim, dt, S);
      }
      // release instances whose infected were removed from the sim
      if (active.size !== enemies.length) {
        for (const [e, slot] of active) if (!enemies.includes(e)) { release(slot); active.delete(e); }
      }
      updateParticles(dt);
      stats.active = active.size; stats.instances = active.size + pool.length;
    },
    /** Hit effect at a sim point (cells), dir = shot direction (sim). */
    /** Local hit effect at the impact point: body = short dark spray along the shot; head = bigger burst with pale chips. */
    onHit(point, dir, zone) { stats[zone === 'head' ? 'headBursts' : 'bodyBursts']++; burst(point.x * S, point.z * S, point.y * S, dir.x, dir.z, dir.y, zone === 'head' ? 15 : 7, zone === 'head' ? 'head' : 'blood'); },
    onDeath(e) { burst(e.x * S, 0.15, e.y * S, 0, 0.2, 0, 14, 'dust'); },
    /** World position of a bone (for tests / screenshots). */
    boneWorld(e, name, out) { const slot = active.get(e); if (!slot) return null; slot.inst.group.updateMatrixWorld(true); return slot.inst.bones[name].getWorldPosition(out); },
    groupOf(e) { const s = active.get(e); return s ? s.inst.group : null; },
    get poolSize() { return pool.length; },
    dispose() { for (const s of [...pool, ...active.values()]) { scene.remove(s.inst.group); s.inst.dispose(); } pool.length = 0; active.clear(); pgeo.dispose(); points.material.dispose(); },
  };
}
