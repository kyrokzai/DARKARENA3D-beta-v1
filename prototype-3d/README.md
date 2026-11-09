# DARK ARENA — 3D prototype (M0)

Standalone Three.js (r186) prototype. Independent of the working game (`index.html`, BUILD 1.1–1.3).
Native ES modules, no build step, no external services — works as static files on GitHub Pages.

## Run locally

ES modules do not load from `file://`, so serve the repository folder over HTTP:

```bash
cd DARKARENA3D-beta-v1
python3 -m http.server 8000
# open http://localhost:8000/prototype-3d/
```

Any static server works (`npx serve`, VS Code Live Server…).

**On an iPhone in the same Wi-Fi:** run `python3 -m http.server 8000 --bind 0.0.0.0` on the computer and
open `http://<computer-IP>:8000/prototype-3d/` in Safari. Turn the phone to landscape.

Debug/test hook: add `?debug=1` (exposes `window.__DA3`; never needed for normal play).

## Controls

| PC | Phone (landscape) |
|---|---|
| Click PLAY → mouse is captured (Pointer Lock) | Left 40 % of the safe area: movement joystick (floating or fixed) |
| WASD — move, mouse — look, arrows — turn | Right side: swipe to look, or a right virtual joystick (setting) |
| Esc / P — pause (if capture is refused: hold left button and drag to look) | ☰ — pause; FIRE / AIM / RELOAD / JUMP buttons emit intents (mechanics come in M1.3+) |

Fingers are independent: move + look + two buttons (4 fingers) work at the same time; a finger that holds FIRE
can also turn the camera (setting). All fingers are released on app switch, notification, rotation.

**HUD editor** (Pause → «Расставить HUD», or Settings → HUD): drag any control, select it and change its size
with − / +; a control cannot leave the safe area or overlap another one; «Стандарт» restores the BUILD 1.3 layout
(asks for confirmation); «Отмена» discards; «Готово» saves.

Settings (tabs СЕНСОР / HUD / ПК / ГРАФИКА): move/look stick modes, dead zones, swipe degrees per screen width,
right-stick speed, horizontal and vertical sensitivity, invert Y, fire-look, global HUD size and opacity, minimap
and action-button visibility, mouse sensitivity, FOV, render resolution, FPS counter.
Stored in `localStorage`: `darkarena_proto3d_settings_v1` and `darkarena_proto3d_layout_v1` (separate from the main game).

## Structure

```
prototype-3d/
  index.html            DOM: 3D view container, HUD, menus, importmap ("three" → vendor)
  style.css             layout, safe areas (--sa-* variables), touch-action scoping
  vendor/three/         three.module.js + three.core.js (r186, unmodified), LICENSE, VERSION.md
  src/
    main.js             wiring: input → sim (fixed 60 Hz) → render; screens; FPS counter
    config.js           scale (cell 2 m, wall 3 m, eye 1.6 m), speeds, default settings
    data/maps/training.js  the BUILD 1.3 grid + lamps
    core/loop.js        fixed-timestep loop with render interpolation
    sim/                PURE gameplay logic (no DOM, no three.js): world, collision, player, game
    input/              input.js (device-independent state), desktop.js, touch.js
    render/             renderer.js (camera, resize, context loss), level.js (map → meshes), textures.js
    ui/settings.js      tabbed settings screen + persistence
    ui/hud-layout.js    HUD layout model (pure): elements, BUILD 1.3 defaults, safe-area rects, overlap checks
    ui/hud.js           HUD view: controls, minimap, layout application
    ui/hud-editor.js    drag / resize / reset editor
    ui/safe-area.js     reads env(safe-area-inset-*)
    debug.js            test hook, loaded only with ?debug=1
```

Rule: `sim/` never imports three.js or touches the DOM. Enemies, weapons, waves (M1+) go into `sim/` as systems
that emit events; `render/`, `ui/` and a future `audio/` subscribe to them.

## Tests

```bash
node tests/sim-m0.test.mjs          # pure logic, no browser
node tests/prototype-m0.test.js     # Playwright + Chromium (needs: npm i -D playwright)
node tests/m1.1-mobile.test.js      # M1.1 mobile controls & HUD editor
```
