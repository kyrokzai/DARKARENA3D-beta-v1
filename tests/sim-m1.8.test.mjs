// M1.8 pure-logic tests: node tests/sim-m1.8.test.mjs
// Graphics quality profiles (DPR-aware pixel budget), adaptive resolution guard, and the rule that the visual
// upgrade never touches gameplay data (variants still cosmetic, balance unchanged).
import { PROFILES, PROFILE_IDS, DEFAULT_PROFILE, computePixelRatio, AutoResolution, MIN_PIXEL_RATIO } from '../prototype-3d/src/render/quality.js';
import { DEFAULT_SETTINGS } from '../prototype-3d/src/config.js';
import { INFECTED_TYPES, INFECTED_VARIANTS } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH } from '../prototype-3d/src/sim/waves/wave-defs.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

// devices (landscape CSS size, DPR) — Safari reports these CSS sizes in full-screen landscape
const DEV = { iphone11: [896, 414, 2], iphone14pm: [932, 430, 3], iphoneSE: [667, 375, 2], desktop: [1280, 720, 1], desktop4k: [1920, 1080, 2] };
const M17 = (w, h, dpr) => Math.round(w * Math.min(dpr, 2) * 0.75) * Math.round(h * Math.min(dpr, 2) * 0.75);

check('Three profiles (performance / balanced / quality), default balanced, settings default = balanced', PROFILE_IDS.join() === 'performance,balanced,quality' && DEFAULT_PROFILE === 'balanced' && DEFAULT_SETTINGS.graphicsProfile === 'balanced' && DEFAULT_SETTINGS.renderScale === 1 && DEFAULT_SETTINGS.settingsVersion === 2);
check('Profiles differ: pixel budgets increase, MSAA off only on performance', PROFILES.performance.maxPixels < PROFILES.balanced.maxPixels && PROFILES.balanced.maxPixels < PROFILES.quality.maxPixels && !PROFILES.performance.msaa && PROFILES.balanced.msaa && PROFILES.quality.msaa);
for (const [name, [w, h, dpr]] of Object.entries(DEV)) for (const id of PROFILE_IDS) {
  const r = computePixelRatio(w, h, dpr, id);
  if (r.pixels > PROFILES[id].maxPixels * 1.01) check(`Budget respected (${name}, ${id})`, false, `${r.width}×${r.height}`);
}
check('No profile ever exceeds its pixel budget on any device (5 devices × 3 profiles)', results.every(Boolean));
{
  const b11 = computePixelRatio(...DEV.iphone11, 'balanced'), b14 = computePixelRatio(...DEV.iphone14pm, 'balanced'), q14 = computePixelRatio(...DEV.iphone14pm, 'quality');
  check('iPhone 11 balanced = native resolution (1792×828) — M1.7 rendered 56 % of it', b11.width === 1792 && b11.height === 828 && b11.pixels / M17(...DEV.iphone11) > 1.7, `${b11.width}×${b11.height}`);
  check('iPhone 14 Pro Max balanced: capped at 1.6 MP (≈ 1.8× the pixels of M1.7, not the 3.6 MP native)', b14.budgetLimited && b14.pixels <= 1.6e6 && b14.pixels / M17(...DEV.iphone14pm) > 1.7, `${b14.width}×${b14.height}`);
  check('iPhone 14 Pro Max quality: close to native (≥ 2.6 of DPR 3), clamped to its 2.8 MP budget', q14.ratio >= 2.6 && q14.pixels <= 2.8e6 && q14.budgetLimited, `${q14.width}×${q14.height}`);
  const p11 = computePixelRatio(...DEV.iphone11, 'performance');
  check('Performance profile ≈ M1.7 cost (≤ 1.2 × M1.7 pixels on iPhone 11)', p11.pixels <= M17(...DEV.iphone11) * 1.2, `${p11.width}×${p11.height}`);
  const d = computePixelRatio(...DEV.desktop, 'balanced');
  check('Desktop 1280×720 DPR 1: balanced renders 1:1', d.width === 1280 && d.height === 720);
  const f = computePixelRatio(...DEV.iphone11, 'balanced', 0.75);
  check('renderScale is a fine-tune multiplier on top of the profile', Math.abs(f.ratio - 1.5) < 1e-9);
  const tiny = computePixelRatio(100, 100, 1, 'performance', 0.3, 0.1);
  check('Lower bounds: ratio never below MIN_PIXEL_RATIO, auto factor never below the profile minimum', tiny.ratio >= MIN_PIXEL_RATIO);
}
{
  const a = new AutoResolution({ window: 1 });
  let changed = 0; for (let i = 0; i < 300; i++) if (a.sample(1 / 30, PROFILES.balanced.minAuto)) changed++; // 30 fps
  const low = a.factor;
  check('Adaptive guard: sustained slow frames lower the resolution step by step, not below the profile minimum', changed >= 3 && low >= PROFILES.balanced.minAuto && low < 1, `factor ${low.toFixed(2)}`);
  for (let i = 0; i < 2000; i++) a.sample(1 / 120, PROFILES.balanced.minAuto);                       // fast again
  check('Adaptive guard: fast frames restore full resolution', a.factor === 1);
  const b = new AutoResolution({ window: 1 }); for (let i = 0; i < 300; i++) b.sample(0.5, 0.65);
  check('Adaptive guard ignores hitches / background-tab gaps (> 250 ms)', b.factor === 1);
  const c = new AutoResolution({ window: 1 }); c.enabled = false; for (let i = 0; i < 300; i++) c.sample(1 / 20, 0.65);
  check('Adaptive guard can be switched off (setting)', c.factor === 1 && DEFAULT_SETTINGS.autoResolution === true);
}
// the visual upgrade never touched gameplay
check('Variants still cosmetic (no stats), one infected type, balance 3 × 9 / max 5 unchanged', Object.keys(INFECTED_TYPES).join() === 'hollow' && Object.values(INFECTED_VARIANTS).every(v => Object.keys(v).sort().join() === 'id,name,role') && WAVES.length === 3 && WAVES.every(w => w.enemies.reduce((s, e) => s + e.count, 0) === 9) && MATCH.maxActive === 5 && MATCH.intermission === 6);
check('RAVEN unchanged (25 / 50 damage, 30 / 120 rounds, 1.3 s reload)', WEAPONS.raven.damage.body === 25 && WEAPONS.raven.damage.head === 50 && WEAPONS.raven.magSize === 30 && WEAPONS.raven.reserve === 120 && WEAPONS.raven.reloadTime === 1.3);

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
