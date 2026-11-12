// Applies the reload timeline + hand poses to a RAVEN model instance (weapon parts and hands).
// Shared by the in-game viewmodel and the developer viewer, so both always show the same animation.
import * as THREE from 'three';
import { POSES, blendPoses, makePoseBuffer } from './hand-poses.js';
import { reloadTimeline } from './weapon-anim.js';

export function createHandsController(model, hands) {
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
    apply(r, triggerPull, elbows) {
      const tl = reloadTimeline(r);
      const mag = model.parts.mag, ch = model.parts.charging;
      mag.position.set(tl.mag.x, tl.mag.y, tl.mag.z); mag.rotation.x = tl.mag.rx; mag.visible = tl.mag.visible;
      spareMag.position.set(tl.spare.x, tl.spare.y, tl.spare.z); spareMag.visible = tl.spare.visible;
      ch.position.set(0, 0, tl.charging);
      if (hands && hands.group.visible) {
        offsets.mag.copy(mag.position); offsets.spare.copy(spareMag.position); offsets.charging.set(0, 0, tl.charging);
        blendPoses(POSES[tl.left.a], POSES[tl.left.b], tl.left.t, offsets, leftPose);
        blendPoses(POSES.rightGrip, POSES.rightIndexOff, tl.rightIndexOff, offsets, rightPose);
        if (triggerPull > 0) { blendPoses(rightPose, POSES.rightGripPull, triggerPull, offsets, tmpPose); for (let i = 0; i < 3; i++) rightPose.f.index[i] = tmpPose.f.index[i]; }
        hands.update(rightPose, leftPose, elbows);
      }
      return tl;
    },
  };
}
