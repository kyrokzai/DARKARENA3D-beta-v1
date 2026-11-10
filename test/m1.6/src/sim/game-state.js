// Gameplay state model — the single source of truth the HUD reads.
// Pure logic: no DOM, no three.js. Future systems (weapon M1.3, enemies/waves M1.4–M1.5) change the game
// ONLY through these methods; the HUD subscribes to the emitted events and never needs rewriting.
//
// Events (emit(type, data)):
//   'health'  {hp, max, delta}            'ammo'   {mag, reserve, magSize}
//   'reload'  {active, progress}          'wave'   {number, remaining, total, phase}
//   'hit'     {kill, headshot}            'waveCleared' {number}
//   'kills'   {kills}  (M1.5)
export const DEFAULT_WEAPON = Object.freeze({ magSize: 30, mag: 30, reserve: 120, reloadTime: 1.3 });
export const CRITICAL_HP = 0.25; // fraction of max HP

export class GameState {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.health = { hp: 100, max: 100 };
    this.weapon = { ...DEFAULT_WEAPON, name: '', reloading: false, reloadProgress: 0, spread: 0, ads: 0 };
    // phase: idle (before the wave) | active | cleared (intermission) | victory. `of` = waves in the match,
    // `countdown` = whole seconds until the wave starts (0 = none), `remaining` includes infected not spawned yet.
    this.wave = { number: 1, of: 1, remaining: 0, total: 0, phase: 'idle', countdown: 0 };
    this.kills = 0; // infected killed in this run (M1.5)
  }

  // ---- health ----
  get critical() { return this.health.hp > 0 && this.health.hp <= this.health.max * CRITICAL_HP; }
  setHealth(hp) {
    const old = this.health.hp;
    this.health.hp = clampInt(hp, 0, this.health.max);
    if (this.health.hp !== old) this.emit('health', { hp: this.health.hp, max: this.health.max, delta: this.health.hp - old });
  }
  damage(n) { this.setHealth(this.health.hp - Math.max(0, n)); }
  heal(n) { this.setHealth(this.health.hp + Math.max(0, n)); }

  // ---- weapon / ammo ----
  /** Equip a weapon definition (from sim/weapons/defs.js): magazine, reserve, reload time, name. */
  setWeapon(def) {
    Object.assign(this.weapon, { name: def.name, magSize: def.magSize, mag: def.magSize, reserve: def.reserve, reloadTime: def.reloadTime, reloading: false, reloadProgress: 0 });
    this.emit('weapon', { name: def.name });
    this.emit('ammo', { mag: this.weapon.mag, reserve: this.weapon.reserve, magSize: this.weapon.magSize });
  }
  /** Per-tick aim info for the crosshair (spread in degrees, ADS 0..1). Polled by the HUD — no event spam. */
  setAim({ spread, ads }) { this.weapon.spread = spread; this.weapon.ads = ads; }
  setAmmo(mag, reserve = this.weapon.reserve) {
    const w = this.weapon;
    w.mag = clampInt(mag, 0, w.magSize);
    w.reserve = clampInt(reserve, 0, 9999);
    this.emit('ammo', { mag: w.mag, reserve: w.reserve, magSize: w.magSize });
  }
  /** Reload progress 0..1 is driven by the weapon system (M1.3); finishing moves rounds from reserve. */
  setReload(active, progress = 0) {
    const w = this.weapon;
    w.reloading = !!active;
    w.reloadProgress = active ? Math.max(0, Math.min(1, progress)) : 0;
    this.emit('reload', { active: w.reloading, progress: w.reloadProgress });
  }
  completeReload() {
    const w = this.weapon, n = Math.min(w.magSize - w.mag, w.reserve);
    this.setReload(false);
    this.setAmmo(w.mag + n, w.reserve - n);
  }

  // ---- waves ----
  setWave({ number = this.wave.number, remaining = this.wave.remaining, total = this.wave.total, phase = this.wave.phase, of = this.wave.of, countdown = this.wave.countdown } = {}) {
    const prev = this.wave.phase;
    Object.assign(this.wave, { number: clampInt(number, 1, 999), of: clampInt(of, 1, 999), total: clampInt(total, 0, 999), remaining: clampInt(remaining, 0, 999), phase, countdown: clampInt(countdown, 0, 999) });
    this.emit('wave', { ...this.wave });
    if (phase === 'cleared' && prev !== 'cleared') this.emit('waveCleared', { number: this.wave.number });
  }
  enemyKilled() {
    if (this.wave.remaining <= 0) return;
    const remaining = this.wave.remaining - 1;
    this.setWave({ remaining, phase: remaining === 0 ? 'cleared' : this.wave.phase });
  }

  addKill() { this.kills++; this.emit('kills', { kills: this.kills }); }
  /** New run (restart after death / from the menu): full health, kills 0. Ammo is reset by the weapon. */
  resetRun() {
    this.setHealth(this.health.max);
    this.kills = 0; this.emit('kills', { kills: 0 });
    this.setWave({ number: 1, remaining: 0, total: 0, phase: 'idle', countdown: 0 });
  }

  // ---- hit confirmation (from hit detection in M1.3) ----
  registerHit({ kill = false, headshot = false } = {}) { this.emit('hit', { kill, headshot }); }

  snapshot() { return { health: { ...this.health }, weapon: { ...this.weapon }, wave: { ...this.wave }, kills: this.kills }; }
}

function clampInt(v, a, b) { v = Math.round(Number(v) || 0); return Math.max(a, Math.min(b, v)); }
