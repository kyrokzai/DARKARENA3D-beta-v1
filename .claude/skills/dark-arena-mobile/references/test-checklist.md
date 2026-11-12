# Mobile test checklist

## Automated (Claude runs these; Playwright + Chromium are preinstalled)

Use `devices['iPhone SE landscape']` and `devices['iPhone 14 Pro Max landscape']` from Playwright
(Chromium emulation — not real WebKit; it does not apply safe-area insets and does not reproduce
Safari zoom behaviour, so it complements, never replaces, the manual run).

1. No `pageerror` / console errors from menu → training → play → pause → settings → back.
2. Every settings control and button is reachable: for each `.panel`, either
   `scrollHeight <= clientHeight` or the panel is scrollable with `touch-action` allowing pan-y.
3. HUD controls: all rects inside the viewport, pairwise non-overlapping, each ≥ 44×44 px
   at `hudScale` minimum.
4. Multi-touch: dispatch touches via CDP `Input.dispatchTouchEvent` with 3 touch points
   (move stick + look + fire) and assert player moved, yaw changed, ammo decreased.
5. Release: start a joystick drag, fire `visibilitychange`/`pointercancel`; assert the vector is 0
   and fire stopped.
6. Movement math: at yaw = 0, holding strafe right must change only Y (+), at yaw = π/2 only X (−).
7. Screenshot both devices (deviceScaleFactor 2 for screenshots shown to the owner).

## Manual on a real iPhone (owner)

Open the GitHub Pages URL in Safari, and also from the Home Screen icon.
1. Rotate to landscape; portrait shows the rotate overlay and pauses.
2. Double-tap quickly on: the arena, FIRE, joystick, empty HUD corners → page never zooms.
3. Pinch with two fingers over the arena → page never zooms.
4. Hold joystick + drag look + hold FIRE at the same time (3 fingers) → all three work.
5. Pull down Notification Center mid-game, return → nothing stuck (no auto-move/auto-fire).
6. Settings: scroll to the bottom, change sliders, press Save. Arrange buttons, drag each one
   near the notch side and the home-indicator edge, press Done, reload page → layout kept.
7. Aim at a far small target: is the sensitivity both fast enough to turn 180° in one swipe and
   precise enough for small corrections?
8. Note the iPhone model and iOS version in the report.
