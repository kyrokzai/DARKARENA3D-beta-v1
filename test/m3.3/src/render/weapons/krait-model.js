// DA-S12 KRAIT — procedural pump-action shotgun (original design: black metal, graphite polymer, heavy barrel over a
// tube magazine, compact tactical stock). Same frame and helpers as DA-R1 RAVEN: the pistol grip and the trigger are
// exactly where RAVEN's are, so the right hand's firing grip is solved against the same grip volume.
// Moving parts: the pump (forend + action bars, slides back toward the shooter along +Z), the loading shell held by the
// left hand during the shell-by-shell reload ('shell'), the ejected shell is spawned by the viewmodel at `eject`.
// Sights: ghost-ring rear aperture + front post on a ramp (sight line parallel to the bore, ADS looks through the ring).
import * as THREE from 'three';
import { mergeGeometries } from '../geometry-merge.js';
import { shapeFrom, side, front, tube, box } from './raven-model.js';
import { getWeaponTextures } from './weapon-textures.js';
import { getWeaponSurfaceMaps } from './proc-maps.js';

export const PUMP_TRAVEL = 0.075; // m the forend travels back (+Z)
let shared = null;
function shellGeo() { // 12-gauge shell: red hull + brass head, along the gun axis (Z)
  return { hull: new THREE.CylinderGeometry(0.0102, 0.0102, 0.052, 12).rotateX(Math.PI / 2).translate(0, 0, -0.008), head: new THREE.CylinderGeometry(0.0108, 0.0108, 0.014, 12).rotateX(Math.PI / 2).translate(0, 0, 0.025) };
}
function buildGeometry() {
  const P = { metal: [], dark: [], poly: [], grip: [], pump: [], pumpSteel: [], steel: [], shellHull: [], shellHead: [], rubber: [] };
  // ---- receiver (u −0.030 … 0.205), flat sides with a milled panel, loading port underneath, ejection port right
  P.metal.push(side(shapeFrom([['M', -0.030, 0.074], ['L', 0.200, 0.074], ['Q', 0.206, 0.074, 0.206, 0.068], ['L', 0.206, -0.020], ['L', 0.172, -0.030], ['L', 0.040, -0.030], ['L', -0.012, -0.024], ['L', -0.030, -0.014]]), 0.048, { bevel: 0.0025, seg: 2 }));
  for (const sx of [-1, 1]) P.dark.push(side(shapeFrom([['M', 0.030, 0.012], ['L', 0.170, 0.012], ['L', 0.170, 0.050], ['L', 0.030, 0.050]]), 0.0012, { x: sx * 0.0245, bevel: 0 }));
  P.dark.push(box(0.026, 0.004, 0.090, 0, -0.030, 0.118));                     // loading port
  P.dark.push(box(0.003, 0.026, 0.070, 0.0246, 0.044, 0.110));                  // ejection port
  P.steel.push(box(0.004, 0.006, 0.020, 0.025, -0.006, 0.046));                 // slide release
  // top rail with the ghost-ring rear sight (ring + protective ears)
  P.metal.push(box(0.020, 0.008, 0.170, 0, 0.078, 0.105));
  for (let i = 0; i < 9; i++) P.dark.push(box(0.021, 0.0025, 0.004, 0, 0.0825, 0.030 + i * 0.019));
  P.metal.push(side(shapeFrom([['M', -0.004, 0.082], ['L', 0.034, 0.082], ['L', 0.030, 0.096], ['L', 0.000, 0.096]]), 0.022, { bevel: 0.001 }));
  const ring = new THREE.TorusGeometry(0.0085, 0.0022, 8, 20).translate(0, 0.104, -0.014);
  P.metal.push(ring);
  for (const sx of [-1, 1]) P.metal.push(side(shapeFrom([['M', 0.000, 0.090], ['L', 0.030, 0.090], ['L', 0.026, 0.118], ['L', 0.006, 0.118]]), 0.004, { x: sx * 0.0135, bevel: 0 }));
  // ---- heavy barrel, tube magazine, clamp, front post on a ramp
  P.metal.push(tube(0.0128, 0.206, 0.640, 0.055, { seg: 18 }));
  P.dark.push(tube(0.0094, 0.638, 0.642, 0.055, { seg: 14 }));                   // bore
  P.metal.push(tube(0.0122, 0.206, 0.600, 0.020, { seg: 16 }));                  // tube magazine
  P.steel.push(tube(0.0130, 0.598, 0.618, 0.020, { seg: 16 }));                  // magazine cap
  P.metal.push(side(shapeFrom([['M', 0.560, 0.008], ['L', 0.585, 0.008], ['L', 0.585, 0.070], ['L', 0.560, 0.070]]), 0.032, { bevel: 0.002 })); // barrel clamp
  P.metal.push(side(shapeFrom([['M', 0.586, 0.066], ['L', 0.628, 0.066], ['L', 0.628, 0.084], ['L', 0.608, 0.090], ['L', 0.592, 0.090]]), 0.010, { bevel: 0.001 })); // ramp + post
  P.steel.push(new THREE.CylinderGeometry(0.0016, 0.0016, 0.014, 6).translate(0, 0.097, -0.616));
  for (const sx of [-1, 1]) P.metal.push(box(0.003, 0.020, 0.018, sx * 0.0075, 0.090, 0.616)); // post ears
  // ---- pump (forend) — graphite polymer with grip ribs, action bars back into the receiver
  P.pump.push(side(shapeFrom([['M', 0.262, 0.044], ['L', 0.432, 0.044], ['Q', 0.440, 0.044, 0.440, 0.036], ['L', 0.440, -0.002], ['Q', 0.440, -0.014, 0.426, -0.014],
    ['L', 0.276, -0.014], ['Q', 0.262, -0.014, 0.262, -0.002]]), 0.056, { bevel: 0.006, seg: 3 }));
  for (let i = 0; i < 7; i++) { // grip ribs: across the bottom and up both sides
    const u = 0.288 + i * 0.021;
    P.pumpSteel.push(box(0.044, 0.003, 0.006, 0, -0.0155, u));
    for (const sx of [-1, 1]) P.pumpSteel.push(box(0.003, 0.034, 0.006, sx * 0.0293, 0.012, u));
  }
  for (const sx of [-1, 1]) P.pumpSteel.push(box(0.003, 0.008, 0.120, sx * 0.0185, 0.020, 0.222));
  // ---- trigger guard + trigger (same place as RAVEN), pistol grip (polymer), side saddle with 4 shells (left)
  const guard = shapeFrom([['M', 0.030, -0.024], ['L', 0.118, -0.024], ['L', 0.118, -0.052], ['Q', 0.112, -0.062, 0.094, -0.062], ['L', 0.046, -0.062], ['Q', 0.030, -0.056, 0.030, -0.042]]);
  const gh = new THREE.Path(); gh.moveTo(0.038, -0.028); gh.lineTo(0.110, -0.028); gh.lineTo(0.110, -0.050); gh.quadraticCurveTo(0.106, -0.057, 0.092, -0.057); gh.lineTo(0.048, -0.057); gh.quadraticCurveTo(0.038, -0.052, 0.038, -0.042); gh.closePath();
  guard.holes.push(gh); P.poly.push(side(guard, 0.012, { bevel: 0.0015 }));
  P.steel.push(side(shapeFrom([['M', 0.058, -0.024], ['L', 0.066, -0.024], ['Q', 0.064, -0.036, 0.058, -0.047], ['L', 0.054, -0.045], ['Q', 0.059, -0.034, 0.058, -0.024]]), 0.006, { bevel: 0 }));
  P.grip.push(side(shapeFrom([['M', -0.006, -0.018], ['L', 0.030, -0.018], ['L', 0.026, -0.034], ['L', 0.012, -0.136], ['Q', 0.010, -0.148, -0.003, -0.149], ['L', -0.030, -0.146],
    ['Q', -0.040, -0.140, -0.036, -0.128], ['L', -0.014, -0.032]]), 0.032, { bevel: 0.0045, seg: 2 }));
  for (let i = 0; i < 5; i++) P.rubber.push(box(0.0335, 0.004, 0.006, 0, -0.058 - i * 0.017, 0.004 - i * 0.004)); // grip texture bands
  P.poly.push(box(0.006, 0.050, 0.090, -0.0275, 0.032, 0.095));                 // saddle plate
  const sg = shellGeo();
  for (let i = 0; i < 4; i++) { const u = 0.060 + i * 0.023; P.shellHull.push(sg.hull.clone().rotateX(Math.PI / 2).translate(-0.0355, 0.032, -u)); P.shellHead.push(sg.head.clone().rotateX(Math.PI / 2).translate(-0.0355, 0.032, -u)); }
  // ---- compact tactical stock: buffer tube, polymer stock with cheek riser, rubber pad
  P.metal.push(tube(0.0150, -0.215, -0.030, 0.036, { seg: 16 }));
  P.poly.push(side(shapeFrom([['M', -0.090, 0.066], ['L', -0.232, 0.060], ['L', -0.240, 0.052], ['L', -0.240, -0.088], ['L', -0.226, -0.094], ['L', -0.200, -0.070], ['L', -0.150, -0.022], ['L', -0.090, 0.010]]), 0.036, { bevel: 0.004, seg: 2 }));
  P.dark.push(box(0.037, 0.030, 0.050, 0, 0.000, -0.180));                       // lightening cut (shadow)
  P.rubber.push(side(shapeFrom([['M', -0.240, 0.060], ['L', -0.254, 0.060], ['L', -0.254, -0.094], ['L', -0.240, -0.090]]), 0.040, { bevel: 0.002 }));
  const merged = {}; for (const [k, list] of Object.entries(P)) if (list.length) merged[k] = mergeGeometries(list);
  merged.loadShellHull = sg.hull; merged.loadShellHead = sg.head;
  return { merged, anchors: { muzzle: new THREE.Vector3(0, 0.055, -0.645), sight: new THREE.Vector3(0, 0.104, -0.014), eject: new THREE.Vector3(0.027, 0.046, -0.110), port: new THREE.Vector3(0, -0.032, -0.118) } };
}

export function createKraitModel() {
  const { merged, anchors } = shared || (shared = buildGeometry());
  const t = getWeaponTextures(), n = getWeaponSurfaceMaps();
  const N = (m, k) => ({ normalMap: m, normalScale: new THREE.Vector2(k, k) });
  const mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.5, map: t.wear, roughnessMap: n.rough, ...N(n.metal, 0.3) }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3c41, metalness: 0.9, roughness: 0.32, ...N(n.metal, 0.2) }),
    poly: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.05, roughness: 0.8, map: t.wear, ...N(n.polymer, 0.25) }),   // graphite polymer
    grip: new THREE.MeshStandardMaterial({ color: 0x202226, metalness: 0.05, roughness: 0.78, ...N(n.polymer, 0.4) }),
    pump: new THREE.MeshStandardMaterial({ color: 0x2e3035, metalness: 0.05, roughness: 0.75, map: t.wear, ...N(n.polymer, 0.35) }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0f1012, metalness: 0.0, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, metalness: 0.2 }),
    shellHull: new THREE.MeshStandardMaterial({ color: 0x8a1418, metalness: 0.05, roughness: 0.5 }),
    shellHead: new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.9, roughness: 0.35 }),
  };
  const group = new THREE.Group(); group.name = 'DA-S12 KRAIT';
  const add = (geo, mat, parent = group, name = '') => { const m = new THREE.Mesh(geo, mat); m.name = name; parent.add(m); return m; };
  for (const k of ['metal', 'dark', 'poly', 'grip', 'steel', 'rubber', 'shellHull', 'shellHead']) add(merged[k], mats[k === 'shellHull' || k === 'shellHead' ? k : k], group, k);
  const pump = new THREE.Group(); pump.name = 'pump'; group.add(pump);
  add(merged.pump, mats.pump, pump, 'forend'); add(merged.pumpSteel, mats.steel, pump, 'action-bars');
  // the shell in the left hand while loading (positioned every frame by the hands controller)
  const loadShell = new THREE.Group(); loadShell.name = 'loading-shell'; loadShell.visible = false; group.add(loadShell);
  add(merged.loadShellHull, mats.shellHull, loadShell, 'hull'); add(merged.loadShellHead, mats.shellHead, loadShell, 'head');
  const anchorObj = {}; for (const [k, v] of Object.entries(anchors)) { const o = new THREE.Object3D(); o.name = 'anchor-' + k; o.position.copy(v); group.add(o); anchorObj[k] = o; }
  return {
    id: 'krait', group, mats, anchors: anchorObj, parts: { pump, loadShell },
    detailMats: ['metal', 'steel', 'poly', 'grip', 'pump'],
    get skin() { return 'default'; }, setSkin() {},
    sharedGeometry: merged,
  };
}
