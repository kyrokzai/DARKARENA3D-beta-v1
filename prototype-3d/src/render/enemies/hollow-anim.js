// Procedural animation of THE HOLLOW (M1.6). Every gameplay-relevant value comes from the SIMULATION pose
// (e.pose, sim/enemies/hollow-rig.js: gait phase, lean, attack swing, hit impulse, hips height) — computed at the
// fixed 60 Hz step, so timing never depends on the frame rate and the bones match the sim's hit zones.
// This file adds what only the eye needs: leg IK (planted feet), arms, breathing, head searching, death falls.
// No clips, no allocations per frame. When the game is paused dt = 0 and the sim pose does not change → frozen.
import { LEG, STRIDE, HIT_ROLL } from '../../sim/enemies/hollow-rig.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
// side tables built once (no per-frame arrays or string concatenation)
const LEGS = [
  { thigh: 'thighL', shin: 'shinL', foot: 'footL', sx: 1, off: 0.03, idleF: 0.07, out: 0.16 },   // left leg lands a little late → limp
  { thigh: 'thighR', shin: 'shinR', foot: 'footR', sx: -1, off: 0.5, idleF: -0.05, out: -0.1 },
];
const ARMS = [
  { clav: 'clavL', up: 'upperArmL', fore: 'foreArmL', hand: 'handL', sx: 1, off: 0.5, left: true },  // arm swings with the opposite leg
  { clav: 'clavR', up: 'upperArmR', fore: 'foreArmR', hand: 'handR', sx: -1, off: 0, left: false },
];
const ik = { thigh: 0, knee: 0 };

export function createAnimState(seed = 0) {
  return { t: seed * 3.1, twitch: 0, twitchT: 1, seed, look: 0 };
}

/** Two-bone leg IK in the sagittal plane: hip at height hipY, ankle target (f forward, y up). */
function legIK(f, hipY, footY) {
  const L1 = LEG.thigh, L2 = LEG.shin, dy = hipY - footY;
  const d = clamp(Math.hypot(f, dy), 0.12, L1 + L2 - 0.004), g = Math.atan2(f, dy);
  const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  ik.thigh = -(g + a); ik.knee = knee; // world pitch of the thigh (bone points down; negative = forward), knee flex ≥ 0
}

/**
 * e = infected sim object (pose, state, stateT, def, deathT, fall, speed). bones = {name: THREE.Bone}.
 * dt = render delta (0 while paused). cell = metres per cell.
 */
export function animateHollow(e, bones, a, dt, cell = 2) {
  a.t += dt;
  const p = e.pose, def = e.def, b = bones, dead = e.state === 'DEAD';
  const mk = p.moveK, rk = p.runK, ph = p.phase, hk = p.hitK;
  const breathe = Math.sin(a.t * 1.7 + a.seed) * (1 - mk * 0.6), breathe2 = Math.sin(a.t * 0.9 + a.seed * 2.1);
  const turn = clamp(-p.turn * 0.11, -0.45, 0.45);           // model yaw is the negative of the sim facing
  const sway = Math.sin(ph), bob = Math.cos(ph);
  // ---- trunk: sagittal angles from the sim pose + cosmetic yaw / roll (weight shift, counter-rotation, turning)
  b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0);
  b.hips.position.set(-sway * 0.03 * mk, p.hipsY, 0);        // weight moves over the supporting leg
  b.hips.rotation.set(p.hipsPitch, sway * 0.11 * mk + turn * 0.2, -sway * 0.06 * mk + 0.03 + breathe2 * 0.012 * (1 - mk));
  b.spine.rotation.set(p.spinePitch + breathe * 0.012, -sway * 0.09 * mk + turn * 0.35, sway * 0.04 * mk - 0.04 + HIT_ROLL.spine * p.hitZ * hk);
  b.chest.rotation.set(p.chestPitch + breathe * 0.028, -sway * 0.11 * mk + turn * 0.45 - p.across * 0.45 + p.lunge * 0.25, 0.07 + breathe * 0.012 + HIT_ROLL.chest * p.hitZ * hk);
  b.neck.rotation.set(p.neckPitch, turn * 0.5, -0.05);
  // head: looks where it is going (leads the turn); slow searching looks + rare twitches when not moving
  a.twitchT -= dt; if (a.twitchT <= 0 && dt > 0) { a.twitch = Math.sin(a.t * 91.7 + a.seed * 7) * 0.28; a.twitchT = 1.4 + Math.abs(Math.sin(a.t * 13.3)) * 2.6; }
  a.twitch *= Math.exp(-dt * 9);
  const search = e.state === 'SEARCH' && e.lookT > 0 ? 1 : 0;
  a.look += ((Math.sin(a.t * 0.43 + a.seed) * 0.26 * (1 - mk) + Math.sin(a.t * 2.3) * 0.5 * search) - a.look) * Math.min(1, dt * 5);
  b.head.rotation.set(p.headPitch + breathe * 0.02, a.look + a.twitch + turn * 0.7, 0.16 + a.twitch * 0.5 + HIT_ROLL.head * p.hitZ * hk);
  b.jaw.rotation.set(0.2 + breathe * 0.04 + 0.5 * p.alertK + 0.35 * Math.min(1, p.raise), 0, 0.03);

  // ---- legs: planted feet. The stance foot moves backwards under the body exactly as fast as the body moves
  // forward (phase comes from the distance really travelled), the swing foot arcs forward → no sliding.
  const stride = STRIDE.walk + (STRIDE.run - STRIDE.walk) * rk, duty = 0.6 - 0.22 * rk;
  const hipY = p.hipsY - LEG.hipDrop, cyc = ph / TAU;
  for (const L of LEGS) {
    let u = cyc + L.off; u -= Math.floor(u);
    let f, lift = 0, toe = 0;
    if (u < duty) { const s = u / duty; f = (0.5 - s) * duty * stride; toe = s > 0.7 ? (s - 0.7) / 0.3 * 0.55 : (s < 0.12 ? -(0.12 - s) / 0.12 * 0.25 : 0); } // heel strike → toe-off
    else { const s = (u - duty) / (1 - duty); f = (-0.5 + smooth(s)) * duty * stride; lift = Math.sin(s * Math.PI) * (0.06 + 0.16 * rk); toe = 0.55 * (1 - s) * (1 - s) - 0.2 * s; }
    f = mix(L.idleF, f, mk); lift *= mk; toe *= mk;
    legIK(f, hipY - Math.abs(sway) * 0.0, LEG.ankle + lift);
    b[L.thigh].rotation.set(ik.thigh - p.hipsPitch, L.out * (1 - mk * 0.6), L.sx * 0.035);
    b[L.shin].rotation.set(ik.knee, 0, 0);
    b[L.foot].rotation.set(-(ik.thigh + ik.knee) + toe, 0, 0);   // sole stays flat, heel lifts at toe-off
  }
  // ---- arms: hang with bent elbows (walk), reach for the player and pump opposite to the legs (run)
  for (const R of ARMS) {
    const sw = Math.sin(ph + R.off * TAU) * (0.3 + rk * 0.3) * mk;
    b[R.clav].rotation.set(0, 0, R.sx * (R.left ? -0.16 : 0.04) + breathe * 0.01 * R.sx);
    b[R.up].rotation.set(-0.12 - rk * 0.75 + sw - 0.18 * p.alertK, 0, R.sx * (0.13 + 0.3 * p.alertK + 0.28 * hk) + breathe * 0.008);
    b[R.fore].rotation.set(-0.42 - rk * 0.45 - Math.max(0, sw) * 0.5 + Math.sin(a.t * 2.1 + R.off * 6) * 0.03, 0, 0);
    b[R.hand].rotation.set(-0.25 + rk * 0.3, 0, R.sx * 0.1);
  }
  // ---- attack: right claw — wind-up (back and up), strike (down across the body), follow-through → stance
  if (p.raise > 0.001 || Math.abs(p.across) > 0.001 || Math.abs(p.lunge) > 0.001) {
    b.upperArmR.rotation.x = b.upperArmR.rotation.x * (1 - Math.min(1, p.raise * 2 + Math.abs(p.across) * 2)) - 0.15 - p.raise - p.across * 0.9;
    b.upperArmR.rotation.z -= p.across * 0.35 + Math.max(0, p.raise - 1.2) * 0.25;
    b.upperArmR.rotation.y = p.across * 0.7;
    b.foreArmR.rotation.x = -0.5 - p.raise * 0.3 - Math.max(0, p.across) * 0.5;
    b.handR.rotation.x = -0.5 * Math.min(1, p.raise) + 0.3 * Math.max(0, p.across);
    b.upperArmL.rotation.x -= Math.max(0, p.lunge) * 1.5;      // the other claw reaches too
    b.upperArmL.rotation.z += Math.max(0, -p.lunge) * 1.2;
  }

  // ---- death: knees buckle, then the body falls along the direction the SIM found free of walls
  if (dead) deathPose(e, b, a);
}

let FALL_K = 0;
/** Blend one Euler axis towards v by k (default: the current fall weight). Module-level: nothing allocated per frame. */
function L(rot, axis, v, k = FALL_K) { rot[axis] = rot[axis] * (1 - k) + v * k; }

/** Blend the live pose into the final lying pose. Kinds: back (on the back), front (face down), crumple (folds in place). */
function deathPose(e, b, a) {
  const T = e.deathT, kind = e.fall ? e.fall.kind : 'back', def = e.def;
  const kb = smooth(clamp(T / 0.3, 0, 1));                      // knees give way
  const ft = clamp((T - 0.12) / 0.62, 0, 1), fall = ft * ft * (3 - 2 * ft) * (0.35 + 0.65 * ft); // accelerates like a real fall
  const settle = T > 0.74 ? Math.exp(-(T - 0.74) * 9) * Math.sin((T - 0.74) * 22) * 0.035 : 0;   // small bounce on impact
  const sink = clamp((T - (def.corpseTime - 0.6)) / 0.6, 0, 1); // disposal: the body sinks just before removal
  FALL_K = fall;
  if (kind === 'crumple') {
    const k = smooth(clamp(T / 0.7, 0, 1));
    b.hips.position.y = mix(b.hips.position.y, 0.3, k); b.hips.position.x *= (1 - k);
    L(b.hips.rotation, 'x', 0.35, k); L(b.hips.rotation, 'z', 0.12, k); L(b.hips.rotation, 'y', 0, k);
    L(b.spine.rotation, 'x', 0.75, k); L(b.chest.rotation, 'x', 0.55, k); L(b.chest.rotation, 'y', 0.1, k);
    L(b.neck.rotation, 'x', 0.5, k); L(b.head.rotation, 'x', 0.35, k); L(b.head.rotation, 'y', 0.4, k); L(b.jaw.rotation, 'x', 0.45, k);
    for (const Lg of LEGS) { legIK(0.16, 0.3 * k + (b.hips.position.y - LEG.hipDrop) * (1 - k), LEG.ankle); L(b[Lg.thigh].rotation, 'x', ik.thigh - 0.35, k); L(b[Lg.shin].rotation, 'x', ik.knee, k); L(b[Lg.foot].rotation, 'x', -(ik.thigh + ik.knee), k); L(b[Lg.thigh].rotation, 'y', Lg.sx * 0.25, k); }
    for (const R of ARMS) { L(b[R.up].rotation, 'x', -0.55, k); L(b[R.up].rotation, 'z', R.sx * 0.2, k); L(b[R.up].rotation, 'y', 0, k); L(b[R.fore].rotation, 'x', -0.5, k); }
    b.root.position.y = -0.5 * sink;
    return;
  }
  const dir = kind === 'front' ? 1 : -1;                         // +1: falls on its face, −1: on its back
  // buckle first (legs fold under the weight), then straighten out along the floor as the body goes down
  b.hips.position.y = mix(b.hips.position.y - 0.28 * kb, 0.97, fall); b.hips.position.x *= (1 - fall);
  b.root.rotation.x = dir * (Math.PI / 2) * fall + settle * dir;
  b.root.position.y = (kind === 'front' ? 0.125 : 0.115) * fall - 0.5 * sink; // lies ON the floor (half the body depth)
  L(b.hips.rotation, 'x', 0); L(b.hips.rotation, 'y', 0); L(b.hips.rotation, 'z', 0.04);
  L(b.spine.rotation, 'x', kind === 'front' ? -0.04 : 0.03); L(b.spine.rotation, 'y', 0.06); L(b.spine.rotation, 'z', 0);
  L(b.chest.rotation, 'x', kind === 'front' ? -0.06 : 0.02); L(b.chest.rotation, 'y', -0.05); L(b.chest.rotation, 'z', 0.03);
  L(b.neck.rotation, 'x', kind === 'front' ? -0.3 : -0.05); L(b.neck.rotation, 'y', 0.25);
  L(b.head.rotation, 'x', kind === 'front' ? -0.35 : -0.12); L(b.head.rotation, 'y', kind === 'front' ? 0.95 : 0.55); L(b.head.rotation, 'z', 0.1);
  L(b.jaw.rotation, 'x', 0.5);
  for (const Lg of LEGS) {
    const th = b[Lg.thigh].rotation, sh = b[Lg.shin].rotation, fo = b[Lg.foot].rotation, isL = Lg.sx > 0;
    // while buckling the knees fold (feet stay under the body); lying: legs nearly straight, slightly apart, one knee bent
    const fold = kb * (1 - fall);
    th.x = th.x * (1 - fall) - 0.55 * fold + (kind === 'front' ? (isL ? 0.02 : 0.05) : (isL ? -0.3 : -0.06)) * fall;
    sh.x = sh.x * (1 - fall) + 1.1 * fold + (kind === 'front' ? (isL ? 0.1 : 0.04) : (isL ? 0.55 : 0.1)) * fall;
    th.z = Lg.sx * (0.035 + 0.14 * fall); th.y = Lg.sx * 0.2 * fall;
    fo.x = fo.x * (1 - fall) + (kind === 'front' ? 1.25 : (isL ? 0.15 : 0.35)) * fall; // face down: insteps flat on the floor
  }
  for (const R of ARMS) {
    const u = b[R.up].rotation, f = b[R.fore].rotation, h = b[R.hand].rotation;
    // arms flop out to the sides IN the plane of the body, so they end flat on the floor whichever way it fell
    const flail = Math.sin(clamp(T / 0.5, 0, 1) * Math.PI) * (1 - fall);
    u.x = u.x * (1 - fall) - 0.9 * flail; u.y = u.y * (1 - fall);
    u.z = u.z * (1 - fall) + R.sx * (kind === 'front' ? (R.left ? 2.3 : 1.2) : (R.left ? 1.15 : 0.6)) * fall + R.sx * 0.5 * flail;
    f.x = f.x * (1 - fall) + (kind === 'front' ? 0 : -0.12) * fall; L(f, 'z', R.sx * (kind === 'front' ? -0.5 : 0.25));
    L(h, 'x', 0.1);
  }
}
