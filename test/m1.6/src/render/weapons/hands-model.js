// First-person hands: tactical gloves (separate fingers, knuckle & finger pads) and combat-suit sleeves.
// GEOMETRY + RIG only — poses come from hand-poses.js, timing from weapon-anim.js.
//
// Cost: 7 draw calls for both hands. All finger phalanges are instances of ONE capsule geometry, all pads are
// instances of ONE ellipsoid, palms / cuffs / straps / sleeves / sleeve inserts are instanced ×2. Instance matrices
// are recomputed per frame from the pose (no allocations per frame).
//
// Hand-local frame (metres): origin = wrist centre; +Y = towards the fingers; +X = across the knuckles,
// index finger on +side (side = +1 right hand, −1 left hand); +Z = palm normal. A positive curl bends a
// finger towards the palm (rotation about local X). Geometry is left/right symmetric → no mirrored instances.
import * as THREE from 'three';

export const PALM_LEN = 0.088;
export const FINGERS = ['index', 'middle', 'ring', 'pinky'];
export const FINGER_SPEC = {
  index:  { x: 0.031, y: 0.000, len: [0.044, 0.026, 0.022], r: 0.0096 },
  middle: { x: 0.011, y: 0.004, len: [0.048, 0.029, 0.023], r: 0.0099 },
  ring:   { x: -0.009, y: 0.000, len: [0.045, 0.027, 0.022], r: 0.0094 },
  pinky:  { x: -0.027, y: -0.008, len: [0.036, 0.021, 0.019], r: 0.0083 },
};
export const THUMB_SPEC = { x: 0.024, y: 0.018, z: 0.006, len: [0.038, 0.031, 0.026], r: [0.0128, 0.0104, 0.0094] };
const SEG_TAPER = [1, 0.93, 0.86];
const CAPS_PER_HAND = 17, PADS_PER_HAND = 10; // 15 phalanges + thenar + hypothenar
const SLEEVE_LEN = 0.34;

/**
 * Shared finger kinematics (used by the renderer and by the grip solver in hand-poses.js, so both always agree).
 * H: hand matrix (wrist frame in parent space). Fills `mats[0..2]` with joint frames (segment s spans 0..len[s]
 * along +Y of mats[s]) and `pts[0..3]` with joint positions (base … fingertip).
 */
const _T = new THREE.Matrix4(), _R = new THREE.Matrix4();
export function fingerChain(H, side, finger, curls, spread, mats, pts) {
  const sp = FINGER_SPEC[finger];
  const J = mats[0].copy(H).multiply(_T.makeTranslation(side * sp.x, PALM_LEN + sp.y, -0.002)).multiply(_R.makeRotationZ(-side * (spread || 0)));
  pts[0].setFromMatrixPosition(J);
  for (let s = 0; s < 3; s++) {
    if (s > 0) mats[s].copy(mats[s - 1]).multiply(_T.makeTranslation(0, sp.len[s - 1], 0));
    mats[s].multiply(_R.makeRotationX(curls[s]));
    pts[s + 1].set(0, sp.len[s], 0).applyMatrix4(mats[s]);
  }
}
export function thumbChain(H, side, th, mats, pts) {
  const ts = THUMB_SPEC;
  mats[0].copy(H).multiply(_T.makeTranslation(side * ts.x, ts.y, ts.z))
    .multiply(_R.makeRotationZ(-side * th.yaw)).multiply(_R.makeRotationX(th.pitch)).multiply(_R.makeRotationY(side * th.roll));
  pts[0].setFromMatrixPosition(mats[0]);
  for (let s = 0; s < 3; s++) {
    if (s > 0) mats[s].copy(mats[s - 1]).multiply(_T.makeTranslation(0, ts.len[s - 1], 0)).multiply(_R.makeRotationX(th.c[s - 1]));
    pts[s + 1].set(0, ts.len[s], 0).applyMatrix4(mats[s]);
  }
}
export function fingerRadius(finger, s) { return finger === 'thumb' ? THUMB_SPEC.r[s] : FINGER_SPEC[finger].r * SEG_TAPER[s]; }
export function fingerLength(finger, s) { return finger === 'thumb' ? THUMB_SPEC.len[s] : FINGER_SPEC[finger].len[s]; }

let texCache = null;
function textures() {
  if (texCache) return texCache;
  const mk = (size, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; return t;
  };
  let s = 17; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  texCache = {
    // synthetic glove leather/fabric grain
    glove: mk(128, (g, n) => { g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, n, n); for (let i = 0; i < 4000; i++) { const v = 170 + r() * 80 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 1.5, 1.5); } }, 6),
    // woven suit fabric
    weave: mk(64, (g, n) => { for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) { const v = ((x + y) >> 1) % 2 ? 210 : 175; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2); } }, 14),
  };
  return texCache;
}

function buildGeometries() {
  const capsule = new THREE.CapsuleGeometry(0.5, 2, 4, 10); // total height 3, radius 0.5
  const pad = new THREE.SphereGeometry(0.5, 12, 8);
  const palmShape = new THREE.Shape();
  // organic palm: narrow at the wrist, widest at the knuckles, generous rounded bevel
  palmShape.moveTo(-0.024, -0.004); palmShape.quadraticCurveTo(0, -0.010, 0.024, -0.004);
  palmShape.quadraticCurveTo(0.038, 0.040, 0.034, PALM_LEN - 0.004); palmShape.quadraticCurveTo(0, PALM_LEN + 0.003, -0.034, PALM_LEN - 0.004);
  palmShape.quadraticCurveTo(-0.038, 0.040, -0.024, -0.004);
  const palm = new THREE.ExtrudeGeometry(palmShape, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0085, bevelSize: 0.009, bevelSegments: 5, curveSegments: 12 });
  palm.translate(0, 0, -0.0025);
  const lathe = (pts, seg = 16, phiStart = 0, phiLen = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([rr, y]) => new THREE.Vector2(rr, y)), seg, phiStart, phiLen);
  const cuff = lathe([[0.0225, 0.016], [0.0275, 0.010], [0.0292, -0.006], [0.0296, -0.030], [0.0278, -0.036]]);
  const strap = lathe([[0.0302, 0.000], [0.0306, -0.004], [0.0306, -0.014], [0.0302, -0.018]]);
  const sleeve = lathe([[0.027, -0.016], [0.0315, -0.030], [0.0355, -0.09], [0.040, -0.17], [0.0425, -0.26], [0.043, -SLEEVE_LEN]], 16);
  // graphite panel on the top (back-of-hand side = +Z of the sleeve frame; lathe phi 0 = +Z)
  const insert = lathe([[0.0328, -0.05], [0.0368, -0.11], [0.0408, -0.19], [0.0438, -0.30]], 6, -0.6, 1.2);
  return { capsule, pad, palm, cuff, strap, sleeve, insert };
}

export function createHands() {
  const geo = buildGeometries(), tex = textures();
  const mats = {
    glove: new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.7, metalness: 0.06, map: tex.glove }),
    pad: new THREE.MeshStandardMaterial({ color: 0x41454e, roughness: 0.4, metalness: 0.3 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.93, metalness: 0.0, map: tex.weave }),
    insert: new THREE.MeshStandardMaterial({ color: 0x484c55, roughness: 0.88, metalness: 0.0, map: tex.weave }),
  };
  const group = new THREE.Group(); group.name = 'hands';
  const inst = (g, m, n, name) => { const im = new THREE.InstancedMesh(g, m, n); im.name = name; im.frustumCulled = false; group.add(im); return im; };
  const meshes = {
    caps: inst(geo.capsule, mats.glove, CAPS_PER_HAND * 2, 'fingers'),
    pads: inst(geo.pad, mats.pad, PADS_PER_HAND * 2, 'pads'),
    palm: inst(geo.palm, mats.glove, 2, 'palms'),
    cuff: inst(geo.cuff, mats.glove, 2, 'cuffs'),
    strap: inst(geo.strap, mats.pad, 2, 'straps'),
    sleeve: inst(geo.sleeve, mats.sleeve, 2, 'sleeves'),
    insert: inst(geo.insert, mats.insert, 2, 'sleeve-inserts'),
  };

  // reusable temporaries (no allocations per frame)
  const H = new THREE.Matrix4(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), S = new THREE.Matrix4();
  const chainM = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), vx = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  const tipsOut = { right: {}, left: {} }; // fingertip / joint sample points (model space) for tests
  for (const h of ['right', 'left']) for (const f of [...FINGERS, 'thumb']) tipsOut[h][f] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const palmCenter = { right: new THREE.Vector3(), left: new THREE.Vector3() };

  function segment(i, joint, L, r) {
    T.makeTranslation(0, L / 2, 0); S.makeScale(2 * r * 1.04, (L + 2 * r) / 3, 2 * r * 0.9);
    M.multiplyMatrices(joint, T).multiply(S);
    meshes.caps.setMatrixAt(i, M);
  }
  const MB = new THREE.Matrix4(), mA = new THREE.Vector3(), mB = new THREE.Vector3(), mY = new THREE.Vector3(), mX = new THREE.Vector3(), mZ = new THREE.Vector3();
  /** Capsule between two hand-local points (radius r) — used for the palm's muscle masses. */
  function muscle(i, ax, ay, az, bx, by, bz, r) {
    mA.set(ax, ay, az).applyMatrix4(H); mB.set(bx, by, bz).applyMatrix4(H);
    mY.subVectors(mB, mA); const L = mY.length(); mY.divideScalar(L);
    mZ.set(0, 0, 1).transformDirection(H); mX.crossVectors(mY, mZ).normalize(); mZ.crossVectors(mX, mY);
    MB.makeBasis(mX, mY, mZ).setPosition(mA);
    segment(i, MB, L, r);
  }
  function padAt(i, base, x, y, z, sx, sy, sz) {
    T.makeTranslation(x, y, z); S.makeScale(sx, sy, sz);
    M.multiplyMatrices(base, T).multiply(S);
    meshes.pads.setMatrixAt(i, M);
  }

  /**
   * Pose one hand. pose = { pos (wrist, parent space), quat, f: {index:[c1,c2,c3],…}, spread: [i,m,r,p],
   * thumb: { yaw, pitch, roll, c: [c1, c2] } }, side = +1 right / −1 left, elbow = Vector3 (parent space).
   */
  function poseHand(hi, side, pose, elbow) {
    const name = hi === 0 ? 'right' : 'left';
    H.compose(pose.pos, pose.quat, ONE);
    meshes.palm.setMatrixAt(hi, H);
    T.makeTranslation(0, -0.006, 0); M.multiplyMatrices(H, T);
    meshes.cuff.setMatrixAt(hi, M); meshes.strap.setMatrixAt(hi, M);
    palmCenter[name].set(0, PALM_LEN * 0.5, 0).applyMatrix4(H);
    let ci = hi * CAPS_PER_HAND, pi = hi * PADS_PER_HAND;
    // soft palm masses (thumb base, little-finger edge) so the palm is not a flat plate
    muscle(ci++, side * 0.019, 0.004, 0.0045, side * 0.029, 0.047, 0.004, 0.0128);
    muscle(ci++, -side * 0.023, 0.012, 0.003, -side * 0.029, 0.070, 0.002, 0.0112);
    // knuckle guard + dorsal plate (on the back of the hand, −Z)
    // knuckle guards: one hard pad per knuckle (added in the finger loop) + a low dorsal plate
    padAt(pi++, H, 0, 0.048, -0.0122, 0.048, 0.036, 0.0055);
    FINGERS.forEach((f, k) => {
      const pts = tipsOut[name][f];
      fingerChain(H, side, f, pose.f[f], pose.spread ? pose.spread[k] : 0, chainM, pts);
      for (let sgi = 0; sgi < 3; sgi++) {
        const r = fingerRadius(f, sgi), L = fingerLength(f, sgi);
        segment(ci++, chainM[sgi], L, r);
        if (sgi === 0) {
          padAt(pi++, chainM[0], 0, -0.001, -r * 0.92, 2 * r * 0.98, 0.016, 0.0075); // knuckle guard
          padAt(pi++, chainM[0], 0, L * 0.52, -r * 0.78, 2 * r * 0.78, L * 0.5, 0.0045); // finger pad
        }
      }
    });
    thumbChain(H, side, pose.thumb, chainM, tipsOut[name].thumb);
    for (let sgi = 0; sgi < 3; sgi++) {
      const r = fingerRadius('thumb', sgi), L = fingerLength('thumb', sgi);
      segment(ci++, chainM[sgi], L, r);
      if (sgi === 1) padAt(pi++, chainM[1], 0, L * 0.5, -r * 0.78, r * 1.6, L * 0.5, 0.0045);
    }
    // sleeve: from the wrist towards the (camera-fixed) elbow so the forearm follows recoil naturally.
    // Sleeve frame: Y = away from the elbow (the lathe extends along −Y), Z = back of the hand (insert panel side).
    v1.set(0, -0.004, 0).applyMatrix4(H);                        // wrist point
    v2.subVectors(v1, elbow).normalize();                        // Y: elbow → wrist
    v3.set(0, 0, -1).applyQuaternion(pose.quat);                 // back of the hand
    v3.addScaledVector(v2, -v3.dot(v2)).normalize();             // Z ⟂ Y
    vx.crossVectors(v2, v3);                                     // X = Y × Z (right-handed)
    M.makeBasis(vx, v2, v3).setPosition(v1);
    meshes.sleeve.setMatrixAt(hi, M); meshes.insert.setMatrixAt(hi, M);
  }

  return {
    group, mats, meshes,
    tips: tipsOut, palmCenter,
    /** right/left: poses (see poseHand); elbows: {right, left} Vector3 in the hands' parent space. */
    update(right, left, elbows) {
      poseHand(0, 1, right, elbows.right);
      poseHand(1, -1, left, elbows.left);
      for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
    },
    setVisible(v) { group.visible = v; },
    stats() { let tris = 0; for (const m of Object.values(meshes)) { const g = m.geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3 * m.count; } return { drawCalls: Object.keys(meshes).length, triangles: Math.round(tris), instances: { fingers: meshes.caps.count, pads: meshes.pads.count } }; },
    dispose() {
      for (const m of Object.values(meshes)) { m.geometry.dispose(); m.dispose(); }
      for (const m of Object.values(mats)) m.dispose();
      group.removeFromParent();
    },
  };
}
