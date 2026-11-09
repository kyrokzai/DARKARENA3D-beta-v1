// three.js renderer: world scene (first-person camera) + weapon viewmodel overlay + impacts + targets.
// Reads simulation state; never writes it.
import * as THREE from 'three';
import { CELL_SIZE as S, EYE_HEIGHT } from '../config.js';
import { buildLevel } from './level.js';
import { createViewmodel } from './weapons/viewmodel.js';
import { createImpacts } from './effects/impacts.js';
import { createTargetsView } from './targets.js';
import { createInfectedView } from './enemies/infected-view.js';

const FOG_COLOR = 0x07090d;

export function createRenderer({ container, world, getSettings, skin }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(FOG_COLOR);
  renderer.domElement.id = 'view';
  renderer.info.autoReset = false; // we count world and viewmodel separately per frame
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 7, 36);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  // Weak "body light" so nearby walls stay readable in dark corners.
  const bodyLight = new THREE.PointLight(0xc8d0ff, 3, 7, 2);
  camera.add(bodyLight);
  // Muzzle-flash light in the world (always present, intensity 0 when idle → no shader recompiles).
  const worldFlash = new THREE.PointLight(0xffa850, 0, 9, 1.8);
  worldFlash.position.set(0.25, -0.15, -0.8);
  camera.add(worldFlash);
  scene.add(camera);

  const level = buildLevel(scene, world);
  const vm = createViewmodel({ renderer, skin });
  const infected = createInfectedView(scene); // M1.5: pooled HOLLOW instances + hit/death particles
  const impacts = createImpacts(scene);
  const targets = createTargetsView(scene);

  let contextLost = false;
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; document.body.classList.add('ctx-lost'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; document.body.classList.remove('ctx-lost'); });

  let lastKey = '';
  function resize(force) {
    const s = getSettings();
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const pr = Math.min(devicePixelRatio || 1, 2) * s.renderScale;
    const key = `${w}x${h}@${pr}`;
    if (key === lastKey && !force) return;
    lastKey = key;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Visual camera kick (render-only; the real aim kick lives in the weapon sim).
  const kick = { p: 0, v: 0, roll: 0, rv: 0 };
  let flashT = 0;
  const lastInfo = { world: { calls: 0, triangles: 0 }, vm: { calls: 0, triangles: 0 } };

  /** Place camera from interpolated player state. Sim yaw 0 = +X; three camera looks down -Z by default. */
  function syncCamera(p, alpha) {
    const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
    const z = (p.prevZ ?? 0) + ((p.z ?? 0) - (p.prevZ ?? 0)) * alpha;
    camera.position.set(x * S, EYE_HEIGHT + z * S, y * S);
    camera.rotation.y = -p.yaw - Math.PI / 2;
    camera.rotation.x = p.pitch + kick.p;
    camera.rotation.z = kick.roll;
  }

  return {
    renderer, scene, camera, level, resize, vm, impacts, targets, infected,
    /** Player hurt: short camera jolt away from the attacker (render only). */
    onHurt() { kick.v -= 0.5; kick.rv += (Math.random() - 0.5) * 0.9; },
    /** Weapon feedback hooks (called from weapon events). */
    onShot(ev) {
      vm.onShot(ev);
      const k = 1 - (ev.ads || 0) * 0.5;
      kick.v += 0.55 * k; kick.rv += (Math.random() - 0.5) * 0.25 * k;
      flashT = 0.045;
    },
    onImpact(ev) { impacts.impact(ev); },
    setSkin(id) { vm.setSkin(id); },
    /**
     * Draw a frame. w = { ads 0..1, fovMult, reload (0..1 | -1), triggerDown, dt, hittables } (optional for older callers).
     */
    render(player, alpha, w = {}) {
      resize();
      if (contextLost) return;
      const s = getSettings(), dt = Math.min(0.1, w.dt || 1 / 60), ads = w.ads || 0;
      // ADS zoom: world FOV shrinks smoothly with the sim ADS factor.
      const fov = s.fov * (1 - ads * (1 - (w.fovMult || 1)));
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
      // kick springs (frame-rate independent sub-steps)
      for (let t = dt; t > 0; t -= 1 / 240) {
        const h = Math.min(1 / 240, t);
        kick.v += (-260 * kick.p - 26 * kick.v) * h; kick.p += kick.v * h * 0.012;
        kick.rv += (-200 * kick.roll - 24 * kick.rv) * h; kick.roll += kick.rv * h * 0.01;
      }
      flashT -= dt; worldFlash.intensity = flashT > 0 ? 9 : 0;
      syncCamera(player, alpha);
      impacts.update(dt);
      targets.update(w.targets || w.hittables || [], dt, camera.position);
      if (w.enemies) infected.update(w.enemies, dt, alpha);
      renderer.info.reset();
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.render(scene, camera);
      lastInfo.world = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      if (w.showWeapon !== false) {
        vm.update({ ads, reload: w.reload ?? -1, player, dt, aspect: camera.aspect, triggerDown: !!w.triggerDown });
        renderer.info.reset();
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
        renderer.render(vm.scene, vm.camera);
        renderer.autoClear = true;
        lastInfo.vm = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      } else lastInfo.vm = { calls: 0, triangles: 0 };
    },
    /** World-scene statistics (arena budget, unchanged meaning since M0). */
    get info() { return { ...lastInfo.world, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    get infoVM() { return { ...lastInfo.vm }; },
    get infoTotal() { return { calls: lastInfo.world.calls + lastInfo.vm.calls, triangles: lastInfo.world.triangles + lastInfo.vm.triangles }; },
  };
}
