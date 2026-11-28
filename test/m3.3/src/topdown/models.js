// M3.0 TOPDOWN — loads the owner-supplied character models (assets/models/*.glb: meshopt + WebP, prepared offline,
// see docs/M3.0-REPORT.md). One load per type; instances are cloned with SkeletonUtils by the views.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
export const MODEL_FILES = Object.freeze({ hero: 'hero.glb', walker: 'walker.glb', brute: 'brute.glb', mutant: 'mutant.glb' });

/** Loads every model; onProgress(fraction, id). Resolves to { id: gltf }. */
export async function loadModels(onProgress = () => {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ids = Object.keys(MODEL_FILES), out = {};
  let done = 0;
  await Promise.all(ids.map(async id => {
    const g = await loader.loadAsync(BASE + MODEL_FILES[id]);
    g.scene.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); // skinned: the bind-pose bounds do not follow the clips
    g.clips = Object.fromEntries(g.animations.map(c => [c.name, c]));
    out[id] = g; done++; onProgress(done / ids.length, id);
  }));
  return out;
}

// M3.2: the owner's OUTPOST ZERO lab GLBs (M3.1, assets/models/lab) + the baked modular floor / wall maps.
export const LAB_FILES = Object.freeze({ capsule: 'lab/capsule.glb', console: 'lab/console.glb', door: 'lab/door.glb', arch: 'lab/arch.glb', lamp_wall: 'lab/lamp_wall.glb' });
export const LAB_TEXTURES = Object.freeze(['floor_plate', 'floor_grate', 'wall_panel', 'hazard']);
/** Loads the lab models and maps; onProgress(fraction). Resolves to { models, textures }. */
export async function loadLab(onProgress = () => {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), tl = new THREE.TextureLoader();
  const jobs = [], models = {}, textures = {};
  for (const [id, f] of Object.entries(LAB_FILES)) jobs.push(loader.loadAsync(BASE + f).then(g => { models[id] = g; }));
  for (const n of LAB_TEXTURES) { textures[n] = {}; for (const k of ['albedo', 'normal', 'orm']) jobs.push(tl.loadAsync(BASE + 'lab/textures/' + n + '_' + k + '.webp').then(t => { textures[n][k] = t; })); }
  jobs.push(tl.loadAsync(BASE + 'hero/kz_patch.webp').then(t => { textures.kz_patch = t; })); // M3.2 shoulder patch (own drawing)
  let done = 0; jobs.forEach(j => j.then(() => onProgress(++done / jobs.length)));
  await Promise.all(jobs);
  return { models, textures };
}

/** Soft round shadow texture shared by every character (no shadow maps on phones). */
let blobTex = null;
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c); blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}
export function createBlob(radius) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}
