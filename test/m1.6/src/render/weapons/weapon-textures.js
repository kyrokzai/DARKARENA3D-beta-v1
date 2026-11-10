// Procedural weapon textures (canvas, no external assets). Created once and shared by every RAVEN instance.
import * as THREE from 'three';

let cache = null;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = 1, srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}

/** Worn finish: light base with fine grain, scuffs and edge wear (multiplied with the material colour). */
function wear(seed) {
  const [c, g] = canvas(256, 256), r = rng(seed);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 190 + r() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 70; i++) { // scratches
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 6 + r() * 30;
    g.strokeStyle = r() < 0.6 ? '#ffffff' : '#9a9a9a'; g.lineWidth = r() < 0.8 ? 0.6 : 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}
/** Roughness variation for the same wear (white = rough). */
function roughness(seed) {
  const [c, g] = canvas(128, 128), r = rng(seed);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) { const v = 150 + r() * 105 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  return c;
}
/** 2×2 twill carbon weave. */
function carbon() {
  const [c, g] = canvas(128, 128);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const on = ((x + y) >> 1) % 2 === 0;
    const grd = g.createLinearGradient(x * 8, y * 8, x * 8 + (on ? 8 : 0), y * 8 + (on ? 0 : 8));
    grd.addColorStop(0, on ? '#9c9c9c' : '#6a6a6a'); grd.addColorStop(0.5, on ? '#e2e2e2' : '#a8a8a8'); grd.addColorStop(1, on ? '#8a8a8a' : '#5c5c5c');
    g.fillStyle = grd; g.fillRect(x * 8, y * 8, 8, 8);
  }
  return c;
}
/** Raven wings logo (white on transparent; tinted by the emblem material). */
function ravenLogo() {
  const [c, g] = canvas(256, 160);
  g.fillStyle = '#fff';
  g.translate(128, 70);
  const wing = s => {
    g.save(); g.scale(s, 1);
    g.beginPath();
    g.moveTo(6, 10); g.lineTo(112, -46); g.lineTo(96, -24); g.lineTo(118, -30); g.lineTo(92, -6); g.lineTo(108, -8);
    g.lineTo(78, 12); g.lineTo(90, 14); g.lineTo(54, 30); g.lineTo(18, 34); g.closePath(); g.fill();
    g.restore();
  };
  wing(1); wing(-1);
  g.beginPath(); g.moveTo(0, -8); g.lineTo(13, 14); g.lineTo(5, 52); g.lineTo(0, 64); g.lineTo(-5, 52); g.lineTo(-13, 14); g.closePath(); g.fill(); // body
  g.beginPath(); g.moveTo(0, -20); g.lineTo(8, -8); g.lineTo(0, -2); g.lineTo(-8, -8); g.closePath(); g.fill(); // head
  return c;
}
/** Receiver markings. */
function markings() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#fff'; g.font = '900 34px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText('DA-R1', 6, 24);
  g.font = '700 13px Arial, sans-serif'; g.fillText('RAVEN · 5.56 · DARK ARENA', 8, 50);
  return c;
}
/** Red-dot reticle: transparent centre dot + faint ring (additive on the lens). */
function reticle() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 10);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 10, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
  return c;
}
/** Muzzle flash sprite (star burst). */
function flash() {
  const [c, g] = canvas(128, 128);
  g.translate(64, 64);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.18, 'rgba(255,200,90,0.95)'); grd.addColorStop(0.5, 'rgba(255,120,30,0.35)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = i % 2 ? 22 : 62; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  return c;
}
/** Soft smoke puff. */
function smoke() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(210,210,215,0.55)'); grd.addColorStop(1, 'rgba(210,210,215,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return c;
}
/** Bullet hole decal for walls. */
function bulletHole() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.22, 'rgba(10,8,8,0.95)'); grd.addColorStop(0.4, 'rgba(40,36,34,0.6)'); grd.addColorStop(1, 'rgba(60,55,50,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return c;
}

export function getWeaponTextures() {
  if (cache) return cache;
  cache = {
    wear: tex(wear(7), { repeat: 5 }),
    rough: tex(roughness(9), { repeat: 7, srgb: false }),
    carbon: tex(carbon(), { repeat: 9 }),
    logo: tex(ravenLogo(), { wrap: false }),
    markings: tex(markings(), { wrap: false }),
    reticle: tex(reticle(), { wrap: false }),
    flash: tex(flash(), { wrap: false }),
    smoke: tex(smoke(), { wrap: false }),
    hole: tex(bulletHole(), { wrap: false }),
  };
  return cache;
}
