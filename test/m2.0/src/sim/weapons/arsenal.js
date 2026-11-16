// M2.0 arsenal: the three weapons the player carries (defs.js LOADOUT) and switching between them. Pure logic.
// The active weapon is driven by the generic WeaponSystem; the arsenal only keeps the ammo of the others and changes
// which definition is equipped: holster (old weapon's switch.holster) → swap → draw (new weapon's switch.draw).
// During a switch nothing fires, aims, reloads or strikes. A reload in progress is cancelled by a switch: a magazine
// reload moves no rounds (they only move when it completes), shells already loaded stay loaded → never lost or doubled.
// Input: input.presses.weapon (counter) + input.weaponRequest (slot index 0..2, 'next' or 'prev').
// Events: 'weaponSwitch' {from, to}, 'weaponSwap' {id}, 'weaponReady' {id}. HUD state: GameState.arsenal.
import { WEAPONS, LOADOUT } from './defs.js';

export class Arsenal {
  constructor(game, ids = LOADOUT, start = 0) {
    this.game = game; this.ids = [...ids]; this.start = start;
    this.lastPress = 0; this.resync = false; // counters start at 0: only a pause (release) drops a pending press
    this.switches = 0;
    this.reset(false);
  }
  get switching() { return this.phase !== 'ready'; }
  get activeId() { return this.ids[this.active]; }
  def(i) { return WEAPONS[this.ids[i]]; }
  /** Full loadout, starting weapon in the hands (restart). equipNow = re-equip the weapon system. */
  reset(equipNow = true) {
    this.ammo = this.ids.map(id => ({ mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve }));
    this.active = this.start; this.phase = 'ready'; this.t = 0; this.target = this.start; this.pending = null;
    if (equipNow) { this.game.weapon.equip(this.def(this.active)); if (this.game.melee) this.game.melee.equip(this.def(this.active)); }
    this.publish();
  }
  /** Pause / menu / death: a press made just before is dropped. */
  release() { this.resync = true; }
  /** Between waves: every weapon's reserve back to its full value (magazines untouched). */
  resupply() {
    this.ids.forEach((id, i) => { if (i !== this.active) this.ammo[i].reserve = WEAPONS[id].reserve; });
    const st = this.game.state; st.setAmmo(st.weapon.mag, this.def(this.active).reserve);
    this.publish();
  }

  resolve(req) {
    const n = this.ids.length, from = this.pending ?? (this.phase === 'holster' ? this.target : this.active);
    if (req === 'next') return (from + 1) % n;
    if (req === 'prev') return (from + n - 1) % n;
    return Number.isInteger(req) && req >= 0 && req < n ? req : null;
  }

  step(input, dt) {
    const pr = input.presses ? input.presses.weapon || 0 : 0;
    if (this.resync) { this.lastPress = pr; this.resync = false; }
    if (pr !== this.lastPress) {
      this.lastPress = pr;
      const req = this.resolve(input.weaponRequest);
      if (req !== null) {
        if (this.phase === 'holster' && req === this.active) { // changed my mind: bring the same weapon back up from where it is
          const back = 1 - Math.min(1, this.t / this.def(this.active).switch.holster);
          this.phase = 'draw'; this.target = req; this.pending = null; this.t = this.def(this.active).switch.draw * back;
        } else if (this.phase === 'holster') { this.target = req; this.pending = null; } // still putting the old one away: just retarget
        else if (this.phase === 'draw') this.pending = req === this.target ? null : req; // finish bringing it up first
        else this.pending = req === this.active ? null : req;
      }
    }
    const melee = this.game.melee && this.game.melee.busy;
    if (this.phase === 'holster') {
      this.t += dt;
      if (this.t >= this.def(this.active).switch.holster) this.swap();
    } else if (this.phase === 'draw') {
      this.t += dt;
      if (this.t >= this.def(this.active).switch.draw) { this.phase = 'ready'; this.t = 0; this.game.emit('weaponReady', { id: this.activeId }); }
    }
    // a queued choice starts in the SAME tick the previous draw ends (review fix: otherwise the intermediate weapon could
    // fire / reload / strike for one tick before being put away)
    if (this.phase === 'ready' && this.pending !== null && !melee) { const to = this.pending; this.pending = null; if (to !== this.active) this.begin(to); }
    this.publish();
  }

  begin(to) {
    const w = this.game.weapon;
    w.cancelReload(); w.release();
    this.phase = 'holster'; this.t = 0; this.target = to; this.switches++;
    this.game.emit('weaponSwitch', { from: this.activeId, to: this.ids[to] });
  }
  swap() {
    const st = this.game.state.weapon;
    this.ammo[this.active] = { mag: st.mag, reserve: st.reserve };   // keep what is left in the one being put away
    this.active = this.target;
    const def = this.def(this.active);
    this.game.weapon.equip(def, this.ammo[this.active], { keepRecoil: true }); // the camera keeps recovering the climb
    if (this.game.melee) this.game.melee.equip(def);
    this.phase = 'draw'; this.t = 0;
    this.game.emit('weaponSwap', { id: def.id });
  }

  publish() { // every tick, allocation-free: the slot objects are reused, 'arsenal' is emitted only on a change
    const st = this.game.state, w = st.weapon;
    if (!this.slots || this.slots.length !== this.ids.length) this.slots = this.ids.map(id => ({ id, short: WEAPONS[id].short, mag: 0, reserve: 0 }));
    let changed = false;
    this.ids.forEach((id, i) => { const s = this.slots[i], mag = i === this.active ? w.mag : this.ammo[i].mag, res = i === this.active ? w.reserve : this.ammo[i].reserve;
      if (s.id !== id) { s.id = id; s.short = WEAPONS[id].short; changed = true; }
      if (s.mag !== mag || s.reserve !== res) { s.mag = mag; s.reserve = res; changed = true; } });
    const dur = this.phase === 'holster' ? this.def(this.active).switch.holster : this.phase === 'draw' ? this.def(this.active).switch.draw : 1;
    st.setArsenal(this.active, this.phase, this.phase === 'ready' ? 1 : Math.min(1, this.t / dur), this.slots, changed);
  }
  /** Total rounds of one weapon (mag + reserve) — tests: nothing is lost or created by switching. */
  total(i) { const w = this.game.state.weapon; return i === this.active ? w.mag + w.reserve : this.ammo[i].mag + this.ammo[i].reserve; }
}
