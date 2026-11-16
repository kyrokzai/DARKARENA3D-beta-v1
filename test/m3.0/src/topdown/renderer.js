// M3.0 TOPDOWN renderer: the OUTPOST ZERO level of M2.0 seen from a 55° follow camera. Walls are cut at CUT_H
// (clipping planes on the level materials only, dark caps on top) so the 3 m walls never hide the player; the sim
// (collision, bullets, line of sight) still uses the full-height walls. Reads the sim, never writes it.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';
import { computePixelRatio, getProfile, AutoResolution } from '../render/quality.js';
import { buildLevel } from '../render/level.js';
import { createImpacts } from '../render/effects/impacts.js';
import { createHero } from './hero.js';
import { createGlbInfectedView } from './infected-glb.js';

export const CAMERA = Object.freeze({ pitchDeg: 55, distance: 11, fov: 40, lead: 1.8, follow: 7 });
export const CUT_H = 1.5; // m: visible wall height in top-down

export function createTopdownRenderer({ container, world, models, getProfileId = () => 'balanced' }) {
  const prof = getProfile(getProfileId());
  const renderer = new THREE.WebGLRenderer({ antialias: prof.msaa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.localClippingEnabled = true;
  container.prepend(renderer.domElement);
  renderer.domElement.id = 'view';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e13);
  scene.fog = new THREE.Fog(0x0b0e13, 26, 60);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 120);

  // ---- level (shared M2.0 builder) + cutaway ----
  const level = buildLevel(scene, world);
  const cut = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_H)];
  level.group.traverse(o => {
    if (!o.isMesh || o.name === 'floor') return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.clippingPlanes = cut; m.needsUpdate = true; }
  });
  const solid = [...world.solidCells()];
  const caps = new THREE.InstancedMesh(new THREE.PlaneGeometry(S, S), new THREE.MeshBasicMaterial({ color: 0x1b222b }), solid.length);
  const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  solid.forEach((c, i) => caps.setMatrixAt(i, m4.makeTranslation((c.x + 0.5) * S, CUT_H, (c.y + 0.5) * S).multiply(rot)));
  caps.instanceMatrix.needsUpdate = true; caps.name = 'wall-caps'; scene.add(caps);
  // thin bright rim where a cut wall meets open floor (one merged line object = 1 draw call)
  const isSolid = new Set(solid.map(c => c.x + ',' + c.y)), seg = [], yR = CUT_H + 0.005;
  for (const c of solid) {
    const x0 = c.x * S, x1 = x0 + S, z0 = c.y * S, z1 = z0 + S;
    if (!isSolid.has(c.x + ',' + (c.y - 1))) seg.push(x0, yR, z0, x1, yR, z0);
    if (!isSolid.has(c.x + ',' + (c.y + 1))) seg.push(x0, yR, z1, x1, yR, z1);
    if (!isSolid.has((c.x - 1) + ',' + c.y)) seg.push(x0, yR, z0, x0, yR, z1);
    if (!isSolid.has((c.x + 1) + ',' + c.y)) seg.push(x1, yR, z0, x1, yR, z1);
  }
  const rimGeo = new THREE.BufferGeometry(); rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const rims = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({ color: 0x55657a })); rims.name = 'wall-rims';
  scene.add(rims);

  const impacts = createImpacts(scene);
  const hero = createHero(models.hero, scene);
  const infected = createGlbInfectedView(scene, models);

  // ---- aim indicator on the floor (helps on touch) ----
  const aimMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, depthWrite: false });
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3.2), aimMat);
  aimLine.rotation.x = -Math.PI / 2; aimLine.position.set(0, 0.03, 2.2);
  const aimPivot = new THREE.Group(); aimPivot.add(aimLine); scene.add(aimPivot);

  // ---- tracers (pooled line segments) + muzzle flash sprite ----
  const TR = 24, trPos = new Float32Array(TR * 6), trLife = new Float32Array(TR);
  const trGeo = new THREE.BufferGeometry(); trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
  const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 }));
  tracers.frustumCulled = false; scene.add(tracers);
  let trNext = 0;
  const fc = document.createElement('canvas'); fc.width = fc.height = 64;
  { const x = fc.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,170,70,0.75)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  const flashTex = new THREE.CanvasTexture(fc); flashTex.colorSpace = THREE.SRGBColorSpace;
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat); flash.scale.set(0.55, 0.55, 1); scene.add(flash);
  let flashT = 0;
  const mz = new THREE.Vector3();

  // ---- sizing ----
  const autoRes = new AutoResolution();
  let cssW = 0, cssH = 0, ratio = 1;
  function resize(force = false) {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    const r = computePixelRatio(w, h, devicePixelRatio || 1, getProfileId(), 1, autoRes.factor).ratio;
    if (!force && w === cssW && h === cssH && Math.abs(r - ratio) < 0.01) return;
    cssW = w; cssH = h; ratio = r;
    renderer.setPixelRatio(r); renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait phones see less width: back the camera off a little so the arena reads
    camera.fov = w < h ? CAMERA.fov * 1.25 : CAMERA.fov;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', () => resize());
  resize(true);

  const target = new THREE.Vector3(), camT = new THREE.Vector3(), lightPos = new THREE.Vector3();
  const pitch = CAMERA.pitchDeg * Math.PI / 180, off = new THREE.Vector3(0, Math.sin(pitch) * CAMERA.distance, Math.cos(pitch) * CAMERA.distance);
  let first = true;

  return {
    renderer, scene, camera, hero, infected, impacts, level,
    /** Frame: game = sim, alpha = interpolation, dt = render delta (0 while paused), view = { aimActive, alarm }. */
    render(game, alpha, dt, view = {}) {
      resize();
      const p = game.player;
      hero.update(p, alpha, dt);
      infected.update(game.enemies, dt, alpha);
      impacts.update(dt);
      // camera: follow with a small lead towards the aim
      const lead = view.aimActive ? CAMERA.lead : CAMERA.lead * 0.45;
      target.set(hero.root.position.x + Math.cos(p.yaw) * lead, 0, hero.root.position.z + Math.sin(p.yaw) * lead);
      if (first) { camT.copy(target); first = false; } else camT.lerp(target, 1 - Math.exp(-CAMERA.follow * Math.max(dt, 0)));
      camera.position.copy(camT).add(off); camera.lookAt(camT);
      lightPos.set(hero.root.position.x, 1.6, hero.root.position.z);
      if (view.alarm !== undefined) level.setAlarm(view.alarm);
      level.update(lightPos, dt, dt);
      // aim line
      aimPivot.position.set(hero.root.position.x, 0, hero.root.position.z); aimPivot.rotation.y = Math.PI / 2 - p.yaw;
      aimMat.opacity += ((view.aimActive && !p.dead ? 0.55 : 0) - aimMat.opacity) * Math.min(1, dt * 10);
      // tracers / flash fade
      let any = false;
      for (let i = 0; i < TR; i++) if (trLife[i] > 0) { trLife[i] -= dt; any = true; if (trLife[i] <= 0) for (let k = 0; k < 6; k++) trPos[i * 6 + k] = 0; }
      if (any) trGeo.attributes.position.needsUpdate = true;
      flashT = Math.max(0, flashT - dt); flashMat.opacity = flashT > 0 ? 0.9 : 0;
      if (flashT > 0) hero.muzzleWorld(flash.position);
      renderer.render(scene, camera);
      if (dt > 0 && autoRes.sample(dt, getProfile(getProfileId()).minAuto)) resize(true); // adaptive resolution (M1.8 guard)
    },
    /** Sim 'shot' event: tracer from the muzzle to the hit point (cells → metres). */
    onShot(e) {
      hero.muzzleWorld(mz);
      const h = e.hit && e.hit.point, i = trNext; trNext = (trNext + 1) % TR;
      const ex = h ? h.x * S : mz.x + e.dir.x * 30, ez = h ? h.y * S : mz.z + e.dir.y * 30, ey = h ? h.z * S : mz.y;
      trPos.set([mz.x, mz.y, mz.z, ex, ey, ez], i * 6); trLife[i] = 0.06; trGeo.attributes.position.needsUpdate = true;
    },
    onFire() { flashT = 0.05; },
    onImpact(ev) { impacts.impact({ ...ev, surface: ev.kind === 'wall' && ev.cell && level.isPropCell(ev.cell.x, ev.cell.y) ? 'metal' : 'concrete' }); },
    bloodSplat(x, y, size) { impacts.bloodSplat(x, y, size); },
    /** Screen point → sim ground point (cells) on the plane at the shot height (for mouse aiming). */
    screenToSim(clientX, clientY, heightM = 1.15) {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const pt = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -heightM), pt)) return null;
      return { x: pt.x / S, y: pt.z / S };
    },
    get pixelRatio() { return ratio; },
  };
}
