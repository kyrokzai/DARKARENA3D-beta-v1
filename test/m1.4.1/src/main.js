// DARK ARENA — Three.js prototype (M0 … M1.3). Wires: input → simulation (fixed step) → renderer → HUD/UI.
import { SIM_HZ } from './config.js';
import map from './data/maps/training.js';
import { Game } from './sim/game.js';
import { startLoop } from './core/loop.js';
import { InputState } from './input/input.js';
import { setupDesktopInput } from './input/desktop.js';
import { setupTouchInput } from './input/touch.js';
import { createRenderer } from './render/renderer.js';
import { loadSettings, mountSettings } from './ui/settings.js';
import { createHud } from './ui/hud.js';
import { createHudEditor } from './ui/hud-editor.js';
import { cloneDefaultLayout } from './ui/hud-layout.js';
import { createGameHud } from './ui/game-hud.js';
import { createSfx } from './audio/sfx.js';
import { SKINS } from './render/weapons/raven-skins.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
const game = new Game(map);
const input = new InputState();
const gameEl = $('game');
if (!SKINS[settings.weaponSkin]) settings.weaponSkin = 'obsidian';
const view = createRenderer({ container: gameEl, world: game.world, getSettings: () => settings, skin: settings.weaponSkin });
const sfx = createSfx(() => settings);
const hud = createHud({ root: gameEl.querySelector('.hud'), settings, world: game.world });
const gameHud = createGameHud({ game, hud });

// ---- screens: menu | play | paused | settings | edit ----
let state = 'menu', settingsReturn = 'menu', editReturn = 'settings';
const SCREENS = ['menu', 'paused', 'settings'];
const portrait = matchMedia('(orientation: portrait) and (max-width: 900px)');
function show(next) {
  state = next;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== next);
  document.body.classList.toggle('playing', next === 'play');
  document.body.classList.toggle('editing', next === 'edit');
  // Leaving play (pause, menus, editor, focus loss): stop firing and leave ADS safely.
  if (next !== 'play') { desktop.release(); touch.releaseAll(); input.clear(); game.releaseCombat(); }
  hud.layoutNow();
}
const isPlaying = () => state === 'play';

const desktop = setupDesktopInput({
  input, canvas: view.renderer.domElement, getSettings: () => settings, isPlaying,
  onLockLost: () => { if (state === 'play') show('paused'); },
});
const touch = setupTouchInput({ input, layer: gameEl, hud, getSettings: () => settings, isPlaying });
const editor = createHudEditor({
  hud, settings, toolbar: $('editBar'),
  onExit: () => { show(editReturn); settingsUi.sync(); },
});

function play() {
  if (portrait.matches) return;
  show('play');
  desktop.requestLock();
}
function editHud(from) { editReturn = from; desktop.exitLock(); show('edit'); editor.enter(); }
$('playBtn').onclick = play;
$('resumeBtn').onclick = play;
$('menuSettings').onclick = () => { settingsReturn = 'menu'; show('settings'); };
$('pauseSettings').onclick = () => { settingsReturn = 'paused'; show('settings'); };
$('pauseEditHud').onclick = () => editHud('paused');
$('settingsBack').onclick = () => show(settingsReturn);
$('quitBtn').onclick = () => show('menu');
$('pauseBtn').addEventListener('click', () => { desktop.exitLock(); show('paused'); });
// Desktop: clicking the scene while playing without lock re-locks.
view.renderer.domElement.addEventListener('click', () => { if (state === 'play') desktop.requestLock(); });
// Esc / P pause. (Most browsers consume Esc to exit Pointer Lock — then pointerlockchange pauses.)
addEventListener('keydown', e => {
  if (state === 'play' && (e.code === 'KeyP' || e.code === 'Escape')) { desktop.exitLock(); show('paused'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') show('paused'); });

// Switching to touch (first touch on a hybrid device) changes the layout profile.
new MutationObserver(() => hud.layoutNow()).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Rotation / resize: pause in portrait, re-layout HUD from normalized positions, release fingers.
function onViewportChange() {
  if (portrait.matches && state === 'play') show('paused');
  touch.releaseAll();
  hud.layoutNow();
  editor.refresh();
}
portrait.addEventListener('change', onViewportChange);
addEventListener('resize', onViewportChange);
if (window.visualViewport) visualViewport.addEventListener('resize', onViewportChange);

const settingsUi = mountSettings($('settingsForm'), settings, (s, key) => {
  view.resize(true); updateFpsVisibility(); hud.layoutNow();
  if (key === 'lookMode' || key === 'moveStickMode') touch.releaseAll();
}, {
  editHud: () => editHud('settings'),
  resetLayout: () => hud.setLayout(cloneDefaultLayout(hud.profile)),
});
const fpsEl = $('fps');
function updateFpsVisibility() { fpsEl.classList.toggle('hidden', !settings.showFps); }
updateFpsVisibility();

// ---- weapon feedback: viewmodel, effects, sound (all from sim events) ----
game.on('fire', e => { view.onShot(e); sfx.shot(e.ads); });
game.on('impact', e => { view.onImpact(e); if (Math.random() < 0.5) sfx.impact(); });
game.on('dryFire', () => sfx.dry());
game.on('reloadStart', e => sfx.reload(e.time));
game.on('adsChange', e => { if (e.ads) sfx.adsIn(); });
game.on('hit', e => sfx.hit(e.headshot, e.kill));

// ---- loop ----
let frames = 0, acc = 0, worst = 0;
const stats = { fps: 0, frameMs: 0, worstMs: 0 };
startLoop({
  hz: SIM_HZ,
  update(dt) { if (state === 'play') game.step(input.update(), dt); },
  frame(alpha, dt) {
    if (state === 'play') {
      desktop.frame(dt);
      touch.frame(dt);
      const [dy, dp] = input.consumeLook();
      // ADS lowers look sensitivity (weapon config) for precise aiming.
      const k = 1 - game.state.weapon.ads * (1 - game.weapon.def.ads.sensMult);
      game.look(dy * k, dp * k);
    }
    const t0 = performance.now();
    const w = game.state.weapon;
    view.render(game.player, state === 'play' ? alpha : 1, { dt, ads: w.ads, fovMult: game.weapon.def.ads.fovMult, reload: w.reloading ? w.reloadProgress : -1, triggerDown: game.weapon.triggerDown, hittables: game.hittables, showWeapon: state !== 'menu' });
    gameHud.frame(view.camera.fov);
    if (state === 'play' || state === 'edit') hud.drawMinimap(game.player);
    const ms = performance.now() - t0;
    frames++; acc += dt; worst = Math.max(worst, ms);
    if (acc >= 0.5) {
      stats.fps = Math.round(frames / acc); stats.frameMs = +(1000 * acc / frames).toFixed(1); stats.worstMs = +worst.toFixed(1);
      frames = 0; acc = 0; worst = 0;
      if (settings.showFps) { const i = view.infoTotal; fpsEl.textContent = `${stats.fps} FPS · ${stats.frameMs} ms · draw ${i.calls} · tri ${(i.triangles / 1000).toFixed(1)}k`; }
    }
  },
});

show('menu');

// ---- test hook (only with ?debug=1) ----
if (/[?&]debug=1(&|$)/.test(location.search)) {
  import('./debug.js').then(m => m.installDebug({ game, input, view, settings, stats, touch, hud, editor, gameHud, sfx, getState: () => state, show }));
}
