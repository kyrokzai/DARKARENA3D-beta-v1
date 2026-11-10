// Match / wave director (pure logic). Runs a sequence of waves from WAVES (data): infected of the current wave
// appear one by one while fewer than MATCH.maxActive are alive; the next wave starts after a short intermission
// only when every infected of the previous one is dead; after the last wave → victory.
// Spawn points: free floor, away from the player, never in front of his face, preferably out of his sight.
// Wave progress lives in GameState (the HUD reads only that).
import { canStand } from '../collision.js';
import { lineOfSight } from '../nav/grid-nav.js';
import { WAVES, MATCH, SPAWN_RULES } from './wave-defs.js';

const M = 0.5; // cells per metre

export class WaveDirector {
  constructor(game, { waves = WAVES, match = MATCH, rules = SPAWN_RULES, rng = Math.random } = {}) {
    this.game = game; this.waves = waves; this.match = match; this.rules = rules; this.rng = rng;
    this.cand = [];
    this.reset();
  }
  reset() {
    this.index = -1; this.phase = 'idle'; // idle | countdown | active | intermission | victory
    this.t = 0; this.queue = []; this.spawned = 0; this.lastCountdown = -1; this.maxAlive = 0;
  }
  get wave() { return this.waves[this.index] || null; }
  get aliveCount() { let n = 0; for (const e of this.game.enemies) if (e.alive) n++; return n; }

  /** Start the match at wave n (1-based). */
  start(n = 1) { this.maxAlive = 0; this.beginWave(n - 1, this.match.startDelay); }

  beginWave(index, delay) {
    this.index = index;
    const w = this.wave; if (!w) { this.phase = 'victory'; return; }
    this.queue.length = 0; for (const g of w.enemies) for (let i = 0; i < g.count; i++) this.queue.push(g.type);
    this.spawned = 0; this.t = delay; this.phase = 'countdown'; this.lastCountdown = -1;
    const st = this.game.state;
    if (index > 0) { // between waves: resupply
      if (this.match.resupplyReserve) st.setAmmo(st.weapon.mag, this.game.weapon.def.reserve);
      if (this.match.healBetweenWaves > 0 && st.health.hp > 0) st.heal(this.match.healBetweenWaves);
    }
    st.setWave({ number: w.number, of: this.waves.length, total: this.queue.length, remaining: this.queue.length, phase: 'idle', countdown: Math.ceil(delay) });
  }

  step(dt) {
    const w = this.wave, st = this.game.state; if (!w || this.phase === 'idle' || this.phase === 'victory') return;
    if (this.phase === 'intermission') {
      this.t -= dt;
      const c = Math.max(0, Math.ceil(this.t));
      if (c !== this.lastCountdown) { this.lastCountdown = c; st.setWave({ countdown: c, next: w.number + 1 }); }
      if (this.t <= 0) this.beginWave(this.index + 1, 0.8);
      return;
    }
    this.t -= dt;
    if (this.phase === 'countdown') {
      const c = Math.max(0, Math.ceil(this.t));
      if (c !== this.lastCountdown) { this.lastCountdown = c; st.setWave({ countdown: c }); }
      if (this.t <= 0) { this.phase = 'active'; st.setWave({ phase: 'active', countdown: 0 }); }
      else return;
    }
    // spawn while slots are free (alive infected < maxActive), one per spawnInterval
    const alive = this.aliveCount; if (alive > this.maxAlive) this.maxAlive = alive;
    if (this.queue.length && this.t <= 0 && alive < this.match.maxActive) {
      const pt = this.pickSpawn();
      if (pt) {
        const e = this.game.spawnInfected(this.queue.shift(), pt.x, pt.y, pt.facing, { hunter: true });
        // hunters start by running to where the player was when they appeared (not tracking him afterwards)
        e.lastSeen.x = this.game.player.x; e.lastSeen.y = this.game.player.y;
        e.startSearch(this.game.aiCtx, e.lastSeen.x, e.lastSeen.y);
        this.spawned++; this.t = this.match.spawnInterval;
        if (alive + 1 > this.maxAlive) this.maxAlive = alive + 1;
      } else this.t = 0.25; // no valid point right now — try again shortly
    }
    // wave finished: everyone spawned and killed (GameState.remaining counts kills, incl. those still waiting)
    if (!this.queue.length && st.wave.remaining === 0) {
      if (this.index + 1 < this.waves.length) {
        this.phase = 'intermission'; this.t = this.match.intermission; this.lastCountdown = -1;
        this.game.emit('waveIntermission', { finished: w.number, next: w.number + 1, time: this.match.intermission });
      } else {
        this.phase = 'victory'; st.setWave({ phase: 'victory', countdown: 0 });
        this.game.onVictory();
      }
    }
  }

  /** Candidate cell centres that pass every rule; prefers points the player cannot see. */
  pickSpawn(relax = 1) {
    const g = this.game, world = g.world, p = g.player, R = this.rules;
    const minD = R.minPlayerDist * M * relax, faceD = R.faceDist * M, cone = Math.cos(R.faceConeDeg * Math.PI / 180);
    const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), clr = R.clearance * M, sp = R.minSpacing * M;
    const ok = this.cand; ok.length = 0; let hidden = 0;
    for (let iy = 0; iy < world.height; iy++) for (let ix = 0; ix < world.width; ix++) {
      const x = ix + 0.5, y = iy + 0.5;
      if (!this.validSpawn(x, y, clr)) continue;
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d < minD) continue;
      if (d < faceD && (dx * fx + dy * fy) / d > cone) continue; // in the player's face
      let crowded = false;
      for (const e of g.enemies) if (e.alive && Math.hypot(e.x - x, e.y - y) < sp) { crowded = true; break; }
      if (crowded) continue;
      const hid = R.hiddenBonus && !lineOfSight(world, p.x, p.y, x, y);
      if (hid) hidden++;
      ok.push({ x, y, hid });
    }
    if (!ok.length) return relax > 0.5 ? this.pickSpawn(relax * 0.75) : null;
    // unseen points first (the infected "come from somewhere"), otherwise any valid one
    let pool = ok; if (hidden > 0) pool = ok.filter(c => c.hid);
    const pt = pool[Math.floor(this.rng() * pool.length) % pool.length];
    pt.facing = Math.atan2(p.y - pt.y, p.x - pt.x);
    return pt;
  }
  validSpawn(x, y, clr = this.rules.clearance * M) { return canStand(this.game.world, x, y, clr); }
}
