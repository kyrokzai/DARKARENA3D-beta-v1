// Procedural animation of THE HOLLOW. Pure function of the infected's sim state + per-instance memory:
// no clips, no allocations per frame. Layers (added on top of each other):
//   posture (hunch, asymmetry) → locomotion (walk/run, distance-driven so feet do not slide) → idle breathing /
//   head twitches → alert scream → attack swing → hit reaction (direction-aware) → death fall.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const LEG = 0.92;                      // hip → ankle, metres
export const STRIDE = { walk: 1.25, run: 2.3 }; // metres per full gait cycle (two steps)
// side tables built once (no per-frame arrays or string concatenation)
const LEGS = [{ thigh: 'thighL', shin: 'shinL', foot: 'footL', sx: 1, amp: 0.85, off: 0 }, { thigh: 'thighR', shin: 'shinR', foot: 'footR', sx: -1, amp: 1, off: Math.PI }];
const ARMS = [{ clav: 'clavL', up: 'upperArmL', fore: 'foreArmL', hand: 'handL', sx: 1, off: 0, left: true }, { clav: 'clavR', up: 'upperArmR', fore: 'foreArmR', hand: 'handR', sx: -1, off: Math.PI, left: false }];

export function createAnimState(seed = 0) {
  return { deadLatched: false, t: seed * 3.1, phase: seed, lastDist: null, runK: 0, moveK: 0, alertK: 0, hitX: 0, hitZ: 0, hitHead: 0, lastHitN: 0, twitch: 0, twitchT: 1, deathSide: 1, seed };
}

/**
 * e = infected sim object (x, y, dist, speed, state, stateT, attackT, def, hit, deathT, killDir, facing).
 * bones = {name: THREE.Bone}. dt in seconds. cellSize = metres per cell.
 */
export function animateHollow(e, bones, a, dt, cellSize = 2) {
  a.t += dt;
  const def = e.def, speedMs = e.speed * cellSize, dead = e.state === 'DEAD';
  // ---- locomotion phase from the distance actually travelled (feet planted, no sliding)
  if (a.lastDist === null) a.lastDist = e.dist;
  const dMoved = (e.dist - a.lastDist) * cellSize; a.lastDist = e.dist;
  const runK = clamp((speedMs - def.walkSpeed) / (def.runSpeed - def.walkSpeed), 0, 1);
  a.runK += (runK - a.runK) * Math.min(1, dt * 6);
  const moving = speedMs > 0.15 && !dead;
  a.moveK += ((moving ? 1 : 0) - a.moveK) * Math.min(1, dt * 7);
  const stride = STRIDE.walk + (STRIDE.run - STRIDE.walk) * a.runK;
  a.phase += dMoved / stride * TAU;
  const ph = a.phase, mk = a.moveK, rk = a.runK;
  // swing amplitude matches the stride: half a cycle covers stride/2 = 2·LEG·sin(A)
  const A = Math.asin(clamp(stride / (4 * LEG), 0, 0.9)) * mk;
  const s = Math.sin(ph), c = Math.cos(ph);

  const b = bones;
  // ---- posture: hunched, neck thrust forward, head raised to look ahead, left shoulder dropped
  const breathe = Math.sin(a.t * 1.7 + a.seed) * (1 - mk * 0.6);
  const lean = 0.3 + rk * 0.3;
  b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0);
  b.hips.position.set(0, 0.97 - 0.05 - rk * 0.07 - Math.abs(Math.cos(ph)) * 0.035 * mk, 0);
  b.hips.rotation.set(0.05 + rk * 0.08, Math.sin(ph) * 0.12 * mk, Math.cos(ph) * 0.05 * mk + 0.03);
  b.spine.rotation.set(lean * 0.5 + breathe * 0.01, -Math.sin(ph) * 0.08 * mk, -0.04);
  b.chest.rotation.set(lean * 0.6 + breathe * 0.025, -Math.sin(ph) * 0.1 * mk, 0.07);
  b.neck.rotation.set(0.15 + rk * 0.1, 0, -0.05);
  // head: looks ahead (compensates the hunch), slow searching turns + rare twitches
  a.twitchT -= dt; if (a.twitchT <= 0) { a.twitch = (Math.sin(a.t * 91.7 + a.seed * 7) * 0.5) * 0.5; a.twitchT = 1.2 + Math.abs(Math.sin(a.t * 13.3)) * 2.5; }
  a.twitch *= Math.exp(-dt * 9);
  b.head.rotation.set(-0.7 - rk * 0.3 + breathe * 0.02, Math.sin(a.t * 0.43 + a.seed) * 0.25 * (1 - mk) + a.twitch, 0.16 + a.twitch * 0.5);
  b.jaw.rotation.set(0.22 + breathe * 0.04, 0, 0.03); // mouth hangs open
  // ---- legs (left leg swings a bit less → uneven gait); knee flexes during the swing phase
  for (const L of LEGS) {
    const sp = Math.sin(ph + L.off), cp = Math.cos(ph + L.off);
    const swing = -sp * A * L.amp;                                   // + forward when negative (bone points down)
    const flex = (0.15 + rk * 0.35) * mk + Math.max(0, cp) * (0.55 + rk * 0.8) * mk + 0.12;
    b[L.thigh].rotation.set(swing - 0.08 - rk * 0.15 * mk, 0, L.sx * 0.04);
    b[L.shin].rotation.set(flex, 0, 0);
    b[L.foot].rotation.set(-(swing - 0.08) - flex * 0.6, 0, 0);
  }
  // ---- arms: dangling (walk), reaching forward and flailing (run)
  for (const R of ARMS) {
    const sw = Math.sin(ph + R.off + Math.PI) * (0.25 + rk * 0.35) * mk;
    b[R.clav].rotation.set(0, 0, R.sx * (R.left ? -0.14 : 0.05));
    b[R.up].rotation.set(-0.15 - rk * 0.7 + sw, 0, R.sx * (0.12 + breathe * 0.01));
    b[R.fore].rotation.set(-0.35 - rk * 0.55 + Math.sin(a.t * 2.1 + R.off) * 0.04, 0, 0);
    b[R.hand].rotation.set(-0.2, 0, R.sx * 0.1);
  }
  // ---- alert: snaps upright a little, head jerks, jaw wide open (scream)
  const alertK = e.state === 'ALERT' ? Math.sin(Math.min(1, e.stateT / def.alertTime) * Math.PI) : 0;
  a.alertK += (alertK - a.alertK) * Math.min(1, dt * 12);
  if (a.alertK > 0.01) {
    const k = a.alertK;
    b.chest.rotation.x -= 0.25 * k; b.neck.rotation.x += 0.1 * k; b.head.rotation.x -= 0.15 * k;
    b.jaw.rotation.x += 0.45 * k;
    b.upperArmL.rotation.z += 0.35 * k; b.upperArmR.rotation.z -= 0.35 * k;
    b.head.rotation.y += Math.sin(a.t * 40) * 0.04 * k;
  }
  // ---- attack: right claw — wind-up (raise back), strike (down across the body), follow-through, recover
  if (e.state === 'ATTACK' || (e.state === 'RECOVER' && e.stateT < def.recoverTime)) {
    const f = e.state === 'ATTACK' ? clamp(e.attackT / def.attackDuration, 0, 1) : 1;
    const hitAt = def.attackHitAt;
    let raise, across, lunge;
    if (f < hitAt * 0.75) { const t = smooth(f / (hitAt * 0.75)); raise = 2.5 * t; across = -0.2 * t; lunge = -0.05 * t; }
    else if (f < hitAt + 0.12) { const t = smooth((f - hitAt * 0.75) / (hitAt * 0.25 + 0.12)); raise = 2.5 - 2.3 * t; across = -0.2 + 0.9 * t; lunge = -0.05 + 0.3 * t; }
    else { const t = smooth((f - hitAt - 0.12) / (1 - hitAt - 0.12)); raise = 0.2 * (1 - t); across = 0.7 * (1 - t); lunge = 0.25 * (1 - t); }
    if (e.state === 'RECOVER') { raise = 0; across = 0; lunge = 0; }
    b.upperArmR.rotation.x = -0.15 - raise; b.upperArmR.rotation.z -= across * 0.5; b.upperArmR.rotation.y = across * 0.6;
    b.foreArmR.rotation.x = -0.6 - raise * 0.25;
    b.chest.rotation.y += -across * 0.45 + lunge * 0.3; b.chest.rotation.x += lunge * 0.6;
    b.spine.rotation.x += lunge * 0.3;
    b.jaw.rotation.x += 0.35 * Math.min(1, raise);
    b.upperArmL.rotation.x -= lunge * 1.2; // the other claw reaches too
  }
  // ---- hit reaction: torso pushed away from the shot, head snaps on headshots (decays in ~0.35 s)
  if (e.hit.n !== a.lastHitN) {
    a.lastHitN = e.hit.n;
    // shot direction in the infected's local frame: forward = facing
    const fx = Math.cos(e.facing), fy = Math.sin(e.facing);
    const along = e.hit.x * fx + e.hit.y * fy, side = e.hit.x * -fy + e.hit.y * fx;
    a.hitX = clamp(-along, -1, 1); a.hitZ = clamp(side, -1, 1);   // shot from the front → along < 0 → pushed back
    a.hitHead = e.hit.zone === 'head' ? 1 : 0;
  }
  const hk = smooth(clamp(e.hit.t / 0.35, 0, 1));
  if (hk > 0) {
    b.chest.rotation.x -= 0.32 * a.hitX * hk * (1 - a.hitHead * 0.5); b.chest.rotation.z += 0.25 * a.hitZ * hk;
    b.spine.rotation.x -= 0.12 * a.hitX * hk;
    b.head.rotation.x -= (0.15 + 0.55 * a.hitHead) * a.hitX * hk; b.head.rotation.z += 0.3 * a.hitZ * hk * (0.5 + a.hitHead);
    b.upperArmL.rotation.z += 0.3 * hk; b.upperArmR.rotation.z -= 0.3 * hk;
  }
  // ---- death: knees buckle, then the body falls (backwards if shot from the front), limbs go slack; sinks later
  if (dead) {
    const T = e.deathT;
    if (!a.deadLatched) { a.deadLatched = true; const fx = Math.cos(e.facing), fy = Math.sin(e.facing); a.deathSide = (e.killDir.x * fx + e.killDir.y * fy) >= 0 ? -1 : 1; } // once per death, any frame rate; -1: falls forward
    const kb = smooth(clamp(T / 0.35, 0, 1)), fall = smooth(clamp((T - 0.15) / 0.75, 0, 1));
    b.hips.position.y -= 0.32 * kb;
    for (const L of LEGS) { const th = b[L.thigh].rotation, sh = b[L.shin].rotation, isL = L.sx > 0; th.x = th.x * (1 - fall) - 0.9 * kb * (1 - fall) + (isL ? -0.15 : 0.1) * fall; sh.x = sh.x * (1 - fall) + 1.4 * kb * (1 - fall) + 0.25 * fall; th.z = (isL ? 0.18 : -0.12) * fall; }
    const dir = a.deathSide;
    b.root.rotation.x = -dir * 1.5 * fall;                       // around the feet: backwards (dir = 1) or forwards
    b.root.position.z = -dir * 0.25 * fall; b.root.position.y = 0.08 * fall;
    b.spine.rotation.x = 0.1 * dir * fall + (1 - fall) * b.spine.rotation.x; b.chest.rotation.x = 0.05 + (1 - fall) * 0.3;
    b.head.rotation.x = -0.3 * dir * fall; b.head.rotation.y = 0.6 * fall; b.jaw.rotation.x = 0.5 * fall;
    // arms flop out sideways onto the floor (in the body plane, so they lie flat whichever way it fell)
    for (const R of ARMS) { const u = b[R.up].rotation, f2 = b[R.fore].rotation; u.x *= (1 - fall); u.y = 0; u.z = R.sx * (R.left ? 1.1 : 0.55) * fall + u.z * (1 - fall); f2.x = -0.35 * fall + f2.x * (1 - fall); }
    // last second before removal: sink into the floor
    const sink = clamp((T - (def.corpseTime - 1.0)) / 1.0, 0, 1);
    b.root.position.y -= 0.45 * sink;
  }
}
