// M3.0 TOPDOWN — the player's character: owner-supplied rigged model + the existing DA-R1 RAVEN mesh.
// Reads the simulation (position, facing, dash, death); never writes it. Legs come from the clips; the arms are
// placed on the rifle by a small two-bone IK every frame (the clips have no rifle pose).
// M3.2: lower / upper body split — the legs (root) turn towards the movement (or its opposite when backpedalling) and
// the spine twists back to the aim (≤ TWIST_MAX, spread over Spine / Spine1 / Spine2); the gun sits on an aim pivot,
// so it always points along the sim yaw. Strafing no longer slides the feet sideways; the step cycle follows the speed.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';
import { createRavenModel } from '../render/weapons/raven-model.js';
import { createAk47Model } from '../render/weapons/ak47-model.js';
import { createKraitModel } from '../render/weapons/krait-model.js';
import { createBlob } from './models.js';

const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3();
const EL = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), WQ = new THREE.Quaternion(), PQ = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
export const TWIST_MAX = 75 * Math.PI / 180;   // upper-body twist limit (rad)
const UPV = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(), TQ = new THREE.Quaternion(), PWQ = new THREE.Quaternion();
/** Rotates `bone` by `angle` about the WORLD up axis (keeps the clip pose, adds a twist). */
function twistBone(bone, angle) {
  bone.parent.getWorldQuaternion(PWQ); AX.copy(UPV).applyQuaternion(PWQ.invert());
  TQ.setFromAxisAngle(AX, angle); bone.quaternion.premultiply(TQ); bone.updateMatrixWorld(true);
}

/** Rotate `bone` (world space) so that the point `childWorld` moves onto the ray towards `desiredWorld`. */
function aimBone(bone, childWorld, desiredWorld) {
  bone.getWorldPosition(A);
  U.copy(childWorld).sub(A).normalize(); V.copy(desiredWorld).sub(A).normalize();
  Q.setFromUnitVectors(U, V);
  bone.getWorldQuaternion(WQ); Q.multiply(WQ);
  bone.parent.getWorldQuaternion(PQ).invert();
  bone.quaternion.copy(PQ.multiply(Q));
  bone.updateMatrixWorld(true);
}
// M3.2: Kazakhstan flag shoulder patch (own vector drawing: assets/models/hero/kz_patch.svg → kz_patch.webp, baked by
// scripts/bake-patch.js). Projected in the BIND POSE onto the outer side of the right upper arm and applied inside the
// hero's own material (onBeforeCompile): it deforms with the skin, costs 0 extra draw calls and one texture sample.
// along = position along the upper arm (0 shoulder joint … 1 elbow); size in metres (flag 2:1 + border); depth = how far
// the projection box reaches through the sleeve (normal test keeps the inner side of the arm clean).
export const PATCH = Object.freeze({ bone: 'RightArm', child: 'RightForeArm', along: 0.1, width: 0.13, height: 0.07, depth: 0.2, minFacing: 0.25, spin: 0, flip: false });
const PV = () => new THREE.Vector3();
/** Adds the patch to the hero's skinned material(s). Returns the decal frame (for tests / tuning) or null. */
export function addShoulderPatch(model, tex, cfg = PATCH) {
  const meshes = []; model.updateMatrixWorld(true); model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length || !tex) return null;
  const sk = meshes[0].skeleton, ia = sk.bones.findIndex(b => b.name === cfg.bone), ib = sk.bones.findIndex(b => b.name === cfg.child);
  if (ia < 0 || ib < 0) return null;
  // bind-pose joint positions (world at bind time) = inverse(boneInverse)
  const pa = PV().setFromMatrixPosition(sk.boneInverses[ia].clone().invert()), pb = PV().setFromMatrixPosition(sk.boneInverses[ib].clone().invert());
  const axis = pb.clone().sub(pa), len = axis.length(); axis.normalize();
  // outward: the side that faces away from the body once the arm hangs down — in a T / A bind pose that is the side
  // facing up (+Y ⊥ axis); fallback for an arms-down bind pose: the character's right (−X, the model faces +Z)
  const outward = new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y);
  if (outward.length() < 0.3) outward.set(-1, 0, 0).addScaledVector(axis, axis.x);
  outward.normalize();
  const up = axis.clone().negate();                                 // patch top towards the shoulder
  const right = new THREE.Vector3().crossVectors(up, outward).normalize();
  if (cfg.flip) right.negate();
  if (cfg.spin) { right.applyAxisAngle(outward, cfg.spin); up.applyAxisAngle(outward, cfg.spin); }
  const centre = pa.clone().addScaledVector(axis, len * cfg.along);
  const frame = new THREE.Matrix4().makeBasis(right.clone().multiplyScalar(cfg.width), up.clone().multiplyScalar(cfg.height), outward.clone().multiplyScalar(cfg.depth));
  frame.setPosition(centre.clone().addScaledVector(outward, cfg.depth * 0.5));  // box from the bone axis outwards
  const inv = frame.clone().invert();
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const done = new Set();
  for (const mesh of meshes) {
    const mat = mesh.material; if (done.has(mat)) continue; done.add(mat);
    const toPatch = inv.clone().multiply(mesh.bindMatrix);                         // mesh-local bind position → patch box
    const nLocal = outward.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(mesh.bindMatrix).invert()).normalize();
    mat.onBeforeCompile = sh => {
      sh.uniforms.uPatchMap = { value: tex }; sh.uniforms.uPatchM = { value: toPatch }; sh.uniforms.uPatchN = { value: nLocal }; sh.uniforms.uPatchMin = { value: cfg.minFacing };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uPatchM; uniform vec3 uPatchN; varying vec3 vPatch; varying float vPatchF;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPatch = (uPatchM * vec4(position, 1.0)).xyz; vPatchF = dot(normalize(normal), uPatchN);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPatchMap; uniform float uPatchMin; varying vec3 vPatch; varying float vPatchF;')
        .replace('#include <map_fragment>', `#include <map_fragment>
float patchA = 0.0;
if (max(abs(vPatch.x), abs(vPatch.y)) < 0.5 && vPatch.z > -0.5 && vPatch.z < 0.5 && vPatchF > uPatchMin) {
  vec4 pc = texture2D(uPatchMap, vPatch.xy + 0.5); patchA = pc.a * smoothstep(uPatchMin, uPatchMin + 0.15, vPatchF);
  diffuseColor.rgb = mix(diffuseColor.rgb, pc.rgb, patchA);
}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.82, patchA);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, patchA);');
    };
    mat.customProgramCacheKey = () => 'da-kz-patch';
    mat.needsUpdate = true;
  }
  return { centre, axis, outward, right, up, len, frame };
}

/** Two-bone IK: upper → lower → hand reaches `target`; the elbow bends towards `pole` (world points). */
function solveArm(upper, lower, hand, target, pole) {
  upper.getWorldPosition(B); lower.getWorldPosition(C); hand.getWorldPosition(D);
  const l1 = B.distanceTo(C), l2 = C.distanceTo(D);
  const d = clamp(B.distanceTo(target), 0.05, l1 + l2 - 0.002);
  const dir = E.copy(target).sub(B).normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const side = U.copy(pole).sub(B); side.addScaledVector(dir, -side.dot(dir)); if (side.lengthSq() < 1e-6) side.set(0, -1, 0); side.normalize();
  EL.copy(B).addScaledVector(dir, cosA * l1).addScaledVector(side, sinA * l1); // aimBone reuses A/U/V/Q, not EL
  aimBone(upper, C, EL);
  hand.getWorldPosition(D);
  aimBone(lower, D, target);
}

export function createHero(gltf, scene) {
  const root = new THREE.Group(); root.name = 'hero';
  const model = gltf.scene; root.add(model);
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(model), act = {};
  for (const [name, clip] of Object.entries(gltf.clips)) act[name] = mixer.clipAction(clip);
  act.DodgeRoll.setLoop(THREE.LoopOnce, 1); act.DodgeRoll.clampWhenFinished = true;
  act.Death.setLoop(THREE.LoopOnce, 1); act.Death.clampWhenFinished = true;

  // M3.2: the gun in the hands is the ACTIVE weapon of the arsenal (RAVEN / AK-47 MOD / KRAIT, the M2.0 models).
  // Barrel along the character's forward (+Z); right hand on the grip, left hand under the handguard / on the pump
  // (support points from the M2.0 proxy volumes in hand-poses.js). During a switch the gun dips (holster → draw).
  const GUNS = {
    raven: { make: createRavenModel, fore: [0, -0.03, -0.33] },
    ak47: { make: createAk47Model, fore: [0, -0.015, -0.39] },
    krait: { make: createKraitModel, fore: [0, -0.02, -0.35] },
  };
  const aimPivot = new THREE.Group(); aimPivot.name = 'aim-pivot'; root.add(aimPivot);   // turns with the upper body
  const mount = new THREE.Group(); mount.position.set(-0.14, 1.27, 0.16); aimPivot.add(mount);
  const guns = {};
  for (const [id, g] of Object.entries(GUNS)) {
    const m = g.make(); m.group.rotation.y = Math.PI; m.group.visible = id === 'raven'; mount.add(m.group);
    const grip = new THREE.Object3D(); grip.position.set(0, -0.07, 0.03); m.group.add(grip);      // rifle frame (barrel −Z)
    const fore = new THREE.Object3D(); fore.position.set(...g.fore); m.group.add(fore);
    const muzzle = new THREE.Object3D(); muzzle.position.copy(m.anchors.muzzle.position); m.group.add(muzzle);
    const eject = new THREE.Object3D(); eject.position.copy((m.anchors.eject || m.anchors.muzzle).position); m.group.add(eject);
    guns[id] = { model: m, grip, fore, muzzle, eject };
  }
  let gun = guns.raven, gunId = 'raven';
  const rifle = guns.raven.model;
  function setWeapon(id) { if (!guns[id] || id === gunId) return; gun.model.group.visible = false; gun = guns[id]; gunId = id; gun.model.group.visible = true; }
  const poleR = new THREE.Object3D(); poleR.position.set(-0.55, 0.85, -0.15); aimPivot.add(poleR);    // elbows down and out
  const poleL = new THREE.Object3D(); poleL.position.set(0.5, 0.8, 0.15); aimPivot.add(poleL);
  root.add(createBlob(0.55));
  scene.add(root);

  let current = null, lastDash = 0, dead = false, prevX = null, prevZ = null, speed = 0, legsYaw = null, twist = 0, vx = 0, vz = 0;
  const spine = ['Spine', 'Spine1', 'Spine2'].map(n => bones[n]).filter(Boolean);
  function play(name, fade = 0.18) {
    const a = act[name]; if (current === a) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(1);
    if (current) a.crossFadeFrom(current, fade, false);
    a.play(); current = a; return a;
  }
  play('Idle', 0);
  const tP = new THREE.Vector3(), tG = new THREE.Vector3(), tF = new THREE.Vector3(), tPo = new THREE.Vector3();

  return {
    root, rifle, bones,
    /** p = sim player, alpha = interpolation, dt = render delta (0 while paused). */
    /** view = { weapon: active weapon id, switching: 0..1 dip of a weapon change } (renderer, from GameState). */
    update(p, alpha, dt, view = {}) {
      if (view.weapon) setWeapon(view.weapon);
      const dip = view.switching || 0; mount.rotation.x = dip * 0.9; mount.position.y = 1.27 - dip * 0.12;
      const x = (p.prevX + (p.x - p.prevX) * alpha) * S, z = (p.prevY + (p.y - p.prevY) * alpha) * S;
      root.position.set(x, 0, z);
      if (dt > 0 && prevX !== null) { const k = Math.min(1, dt * 12); vx += ((x - prevX) / dt - vx) * k; vz += ((z - prevZ) / dt - vz) * k; speed = Math.hypot(vx, vz); }
      prevX = x; prevZ = z;
      const dashing = p.dashT > 0, aim = p.yaw;
      // lower body: face the movement (or its opposite when moving against the aim); turn in place past the limit
      let back = false;
      if (legsYaw === null || p.dead) legsYaw = aim;
      let want = legsYaw;
      if (dashing) want = Math.atan2(p.dashY || Math.sin(aim), p.dashX || Math.cos(aim));
      else if (speed > 0.5) {
        const mv = Math.atan2(vz, vx); back = Math.abs(wrapA(mv - aim)) > 1.75; // > 100°: backpedal, legs face away from the move
        want = back ? mv + Math.PI : mv;
      } else if (Math.abs(wrapA(aim - legsYaw)) > TWIST_MAX * 0.8) want = aim; // standing: step round when the twist gets large
      if (dt > 0) legsYaw += wrapA(want - legsYaw) * Math.min(1, dt * (dashing ? 18 : 9));
      twist = clamp(wrapA(aim - legsYaw), -TWIST_MAX, TWIST_MAX);
      legsYaw = aim - twist;                            // the legs never lag further than the twist limit
      root.rotation.y = Math.PI / 2 - legsYaw;          // model faces +Z; sim yaw points along (cos, sin) in (x, z)
      aimPivot.rotation.y = -twist;
      if (p.dead) {
        if (!dead) { dead = true; const a = play('Death', 0.2); a.time = 2.5; }
      } else {
        if (dead) { dead = false; play('Idle', 0); }
        if (dashing) {
          if ((p.dashes || 0) !== lastDash) { lastDash = p.dashes; const a = play('DodgeRoll', 0.06); a.reset(); a.timeScale = 2.6; a.play(); }
        } else if (speed > 0.5) {
          // the step cycle follows the real speed (no foot sliding); backpedalling plays it in reverse
          const run = speed > 3.0 && !back, a = play(run ? 'Run' : 'Walk', 0.2);
          a.timeScale = (back ? -1 : 1) * (run ? clamp(speed / 3.6, 0.8, 1.5) : clamp(speed / 1.9, 0.6, 1.6));
        } else play('Idle', 0.25);
      }
      mixer.update(dt);
      const armed = !p.dead && !dashing;
      mount.visible = !p.dead;
      root.updateMatrixWorld(true);
      if (!p.dead && !dashing && spine.length && Math.abs(twist) > 1e-3) for (const b of spine) twistBone(b, -twist / spine.length); // upper body back to the aim (same turn as aimPivot)
      if (armed && bones.RightArm && bones.LeftArm) {
        gun.grip.getWorldPosition(tG); poleR.getWorldPosition(tPo);
        solveArm(bones.RightArm, bones.RightForeArm, bones.RightHand, tP.copy(tG), tPo);
        gun.fore.getWorldPosition(tF); poleL.getWorldPosition(tPo);
        solveArm(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, tP.copy(tF), tPo);
      }
    },
    muzzleWorld(out) { return gun.muzzle.getWorldPosition(out); },
    ejectWorld(out) { return gun.eject.getWorldPosition(out); },
    get weapon() { return gunId; },
    setSkin(id) { guns.raven.model.setSkin(id); },
    mount, guns,
    get clip() { return current ? current.getClip().name : null; },
    reset() { dead = false; lastDash = 0; speed = 0; vx = vz = 0; legsYaw = null; twist = 0; prevX = prevZ = null; mixer.stopAllAction(); current = null; play('Idle', 0); },
    get twist() { return twist; }, get legsYaw() { return legsYaw; },
  };
}
