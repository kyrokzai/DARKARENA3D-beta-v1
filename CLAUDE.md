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
   + `node tests/m1.2-hud.test.js`; report changed files,
   test results, how to verify on PC and iPhone, and known limitations. Not accepted until the owner confirms.
7. Test hooks and the debug panel are allowed only behind `?debug=1`.
8. Gameplay values reach the HUD only through `prototype-3d/src/sim/game-state.js` (GameState + events);
   weapon/enemy systems write into it, `ui/game-hud.js` only reads it.
