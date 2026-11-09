// Developer tool: inspect DA-R1 RAVEN from any angle in every skin. ?sheet=1 renders a contact sheet
// (rows = skins, columns = angles) for review screenshots.
import * as THREE from 'three';
import { createRavenModel } from '../render/weapons/raven-model.js';
import { SKINS, SKIN_IDS } from '../render/weapons/raven-skins.js';
import { getStudioEnv } from '../render/weapons/studio-env.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.5;
document.body.prepend(renderer.domElement);
const env = getStudioEnv(renderer);

function makeStage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d12);
  scene.environment = env; scene.environmentIntensity = 1.4;
  scene.add(new THREE.HemisphereLight(0xb8c4dc, 0x241a1c, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-1.2, 2.2, 2.0); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb8ff, 1.2); fill.position.set(2, 0.5, 1.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff4058, 1.4); rim.position.set(0.5, 1.2, -2.2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.26; scene.add(floor);
  return scene;
}

const ANGLES = {
  'Слева': [-Math.PI / 2, 0.0], 'Справа': [Math.PI / 2, 0.0], '3/4 спереди': [-Math.PI / 4.2, 0.28],
  '3/4 сзади': [-Math.PI * 0.78, 0.25], 'Сверху': [-Math.PI / 2, 1.2], 'Спереди': [0.0, 0.08],
};
const model = createRavenModel(params.get('skin') || 'obsidian');
const pivot = new THREE.Group(); pivot.add(model.group);
model.group.position.set(0, -0.02, 0.19); // centre of mass roughly at the origin
const stage = makeStage(); stage.add(pivot);
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
let yaw = ANGLES['3/4 спереди'][0], pitch = ANGLES['3/4 спереди'][1], dist = 1.9;

function place(cam, y, p, d) { cam.position.set(Math.sin(y) * Math.cos(p) * d, Math.sin(p) * d + 0.02, Math.cos(y) * Math.cos(p) * d); cam.lookAt(0, 0.0, 0); }

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

if (params.get('sheet') === '1') {
  // Contact sheet: one model per skin, rendered into a grid with scissor viewports.
  document.getElementById('ui').style.display = 'none'; document.getElementById('note').style.display = 'none';
  const cols = ['Слева', '3/4 спереди', '3/4 сзади', 'Сверху'], rows = SKIN_IDS;
  const models = rows.map(id => { const m = createRavenModel(id); const pv = new THREE.Group(); m.group.position.copy(model.group.position); pv.add(m.group); return pv; });
  stage.remove(pivot);
  const W = innerWidth, H = innerHeight, cw = W / cols.length, ch = H / rows.length;
  renderer.setScissorTest(true);
  const cam = new THREE.PerspectiveCamera(26, cw / ch, 0.01, 20);
  rows.forEach((id, r) => {
    stage.add(models[r]);
    cols.forEach((a, c) => {
      const [y, p] = ANGLES[a];
      place(cam, y, p, a === 'Сверху' ? 2.3 : 2.05);
      const x = c * cw, yy = H - (r + 1) * ch;
      renderer.setViewport(x, yy, cw, ch); renderer.setScissor(x, yy, cw, ch);
      renderer.render(stage, cam);
    });
    stage.remove(models[r]);
  });
  renderer.setScissorTest(false);
  // labels
  const lab = document.createElement('div');
  lab.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:700 14px "Arial Narrow",Arial;color:#ddd;letter-spacing:1px';
  rows.forEach((id, r) => cols.forEach((a, c) => {
    const d = document.createElement('div');
    d.textContent = (c === 0 ? SKINS[id].label + ' · ' : '') + a;
    d.style.cssText = `position:absolute;left:${c * cw + 10}px;top:${r * ch + 8}px;color:${c === 0 ? '#ff7a86' : '#9aa2b4'}`;
    lab.appendChild(d);
  }));
  document.body.appendChild(lab);
  window.__sheetDone = true;
} else {
  // Interactive viewer
  const skins = document.getElementById('skins'), views = document.getElementById('views');
  const refreshButtons = () => { for (const b of skins.children) b.classList.toggle('on', b.dataset.id === model.skin); };
  for (const id of SKIN_IDS) { const b = document.createElement('button'); b.textContent = SKINS[id].label; b.dataset.id = id; b.onclick = () => { model.setSkin(id); refreshButtons(); }; skins.appendChild(b); }
  for (const a of Object.keys(ANGLES)) { const b = document.createElement('button'); b.textContent = a; b.onclick = () => { [yaw, pitch] = ANGLES[a]; }; views.appendChild(b); }
  refreshButtons();
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag.x) * 0.01; pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', () => { drag = null; });
  renderer.domElement.addEventListener('wheel', e => { dist = Math.max(0.6, Math.min(4, dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: true });
  renderer.setAnimationLoop(() => { place(camera, yaw, pitch, dist); renderer.render(stage, camera); });
  window.__viewer = { setSkin: id => { model.setSkin(id); refreshButtons(); }, setAngle: a => { [yaw, pitch] = ANGLES[a]; }, setDist: d => { dist = d; }, model };
}
