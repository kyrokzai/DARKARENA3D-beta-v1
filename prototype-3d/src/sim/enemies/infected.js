// One infected (pure logic: no DOM, no three.js). Finite state machine:
//   IDLE → ALERT → CHASE ⇄ ATTACK → RECOVER → CHASE …   any → DEAD (hp 0)
// Implements the "hittable" interface used by hitscan: {id, alive, hitboxes(), applyDamage()}.
// Units inside the sim are cells (1 cell = 2 m); the def is in metres and converted once here.
import { moveEntity } from '../collision.js';
import { lineOfSight, corridorFree } from '../nav/grid-nav.js';

const M = 0.5; // cells per metre
export const STATES = Object.freeze({ IDLE: 'IDLE', ALERT: 'ALERT', CHASE: 'CHASE', ATTACK: 'ATTACK', RECOVER: 'RECOVER', DEAD: 'DEAD' });
const S = STATES;
const tmpDir = { x: 0, y: 0 };

export class Infected {
  constructor(id, def, x, y, facing = 0, phase = 0) {
    this.id = id; this.def = def; this.type = def.id;
    // geometry / tuning in cells
    this.k = {
      r: def.radius * M, walk: def.walkSpeed * M, run: def.runSpeed * M, accel: def.accel * M,
      detect: def.detectRange * M, atk: def.attackRange * M, reach: def.attackReach * M, arcCos: Math.cos(def.attackArcDeg * Math.PI / 360),
      hb: { hz: def.hitboxes.head.z * M, hf: def.hitboxes.head.fwd * M, hr: def.hitboxes.head.r * M, z0: def.hitboxes.body.z0 * M, z1: def.hitboxes.body.z1 * M, br: def.hitboxes.body.r * M },
    };
    Object.assign(this, { x, y, prevX: x, prevY: y, facing, prevFacing: facing, speed: 0, vx: 0, vy: 0, dist: 0 });
    this.hp = def.hp; this.maxHp = def.hp; this.alive = true; this.removed = false;
    this.state = S.IDLE; this.stateT = 0;
    this.senseT = phase * def.senseInterval; // staggered so several infected never check on the same tick
    this.canSee = false; this.alerted = false; this.lastSeen = { x, y };
    this.attackT = 0; this.cooldown = 0; this.blowDealt = false; this.swings = 0; this.blows = 0;
    this.stun = 0; this.hit = { t: 0, x: 0, y: 0, zone: null, n: 0 }; // last hit (for the hit-reaction animation)
    this.deathT = 0; this.killCounted = false; this.killDir = { x: 0, y: 0 };
    // hitboxes are rebuilt in place (no allocation per shot)
    this._hb = [{ kind: 'sphere', zone: 'head', cx: 0, cy: 0, cz: 0, r: 0 }, { kind: 'cylinder', zone: 'body', cx: 0, cy: 0, z0: 0, z1: 0, r: 0 }];
  }

  hitboxes() {
    const k = this.k.hb, h = this._hb[0], b = this._hb[1];
    h.cx = this.x + Math.cos(this.facing) * k.hf; h.cy = this.y + Math.sin(this.facing) * k.hf; h.cz = k.hz; h.r = k.hr;
    b.cx = this.x; b.cy = this.y; b.z0 = k.z0; b.z1 = k.z1; b.r = k.br;
    return this._hb;
  }

  /** Bullet damage. info = {dir:{x,y,z}} (optional). Returns {killed} — true exactly once. */
  applyDamage(n, zone, info = null) {
    if (!this.alive) return { killed: false };
    this.hp = Math.max(0, this.hp - n);
    this.hit.t = 0.35; this.hit.zone = zone; this.hit.n++;
    if (info && info.dir) { this.hit.x = info.dir.x; this.hit.y = info.dir.y; }
    this.stun = this.def.hitStun;
    if (this.state === S.IDLE) this.setState(S.ALERT); // being shot always alerts
    this.alerted = true;
    if (this.hp === 0) {
      this.alive = false; this.killDir.x = this.hit.x; this.killDir.y = this.hit.y;
      this.setState(S.DEAD); this.speed = 0;
      return { killed: true };
    }
    return { killed: false };
  }

  setState(s) { this.state = s; this.stateT = 0; if (s === S.ATTACK) { this.attackT = 0; this.blowDealt = false; this.swings++; } if (s === S.ALERT) this.pendingAlert = true; }

  /** ctx = {world, player, playerAlive, flow, others, onAlert(e), onBlow(e, dmg)} */
  step(dt, ctx) {
    this.prevX = this.x; this.prevY = this.y; this.prevFacing = this.facing;
    this.stateT += dt; this.cooldown = Math.max(0, this.cooldown - dt); this.stun = Math.max(0, this.stun - dt);
    this.hit.t = Math.max(0, this.hit.t - dt);
    if (this.state === S.DEAD) { this.deathT += dt; if (this.deathT >= this.def.corpseTime) this.removed = true; return; }
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    // senses: line of sight on a fixed cadence (cheap, staggered); never through walls
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT += this.def.senseInterval;
      this.canSee = ctx.playerAlive && d <= this.k.detect && lineOfSight(ctx.world, this.x, this.y, p.x, p.y);
      if (this.canSee) { this.lastSeen.x = p.x; this.lastSeen.y = p.y; }
    }
    let want = 0; // wanted speed (cells/s)
    switch (this.state) {
      case S.IDLE:
        if (this.canSee) { this.setState(S.ALERT); }
        break;
      case S.ALERT:
        if (this.pendingAlert) { this.pendingAlert = false; this.alerted = true; ctx.onAlert && ctx.onAlert(this); }
        this.turnTo(Math.atan2(dy, dx), dt);
        if (this.stateT >= this.def.alertTime) this.setState(S.CHASE);
        break;
      case S.CHASE: {
        if (!ctx.playerAlive) { this.setState(S.IDLE); break; }
        if (d <= this.k.atk && this.cooldown <= 0 && this.canSee) { this.setState(S.ATTACK); ctx.onSwing && ctx.onSwing(this); break; }
        want = d > this.k.atk * 2.5 ? this.k.run : this.k.walk + (this.k.run - this.k.walk) * Math.max(0, (d - this.k.atk) / (this.k.atk * 1.5));
        if (d <= this.k.atk * 0.8) want = 0; // close enough, waiting for the cooldown: do not push into the player
        // where to go: straight at the player if the corridor is free, otherwise downhill on the shared flow field
        let gx, gy;
        if (this.canSee && corridorFree(ctx.world, this.x, this.y, p.x, p.y, this.k.r * 0.9)) { gx = dx / (d || 1); gy = dy / (d || 1); }
        else if (ctx.flow && ctx.flow.direction(this.x, this.y, tmpDir)) { gx = tmpDir.x; gy = tmpDir.y; }
        else { gx = dx / (d || 1); gy = dy / (d || 1); }
        // separation from other infected (simple, O(n²) for a handful)
        for (const o of ctx.others) {
          if (o === this || !o.alive) continue;
          const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), min = this.k.r + o.k.r + 0.1;
          if (od > 1e-4 && od < min) { const s = (min - od) / min * 1.6; gx += ox / od * s; gy += oy / od * s; }
        }
        const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
        this.turnTo(Math.atan2(gy, gx), dt);
        // move along the facing (turning limits sharp zig-zags; feet follow the body)
        break;
      }
      case S.ATTACK: {
        this.attackT += dt;
        this.turnTo(Math.atan2(dy, dx), dt * 0.6);
        const f = this.attackT / this.def.attackDuration;
        if (!this.blowDealt && f >= this.def.attackHitAt) {
          this.blowDealt = true; this.cooldown = this.def.attackCooldown;
          // lands only if the player is still in reach, in front, visible and alive — exactly once per swing
          const fx = Math.cos(this.facing), fy = Math.sin(this.facing), facingDot = d > 1e-6 ? (dx * fx + dy * fy) / d : 1;
          if (ctx.playerAlive && d <= this.k.reach && facingDot >= this.k.arcCos && lineOfSight(ctx.world, this.x, this.y, p.x, p.y)) {
            this.blows++; ctx.onBlow && ctx.onBlow(this, this.def.attackDamage);
          }
        }
        if (f >= 1) this.setState(S.RECOVER);
        break;
      }
      case S.RECOVER:
        this.turnTo(Math.atan2(dy, dx), dt);
        if (this.stateT >= this.def.recoverTime) this.setState(ctx.playerAlive ? S.CHASE : S.IDLE);
        break;
    }
    // speed ramps (no instant start/stop), stun slows, then move with wall collision
    if (this.stun > 0) want *= 0.25;
    const a = this.k.accel * dt;
    this.speed = this.speed < want ? Math.min(want, this.speed + a) : Math.max(want, this.speed - a * 1.6);
    if (this.speed > 1e-4) {
      const sx = Math.cos(this.facing) * this.speed * dt, sy = Math.sin(this.facing) * this.speed * dt;
      const x0 = this.x, y0 = this.y;
      moveEntity(ctx.world, this, sx, sy, this.k.r);
      const moved = Math.hypot(this.x - x0, this.y - y0);
      this.dist += moved; this.vx = (this.x - x0) / dt; this.vy = (this.y - y0) / dt;
    } else { this.vx = 0; this.vy = 0; }
  }

  turnTo(target, dt) {
    let diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
    const max = this.def.turnRate * dt;
    if (diff > max) diff = max; else if (diff < -max) diff = -max;
    this.facing += diff;
  }

  /** Serializable view for debugging / tests. */
  info() {
    return { id: this.id, state: this.state, hp: this.hp, alive: this.alive, x: this.x, y: this.y, facing: this.facing, speed: this.speed, canSee: this.canSee, swings: this.swings, blows: this.blows, removed: this.removed };
  }
}
