// Graphics quality profiles (M1.8). Pure logic (no three.js, no DOM): turns the screen size, the real
// devicePixelRatio and the chosen profile into a render pixel ratio with a hard PIXEL BUDGET, so a DPR-3 iPhone
// is not asked for 3.6 MP while a DPR-2 one still gets its native resolution.
//
// M1.7 rendered min(DPR, 2) × 0.75 → 56 % of the pixels on DPR-2 iPhones and 25 % on DPR-3 ones, stretched with
// nearest-neighbour (see docs/M1.8-DIAGNOSTIC.md). The profiles fix that while bounding the GPU cost.
export const PROFILES = Object.freeze({
  performance: Object.freeze({ id: 'performance', name: 'Производительность', maxDpr: 2, scale: 0.8, maxPixels: 0.85e6, msaa: false, anisotropy: 1, floorAnisotropy: 1, bump: false, trilinear: false, minAuto: 0.7 }),
  balanced: Object.freeze({ id: 'balanced', name: 'Баланс', maxDpr: 3, scale: 1.0, maxPixels: 1.6e6, msaa: true, anisotropy: 2, floorAnisotropy: 4, bump: true, trilinear: true, minAuto: 0.65 }),
  quality: Object.freeze({ id: 'quality', name: 'Качество', maxDpr: 3, scale: 1.0, maxPixels: 2.8e6, msaa: true, anisotropy: 8, floorAnisotropy: 8, bump: true, trilinear: true, minAuto: 0.6 }),
});
export const PROFILE_IDS = Object.keys(PROFILES);
export const DEFAULT_PROFILE = 'balanced';
export const MIN_PIXEL_RATIO = 0.5;

export function getProfile(id) { return PROFILES[id] || PROFILES[DEFAULT_PROFILE]; }

/**
 * Pixel ratio for the renderer: min(DPR, profile cap) × profile scale × user fine-tune × auto factor, then clamped so
 * that cssW × cssH × ratio² ≤ maxPixels. Returns { ratio, width, height, pixels, budgetLimited }.
 */
export function computePixelRatio(cssW, cssH, dpr, profileId, userScale = 1, auto = 1) {
  const P = getProfile(profileId);
  const area = Math.max(1, cssW) * Math.max(1, cssH);
  let ratio = Math.min(Math.max(dpr || 1, 0.5), P.maxDpr) * P.scale * clamp(userScale, 0.3, 1) * clamp(auto, P.minAuto, 1);
  const cap = Math.sqrt(P.maxPixels / area);
  const budgetLimited = ratio > cap;
  if (budgetLimited) ratio = cap;
  ratio = Math.max(MIN_PIXEL_RATIO, ratio);
  const width = Math.floor(cssW * ratio), height = Math.floor(cssH * ratio); // three.js floors the canvas size the same way
  return { ratio, width, height, pixels: width * height, budgetLimited };
}

/**
 * Adaptive resolution guard: feed it real frame times; if the average over a window is too slow it lowers the
 * auto factor in small steps (never below the profile's minAuto), and raises it again when frames are fast.
 * Keeps M1.7's smoothness even when a device cannot afford the profile's full resolution.
 */
export class AutoResolution {
  // M1.8 review fix (C2): 60 Hz (16.7 ms) counts as fast → the resolution comes back on iPhones after a slow phase;
  // lowering needs two slow windows in a row and changes are at least `cooldown` s apart (each one re-allocates MSAA).
  constructor({ window = 2.0, slowMs = 20, fastMs = 17.8, step = 0.08, cooldown = 4 } = {}) {
    Object.assign(this, { window, slowMs, fastMs, step, cooldown });
    this.factor = 1; this.acc = 0; this.n = 0; this.t = 0; this.changes = 0; this.enabled = true; this.slowRun = 0; this.since = 1e9;
  }
  reset() { this.factor = 1; this.acc = 0; this.n = 0; this.t = 0; this.slowRun = 0; this.since = 1e9; }
  /** dt in seconds; returns true when the factor changed (the caller then resizes). minAuto from the profile. */
  sample(dt, minAuto) {
    if (!this.enabled || !(dt > 0) || dt > 0.25) return false; // ignore hitches / background tabs
    this.acc += dt; this.n++; this.t += dt; this.since += dt;
    if (this.t < this.window) return false;
    const avgMs = this.acc / this.n * 1000; this.acc = 0; this.n = 0; this.t = 0;
    this.slowRun = avgMs > this.slowMs ? this.slowRun + 1 : 0;
    if (this.since < this.cooldown) return false;
    let f = this.factor;
    if (this.slowRun >= 2) f = Math.max(minAuto, f - this.step);
    else if (avgMs < this.fastMs && f < 1) f = Math.min(1, f + this.step / 2);
    if (f !== this.factor) { this.factor = f; this.changes++; this.since = 0; return true; }
    return false;
  }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : b));
