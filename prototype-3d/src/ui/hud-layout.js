// HUD layout model — pure functions (no DOM), testable in Node.
// Positions are stored normalized to the SAFE rectangle (0..1 of its width/height), centre of element.
// Size: base width/height (CSS px) × global hudScale × per-element scale `s`.
// Two profiles: 'touch' (phones/tablets: controls + info) and 'desktop' (mouse/keyboard: info only).

/** Element catalogue.
 *  kind: stick | button (touch controls) · map | info (read-only panels, never take touches during play).
 *  `future: true` = the game mechanic does not exist yet; the control only emits its intent. */
export const HUD_ELEMENTS = {
  move:    { label: 'Движение',    kind: 'stick',  shape: 'circle', w: 132, h: 132, touchOnly: true },
  look:    { label: 'Обзор',       kind: 'stick',  shape: 'circle', w: 132, h: 132, touchOnly: true },
  fire:    { label: 'Огонь',       kind: 'button', shape: 'circle', w: 92, h: 92, action: 'fire', touchOnly: true },
  aim:     { label: 'Прицел',      kind: 'button', shape: 'circle', w: 62, h: 62, action: 'aim', touchOnly: true },
  reload:  { label: 'Перезарядка', kind: 'button', shape: 'circle', w: 60, h: 60, action: 'reload', touchOnly: true },
  jump:    { label: 'Прыжок',      kind: 'button', shape: 'circle', w: 62, h: 62, action: 'jump', touchOnly: true },
  melee:   { label: 'Удар прикладом', kind: 'button', shape: 'circle', w: 62, h: 62, action: 'melee', touchOnly: true }, // M1.9
  // M2.0: weapon slots (touch: tap a slot to switch; desktop: info panel showing 1 / 2 / 3) and the flashlight toggle
  weapons: { label: 'Оружие',      kind: 'slots',  shape: 'rect',   w: 156, h: 46, action: 'weapon' },
  light:   { label: 'Фонарик',     kind: 'button', shape: 'circle', w: 52, h: 52, action: 'light', touchOnly: true },
  minimap: { label: 'Мини-карта',  kind: 'map',    shape: 'rect',   w: 112, h: 112 },
  health:  { label: 'Здоровье',    kind: 'info',   shape: 'rect',   w: 196, h: 40 },
  ammo:    { label: 'Патроны',     kind: 'info',   shape: 'rect',   w: 148, h: 52 },
  wave:    { label: 'Волна',       kind: 'info',   shape: 'rect',   w: 172, h: 44 },
};
export const PROFILES = ['touch', 'desktop'];

// Touch: BUILD 1.3 controls (move, fire, reload, jump) + aim, look stick, minimap and info panels around them.
// Desktop: classic FPS corners — health bottom-left, ammo bottom-right, wave top-centre, minimap top-left.
export const DEFAULT_LAYOUTS = Object.freeze({
  touch: Object.freeze({
    move:    { x: 0.12, y: 0.77, s: 1 },
    fire:    { x: 0.88, y: 0.72, s: 1 },
    reload:  { x: 0.74, y: 0.86, s: 1 },
    jump:    { x: 0.91, y: 0.40, s: 1 },
    aim:     { x: 0.75, y: 0.57, s: 1 },
    melee:   { x: 0.76, y: 0.35, s: 1 }, // M1.9: above ПРИЦЕЛ, left of ПРЫЖОК — reachable with the right thumb, clear of ОГОНЬ
    weapons: { x: 0.77, y: 0.08, s: 1 }, // M2.0: top band, between WAVE and pause — outside both thumbs' working areas
    light:   { x: 0.25, y: 0.30, s: 1 }, // M2.0: upper left, right of the minimap — above the movement thumb area
    look:    { x: 0.58, y: 0.60, s: 1 },
    minimap: { x: 0.09, y: 0.33, s: 1 },
    health:  { x: 0.13, y: 0.07, s: 1 },
    wave:    { x: 0.50, y: 0.07, s: 1 },
    ammo:    { x: 0.50, y: 0.93, s: 1 },
  }),
  desktop: Object.freeze({
    minimap: { x: 0.07, y: 0.14, s: 1 },
    health:  { x: 0.11, y: 0.94, s: 1.1 },
    wave:    { x: 0.50, y: 0.06, s: 1 },
    ammo:    { x: 0.91, y: 0.93, s: 1.1 },
    weapons: { x: 0.90, y: 0.83, s: 1 },  // M2.0: 1 / 2 / 3 above the ammo panel
  }),
});
/** @deprecated M1.1 name — the touch profile defaults. */
export const DEFAULT_LAYOUT = DEFAULT_LAYOUTS.touch;

export const SCALE_MIN = 0.7, SCALE_MAX = 1.6;
export const MIN_TOUCH = 44; // px, Apple HIG minimum hit target (touch controls only)
const GAP = 6;               // px kept between elements
const SLOTS_GAP = 12;        // px around the weapon slots: a finger aimed at a neighbour must not switch weapons (M2.0)
/** Left part of the safe area that belongs to the movement thumb (the floating stick appears anywhere in it). */
export const MOVE_ZONE_X = 0.4;
/** Its lower part, where the left thumb actually lands for movement: no other touch control belongs there (M2.0). */
export const MOVE_THUMB_Y = 0.42;

const clone = o => JSON.parse(JSON.stringify(o));
export function cloneDefaultLayout(profile = 'touch') { return clone(DEFAULT_LAYOUTS[profile]); }
export function cloneDefaultLayouts() { return clone(DEFAULT_LAYOUTS); }
const kindOf = id => HUD_ELEMENTS[id] && HUD_ELEMENTS[id].kind;
const isControl = id => !!HUD_ELEMENTS[id] && (HUD_ELEMENTS[id].kind === 'stick' || HUD_ELEMENTS[id].kind === 'button' || HUD_ELEMENTS[id].kind === 'slots');

/** Which elements are shown for a profile, from settings. */
export function activeIds(settings, profile = 'touch') {
  return Object.keys(DEFAULT_LAYOUTS[profile]).filter(id =>
    (id !== 'look' || settings.lookMode === 'stick') &&
    (id !== 'minimap' || settings.showMinimap) &&
    (!HUD_ELEMENTS[id].future || settings.showActionButtons));
}

export function sizeOf(id, layout, settings) {
  const e = HUD_ELEMENTS[id], s = (layout[id] && layout[id].s) || 1, k = settings.hudScale * s;
  let w = Math.round(e.w * k), h = Math.round(e.h * k);
  if (isControl(id)) { w = Math.max(MIN_TOUCH, w); h = Math.max(MIN_TOUCH, h); }
  return { w, h };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rectFrom(id, cx, cy, w, h) { return { id, cx, cy, w, h, size: Math.max(w, h), x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }; }
function placeIn(r, cx, cy, w, h, screen) {
  const { w: W, h: H, safe } = screen;
  w = Math.min(w, W - safe.left - safe.right); h = Math.min(h, H - safe.top - safe.bottom);
  return rectFrom(r.id, clamp(cx, safe.left + w / 2, W - safe.right - w / 2), clamp(cy, safe.top + h / 2, H - safe.bottom - h / 2), w, h);
}

/** Pixel rects {id, cx, cy, w, h, size, x0, y0, x1, y1} for active elements, clamped into the safe rect. */
export function computeRects(layout, settings, screen, profile = 'touch') {
  const { w: W, h: H, safe } = screen;
  const sw = W - safe.left - safe.right, sh = H - safe.top - safe.bottom;
  const defs = DEFAULT_LAYOUTS[profile];
  return activeIds(settings, profile).map(id => {
    const p = layout[id] || defs[id], { w, h } = sizeOf(id, layout, settings);
    return placeIn({ id }, safe.left + p.x * sw, safe.top + p.y * sh, w, h, screen);
  });
}

/** Overlap test with a small gap. Circle–circle by distance; anything with a rect by boxes. */
const gapOf = (a, b) => (kindOf(a.id) === 'slots' || kindOf(b.id) === 'slots' ? SLOTS_GAP : GAP);
export function overlaps(a, b, gap = gapOf(a, b)) {
  const circ = id => HUD_ELEMENTS[id] && HUD_ELEMENTS[id].shape === 'circle';
  if (circ(a.id) && circ(b.id)) return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.w / 2 + b.w / 2 + gap;
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}
/**
 * Ergonomic audit of touch rects (M2.0): touch controls other than the move stick inside the movement thumb area
 * (they would catch the left thumb instead of starting the floating stick), and anything closer than SLOTS_GAP to
 * the weapon slots. Returns a list of human-readable issues; [] = fine.
 */
export function ergonomicIssues(rects, screen) {
  const { w: W, h: H, safe } = screen, sw = W - safe.left - safe.right, sh = H - safe.top - safe.bottom;
  const zx = safe.left + sw * MOVE_ZONE_X, zy = safe.top + sh * MOVE_THUMB_Y, out = [];
  for (const r of rects) {
    const k = kindOf(r.id);
    if (r.id !== 'move' && (k === 'button' || k === 'slots') && r.x0 < zx && r.y1 > zy) out.push(r.id + ' in move-thumb area');
  }
  const sl = rects.find(r => r.id === 'weapons');
  if (sl) for (const r of rects) if (r !== sl && isControl(r.id) && overlaps(sl, r)) out.push(r.id + ' < ' + SLOTS_GAP + ' px from slots');
  return out;
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
 * Display-time resolution: if a saved layout overlaps on this particular screen (e.g. made on a big phone and
 * shown on a small one), push elements apart and, as a last resort, shrink them. Saved values are not changed.
 * Panels (map/info) are pinned at first; controls move away from them.
 */
/** Display-time constraint (M2.0): a touch button / the slots never sit in the movement thumb area — moved up or to
 * the right, whichever is the smaller shift (the move stick itself and the panels are exempt). */
function keepOutOfThumb(r, screen) {
  const k = kindOf(r.id);
  if (r.fixed || r.id === 'move' || (k !== 'button' && k !== 'slots')) return;
  const { w: W, h: H, safe } = screen, sw = W - safe.left - safe.right, sh = H - safe.top - safe.bottom;
  const zx = safe.left + sw * MOVE_ZONE_X, zy = safe.top + sh * MOVE_THUMB_Y;
  if (!(r.x0 < zx && r.y1 > zy)) return;
  const up = r.y1 - zy, right = zx - r.x0;
  const canUp = zy - r.h >= safe.top;
  Object.assign(r, placeIn(r, canUp && up <= right ? r.cx : r.cx + right, canUp && up <= right ? r.cy - up : r.cy, r.w, r.h, screen));
}
export function resolveRects(rects, screen, fixed = []) {
  // `fixed` = immovable obstacles (e.g. the pause button): {id, x0, y0, x1, y1, cx, cy, w, h}
  const out = [...rects.map(r => ({ ...r })), ...fixed.map(r => ({ ...r, fixed: true }))];
  for (const r of out) keepOutOfThumb(r, screen);
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (!overlaps(a, b)) continue;
      moved = true;
      let dx = b.cx - a.cx, dy = b.cy - a.cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 1e-3) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
      // Smallest push that separates the two along the centre line (boxes: per-axis overlap).
      const need = Math.max(4, Math.min(
        Math.abs(dx) > 1e-3 ? ((a.w + b.w) / 2 + gapOf(a, b) - Math.abs(b.cx - a.cx)) / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-3 ? ((a.h + b.h) / 2 + gapOf(a, b) - Math.abs(b.cy - a.cy)) / Math.abs(dy) : Infinity)) + 1;
      const pin = iter < 30;
      const aw = a.fixed ? 0 : (!isControl(a.id) && pin ? 0 : 1), bw = b.fixed ? 0 : (!isControl(b.id) && pin ? 0 : 1);
      if (!aw && !bw && (a.fixed || b.fixed)) { const m = a.fixed ? b : a; Object.assign(m, placeIn(m, m.cx + (m === b ? dx : -dx) * need, m.cy + (m === b ? dy : -dy) * need, m.w, m.h, screen)); continue; }
      const k = aw + bw || 1;
      Object.assign(a, placeIn(a, a.cx - dx * need * aw / k, a.cy - dy * need * aw / k, a.w, a.h, screen));
      Object.assign(b, placeIn(b, b.cx + dx * need * bw / k, b.cy + dy * need * bw / k, b.w, b.h, screen));
      keepOutOfThumb(a, screen); keepOutOfThumb(b, screen);
    }
    if (!moved) break;
    if (iter > 50) for (const r of out) {
      if (r.fixed) continue;
      const minS = isControl(r.id) ? MIN_TOUCH + 2 : 24;
      if (r.h > minS) Object.assign(r, placeIn(r, r.cx, r.cy, r.w * 0.95, r.h * 0.95, screen));
    }
  }
  return out.filter(r => !r.fixed);
}

/** Convert a pixel centre back to normalized safe-rect coordinates (for saving after a drag). */
export function toNormalized(cx, cy, screen) {
  const { w, h, safe } = screen;
  const sw = w - safe.left - safe.right, sh = h - safe.top - safe.bottom;
  return { x: clamp((cx - safe.left) / sw, 0, 1), y: clamp((cy - safe.top) / sh, 0, 1) };
}

/** Validate/merge one profile's stored layout (unknown keys dropped, broken values → defaults). */
export function sanitizeLayout(raw, profile = 'touch') {
  const out = cloneDefaultLayout(profile);
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(out)) {
    const v = raw[id];
    if (!v) continue;
    if (Number.isFinite(v.x) && v.x >= 0 && v.x <= 1) out[id].x = v.x;
    if (Number.isFinite(v.y) && v.y >= 0 && v.y <= 1) out[id].y = v.y;
    if (Number.isFinite(v.s)) out[id].s = clamp(v.s, SCALE_MIN, SCALE_MAX);
  }
  return out;
}
/** Stored format: {touch:{…}, desktop:{…}}. An M1.1 flat layout is migrated into the touch profile. */
export function sanitizeLayouts(raw) {
  if (raw && typeof raw === 'object' && !raw.touch && !raw.desktop && raw.move) raw = { touch: raw };
  return { touch: sanitizeLayout(raw && raw.touch, 'touch'), desktop: sanitizeLayout(raw && raw.desktop, 'desktop') };
}
