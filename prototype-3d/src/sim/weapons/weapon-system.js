// Generic weapon system (pure logic, fixed-step). Works for any definition in defs.js.
// Ammo / reload / hit confirmation live in GameState (the model the HUD reads) — no parallel combat state.
// Emits game events: 'fire' {ads, index} once per round, 'shot' {dir, aim, origin, hit, ads, spread} per pellet, 'impact' {point, normal, kind},
// 'targetHit' {id, zone, killed, point}, 'miss', 'dryFire', 'reloadStart', 'reloadEnd', 'adsChange' {ads}.
import { aimDir, spreadDir, resolveShot, EYE_Z } from '../hitscan.js';
import { PLAYER_SPEED, PITCH_LIMIT, CELL_SIZE } from '../../config.js';
// M2.0: also 'pump' fire mode (one shot per pull, the interval is the pump cycle), several pellets with a cone and a
// damage falloff (one hit confirmation per shot), shell-by-shell reload (def.reload.type 'shell') that a trigger pull
// interrupts after the current shell, and equipping with stored ammo (the Arsenal swaps weapons).
// Extra events: 'shellLoaded' {mag, reserve}, 'pumpStart' {}, reloadStart/End carry {kind}.

const D2R = Math.PI / 180;

export class WeaponSystem {
  constructor(game, def, { rng = Math.random } = {}) {
    this.game = game; this.rng = rng;
    this.equip(def);
  }

  equip(def, ammo = null) {
    this.def = def;
    this.shell = null;          // shell reload state {phase: 'start' | 'shell' | 'end', t, wasEmpty, stop, loaded, planned}
    this.pendingPull = false;   // a trigger pull that interrupted a shell reload: fires when ready if the trigger is still held
    this.sinceShot = 1e9;
    this.interval = 60 / def.rpm;
    this.cooldown = 0;          // seconds until the next round may fire (≤ 0 = ready)
    this.triggerDown = false;
    this.burstLeft = 0;
    this.shotsInSpray = 0;
    this.bloom = 0;             // deg
    this.recoilClimb = 0;       // rad of pitch added by recoil that will be (partly) recovered
    this.adsT = 0; this.adsWanted = false;
    this.reloadT = -1;          // < 0: not reloading (driven by this system)
    // press counters persist across equips (M2.0 fix: resetting them made an old press look new after a weapon change
    // → phantom reload / tap shot); they start at 0 like the input counters
    this.lastReloadPress = this.lastReloadPress ?? 0; this.lastFirePress = this.lastFirePress ?? 0;
    this.dryLatched = false;
    this.totalShots = 0;
    this.game.state.setWeapon(def, ammo);
  }

  get reloading() { return this.reloadT >= 0; }
  get ads() { return this.adsT; }

  /** Spread cone half-angle in degrees for the current state. */
  currentSpread() {
    const s = this.def.spread, a = this.def.ads, p = this.game.player;
    const speed = Math.min(1, Math.hypot(p.x - p.prevX, p.y - p.prevY) / (PLAYER_SPEED / 60));
    const move = s.move * speed * (1 - this.adsT * (1 - a.moveSpread));
    const raw = Math.min(s.max, s.base + move + this.bloom);
    return raw * (1 - this.adsT * (1 - a.spreadMult));
  }

  /** Stop firing and leave ADS (pause, menu, focus loss). */
  release() {
    this.triggerDown = false; this.burstLeft = 0; this.adsWanted = false; this.shotsInSpray = 0;
  }

  step(input, dt) {
    const st = this.game.state, w = st.weapon, def = this.def;

    // ---- reload request (edge counter, so a tap is never lost between ticks) ----
    if (input.presses.reload !== this.lastReloadPress) { this.lastReloadPress = input.presses.reload; this.startReload(); }

    // ---- ADS: held (PC right mouse) or toggled (touch button); not while reloading or striking (M1.9 melee) ----
    const meleeBusy = !!(this.game.melee && this.game.melee.busy) || !!(this.game.arsenal && this.game.arsenal.switching); // (M2.0: also while switching)
    const wantAds = (input.aimHeld || input.aimToggle) && !this.reloading && !meleeBusy;
    if (wantAds !== this.adsWanted) { this.adsWanted = wantAds; this.game.emit('adsChange', { ads: wantAds }); }
    const k = dt / def.ads.time;
    this.adsT = wantAds ? Math.min(1, this.adsT + k) : Math.max(0, this.adsT - k);

    // ---- reload progress ----
    if (this.reloading && this.shell) this.stepShell(dt);
    else if (this.reloading) {
      this.reloadT += dt;
      const p = this.reloadT / def.reloadTime;
      if (p >= 1) { this.reloadT = -1; st.completeReload(); this.game.emit('reloadEnd', {}); }
      else st.setReload(true, p);
    }

    // ---- trigger & fire timing (exact RPM independent of the tick rate) ----
    // A tap shorter than one sim tick is never lost: a new press counts as a pull even if already released.
    const tapped = input.presses.fire !== this.lastFirePress;
    this.lastFirePress = input.presses.fire;
    const trig = !!input.actions.fire;
    const pulled = (trig && !this.triggerDown) || tapped;
    let tapShot = tapped && !trig;
    this.triggerDown = trig;
    if (!trig) { this.dryLatched = false; this.shotsInSpray = 0; }
    if (pulled && def.fireMode === 'burst') this.burstLeft = def.burstCount;
    // shell reload: a trigger pull stops it after the current shell (decision M2.0); the shot follows if still held
    // (only if there will be something to fire — a shell already in the tube or the one going in now; otherwise an empty
    //  shotgun with the trigger hammered would stop every reload before the first shell: an endless dry-click loop)
    if (pulled && this.shell && this.shell.phase !== 'end' && (w.mag > 0 || this.shell.phase === 'shell')) { this.shell.stop = true; this.pendingPull = true; }
    if (!trig) this.pendingPull = false;
    const single = def.fireMode === 'semi' || def.fireMode === 'pump';
    let firedThisTick = false;
    const wantsShot = () => def.fireMode === 'auto' ? (trig || tapShot) : def.fireMode === 'burst' ? this.burstLeft > 0 : (pulled || (this.pendingPull && trig)) && !firedThisTick;
    while (this.cooldown <= 1e-6 && wantsShot()) { // epsilon: 6 × (1/60) must equal 0.1 s exactly
      if (this.reloading || w.reloading || meleeBusy) break; // never a shot in the same moment as a strike
      if (w.mag <= 0) {
        tapShot = false;
        if (!this.dryLatched) { this.dryLatched = true; this.game.emit('dryFire', {}); if (def.autoReloadOnEmpty) this.startReload(); }
        break;
      }
      this.fireOne();
      firedThisTick = true; tapShot = false;
      this.cooldown += this.interval;
      if (def.fireMode === 'burst') this.burstLeft--;
      if (single) { this.pendingPull = false; break; }
    }
    // Fire first, then count down: shots land exactly every `interval` at any tick rate. While the trigger is
    // held, less than one tick of "overshoot" carries over (keeps 600 RPM exact at 144 Hz); when released,
    // the weapon is simply ready — no banked shots.
    this.cooldown -= dt;
    this.cooldown = trig ? Math.max(this.cooldown, -dt) : Math.max(this.cooldown, 0);
    this.sinceShot = firedThisTick ? 0 : (this.sinceShot || 0) + dt;

    // ---- bloom & recoil recovery when not firing this tick ----
    if (!firedThisTick) {
      if (this.sinceShot > (def.spread.recoverDelay || 0)) this.bloom = Math.max(0, this.bloom - def.spread.recover * dt);
      if (!trig && this.recoilClimb > 0) {
        const r = Math.min(this.recoilClimb, def.recoil.recover * D2R * dt);
        this.recoilClimb -= r;
        this.game.look(0, -r);
      }
    }
    st.setAim({ spread: this.currentSpread(), ads: this.adsT });
    // action cycle for the view (pump of the shotgun, bolt of the rifles): 0 at the shot → 1 when ready again
    st.setCycle(Math.min(1, this.sinceShot / this.interval), this.shell ? this.shell.phase : null, this.shell ? this.shell.t : 0, this.shell ? this.shell.wasEmpty : false);
  }

  /** M2.0 shell-by-shell reload: open (start) → one shell per perShell → close (end; a pump stroke if it was empty). */
  stepShell(dt) {
    const s = this.shell, R = this.def.reload, st = this.game.state, w = st.weapon;
    s.t += dt; this.reloadT += dt;
    if (s.phase === 'start' && s.t >= R.start) { s.phase = s.stop ? 'end' : 'shell'; s.t = 0; }
    if (s.phase === 'shell' && s.t >= R.perShell) {
      st.setAmmo(w.mag + 1, w.reserve - 1); s.loaded++; s.t -= R.perShell; // keep the remainder: exactly perShell apart
      this.game.emit('shellLoaded', { mag: w.mag, reserve: w.reserve });
      if (s.stop || w.mag >= w.magSize || w.reserve <= 0) s.phase = 'end';
    }
    const endTime = s.wasEmpty ? R.endPump : R.end;
    if (s.phase === 'end' && s.t >= endTime) { this.finishShell(); return; }
    st.setReload(true, s.planned ? Math.min(1, (s.loaded + (s.phase === 'shell' ? s.t / R.perShell : 0)) / s.planned) : 1);
  }
  finishShell() {
    const loaded = this.shell.loaded;
    this.reloadT = -1; this.shell = null;
    this.game.state.setReload(false);
    this.game.emit('reloadEnd', { kind: 'shell', loaded });
  }
  /** Weapon change / restart: a reload in progress stops. Magazine: nothing is moved (rounds only move at the end).
   *  Shells: the shells already loaded stay loaded. */
  cancelReload() {
    if (this.reloadT < 0) return;
    this.reloadT = -1; this.shell = null; this.pendingPull = false;
    this.game.state.setReload(false);
    this.game.emit('reloadCancel', {});
  }

  /** M1.9: a melee strike starts — the spray ends (recoil recovery and bloom continue normally). */
  interruptForMelee() { this.burstLeft = 0; this.shotsInSpray = 0; }

  startReload() {
    const w = this.game.state.weapon;
    if ((this.game.melee && this.game.melee.busy) || (this.game.arsenal && this.game.arsenal.switching)) return false;
    if (this.reloading || w.reloading || w.mag >= w.magSize || w.reserve <= 0) return false;
    this.reloadT = 0; this.adsWanted = false;
    if (this.def.reload && this.def.reload.type === 'shell') this.shell = { phase: 'start', t: 0, wasEmpty: w.mag === 0, stop: false, loaded: 0, planned: Math.min(w.magSize - w.mag, w.reserve) };
    this.game.state.setReload(true, 0);
    this.game.emit('reloadStart', { time: this.def.reloadTime, kind: this.shell ? 'shell' : 'magazine', weapon: this.def.id });
    return true;
  }

  fireOne() {
    const g = this.game, st = g.state, def = this.def, p = g.player, w = st.weapon;
    // M2.0 fix: a round fired re-arms the empty-magazine click. Before, the latch was cleared only on trigger release, so
    // holding the trigger through an auto-reload and emptying the magazine again never started the second reload.
    this.dryLatched = false;
    st.setAmmo(w.mag - 1, w.reserve);
    const spread = this.currentSpread();
    const origin = { x: p.x, y: p.y, z: EYE_Z + (p.z || 0) }; // shots come from the eye, also mid-jump
    const base = aimDir(p.yaw, p.pitch);
    // one aim deviation per shot (same random sequence as before for single-pellet weapons), then each pellet in its cone
    const pellets = def.pellets || 1, shotDir = spreadDir(base, spread, this.rng);
    const cone = pellets > 1 ? (def.pelletSpread || 0) * (1 - this.adsT * (1 - (def.adsPelletMult ?? 1))) : 0;
    let firstHit = null, anyHit = false, anyKill = false, anyHead = false; const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = 0; i < pellets; i++) {
      const dir = pellets > 1 ? spreadDir(shotDir, cone, this.rng) : shotDir;
      const hit = resolveShot(g.world, g.hittables, origin, dir, def.range);
      if (!firstHit) firstHit = hit;
      if (hit.type === 'entity') {
        const dmg = (hit.zone === 'head' ? def.damage.head : def.damage.body) * falloffK(def.falloff, hit.t * CELL_SIZE);
        const r = hit.entity.applyDamage(dmg, hit.zone, { dir, point: hit.point });
        if (r.killed && g.onEntityKilled) g.onEntityKilled(hit.entity);
        anyHit = true; anyKill = anyKill || r.killed; anyHead = anyHead || hit.zone === 'head';
        const first = !seen.has(hit.entity.id); seen.add(hit.entity.id);
        g.emit('targetHit', { id: hit.entity.id, zone: hit.zone, killed: r.killed, point: hit.point, damage: dmg, pellet: i, first });
      } else if (hit.type === 'world') {
        g.emit('impact', { point: hit.point, normal: hit.normal, kind: hit.kind, cell: hit.cell }); // cell: M2.0 surface (metal props / concrete)
      } else g.emit('miss', {});
      g.emit('shot', { origin, dir, aim: base, hit, ads: this.adsT, spread, index: this.shotsInSpray });
    }
    if (anyHit) st.registerHit({ kill: anyKill, headshot: anyHead }); // one confirmation per shot (8 pellets → one marker)
    this.totalShots++;
    this.shotsInSpray++;
    // One 'fire' per round (feedback: flash, sound, recoil anim); 'shot' above is per pellet (hit logic).
    g.emit('fire', { ads: this.adsT, index: this.shotsInSpray - 1, weapon: def.id, pellets });
    if (def.fireMode === 'pump') g.emit('pumpStart', { after: def.pump ? def.pump.start : 0.2 });
    // Recoil: real aim kick, slightly stronger for the first shots of a spray, reduced in ADS.
    const rc = def.recoil, ramp = this.shotsInSpray <= rc.pitchRampShots ? rc.pitchRampMult : 1;
    const adsK = 1 - this.adsT * (1 - def.ads.recoilMult);
    const kick = rc.pitch * ramp * adsK * D2R;
    const before = p.pitch;
    g.look(((this.rng() - 0.5) * 2 * rc.yaw + rc.yawBias) * adsK * D2R, kick);
    this.recoilClimb = Math.min(PITCH_LIMIT, this.recoilClimb + (p.pitch - before) * rc.recoverFraction);
    this.bloom = Math.min(def.spread.max, this.bloom + def.spread.perShot);
  }
}

/** Damage multiplier by distance (metres): 1 up to start, linear down to `min` at `end` (no falloff block → 1). */
export function falloffK(f, m) {
  if (!f || !(m > f.start)) return 1;
  return m >= f.end ? f.min : 1 - (1 - f.min) * (m - f.start) / (f.end - f.start);
}
