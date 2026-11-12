// Applies the reload timeline + hand poses to a RAVEN model instance (weapon parts and hands).
// Shared by the in-game viewmodel and the developer viewer, so both always show the same animation.
import * as THREE from 'three';
import { POSES, blendPoses, makePoseBuffer } from './hand-poses.js';
import { reloadTimeline, kraitTimeline } from './weapon-anim.js';

/** Magazine-fed rifles (RAVEN, AK-47): the shared reload timeline with the weapon's own poses / bolt travel (M2.0). */
export function createHandsController(model, hands, { poses = POSES, chargeTravel = 0.055 } = {}) {
  const spareMag = model.parts.mag.clone(); spareMag.name = 'spare-magazine'; spareMag.visible = false;
  model.group.add(spareMag);
  const leftPose = makePoseBuffer(), rightPose = makePoseBuffer(), tmpPose = makePoseBuffer();
  const offsets = { mag: new THREE.Vector3(), spare: new THREE.Vector3(), charging: new THREE.Vector3() };
  return {
    spareMag, leftPose, rightPose, offsets,
    /**
     * r: reload progress (−1 = none). triggerPull: 0..1 extra index-finger squeeze after a shot.
     * elbows: {right, left} in model space. Returns the timeline (rig tilt is applied by the caller).
     */
    poses,
    apply(r, triggerPull, elbows) {
      const tl = reloadTimeline(r, { chargeTravel });
      const mag = model.parts.mag, ch = model.parts.charging;
      mag.position.set(tl.mag.x, tl.mag.y, tl.mag.z); mag.rotation.x = tl.mag.rx; mag.visible = tl.mag.visible;
      spareMag.position.set(tl.spare.x, tl.spare.y, tl.spare.z); spareMag.visible = tl.spare.visible;
      ch.position.set(0, 0, tl.charging);
      if (hands && hands.group.visible) {
        offsets.mag.copy(mag.position); offsets.spare.copy(spareMag.position); offsets.charging.set(0, 0, tl.charging);
        blendPoses(poses[tl.left.a], poses[tl.left.b], tl.left.t, offsets, leftPose);
        blendPoses(poses.rightGrip, poses.rightIndexOff, tl.rightIndexOff, offsets, rightPose);
        if (triggerPull > 0) { blendPoses(rightPose, poses.rightGripPull, triggerPull, offsets, tmpPose); for (let i = 0; i < 3; i++) rightPose.f.index[i] = tmpPose.f.index[i]; }
        hands.update(rightPose, leftPose, elbows);
      }
      return tl;
    },
  };
}

/** M2.0 DA-S12 KRAIT: pump after every shot, shell-by-shell loading (left hand + the shell it carries), from the sim state. */
export function createShotgunController(model, hands, poses, def, travel) {
  const leftPose = makePoseBuffer(), rightPose = makePoseBuffer(), tmpPose = makePoseBuffer();
  const offsets = { mag: new THREE.Vector3(), spare: new THREE.Vector3(), charging: new THREE.Vector3(), pump: new THREE.Vector3() };
  const st = { cycle: 1, interval: 60 / def.rpm, pump: def.pump, reload: def.reload, travel, shellPhase: null, shellT: 0, shellPump: false };
  const shell = model.parts.loadShell, v = new THREE.Vector3(), q = new THREE.Quaternion();
  const set = s => { st.cycle = s.cycle ?? 1; st.shellPhase = s.shellPhase || null; st.shellT = s.shellT || 0; st.shellPump = !!s.shellPump; };
  return {
    leftPose, rightPose, offsets, poses,
    timeline(s) { set(s); return kraitTimeline(st); },
    /** s: {cycle, shellPhase, shellT, shellPump}. Returns the timeline (rig tilt applied by the caller). */
    apply(s, triggerPull, elbows) {
      set(s); const tl = kraitTimeline(st);
      model.parts.pump.position.set(0, 0, tl.pump); offsets.pump.set(0, 0, tl.pump);
      if (hands && hands.group.visible) {
        blendPoses(poses[tl.left.a], poses[tl.left.b], tl.left.t, offsets, leftPose);
        blendPoses(poses.rightGrip, poses.rightIndexOff, tl.rightIndexOff, offsets, rightPose);
        if (triggerPull > 0) { blendPoses(rightPose, poses.rightGripPull, triggerPull, offsets, tmpPose); for (let i = 0; i < 3; i++) rightPose.f.index[i] = tmpPose.f.index[i]; }
        hands.update(rightPose, leftPose, elbows);
      }
      // the shell rides on the left palm, then slides up into the loading port
      shell.visible = tl.shell.visible && !!hands;
      if (shell.visible) {
        v.copy(hands.palmCenter.left); q.copy(leftPose.quat);
        const up = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(0.014); // palm normal (palm side = +Z)
        shell.position.copy(v).add(up);
        shell.position.lerp(model.anchors.port.position, tl.shell.k * 0.9);
        shell.rotation.set(0, 0, 0);
      }
      return tl;
    },
  };
}
