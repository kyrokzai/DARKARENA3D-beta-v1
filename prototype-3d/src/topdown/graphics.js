// M3.2 top-down graphics levels (Низкое / Среднее / Высокое). Resolution, MSAA and the adaptive-resolution guard stay
// with render/quality.js (performance / balanced / quality, rule 14); this table adds what only the top-down view uses.
// No ULTRA level (spec).
export const TD_GRAPHICS = Object.freeze({
  performance: Object.freeze({ id: 'performance', label: 'Низкое', shadowMap: 0, bloom: 0, bloomRes: 0, bloomStrength: 0, bloomRadius: 0, bloomThreshold: 1, particles: 0.35, hemi: 0.7, key: 1.0, steam: false }),
  balanced: Object.freeze({ id: 'balanced', label: 'Среднее', shadowMap: 1024, bloom: 1, bloomRes: 0.5, bloomStrength: 0.55, bloomRadius: 0.45, bloomThreshold: 0.9, particles: 0.7, hemi: 0.45, key: 1.05, steam: true }),
  quality: Object.freeze({ id: 'quality', label: 'Высокое', shadowMap: 2048, bloom: 1, bloomRes: 1, bloomStrength: 0.7, bloomRadius: 0.5, bloomThreshold: 0.85, particles: 1, hemi: 0.42, key: 1.1, steam: true }),
});
export const TD_GRAPHICS_ORDER = ['performance', 'balanced', 'quality'];
export function tdGraphics(id) { return TD_GRAPHICS[id] || TD_GRAPHICS.balanced; }
