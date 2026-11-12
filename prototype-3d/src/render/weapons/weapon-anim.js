// The ONE reload timeline for DA-R1 RAVEN (replaces the M1.3 viewmodel choreography; same 1.3 s, driven by the
// sim's reload progress r ∈ [0, 1]). It decides weapon tilt, old/new magazine, charging handle and which hand pose
// is used when — the viewmodel applies the weapon part, the hands controller applies the hand part.
//
//  r     what happens
//  0.00  left hand on the handguard            0.36  old mag let go — it drops out of view
//  0.07  hand releases the handguard           0.40  hand goes down to the pouch (off-screen)
//  0.16  hand reaches the magazine             0.46  hand comes back up holding the NEW magazine
//  0.22  fingers close on the magazine         0.62  new mag inserted (spare → real mag, same place)
//  0.22–0.36 magazine pulled out WITH the hand
//  0.65  palm slap seats it                   0.785 hooks the charging handle (moves round the left side)
//  0.86  handle pulled back fully, released → snaps forward   0.96–1.0 hand back under the handguard
const smooth = t => t * t * (3 - 2 * t);
const seg = (r, a, b) => Math.max(0, Math.min(1, (r - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;

/** Left-hand keyframes [r, poseName]; consecutive keys are blended with smoothstep. */
export const LEFT_KEYS = [
  [0.00, 'leftGuard'], [0.07, 'leftRelease'], [0.12, 'leftReachWay'], [0.17, 'leftMagReach'], [0.22, 'leftMagHold'],
  [0.36, 'leftMagHold'], [0.40, 'leftMagLetGo'], [0.46, 'leftSpareHold'], [0.62, 'leftSpareHold'], [0.63, 'leftMagLetGo'],
  [0.643, 'leftSlapPre'], [0.655, 'leftMagSlap'], [0.668, 'leftMagSlap'], [0.68, 'leftSlapPre'], [0.70, 'leftWayLow'], [0.73, 'leftWayUp'],
  [0.75, 'leftChargeHigh'], [0.77, 'leftChargePre'], [0.785, 'leftCharge'], [0.86, 'leftCharge'], [0.875, 'leftChargeOpen'],
  [0.89, 'leftChargeHigh'], [0.91, 'leftWayTop'], [0.93, 'leftWayTop2'], [0.955, 'leftWayBack'], [0.975, 'leftGuardPre'], [1.0, 'leftGuard'],
];
export const STAGES = [
  { r: 0.04, name: 'отпускает цевьё' }, { r: 0.19, name: 'берёт магазин' }, { r: 0.30, name: 'извлекает магазин' },
  { r: 0.43, name: 'смена магазина' }, { r: 0.55, name: 'новый магазин к шахте' }, { r: 0.64, name: 'досылает магазин' },
  { r: 0.83, name: 'рукоять заряжания' }, { r: 0.95, name: 'возврат на цевьё' },
];

const out = {
  rig: { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 },
  mag: { x: 0, y: 0, z: 0, rx: 0, visible: true }, spare: { x: 0, y: 0, z: 0, visible: false },
  charging: 0, left: { a: 'leftGuard', b: 'leftGuard', t: 0 }, rightIndexOff: 0,
};

/** Evaluate the timeline at reload progress r (−1 = not reloading). Returns a shared object (no allocations). */
export function reloadTimeline(r) {
  const o = out;
  if (r < 0) {
    Object.assign(o.rig, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
    Object.assign(o.mag, { x: 0, y: 0, z: 0, rx: 0, visible: true }); o.spare.visible = false;
    o.charging = 0; o.left.a = o.left.b = 'leftGuard'; o.left.t = 0; o.rightIndexOff = 0;
    return o;
  }
  // weapon tilt: show the magazine well (0.03–0.70), then the top/rear for the charging handle (0.70–0.90)
  const inA = smooth(seg(r, 0.02, 0.12)), toB = smooth(seg(r, 0.66, 0.76)), back = smooth(seg(r, 0.89, 1.0));
  const A = { rx: 0.14, ry: 0.10, rz: 0.40, px: -0.035, py: 0.05, pz: -0.01 };
  const B = { rx: 0.08, ry: 0.04, rz: 0.10, px: -0.02, py: 0.025, pz: 0.0 };
  for (const k of Object.keys(A)) o.rig[k] = lerp(lerp(0, A[k], inA), B[k], toB) * (1 - back);
  // old magazine: pulled down with the hand, then let go → falls out of view, hidden until the swap
  const pull = smooth(seg(r, 0.22, 0.36));
  o.mag.x = 0; o.mag.y = -0.12 * pull; o.mag.z = -0.012 * pull; o.mag.rx = 0;
  if (r >= 0.36 && r < 0.62) {
    const t = (r - 0.36) * 1.3; // seconds since let go
    o.mag.y = -0.12 - 4.9 * t * t - 0.6 * t; o.mag.x = -0.15 * t; o.mag.rx = -2.2 * t;
  }
  o.mag.visible = r < 0.5 || r >= 0.62;
  if (r >= 0.62) { o.mag.y = 0; o.mag.x = 0; o.mag.z = 0; o.mag.rx = 0; o.mag.y += 0.006 * Math.sin(Math.min(1, seg(r, 0.62, 0.665)) * Math.PI); }
  // new magazine: from the pouch (below the frame) up to the well, inserted at 0.62
  o.spare.visible = r >= 0.43 && r < 0.62;
  const up = smooth(seg(r, 0.43, 0.54)), ins = smooth(seg(r, 0.54, 0.62));
  o.spare.y = lerp(lerp(-0.36, -0.10, up), 0, ins); o.spare.x = lerp(-0.05, 0, up); o.spare.z = lerp(-0.02, -0.01, up) * (1 - ins);
  // charging handle
  o.charging = 0.055 * smooth(seg(r, 0.79, 0.86)) * (1 - smooth(seg(r, 0.865, 0.885)));
  // left hand keys
  let k = 0; while (k < LEFT_KEYS.length - 2 && r >= LEFT_KEYS[k + 1][0]) k++;
  const [r0, a] = LEFT_KEYS[k], [r1, b] = LEFT_KEYS[k + 1];
  o.left.a = a; o.left.b = b; o.left.t = smooth(seg(r, r0, r1));
  // right index finger leaves the trigger during the reload
  o.rightIndexOff = smooth(seg(r, 0.02, 0.1)) * (1 - smooth(seg(r, 0.9, 1)));
  return o;
}

// ---- M1.9 rifle-butt strike: ONE timeline driven by the sim's melee progress p ∈ [0, 1] (GameState.melee) ----
//  p     what happens (duration 0.6 s, the blow lands at p = 0.32 — melee.hitAt in defs.js)
//  0.00  grip pose
//  0.20  wind-up: the rifle is pulled back and to the right, muzzle tips left (stock cocked)
//  0.32  strike: the stock/receiver sweeps forward across the centre of the view (impact frame)
//  0.42  short hold at full extension (impact reads clearly, no blur of motion)
//  1.00  smooth return to the grip
// Keys: [p, rig offsets] — rx pitch (+ = muzzle up), ry yaw (+ = muzzle left), rz roll, px/py/pz metres (−z = forward).
export const MELEE_KEYS = [
  [0.00, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }],
  [0.20, { rx: 0.12, ry: 0.38, rz: -0.25, px: 0.06, py: -0.04, pz: 0.05 }],
  [0.32, { rx: 0.38, ry: -1.55, rz: 0.30, px: 0.03, py: 0.035, pz: -0.19 }],
  [0.42, { rx: 0.36, ry: -1.62, rz: 0.32, px: 0.025, py: 0.03, pz: -0.20 }],
  [1.00, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }],
];
const meleeOut = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0, phase: 'none' };
/** Evaluate the strike at progress p (< 0 = no strike). Returns a shared object (no allocations). */
export function meleeTimeline(p) {
  const o = meleeOut;
  if (!(p >= 0)) { o.rx = o.ry = o.rz = o.px = o.py = o.pz = 0; o.phase = 'none'; return o; }
  p = Math.min(1, p);
  let k = 0; while (k < MELEE_KEYS.length - 2 && p >= MELEE_KEYS[k + 1][0]) k++;
  const [p0, a] = MELEE_KEYS[k], [p1, b] = MELEE_KEYS[k + 1];
  // wind-up and return eased; the strike itself is fast-in (ease-out) so the blow snaps
  const u = seg(p, p0, p1), t = k === 1 ? 1 - (1 - u) * (1 - u) * (1 - u) : smooth(u);
  for (const key of ['rx', 'ry', 'rz', 'px', 'py', 'pz']) o[key] = lerp(a[key], b[key], t);
  o.phase = p < 0.2 ? 'windup' : p < 0.42 ? 'strike' : 'return';
  return o;
}
