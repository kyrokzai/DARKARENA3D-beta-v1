// M3.3 TOPDOWN drops — DATA + pure logic (no DOM / three.js). A killed infected may leave a medkit or an ammo box at
// the spot where it fell; the player collects it by walking over it. Only active when the Game was created with
// opts.drops (top-down); the FPS game never is. The renderer only reads `game.pickups.list`; the HUD learns about a
// collected pickup from GameState ('pickup' event, rule 8).
// Units: cells (1 cell = 2 m), seconds.
import { canStand } from './collision.js';

export const DROPS = Object.freeze({
  // chance of a medkit / of an ammo box per kill (at most one item); `always` = one of the two is guaranteed
  walker: Object.freeze({ medkit: 0.08, ammo: 0.16 }),
  mutant: Object.freeze({ medkit: 0.16, ammo: 0.24 }),
  brute: Object.freeze({ medkit: 0.5, ammo: 0.5, always: true }),
  hollow: Object.freeze({ medkit: 0.08, ammo: 0.16 }),
});
export const PICKUP = Object.freeze({
  radius: 0.55,      // cells (1.1 m) between the player's centre and the item to collect it
  ttl: 15,           // s on the floor before it disappears
  blink: 4,          // s before disappearing: the renderer blinks it
  max: 8,            // items on the floor at once (the oldest one goes when a new one would exceed it)
  clearance: 0.2,    // cells of free floor needed around the drop point
  medkit: Object.freeze({ heal: 25 }),   // HP; only collected when the player is hurt
  ammo: Object.freeze({ mags: 1 }),      // + this many magazines' worth of reserve for EVERY weapon, capped at its full reserve;
                                          // only collected when at least one weapon is below its full reserve
});

export class Pickups {
  constructor(game, { rng = Math.random, drops = DROPS, rules = PICKUP } = {}) {
    this.game = game; this.rng = rng; this.drops = drops; this.rules = rules;
    this.list = []; this.nextId = 1;
  }
  reset() { for (const it of this.list) this.game.emit('pickupRemoved', { id: it.id, why: 'reset' }); this.list.length = 0; }
  /** An infected died at (x, y): roll its drop table. Returns the new item or null. */
  onKill(type, x, y) {
    const t = this.drops[type] || this.drops.hollow; if (!t) return null;
    const r = this.rng();
    let kind = null;
    if (t.always) kind = r < t.medkit / (t.medkit + t.ammo) ? 'medkit' : 'ammo';
    else if (r < t.medkit) kind = 'medkit';
    else if (r < t.medkit + t.ammo) kind = 'ammo';
    if (!kind) return null;
    const pt = this.dropPoint(x, y); if (!pt) return null;
    if (this.list.length >= this.rules.max) this.remove(0, 'overflow');
    const it = { id: 'pk-' + this.nextId++, kind, x: pt.x, y: pt.y, t: 0, ttl: this.rules.ttl };
    this.list.push(it);
    this.game.emit('pickupSpawn', { id: it.id, kind, x: it.x, y: it.y });
    return it;
  }
  /** The kill spot, or the nearest free spot around it (a body can fall against a wall). */
  dropPoint(x, y) {
    const w = this.game.world, c = this.rules.clearance;
    if (canStand(w, x, y, c)) return { x, y };
    for (const d of [0.25, 0.5, 0.75]) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (canStand(w, px, py, c)) return { x: px, y: py };
    }
    return null;
  }
  remove(i, why) { const it = this.list[i]; this.list.splice(i, 1); this.game.emit('pickupRemoved', { id: it.id, why }); }
  /** Fixed step: age the items, collect what the (living) player stands on. */
  step(dt) {
    const g = this.game, p = g.player, R = this.rules;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      if (it.t >= it.ttl) { this.remove(i, 'expired'); continue; }
      if (p.dead || Math.hypot(it.x - p.x, it.y - p.y) > R.radius) continue;
      if (this.collect(it)) this.remove(i, 'taken');
    }
  }
  /** Apply the item to the player. false = not needed right now (stays on the floor). */
  collect(it) {
    const g = this.game, st = g.state;
    if (it.kind === 'medkit') {
      const before = st.health.hp; if (before >= st.health.max) return false;
      st.heal(this.rules.medkit.heal);
      st.pickupTaken('medkit', st.health.hp - before);
      g.emit('pickupTaken', { id: it.id, kind: it.kind, x: it.x, y: it.y, amount: st.health.hp - before });
      return true;
    }
    if (it.kind === 'ammo') {
      const added = g.arsenal ? g.arsenal.addAmmo(this.rules.ammo.mags) : 0;
      if (added <= 0) return false;
      st.pickupTaken('ammo', added);
      g.emit('pickupTaken', { id: it.id, kind: it.kind, x: it.x, y: it.y, amount: added });
      return true;
    }
    return false;
  }
}
