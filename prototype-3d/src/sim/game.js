// Game simulation container. Holds all gameplay state; knows nothing about DOM or three.js.
// M1+ will add: enemies, weapons, waves, hit detection — each as a system stepped here,
// emitting events (shot, hit, kill, playerDamaged, waveStart…) for render/UI/audio.
import { World } from './world.js';
import { createPlayer, stepPlayer, applyLook } from './player.js';
import { GameState } from './game-state.js';
import { WeaponSystem } from './weapons/weapon-system.js';
import { getWeaponDef } from './weapons/defs.js';
import { TrainingTarget, TRAINING_TARGET_SPOTS } from './targets.js';

export class Game {
  constructor(map, opts = {}) {
    this.world = new World(map);
    this.player = createPlayer(map.playerStart);
    this.tick = 0;
    this.listeners = new Map();
    // Health / ammo / wave model read by the HUD; future weapon & enemy systems write into it.
    this.state = new GameState((type, data) => this.emit(type, data));
    // Everything that bullets can hit besides the map: training targets now, infected later.
    this.hittables = [];
    this.weapon = new WeaponSystem(this, getWeaponDef(opts.weapon), { rng: opts.rng || Math.random });
  }
  /** Test mode only: place training targets on the range. */
  spawnTrainingTargets(spots = TRAINING_TARGET_SPOTS) {
    this.hittables = spots.map((s, i) => new TrainingTarget('target-' + (i + 1), s.x, s.y));
    this.emit('targetsChanged', { count: this.hittables.length });
    return this.hittables;
  }
  /** Pause / focus loss / menus: stop firing, leave ADS. */
  releaseCombat() { this.weapon.release(); }
  /** Fixed-step update. cmd = InputState snapshot {move:{x,y}} */
  step(cmd, dt) {
    stepPlayer(this.world, this.player, cmd.move, dt);
    if (cmd.actions) this.weapon.step(cmd, dt);
    for (const h of this.hittables) h.step(dt);
    this.tick++;
  }
  look(dYaw, dPitch) { applyLook(this.player, dYaw, dPitch); }
  on(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
  emit(type, data) { for (const fn of this.listeners.get(type) || []) fn(data); }
  /** Serializable snapshot — basis for save/replay/co-op later. */
  snapshot() { const p = this.player; return { tick: this.tick, player: { x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch }, state: this.state.snapshot() }; }
}
