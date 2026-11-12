// First-person hands: tactical gloves (separate fingers, knuckle & finger pads) and combat-suit sleeves.
// M1.9: anatomical phalanges, two-tone glove (dark leather back / suede palm via vertex colours), seams and joint
// creases, matte rubber guards, hook-and-loop strap, sleeve with folds and a knit cuff (procedural normal maps).
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
import { gloveGrain, fingerHeight, rubberHeight, sleeveHeight, heightToNormal, dataTexture } from './proc-maps.js';

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
const SLEEVE_LEN = 0.5; // M1.9: long enough to leave the screen in every pose (the melee swing showed the open end of a 0.34 m sleeve)

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
// M1.9: procedural relief instead of flat colour noise — leather grain, finger seams / creases, ribbed rubber guards,
// sleeve twill with folds and a knit cuff (proc-maps.js). Generated once, shared by every hands instance.
function textures() {
  if (texCache) return texCache;
  const grain = heightToNormal(gloveGrain(256), 256, 2.2);
  texCache = {
    palmN: dataTexture(grain, { repeat: [28, 28] }),          // extruded palm: UVs in metres → ≈ 36 mm per tile
    cuffN: dataTexture(grain, { repeat: [5, 1.2] }),          // lathe UVs 0..1
    fingerN: dataTexture(heightToNormal(fingerHeight(256), 256, 5), { repeat: [1, 1] }),
    rubberN: dataTexture(heightToNormal(rubberHeight(128), 128, 3), { repeat: [2, 2] }),
    sleeveN: dataTexture(heightToNormal(sleeveHeight(512), 512, 4.5), { repeat: [1, -1] }), // lathe v runs elbow → wrist: flipped so the cuff sits at the wrist
  };
  return texCache;
}
// two-tone glove: dark synthetic leather on the back, worn suede on the palm side (vertex colours by normal → no extra
// draw calls, no colour textures). Palm side = +Z of the hand frame / lathe phi 0.
// (the viewmodel scene is lit brightly + ACES: albedos stay in the weapon's dark linear range, contrast comes from the relief)
const GLOVE_BACK = new THREE.Color(0x222420), GLOVE_PALM = new THREE.Color(0x2f2b26), CUFF_COL = new THREE.Color(0x1b1c19);
function paintByNormalZ(geo, back, palm, a = -0.15, b = 0.45) {
  const n = geo.getAttribute('normal'), col = new Float32Array(n.count * 3), c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const t = Math.max(0, Math.min(1, (n.getZ(i) - a) / (b - a))), k = t * t * (3 - 2 * t);
    c.copy(back).lerp(palm, k); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function buildGeometries() {
  // M1.9 fix: LatheGeometry faces outwards only when the profile goes UP (increasing y). The cuff / strap / sleeve /
  // insert profiles were listed top → down, so their faces pointed inwards: the near wall was culled and the camera saw
  // the inside of the far wall, lit from the camera side (a pale, "glowing" forearm). Profiles are now sorted by y.
  const lathe = (pts, seg = 16, phiStart = 0, phiLen = Math.PI * 2) => new THREE.LatheGeometry([...pts].sort((a, b) => a[1] - b[1]).map(([rr, y]) => new THREE.Vector2(rr, y)), seg, phiStart, phiLen);
  // M1.9 phalanx: same unit frame as the old capsule (radius 0.5, height 3 centred on 0 → segment() unchanged), but
  // anatomical — rounded joint at the base, a slight waist, a bulge at the next joint, a soft rounded tip.
  const capsule = lathe([[0.001, -1.5], [0.24, -1.44], [0.38, -1.31], [0.47, -1.12], [0.52, -0.86], [0.505, -0.5], [0.47, -0.1],
    [0.46, 0.3], [0.48, 0.72], [0.5, 0.98], [0.47, 1.18], [0.39, 1.34], [0.25, 1.45], [0.001, 1.5]], 12);
  paintByNormalZ(capsule, GLOVE_BACK, GLOVE_PALM, -0.2, 0.5);
  const pad = new THREE.SphereGeometry(0.5, 14, 9);
  const palmShape = new THREE.Shape();
  // organic palm: narrow at the wrist, widest at the knuckles, generous rounded bevel
  palmShape.moveTo(-0.024, -0.004); palmShape.quadraticCurveTo(0, -0.010, 0.024, -0.004);
  palmShape.quadraticCurveTo(0.038, 0.040, 0.034, PALM_LEN - 0.004); palmShape.quadraticCurveTo(0, PALM_LEN + 0.003, -0.034, PALM_LEN - 0.004);
  palmShape.quadraticCurveTo(-0.038, 0.040, -0.024, -0.004);
  const palm = new THREE.ExtrudeGeometry(palmShape, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0085, bevelSize: 0.009, bevelSegments: 7, curveSegments: 16 });
  palm.translate(0, 0, -0.0025);
  palm.computeVertexNormals(); paintByNormalZ(palm, GLOVE_BACK, GLOVE_PALM);
  const cuff = lathe([[0.0225, 0.016], [0.0262, 0.012], [0.0281, 0.006], [0.0292, -0.006], [0.0297, -0.018], [0.0296, -0.030], [0.0286, -0.035], [0.0272, -0.037]], 20);
  const strap = lathe([[0.0300, 0.001], [0.0308, -0.002], [0.0310, -0.008], [0.0310, -0.014], [0.0307, -0.017], [0.0300, -0.019]], 20);
  // sleeve: more rings + a fold displacement (bunched just above the wrist, soft lengthwise creases further up)
  const sp = []; for (let i = 0; i <= 22; i++) { const t = i / 22, y = -0.016 - t * (SLEEVE_LEN - 0.016); sp.push([0.027 + (0.043 - 0.027) * Math.min(1, Math.pow(t / 0.75, 0.6)) + (t < 0.05 ? -0.003 * (1 - t / 0.05) : 0), y]); }
  const sleeve = lathe(sp, 24);
  { const P = sleeve.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z); if (r < 1e-6) continue;
      const phi = Math.atan2(x, z), d = -y; // distance from the wrist end (m)
      const bunch = Math.max(0, 1 - Math.abs(d - 0.07) / 0.06);
      const k = 1 + bunch * 0.055 * Math.sin(d * 150 + Math.sin(phi * 2 + 1.3) * 1.4) + 0.022 * Math.sin(phi * 3 + d * 18) * Math.min(1, d / 0.12);
      P.setX(i, x * k); P.setZ(i, z * k);
    }
    sleeve.computeVertexNormals(); }
  // graphite panel on the top (back-of-hand side = +Z of the sleeve frame; lathe phi 0 = +Z)
  const insert = lathe([[0.0335, -0.05], [0.0372, -0.11], [0.0412, -0.19], [0.0442, -0.30]], 8, -0.6, 1.2);
  return { capsule, pad, palm, cuff, strap, sleeve, insert };
}

export function createHands() {
  const geo = buildGeometries(), tex = textures();
  const N = (t, k) => ({ normalMap: t, normalScale: new THREE.Vector2(k, k) });
  const mats = {
    glove: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.74, metalness: 0.0, ...N(tex.palmN, 0.55) }),
    finger: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.0, ...N(tex.fingerN, 0.8) }),
    cuff: new THREE.MeshStandardMaterial({ color: CUFF_COL, roughness: 0.8, metalness: 0.0, ...N(tex.cuffN, 0.6) }),
    pad: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.0, ...N(tex.rubberN, 0.7) }),   // moulded TPR guards (matte, not metal)
    strap: new THREE.MeshStandardMaterial({ color: 0x2a2b26, roughness: 0.9, metalness: 0.0, ...N(tex.rubberN, 0.5) }),  // hook-and-loop wrist strap
    sleeve: new THREE.MeshStandardMaterial({ color: 0x171a14, roughness: 0.94, metalness: 0.0, ...N(tex.sleeveN, 1.0) }),
    insert: new THREE.MeshStandardMaterial({ color: 0x2a2c27, roughness: 0.9, metalness: 0.0, ...N(tex.sleeveN, 0.8) }),
  };
  const group = new THREE.Group(); group.name = 'hands';
  const inst = (g, m, n, name) => { const im = new THREE.InstancedMesh(g, m, n); im.name = name; im.frustumCulled = false; group.add(im); return im; };
  const meshes = {
    caps: inst(geo.capsule, mats.finger, CAPS_PER_HAND * 2, 'fingers'),
    pads: inst(geo.pad, mats.pad, PADS_PER_HAND * 2, 'pads'),
    palm: inst(geo.palm, mats.glove, 2, 'palms'),
    cuff: inst(geo.cuff, mats.cuff, 2, 'cuffs'),
    strap: inst(geo.strap, mats.strap, 2, 'straps'),
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
