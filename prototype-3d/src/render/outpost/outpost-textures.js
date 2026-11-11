// OUTPOST ZERO textures — all procedural, drawn ONCE on small canvases at load (no network, no per-frame canvas work).
//  · surface atlas (512²): 4×4 cells of painted steel, louvers, cabinet doors, shelving, lockers, hazard stripes,
//    rack fronts, gauges, junction box, armoured glass, damaged panel, floor hatch, metal door, concrete, radio, vent
//  · sign atlas (512×256): bilingual Kazakh / Russian warning signs
//  · monitor atlas (512×256): 4×2 CCTV frames (corridors, perimeter, technical zone, sector isolation)
//  · steppe panorama (2048×512, cylindrical): dry autumn steppe, hills, dust, power line, old road, perimeter
//  · floor light-pool gradient (64²)
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTexture(c, { srgb = true, repeat = false, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  t.anisotropy = 2;
  return t;
}
const FONT = '"DejaVu Sans", "Arial", "Helvetica Neue", sans-serif';

// ---------------------------------------------------------------- surface atlas
export const ATLAS = { size: 512, cells: 4, pad: 4 };
export const R = { // region ids (column-major reading: id = row * 4 + col)
  steel: 0, louver: 1, cabinet: 2, shelves: 3, locker: 4, hazard: 5, rack: 6, gauges: 7,
  junction: 8, glass: 9, damaged: 10, hatch: 11, door: 12, concrete: 13, radio: 14, vent: 15,
};
/** UV rectangle of a region (inside the padding): [u0, v0, u1, v1]. */
export function regionUV(id) {
  const n = ATLAS.cells, c = ATLAS.size / n, p = ATLAS.pad / ATLAS.size;
  const col = id % n, row = Math.floor(id / n);
  const u0 = col / n + p, u1 = (col + 1) / n - p, v1 = 1 - row / n - p, v0 = 1 - (row + 1) / n + p;
  void c; return [u0, v0, u1, v1];
}
function grime(g, x, y, w, h, r, amount = 0.12, n = 900) {
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  const grad = g.createLinearGradient(0, y, 0, y + h); // dirt collects at the bottom
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(30,22,14,0.22)');
  g.fillStyle = grad; g.fillRect(x, y, w, h);
}
function rivets(g, x, y, w, h, step = 16) {
  g.fillStyle = 'rgba(40,40,40,0.55)';
  for (let i = x + 6; i < x + w - 4; i += step) { g.fillRect(i, y + 5, 2, 2); g.fillRect(i, y + h - 7, 2, 2); }
}
function drawSurfaceAtlas() {
  const S = ATLAS.size, n = ATLAS.cells, c = S / n, cv = canvas(S, S), g = cv.getContext('2d'), r = rng(7);
  const cell = (id, fn) => { const x = (id % n) * c, y = Math.floor(id / n) * c; g.save(); g.beginPath(); g.rect(x, y, c, c); g.clip(); fn(x, y, c); g.restore(); };
  // 0 steel: painted sheet, seams, rivets
  cell(R.steel, (x, y, s) => {
    g.fillStyle = '#c9ccc9'; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + s / 2, s, 2); g.fillRect(x + s / 2, y, 2, s);
    rivets(g, x, y, s, s / 2); rivets(g, x, y + s / 2, s, s / 2);
    grime(g, x, y, s, s, r, 0.16);
    g.strokeStyle = 'rgba(70,60,50,0.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); const sx = x + r() * s, sy = y + r() * s; g.moveTo(sx, sy); g.lineTo(sx + (r() - 0.5) * 30, sy + r() * 8); g.stroke(); }
  });
  // 1 louver
  cell(R.louver, (x, y, s) => {
    g.fillStyle = '#b8bcb6'; g.fillRect(x, y, s, s);
    for (let i = 10; i < s - 8; i += 9) { g.fillStyle = '#2a2c2c'; g.fillRect(x + 10, y + i, s - 20, 4); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 10, y + i + 4, s - 20, 1); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, s - 12, s - 12);
    grime(g, x, y, s, s, r, 0.14);
  });
  // 2 cabinet door: handle, vent slots, label plate
  cell(R.cabinet, (x, y, s) => {
    g.fillStyle = '#c4c8c6'; g.fillRect(x, y, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, s - 10, s - 10);
    g.fillStyle = '#2a2b2c'; for (let i = 0; i < 5; i++) g.fillRect(x + 22, y + 16 + i * 7, s - 44, 3);
    g.fillStyle = '#1e1f20'; g.fillRect(x + s - 22, y + s / 2 - 14, 6, 28);
    g.fillStyle = '#e8e4d0'; g.fillRect(x + 22, y + s - 34, 46, 14); g.fillStyle = '#333'; g.fillRect(x + 25, y + s - 30, 34, 2); g.fillRect(x + 25, y + s - 26, 24, 2);
    grime(g, x, y, s, s, r, 0.15);
  });
  // 3 shelves seen through a mesh door: boxes, crates, cable reels
  cell(R.shelves, (x, y, s) => {
    g.fillStyle = '#1b1d1f'; g.fillRect(x, y, s, s);
    for (let k = 0; k < 4; k++) {
      const sy = y + 8 + k * 30; g.fillStyle = '#6b6f71'; g.fillRect(x + 4, sy + 24, s - 8, 4);
      for (let bx = x + 8; bx < x + s - 16;) { const bw = 12 + r() * 22, bh = 10 + r() * 13; const tone = r(); g.fillStyle = tone < 0.4 ? '#8a7350' : tone < 0.7 ? '#5d6a5a' : '#7c7f86'; g.fillRect(bx, sy + 24 - bh, bw, bh); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx, sy + 24 - bh, bw, 2); bx += bw + 3 + r() * 6; }
    }
    g.strokeStyle = 'rgba(190,195,195,0.45)'; g.lineWidth = 1; for (let i = 0; i < s; i += 6) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + s); g.stroke(); g.beginPath(); g.moveTo(x, y + i); g.lineTo(x + s, y + i); g.stroke(); }
    g.strokeStyle = '#b9bdbb'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, s - 6, s - 6);
  });
  // 4 locker door
  cell(R.locker, (x, y, s) => {
    g.fillStyle = '#aeb9ae'; g.fillRect(x, y, s, s);
    for (let k = 0; k < 2; k++) { const lx = x + k * s / 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.strokeRect(lx + 3, y + 3, s / 2 - 6, s - 6); g.fillStyle = '#2b2d2d'; for (let i = 0; i < 4; i++) g.fillRect(lx + 14, y + 12 + i * 6, s / 2 - 28, 3); g.fillStyle = '#1c1c1c'; g.fillRect(lx + s / 2 - 14, y + s / 2, 4, 14); }
    grime(g, x, y, s, s, r, 0.17);
  });
  // 5 hazard stripes
  cell(R.hazard, (x, y, s) => {
    g.fillStyle = '#d9b23a'; g.fillRect(x, y, s, s); g.fillStyle = '#1c1c1c';
    for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + 16, y); g.lineTo(x + i + 16 - s, y + s); g.lineTo(x + i - s, y + s); g.closePath(); g.fill(); }
    grime(g, x, y, s, s, r, 0.22, 1400);
  });
  // 6 rack front: units, slots, small labels
  cell(R.rack, (x, y, s) => {
    g.fillStyle = '#25282b'; g.fillRect(x, y, s, s);
    for (let i = 0; i < 8; i++) { const uy = y + 6 + i * 15; g.fillStyle = i % 3 === 0 ? '#3a3f44' : '#30343a'; g.fillRect(x + 8, uy, s - 16, 12); g.fillStyle = '#121416'; for (let k = 0; k < 10; k++) g.fillRect(x + 14 + k * 9, uy + 4, 5, 4); g.fillStyle = '#9aa0a6'; g.fillRect(x + s - 22, uy + 3, 8, 2); }
    g.fillStyle = '#4a4f55'; g.fillRect(x + 4, y, 4, s); g.fillRect(x + s - 8, y, 4, s);
  });
  // 7 gauges panel
  cell(R.gauges, (x, y, s) => {
    g.fillStyle = '#5c6862'; g.fillRect(x, y, s, s);
    for (let k = 0; k < 4; k++) { const cx = x + 32 + (k % 2) * 64, cy = y + 34 + Math.floor(k / 2) * 60; g.fillStyle = '#ece6d4'; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1; for (let t = 0; t < 9; t++) { const a = Math.PI * 0.8 + t / 8 * Math.PI * 1.4; g.beginPath(); g.moveTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); g.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); g.stroke(); } const a = Math.PI * 0.9 + r() * Math.PI * 1.2; g.strokeStyle = '#b02020'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); g.stroke(); }
    grime(g, x, y, s, s, r, 0.15);
  });
  // 8 junction box
  cell(R.junction, (x, y, s) => {
    g.fillStyle = '#8f9a92'; g.fillRect(x, y, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x + 8, y + 8, s - 16, s - 16);
    g.fillStyle = '#d9b23a'; g.beginPath(); g.moveTo(x + s / 2, y + 24); g.lineTo(x + s / 2 + 20, y + 58); g.lineTo(x + s / 2 - 20, y + 58); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.font = `bold 26px ${FONT}`; g.textAlign = 'center'; g.fillText('⚡', x + s / 2, y + 54);
    g.fillStyle = '#333'; g.fillRect(x + 20, y + s - 30, s - 40, 4);
    grime(g, x, y, s, s, r, 0.18);
  });
  // 9 armoured glass (dark, a faint lit interior and reflections)
  cell(R.glass, (x, y, s) => {
    const gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, '#2c3a40'); gr.addColorStop(1, '#151d22'); g.fillStyle = gr; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(160,190,200,0.10)'; g.beginPath(); g.moveTo(x + 10, y + s); g.lineTo(x + 40, y); g.lineTo(x + 62, y); g.lineTo(x + 32, y + s); g.fill();
    g.fillStyle = 'rgba(255,230,180,0.10)'; g.fillRect(x + 70, y + 60, 40, 20);
    grime(g, x, y, s, s, r, 0.10, 500);
  });
  // 10 damaged panel: dents, rust, torn corner
  cell(R.damaged, (x, y, s) => {
    g.fillStyle = '#9ea39c'; g.fillRect(x, y, s, s);
    for (let i = 0; i < 6; i++) { const cx = x + r() * s, cy = y + r() * s, rr = 6 + r() * 14; const gr = g.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, rr); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill(); }
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${120 + r() * 40},${60 + r() * 20},20,${0.25 + r() * 0.3})`; g.fillRect(x + r() * s, y + r() * s, 4 + r() * 18, 2 + r() * 10); }
    g.fillStyle = '#1b1c1c'; g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s - 34, y); g.lineTo(x + s, y + 26); g.fill();
    grime(g, x, y, s, s, r, 0.2);
  });
  // 11 floor hatch
  cell(R.hatch, (x, y, s) => {
    g.fillStyle = '#5a5c5c'; g.fillRect(x, y, s, s);
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, s - 16, s - 16);
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 18; i < s - 18; i += 10) g.fillRect(x + 18, y + i, s - 36, 3);
    g.fillStyle = '#d9b23a'; g.fillRect(x + 8, y + 8, 18, 6); g.fillRect(x + s - 26, y + s - 14, 18, 6);
    grime(g, x, y, s, s, r, 0.2);
  });
  // 12 metal double door with wire-glass slits
  cell(R.door, (x, y, s) => {
    g.fillStyle = '#7d8a86'; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + s / 2 - 1, y, 2, s);
    for (const k of [0, 1]) { const dx = x + k * s / 2; g.fillStyle = '#1f2a2e'; g.fillRect(dx + 16, y + 14, s / 2 - 32, 30); g.strokeStyle = 'rgba(200,200,200,0.3)'; for (let i = 0; i < 30; i += 6) { g.beginPath(); g.moveTo(dx + 16, y + 14 + i); g.lineTo(dx + s / 2 - 16, y + 14 + i); g.stroke(); } g.fillStyle = '#d0d4d0'; g.fillRect(dx + (k ? 8 : s / 2 - 14), y + s / 2 + 6, 6, 18); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(dx + 10, y + s - 24, s / 2 - 20, 12); }
    grime(g, x, y, s, s, r, 0.2);
  });
  // 13 concrete
  cell(R.concrete, (x, y, s) => {
    g.fillStyle = '#a6a39b'; g.fillRect(x, y, s, s);
    grime(g, x, y, s, s, r, 0.2, 2000);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(x + r() * s, y + r() * s, 1 + r() * 2, 0, 7); g.fill(); }
  });
  // 14 radio / comm panel
  cell(R.radio, (x, y, s) => {
    g.fillStyle = '#3c4440'; g.fillRect(x, y, s, s);
    g.fillStyle = '#16191a'; g.fillRect(x + 10, y + 12, s - 20, 26); g.fillStyle = '#7cd4a0'; g.font = `bold 14px ${FONT}`; g.fillText('148.250', x + 18, y + 31);
    for (let k = 0; k < 4; k++) { g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x + 22 + k * 28, y + 62, 9, 0, 7); g.fill(); g.fillStyle = '#9a9a9a'; g.fillRect(x + 21 + k * 28, y + 54, 2, 7); }
    g.fillStyle = '#121212'; for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) g.fillRect(x + 18 + j * 12, y + 84 + i * 6, 8, 3);
    grime(g, x, y, s, s, r, 0.12);
  });
  // 15 vent grille
  cell(R.vent, (x, y, s) => {
    g.fillStyle = '#a7aca8'; g.fillRect(x, y, s, s);
    g.fillStyle = '#1a1b1b'; for (let i = 14; i < s - 12; i += 8) g.fillRect(x + 12, y + i, s - 24, 5);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, s - 12, s - 12);
    grime(g, x, y, s, s, r, 0.18);
  });
  return cv;
}

// ---------------------------------------------------------------- signs (Kazakh / Russian)
export const SIGNS = { noEntry: 0, danger: 1, sector: 2, comms: 3, post: 4, isolation: 5, generator: 6, highVoltage: 7 }; // 4 × 2 atlas
export const SIGN_TEXT = {
  noEntry: ['КІРУГЕ БОЛМАЙДЫ', 'ВХОД ЗАПРЕЩЁН'],
  danger: ['ҚАУІПТІ АЙМАҚ', 'ОПАСНАЯ ЗОНА'],
  sector: ['СЕКТОР 01'],
  comms: ['БАЙЛАНЫС', 'СВЯЗЬ'],
  post: ['КПП', 'ПОСТ ОХРАНЫ'],
  isolation: ['САҚТАНЫҢЫЗ', 'СЕКТОР ИЗОЛИРОВАН'],
  generator: ['ГЕНЕРАТОР', 'ГЕНЕРАТОРНАЯ'],
  highVoltage: ['ЖОҒАРЫ КЕРНЕУ', 'ВЫСОКОЕ НАПРЯЖЕНИЕ'],
};
export function signUV(name) { const i = SIGNS[name], col = i % 4, row = Math.floor(i / 4), p = 2 / 512; return [col / 4 + p, 1 - (row + 1) / 2 + p * 2, (col + 1) / 4 - p, 1 - row / 2 - p * 2]; }
function drawSigns() {
  const W = 512, H = 256, cw = W / 4, ch = H / 2, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(31);
  const fit = (text, maxW, size, weight = 'bold') => { let s = size; do { g.font = `${weight} ${s}px ${FONT}`; s--; } while (g.measureText(text).width > maxW && s > 8); };
  const panel = (i, bg, fg, border, lines, sizes, icon = null) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    g.fillStyle = bg; g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let top = y + (icon ? 62 : 34) + (lines.length === 1 ? 26 : 0);
    if (icon) icon(x + cw / 2, y + 34);
    lines.forEach((t, k) => { fit(t, cw - 22, sizes[k]); g.fillText(t, x + cw / 2, top + k * (sizes[k] + 8)); });
    grime(g, x + 3, y + 3, cw - 6, ch - 6, r, 0.14, 500);
  };
  const warnTri = (cx, cy) => { g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 25, cy + 20); g.lineTo(cx - 25, cy + 20); g.closePath(); g.fill(); g.fillStyle = '#e2b62f'; g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx + 16, cy + 15); g.lineTo(cx - 16, cy + 15); g.closePath(); g.fill(); g.fillStyle = '#1b1b1b'; g.font = `bold 22px ${FONT}`; g.fillText('!', cx, cy + 5); };
  const noCircle = (cx, cy) => { g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.stroke(); g.beginPath(); g.moveTo(cx - 14, cy - 14); g.lineTo(cx + 14, cy + 14); g.stroke(); };
  const bolt = (cx, cy) => { g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(cx + 4, cy - 22); g.lineTo(cx - 12, cy + 4); g.lineTo(cx - 1, cy + 4); g.lineTo(cx - 6, cy + 22); g.lineTo(cx + 12, cy - 4); g.lineTo(cx + 1, cy - 4); g.closePath(); g.fill(); };
  panel(SIGNS.noEntry, '#b3242c', '#ffffff', '#ffffff', SIGN_TEXT.noEntry, [17, 17], noCircle);
  panel(SIGNS.danger, '#e2b62f', '#1b1b1b', '#1b1b1b', SIGN_TEXT.danger, [18, 17], warnTri);
  panel(SIGNS.sector, '#d8d8cf', '#1d2a2a', null, SIGN_TEXT.sector, [34]);
  panel(SIGNS.comms, '#1f4f7a', '#ffffff', '#ffffff', SIGN_TEXT.comms, [26, 22]);
  panel(SIGNS.post, '#2b3b35', '#e9e5d6', '#e9e5d6', SIGN_TEXT.post, [32, 18]);
  panel(SIGNS.isolation, '#b3242c', '#ffffff', '#ffffff', SIGN_TEXT.isolation, [18, 14], warnTri);
  panel(SIGNS.generator, '#e2b62f', '#1b1b1b', '#1b1b1b', SIGN_TEXT.generator, [20, 15], bolt);
  panel(SIGNS.highVoltage, '#e2b62f', '#1b1b1b', '#1b1b1b', SIGN_TEXT.highVoltage, [17, 12], bolt);
  return cv;
}

// ---------------------------------------------------------------- monitors (CCTV frames)
export const FEEDS = ['corridorA', 'perimeter', 'techZone', 'isolation', 'corridorB', 'perimeterGate', 'generatorCam', 'noSignal']; // 4 × 2
function drawMonitors(panoramaCanvas) {
  const W = 512, H = 256, cw = 128, ch = 128, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(51);
  const cam = (i, label, draw) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.translate(x, y); draw(); g.restore();
    // CCTV look: green-grey tint, timestamp, camera label
    g.fillStyle = 'rgba(70,110,90,0.18)'; g.fillRect(x, y, cw, ch);
    g.fillStyle = 'rgba(220,240,225,0.9)'; g.font = `bold 9px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(label, x + 5, y + 4); g.textAlign = 'right'; g.fillText('11.11 · 14:2' + (i % 10), x + cw - 5, y + ch - 13);
    g.fillStyle = '#e04040'; g.beginPath(); g.arc(x + cw - 9, y + 9, 3, 0, 7); g.fill();
  };
  const corridor = (wallTone, light) => () => { // one-point perspective corridor
    g.fillStyle = '#1a1d1d'; g.fillRect(0, 0, cw, ch);
    const vx = 64 + (r() - 0.5) * 10, vy = 58;
    g.fillStyle = wallTone; g.beginPath(); g.moveTo(0, 0); g.lineTo(vx - 14, vy - 12); g.lineTo(vx - 14, vy + 14); g.lineTo(0, ch); g.fill();
    g.beginPath(); g.moveTo(cw, 0); g.lineTo(vx + 14, vy - 12); g.lineTo(vx + 14, vy + 14); g.lineTo(cw, ch); g.fill();
    g.fillStyle = '#3b3e3c'; g.beginPath(); g.moveTo(0, ch); g.lineTo(vx - 14, vy + 14); g.lineTo(vx + 14, vy + 14); g.lineTo(cw, ch); g.fill();
    g.fillStyle = '#2b2e30'; g.beginPath(); g.moveTo(0, 0); g.lineTo(vx - 14, vy - 12); g.lineTo(vx + 14, vy - 12); g.lineTo(cw, 0); g.fill();
    g.fillStyle = '#0e0f10'; g.fillRect(vx - 14, vy - 12, 28, 26);
    g.fillStyle = light; for (let k = 0; k < 3; k++) { const t = 0.25 + k * 0.25; g.fillRect(vx - 14 * (1 - t) - 30 * t * 0.2, (vy - 12) * (1 - t), 28 * (1 - t) + 6, 3); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(vx + 22, vy + 2, 6, 30); // a door
  };
  const steppe = (offset, gate) => () => {
    g.drawImage(panoramaCanvas, offset, 150, 300, 300, 0, 0, cw, ch);
    g.fillStyle = 'rgba(30,30,30,0.85)'; for (let i = 0; i < cw; i += 18) g.fillRect(i, 64, 2, 40); // perimeter fence posts
    g.strokeStyle = 'rgba(40,40,40,0.8)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 70 + k * 9); g.lineTo(cw, 70 + k * 9); g.stroke(); }
    if (gate) { g.fillStyle = '#c8c3b4'; g.fillRect(40, 70, 48, 4); g.fillStyle = '#b3242c'; for (let i = 44; i < 88; i += 10) g.fillRect(i, 70, 5, 4); g.fillStyle = '#3a3c3c'; g.fillRect(34, 60, 8, 44); }
  };
  const tech = (gen) => () => {
    g.fillStyle = '#202423'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#3d4441'; g.fillRect(0, 80, cw, 48);
    g.fillStyle = gen ? '#8b8a62' : '#5f6966'; g.fillRect(22, 34, 70, 56); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 40; i < 86; i += 6) g.fillRect(28, i, 58, 2);
    g.fillStyle = '#2b2f2e'; g.fillRect(70, 6, 8, 30); g.fillRect(84, 6, 6, 30);
    g.fillStyle = '#d9b23a'; g.fillRect(22, 88, 70, 4);
    g.fillStyle = '#4c5652'; g.fillRect(100, 30, 22, 60);
  };
  cam(0, 'CAM 01 · КПП', corridor('#545a58', 'rgba(220,230,220,0.7)'));
  cam(1, 'CAM 02 · ПЕРИМЕТР', steppe(300, false));
  cam(2, 'CAM 03 · ТЕХ. СЕКТОР', tech(false));
  cam(3, 'СЕКТОР 01', () => { g.fillStyle = '#3a0c0e'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#ff5a5a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 13px ${FONT}`; g.fillText('САҚТАНЫҢЫЗ', 64, 44); g.font = `bold 11px ${FONT}`; g.fillText('СЕКТОР 01', 64, 62); g.fillText('ИЗОЛИРОВАН', 64, 78); g.strokeStyle = '#ff5a5a'; g.lineWidth = 2; g.strokeRect(10, 24, 108, 72); });
  cam(4, 'CAM 04 · КОРИДОР', corridor('#4d4f4a', 'rgba(255,230,190,0.6)'));
  cam(5, 'CAM 05 · ВЪЕЗД', steppe(1250, true));
  cam(6, 'CAM 06 · ГЕНЕРАТОР', tech(true));
  cam(7, 'CAM 07', () => { g.fillStyle = '#111'; g.fillRect(0, 0, cw, ch); for (let i = 0; i < 1600; i++) { const v = (r() * 200) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * cw, r() * ch, 2, 1); } g.fillStyle = '#ddd'; g.textAlign = 'center'; g.font = `bold 12px ${FONT}`; g.fillText('НЕТ СИГНАЛА', 64, 64); });
  return cv;
}

// ---------------------------------------------------------------- steppe panorama (cylindrical, 360° × ±40°)
export const PANO = { w: 2048, h: 512, horizon: 0.56, vSpan: 80 }; // horizon row fraction from the top; vSpan = degrees top→bottom
function drawSteppe() {
  const { w: W, h: H } = PANO, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(2024), hz = Math.round(H * PANO.horizon);
  // sky: pale, dusty, overcast autumn daylight
  const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#8fa5b8'); sky.addColorStop(0.6, '#c3ccd0'); sky.addColorStop(1, '#ddd6c6');
  g.fillStyle = sky; g.fillRect(0, 0, W, hz);
  for (let i = 0; i < 46; i++) { // flat stratus clouds
    const cx = r() * W, cy = 30 + r() * (hz - 120), rw = 80 + r() * 240, rh = 8 + r() * 18;
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, rw); gr.addColorStop(0, 'rgba(240,238,232,0.38)'); gr.addColorStop(1, 'rgba(240,238,232,0)');
    g.fillStyle = gr; g.save(); g.translate(cx, cy); g.scale(1, rh / rw); g.beginPath(); g.arc(0, 0, rw, 0, 7); g.fill(); g.restore();
  }
  const ridge = (base, amp, freq, color, seed) => { // wrap-around hills
    const rr = rng(seed); const ph = [rr() * 7, rr() * 7, rr() * 7];
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) { const t = x / W * Math.PI * 2; const y = base - amp * (0.55 * Math.sin(t * freq + ph[0]) + 0.3 * Math.sin(t * freq * 2.3 + ph[1]) + 0.15 * Math.sin(t * freq * 5.1 + ph[2]) + 0.6); g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(hz - 2, 26, 3, '#9ea3a0', 3);  // far hills, hazy blue-grey
  ridge(hz + 4, 16, 5, '#a59b80', 5);  // nearer low hills, dry ochre
  // dust haze on the horizon
  const haze = g.createLinearGradient(0, hz - 40, 0, hz + 30); haze.addColorStop(0, 'rgba(225,215,195,0)'); haze.addColorStop(0.6, 'rgba(225,215,195,0.55)'); haze.addColorStop(1, 'rgba(225,215,195,0)');
  g.fillStyle = haze; g.fillRect(0, hz - 40, W, 70);
  // plain: dry grass, ochre to brown towards the viewer
  const ground = g.createLinearGradient(0, hz, 0, H); ground.addColorStop(0, '#b4a479'); ground.addColorStop(0.4, '#9c8a5c'); ground.addColorStop(1, '#6f6040');
  g.fillStyle = ground; g.fillRect(0, hz + 6, W, H - hz);
  for (let i = 0; i < 14000; i++) { // grass tufts, denser and bigger lower down
    const y = hz + 6 + Math.pow(r(), 0.8) * (H - hz), k = (y - hz) / (H - hz), x = r() * W;
    g.strokeStyle = r() < 0.5 ? `rgba(${150 + r() * 50},${130 + r() * 40},${80 + r() * 30},0.55)` : `rgba(${90 + r() * 30},${80 + r() * 20},${50},0.5)`;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 1 - k * 9 * r()); g.stroke();
  }
  // old road: a pale track curving to the horizon (around 300°)
  g.fillStyle = 'rgba(190,175,140,0.75)'; g.beginPath(); const rx = W * 0.82;
  g.moveTo(rx - 160, H); g.quadraticCurveTo(rx - 40, hz + 70, rx + 6, hz + 7); g.lineTo(rx + 12, hz + 7); g.quadraticCurveTo(rx + 40, hz + 70, rx + 150, H); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(120,105,80,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(rx - 60, H); g.quadraticCurveTo(rx, hz + 70, rx + 9, hz + 8); g.stroke();
  // power line: lattice pylons receding along the plain, sagging wires
  const pylons = [];
  for (let k = 0; k < 9; k++) { const x = 140 + k * 92 + k * k * 6, s = 1.7 - k * 0.16; pylons.push([x, hz + 10 + 40 * s * 0.4, s]); }
  g.strokeStyle = 'rgba(55,55,55,0.85)';
  for (const [x, base, s] of pylons) { const hgt = 62 * s, wd = 9 * s; g.lineWidth = Math.max(1, 1.6 * s); g.beginPath(); g.moveTo(x - wd, base); g.lineTo(x, base - hgt); g.lineTo(x + wd, base); g.moveTo(x - wd * 0.6, base - hgt * 0.35); g.lineTo(x + wd * 0.6, base - hgt * 0.35); g.moveTo(x - wd * 1.6, base - hgt * 0.8); g.lineTo(x + wd * 1.6, base - hgt * 0.8); g.moveTo(x - wd * 0.7, base - hgt * 0.35); g.lineTo(x + wd * 0.5, base - hgt * 0.75); g.stroke(); }
  g.lineWidth = 1; g.strokeStyle = 'rgba(50,50,50,0.6)';
  for (let k = 0; k < pylons.length - 1; k++) { const [x0, b0, s0] = pylons[k], [x1, b1, s1] = pylons[k + 1]; for (const side of [-1, 1]) { const y0 = b0 - 62 * s0 * 0.8, y1 = b1 - 62 * s1 * 0.8; g.beginPath(); g.moveTo(x0 + side * 9 * s0 * 1.6, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 10 * s0, x1 + side * 9 * s1 * 1.6, y1); g.stroke(); } }
  // outpost perimeter (fictional): a long concrete fence with a watch post, mid-distance
  g.fillStyle = 'rgba(150,145,130,0.95)'; g.fillRect(W * 0.38, hz + 14, W * 0.2, 7);
  g.fillStyle = 'rgba(110,105,95,0.95)'; for (let x = W * 0.38; x < W * 0.58; x += 14) g.fillRect(x, hz + 11, 2, 11);
  g.fillStyle = 'rgba(80,80,74,0.95)'; g.fillRect(W * 0.47, hz - 6, 10, 28); g.fillRect(W * 0.465, hz - 12, 16, 8);
  // a few distant sheds / a rusted water tower
  g.fillStyle = 'rgba(95,90,82,0.9)'; g.fillRect(W * 0.12, hz + 2, 26, 9); g.fillRect(W * 0.13, hz - 2, 18, 5);
  g.fillStyle = 'rgba(105,80,60,0.9)'; g.fillRect(W * 0.66, hz - 26, 3, 28); g.fillRect(W * 0.67, hz - 26, 3, 28); g.beginPath(); g.ellipse(W * 0.6675, hz - 30, 9, 6, 0, 0, 7); g.fill();
  // dust in the air near the ground
  for (let i = 0; i < 40; i++) { const cx = r() * W, cy = hz + 10 + r() * 60, rw = 60 + r() * 140; const gr = g.createRadialGradient(cx, cy, 2, cx, cy, rw); gr.addColorStop(0, 'rgba(220,205,170,0.18)'); gr.addColorStop(1, 'rgba(220,205,170,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rw, 0, 7); g.fill(); }
  return cv;
}

function drawLightPool() {
  const n = 64, cv = canvas(n, n), g = cv.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / (n - 1), v = y / (n - 1);
    const a = Math.sin(u * Math.PI) ** 1.4 * (1 - v) ** 1.3 * Math.min(1, v * 10 + 0.3); // bright near the window, fading into the room
    const i = (y * n + x) * 4; img.data[i] = 255; img.data[i + 1] = 240; img.data[i + 2] = 214; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return cv;
}

let cache = null;
/** All outpost textures (created once, shared). */
export function getOutpostTextures() {
  if (cache) return cache;
  const steppeCanvas = drawSteppe();
  const atlas = toTexture(drawSurfaceAtlas());
  atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
  const steppe = toTexture(steppeCanvas); steppe.wrapS = THREE.RepeatWrapping;
  cache = {
    atlas, steppe, steppeCanvas,
    signs: toTexture(drawSigns()),
    monitors: toTexture(drawMonitors(steppeCanvas)),
    lightPool: toTexture(drawLightPool()),
  };
  return cache;
}
export function disposeOutpostTextures() {
  if (!cache) return;
  for (const [k, v] of Object.entries(cache)) if (v && v.isTexture) v.dispose(); void 0;
  cache = null;
}
