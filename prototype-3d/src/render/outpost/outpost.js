// OUTPOST ZERO dressing (M1.7): props on the interior solid cells, wall decor, windows onto the steppe, CCTV monitors,
// signs, floor hatches, light pools under the windows and red alarm beacons. Read-only w.r.t. the simulation.
// Everything is merged per material at load (≈ 8 draw calls for the whole interior), nothing is created per frame.
import * as THREE from 'three';
import { CELL_SIZE as S, WALL_HEIGHT as WH } from '../../config.js';
import { getOutpostTextures, regionUV, R, signUV, PANO, FEEDS } from './outpost-textures.js';

const lin = c => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; }; // THREE.Color parses sRGB hex → linear
const WHITE = [1, 1, 1];

// ---------------------------------------------------------------- geometry builder (merged, per material)
class GB {
  constructor({ color = true, uv = true } = {}) { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.hasC = color; this.hasUV = uv; this.extra = null; }
  get count() { return this.p.length / 3; }
  /** Quad from origin o along edges u, v (3-vectors in metres), uv rect [u0,v0,u1,v1], normal = u × v. */
  quad(o, u, v, rect = [0, 0, 1, 1], col = WHITE, extra = null) {
    const b = this.count, n = new THREE.Vector3(...u).cross(new THREE.Vector3(...v)).normalize();
    const pts = [o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]], [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]]];
    const uvs = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
    for (let k = 0; k < 4; k++) {
      this.p.push(...pts[k]); this.n.push(n.x, n.y, n.z);
      if (this.hasUV) this.uv.push(...uvs[k]);
      if (this.hasC) this.c.push(...col);
      if (extra) { (this.extra ||= []).push(...extra); }
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** Same quad split into tiles of `tile` metres, each showing the whole atlas region (no stretching on long faces). */
  tiled(o, u, v, region, col, tile = 1.0, tileV = null) {
    const lu = Math.hypot(...u), lv = Math.hypot(...v), nu = Math.max(1, Math.round(lu / tile)), nv = Math.max(1, Math.round(lv / (tileV || tile)));
    const rect = regionUV(region);
    for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
      const oo = [o[0] + u[0] * a / nu + v[0] * b / nv, o[1] + u[1] * a / nu + v[1] * b / nv, o[2] + u[2] * a / nu + v[2] * b / nv];
      this.quad(oo, u.map(x => x / nu), v.map(x => x / nv), rect, col);
    }
  }
  /** Axis-aligned box; side / top regions tiled. faces: skip bottom by default. */
  box(x0, y0, z0, x1, y1, z1, col, { side = R.steel, top = R.steel, tile = 1.0, tileV = null, bottom = false } = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    this.tiled([x1, y0, z1], [0, 0, -dz], [0, dy, 0], side, col, tile, tileV); // +x
    this.tiled([x0, y0, z0], [0, 0, dz], [0, dy, 0], side, col, tile, tileV);  // −x
    this.tiled([x0, y0, z1], [dx, 0, 0], [0, dy, 0], side, col, tile, tileV);  // +z
    this.tiled([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], side, col, tile, tileV); // −z
    this.tiled([x0, y1, z1], [dx, 0, 0], [0, 0, -dz], top, col, tile);          // top
    if (bottom) this.tiled([x0, y0, z0], [dx, 0, 0], [0, 0, dz], top, col, tile);
  }
  /** Cylinder between two points (open ends optional caps), radius r. */
  cyl(a, b, r, col, seg = 8, region = R.steel) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), ax = B.clone().sub(A), L = ax.length(); ax.normalize();
    const t = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ax, t).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
    const [u0, v0, u1, v1] = regionUV(region), base = this.count;
    for (let s = 0; s <= seg; s++) {
      const ang = s / seg * Math.PI * 2, d = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
      for (const [P, vv] of [[A, v0], [B, v1]]) {
        this.p.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r); this.n.push(d.x, d.y, d.z);
        if (this.hasUV) this.uv.push(u0 + (u1 - u0) * s / seg, vv); if (this.hasC) this.c.push(...col);
      }
    }
    for (let s = 0; s < seg; s++) { const k = base + s * 2; this.i.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    void L;
  }
  build(extraName = null, extraSize = 2) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.hasUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.hasC) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (extraName && this.extra) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, extraSize));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- face frames (wall named after the side it is on)
// W: face looks +x at x = at·S · E: looks −x · N: looks +z (sim +y) at z = at·S · S: looks −z.
const FACE = {
  W: { P: (at, a, h, d) => [at * S + d, h, a * S], n: [1, 0, 0], u: [0, 0, 1] },
  E: { P: (at, a, h, d) => [at * S - d, h, a * S], n: [-1, 0, 0], u: [0, 0, -1] },
  N: { P: (at, a, h, d) => [a * S, h, at * S + d], n: [0, 0, 1], u: [-1, 0, 0] },
  S: { P: (at, a, h, d) => [a * S, h, at * S - d], n: [0, 0, -1], u: [1, 0, 0] },
};
/** World AABB of a box given in face coordinates (a in cells, h and d in metres). */
function faceBox(face, at, a0, a1, h0, h1, d0, d1) {
  const F = FACE[face], A = F.P(at, a0, h0, d0), B = F.P(at, a1, h1, d1);
  return [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2]), Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])];
}
/** Quad lying on a face at depth d, from a0..a1 and h0..h1, facing into the room (readable left → right). */
function faceQuad(gb, face, at, a0, a1, h0, h1, d, rect, col = WHITE, extra = null) {
  const F = FACE[face];
  // choose the start so that the u edge runs left → right as seen from the room
  // (viewer looking at an N or E face reads along +a; at a W or S face along −a)
  const aStart = (face === 'E' || face === 'N') ? a0 : a1, aEnd = (face === 'E' || face === 'N') ? a1 : a0;
  const o = F.P(at, aStart, h0, d), e = F.P(at, aEnd, h0, d);
  gb.quad(o, [e[0] - o[0], e[1] - o[1], e[2] - o[2]], [0, h1 - h0, 0], rect, col, extra);
}
/** The 4 sides of a cell-footprint prop as faces looking outwards: [face, at, a0, a1]. */
function propSides(x0, z0, x1, z1) { return [['W', x1, z0, z1], ['E', x0, z0, z1], ['N', z1, x0, x1], ['S', z0, x0, x1]]; }

// ---------------------------------------------------------------- colours (sRGB authored)
const C = {
  steel: lin('#848b86'), steelDark: lin('#4d524f'), olive: lin('#6f7a66'), yellow: lin('#8f7c46'), green: lin('#6f877a'),
  grey: lin('#9ea2a0'), dark: lin('#2a2e30'), concrete: lin('#77766f'), pipeRed: lin('#8c3a2e'), pipeBlue: lin('#4f6f78'), pipeGrey: lin('#8d9190'),
  frame: lin('#4b5250'), rubber: lin('#1d2021'),
};

export function buildOutpost(group, world, map) {
  const T = getOutpostTextures();
  const surf = new GB(), glow = new GB({ uv: false }), signs = new GB({ color: false }), screens = new GB({ color: false }), win = new GB({ color: false }), pools = new GB({ color: false }), lens = new GB({ uv: false });
  const stats = { props: 0, decor: 0, windows: 0, monitors: 0, beacons: 0, signs: 0 };
  const led = (x, y, z, col, sz = 0.035, n = [0, 0, 1]) => { // tiny emissive square facing n
    const h = sz / 2;
    if (n[0]) glow.quad([x, y - h, z + h * n[0]], [0, 0, -sz * n[0]], [0, sz, 0], [0, 0, 1, 1], col);
    else glow.quad([x - h * n[2], y - h, z], [sz * n[2], 0, 0], [0, sz, 0], [0, 0, 1, 1], col);
  };
  const sign = (face, at, a0, a1, h0, h1, d, name) => { faceQuad(signs, face, at, a0, a1, h0, h1, d, signUV(name)); stats.signs++; };

  // ======================= 1. props (exact cell footprint, full height) =======================
  for (const pr of map.props || []) {
    const xs = pr.cells.map(c => c[0]), ys = pr.cells.map(c => c[1]);
    const cx0 = Math.min(...xs), cx1 = Math.max(...xs) + 1, cy0 = Math.min(...ys), cy1 = Math.max(...ys) + 1;
    const X0 = cx0 * S, X1 = cx1 * S, Z0 = cy0 * S, Z1 = cy1 * S, sides = propSides(cx0, cy0, cx1, cy1);
    const over = 0.006; // overlays sit just in front of the base box (no z-fighting, < 1 cm)
    stats.props++;
    switch (pr.type) {
      case 'guardPost':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.olive, { side: R.steel, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) {
          faceQuad(surf, f, at, a0 + 0.05, a1 - 0.05, 1.08, 2.12, over, regionUV(R.glass), WHITE);       // armoured glass band
          surf.box(...faceBox(f, at, a0, a1, 1.0, 1.08, 0, 0.03), C.dark);                               // counter ledge
          for (const k of [0.33, 0.66]) surf.box(...faceBox(f, at, a0 + (a1 - a0) * k - 0.02, a0 + (a1 - a0) * k + 0.02, 1.08, 2.12, 0, 0.02), C.frame); // mullions
          surf.box(...faceBox(f, at, a0, a1, 0, 0.12, 0, 0.02), C.dark);                                 // kick plate
        }
        sign('W', cx1, cy0 + 0.15, cy1 - 0.15, 2.3, 2.8, over * 2, 'post'); sign('N', cy1, cx0 + 0.15, cx1 - 0.15, 2.3, 2.8, over * 2, 'post');
        led(X1 + 0.012, 2.2, Z0 + 1.5, lin('#ffb24a'), 0.06, [1, 0, 0]);
        break;
      case 'lockers':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.concrete, { side: R.concrete, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) { const n = 2; for (let k = 0; k < n; k++) faceQuad(surf, f, at, a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n, 0.08, 2.05, over, regionUV(R.locker), C.green); surf.box(...faceBox(f, at, a0, a1, 2.05, 2.1, 0, 0.025), C.dark); }
        sign('N', cy1, cx0 + 0.2, cx1 - 0.2, 2.25, 2.75, over * 2, 'noEntry');
        break;
      case 'barrier':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.concrete, { side: R.concrete, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) faceQuad(surf, f, at, a0, a1, 0, 0.55, over, regionUV(R.hazard), WHITE);
        sign('S', cy0, cx0 + 0.2, cx1 - 0.2, 1.4, 2.0, over * 2, 'danger'); sign('W', cx1, cy0 + 0.2, cy1 - 0.2, 1.4, 2.0, over * 2, 'danger');
        break;
      case 'commColumn':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.concrete, { side: R.concrete, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) {
          const mid = (a0 + a1) / 2;
          surf.box(...faceBox(f, at, mid - 0.05, mid + 0.05, 0, WH, 0, 0.05), C.dark, { side: R.rack });          // vertical cable trunk
          faceQuad(surf, f, at, a0 + 0.08, mid - 0.12, 1.1, 1.75, over, regionUV(R.junction), WHITE);           // junction boxes
          faceQuad(surf, f, at, mid + 0.12, a1 - 0.08, 0.9, 1.5, over, regionUV(R.radio), WHITE);
          const p = FACE[f].P(at, mid + 0.4, 1.55, 0.014); led(p[0], p[1], p[2], lin('#5dff8a'), 0.03, FACE[f].n);
        }
        sign('E', cx0, cy0 + 0.25, cy0 + 0.85, 2.15, 2.6, over * 2, 'comms');
        break;
      case 'serverRack':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.dark, { side: R.steel, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) {
          for (let k = 0; k < 2; k++) faceQuad(surf, f, at, a0 + (a1 - a0) * k / 2 + 0.04, a0 + (a1 - a0) * (k + 1) / 2 - 0.04, 0.05, 2.15, over, regionUV(R.rack), WHITE);
          for (let i = 0; i < 10; i++) { const p = FACE[f].P(at, a0 + 0.14 + (i % 5) * 0.15, 0.5 + Math.floor(i / 5) * 0.9 + (i % 3) * 0.17, 0.012); led(p[0], p[1], p[2], i % 4 === 0 ? lin('#ffbf4a') : lin('#4dff7a'), 0.022, FACE[f].n); }
        }
        break;
      case 'elecCabinets':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.grey, { side: R.steel, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) {
          const n = Math.max(1, Math.round((a1 - a0) * S / 0.9));
          for (let k = 0; k < n; k++) faceQuad(surf, f, at, a0 + (a1 - a0) * k / n + 0.02, a0 + (a1 - a0) * (k + 1) / n - 0.02, 0.1, 2.1, over, regionUV(R.cabinet), C.grey);
          surf.box(...faceBox(f, at, a0, a1, 2.1, 2.16, 0, 0.03), C.dark);
          const p = FACE[f].P(at, a0 + 0.2, 2.35, 0.012); led(p[0], p[1], p[2], lin('#4dff7a'), 0.05, FACE[f].n);
        }
        sign('W', cx1, cy0 + 0.6, cy0 + 1.4, 2.25, 2.7, over * 2, 'highVoltage'); sign('E', cx0, cy0 + 0.6, cy0 + 1.4, 2.25, 2.7, over * 2, 'highVoltage');
        break;
      case 'shelving':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.steel, { side: R.steel, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) { const n = Math.max(1, Math.round((a1 - a0) * S / 1.0)); for (let k = 0; k < n; k++) faceQuad(surf, f, at, a0 + (a1 - a0) * k / n + 0.01, a0 + (a1 - a0) * (k + 1) / n - 0.01, 0.05, 2.35, over, regionUV(R.shelves), WHITE); }
        break;
      case 'generator':
        surf.box(X0, 0, Z0, X1, 2.25, Z1, C.yellow, { side: R.steel, tile: 1.0 });
        surf.box(X0, 2.25, Z0, X1, WH, Z1, C.steelDark, { side: R.louver, top: R.steel, tile: 1.0, tileV: 0.75 }); // ducting up to the ceiling
        for (const [f, at, a0, a1] of sides) {
          faceQuad(surf, f, at, a0, a1, 0, 0.28, over, regionUV(R.hazard), WHITE);
          const n = Math.round((a1 - a0) * S / 1.0); for (let k = 0; k < n; k++) if (k % 3 !== 1) faceQuad(surf, f, at, a0 + (a1 - a0) * k / n + 0.03, a0 + (a1 - a0) * (k + 1) / n - 0.03, 0.45, 1.95, over, regionUV(R.louver), C.yellow);
          for (const hh of [2.35, 2.62, 2.85]) { const A = FACE[f].P(at, a0 + 0.02, hh, 0.0), B = FACE[f].P(at, a1 - 0.02, hh, 0.0); surf.cyl(A, B, 0.035, C.pipeGrey, 6); }
        }
        { const f = 'S', at = cy0; faceQuad(surf, f, at, cx0 + 0.65, cx0 + 1.25, 0.95, 1.55, over * 2, regionUV(R.gauges), WHITE); sign(f, at, cx0 + 0.35, cx0 + 0.6 + 0.7, 1.75, 2.15, over * 3, 'generator');
          for (let i = 0; i < 4; i++) { const p = FACE[f].P(at, cx0 + 1.45 + i * 0.08, 1.35, 0.014); led(p[0], p[1], p[2], i === 3 ? lin('#ff4a3a') : lin('#4dff7a'), 0.03, FACE[f].n); } }
        sign('N', cy1, cx0 + 0.6, cx1 - 0.6, 1.75, 2.15, over * 3, 'danger');
        break;
      case 'pipeColumn': {
        surf.box(X0, 0, Z0, X1, WH, Z1, C.concrete, { side: R.concrete, tile: 1.0 });
        const cols = [C.pipeRed, C.pipeBlue, C.pipeGrey];
        for (const [f, at, a0, a1] of sides) for (let k = 0; k < 3; k++) {
          const a = a0 + (a1 - a0) * (0.22 + k * 0.28), A = FACE[f].P(at, a, 0, -0.05), B = FACE[f].P(at, a, WH, -0.05);
          surf.cyl(A, B, 0.08, cols[k], 8);
          const V = FACE[f].P(at, a, 1.25 + k * 0.22, 0.03), n = FACE[f].n; surf.cyl(V, [V[0] + n[0] * 0.05, V[1], V[2] + n[2] * 0.05], 0.09, C.pipeRed, 10);
        }
        break;
      }
      case 'transformer':
        surf.box(X0, 0, Z0, X1, WH, Z1, C.green, { side: R.steel, tile: 1.0 });
        for (const [f, at, a0, a1] of sides) { faceQuad(surf, f, at, a0 + 0.08, a1 - 0.08, 0.2, 1.9, over, regionUV(R.louver), C.green); }
        sign('E', cx0, cy0 + 0.25, cy1 - 0.25, 2.0, 2.45, over * 2, 'highVoltage'); sign('W', cx1, cy0 + 0.25, cy1 - 0.25, 2.0, 2.45, over * 2, 'highVoltage');
        break;
      default: surf.box(X0, 0, Z0, X1, WH, Z1, C.concrete, { side: R.concrete });
    }
  }

  // ======================= 2. wall decor (≤ DECOR_MAX_DEPTH) =======================
  const monitors = [];
  for (const d of map.decor || []) {
    const { face: f, at, a0, a1, h0, h1, depth } = d, F = FACE[f];
    stats.decor++;
    switch (d.type) {
      case 'door':
        surf.box(...faceBox(f, at, a0 - 0.06, a1 + 0.06, h0, h1 + 0.12, 0, depth), C.frame);         // frame
        faceQuad(surf, f, at, a0, a1, h0, h1, depth + 0.004, regionUV(R.door), C.steel);
        surf.box(...faceBox(f, at, (a0 + a1) / 2 - 0.01, (a0 + a1) / 2 + 0.01, h0, h1, depth, depth + 0.02), C.dark);
        { const p = F.P(at, a1 + 0.12, 1.25, 0.03); led(p[0], p[1], p[2], lin('#ff3a2a'), 0.05, F.n); }
        break;
      case 'sign': faceQuad(signs, f, at, a0, a1, h0, h1, depth, signUV(d.sign)); stats.signs++; break;
      case 'armorPanels': { const n = Math.max(1, Math.round((a1 - a0) * S / 1.1)); for (let k = 0; k < n; k++) { const b0 = a0 + (a1 - a0) * k / n + 0.01, b1 = a0 + (a1 - a0) * (k + 1) / n - 0.01; surf.box(...faceBox(f, at, b0, b1, h0, h1, 0, depth), C.olive, { side: k % 3 === 1 ? R.damaged : R.steel, tile: 1.2 }); } break; }
      case 'monitorBank': {
        surf.box(...faceBox(f, at, a0, a1, h0, h0 + 0.06, 0, depth), C.dark);                            // console shelf
        for (const a of [a0 + 0.15, a1 - 0.15]) surf.box(...faceBox(f, at, a - 0.03, a + 0.03, 0, h0, 0.02, 0.08), C.frame); // legs
        surf.box(...faceBox(f, at, a0 + 0.2, a0 + 0.42, h0 + 0.06, h0 + 0.24, 0.02, depth - 0.02), C.dark, { side: R.radio }); // radio set
        surf.box(...faceBox(f, at, a0 + 0.62, a0 + 0.98, h0 + 0.06, h0 + 0.085, 0.06, depth - 0.03), C.rubber);   // keyboard
        const W2 = (a1 - a0), rows = [[3, h0 + 0.36, h0 + 0.74], [2, h0 + 0.82, h0 + 1.18]];
        let mi = 0;
        for (const [n, y0, y1] of rows) for (let k = 0; k < n; k++) {
          const span = W2 / n, b0 = a0 + span * k + span * 0.08, b1 = a0 + span * (k + 1) - span * 0.08;
          surf.box(...faceBox(f, at, b0, b1, y0, y1, 0.0, 0.07), C.rubber, { side: R.steel });            // casing (7 cm deep)
          const feed = [0, 1, 2, 3, 4][mi % 5];
          faceQuad(screens, f, at, b0 + 0.02, b1 - 0.02, y0 + 0.03, y1 - 0.03, 0.074, [0, 0, 1, 1], WHITE, [feed % 4, Math.floor(feed / 4)]);
          monitors.push({ feed, base: feed, vtx: screens.count - 4 });
          const p = F.P(at, b1 - 0.02, y0 + 0.012, 0.074); led(p[0], p[1], p[2], lin('#4dff7a'), 0.012, F.n);
          mi++;
        }
        surf.box(...faceBox(f, at, a0 + 0.05, a1 - 0.05, h1 - 0.05, h1, 0, 0.12), C.frame);              // cable duct above
        break;
      }
      case 'commPanel': surf.box(...faceBox(f, at, a0, a1, h0, h1, 0, depth), C.dark, { side: R.radio, tile: 0.6 }); { const p = F.P(at, a1 - 0.08, h1 - 0.1, depth + 0.004); led(p[0], p[1], p[2], lin('#ffbf4a'), 0.03, F.n); } break;
      case 'cabinetWall': { const n = Math.max(1, Math.round((a1 - a0) * S / 0.85)); for (let k = 0; k < n; k++) surf.box(...faceBox(f, at, a0 + (a1 - a0) * k / n + 0.01, a0 + (a1 - a0) * (k + 1) / n - 0.01, h0, h1, 0, depth), C.grey, { side: R.cabinet, top: R.steel, tile: 2.2 }); break; }
      case 'vent': surf.box(...faceBox(f, at, a0, a1, h0, h1, 0, depth), C.grey, { side: R.vent, tile: 2 }); break;
      case 'cableTray': {
        surf.box(...faceBox(f, at, a0, a1, h0, h0 + 0.02, 0, depth), C.frame);
        for (let k = 0; k < 3; k++) { const A = F.P(at, a0, h0 + 0.05, 0.04 + k * 0.045), B = F.P(at, a1, h0 + 0.05, 0.04 + k * 0.045); surf.cyl(A, B, 0.018, k === 1 ? lin('#3a3f22') : C.rubber, 5); }
        break;
      }
      case 'pipes': {
        const specs = [[h0 + 0.06, 0.06, C.pipeRed], [(h0 + h1) / 2 + 0.02, 0.05, C.pipeBlue], [h1 - 0.05, 0.045, C.pipeGrey]];
        for (const [y, r, col] of specs) { const A = F.P(at, a0, y, depth - r), B = F.P(at, a1, y, depth - r); surf.cyl(A, B, r, col, 8); }
        for (let a = a0 + 0.5; a < a1; a += 1.2) surf.box(...faceBox(f, at, a - 0.03, a + 0.03, h0 - 0.02, h1, 0, depth), C.frame);
        break;
      }
      case 'damagedPanel': surf.box(...faceBox(f, at, a0, a1, h0, h1, 0, depth), C.steel, { side: R.damaged, tile: 3 }); break;
      case 'hatchWall': surf.box(...faceBox(f, at, a0, a1, h0, h1, 0, depth), C.steel, { side: R.hatch, tile: 3 }); break;
    }
  }

  // ======================= 3. windows (distant steppe panorama behind deep frames) =======================
  const lightPools = [];
  for (const w of map.windows || []) {
    const { face: f, at, a0, a1, h0, h1 } = w, F = FACE[f], D = 0.2;
    stats.windows++;
    surf.box(...faceBox(f, at, a0 - 0.08, a1 + 0.08, h0 - 0.1, h0, 0, D), C.concrete, { side: R.concrete, top: R.concrete, tile: 2 }); // sill
    surf.box(...faceBox(f, at, a0 - 0.08, a1 + 0.08, h1, h1 + 0.1, 0, D), C.concrete, { side: R.concrete, tile: 2 });                  // lintel
    surf.box(...faceBox(f, at, a0 - 0.08, a0, h0, h1, 0, D), C.concrete, { side: R.concrete, tile: 2 });
    surf.box(...faceBox(f, at, a1, a1 + 0.08, h0, h1, 0, D), C.concrete, { side: R.concrete, tile: 2 });
    for (let k = 1; k < 4; k++) { const a = a0 + (a1 - a0) * k / 4; const A = F.P(at, a, h0, D * 0.55), B = F.P(at, a, h1, D * 0.55); surf.cyl(A, B, 0.012, C.dark, 5); } // bars
    surf.box(...faceBox(f, at, a0, a1, (h0 + h1) / 2 - 0.02, (h0 + h1) / 2 + 0.02, 0.0, 0.03), C.frame);                             // transom
    faceQuad(win, f, at, a0, a1, h0, h1, 0.002, [0, 0, 1, 1]);
    // floor light pool: from the wall into the room
    const L = 3.2, spread = 0.18, p0 = F.P(at, a0 - spread, 0.012, 0.15), p1 = F.P(at, a1 + spread, 0.012, 0.15), n = F.n;
    const dir = [p1[0] - p0[0], 0, p1[2] - p0[2]], into = [n[0] * L, 0, n[2] * L];
    // order so the quad faces up: (u × v).y > 0
    const cy = dir[2] * into[0] - dir[0] * into[2];
    if (cy > 0) pools.quad(p0, dir, into, [0, 1, 1, 0]); else pools.quad(p1, [-dir[0], 0, -dir[2]], into, [1, 1, 0, 0]);
    lightPools.push(f);
  }
  // floor hatches (flush, walkable)
  for (const [hx, hy] of map.hatches || []) { const x = hx * S, z = hy * S, s = 1.1; surf.quad([x - s / 2, 0.006, z + s / 2], [s, 0, 0], [0, 0, -s], regionUV(R.hatch), C.steel); }
  // ceiling: fluorescent tubes next to every lamp fixture (emissive)
  for (const l of map.lamps || []) { const x = l.x * S, z = l.y * S, k = lin(l.color).map(v => Math.min(1, v * 1.15)); for (const dz of [-0.55, 0.55]) glow.quad([x - 0.7, WH - 0.012, z + dz - 0.05], [1.4, 0, 0], [0, 0, 0.1], [0, 0, 1, 1], k); }

  // ======================= 4. alarm beacons =======================
  for (const b of map.beacons || []) {
    const F = FACE[b.face]; stats.beacons++;
    surf.box(...faceBox(b.face, b.at, b.a - 0.07, b.a + 0.07, b.h - 0.12, b.h + 0.06, 0, 0.08), C.dark);
    const [x0, y0, z0, x1, y1, z1] = faceBox(b.face, b.at, b.a - 0.055, b.a + 0.055, b.h - 0.08, b.h + 0.04, 0.08, 0.15);
    // lens: a small box (5 faces) in the beacon material
    const lb = new GB({ uv: false }); lb.box(x0, y0, z0, x1, y1, z1, WHITE);
    lens.p.push(...lb.p); lens.n.push(...lb.n); lens.c.push(...lb.c); const base = lens.count - lb.count; lens.i.push(...lb.i.map(i => i + base));
    void F;
  }

  // ======================= materials & meshes =======================
  const mats = {
    surf: new THREE.MeshLambertMaterial({ map: T.atlas, vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    signs: new THREE.MeshLambertMaterial({ map: T.signs, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.22 }),
    screens: new THREE.ShaderMaterial({
      uniforms: { map: { value: T.monitors }, time: { value: 0 } },
      vertexShader: `attribute vec2 cell; varying vec2 vUv; varying vec2 vCell;
        void main(){ vUv = uv; vCell = cell; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float time; varying vec2 vUv; varying vec2 vCell;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vec2((vCell.x + vUv.x) * 0.25, 1.0 - (vCell.y + 1.0 - vUv.y) * 0.5);
          vec3 c = texture2D(map, uv).rgb;
          float n = h(floor(vUv * vec2(150.0, 110.0)) + floor(time * 18.0));
          float scan = 0.9 + 0.1 * sin(vUv.y * 260.0);
          float band = 0.88 + 0.12 * smoothstep(0.0, 0.1, abs(fract(vUv.y - time * 0.06) - 0.5));
          c = c * scan * band * 1.25 + (n - 0.5) * 0.09;
          c *= 0.7 + 0.3 * smoothstep(0.78, 0.3, length(vUv - 0.5));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
    window: new THREE.ShaderMaterial({
      uniforms: { map: { value: T.steppe }, horizon: { value: 1 - PANO.horizon }, span: { value: PANO.vSpan * Math.PI / 180 }, dim: { value: 1.0 } },
      vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform float horizon; uniform float span; uniform float dim; varying vec3 vW; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vW - cameraPosition);                // view ray: the steppe is infinitely far → no parallax
          float u = atan(d.x, -d.z) / 6.28318530718 + 0.5;
          float v = clamp(horizon + asin(clamp(d.y, -1.0, 1.0)) / span, 0.004, 0.996);
          vec3 c = texture2D(map, vec2(u, v)).rgb * 1.08 * dim;
          float streak = h(vec2(floor(vUv.x * 60.0), floor(vUv.y * 7.0)));   // dirty glass
          c = mix(c, vec3(0.78, 0.74, 0.66), 0.10 + 0.06 * streak);
          c *= 0.82 + 0.18 * smoothstep(0.0, 0.18, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
    pools: new THREE.MeshBasicMaterial({ map: T.lightPool, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff1dc, side: THREE.DoubleSide }),
    beacon: new THREE.MeshBasicMaterial({ color: 0x3a0806 }),
  };
  const meshes = {};
  const add = (name, gb, mat, extra = null) => { if (!gb.count) return; const m = new THREE.Mesh(gb.build(extra), mat); m.name = 'outpost-' + name; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); meshes[name] = m; };
  add('surf', surf, mats.surf); add('glow', glow, mats.glow); add('signs', signs, mats.signs);
  add('screens', screens, mats.screens, 'cell'); add('windows', win, mats.window); add('pools', pools, mats.pools); add('beacons', lens, mats.beacon);
  if (meshes.pools) meshes.pools.renderOrder = 2;

  // ======================= runtime: monitor noise / rare feed switch, alarm beacons =======================
  let t = 0, switchT = 6.5, which = 0;
  const cellAttr = meshes.screens ? meshes.screens.geometry.getAttribute('cell') : null;
  const red = new THREE.Color(0xff2a14), off = new THREE.Color(0x3a0806);
  return {
    stats, meshes, mats, monitors,
    get drawCalls() { return Object.keys(meshes).length; },
    /** dt: render delta (0 while paused); alarm: 0..1 (already scaled by the alarm-effects setting). */
    update(dt, alarm = 0) {
      t += dt; mats.screens.uniforms.time.value = t;
      switchT -= dt;
      if (switchT <= 0 && cellAttr && monitors.length) { // every ~7 s one camera cycles to its alternate view
        switchT = 6 + (which % 3);
        const m = monitors[which % monitors.length]; which++;
        if (m.base !== 3) { m.feed = m.feed === m.base ? (m.base + 4) % 8 : m.base; for (let k = 0; k < 4; k++) cellAttr.setXY(m.vtx + k, m.feed % 4, Math.floor(m.feed / 4)); cellAttr.needsUpdate = true; }
      }
      // beacons: idle = dark red glass; alarm = slow pulse (0.8 Hz), never a hard flash
      const pulse = alarm > 0 ? alarm * (0.62 + 0.38 * Math.sin(t * Math.PI * 1.6)) : 0;
      mats.beacon.color.copy(off).lerp(red, pulse);
    },
    dispose() { for (const m of Object.values(meshes)) { m.geometry.dispose(); group.remove(m); } for (const m of Object.values(mats)) m.dispose(); },
  };
}

export { FEEDS };
