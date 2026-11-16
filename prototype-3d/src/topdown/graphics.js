// M3.2 top-down graphics levels (Низкое / Среднее / Высокое). Resolution, MSAA and the adaptive-resolution guard stay
// with render/quality.js (performance / balanced / quality, rule 14); this table adds what only the top-down view uses.
// No ULTRA level (spec). Cost knobs (M3.2 perf pass): env = PMREM reflections, normals = lab normal maps, labShadows =
// the lab's own low-poly meshes cast into the shadow map (characters always do when shadows are on; the 8k-tri GLB props
// never do), decor = wet patches + capsule bubbles; bloomRes = resolution of the bloom chain relative to the screen; pools = additive
// light pools / glows under the lab sources (1 draw call) — the cheap glow of Низкое / Среднее, softer under real bloom.
// Measured (software GL, per pixel, Среднее): MSAA composer target ≈ 29 %, PMREM reflections ≈ 20 %, bloom ≈ 15 %,
// shadows ≈ 7 %, normal maps ≈ 4 % → Среднее renders straight to the MSAA framebuffer (no composer, no PMREM).
export const TD_GRAPHICS = Object.freeze({
  performance: Object.freeze({ id: 'performance', label: 'Низкое', shadowMap: 0, bloom: 0, bloomRes: 0, bloomStrength: 0, bloomRadius: 0, bloomThreshold: 1, particles: 0.35, hemi: 0.7, key: 1.0, steam: false, env: false, normals: false, labShadows: false, decor: false, pools: 1 }),
  balanced: Object.freeze({ id: 'balanced', label: 'Среднее', shadowMap: 1024, bloom: 0, bloomRes: 0, bloomStrength: 0, bloomRadius: 0, bloomThreshold: 1, particles: 0.7, hemi: 0.45, key: 1.05, steam: true, env: false, normals: true, labShadows: false, decor: true, pools: 1 }),
  quality: Object.freeze({ id: 'quality', label: 'Высокое', shadowMap: 2048, bloom: 1, bloomRes: 0.6, bloomStrength: 0.65, bloomRadius: 0.45, bloomThreshold: 0.95, particles: 1, hemi: 0.42, key: 1.1, steam: true, env: true, normals: true, labShadows: true, decor: true, pools: 0.55 }),
});
export const TD_GRAPHICS_ORDER = ['performance', 'balanced', 'quality'];
export function tdGraphics(id) { return TD_GRAPHICS[id] || TD_GRAPHICS.balanced; }
