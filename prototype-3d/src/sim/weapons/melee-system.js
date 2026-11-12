// Generic melee (M1.9): a short strike with the current weapon (RAVEN: rifle butt). Pure logic, fixed-step.
// Every number comes from the weapon definition's `melee` block (defs.js). State the HUD / viewmodel need lives in
// GameState.melee (written here, only read by the renderer and UI).
//
// Rules: a separate action (input 'melee'); never in the same moment as a shot (the weapon system does not fire
// while a strike is running, and a strike cannot start during a reload); one strike per press, then a cooldown
// (presses during the strike or the cooldown are ignored → no spamming); the blow lands once, at `hitAt`, on the
// closest living infected inside a short frontal arc with line of sight.
// Events: 'meleeStart' {}, 'meleeHit' {id, killed, point, damage, variant}, 'meleeMiss' {}.
import { lineOfSight } from '../nav/grid-nav.js';

const M = 0.5; // cells per metre
const EYE_Z = 1.6 * M; // cells, approximate height of a blow at the chest (for the effect point only)

export class MeleeSystem {
  constructor(game, def) {
    this.game = game;
    this.lastPress = 0; this.resync = true;
    this.equip(def);
  }
  equip(def) {
    this.def = def && def.melee ? def.melee : null;
    this.t = -1;             // < 0: no strike running; else seconds since it started
    this.cooldown = 0;       // seconds until the next strike may start
    this.dealt = false;
    this.strikes = 0; this.hits = 0;
    this.publish();
  }
  get busy() { return this.t >= 0; }
  get ready() { return !!this.def && this.t < 0 && this.cooldown <= 0; }
  /** Pause / menu / death: drop a press made just before (no strike when play resumes) — a running strike finishes. */
  release() { this.resync = true; }

  step(input, dt) {
    const d = this.def; if (!d) return;
    const pr = input.presses ? input.presses.melee || 0 : 0;
    if (this.resync) { this.lastPress = pr; this.resync = false; }
    const pressed = pr !== this.lastPress; this.lastPress = pr;
    const w = this.game.weapon, st = this.game.state;
    if (this.t < 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (pressed && this.cooldown <= 0 && !(w && (w.reloading || st.weapon.reloading))) this.start();
    } else {
      this.t += dt;
      if (!this.dealt && this.t >= d.duration * d.hitAt) { this.dealt = true; this.resolve(); }
      if (this.t >= d.duration) { this.t = -1; this.cooldown = d.cooldown; }
    }
    this.publish();
  }

  start() {
    this.t = 0; this.dealt = false; this.strikes++;
    if (this.game.weapon) this.game.weapon.interruptForMelee();
    this.game.emit('meleeStart', { strike: this.strikes });
  }

  /** The blow: closest living infected whose surface is within range, inside the arc, visible. */
  resolve() {
    const d = this.def, g = this.game, p = g.player;
    const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), cosHalf = Math.cos(d.arcDeg * Math.PI / 360);
    let best = null, bestD = Infinity;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy);
      const surface = dist - e.k.r;                          // cells
      if (surface > d.range * M) continue;
      const dot = dist > 1e-6 ? (dx * fx + dy * fy) / dist : 1;
      if (dot < cosHalf) continue;
      if (!lineOfSight(g.world, p.x, p.y, e.x, e.y)) continue;
      if (surface < bestD) { bestD = surface; best = e; }
    }
    if (!best) { g.emit('meleeMiss', {}); return; }
    const dx = best.x - p.x, dy = best.y - p.y, l = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / l, y: dy / l, z: 0 };
    const r = best.applyMelee(d.damage, dir, d);
    if (r.killed && g.onEntityKilled) g.onEntityKilled(best);
    this.hits++;
    g.state.registerHit({ kill: r.killed, headshot: false, melee: true });
    const hb = best.hitboxes()[1]; // chest
    const point = { x: hb.cx - dir.x * hb.r, y: hb.cy - dir.y * hb.r, z: hb.cz || EYE_Z };
    g.emit('meleeHit', { id: best.id, killed: r.killed, point, dir, damage: d.damage, variant: best.variant });
  }

  publish() {
    const d = this.def;
    this.game.state.setMelee(d ? {
      available: true, active: this.t >= 0, progress: this.t >= 0 ? Math.min(1, this.t / d.duration) : 0,
      cooldown: this.t >= 0 ? 1 : d.cooldown > 0 ? this.cooldown / d.cooldown : 0, ready: this.ready,
    } : null);
  }
}
