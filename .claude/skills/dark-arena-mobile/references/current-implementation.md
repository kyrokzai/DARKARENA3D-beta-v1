# Current mobile input implementation (audited 2026-11-08, BUILD 1.2)

File: `DARK_ARENA_1_2_GeometryFix.html` (BUILD 1.1 `index.html` has the same input code).
Everything is in one inline `<script>` IIFE; names below are the functions/ids to search for.

## Map of the code

| Area | Where | How it works now |
|---|---|---|
| Viewport | `<meta name=viewport>` | `maximum-scale=1,user-scalable=no,viewport-fit=cover` (iOS ignores the zoom part) |
| Global CSS | `*{... touch-action:none}` | Applies to EVERY element, menus included |
| Settings | `defaults`, `cfg`, key `darkarena_settings_v10` | sensX 1.25, sensY 1.15, invertY, fov 75, hudScale 1, opacity .82, positions as viewport fractions |
| Layout | `controlsLayout()` | `left = fx * innerWidth`, `top = fy * innerHeight`; ignores safe-area insets; `style.scale = hudScale` |
| Buttons/joystick | `bindControl(id, down, up)` | pointerdown + setPointerCapture, one pointerId per control; also handles drag in edit mode |
| Move stick | `updateMove(e)` | vector from element centre, radius = 35 % of scaled width, **no dead zone** |
| Look | `cv` pointerdown/move | any finger on the canvas (also on the left half) becomes look finger; `yaw += dx*.0036*sensX`, `pitch += dy*.0033*sensY`, pitch clamp ±1.05 rad. Pixel-based, so the feel depends on screen size |
| Fire | `bindControl('shoot')` | hold-to-fire via `fireHeld`; fire rate 135 ms |
| Jump | `bindControl('jump')` | visual only (camera bob), no gameplay effect |
| Zoom guards | document listeners | `gesturestart` preventDefault; `touchmove` preventDefault on **document**; `contextmenu`, `selectstart` blocked. No double-tap (`touchend`) guard, no `dblclick` guard (v0.5 in shooter3Dbykyro had both; they were dropped in 1.1) |
| Lifecycle | `visibilitychange` | releases fire/joystick/look and pauses. Nothing on `blur`/`pagehide`/orientation change |
| Orientation | CSS `.rotate` overlay | shown in portrait ≤ 700 px wide; game is not paused by it |
| Edit mode | `$('editHud').onclick` | reassigns `$('pauseBtn').onclick` back and forth |

## Status in BUILD 1.3 (`DARK_ARENA_1_3.html`, 2026-11-09)

Fixed: #1 (yaw), #2 (menu scroll: `touch-action:none` only on `#view, .hud, .hud *, .rotate`; menus `pan-y`),
#3 (double-tap guard + `dblclick` + `gesturechange/end` on the game layer only; `touchstart`
preventDefault on canvas/HUD except buttons), #6 (`releaseAll()` registry: blur, pagehide,
visibilitychange, orientationchange; portrait pauses the game).
Still open: #4 (safe areas), #5 (dead zone, device-independent sensitivity, right-stick option, aim on FIRE).
Test hook: `window.__DA` with `?debug=1`. Tests: `tests/build-1.3.test.js`.

## Known defects (verified in BUILD 1.2)

1. **Strafe and wall rays use `player.y` instead of `player.yaw`** (`update()` movement line and the
   wall-ray loop in `render()`). Strafing direction and the wall projection depend on the player's
   Y coordinate. Playwright: strafing right at yaw=0 from (8,8) moved to (6.90,7.90) — along −X —
   instead of +Y. This is the main cause of "camera/movement acts weird near walls".
2. Settings panel is taller than iPhone landscape (441 px content vs 320 px on iPhone SE, 380 px on
   14 Pro Max); "Save / Reset / Arrange buttons" are below the fold and cannot be scrolled because
   of global `touch-action:none` + document `touchmove` preventDefault.
3. No double-tap guard → Safari double-tap zoom / smart zoom can still fire on some elements.
4. HUD positions ignore safe areas → on notch iPhones in landscape the joystick can sit in the
   unsafe band / edge-swipe zone.
5. Joystick has no dead zone; look sensitivity is per-pixel (device dependent); no look smoothing
   or acceleration options; no right-joystick option; cannot aim while holding FIRE with one thumb.
6. Rotate overlay does not pause the game; `blur`/`pagehide` do not release pointers.
