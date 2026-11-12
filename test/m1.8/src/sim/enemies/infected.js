// One infected (pure logic: no DOM, no three.js). Finite state machine (AI 2.0, M1.6):
//
//   IDLE ──sees──▶ ALERT ──▶ CHASE ⇄ ATTACK ──▶ RECOVER ──▶ CHASE
//                              │ lost sight for longer than memoryTime
//                              ▼
//                            SEARCH (run to the LAST KNOWN position, look around, try a few points nearby)
//                              │ sees again → CHASE          │ nothing found
//                              ▼                              ▼
//                                                   PATROL (wave hunters) / IDLE (others)
//   any state ──hp 0──▶ DEAD
//
// The infected never knows where the player is unless it sees him (line of sight), heard a shot, was just hit,
// or lost sight less than memoryTime ago. Implements the "hittable" interface of hitscan:
// {id, alive, hitboxes(), applyDamage()}; the hit zones follow the animated pose (hollow-rig.js).
// Units inside the sim are cells (1 cell = 2 m); the def is in metres and converted once here.
import { checkVariant } from './infected-defs.js';
import { moveEntity, canStand } from '../collision.js';
import { lineOfSight, corridorFree, FlowField } from '../nav/grid-nav.js';
import { createPose, stepPose } from './hollow-rig.js';

const M = 0.5; // cells per metre
export const STATES = Object.freeze({ IDLE: 'IDLE', ALERT: 'ALERT', CHASE: 'CHASE', SEARCH: 'SEARCH', PATROL: 'PATROL', ATTACK: 'ATTACK', RECOVER: 'RECOVER', DEAD: 'DEAD' });
const S = STATES;
const tmpDir = { x: 0, y: 0 };
const FALL_STEPS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8];

export class Infected {
  constructor(id, def, x, y, facing = 0, phase = 0, { hunter = false, variant = 'hollow' } = {}) {
    this.id = id; this.def = def; this.type = def.id; this.hunter = hunter;
    this.variant = checkVariant(variant); // cosmetic only (renderer); stats / AI / hit zones come from def
    const hb = def.hitboxes;
    this.k = { // tuning in cells
      r: def.radius * M, walk: def.walkSpeed * M, run: def.runSpeed * M, accel: def.accel * M,
      search: def.searchSpeed * M, patrol: def.patrolSpeed * M,
      detect: def.detectRange * M, hear: def.hearRange * M, atk: def.attackRange * M, reach: def.attackReach * M,
      arcCos: Math.cos(def.attackArcDeg * Math.PI / 360), searchR: def.searchRadius * M, scatter: def.patrolScatter * M,
      headR: hb.headR * M, chestR: hb.chestR * M, bellyR: hb.bellyR * M, legsR: hb.legsR * M, legsZ0: hb.legsZ0 * M,
    };
    Object.assign(this, { x, y, prevX: x, prevY: y, facing, prevFacing: facing, speed: 0, vx: 0, vy: 0, dist: 0 });
    this.hp = def.hp; this.maxHp = def.hp; this.alive = true; this.removed = false;
    this.state = S.IDLE; this.stateT = 0;
    this.senseT = phase * def.senseInterval; // staggered so several infected never check on the same tick
    // knowledge about the player
    this.canSee = false; this.alerted = false; this.lastSeen = { x, y }; this.seenAgo = Infinity; this.pain = false;
    // navigation to a point (search / patrol): own distance field, rebuilt only when the goal cell changes
    this.nav = null; this.goal = { x, y }; this.direct = false; this.lookT = 0; this.pointsLeft = 0; this.searchT = 0;
    this.stuckT = 0; this.stuckX = x; this.stuckY = y;
    // attack
    this.attackT = 0; this.cooldown = 0; this.blowDealt = false; this.swings = 0; this.blows = 0;
    this.stun = 0; this.hit = { t: 0, x: 0, y: 0, zone: null, n: 0 }; // last hit (drives the hit reaction)
    // death
    this.deathT = 0; this.killCounted = false; this.killDir = { x: 0, y: 0 }; this.fall = null; // {kind: back|front|crumple, facing}
    // animated pose (shared with the renderer) and hit zones rebuilt in place (no allocation per shot)
    this.pose = createPose(); this.poseDist = 0; this.poseHitN = 0;
    this._hb = [
      { kind: 'sphere', zone: 'head', cx: 0, cy: 0, cz: 0, r: 0 },
      { kind: 'sphere', zone: 'body', part: 'chest', cx: 0, cy: 0, cz: 0, r: 0 },
      { kind: 'sphere', zone: 'body', part: 'belly', cx: 0, cy: 0, cz: 0, r: 0 },
      { kind: 'cylinder', zone: 'body', part: 'legs', cx: 0, cy: 0, z0: 0, z1: 0, r: 0 },
    ];
    stepPose(this, 1 / 60);
  }

  /** Hit zones at the current animated pose: head sphere, chest + belly spheres, legs cylinder. */
  hitboxes() {
    const p = this.pose, k = this.k, c = Math.cos(this.facing), s = Math.sin(this.facing), b = this._hb;
    // forward along the facing (c, s); sideways along its left (−s, c)
    b[0].cx = this.x + (c * p.headF - s * p.headS) * M; b[0].cy = this.y + (s * p.headF + c * p.headS) * M; b[0].cz = p.headU * M; b[0].r = k.headR;
    b[1].cx = this.x + (c * p.chestF - s * p.chestS) * M; b[1].cy = this.y + (s * p.chestF + c * p.chestS) * M; b[1].cz = p.chestU * M; b[1].r = k.chestR;
    b[2].cx = this.x + c * p.bellyF * M; b[2].cy = this.y + s * p.bellyF * M; b[2].cz = p.bellyU * M; b[2].r = k.bellyR;
    b[3].cx = this.x; b[3].cy = this.y; b[3].z0 = k.legsZ0; b[3].z1 = p.bellyU * M; b[3].r = k.legsR; // up to the belly centre: no gap between zones
    return b;
  }

  /** Bullet damage. info = {dir:{x,y,z}} (optional). Returns {killed} — true exactly once. */
  applyDamage(n, zone, info = null) {
    if (!this.alive) return { killed: false };
    this.hp = Math.max(0, this.hp - n);
    this.hit.t = 0.35; this.hit.zone = zone; this.hit.n++;
    if (info && info.dir) { this.hit.x = info.dir.x; this.hit.y = info.dir.y; }
    this.stun = this.def.hitStun;
    this.pain = true; // being shot reveals the shooter (handled in step, where the player is known)
    if (this.hp === 0) {
      this.alive = false; this.killDir.x = this.hit.x; this.killDir.y = this.hit.y;
      this.setState(S.DEAD); this.speed = 0;
      return { killed: true };
    }
    return { killed: false };
  }

  /** A loud noise (gunfire) at (px, py): go and look there unless already fighting what it sees. */
  hear(px, py, ctx) {
    if (!this.alive || Math.hypot(px - this.x, py - this.y) > this.k.hear) return;
    this.lastSeen.x = px; this.lastSeen.y = py;
    if (this.state === S.IDLE || this.state === S.PATROL || this.state === S.SEARCH) { if (this.state !== S.SEARCH) this.pendingAlert = true; this.startSearch(ctx, px, py); }
    else if (this.state === S.CHASE && !this.canSee) this.seenAgo = 0;
  }

  setState(s) {
    this.state = s; this.stateT = 0;
    if (s === S.ATTACK) { this.attackT = 0; this.blowDealt = false; this.swings++; }
    if (s === S.ALERT) this.pendingAlert = true;
  }

  // ---------------- navigation to a point ----------------
  setGoal(ctx, x, y) {
    this.goal.x = x; this.goal.y = y;
    if (!this.nav) this.nav = new FlowField(ctx.world);
    this.nav.setTarget(x, y);
    this.direct = corridorFree(ctx.world, this.x, this.y, x, y, this.k.r * 0.9);
    this.stuckT = 0; this.stuckX = this.x; this.stuckY = this.y;
  }
  /** Random standable point within `radius` cells of (cx, cy); falls back to (cx, cy). */
  pickPoint(ctx, cx, cy, radius) {
    const rng = ctx.rng || Math.random, w = ctx.world;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = (0.35 + 0.65 * rng()) * radius;
      const px = Math.floor(cx + Math.cos(a) * d) + 0.5, py = Math.floor(cy + Math.sin(a) * d) + 0.5;
      if (canStand(w, px, py, this.k.r + 0.05)) { this.setGoal(ctx, px, py); return true; }
    }
    this.setGoal(ctx, Math.floor(cx) + 0.5, Math.floor(cy) + 0.5); return false;
  }
  startSearch(ctx, x, y) {
    this.setState(S.SEARCH); this.searchT = 0; this.lookT = 0; this.pointsLeft = this.def.searchPoints; this.arrived = false;
    this.setGoal(ctx, x, y);
  }
  startPatrol(ctx) {
    this.setState(S.PATROL); this.lookT = 0;
    // hunters drift towards the AREA where the player is (never his exact position); others roam near themselves
    if (this.hunter && ctx.playerAlive) this.pickPoint(ctx, ctx.player.x, ctx.player.y, this.k.scatter);
    else this.pickPoint(ctx, this.x, this.y, this.k.searchR * 1.5);
  }
  /** Direction towards the current goal → tmpDir. Returns the distance to the goal (cells). */
  goalDir() {
    const dx = this.goal.x - this.x, dy = this.goal.y - this.y, d = Math.hypot(dx, dy);
    if (this.direct || !this.nav || !this.nav.direction(this.x, this.y, tmpDir)) { tmpDir.x = dx / (d || 1); tmpDir.y = dy / (d || 1); }
    return d;
  }

  /** ctx = {world, player, playerAlive, flow, others, rng, onAlert(e), onSwing(e), onBlow(e, dmg), onLost(e), onReacquire(e)} */
  step(dt, ctx) {
    this.prevX = this.x; this.prevY = this.y; this.prevFacing = this.facing;
    this.stateT += dt; this.cooldown = Math.max(0, this.cooldown - dt); this.stun = Math.max(0, this.stun - dt);
    this.hit.t = Math.max(0, this.hit.t - dt);
    if (this.state === S.DEAD) {
      if (!this.fall) this.fall = this.chooseFall(ctx.world);
      if (this.deathT < 0.5) this.turnTo(this.fall.facing, dt * 1.6); // twists into the free direction while going down
      this.deathT += dt; if (this.deathT >= this.def.corpseTime) this.removed = true;
      stepPose(this, dt); return;
    }
    const p = ctx.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    // ---- senses: line of sight on a fixed cadence (cheap, staggered); never through walls
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT += this.def.senseInterval;
      this.canSee = ctx.playerAlive && d <= this.k.detect && lineOfSight(ctx.world, this.x, this.y, p.x, p.y);
      if (this.state === S.SEARCH || this.state === S.PATROL) this.direct = corridorFree(ctx.world, this.x, this.y, this.goal.x, this.goal.y, this.k.r * 0.9);
    }
    if (this.canSee) { this.lastSeen.x = p.x; this.lastSeen.y = p.y; this.seenAgo = 0; } else this.seenAgo += dt;
    if (this.pain) { // shot: it knows where that came from
      this.pain = false; this.alerted = true;
      if (ctx.playerAlive) {
        this.lastSeen.x = p.x; this.lastSeen.y = p.y; this.seenAgo = 0;
        if (this.state === S.IDLE || this.state === S.PATROL) this.setState(S.ALERT);
        else if (this.state === S.SEARCH) this.setState(S.CHASE);
      }
    }
    let want = 0, gx = 0, gy = 0, steer = false; // wanted speed (cells/s) and heading
    switch (this.state) {
      case S.IDLE:
        if (this.canSee) this.setState(S.ALERT);
        break;
      case S.ALERT:
        if (this.pendingAlert) { this.pendingAlert = false; this.alerted = true; ctx.onAlert && ctx.onAlert(this); }
        this.turnTo(Math.atan2(this.lastSeen.y - this.y, this.lastSeen.x - this.x), dt);
        if (this.stateT >= this.def.alertTime) this.setState(S.CHASE);
        break;
      case S.CHASE: {
        if (!ctx.playerAlive) { this.setState(S.IDLE); break; }
        if (!this.canSee && this.seenAgo > this.def.memoryTime) { // lost him: go to where he was last known to be
          ctx.onLost && ctx.onLost(this); this.startSearch(ctx, this.lastSeen.x, this.lastSeen.y); break;
        }
        if (!this.canSee) { this.lastSeen.x = p.x; this.lastSeen.y = p.y; } // still tracking by sound for memoryTime
        if (d <= this.k.atk && this.cooldown <= 0 && this.canSee) { this.setState(S.ATTACK); ctx.onSwing && ctx.onSwing(this); break; }
        want = d > this.k.atk * 2.5 ? this.k.run : this.k.walk + (this.k.run - this.k.walk) * Math.max(0, (d - this.k.atk) / (this.k.atk * 1.5));
        if (d <= this.k.atk * 0.8) want = 0; // close enough, waiting for the cooldown: do not push into the player
        // straight at the player if the corridor is free, otherwise downhill on the shared flow field
        if (this.canSee && corridorFree(ctx.world, this.x, this.y, p.x, p.y, this.k.r * 0.9)) { gx = dx / (d || 1); gy = dy / (d || 1); }
        else if (ctx.flow && ctx.flow.direction(this.x, this.y, tmpDir)) { gx = tmpDir.x; gy = tmpDir.y; }
        else { gx = dx / (d || 1); gy = dy / (d || 1); }
        steer = true;
        break;
      }
      case S.SEARCH: {
        if (this.pendingAlert) { this.pendingAlert = false; this.alerted = true; ctx.onAlert && ctx.onAlert(this); }
        if (this.canSee) { ctx.onReacquire && ctx.onReacquire(this); this.setState(S.CHASE); break; }
        if (!ctx.playerAlive) { this.setState(S.IDLE); break; }
        if (this.arrived) this.searchT += dt; // the time limit is for looking around, not for the run to the spot
        if (this.lookT > 0) { // standing at a search point, scanning left and right
          this.lookT -= dt; this.facing += Math.sin(this.stateT * 4.2) * 1.6 * dt;
          if (this.lookT <= 0) {
            if (this.pointsLeft > 0 && this.searchT < this.def.searchTime) { this.pointsLeft--; this.pickPoint(ctx, this.lastSeen.x, this.lastSeen.y, this.k.searchR); }
            else { ctx.onGiveUp && ctx.onGiveUp(this); if (this.hunter) this.startPatrol(ctx); else this.setState(S.IDLE); }
          }
          break;
        }
        const gd = this.goalDir(); gx = tmpDir.x; gy = tmpDir.y; steer = true;
        want = this.pointsLeft === this.def.searchPoints ? this.k.search : this.k.search * 0.6; // first leg: run; follow-ups: slower
        if (gd < 0.45 || this.searchT >= this.def.searchTime) { want = 0; steer = false; this.lookT = this.def.searchLook; this.arrived = true; }
        break;
      }
      case S.PATROL: {
        if (this.canSee) { this.setState(S.ALERT); break; }
        if (this.lookT > 0) { this.lookT -= dt; if (this.lookT <= 0) this.startPatrol(ctx); break; }
        const gd = this.goalDir(); gx = tmpDir.x; gy = tmpDir.y; steer = true; want = this.k.patrol;
        if (gd < 0.45) { want = 0; steer = false; this.lookT = this.def.patrolPause; }
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
    if (steer) {
      // separation from other infected (simple, O(n²) for a handful)
      for (const o of ctx.others) {
        if (o === this || !o.alive) continue;
        const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), min = this.k.r + o.k.r + 0.1;
        if (od > 1e-4 && od < min) { const s = (min - od) / min * 1.6; gx += ox / od * s; gy += oy / od * s; }
      }
      const gl = Math.hypot(gx, gy) || 1;
      this.turnTo(Math.atan2(gy / gl, gx / gl), dt);
    }
    // speed ramps (no instant start/stop), stun slows, then move along the facing with wall collision
    if (this.stun > 0) want *= 0.25;
    const a = this.k.accel * dt;
    this.speed = this.speed < want ? Math.min(want, this.speed + a) : Math.max(want, this.speed - a * 1.6);
    if (this.speed > 1e-4) {
      const x0 = this.x, y0 = this.y;
      moveEntity(ctx.world, this, Math.cos(this.facing) * this.speed * dt, Math.sin(this.facing) * this.speed * dt, this.k.r);
      const moved = Math.hypot(this.x - x0, this.y - y0);
      this.dist += moved; this.vx = (this.x - x0) / dt; this.vy = (this.y - y0) / dt;
    } else { this.vx = 0; this.vy = 0; }
    // stuck while trying to reach a point → choose another route / point
    if ((this.state === S.SEARCH || this.state === S.PATROL) && want > 0) {
      this.stuckT += dt;
      if (this.stuckT >= this.def.stuckTime) {
        if (Math.hypot(this.x - this.stuckX, this.y - this.stuckY) < 0.15) { if (this.state === S.PATROL) this.startPatrol(ctx); else { this.lookT = 0.01; this.arrived = true; } }
        this.stuckT = 0; this.stuckX = this.x; this.stuckY = this.y;
      }
    }
    stepPose(this, dt);
  }

  /**
   * Where the dead body can fall without entering walls: the wanted direction is along the killing shot
   * (else backwards); neighbouring directions are tried in 22.5° steps; no free direction → crumple in place.
   */
  chooseFall(world) {
    const L = this.def.fallLength * M, hw = this.def.fallHalfWidth * M;
    const kl = Math.hypot(this.killDir.x, this.killDir.y);
    const want = kl > 1e-6 ? Math.atan2(this.killDir.y, this.killDir.x) : this.facing + Math.PI;
    for (const k of FALL_STEPS) {
      const a = want + k * Math.PI / 8, ex = this.x + Math.cos(a) * L, ey = this.y + Math.sin(a) * L;
      if (!corridorFree(world, this.x, this.y, ex, ey, hw)) continue;
      const front = Math.cos(a - this.facing) >= 0; // smaller twist: fall on the face or on the back
      return { kind: front ? 'front' : 'back', facing: front ? a : a + Math.PI, angle: a };
    }
    return { kind: 'crumple', facing: this.facing, angle: this.facing };
  }

  turnTo(target, dt) {
    let diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
    const max = this.def.turnRate * dt;
    if (diff > max) diff = max; else if (diff < -max) diff = -max;
    this.facing += diff;
  }

  /** Serializable view for debugging / tests. */
  info() {
    return { id: this.id, state: this.state, hp: this.hp, alive: this.alive, x: this.x, y: this.y, facing: this.facing, speed: this.speed, canSee: this.canSee, seenAgo: this.seenAgo, lastSeen: { ...this.lastSeen }, swings: this.swings, blows: this.blows, removed: this.removed, fall: this.fall && this.fall.kind };
  }
}
