// DARK ARENA — Three.js prototype (M0). Wires: input → simulation (fixed step) → renderer → UI.
import { SIM_HZ } from './config.js';
import map from './data/maps/training.js';
import { Game } from './sim/game.js';
import { startLoop } from './core/loop.js';
import { InputState } from './input/input.js';
import { setupDesktopInput } from './input/desktop.js';
import { setupTouchInput } from './input/touch.js';
import { createRenderer } from './render/renderer.js';
import { loadSettings, mountSettings } from './ui/settings.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
const game = new Game(map);
const input = new InputState();
const gameEl = $('game');
const view = createRenderer({ container: gameEl, world: game.world, getSettings: () => settings });

// ---- screens: menu | play | paused | settings ----
let state = 'menu', settingsReturn = 'menu';
const SCREENS = ['menu', 'paused', 'settings'];
const portrait = matchMedia('(orientation: portrait) and (max-width: 900px)');
function show(next) {
  state = next;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== next);
  document.body.classList.toggle('playing', next === 'play');
  if (next !== 'play') { desktop.release(); touch.releaseAll(); input.clear(); }
}
const isPlaying = () => state === 'play';

const desktop = setupDesktopInput({
  input, canvas: view.renderer.domElement, getSettings: () => settings, isPlaying,
  onLockLost: () => { if (state === 'play') show('paused'); },
});
const touch = setupTouchInput({ input, layer: gameEl, getSettings: () => settings, isPlaying });

function play() {
  if (portrait.matches) return;
  show('play');
  desktop.requestLock();
}
$('playBtn').onclick = play;
$('resumeBtn').onclick = play;
$('menuSettings').onclick = () => { settingsReturn = 'menu'; show('settings'); };
$('pauseSettings').onclick = () => { settingsReturn = 'paused'; show('settings'); };
$('settingsBack').onclick = () => show(settingsReturn);
$('quitBtn').onclick = () => show('menu');
$('pauseBtn').addEventListener('click', () => { desktop.exitLock(); show('paused'); });
// Desktop: clicking the scene while playing without lock (e.g. after Esc in some browsers) re-locks.
view.renderer.domElement.addEventListener('click', () => { if (state === 'play') desktop.requestLock(); });
// Esc / P pause. (Most browsers consume Esc to exit Pointer Lock — then pointerlockchange pauses.)
addEventListener('keydown', e => {
  if (state === 'play' && (e.code === 'KeyP' || e.code === 'Escape')) { desktop.exitLock(); show('paused'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') show('paused'); });
const onOrientation = () => { if (portrait.matches && state === 'play') show('paused'); };
portrait.addEventListener('change', onOrientation);
addEventListener('resize', onOrientation);

mountSettings($('settingsForm'), settings, () => { view.resize(true); updateFpsVisibility(); });
const fpsEl = $('fps');
function updateFpsVisibility() { fpsEl.classList.toggle('hidden', !settings.showFps); }
updateFpsVisibility();

// ---- loop ----
let frames = 0, acc = 0, worst = 0;
const stats = { fps: 0, frameMs: 0, worstMs: 0 };
startLoop({
  hz: SIM_HZ,
  update(dt) { if (state === 'play') game.step(input.update(), dt); },
  frame(alpha, dt) {
    if (state === 'play') {
      desktop.frame(dt);
      const [dy, dp] = input.consumeLook();
      game.look(dy, dp);
    }
    const t0 = performance.now();
    view.render(game.player, state === 'play' ? alpha : 1);
    const ms = performance.now() - t0;
    frames++; acc += dt; worst = Math.max(worst, ms);
    if (acc >= 0.5) {
      stats.fps = Math.round(frames / acc); stats.frameMs = +(1000 * acc / frames).toFixed(1); stats.worstMs = +worst.toFixed(1);
      frames = 0; acc = 0; worst = 0;
      if (settings.showFps) { const i = view.info; fpsEl.textContent = `${stats.fps} FPS · ${stats.frameMs} ms · draw ${i.calls} · tri ${i.triangles}`; }
    }
  },
});

show('menu');

// ---- test hook (only with ?debug=1) ----
if (/[?&]debug=1(&|$)/.test(location.search)) {
  import('./debug.js').then(m => m.installDebug({ game, input, view, settings, stats, touch, getState: () => state, show }));
}
