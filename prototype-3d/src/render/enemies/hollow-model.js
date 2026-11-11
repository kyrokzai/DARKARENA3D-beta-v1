// DA-INF01 "THE HOLLOW" — procedural skinned model, M1.6 rebuild (no external assets).
// Body parts are LOFTED skins: rings of elliptical cross-sections swept along the limb and blended between bones,
// so shoulders, elbows, wrists, hips and knees are continuous surfaces (no tubes joined by balls).
// One geometry per material is built ONCE and shared by every infected; an instance only owns its bones.
// 3 draw calls per infected (skin, rags, eyes). Bind pose: standing straight, facing +Z, feet at y = 0, metres.
// M1.7: VARIANTS (OUTPOST ZERO staff — GUARD / TECHNICIAN / WORKER) are built by the same code with a different
// LOOK: body girth, infection pattern, eye depth and outfit. Same skeleton, same bones, same animation, same hit zones
// (those live in the sim); one geometry set per variant (built once, shared by every infected of that variant),
// materials shared by all variants.
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

// ---------------------------------------------------------------- looks (cosmetic; never gameplay)
// torso / arm / leg: girth multipliers of the lofted cross-sections (bones untouched). infect: extra necrosis,
// neck / hands: extra infection there, veins: vein strength, tone: skin tint, socket: eye-socket depth, eyeZ: eyes
// pushed back into the skull (m), eyeScale.
export const LOOKS = {
  hollow: { id: 'hollow', get head() { return HEADS.hollow; }, torso: [1, 1], arm: 1, leg: 1, infect: 0, neck: 0, hands: 0, veins: 1, tone: [1, 1, 1], socket: 0.2, eyeZ: 0, eyeScale: 1 },
  guard: { id: 'guard', get head() { return HEADS.guard; }, shoulder: 0.022, hand: 1.0, torso: [1.05, 1.06], arm: 1.06, leg: 1.03, infect: 0.02, neck: 0.3, hands: 0.2, veins: 1, tone: [0.97, 0.96, 0.95], socket: 0.2, eyeZ: 0, eyeScale: 1 },
  technician: { id: 'technician', get head() { return HEADS.technician; }, shoulder: -0.014, hand: 0.95, torso: [0.9, 0.93], arm: 0.88, leg: 0.92, infect: 0.0, neck: 1.0, hands: 1.0, veins: 1.3, tone: [1.0, 1.0, 1.02], socket: 0.27, eyeZ: -0.008, eyeScale: 0.8 },
  worker: { id: 'worker', get head() { return HEADS.worker; }, shoulder: 0.012, hand: 1.2, torso: [1.08, 1.08], arm: 1.17, leg: 1.1, infect: 0.1, neck: 0.5, hands: 0.6, veins: 1.6, tone: [0.9, 0.88, 0.84], socket: 0.21, eyeZ: 0, eyeScale: 1.1 },
};
// M1.8 head shapes (unit-sphere sculpt parameters). w/h/d: skull scale, jaw: lower-face width, brow / cheek / hollow /
// temple / socket: feature strengths, nose / noseTip / noseBend: bridge, tip, broken-nose offset, crown: top flattening,
// back: occiput, ear: ear size, hair / stubble: hair density on scalp / jaw, scar: surgical scar.
export const HEADS = {
  hollow: { w: 1, h: 1, d: 1, jaw: 1, brow: 1, cheek: 1, hollow: 1.1, temple: 0.8, socket: 0.2, nose: 0.35, noseTip: 0.2, noseBend: 0, crown: 0.86, back: 1, ear: 0.8, hair: 0.15, stubble: 0.1, scar: 0, tornEar: 1, seed: 1 },
  guard: { w: 1.08, h: 0.97, d: 1.0, jaw: 1.32, brow: 1.4, cheek: 1.0, hollow: 0.8, temple: 0.6, socket: 0.19, nose: 1.0, noseTip: 0.9, noseBend: 0.05, crown: 0.8, back: 1.0, ear: 1.0, hair: 0.8, stubble: 0.7, scar: 0, tornEar: 1, seed: 11 },
  technician: { w: 0.9, h: 1.09, d: 1.04, jaw: 0.8, brow: 0.8, cheek: 1.25, hollow: 1.6, temple: 1.5, socket: 0.27, nose: 1.2, noseTip: 0.6, noseBend: 0, crown: 0.95, back: 1.05, ear: 0.95, hair: 0.25, stubble: 0.25, scar: 1, tornEar: 0, seed: 23 },
  worker: { w: 1.12, h: 0.95, d: 1.04, jaw: 1.35, brow: 1.7, cheek: 0.9, hollow: 0.6, temple: 0.5, socket: 0.21, nose: 0.6, noseTip: 1.8, noseBend: -0.03, crown: 0.84, back: 1.0, ear: 1.15, hair: 0.3, stubble: 1.0, scar: 0, tornEar: 0, seed: 37 },
};
let LK = LOOKS.hollow; // look being built (the builders are synchronous)

// ---------------------------------------------------------------- colours (authored in sRGB, stored linear)
const SKIN = [0.64, 0.61, 0.56], SKIN_COLD = [0.55, 0.58, 0.6], BRUISE = [0.17, 0.11, 0.15], VEIN = [0.27, 0.07, 0.1], ROT = [0.1, 0.09, 0.08];
/** Infected skin: pale grey with cold areas, dark necrotic patches (denser on neck, left shoulder, forearms, shins), veins. */
function skinColor(p) {
  const n = fbm(p.x * 4.3 + 3, p.y * 4.3, p.z * 4.3);
  // regions where the infection is advanced
  let region = Math.max(gauss(p.x - 0.16, p.y - 1.5, 0.2), gauss(p.x + 0.02, p.y - 1.66, 0.12) * 0.9, sstep(1.18, 1.02, 0.86) * (Math.abs(p.x) > 0.15 ? 1 : 0), sstep(0.42, 0.2, 0.02) * 0.8, gauss(p.x + 0.1, p.y - 1.2, 0.13) * 0.7);
  if (LK.neck) region += LK.neck * (p.y > 1.56 && p.y < 1.78 && Math.abs(p.x) < 0.08 ? 1 : 0);          // neck
  if (LK.hands) region += LK.hands * (p.y < 1.02 && p.y > 0.72 && Math.abs(p.x) > 0.13 ? 1 : 0);       // hands / wrists
  const patch = sstep(n + region * 0.16 + LK.infect, 0.6, 0.7) * 0.88;
  const cold = fbm(p.x * 2.1 + 9, p.y * 2.1, p.z * 2.1);
  const v = Math.abs(Math.sin(p.y * 38 + p.x * 11 + fbm(p.x * 8, p.y * 3, p.z * 8) * 9)); // branching dark veins near the patches
  const vein = Math.min(1, v < 0.06 ? (0.06 - v) / 0.06 * (0.12 + 0.6 * sstep(n + region * 0.16 + LK.infect, 0.46, 0.6)) * LK.veins : 0);
  const mottle = 0.84 + fbm(p.x * 14, p.y * 14, p.z * 14) * 0.3;
  const ext = p.y < 0.2 ? 0.6 : 1;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = (SKIN[i] + (SKIN_COLD[i] - SKIN[i]) * sstep(cold, 0.45, 0.7)) * LK.tone[i];
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

/** Outfit colour: base (upper) / base2 (below splitY), fbm dirt, blood stains, optional wear (lighter rubbed areas). */
function clothFn(base, base2 = base, { splitY = -1, dirt = 0.6, blood = 0.5, bloodT = 0.62, wear = 0 } = {}) {
  return (p) => {
    const n = fbm(p.x * 6, p.y * 6, p.z * 6), d = (1 - dirt * 0.5) + n * dirt, k = p.y < splitY ? 1 : 0;
    const b = sstep(fbm(p.x * 3 + 5, p.y * 3, p.z * 3), bloodT, bloodT + 0.1) * blood;
    const w = wear ? sstep(fbm(p.x * 11 + 2, p.y * 11, p.z * 11), 0.62, 0.75) * wear : 0;
    return [0, 1, 2].map(i => { const c = (base[i] + (base2[i] - base[i]) * k) * d; return (c + (0.55 - c) * w) * (1 - b) + [0.16, 0.02, 0.025][i] * b; });
  };
}

let SURF = null; // default surface functions per material kind (skin / rags / eyes)
// ---------------------------------------------------------------- surface detail for the baked maps (M1.8)
// height(p, n, loc, chart) → metres along the normal (only its gradient matters: it becomes the normal map);
// rough(...) → 0..1. Evaluated per texel by the offline bake, never at runtime.
function infectionField(p) { // same field as skinColor's necrotic patches (0 healthy … 1 rotten)
  const n = fbm(p.x * 4.3 + 3, p.y * 4.3, p.z * 4.3);
  let region = Math.max(gauss(p.x - 0.16, p.y - 1.5, 0.2), gauss(p.x + 0.02, p.y - 1.66, 0.12) * 0.9, sstep(1.18, 1.02, 0.86) * (Math.abs(p.x) > 0.15 ? 1 : 0), sstep(0.42, 0.2, 0.02) * 0.8, gauss(p.x + 0.1, p.y - 1.2, 0.13) * 0.7);
  if (LK.neck) region += LK.neck * (p.y > 1.56 && p.y < 1.78 && Math.abs(p.x) < 0.08 ? 1 : 0);
  if (LK.hands) region += LK.hands * (p.y < 1.02 && p.y > 0.72 && Math.abs(p.x) > 0.13 ? 1 : 0);
  return n + region * 0.16 + LK.infect;
}
function skinHeight(p) {
  const f = infectionField(p);
  const pores = (vnoise(p.x * 700, p.y * 700, p.z * 700) - 0.5) * 0.00012;
  const fine = (fbm(p.x * 90, p.y * 90, p.z * 90) - 0.5) * 0.0005;                       // fine creases / dry skin
  const wr = Math.sin(p.y * 260 + fbm(p.x * 20, p.y * 6, p.z * 20) * 7) * 0.00018;        // horizontal wrinkle lines
  const crater = -0.0022 * sstep(f, 0.66, 0.74) + 0.0012 * sstep(f, 0.6, 0.65) * (1 - sstep(f, 0.66, 0.7)); // sore: raised rim, sunken centre
  const v = Math.abs(Math.sin(p.y * 38 + p.x * 11 + fbm(p.x * 8, p.y * 3, p.z * 8) * 9)); const vein = v < 0.06 ? (0.06 - v) / 0.06 * 0.0005 * LK.veins : 0;
  const blister = Math.max(0, vnoise(p.x * 160 + 7, p.y * 160, p.z * 160) - 0.82) * 0.004 * sstep(f, 0.5, 0.62);
  return pores + fine + wr + crater + vein + blister;
}
function skinRough(p) { const f = infectionField(p); return Math.min(0.95, 0.66 + (vnoise(p.x * 40, p.y * 40, p.z * 40) - 0.5) * 0.18 - sstep(f, 0.64, 0.74) * 0.3 + (p.y < 0.2 ? 0.15 : 0)); }
/** Woven fabric seen through the chart's metric UVs (loc × chart size): twill + folds + side seam. */
function clothHeight(p, n, loc, ch) {
  const U = loc[0] * ch.w, V = loc[1] * ch.h;
  const twill = Math.sin((U + V) * 2 * Math.PI / 0.004) * 0.00012 + Math.sin((U - V * 0.5) * 2 * Math.PI / 0.011) * 0.00006;
  const folds = (fbm(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.006 + Math.sin(V * 2 * Math.PI / 0.09 + fbm(p.x * 4, p.y * 4, p.z * 4) * 4) * 0.0012;
  const seam = (Math.min(loc[0], 1 - loc[0]) * ch.w < 0.006 ? 0.0006 : 0) + (Math.abs(((V + 0.02) % 0.25) - 0.125) < 0.002 ? 0.0003 : 0);
  return twill + folds + seam;
}
function clothRough(p) { return 0.82 + (vnoise(p.x * 30, p.y * 30, p.z * 30) - 0.5) * 0.14; }
SURF = {
  skin: { color: (p, n) => skinColor(p), height: skinHeight, rough: skinRough },
  rags: { color: (p, n) => clothColor(p), height: clothHeight, rough: clothRough },
  eyes: { color: () => [0.75, 0.7, 0.6], height: () => 0, rough: () => 0.25 },
};

// ---------------------------------------------------------------- builder: skinned, coloured, UV-ATLASED geometry
// M1.8: every loft / added part is a CHART: a rectangle of the texture atlas sized to the part's real surface
// (circumference × length), so baked PBR maps (render/enemies/infected-maps.js, tools/bake-infected) have an even
// texel density. Closed lofts get a duplicated seam column (no UV wrap) whose normals are averaged → no lighting seam.
// The packing depends only on the charts' metric sizes, never on the tessellation → LOD meshes share the atlas.
// Each chart keeps its surface functions { color(p, n, loc) → sRGB, height(p, n, loc) → metres, rough(p, n, loc) }
// for the offline bake; at runtime only the vertex colours (fallback until the maps load) use them.
class Builder {
  constructor(kind = 'skin', preset = null) { this.kind = kind; this.preset = preset; this.pos = []; this.col = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.loc = []; this.cid = []; this.charts = []; this.pairs = []; this.chart = -1; }
  newChart(w, h, fns = {}, density = 1, name = '') {
    const pr = this.preset && this.preset[this.charts.length]; // LOD1/2: reuse LOD0's metric chart sizes → identical atlas packing
    if (pr) { w = pr[0]; h = pr[1]; }
    this.charts.push({ w: Math.max(0.004, w), h: Math.max(0.004, h), density, name, fns: { ...(SURF && SURF[this.kind]), ...fns } });
    return (this.chart = this.charts.length - 1);
  }
  vert(p, color, loc, weights) {
    this.pos.push(p.x, p.y, p.z); this.col.push(color[0] ** 2.2, color[1] ** 2.2, color[2] ** 2.2); this.uv.push(0, 0);
    this.loc.push(loc[0], loc[1]); this.cid.push(this.chart);
    const ii = [0, 0, 0, 0], ww = [0, 0, 0, 0]; let sum = 0;
    for (let k = 0; k < Math.min(4, weights.length); k++) { ii[k] = BONE_INDEX[weights[k][0]]; ww[k] = weights[k][1]; sum += weights[k][1]; }
    for (let k = 0; k < 4; k++) ww[k] /= sum || 1;
    this.si.push(...ii); this.sw.push(...ww);
    return this.pos.length / 3 - 1;
  }
  /**
   * Loft: rings = [{c:[x,y,z], ru, rv, w:[[bone, weight]…]}], swept in order. Cross-section axes: u = `hint` made
   * perpendicular to the path, v = path × u. opts: seg, color(p), displace(p, d, ring, a) → along the radial dir,
   * capStart / capEnd, skip(ring, seg) → hole, arc [a0, a1] (partial shell), jag(seg) → y offset of ring 0,
   * fns {color, height, rough} for the bake, density (texel density multiplier), name.
   */
  loft(rings, { seg = 12, hint = [1, 0, 0], color = null, displace = null, capStart = true, capEnd = true, skip = null, arc = null, jag = null, fns = {}, density = 1, name = '' } = {}) {
    seg = Math.max(3, Math.round(seg * LOD_SEG));
    const n = rings.length, H = new THREE.Vector3(...hint), t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
    const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2, closed = !arc, cols = seg + 1;
    // metric chart size: mean perimeter (of the swept arc) × path length — independent of `seg`
    let L = 0, rr = 0; for (let r = 0; r < n; r++) { const R = rings[r]; rr += Math.sqrt((R.ru * R.ru + R.rv * R.rv) / 2); if (r) L += Math.hypot(R.c[0] - rings[r - 1].c[0], R.c[1] - rings[r - 1].c[1], R.c[2] - rings[r - 1].c[2]); }
    // per-part colour functions may use the ring index (3rd arg); the bake knows only the position along the chart (loc v)
    const cum = [0]; for (let r = 1; r < n; r++) cum.push(cum[r - 1] + Math.hypot(rings[r].c[0] - rings[r - 1].c[0], rings[r].c[1] - rings[r - 1].c[1], rings[r].c[2] - rings[r - 1].c[2]));
    const ringAt = (v) => { const x = v * L; let best = 0; for (let r = 1; r < n; r++) if (Math.abs(cum[r] - x) < Math.abs(cum[best] - x)) best = r; return best; };
    const bakeColor = color ? (q, nn, loc, ch) => color(q, nn, ringAt(loc[1]), loc, ch) : undefined;
    if (color && color.height) fns = { height: color.height, rough: color.rough, ...fns }; // garment: colour + height + roughness
    this.newChart((a1 - a0) * rr / n, L, bakeColor ? { color: bakeColor, ...fns } : fns, density, name);
    const colorFn = color || this.charts[this.chart].fns.color || (() => [0.5, 0.5, 0.5]);
    const first = this.pos.length / 3; let len = 0;
    for (let r = 0; r < n; r++) {
      const R = rings[r], prev = rings[Math.max(0, r - 1)].c, next = rings[Math.min(n - 1, r + 1)].c;
      t.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
      u.copy(H).addScaledVector(t, -H.dot(t)).normalize(); v.crossVectors(t, u);
      c.set(...R.c);
      if (r > 0) len += Math.hypot(R.c[0] - rings[r - 1].c[0], R.c[1] - rings[r - 1].c[1], R.c[2] - rings[r - 1].c[2]);
      for (let s = 0; s < cols; s++) {
        const a = a0 + (a1 - a0) * (closed && s === seg ? 0 : s / seg); // closed: the last column duplicates the first
        d.copy(u).multiplyScalar(Math.cos(a) * R.ru).addScaledVector(v, Math.sin(a) * R.rv);
        p.copy(c).add(d);
        if (displace) { const k = displace(p, d, r, a); const l = d.length() || 1; p.addScaledVector(d, k / l); }
        if (jag && r === 0) p.y += jag(s % seg);
        this.vert(p, colorFn(p, d, r), [s / seg, L > 0 ? len / L : 0], R.w);
      }
      if (closed) this.pairs.push([first + r * cols, first + r * cols + seg]);
    }
    const at = (r, s) => first + r * cols + s;
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
      const ci = this.vert(c, colorFn(c, d.set(0, 0, 0), r), [0.5, r ? 1 : 0], R.w);
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
  /** Any placed BufferGeometry, rigid or with a weight function. Its own UVs become a chart (aspect = u/v metric ratio). */
  add(geo, { weights, color = null, displace = null, fns = {}, density = 1, aspect = 1, name = '' }) {
    geo.computeVertexNormals();
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), U = geo.getAttribute('uv'), base = this.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    // metric size from the (undisplaced) surface area
    let area = 0; { const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), ix = geo.index ? i => geo.index.getX(i) : i => i, cnt = geo.index ? geo.index.count : P.count;
      for (let i = 0; i < cnt; i += 3) { a.fromBufferAttribute(P, ix(i)); b.fromBufferAttribute(P, ix(i + 1)); cc.fromBufferAttribute(P, ix(i + 2)); area += b.sub(a).cross(cc.sub(a)).length() / 2; } }
    if (color && color.height) fns = { height: color.height, rough: color.rough, ...fns };
    this.newChart(Math.sqrt(area * aspect), Math.sqrt(area / aspect), color ? { color: (q, nn, loc, ch) => color(q, nn, undefined, loc, ch), ...fns } : fns, density, name);
    const colorFn = color || this.charts[this.chart].fns.color || (() => [0.5, 0.5, 0.5]);
    const seen = new Map();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`; // seam duplicates of this part (sphere u = 0 / 1)
      if (displace) p.addScaledVector(n, displace(p, n));
      const vi = this.vert(p, colorFn(p, n), U ? [U.getX(i), U.getY(i)] : [0.5, 0.5], typeof weights === 'function' ? weights(p) : weights);
      if (seen.has(key)) this.pairs.push([seen.get(key), vi]); else seen.set(key, vi);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  /** Pack the charts into a size×size atlas (shelf packing, `pad` texels around each chart). */
  pack(size = 1024, pad = 4) {
    const C = this.charts, order = C.map((c, i) => i).sort((a, b) => C[b].h * C[b].density - C[a].h * C[a].density);
    const tryK = (k) => {
      let x = 0, y = 0, shelf = 0; const out = [];
      for (const i of order) {
        const w = Math.ceil(C[i].w * C[i].density * k) + pad * 2, h = Math.ceil(C[i].h * C[i].density * k) + pad * 2;
        if (w > size) return null;
        if (x + w > size) { x = 0; y += shelf; shelf = 0; }
        if (y + h > size) return null;
        out[i] = { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 }; x += w; shelf = Math.max(shelf, h);
      }
      return out;
    };
    let lo = 1, hi = size * 40, best = tryK(lo);
    for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, r = tryK(mid); if (r) { lo = mid; best = r; } else hi = mid; }
    this.atlas = { size, pad, k: lo, rects: best }; // k = texels per metre at density 1
    return this.atlas;
  }
  build(size = 1024) {
    const A = this.pack(size);
    for (let i = 0; i < this.cid.length; i++) {
      const r = A.rects[this.cid[i]];
      this.uv[i * 2] = (r.x + this.loc[i * 2] * r.w) / size;
      this.uv[i * 2 + 1] = 1 - (r.y + this.loc[i * 2 + 1] * r.h) / size; // image row 0 = top (flipY)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // seams: the duplicated vertices share one (averaged) normal → no lighting crease along the UV cut
    const N = g.getAttribute('normal');
    for (const [a, b] of this.pairs) { const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
    g.computeBoundingSphere();
    g.userData.bake = { kind: this.kind, charts: this.charts, cid: this.cid, loc: this.loc, atlas: A };
    return g;
  }
}
export const ATLAS = { skin: 1024, rags: 1024, eyes: 64 };
let LOD_SEG = 1; // tessellation multiplier of the LOD being built (1 = LOD0)
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

// ---------------------------------------------------------------- outfits of the OUTPOST ZERO staff (M1.7)
// All pieces are shells lofted over the SAME body rings (so they deform with the same bones) and go into the one
// 'rags' geometry → still 3 draw calls per infected. Pieces never extend further than ~4 cm past the body, so the
// silhouette stays inside the sim hit zones.
/**
 * Garment surface (M1.8): returns a colour function (p, n, ring, loc, chart) → sRGB with .height / .rough attached, so
 * one object drives the vertex colours, the baked base colour, normal relief and roughness.
 * weave: 'ripstop' | 'canvas' | 'twill' | 'knit' | 'leather' | 'rubber' | 'cordura'; bands: [{ y0, y1, color, rough }]
 * (bind-pose heights, e.g. hi-vis stripes); tears: painted rips (dark, frayed rim) instead of holes in the mesh.
 */
const WEAVE = {
  ripstop: { h: (U, V) => Math.max(Math.abs(Math.sin(U * Math.PI / 0.006)), Math.abs(Math.sin(V * Math.PI / 0.006))) > 0.97 ? 0.00025 : (vnoise(U * 900, V * 900, 1) - 0.5) * 0.00008, c: 0.05, r: 0.86 },
  canvas: { h: (U, V) => (vnoise(U * 260, V * 260, 2) - 0.5) * 0.00022 + Math.sin(U * Math.PI / 0.004) * Math.sin(V * Math.PI / 0.004) * 0.00006, c: 0.08, r: 0.9 },
  twill: { h: (U, V) => Math.sin((U + V) * Math.PI / 0.005) * 0.00014, c: 0.05, r: 0.88 },
  knit: { h: (U, V) => Math.abs(Math.sin(U * Math.PI / 0.005)) * 0.0004 + (vnoise(U * 400, V * 400, 3) - 0.5) * 0.0001, c: 0.12, r: 0.95 },
  cordura: { h: (U, V) => (vnoise(U * 500, V * 500, 4) - 0.5) * 0.00018 + (Math.abs(((V + 0.5) % 0.03) - 0.015) < 0.0045 ? 0.0006 : 0), c: 0.06, r: 0.8 },
  leather: { h: (U, V) => (fbm(U * 120, V * 120, 5) - 0.5) * 0.0004, c: 0.1, r: 0.6 },
  rubber: { h: (U, V) => (Math.abs(((U + V) % 0.012) - 0.006) < 0.002 ? 0.0006 : 0), c: 0.03, r: 0.75 },
};
function garment(base, { weave = 'canvas', dirt = 0.6, blood = 0.4, bloodT = 0.62, wear = 0.3, bands = [], tears = 0.25, grime = 0.5, seams = true } = {}) {
  const W = WEAVE[weave];
  const metric = (loc, ch) => (loc && ch ? [loc[0] * ch.w, loc[1] * ch.h] : [0, 0]);
  const tearF = (p) => tears ? sstep(vnoise(p.x * 22 + 3, p.y * 22, p.z * 22) * 0.7 + vnoise(p.x * 70, p.y * 70, p.z * 70) * 0.3, 1 - tears * 0.25, 1 - tears * 0.25 + 0.03) : 0;
  const band = (p) => { for (const b of bands) if (p.y >= b.y0 && p.y <= b.y1 && (!b.side || Math.sign(p.z || 1) === b.side)) return b; return null; };
  const color = (p, n, r, loc, ch) => {
    if (Array.isArray(r)) { ch = loc; loc = r; } // called by the bake as (p, n, loc, chart)
    const [U, V] = metric(loc, ch);
    const b = band(p);
    let c = (b ? b.color : base).slice();
    const mott = 0.88 + fbm(p.x * 7, p.y * 7, p.z * 7) * 0.24 + (loc ? (W.h(U, V) / 0.0004) * W.c : 0);
    const low = sstep(0.6 - p.y, 0, 0.6) * grime;                                              // grime towards the ground
    const dd = 1 - dirt * 0.45 * sstep(fbm(p.x * 5 + 1, p.y * 5, p.z * 5), 0.45, 0.7) - low * 0.35;
    const wr = wear * sstep(fbm(p.x * 14 + 2, p.y * 14, p.z * 14), 0.6, 0.75);                 // rubbed / faded
    const bl = blood * sstep(fbm(p.x * 3 + 5, p.y * 3, p.z * 3), bloodT, bloodT + 0.08);
    const seam = seams && loc && ch && Math.min(loc[0], 1 - loc[0]) * ch.w < 0.004 ? 0.75 : 1; // side seam
    const stitch = seams && loc && ch && Math.abs(Math.min(loc[0], 1 - loc[0]) * ch.w - 0.007) < 0.0012 && Math.sin(V * Math.PI / 0.003) > 0 ? 0.8 : 1;
    const t = tearF(p), rim = tears ? sstep(vnoise(p.x * 22 + 3, p.y * 22, p.z * 22) * 0.7 + vnoise(p.x * 70, p.y * 70, p.z * 70) * 0.3, 1 - tears * 0.25 - 0.03, 1 - tears * 0.25) * (1 - t) : 0;
    return c.map((v, i) => {
      let x = v * mott * dd * seam * stitch; x = x + (0.62 - x) * wr * 0.6 + rim * 0.12;
      x = x * (1 - bl) + [0.17, 0.03, 0.03][i] * bl;
      return x * (1 - t * 0.85);
    });
  };
  color.height = (p, n, loc, ch) => {
    const [U, V] = metric(loc, ch);
    const folds = (fbm(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.005 + Math.sin(V * 2 * Math.PI / 0.08 + fbm(p.x * 4, p.y * 4, p.z * 4) * 5) * 0.0009;
    const seam = seams && loc && ch && Math.min(loc[0], 1 - loc[0]) * ch.w < 0.004 ? 0.0005 : 0;
    const b = band(p) ? 0.0003 : 0;
    return W.h(U, V) + folds + seam + b - tearF(p) * 0.0015;
  };
  color.rough = (p) => { const b = band(p); const bl = blood * sstep(fbm(p.x * 3 + 5, p.y * 3, p.z * 3), bloodT, bloodT + 0.08); return Math.max(0.25, (b && b.rough ? b.rough : W.r) - bl * 0.4 + (vnoise(p.x * 30, p.y * 30, p.z * 30) - 0.5) * 0.06); };
  return color;
}
const OUTFITS = {
  guard: { // damaged dark tactical uniform (ripstop), plate carrier with webbing, patrol cap, worn combat boots
    shirt: garment([0.13, 0.145, 0.17], { weave: 'ripstop', dirt: 0.5, blood: 0.45, wear: 0.35, tears: 0.3 }), sleeveTo: 10, shirtPad: 0.01,
    trousers: garment([0.14, 0.15, 0.17], { weave: 'ripstop', dirt: 0.6, blood: 0.3, wear: 0.4, tears: 0.3, grime: 0.8 }), trouserTo: 11,
    boots: garment([0.07, 0.065, 0.06], { weave: 'leather', dirt: 0.6, blood: 0.1, wear: 0.55, tears: 0, seams: false }),
    vest: garment([0.2, 0.21, 0.18], { weave: 'cordura', dirt: 0.5, blood: 0.35, bloodT: 0.66, wear: 0.3, tears: 0.15 }),
    tear: 1, shoulder: 0.02,
    cap: { theta: 1.25, scale: 1.1, tall: 0.8, dy: 0.008, brim: true, lumpy: 0.002, color: garment([0.11, 0.12, 0.14], { weave: 'twill', dirt: 0.4, blood: 0.15, tears: 0, seams: false }) },
  },
  technician: { // light-grey coveralls (canvas): seams, zip, chest pocket, reflective band; painted rips; worn shoes
    shirt: garment([0.5, 0.51, 0.5], { weave: 'canvas', dirt: 0.85, blood: 0.55, bloodT: 0.6, wear: 0.15, tears: 0.45, bands: [{ y0: 1.335, y1: 1.375, color: [0.72, 0.74, 0.74], rough: 0.4 }] }), sleeveTo: 10, shirtPad: 0.006, openCollar: true,
    trousers: garment([0.47, 0.48, 0.47], { weave: 'canvas', dirt: 0.9, blood: 0.4, tears: 0.4, grime: 1, bands: [{ y0: 0.3, y1: 0.33, color: [0.72, 0.74, 0.74], rough: 0.4 }] }), trouserTo: 11,
    shoes: garment([0.27, 0.22, 0.17], { weave: 'leather', dirt: 0.7, blood: 0, wear: 0.7, tears: 0, seams: false }),
    tear: 1, shoulder: -0.014, zip: true,
  },
  worker: { // olive work jacket + trousers (canvas), muted orange hi-vis bands, knee pads, boots, beanie, torn gloves
    shirt: garment([0.27, 0.29, 0.17], { weave: 'canvas', dirt: 0.65, blood: 0.5, wear: 0.3, tears: 0.3, bands: [{ y0: 1.2, y1: 1.245, color: [0.62, 0.32, 0.08], rough: 0.55 }, { y0: 1.37, y1: 1.41, color: [0.62, 0.32, 0.08], rough: 0.55 }, { y0: 1.1, y1: 1.13, color: [0.62, 0.32, 0.08], rough: 0.55 }] }), sleeveTo: 9, shirtPad: 0.014, jacket: true,
    trousers: garment([0.22, 0.21, 0.17], { weave: 'twill', dirt: 0.65, blood: 0.35, tears: 0.3, grime: 1, bands: [{ y0: 0.25, y1: 0.285, color: [0.6, 0.31, 0.08], rough: 0.55 }] }), trouserTo: 11,
    boots: garment([0.13, 0.095, 0.07], { weave: 'leather', dirt: 0.6, blood: 0, wear: 0.4, tears: 0, seams: false }),
    gloves: garment([0.17, 0.13, 0.09], { weave: 'leather', dirt: 0.5, blood: 0.6, bloodT: 0.55, wear: 0.5, tears: 0.2, seams: false }),
    pads: [0.09, 0.09, 0.08], tear: 1, shoulder: 0.012, hand: 1.18,
    cap: { theta: 1.32, scale: 1.12, tall: 0.9, dy: 0.0, brim: false, lumpy: 0.004, color: garment([0.19, 0.15, 0.11], { weave: 'knit', dirt: 0.6, blood: 0.2, tears: 0, seams: false }) },
  },
};
function buildOutfit(id, rags, { torsoRings, armRings, legRings, hole, W, hc, HR }) {
  const O = OUTFITS[id], pad = O.shirtPad;
  const noise = (amp, f) => (p) => (fbm(p.x * f, p.y * f, p.z * f) - 0.5) * amp;
  const plain = (c) => () => c;
  // upper garment: torso shell hips→collar (jacket: longer and thicker); collar ring narrower
  const top = torsoRings.slice(O.jacket ? 1 : 2, 12).map(R => ({ c: [...R.c], ru: R.ru * 1.06 + pad, rv: R.rv * 1.08 + pad + 0.002, w: R.w }));
  const col = top[top.length - 1]; col.ru = O.openCollar ? 0.118 : 0.1 + pad * 0.6; col.rv = O.openCollar ? 0.088 : 0.075 + pad * 0.6;
  rags.loft(top, {
    seg: 22, color: O.shirt, uvRep: [8, 12], capStart: false, capEnd: false,
    jag: (s) => -0.025 * hash(s, 2, 7), displace: noise(0.012, 9),
    skip: (r, s) => hole(r, s, 11, O.tear),
  });
  // sleeves: shoulder → cuff (ring 0 of the reversed list = cuff, with a slightly ragged edge)
  for (const sx of [1, -1]) {
    const R = armRings(sx).slice(0, O.sleeveTo).reverse().map(r => ({ c: [...r.c], ru: r.ru * 1.12 + pad * 0.7 + 0.004, rv: r.rv * 1.12 + pad * 0.7 + 0.004, w: r.w }));
    rags.loft(R, { seg: 12, hint: [0, 0, 1], color: O.shirt, uvRep: [4, 12], capStart: false, capEnd: false, jag: (s) => 0.012 * hash(s, sx, 3), displace: noise(0.01, 12), skip: (r, s) => hole(r, s, 5 + sx, O.tear + 0.02) });
  }
  // trousers: waist + legs to the ankle
  const waist = torsoRings.slice(0, 4).map(R => ({ c: [...R.c], ru: R.ru * 1.06 + 0.008, rv: R.rv * 1.08 + 0.008, w: R.w }));
  rags.loft(waist, { seg: 22, color: O.trousers, uvRep: [8, 12], capStart: true, capEnd: false, displace: noise(0.01, 9) });
  for (const sx of [1, -1]) {
    const L = legRings(sx).slice(0, O.trouserTo).reverse().map(R => ({ c: [...R.c], ru: R.ru * 1.14 + 0.009, rv: R.rv * 1.12 + 0.009, w: R.w }));
    rags.loft(L, { seg: 12, color: O.trousers, uvRep: [5, 12], capStart: false, capEnd: false, jag: (s) => 0.015 * hash(s, sx + 3, 8), displace: noise(0.014, 10), skip: (r, s) => hole(r, s, 9 + sx, O.tear + 0.02) });
  }
  // footwear: boots (shaft over the ankle) or low worn shoes (technician: a split at the toe)
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R', boot = !!O.boots, c = O.boots || O.shoes;
    if (boot) {
      const shaft = legRings(sx).slice(8, 13).map(R => ({ c: [...R.c], ru: R.ru * 1.2 + 0.012, rv: R.rv * 1.2 + 0.012, w: R.w }));
      rags.loft(shaft, { seg: 12, color: c, uvRep: [4, 8], capStart: false, capEnd: false, displace: noise(0.004, 14) });
    }
    rags.loft([
      { c: [sx * 0.095, 0.03, -0.062], ru: 0.026, rv: 0.03, w: W(['foot' + s, 1]) },
      { c: [sx * 0.095, 0.045, -0.025], ru: 0.04, rv: 0.046, w: W(['foot' + s, 1]) },
      { c: [sx * 0.096, 0.048, 0.04], ru: 0.044, rv: 0.044, w: W(['foot' + s, 1]) },
      { c: [sx * 0.098, 0.036, 0.11], ru: 0.05, rv: 0.032, w: W(['foot' + s, 1]) },
      { c: [sx * 0.1, 0.026, 0.17], ru: 0.05, rv: 0.024, w: W(['foot' + s, 1]) },
      { c: [sx * 0.1, 0.02, 0.2], ru: 0.036, rv: 0.016, w: W(['foot' + s, 1]) },
    ], { seg: 12, color: c, uvRep: [2, 8], capStart: true, capEnd: true, displace: noise(0.004, 16), skip: (r, k) => (!boot && sx < 0 && r === 4 && (k === 0 || k === 11) ? 1 : 0) });
    // sole
    const sole = new THREE.BoxGeometry(0.085, 0.018, 0.27); sole.translate(sx * 0.097, 0.009, 0.066);
    rags.add(sole, { weights: W(['foot' + s, 1]), color: plain([0.04, 0.04, 0.04]) });
  }
  if (O.vest) { // plate carrier: thick shell over the chest + shoulder straps + magazine pouches
    const V = torsoRings.slice(6, 11).map(R => ({ c: [R.c[0], R.c[1], R.c[2]], ru: R.ru * 1.04 + 0.03, rv: R.rv * 1.0 + 0.036, w: R.w }));
    rags.loft(V, { seg: 22, color: O.vest, uvRep: [6, 6], capStart: true, capEnd: true, displace: noise(0.006, 7), skip: (r, s) => (r === 3 && (s >= 4 && s <= 6 || s >= 16 && s <= 18) ? 1 : 0) });
    for (const sx of [-1, 1]) {
      for (const [y, h] of [[1.25, 0.1]]) {
        const pch = new THREE.BoxGeometry(0.05, h, 0.03); pch.translate(sx * 0.045, y, torsoRings[7].rv + 0.055);
        rags.add(pch, { weights: W(['spine', 0.4], ['chest', 0.6]), color: O.vest, displace: noise(0.004, 20) });
      }
      const pch2 = new THREE.BoxGeometry(0.045, 0.075, 0.026); pch2.translate(sx * 0.11, 1.26, torsoRings[7].rv + 0.035);
      rags.add(pch2, { weights: W(['spine', 0.4], ['chest', 0.6]), color: O.vest });
      const strap = new THREE.BoxGeometry(0.05, 0.02, 0.2); strap.translate(sx * 0.105, 1.565, -0.004);
      rags.add(strap, { weights: W(['chest', 1]), color: O.vest });
    }
    const patch = new THREE.PlaneGeometry(0.07, 0.035); patch.translate(-0.075, 1.43, torsoRings[8].rv + 0.04); // pale ID patch
    rags.add(patch, { weights: W(['chest', 1]), color: plain([0.42, 0.42, 0.38]) });
  }
  if (O.zip) { // technician coverall: front zip, chest pocket with a name tag (the reflective band is in the fabric texture)
    const zf = torsoRings[7].rv * 1.08 + pad + 0.004;
    const zip = new THREE.BoxGeometry(0.01, 0.46, 0.006); zip.translate(0, 1.2, zf);
    rags.add(zip, { weights: (p) => (p.y > 1.25 ? W(['chest', 1]) : W(['spine', 1])), color: garment([0.2, 0.2, 0.21], { weave: 'rubber', dirt: 0.3, blood: 0.2, tears: 0, seams: false }) });
    const pk = new THREE.BoxGeometry(0.07, 0.08, 0.012); pk.translate(0.075, 1.42, torsoRings[8].rv * 1.08 + pad + 0.004);
    rags.add(pk, { weights: W(['chest', 1]), color: O.shirt });
    const t = new THREE.PlaneGeometry(0.06, 0.02); t.translate(0.075, 1.475, torsoRings[8].rv * 1.08 + pad + 0.011);
    rags.add(t, { weights: W(['chest', 1]), color: plain([0.82, 0.82, 0.78]) });
  }
  if (O.jacket) { // collar, front zip and chest pockets of the work jacket
    const zip = new THREE.BoxGeometry(0.012, 0.42, 0.008); zip.translate(0, 1.22, torsoRings[7].rv * 1.08 + pad + 0.006);
    rags.add(zip, { weights: (p) => (p.y > 1.25 ? W(['chest', 1]) : W(['spine', 1])), color: plain([0.08, 0.08, 0.07]) });
    for (const sx of [-1, 1]) {
      const pk = new THREE.BoxGeometry(0.075, 0.08, 0.016); pk.translate(sx * 0.085, 1.37, torsoRings[8].rv * 1.08 + pad + 0.006);
      rags.add(pk, { weights: W(['chest', 1]), color: O.shirt });
    }
    const collar = torsoRings.slice(10, 12).map((R, i) => ({ c: [R.c[0], R.c[1] + 0.02 * i, R.c[2] - 0.006], ru: (i ? 0.115 : R.ru * 1.06 + pad + 0.01), rv: (i ? 0.088 : R.rv * 1.08 + pad + 0.01), w: R.w }));
    rags.loft(collar, { seg: 18, color: O.shirt, uvRep: [6, 4], capStart: false, capEnd: false, skip: (r, s) => (s >= 3 && s <= 6 ? 1 : 0) });
  }
  if (O.gloves) { // work gloves over palm / back of the hand: fingers exposed (cut / torn off), holes
    for (const sx of [1, -1]) {
      const R = armRings(sx).slice(10, 15).map(r => ({ c: [...r.c], ru: r.ru * 1.12 + 0.005, rv: r.rv * 1.08 + 0.005, w: r.w }));
      rags.loft(R, { seg: 10, hint: [0, 0, 1], color: O.gloves, uvRep: [3, 8], capStart: false, capEnd: false, jag: (s) => -0.012 * hash(s, sx, 9), skip: (r, s) => hole(r, s, 7 + sx, 0.78) });
    }
  }
  if (O.cap) { // headwear (soft — a cap / beanie, no armour): a shell over the crown, weighted to the head bone
    const g = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, O.cap.theta), P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), back = z < 0 ? 1.12 : 1;
      P.setXYZ(i, hc[0] + x * HR[0] * O.cap.scale, hc[1] + O.cap.dy + y * HR[1] * O.cap.scale * O.cap.tall, hc[2] - 0.004 + z * HR[2] * O.cap.scale * back);
    }
    rags.add(g, { weights: W(['head', 1]), color: O.cap.color, displace: noise(O.cap.lumpy, 26) });
    if (O.cap.brim) { // patrol-cap visor
      const b = new THREE.CylinderGeometry(1, 1, 0.006, 16, 1, false, -0.9, 1.8); b.scale(0.07, 1, 0.06);
      b.translate(hc[0], hc[1] + O.cap.dy + HR[1] * 0.3, hc[2] + HR[2] * 0.86);
      rags.add(b, { weights: W(['head', 1]), color: O.cap.color });
    }
  }
  if (O.pads) { // knee pads
    for (const sx of [1, -1]) {
      const s = sx > 0 ? 'L' : 'R', k = new THREE.SphereGeometry(1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      k.rotateX(Math.PI / 2); k.scale(0.055, 0.07, 0.03); k.translate(sx * 0.095, 0.49, legRings(sx)[5].rv * 1.12 + 0.016);
      rags.add(k, { weights: W(['thigh' + s, 0.5], ['shin' + s, 0.5]), color: plain(O.pads) });
    }
  }
}

let common = null;       // detail maps + materials: one set for every variant
const sets = {};         // variant → { geo, mats, maps, tris, headCentre }
function getCommon() {
  if (common) return common;
  const maps = makeDetailMaps();
  const mats = {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.0, normalMap: maps.skin, normalScale: new THREE.Vector2(0.75, 0.75) }),
    rags: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide, normalMap: maps.cloth, normalScale: new THREE.Vector2(0.5, 0.5) }),
    eyes: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xff2a14, emissiveIntensity: 0.05, roughness: 0.22 }), // wet eyeballs / teeth / gums, faint red glow
  };
  common = { maps, mats };
  return common;
}
export const VARIANT_IDS = Object.keys(LOOKS);

// ---------------------------------------------------------------- baked PBR maps (M1.8)
// assets/infected/<variant>_<part>_color.jpg (sRGB base colour) + _nr.jpg (tangent-space normal XY in RG, roughness in B;
// normal Z is reconstructed in the shader) — baked offline by tools/bake-infected (scripts/bake-infected.js).
// Until they are loaded (or if loading fails) the material shows the vertex colours: the model is never invisible.
export const BAKED_VARIANTS = ['guard', 'technician', 'worker'];
const MAP_URL = new URL('../../../assets/infected/', import.meta.url);
let loader = null;
const mapStats = { requested: 0, loaded: 0, failed: 0 };
export function getMapStats() { return { ...mapStats }; }
function patchPackedNR(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec4 nrS = texture2D( normalMap, vNormalMapUv ); vec3 mapN = vec3( nrS.xy * 2.0 - 1.0, 0.0 ); mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );')
      .replace('float roughnessFactor = roughness;', 'float roughnessFactor = roughness;\n#ifdef USE_NORMALMAP\n\troughnessFactor *= texture2D( normalMap, vNormalMapUv ).b;\n#endif');
  };
  mat.customProgramCacheKey = () => 'da-infected-nr';
}
function bakedMaterial(variant, part, opts) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, ...opts });
  if (!BAKED_VARIANTS.includes(variant) || typeof document === 'undefined') return m;
  loader = loader || new THREE.TextureLoader();
  const load = (suffix, srgb) => new Promise((res) => {
    mapStats.requested++;
    loader.load(new URL(`${variant}_${part}_${suffix}.jpg`, MAP_URL).href, (t) => { mapStats.loaded++; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.flipY = true; res(t); }, undefined, () => { mapStats.failed++; res(null); });
  });
  m.userData.ready = Promise.all([load('color', true), load('nr', false)]).then(([c, nr]) => {
    if (!c || !nr) return false;
    m.map = c; m.normalMap = nr; m.vertexColors = false; m.roughness = 1; m.normalScale.set(1, 1);
    patchPackedNR(m); m.needsUpdate = true; m.userData.baked = true;
    return true;
  });
  return m;
}
/** Build the shared geometries of one variant once (materials are common to all variants). */
export function getHollowAssets(variant = 'hollow') {
  if (sets[variant]) return sets[variant];
  if (!LOOKS[variant]) throw new Error('Unknown infected variant: ' + variant);
  const prevLook = LK, prevSeg = LOD_SEG; LK = LOOKS[variant];
  try {
    // M1.8 LOD: LOD0 full tessellation; LOD1 / LOD2 the same parts with fewer segments and LOD0's chart sizes, so all
    // three use the same baked maps. Same skeleton → no animation desync when switching (render-only; hit zones live in the sim).
    const L0 = buildVariant({ lod: 1 });
    const lods = [L0.geo];
    for (const lod of LOD_LEVELS.slice(1)) {
      const Lk = buildVariant({ lod, presets: L0.charts });
      for (const k of ['skin', 'rags']) if (Lk.charts[k].length !== L0.charts[k].length) throw new Error(`LOD chart mismatch (${variant} ${k})`);
      lods.push(Lk.geo);
    }
    const { maps, mats: shared } = getCommon();
    const mats = BAKED_VARIANTS.includes(LK.id) ? {
      skin: bakedMaterial(LK.id, 'skin', { roughness: 0.74 }),
      rags: bakedMaterial(LK.id, 'rags', { roughness: 0.96, side: THREE.DoubleSide }),
      eyes: shared.eyes,
    } : shared;
    const tri = (g) => Object.values(g).reduce((s, x) => s + x.index.count / 3, 0);
    return (sets[variant] = { variant: LK.id, geo: L0.geo, lods, mats, maps, tris: tri(L0.geo), trisLod: lods.map(tri), headCentre: L0.hc });
  } finally { LK = prevLook; LOD_SEG = prevSeg; }
}
export const LOD_LEVELS = [1, 0.55, 0.32];
function buildVariant({ lod = 1, presets = null } = {}) {
  LOD_SEG = lod;
  const skin = new Builder('skin', presets && presets.skin), rags = new Builder('rags', presets && presets.rags), eyes = new Builder('eyes');
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
  const torsoRings = T.map(([y, ru, rv, cz, w]) => { const g = y < 1.57 ? LK.torso : [1, 1]; return { c: [0, y, cz], ru: ru * g[0], rv: rv * g[1], w }; });
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
  let armRings = (sx) => {
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
  const armRings0 = armRings, armG = (r) => (r.c[1] > 0.97 ? LK.arm : 1 + (LK.arm - 1) * 0.5); // hands thicken less
  // M1.8 silhouette: shoulders wider / narrower (deltoid region moved along x, fading out by the elbow), hand size
  const shoulderOff = (r) => (LK.shoulder || 0) * sstep(r.c[1], 1.22, 1.45) * (Math.abs(r.c[0]) > 0.15 ? 1 : 0.4);
  armRings = (sx) => armRings0(sx).map(r => { const hand = r.c[1] < 0.97 ? (LK.hand || 1) : 1; return { ...r, c: [r.c[0] + sx * shoulderOff(r), r.c[1], r.c[2]], ru: r.ru * armG(r) * hand, rv: r.rv * armG(r) * hand }; });
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
    fingers.forEach(([fx, L0, curl], k) => {
      const L = L0 * (LK.hand || 1), fr = LK.hand || 1;
      const rings = []; let y = 0.85, z = 0.008, ang = -0.12; // ang: 0 = straight down, negative z = curl
      const segs = [[0.0, 0.0105], [0.4, 0.0088], [0.42, 0.0098], [0.72, 0.0074], [0.74, 0.0084], [1.0, 0.0056], [1.14, 0.0035], [1.3, 0.0008]];
      let last = 0;
      for (const [t, r] of segs) {
        const dl = (t - last) * L; last = t;
        y -= Math.cos(ang) * dl; z -= Math.sin(-ang) * dl * 1; // step, then bend at the joints
        rings.push({ c: [sx * (0.19 + fx * fr * (1 + t * 0.25)), y, z], ru: r * fr, rv: r * 1.05 * fr, w: W(['hand' + s, 1]), t });
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
  let legRings = (sx) => {
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
  const legRings0 = legRings;
  legRings = (sx) => legRings0(sx).map(r => ({ ...r, ru: r.ru * (r.c[1] > 0.08 ? LK.leg : 1), rv: r.rv * (r.c[1] > 0.08 ? LK.leg : 1) }));
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

  // ============ HEAD (M1.8): anatomical procedural head — per-variant skull, orbits with lids, nose, cheekbones, lips,
  // eyeballs. Same pivot and size class as M1.7 (the sim head zone is unchanged); detail below the mesh step comes from
  // the baked maps (faceColor / faceHeight).
  const HD = LK.head || HEADS.hollow;
  const hc = [BIND.head[0], BIND.head[1] + 0.085, BIND.head[2] + 0.015], HR = [0.083 * HD.w, 0.112 * HD.h, 0.1 * HD.d];
  const fx = (x, y, ax, ay, sx, sy) => Math.exp(-((x - ax) * (x - ax)) / (sx * sx) - ((y - ay) * (y - ay)) / (sy * sy));
  const local = (p) => [(p.x - hc[0]) / HR[0], (p.y - hc[1]) / HR[1], (p.z - hc[2]) / HR[2]];
  /** Sculpt of the unit head: returns the radial offset factor k at unit-sphere point (x, y, z). */
  const sculpt = (x, y, z) => {
    const ax = Math.abs(x), front = sstep(z, 0.05, 0.4), side = x > 0 ? 1 : -1;
    let k = 0;
    k += HD.brow * 0.075 * fx(ax, y, 0.36, 0.3, 0.2, 0.07) * front + HD.brow * 0.05 * fx(x, y, 0, 0.27, 0.12, 0.08) * front; // brow ridge + glabella
    k -= HD.socket * fx(ax, y, 0.37, 0.07, 0.17, 0.13) * front * (1 - 0.45 * fx(ax, y, 0.41, 0.05, 0.1, 0.07));    // orbits (the eyeball fills the centre)
    k += 0.035 * fx(ax, y, 0.37, 0.16, 0.15, 0.035) * front;                                          // upper eyelid fold
    k += 0.022 * fx(ax, y, 0.37, -0.03, 0.13, 0.03) * front;                                          // lower lid / tear trough edge
    k -= 0.03 * fx(ax, y, 0.37, -0.1, 0.18, 0.05) * front;                                            // sunken under-eye
    k += HD.nose * 0.075 * fx(x, y, 0, 0.06, 0.06, 0.2) * front;                                      // nose bridge
    k += HD.noseTip * 0.08 * fx(x + HD.noseBend, y, 0, -0.17, 0.08, 0.07) * front;                    // nose tip (bent / broken)
    k += 0.04 * fx(ax, y, 0.11, -0.24, 0.055, 0.045) * front * (side > 0 ? 1 : 0.35);                // nostril wings (one rotted away)
    k -= 0.05 * fx(ax, y, 0.07, -0.27, 0.035, 0.03) * front;                                          // nostrils
    k += HD.cheek * 0.07 * fx(ax, y, 0.6, -0.08, 0.17, 0.11);                                          // cheekbones
    k += 0.035 * fx(ax, y, 0.82, 0.0, 0.12, 0.05);                                                     // zygomatic arch
    k -= HD.hollow * 0.09 * fx(ax, y, 0.52, -0.42, 0.17, 0.16) * sstep(z, -0.2, 0.2);                 // hollow cheeks
    k += 0.022 * fx(ax, y, 0.22, -0.36, 0.05, 0.09) * front;                                          // nasolabial folds
    k += 0.04 * fx(x, y, 0, -0.47, 0.26, 0.05) * front;                                               // thin upper lip pulled back
    k -= HD.temple * 0.07 * fx(ax, y, 0.9, 0.18, 0.18, 0.2);                                           // temples
    k += HD.jaw * 0.05 * fx(ax, y, 0.72, -0.55, 0.16, 0.14);                                           // jaw angle (width of the lower face)
    k += (vnoise(x * 4 + HD.seed, y * 4, z * 4) - 0.5) * 0.045 * (y > 0.25 ? 1.6 : 0.5);              // lumpy cranium
    k += HD.scar ? -0.012 * Math.exp(-Math.pow((x - 0.25 * Math.sin(y * 3)) / 0.025, 2)) * sstep(y, 0.3, 0.5) : 0; // surgical scar
    return k;
  };
  {
    const g = new THREE.SphereGeometry(1, Math.round(52 * LOD_SEG), Math.round(40 * LOD_SEG));
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (z < 0) z *= 1.16 * HD.back - 0.1 * Math.max(0, -y);                 // occiput
      if (y > 0.55) y = 0.55 + (y - 0.55) * HD.crown;                         // crown (flat under a cap, domed when bald)
      { const t = sstep(-y, 0.05, 0.85); x *= 1 - (0.34 - 0.12 * (HD.jaw - 1)) * t; if (z > 0) z *= 1 - 0.1 * t; } // lower face narrows (smooth: no crease)
      if (y < -0.66) y = -0.66 - (y + 0.66) * 0.18;                            // flat underside: the mandible sits below
      const k = sculpt(x, y, z);
      P.setXYZ(i, hc[0] + x * (1 + k) * HR[0], hc[1] + y * (1 + k) * HR[1], hc[2] + z * (1 + k) * HR[2]);
    }
    skin.add(g, { weights: W(['head', 1]), aspect: 2, density: 3.6, name: 'head', fns: { color: faceColor, height: faceHeight, rough: faceRough } });
    // mandible: jaw with chin and angle (width per variant), lower lip line; hangs open (animated by the jaw bone)
    const jw = new THREE.SphereGeometry(1, Math.round(26 * LOD_SEG), Math.round(16 * LOD_SEG)), J = jw.getAttribute('position'), jc = [hc[0], hc[1] - 0.086, hc[2] + 0.026];
    for (let i = 0; i < J.count; i++) {
      let x = J.getX(i), y = J.getY(i), z = J.getZ(i);
      if (y > 0.1) y = 0.1 + (y - 0.1) * 0.25;                       // flat top (tooth line)
      if (z > 0) x *= 1 - (0.42 - 0.15 * (HD.jaw - 1)) * z;            // tapers to the chin
      if (z > 0.5 && y < 0) y *= 1.25 + 0.2 * (HD.jaw - 1);            // chin drops
      x *= 1 + 0.1 * (HD.jaw - 1) * (1 - Math.abs(z));                 // angle of the jaw
      J.setXYZ(i, jc[0] + x * 0.056 * HD.w, jc[1] + y * 0.03, jc[2] + z * 0.07);
    }
    skin.add(jw, { weights: W(['jaw', 1]), displace: organic(0.003, 22), aspect: 2, density: 3.0, name: 'jaw', fns: { color: faceColor, height: faceHeight, rough: faceRough } });
    // dark mouth cavity so the open mouth never shows through
    const cav = new THREE.SphereGeometry(1, 10, 8); cav.scale(0.043 * HD.w, 0.026, 0.05); cav.translate(hc[0], hc[1] - 0.074, hc[2] + 0.03);
    skin.add(cav, { weights: W(['head', 0.5], ['jaw', 0.5]), color: () => [0.09, 0.025, 0.03], fns: { height: () => 0, rough: () => 0.3 }, name: 'mouth' });
    // gums + teeth: irregular, stained, some missing (one chart each, dense enough to survive mip-mapping)
    const toothC = (p) => { const n = fbm(p.x * 300, p.y * 300, p.z * 300), root = sstep(Math.abs(p.y - (hc[1] - 0.077)), 0.004, 0.0); return [0.62 + 0.2 * n - 0.3 * root, 0.56 + 0.18 * n - 0.32 * root, 0.4 + 0.12 * n - 0.25 * root]; };
    for (const [yy, bone, zoff] of [[-0.066, 'head', 0], [-0.084, 'jaw', -0.004]]) { // gum ridges
      const gum = new THREE.TorusGeometry(0.042 * HD.w, 0.003, 6, Math.round(14 * LOD_SEG), Math.PI * 1.1); gum.rotateX(Math.PI / 2); gum.rotateY(-Math.PI * 0.05); gum.scale(1, 1, 1.05); gum.translate(hc[0], hc[1] + yy, hc[2] + 0.012 + zoff);
      eyes.add(gum, { weights: W([bone, 1]), color: () => [0.2, 0.05, 0.05], name: 'gum' });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) / 4 * 1.05, tx = Math.sin(a) * 0.036 * HD.w, tz = hc[2] + 0.052 + Math.cos(a) * 0.046, h = 0.006 + hash(i, 3, HD.seed) * 0.006;
      if (hash(i, 7, HD.seed) > 0.22) { const t = new THREE.BoxGeometry(0.0055, h, 0.005, 1, 2, 1); t.rotateZ((hash(i, 2, 2) - 0.5) * 0.3); t.rotateY(a); t.translate(hc[0] + tx, hc[1] - 0.07 - h / 2, tz); eyes.add(t, { weights: W(['head', 1]), color: toothC, name: 'tooth' }); }
      if (hash(i, 5, HD.seed + 3) > 0.27) { const h2 = 0.007 + hash(i, 1, 4) * 0.006, t = new THREE.BoxGeometry(0.005, h2, 0.005, 1, 2, 1); t.rotateZ((hash(i, 4, 6) - 0.5) * 0.3); t.rotateY(a); t.translate(hc[0] + tx * 0.92, hc[1] - 0.083 + h2 / 2, tz - 0.004); eyes.add(t, { weights: W(['jaw', 1]), color: toothC, name: 'tooth' }); }
    }
    // ears: shell with a rolled rim (helix) and a lobe; the left one torn on the GUARD
    for (const sx of [1, -1]) {
      const e = new THREE.SphereGeometry(1, Math.round(12 * LOD_SEG), Math.round(10 * LOD_SEG)), E = e.getAttribute('position'), size = HD.ear * (sx < 0 && HD.tornEar ? 0.7 : 1);
      for (let i = 0; i < E.count; i++) { let x = E.getX(i), y = E.getY(i), z = E.getZ(i); const rim = 1 + 0.25 * sstep(Math.hypot(y, z), 0.7, 0.95); x *= 0.35 * (1 - 0.5 * sstep(-x * sx, 0, 0.8)) * rim; E.setXYZ(i, x, y, z); }
      e.scale(0.018, 0.026 * size, 0.015 * size); e.rotateY(sx * 0.2); e.translate(hc[0] + sx * HR[0] * 0.93, hc[1] - 0.008, hc[2] - 0.012);
      skin.add(e, { weights: W(['head', 1]), fns: { color: faceColor, height: faceHeight, rough: faceRough }, density: 3, name: 'ear' });
    }
    // eyeballs: sclera (yellowed, bloodshot) + clouded iris with a dark ring; faint red emission from the material
    for (const sx of [-1, 1]) {
      const r = 0.0125 * LK.eyeScale, e = new THREE.SphereGeometry(1, 16, 12);
      e.scale(r, r * 0.92, r); e.translate(hc[0] + sx * 0.034 * HD.w, hc[1] + 0.006, hc[2] + 0.077 + LK.eyeZ * 0.5 - HD.socket * 0.02);
      eyes.add(e, { weights: W(['head', 1]), color: (p, n) => { const f = n.z; return f > 0.93 ? [0.08, 0.03, 0.03] : f > 0.8 ? [0.5, 0.55, 0.56] : f > 0.72 ? [0.3, 0.07, 0.06] : [0.6, 0.57, 0.5]; } });
    }
  }
  /** Face colour: pallor with cold patches, bruised sockets, raw lips / gum line, dried blood streaks, veins, stubble. */
  function faceColor(p) {
    const [x, y, z] = local(p), ax = Math.abs(x), front = sstep(z, 0.0, 0.35);
    let c = skinColor(p);
    const sock = fx(ax, y, 0.37, 0.05, 0.2, 0.17) * front;                        // dark bruised orbits
    c = c.map((v, i) => v * (1 - 0.72 * sock) + [0.12, 0.05, 0.08][i] * 0.72 * sock);
    const lips = fx(x, y, 0, -0.49, 0.26, 0.04) * front;                           // cracked raw lips
    c = c.map((v, i) => v * (1 - 0.6 * lips) + [0.3, 0.1, 0.1][i] * 0.6 * lips);
    // dried blood running down from the eyes, nose and mouth (gravity streaks)
    const stx = Math.sin(x * 40 + HD.seed) * 0.5 + 0.5, streak = sstep(stx, 0.8, 0.95) * (fx(ax, y, 0.37, -0.25, 0.1, 0.35) + fx(x, y, 0.02, -0.55, 0.12, 0.4)) * front * sstep(fbm(p.x * 30, p.y * 8, p.z * 30), 0.45, 0.6);
    c = c.map((v, i) => v * (1 - 0.55 * streak) + [0.2, 0.04, 0.04][i] * 0.55 * streak);
    // stubble / hair on the scalp and jaw (by variant)
    const hairZone = HD.hair * sstep(y, 0.35, 0.55) + HD.stubble * sstep(-y, 0.35, 0.55) * sstep(ax, 0.2, 0.5);
    const dots = sstep(vnoise(p.x * 900, p.y * 900, p.z * 900), 0.55, 0.7) * Math.min(1, hairZone);
    c = c.map((v, i) => v * (1 - 0.65 * dots) + [0.06, 0.05, 0.045][i] * 0.65 * dots);
    return c;
  }
  function faceHeight(p) {
    const [x, y, z] = local(p), ax = Math.abs(x), front = sstep(z, 0.0, 0.35);
    let h = skinHeight(p) * 0.8;
    h += Math.sin(y * 420 + fbm(p.x * 40, p.y * 10, p.z * 40) * 5) * 0.00022 * fx(x, y, 0, 0.45, 0.6, 0.15) * front;                // forehead furrows
    h += Math.sin(Math.atan2(y - 0.05, ax - 0.37) * 9) * 0.00025 * sstep(0.32, 0.22, Math.hypot(ax - 0.37, y - 0.05)) * front;    // crow's feet
    h += Math.sin(x * 260) * 0.00025 * fx(x, y, 0, -0.5, 0.32, 0.08) * front;                                                      // vertical lip cracks
    h += (vnoise(p.x * 1500, p.y * 1500, p.z * 1500) - 0.5) * 0.00012 * Math.min(1, HD.hair * sstep(y, 0.35, 0.55) + HD.stubble * sstep(-y, 0.35, 0.55)); // stubble
    return h;
  }
  function faceRough(p) { const [x, y, z] = local(p); return Math.max(0.3, skinRough(p) - 0.25 * fx(x, y, 0, -0.5, 0.3, 0.07) - 0.2 * fx(Math.abs(x), y, 0.37, 0.05, 0.12, 0.1)); }

  // ============ RAGS: shells lofted over the body rings with torn hems and holes (double-sided)
  const hole = (r, s, salt, th) => (hash(r * 1.7 + salt, s * 2.3, salt) > th ? 2 + (hash(s, r, salt) > 0.5 ? 1 : 0) : 0); // small triangular rips
  if (LK.id !== 'hollow') buildOutfit(LK.id, rags, { torsoRings, armRings, legRings, hole, W, hc, HR });
  else { // shirt: ripped open over the left ribs, shredded hem, wide torn collar
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
  if (LK.id === 'hollow') { // trousers: waist + both legs; left leg torn at the knee and ends mid-shin, right leg ripped off above the knee
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
  if (LK.id === 'hollow') { // torn sleeve remnant on the right arm only (asymmetric silhouette)
    const R = armRings(-1).slice(1, 6).reverse().map(r => ({ c: [...r.c], ru: r.ru * 1.12 + 0.005, rv: r.rv * 1.12 + 0.005, w: r.w }));
    rags.loft(R, { seg: 10, hint: [0, 0, 1], color: clothColor, uvRep: [4, 12], capStart: false, capEnd: false, jag: (s) => 0.06 * hash(s, 1, 1), displace: (p) => (fbm(p.x * 12, p.y * 12, p.z * 12) - 0.5) * 0.016, skip: (r, s) => (r === 0 && hash(s, 2, 2) > 0.5 ? 2 : 0) || hole(r, s, 2, 0.93) });
  }

  const geo = { skin: skin.build(ATLAS.skin), rags: rags.build(ATLAS.rags), eyes: eyes.build(ATLAS.eyes) };
  return { geo, hc, charts: { skin: skin.charts.map(c => [c.w, c.h]), rags: rags.charts.map(c => [c.w, c.h]) } };
}

/** One infected: its own bones bound to the shared geometry of its variant. */
export function createHollowInstance(variant = 'hollow') {
  const A = getHollowAssets(variant);
  const group = new THREE.Group(); group.name = 'hollow'; group.userData.variant = variant;
  const bones = BONES.map(([n, , o]) => { const b = new THREE.Bone(); b.name = n; b.position.set(...o); return b; });
  BONES.forEach(([, p], i) => { if (p) bones[BONE_INDEX[p]].add(bones[i]); });
  group.add(bones[0]);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lodMeshes = A.lods.map((geo, li) => {
    const out = {};
    for (const k of ['skin', 'rags', 'eyes']) {
      const m = new THREE.SkinnedMesh(geo[k], A.mats[k]);
      m.bind(skeleton);
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.3); // generous: covers attacks and the fall
      m.frustumCulled = true; m.visible = li === 0; m.userData.lod = li;
      group.add(m); out[k] = m;
    }
    return out;
  });
  const B = Object.fromEntries(BONES.map(([n], i) => [n, bones[i]]));
  let lod = 0;
  return {
    group, bones: B, skeleton, meshes: lodMeshes[0], lodMeshes, variant,
    get lod() { return lod; },
    /** Show one LOD (0 = full). All levels share the skeleton, so the pose is identical. */
    setLod(l) { l = Math.max(0, Math.min(lodMeshes.length - 1, l)); if (l === lod) return; for (const k in lodMeshes[lod]) lodMeshes[lod][k].visible = false; for (const k in lodMeshes[l]) lodMeshes[l][k].visible = true; lod = l; },
    dispose() { skeleton.dispose(); },
  };
}

export function disposeHollowAssets() {
  for (const k of Object.keys(sets)) {
    for (const L of sets[k].lods) for (const g of Object.values(L)) g.dispose();
    for (const part of ['skin', 'rags']) { const m = sets[k].mats[part]; if (common && m === common.mats[part]) continue; if (m.map) m.map.dispose(); if (m.normalMap && m.userData.baked) m.normalMap.dispose(); m.dispose(); }
    delete sets[k];
  }
  if (!common) return;
  for (const m of Object.values(common.mats)) m.dispose();
  for (const t of Object.values(common.maps)) t.dispose();
  common = null;
}
