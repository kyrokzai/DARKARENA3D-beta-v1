// M3.0 TOPDOWN renderer — M3.2: OUTPOST ZERO bio-lab (topdown/lab.js), graphics levels Низкое / Среднее / Высокое
// (topdown/graphics.js + render/quality.js), bloom, lab reflections, the hero holding the active weapon with the
// Kazakhstan patch, infected health bars, shell casings, and the menu / loadout views: the same scene seen by a
// cinematic camera (hero in front of the capsule bank) with a smooth flight to the 55° follow camera on PLAY.
// Walls are built at the top-down height CUT_H (the sim keeps full-height walls for collision / bullets / LOS).
// Reads the sim, never writes it.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';
import { computePixelRatio, getProfile, AutoResolution } from '../render/quality.js';
import { createLab, labEnvironment } from './lab.js';
import { tdGraphics } from './graphics.js';
import { createImpacts } from '../render/effects/impacts.js';
import { createHero, addShoulderPatch } from './hero.js';
import { createGlbInfectedView } from './infected-glb.js';
import { createPreviews } from './previews.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const CAMERA = Object.freeze({ pitchDeg: 55, distance: 11, fov: 40, lead: 1.8, follow: 7 });
export const CUT_H = 1.5; // m: visible wall height in top-down
export const SHOWCASE = Object.freeze({ distance: 3.4, height: 1.42, look: 1.2, menuShift: 1.05, loadoutShift: 1.75, fov: 38, flight: 1.15 });
const BAR = Object.freeze({ walker: [0.9, 2.05], brute: [1.15, 2.55], mutant: [1.2, 2.2] }); // health bar width / height (m)

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createTopdownRenderer({ container, world, models, lab: labAssets, getProfileId = () => 'balanced' }) {
  let profId = getProfileId(), prof = getProfile(profId), gfx = tdGraphics(profId);
  // MSAA lives on the default framebuffer (Среднее / Высокое; the context's antialias is fixed when it is created — a
  // switch to / from Низкое changes MSAA after a restart, everything else switches live) and in the bloom target (Высокое)
  const renderer = new THREE.WebGLRenderer({ antialias: prof.msaa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoft was removed; soft edges come from shadow.radius
  renderer.info.autoReset = false; // several passes per frame (bloom): reset once per frame, read the whole frame
  container.prepend(renderer.domElement);
  renderer.domElement.id = 'view';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.fog = new THREE.Fog(0x07090c, 24, 52);
  scene.environment = labEnvironment(renderer); scene.environmentIntensity = 0.7; // M3.2 lab reflections (PMREM, no HDR files)
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.3, 120);
  const gameCam = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.3, 120); // the follow camera's pose, also during a flight (mouse aim)

  // ---- OUTPOST ZERO bio-lab (M3.2) ----
  const level = createLab(scene, { world, models: labAssets.models, textures: labAssets.textures, profile: gfx });

  const impacts = createImpacts(scene);
  const hero = createHero(models.hero, scene);
  const patch = addShoulderPatch(hero.root, labAssets.textures.kz_patch);
  const infected = createGlbInfectedView(scene, models);
  hero.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const previews = createPreviews(renderer);

  // ---- graphics level: bloom chain + shadows, switchable at runtime (menu / settings) ----
  let composer = null, bloom = null;
  function buildComposer() {
    if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom && bloom.dispose(); composer = bloom = null; }
    if (!(gfx.bloom > 0)) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: prof.msaa ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), gfx.bloomStrength, gfx.bloomRadius, gfx.bloomThreshold);
    const setBloomSize = bloom.setSize.bind(bloom), k = gfx.bloomRes;
    bloom.setSize = (w, h) => setBloomSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))); // Среднее: half-res chain
    composer.addPass(bloom); composer.addPass(new OutputPass());
    composer.setPixelRatio(ratio); composer.setSize(cssW || 1, cssH || 1);
  }
  function applyShadows() {
    scene.environment = gfx.env ? labEnvironment(renderer) : null; // Низкое: no PMREM reflections
    const on = gfx.shadowMap > 0;
    if (renderer.shadowMap.enabled !== on) { renderer.shadowMap.enabled = on; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    level.setProfile(gfx);
  }

  // ---- aim indicator on the floor (helps on touch) + reticle ----
  const aimMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, depthWrite: false });
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 3.2), aimMat);
  aimLine.rotation.x = -Math.PI / 2; aimLine.position.set(0, 0.03, 2.2);
  const retMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ret = new THREE.Group();
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.28), retMat); const a = i * Math.PI / 2; t.position.set(Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32); t.rotation.set(-Math.PI / 2, 0, a); ret.add(t); }
  ret.position.set(0, 0.04, 4.4);
  const aimPivot = new THREE.Group(); aimPivot.add(aimLine, ret); scene.add(aimPivot);

  // ---- tracers (pooled line segments) + muzzle flash sprite + muzzle light glow ----
  const TR = 24, trPos = new Float32Array(TR * 6), trLife = new Float32Array(TR);
  const trGeo = new THREE.BufferGeometry(); trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
  const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 }));
  tracers.frustumCulled = false; scene.add(tracers);
  let trNext = 0;
  const fc = document.createElement('canvas'); fc.width = fc.height = 64;
  { const x = fc.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,170,70,0.75)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  const flashTex = new THREE.CanvasTexture(fc); flashTex.colorSpace = THREE.SRGBColorSpace;
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 1.8, 1.3) });
  const flash = new THREE.Sprite(flashMat); flash.scale.set(0.6, 0.6, 1); scene.add(flash);
  let flashT = 0;
  const mz = new THREE.Vector3(), ej = new THREE.Vector3();

  // ---- shell casings (one InstancedMesh, pooled; count scales with the graphics level) ----
  const CAS = 48;
  const casMat = new THREE.MeshStandardMaterial({ color: 0xc9a043, metalness: 1, roughness: 0.32 });
  const casings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6).rotateZ(Math.PI / 2), casMat, CAS);
  casings.frustumCulled = false; casings.count = 0; scene.add(casings);
  const cas = Array.from({ length: CAS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), t: 0, rest: false }));
  let casNext = 0, casLive = 0;
  const cm4 = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(1, 1, 1);
  function ejectCasing(yaw, shell = false) {
    if (Math.random() > gfx.particles + 0.15) return;
    hero.ejectWorld(ej);
    const c = cas[casNext]; casNext = (casNext + 1) % CAS; casLive = Math.min(CAS, casLive + 1);
    const rx = Math.cos(yaw + Math.PI / 2), rz = Math.sin(yaw + Math.PI / 2); // to the hero's right (screen space of the sim)
    const sp = 1.6 + Math.random(); c.p.copy(ej); c.v.set(rx * sp - Math.cos(yaw) * 0.3, 1.6 + Math.random() * 0.8, rz * sp - Math.sin(yaw) * 0.3);
    c.r.set(Math.random() * 6, Math.random() * 6, 0); c.w.set(10 + Math.random() * 10, 6 + Math.random() * 8, 0); c.t = 0; c.rest = false; c.shell = shell;
  }
  function stepCasings(dt) {
    let n = 0;
    for (let i = 0; i < casLive; i++) {
      const c = cas[i];
      if (c.t > 6) continue;
      c.t += dt;
      if (!c.rest) {
        c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt;
        if (c.p.y < 0.012) { c.p.y = 0.012; if (Math.abs(c.v.y) < 0.6) { c.rest = true; c.r.x = Math.PI / 2 * Math.round(c.r.x / (Math.PI / 2)) ; } else { c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6); } }
      }
      cq.setFromEuler(c.r); cs.setScalar(c.shell ? 1.7 : 1);
      casings.setMatrixAt(n++, cm4.compose(c.p, cq, cs));
    }
    casings.count = n; if (n) casings.instanceMatrix.needsUpdate = true;
  }

  // ---- infected health bars (two InstancedMeshes: back + fill), billboards facing the camera ----
  const MAXB = 16;
  const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0); // origin on the left edge → scale x = fraction
  const barBack = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false, toneMapped: false }), MAXB);
  const barFill = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), MAXB);
  for (const b of [barBack, barFill]) { b.frustumCulled = false; b.count = 0; b.renderOrder = 20; scene.add(b); }
  barFill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
  const bm = new THREE.Matrix4(), bp = new THREE.Vector3(), bs = new THREE.Vector3(), bx = new THREE.Vector3(), bcol = new THREE.Color();
  function updateBars(enemies, alpha, show) {
    let n = 0;
    if (show) for (const e of enemies) {
      if (!e.alive || n >= MAXB) continue;
      const [w, h] = BAR[e.type] || BAR.walker, k = Math.max(0, e.hp / (e.maxHp || 1));
      const x = (e.prevX + (e.x - e.prevX) * alpha) * S, z = (e.prevY + (e.y - e.prevY) * alpha) * S;
      bx.set(1, 0, 0).applyQuaternion(camera.quaternion);
      bp.set(x, h, z).addScaledVector(bx, -w / 2);
      bs.set(w, 0.085, 1); barBack.setMatrixAt(n, bm.compose(bp, camera.quaternion, bs));
      bs.set(w * k, 0.085, 1); bp.addScaledVector(bx, 0); barFill.setMatrixAt(n, bm.compose(bp, camera.quaternion, bs));
      barFill.setColorAt(n, bcol.setHex(e.type === 'mutant' ? 0xff3a1a : e.type === 'brute' ? 0xff7a1a : 0xff2a2a));
      n++;
    }
    barBack.count = barFill.count = n;
    if (n) { barBack.instanceMatrix.needsUpdate = barFill.instanceMatrix.needsUpdate = true; barFill.instanceColor.needsUpdate = true; }
  }

  // ---- sizing ----
  const autoRes = new AutoResolution();
  let cssW = 0, cssH = 0, ratio = 1;
  function resize(force = false) {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    const r = computePixelRatio(w, h, devicePixelRatio || 1, profId, 1, autoRes.factor).ratio;
    if (!force && w === cssW && h === cssH && Math.abs(r - ratio) < 0.01) return;
    cssW = w; cssH = h; ratio = r;
    renderer.setPixelRatio(r); renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(r); composer.setSize(w, h); }
  }
  addEventListener('resize', () => resize());
  resize(true); buildComposer(); applyShadows();

  // ---- cameras: game follow camera, showcase (menu / loadout) camera, flight between them ----
  const target = new THREE.Vector3(), camT = new THREE.Vector3(), lightPos = new THREE.Vector3();
  const pitch = CAMERA.pitchDeg * Math.PI / 180, off = new THREE.Vector3(0, Math.sin(pitch) * CAMERA.distance, Math.cos(pitch) * CAMERA.distance);
  const stage = level.showcaseSpot();  // metres: the menu stage in front of the capsule bank (the green backdrop)
  const gamePos = new THREE.Vector3(), gameLook = new THREE.Vector3(), showPos = new THREE.Vector3(), showLook = new THREE.Vector3();
  const fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3(), curLook = new THREE.Vector3();
  let mode = 'menu', flightT = 1, flightFrom = 'menu', fromFov = SHOWCASE.fov, first = true, showYaw = 0;
  function showcase(shift) {
    // the hero stands on the stage with the capsule bank behind him; the camera looks at the bank over his shoulder line
    const dx = stage.dx, dz = stage.dz, hx = stage.x, hz = stage.z;           // (dx, dz): from the hero towards the bank
    showPos.set(hx - dx * SHOWCASE.distance, SHOWCASE.height, hz - dz * SHOWCASE.distance);
    const rx = -dz, rz = dx; // screen right when looking along (dx, dz)
    showLook.set(hx + rx * shift + dx * 0.4, SHOWCASE.look, hz + rz * shift + dz * 0.4);
    showYaw = Math.atan2(-dz, -dx) + 0.38;   // hero turned towards the camera, a little to his left (3/4 view)
  }
  function setMode(next) {
    if (next === mode) return;
    fromPos.copy(camera.position); fromLook.copy(curLook); fromFov = camera.fov;
    flightFrom = mode; mode = next; flightT = 0;
  }

  let pvList = null, pvT = 0;
  const pvDim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uK; void main(){ float a = smoothstep(0.12, 0.27, vUv.x) * 0.86 * uK; gl_FragColor = vec4(0.02, 0.027, 0.04, a); }',
    uniforms: { uK: { value: 1 } } }));
  pvDim.frustumCulled = false;
  const dimScene = new THREE.Scene(); dimScene.add(pvDim); const dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const proxy = { x: 0, y: 0, prevX: 0, prevY: 0, yaw: 0, dead: false, dashT: 0, dashes: 0 };

  return {
    renderer, scene, camera, hero, infected, impacts, level, previews, patch,
    get composer() { return composer; }, get bloom() { return bloom; }, get gfx() { return gfx; }, get mode() { return mode; }, get flight() { return flightT; },
    setMode, debugCamera: null, // debugCamera: () => ({ pos, look, fov }) — ?debug=1 visual checks only
    /** Graphics level at runtime (menu / settings): resolution, MSAA, bloom, shadows, lab light balance. */
    setProfile(id) {
      if (id === profId) return;
      profId = id; prof = getProfile(id); gfx = tdGraphics(id);
      autoRes.reset(); resize(true); buildComposer(); applyShadows();
    },
    /** Loadout previews: fn() → [{ id, rect }] (CSS px) or null. */
    setPreviewSource(fn) { pvList = fn; },
    /**
     * Frame: game = sim, alpha = interpolation, dt = world delta (0 while paused / in menus), view = { aimActive,
     * alarm, uiDt (real frame delta: menu animation / camera flight) }.
     */
    render(game, alpha, dt, view = {}) {
      resize();
      renderer.info.reset();
      const uiDt = view.uiDt ?? dt, p = game.player, inGame = mode === 'game';
      const showing = !inGame || flightT < 1;
      // hero: sim player in game; in the menus the same position, turned to the showcase camera, animated by uiDt
      const ws = game.state.weapon, ars = game.state.arsenal;
      const heroView = { weapon: ws.id || 'raven', switching: ars.phase === 'holster' ? ars.progress : ars.phase === 'draw' ? 1 - ars.progress : 0 };
      if (!inGame || flightT < 1) showcase(mode === 'loadout' || flightFrom === 'loadout' ? SHOWCASE.loadoutShift : SHOWCASE.menuShift);
      if (!inGame) {
        // menus: the hero stands on the stage (not at the sim position); the switch to the game is hidden by a fade
        Object.assign(proxy, { x: stage.x / S, y: stage.z / S, prevX: stage.x / S, prevY: stage.z / S, yaw: showYaw, dead: false, dashT: 0, dashes: p.dashes || 0 });
        hero.update(proxy, 1, uiDt, heroView);
      } else hero.update(p, alpha, Math.max(dt, flightT < 1 ? uiDt : 0), heroView);
      infected.update(game.enemies, dt, alpha);
      impacts.update(dt);
      stepCasings(dt);
      // game camera: follow with a small lead towards the aim
      const lead = view.aimActive ? CAMERA.lead : CAMERA.lead * 0.45;
      target.set(hero.root.position.x + Math.cos(p.yaw) * lead, 0, hero.root.position.z + Math.sin(p.yaw) * lead);
      if (first || showing) camT.copy(target); else camT.lerp(target, 1 - Math.exp(-CAMERA.follow * Math.max(dt, 0)));
      first = false;
      gamePos.copy(camT).add(off); gameLook.copy(camT);
      const portrait = cssW < cssH, gameFov = portrait ? CAMERA.fov * 1.25 : CAMERA.fov;
      gameCam.position.copy(gamePos); gameCam.fov = gameFov; gameCam.aspect = cssW / cssH; gameCam.updateProjectionMatrix(); gameCam.lookAt(gameLook); gameCam.updateMatrixWorld();
      if (flightT < 1) flightT = Math.min(1, flightT + uiDt / SHOWCASE.flight);
      const k = ease(flightT);
      const toPos = inGame ? gamePos : showPos, toLook = inGame ? gameLook : showLook, toFov = inGame ? gameFov : SHOWCASE.fov;
      camera.position.lerpVectors(fromPos, toPos, k); curLook.lerpVectors(fromLook, toLook, k);
      camera.fov = fromFov + (toFov - fromFov) * k;
      camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
      camera.lookAt(curLook);
      if (this.debugCamera) { const d = this.debugCamera(); camera.position.copy(d.pos); camera.fov = d.fov || camera.fov; camera.updateProjectionMatrix(); camera.lookAt(d.look); }
      lightPos.set(inGame ? camT.x : stage.x, 0, inGame ? camT.z : stage.z);
      if (view.alarm !== undefined) level.setAlarm(view.alarm);
      level.update(lightPos, Math.max(dt, uiDt));
      if (!inGame) { const kl = level.keyLight; kl.position.set(showPos.x + (showPos.x - stage.x) * 0.6 - stage.dz * 3, 6, showPos.z + (showPos.z - stage.z) * 0.6 + stage.dx * 3); kl.target.position.set(stage.x, 1, stage.z); }
      updateBars(game.enemies, alpha, inGame && flightT >= 1);
      // aim line + reticle
      aimPivot.position.set(hero.root.position.x, 0, hero.root.position.z); aimPivot.rotation.y = Math.PI / 2 - p.yaw;
      const aimOn = inGame && view.aimActive && !p.dead ? 1 : 0;
      aimMat.opacity += (aimOn * 0.5 - aimMat.opacity) * Math.min(1, Math.max(dt, uiDt) * 10);
      retMat.opacity = aimMat.opacity * 1.6;
      // tracers / flash fade
      let any = false;
      for (let i = 0; i < TR; i++) if (trLife[i] > 0) { trLife[i] -= dt; any = true; if (trLife[i] <= 0) for (let q = 0; q < 6; q++) trPos[i * 6 + q] = 0; }
      if (any) trGeo.attributes.position.needsUpdate = true;
      flashT = Math.max(0, flashT - dt); flashMat.opacity = flashT > 0 ? 0.95 : 0;
      if (flashT > 0) hero.muzzleWorld(flash.position);
      if (bloom) bloom.strength = gfx.bloomStrength * (inGame ? 1 : 0.4 + 0.6 * (flightT < 1 && inGame ? flightT : 0)); // menus: the capsules fill the frame → softer glow
      if (composer) composer.render(dt); else renderer.render(scene, camera);
      // loadout: darken the right side (behind the cards), then the live weapon previews in the card windows
      if (mode === 'loadout' && pvList) {
        const list = pvList();
        if (list && list.length) {
          pvT += uiDt; pvDim.material.uniforms.uK.value = Math.min(1, flightT * 1.5);
          renderer.autoClear = false; renderer.render(dimScene, dimCam); renderer.autoClear = true;
          previews.renderInto(list.map((it, i) => ({ ...it, yaw: Math.sin(pvT * 0.6 + i * 1.7) * 0.32 })), cssH);
        }
      }
      if (dt > 0 && inGame && autoRes.sample(dt, prof.minAuto)) resize(true); // adaptive resolution (M1.8 guard)
    },
    /** Sim 'shot' event: tracer from the muzzle to the hit point (cells → metres). */
    onShot(e) {
      hero.muzzleWorld(mz);
      const h = e.hit && e.hit.point, i = trNext; trNext = (trNext + 1) % TR;
      const ex = h ? h.x * S : mz.x + e.dir.x * 30, ez = h ? h.y * S : mz.z + e.dir.y * 30, ey = h ? h.z * S : mz.y;
      trPos.set([mz.x, mz.y, mz.z, ex, ey, ez], i * 6); trLife[i] = 0.06; trGeo.attributes.position.needsUpdate = true;
    },
    /** Sim 'fire' event (one per trigger pull): flash + a casing for magazine guns (KRAIT ejects on the pump). */
    onFire(e, yaw) { flashT = 0.05; if (!e || e.weapon !== 'krait') ejectCasing(yaw); },
    onPump(yaw) { ejectCasing(yaw, true); },
    onImpact(ev) { impacts.impact({ ...ev, surface: ev.kind === 'wall' && ev.cell && level.isPropCell(ev.cell.x, ev.cell.y) ? 'metal' : 'concrete' }); },
    bloodSplat(x, y, size) { impacts.bloodSplat(x, y, size); },
    /** Operator portrait from the hero in the lab (data URL), for the profile cards. */
    avatar(size = 128) {
      hero.root.updateMatrixWorld(true);
      const head = new THREE.Vector3(); (hero.bones.Head || hero.root).getWorldPosition(head);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.root.quaternion);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
      cam.position.copy(head).addScaledVector(fwd, 0.85).add(new THREE.Vector3(0, 0.02, 0)); cam.lookAt(head.x, head.y - 0.08, head.z);
      const prevBars = barBack.visible; barBack.visible = barFill.visible = false;
      const url = previews.snapshot(scene, cam, size, size);
      barBack.visible = barFill.visible = prevBars;
      return url;
    },
    /** Screen point → sim ground point (cells) on the plane at the shot height (for mouse aiming). */
    screenToSim(clientX, clientY, heightM = 1.15) {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, mode === 'game' ? gameCam : camera); // aim against the game camera, not a flight pose
      const pt = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -heightM), pt)) return null;
      return { x: pt.x / S, y: pt.z / S };
    },
    get pixelRatio() { return ratio; },
    contextMsaa: !!prof.msaa,
    get profileId() { return profId; },
  };
}
