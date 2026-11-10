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
| Esc / P — pause (if capture is refused: hold left button and drag to look) | ☰ — pause; ОГОНЬ / ПРИЦЕЛ / ПЕРЕЗАР. work (M1.3), ПРЫЖОК comes in M1 later |

Fingers are independent: move + look + two buttons (4 fingers) work at the same time; a finger that holds FIRE
can also turn the camera (setting). All fingers are released on app switch, notification, rotation.

**HUD editor** (Pause → «Расставить HUD», or Settings → HUD): drag any control, select it and change its size
with − / +; a control cannot leave the safe area or overlap another one; «Стандарт» restores the BUILD 1.3 layout
(asks for confirmation); «Отмена» discards; «Готово» saves.

Settings (tabs СЕНСОР / HUD / ПК / ГРАФИКА): move/look stick modes, dead zones, swipe degrees per screen width,
right-stick speed, horizontal and vertical sensitivity, invert Y, fire-look, global HUD size and opacity, minimap
and action-button visibility, mouse sensitivity, FOV, render resolution, FPS counter.
Stored in `localStorage`: `darkarena_proto3d_settings_v1` and `darkarena_proto3d_layout_v1` (separate from the main game).

## Gameplay HUD (M1.2)

Health (bar + trail on damage, amber ≤ 50 %, red pulsing + red vignette ≤ 25 %), ammo `mag / reserve`
(amber when low, «ПЕРЕЗАРЯДИ» when empty, reload progress), wave number + enemies left + banner, hit marker on the
crosshair (white hit, gold headshot, red kill), minimap (can be hidden). Info panels are part of the HUD editor
(move / resize), never take touches during play, and keep ≥ 70 % opacity for readability.
Separate layouts for touch and desktop (desktop: health bottom-left, ammo bottom-right, wave top-centre).

Values come only from `src/sim/game-state.js` (no fake enemies or shooting). With `?debug=1` a **DBG** button
(top centre, during play) opens a panel to change HP, ammo, reload, wave and hits; tests use the same actions
via `window.__DA3.dbg` / `window.__DA3.gs`.

## Weapon: DA-R1 RAVEN (M1.3)

Assault rifle: 30/120, full auto 600 RPM, reload 1.3 s, hitscan through the crosshair (walls block),
head 50 / body 25 damage, controllable vertical recoil, small horizontal drift, spread grows when moving and
during long sprays (short bursts stay accurate), ADS (smooth move to the red-dot, FOV ×0.8, spread ×0.3,
recoil ×0.7, look sensitivity ×0.7). Muzzle flash, smoke after bursts, ejected casings, wall decals + sparks,
dynamic crosshair, original Web Audio sounds (shot, dry fire, reload, hit/headshot/kill).

| PC | Phone |
|---|---|
| LMB (mouse captured) — fire, hold = auto · RMB hold — ADS · R — reload · Space — jump · F — fire without mouse capture | ОГОНЬ hold = auto · ПРИЦЕЛ tap toggles ADS · ПЕРЕЗАР. · ПРЫЖОК |

Test mode `?debug=1` → **DBG**: skins OBSIDIAN / BLOODLINE / NEON GHOST, training targets, real reload.
Model viewer (developer tool, not part of the game): `prototype-3d/tools/weapon-viewer.html` (`?sheet=1` = all
skins × angles). Weapon stats live in `src/sim/weapons/defs.js`; new weapons are new entries there.

## First-person hands (M1.4)

Black tactical gloves (separate fingers, knuckle guards, finger pads), dark sleeves with graphite inserts. Right hand
on the pistol grip with the index finger on the trigger (squeezes on every shot, leaves the trigger during reload);
left hand under the handguard. Idle breathing; walk bob, recoil and ADS come from the weapon rig (the hands are
children of the weapon). Reload (same 1.3 s): release handguard → magazine out with the hand → new magazine →
insert → palm slap → charging handle → back to the handguard.

- `render/weapons/hands-model.js` — geometry + rig (instanced: 7 draw calls for both hands, ~12.6k triangles)
- `render/weapons/hand-poses.js` — weapon proxy volumes, finger wrap / reach solvers, named poses, blending, penetration check
- `render/weapons/weapon-anim.js` — the ONE reload timeline (weapon tilt, magazines, charging handle, left-hand keys)
- `render/weapons/hands-controller.js` — applies the timeline + poses (shared by the game and the viewer)

Viewer: `tools/weapon-viewer.html?hands=1&r=0.3` (r = reload progress, −1 = holding).

## First infected: DA-INF01 THE HOLLOW (M1.5)

PLAY starts wave 1: three HOLLOW appear one by one (never in front of you, ≥ 9 m away), detect you within 15 m
with line of sight (walls block), chase round obstacles, swing a claw (15 HP, once per swing, 1.2 s cooldown).
Head 50 / body 25 (RAVEN unchanged), 100 HP. Kills and remaining infected in the wave panel; "WAVE 1 COMPLETE";
death screen with ЗАНОВО. `?debug=1` keeps the shooting range without waves; `?debug=1&waves=1` = real waves + hooks.

- `sim/enemies/infected-defs.js` (data), `sim/enemies/infected.js` (FSM IDLE/ALERT/CHASE/ATTACK/RECOVER/DEAD)
- `sim/nav/grid-nav.js` (line of sight, shared flow field), `sim/waves/` (data + director)
- `render/enemies/hollow-model.js` (procedural skinned model), `hollow-anim.js` (procedural animation), `infected-view.js` (pool + effects)
- `tools/infected-viewer.html` — model + animation viewer (`?anim=walk&t=1.2`)

## M1.6: arena ×2, three waves, AI 2.0, HOLLOW rebuild

- Arena `data/maps/arena-m16.js`: 28 × 14 cells interior (2× M1.5), old hall unchanged + a second hall; 9 lamp
  fixtures, 4 pooled lights. Match = 3 waves × 9 infected, max 5 alive, intermission, victory screen (`sim/waves/`).
- AI (`sim/enemies/infected.js`): IDLE / ALERT / CHASE / SEARCH / PATROL / ATTACK / RECOVER / DEAD — line of sight,
  1.2 s memory, last known position, search, re-detection, hearing gunfire; own distance field per search goal.
- `sim/enemies/hollow-rig.js`: skeleton data + pose maths shared by sim (animated hit zones) and renderer (bones).
- Model: lofted skins (no tube/ball joints), normal-mapped skin and rags; animation: IK-planted feet, turn lead,
  attack, hit reactions, three death falls chosen by the sim so the body never ends inside a wall.
- Menu: ИГРАТЬ / НАСТРОЙКИ / ОБ ИГРЕ, keyboard (↑ ↓ Enter Esc), pause, death and victory screens.
- Viewer: `tools/infected-viewer.html?anim=run&hb=1` (hb = show sim hit zones).

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
    sim/game-state.js   HP / ammo / reload / wave model + events (what the HUD reads)
    sim/weapons/        defs.js (weapon data), weapon-system.js (generic fire/reload/ADS/spread/recoil)
    sim/hitscan.js      3D ray vs grid walls/floor/ceiling and hittables (head/body)
    sim/targets.js      training targets (test mode) — same hittable interface enemies will use
    render/weapons/     raven-model.js (procedural model), raven-skins.js, viewmodel.js, weapon-textures.js, studio-env.js
    render/effects/     impacts.js (decals + sparks), render/targets.js
    audio/sfx.js        Web Audio sounds with Safari/iOS unlock handling
    tools/weapon-viewer.js  model viewer (with ../tools/weapon-viewer.html)
    ui/game-hud.js      binds GameState → health, ammo, wave panels, hit marker, vignette, banner
    debug-panel.js      ?debug=1 only: buttons that change GameState
    ui/hud-layout.js    HUD layout model (pure): elements, touch & desktop profiles, safe-area rects, overlap checks
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
node tests/m1.2-hud.test.js         # M1.2 gameplay HUD (model + browser)
node tests/sim-m1.3.test.mjs        # M1.3 weapon logic (Node)
node tests/m1.3-weapon.test.js      # M1.3 weapon in the browser
node tests/m1.4-hands.test.js       # M1.4 hands + weapon animations
node tests/m1.4.1-jump.test.js      # M1.4.1 jump (sim + desktop + touch)
node tests/sim-m1.5.test.mjs        # M1.5 infected AI + waves (Node)
node tests/m1.5-infected.test.js    # M1.5 infected in the browser
node tests/sim-m1.6.test.mjs        # M1.6 arena, waves, AI 2.0, hit zones, death falls (Node)
node tests/m1.6-evolution.test.js   # M1.6 menus, full match, animation ↔ hit zones, phone
```
