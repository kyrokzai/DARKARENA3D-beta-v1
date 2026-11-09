// Wave director (pure logic). Spawns the infected of a wave from WAVES (data), one by one, at valid points:
// on free floor, away from the player, never in front of his face. Writes wave progress into GameState.
import { canStand } from '../collision.js';
import { WAVES, SPAWN_RULES } from './wave-defs.js';

const M = 0.5; // cells per metre

export class WaveDirector {
  constructor(game, { waves = WAVES, rules = SPAWN_RULES, rng = Math.random } = {}) {
    this.game = game; this.waves = waves; this.rules = rules; this.rng = rng;
    this.reset();
  }
  reset() {
    this.index = -1; this.phase = 'idle'; // idle | countdown | spawning | active | cleared | done
    this.t = 0; this.queue = []; this.spawned = 0; this.lastSpawns = [];
  }
  get wave() { return this.waves[this.index] || null; }

  /** Start wave n (1-based). */
  start(n = 1) {
    this.index = n - 1;
    const w = this.wave; if (!w) { this.phase = 'done'; return; }
    this.queue = []; for (const g of w.enemies) for (let i = 0; i < g.count; i++) this.queue.push(g.type);
    this.spawned = 0; this.lastSpawns = []; this.t = w.startDelay; this.phase = 'countdown';
    this.game.state.setWave({ number: w.number, total: this.queue.length, remaining: this.queue.length, phase: 'idle' });
  }

  step(dt) {
    const w = this.wave; if (!w) return;
    if (this.phase === 'countdown' || this.phase === 'spawning') {
      this.t -= dt;
      if (this.t <= 0 && this.queue.length) {
        const pt = this.pickSpawn();
        if (pt) {
          this.game.spawnInfected(this.queue.shift(), pt.x, pt.y, pt.facing);
          this.spawned++; this.lastSpawns.push(pt);
          if (this.phase === 'countdown') { this.phase = 'spawning'; this.game.state.setWave({ phase: 'active' }); }
          this.t = w.spawnInterval;
        } else this.t = 0.25; // no valid point right now (player stands in the way) — try again shortly
      }
      if (!this.queue.length && this.phase === 'spawning') this.phase = 'active';
    }
    if ((this.phase === 'active' || this.phase === 'spawning') && this.game.state.wave.remaining === 0 && !this.queue.length) {
      this.phase = 'cleared'; // GameState already switched to 'cleared' (emits waveCleared once)
    }
  }

  /** Candidate cell centres that pass every rule; picks one at random. */
  pickSpawn(relax = 1) {
    const g = this.game, world = g.world, p = g.player, R = this.rules;
    const minD = R.minPlayerDist * M * relax, faceD = R.faceDist * M, cone = Math.cos(R.faceConeDeg * Math.PI / 180);
    const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), clr = R.clearance * M;
    const ok = [];
    for (let iy = 0; iy < world.height; iy++) for (let ix = 0; ix < world.width; ix++) {
      const x = ix + 0.5, y = iy + 0.5;
      if (!this.validSpawn(x, y, clr)) continue;
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d < minD) continue;
      if (d < faceD && (dx * fx + dy * fy) / d > cone) continue; // in the player's face
      if (this.lastSpawns.some(s => Math.hypot(s.x - x, s.y - y) < R.minSpacing * M)) continue;
      if (g.enemies.some(e => e.alive && Math.hypot(e.x - x, e.y - y) < R.minSpacing * M)) continue;
      ok.push({ x, y });
    }
    if (!ok.length) return relax > 0.5 ? this.pickSpawn(relax * 0.75) : null;
    const pt = ok[Math.floor(this.rng() * ok.length) % ok.length];
    pt.facing = Math.atan2(p.y - pt.y, p.x - pt.x);
    return pt;
  }
  validSpawn(x, y, clr = this.rules.clearance * M) { return canStand(this.game.world, x, y, clr); }
}
