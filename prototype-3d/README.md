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
| Click PLAY → mouse is captured (Pointer Lock) | Left 40 % of the screen: floating joystick |
| WASD — move, mouse — look, arrows — turn | Right side: drag to look |
| Esc / P — pause (if capture is refused: hold left button and drag to look) | ☰ — pause |

Settings (⚙): mouse sensitivity, touch "degrees per full-width swipe", touch X/Y multipliers, invert Y,
field of view, render resolution (retro pixels ↔ sharp), FPS counter. Stored in `localStorage`
(`darkarena_proto3d_settings_v1`, separate from the main game).

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
    ui/settings.js      settings form + persistence
    debug.js            test hook, loaded only with ?debug=1
```

Rule: `sim/` never imports three.js or touches the DOM. Enemies, weapons, waves (M1+) go into `sim/` as systems
that emit events; `render/`, `ui/` and a future `audio/` subscribe to them.

## Tests

```bash
node tests/sim-m0.test.mjs          # pure logic, no browser
node tests/prototype-m0.test.js     # Playwright + Chromium (needs: npm i -D playwright)
```
