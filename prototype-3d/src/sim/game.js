// Game simulation container. Holds all gameplay state; knows nothing about DOM or three.js.
// M1+ will add: enemies, weapons, waves, hit detection — each as a system stepped here,
// emitting events (shot, hit, kill, playerDamaged, waveStart…) for render/UI/audio.
import { World } from './world.js';
import { createPlayer, stepPlayer, applyLook } from './player.js';

export class Game {
  constructor(map) {
    this.world = new World(map);
    this.player = createPlayer(map.playerStart);
    this.tick = 0;
    this.listeners = new Map();
  }
  /** Fixed-step update. cmd = InputState snapshot {move:{x,y}} */
  step(cmd, dt) {
    stepPlayer(this.world, this.player, cmd.move, dt);
    this.tick++;
  }
  look(dYaw, dPitch) { applyLook(this.player, dYaw, dPitch); }
  on(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
  emit(type, data) { for (const fn of this.listeners.get(type) || []) fn(data); }
  /** Serializable snapshot — basis for save/replay/co-op later. */
  snapshot() { const p = this.player; return { tick: this.tick, player: { x: p.x, y: p.y, yaw: p.yaw, pitch: p.pitch } }; }
}
