// Generic weapon system (pure logic, fixed-step). Works for any definition in defs.js.
// Ammo / reload / hit confirmation live in GameState (the model the HUD reads) — no parallel combat state.
// Emits game events: 'fire' {ads, index} once per round, 'shot' {dir, aim, origin, hit, ads, spread} per pellet, 'impact' {point, normal, kind},
// 'targetHit' {id, zone, killed, point}, 'miss', 'dryFire', 'reloadStart', 'reloadEnd', 'adsChange' {ads}.
import { aimDir, spreadDir, resolveShot, EYE_Z } from '../hitscan.js';
import { PLAYER_SPEED, PITCH_LIMIT } from '../../config.js';

const D2R = Math.PI / 180;

export class WeaponSystem {
  constructor(game, def, { rng = Math.random } = {}) {
    this.game = game; this.rng = rng;
    this.equip(def);
  }

  equip(def) {
    this.def = def;
    this.interval = 60 / def.rpm;
    this.cooldown = 0;          // seconds until the next round may fire (≤ 0 = ready)
    this.triggerDown = false;
    this.burstLeft = 0;
    this.shotsInSpray = 0;
    this.bloom = 0;             // deg
    this.recoilClimb = 0;       // rad of pitch added by recoil that will be (partly) recovered
    this.adsT = 0; this.adsWanted = false;
    this.reloadT = -1;          // < 0: not reloading (driven by this system)
    this.lastReloadPress = 0; this.lastFirePress = 0;
    this.dryLatched = false;
    this.totalShots = 0;
    this.game.state.setWeapon(def);
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

    // ---- ADS: held (PC right mouse) or toggled (touch button); not while reloading ----
    const wantAds = (input.aimHeld || input.aimToggle) && !this.reloading;
    if (wantAds !== this.adsWanted) { this.adsWanted = wantAds; this.game.emit('adsChange', { ads: wantAds }); }
    const k = dt / def.ads.time;
    this.adsT = wantAds ? Math.min(1, this.adsT + k) : Math.max(0, this.adsT - k);

    // ---- reload progress ----
    if (this.reloading) {
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
    let firedThisTick = false;
    const wantsShot = () => def.fireMode === 'auto' ? (trig || tapShot) : def.fireMode === 'burst' ? this.burstLeft > 0 : pulled && !firedThisTick;
    while (this.cooldown <= 1e-6 && wantsShot()) { // epsilon: 6 × (1/60) must equal 0.1 s exactly
      if (this.reloading || w.reloading) break;
      if (w.mag <= 0) {
        tapShot = false;
        if (!this.dryLatched) { this.dryLatched = true; this.game.emit('dryFire', {}); if (def.autoReloadOnEmpty) this.startReload(); }
        break;
      }
      this.fireOne();
      firedThisTick = true; tapShot = false;
      this.cooldown += this.interval;
      if (def.fireMode === 'burst') this.burstLeft--;
      if (def.fireMode === 'semi') break;
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
  }

  startReload() {
    const w = this.game.state.weapon;
    if (this.reloading || w.reloading || w.mag >= w.magSize || w.reserve <= 0) return false;
    this.reloadT = 0; this.adsWanted = false;
    this.game.state.setReload(true, 0);
    this.game.emit('reloadStart', { time: this.def.reloadTime });
    return true;
  }

  fireOne() {
    const g = this.game, st = g.state, def = this.def, p = g.player, w = st.weapon;
    st.setAmmo(w.mag - 1, w.reserve);
    const spread = this.currentSpread();
    const origin = { x: p.x, y: p.y, z: EYE_Z };
    const base = aimDir(p.yaw, p.pitch);
    let firstHit = null;
    for (let i = 0; i < (def.pellets || 1); i++) {
      const dir = spreadDir(base, spread, this.rng);
      const hit = resolveShot(g.world, g.hittables, origin, dir, def.range);
      if (!firstHit) firstHit = hit;
      if (hit.type === 'entity') {
        const dmg = hit.zone === 'head' ? def.damage.head : def.damage.body;
        const r = hit.entity.applyDamage(dmg, hit.zone);
        st.registerHit({ kill: r.killed, headshot: hit.zone === 'head' });
        g.emit('targetHit', { id: hit.entity.id, zone: hit.zone, killed: r.killed, point: hit.point, damage: dmg });
      } else if (hit.type === 'world') {
        g.emit('impact', { point: hit.point, normal: hit.normal, kind: hit.kind });
      } else g.emit('miss', {});
      g.emit('shot', { origin, dir, aim: base, hit, ads: this.adsT, spread, index: this.shotsInSpray });
    }
    this.totalShots++;
    this.shotsInSpray++;
    // One 'fire' per round (feedback: flash, sound, recoil anim); 'shot' above is per pellet (hit logic).
    g.emit('fire', { ads: this.adsT, index: this.shotsInSpray - 1, weapon: def.id });
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
