// M3.2 UI previews rendered with the game's own WebGL renderer (no second context): the three real weapon models
// (M2.0 RAVEN / AK-47 MOD / KRAIT) for the loadout cards (live, scissor viewports) and the HUD weapon icons (rendered
// once into an image), plus the operator portrait (avatar) taken from the hero in the lab scene.
import * as THREE from 'three';
import { createRavenModel } from '../render/weapons/raven-model.js';
import { createAk47Model } from '../render/weapons/ak47-model.js';
import { createKraitModel } from '../render/weapons/krait-model.js';
import { getStudioEnv } from '../render/weapons/studio-env.js';

export const PREVIEW_IDS = ['raven', 'ak47', 'krait'];

export function createPreviews(renderer) {
  const scene = new THREE.Scene();
  scene.environment = getStudioEnv(renderer); scene.environmentIntensity = 1.8;
  const key = new THREE.DirectionalLight(0xffffff, 7); key.position.set(-1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3040, 3.2); rim.position.set(2.5, 1, -2.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0xb8c8e0, 0x201010, 1.8); scene.add(fill);
  const top = new THREE.DirectionalLight(0xdfe8ff, 3); top.position.set(0, 4, 0.5); scene.add(top);
  // backdrop: a soft red-grey glow behind the gun (live previews only; the icons are rendered without it)
  const bc = document.createElement('canvas'); bc.width = bc.height = 128; { const g = bc.getContext('2d'), gr = g.createRadialGradient(64, 70, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(120,40,44,0.9)'); gr.addColorStop(0.45, 'rgba(40,22,26,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const backTex = new THREE.CanvasTexture(bc); backTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: backTex, transparent: true, depthWrite: false, toneMapped: false })); scene.add(backdrop);
  const makers = { raven: createRavenModel, ak47: createAk47Model, krait: createKraitModel };
  const items = {};
  for (const id of PREVIEW_IDS) {
    const m = makers[id](), pivot = new THREE.Group(); pivot.add(m.group); scene.add(pivot); pivot.visible = false;
    const box = new THREE.Box3().setFromObject(m.group), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    m.group.position.sub(c);                               // centre the gun on the pivot
    items[id] = { model: m, pivot, size };
  }
  const cam = new THREE.PerspectiveCamera(22, 2, 0.05, 20);
  /** Frames gun `id` side-on (barrel to the right) for a viewport of the given aspect; yaw = turn (rad). */
  function pose(id, aspect, yaw = 0, pitch = 0.12) {
    for (const k of PREVIEW_IDS) items[k].pivot.visible = k === id;
    const it = items[id]; it.pivot.rotation.set(0, Math.PI / 2 + yaw, 0);
    cam.aspect = aspect; cam.updateProjectionMatrix();
    const len = Math.max(it.size.z, it.size.x), h = it.size.y;
    const fitW = (len * 1.02) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / aspect, fitH = (h * 1.12) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const d = Math.max(fitW, fitH);
    cam.position.set(0, Math.sin(pitch) * d, Math.cos(pitch) * d); cam.lookAt(0, 0, 0);
    backdrop.position.set(0, 0, -0.35); backdrop.scale.set(len * 1.3, len * 0.75, 1); backdrop.lookAt(cam.position);
  }
  /** Live previews into screen rectangles (CSS px): list of { id, rect, t } — called after the main pass. */
  function renderInto(list, cssH) {
    const prevAuto = renderer.autoClear; renderer.autoClear = false;
    renderer.setScissorTest(true);
    for (const { id, rect, yaw } of list) {
      if (!items[id] || rect.width < 4 || rect.height < 4) continue;
      const y = cssH - rect.bottom;
      renderer.setViewport(rect.left, y, rect.width, rect.height); renderer.setScissor(rect.left, y, rect.width, rect.height);
      pose(id, rect.width / rect.height, yaw);
      renderer.clearDepth(); renderer.render(scene, cam);
    }
    renderer.setScissorTest(false);
    const sz = renderer.getSize(new THREE.Vector2()); renderer.setViewport(0, 0, sz.x, sz.y);
    renderer.autoClear = prevAuto;
  }
  /** Renders `scn` with `camera` into an image (data URL) of w×h px with a transparent background. */
  function snapshot(scn, camera, w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const prevBg = scn.background; scn.background = null;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scn, camera); renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevA); scn.background = prevBg;
    const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip Y
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  /** HUD weapon icons: { raven, ak47, krait } → data URLs. */
  function icons(w = 240, h = 80) {
    const out = {};
    // no tone mapping into a render target → light the icons brighter than the live previews
    const k0 = key.intensity, r0 = rim.intensity, e0 = scene.environmentIntensity, f0 = fill.intensity;
    key.intensity = 5.5; rim.intensity = 3.5; fill.intensity = 1.6; scene.environmentIntensity = 2.2;
    backdrop.visible = false;
    for (const id of PREVIEW_IDS) { pose(id, w / h, 0, 0.02); out[id] = snapshot(scene, cam, w, h); }
    backdrop.visible = true;
    key.intensity = k0; rim.intensity = r0; scene.environmentIntensity = e0; fill.intensity = f0;
    return out;
  }
  function setSkin(id) { items.raven.model.setSkin(id); }
  return { scene, items, renderInto, icons, snapshot, setSkin };
}
