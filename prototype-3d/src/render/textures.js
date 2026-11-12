// Procedural low-resolution pixel textures (no external assets). Deterministic (seeded).
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

function makeTexture(w, h, seed, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 1;
  return t;
}

function noise(g, w, h, r, amount) {
  for (let i = 0; i < w * h * 0.25; i++) {
    const v = (r() - 0.5) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect((r() * w) | 0, (r() * h) | 0, 1, 1);
  }
}

// Walls: 32×48 px per face = 2 m × 3 m, so pixels stay square.
function blockWall(base, mortar, seed, stripe) {
  return makeTexture(32, 48, seed, (g, w, h, r) => {
    g.fillStyle = rgb(...mortar); g.fillRect(0, 0, w, h);
    const rowH = 6;
    for (let row = 0; row * rowH < h; row++) {
      const off = row % 2 ? 8 : 0;
      for (let x = -off; x < w; x += 16) {
        const k = 0.82 + r() * 0.3;
        g.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
        g.fillRect(x + 1, row * rowH + 1, 14, rowH - 1);
      }
    }
    if (stripe) { g.fillStyle = stripe; g.fillRect(0, 12, w, 4); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h - 3, w, 3); // dark base line, as in 1.2/1.3
    noise(g, w, h, r, 0.18);
  });
}

// OUTPOST ZERO (M1.7): painted concrete wall panels — grey-green dado, pale upper wall, a dark service stripe,
// panel seams. 32×48 px per 2 m × 3 m face like the brick walls (same pixel scale).
function panelWall(seed) {
  return makeTexture(32, 48, seed, (g, w, h, r) => {
    g.fillStyle = rgb(98, 100, 97); g.fillRect(0, 0, w, h);          // upper wall, worn grey
    g.fillStyle = rgb(70, 86, 80); g.fillRect(0, 30, w, 18);           // dado (bottom 1.1 m), grey-green paint
    g.fillStyle = rgb(58, 66, 64); g.fillRect(0, 29, w, 2);            // service stripe
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 1, h); g.fillRect(16, 0, 1, 30); // panel seams
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h - 2, w, 2);       // skirting
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(60,48,36,${0.08 + r() * 0.1})`; g.fillRect((r() * w) | 0, 30 + ((r() * 14) | 0), 1, 3 + ((r() * 6) | 0)); } // drips / dirt
    noise(g, w, h, r, 0.14);
  });
}

// ---------------------------------------------------------------- M1.8: high-resolution OUTPOST ZERO surfaces
// 128 px per metre on walls (M1.7: 16), 128 px/m on the floor (M1.7: 8), linear + mip-mapped + anisotropic filtering
// instead of nearest-neighbour. Each surface also returns a grey-scale bump map drawn from the same features
// (seams, chips, cracks). Still procedural and deterministic (no image files).
function vn2(x, y, seed) { // value noise 0..1
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
}
/** Paint a surface pixel by pixel: fn(x, y) → [r, g, b, height 0..1] (sRGB 0..255). Tileable when fn wraps. */
function hiRes(w, h, fn, { repeat = [1, 1], anisotropy = 8 } = {}) {
  const c = document.createElement('canvas'), b = document.createElement('canvas'); c.width = b.width = w; c.height = b.height = h;
  const g = c.getContext('2d'), gb = b.getContext('2d'), img = g.createImageData(w, h), bimg = gb.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, bb, hh] = fn(x, y), i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
    const v = Math.max(0, Math.min(255, hh * 255)); bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v; bimg.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); gb.putImageData(bimg, 0, 0);
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = anisotropy; return t; };
  const map = mk(c, true); map.userData.bump = mk(b, false);
  return map;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Painted concrete wall panel, 2 m × 3 m face = 256 × 384 px: pale upper wall, grey-green dado, stripe, seams, wear. */
function outpostWall(seed, tint = [1, 1, 1]) {
  const W = 256, H = 384, dadoY = 240; // dado from 1.875 m down
  return hiRes(W, H, (x, y) => {
    const n1 = vn2(x / 40, y / 40, seed), n2 = vn2(x / 9, y / 9, seed + 1), n3 = vn2(x / 2.2, y / 2.2, seed + 2);
    const streak = smooth(0.55, 0.9, vn2(x / 6, y / 90, seed + 3)) * (1 - y / H) * 0.6;           // water streaks from the top
    const crack = Math.abs(vn2(x / 30, y / 30, seed + 4) - 0.5) < 0.005 && vn2(x / 80, y / 80, seed + 5) > 0.7 ? 1 : 0; // thin, rare hairline cracks
    let c, hgt = 0.5 + (n3 - 0.5) * 0.12;
    if (y < dadoY) { const v = 120 + (n1 - 0.5) * 14 + (n2 - 0.5) * 8 + (n3 - 0.5) * 6 - streak * 22; c = [v * tint[0], (v + 2) * tint[1], (v - 2) * tint[2]]; }
    else {
      const chip = smooth(0.7, 0.74, vn2(x / 7, y / 7, seed + 6)) * smooth(0.45, 0.7, vn2(x / 40, y / 25, seed + 7)); // paint chipped off
      const kick = smooth(H - 40, H - 4, y) * smooth(0.4, 0.8, n2) * 0.5;                    // boot scuffs at the bottom
      const v = (n1 - 0.5) * 10 + (n3 - 0.5) * 6;
      c = [76 + v, 96 + v, 90 + v].map((q, i) => q * (1 - chip) + [92, 90, 86][i] * chip - kick * 25);
      hgt -= chip * 0.25;
      const rust = smooth(0.8, 0.95, vn2(x / 3, y / 50, seed + 8)) * smooth(dadoY, H, y) * 0.5;
      c = c.map((q, i) => q * (1 - rust) + [78, 46, 28][i] * rust);
    }
    if (y >= dadoY - 6 && y < dadoY + 4) { c = [52, 60, 58].map(q => q + (n3 - 0.5) * 6); hgt += 0.1; }      // service stripe
    if (x < 2 || x === W - 1 || (x >= 127 && x <= 129 && y < dadoY)) { c = c.map(q => q * 0.62); hgt -= 0.35; } // panel seams
    if (y > H - 14) { c = [34, 35, 34].map(q => q + (n3 - 0.5) * 6); hgt += 0.15; }                         // skirting board
    if (crack) { c = c.map(q => q * 0.78); hgt -= 0.2; }
    for (const [bx, by] of [[10, 10], [118, 10], [138, 10], [246, 10], [10, dadoY - 16], [246, dadoY - 16]]) if ((x - bx) ** 2 + (y - by) ** 2 < 5) { c = [70, 70, 68]; hgt += 0.3; } // bolts
    return [c[0], c[1], c[2], hgt];
  }, { anisotropy: 4 });
}
function outpostFloor(seed, W, H) { // 256 px per 2 m cell: concrete slab, seams, cracks, stains, grit
  return hiRes(256, 256, (x, y) => {
    const n1 = vn2(x / 50, y / 50, seed), n2 = vn2(x / 10, y / 10, seed + 1), n3 = vn2(x / 2, y / 2, seed + 2);
    let v = 84 + (n1 - 0.5) * 16 + (n2 - 0.5) * 8 + (n3 - 0.5) * 9, hgt = 0.5 + (n3 - 0.5) * 0.15;
    const stain = smooth(0.62, 0.8, vn2(x / 35 + 4, y / 35, seed + 3)); v -= stain * 12;
    if (x < 3 || y < 3) { v *= 0.6; hgt -= 0.4; }                                                   // slab joints
    if (Math.abs(vn2(x / 24, y / 24, seed + 4) - 0.5) < 0.005 && vn2(x / 60, y / 60, seed + 5) > 0.68) { v *= 0.78; hgt -= 0.2; } // hairline cracks
    if (vn2(x * 0.9, y * 0.9, seed + 6) > 0.93) { v += 14; hgt += 0.2; }                               // grit
    return [v, v * 0.99, v * 0.96, hgt];
  }, { repeat: [W, H], anisotropy: 8 });
}
function outpostCeiling(seed, W, H) { // 128 px per 2 m cell: 2 × 2 suspended panels on a grid
  return hiRes(128, 128, (x, y) => {
    const n = vn2(x / 8, y / 8, seed), stain = smooth(0.7, 0.9, vn2(x / 30, y / 30, seed + 1));
    let v = 54 + (n - 0.5) * 6 - stain * 8, hgt = 0.5;
    if (x % 64 < 2 || y % 64 < 2) { v = 30; hgt = 0.2; }
    return [v, v + 2, v + 6, hgt];
  }, { repeat: [W, H], anisotropy: 4 });
}

export function createTextures(map) {
  const W = map.grid[0].length, H = map.grid.length;
  if (map.style === 'outpost') {
    return {
      // M1.8: high-resolution surfaces (the M1.7 32×48 / 16×16 px textures were the 'blocky blur' on phones)
      panel: outpostWall(71), concrete: outpostWall(72, [0.97, 0.98, 1.0]), red: outpostWall(73, [1.02, 0.98, 0.96]), green: outpostWall(74, [0.98, 1.02, 0.99]),
      floor: outpostFloor(81, W, H),
      ceiling: outpostCeiling(82, W, H),
    };
  }
  return {
    concrete: blockWall([92, 96, 112], [40, 42, 50], 11),
    red: blockWall([122, 46, 58], [44, 20, 26], 22, 'rgba(232,73,82,0.55)'),
    green: blockWall([70, 104, 98], [26, 40, 38], 33),
    floor: makeTexture(16, 16, 44, (g, w, h, r) => {
      g.fillStyle = rgb(52, 47, 50); g.fillRect(0, 0, w, h);
      g.fillStyle = rgb(62, 56, 58); g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      g.fillStyle = rgb(30, 27, 30); g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
      noise(g, w, h, r, 0.2);
    }, [W, H]),
    ceiling: makeTexture(16, 16, 55, (g, w, h, r) => {
      g.fillStyle = rgb(30, 33, 42); g.fillRect(0, 0, w, h);
      g.fillStyle = rgb(20, 22, 29); g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(0, 8, w, 1);
      noise(g, w, h, r, 0.15);
    }, [W, H]),
  };
}
