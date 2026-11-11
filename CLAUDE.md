# DARK ARENA — project rules for Claude

Browser FPS (survival vs. waves of infected). Owner makes key decisions; work in small, verifiable steps.

## Current state
- Production on GitHub Pages: `index.html` (BUILD 1.1). Do not change it without the owner's explicit approval.
- `DARK_ARENA_1_2_GeometryFix.html` — BUILD 1.2 (tag `build-1.2`). `DARK_ARENA_1_3.html` — BUILD 1.3 (bug-fix build).
- Engine today: Canvas 2D raycaster in a single HTML file. Approved direction: gradual migration to Three.js
  (see `docs/THREEJS-MIGRATION-PLAN.md`). The Three.js prototype lives in `prototype-3d/`, separate from the working game.
- Prototype milestones are tagged (`m0`, `m1.1`…); each step is done on its own branch and only after the owner's go-ahead.
- Minimum target: iPhone 11 and newer, iOS 16+ (landscape).

## Rules (override any third-party skill)
1. Must run on GitHub Pages as static files. No build step unless the owner approves one; no server.
2. No new runtime dependencies without justification. Three.js is pinned to an exact version.
3. No AI asset generators, external paid services or API keys.
4. iPhone Safari (landscape, multitouch) is a first-class target; desktop keeps full mouse/keyboard control.
   For anything touching input/HUD use the `dark-arena-mobile` skill.
5. Never delete existing mechanics or old builds without agreement. Keep a restore point (git tag) before big changes.
6. Every change: run `node tests/build-1.3.test.js` (main game) and, for the 3D prototype,
   `node tests/sim-m0.test.mjs` + `node tests/prototype-m0.test.js` + `node tests/m1.1-mobile.test.js`
   + `node tests/m1.2-hud.test.js` + `node tests/sim-m1.3.test.mjs` + `node tests/m1.3-weapon.test.js`
   + `node tests/m1.4-hands.test.js` + `node tests/m1.4.1-jump.test.js`
   + `node tests/sim-m1.5.test.mjs` + `node tests/m1.5-infected.test.js`
   + `node tests/sim-m1.6.test.mjs` + `node tests/m1.6-evolution.test.js`
   + `node tests/sim-m1.7.test.mjs` + `node tests/m1.7-outpost.test.js`; report changed files,
   test results, how to verify on PC and iPhone, and known limitations. Not accepted until the owner confirms.
7. Test hooks and the debug panel are allowed only behind `?debug=1`.
8. Gameplay values reach the HUD only through `prototype-3d/src/sim/game-state.js` (GameState + events);
   weapon/enemy systems write into it, `ui/game-hud.js` only reads it.
9. Weapons are data: new guns are entries in `prototype-3d/src/sim/weapons/defs.js` handled by the generic
   `WeaponSystem`; skins are cosmetic material sets on shared geometry and never change stats.
10. Infected are data + generic AI: types in `prototype-3d/src/sim/enemies/infected-defs.js`, waves in
    `prototype-3d/src/sim/waves/wave-defs.js`; AI/waves are pure JS (no DOM / three.js). M1.6 = one type (THE HOLLOW), 3 waves × 9, max 5 alive.
    M1.7: visual VARIANTS (GUARD / TECHNICIAN / WORKER, `INFECTED_VARIANTS`) are cosmetic only — same type, stats, AI and
    hit zones; the spawn config carries `variant`, each wave is 3/3/3. Never give a variant its own stats.
11. The infected's pose scalars and hit zones are computed in the sim (`sim/enemies/hollow-rig.js`) and only applied by
    the renderer — never derive gameplay (hits, damage timing) from three.js objects.
12. Arena = `prototype-3d/src/data/maps/arena-m16.js` (28×14 interior), dressed in M1.7 as OUTPOST ZERO
    (`data/maps/outpost-zero.js`, same grid): props only on existing solid cells (exact footprint), wall decor ≤ 0.22 m deep,
    windows only in solid walls. Real point lights are pooled (4) + 1 daylight: do not add per-lamp lights.
    `?debug=1&map=training` keeps the old 16×16 map for the M0 tests.
13. The alarm between waves is a view of the existing intermission: `sim/waves/alarm.js` (pure) → `GameState.alarm`
    (written by the wave director) → renderer / HUD / audio read it. No separate timer; it resets on restart.
