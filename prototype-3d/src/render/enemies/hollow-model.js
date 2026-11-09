// DA-INF01 "THE HOLLOW" — procedural skinned model (no external assets).
// One geometry per material is built ONCE and shared by every infected; each instance only owns its bones.
// Bind pose: standing straight, facing +Z, feet at y = 0, metres. The hunch, asymmetry and all motion are
// applied by hollow-anim.js on the bones. 3 draw calls per infected (skin, rags, eyes).
import * as THREE from 'three';

// ---------------------------------------------------------------- skeleton (bind offsets, metres)
export const BONES = [
  // name, parent, offset
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
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const BIND = {}; // bind-pose world position of each bone
for (const [n, p, o] of BONES) { const b = p ? BIND[p] : [0, 0, 0]; BIND[n] = [b[0] + o[0], b[1] + o[1], b[2] + o[2]]; }
export const BIND_POS = BIND;

// ---------------------------------------------------------------- deterministic noise (organic surface, stains)
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), L(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    L(L(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), L(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.3, y * 2.3, z * 2.3) * 0.3 + vnoise(x * 5.1, y * 5.1, z * 5.1) * 0.15;

// ---------------------------------------------------------------- builder: accumulates skinned, coloured geometry
class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  /**
   * Add a BufferGeometry already placed in bind space. weights(p) → [[bone, w], …] (≤ 4), color(p, n) → [r,g,b].
   * displace(p, n) → scalar offset along the normal (organic surface).
   */
  add(geo, { weights, color, displace = null }) {
    const g = geo.index ? geo : geo; g.computeVertexNormals();
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), base = this.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      if (displace) p.addScaledVector(n, displace(p, n));
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z);
      const c = color(p, n); this.col.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2); // authored in sRGB → linear
      const w = weights(p); const ii = [0, 0, 0, 0], ww = [0, 0, 0, 0]; let sum = 0;
      for (let k = 0; k < Math.min(4, w.length); k++) { ii[k] = w[k][0]; ww[k] = w[k][1]; sum += w[k][1]; }
      for (let k = 0; k < 4; k++) ww[k] /= sum || 1;
      this.si.push(...ii); this.sw.push(...ww);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals(); // smooth across displaced surfaces
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- shape helpers (all return geometry in bind space)
const V = (a) => new THREE.Vector3(...a);
/** Tapered tube from A to B (bind positions), radii along the length, elliptic section (sx, sz). */
function tube(A, B, radii, { seg = 10, rings = 6, sx = 1, sz = 1, caps = true, jag = 0 } = {}) {
  const a = V(A), b = V(B), len = a.distanceTo(b);
  const pts = [];
  if (caps) pts.push(new THREE.Vector2(0.0001, -radii[0] * 0.6));
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, r = sampleR(radii, t);
    pts.push(new THREE.Vector2(r, t * len));
  }
  if (caps) pts.push(new THREE.Vector2(0.0001, len + radii[radii.length - 1] * 0.6));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  if (jag) { // ragged hem: pull the last ring's vertices up/down irregularly
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) if (P.getY(i) > len * 0.98) P.setY(i, P.getY(i) - Math.abs(Math.sin(i * 2.7)) * jag);
  }
  // orient +Y along A→B
  const dir = b.clone().sub(a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  return g;
}
function sampleR(r, t) { const f = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(f)); return r[i] + (r[i + 1] - r[i]) * (f - i); }
function ellipsoid(c, s, seg = 12, rings = 9) { const g = new THREE.SphereGeometry(1, seg, rings); g.scale(...s); g.translate(...c); return g; }

// weights: rigid to one bone, or blended between parent and child along a segment
const W1 = (name) => () => [[BONE_INDEX[name], 1]];
function segWeights(parent, bone, child, A, B) { // along A→B: blend with parent at the start, child at the end
  const a = V(A), ab = V(B).sub(a), L2 = ab.lengthSq();
  const tmp = new THREE.Vector3();
  return (p) => {
    const t = THREE.MathUtils.clamp(tmp.copy(p).sub(a).dot(ab) / L2, 0, 1);
    const out = [[BONE_INDEX[bone], 1]];
    if (parent && t < 0.18) { const w = (0.18 - t) / 0.18 * 0.5; out[0][1] = 1 - w; out.push([BONE_INDEX[parent], w]); }
    if (child && t > 0.82) { const w = (t - 0.82) / 0.18 * 0.5; out[0][1] = 1 - w; out.push([BONE_INDEX[child], w]); }
    return out;
  };
}

// colours: grey-pale skin, bruised dark infection patches, darker recesses
const SKIN = [0.62, 0.6, 0.56], BRUISE = [0.2, 0.15, 0.16], VEIN = [0.3, 0.08, 0.1];
function skinColor(p) {
  const n = fbm(p.x * 5 + 3, p.y * 5, p.z * 5);
  const patch = THREE.MathUtils.smoothstep(n, 0.47, 0.6) * 0.9; // infected areas
  const ext = p.y < 0.25 || Math.abs(p.x) > 0.24 ? 0.75 : 1; // hands and feet darker (dirt, necrosis)
  const v = Math.abs(Math.sin(p.y * 46 + fbm(p.x * 9, p.y * 3, p.z * 9) * 9)); // vein streaks
  const vein = v < 0.07 ? (0.07 - v) / 0.07 * 0.6 : 0;
  const shade = 0.82 + fbm(p.x * 13, p.y * 13, p.z * 13) * 0.3; // mottling
  const c = SKIN.map((s, i) => (s * (1 - patch) + BRUISE[i] * patch) * shade * ext);
  return c.map((x, i) => x * (1 - vein) + VEIN[i] * vein);
}
const CLOTH = [0.2, 0.19, 0.2];
function clothColor(p) { const n = fbm(p.x * 7, p.y * 7, p.z * 7); const dirt = 0.7 + n * 0.55; const blood = n > 0.68 ? 0.5 : 0; return [CLOTH[0] * dirt + 0.1 * blood, CLOTH[1] * dirt, CLOTH[2] * dirt]; }
const organic = (amp, freq = 9) => (p) => (fbm(p.x * freq, p.y * freq, p.z * freq) - 0.5) * amp;

let shared = null;
/** Build the shared geometries + materials once. */
export function getHollowAssets() {
  if (shared) return shared;
  const B = BIND, skin = new Builder(), rags = new Builder(), eyes = new Builder();
  // ---- torso: gaunt, ribcage, sunken belly (blended hips → spine → chest by height)
  {
    const prof = [[0.105, 0.0], [0.13, 0.04], [0.12, 0.12], [0.095, 0.2], [0.1, 0.28], [0.13, 0.37], [0.145, 0.45], [0.15, 0.53], [0.14, 0.6], [0.11, 0.65], [0.05, 0.69]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 18); g.scale(1, 1, 0.66); g.translate(0, B.hips[1] - 0.06, 0);
    const yH = B.hips[1], yS = B.spine[1], yC = B.chest[1];
    skin.add(g, {
      weights: (p) => {
        if (p.y < yS) { const t = THREE.MathUtils.clamp((p.y - yH + 0.06) / (yS - yH + 0.06), 0, 1); return [[BONE_INDEX.hips, 1 - t * 0.5], [BONE_INDEX.spine, t * 0.5]]; }
        if (p.y < yC) { const t = (p.y - yS) / (yC - yS); return [[BONE_INDEX.spine, 1 - t * 0.5], [BONE_INDEX.chest, 0.5 * t]]; }
        return [[BONE_INDEX.chest, 1]];
      },
      color: (p, n) => { const c = skinColor(p); const rib = p.y > yS + 0.05 && p.y < yC + 0.18 && Math.abs(Math.sin((p.y - yS) * 70)) < 0.25 ? 0.72 : 1; return c.map(x => x * rib); },
      displace: (p, n) => { // ribs + spine ridge + organic lumps
        let d = organic(0.012, 11)(p);
        if (p.y > yS + 0.05 && p.y < yC + 0.2 && n.z > -0.2) d += Math.max(0, Math.sin((p.y - yS) * 70)) * 0.007;
        if (n.z < -0.85) d += 0.008; // vertebrae
        return d;
      },
    });
  }
  // ---- neck (long, thin, sinewy) and head
  skin.add(tube(B.neck, B.head, [0.05, 0.042, 0.045], { seg: 10, rings: 4, caps: false }), { weights: segWeights('chest', 'neck', 'head', B.neck, B.head), color: skinColor, displace: organic(0.006, 18) });
  {
    const hc = [B.head[0], B.head[1] + 0.085, B.head[2] + 0.015];
    const g = ellipsoid(hc, [0.088, 0.122, 0.112], 22, 16);
    { const P = g.getAttribute('position'); for (let i = 0; i < P.count; i++) { const z = P.getZ(i) - hc[2], y = P.getY(i) - hc[1]; if (z < 0 && y > -0.02) P.setZ(i, P.getZ(i) - z * z * 2.2); } } // elongated back of the skull
    skin.add(g, {
      weights: W1('head'),
      color: (p) => { // dark sunken eye sockets, bruised mouth area
        const c = skinColor(p); const ey = Math.hypot(Math.abs(p.x - hc[0]) - 0.036, p.y - (hc[1] + 0.012));
        const sock = p.z > hc[2] + 0.03 && ey < 0.036 ? 0.08 + ey * 10 : 1;
        const mouth = p.y < hc[1] - 0.05 && p.z > hc[2] + 0.05 ? 0.55 : 1;
        return c.map(x => x * Math.min(1, sock) * mouth);
      },
      displace: (p, n) => {
        const lx = p.x - hc[0], ly = p.y - hc[1], lz = p.z - hc[2];
        let d = organic(0.008, 14)(p);
        const eyeD = Math.hypot(Math.abs(lx) - 0.036, ly - 0.012);
        if (lz > 0.04 && eyeD < 0.032) d -= (0.032 - eyeD) * 0.9;             // deep sockets
        if (lz > 0.03 && ly > 0.028 && ly < 0.05) d += 0.008;                 // brow ridge
        if (Math.abs(lx) > 0.04 && ly < -0.01 && ly > -0.08 && lz > -0.01) d -= 0.016; // hollow cheeks
        if (ly < -0.05) d -= (-0.05 - ly) * 0.35;                              // narrow, gaunt chin
        if (ly > 0.07) d += Math.max(0, (vnoise(p.x * 30, p.y * 30, p.z * 30) - 0.6)) * 0.04; // lumpy skull
        return d;
      },
    });
    // lower jaw (separate bone, hangs slightly open), with a ragged lip line
    const jw = ellipsoid([B.jaw[0], B.jaw[1] + 0.006, B.jaw[2] + 0.02], [0.04, 0.019, 0.05], 12, 7);
    skin.add(jw, { weights: W1('jaw'), color: (p) => skinColor(p).map(x => x * 0.55), displace: organic(0.005, 20) });
    // eyes: tiny, deep in the sockets (faint red — the glow is in the material, not a light)
    for (const sx of [-1, 1]) eyes.add(ellipsoid([hc[0] + sx * 0.035, hc[1] + 0.012, hc[2] + 0.088], [0.009, 0.0065, 0.006], 8, 6), { weights: W1('head'), color: () => [1, 1, 1] });
  }
  // ---- arms (long, thin) with deformed hands and elongated clawed fingers
  for (const s of ['L', 'R']) {
    const sh = B['upperArm' + s], el = B['foreArm' + s], wr = B['hand' + s], sx = s === 'L' ? 1 : -1;
    skin.add(ellipsoid([sh[0] - sx * 0.025, sh[1] - 0.005, sh[2]], [0.045, 0.038, 0.045], 10, 7), { weights: (p) => [[BONE_INDEX['clav' + s], 0.5], [BONE_INDEX['upperArm' + s], 0.5]], color: skinColor, displace: organic(0.006) }); // bony shoulder
    skin.add(tube(sh, el, [0.047, 0.04, 0.034, 0.036], { seg: 10, rings: 6 }), { weights: segWeights('clav' + s, 'upperArm' + s, 'foreArm' + s, sh, el), color: skinColor, displace: organic(0.006, 16) });
    skin.add(tube(el, wr, [0.036, 0.033, 0.026, 0.024], { seg: 10, rings: 6 }), { weights: segWeights('upperArm' + s, 'foreArm' + s, 'hand' + s, el, wr), color: skinColor, displace: organic(0.006, 16) });
    // hand: narrow bony palm + 4 long fingers (3 joints, curled into claws) + thumb — rigid to the hand bone
    const palm = ellipsoid([wr[0], wr[1] - 0.05, wr[2] + 0.005], [0.03, 0.055, 0.014], 9, 7);
    skin.add(palm, { weights: W1('hand' + s), color: skinColor, displace: organic(0.004, 30) });
    const fingers = [[-0.022, 0.135], [-0.007, 0.15], [0.008, 0.14], [0.022, 0.115]];
    fingers.forEach(([fx, L], k) => {
      let p0 = new THREE.Vector3(wr[0] + fx * sx * -1, wr[1] - 0.1, wr[2] + 0.01), dir = new THREE.Vector3(0, -1, 0.0);
      const curl = [0.25, 0.45, 0.6], seg = [L * 0.42, L * 0.33, L * 0.25], rad = [0.0085, 0.0072, 0.0058];
      for (let j = 0; j < 3; j++) {
        dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -curl[j] * (0.8 + k * 0.08)); // curl forward (+Z)
        const p1 = p0.clone().addScaledVector(dir, seg[j]);
        skin.add(tube(p0.toArray(), p1.toArray(), [rad[j] * 1.15, rad[j]], { seg: 6, rings: 2 }), { weights: W1('hand' + s), color: (p) => skinColor(p).map(x => x * (j === 2 ? 0.7 : 0.9)) });
        p0 = p1;
      }
      // claw-like nail
      skin.add(tube(p0.toArray(), p0.clone().addScaledVector(dir, 0.016).toArray(), [0.005, 0.0008], { seg: 5, rings: 1 }), { weights: W1('hand' + s), color: () => [0.12, 0.1, 0.09] });
    });
    const t0 = new THREE.Vector3(wr[0] + sx * 0.026, wr[1] - 0.04, wr[2] + 0.015), t1 = t0.clone().add(new THREE.Vector3(sx * 0.012, -0.045, 0.03));
    skin.add(tube(t0.toArray(), t1.toArray(), [0.01, 0.007], { seg: 6, rings: 2 }), { weights: W1('hand' + s), color: skinColor });
  }
  // ---- legs (bony knees), bare feet
  for (const s of ['L', 'R']) {
    const hp = B['thigh' + s], kn = B['shin' + s], an = B['foot' + s];
    skin.add(tube(hp, kn, [0.07, 0.062, 0.05, 0.045], { seg: 11, rings: 6 }), { weights: segWeights('hips', 'thigh' + s, 'shin' + s, hp, kn), color: skinColor, displace: organic(0.007) });
    skin.add(ellipsoid([kn[0], kn[1], kn[2] + 0.015], [0.04, 0.045, 0.04], 9, 7), { weights: (p) => [[BONE_INDEX['thigh' + s], 0.5], [BONE_INDEX['shin' + s], 0.5]], color: skinColor });
    skin.add(tube(kn, an, [0.045, 0.042, 0.032, 0.03], { seg: 10, rings: 6 }), { weights: segWeights('thigh' + s, 'shin' + s, 'foot' + s, kn, an), color: skinColor, displace: organic(0.006) });
    const foot = ellipsoid([an[0], 0.03, an[2] + 0.06], [0.045, 0.03, 0.12], 10, 6);
    skin.add(foot, { weights: W1('foot' + s), color: (p) => skinColor(p).map(x => x * 0.55), displace: organic(0.008, 20) });
  }
  // ---- rags: torn trousers (ragged hems at different heights) + a shirt ripped open on the left side
  for (const s of ['L', 'R']) {
    const hp = B['thigh' + s], kn = B['shin' + s], an = B['foot' + s];
    rags.add(tube([hp[0], hp[1] + 0.06, hp[2]], kn, [0.088, 0.08, 0.07], { seg: 12, rings: 5, caps: false }), { weights: segWeights('hips', 'thigh' + s, 'shin' + s, hp, kn), color: clothColor, displace: organic(0.01, 12) });
    const hemY = s === 'L' ? 0.55 : 0.75; // the right trouser leg is torn off higher
    const mid = [kn[0], kn[1] - (kn[1] - an[1]) * hemY, kn[2]];
    rags.add(tube(kn, mid, [0.07, 0.062], { seg: 12, rings: 4, caps: false, jag: 0.05 }), { weights: W1('shin' + s), color: clothColor, displace: organic(0.012, 14) });
  }
  {
    // waistband + shirt: partial lathe (open on the left flank → ribs visible), ragged bottom hem
    const yH = B.hips[1];
    const band = new THREE.LatheGeometry([[0.118, -0.1], [0.14, -0.04], [0.135, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
    band.scale(1, 1, 0.7); band.translate(0, yH, 0);
    rags.add(band, { weights: W1('hips'), color: clothColor, displace: organic(0.006) });
    const prof = [[0.115, 0.27], [0.142, 0.37], [0.158, 0.45], [0.163, 0.53], [0.152, 0.6], [0.12, 0.65], [0.07, 0.685]].map(([r, y]) => new THREE.Vector2(r, y));
    const shirt = new THREE.LatheGeometry(prof, 18, Math.PI * 0.62, Math.PI * 1.55);
    shirt.scale(1, 1, 0.68); shirt.translate(0, yH - 0.06, 0);
    const P = shirt.getAttribute('position');
    for (let i = 0; i < P.count; i++) if (P.getY(i) < yH + 0.23) P.setY(i, P.getY(i) - Math.abs(Math.sin(i * 1.9)) * 0.06 + 0.02);
    const yS = B.spine[1];
    rags.add(shirt, { weights: (p) => (p.y < yS + 0.12 ? [[BONE_INDEX.spine, 0.6], [BONE_INDEX.chest, 0.4]] : [[BONE_INDEX.chest, 1]]), color: clothColor, displace: organic(0.012, 10) });
    // one torn sleeve remnant (right arm only — asymmetric silhouette)
    const sh = B.upperArmR, el = B.foreArmR;
    rags.add(tube(sh, [sh[0] + (el[0] - sh[0]) * 0.55, sh[1] + (el[1] - sh[1]) * 0.55, sh[2]], [0.062, 0.056], { seg: 10, rings: 3, caps: false, jag: 0.04 }), { weights: W1('upperArmR'), color: clothColor, displace: organic(0.01, 14) });
  }
  const geo = { skin: skin.build(), rags: rags.build(), eyes: eyes.build() };
  const mats = {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0 }),
    rags: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 }),
    eyes: new THREE.MeshStandardMaterial({ color: 0x1a0404, emissive: 0xff2210, emissiveIntensity: 0.32, roughness: 0.4 }),
  };
  const tris = Object.values(geo).reduce((s, g) => s + g.index.count / 3, 0);
  shared = { geo, mats, tris };
  return shared;
}

/** One infected: its own bones bound to the shared geometry. */
export function createHollowInstance() {
  const A = getHollowAssets();
  const group = new THREE.Group(); group.name = 'hollow';
  const bones = BONES.map(([n, , o]) => { const b = new THREE.Bone(); b.name = n; b.position.set(...o); return b; });
  BONES.forEach(([, p], i) => { if (p) bones[BONE_INDEX[p]].add(bones[i]); });
  group.add(bones[0]);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = {};
  for (const k of ['skin', 'rags', 'eyes']) {
    const m = new THREE.SkinnedMesh(A.geo[k], A.mats[k]);
    m.bind(skeleton);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2); // generous: covers attacks and the fall
    m.frustumCulled = true;
    group.add(m); meshes[k] = m;
  }
  const B = Object.fromEntries(BONES.map(([n], i) => [n, bones[i]]));
  return { group, bones: B, skeleton, meshes, dispose() { skeleton.dispose(); } };
}

export function disposeHollowAssets() {
  if (!shared) return;
  for (const g of Object.values(shared.geo)) g.dispose();
  for (const m of Object.values(shared.mats)) m.dispose();
  shared = null;
}
