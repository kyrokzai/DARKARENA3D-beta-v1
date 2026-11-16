// M3.2 OUTPOST ZERO bio-lab for the top-down view (the FPS level builder render/level.js is not used or changed).
// Reads the same grid as the sim: every interior solid cell gets ONE prop with exactly that footprint (rule 12), the
// perimeter becomes 1.5 m modular walls (the top-down cut) with doors / glass alcoves / lamps on its faces (decor
// ≤ 0.22 m into the room). Floors / walls are clean modular geometry with baked tileable PBR maps (no deformed panels);
// capsule / console / door / arch / wall lamp are the owner's GLBs (assets/models/lab, M3.1). Light: hemisphere fill,
// one key light with shadows only in the profiles that afford it, a pool of 4 point lights (rule 12) that take the
// colour of the nearest lab sources, emissive maps everywhere else. Interface used by the top-down renderer:
// { group, update(focus, dt), setAlarm(k), isPropCell(x, y), sources, stats }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL_SIZE as S } from '../config.js';

export const WALL_H = 1.5;          // m: visible wall height (top-down cut)
export const DECOR_MAX = 0.22;      // m: decor never reaches further into the room (rule 12)
const POOL = 4;                     // real point lights (rule 12)

const key = (x, y) => x + ',' + y;

/** Lab plan derived from the grid: which prop stands on which interior solid cell, where the doors / alcoves go. */
export function planLab(grid) {
  const H = grid.length, W = grid[0].length, solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || grid[y][x] !== '0'; // same rule as World.isSolidCell
  const border = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
  // interior solid cells grouped into connected blocks
  const seen = new Set(), blocks = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!solid(x, y) || seen.has(key(x, y))) continue;
    const cells = [], st = [[x, y]]; seen.add(key(x, y));
    while (st.length) { const [cx, cy] = st.pop(); cells.push([cx, cy]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (!border(nx, ny) && solid(nx, ny) && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); st.push([nx, ny]); } } }
    blocks.push(cells);
  }
  // prop kind per block (deterministic by shape / position): the biggest block is the capsule bank, vertical pairs in
  // the middle column are consoles, pairs in the outer columns alternate capsules / server racks, singles are crates.
  const big = blocks.reduce((a, b) => (b.length > a.length ? b : a), blocks[0]);
  const props = [];
  for (const cells of blocks) {
    const xs = cells.map(c => c[0]), cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    let kind;
    if (cells === big) kind = 'capsule';
    else if (cells.length === 1) kind = 'crates';
    else if (Math.abs(cx - W / 2) < 2.5 || cx < 9) kind = 'console';
    else kind = cx > W * 0.8 ? 'capsule' : 'rack';
    for (const c of cells) props.push({ kind, x: c[0], y: c[1], block: cells });
  }
  // perimeter features on faces that look into the room (y = 0 north wall faces +y, etc.)
  const north = [], west = [], east = [];
  for (let x = 1; x < W - 1; x++) if (!solid(x, 1)) north.push(x);
  for (let y = 1; y < H - 1; y++) { if (!solid(1, y)) west.push(y); if (!solid(W - 2, y)) east.push(y); }
  const alcoves = north.filter(x => x % 5 === 3 && x > 1 && x < W - 2);            // glass alcoves with a capsule behind
  const lampsN = north.filter(x => x % 5 === 0);                                    // wall lamps between them
  const midY = Math.floor(H / 2) - 1;
  const doors = [{ side: 'W', at: midY }, { side: 'E', at: midY }];                 // sealed blast doors (W / E gates)
  const lampsS = [...west.filter(y => y % 4 === 2 && Math.abs(y - midY) > 1).map(y => ({ side: 'W', at: y })), ...east.filter(y => y % 4 === 2 && Math.abs(y - midY) > 1).map(y => ({ side: 'E', at: y }))];
  return { W, H, solid, border, blocks, props, alcoves, lampsN, lampsS, doors };
}

/** Small procedural reflection environment of the lab (core PMREMGenerator, no HDR files): dark room, a cold overhead
 *  strip, green capsule glow on one side, red emergency light on the other — gives the metal floor / walls / props
 *  believable reflections without extra lights. One PMREM per renderer. */
const labEnvs = new WeakMap();
export function labEnvironment(renderer) {
  if (labEnvs.has(renderer)) return labEnvs.get(renderer);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090c);
  const panel = (w, h, color, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); scene.add(m); };
  panel(8, 1, 0xdfe8ff, 1.6, [0, 5, 0]);         // cold overhead strip
  panel(4, 2.5, 0x3cff6a, 0.9, [-5, 1.2, 1]);     // capsule bank glow
  panel(4, 2, 0xff2a1a, 0.7, [5, 1.4, -1]);       // red emergency lamps
  panel(6, 2, 0x8fb4d8, 0.35, [0, 1.5, 6]);       // soft cold fill
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x0d1014 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5; scene.add(floor);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(scene, 0.04); pm.dispose();
  scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  labEnvs.set(renderer, rt.texture);
  return rt.texture;
}

function texSet(tex, name, repeat = 1) {
  const t = tex[name]; if (!t) return {};
  for (const k of ['albedo', 'normal', 'orm']) { const x = t[k]; if (!x) continue; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(repeat, repeat); x.anisotropy = 4; }
  t.albedo.colorSpace = THREE.SRGBColorSpace;
  return { map: t.albedo, normalMap: t.normal, roughnessMap: t.orm, metalnessMap: t.orm, aoMap: t.orm, roughness: 1, metalness: 1 };
}

/** Builds the lab into `scene`. models = { capsule, console, door, arch, lamp_wall } (gltf), textures = baked maps. */
export function createLab(scene, { world, models, textures, profile = {} }) {
  const plan = planLab(world.grid), { W, H } = plan;
  const group = new THREE.Group(); group.name = 'lab'; scene.add(group);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };
  const stats = { drawGroups: 0, props: plan.props.length };
  const propCells = new Set(plan.props.map(p => key(p.x, p.y)));
  const sources = []; // light sources for the pooled point lights: { x, z (m), color, power, kind }

  // ---------------- floor: cell tiles, one InstancedMesh, rotated per cell ----------------
  const floorMat = keep(new THREE.MeshStandardMaterial({ ...texSet(textures, 'floor_plate'), envMapIntensity: 0.6 }));
  const grateMat = keep(new THREE.MeshStandardMaterial({ ...texSet(textures, 'floor_grate') }));
  const tileGeo = keep(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2));
  const open = [], grates = [];
  const bankCells = new Set(plan.props.filter(p => p.kind === 'capsule' && p.block.length > 2).map(p => key(p.x, p.y)));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (plan.solid(x, y) && !propCells.has(key(x, y))) continue; // prop cells get floor too (no void around a prop)
    // drainage grates: a ring around the capsule bank + a channel along the north wall alcoves
    const nearBank = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => bankCells.has(key(x + dx, y + dy)));
    ((nearBank && (x + y) % 2 === 0) || (y === 1 && plan.alcoves.includes(x)) ? grates : open).push([x, y]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
  function tiles(list, mat, name) {
    const im = new THREE.InstancedMesh(tileGeo, mat, list.length); im.name = name; im.receiveShadow = true;
    list.forEach(([x, y], i) => { q.setFromAxisAngle(up, ((x * 7 + y * 13) % 4) * Math.PI / 2); im.setMatrixAt(i, m4.compose(p3.set((x + 0.5) * S, 0, (y + 0.5) * S), q, one)); });
    im.instanceMatrix.needsUpdate = true; group.add(im); stats.drawGroups++; return im;
  }
  tiles(open, floorMat, 'floor'); tiles(grates, grateMat, 'floor-grates');

  // hazard frames around every prop block (worn yellow / black), flat strips on the floor: one merged mesh
  const hazMat = keep(new THREE.MeshStandardMaterial({ ...texSet(textures, 'hazard', 1), polygonOffset: true, polygonOffsetFactor: -2 }));
  const hz = [];
  for (const cells of plan.blocks) {
    const inBlock = new Set(cells.map(c => key(c[0], c[1])));
    for (const [cx, cy] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (inBlock.has(key(nx, ny)) || plan.solid(nx, ny)) continue;
      const wdt = 0.22, len = S, g = new THREE.PlaneGeometry(dx ? wdt : len, dy ? wdt : len).rotateX(-Math.PI / 2);
      const ox = dx ? (dx > 0 ? (cx + 1) * S + wdt / 2 : cx * S - wdt / 2) : (cx + 0.5) * S, oz = dy ? (dy > 0 ? (cy + 1) * S + wdt / 2 : cy * S - wdt / 2) : (cy + 0.5) * S;
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (dx ? 0.22 : 2), uv.getY(i) * (dx ? 2 : 0.22));
      g.translate(ox, 0.004, oz); hz.push(g);
    }
  }
  if (hz.length) { const m = new THREE.Mesh(keep(mergeGeometries(hz)), hazMat); m.name = 'hazard-frames'; m.receiveShadow = true; group.add(m); stats.drawGroups++; hz.forEach(g => g.dispose()); }

  // ---------------- perimeter walls: faces into the room, 1.5 m, panel maps; top trim + dark caps ----------------
  const wallMat = keep(new THREE.MeshStandardMaterial({ ...texSet(textures, 'wall_panel') }));
  const trimMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.85, roughness: 0.38 }));
  const capMat = keep(new THREE.MeshStandardMaterial({ color: 0x14181d, metalness: 0.4, roughness: 0.8 }));
  const faces = [], trims = [], caps = [];
  const alcoveSet = new Set(plan.alcoves.map(x => key(x, 0)));
  const vTop = 1 - WALL_H / S; // wall_panel texture covers 2 m (v=0 top) → show its lower 1.5 m
  function face(x0, z0, x1, z1, nx, nz) {
    const g = new THREE.BufferGeometry(), y0 = 0, y1 = WALL_H;
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1 - vTop, 0, 1 - vTop], 2));
    // winding: front face towards (nx, nz)
    const cross = (x1 - x0) * nz - (z1 - z0) * nx; g.setIndex(cross > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    faces.push(g);
    const t = new THREE.BoxGeometry(Math.abs(x1 - x0) || 0.12, 0.07, Math.abs(z1 - z0) || 0.12);
    t.translate((x0 + x1) / 2 + nx * 0.03, WALL_H + 0.02, (z0 + z1) / 2 + nz * 0.03); trims.push(t);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!plan.border(x, y)) continue;
    const isAlcove = alcoveSet.has(key(x, y));
    if (!isAlcove) { const c = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2); c.translate((x + 0.5) * S, WALL_H, (y + 0.5) * S); caps.push(c); }
    const X0 = x * S, X1 = X0 + S, Z0 = y * S, Z1 = Z0 + S;
    const inside = (ax, ay) => ax > 0 && ay > 0 && ax < W - 1 && ay < H - 1 && !plan.solid(ax, ay);
    if (inside(x, y + 1) && !isAlcove) face(X0, Z1, X1, Z1, 0, 1);
    if (inside(x, y - 1)) face(X0, Z0, X1, Z0, 0, -1);
    if (inside(x + 1, y)) face(X1, Z0, X1, Z1, 1, 0);
    if (inside(x - 1, y)) face(X0, Z0, X0, Z1, -1, 0);
  }
  const addMerged = (list, mat, name, shadow = true) => { if (!list.length) return null; const m = new THREE.Mesh(keep(mergeGeometries(list)), mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); list.forEach(g => g.dispose()); stats.drawGroups++; return m; };
  addMerged(faces, wallMat, 'walls'); addMerged(trims, trimMat, 'wall-trim'); addMerged(caps, capMat, 'wall-caps', false);

  // ---------------- owner GLB props ----------------
  const templates = {};
  function template(id) {
    if (templates[id]) return templates[id];
    const src = models[id]; if (!src) return null;
    const scale = { capsule: 1.158, console: 1.0, door: 1.061, arch: 1.054, lamp_wall: 0.263 }[id] || 1;
    const root = src.scene.clone(true); root.scale.setScalar(scale);
    root.traverse(o => { if (o.isMesh) { o.castShadow = id !== 'lamp_wall'; o.receiveShadow = true; const m = o.material; if (m.emissiveMap) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = id === 'capsule' ? 2.2 : 1.6; } } });
    return (templates[id] = root);
  }
  const placed = { capsule: 0, console: 0, crates: 0, rack: 0, door: 0, arch: 0, lamp: 0 };
  function put(id, x, z, rotY = 0, extra = {}) {
    const t = template(id); if (!t) return null;
    const o = t.clone(true); o.position.set(x, extra.y || 0, z); o.rotation.y = rotY; if (extra.s) o.scale.multiplyScalar(extra.s);
    o.name = id; group.add(o); return o;
  }

  // ---------------- procedural props: crates, server racks, capsule plinths, pipes ----------------
  const crateMat = keep(new THREE.MeshStandardMaterial({ color: 0x23272c, metalness: 0.55, roughness: 0.55 }));
  const crateEdgeMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a12, metalness: 0.3, roughness: 0.6 }));
  const rackMat = keep(new THREE.MeshStandardMaterial({ color: 0x1a1e23, metalness: 0.7, roughness: 0.42 }));
  const ledMat = keep(new THREE.MeshStandardMaterial({ color: 0x0, emissive: 0x39d0ff, emissiveIntensity: 2.2 }));
  const ledRedMat = keep(new THREE.MeshStandardMaterial({ color: 0x0, emissive: 0xff3030, emissiveIntensity: 2.0 }));
  const plinthMat = keep(new THREE.MeshStandardMaterial({ color: 0x2b3036, metalness: 0.8, roughness: 0.45 }));
  const pipeMat = keep(new THREE.MeshStandardMaterial({ color: 0x59606a, metalness: 0.9, roughness: 0.35 }));
  const crateG = [], crateE = [], rackG = [], ledG = [], ledR = [], plinthG = [], pipeG = [];
  const box = (w, h, d, x, y, z, list, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); list.push(g); return g; };
  const crate = (cx, cz, w, h, d, y0, ry, list = crateG) => { // body + yellow-painted corner rails
    box(w, h, d, cx, y0 + h / 2, cz, list, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const g = new THREE.BoxGeometry(0.07, h + 0.01, 0.07); g.translate(sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)); if (ry) g.rotateY(ry); g.translate(cx, y0 + h / 2, cz); crateE.push(g); }
    box(w + 0.02, 0.06, d + 0.02, cx, y0 + h * 0.5, cz, crateE, ry);
  };
  for (const p of plan.props) {
    const cx = (p.x + 0.5) * S, cz = (p.y + 0.5) * S;
    // the block's open side (towards the room centre) decides the facing of consoles
    const toC = Math.atan2((W / 2) * S - cx, (H / 2) * S - cz);
    if (p.kind === 'capsule') {
      box(1.94, 0.16, 1.94, cx, 0.08, cz, plinthG);
      put('capsule', cx, cz, toC, { y: 0.16 }); placed.capsule++;
      sources.push({ x: cx, z: cz, y: 1.3, color: new THREE.Color(0x3cff6a), power: 9, kind: 'capsule' });
    } else if (p.kind === 'console') {
      put('console', cx, cz, Math.round(toC / (Math.PI / 2)) * (Math.PI / 2)); placed.console++;
      sources.push({ x: cx, z: cz, y: 1.2, color: new THREE.Color(0x48c8ff), power: 4, kind: 'console' });
    } else if (p.kind === 'rack') {
      for (const s of [-0.48, 0.48]) {
        box(0.86, 1.95, 1.7, cx + s, 0.975, cz, rackG);
        for (let k = 0; k < 7; k++) box(0.02, 0.04, 0.05, cx + s + (s > 0 ? -0.44 : 0.44), 0.4 + k * 0.2, cz - 0.5 + (k % 3) * 0.3, k % 4 === 0 ? ledR : ledG);
      }
      placed.rack++;
    } else {
      const r = ((p.x * 31 + p.y * 17) % 7) / 7;
      crate(cx - 0.35, cz - 0.3, 1.1, 0.95, 1.1, 0, r * 0.3);
      crate(cx + 0.45, cz + 0.4, 0.9, 0.75, 0.9, 0, -r * 0.4);
      crate(cx - 0.25, cz - 0.25, 0.8, 0.6, 0.8, 0.95, 0.5 + r * 0.3);
      placed.crates++;
    }
  }
  // capsule bank pipes (over the 5-cell bank: a manifold ring at 2.3 m between the capsule tops)
  const bank = plan.props.filter(p => p.kind === 'capsule' && p.block.length > 2);
  if (bank.length) {
    for (const a of bank) for (const b of bank) {
      if (b.x < a.x || (b.x === a.x && b.y <= a.y) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
      const ax = (a.x + 0.5) * S, az = (a.y + 0.5) * S, bx = (b.x + 0.5) * S, bz = (b.y + 0.5) * S, len = Math.hypot(bx - ax, bz - az);
      const g = new THREE.CylinderGeometry(0.07, 0.07, len, 10).rotateZ(Math.PI / 2).rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 2.32, (az + bz) / 2); pipeG.push(g);
    }
  }
  // north wall: horizontal pipes inside the wall depth (≤ DECOR_MAX into the room)
  for (const z of [S - 0.1]) for (const yy of [1.18, 1.32]) { const g = new THREE.CylinderGeometry(0.055, 0.055, (W - 2) * S, 10).rotateZ(Math.PI / 2); g.translate((W / 2) * S, yy, z + 0.06); pipeG.push(g); }
  addMerged(crateG, crateMat, 'crates'); addMerged(crateE, crateEdgeMat, 'crate-rails');
  addMerged(rackG, rackMat, 'racks'); addMerged(ledG, ledMat, 'rack-leds', false); addMerged(ledR, ledRedMat, 'rack-leds-red', false);
  addMerged(plinthG, plinthMat, 'plinths'); addMerged(pipeG, pipeMat, 'pipes');

  // ---------------- perimeter features ----------------
  // north alcoves: arch in the wall face, glass inside, a capsule in the alcove behind (sim: solid border cell → glass)
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x9fffc0, metalness: 0, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.18, depthWrite: false }));
  const alcoveFloorMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b1410, emissive: 0x0a3a18, emissiveIntensity: 0.6, roughness: 0.6 }));
  const glassG = [], alcoveG = [];
  for (const x of plan.alcoves) {
    const cx = (x + 0.5) * S;
    put('arch', cx, S - 0.32 + DECOR_MAX, 0); placed.arch++;
    put('capsule', cx, S * 0.5, 0, { y: 0, s: 0.86 }); placed.capsule++;
    const g = new THREE.PlaneGeometry(1.7, 1.45); g.translate(cx, 0.75, S - 0.05); glassG.push(g);
    const f = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2); f.translate(cx, 0.002, S * 0.5); alcoveG.push(f);
    for (const sx of [-1, 1]) { const w = new THREE.PlaneGeometry(S, WALL_H).rotateY(sx * Math.PI / 2); w.translate(cx - sx * S * 0.5, WALL_H / 2, S * 0.5); alcoveG.push(w); }
    const back = new THREE.PlaneGeometry(S, WALL_H); back.translate(cx, WALL_H / 2, 0.001); alcoveG.push(back);
    sources.push({ x: cx, z: S * 0.5, y: 1.2, color: new THREE.Color(0x3cff6a), power: 7, kind: 'capsule' });
  }
  addMerged(alcoveG, alcoveFloorMat, 'alcoves', false);
  if (glassG.length) { const m = new THREE.Mesh(keep(mergeGeometries(glassG)), glassMat); m.name = 'alcove-glass'; m.renderOrder = 2; group.add(m); stats.drawGroups++; glassG.forEach(g => g.dispose()); }
  // wall lamps (red emergency) on the north wall between alcoves and on W / E walls
  const lamps = [];
  for (const x of plan.lampsN) { const o = put('lamp_wall', (x + 0.5) * S, S + 0.02, 0, { y: 0.85 }); if (o) { lamps.push(o); placed.lamp++; sources.push({ x: (x + 0.5) * S, z: S + 0.4, y: 1.1, color: new THREE.Color(0xff2a1a), power: 6, kind: 'lamp' }); } }
  for (const l of plan.lampsS) {
    const xw = l.side === 'W' ? S + 0.02 : (W - 1) * S - 0.02, rot = l.side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    const o = put('lamp_wall', xw, (l.at + 0.5) * S, rot, { y: 0.85 }); if (o) { lamps.push(o); placed.lamp++; sources.push({ x: xw + (l.side === 'W' ? 0.4 : -0.4), z: (l.at + 0.5) * S, y: 1.1, color: new THREE.Color(0xff2a1a), power: 6, kind: 'lamp' }); }
  }
  // sealed blast doors on the W / E gates (embedded so they protrude ≤ DECOR_MAX)
  const doors = [];
  for (const d of plan.doors) {
    const xw = d.side === 'W' ? S - 0.32 + DECOR_MAX : (W - 1) * S + 0.32 - DECOR_MAX, rot = d.side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    const o = put('door', xw, (d.at + 1) * S, rot); if (o) { doors.push(o); placed.door++; }
  }


  let steamOn = !!profile.steam;
  // ---------------- floor marking, wet patches, capsule bubbles, steam (M3.2 atmosphere) ----------------
  // BIO-LAB / SECTOR B-3 marking with the biohazard sign, painted on an open floor area near the centre (own drawing,
  // canvas at load; worn by noise). Wet patches: low-roughness dark decals that catch the lab lights in reflection.
  const rng = (() => { let a = 0x2f6e2b1; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  function markingTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    g.translate(256, 256); g.fillStyle = '#c8312a'; g.strokeStyle = '#c8312a';
    // biohazard: three crescents + inner ring (geometric construction)
    for (let i = 0; i < 3; i++) {
      g.save(); g.rotate(i * Math.PI * 2 / 3);
      g.beginPath(); g.arc(0, -78, 92, 0, Math.PI * 2); g.arc(0, -104, 64, 0, Math.PI * 2, true); g.fill('evenodd'); g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3 + Math.PI); g.fillRect(-7, 0, 14, 160); g.restore(); }
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3 + Math.PI / 3); g.fillRect(-14, 90, 28, 40); g.restore(); }
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#b9bfc4'; g.font = '900 150px "Arial Narrow", "Roboto Condensed", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('BIO-LAB', 470, 200); g.font = '800 82px "Arial Narrow", "Roboto Condensed", Arial, sans-serif'; g.fillText('SECTOR B-3', 476, 330);
    // wear: erase random specks / scratches
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) { g.globalAlpha = 0.25 + rng() * 0.6; const r = rng() * 5 + 0.5; g.beginPath(); g.arc(rng() * 1024, rng() * 512, r, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 0.5; g.lineWidth = 2; for (let i = 0; i < 60; i++) { g.beginPath(); const x = rng() * 1024, y = rng() * 512; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 220, y + (rng() - 0.5) * 60); g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function blobTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 14; i++) { const x = 128 + (rng() - 0.5) * 120, y = 128 + (rng() - 0.5) * 120, r = 30 + rng() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const t = new THREE.CanvasTexture(c); return t;
  }
  // the marking: the largest open 4×2-cell rectangle closest to the arena centre (never on a prop / grate)
  const markCells = (() => { let best = null; for (let y = 2; y < H - 3; y++) for (let x = 2; x < W - 5; x++) {
    let ok = true; for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 4 && ok; dx++) if (plan.solid(x + dx, y + dy) || grates.some(g => g[0] === x + dx && g[1] === y + dy)) ok = false;
    if (!ok) continue; const d = Math.hypot(x + 2 - W * 0.42, y + 1 - H * 0.62); if (!best || d < best.d) best = { x, y, d }; } return best; })();
  if (markCells) {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(4 * S * 0.92, 2 * S * 0.92).rotateX(-Math.PI / 2)), keep(new THREE.MeshStandardMaterial({ map: keep(markingTexture()), transparent: true, opacity: 0.72, roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false })));
    m.position.set((markCells.x + 2) * S, 0.006, (markCells.y + 1) * S); m.rotation.y = -0.08; m.receiveShadow = true; m.name = 'floor-marking'; group.add(m); stats.drawGroups++;
  }
  const wetTex = keep(blobTexture());
  const wetMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b222b, roughness: 0.1, metalness: 0.3, alphaMap: wetTex, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 2.4 }));
  const wetG = [];
  // only next to light sources (capsules / lamps): that is where a wet floor visibly catches the light
  const nearLight = open.filter(([x, y]) => sources.some(s0 => Math.hypot((x + 0.5) * S - s0.x, (y + 0.5) * S - s0.z) < 3.4));
  for (let i = 0; i < 8 && nearLight.length; i++) {
    const cell = nearLight[Math.floor(rng() * nearLight.length)];
    const w = 1.6 + rng() * 2.2, d = 1.2 + rng() * 1.6, g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rng() * Math.PI);
    g.translate((cell[0] + 0.5) * S + (rng() - 0.5), 0.005, (cell[1] + 0.5) * S + (rng() - 0.5)); wetG.push(g);
  }
  if (wetG.length) { const m = new THREE.Mesh(keep(mergeGeometries(wetG)), wetMat); m.name = 'wet-floor'; m.receiveShadow = true; group.add(m); stats.drawGroups++; wetG.forEach(g => g.dispose()); }
  // capsule bubbles: one Points cloud rising inside every capsule (bank + alcoves)
  const capsuleSpots = [...plan.props.filter(p => p.kind === 'capsule').map(p => [(p.x + 0.5) * S, (p.y + 0.5) * S, 0.16]), ...plan.alcoves.map(x => [(x + 0.5) * S, S * 0.5, 0])];
  const NB = Math.round(capsuleSpots.length * 10 * Math.max(0.35, profile.particles ?? 1));
  const bPos = new Float32Array(NB * 3), bSeed = new Float32Array(NB);
  for (let i = 0; i < NB; i++) { const c = capsuleSpots[i % capsuleSpots.length]; bPos[i * 3] = c[0] + (rng() - 0.5) * 0.5; bPos[i * 3 + 1] = c[2] + 0.3 + rng() * 1.5; bPos[i * 3 + 2] = c[1] + (rng() - 0.5) * 0.5; bSeed[i] = rng(); }
  const bGeo = keep(new THREE.BufferGeometry()); bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bubbles = new THREE.Points(bGeo, keep(new THREE.PointsMaterial({ color: new THREE.Color(0.55, 2.2, 0.8), size: 0.045, transparent: true, opacity: 0.8, depthWrite: false })));
  bubbles.name = 'capsule-bubbles'; group.add(bubbles);
  const bBase = capsuleSpots.map(c => c[2]);
  // steam from the grates near the capsule bank (Среднее / Высокое): soft sprites rising and fading
  const steamTex = keep(blobTexture());
  const steamMat = keep(new THREE.SpriteMaterial({ map: steamTex, color: 0x9fb5a8, transparent: true, opacity: 0, depthWrite: false }));
  const steam = [];
  const steamCells = grates.filter((_, i) => i % 3 === 0).slice(0, 6);
  for (let i = 0; i < steamCells.length * 3; i++) { const sp = new THREE.Sprite(steamMat.clone()); keep(sp.material); const c = steamCells[i % steamCells.length]; sp.userData = { x: (c[0] + 0.5) * S, z: (c[1] + 0.5) * S, t: rng() * 4 }; group.add(sp); steam.push(sp); }

  // ---------------- light: fill, key (+ shadows by profile), pooled point lights ----------------
  const hemi = new THREE.HemisphereLight(0x8fa6c4, 0x1c1410, profile.hemi ?? 0.55); group.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xd8e4ff, profile.key ?? 1.25);
  keyLight.position.set(-8, 18, 10); keyLight.target.position.set(0, 0, 0); group.add(keyLight, keyLight.target);
  function setProfile(pr) {
    steamOn = !!pr.steam;
    hemi.intensity = pr.hemi ?? 0.55; keyLight.intensity = pr.key ?? 1.25;
    const size = pr.shadowMap || 0;
    keyLight.castShadow = size > 0;
    if (size && keyLight.shadow.mapSize.x !== size) { keyLight.shadow.mapSize.set(size, size); if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; } }
    const c = keyLight.shadow.camera; c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 60; c.updateProjectionMatrix();
    keyLight.shadow.bias = -0.0006; keyLight.shadow.normalBias = 0.03; keyLight.shadow.radius = 3;
  }
  setProfile(profile);
  const pool = [];
  for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 1.6); l.position.set(0, -50, 0); group.add(l); pool.push({ light: l, src: null, k: 0 }); }
  let alarm = 0, t = 0, tick = 0;
  const lampMats = new Set(); for (const o of lamps) o.traverse(m => { if (m.isMesh && m.material.emissiveMap) lampMats.add(m.material); });
  // capsule / console emissive materials (shared by the clones of each template): breathing glow, monitor flicker
  const glowBase = new Map();
  for (const id of ['capsule', 'console']) { const tpl = templates[id]; if (tpl) tpl.traverse(o => { if (o.isMesh && o.material.emissiveMap && !glowBase.has(o.material)) { o.material.userData.monitor = id === 'console'; glowBase.set(o.material, o.material.emissiveIntensity); } }); }
  const emissiveBase = new Map(); for (const m of lampMats) emissiveBase.set(m, m.emissiveIntensity);

  function update(focus, dt) {
    t += dt;
    keyLight.position.set(focus.x - 8, 18, focus.z + 10); keyLight.target.position.set(focus.x, 0, focus.z);
    if ((tick++ & 7) === 0) { // re-assign the pool to the nearest sources
      const near = sources.map(s => ({ s, d: Math.hypot(s.x - focus.x, s.z - focus.z) - (s.kind === 'capsule' ? 2 : 0) })).sort((a, b) => a.d - b.d).slice(0, POOL);
      pool.forEach((p, i) => { const s = near[i] && near[i].s; if (s !== p.src) { p.src = s || null; p.k = 0; if (s) { p.light.position.set(s.x, s.y, s.z); p.light.color.copy(s.color); } } });
    }
    for (const p of pool) {
      if (!p.src) { p.light.intensity = 0; continue; }
      p.k = Math.min(1, p.k + dt * 3);
      const flick = p.src.kind === 'lamp' ? (alarm > 0.01 ? 0.5 + 0.5 * Math.sin(t * 6.5) : 0.35) : 1 + Math.sin(t * 2.1 + p.src.x) * 0.06;
      p.light.intensity = p.src.power * p.k * flick;
    }
    const pulse = alarm > 0.01 ? 0.6 + 1.4 * (0.5 + 0.5 * Math.sin(t * 6.5)) * alarm : 0.9;
    for (const m of lampMats) m.emissiveIntensity = emissiveBase.get(m) * pulse;
    // capsule glow breathing, monitor flicker
    for (const [m, base] of glowBase) m.emissiveIntensity = base * (m.userData.monitor ? 0.92 + 0.08 * Math.sin(t * 23 + base) * Math.sin(t * 3.1) : 1 + 0.12 * Math.sin(t * 1.3 + base * 3));
    // bubbles rise and restart at the capsule bottom
    if (dt > 0) {
      const arr = bGeo.attributes.position.array;
      for (let i = 0; i < NB; i++) { arr[i * 3 + 1] += dt * (0.25 + bSeed[i] * 0.35); arr[i * 3] += Math.sin(t * 3 + i) * dt * 0.03; if (arr[i * 3 + 1] > bBase[i % bBase.length] + 1.95) arr[i * 3 + 1] = bBase[i % bBase.length] + 0.3; }
      bGeo.attributes.position.needsUpdate = true;
      for (const sp of steam) {
        const u = sp.userData; u.t += dt; const k = (u.t % 4) / 4;
        sp.visible = steamOn; sp.position.set(u.x + Math.sin(u.t) * 0.2, 0.1 + k * 1.6, u.z); sp.scale.setScalar(0.5 + k * 1.4); sp.material.opacity = steamOn ? Math.sin(k * Math.PI) * 0.16 : 0;
      }
    }
  }

  return {
    group, plan, stats: { ...stats, placed }, sources, doors, lamps, keyLight, hemi,
    update, setProfile, setAlarm(k) { alarm = k; },
    /** Centre of the capsule bank (metres): the backdrop of the menu / loadout showcase. */
    bankCentre() { const b = plan.props.filter(p => p.kind === 'capsule' && p.block.length > 2); const n = b.length || 1; return { x: b.reduce((a, p) => a + (p.x + 0.5) * S, 0) / n, z: b.reduce((a, p) => a + (p.y + 0.5) * S, 0) / n }; },
    isPropCell: (x, y) => propCells.has(key(x, y)),
    dispose() { scene.remove(group); for (const d of disposables) d.dispose && d.dispose(); },
  };
}
