---
name: dark-arena-mobile
description: >
  Mobile controls for DARK ARENA on iPhone/Safari and other touch devices: landscape-only play,
  multitouch with Pointer Events, left move joystick + right look (touchpad or second joystick),
  fire/reload/jump buttons, HUD layout editor, safe areas, look sensitivity (separate X/Y), and
  preventing accidental page zoom / double-tap zoom / scroll without breaking menus. Use whenever
  touching input handling, HUD layout, settings for controls, viewport/meta tags, or when the user
  reports anything about iPhone, Safari, touch, joystick, sensitivity, zoom or button placement.
---

# DARK ARENA — Mobile Controls (iPhone / Safari first)

Project rules for touch input and the mobile HUD. Engine-agnostic: applies to the current
Canvas 2D raycaster and to a future Three.js renderer alike, because input lives in the DOM
layer above the canvas. Read `references/current-implementation.md` before editing input code,
and run `references/test-checklist.md` before reporting a change as done.

## Non-negotiable rules

1. **One input model: Pointer Events.** `pointerdown/move/up/cancel` + `setPointerCapture`.
   Do not mix in `touchstart` handlers for gameplay (only the zoom guards below use touch events).
   Every control owns exactly one `pointerId` at a time; a second finger on the same control is ignored.
2. **Every captured pointer must be released** on `pointerup`, `pointercancel`,
   `lostpointercapture`, `visibilitychange` (hidden), `blur`, `pagehide`, orientation/resize, and
   when the game state leaves `game`. Release = zero the joystick vector, stop fire, clear look id.
   A "stuck" joystick or auto-fire after a notification banner is a release bug.
3. **Zoom/scroll prevention is scoped, never global.** Menus must stay scrollable and tappable.
   - Game layer (`#view`, `.hud`, `.control`): `touch-action: none`.
   - Menus (`.screen`, `.panel`): `touch-action: pan-y` (or `manipulation`), `overflow:auto`,
     `overscroll-behavior: contain`.
   - `document`-level `touchmove` preventDefault is FORBIDDEN — it blocks menu scrolling on iOS.
     If needed, attach `{passive:false}` touchmove preventDefault to the game layer only.
   - iOS ignores `user-scalable=no` / `maximum-scale` since iOS 10. Keep the meta tag, but rely on:
     `gesturestart`/`gesturechange`/`gestureend` preventDefault (pinch), a double-tap guard on
     `touchend` (< 300 ms between taps → preventDefault) attached to the game layer, `dblclick`
     preventDefault, and `touch-action` as above.
   - Never break focus/activation of `<button>`, `<input type=range>`, `<select>` in menus.
4. **Safe areas.** HUD positions are stored normalized **inside the safe rectangle**, not the
   whole viewport: `px = insetL + fx * (innerWidth - insetL - insetR)` (same for Y). Read insets
   from a probe element styled with `padding: env(safe-area-inset-*)` and re-read on resize.
   Keep ≥ 16 px from the bottom edge (home indicator) and ≥ 12 px from side edges (edge swipes).
   Requires `viewport-fit=cover` in the viewport meta.
5. **Landscape only.** iPhone Safari has no `screen.orientation.lock()`: show the rotate overlay in
   portrait and pause the game. Re-layout on `resize` and `visualViewport.resize` (Safari toolbars
   change the height). Use `innerWidth/innerHeight` or `visualViewport`, not `screen.*`.
   Fullscreen API on iPhone is not reliable for non-video elements — feature-detect; recommend
   "Add to Home Screen" (standalone) for full-screen play.
6. **Touch targets ≥ 44×44 CSS px** (Apple HIG) at the smallest HUD scale. Buttons must not
   overlap each other or the look zone's centre; clamp positions in the layout editor.
7. **Settings are versioned.** localStorage key carries a version; on schema change migrate old
   values instead of silently resetting. Every `localStorage` access in `try/catch` (Safari
   private mode can throw).

## Movement joystick (left)

- Radial vector, **dead zone 0.12–0.15**, rescale after the dead zone so output starts at 0:
  `m' = (m - dz) / (1 - dz)`; optional response curve `m'^1.3` for fine control.
- Radius measured from the joystick centre, not from the element's bounding box after `scale`.
  If `hudScale` uses CSS `scale`, compute radius from `getBoundingClientRect()` (already scaled).
- Option "floating joystick": the base appears where the thumb lands inside the left zone
  (left ~40 % of the safe rect). Keep the fixed variant as default until the owner chooses.
- Movement is camera-relative: forward = (cos yaw, sin yaw), right = (-sin yaw, cos yaw).
  Always use **yaw**, never a position coordinate, in these formulas.

## Look (right side)

Two supported modes (setting), default = touchpad:
- **Touchpad look** (current): delta of the captured finger → angle. Express sensitivity in a
  device-independent unit: **degrees per full-width swipe** (e.g. 120–220° default ≈ 170°).
  `yaw += dx / safeWidth * degPerWidth * π/180 * sensX`. Same for pitch with `sensY`
  (default sensY ≈ 0.8 × sensX) and optional invert.
- **Right joystick** (rate-based): angular speed = curve(stick) × maxRate (≈ 180–300 °/s),
  dead zone like the left stick. Needed for players who prefer twin-stick.
- Apply look in the `pointermove` handler (lowest latency), clamp pitch.
  Use `getCoalescedEvents()` when available (feature-detect) to avoid lost micro-movements.
  Smoothing: none or a 1-frame EMA at most; any heavier smoothing feels like input lag.
- Optional acceleration: gain grows with finger speed (low gain for slow precise aim).
- Fire-while-aiming: offer "drag on FIRE button also turns the camera" as an option, so a single
  right thumb can shoot and aim.
- Separate sensitivity profiles for touch and mouse; never reuse the mouse multiplier on touch.

## Buttons

- `pointerdown` triggers the action (no click delay); hold-to-fire via flag cleared on release.
- Give tactile feedback: pressed style + optional `navigator.vibrate` (feature-detect; not on iOS).
- Jump, reload, fire must keep working while the move joystick and look finger are held
  (3 simultaneous pointers). Test with 3 fingers.

## HUD layout editor

- Edit mode: drag controls, positions saved normalized in the safe rect, clamped so controls stay
  fully on screen and don't overlap (push apart on drop). Size and opacity sliders, "reset".
- Optional: separate layouts per aspect bucket (≤ 16:9, ~19.5:9, tablets 4:3).
- Exiting edit mode must restore the normal handlers without reassigning `onclick` chains.

## Workflow when changing mobile input

1. Read `references/current-implementation.md`; locate the exact functions you touch.
2. Change the smallest scope; keep desktop (mouse + keyboard, pointer lock) working.
3. Run the automated checks in `references/test-checklist.md` (Playwright, iPhone landscape
   emulation, multi-touch via CDP) and attach screenshots.
4. Give the owner the manual iPhone checklist from the same file. A change is not "accepted"
   until the owner confirms on a real iPhone.

## Related skills

`input-systems` (dead zones, buffering, remapping), `camera-systems` (FPS look),
`game-ui-ux` (HUD readability, menus), `game-feel` (button feedback), `performance-optimization`.
