// First-person viewmodel: its own scene + camera rendered over the world (never clips into walls).
// Reads simulation state (ADS, reload progress, player motion) and weapon events (shots); never writes them.
// All motion uses springs integrated in fixed 1/240 s sub-steps → identical feel at 30 / 60 / 120 Hz.
import * as THREE from 'three';
import { createRavenModel } from './raven-model.js';
import { getStudioEnv } from './studio-env.js';
import { getWeaponTextures } from './weapon-textures.js';
import { PLAYER_SPEED } from '../../config.js';

const SUB = 1 / 240;
export const VM_FOV = 54;
// Poses (metres, relative to the viewmodel camera at the eye; -Z forward).
const HIP = { pos: new THREE.Vector3(0.165, -0.178, -0.375), rot: new THREE.Euler(0.012, -0.03, 0.0) };
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

  const model = createRavenModel(skin);
  const rig = new THREE.Group(); // pose + bob + sway + recoil
  rig.add(model.group);
  camera.add(rig);
  const ads = { pos: new THREE.Vector3(-model.anchors.sight.position.x, -model.anchors.sight.position.y, -ADS_EYE_DIST - model.anchors.sight.position.z), rot: new THREE.Euler(0, 0, 0) };

  // ---- muzzle flash (crossed quads + front sprite) and its light ----
  const tex = getWeaponTextures();
  const flashMat = new THREE.MeshBasicMaterial({ map: tex.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group(); flash.visible = false;
  const fq = new THREE.PlaneGeometry(0.16, 0.16);
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(fq, flashMat); m.rotation.set(0, Math.PI / 2, r); m.position.z = -0.05; m.scale.set(1.6, 1, 1); flash.add(m); }
  const front = new THREE.Mesh(fq, flashMat); front.scale.setScalar(0.85); flash.add(front);
  model.anchors.muzzle.add(flash);
  const flashLight = new THREE.PointLight(0xffb060, 0, 1.2, 2); model.anchors.muzzle.add(flashLight);

  // ---- smoke puffs (small pool, reused) ----
  const smokeMat = new THREE.SpriteMaterial({ map: tex.smoke, transparent: true, depthWrite: false, opacity: 0 });
  const smoke = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(smokeMat.clone()); s.visible = false; s.userData = { life: 0, v: new THREE.Vector3() }; scene.add(s); return s; });
  let smokeNext = 0;

  // ---- ejected casings (one InstancedMesh) ----
  const CASES = 10;
  const caseGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 8).rotateZ(Math.PI / 2);
  const casings = new THREE.InstancedMesh(caseGeo, new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.35 }), CASES);
  casings.frustumCulled = false; scene.add(casings);
  const caseState = Array.from({ length: CASES }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
  let caseNext = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < CASES; i++) { m4.compose(zero, q, new THREE.Vector3(0, 0, 0)); casings.setMatrixAt(i, m4); }

  // ---- springs: recoil (z, pitch, roll), sway (x, y, yaw), bob is analytic ----
  const sp = { kz: new Spring(150, 0.62), kp: new Spring(170, 0.6), kr: new Spring(140, 0.7), sx: new Spring(90, 0.85), sy: new Spring(90, 0.85), syaw: new Spring(90, 0.85) };
  let acc = 0, bobPhase = 0, bobAmp = 0, flashT = 0, lastYaw = null, lastPitch = null, sprayCount = 0;
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const stats = { shots: 0, flashes: 0, smokeEmitted: 0, casings: 0 };

  function onShot(ev) {
    const a = ev.ads || 0, k = 1 - a * 0.5;
    sp.kz.v += 1.05 * k;                                // kick back
    sp.kp.v += (5.5 + Math.random() * 1.5) * k;          // muzzle climb
    sp.kr.v += (Math.random() - 0.5) * 6 * k;            // small roll
    flashT = 0.05; flash.visible = true; stats.flashes++; stats.shots++;
    flash.rotation.z = Math.random() * Math.PI; flash.scale.setScalar(0.8 + Math.random() * 0.45);
    sprayCount++;
    // casing from the ejection port (in viewmodel-scene coordinates)
    const c = caseState[caseNext]; caseNext = (caseNext + 1) % CASES; stats.casings++;
    model.anchors.eject.getWorldPosition(c.p); scene.worldToLocal(c.p);
    c.v.set(0.9 + Math.random() * 0.4, 0.9 + Math.random() * 0.5, 0.25 + Math.random() * 0.2); c.life = 0.7;
    c.w.set(Math.random() * 20, Math.random() * 30, Math.random() * 10); c.r.set(0, 0, 0);
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
    // look delta → sway target (gun lags behind camera turns)
    let dYaw = 0, dPitch = 0;
    if (lastYaw !== null) { dYaw = Math.atan2(Math.sin(p.yaw - lastYaw), Math.cos(p.yaw - lastYaw)); dPitch = p.pitch - lastPitch; }
    lastYaw = p.yaw; lastPitch = p.pitch;
    const adsK = 1 - s.ads * 0.85;
    const swayX = THREE.MathUtils.clamp(-dYaw / Math.max(dt, 1e-3) * 0.0045, -0.025, 0.025) * adsK;
    const swayY = THREE.MathUtils.clamp(dPitch / Math.max(dt, 1e-3) * 0.004, -0.02, 0.02) * adsK;
    // walk bob from actual movement speed
    const speed = Math.min(1, Math.hypot(p.x - p.prevX, p.y - p.prevY) * 60 / PLAYER_SPEED);
    bobAmp += ((speed > 0.05 ? 1 : 0) - bobAmp) * Math.min(1, dt * 8);
    bobPhase += dt * (6.5 + speed * 3.5);
    acc += dt;
    while (acc >= SUB) {
      acc -= SUB;
      sp.kz.step(0, SUB); sp.kp.step(0, SUB); sp.kr.step(0, SUB);
      sp.sx.step(swayX, SUB); sp.sy.step(swayY, SUB); sp.syaw.step(swayX * 2.2, SUB);
    }
    // pose blend hip ↔ ADS (smoothstep of the sim's ADS factor)
    const a = smooth(s.ads);
    rig.position.lerpVectors(HIP.pos, ads.pos, a);
    rig.rotation.set(HIP.rot.x * (1 - a), HIP.rot.y * (1 - a), HIP.rot.z * (1 - a));
    const bob = bobAmp * (1 - a * 0.85);
    rig.position.x += Math.sin(bobPhase) * 0.006 * bob + sp.sx.x;
    rig.position.y += -Math.abs(Math.cos(bobPhase)) * 0.007 * bob + sp.sy.x;
    rig.rotation.y += sp.syaw.x * 1.5;
    rig.position.z += sp.kz.x * 0.06;
    rig.rotation.x += sp.kp.x * 0.012 * (1 - a * 0.4);
    rig.rotation.z += sp.kr.x * 0.01;
    // reload animation (driven by sim progress)
    const mag = model.parts.mag, ch = model.parts.charging;
    mag.position.set(0, 0, 0); mag.visible = true; ch.position.set(0, 0, 0);
    if (s.reload >= 0) {
      const r = s.reload;
      const tilt = smooth(seg(r, 0, 0.15)) * (1 - smooth(seg(r, 0.82, 1)));
      rig.rotation.z += tilt * 0.42; rig.rotation.x -= tilt * 0.12; rig.position.y -= tilt * 0.035; rig.position.x -= tilt * 0.02;
      const out = smooth(seg(r, 0.12, 0.34)), back = smooth(seg(r, 0.48, 0.66));
      mag.position.y = -0.28 * out * (1 - back); mag.position.z = 0.03 * out * (1 - back);
      mag.visible = !(r > 0.34 && r < 0.48);
      if (r > 0.66 && r < 0.72) mag.position.y += 0.006 * Math.sin((r - 0.66) / 0.06 * Math.PI); // seat bump
      const pull = smooth(seg(r, 0.74, 0.84)) * (1 - smooth(seg(r, 0.86, 0.9)));
      ch.position.z = 0.055 * pull;
    }
    // flash
    if (flashT > 0) { if (!api.holdFlash) flashT -= dt; flashLight.intensity = 6; if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; } }
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
    if (!s.triggerDown && sprayCount) onTriggerReleased();
    camera.aspect = s.aspect;
    camera.fov = VM_FOV * (1 - a * 0.12);
    camera.updateProjectionMatrix();
  }

  const api = {
    holdFlash: false, // test/screenshot aid (?debug=1): keep the muzzle flash on screen
    scene, camera, rig, model, stats, onShot, update,
    setSkin(id) { model.setSkin(id); },
    get skin() { return model.skin; },
    get flashVisible() { return flash.visible; },
    get smokeActive() { return smoke.filter(s => s.visible).length; },
    /** Project a model-space anchor to normalized screen coords (for tests: ADS alignment, framing). */
    projectAnchor(name) { const v = new THREE.Vector3(); model.anchors[name].getWorldPosition(v); return v.project(camera); },
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
  return api;
}
