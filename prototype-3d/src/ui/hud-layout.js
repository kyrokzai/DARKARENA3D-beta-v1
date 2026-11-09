// HUD layout model — pure functions (no DOM), testable in Node.
// Positions are stored normalized to the SAFE rectangle (0..1 of its width/height), centre of element.
// Sizes: base size (CSS px) × global hudScale × per-element scale.

/** Element catalogue. `kind`: stick | button | panel. `action`: input intent (buttons only).
 *  `future: true` = the game mechanic does not exist yet; the control only emits its intent. */
export const HUD_ELEMENTS = {
  move:    { label: 'Движение',     kind: 'stick',  shape: 'circle', base: 132 },
  look:    { label: 'Обзор',        kind: 'stick',  shape: 'circle', base: 132 },
  fire:    { label: 'Огонь',        kind: 'button', shape: 'circle', base: 92, action: 'fire', future: true },
  aim:     { label: 'Прицел',       kind: 'button', shape: 'circle', base: 62, action: 'aim', future: true },
  reload:  { label: 'Перезарядка',  kind: 'button', shape: 'circle', base: 60, action: 'reload', future: true },
  jump:    { label: 'Прыжок',       kind: 'button', shape: 'circle', base: 62, action: 'jump', future: true },
  minimap: { label: 'Мини-карта',   kind: 'panel',  shape: 'rect',   base: 112 },
};

// BUILD 1.3 layout (move, fire, reload, jump as in 1.3); aim, look-stick and minimap added around it.
export const DEFAULT_LAYOUT = Object.freeze({
  move:    { x: 0.12, y: 0.77, s: 1 },
  fire:    { x: 0.88, y: 0.72, s: 1 },
  reload:  { x: 0.74, y: 0.86, s: 1 },
  jump:    { x: 0.91, y: 0.40, s: 1 },
  aim:     { x: 0.75, y: 0.57, s: 1 },
  look:    { x: 0.58, y: 0.76, s: 1 },
  minimap: { x: 0.09, y: 0.27, s: 1 },
});

export const SCALE_MIN = 0.7, SCALE_MAX = 1.6;
export const MIN_TOUCH = 44; // px, Apple HIG minimum hit target
const GAP = 6;               // px kept between controls

export function cloneDefaultLayout() { return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); }

/** Which elements are shown, from settings. */
export function activeIds(settings) {
  const ids = ['move', 'minimap', 'fire', 'aim', 'reload', 'jump', 'look'];
  return ids.filter(id =>
    (id !== 'look' || settings.lookMode === 'stick') &&
    (id !== 'minimap' || settings.showMinimap) &&
    (!HUD_ELEMENTS[id].future || settings.showActionButtons));
}

export function sizeOf(id, layout, settings) {
  const e = HUD_ELEMENTS[id], s = (layout[id] && layout[id].s) || 1;
  return Math.max(MIN_TOUCH, Math.round(e.base * settings.hudScale * s));
}

/** Pixel rects {id, cx, cy, size, x0, y0, x1, y1} for active elements, clamped into the safe rect. */
export function computeRects(layout, settings, screen) {
  const { w, h, safe } = screen;
  const sw = w - safe.left - safe.right, sh = h - safe.top - safe.bottom;
  return activeIds(settings).map(id => {
    const p = layout[id] || DEFAULT_LAYOUT[id], size = sizeOf(id, layout, settings);
    const half = size / 2;
    let cx = safe.left + p.x * sw, cy = safe.top + p.y * sh;
    cx = clamp(cx, safe.left + half, w - safe.right - half);
    cy = clamp(cy, safe.top + half, h - safe.bottom - half);
    return rectFrom(id, cx, cy, size);
  });
}
const rectFrom = (id, cx, cy, size) => ({ id, cx, cy, size, x0: cx - size / 2, y0: cy - size / 2, x1: cx + size / 2, y1: cy + size / 2 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Overlap test with a small gap. Circles use distance; rects (minimap) use boxes. */
export function overlaps(a, b, gap = GAP) {
  const circ = id => HUD_ELEMENTS[id].shape === 'circle';
  if (circ(a.id) && circ(b.id)) return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.size / 2 + b.size / 2 + gap;
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}
export function findOverlaps(rects) {
  const out = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i], rects[j])) out.push([rects[i].id, rects[j].id]);
  return out;
}
export function inBounds(r, screen) {
  const { w, h, safe } = screen;
  return r.x0 >= safe.left - 0.5 && r.y0 >= safe.top - 0.5 && r.x1 <= w - safe.right + 0.5 && r.y1 <= h - safe.bottom + 0.5;
}

/**
 * Display-time resolution: if a saved layout overlaps on this particular screen (e.g. a layout made on a big
 * phone shown on an iPhone SE), push elements apart and shrink them a little if needed. Saved values are not changed.
 */
export function resolveRects(rects, screen) {
  const out = rects.map(r => ({ ...r }));
  const { w, h, safe } = screen;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (!overlaps(a, b)) continue;
      moved = true;
      let dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
      if (d < 1e-3) { dx = 1; dy = 0; d = 1; }
      const need = (a.size + b.size) / 2 + GAP - d, push = need / 2 + 1;
      // The minimap is a panel: it does not move; controls move away from it.
      // (last resort on very small screens: the minimap may move too)
      const pin = iter < 20;
      const aw = a.id === 'minimap' && pin ? 0 : 1, bw = b.id === 'minimap' && pin ? 0 : 1;
      const k = aw + bw || 1;
      Object.assign(a, place(a, a.cx - dx / d * push * 2 * aw / k, a.cy - dy / d * push * 2 * aw / k, a.size, screen));
      Object.assign(b, place(b, b.cx + dx / d * push * 2 * bw / k, b.cy + dy / d * push * 2 * bw / k, b.size, screen));
    }
    if (!moved) break;
    if (iter > 30) for (const r of out) if (r.size > MIN_TOUCH + 4 && r.id !== 'minimap') Object.assign(r, place(r, r.cx, r.cy, r.size * 0.95, screen));
  }
  return out;
  function place(r, cx, cy, size, s) {
    const half = size / 2;
    return rectFrom(r.id, clamp(cx, safe.left + half, w - safe.right - half), clamp(cy, safe.top + half, h - safe.bottom - half), size);
  }
}

/** Convert a pixel centre back to normalized safe-rect coordinates (for saving after a drag). */
export function toNormalized(cx, cy, screen) {
  const { w, h, safe } = screen;
  const sw = w - safe.left - safe.right, sh = h - safe.top - safe.bottom;
  return { x: clamp((cx - safe.left) / sw, 0, 1), y: clamp((cy - safe.top) / sh, 0, 1) };
}

/** Validate/merge a stored layout (unknown keys dropped, broken values → defaults). */
export function sanitizeLayout(raw) {
  const out = cloneDefaultLayout();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(DEFAULT_LAYOUT)) {
    const v = raw[id];
    if (!v) continue;
    if (Number.isFinite(v.x) && v.x >= 0 && v.x <= 1) out[id].x = v.x;
    if (Number.isFinite(v.y) && v.y >= 0 && v.y <= 1) out[id].y = v.y;
    if (Number.isFinite(v.s)) out[id].s = clamp(v.s, SCALE_MIN, SCALE_MAX);
  }
  return out;
}
