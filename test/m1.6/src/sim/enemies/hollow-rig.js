// THE HOLLOW — rig data + pose maths shared by the SIMULATION (hit zones) and the RENDERER (bones).
// Pure JS (no DOM, no three.js). One source of truth: the sim computes the pose scalars every fixed tick
// (deterministic, frame-rate independent), derives the animated hit zones from them, and the renderer applies
// exactly the same angles to the bones — so a bullet hits where the infected is drawn.
// Units here are METRES and RADIANS (the sim converts to cells where needed).

/** Skeleton: [name, parent, bind offset from parent]. Model faces +Z, Y up, feet at y = 0. */
export const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.97, 0]],
  ['spine', 'hips', [0, 0.12, 0]],
  ['chest', 'spine', [0, 0.25, 0.0]],
  ['neck', 'chest', [0, 0.25, 0.02]],
  ['head', 'neck', [0, 0.13, 0.02]],
  ['jaw', 'head', [0, 0.0, 0.035]],
  ['clavL', 'chest', [0.05, 0.2, 0]], ['upperArmL', 'clavL', [0.14, 0, 0]], ['foreArmL', 'upperArmL', [0, -0.31, 0]], ['handL', 'foreArmL', [0, -0.28, 0]],
  ['clavR', 'chest', [-0.05, 0.2, 0]], ['upperArmR', 'clavR', [-0.14, 0, 0]], ['foreArmR', 'upperArmR', [0, -0.31, 0]], ['handR', 'foreArmR', [0, -0.28, 0]],
  ['thighL', 'hips', [0.095, -0.03, 0]], ['shinL', 'thighL', [0, -0.46, 0]], ['footL', 'shinL', [0, -0.45, 0]],
  ['thighR', 'hips', [-0.095, -0.03, 0]], ['shinR', 'thighR', [0, -0.46, 0]], ['footR', 'shinR', [0, -0.45, 0]],
];
export const LEG = { thigh: 0.46, shin: 0.45, hipDrop: 0.03, ankle: 0.07 };
export const STRIDE = { walk: 1.2, run: 2.3 };      // metres per full gait cycle (two steps)
export const HEAD_CENTRE = { y: 0.085, z: 0.015 };  // head sphere centre in the head bone's frame
export const CHEST_CENTRE = { y: 0.13, z: 0.0 };
export const BELLY_CENTRE = { y: 0.08, z: 0.0 };
export const HIT_ROLL = { spine: 0.06, chest: 0.12, head: 0.2 }; // rad of sideways roll at full side-hit reaction

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

export function createPose() {
  return {
    phase: 0, moveK: 0, runK: 0, alertK: 0, turn: 0,
    raise: 0, across: 0, lunge: 0,            // attack swing
    hitK: 0, hitX: 0, hitZ: 0, hitHead: 0,    // hit reaction (X: + = pushed backwards, Z: + = to its left)
    // sagittal chain (written by solvePose)
    hipsY: 0.92, hipsPitch: 0, spinePitch: 0, chestPitch: 0, neckPitch: 0, headPitch: 0,
    // derived hit-zone centres: forward offset from the feet (m) and height (m)
    headF: 0, headU: 1.6, chestF: 0, chestU: 1.25, bellyF: 0, bellyU: 1.05,
    headS: 0, chestS: 0, // sideways shift (m, towards its left) from the hit-reaction roll
  };
}

/** Attack swing curve: f = progress 0..1, hitAt = strike moment. Writes raise / across / lunge into p. */
export function attackCurve(f, hitAt, p) {
  const a = hitAt * 0.78, b = hitAt + 0.1;
  if (f <= 0 || f >= 1) { p.raise = 0; p.across = 0; p.lunge = 0; return; }
  if (f < a) { const t = smooth(f / a); p.raise = 2.5 * t; p.across = -0.25 * t; p.lunge = -0.12 * t; }          // wind-up: claw back and up, body coils
  else if (f < b) { const t = smooth((f - a) / (b - a)); p.raise = 2.5 - 2.35 * t; p.across = -0.25 + 1.0 * t; p.lunge = -0.12 + 0.47 * t; } // strike
  else { const t = smooth((f - b) / (1 - b)); p.raise = 0.15 * (1 - t); p.across = 0.75 * (1 - t); p.lunge = 0.35 * (1 - t); }            // follow-through → stance
}

/**
 * Advance the pose scalars one fixed step. e = infected (sim): speed (cells/s), dist (cells), state, stateT,
 * attackT, hit {t, x, y, zone, n}, facing, prevFacing, def. cell = metres per cell.
 */
export function stepPose(e, dt, cell = 2) {
  const p = e.pose, def = e.def, sp = e.speed * cell, dead = e.state === 'DEAD';
  const runK = clamp((sp - def.walkSpeed) / (def.runSpeed - def.walkSpeed), 0, 1);
  p.runK += (runK - p.runK) * Math.min(1, dt * 6);
  p.moveK += ((sp > 0.15 && !dead ? 1 : 0) - p.moveK) * Math.min(1, dt * 7);
  const stride = STRIDE.walk + (STRIDE.run - STRIDE.walk) * p.runK;
  p.phase += (e.dist - e.poseDist) * cell / stride * TAU; e.poseDist = e.dist;
  if (p.phase > 1e4) p.phase -= TAU * 1000;
  // turning (rad/s, smoothed) → head and shoulders lead into the turn
  const w = Math.atan2(Math.sin(e.facing - e.prevFacing), Math.cos(e.facing - e.prevFacing)) / dt;
  p.turn += (clamp(w, -4, 4) - p.turn) * Math.min(1, dt * 8);
  // alert scream envelope
  const alert = e.state === 'ALERT' ? Math.sin(Math.min(1, e.stateT / def.alertTime) * Math.PI) : 0;
  p.alertK += (alert - p.alertK) * Math.min(1, dt * 12);
  // attack swing (ATTACK only; the curve ends in the stance, so RECOVER needs no snap)
  if (e.state === 'ATTACK') attackCurve(e.attackT / def.attackDuration, def.attackHitAt, p);
  else { const k = Math.exp(-dt * 14); p.raise *= k; p.across *= k; p.lunge *= k; }
  // hit reaction: sharp impulse, eased return (0.35 s)
  if (e.hit.n !== e.poseHitN) {
    e.poseHitN = e.hit.n;
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    p.hitX = clamp(-(e.hit.x * fx + e.hit.y * fy), -1, 1);   // shot from the front → pushed back (+)
    p.hitZ = clamp(e.hit.x * -fy + e.hit.y * fx, -1, 1);
    p.hitHead = e.hit.zone === 'head' ? 1 : 0;
  }
  const ht = clamp(e.hit.t / 0.35, 0, 1);
  p.hitK = ht > 0.8 ? (1 - ht) / 0.2 : smooth(ht / 0.8);       // 0 → 1 in 70 ms, then eases back
  solvePose(p);
}

/** Sagittal chain angles from the pose scalars + forward kinematics for the hit zones. */
export function solvePose(p) {
  const lean = 0.3 + p.runK * 0.3, hx = p.hitX * p.hitK;
  p.hipsY = 0.97 - 0.05 - p.runK * 0.09 - Math.abs(Math.cos(p.phase)) * 0.03 * p.moveK - p.lunge * 0.05;
  p.hipsPitch = 0.05 + p.runK * 0.1 + p.lunge * 0.1;
  p.spinePitch = lean * 0.5 + p.lunge * 0.35 - 0.14 * hx;
  p.chestPitch = lean * 0.6 + p.lunge * 0.55 - 0.3 * hx * (1 - p.hitHead * 0.5) - 0.25 * p.alertK;
  p.neckPitch = 0.15 + p.runK * 0.1 + 0.1 * p.alertK - 0.1 * hx * p.hitHead;
  p.headPitch = -0.7 - p.runK * 0.3 - 0.15 * p.alertK - (0.12 + 0.5 * p.hitHead) * hx - p.lunge * 0.3;
  // FK in the (forward z, up y) plane; rotation.x = a turns +Y towards +Z
  let a = p.hipsPitch, z = 0, y = p.hipsY, s = Math.sin(a), c = Math.cos(a);
  // spine bone (0, .12, 0)
  z += 0.12 * s; y += 0.12 * c; a += p.spinePitch; s = Math.sin(a); c = Math.cos(a);
  p.bellyF = z + BELLY_CENTRE.y * s; p.bellyU = y + BELLY_CENTRE.y * c;
  // chest bone (0, .25, 0)
  z += 0.25 * s; y += 0.25 * c; a += p.chestPitch; s = Math.sin(a); c = Math.cos(a);
  p.chestF = z + CHEST_CENTRE.y * s; p.chestU = y + CHEST_CENTRE.y * c;
  // neck bone (0, .25, .02)
  z += 0.25 * s + 0.02 * c; y += 0.25 * c - 0.02 * s; a += p.neckPitch; s = Math.sin(a); c = Math.cos(a);
  // head bone (0, .13, .02)
  z += 0.13 * s + 0.02 * c; y += 0.13 * c - 0.02 * s; a += p.headPitch; s = Math.sin(a); c = Math.cos(a);
  p.headF = z + HEAD_CENTRE.y * s + HEAD_CENTRE.z * c; p.headU = y + HEAD_CENTRE.y * c - HEAD_CENTRE.z * s;
  // sideways: the spine and chest roll away from a side hit (HIT_ROLL, same numbers the renderer applies)
  const hz = p.hitZ * p.hitK;
  p.chestS = hz * (HIT_ROLL.spine * 0.38 + HIT_ROLL.chest * 0.13); p.headS = hz * (HIT_ROLL.spine * 0.72 + HIT_ROLL.chest * 0.47 + HIT_ROLL.head * 0.085);
  return p;
}
