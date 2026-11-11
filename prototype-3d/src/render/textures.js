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

export function createTextures(map) {
  const W = map.grid[0].length, H = map.grid.length;
  if (map.style === 'outpost') {
    return {
      panel: panelWall(71), concrete: panelWall(72), red: panelWall(73), green: panelWall(74),
      floor: makeTexture(16, 16, 81, (g, w, h, r) => { // worn concrete floor tiles (1 per cell)
        g.fillStyle = rgb(56, 55, 53); g.fillRect(0, 0, w, h);
        g.fillStyle = rgb(76, 75, 72); g.fillRect(1, 1, 7, 7); g.fillRect(9, 9, 6, 6);
        g.fillStyle = rgb(42, 42, 41); g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
        noise(g, w, h, r, 0.2);
      }, [W, H]),
      ceiling: makeTexture(16, 16, 82, (g, w, h, r) => { // suspended ceiling panels
        g.fillStyle = rgb(40, 43, 48); g.fillRect(0, 0, w, h);
        g.fillStyle = rgb(30, 32, 37); g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(0, 8, w, 1); g.fillRect(8, 0, 1, h);
        noise(g, w, h, r, 0.14);
      }, [W, H]),
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
