// Developer tool: inspect THE HOLLOW and its procedural animations. ?anim=walk&t=1.2 freezes a moment.
// A fake infected object drives animateHollow exactly like the sim does (state, speed, distance, timers).
import * as THREE from 'three';
import { createHollowInstance, getHollowAssets } from '../render/enemies/hollow-model.js';
import { animateHollow, createAnimState } from '../render/enemies/hollow-anim.js';
import { INFECTED_TYPES } from '../sim/enemies/infected-defs.js';

const params = new URLSearchParams(location.search);
const def = INFECTED_TYPES.hollow;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c10); scene.fog = new THREE.Fog(0x0b0c10, 6, 16);
scene.add(new THREE.HemisphereLight(0x9aa6c0, 0x201416, 0.9));
const key = new THREE.DirectionalLight(0xffe2c8, 2.4); key.position.set(-1.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0xff3040, 1.6); rim.position.set(1.5, 2, -2.5); scene.add(rim);
const fill = new THREE.DirectionalLight(0x7f9cff, 0.6); fill.position.set(2, 1, 1.5); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(8, 16, 0x2a2d36, 0x1c1e25); grid.position.y = 0.001; scene.add(grid);

const inst = createHollowInstance(); scene.add(inst.group);
const anim = createAnimState(0.3);
// fake sim object (cells, like the sim)
const e = { def, state: 'IDLE', stateT: 0, attackT: 0, speed: 0, dist: 0, facing: 0, deathT: 0, hit: { t: 0, x: 0, y: 0, zone: null, n: 0 }, killDir: { x: -1, y: 0 } };
const ANIMS = {
  idle: { state: 'IDLE', speed: 0 }, walk: { state: 'CHASE', speed: def.walkSpeed / 2 }, run: { state: 'CHASE', speed: def.runSpeed / 2 },
  alert: { state: 'ALERT', speed: 0 }, attack: { state: 'ATTACK', speed: 0 }, hit: { state: 'CHASE', speed: 0, hit: 'body' }, headshot: { state: 'CHASE', speed: 0, hit: 'head' }, death: { state: 'DEAD', speed: 0 },
};
let current = params.get('anim') || 'idle', clock = 0;
const frozen = params.get('t') !== null ? Number(params.get('t')) : null;
function setAnim(name) {
  current = name; const a = ANIMS[name]; Object.assign(e, { state: a.state, speed: a.speed, stateT: 0, attackT: 0, deathT: 0 });
  Object.assign(anim, createAnimState(0.3)); clock = 0;
  if (a.hit) { e.hit.t = 0.35; e.hit.zone = a.hit; e.hit.x = -1; e.hit.y = 0; e.hit.n++; }
  if (name === 'death') { e.hit.x = -1; e.hit.y = 0; }
  for (const b of document.querySelectorAll('#anims button')) b.classList.toggle('on', b.dataset.a === name);
}
/** Advance the fake infected by dt seconds (fixed 60 Hz sub-steps, like the sim). */
function advance(dt) {
  const h = 1 / 60;
  for (let t = 0; t < dt - 1e-9; t += h) {
    const a = ANIMS[current];
    e.stateT += h; e.dist += e.speed * h;
    if (e.state === 'ATTACK') { e.attackT += h; if (e.attackT > def.attackDuration + 0.5) { e.attackT = 0; } }
    if (e.state === 'ALERT' && e.stateT > def.alertTime + 0.6) e.stateT = 0;
    if (e.state === 'DEAD') e.deathT += h;
    e.hit.t = Math.max(0, e.hit.t - h);
    if (a.hit && e.hit.t === 0 && e.stateT % 1.2 < h) { e.hit.t = 0.35; e.hit.n++; }
    animateHollow(e, inst.bones, anim, h, 2);
  }
}
// cell → metres: the fake moves in place (treadmill), so the camera can orbit it
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const VIEWS = { 'Спереди': [0, 0.08, 4.6], 'Профиль': [Math.PI / 2, 0.08, 4.6], 'Сзади': [Math.PI, 0.1, 4.6], '3/4': [0.65, 0.12, 4.6], 'Лицо': [0.25, 0.02, 1.3] };
let yaw = 0.5, pitch = 0.1, dist = 4.6, target = new THREE.Vector3(0, 0.95, 0);
function place() {
  const tgt = dist < 2 ? new THREE.Vector3(0, 1.62, 0.12) : target;
  camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(tgt);
}
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const anims = document.getElementById('anims'), views = document.getElementById('views');
for (const n of Object.keys(ANIMS)) { const b = document.createElement('button'); b.textContent = n.toUpperCase(); b.dataset.a = n; b.onclick = () => setAnim(n); anims.appendChild(b); }
for (const [n, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { [yaw, pitch, dist] = v; }; views.appendChild(b); }
let drag = null;
renderer.domElement.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY }; });
addEventListener('pointermove', ev => { if (!drag) return; yaw -= (ev.clientX - drag.x) * 0.01; pitch = Math.max(-0.6, Math.min(1.2, pitch + (ev.clientY - drag.y) * 0.01)); drag = { x: ev.clientX, y: ev.clientY }; });
addEventListener('pointerup', () => { drag = null; });
renderer.domElement.addEventListener('wheel', ev => { dist = Math.max(0.8, Math.min(9, dist * (1 + Math.sign(ev.deltaY) * 0.1))); }, { passive: true });
setAnim(current);
if (frozen !== null) advance(frozen);
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (frozen === null) advance(dt);
  place(); renderer.render(scene, camera);
});
window.__iv = {
  setAnim, advance, setView: (y, p, d) => { yaw = y; pitch = p; dist = d; }, inst, e, anim,
  tris: getHollowAssets().tris,
  bonePos: n => inst.bones[n].getWorldPosition(new THREE.Vector3()).toArray(),
  render: () => { place(); renderer.render(scene, camera); },
};
