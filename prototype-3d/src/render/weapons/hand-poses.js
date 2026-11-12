// Hand poses for DA-R1 RAVEN (data + a small grip solver). No rendering here.
// A pose = wrist position + hand orientation (in the frame it is attached to) + finger curls + thumb.
// Frames: 'model' (weapon), 'mag' (current magazine offset), 'spare' (new magazine), 'charging' (charging handle).
//
// Finger curls are SOLVED, not hand-typed: each joint bends until its phalanx touches a weapon proxy volume
// (oriented boxes approximating grip, handguard, magazine, charging handle…), so fingers wrap the weapon
// without passing through it. The same proxies are used by the M1.4 intersection tests.
import * as THREE from 'three';
import { PALM_LEN, FINGERS, fingerChain, thumbChain, fingerRadius } from './hands-model.js';

// ---------------------------------------------------------------- weapon proxy volumes (model space, metres)
const box = (name, c, half, axes = null, frame = 'model') => ({ name, c: new THREE.Vector3(...c), half: new THREE.Vector3(...half), axes: axes && axes.map(a => new THREE.Vector3(...a).normalize()), frame });
const gripAxis = [0, -0.955, 0.296], gripFwd = [0, -0.296, -0.955];
const magAxis = [0, -0.98, -0.2], magFwd = [0, 0.2, -0.98];
export const PROXIES = [
  box('grip', [0, -0.082, -0.0095], [0.0165, 0.064, 0.0175], [[1, 0, 0], gripAxis, gripFwd]),
  box('lower', [0, 0.003, -0.097], [0.023, 0.033, 0.109]),
  box('magwell', [0, -0.045, -0.135], [0.024, 0.036, 0.042]),
  box('guardBar', [0, -0.0615, -0.063], [0.006, 0.0055, 0.033]),
  box('upper', [0, 0.054, -0.104], [0.025, 0.020, 0.110]),
  box('handguard', [0, 0.045, -0.361], [0.028, 0.029, 0.147]),
  box('rail', [0, 0.081, -0.249], [0.0105, 0.007, 0.251]),
  box('sight', [0, 0.119, -0.113], [0.023, 0.031, 0.029]),
  box('rearSight', [0, 0.093, -0.015], [0.010, 0.0055, 0.013]),
  box('charging', [0, 0.070, 0.005], [0.028, 0.0035, 0.017], null, 'charging'),
  box('mag', [0, -0.115, -0.152], [0.013, 0.097, 0.034], [[1, 0, 0], magAxis, magFwd], 'mag'),
  box('spare', [0, -0.115, -0.152], [0.013, 0.097, 0.034], [[1, 0, 0], magAxis, magFwd], 'spare'),
];
// M2.0: the solver works on the CURRENT proxy set (RAVEN by default); AK-47 / KRAIT poses are solved against their own
// volumes with withProxies(list, fn). RAVEN's poses are computed exactly as before.
let PX = PROXIES;
export function withProxies(list, fn) { const prev = PX; PX = list; try { return fn(); } finally { PX = prev; } }
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
/** Signed distance from point (model space) to a proxy; offsets = {mag, spare, charging} Vector3 or null (inactive). */
export function proxyDistance(pt, b, offsets) {
  if (b.frame !== 'model' && !(offsets && offsets[b.frame])) return Infinity;
  _p.copy(pt).sub(b.c);
  if (b.frame !== 'model') _p.sub(offsets[b.frame]);
  if (b.axes) _p.set(_p.dot(b.axes[0]), _p.dot(b.axes[1]), _p.dot(b.axes[2]));
  _q.set(Math.abs(_p.x) - b.half.x, Math.abs(_p.y) - b.half.y, Math.abs(_p.z) - b.half.z);
  const outside = Math.hypot(Math.max(_q.x, 0), Math.max(_q.y, 0), Math.max(_q.z, 0));
  return outside + Math.min(Math.max(_q.x, _q.y, _q.z), 0);
}
export function sceneDistance(pt, offsets, ignore = null, list = PX) {
  let d = Infinity, who = null;
  for (const b of list) { if (ignore && ignore.includes(b.name)) continue; const x = proxyDistance(pt, b, offsets); if (x < d) { d = x; who = b.name; } }
  return { d, who };
}

// ---------------------------------------------------------------- pose helpers
const _m = new THREE.Matrix4();
/** Build a hand orientation from X (across knuckles) and Y (towards fingers); Z = X × Y = palm normal. */
function frameQuat(X, Y) {
  const x = new THREE.Vector3(...X).normalize(), y0 = new THREE.Vector3(...Y);
  const z = new THREE.Vector3().crossVectors(x, y0).normalize(), y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
}
/** Pose from the knuckle-row centre (MCP) — easier to place than the wrist. */
function pose({ mcp, X, Y, frame = 'model', f, spread = [0.02, 0, -0.03, -0.08], thumb }) {
  const quat = frameQuat(X, Y);
  const pos = new THREE.Vector3(...mcp).sub(new THREE.Vector3(0, PALM_LEN, 0).applyQuaternion(quat));
  return { pos, quat, frame, f: f || { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], pinky: [0, 0, 0] }, spread, thumb: thumb || { yaw: 0.4, pitch: 0.3, roll: 0, c: [0.2, 0.2] } };
}
export function clonePose(p) { return { pos: p.pos.clone(), quat: p.quat.clone(), frame: p.frame, f: Object.fromEntries(FINGERS.map(k => [k, p.f[k].slice()])), spread: p.spread.slice(), thumb: { ...p.thumb, c: p.thumb.c.slice() } }; }

// ---------------------------------------------------------------- grip solver
const mats = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()], pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const H = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1), seg = new THREE.Vector3();
/** Minimum clearance (distance − radius) of the finger segments from `from` to the tip. */
export function fingerClearance(Hm, side, f, curls, spread, offsets, from = 0, ignore = null) {
  fingerChain(Hm, side, f, curls, spread, mats, pts);
  let min = Infinity;
  for (let s = from; s < 3; s++) for (let k = 0; k <= 4; k++) {
    seg.lerpVectors(pts[s], pts[s + 1], k / 4);
    min = Math.min(min, sceneDistance(seg, offsets, ignore).d - fingerRadius(f, s));
  }
  return min;
}
function solveFinger(Hm, side, f, start, max, spread, offsets, gap, ignore) {
  // Phase 1: coupled curl (all joints together, physiological ratio) until the finger touches the weapon.
  const ratio = [1, 1.15, 0.75], c = start.slice();
  let last = start.slice();
  for (let t = 0; t <= 1.6; t += 0.02) {
    for (let j = 0; j < 3; j++) c[j] = Math.min(max[j], start[j] + t * ratio[j]);
    if (fingerClearance(Hm, side, f, c, spread, offsets, 0, ignore) <= gap) { for (let j = 0; j < 3; j++) c[j] = last[j]; break; }
    last = c.slice();
  }
  // Phase 2: let the middle and distal joints keep wrapping around the surface.
  for (let j = 1; j < 3; j++) {
    for (let a = c[j]; a <= max[j] + 1e-9; a += 0.03) {
      const prev = c[j]; c[j] = a;
      if (fingerClearance(Hm, side, f, c, spread, offsets, j, ignore) <= gap) { c[j] = prev; break; }
    }
  }
  return c;
}
/** Wrap fingers listed in `wrap` around the proxies (pose is in `frame`; offsets put that frame at rest). */
function solve(p, side, wrap, { start = [0.15, 0.1, 0.05], max = [1.55, 1.75, 1.25], gap = 0.0015, ignore = null } = {}) {
  const offsets = { mag: new THREE.Vector3(), spare: new THREE.Vector3(), charging: new THREE.Vector3(), pump: new THREE.Vector3() };
  // a pose in the 'mag' frame should only see the magazine proxy at rest; others are irrelevant there
  H.compose(p.pos, p.quat, ONE);
  for (const f of wrap) p.f[f] = solveFinger(H, side, f, start, max, p.spread[FINGERS.indexOf(f)], offsets, gap, ignore);
  return p;
}

// ---------------------------------------------------------------- reach solver (index on the trigger, thumbs)
const tipV = new THREE.Vector3();
function thumbClearance(Hm, side, th, offsets, ignore) {
  thumbChain(Hm, side, th, mats, pts);
  let min = Infinity;
  for (let s = 0; s < 3; s++) for (let k = 1; k <= 4; k++) { seg.lerpVectors(pts[s], pts[s + 1], k / 4); min = Math.min(min, sceneDistance(seg, offsets, ignore).d - fingerRadius('thumb', s)); }
  return min;
}
/** Grid search: put a fingertip on `target` (pose frame) while keeping ≥ `gap` clearance from the weapon. */
function reachFinger(p, side, f, target, { ignore = null, gap = 0.001, r1 = [-0.4, 1.1], r2 = [0, 1.6], r3 = [0.1, 0.7] } = {}) {
  const offsets = { mag: new THREE.Vector3(), spare: null, charging: new THREE.Vector3(), pump: new THREE.Vector3() };
  H.compose(p.pos, p.quat, ONE);
  const t = new THREE.Vector3(...target), sp = p.spread[FINGERS.indexOf(f)];
  let best = null;
  for (let a = r1[0]; a <= r1[1]; a += 0.05) for (let b = r2[0]; b <= r2[1]; b += 0.06) for (let c = r3[0]; c <= r3[1]; c += 0.15) {
    fingerChain(H, side, f, [a, b, c], sp, mats, pts);
    const dist = pts[3].distanceTo(t);
    if (best && dist > best.cost) continue;
    const cl = fingerClearance(H, side, f, [a, b, c], sp, offsets, 0, ignore);
    const cost = dist + Math.max(0, gap - cl) * 20;
    if (!best || cost < best.cost) best = { cost, c: [a, b, c] };
  }
  p.f[f] = best.c; return p;
}
function reachThumb(p, side, target, { ignore = null, gap = 0.001 } = {}) {
  const offsets = { mag: new THREE.Vector3(), spare: null, charging: new THREE.Vector3(), pump: new THREE.Vector3() };
  H.compose(p.pos, p.quat, ONE);
  const t = new THREE.Vector3(...target);
  let best = null;
  for (let yaw = -0.4; yaw <= 1.8; yaw += 0.1) for (let pitch = -0.9; pitch <= 1.5; pitch += 0.1) for (const c of [[0.1, 0.1], [0.35, 0.3]]) {
    const th = { yaw, pitch, roll: 0, c };
    thumbChain(H, side, th, mats, pts);
    const dist = pts[3].distanceTo(t);
    if (best && dist > best.cost) continue;
    const cost = dist + Math.max(0, gap - thumbClearance(H, side, th, offsets, ignore)) * 20;
    if (!best || cost < best.cost) best = { cost, th };
  }
  p.thumb = best.th; return p;
}

// ---------------------------------------------------------------- the poses
const R = 1, L = -1; // sides
const relax = { index: [0.35, 0.45, 0.3], middle: [0.4, 0.5, 0.3], ring: [0.45, 0.5, 0.3], pinky: [0.5, 0.55, 0.3] };
const open = { index: [0.12, 0.1, 0.05], middle: [0.12, 0.1, 0.05], ring: [0.14, 0.12, 0.05], pinky: [0.16, 0.12, 0.05] };
const curled = { index: [0.9, 1.0, 0.6], middle: [0.95, 1.05, 0.6], ring: [1.0, 1.1, 0.6], pinky: [1.05, 1.1, 0.6] };
const MAG_ONLY = ['spare', 'grip', 'lower', 'magwell', 'guardBar', 'upper', 'handguard', 'rail', 'sight', 'rearSight', 'charging'];
const norm = (...v) => { const l = Math.hypot(...v); return v.map(x => x / l); };
export const TRIGGER_POINT = [0.0035, -0.040, -0.0605];

function buildPoses() {
  const P = {};
  // RIGHT: firing grip. Back of the hand on the right of the grip, knuckles at the front strap, middle/ring/pinky
  // wrap the grip, index finger on the trigger face, thumb resting on the right side above the grip.
  // index finger lifted in the palm plane (abduction) to line up with the trigger above the guard
  P.rightGrip = solve(pose({ mcp: [0.031, -0.074, 0.001], X: [0, 0.955, -0.296], Y: [0, -0.296, -0.955], spread: [0.36, 0, -0.03, -0.08] }), R, ['middle', 'ring', 'pinky'], { ignore: ['spare', 'mag'] });
  reachFinger(P.rightGrip, R, 'index', TRIGGER_POINT, { ignore: ['spare', 'mag'] });
  reachThumb(P.rightGrip, R, [0.031, 0.004, -0.012], { ignore: ['spare', 'mag'] });
  P.rightGripPull = clonePose(P.rightGrip); P.rightGripPull.f.index = P.rightGrip.f.index.map((c, i) => c + [0.06, 0.12, 0.08][i]);
  P.rightIndexOff = clonePose(P.rightGrip); P.rightIndexOff.f.index = [-0.8, 0.1, 0.05]; // trigger discipline (reload): straight, swung out along the frame
  // LEFT: support hand under the handguard, fingers diagonally up the right side, thumb along the left side.
  // knuckle row parallel to the handguard just outside its lower-right edge; fingers fan towards the muzzle (spread)
  P.leftGuard = solve(pose({ mcp: [0.0415, 0.001, -0.300], X: [0, 0, 1], Y: [1, 0, 0], spread: [0.38, 0.30, 0.22, 0.14] }), L, FINGERS, { ignore: ['mag', 'spare'], max: [1.6, 1.5, 1.15] });
  reachThumb(P.leftGuard, L, [-0.036, 0.034, -0.41], { ignore: ['mag', 'spare'] });
  P.leftRelease = clonePose(P.leftGuard); P.leftRelease.pos.add(new THREE.Vector3(-0.055, -0.045, 0.03)); P.leftRelease.f = { ...open };
  // LEFT on the magazine (frame: magazine): palm on the left face, fingers wrap its rear edge, thumb on the left face.
  P.leftMagHold = solve(pose({ frame: 'mag', mcp: [-0.027, -0.138, -0.118], X: [0, 1, 0], Y: [0, 0, 1] }), L, FINGERS, { ignore: MAG_ONLY });
  reachThumb(P.leftMagHold, L, [-0.017, -0.085, -0.165], { ignore: MAG_ONLY });
  P.leftMagReach = clonePose(P.leftMagHold); P.leftMagReach.pos.add(new THREE.Vector3(-0.07, -0.03, -0.012)); P.leftMagReach.f = { ...open };
  P.leftReachWay = clonePose(P.leftMagReach); P.leftReachWay.frame = 'model'; P.leftReachWay.pos.add(new THREE.Vector3(-0.045, -0.01, -0.09)); P.leftReachWay.f = { ...curled };
  P.leftSpareHold = clonePose(P.leftMagHold); P.leftSpareHold.frame = 'spare';
  P.leftMagLetGo = clonePose(P.leftMagHold); P.leftMagLetGo.pos.add(new THREE.Vector3(-0.035, -0.015, 0)); P.leftMagLetGo.f = { ...open };
  // LEFT palm slap under the magazine base (frame: magazine)
  P.leftMagSlap = solve(pose({ frame: 'mag', mcp: [0.0, -0.243, -0.214], X: [1, 0, 0], Y: [0, 0, -1] }), L, FINGERS, { ignore: MAG_ONLY, max: [1.1, 1.1, 0.8] });
  P.leftMagSlap.thumb = { yaw: 0.6, pitch: 0.2, roll: 0, c: [0.2, 0.2] };
  // LEFT hooks the charging handle's left wing and pulls it back (frame: charging handle)
  // overhand grab of the handle's left wing: palm down over the rear of the receiver, index + middle on the wing,
  // ring & little finger resting on the receiver top in front of it
  P.leftCharge = solve(pose({ frame: 'charging', mcp: [-0.066, 0.085, -0.016], X: [0, 0, -1], Y: [0.87, 0.5, 0], spread: [0, 0, 0, 0] }), L, FINGERS, { ignore: ['spare', 'mag'] });
  P.leftCharge.f.ring = [0.05, 0.15, 0.1]; P.leftCharge.f.pinky = [-0.05, 0.15, 0.1]; // lifted, clear of the rear sight as the handle travels
  P.leftCharge.thumb = { yaw: 0.35, pitch: 0.25, roll: 0, c: [0.75, 0.8] };
  // waypoints that keep the hand outside the weapon between grips: hand on the LEFT of the weapon,
  // palm towards it, fingers pointing forward along the barrel (never across the weapon)
  const flat = { index: [0.15, 0.2, 0.1], middle: [0.15, 0.2, 0.1], ring: [0.18, 0.22, 0.1], pinky: [0.2, 0.25, 0.1] };
  const side = (mcp, f = flat) => pose({ mcp, X: [0, -1, 0], Y: [0, 0, -1], f: { ...f }, thumb: { yaw: 0.3, pitch: -0.2, roll: 0, c: [0.1, 0.1] } });
  P.leftSlapPre = clonePose(P.leftMagSlap); P.leftSlapPre.pos.add(new THREE.Vector3(-0.05, -0.085, 0)); P.leftSlapPre.f = { ...open };
  P.leftChargeOpen = clonePose(P.leftCharge); P.leftChargeOpen.pos.add(new THREE.Vector3(-0.03, 0.05, 0.01)); P.leftChargeOpen.f = { ...open }; // lifts off upwards
  P.leftChargePre = clonePose(P.leftChargeOpen); P.leftChargePre.pos.add(new THREE.Vector3(0, 0, -0.02)); // comes down onto the handle from above
  P.leftChargeHigh = clonePose(P.leftChargePre); P.leftChargeHigh.pos.add(new THREE.Vector3(-0.02, 0.045, 0)); P.leftChargeHigh.f = { ...curled }; // fingers open/close only up here
  // the hand turns towards the charging handle (and back) well to the left of the weapon
  P.leftWayUp = clonePose(P.leftChargePre); P.leftWayUp.frame = 'model'; P.leftWayUp.pos.set(-0.19, -0.03, -0.06); P.leftWayUp.f = { ...curled };
  P.leftWayTop = clonePose(P.leftChargeOpen); P.leftWayTop.frame = 'model'; P.leftWayTop.pos.set(-0.19, 0.0, -0.10); P.leftWayTop.f = { ...curled };
  P.leftWayLow = clonePose(P.leftWayUp); P.leftWayLow.pos.set(-0.17, -0.32, -0.12);
  P.leftWayTop2 = side([-0.145, 0.0, -0.21], curled);
  P.leftWayBack = side([-0.08, -0.03, -0.30]);
  P.leftGuardPre = clonePose(P.leftGuard); P.leftGuardPre.pos.add(new THREE.Vector3(-0.03, -0.055, 0.01)); P.leftGuardPre.f = { ...open };
  return P;
}
export const POSES = buildPoses();

// ---------------------------------------------------------------- blending (no allocations: writes into `out`)
export function makePoseBuffer() { return clonePose(POSES.leftGuard); }
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** Resolve a pose into model space using frame offsets, then blend a→b by t into out. */
export function blendPoses(a, b, t, offsets, out) {
  _a.copy(a.pos); if (a.frame !== 'model') _a.add(offsets[a.frame]);
  _b.copy(b.pos); if (b.frame !== 'model') _b.add(offsets[b.frame]);
  out.pos.lerpVectors(_a, _b, t);
  out.quat.slerpQuaternions(a.quat, b.quat, t);
  for (const k of FINGERS) for (let i = 0; i < 3; i++) out.f[k][i] = a.f[k][i] + (b.f[k][i] - a.f[k][i]) * t;
  for (let i = 0; i < 4; i++) out.spread[i] = a.spread[i] + (b.spread[i] - a.spread[i]) * t;
  out.thumb.yaw = a.thumb.yaw + (b.thumb.yaw - a.thumb.yaw) * t;
  out.thumb.pitch = a.thumb.pitch + (b.thumb.pitch - a.thumb.pitch) * t;
  out.thumb.roll = a.thumb.roll + (b.thumb.roll - a.thumb.roll) * t;
  for (let i = 0; i < 2; i++) out.thumb.c[i] = a.thumb.c[i] + (b.thumb.c[i] - a.thumb.c[i]) * t;
  out.frame = 'model';
  return out;
}

// ---------------------------------------------------------------- penetration measurement (tests, tuning)
const _H2 = new THREE.Matrix4(), _pp = new THREE.Vector3();
/**
 * Deepest penetration of a hand (already blended into model space) into the weapon proxies.
 * Returns { depth (m, ≥ 0 = inside), part, proxy }. offsets: {mag, spare, charging} (null = proxy inactive).
 */
export function measurePenetration(p, side, offsets, ignore = null, list = PROXIES) {
  _H2.compose(p.pos, p.quat, ONE);
  let worst = { depth: -Infinity, part: '', proxy: '' };
  const consider = (pt, r, part) => { const { d, who } = sceneDistance(pt, offsets, ignore, list); const depth = r - d; if (depth > worst.depth) worst = { depth, part, proxy: who }; };
  FINGERS.forEach((f, k) => {
    fingerChain(_H2, side, f, p.f[f], p.spread ? p.spread[k] : 0, mats, pts);
    for (let s = 0; s < 3; s++) for (let q = 1; q <= 4; q++) { seg.lerpVectors(pts[s], pts[s + 1], q / 4); consider(seg, fingerRadius(f, s), f + (s + 1)); }
  });
  thumbChain(_H2, side, p.thumb, mats, pts);
  for (let s = 0; s < 3; s++) for (let q = 1; q <= 4; q++) { seg.lerpVectors(pts[s], pts[s + 1], q / 4); consider(seg, fingerRadius('thumb', s), 'thumb' + (s + 1)); }
  for (const x of [-0.028, 0, 0.028]) for (const y of [0.012, 0.045, 0.08]) { _pp.set(x, y, 0).applyMatrix4(_H2); consider(_pp, 0.0125, 'palm'); }
  return worst;
}

// ================================================================ M2.0: AK-47 MOD and DA-S12 KRAIT
// Proxy volumes of the two new guns (model space, same frame as RAVEN; see ak47-model.js / krait-model.js).
const akMagAxis = [0, -0.94, -0.34], akMagFwd = [0, 0.34, -0.94];
export const AK_PROXIES = [
  box('grip', [0, -0.082, -0.0095], [0.0165, 0.064, 0.0175], [[1, 0, 0], gripAxis, gripFwd]),
  box('lower', [0, 0.023, -0.105], [0.023, 0.040, 0.140]),
  box('magwell', [0, -0.022, -0.165], [0.014, 0.008, 0.036]),
  box('guardBar', [0, -0.0575, -0.070], [0.005, 0.0035, 0.040]),
  box('upper', [0, 0.071, -0.095], [0.020, 0.010, 0.123]),
  box('handguard', [0, 0.025, -0.389], [0.026, 0.030, 0.097]),
  box('handguardUp', [0, 0.075, -0.366], [0.018, 0.015, 0.066]),
  box('barrel', [0, 0.042, -0.600], [0.010, 0.010, 0.140]),
  box('rearSight', [0, 0.075, -0.266], [0.010, 0.012, 0.034]),
  box('sight', [0, 0.112, -0.091], [0.020, 0.025, 0.022]),
  box('mount', [-0.030, 0.060, -0.090], [0.006, 0.030, 0.045]),
  box('stock', [0, -0.020, 0.150], [0.020, 0.050, 0.120]),
  box('charging', [0.0345, 0.052, -0.168], [0.010, 0.0065, 0.0065], null, 'charging'),
  box('mag', [0, -0.118, -0.198], [0.013, 0.112, 0.030], [[1, 0, 0], akMagAxis, akMagFwd], 'mag'),
  box('spare', [0, -0.118, -0.198], [0.013, 0.112, 0.030], [[1, 0, 0], akMagAxis, akMagFwd], 'spare'),
];
export const KRAIT_PROXIES = [
  box('grip', [0, -0.082, -0.0095], [0.0165, 0.064, 0.0175], [[1, 0, 0], gripAxis, gripFwd]),
  box('lower', [0, 0.022, -0.122], [0.024, 0.052, 0.084]),        // receiver, front part (down to the loading port)
  box('lowerRear', [0, 0.030, -0.005], [0.024, 0.044, 0.035]),     // rear part: its bottom rises towards the grip
  box('guardBar', [0, -0.0595, -0.070], [0.006, 0.0035, 0.040]),
  box('rail', [0, 0.082, -0.105], [0.010, 0.006, 0.085]),
  box('ring', [0, 0.104, -0.014], [0.012, 0.012, 0.006]),
  box('saddle', [-0.030, 0.032, -0.095], [0.012, 0.026, 0.048]),
  box('barrel', [0, 0.055, -0.420], [0.013, 0.013, 0.215]),
  box('tube', [0, 0.020, -0.400], [0.0125, 0.0125, 0.195]),
  box('stock', [0, -0.010, 0.160], [0.019, 0.070, 0.090]),
  box('pump', [0, 0.015, -0.351], [0.028, 0.029, 0.089], null, 'pump'),
];
const AK_MAG_D = new THREE.Vector3(0, -0.003, -0.046);  // AK magazine vs RAVEN's (centre of its volume)

let akPoses = null, kraitPoses = null;
/** AK-47 poses: same names as RAVEN's (the shared reload timeline uses them), solved against the AK volumes. */
export function getAkPoses() {
  if (akPoses) return akPoses;
  akPoses = withProxies(AK_PROXIES, () => {
    const P = {};
    P.rightGrip = solve(pose({ mcp: [0.031, -0.074, 0.001], X: [0, 0.955, -0.296], Y: [0, -0.296, -0.955], spread: [0.36, 0, -0.03, -0.08] }), R, ['middle', 'ring', 'pinky'], { ignore: ['spare', 'mag'] });
    reachFinger(P.rightGrip, R, 'index', TRIGGER_POINT, { ignore: ['spare', 'mag'] });
    reachThumb(P.rightGrip, R, [0.031, 0.004, -0.012], { ignore: ['spare', 'mag'] });
    P.rightGripPull = clonePose(P.rightGrip); P.rightGripPull.f.index = P.rightGrip.f.index.map((c, i) => c + [0.06, 0.12, 0.08][i]);
    P.rightIndexOff = clonePose(P.rightGrip); P.rightIndexOff.f.index = [-0.8, 0.1, 0.05];
    // support hand under the wooden handguard (lower than RAVEN's), fingers up its right side, thumb along the left
    P.leftGuard = solve(pose({ mcp: [0.0405, -0.018, -0.360], X: [0, 0, 1], Y: [1, 0, 0], spread: [0.38, 0.30, 0.22, 0.14] }), L, FINGERS, { ignore: ['mag', 'spare'], max: [1.6, 1.5, 1.15] });
    reachThumb(P.leftGuard, L, [-0.034, 0.020, -0.405], { ignore: ['mag', 'spare'] });
    P.leftRelease = clonePose(P.leftGuard); P.leftRelease.pos.add(new THREE.Vector3(-0.055, -0.045, 0.03)); P.leftRelease.f = { ...open };
    const MAGS = ['spare', 'grip', 'lower', 'magwell', 'guardBar', 'upper', 'handguard', 'handguardUp', 'barrel', 'rearSight', 'sight', 'mount', 'stock', 'charging'];
    const at = (v, d = AK_MAG_D) => v.map((x, i) => x + [d.x, d.y, d.z][i]);
    P.leftMagHold = solve(pose({ frame: 'mag', mcp: at([-0.027, -0.138, -0.118]), X: [0, 1, 0], Y: [0, -0.34, 0.94] }), L, FINGERS, { ignore: MAGS });
    reachThumb(P.leftMagHold, L, at([-0.017, -0.085, -0.165]), { ignore: MAGS });
    P.leftMagReach = clonePose(P.leftMagHold); P.leftMagReach.pos.add(new THREE.Vector3(-0.07, -0.03, -0.012)); P.leftMagReach.f = { ...open };
    P.leftReachWay = clonePose(P.leftMagReach); P.leftReachWay.frame = 'model'; P.leftReachWay.pos.add(new THREE.Vector3(-0.045, -0.01, -0.09)); P.leftReachWay.f = { ...curled };
    P.leftSpareHold = clonePose(P.leftMagHold); P.leftSpareHold.frame = 'spare';
    P.leftMagLetGo = clonePose(P.leftMagHold); P.leftMagLetGo.pos.add(new THREE.Vector3(-0.035, -0.015, 0)); P.leftMagLetGo.f = { ...open };
    P.leftMagSlap = solve(pose({ frame: 'mag', mcp: [0.0, -0.262, -0.266], X: [1, 0, 0], Y: [0, 0, -1] }), L, FINGERS, { ignore: MAGS, max: [1.1, 1.1, 0.8] });
    P.leftMagSlap.thumb = { yaw: 0.6, pitch: 0.2, roll: 0, c: [0.2, 0.2] };
    // AK charging handle is on the RIGHT: the left hand reaches over the dust cover, palm towards the receiver's right
    // side, fingers hook the knob and pull it back
    P.leftCharge = solve(pose({ frame: 'charging', mcp: [0.056, 0.080, -0.170], X: [0, 0, -1], Y: [0.12, -0.99, 0], spread: [0, 0, 0, 0] }), L, FINGERS, { ignore: ['spare', 'mag'], max: [1.4, 1.5, 1.1] });
    // thumb on the right side ahead of / below the knob (over the top it would meet the red dot when the bolt goes back)
    reachThumb(P.leftCharge, L, [0.050, 0.030, -0.205], { ignore: ['spare', 'mag'] });
    const flat = { index: [0.15, 0.2, 0.1], middle: [0.15, 0.2, 0.1], ring: [0.18, 0.22, 0.1], pinky: [0.2, 0.25, 0.1] };
    const side = (mcp, f = flat) => pose({ mcp, X: [0, -1, 0], Y: [0, 0, -1], f: { ...f }, thumb: { yaw: 0.3, pitch: -0.2, roll: 0, c: [0.1, 0.1] } });
    P.leftSlapPre = clonePose(P.leftMagSlap); P.leftSlapPre.pos.add(new THREE.Vector3(-0.05, -0.085, 0)); P.leftSlapPre.f = { ...open };
    P.leftChargeOpen = clonePose(P.leftCharge); P.leftChargeOpen.pos.add(new THREE.Vector3(0.035, 0.03, 0.0)); P.leftChargeOpen.f = { ...open };
    P.leftChargePre = clonePose(P.leftChargeOpen); P.leftChargePre.pos.add(new THREE.Vector3(0, 0, -0.02));
    P.leftChargeHigh = clonePose(P.leftChargePre); P.leftChargeHigh.pos.add(new THREE.Vector3(0.0, 0.11, 0)); P.leftChargeHigh.f = { ...open }; // open while coming down onto the knob
    // the hand travels up the LEFT side, HIGH over the top (fingertips point down: they must clear the receiver and
    // the sight) to the right-side knob, and back the same way
    P.leftWayUp = clonePose(P.leftChargePre); P.leftWayUp.frame = 'model'; P.leftWayUp.pos.set(-0.11, 0.21, -0.17); P.leftWayUp.f = { ...curled };
    // (well clear of the receiver: the hand rotates from "over the top" back to "along the left side" out here)
    P.leftWayTop = side([-0.13, 0.20, -0.22], curled); // turned to "along the side, fingers forward" while still high over the receiver
    P.leftWayLow = clonePose(P.leftWayUp); P.leftWayLow.pos.set(-0.17, -0.32, -0.12);
    P.leftWayTop2 = side([-0.175, 0.0, -0.26], curled);
    P.leftWayBack = side([-0.08, -0.04, -0.34]);
    P.leftGuardPre = clonePose(P.leftGuard); P.leftGuardPre.pos.add(new THREE.Vector3(-0.03, -0.055, 0.01)); P.leftGuardPre.f = { ...open };
    return P;
  });
  return akPoses;
}
/** KRAIT poses: firing grip (same grip volume), support hand on the pump (frame 'pump'), shell loading under the port. */
export function getKraitPoses() {
  if (kraitPoses) return kraitPoses;
  kraitPoses = withProxies(KRAIT_PROXIES, () => {
    const P = {};
    P.rightGrip = solve(pose({ mcp: [0.031, -0.074, 0.001], X: [0, 0.955, -0.296], Y: [0, -0.296, -0.955], spread: [0.36, 0, -0.03, -0.08] }), R, ['middle', 'ring', 'pinky']);
    reachFinger(P.rightGrip, R, 'index', TRIGGER_POINT);
    reachThumb(P.rightGrip, R, [0.031, 0.004, -0.012]);
    P.rightGripPull = clonePose(P.rightGrip); P.rightGripPull.f.index = P.rightGrip.f.index.map((c, i) => c + [0.06, 0.12, 0.08][i]);
    P.rightIndexOff = clonePose(P.rightGrip); P.rightIndexOff.f.index = [-0.8, 0.1, 0.05];
    // support hand wrapped around the pump (follows it when it is racked)
    P.leftPump = solve(pose({ frame: 'pump', mcp: [0.0425, -0.030, -0.345], X: [0, 0, 1], Y: [1, 0, 0], spread: [0.38, 0.30, 0.22, 0.14] }), L, FINGERS, { max: [1.6, 1.5, 1.15] });
    reachThumb(P.leftPump, L, [-0.034, 0.020, -0.385]);
    P.leftPumpOff = clonePose(P.leftPump); P.leftPumpOff.pos.add(new THREE.Vector3(-0.04, -0.06, 0.02)); P.leftPumpOff.f = { ...open };
    // shell loading: palm up under the loading port, the thumb pushes the shell in
    // fingers stay nearly flat near the receiver (a curl up there would go into it); the hand only curls far below
    const hold = { index: [0.25, 0.3, 0.2], middle: [0.28, 0.32, 0.2], ring: [0.3, 0.35, 0.2], pinky: [0.32, 0.38, 0.2] };
    P.leftLoadPush = pose({ mcp: [0.0, -0.078, -0.192], X: [1, 0, 0], Y: [0, 0, -1], f: { ...hold }, thumb: { yaw: 0.9, pitch: 0.6, roll: 0, c: [0.4, 0.3] } });
    P.leftLoadReach = clonePose(P.leftLoadPush); P.leftLoadReach.pos.add(new THREE.Vector3(-0.01, -0.05, 0.01));
    P.leftLoadLow = clonePose(P.leftLoadPush); P.leftLoadLow.pos.add(new THREE.Vector3(-0.07, -0.20, 0.03));
    return P;
  });
  return kraitPoses;
}
