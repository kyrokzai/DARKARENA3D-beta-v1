// M3.3 TOPDOWN drops — the look of the medkits / ammo boxes on the floor. Reads game.pickups.list, never writes the sim.
// Own procedural geometry (rule 3: no generated assets), InstancedMeshes (≤ 5 draw calls whatever the item count),
// no lights (rule 12): the glow is an additive floor ring + unlit marks. Items bob and turn; in their last
// PICKUP.blink seconds they blink; a collected item leaves a short expanding ring.
import * as THREE from 'three';
import { CELL_SIZE as S } from '../config.js';
import { PICKUP } from '../sim/pickups.js';

const MAX = PICKUP.max + 4; // + a few rings of collected items still fading out
const COLOR = Object.freeze({ medkit: 0x3ddc84, ammo: 0xffc23d });

export function createPickupsView(scene) {
  const inst = (geo, mat, n = MAX) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  // medkit: light case + green cross on top; ammo: dark olive case + brass strip and rounds on top
  const medBody = inst(new THREE.BoxGeometry(0.42, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xdfe5e8, roughness: 0.45, metalness: 0.05 }));
  const crossGeo = mergeBoxes([[0.22, 0.012, 0.07], [0.07, 0.012, 0.22]], 0.106);
  const medCross = inst(crossGeo, new THREE.MeshBasicMaterial({ color: COLOR.medkit, toneMapped: false }));
  const ammoBody = inst(new THREE.BoxGeometry(0.44, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: 0x3b4128, roughness: 0.7, metalness: 0.2 }));
  const ammoTop = inst(mergeBoxes([[0.34, 0.03, 0.05, 0, -0.06], [0.05, 0.05, 0.05, -0.1, 0.05], [0.05, 0.05, 0.05, 0, 0.05], [0.05, 0.05, 0.05, 0.1, 0.05]], 0.125),
    new THREE.MeshBasicMaterial({ color: COLOR.ammo, toneMapped: false }));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = inst(new THREE.RingGeometry(0.34, 0.46, 40).rotateX(-Math.PI / 2), ringMat);
  ring.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  ring.renderOrder = 5;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const bursts = []; // collected items: { x, z, kind, t }
  let time = 0;

  function put(mesh, i, x, y, z, yaw, s) { q.setFromAxisAngle(up, yaw); pos.set(x, y, z); scl.set(s, s, s); mesh.setMatrixAt(i, m4.compose(pos, q, scl)); }
  function finish(mesh, n) { mesh.count = n; mesh.visible = n > 0; if (n) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } }

  return {
    /** A pickup was collected (sim event): a short expanding ring where it lay. */
    onTaken(e) { bursts.push({ x: e.x * S, z: e.y * S, kind: e.kind, t: 0 }); if (bursts.length > 4) bursts.shift(); },
    reset() { bursts.length = 0; },
    update(game, dt) {
      time += dt;
      const list = game.pickups ? game.pickups.list : [];
      let nm = 0, na = 0, nr = 0;
      for (const it of list) {
        const left = it.ttl - it.t, blinkOff = left < PICKUP.blink && Math.floor(left * 6) % 2 === 1;
        const pop = Math.min(1, it.t / 0.25), s = blinkOff ? 0.0001 : 0.6 + 0.4 * pop; // spawn: grows in a quarter second
        const x = it.x * S, z = it.y * S, ph = (it.id.length * 1.7 + it.x * 3.1) % 6.28;
        const y = 0.16 + Math.sin(time * 3 + ph) * 0.04, yaw = time * 1.3 + ph;
        if (it.kind === 'medkit') { put(medBody, nm, x, y, z, yaw, s); put(medCross, nm, x, y, z, yaw, s); nm++; }
        else { put(ammoBody, na, x, y, z, yaw, s); put(ammoTop, na, x, y, z, yaw, s); na++; }
        const pulse = 0.75 + 0.25 * Math.sin(time * 4 + ph);
        put(ring, nr, x, 0.02, z, 0, blinkOff ? 0.0001 : 0.9 + 0.1 * pulse);
        ring.setColorAt(nr, col.setHex(COLOR[it.kind]).multiplyScalar(0.55 * pulse)); nr++;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += dt;
        if (b.t > 0.45 || nr >= MAX) { bursts.splice(i, 1); continue; }
        const k = b.t / 0.45;
        put(ring, nr, b.x, 0.03, b.z, 0, 1 + k * 2.2);
        ring.setColorAt(nr, col.setHex(COLOR[b.kind]).multiplyScalar(1 - k)); nr++;
      }
      finish(medBody, nm); finish(medCross, nm); finish(ammoBody, na); finish(ammoTop, na); finish(ring, nr);
    },
  };
}

/** Boxes [w, h, d, x?, z?] merged into one geometry, raised to height y (metres). */
function mergeBoxes(boxes, y) {
  const parts = boxes.map(([w, h, d, x = 0, z = 0]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
