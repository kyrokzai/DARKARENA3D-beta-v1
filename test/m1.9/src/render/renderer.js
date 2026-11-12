// three.js renderer: world scene (first-person camera) + weapon viewmodel overlay + impacts + targets.
// Reads simulation state; never writes it.
import * as THREE from 'three';
import { computePixelRatio, getProfile, AutoResolution } from './quality.js';
import { mapsLoaded } from './enemies/hollow-model.js';
import { CELL_SIZE as S, EYE_HEIGHT } from '../config.js';
import { buildLevel } from './level.js';
import { createViewmodel } from './weapons/viewmodel.js';
import { createImpacts } from './effects/impacts.js';
import { createTargetsView } from './targets.js';
import { createInfectedView } from './enemies/infected-view.js';

const FOG_COLOR = 0x07090d;

export function createRenderer({ container, world, getSettings, skin }) {
  // M1.8: MSAA comes from the quality profile; it is a context attribute, so a profile change applies after a reload.
  const startProfile = getProfile(getSettings().graphicsProfile);
  const renderer = new THREE.WebGLRenderer({ antialias: startProfile.msaa, powerPreference: 'high-performance' });
  const autoRes = new AutoResolution();
  let res = { ratio: 1, width: 1, height: 1, pixels: 1, budgetLimited: false };
  renderer.setClearColor(FOG_COLOR);
  renderer.domElement.id = 'view';
  renderer.info.autoReset = false; // we count world and viewmodel separately per frame
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 7, 36);
  if (world.map.style === 'outpost') { // M1.7: lighter haze, the far end of the hall stays readable
    const fogC = 0x0c0f14; renderer.setClearColor(fogC); scene.background = new THREE.Color(fogC); scene.fog = new THREE.Fog(fogC, 9, 46);
  }

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

  // M1.8: per-profile texture cost — anisotropic filtering (floor gets more: it is seen at grazing angles) and the
  // environment bump maps. Measured as the biggest per-pixel costs of the new environment (docs/M1.8-REPORT.md).
  const bumps = new Map(); scene.traverse(o => { if (o.material && !Array.isArray(o.material) && o.material.bumpMap) bumps.set(o.material, o.material.bumpMap); });
  let texKey = '', texCreated = 0;
  function applyTextureQuality() {
    const P = getProfile(getSettings().graphicsProfile), maxA = renderer.capabilities.getMaxAnisotropy();
    const key = P.id; if (key === texKey) return; texKey = key;
    vm.setSurfaceDetail(P.bump); // M1.9: viewmodel relief follows the profile (PERFORMANCE: off — measured per-pixel cost)
    scene.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        for (const k of ['map', 'bumpMap', 'normalMap', 'emissiveMap']) {
          const t = m[k] || (k === 'bumpMap' && bumps.get(m)); if (!t || t.magFilter === THREE.NearestFilter) continue;
          if (t.userData.noAniso) { if (t.userData.minFilter0 === undefined) t.userData.minFilter0 = t.minFilter; const mf = getProfile(getSettings().graphicsProfile).trilinear ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter; if (t.minFilter !== mf) { t.minFilter = mf; t.needsUpdate = true; } continue; } // character maps: no anisotropy (seen face-on)
          const want = Math.min(maxA, o.name === 'floor' ? P.floorAnisotropy : P.anisotropy);
          if (t.anisotropy !== want) { t.anisotropy = want; t.needsUpdate = true; }
          // PERFORMANCE: bilinear with the nearest mip level instead of trilinear (measured: most of the extra
          // per-pixel cost at equal resolution; still smooth, unlike M1.7's nearest-neighbour)
          if (t.userData.minFilter0 === undefined) t.userData.minFilter0 = t.minFilter;
          if (t.userData.minFilter0 === THREE.LinearMipmapLinearFilter) { const mf = P.trilinear ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter; if (t.minFilter !== mf) { t.minFilter = mf; t.needsUpdate = true; } }
        }
        if (bumps.has(m)) { const b = P.bump ? bumps.get(m) : null; if (m.bumpMap !== b) { m.bumpMap = b; m.needsUpdate = true; } }
      }
    });
  }
  applyTextureQuality();

  let lastKey = '';
  function resize(force) {
    const s = getSettings();
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    autoRes.enabled = s.autoResolution !== false;
    applyTextureQuality();
    res = computePixelRatio(w, h, devicePixelRatio || 1, s.graphicsProfile, s.renderScale, autoRes.enabled ? autoRes.factor : 1);
    const pr = res.ratio;
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
    /** M1.9 melee: the rifle butt connects — a light camera punch (render only) and the rifle jolt. */
    onMeleeHit(ev) { vm.onMeleeImpact(ev.killed); kick.v += 0.35; kick.rv += 0.35; },
    /** M1.8: real frame time while playing → adaptive resolution guard (resizes only when the factor changes). */
    sampleFrame(dt) { if (autoRes.sample(dt, getProfile(getSettings().graphicsProfile).minAuto)) resize(true); },
    /** Current render resolution facts (tests / FPS overlay). */
    get resolution() { const gl = renderer.getContext(); return { ...res, profile: getSettings().graphicsProfile, msaa: !!gl.getContextAttributes().antialias, startProfile: startProfile.id, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], auto: autoRes.factor, autoChanges: autoRes.changes, dpr: devicePixelRatio || 1 }; },
    get autoRes() { return autoRes; },
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
      if (w.enemies) infected.update(w.enemies, w.enemyDt ?? dt, alpha, camera.position);
      { const k = infected.stats.created * 1000 + mapsLoaded(); if (k !== texCreated) { texCreated = k; texKey = ''; applyTextureQuality(); } } // new pooled infected / maps just loaded: profile filtering for them too // enemyDt = 0 while paused → animation frozen
      if (w.alarm !== undefined) level.setAlarm(w.alarm);
      level.update(camera.position, dt, w.enemyDt ?? dt);
      renderer.info.reset();
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.render(scene, camera);
      lastInfo.world = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      if (w.showWeapon !== false) {
        vm.update({ ads, reload: w.reload ?? -1, melee: w.melee ?? -1, player, dt, aspect: camera.aspect, triggerDown: !!w.triggerDown });
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
