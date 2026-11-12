// Procedural surface maps for the first-person viewmodel (M1.9): canvas height fields → tangent-space normal maps
// (+ roughness), generated once at load, shared by every instance. No external assets (rule 3).
//
// Convention: three.js normal maps are OpenGL style (green = +V). Canvas rows grow downwards while V grows upwards
// (CanvasTexture flipY), so n = (−∂h/∂u, +∂h/∂row, 1).
import * as THREE from 'three';

export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Tileable value noise on an n×n grid with `cells` lattice cells (smooth, wraps at the edges). Returns Float32Array. */
export function tileNoise(n, cells, seed, octaves = 3) {
  const out = new Float32Array(n * n), r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o, lat = new Float32Array(c * c); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / n * c, fy = y / n * c, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = lat[(y0 % c) * c + x0 % c], b = lat[(y0 % c) * c + (x0 + 1) % c], cc = lat[((y0 + 1) % c) * c + x0 % c], d = lat[((y0 + 1) % c) * c + (x0 + 1) % c];
      out[y * n + x] += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Height field (Float32Array n×n, any units) → normal-map canvas. strength scales the slopes. Wraps at edges. */
export function heightToNormal(h, n, strength = 1) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xl = (x + n - 1) % n, xr = (x + 1) % n, yu = (y + n - 1) % n, yd = (y + 1) % n;
    const dx = (h[y * n + xr] - h[y * n + xl]) * 0.5 * strength, dy = (h[yd * n + x] - h[yu * n + x]) * 0.5 * strength;
    const l = Math.hypot(dx, dy, 1), k = (y * n + x) * 4;
    d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
/** Scalar field 0..1 → grey canvas (roughness / ao). */
export function greyCanvas(v, n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  for (let i = 0; i < n * n; i++) { const q = Math.max(0, Math.min(255, v[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = q; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
export function dataTexture(canvas, { repeat = [1, 1], srgb = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  return t;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ hands
/** Synthetic glove leather: soft pebble grain + fine pores (tiling). */
export function gloveGrain(n = 256) {
  const a = tileNoise(n, 24, 11, 2), b = tileNoise(n, 64, 12, 1), h = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) h[i] = Math.pow(a[i], 1.6) * 1.2 + b[i] * 0.35;
  return h;
}
/**
 * One finger segment (lathe UV: u around the finger, 0 = palm side; v along it, 0 = base joint).
 * Joint creases near both ends, flex wrinkles across the back over the joints, side seams with stitches (u = 0.25 / 0.75).
 */
export function fingerHeight(n = 256) {
  const grain = gloveGrain(n), h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = 1 - y / n, k = y * n + x;
    let z = grain[k] * 0.5;
    const back = smooth(0.15, 0.4, Math.abs(u - 0.5) < 0.5 ? 1 - Math.abs(u - 0.5) * 2 : 0); // 1 on the back of the finger
    // creases at the joints (both ends), deeper on the palm side
    for (const c of [0.12, 0.9]) z -= Math.exp(-((v - c) ** 2) / 0.0012) * (1.4 - back * 0.6);
    // flex wrinkles over the knuckle on the back
    z -= back * Math.max(0, Math.sin((v - 0.82) * 70)) * smooth(0.72, 0.84, v) * (1 - smooth(0.94, 1, v)) * 0.5;
    // side seams: a raised welt with stitches every ~1/14 of the length
    for (const su of [0.25, 0.75]) {
      const d = Math.abs(u - su), welt = Math.exp(-(d * d) / 0.00025);
      z += welt * 0.9 - Math.exp(-((d - 0.022) ** 2) / 0.00006) * 0.6;
      z -= Math.exp(-((d - 0.012) ** 2) / 0.00004) * (Math.sin(v * Math.PI * 28) > 0.55 ? 0.8 : 0);
    }
    h[k] = z;
  }
  return h;
}
/** Moulded knuckle / finger guards: matte rubber with fine ribs (tiling). */
export function rubberHeight(n = 128) {
  const h = new Float32Array(n * n), b = tileNoise(n, 32, 21, 1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = Math.pow(0.5 + 0.5 * Math.sin(y / n * Math.PI * 2 * 10), 3) * 0.8 + b[y * n + x] * 0.25;
  return h;
}
/**
 * Combat-shirt sleeve (lathe UV: u around, 0 = top/back-of-hand side; v along, 0 = wrist end).
 * Ribbed knit cuff near the wrist, twill weave, folds bunched near the wrist and long creases up the forearm.
 */
export function sleeveHeight(n = 512) {
  const h = new Float32Array(n * n), big = tileNoise(n, 6, 31, 2), fine = tileNoise(n, 96, 32, 1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = 1 - y / n, k = y * n + x;
    // twill: diagonal ribs (period ≈ 1/96 of the circumference)
    let z = Math.sin((x + y) / n * Math.PI * 2 * 96) * 0.045 + fine[k] * 0.08; // low amplitude: no stripe moiré at a distance
    if (v < 0.075) z = Math.pow(Math.abs(Math.sin(u * Math.PI * 2 * 40)), 0.6) * 0.5 - 0.25; // knit cuff ribs (along the arm)
    else {
      // bunching folds just above the cuff: rings that wobble around the arm
      const bunch = (1 - smooth(0.08, 0.38, v)) * smooth(0.075, 0.1, v);
      z += bunch * Math.sin(v * Math.PI * 2 * 7 + Math.sin(u * Math.PI * 2 * 2 + 1.3) * 1.6 + big[k] * 3) * 1.1;
      // long soft creases up the forearm
      z += (1 - bunch) * Math.sin(u * Math.PI * 2 * 3 + big[k] * 5 + v * 4) * 0.45 * smooth(0.25, 0.6, v);
      z -= Math.exp(-((v - 0.075) ** 2) / 0.00005) * 0.9; // seam where the cuff is sewn on
    }
    h[k] = z;
  }
  return h;
}

// ------------------------------------------------------------------ weapon
/** Stippled polymer (grip / stock / magazine): dense dimples + soft moulding waves. */
export function polymerHeight(n = 256) {
  const h = new Float32Array(n * n), w = tileNoise(n, 8, 41, 2), r = rng(42);
  for (let i = 0; i < h.length; i++) h[i] = w[i] * 0.4;
  for (let i = 0; i < 2600; i++) { // dimples (wrap around the edges)
    const cx = r() * n, cy = r() * n, rad = 1.2 + r() * 1.4;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y); if (d > rad) continue;
      const px = (Math.floor(cx) + x + n) % n, py = (Math.floor(cy) + y + n) % n;
      h[py * n + px] -= (1 - d / rad) * 0.9;
    }
  }
  return h;
}
/** Machined / anodised metal: very fine directional tool marks + soft waviness (subtle). */
export function metalHeight(n = 256) {
  const h = new Float32Array(n * n), w = tileNoise(n, 6, 51, 2), f = tileNoise(n, 128, 52, 1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const k = y * n + x; h[k] = w[k] * 0.6 + Math.sin(y / n * Math.PI * 2 * 64 + f[k] * 2) * 0.08 + f[k] * 0.1; }
  return h;
}
/** 2×2 twill carbon weave relief (matches weapon-textures carbon(): 16 tows across). */
export function carbonHeight(n = 128) {
  const h = new Float32Array(n * n), t = n / 16;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = Math.floor(x / t), cy = Math.floor(y / t), on = ((cx + cy) >> 1) % 2 === 0;
    const fx = (x % t) / t, fy = (y % t) / t, across = on ? fy : fx; // each tow is a rounded ridge
    h[y * n + x] = Math.sin(across * Math.PI) * 0.8 + (on ? 0.1 : 0);
  }
  return h;
}
/** Soft, low-frequency wear for roughness (replaces per-pixel noise that sparkled under the rim light). */
export function softRoughness(n, seed, base, amp) {
  const a = tileNoise(n, 10, seed, 3), out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = base + (a[i] - 0.5) * 2 * amp;
  return out;
}

let weaponMaps = null;
/** Shared weapon normal maps (by material slot) + a soft roughness map. */
export function getWeaponSurfaceMaps() {
  if (weaponMaps) return weaponMaps;
  weaponMaps = {
    polymer: dataTexture(heightToNormal(polymerHeight(256), 256, 1.6), { repeat: [12, 12] }), // fine stipple (≈ 1 mm): the big stock is right in front of the eye
    metal: dataTexture(heightToNormal(metalHeight(256), 256, 1.2), { repeat: [3, 3] }),
    carbon: dataTexture(heightToNormal(carbonHeight(128), 128, 2.4), { repeat: [9, 9] }),
    rough: dataTexture(greyCanvas(softRoughness(128, 61, 0.82, 0.12), 128), { repeat: [3, 3] }),
  };
  return weaponMaps;
}
