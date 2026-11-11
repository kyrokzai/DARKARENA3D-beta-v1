// DARK ARENA — Three.js prototype (M0 … M1.6). Wires: input → simulation (fixed step) → renderer → HUD/UI.
import { SIM_HZ } from './config.js';
import arena from './data/maps/outpost-zero.js'; // M1.7: the M1.6 arena (same grid) dressed as OUTPOST ZERO
import training from './data/maps/training.js';
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
import { alarmVisual } from './sim/waves/alarm.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
// ?debug=1&map=training keeps the original 16×16 Training Grounds for comparisons; the game uses the M1.6 arena.
const map = /[?&]debug=1(&|$)/.test(location.search) && /[?&]map=training(&|$)/.test(location.search) ? training : arena;
const VERSION = 'M1.7';
const game = new Game(map);
const input = new InputState();
const gameEl = $('game');
if (!SKINS[settings.weaponSkin]) settings.weaponSkin = 'obsidian';
const view = createRenderer({ container: gameEl, world: game.world, getSettings: () => settings, skin: settings.weaponSkin });
const sfx = createSfx(() => settings);
const hud = createHud({ root: gameEl.querySelector('.hud'), settings, world: game.world });
const gameHud = createGameHud({ game, hud, getSettings: () => settings });

// ---- screens: menu | play | paused | settings | edit ----
let state = 'menu', settingsReturn = 'menu', editReturn = 'settings';
const SCREENS = ['menu', 'about', 'paused', 'settings', 'dead', 'victory'];
const portrait = matchMedia('(orientation: portrait) and (max-width: 900px)');
const coarse = matchMedia('(pointer: coarse)');
let focusTimer = 0;
function show(next) {
  state = next;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== next);
  document.body.classList.toggle('playing', next === 'play');
  document.body.classList.toggle('is-dead', next === 'dead');
  // keyboard: every screen starts with its first button focused; nothing stays focused while playing
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  // (after death / victory / pause the focus comes a moment later, so a key still held from the fight — Space! —
  //  cannot press ЗАНОВО or ПРОДОЛЖИТЬ by accident)
  clearTimeout(focusTimer);
  if (SCREENS.includes(next) && !coarse.matches) {
    const focus = () => { if (state === next) { const b = $(next).querySelector('button'); if (b) b.focus({ preventScroll: true }); } };
    if (next === 'menu' || next === 'about' || next === 'settings') focus(); else focusTimer = setTimeout(focus, 450);
  }
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

// ИГРАТЬ always starts a NEW match from wave 1; ПРОДОЛЖИТЬ resumes the current one.
// ?debug=1 keeps the M1.3/M1.4 shooting range (no waves) unless &waves=1.
const DEBUG = /[?&]debug=1(&|$)/.test(location.search);
const WAVES_ON = /[?&]waves=1(&|$)/.test(location.search) || (!DEBUG && !/[?&]waves=0(&|$)/.test(location.search));
function newMatch() {
  if (portrait.matches) return;
  stepPhase.clear(); game.restart({ waves: WAVES_ON });
  show('play'); desktop.requestLock();
}
function resume() {
  if (portrait.matches) return;
  if (game.player.dead) { show('dead'); return; }      // paused at the moment of death → death screen first
  if (game.matchOver) { show('victory'); return; }
  show('play'); desktop.requestLock();
}
function toMenu() { stepPhase.clear(); game.restart({ waves: false }); show('menu'); } // the abandoned match is cleared
function editHud(from) { editReturn = from; desktop.exitLock(); show('edit'); editor.enter(); }
$('playBtn').onclick = newMatch;
$('resumeBtn').onclick = resume;
$('menuSettings').onclick = () => { settingsReturn = 'menu'; show('settings'); };
$('aboutBtn').onclick = () => show('about');
$('aboutBack').onclick = () => show('menu');
$('aboutVersion').textContent = VERSION;
$('pauseSettings').onclick = () => { settingsReturn = 'paused'; show('settings'); };
$('settingsBack').onclick = () => show(settingsReturn);
$('quitBtn').onclick = toMenu;
$('restartBtn').onclick = newMatch;
$('deadMenuBtn').onclick = toMenu;
$('winRestartBtn').onclick = newMatch;
$('winMenuBtn').onclick = toMenu;
// Keyboard navigation in menus: ↑/↓ (or W/S) move between buttons, Enter/Space activate (native), Esc goes back.
addEventListener('keydown', e => {
  if (!SCREENS.includes(state)) return;
  if (e.repeat) { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); return; } // held keys never drive menus
  const btns = [...$(state).querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent !== null);
  const i = btns.indexOf(document.activeElement), n = btns.length;
  const inForm = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if ((e.code === 'ArrowDown' || (e.code === 'KeyS' && !inForm)) && state !== 'settings' && n) { e.preventDefault(); btns[i < 0 ? 0 : (i + 1) % n].focus(); }
  else if ((e.code === 'ArrowUp' || (e.code === 'KeyW' && !inForm)) && state !== 'settings' && n) { e.preventDefault(); btns[i < 0 ? n - 1 : (i - 1 + n) % n].focus(); }
  else if (e.code === 'Escape') {
    if (state === 'about') show('menu'); else if (state === 'settings') show(settingsReturn);
    else if (state === 'paused' && performance.now() - pausedAt > 300) { e.stopImmediatePropagation(); resume(); } // the pause listener below must not see this Esc
  }
});
let pausedAt = 0;
$('pauseBtn').addEventListener('click', () => { desktop.exitLock(); pausedAt = performance.now(); show('paused'); });
// Desktop: clicking the scene while playing without lock re-locks.
view.renderer.domElement.addEventListener('click', () => { if (state === 'play') desktop.requestLock(); });
// Esc / P pause. (Most browsers consume Esc to exit Pointer Lock — then pointerlockchange pauses.)
addEventListener('keydown', e => {
  if (state === 'play' && (e.code === 'KeyP' || e.code === 'Escape')) { desktop.exitLock(); pausedAt = performance.now(); show('paused'); }
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
// ---- infected (M1.5): effects + positional sounds + death screen ----
const relOut = { pan: 0, dist: 0 };
const rel = (x, y) => { // pan (−1..1) and distance (m) of a sim point relative to the player's view (scratch object)
  const p = game.player, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) * 2;
  const right = (dx * -Math.sin(p.yaw) + dy * Math.cos(p.yaw)) / (Math.hypot(dx, dy) || 1);
  relOut.pan = Math.max(-1, Math.min(1, right)); relOut.dist = d; return relOut;
};
game.on('shot', e => { if (e.hit.type === 'entity' && e.hit.entity.type) view.infected.onHit(e.hit.point, e.dir, e.hit.zone); });
game.on('targetHit', e => { const en = game.enemies.find(x => x.id === e.id); if (en && !e.killed) { const r = rel(en.x, en.y); sfx.infected('hurt', r.pan, r.dist); } });
game.on('infectedAlert', e => { const r = rel(e.x, e.y); sfx.infected('alert', r.pan, r.dist); });
game.on('infectedAttack', e => { const r = rel(e.x, e.y); sfx.infected('attack', r.pan, r.dist); });
game.on('infectedKilled', e => { const en = game.enemies.find(x => x.id === e.id); if (en) view.infected.onDeath(en); const r = rel(e.x, e.y); sfx.infected('death', r.pan, r.dist); });
game.on('playerHurt', () => { view.onHurt(); sfx.playerHurt(); });
game.on('victory', e => {
  $('winStats').textContent = `Все ${e.waves} волны пройдены · убито заражённых: ${e.kills}`;
  setTimeout(() => { if (game.matchOver && state !== 'victory' && state !== 'settings' && state !== 'edit') { desktop.exitLock(); show('victory'); } }, 1600);
});
game.on('playerDied', () => {
  const s = game.state;
  $('deadStats').textContent = `Волна ${s.wave.number} · убито заражённых: ${s.kills}`;
  setTimeout(() => { if (game.player.dead && state !== 'dead' && state !== 'settings' && state !== 'edit') { desktop.exitLock(); show('dead'); } }, 700); // also after a pause in between
});
// ambient infected sounds: footsteps from the gait, rasping breath now and then (throttled, nearest only)
let breathT = 1.5;
const stepPhase = new Map();
game.on('infectedRemoved', e => { for (const k of stepPhase.keys()) if (k.id === e.id) stepPhase.delete(k); });
function infectedAmbience(dt) {
  if (!game.enemies.length) return;
  breathT -= dt;
  let near = null, nd = Infinity;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const r = rel(e.x, e.y); const rd = r.dist; if (rd < nd) { nd = rd; near = e; }
    const steps = Math.floor(e.dist * 2 / (0.62 + 0.5 * Math.min(1, e.speed * 2 / e.def.runSpeed))); // one step ≈ half a stride
    if (stepPhase.get(e) !== steps) { if (stepPhase.has(e) && rd < 22) sfx.infected('step', r.pan, rd); stepPhase.set(e, steps); }
  }
  if (near && breathT <= 0) { const r = rel(near.x, near.y); if (r.dist < 18) sfx.infected('breath', r.pan, r.dist); breathT = 1.6 + Math.random() * 1.8; }
}

// ---- loop ----
let frames = 0, acc = 0, worst = 0;
const stats = { fps: 0, frameMs: 0, worstMs: 0 };
startLoop({
  hz: SIM_HZ,
  update(dt) { if (state === 'play' || state === 'dead' || state === 'victory') game.step(input.update(), dt); },
  frame(alpha, dt) {
    if (state === 'play') {
      desktop.frame(dt);
      touch.frame(dt);
      const [dy, dp] = input.consumeLook();
      // ADS lowers look sensitivity (weapon config) for precise aiming.
      const k = 1 - game.state.weapon.ads * (1 - game.weapon.def.ads.sensMult);
      game.look(dy * k, dp * k);
    }
    if (state === 'play') infectedAmbience(dt);
    const t0 = performance.now();
    const w = game.state.weapon;
    // alarm between waves (M1.7): GameState → siren / ambience (audio) and beacons / red light (render)
    sfx.frame({ playing: state === 'play', siren: game.state.alarm.siren, fx: settings.alarmFx, dt });
    view.render(game.player, state === 'play' ? alpha : 1, { dt, alarm: alarmVisual(game.state.alarm.k, settings.alarmFx), ads: w.ads, fovMult: game.weapon.def.ads.fovMult, reload: w.reloading ? w.reloadProgress : -1, triggerDown: game.weapon.triggerDown, targets: game.targets, enemies: game.enemies, enemyDt: (state === 'play' || state === 'dead' || state === 'victory') ? dt : 0, showWeapon: state !== 'menu' && state !== 'about' && state !== 'dead' && state !== 'victory' });
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
  import('./debug.js').then(m => m.installDebug({ game, input, view, settings, stats, touch, hud, editor, gameHud, sfx, getState: () => state, show, editHud }));
}
