// Training targets view (test mode). Shapes match the sim hitboxes exactly: body cylinder r 0.24 m up to
// 1.45 m, head sphere r 0.13 m at 1.62 m. Hit → white flash; killed → falls back; respawn → stands up.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';

export function createTargetsView(scene) {
  const group = new THREE.Group(); group.name = 'training-targets'; scene.add(group);
  const bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.45, 14).translate(0, 0.725, 0);
  const headGeo = new THREE.SphereGeometry(0.13, 14, 10).translate(0, 1.62, 0);
  const baseGeo = new THREE.CylinderGeometry(0.36, 0.42, 0.06, 16).translate(0, 0.03, 0);
  const ringGeo = new THREE.RingGeometry(0.08, 0.14, 24).translate(0, 1.05, 0.245);
  const views = new Map();
  const mats = () => ({ body: new THREE.MeshLambertMaterial({ color: 0xc8b48a }), head: new THREE.MeshLambertMaterial({ color: 0xd8c49a }), ring: new THREE.MeshBasicMaterial({ color: 0xb02030, side: THREE.DoubleSide }) });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });

  function sync(hittables) {
    for (const h of hittables) {
      if (views.has(h.id)) continue;
      const m = mats(), root = new THREE.Group(), pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(bodyGeo, m.body), new THREE.Mesh(headGeo, m.head), new THREE.Mesh(ringGeo, m.ring));
      root.add(new THREE.Mesh(baseGeo, baseMat), pivot);
      root.position.set(h.x * S, 0, h.y * S);
      group.add(root);
      views.set(h.id, { root, pivot, m, fall: 0 });
    }
    for (const [id, v] of views) if (!hittables.some(h => h.id === id)) { group.remove(v.root); views.delete(id); }
  }

  function update(hittables, dt, camPos) {
    sync(hittables);
    for (const h of hittables) {
      const v = views.get(h.id);
      v.root.rotation.y = Math.atan2(camPos.x - v.root.position.x, camPos.z - v.root.position.z); // face the player
      const f = h.hitFlash > 0 ? 1 : 0;
      v.m.body.emissive.setScalar(f * (h.lastZone === 'body' ? 0.9 : 0.25));
      v.m.head.emissive.setScalar(f * (h.lastZone === 'head' ? 1 : 0.25));
      v.fall += ((h.alive ? 0 : 1) - v.fall) * Math.min(1, dt * (h.alive ? 4 : 9));
      v.pivot.rotation.x = -v.fall * 1.45;
    }
  }
  return { update, group };
}
