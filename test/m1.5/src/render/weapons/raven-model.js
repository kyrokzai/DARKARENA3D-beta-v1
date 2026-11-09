// DA-R1 RAVEN — procedural mid-poly model ("hybrid realism"), built from extruded side profiles with
// bevels, through-cut M-LOK slots, a skeleton stock, curved magazine, picatinny rail and a red-dot sight.
// Units: metres. Axes: barrel points to -Z, +Y up, +X = right side of the weapon.
// Profiles are drawn in (u, v): u = along the gun (towards the muzzle), v = up; origin = rear top of the grip area.
// Geometry is built once and shared; each instance gets its own material set so skins can differ.
import * as THREE from 'three';
import { mergeGeometries } from '../geometry-merge.js';
import { getWeaponTextures } from './weapon-textures.js';
import { SKINS, DEFAULT_SKIN } from './raven-skins.js';

// ---------------------------------------------------------------- profile helpers
function shapeFrom(cmds) {
  const s = new THREE.Shape();
  for (const c of cmds) {
    if (c[0] === 'M') s.moveTo(c[1], c[2]);
    else if (c[0] === 'L') s.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  return s;
}
function slot(u0, u1, v, h) { // rounded slot hole (M-LOK style)
  const p = new THREE.Path(), r = h / 2;
  p.moveTo(u0 + r, v - r); p.lineTo(u1 - r, v - r); p.absarc(u1 - r, v, r, -Math.PI / 2, Math.PI / 2, false);
  p.lineTo(u0 + r, v + r); p.absarc(u0 + r, v, r, Math.PI / 2, Math.PI * 1.5, false);
  return p;
}
function poly(pts) { const p = new THREE.Path(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) p.lineTo(q[0], q[1]); p.closePath(); return p; }

/** Extrude a side profile to `width` (centred on x = xOff) and orient it: u → -Z, v → +Y, depth → X. */
function side(shape, width, { x = 0, bevel = 0.0016, seg = 1, curve = 8 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9,
    bevelSegments: seg, curveSegments: curve,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}
/** Extrude a front profile (x, y) along the barrel axis from u0 to u1. */
function front(shape, u0, u1, { bevel = 0.0012 } = {}) {
  const L = u1 - u0;
  const g = new THREE.ExtrudeGeometry(shape, { depth: L - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -u1 + bevel);
  return g;
}
/** Cylinder along the barrel axis between u0 and u1 at height v (and x). */
function tube(r, u0, u1, v, { x = 0, seg = 20, r2 = r } = {}) {
  const g = new THREE.CylinderGeometry(r2, r, u1 - u0, seg, 1);
  g.rotateX(Math.PI / 2); // +Y → +Z (r2 at u0 side after rotation → +z; the -z end is u1)
  g.translate(x, v, -(u0 + u1) / 2);
  return g;
}
function box(w, h, l, x, v, uCenter, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, l);
  if (rotY) g.rotateY(rotY);
  g.translate(x, v, -uCenter);
  return g;
}

// ---------------------------------------------------------------- the model's parts
function buildGeometry() {
  const P = { body: [], polymer: [], grip: [], accent: [], steel: [], line: [], dark: [], mag: [], magAccent: [], magLine: [], charging: [], emblemL: [], emblemR: [], text: [] };

  // Upper receiver (with sloped rear and a raised forward-assist boss)
  P.body.push(side(shapeFrom([['M', -0.006, 0.034], ['L', 0.214, 0.034], ['L', 0.214, 0.074], ['L', 0.016, 0.074], ['L', -0.006, 0.066]]), 0.050, { bevel: 0.0022 }));
  P.body.push(tube(0.0085, 0.022, 0.040, 0.052, { x: 0.029, seg: 12 }).rotateY(0)); // forward-assist housing
  P.steel.push(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 12).rotateZ(Math.PI / 2).translate(0.036, 0.052, -0.03));
  // ejection port (dark recess) + brass deflector on the right side
  P.dark.push(box(0.003, 0.016, 0.07, 0.0262, 0.052, 0.112));
  P.body.push(box(0.010, 0.012, 0.016, 0.026, 0.067, 0.064));

  // Lower receiver with flared magazine well
  P.body.push(side(shapeFrom([
    ['M', -0.012, 0.035], ['L', 0.205, 0.035], ['L', 0.205, 0.000], ['L', 0.176, -0.010], ['L', 0.174, -0.074], ['L', 0.164, -0.080],
    ['L', 0.104, -0.080], ['L', 0.094, -0.072], ['L', 0.094, -0.024], ['L', 0.036, -0.024], ['L', 0.014, -0.030], ['L', -0.004, -0.024],
    ['Q', -0.018, -0.012, -0.016, 0.006], ['L', -0.012, 0.035]]), 0.046, { bevel: 0.002 }));
  // Bloodline-style angular panels on the magazine-well sides (accent slot)
  for (const sx of [-1, 1]) {
    P.accent.push(side(shapeFrom([['M', 0.106, -0.068], ['L', 0.166, -0.068], ['L', 0.168, -0.020], ['L', 0.150, -0.006], ['L', 0.112, -0.006], ['L', 0.106, -0.016]]), 0.003, { x: sx * 0.0245, bevel: 0.0006 }));
  }
  // Trigger guard (ring with a through-hole)
  const tg = shapeFrom([['M', 0.030, -0.022], ['L', 0.030, -0.056], ['Q', 0.032, -0.067, 0.046, -0.067], ['L', 0.094, -0.066], ['L', 0.096, -0.022]]);
  tg.holes.push(poly([[0.037, -0.025], [0.037, -0.054], [0.044, -0.060], [0.089, -0.059], [0.089, -0.025]]));
  P.body.push(side(tg, 0.012, { bevel: 0.0012 }));
  // Trigger
  P.steel.push(side(shapeFrom([['M', 0.058, -0.024], ['Q', 0.050, -0.040, 0.056, -0.052], ['L', 0.061, -0.051], ['Q', 0.057, -0.040, 0.064, -0.024]]), 0.006, { bevel: 0.0008 }));
  // Selector / mag release / bolt catch details
  P.steel.push(new THREE.CylinderGeometry(0.006, 0.006, 0.052, 12).rotateZ(Math.PI / 2).translate(0, 0.012, -0.012));
  P.steel.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.050, 10).rotateZ(Math.PI / 2).translate(0, -0.012, -0.088));
  P.body.push(box(0.004, 0.022, 0.010, -0.0245, 0.000, 0.088));

  // Pistol grip with finger grooves (polymer) + front-strap line
  P.grip.push(side(shapeFrom([
    ['M', 0.036, -0.024], ['L', 0.012, -0.030], ['L', -0.030, -0.124], ['Q', -0.030, -0.142, -0.012, -0.142], ['L', 0.016, -0.140],
    ['Q', 0.026, -0.128, 0.020, -0.114], ['Q', 0.032, -0.104, 0.026, -0.090], ['Q', 0.040, -0.078, 0.034, -0.064], ['L', 0.042, -0.040]]), 0.032, { bevel: 0.003, seg: 2 }));
  P.line.push(side(shapeFrom([['M', -0.014, -0.140], ['L', 0.014, -0.138], ['L', 0.014, -0.134], ['L', -0.012, -0.136]]), 0.034, { bevel: 0 }));

  // Handguard with through-cut M-LOK slots; inner barrel visible through them
  const hg = shapeFrom([['M', 0.214, 0.016], ['L', 0.500, 0.020], ['L', 0.508, 0.030], ['L', 0.508, 0.074], ['L', 0.214, 0.074]]);
  for (let u = 0.236; u < 0.48; u += 0.052) hg.holes.push(slot(u, u + 0.034, 0.033, 0.009));
  P.body.push(side(hg, 0.056, { bevel: 0.004, seg: 2 }));
  // Accent side panels (upper handguard, chevron front)
  for (const sx of [-1, 1]) {
    P.accent.push(side(shapeFrom([['M', 0.226, 0.045], ['L', 0.440, 0.045], ['L', 0.482, 0.058], ['L', 0.490, 0.071], ['L', 0.226, 0.071], ['L', 0.226, 0.060], ['L', 0.300, 0.060], ['L', 0.310, 0.052], ['L', 0.226, 0.052]]), 0.003, { x: sx * 0.0292, bevel: 0.0006 }));
    P.line.push(box(0.0022, 0.0024, 0.24, sx * 0.0293, 0.0205, 0.36)); // lower edge strip
    P.line.push(box(0.0022, 0.0018, 0.012, sx * 0.0293, 0.064, 0.497)); // front tip accent
  }
  // Top rail with recoil lugs (one extruded zig-zag profile)
  const railCmds = [['M', -0.002, 0.074]];
  for (let u = 0.004; u < 0.498; u += 0.0105) railCmds.push(['L', u, 0.080], ['L', u, 0.0875], ['L', u + 0.0058, 0.0875], ['L', u + 0.0058, 0.080]);
  railCmds.push(['L', 0.500, 0.080], ['L', 0.500, 0.074]);
  P.steel.push(side(shapeFrom(railCmds), 0.021, { bevel: 0.0008, curve: 1 }));
  P.body.push(side(shapeFrom([['M', -0.002, 0.0742], ['L', 0.500, 0.0742], ['L', 0.500, 0.0802], ['L', -0.002, 0.0802]]), 0.024, { bevel: 0.0006 }));

  // Barrel, gas block, muzzle brake (with dark ports)
  P.steel.push(tube(0.0095, 0.300, 0.662, 0.042, { seg: 18 }));
  P.steel.push(box(0.022, 0.018, 0.022, 0, 0.046, 0.524));
  P.steel.push(tube(0.0138, 0.656, 0.722, 0.042, { seg: 18 }));
  P.steel.push(tube(0.0145, 0.716, 0.724, 0.042, { seg: 18 }));
  for (const sx of [-1, 1]) for (const u of [0.672, 0.690, 0.706]) P.dark.push(box(0.004, 0.012, 0.007, sx * 0.0128, 0.046, u));
  // Folded flip sights
  P.steel.push(side(shapeFrom([['M', 0.470, 0.0875], ['L', 0.498, 0.0875], ['L', 0.498, 0.094], ['L', 0.478, 0.097]]), 0.016, { bevel: 0.0008 }));
  P.steel.push(side(shapeFrom([['M', 0.002, 0.0875], ['L', 0.028, 0.0875], ['L', 0.022, 0.099], ['L', 0.006, 0.099]]), 0.020, { bevel: 0.0008 }));

  // Buffer tube + skeleton stock with cut-out, butt pad and cheek riser
  P.steel.push(tube(0.0155, -0.272, -0.004, 0.046, { seg: 18 }));
  const st = shapeFrom([['M', -0.020, 0.068], ['L', -0.236, 0.076], ['L', -0.306, 0.086], ['L', -0.326, 0.078], ['L', -0.328, -0.072],
    ['L', -0.310, -0.080], ['L', -0.268, -0.052], ['L', -0.082, 0.012], ['L', -0.020, 0.022]]);
  st.holes.push(poly([[-0.294, 0.027], [-0.294, -0.050], [-0.150, 0.006], [-0.118, 0.022], [-0.122, 0.027]]));
  P.polymer.push(side(st, 0.040, { bevel: 0.003 }));
  P.accent.push(side(shapeFrom([['M', -0.326, 0.080], ['L', -0.342, 0.082], ['L', -0.342, -0.080], ['L', -0.326, -0.076]]), 0.046, { bevel: 0.0025 })); // butt pad
  P.steel.push(box(0.044, 0.010, 0.016, 0, 0.012, -0.060));  // stock adjustment lever
  for (const sx of [-1, 1]) {
    P.line.push(side(shapeFrom([['M', -0.299, 0.070], ['L', -0.304, 0.071], ['L', -0.304, -0.060], ['L', -0.299, -0.058]]), 0.002, { x: sx * 0.0205, bevel: 0 }));
    P.line.push(side(shapeFrom([['M', -0.130, 0.071], ['L', -0.290, 0.078], ['L', -0.290, 0.081], ['L', -0.130, 0.074]]), 0.002, { x: sx * 0.0205, bevel: 0 }));
    P.dark.push(box(0.002, 0.0025, 0.19, sx * 0.0252, 0.041, 0.112));   // upper receiver side groove
    P.dark.push(box(0.002, 0.0025, 0.16, sx * 0.0232, 0.030, 0.098));   // lower receiver parting line
  }
  P.steel.push(new THREE.CylinderGeometry(0.0042, 0.0042, 0.050, 10).rotateZ(Math.PI / 2).translate(0, 0.022, -0.004)); // takedown pins
  P.steel.push(new THREE.CylinderGeometry(0.0042, 0.0042, 0.050, 10).rotateZ(Math.PI / 2).translate(0, 0.022, -0.196));

  // Charging handle (moves during reload)
  P.charging.push(side(shapeFrom([['M', -0.022, 0.067], ['L', 0.012, 0.067], ['L', 0.012, 0.073], ['L', -0.022, 0.073]]), 0.020, { bevel: 0.001 }));
  P.charging.push(box(0.056, 0.007, 0.010, 0, 0.070, -0.018));

  // Magazine (curved, ribbed baseplate) — separate so it can drop out during reload
  P.mag.push(side(shapeFrom([['M', 0.098, -0.020], ['L', 0.168, -0.020], ['Q', 0.178, -0.120, 0.204, -0.204], ['L', 0.140, -0.214], ['Q', 0.112, -0.120, 0.098, -0.020]]), 0.026, { bevel: 0.0018 }));
  P.magAccent.push(side(shapeFrom([['M', 0.134, -0.212], ['L', 0.210, -0.200], ['L', 0.212, -0.214], ['L', 0.138, -0.228]]), 0.030, { bevel: 0.0018 }));
  for (const sx of [-1, 1]) {
    for (const v of [-0.070, -0.105, -0.140]) P.mag.push(side(shapeFrom([['M', 0.110 + (-v - 0.07) * 0.18, v], ['L', 0.168 + (-v - 0.07) * 0.25, v], ['L', 0.168 + (-v - 0.07) * 0.25, v - 0.004], ['L', 0.110 + (-v - 0.07) * 0.18, v - 0.004]]), 0.002, { x: sx * 0.0135, bevel: 0 }));
    P.magLine.push(box(0.002, 0.0025, 0.060, sx * 0.0153, -0.214, 0.174));
  }

  // Decal quads: raven logo (both sides of the lower), markings on the left of the upper
  const quad = (w, h) => new THREE.PlaneGeometry(w, h);
  P.emblemL.push(quad(0.048, 0.030).rotateY(-Math.PI / 2).translate(-0.0242, 0.008, -0.056));
  P.emblemR.push(quad(0.048, 0.030).rotateY(Math.PI / 2).translate(0.0242, 0.008, -0.056));
  P.text.push(quad(0.070, 0.0175).rotateY(-Math.PI / 2).translate(-0.0256, 0.052, -0.150));

  const merged = {};
  for (const [k, list] of Object.entries(P)) if (list.length) merged[k] = mergeGeometries(list);

  // Red-dot sight: mount, hooded housing (window cut through), lens. Front profile extruded along the barrel.
  const sightCX = 0, sightCY = 0.121;
  const housing = new THREE.Shape();
  housing.moveTo(-0.021, 0.093); housing.lineTo(0.021, 0.093); housing.lineTo(0.023, 0.137); housing.quadraticCurveTo(0.022, 0.148, 0.010, 0.150);
  housing.lineTo(-0.010, 0.150); housing.quadraticCurveTo(-0.022, 0.148, -0.023, 0.137); housing.closePath();
  const win = new THREE.Path(); win.moveTo(-0.0165, 0.103); win.lineTo(0.0165, 0.103); win.lineTo(0.0175, 0.134); win.quadraticCurveTo(0.017, 0.141, 0.009, 0.142);
  win.lineTo(-0.009, 0.142); win.quadraticCurveTo(-0.017, 0.141, -0.0175, 0.134); win.closePath();
  housing.holes.push(win);
  merged.sight = mergeGeometries([
    front(housing, 0.092, 0.142, { bevel: 0.0015 }),
    side(shapeFrom([['M', 0.084, 0.0875], ['L', 0.150, 0.0875], ['L', 0.146, 0.096], ['L', 0.088, 0.096]]), 0.032, { bevel: 0.0012 }),
    box(0.010, 0.010, 0.016, 0.026, 0.120, 0.118),                     // brightness knob
    new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 12).translate(0, 0.152, -0.118), // windage turret
  ]);
  merged.lens = new THREE.PlaneGeometry(0.034, 0.040).translate(sightCX, sightCY, -0.131);
  merged.reticle = new THREE.PlaneGeometry(0.013, 0.013).translate(sightCX, sightCY, -0.1318);

  return { merged, anchors: { muzzle: new THREE.Vector3(0, 0.042, -0.728), sight: new THREE.Vector3(sightCX, sightCY, -0.131), eject: new THREE.Vector3(0.028, 0.052, -0.112) } };
}

let shared = null; // geometry shared by all instances (viewer, viewmodel)
function geometry() { return shared || (shared = buildGeometry()); }

// ---------------------------------------------------------------- materials & skins
function makeMaterials() {
  const t = getWeaponTextures();
  const std = (extra = {}) => new THREE.MeshStandardMaterial({ map: t.wear, roughnessMap: t.rough, ...extra });
  return {
    body: std(), polymer: std(), grip: std(), accent: std(), steel: std(), line: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, metalness: 0.2 }),
    emblem: new THREE.MeshStandardMaterial({ map: t.logo, transparent: true, alphaTest: 0.35, roughness: 0.45, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }),
    text: new THREE.MeshStandardMaterial({ map: t.markings, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }),
    lens: new THREE.MeshBasicMaterial({ color: 0x5fa0a8, transparent: true, opacity: 0.18, depthWrite: false }),
    reticle: new THREE.MeshBasicMaterial({ map: t.reticle, color: 0xff2a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
  };
}
function applySkin(m, id) {
  const s = SKINS[id] || SKINS[DEFAULT_SKIN], t = getWeaponTextures();
  for (const k of ['body', 'polymer', 'grip', 'accent', 'steel']) {
    const p = s[k] || s.polymer;
    m[k].color.setHex(p.color); m[k].metalness = p.metalness; m[k].roughness = p.roughness;
  }
  const carbonMap = s.accent.carbon ? t.carbon : t.wear;
  if (m.accent.map !== carbonMap) { m.accent.map = carbonMap; m.accent.needsUpdate = true; }
  for (const k of ['line', 'emblem']) {
    m[k].color.setHex(s[k].color); m[k].emissive.setHex(s[k].emissive); m[k].emissiveIntensity = s[k].emissiveIntensity;
  }
  m.text.color.setHex(s.emblem.color); m.text.emissive.setHex(s.emblem.emissive); m.text.emissiveIntensity = s.emblem.emissiveIntensity * 0.6;
  m.reticle.color.setHex(s.reticle);
}

/** Create one RAVEN instance. Geometry is shared; materials are per instance. */
export function createRavenModel(skin = DEFAULT_SKIN) {
  const { merged, anchors } = geometry();
  const mats = makeMaterials();
  const group = new THREE.Group(); group.name = 'DA-R1 RAVEN';
  const add = (geo, mat, parent = group, name) => { const mesh = new THREE.Mesh(geo, mat); mesh.name = name || ''; parent.add(mesh); return mesh; };
  add(merged.body, mats.body, group, 'body');
  add(merged.polymer, mats.polymer, group, 'polymer');
  add(merged.grip, mats.grip, group, 'grip');
  add(merged.accent, mats.accent, group, 'accent');
  add(merged.steel, mats.steel, group, 'steel');
  add(merged.line, mats.line, group, 'line');
  add(merged.dark, mats.dark, group, 'dark');
  add(merged.sight, mats.body, group, 'sight');
  add(merged.emblemL, mats.emblem, group, 'emblem-L');
  add(merged.emblemR, mats.emblem, group, 'emblem-R');
  add(merged.text, mats.text, group, 'markings');
  const lens = add(merged.lens, mats.lens, group, 'lens'); lens.renderOrder = 2;
  const reticle = add(merged.reticle, mats.reticle, group, 'reticle'); reticle.renderOrder = 3;
  const mag = new THREE.Group(); mag.name = 'magazine'; group.add(mag);
  add(merged.mag, mats.polymer, mag, 'mag-body'); add(merged.magAccent, mats.accent, mag, 'mag-base'); add(merged.magLine, mats.line, mag, 'mag-line');
  const charging = new THREE.Group(); charging.name = 'charging-handle'; group.add(charging);
  add(merged.charging, mats.steel, charging, 'charging');
  const anchorObj = {};
  for (const [k, v] of Object.entries(anchors)) { const o = new THREE.Object3D(); o.name = 'anchor-' + k; o.position.copy(v); group.add(o); anchorObj[k] = o; }
  let current = skin;
  applySkin(mats, skin);
  return {
    group, mats, anchors: anchorObj, parts: { mag, charging, reticle, lens },
    get skin() { return current; },
    setSkin(id) { current = SKINS[id] ? id : DEFAULT_SKIN; applySkin(mats, current); },
    sharedGeometry: merged,
  };
}
