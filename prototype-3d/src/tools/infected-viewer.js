// Developer tool: inspect THE HOLLOW, its procedural animations and its animated hit zones.
// ?anim=walk&t=1.2 freezes a moment, ?hb=1 shows the sim hit zones. A real sim Infected object is driven by hand
// (state, speed, timers) and posed by the same stepPose() the game uses — the viewer shows exactly the game's motion.
// M1.7: ?variant=guard|technician|worker|hollow picks the look; ?lineup=1 shows GUARD, TECHNICIAN and WORKER side by
// side (same sim pose → identical animation, only the look differs).
import * as THREE from 'three';
import { createHollowInstance, getHollowAssets, VARIANT_IDS } from '../render/enemies/hollow-model.js';
import { animateHollow, createAnimState } from '../render/enemies/hollow-anim.js';
import { INFECTED_TYPES } from '../sim/enemies/infected-defs.js';
import { Infected } from '../sim/enemies/infected.js';
import { stepPose } from '../sim/enemies/hollow-rig.js';

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

let variant = VARIANT_IDS.includes(params.get('variant')) ? params.get('variant') : 'hollow';
const lineup = params.get('lineup') === '1';
let inst = createHollowInstance(lineup ? 'technician' : variant); scene.add(inst.group);
let anim = createAnimState(0.3);
// line-up: two more instances (same sim object e, own animation state) left and right of the centre one
const extras = lineup ? [['guard', -0.85], ['worker', 0.85]].map(([v, x]) => { const i = createHollowInstance(v); i.group.position.x = x; scene.add(i.group); return { inst: i, anim: createAnimState(0.3) }; }) : [];
function setVariant(v) {
  if (lineup || !VARIANT_IDS.includes(v)) return;
  scene.remove(inst.group); inst.dispose(); variant = v; inst = createHollowInstance(v); scene.add(inst.group); anim = createAnimState(0.3);
  for (const b of document.querySelectorAll('#variants button')) b.classList.toggle('on', b.dataset.v === v);
}
// sim object standing at the origin, facing +Z (sim facing π/2 ↔ model +Z)
let e = new Infected('viewer', def, 0, 0, Math.PI / 2);
const ANIMS = {
  idle: { state: 'IDLE', speed: 0 }, walk: { state: 'CHASE', speed: def.walkSpeed / 2 }, run: { state: 'CHASE', speed: def.runSpeed / 2 },
  turn: { state: 'CHASE', speed: def.walkSpeed / 2, turn: 2.6 }, search: { state: 'SEARCH', speed: 0, look: true },
  alert: { state: 'ALERT', speed: 0 }, attack: { state: 'ATTACK', speed: 0 }, hit: { state: 'CHASE', speed: 0, hit: 'body' }, headshot: { state: 'CHASE', speed: 0, hit: 'head' },
  death: { state: 'DEAD', speed: 0, fall: 'back' }, deathFront: { state: 'DEAD', speed: 0, fall: 'front' }, crumple: { state: 'DEAD', speed: 0, fall: 'crumple' },
};
let current = params.get('anim') || 'idle';
const frozen = params.get('t') !== null ? Number(params.get('t')) : null;
function setAnim(name) {
  current = name; const A = ANIMS[name];
  e = new Infected('viewer', def, 0, 0, Math.PI / 2); anim = createAnimState(0.3); for (const x of extras) x.anim = createAnimState(0.3);
  Object.assign(e, { state: A.state, speed: A.speed, stateT: 0, attackT: 0, deathT: 0, alive: A.state !== 'DEAD' });
  if (A.fall) e.fall = { kind: A.fall, facing: e.facing };
  if (A.look) e.lookT = 1e9;
  if (A.hit) e.applyDamage(0, A.hit, { dir: { x: 0, y: -1, z: 0 } }), e.pain = false;
  for (const b of document.querySelectorAll('#anims button')) b.classList.toggle('on', b.dataset.a === name);
}
/** Advance by dt seconds in fixed 60 Hz steps, exactly like the sim. */
function advance(dt) {
  const h = 1 / 60, A = ANIMS[current];
  for (let t = 0; t < dt - 1e-9; t += h) {
    e.prevFacing = e.facing; e.stateT += h; e.dist += e.speed * h;
    if (A.turn) e.prevFacing = e.facing - Math.sin(e.stateT * 1.3) * A.turn * h; // turning without spinning the stage
    if (e.state === 'ATTACK') { e.attackT += h; if (e.attackT >= def.attackDuration) { e.state = 'RECOVER'; e.stateT = 0; } }
    else if (e.state === 'RECOVER' && current === 'attack' && e.stateT > 0.6) { e.state = 'ATTACK'; e.attackT = 0; e.stateT = 0; }
    if (e.state === 'ALERT' && e.stateT > def.alertTime + 0.6) e.stateT = 0;
    if (e.state === 'DEAD') e.deathT += h;
    e.hit.t = Math.max(0, e.hit.t - h);
    if (A.hit && e.hit.t === 0 && e.stateT % 1.2 < h) { e.applyDamage(0, A.hit, { dir: { x: 0, y: -1, z: 0 } }); e.pain = false; }
    stepPose(e, h);
    animateHollow(e, inst.bones, anim, h, 2);
    for (const x of extras) animateHollow(e, x.inst.bones, x.anim, h, 2);
  }
}
// hit-zone overlay (sim cells → metres; sim (x, y, z) → three (x, z, y))
const hbMat = new THREE.MeshBasicMaterial({ color: 0x40ff90, wireframe: true, transparent: true, opacity: 0.45, depthTest: false });
const hbMeshes = [new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hbMat), new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hbMat), new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hbMat), new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), hbMat)];
const hbGroup = new THREE.Group(); hbGroup.add(...hbMeshes); hbGroup.visible = params.get('hb') === '1'; scene.add(hbGroup);
function syncHitboxes() {
  if (!hbGroup.visible) return;
  const hb = e.hitboxes();
  for (let i = 0; i < 3; i++) { hbMeshes[i].position.set(hb[i].cx * 2, hb[i].cz * 2, hb[i].cy * 2); hbMeshes[i].scale.setScalar(hb[i].r * 2); }
  const c = hb[3]; hbMeshes[3].position.set(c.cx * 2, (c.z0 + c.z1), c.cy * 2); hbMeshes[3].scale.set(c.r * 2, (c.z1 - c.z0) * 2, c.r * 2);
  hbGroup.visible = e.alive;
}
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const VIEWS = { 'Спереди': [0, 0.08, 4.6], 'Профиль': [Math.PI / 2, 0.08, 4.6], 'Сзади': [Math.PI, 0.1, 4.6], '3/4': [0.65, 0.12, 4.6], 'Лицо': [0.25, 0.02, 1.3] };
let yaw = 0.5, pitch = 0.1, dist = lineup ? 6.2 : 4.6;
const target = new THREE.Vector3(0, 0.95, 0), faceTarget = new THREE.Vector3(0, 1.62, 0.12);
function place() {
  const tgt = dist < 2 ? faceTarget : target;
  camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(tgt);
}
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const anims = document.getElementById('anims'), views = document.getElementById('views');
for (const n of Object.keys(ANIMS)) { const b = document.createElement('button'); b.textContent = n.toUpperCase(); b.dataset.a = n; b.onclick = () => setAnim(n); anims.appendChild(b); }
for (const [n, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { [yaw, pitch, dist] = v; }; views.appendChild(b); }
{
  const box = document.createElement('div'); box.id = 'variants'; views.after(box);
  for (const v of VARIANT_IDS) { const b = document.createElement('button'); b.textContent = v.toUpperCase(); b.dataset.v = v; b.classList.toggle('on', v === variant && !lineup); b.onclick = () => setVariant(v); box.appendChild(b); }
}
{ const b = document.createElement('button'); b.textContent = 'ХИТБОКСЫ'; b.onclick = () => { hbGroup.visible = !hbGroup.visible; b.classList.toggle('on', hbGroup.visible); }; views.appendChild(b); }
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
  syncHitboxes(); place(); renderer.render(scene, camera);
});
const v3 = new THREE.Vector3();
window.__iv = {
  setAnim, advance, setView: (y, p, d) => { yaw = y; pitch = p; dist = d; }, get inst() { return inst; }, get e() { return e; }, get anim() { return anim; },
  get tris() { return getHollowAssets(lineup ? 'technician' : variant).tris; }, animNames: Object.keys(ANIMS),
  setVariant, get variant() { return variant; }, variants: VARIANT_IDS, trisOf: v => getHollowAssets(v).tris, lineup,
  showHitboxes: on => { hbGroup.visible = on; },
  bonePos: n => { inst.group.updateMatrixWorld(true); return inst.bones[n].getWorldPosition(v3).toArray(); },
  bones: () => { inst.group.updateMatrixWorld(true); return Object.fromEntries(Object.entries(inst.bones).map(([n, b]) => [n, b.getWorldPosition(v3).toArray()])); },
  /** Sim hit zones in viewer metres: [{zone, part, x, y, z, r}] */
  hitboxes: () => e.hitboxes().map(h => h.kind === 'sphere' ? { zone: h.zone, part: h.part || 'head', x: h.cx * 2, y: h.cz * 2, z: h.cy * 2, r: h.r * 2 } : { zone: h.zone, part: h.part, x: h.cx * 2, y0: h.z0 * 2, y1: h.z1 * 2, z: h.cy * 2, r: h.r * 2 }),
  headCentre: () => { inst.group.updateMatrixWorld(true); return v3.set(0, 0.085, 0.015).applyMatrix4(inst.bones.head.matrixWorld).toArray(); },
  render: () => { syncHitboxes(); place(); renderer.render(scene, camera); },
};
