// AK-47 MOD — procedural mid-poly model of a classic AK-pattern rifle with a light modernisation (side-mounted red dot).
// Same frame and helpers as DA-R1 RAVEN (raven-model.js): metres, barrel along −Z, +Y up, +X right; profiles in (u, v),
// u along the gun towards the muzzle, origin = rear top of the grip area. The pistol grip and the trigger sit exactly
// where RAVEN's do, so the firing grip of the hands is solved against the same grip volume (hand-poses.js).
// Recognisable silhouette: stamped receiver with ribbed dust cover, wooden handguards and stock, curved magazine,
// gas tube above the barrel, AK front sight with "ears", slant muzzle brake, long selector lever on the right.
// Parts that move: magazine (reload), bolt carrier with the right-side charging handle ('charging').
import * as THREE from 'three';
import { mergeGeometries } from '../geometry-merge.js';
import { shapeFrom, side, front, tube, box } from './raven-model.js';
import { getWeaponTextures } from './weapon-textures.js';
import { getWeaponSurfaceMaps, getWoodMaps } from './proc-maps.js';

let shared = null;
function buildGeometry() {
  const P = { steel: [], dark: [], wood: [], grip: [], mag: [], magRib: [], charging: [], sight: [], black: [] };
  // ---- stamped receiver (u −0.035 … 0.245), magazine well opening at u 0.13 … 0.20
  P.steel.push(side(shapeFrom([['M', -0.035, 0.062], ['L', 0.245, 0.062], ['L', 0.245, -0.012], ['L', 0.205, -0.016], ['L', 0.130, -0.016], ['L', 0.122, -0.028],
    ['L', 0.090, -0.028], ['L', 0.088, -0.016], ['L', -0.035, -0.016]]), 0.044, { bevel: 0.0018 }));
  // dust cover: slightly narrower, rounded top, rear release button; three stiffening ribs
  P.steel.push(side(shapeFrom([['M', -0.028, 0.061], ['L', 0.218, 0.061], ['L', 0.218, 0.069], ['Q', 0.212, 0.080, 0.196, 0.081], ['L', -0.014, 0.081], ['Q', -0.028, 0.080, -0.028, 0.070]]), 0.040, { bevel: 0.003, seg: 2 }));
  P.steel.push(box(0.010, 0.010, 0.012, 0, 0.068, -0.037));
  for (const u of [0.030, 0.085, 0.140]) P.dark.push(box(0.030, 0.0018, 0.0035, 0, 0.0812, u));
  // rivets and the trunnion line on both sides
  for (const sx of [-1, 1]) {
    for (const [u, v] of [[0.205, 0.005], [0.228, 0.005], [0.205, 0.040], [0.228, 0.040], [-0.012, 0.010], [0.010, 0.010]]) P.steel.push(new THREE.CylinderGeometry(0.0028, 0.0028, 0.003, 8).rotateZ(Math.PI / 2).translate(sx * 0.0228, v, -u));
    P.dark.push(box(0.0012, 0.002, 0.11, sx * 0.0223, 0.020, 0.07)); // stamped line along the receiver
  }
  // ejection port (right) and the long safety / selector lever (right)
  P.dark.push(box(0.003, 0.016, 0.085, 0.0226, 0.050, 0.125));
  P.steel.push(side(shapeFrom([['M', 0.010, 0.035], ['L', 0.150, 0.042], ['L', 0.150, 0.050], ['L', 0.010, 0.045]]), 0.003, { x: 0.0245, bevel: 0 }));
  P.steel.push(box(0.006, 0.014, 0.010, 0.026, 0.028, 0.020)); // lever tab
  // trigger guard (steel loop) and trigger
  const guard = shapeFrom([['M', 0.030, -0.016], ['L', 0.118, -0.016], ['L', 0.118, -0.050], ['Q', 0.112, -0.060, 0.094, -0.060], ['L', 0.046, -0.060], ['Q', 0.030, -0.054, 0.030, -0.040]]);
  const gh = new THREE.Path(); gh.moveTo(0.038, -0.020); gh.lineTo(0.110, -0.020); gh.lineTo(0.110, -0.048); gh.quadraticCurveTo(0.106, -0.055, 0.092, -0.055); gh.lineTo(0.048, -0.055); gh.quadraticCurveTo(0.038, -0.050, 0.038, -0.040); gh.closePath();
  guard.holes.push(gh); P.steel.push(side(guard, 0.009, { bevel: 0.0008 }));
  P.steel.push(side(shapeFrom([['M', 0.058, -0.016], ['L', 0.066, -0.016], ['Q', 0.064, -0.034, 0.058, -0.046], ['L', 0.054, -0.044], ['Q', 0.059, -0.032, 0.058, -0.016]]), 0.006, { bevel: 0 }));
  // pistol grip (dark bakelite), same volume / angle as RAVEN's grip
  P.grip.push(side(shapeFrom([['M', -0.004, -0.014], ['L', 0.030, -0.014], ['L', 0.028, -0.030], ['L', 0.012, -0.136], ['Q', 0.010, -0.147, -0.002, -0.148], ['L', -0.028, -0.146],
    ['Q', -0.038, -0.142, -0.035, -0.130], ['L', -0.012, -0.030]]), 0.032, { bevel: 0.004, seg: 2 }));
  for (let i = 0; i < 6; i++) P.dark.push(box(0.033, 0.0015, 0.004, 0, -0.050 - i * 0.015, 0.006 - i * 0.0035)); // grip grooves
  // ---- barrel, gas system, front sight, muzzle brake
  P.steel.push(tube(0.0088, 0.245, 0.690, 0.042, { seg: 16 }));
  P.steel.push(tube(0.0085, 0.430, 0.560, 0.078, { seg: 14 }));                    // gas tube (exposed part)
  P.steel.push(box(0.022, 0.040, 0.030, 0, 0.060, 0.545));                          // gas block
  P.steel.push(box(0.024, 0.026, 0.040, 0, 0.055, 0.640));                          // front sight block
  for (const sx of [-1, 1]) P.steel.push(side(shapeFrom([['M', 0.632, 0.068], ['L', 0.650, 0.068], ['L', 0.648, 0.100], ['L', 0.640, 0.102], ['L', 0.634, 0.090]]), 0.004, { x: sx * 0.0095, bevel: 0 })); // the "ears"
  P.steel.push(new THREE.CylinderGeometry(0.0016, 0.0016, 0.024, 6).translate(0, 0.084, -0.641));                 // post
  P.steel.push(tube(0.0115, 0.690, 0.738, 0.042, { seg: 16 }));                     // slant brake body
  P.dark.push(tube(0.0062, 0.736, 0.740, 0.042, { seg: 12 }));                      // bore
  P.dark.push(box(0.004, 0.010, 0.020, 0.010, 0.050, 0.715, 0.4));                // brake cut
  // rear sight leaf on the trunnion block
  P.steel.push(side(shapeFrom([['M', 0.232, 0.062], ['L', 0.300, 0.062], ['L', 0.300, 0.072], ['L', 0.240, 0.090], ['L', 0.232, 0.084]]), 0.020, { bevel: 0.001 }));
  P.dark.push(box(0.006, 0.004, 0.004, 0, 0.0905, 0.238));                         // notch
  // ---- wood: lower handguard (around the barrel), upper handguard (over the gas tube), classic stock
  P.wood.push(side(shapeFrom([['M', 0.300, -0.004], ['L', 0.478, 0.004], ['Q', 0.486, 0.008, 0.486, 0.016], ['L', 0.486, 0.054], ['L', 0.300, 0.054], ['Q', 0.292, 0.054, 0.292, 0.046], ['L', 0.292, 0.004], ['Q', 0.292, -0.004, 0.300, -0.004]]), 0.052, { bevel: 0.006, seg: 3 }));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) P.dark.push(box(0.0015, 0.016, 0.006, sx * 0.0262, 0.016, 0.360 + i * 0.038)); // finger grooves
  P.steel.push(side(shapeFrom([['M', 0.245, -0.008], ['L', 0.300, -0.008], ['L', 0.300, 0.056], ['L', 0.245, 0.056]]), 0.048, { bevel: 0.0015 })); // retainer
  P.wood.push(side(shapeFrom([['M', 0.302, 0.060], ['L', 0.430, 0.064], ['Q', 0.438, 0.074, 0.430, 0.088], ['L', 0.302, 0.090], ['Q', 0.296, 0.075, 0.302, 0.060]]), 0.036, { bevel: 0.005, seg: 2 }));
  P.wood.push(side(shapeFrom([['M', -0.035, 0.060], ['L', -0.255, 0.032], ['L', -0.262, 0.028], ['L', -0.262, -0.098], ['L', -0.255, -0.102], ['Q', -0.140, -0.064, -0.036, -0.026]]), 0.040, { bevel: 0.006, seg: 2 }));
  P.steel.push(side(shapeFrom([['M', -0.262, 0.030], ['L', -0.272, 0.030], ['L', -0.272, -0.104], ['L', -0.262, -0.100]]), 0.042, { bevel: 0.001 })); // butt plate
  P.steel.push(box(0.044, 0.050, 0.012, 0, 0.022, -0.041));                        // stock tang
  // ---- curved magazine (separate part)
  P.mag.push(side(shapeFrom([['M', 0.133, -0.010], ['L', 0.198, -0.010], ['Q', 0.212, -0.110, 0.266, -0.204], ['L', 0.214, -0.230], ['Q', 0.164, -0.134, 0.133, -0.010]]), 0.026, { bevel: 0.002, seg: 2 }));
  // stiffening ribs along the magazine (rotated about X to follow its forward curve, then placed)
  for (const sx of [-1, 1]) for (const [du, a] of [[0.0, 0.30], [0.022, 0.36]]) {
    const t = 0.5, u = 0.170 + du + t * 0.055, v = -0.115;
    P.magRib.push(new THREE.BoxGeometry(0.002, 0.120, 0.005).rotateX(a).translate(sx * 0.0133, v, -u));
  }
  P.magRib.push(side(shapeFrom([['M', 0.208, -0.226], ['L', 0.270, -0.200], ['L', 0.274, -0.208], ['L', 0.212, -0.236]]), 0.028, { bevel: 0.0012 })); // floor plate
  // ---- bolt carrier + charging handle (right side) — moves back during the reload
  P.charging.push(box(0.004, 0.010, 0.060, 0.0232, 0.052, 0.140));
  P.charging.push(new THREE.CylinderGeometry(0.0062, 0.0055, 0.020, 12).rotateZ(Math.PI / 2).translate(0.0345, 0.052, -0.168));
  // ---- side-mount rail (left) + bridge + compact red dot over the receiver
  P.black.push(box(0.006, 0.026, 0.090, -0.0258, 0.030, 0.080));
  P.black.push(side(shapeFrom([['M', 0.050, 0.083], ['L', 0.130, 0.083], ['L', 0.130, 0.092], ['L', 0.050, 0.092]]), 0.050, { bevel: 0.001 }));
  P.black.push(box(0.010, 0.060, 0.020, -0.030, 0.062, 0.090));
  const sCY = 0.112, housing = new THREE.Shape();
  housing.moveTo(-0.018, 0.092); housing.lineTo(0.018, 0.092); housing.lineTo(0.019, 0.126); housing.quadraticCurveTo(0.018, 0.134, 0.008, 0.136); housing.lineTo(-0.008, 0.136); housing.quadraticCurveTo(-0.018, 0.134, -0.019, 0.126); housing.closePath();
  const win = new THREE.Path(); win.moveTo(-0.0135, 0.099); win.lineTo(0.0135, 0.099); win.lineTo(0.0145, 0.124); win.quadraticCurveTo(0.014, 0.129, 0.007, 0.130); win.lineTo(-0.007, 0.130); win.quadraticCurveTo(-0.014, 0.129, -0.0145, 0.124); win.closePath();
  housing.holes.push(win);
  P.sight.push(front(housing, 0.070, 0.112, { bevel: 0.0012 }));
  P.sight.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.007, 12).translate(0, 0.138, -0.092));
  const merged = {}; for (const [k, list] of Object.entries(P)) if (list.length) merged[k] = mergeGeometries(list);
  merged.lens = new THREE.PlaneGeometry(0.028, 0.032).translate(0, sCY, -0.110);
  merged.reticle = new THREE.PlaneGeometry(0.011, 0.011).translate(0, sCY, -0.1108);
  return { merged, anchors: { muzzle: new THREE.Vector3(0, 0.042, -0.742), sight: new THREE.Vector3(0, sCY, -0.110), eject: new THREE.Vector3(0.026, 0.050, -0.125) } };
}

export function createAk47Model() {
  const { merged, anchors } = shared || (shared = buildGeometry());
  const t = getWeaponTextures(), n = getWeaponSurfaceMaps(), wd = getWoodMaps();
  const N = (m, k) => ({ normalMap: m, normalScale: new THREE.Vector2(k, k) });
  const mats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.75, roughness: 0.48, map: t.wear, roughnessMap: n.rough, ...N(n.metal, 0.3) }),   // blued / parkerised steel
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: wd.color, metalness: 0.0, roughness: 0.7, ...N(wd.normal, 0.6) }),
    grip: new THREE.MeshStandardMaterial({ color: 0x2a1610, metalness: 0.05, roughness: 0.55, ...N(n.polymer, 0.3) }),                                     // bakelite
    mag: new THREE.MeshStandardMaterial({ color: 0x3a1c10, metalness: 0.05, roughness: 0.5, map: t.wear, ...N(n.polymer, 0.2) }),                         // plum-brown polymer magazine
    black: new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.4, roughness: 0.55, map: t.wear, ...N(n.metal, 0.25) }),
    dark: new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.9, metalness: 0.2 }),
    lens: new THREE.MeshBasicMaterial({ color: 0x5fa0a8, transparent: true, opacity: 0.18, depthWrite: false }),
    reticle: new THREE.MeshBasicMaterial({ map: t.reticle, color: 0xff2a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
  };
  const group = new THREE.Group(); group.name = 'AK-47 MOD';
  const add = (geo, mat, parent = group, name = '') => { const m = new THREE.Mesh(geo, mat); m.name = name; parent.add(m); return m; };
  add(merged.steel, mats.steel, group, 'steel'); add(merged.dark, mats.dark, group, 'dark'); add(merged.wood, mats.wood, group, 'wood');
  add(merged.grip, mats.grip, group, 'grip'); add(merged.black, mats.black, group, 'mount'); add(merged.sight, mats.black, group, 'sight');
  const lens = add(merged.lens, mats.lens, group, 'lens'); lens.renderOrder = 2;
  const reticle = add(merged.reticle, mats.reticle, group, 'reticle'); reticle.renderOrder = 3;
  const mag = new THREE.Group(); mag.name = 'magazine'; group.add(mag);
  add(merged.mag, mats.mag, mag, 'mag-body'); add(merged.magRib, mats.steel, mag, 'mag-ribs');
  const charging = new THREE.Group(); charging.name = 'bolt-carrier'; group.add(charging);
  add(merged.charging, mats.steel, charging, 'charging');
  const anchorObj = {}; for (const [k, v] of Object.entries(anchors)) { const o = new THREE.Object3D(); o.name = 'anchor-' + k; o.position.copy(v); group.add(o); anchorObj[k] = o; }
  return {
    id: 'ak47', group, mats, anchors: anchorObj, parts: { mag, charging, reticle, lens },
    detailMats: ['steel', 'wood', 'grip', 'mag', 'black'],
    get skin() { return 'default'; }, setSkin() {}, // no skins for the AK in M2.0
    sharedGeometry: merged,
  };
}
