// M3.0 TOPDOWN — the player's character: owner-supplied rigged model + the existing DA-R1 RAVEN mesh.
// Reads the simulation (position, facing, dash, death); never writes it. Legs come from the clips; the arms are
// placed on the rifle by a small two-bone IK every frame (the clips have no rifle pose).
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';
import { createRavenModel } from '../render/weapons/raven-model.js';
import { createBlob } from './models.js';

const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3();
const EL = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), WQ = new THREE.Quaternion(), PQ = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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

  // RAVEN: barrel along the character's forward (+Z); right hand on the grip, left hand under the handguard.
  const rifle = createRavenModel();
  rifle.group.rotation.y = Math.PI;
  const mount = new THREE.Group(); mount.position.set(-0.14, 1.27, 0.16); mount.add(rifle.group); root.add(mount);
  const grip = new THREE.Object3D(); grip.position.set(0, -0.07, 0.03); rifle.group.add(grip);   // rifle frame (barrel −Z)
  const fore = new THREE.Object3D(); fore.position.set(0, -0.03, -0.33); rifle.group.add(fore);
  const muzzle = new THREE.Object3D(); muzzle.position.copy(rifle.anchors.muzzle.position); rifle.group.add(muzzle);
  const poleR = new THREE.Object3D(); poleR.position.set(-0.55, 0.85, -0.15); root.add(poleR);    // elbows down and out
  const poleL = new THREE.Object3D(); poleL.position.set(0.5, 0.8, 0.15); root.add(poleL);
  root.add(createBlob(0.55));
  scene.add(root);

  let current = null, lastDash = 0, dead = false, prevX = null, prevZ = null, speed = 0;
  function play(name, fade = 0.18) {
    const a = act[name]; if (current === a) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setEffectiveTimeScale(1);
    if (current) a.crossFadeFrom(current, fade, false);
    a.play(); current = a; return a;
  }
  play('Idle', 0);
  const tP = new THREE.Vector3(), tG = new THREE.Vector3(), tF = new THREE.Vector3(), tPo = new THREE.Vector3();

  return {
    root, rifle, bones, muzzle,
    /** p = sim player, alpha = interpolation, dt = render delta (0 while paused). */
    update(p, alpha, dt) {
      const x = (p.prevX + (p.x - p.prevX) * alpha) * S, z = (p.prevY + (p.y - p.prevY) * alpha) * S;
      root.position.set(x, 0, z);
      root.rotation.y = Math.PI / 2 - p.yaw;            // model faces +Z; sim yaw points along (cos, sin) in (x, z)
      if (dt > 0 && prevX !== null) speed += (Math.hypot(x - prevX, z - prevZ) / dt - speed) * Math.min(1, dt * 12);
      prevX = x; prevZ = z;
      const dashing = p.dashT > 0;
      if (p.dead) {
        if (!dead) { dead = true; const a = play('Death', 0.2); a.time = 2.5; }
      } else {
        if (dead) { dead = false; play('Idle', 0); }
        if (dashing) {
          if ((p.dashes || 0) !== lastDash) { lastDash = p.dashes; const a = play('DodgeRoll', 0.06); a.reset(); a.timeScale = 2.6; a.play(); }
        } else if (speed > 0.5) {
          // walking backwards (relative to the aim) plays the step cycle in reverse
          const mvx = p.x - p.prevX, mvy = p.y - p.prevY, back = mvx * Math.cos(p.yaw) + mvy * Math.sin(p.yaw) < -0.002;
          const run = speed > 3.0 && !back, a = play(run ? 'Run' : 'Walk', 0.2);
          a.timeScale = (back ? -1 : 1) * (run ? clamp(speed / 3.6, 0.8, 1.5) : clamp(speed / 1.9, 0.6, 1.6));
        } else play('Idle', 0.25);
      }
      mixer.update(dt);
      const armed = !p.dead && !dashing;
      mount.visible = !p.dead;
      root.updateMatrixWorld(true);
      if (armed && bones.RightArm && bones.LeftArm) {
        grip.getWorldPosition(tG); poleR.getWorldPosition(tPo);
        solveArm(bones.RightArm, bones.RightForeArm, bones.RightHand, tP.copy(tG), tPo);
        fore.getWorldPosition(tF); poleL.getWorldPosition(tPo);
        solveArm(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, tP.copy(tF), tPo);
      }
    },
    muzzleWorld(out) { return muzzle.getWorldPosition(out); },
    get clip() { return current ? current.getClip().name : null; },
    reset() { dead = false; lastDash = 0; speed = 0; prevX = prevZ = null; mixer.stopAllAction(); current = null; play('Idle', 0); },
  };
}
