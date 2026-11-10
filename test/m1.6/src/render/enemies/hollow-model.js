// DA-INF01 "THE HOLLOW" — procedural skinned model, M1.6 rebuild (no external assets).
// Body parts are LOFTED skins: rings of elliptical cross-sections swept along the limb and blended between bones,
// so shoulders, elbows, wrists, hips and knees are continuous surfaces (no tubes joined by balls).
// One geometry per material is built ONCE and shared by every infected; an instance only owns its bones.
// 3 draw calls per infected (skin, rags, eyes). Bind pose: standing straight, facing +Z, feet at y = 0, metres.
import * as THREE from 'three';
import { BONES } from '../../sim/enemies/hollow-rig.js';

export { BONES };
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const BIND = {}; // bind-pose world position of each bone
for (const [n, p, o] of BONES) { const b = p ? BIND[p] : [0, 0, 0]; BIND[n] = [b[0] + o[0], b[1] + o[1], b[2] + o[2]]; }
export const BIND_POS = BIND;

// ---------------------------------------------------------------- deterministic noise
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), L(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    L(L(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), L(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.3, y * 2.3, z * 2.3) * 0.3 + vnoise(x * 5.1, y * 5.1, z * 5.1) * 0.15;
const sstep = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (dx, dy, s) => Math.exp(-(dx * dx + dy * dy) / (s * s));

// ---------------------------------------------------------------- colours (authored in sRGB, stored linear)
const SKIN = [0.74, 0.72, 0.67], SKIN_COLD = [0.62, 0.66, 0.69], BRUISE = [0.17, 0.11, 0.15], VEIN = [0.27, 0.07, 0.1], ROT = [0.1, 0.09, 0.08];
/** Infected skin: pale grey with cold areas, dark necrotic patches (denser on neck, left shoulder, forearms, shins), veins. */
function skinColor(p) {
  const n = fbm(p.x * 4.3 + 3, p.y * 4.3, p.z * 4.3);
  // regions where the infection is advanced
  const region = Math.max(gauss(p.x - 0.16, p.y - 1.5, 0.2), gauss(p.x + 0.02, p.y - 1.66, 0.12) * 0.9, sstep(1.18, 1.02, 0.86) * (Math.abs(p.x) > 0.15 ? 1 : 0), sstep(0.42, 0.2, 0.02) * 0.8, gauss(p.x + 0.1, p.y - 1.2, 0.13) * 0.7);
  const patch = sstep(n + region * 0.16, 0.6, 0.7) * 0.88;
  const cold = fbm(p.x * 2.1 + 9, p.y * 2.1, p.z * 2.1);
  const v = Math.abs(Math.sin(p.y * 38 + p.x * 11 + fbm(p.x * 8, p.y * 3, p.z * 8) * 9)); // branching dark veins near the patches
  const vein = v < 0.06 ? (0.06 - v) / 0.06 * (0.12 + 0.6 * sstep(n + region * 0.16, 0.46, 0.6)) : 0;
  const mottle = 0.84 + fbm(p.x * 14, p.y * 14, p.z * 14) * 0.3;
  const ext = p.y < 0.2 ? 0.6 : 1;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = SKIN[i] + (SKIN_COLD[i] - SKIN[i]) * sstep(cold, 0.45, 0.7);
    c = c * (1 - patch) + (n > 0.7 ? ROT[i] : BRUISE[i]) * patch;
    c = c * (1 - vein) + VEIN[i] * vein;
    out[i] = c * mottle * ext;
  }
  return out;
}
const CLOTH = [0.25, 0.24, 0.27], CLOTH2 = [0.3, 0.25, 0.21];
function clothColor(p) {
  const n = fbm(p.x * 6, p.y * 6, p.z * 6), dirt = 0.62 + n * 0.6, k = p.y < 1.03 ? 1 : 0; // trousers slightly warmer
  const blood = sstep(fbm(p.x * 3 + 5, p.y * 3, p.z * 3), 0.62, 0.72) * 0.55;
  return [0, 1, 2].map(i => (CLOTH[i] + (CLOTH2[i] - CLOTH[i]) * k) * dirt * (1 - blood) + [0.2, 0.02, 0.03][i] * blood);
}

// ---------------------------------------------------------------- builder: skinned, coloured, UV-mapped geometry
class Builder {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  vert(p, color, uv, weights) {
    this.pos.push(p.x, p.y, p.z); this.col.push(color[0] ** 2.2, color[1] ** 2.2, color[2] ** 2.2); this.uv.push(uv[0], uv[1]);
    const ii = [0, 0, 0, 0], ww = [0, 0, 0, 0]; let sum = 0;
    for (let k = 0; k < Math.min(4, weights.length); k++) { ii[k] = BONE_INDEX[weights[k][0]]; ww[k] = weights[k][1]; sum += weights[k][1]; }
    for (let k = 0; k < 4; k++) ww[k] /= sum || 1;
    this.si.push(...ii); this.sw.push(...ww);
    return this.pos.length / 3 - 1;
  }
  /**
   * Loft: rings = [{c:[x,y,z], ru, rv, w:[[bone, weight]…]}], swept in order. Cross-section axes: u = `hint` made
   * perpendicular to the path, v = path × u. opts: seg, color(p), displace(p, d, ring, a) → along the radial dir,
   * capStart / capEnd, skip(ring, seg) → hole, arc [a0, a1] (partial shell), uvRep [u, v], jag(seg) → y offset of ring 0.
   */
  loft(rings, { seg = 12, hint = [1, 0, 0], color = skinColor, displace = null, capStart = true, capEnd = true, skip = null, arc = null, uvRep = [3, 6], jag = null } = {}) {
    const n = rings.length, H = new THREE.Vector3(...hint), t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
    const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2, closed = !arc, cols = closed ? seg : seg + 1;
    const first = this.pos.length / 3; let len = 0;
    for (let r = 0; r < n; r++) {
      const R = rings[r], prev = rings[Math.max(0, r - 1)].c, next = rings[Math.min(n - 1, r + 1)].c;
      t.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
      u.copy(H).addScaledVector(t, -H.dot(t)).normalize(); v.crossVectors(t, u);
      c.set(...R.c);
      if (r > 0) len += Math.hypot(R.c[0] - rings[r - 1].c[0], R.c[1] - rings[r - 1].c[1], R.c[2] - rings[r - 1].c[2]);
      for (let s = 0; s < cols; s++) {
        const a = a0 + (a1 - a0) * s / seg;
        d.copy(u).multiplyScalar(Math.cos(a) * R.ru).addScaledVector(v, Math.sin(a) * R.rv);
        p.copy(c).add(d);
        if (displace) { const k = displace(p, d, r, a); const l = d.length() || 1; p.addScaledVector(d, k / l); }
        if (jag && r === 0) p.y += jag(s);
        this.vert(p, color(p, d, r), [s / seg * uvRep[0], len * uvRep[1]], R.w);
      }
    }
    const at = (r, s) => first + r * cols + (closed ? s % seg : s);
    const tri0 = this.idx.length;
    for (let r = 0; r < n - 1; r++) for (let s = 0; s < seg; s++) {
      const k = skip ? skip(r, s) : 0; // true/1 = whole cell missing, 2 / 3 = one triangle missing (diagonal torn edge)
      if (k === true || k === 1) continue;
      if (k !== 2) this.idx.push(at(r, s), at(r, s + 1), at(r + 1, s));
      if (k !== 3) this.idx.push(at(r, s + 1), at(r + 1, s + 1), at(r + 1, s));
    }
    if (closed) for (const [flag, r] of [[capStart, 0], [capEnd, n - 1]]) {
      if (!flag) continue;
      const R = rings[r]; c.set(...R.c);
      const ci = this.vert(c, color(c, d.set(0, 0, 0), r), [0.5, r ? len * uvRep[1] : 0], R.w);
      for (let s = 0; s < seg; s++) r === 0 ? this.idx.push(ci, at(0, s + 1), at(0, s)) : this.idx.push(ci, at(r, s), at(r, s + 1));
    }
    // make the surface face outwards whatever the sweep direction / hint handedness
    if (this.idx.length > tri0 + 2 && n > 1) {
      const A = this.idx[tri0], B = this.idx[tri0 + 1], C = this.idx[tri0 + 2], P = i => new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      const nrm = P(B).sub(P(A)).cross(P(C).sub(P(A))), mid = P(A).add(P(B)).add(P(C)).multiplyScalar(1 / 3);
      const cen = new THREE.Vector3(...rings[0].c).lerp(new THREE.Vector3(...rings[1].c), 0.5);
      if (nrm.dot(mid.sub(cen)) < 0) for (let i = tri0; i < this.idx.length; i += 3) { const x = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = x; }
    }
  }
  /** Any placed BufferGeometry, rigid or with a weight function. */
  add(geo, { weights, color, displace = null, uvRep = 1 }) {
    geo.computeVertexNormals();
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), U = geo.getAttribute('uv'), base = this.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      if (displace) p.addScaledVector(n, displace(p, n));
      this.vert(p, color(p, n), U ? [U.getX(i) * uvRep, U.getY(i) * uvRep] : [0, 0], typeof weights === 'function' ? weights(p) : weights);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const organic = (amp, f = 9) => (p) => (fbm(p.x * f, p.y * f, p.z * f) - 0.5) * amp;

// ---------------------------------------------------------------- procedural detail normal maps (tiling, tiny)
function normalMapFrom(height, size, strength) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function makeDetailMaps() {
  const S = 128, skin = new Float32Array(S * S), cloth = new Float32Array(S * S), T = Math.PI * 2 / S;
  // tiling: every term is periodic over the tile
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wr = Math.sin(x * T * 5 + Math.sin(y * T * 3) * 2.2) * Math.sin(y * T * 4 + Math.cos(x * T * 2) * 1.7); // wrinkles / tendon lines
    const pores = Math.sin(x * T * 17 + Math.sin(y * T * 5) * 2) * Math.sin(y * T * 19 + Math.sin(x * T * 7) * 2) * 0.07;
    const vein = Math.abs(Math.sin(x * T * 2 + Math.sin(y * T * 3) * 1.4)); const vr = vein < 0.14 ? (0.14 - vein) * 3.2 : 0; // raised veins
    const sore = Math.max(0, Math.sin(x * T * 3 + 1) * Math.sin(y * T * 3 + 2) - 0.72) * 3.5; // crater-like sores
    skin[y * S + x] = wr * 0.32 + pores + vr - sore;
    cloth[y * S + x] = Math.sin(x * T * 32) * 0.35 + Math.sin(y * T * 32) * 0.35 + Math.sin(x * T * 3 + Math.sin(y * T * 2) * 2) * 0.5; // weave + folds
  }
  return { skin: normalMapFrom(skin, S, 2.6), cloth: normalMapFrom(cloth, S, 1.6) };
}

let shared = null;
/** Build the shared geometries + materials once. */
export function getHollowAssets() {
  if (shared) return shared;
  const skin = new Builder(), rags = new Builder(), eyes = new Builder();
  const W = (...w) => w; // [[bone, weight], …]

  // ============ TORSO + NECK (one continuous loft, bottom → top). ru = half-width (X), rv = half-depth (Z)
  const T = [ // y, ru, rv, cz, weights
    [0.86, 0.1, 0.082, 0, W(['hips', 1])],
    [0.92, 0.142, 0.098, -0.004, W(['hips', 1])],
    [0.985, 0.15, 0.096, -0.004, W(['hips', 1])],
    [1.045, 0.12, 0.078, 0, W(['hips', 0.5], ['spine', 0.5])],
    [1.11, 0.106, 0.07, 0.002, W(['spine', 1])],
    [1.18, 0.12, 0.084, 0.002, W(['spine', 0.65], ['chest', 0.35])],
    [1.26, 0.146, 0.104, 0, W(['spine', 0.3], ['chest', 0.7])],
    [1.34, 0.162, 0.116, -0.004, W(['chest', 1])],
    [1.42, 0.17, 0.118, -0.006, W(['chest', 1])],
    [1.49, 0.176, 0.106, -0.008, W(['chest', 1])],
    [1.545, 0.166, 0.086, -0.006, W(['chest', 1])],
    [1.585, 0.105, 0.07, 0.004, W(['chest', 0.65], ['neck', 0.35])],
    [1.625, 0.056, 0.057, 0.022, W(['neck', 1])],
    [1.675, 0.046, 0.05, 0.034, W(['neck', 1])],
    [1.725, 0.047, 0.052, 0.046, W(['neck', 0.45], ['head', 0.55])],
    [1.76, 0.05, 0.055, 0.052, W(['head', 1])],
  ];
  const torsoRings = T.map(([y, ru, rv, cz, w]) => ({ c: [0, y, cz], ru, rv, w }));
  skin.loft(torsoRings, {
    seg: 22, uvRep: [4, 7], capEnd: false,
    displace: (p, d) => {
      let k = (fbm(p.x * 10, p.y * 10, p.z * 10) - 0.5) * 0.008;
      const front = d.z > 0, ax = Math.abs(p.x);
      if (p.y > 1.2 && p.y < 1.5) { // ribs: ridges wrapping the sides and front, a sternum groove, sunken between ribs
        const rib = Math.sin((p.y - 1.2) * 68 - ax * 9);
        if (d.z > -0.04) k += Math.max(0, rib) * 0.0075 * sstep(ax, 0.015, 0.05) - 0.003;
        if (front && ax < 0.02) k -= 0.004;
      }
      if (front && p.y > 1.02 && p.y < 1.2) k -= 0.016 * (1 - sstep(ax, 0.05, 0.11)) * Math.sin((p.y - 1.02) / 0.18 * Math.PI); // hollow belly
      if (front && p.y > 1.5 && p.y < 1.56) k += 0.011 * Math.max(0, Math.sin((p.y - 1.5) / 0.06 * Math.PI)) * sstep(ax, 0.02, 0.05); // collar bones
      if (!front && ax < 0.022 && p.y > 0.95 && p.y < 1.62) k += 0.007 + Math.max(0, Math.sin(p.y * 70)) * 0.006; // spine: row of vertebrae
      if (!front && p.y > 1.36 && p.y < 1.52) k += 0.012 * gauss(ax - 0.085, p.y - 1.44, 0.05); // shoulder blades
      if (p.y > 0.9 && p.y < 1.0 && ax > 0.1) k += 0.006; // hip bones
      if (p.y > 1.6) { const a = Math.atan2(d.z, d.x); k += Math.max(0, Math.sin(a * 2 + 0.6)) * 0.006; if (front && ax < 0.012 && p.y > 1.63 && p.y < 1.68) k += 0.006; } // neck tendons, larynx
      return k;
    },
  });

  // ============ ARMS: collar → deltoid → elbow → wrist → palm, one loft per arm. hint Z: ru = depth, rv = width
  const armRings = (sx) => {
    const X = (x) => sx * x;
    return [
      { c: [X(0.105), 1.525, -0.005], ru: 0.06, rv: 0.055, w: W(['chest', 1]) },
      { c: [X(0.165), 1.545, -0.004], ru: 0.06, rv: 0.058, w: W(['chest', 0.5], ['clav' + (sx > 0 ? 'L' : 'R'), 0.5]) },
      { c: [X(0.2), 1.515, -0.002], ru: 0.055, rv: 0.05, w: W(['clav' + (sx > 0 ? 'L' : 'R'), 0.35], ['upperArm' + (sx > 0 ? 'L' : 'R'), 0.65]) },
      { c: [X(0.203), 1.45, 0], ru: 0.047, rv: 0.043, w: W(['upperArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.198), 1.37, 0.002], ru: 0.041, rv: 0.037, w: W(['upperArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.193), 1.29, 0], ru: 0.036, rv: 0.033, w: W(['upperArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 1.245, -0.004], ru: 0.039, rv: 0.035, w: W(['upperArm' + (sx > 0 ? 'L' : 'R'), 0.6], ['foreArm' + (sx > 0 ? 'L' : 'R'), 0.4]) },
      { c: [X(0.19), 1.215, -0.004], ru: 0.038, rv: 0.035, w: W(['upperArm' + (sx > 0 ? 'L' : 'R'), 0.35], ['foreArm' + (sx > 0 ? 'L' : 'R'), 0.65]) },
      { c: [X(0.19), 1.16, 0.002], ru: 0.037, rv: 0.036, w: W(['foreArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 1.08, 0.002], ru: 0.032, rv: 0.031, w: W(['foreArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 1.0, 0], ru: 0.024, rv: 0.027, w: W(['foreArm' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 0.96, 0], ru: 0.019, rv: 0.027, w: W(['foreArm' + (sx > 0 ? 'L' : 'R'), 0.55], ['hand' + (sx > 0 ? 'L' : 'R'), 0.45]) },
      { c: [X(0.19), 0.93, 0.002], ru: 0.016, rv: 0.031, w: W(['hand' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 0.885, 0.005], ru: 0.015, rv: 0.041, w: W(['hand' + (sx > 0 ? 'L' : 'R'), 1]) },
      { c: [X(0.19), 0.848, 0.008], ru: 0.014, rv: 0.043, w: W(['hand' + (sx > 0 ? 'L' : 'R'), 1]) },
    ];
  };
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R', R = armRings(sx);
    skin.loft(R, {
      seg: 12, hint: [0, 0, 1], uvRep: [2, 7], capStart: false,
      displace: (p, d) => {
        let k = (fbm(p.x * 13, p.y * 13, p.z * 13) - 0.5) * 0.006;
        if (p.y > 1.2 && p.y < 1.26 && d.z < 0) k += 0.008; // elbow bone
        if (p.y < 1.19 && p.y > 0.97) k += Math.max(0, Math.sin(Math.atan2(d.z, d.x) * 3 + p.y * 9)) * 0.004; // forearm tendons
        if (p.y < 0.97 && p.y > 0.94 && Math.abs(d.x) > 0.018) k += 0.004; // wrist bones
        if (p.y < 0.92 && d.z > 0) k += Math.max(0, Math.sin((p.x - sx * 0.19) * 150)) * 0.003; // metacarpals on the back of the hand (+Z)
        return k;
      },
    });
    // fingers: long, bony, three joints, curled into claws (towards −Z = the palm side), dark claw tips
    const fingers = [[-0.031, 0.118, 0.85], [-0.011, 0.14, 1], [0.01, 0.132, 1.05], [0.03, 0.105, 1.2]]; // x offset, length, curl
    fingers.forEach(([fx, L, curl], k) => {
      const rings = []; let y = 0.85, z = 0.008, ang = -0.12; // ang: 0 = straight down, negative z = curl
      const segs = [[0.0, 0.0105], [0.4, 0.0088], [0.42, 0.0098], [0.72, 0.0074], [0.74, 0.0084], [1.0, 0.0056], [1.14, 0.0035], [1.3, 0.0008]];
      let last = 0;
      for (const [t, r] of segs) {
        const dl = (t - last) * L; last = t;
        y -= Math.cos(ang) * dl; z -= Math.sin(-ang) * dl * 1; // step, then bend at the joints
        rings.push({ c: [sx * (0.19 + fx * (1 + t * 0.25)), y, z], ru: r, rv: r * 1.05, w: W(['hand' + s, 1]), t });
        if (t === 0.4 || t === 0.72 || t === 1.0) ang -= 0.5 * curl; else if (t === 0.0) ang -= 0.28 * curl;
      }
      skin.loft(rings, { seg: 6, hint: [0, 0, 1], uvRep: [1, 9], capStart: false, color: (p, d, r) => (rings[r].t > 1.0 ? [0.1, 0.085, 0.075] : skinColor(p).map(c => c * (rings[r].t > 0.7 ? 0.62 : 0.85))) });
      void k;
    });
    { // thumb: from the side of the palm, angled forward-inward
      const b = [sx * (0.19 - 0.04 * 1), 0.915, 0.004], rings = []; let pnt = [...b]; const dir = [sx * -0.45, -0.75, -0.48];
      [[0, 0.0115], [0.03, 0.0105], [0.056, 0.0095], [0.085, 0.0065], [0.1, 0.004], [0.116, 0.0008]].forEach(([l, r], i, arr) => {
        const dl = i ? l - arr[i - 1][0] : 0; pnt = [pnt[0] + dir[0] * dl, pnt[1] + dir[1] * dl, pnt[2] + dir[2] * dl - (i > 2 ? 0.006 : 0)];
        rings.push({ c: [...pnt], ru: r, rv: r, w: W(['hand' + s, 1]), t: l });
      });
      skin.loft(rings, { seg: 6, hint: [0, 0, 1], uvRep: [1, 9], capStart: false, color: (p, d, r) => (rings[r].t > 0.09 ? [0.1, 0.085, 0.075] : skinColor(p).map(c => c * 0.8)) });
    }
  }

  // ============ LEGS: pelvis → thigh → knee → calf → ankle, one loft per leg; feet separately
  const legRings = (sx) => {
    const s = sx > 0 ? 'L' : 'R';
    return [
      { c: [sx * 0.082, 0.975, 0], ru: 0.074, rv: 0.086, w: W(['hips', 1]) },
      { c: [sx * 0.093, 0.9, 0], ru: 0.074, rv: 0.083, w: W(['hips', 0.5], ['thigh' + s, 0.5]) },
      { c: [sx * 0.096, 0.8, 0.004], ru: 0.064, rv: 0.072, w: W(['thigh' + s, 1]) },
      { c: [sx * 0.096, 0.68, 0.006], ru: 0.054, rv: 0.06, w: W(['thigh' + s, 1]) },
      { c: [sx * 0.095, 0.57, 0.006], ru: 0.046, rv: 0.05, w: W(['thigh' + s, 1]) },
      { c: [sx * 0.095, 0.51, 0.008], ru: 0.045, rv: 0.05, w: W(['thigh' + s, 0.65], ['shin' + s, 0.35]) },
      { c: [sx * 0.095, 0.46, 0.006], ru: 0.044, rv: 0.048, w: W(['thigh' + s, 0.35], ['shin' + s, 0.65]) },
      { c: [sx * 0.095, 0.4, -0.002], ru: 0.041, rv: 0.049, w: W(['shin' + s, 1]) },
      { c: [sx * 0.095, 0.31, -0.006], ru: 0.039, rv: 0.05, w: W(['shin' + s, 1]) },
      { c: [sx * 0.095, 0.2, -0.002], ru: 0.032, rv: 0.037, w: W(['shin' + s, 1]) },
      { c: [sx * 0.095, 0.1, 0], ru: 0.027, rv: 0.03, w: W(['shin' + s, 1]) },
      { c: [sx * 0.095, 0.06, 0.002], ru: 0.03, rv: 0.035, w: W(['shin' + s, 0.5], ['foot' + s, 0.5]) },
      { c: [sx * 0.095, 0.03, 0.004], ru: 0.03, rv: 0.036, w: W(['foot' + s, 1]) },
    ];
  };
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    skin.loft(legRings(sx), {
      seg: 12, uvRep: [2.5, 7], capStart: false,
      displace: (p, d) => {
        let k = (fbm(p.x * 12, p.y * 12, p.z * 12) - 0.5) * 0.007;
        if (p.y > 0.44 && p.y < 0.53 && d.z > 0.01) k += 0.012 * Math.sin((p.y - 0.44) / 0.09 * Math.PI); // kneecap
        if (p.y < 0.4 && p.y > 0.08 && d.z > 0.015 && Math.abs(d.x) < 0.012) k += 0.005; // shin bone edge
        if (p.y < 0.09 && Math.abs(d.x) > 0.02) k += 0.005; // ankle bones
        return k;
      },
    });
    // foot: heel → arch → ball → toes (swept forward), bare, dirty
    skin.loft([
      { c: [sx * 0.095, 0.034, -0.052], ru: 0.022, rv: 0.024, w: W(['foot' + s, 1]) },
      { c: [sx * 0.095, 0.04, -0.02], ru: 0.031, rv: 0.036, w: W(['foot' + s, 1]) },
      { c: [sx * 0.096, 0.04, 0.04], ru: 0.034, rv: 0.034, w: W(['foot' + s, 1]) },
      { c: [sx * 0.098, 0.03, 0.1], ru: 0.042, rv: 0.024, w: W(['foot' + s, 1]) },
      { c: [sx * 0.1, 0.022, 0.15], ru: 0.045, rv: 0.016, w: W(['foot' + s, 1]) },
      { c: [sx * 0.1, 0.016, 0.185], ru: 0.036, rv: 0.011, w: W(['foot' + s, 1]) },
    ], { seg: 10, uvRep: [2, 8], color: (p) => skinColor(p).map(c => c * 0.7), displace: (p, d) => (p.z > 0.12 ? Math.max(0, Math.sin(p.x * 130)) * 0.003 : 0) });
  }

  // ============ HEAD: sculpted skull-like face (deep sockets, no nose, sharp cheekbones), mandible, teeth, ears
  const hc = [BIND.head[0], BIND.head[1] + 0.085, BIND.head[2] + 0.015], HR = [0.083, 0.112, 0.1];
  {
    const g = new THREE.SphereGeometry(1, 26, 20);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      // unit-sphere sculpt
      if (z < 0) z *= 1.16 - 0.1 * Math.max(0, -y);                 // elongated back of the skull
      if (y > 0.55) y = 0.55 + (y - 0.55) * 0.86;                    // slightly flattened crown
      if (y < -0.15) { const t = Math.min(1, (-0.15 - y) / 0.7); x *= 1 - 0.34 * t; if (z > 0) z *= 1 - 0.1 * t; } // face narrows towards the mouth
      if (y < -0.66) y = -0.66 - (y + 0.66) * 0.18;                  // flat underside: the mandible sits below
      const front = z > 0.25 ? 1 : 0;
      let k = 0;
      k -= 0.2 * gauss(Math.abs(x) - 0.4, y - 0.06, 0.2) * front;     // eye sockets (deep)
      k += 0.085 * gauss(Math.abs(x) - 0.38, y - 0.27, 0.16) * front + 0.05 * gauss(x, y - 0.24, 0.12) * front; // brow ridge
      k -= 0.1 * gauss(x, y + 0.2, 0.085) * front;                    // nasal cavity
      k += 0.05 * gauss(x, y + 0.02, 0.07) * front;                   // remains of the nose bridge
      k += 0.07 * gauss(Math.abs(x) - 0.6, y + 0.14, 0.14);           // cheekbones
      k -= 0.1 * gauss(Math.abs(x) - 0.5, y + 0.42, 0.17) * (z > 0 ? 1 : 0.4); // hollow cheeks
      k -= 0.05 * gauss(Math.abs(x) - 0.9, y - 0.12, 0.2);            // temples
      k += (vnoise(x * 4 + 2, y * 4, z * 4) - 0.5) * 0.05 * (y > 0.25 ? 1.6 : 0.6); // lumpy cranium
      const l = Math.hypot(x, y, z) || 1, s = 1 + k;
      P.setXYZ(i, hc[0] + x / l * l * s * HR[0], hc[1] + y * s * HR[1], hc[2] + z * s * HR[2]);
    }
    skin.add(g, {
      weights: W(['head', 1]), uvRep: 1.5,
      color: (p) => {
        const lx = (p.x - hc[0]) / HR[0], ly = (p.y - hc[1]) / HR[1], lz = (p.z - hc[2]) / HR[2];
        const c = skinColor(p);
        const sock = lz > 0.2 ? 1 - 0.9 * gauss(Math.abs(lx) - 0.4, ly - 0.06, 0.2) : 1;
        const nose = lz > 0.2 ? 1 - 0.8 * gauss(lx, ly + 0.2, 0.09) : 1;
        const mouth = lz > 0.1 && ly < -0.5 ? 0.5 : 1;
        return c.map(v => v * sock * nose * mouth);
      },
    });
    // mandible: narrow jaw with a jutting chin, hangs open (animated), darker
    const jw = new THREE.SphereGeometry(1, 16, 10), J = jw.getAttribute('position'), jc = [hc[0], hc[1] - 0.086, hc[2] + 0.026];
    for (let i = 0; i < J.count; i++) {
      let x = J.getX(i), y = J.getY(i), z = J.getZ(i);
      if (y > 0.1) y = 0.1 + (y - 0.1) * 0.25;                       // flat top (tooth line)
      if (z > 0) x *= 1 - 0.42 * z;                                  // tapers to the chin
      if (z > 0.5 && y < 0) y *= 1.25;                               // chin drops
      J.setXYZ(i, jc[0] + x * 0.056, jc[1] + y * 0.03, jc[2] + z * 0.07);
    }
    skin.add(jw, { weights: W(['jaw', 1]), color: (p) => skinColor(p).map(c => c * 0.78), displace: organic(0.004, 22), uvRep: 1 });
    // dark mouth cavity so the open mouth never shows through
    const cav = new THREE.SphereGeometry(1, 10, 8); cav.scale(0.043, 0.026, 0.05); cav.translate(hc[0], hc[1] - 0.074, hc[2] + 0.03);
    skin.add(cav, { weights: W(['head', 0.5], ['jaw', 0.5]), color: () => [0.05, 0.015, 0.02] });
    // teeth: irregular pale stumps along both arches
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) / 4 * 1.05, tx = Math.sin(a) * 0.036, tz = hc[2] + 0.052 + Math.cos(a) * 0.046, h = 0.006 + hash(i, 3, 1) * 0.006;
      if (hash(i, 7, 2) > 0.2) { const t = new THREE.BoxGeometry(0.0055, h, 0.005); t.rotateZ((hash(i, 2, 2) - 0.5) * 0.3); t.rotateY(a); t.translate(hc[0] + tx, hc[1] - 0.07 - h / 2, tz); skin.add(t, { weights: W(['head', 1]), color: () => [0.52, 0.47, 0.34] }); }
      if (hash(i, 5, 9) > 0.25) { const h2 = 0.007 + hash(i, 1, 4) * 0.006, t = new THREE.BoxGeometry(0.005, h2, 0.005); t.rotateZ((hash(i, 4, 6) - 0.5) * 0.3); t.rotateY(a); t.translate(hc[0] + tx * 0.92, hc[1] - 0.083 + h2 / 2, tz - 0.004); skin.add(t, { weights: W(['jaw', 1]), color: () => [0.46, 0.41, 0.3] }); }
    }
    // ears: small, pressed to the skull, one torn
    for (const sx of [1, -1]) { const e = new THREE.SphereGeometry(1, 8, 6); e.scale(0.007, sx > 0 ? 0.024 : 0.016, 0.014); e.translate(hc[0] + sx * 0.082, hc[1] - 0.012, hc[2] - 0.012); skin.add(e, { weights: W(['head', 1]), color: (p) => skinColor(p).map(c => c * 0.75) }); }
    // eyes: tiny, deep in the sockets — a faint red glow from the material's emission only (no light source)
    for (const sx of [-1, 1]) { const e = new THREE.SphereGeometry(1, 8, 6); e.scale(0.007, 0.0055, 0.005); e.translate(hc[0] + sx * 0.034, hc[1] + 0.008, hc[2] + 0.079); eyes.add(e, { weights: W(['head', 1]), color: () => [1, 1, 1] }); }
  }

  // ============ RAGS: shells lofted over the body rings with torn hems and holes (double-sided)
  const hole = (r, s, salt, th) => (hash(r * 1.7 + salt, s * 2.3, salt) > th ? 2 + (hash(s, r, salt) > 0.5 ? 1 : 0) : 0); // small triangular rips
  { // shirt: ripped open over the left ribs, shredded hem, wide torn collar
    const rs = torsoRings.slice(4, 12).map((R, i) => ({ c: [R.c[0], R.c[1], R.c[2]], ru: R.ru * 1.07 + 0.007, rv: R.rv * 1.1 + 0.008, w: R.w, i }));
    rs[rs.length - 1].ru = 0.125; rs[rs.length - 1].rv = 0.085; // collar
    rags.loft(rs, {
      seg: 22, color: clothColor, uvRep: [8, 12], capStart: false, capEnd: false,
      jag: (s) => -0.07 * hash(s, 2, 5) + 0.02,
      displace: (p) => (fbm(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.02,
      skip: (r, s) => { // left flank torn away in a diagonal rip that narrows upwards; ragged hem; a few small rips
        const q = (s + 2) % 22, lo = (r >> 1), hi = 4 - (r >> 1); // angle 0 = +X = its left side; q re-centres the rip there
        if (r < 5 && q > lo && q < hi) return 1;
        if (r < 5 && q === lo) return 2; if (r < 5 && q === hi) return 3;
        if (r === 0 && hash(s, 9, 1) > 0.6) return 2;
        return r < 6 ? hole(r, s, 4, 0.93) : 0;
      },
    });
    // hanging strips from the hem
    for (const [a, len, wd] of [[4.4, 0.2, 0.04], [5.3, 0.14, 0.035], [2.2, 0.17, 0.03], [3.6, 0.1, 0.03]]) {
      const R = rs[0], x = Math.cos(a) * R.ru, z = -Math.sin(a) * R.rv, st = new THREE.PlaneGeometry(wd, len, 1, 3);
      st.rotateY(Math.atan2(x, z)); st.translate(x, R.c[1] - len / 2 - 0.01, z);
      rags.add(st, { weights: W(['spine', 0.6], ['hips', 0.4]), color: clothColor, uvRep: 2, displace: (p) => (fbm(p.x * 20, p.y * 20, p.z * 20) - 0.5) * 0.02 });
    }
  }
  { // trousers: waist + both legs; left leg torn at the knee and ends mid-shin, right leg ripped off above the knee
    const waist = torsoRings.slice(0, 4).map(R => ({ c: [...R.c], ru: R.ru * 1.06 + 0.006, rv: R.rv * 1.08 + 0.006, w: R.w }));
    rags.loft(waist, { seg: 22, color: clothColor, uvRep: [8, 12], capStart: true, capEnd: false, displace: (p) => (fbm(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.012, skip: (r, s) => (r === 2 && hash(s, 4, 4) > 0.75 ? 3 : 0) });
    for (const sx of [1, -1]) {
      const L = legRings(sx), n = sx > 0 ? 10 : 6;
      const rs = L.slice(0, n).reverse().map(R => ({ c: [...R.c], ru: R.ru * 1.16 + 0.007, rv: R.rv * 1.13 + 0.007, w: R.w }));
      rags.loft(rs, {
        seg: 12, color: clothColor, uvRep: [5, 12], capStart: false, capEnd: false,
        jag: (s) => (sx > 0 ? 0.05 : 0.09) * hash(s, sx + 3, 8),
        displace: (p) => (fbm(p.x * 10, p.y * 10, p.z * 10) - 0.5) * 0.018,
        skip: (r, s) => (r === 0 && hash(s, 6, sx + 2) > 0.6 ? 2 : 0) || (sx > 0 && r === 4 && s === 3 ? 1 : 0) || (sx > 0 && (r === 3 || r === 5) && s === 3 ? 2 : 0) /* left knee hole */ || hole(r, s, 9 + sx, 0.95),
      });
    }
  }
  { // torn sleeve remnant on the right arm only (asymmetric silhouette)
    const R = armRings(-1).slice(1, 6).reverse().map(r => ({ c: [...r.c], ru: r.ru * 1.12 + 0.005, rv: r.rv * 1.12 + 0.005, w: r.w }));
    rags.loft(R, { seg: 10, hint: [0, 0, 1], color: clothColor, uvRep: [4, 12], capStart: false, capEnd: false, jag: (s) => 0.06 * hash(s, 1, 1), displace: (p) => (fbm(p.x * 12, p.y * 12, p.z * 12) - 0.5) * 0.016, skip: (r, s) => (r === 0 && hash(s, 2, 2) > 0.5 ? 2 : 0) || hole(r, s, 2, 0.93) });
  }

  const geo = { skin: skin.build(), rags: rags.build(), eyes: eyes.build() };
  const maps = makeDetailMaps();
  const mats = {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.0, normalMap: maps.skin, normalScale: new THREE.Vector2(0.75, 0.75) }),
    rags: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide, normalMap: maps.cloth, normalScale: new THREE.Vector2(0.5, 0.5) }),
    eyes: new THREE.MeshStandardMaterial({ color: 0x1a0404, emissive: 0xff2210, emissiveIntensity: 0.26, roughness: 0.4 }),
  };
  const tris = Object.values(geo).reduce((s, g) => s + g.index.count / 3, 0);
  shared = { geo, mats, maps, tris, headCentre: hc };
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
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.3); // generous: covers attacks and the fall
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
  for (const t of Object.values(shared.maps)) t.dispose();
  shared = null;
}
