// M3.0 TOPDOWN — renders the infected with the owner-supplied rigged models (walker / brute / mutant).
// Reads the simulation (state, speed, facing, attack, death); never writes it. Hit zones / damage stay in the sim
// (hollow-rig.js) — the clips are only the look. Instances are pooled per type (SkeletonUtils clones).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CELL_SIZE as S } from '../config.js';
import { createBlob } from './models.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const MODEL_OF = { walker: 'walker', brute: 'brute', mutant: 'mutant', hollow: 'walker' };
const DEATH_START = { walker: 2.3, brute: 2.3, mutant: 0 }; // humanoid clips stumble first; start near the fall
const BLOB = { walker: 0.55, brute: 0.75, mutant: 0.9 };
const MAX_PARTICLES = 200;

export function createGlbInfectedView(scene, models) {
  const pools = {}, active = new Map();
  const stats = { created: 0, active: 0, clips: {} };

  function acquire(type) {
    const pool = pools[type] || (pools[type] = []);
    let s = pool.pop();
    if (!s) {
      const src = models[type], root = new THREE.Group(), model = cloneSkinned(src.scene);
      root.add(model, createBlob(BLOB[type] || 0.6)); scene.add(root);
      const mixer = new THREE.AnimationMixer(model), act = {};
      for (const [n, c] of Object.entries(src.clips)) act[n] = mixer.clipAction(c);
      for (const n of ['Attack', 'Hit', 'Death']) if (act[n]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
      s = { type, root, mixer, act, cur: null, curName: '', hitT: 0, lastState: '' };
      stats.created++;
    }
    s.root.visible = true; s.hitT = 0; s.lastState = ''; s.cur = null; s.curName = ''; s.mixer.stopAllAction();
    return s;
  }
  function release(s) { s.root.visible = false; s.mixer.stopAllAction(); pools[s.type].push(s); }
  function play(s, name, fade, restart = false) {
    const a = s.act[name] || s.act.Walk;
    if (s.cur === a && !restart) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(1);
    if (s.cur && s.cur !== a) a.crossFadeFrom(s.cur, fade, false);
    a.play(); s.cur = a; s.curName = name; return a;
  }

  // ---- blood mist / dust (one Points object, fixed buffer) ----
  const pos = new Float32Array(MAX_PARTICLES * 3), col = new Float32Array(MAX_PARTICLES * 3), vel = new Float32Array(MAX_PARTICLES * 3), life = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pos[i * 3 + 1] = -100;
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  let pNext = 0, pAlive = 0;
  function burst(x, y, z, dx, dz, n, dust) {
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % MAX_PARTICLES;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const sp = dust ? 0.7 : 1.8 + Math.random() * 1.8;
      vel[k * 3] = dx * sp + (Math.random() - 0.5) * 1.6; vel[k * 3 + 1] = Math.random() * (dust ? 0.6 : 1.4); vel[k * 3 + 2] = dz * sp + (Math.random() - 0.5) * 1.6;
      life[k] = dust ? 0.9 : 0.4 + Math.random() * 0.3;
      if (dust) { col[k * 3] = 0.25; col[k * 3 + 1] = 0.22; col[k * 3 + 2] = 0.2; } else { const v = 0.3 + Math.random() * 0.25; col[k * 3] = v; col[k * 3 + 1] = 0.02; col[k * 3 + 2] = 0.03; }
    }
    pAlive = MAX_PARTICLES;
  }
  function updateParticles(dt) {
    if (!pAlive || !dt) return;
    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; if (life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      alive++; vel[i * 3 + 1] -= 7 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    pAlive = alive; pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
  }

  return {
    stats,
    update(enemies, dt, alpha) {
      for (const e of enemies) {
        let s = active.get(e);
        if (!s) { s = acquire(MODEL_OF[e.def.id] || 'walker'); active.set(e, s); }
        const x = e.prevX + (e.x - e.prevX) * alpha, y = e.prevY + (e.y - e.prevY) * alpha;
        const f = e.prevFacing + Math.atan2(Math.sin(e.facing - e.prevFacing), Math.cos(e.facing - e.prevFacing)) * alpha;
        s.root.position.set(x * S, 0, y * S); s.root.rotation.y = Math.PI / 2 - f;
        const st = e.state, def = e.def, sp = (e.speed || 0) * S;
        s.hitT = Math.max(0, s.hitT - dt);
        if (st === 'DEAD') {
          if (s.lastState !== 'DEAD') { const a = play(s, 'Death', 0.12, true); a.time = DEATH_START[s.type] || 0; }
        } else if (st === 'ATTACK') {
          if (s.lastState !== 'ATTACK') { const a = play(s, 'Attack', 0.08, true); a.timeScale = a.getClip().duration / def.attackDuration; }
        } else if (s.hitT > 0 && s.act.Hit) {
          if (s.curName !== 'Hit') play(s, 'Hit', 0.05, true);
        } else if (sp > 0.25 && st !== 'IDLE' && st !== 'ALERT' && st !== 'RECOVER') {
          const run = s.act.Run && sp > def.walkSpeed * 1.7;
          const a = play(s, run ? 'Run' : 'Walk', 0.2);
          a.timeScale = run ? clamp(sp / (def.runSpeed * 0.8), 0.7, 1.7) : clamp(sp / Math.max(0.6, def.walkSpeed * (s.type === 'mutant' ? 1.2 : 1)), 0.6, s.type === 'mutant' ? 2.6 : 1.9);
        } else play(s, 'Idle', 0.25);
        s.lastState = st;
        s.mixer.update(dt);
        stats.clips[e.id] = s.curName;
      }
      if (active.size !== enemies.length) for (const [e, s] of active) if (!enemies.includes(e)) { release(s); active.delete(e); delete stats.clips[e.id]; }
      stats.active = active.size;
      updateParticles(dt);
    },
    /** Shot hit an infected: short hit clip + blood mist (sim point in cells, z = height in cells). */
    onHit(e, point, dir) {
      const s = active.get(e); if (s && e.state !== 'DEAD' && e.state !== 'ATTACK') s.hitT = 0.32;
      burst(point.x * S, point.z * S, point.y * S, dir.x, dir.y, 8, false);
    },
    onDeath(e) { burst(e.x * S, 0.2, e.y * S, 0, 0, 16, true); },
    groupOf(e) { const s = active.get(e); return s ? s.root : null; },
  };
}
