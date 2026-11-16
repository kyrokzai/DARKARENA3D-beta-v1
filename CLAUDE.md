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
   **Owner exception (2026-11-16, M3.0):** 3D models, textures and animations that the owner personally supplied for
   DARK ARENA are allowed (`prototype-3d/assets/models/*.glb`; optimized / rigged offline, provenance in
   `docs/M3.0-REPORT.md`). The exception covers only those owner assets; every other restriction stays.
4. iPhone Safari (landscape, multitouch) is a first-class target; desktop keeps full mouse/keyboard control.
   For anything touching input/HUD use the `dark-arena-mobile` skill.
5. Never delete existing mechanics or old builds without agreement. Keep a restore point (git tag) before big changes.
6. Every change: run `node tests/build-1.3.test.js` (main game) and, for the 3D prototype,
   `node tests/sim-m0.test.mjs` + `node tests/prototype-m0.test.js` + `node tests/m1.1-mobile.test.js`
   + `node tests/m1.2-hud.test.js` + `node tests/sim-m1.3.test.mjs` + `node tests/m1.3-weapon.test.js`
   + `node tests/m1.4-hands.test.js` + `node tests/m1.4.1-jump.test.js`
   + `node tests/sim-m1.5.test.mjs` + `node tests/m1.5-infected.test.js`
   + `node tests/sim-m1.6.test.mjs` + `node tests/m1.6-evolution.test.js`
   + `node tests/sim-m1.7.test.mjs` + `node tests/m1.7-outpost.test.js`
   + `node tests/sim-m1.8.test.mjs` + `node tests/m1.8-visual.test.js`
   + `node tests/sim-m1.9.test.mjs` + `node tests/m1.9-fp-combat.test.js`
   + `node tests/sim-m2.0.test.mjs` + `node tests/m2.0-arsenal.test.js` + `node tests/m2.0-hud-ergonomics.test.js`
   + `node tests/sim-m3.0.test.mjs` + `node tests/m3.0-topdown.test.js` + `node tests/m3.0-aim-orientation.test.js`; report changed files,
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
    windows only in solid walls. Real point lights are pooled (4) + hemisphere fill (no directional daylight — removed for
    perf in M1.7): do not add per-lamp lights.
    `?debug=1&map=training` keeps the old 16×16 map for the M0 tests.
14. Render resolution comes from the graphics profile (`render/quality.js`: DPR cap + pixel budget + MSAA + adaptive
    guard); never hard-code a pixel ratio. Infected PBR maps are baked offline (`node scripts/bake-infected.js` after any
    change to the model / surface functions) into `prototype-3d/assets/infected/*.jpg`; LODs share the skeleton and atlas.
15. Melee is weapon data (`defs.js` → `melee` block) handled by the generic `sim/weapons/melee-system.js`: one strike per
    press + cooldown, never in the same tick as a shot, not during a reload; the viewmodel / HUD only read `GameState.melee`.
16. M2.0 arsenal: RAVEN / AK-47 MOD / DA-S12 KRAIT are entries in `defs.js` (`LOADOUT`) on the generic WeaponSystem (fire modes
    auto / semi / burst / pump, pellets + falloff, reload types magazine / shell); `sim/weapons/arsenal.js` keeps the ammo of
    the other weapons and switches (holster → draw; nothing fires, aims, reloads or strikes meanwhile; a cancelled magazine
    reload moves no rounds). Viewmodel kits share one hands rig; each gun has its own proxy volumes in `hand-poses.js` and
    must keep the M1.4 penetration limits. The flashlight is one camera spot light, in the render only while on (a spot light costs every lit fragment even at
    intensity 0); both shader variants are pre-compiled (`warmFlashVariants`), so a toggle never compiles during play. In PERFORMANCE
    (`flashTakesLamp`) it takes the slot of the farthest pooled lamp (swapped in one frame): never more lights per pixel.
    Touch HUD placement (`ui/hud-layout.js`): with the floating move stick no button / the slots sit in the movement thumb
    area (left `MOVE_ZONE_X`, below `MOVE_THUMB_Y`) — enforced at display time and by the editor alike; the slots keep a
    12 px gap. Check ergonomics with real touches (`m2.0-hud-ergonomics`), not only coordinates.
13. The alarm between waves is a view of the existing intermission: `sim/waves/alarm.js` (pure) → `GameState.alarm`
    (written by the wave director) → renderer / HUD / audio read it. No separate timer; it resets on restart.
17. M3.0 TOPDOWN is a second entry of the same prototype: `prototype-3d/topdown.html` + `src/topdown/` (55° follow camera,
    twin-stick touch / WASD + mouse, owner GLB characters). It reuses the M2.0 sim, map, weapons, audio and quality code;
    the Game gets top-down options (`aimHeight`, `flatAim`, `dash`, top-down waves) that are OFF by default, so the FPS
    game is unchanged. Top-down types `walker` / `brute` / `mutant` (`TOPDOWN_TYPES`) use the generic AI and the
    hollow-rig hit zones (rule 11); their clips are only the look. Three.js addons (GLTFLoader, BufferGeometryUtils,
    SkeletonUtils, meshopt_decoder) are vendored from the SAME three@0.186.0 in `vendor/three/addons/`. Walls are drawn
    cut at 1.5 m in top-down only (clipping on the level materials); the sim keeps full-height walls.
    Aim: the hero's facing is exactly the right finger / mouse point every frame (shortest way through ±π, no smoothing,
    no assist); the touch aim assist only bends the SHOT inside the sim step (`shotYaw`), never the facing (it used to
    snap the facing → stepwise turning on iPhone). Phones are landscape-only: portrait (touch device, height > width)
    shows the rotate screen, hides the controls, releases every finger / aim / fire and pauses a running match (wave,
    health, ammo kept); back in landscape it stays paused until ПРОДОЛЖИТЬ. A tall desktop window is not portrait.
