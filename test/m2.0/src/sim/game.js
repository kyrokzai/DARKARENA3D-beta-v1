// Game simulation container. Holds all gameplay state; knows nothing about DOM or three.js.
// Systems stepped here: player (+ jump), weapon, infected (M1.5 AI), waves. They emit events
// (shot, hit, infectedAlert, infectedAttack, playerHurt, playerDied, infectedKilled, waveCleared…)
// that render / UI / audio subscribe to. Gameplay values for the HUD live only in GameState.
import { World } from './world.js';
import { createPlayer, stepPlayer, applyLook } from './player.js';
import { GameState } from './game-state.js';
import { WeaponSystem } from './weapons/weapon-system.js';
import { MeleeSystem } from './weapons/melee-system.js';
import { Arsenal } from './weapons/arsenal.js';
import { getWeaponDef } from './weapons/defs.js';
import { TrainingTarget, TRAINING_TARGET_SPOTS } from './targets.js';
import { Infected } from './enemies/infected.js';
import { getInfectedDef } from './enemies/infected-defs.js';
import { FlowField } from './nav/grid-nav.js';
import { WaveDirector } from './waves/wave-director.js';

export class Game {
  constructor(map, opts = {}) {
    this.world = new World(map);
    this.map = map;
    this.player = createPlayer(map.playerStart);
    this.tick = 0;
    this.listeners = new Map();
    // Health / ammo / wave model read by the HUD; future weapon & enemy systems write into it.
    this.state = new GameState((type, data) => this.emit(type, data));
    // Everything that bullets can hit besides the map = training targets (debug range) + infected.
    // The combined list is rebuilt only when one of them changes (no allocation per shot).
    this.targets = []; this.enemies = []; this.hittables = [];
    this.flow = new FlowField(this.world);       // shared navigation field towards the player (M1.5)
    this.waves = new WaveDirector(this, { rng: opts.waveRng || Math.random, ...(opts.waves ? { waves: opts.waves } : {}), ...(opts.match ? { match: opts.match } : {}) });
    this.matchOver = false; this.noise = false;
    this.nextEnemyId = 1;
    this.aiCtx = { world: this.world, player: this.player, playerAlive: true, flow: this.flow, others: this.enemies, rng: opts.aiRng || Math.random,
      onAlert: e => this.emit('infectedAlert', { id: e.id, x: e.x, y: e.y }),
      onLost: e => this.emit('infectedLost', { id: e.id, x: e.lastSeen.x, y: e.lastSeen.y }),
      onReacquire: e => this.emit('infectedReacquire', { id: e.id }),
      onGiveUp: e => this.emit('infectedGiveUp', { id: e.id }),
      onSwing: e => this.emit('infectedAttack', { id: e.id, x: e.x, y: e.y }),
      onBlow: (e, dmg) => this.damagePlayer(dmg, e) };
    this.lastJumpPress = 0; this.jumpResync = true; // first step (and after a pause) adopts the counter
    this.weapon = new WeaponSystem(this, getWeaponDef(opts.weapon), { rng: opts.rng || Math.random });
    this.melee = new MeleeSystem(this, this.weapon.def); // M1.9 rifle-butt strike (data: weapon def `melee`)
    // M2.0 arsenal: RAVEN / AK-47 / KRAIT with separate ammo and holster→draw switching. A test may ask for one weapon
    // only (opts.loadout = ['raven']) — the older suites then see exactly the M1.9 game.
    const loadout = opts.loadout || undefined, startSlot = Math.max(0, (opts.loadout || ['raven', 'ak47', 'krait']).indexOf(this.weapon.def.id));
    this.arsenal = new Arsenal(this, loadout, startSlot); // start slot = the weapon in the hands (review fix: opts.weapon)
    this.lastLightPress = 0; this.lightResync = false;
    this.on('fire', () => { this.noise = true; }); // gunfire is heard by infected in range (handled in step)
  }
  /** Test mode only: place training targets on the range. */
  spawnTrainingTargets(spots = TRAINING_TARGET_SPOTS) {
    this.targets = spots.map((s, i) => new TrainingTarget('target-' + (i + 1), s.x, s.y));
    this.rebuildHittables();
    this.emit('targetsChanged', { count: this.targets.length });
    return this.targets;
  }
  rebuildHittables() { this.hittables = [...this.targets, ...this.enemies]; }

  // ---------------- infected (M1.5) ----------------
  spawnInfected(type, x, y, facing = 0, opts = undefined) {
    const e = new Infected('inf-' + this.nextEnemyId++, getInfectedDef(type), x, y, facing, (this.nextEnemyId % 5) / 5, opts);
    this.enemies.push(e); this.rebuildHittables();
    this.emit('infectedSpawn', { id: e.id, type, variant: e.variant, x, y, tick: this.tick });
    return e;
  }
  removeInfected(e) {
    const i = this.enemies.indexOf(e); if (i < 0) return;
    this.enemies.splice(i, 1); this.rebuildHittables();
    this.emit('infectedRemoved', { id: e.id });
  }
  /** Called when a hit kills an infected (weapon) — counted exactly once per infected. */
  onEntityKilled(e) { if (e instanceof Infected) this.onInfectedKilled(e); }
  onInfectedKilled(e) {
    if (e.alive || e.killCounted) return;
    e.killCounted = true;
    this.state.addKill();
    this.state.enemyKilled(); // wave remaining − 1 (→ 'cleared' + waveCleared when it reaches 0)
    this.emit('infectedKilled', { id: e.id, x: e.x, y: e.y, dir: { x: e.killDir.x, y: e.killDir.y } });
  }
  /** Infected blow (or any other damage source) → GameState health; death at 0 HP (once). */
  damagePlayer(n, from = null) {
    const p = this.player; if (p.dead) return;
    this.state.damage(n);
    this.emit('playerHurt', { damage: n, from: from ? { id: from.id, x: from.x, y: from.y } : null, hp: this.state.health.hp });
    if (this.state.health.hp === 0) { p.dead = true; this.weapon.release(); this.melee.release(); this.emit('playerDied', { tick: this.tick }); }
  }
  /** Last wave cleared: the match is won (once). */
  onVictory() { if (this.matchOver) return; this.matchOver = true; this.weapon.release(); this.emit('victory', { kills: this.state.kills, waves: this.waves.waves.length }); }
  /** Start the wave sequence (from PLAY). */
  startWaves(n = 1) { this.waves.start(n); }
  /** Full restart: player, ammo, health, kills, infected, wave 1 (waves = false: shooting range, no wave). */
  restart({ waves = true } = {}) {
    for (const e of [...this.enemies]) this.removeInfected(e);
    const s = this.map.playerStart, p = this.player;
    Object.assign(p, { x: s.x, y: s.y, prevX: s.x, prevY: s.y, z: 0, prevZ: 0, vz: 0, onGround: true, jumpBuffer: 0, yaw: s.yaw || 0, pitch: 0, dead: false });
    this.state.resetRun();
    this.arsenal.reset(); this.state.setFlashlight(false);
    this.flow.tx = this.flow.ty = -1;
    this.jumpResync = true; this.matchOver = false; this.noise = false;
    this.waves.reset(); if (waves) this.startWaves(1);
    this.emit('restart', {});
  }
  /** Pause / focus loss / menus: stop firing, leave ADS. */
  releaseCombat() { this.weapon.release(); this.melee.release(); this.arsenal.release(); this.jumpResync = true; this.lightResync = true; } // a press made just before pausing is dropped
  /** Fixed-step update. cmd = InputState snapshot {move:{x,y}} */
  step(cmd, dt) {
    const jp = cmd.presses ? cmd.presses.jump : 0;
    if (this.jumpResync) { this.lastJumpPress = jp; this.jumpResync = false; }
    const jumpPressed = jp !== this.lastJumpPress; this.lastJumpPress = jp;
    const alive = !this.player.dead;
    if (alive) {
      stepPlayer(this.world, this.player, cmd.move, dt, jumpPressed);
      if (cmd.actions) {
        this.arsenal.step(cmd, dt);                         // M2.0: weapon change first (blocks fire / strike while switching)
        this.melee.step(cmd, dt); this.weapon.step(cmd, dt); // melee before the weapon: a strike blocks this tick's shot
        const lp = cmd.presses ? cmd.presses.light || 0 : 0;  // M2.0 flashlight toggle (one press = on / off)
        if (this.lightResync) { this.lastLightPress = lp; this.lightResync = false; }
        if (lp !== this.lastLightPress) { this.lastLightPress = lp; this.state.setFlashlight(!this.state.flashlight); }
      }
    } else { this.player.prevX = this.player.x; this.player.prevY = this.player.y; this.player.prevZ = this.player.z; }
    for (const t of this.targets) t.step(dt);
    // infected: shared flow field (rebuilt only when the player changes cell), then each FSM
    if (this.enemies.length) {
      this.flow.setTarget(this.player.x, this.player.y);
      this.aiCtx.playerAlive = alive;
      if (this.noise && alive) for (const e of this.enemies) e.hear(this.player.x, this.player.y, this.aiCtx);
      for (const e of this.enemies) e.step(dt, this.aiCtx);
      for (const e of this.enemies) if (!e.alive && !e.killCounted) this.onInfectedKilled(e); // safety net
      for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].removed) this.removeInfected(this.enemies[i]); // plain loop, no closures per tick
    }
    this.noise = false;
    this.waves.step(dt);
    this.tick++;
  }
  look(dYaw, dPitch) { applyLook(this.player, dYaw, dPitch); }
  on(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
  emit(type, data) { for (const fn of this.listeners.get(type) || []) fn(data); }
  /** Serializable snapshot — basis for save/replay/co-op later. */
  snapshot() { const p = this.player; return { tick: this.tick, player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, state: this.state.snapshot() }; }
}
