// Gameplay state model — the single source of truth the HUD reads.
// Pure logic: no DOM, no three.js. Future systems (weapon M1.3, enemies/waves M1.4–M1.5) change the game
// ONLY through these methods; the HUD subscribes to the emitted events and never needs rewriting.
//
// Events (emit(type, data)):
//   'health'  {hp, max, delta}            'ammo'   {mag, reserve, magSize}
//   'reload'  {active, progress}          'wave'   {number, remaining, total, phase}
//   'hit'     {kill, headshot}            'waveCleared' {number}
//   'melee'   {active, ready}  (M1.9)      'kills'   {kills}  (M1.5)                'alarm'  {phase, siren, warn}  (M1.7, only when one of them changes)
import { ALARM_OFF } from './waves/alarm.js';
import { SCORE, killPoints, comboMult } from './score.js';
export const DEFAULT_WEAPON = Object.freeze({ magSize: 30, mag: 30, reserve: 120, reloadTime: 1.3 });
export const CRITICAL_HP = 0.25; // fraction of max HP

export class GameState {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.health = { hp: 100, max: 100 };
    this.weapon = { ...DEFAULT_WEAPON, name: '', id: '', short: '', reloading: false, reloadProgress: 0, spread: 0, ads: 0, cycle: 1, shellPhase: null, shellT: 0 };
    // M2.0 arsenal (written by sim/weapons/arsenal.js, read by the HUD slots / viewmodel): slots [{id, short, mag, reserve}],
    // active slot, switching phase ('ready' | 'holster' | 'draw') and its progress 0..1. 'arsenal' event on any change.
    this.arsenal = { active: 0, slots: [], phase: 'ready', progress: 0 };
    this.flashlight = false; // M2.0 tactical light (toggled by the player; render / HUD read it); 'flashlight' event
    // phase: idle (before the wave) | active | cleared (intermission) | victory. `of` = waves in the match,
    // `countdown` = whole seconds until the wave starts (0 = none), `remaining` includes infected not spawned yet.
    this.wave = { number: 1, of: 1, remaining: 0, total: 0, phase: 'idle', countdown: 0 };
    this.kills = 0; // infected killed in this run (M1.5)
    this.typeKills = {}; // M3.2: kills per infected type in this run (top-down objectives); FPS does not read it
    this.runTime = 0;    // M3.2: seconds of play in this run (sim time while the player is alive and the match runs)
    // Emergency alarm between waves (M1.7): written every tick by the wave director (sim/waves/alarm.js),
    // POLLED by the renderer / HUD / audio (k changes continuously); 'alarm' is emitted only on phase / siren / warn change.
    this.alarm = { active: false, phase: 'off', k: 0, siren: false, warn: false, t: 0 };
    this.waveTime = 0; // seconds left in the current countdown / intermission (float; polled)
    // Melee strike (M1.9): written every tick by the MeleeSystem, POLLED by the viewmodel / HUD button.
    // progress 0..1 while a strike runs; cooldown 1 → 0 until the next strike is possible; 'melee' event on start / end.
    this.melee = { available: false, active: false, progress: 0, cooldown: 0, ready: false };
    // M3.3 TOPDOWN (FPS does not read these): score + combo ('score' event on every change of points / combo; comboT is
    // polled), shot accuracy (rounds fired / rounds that hit something), headshot kills, best combo of the run.
    this.score = { points: 0, combo: 0, mult: 1, comboT: 0, bestCombo: 0, lastGain: 0 };
    this.stats = { shots: 0, hits: 0, headshotKills: 0, meleeKills: 0, pickups: 0 };
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
  setWeapon(def, ammo = null) {
    Object.assign(this.weapon, { name: def.name, id: def.id, short: def.short || def.name, magSize: def.magSize, mag: ammo ? ammo.mag : def.magSize, reserve: ammo ? ammo.reserve : def.reserve, reloadTime: def.reloadTime, reloading: false, reloadProgress: 0, cycle: 1, shellPhase: null, shellT: 0 });
    this.emit('weapon', { name: def.name });
    this.emit('ammo', { mag: this.weapon.mag, reserve: this.weapon.reserve, magSize: this.weapon.magSize });
  }
  /** Per-tick aim info for the crosshair (spread in degrees, ADS 0..1). Polled by the HUD — no event spam. */
  setAim({ spread, ads }) { this.weapon.spread = spread; this.weapon.ads = ads; }
  /** Per tick: action cycle 0..1 since the last shot (pump / bolt animation) and the shell-reload phase. Polled. */
  setCycle(cycle, shellPhase = null, shellT = 0, shellPump = false) { const w = this.weapon; w.cycle = cycle; w.shellPhase = shellPhase; w.shellT = shellT; w.shellPump = shellPump; }
  setArsenal(active, phase, progress, slots, slotsChanged = true) {
    const o = this.arsenal, changed = slotsChanged || o.active !== active || o.phase !== phase || o.slots !== slots;
    o.active = active; o.phase = phase; o.progress = progress; o.slots = slots;
    if (changed) this.emit('arsenal', { active, phase });
  }
  setFlashlight(on) { on = !!on; if (on !== this.flashlight) { this.flashlight = on; this.emit('flashlight', { on }); } }
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
  setWave({ number = this.wave.number, remaining = this.wave.remaining, total = this.wave.total, phase = this.wave.phase, of = this.wave.of, countdown = this.wave.countdown, endless = this.wave.endless } = {}) {
    const prev = this.wave.phase;
    // endless (M3.3 top-down): the match has no last wave — `of` is the number of scripted waves only
    Object.assign(this.wave, { number: clampInt(number, 1, 999), of: clampInt(of, 1, 999), total: clampInt(total, 0, 999), remaining: clampInt(remaining, 0, 999), phase, countdown: clampInt(countdown, 0, 999), endless: !!endless });
    this.emit('wave', { ...this.wave });
    if (phase === 'cleared' && prev !== 'cleared') this.emit('waveCleared', { number: this.wave.number });
  }
  setAlarm(a) {
    const o = this.alarm, changed = o.phase !== a.phase || o.siren !== a.siren || o.warn !== a.warn;
    o.active = a.active; o.phase = a.phase; o.k = Math.max(0, Math.min(1, a.k)); o.siren = a.siren; o.warn = a.warn; o.t = a.t;
    if (changed) this.emit('alarm', { phase: o.phase, siren: o.siren, warn: o.warn });
  }
  setMelee(m) {
    const o = this.melee;
    if (!m) { if (o.available) { Object.assign(o, { available: false, active: false, progress: 0, cooldown: 0, ready: false }); this.emit('melee', { active: false, ready: false }); } return; }
    const changed = o.active !== m.active || o.ready !== m.ready || !o.available;
    o.available = true; o.active = m.active; o.progress = m.progress; o.cooldown = Math.max(0, Math.min(1, m.cooldown)); o.ready = m.ready;
    if (changed) this.emit('melee', { active: o.active, ready: o.ready });
  }
  enemyKilled() {
    if (this.wave.remaining <= 0) return;
    const remaining = this.wave.remaining - 1;
    this.setWave({ remaining, phase: remaining === 0 ? 'cleared' : this.wave.phase });
  }

  addKill(type = null) { this.kills++; if (type) this.typeKills[type] = (this.typeKills[type] || 0) + 1; this.emit('kills', { kills: this.kills }); }
  tickRun(dt) {
    this.runTime += dt;
    const sc = this.score; // M3.3 combo timer (only runs after a scored kill)
    if (sc.comboT > 0 && (sc.comboT = Math.max(0, sc.comboT - dt)) === 0) { sc.combo = 0; sc.mult = 1; this.emit('score', { ...sc, gain: 0 }); }
  }

  // ---- M3.3 score / accuracy / pickups ----
  /** A scored kill: extends the combo, adds the points. Returns the points gained. */
  scoreKill(type, how = {}) {
    const sc = this.score;
    sc.combo = sc.comboT > 0 ? sc.combo + 1 : 1; sc.comboT = SCORE.window; sc.mult = comboMult(sc.combo);
    if (sc.combo > sc.bestCombo) sc.bestCombo = sc.combo;
    const gain = killPoints(type, how, sc.combo);
    sc.points += gain; sc.lastGain = gain;
    if (how.headshot) this.stats.headshotKills++;
    if (how.melee) this.stats.meleeKills++;
    this.emit('score', { ...sc, gain, kind: 'kill', headshot: !!how.headshot, melee: !!how.melee });
    return gain;
  }
  scoreWave(n) {
    const gain = SCORE.waveClear * Math.max(1, n), sc = this.score;
    sc.points += gain; sc.lastGain = gain;
    this.emit('score', { ...sc, gain, kind: 'wave', wave: n });
    return gain;
  }
  /** One round fired (written by the weapon system); hit = it hit a target or an infected. */
  noteShot(hit) { this.stats.shots++; if (hit) this.stats.hits++; }
  get accuracy() { return this.stats.shots ? this.stats.hits / this.stats.shots : 0; }
  /** A pickup was collected (M3.3 drops): kind 'medkit' | 'ammo', amount = HP healed / rounds added. */
  pickupTaken(kind, amount) { this.stats.pickups++; this.emit('pickup', { kind, amount }); }
  /** New run (restart after death / from the menu): full health, kills 0. Ammo is reset by the weapon. */
  resetRun() {
    this.setHealth(this.health.max);
    this.kills = 0; this.typeKills = {}; this.runTime = 0; this.emit('kills', { kills: 0 });
    Object.assign(this.score, { points: 0, combo: 0, mult: 1, comboT: 0, bestCombo: 0, lastGain: 0 }); this.emit('score', { ...this.score, gain: 0 });
    Object.assign(this.stats, { shots: 0, hits: 0, headshotKills: 0, meleeKills: 0, pickups: 0 });
    this.setWave({ number: 1, remaining: 0, total: 0, phase: 'idle', countdown: 0 });
    this.setAlarm(ALARM_OFF); this.waveTime = 0;
  }

  // ---- hit confirmation (from hit detection in M1.3) ----
  registerHit({ kill = false, headshot = false, melee = false } = {}) { this.emit('hit', { kill, headshot, melee }); }

  snapshot() { return { health: { ...this.health }, weapon: { ...this.weapon }, wave: { ...this.wave }, kills: this.kills, alarm: { ...this.alarm }, melee: { ...this.melee }, arsenal: { ...this.arsenal, slots: this.arsenal.slots.map(s => ({ ...s })) }, flashlight: this.flashlight }; }
}

function clampInt(v, a, b) { v = Math.round(Number(v) || 0); return Math.max(a, Math.min(b, v)); }
