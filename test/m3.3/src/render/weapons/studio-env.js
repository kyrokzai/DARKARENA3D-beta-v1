// Small procedural environment map for weapon reflections (core PMREMGenerator, no addons, no HDR files).
// A dark room with a few soft light panels — gives metal and polymer believable highlights.
import * as THREE from 'three';

const envs = new WeakMap();
export function getStudioEnv(renderer, { warm = 0xd9cdc2, cool = 0x9fc4ff, accent = 0xff3348 } = {}) {
  if (envs.has(renderer)) return envs.get(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c10);
  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); scene.add(m);
  };
  panel(6, 1.2, 0xffffff, 2.2, [0, 4, -1], [0, 0, 0]);     // overhead softbox
  panel(3, 2, cool, 1.2, [-5, 1.5, 2], [0, 0, 0]);         // cool key from the left
  panel(3, 2, warm, 1.0, [5, 1, -2], [0, 0, 0]);           // warm fill from the right
  panel(4, 0.5, accent, 0.7, [0, -0.5, 5], [0, 0, 0]);     // red arena glow behind the camera
  panel(5, 2.5, 0xcfd6e6, 1.1, [0, 1.2, 5], [0, 0, 0]);    // broad front softbox (form readability)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x15161b }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2; scene.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  envs.set(renderer, rt.texture);
  return rt.texture;
}
