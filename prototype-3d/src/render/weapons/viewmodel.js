// First-person viewmodel: its own scene + camera rendered over the world (never clips into walls).
// Reads simulation state (ADS, reload progress, player motion) and weapon events (shots); never writes them.
// All motion uses springs integrated in fixed 1/240 s sub-steps → identical feel at 30 / 60 / 120 Hz.
import * as THREE from 'three';
import { createRavenModel } from './raven-model.js';
import { createAk47Model } from './ak47-model.js';
import { createKraitModel, PUMP_TRAVEL } from './krait-model.js';
import { getAkPoses, getKraitPoses } from './hand-poses.js';
import { WEAPONS } from '../../sim/weapons/defs.js';
import { getStudioEnv } from './studio-env.js';
import { getWeaponTextures } from './weapon-textures.js';
import { PLAYER_SPEED } from '../../config.js';
import { createHands } from './hands-model.js';
import { createHandsController, createShotgunController } from './hands-controller.js';
import { reloadTimeline, meleeTimeline } from './weapon-anim.js';

const SUB = 1 / 240;
export const VM_FOV = 64;
// Poses (metres, relative to the viewmodel camera at the eye; -Z forward).
const HIP = { pos: new THREE.Vector3(0.150, -0.136, -0.318), rot: new THREE.Euler(0.03, 0.05, -0.04) };
const ADS_EYE_DIST = 0.235; // reticle distance from the eye in ADS

/** Critically-damped-ish spring on a scalar; frame-rate independent via fixed sub-steps. */
export class Spring {
  constructor(k = 160, zeta = 0.72) { this.x = 0; this.v = 0; this.k = k; this.c = 2 * Math.sqrt(k) * zeta; }
  step(target, h) { const a = this.k * (target - this.x) - this.c * this.v; this.v += a * h; this.x += this.v * h; }
}

const smooth = t => t * t * (3 - 2 * t);
const seg = (p, a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));

export function createViewmodel({ renderer, skin }) {
  const scene = new THREE.Scene();
  scene.environment = getStudioEnv(renderer);
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(VM_FOV, 1, 0.01, 6);
  scene.add(camera);
  // Lighting tuned for the dark arena: cool sky fill, soft key from upper-left, red rim from the arena lamps.
  scene.add(new THREE.HemisphereLight(0xaab6d0, 0x1c1416, 0.9));
  const key = new THREE.DirectionalLight(0xfff1e6, 2.2); key.position.set(-0.6, 1.0, 0.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff5a6a, 0.45); rim.position.set(0.8, 0.4, -1.0); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xa8b8ff, 0.6); fill.position.set(0.9, -0.2, 0.6); scene.add(fill);

  const rig = new THREE.Group(); // pose + bob + sway + recoil
  camera.add(rig);
  // ---- hands (M1.4): children of the weapon model → they inherit pose, bob, sway, recoil and ADS ----
  const hands = createHands();
  // ---- M2.0 weapon kits: one model + hands controller per weapon (created on first use), the same hands rig moves
  // between them while the weapon is down (switch animation). Feel per weapon: recoil / flash scale, casing type.
  const kits = {};
  let kit = null, model = null, ctl = null;
  function makeKit(reqId) {
    if (kits[reqId]) return kits[reqId];
    // review fix: resolve through the weapon definition's `viewmodel` key and cache under the requested id too, so an
    // unknown / aliased id never rebuilds a model every frame
    const def = WEAPONS[reqId], id = (def && def.viewmodel) || reqId;
    if (kits[id]) return (kits[reqId] = kits[id]);
    let k;
    if (id === 'ak47') { const m = createAk47Model(); k = { id, model: m, ctl: createHandsController(m, hands, { poses: getAkPoses(), chargeTravel: 0.075, dropSide: 0.6, dropBack: 0.3, dropSpeed: 2.2, dropHide: 0.43 }), kind: 'rifle', chargeTravel: 0.075, dropSide: 0.6, dropBack: 0.3, dropSpeed: 2.2, dropHide: 0.43, recoil: 1.35, flash: 1.2, casing: 'brass', light: 7 }; }
    else if (id === 'krait') { const m = createKraitModel(); k = { id, model: m, ctl: createShotgunController(m, hands, getKraitPoses(), WEAPONS.krait, PUMP_TRAVEL), kind: 'shotgun', recoil: 2.2, flash: 1.7, casing: 'shell', light: 10 }; }
    else { const m = createRavenModel(skin); k = { id: 'raven', model: m, ctl: createHandsController(m, hands), kind: 'rifle', chargeTravel: 0.055, recoil: 1, flash: 1, casing: 'brass', light: 6 }; }
    const sp = k.model.anchors.sight.position;
    k.ads = new THREE.Vector3(-sp.x, -sp.y, -ADS_EYE_DIST - sp.z);
    k.detail = (k.model.detailMats || ['body', 'polymer', 'grip', 'accent', 'steel']).map(n => k.model.mats[n]);
    k.def = WEAPONS[k.id];
    kits[k.id] = k; kits[reqId] = k;
    if (!surfaceDetail) applySurfaceDetail();
    return k;
  }
  function attach(id) {
    const k = makeKit(id);
    if (kit === k) return;
    if (kit) rig.remove(kit.model.group);
    shellPending = false; // review fix: a shell waiting for the pump never ejects from the next weapon
    kit = k; model = k.model; ctl = k.ctl;
    rig.add(model.group); model.group.add(hands.group);
    model.anchors.muzzle.add(flash); model.anchors.muzzle.add(flashLight);
    ads.pos.copy(k.ads);
    stats.kit = k.id; stats.attaches++;
  }
  // Elbows are fixed relative to the camera (shoulders), so forearms swing naturally with recoil/reload.
  const ELBOW = { right: new THREE.Vector3(0.30, -0.46, 0.12), left: new THREE.Vector3(-0.34, -0.40, -0.16) };
  const elbowM = { right: new THREE.Vector3(), left: new THREE.Vector3() };
  const invModel = new THREE.Matrix4();
  let triggerPullT = 0, breathT = 0, landT = 0, lastLandings = null;
  const ads = { pos: new THREE.Vector3(), rot: new THREE.Euler(0, 0, 0) };

  // ---- muzzle flash (crossed quads + front sprite) and its light ----
  const tex = getWeaponTextures();
  const flashMat = new THREE.MeshBasicMaterial({ map: tex.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group(); flash.visible = false;
  const fq = new THREE.PlaneGeometry(0.16, 0.16);
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(fq, flashMat); m.rotation.set(0, Math.PI / 2, r); m.position.z = -0.05; m.scale.set(1.6, 1, 1); flash.add(m); }
  const front = new THREE.Mesh(fq, flashMat); front.scale.setScalar(0.85); flash.add(front);
  const flashLight = new THREE.PointLight(0xffb060, 0, 1.2, 2);

  // ---- smoke puffs (small pool, reused) ----
  const smokeMat = new THREE.SpriteMaterial({ map: tex.smoke, transparent: true, depthWrite: false, opacity: 0 });
  const smoke = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(smokeMat.clone()); s.visible = false; s.userData = { life: 0, v: new THREE.Vector3() }; scene.add(s); return s; });
  let smokeNext = 0;

  // ---- ejected casings: brass (rifles, on the shot) + 12-gauge shells (KRAIT, when the pump is racked back) ----
  const CASES = 10, SHELLS = 6;
  const caseGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 8).rotateZ(Math.PI / 2);
  const casings = new THREE.InstancedMesh(caseGeo, new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.35 }), CASES);
  casings.frustumCulled = false; scene.add(casings);
  const shellGeo = new THREE.CylinderGeometry(0.0102, 0.0102, 0.066, 10).rotateZ(Math.PI / 2);
  const shells = new THREE.InstancedMesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0x8a1418, metalness: 0.05, roughness: 0.5 }), SHELLS);
  shells.frustumCulled = false; scene.add(shells);
  const caseState = Array.from({ length: CASES }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
  const shellState = Array.from({ length: SHELLS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
  let caseNext = 0, shellNext = 0, shellPending = false;
  const svBuf = { cycle: 1, shellPhase: null, shellT: 0, shellPump: false };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < CASES; i++) { m4.compose(zero, q, new THREE.Vector3(0, 0, 0)); casings.setMatrixAt(i, m4); }
  for (let i = 0; i < SHELLS; i++) { m4.compose(zero, q, new THREE.Vector3(0, 0, 0)); shells.setMatrixAt(i, m4); }
  function eject(list, idx, speed = 1) {
    const c = list[idx];
    model.anchors.eject.getWorldPosition(c.p); scene.worldToLocal(c.p);
    c.v.set((0.9 + Math.random() * 0.4) * speed, (0.9 + Math.random() * 0.5) * speed, 0.25 + Math.random() * 0.2); c.life = speed > 1 ? 0.9 : 0.7;
    c.w.set(Math.random() * 20, Math.random() * 30, Math.random() * 10); c.r.set(0, 0, 0);
  }

  // ---- springs: recoil (z, pitch, roll), sway (x, y, yaw), bob is analytic ----
  const sp = { kz: new Spring(150, 0.62), kp: new Spring(170, 0.6), kr: new Spring(140, 0.7), sx: new Spring(90, 0.85), sy: new Spring(90, 0.85), syaw: new Spring(90, 0.85) };
  const impact = new Spring(220, 0.55); let meleePhase = 'none'; // M1.9 melee impact jolt
  let acc = 0, bobPhase = 0, bobAmp = 0, flashT = 0, lastYaw = null, lastPitch = null, sprayCount = 0;
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const stats = { shots: 0, flashes: 0, smokeEmitted: 0, casings: 0, shellsEjected: 0, meleeImpacts: 0, kit: '', attaches: 0 };

  function onShot(ev) {
    const w = (ev.weapon && kits[ev.weapon]) || kit, a = ev.ads || 0, k = (1 - a * 0.5) * w.recoil;
    sp.kz.v += 1.05 * k;                                // kick back (KRAIT ≈ 2×, AK-47 ≈ 1.35×)
    sp.kp.v += (5.5 + Math.random() * 1.5) * k;          // muzzle climb
    sp.kr.v += (Math.random() - 0.5) * 6 * k;            // small roll
    flashT = w.kind === 'shotgun' ? 0.07 : 0.05; flash.visible = true; stats.flashes++; stats.shots++; triggerPullT = 0.07;
    flash.rotation.z = Math.random() * Math.PI; flash.scale.setScalar((0.8 + Math.random() * 0.45) * w.flash); flashLight.userData.peak = w.light;
    sprayCount += w.kind === 'shotgun' ? 4 : 1;
    // rifles throw the case at the shot; the shotgun when the pump goes back (see update)
    if (w.casing === 'brass') { eject(caseState, caseNext); caseNext = (caseNext + 1) % CASES; stats.casings++; }
    else shellPending = true;
  }
  function emitSmoke(n) {
    model.anchors.muzzle.getWorldPosition(tmpV); scene.worldToLocal(tmpV);
    for (let i = 0; i < n; i++) {
      const s = smoke[smokeNext]; smokeNext = (smokeNext + 1) % smoke.length;
      s.position.copy(tmpV).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, i * 0.01, (Math.random() - 0.5) * 0.02));
      s.userData.life = 1.3 + Math.random() * 0.4; s.userData.max = s.userData.life;
      s.userData.v.set((Math.random() - 0.5) * 0.03, 0.05 + Math.random() * 0.04, -0.02);
      s.visible = true; s.scale.setScalar(0.05); stats.smokeEmitted++;
    }
  }
  function onTriggerReleased() { if (sprayCount >= 4) emitSmoke(Math.min(5, 2 + (sprayCount >> 2))); sprayCount = 0; }

  /** Per rendered frame. s = { ads, reload (0..1 or -1), player, dt, aspect, triggerDown } */
  function update(s) {
    const dt = Math.min(0.1, s.dt), p = s.player;
    attach(api.forceWeapon || s.weaponId || (kit ? kit.id : 'raven')); // M2.0: the weapon in the sim's hands (swapped while it is down)
    // look delta → sway target (gun lags behind camera turns)
    let dYaw = 0, dPitch = 0;
    if (lastYaw !== null) { dYaw = Math.atan2(Math.sin(p.yaw - lastYaw), Math.cos(p.yaw - lastYaw)); dPitch = p.pitch - lastPitch; }
    lastYaw = p.yaw; lastPitch = p.pitch;
    const adsK = 1 - s.ads * 0.85;
    const swayX = THREE.MathUtils.clamp(-dYaw / Math.max(dt, 1e-3) * 0.0045, -0.025, 0.025) * adsK;
    const swayY = THREE.MathUtils.clamp(dPitch / Math.max(dt, 1e-3) * 0.004, -0.02, 0.02) * adsK;
    // walk bob from actual movement speed
    const speed = Math.min(1, Math.hypot(p.x - p.prevX, p.y - p.prevY) * 60 / PLAYER_SPEED);
    bobAmp += ((speed > 0.05 && p.onGround !== false ? 1 : 0) - bobAmp) * Math.min(1, dt * 8); // no step bob in the air
    bobPhase += dt * (6.5 + speed * 3.5);
    acc += dt;
    while (acc >= SUB) {
      acc -= SUB;
      sp.kz.step(0, SUB); sp.kp.step(0, SUB); sp.kr.step(0, SUB); impact.step(0, SUB);
      sp.sx.step(swayX, SUB); sp.sy.step(swayY, SUB); sp.syaw.step(swayX * 2.2, SUB);
    }
    // pose blend hip ↔ ADS (smoothstep of the sim's ADS factor)
    const a = smooth(s.ads);
    rig.position.lerpVectors(HIP.pos, ads.pos, a);
    rig.rotation.set(HIP.rot.x * (1 - a), HIP.rot.y * (1 - a), HIP.rot.z * (1 - a));
    const bob = bobAmp * (1 - a * 0.85);
    rig.position.x += Math.sin(bobPhase) * 0.006 * bob + sp.sx.x;
    rig.position.y += -Math.abs(Math.cos(bobPhase)) * 0.007 * bob + sp.sy.x;
    // jump (M1.4.1): the weapon lags behind vertical speed and dips briefly on landing
    if (p.landings !== undefined && p.landings !== lastLandings) { if (lastLandings !== null) landT = 0.2; lastLandings = p.landings; }
    rig.position.y += THREE.MathUtils.clamp(-(p.vz || 0) * 0.003, -0.009, 0.009) * (1 - s.ads * 0.7);
    if (landT > 0) { landT = Math.max(0, landT - dt); rig.position.y -= Math.sin((1 - landT / 0.2) * Math.PI) * 0.011 * (1 - s.ads * 0.7); }
    rig.rotation.y += sp.syaw.x * 1.5;
    rig.position.z += sp.kz.x * 0.06;
    rig.rotation.x += sp.kp.x * 0.012 * (1 - a * 0.4);
    rig.rotation.z += sp.kr.x * 0.01;
    // idle breathing (very small; reduced in ADS)
    breathT += dt;
    const br = 1 - a * 0.7;
    rig.position.y += Math.sin(breathT * 1.55) * 0.0016 * br;
    rig.rotation.x += Math.sin(breathT * 1.55 + 0.9) * 0.0022 * br;
    // reload: ONE timeline per weapon kind (weapon-anim.js) for weapon tilt, magazines / pump, charging handle, left hand
    const rr = api.forceReload ?? s.reload;
    const sv = svBuf; // reused every frame (review: no per-frame allocation)
    if (api.forceShell) { sv.cycle = 1; sv.shellPhase = null; sv.shellT = 0; sv.shellPump = false; Object.assign(sv, api.forceShell); }
    else { sv.cycle = api.forceCycle ?? s.cycle ?? 1; sv.shellPhase = s.shellPhase; sv.shellT = s.shellT; sv.shellPump = s.shellPump; }
    const tl = kit.kind === 'shotgun' ? ctl.timeline(sv) : reloadTimeline(rr, { chargeTravel: kit.chargeTravel, dropSide: kit.dropSide ?? 0.15, dropBack: kit.dropBack ?? 0, dropSpeed: kit.dropSpeed ?? 0.6, dropHide: kit.dropHide ?? 0.5 });
    rig.rotation.x += tl.rig.rx; rig.rotation.y += tl.rig.ry; rig.rotation.z += tl.rig.rz;
    rig.position.x += tl.rig.px; rig.position.y += tl.rig.py; rig.position.z += tl.rig.pz;
    // M1.9 rifle-butt strike (weapon-anim.js meleeTimeline, driven by the sim's GameState.melee.progress)
    const mp = api.forceMelee ?? s.melee ?? -1;
    const ml = meleeTimeline(mp); meleePhase = ml.phase;
    rig.rotation.x += ml.rx; rig.rotation.y += ml.ry; rig.rotation.z += ml.rz;
    rig.position.x += ml.px; rig.position.y += ml.py; rig.position.z += ml.pz;
    // impact jolt (spring, from onMeleeImpact): the rifle stops short and recoils back a little
    rig.position.z += impact.x * 0.05; rig.rotation.z += impact.x * 0.06;
    // M2.0 weapon change: the gun drops and rolls away (holster), the new one comes up (draw) — from GameState.arsenal
    const swP = api.forceSwitch ?? (s.switchPhase === 'holster' ? s.switchProgress : s.switchPhase === 'draw' ? 1 - s.switchProgress : 0);
    if (swP > 0) { const k = smooth(Math.min(1, swP)); rig.position.y -= 0.26 * k; rig.position.x += 0.04 * k; rig.rotation.x -= 0.65 * k; rig.rotation.z += 0.35 * k; }
    switchK = swP;
    // weapon parts + hands from the same timeline (hands-controller.js)
    camera.updateMatrixWorld(true);
    invModel.copy(model.group.matrixWorld).invert();
    elbowM.right.copy(ELBOW.right).applyMatrix4(invModel); elbowM.left.copy(ELBOW.left).applyMatrix4(invModel);
    const pull = Math.max(0, triggerPullT / 0.07); // sampled before decay so even a slow frame shows the squeeze
    if (triggerPullT > 0) triggerPullT -= dt;
    ctl.apply(kit.kind === 'shotgun' ? sv : rr, pull, elbowM);
    // KRAIT: the spent shell leaves the port when the pump reaches the back
    if (shellPending && kit.kind === 'shotgun' && sv.cycle * (60 / kit.def.rpm) >= kit.def.pump.back) { shellPending = false; eject(shellState, shellNext, 1.15); shellNext = (shellNext + 1) % SHELLS; stats.shellsEjected++; }
    // flash
    if (flashT > 0) { if (!api.holdFlash) flashT -= dt; flashLight.intensity = flashLight.userData.peak || 6; if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; } }
    // smoke
    for (const sm of smoke) {
      if (!sm.visible) continue;
      const u = sm.userData; u.life -= dt;
      if (u.life <= 0) { sm.visible = false; continue; }
      const t = 1 - u.life / u.max;
      sm.position.addScaledVector(u.v, dt);
      sm.scale.setScalar(0.05 + t * 0.16);
      sm.material.opacity = 0.32 * Math.sin(Math.min(1, t * 1.4) * Math.PI) * (1 - t * 0.3);
    }
    // casings
    for (let i = 0; i < CASES; i++) {
      const c = caseState[i];
      if (c.life <= 0) continue;
      c.life -= dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      m4.compose(c.p, tmpQ.setFromEuler(c.r), c.life > 0 ? one : zero);
      casings.setMatrixAt(i, m4);
    }
    casings.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < SHELLS; i++) {
      const c = shellState[i];
      if (c.life <= 0) continue;
      c.life -= dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      m4.compose(c.p, tmpQ.setFromEuler(c.r), c.life > 0 ? one : zero);
      shells.setMatrixAt(i, m4);
    }
    shells.instanceMatrix.needsUpdate = true;
    if (!s.triggerDown && sprayCount) onTriggerReleased();
    camera.aspect = s.aspect;
    camera.fov = VM_FOV * (1 - a * 0.12);
    camera.updateProjectionMatrix();
  }

  // M1.9: per-pixel relief (normal maps) of the hands and the rifle follows the graphics profile — measured ≈ +10 % frame
  // time at equal resolution in software WebGL, so PERFORMANCE drops it (like the environment bump maps since M1.8).
  // Geometry, colours, two-tone glove and roughness stay in every profile.
  let surfaceDetail = true, switchK = 0;
  const detailMats = () => [...Object.values(hands.mats), ...Object.values(kits).flatMap(k => k.detail)];
  function applySurfaceDetail() {
    for (const m of detailMats()) {
      if (m.normalMap) m.userData.nmFull = m.normalMap;        // remember the full relief (the skin may have changed it)
      const want = surfaceDetail ? m.userData.nmFull || null : null;
      if (m.normalMap !== want) { m.normalMap = want; m.needsUpdate = true; }
    }
  }
  const api = {
    holdFlash: false, // test/screenshot aid (?debug=1): keep the muzzle flash on screen
    forceReload: null, // test/screenshot aid (?debug=1): show the reload animation frozen at this progress
    forceMelee: null,  // test/screenshot aid (?debug=1): show the melee strike frozen at this progress (0..1)
    forceWeapon: null, forceShell: null, forceCycle: null, forceSwitch: null, // M2.0 screenshot / test aids (?debug=1)
    /** M2.0: the weapon on screen and the kits built so far. */
    get weaponId() { return kit ? kit.id : null; },
    get kitIds() { return Object.keys(kits); },
    get switchK() { return switchK; },
    kitOf(id) { return makeKit(id); },
    /** M1.9: the blow connected — short jolt of the rifle (render only). */
    onMeleeImpact(killed) { impact.v += killed ? 7 : 5.5; stats.meleeImpacts++; },
    get meleePhase() { return meleePhase; },
    hands,
    get spareMag() { return ctl.spareMag || null; },
    /** Current blended hand poses (model space) — for tests. */
    get handPoses() { return { right: ctl.rightPose, left: ctl.leftPose, offsets: ctl.offsets }; },
    dispose() {
      hands.dispose();
      // weapon geometry is shared by every RAVEN instance (viewer, viewmodel) and is NOT disposed here
      casings.geometry.dispose(); casings.material.dispose(); casings.dispose(); shells.geometry.dispose(); shells.material.dispose(); shells.dispose();
      flashMat.dispose(); fq.dispose(); for (const sm of smoke) sm.material.dispose(); smokeMat.dispose();
      for (const k of Object.values(kits)) for (const m of Object.values(k.model.mats)) m.dispose();
      scene.clear();
    },
    scene, camera, rig, stats, onShot, update,
    get model() { return model; },
    setSkin(id) { makeKit('raven').model.setSkin(id); for (const m of detailMats()) if (m.normalMap) m.userData.nmFull = m.normalMap; if (!surfaceDetail) applySurfaceDetail(); },
    /** Graphics profile: relief maps on (BALANCED / QUALITY) or off (PERFORMANCE). */
    setSurfaceDetail(on) { surfaceDetail = !!on; applySurfaceDetail(); },
    get surfaceDetail() { return surfaceDetail; },
    get skin() { return makeKit('raven').model.skin; },
    get flashVisible() { return flash.visible; },
    get smokeActive() { return smoke.filter(s => s.visible).length; },
    /** Project a model-space anchor to normalized screen coords (for tests: ADS alignment, framing). */
    projectAnchor(name) { const v = new THREE.Vector3(); model.anchors[name].getWorldPosition(v); return v.project(camera); },
    /** Projected points of the hands (finger joints, palm centres) — for tests (ADS reticle clearance, framing). */
    handScreenPoints() {
      const out = [], v = new THREE.Vector3();
      camera.updateMatrixWorld(); model.group.updateMatrixWorld(true);
      for (const side of ['right', 'left']) {
        for (const f of Object.values(hands.tips[side])) for (const p of f) { v.copy(p).applyMatrix4(model.group.matrixWorld); if (v.z < -camera.near) out.push({ side, ...v.clone().project(camera) }); }
        v.copy(hands.palmCenter[side]).applyMatrix4(model.group.matrixWorld); if (v.z < -camera.near) out.push({ side, ...v.clone().project(camera) });
      }
      return out;
    },
    /** Projected sample of the model's real vertices that are in front of the eye (tests: framing). */
    screenBounds() {
      const pts = [], v = new THREE.Vector3();
      camera.updateMatrixWorld(); model.group.updateMatrixWorld(true);
      model.group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible || o === flash || flash.children.includes(o)) return;
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 5) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (v.z < -camera.near) pts.push(v.clone().project(camera));
        }
      });
      return pts.filter(p => p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1);
    },
  };
  attach('raven'); makeKit('ak47'); makeKit('krait'); // all three built at load (no hitch on the first switch)
  return api;
}
