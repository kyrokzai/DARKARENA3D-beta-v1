// three.js renderer, scene, first-person camera. Reads simulation state; never writes it.
import * as THREE from 'three';
import { CELL_SIZE as S, EYE_HEIGHT } from '../config.js';
import { buildLevel } from './level.js';

const FOG_COLOR = 0x07090d;

export function createRenderer({ container, world, getSettings }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(FOG_COLOR);
  renderer.domElement.id = 'view';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 7, 36);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  // Weak "body light" so nearby walls stay readable in dark corners.
  const bodyLight = new THREE.PointLight(0xc8d0ff, 3, 7, 2);
  camera.add(bodyLight);
  scene.add(camera);

  const level = buildLevel(scene, world);

  let contextLost = false;
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; document.body.classList.add('ctx-lost'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; document.body.classList.remove('ctx-lost'); });

  let lastKey = '';
  function resize(force) {
    const s = getSettings();
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const pr = Math.min(devicePixelRatio || 1, 2) * s.renderScale;
    const key = `${w}x${h}@${pr}/${s.fov}`;
    if (key === lastKey && !force) return;
    lastKey = key;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  }

  /** Place camera from interpolated player state. Sim yaw 0 = +X; three camera looks down -Z by default. */
  function syncCamera(p, alpha) {
    const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
    camera.position.set(x * S, EYE_HEIGHT, y * S);
    camera.rotation.y = -p.yaw - Math.PI / 2;
    camera.rotation.x = p.pitch;
  }

  return {
    renderer, scene, camera, level, resize,
    render(player, alpha) {
      resize();
      if (contextLost) return;
      syncCamera(player, alpha);
      renderer.render(scene, camera);
    },
    get info() { const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
  };
}
