// DARK ARENA M3.0 TOPDOWN — entry point. Same simulation as the FPS game (M2.0: weapons, infected AI, waves,
// OUTPOST ZERO), created with the top-down options: shot height 1.15 m, horizontal shots, dash, top-down waves.
// Wires: top-down input → InputState → Game (fixed 60 Hz) → top-down renderer / HUD / audio.
import { SIM_HZ, DEFAULT_SETTINGS } from '../config.js';
import arena from '../data/maps/outpost-zero.js';
import { Game } from '../sim/game.js';
import { startLoop } from '../core/loop.js';
import { InputState } from '../input/input.js';
import { TOPDOWN_WAVES, TOPDOWN_MATCH } from '../sim/waves/wave-defs.js';
import { alarmVisual } from '../sim/waves/alarm.js';
import { createSfx } from '../audio/sfx.js';
import { loadModels } from './models.js';
import { createTopdownRenderer } from './renderer.js';
import { createTopdownInput } from './input.js';
import { createTopdownHud } from './hud.js';

export const VERSION = 'M3.0 TOPDOWN';
export const AIM_HEIGHT = 1.15;          // m: muzzle height of the top-down hero (chest / belly zones of every type)
export const AIM_ASSIST_DEG = 11;         // touch only: the aim snaps to the nearest infected inside this cone…
export const AIM_ASSIST_RANGE = 9;        // …within this many cells (18 m)

const $ = id => document.getElementById(id);
const DEBUG = /[?&]debug=1(&|$)/.test(location.search);
const settings = { ...DEFAULT_SETTINGS };
// test hook (rule 7, ?debug=1 only): &gfx=performance|balanced|quality picks the graphics profile for the session
{ const q = new URLSearchParams(location.search), gfx = q.get('gfx'); if (DEBUG && ['performance', 'balanced', 'quality'].includes(gfx)) settings.graphicsProfile = gfx; }
const game = new Game(arena, { waves: TOPDOWN_WAVES, match: TOPDOWN_MATCH, aimHeight: AIM_HEIGHT, flatAim: true, dash: true });
const input = new InputState();
input.actions.dash = false; input.presses.dash = 0;   // M3.0 action (the FPS InputState has no dash)
const sfx = createSfx(() => settings);
const gameEl = $('game');

let state = 'loading', view = null, hud = null, td = null, deathTimer = 0;
const SCREENS = ['menu', 'paused', 'dead', 'victory'];
function show(next) {
  if (next === 'play' && portrait) return; // landscape only: play / resume wait until the phone is turned back
  state = next;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== next);
  document.body.classList.toggle('playing', next === 'play');
  if (next !== 'play' && td) { td.releaseAll(); game.releaseCombat(); sfx.silence(); }
}

// ---------------- loading ----------------
const loadBar = $('loadFill'), playBtn = $('playBtn');
playBtn.disabled = true;
loadModels(f => { loadBar.style.width = (f * 100).toFixed(0) + '%'; }).then(models => {
  view = createTopdownRenderer({ container: gameEl, world: game.world, models, getProfileId: () => settings.graphicsProfile });
  hud = createTopdownHud(gameEl, game);
  td = createTopdownInput({
    layer: gameEl, input,
    buttons: { dash: $('btnDash'), reload: $('btnReload'), weapon: $('btnWeapon'), pause: $('btnPause') },
    sticks: { move: { base: $('stickL'), knob: $('stickL').firstElementChild }, aim: { base: $('stickR'), knob: $('stickR').firstElementChild } },
    onPause: () => { if (state === 'play') show('paused'); },
    isPlaying: () => state === 'play',
  });
  wireEvents();
  $('loadText').textContent = 'ГОТОВО';
  playBtn.disabled = false;
  if (state === 'loading') state = 'menu';
  startLoop({ hz: SIM_HZ, update, frame });
  if (DEBUG) window.__DA3TD = { game, view, input, td, hud, show, get state() { return state; }, get lastShotYaw() { return lastShotYaw; }, get portrait() { return portrait; }, VERSION };
}).catch(err => { $('loadText').textContent = 'Ошибка загрузки моделей: ' + err.message; console.error(err); });

function startRun() { if (portrait) return; game.restart(); view.hero.reset(); hud.reset(); deathTimer = 0; show('play'); }
playBtn.addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('againBtn2').addEventListener('click', startRun);
$('restartBtn').addEventListener('click', startRun);
$('resumeBtn').addEventListener('click', () => show('play'));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') show('paused'); });

// ---------------- landscape only (phones) ----------------
// Portrait on a touch device: the rotate screen, no game controls, every finger / aim / held fire released and a running
// match paused (the normal pause: wave, health and ammo stay as they are). Back in landscape the game stays paused
// until ПРОДОЛЖИТЬ; menus and other screens keep their state. A narrow desktop window is not a phone in portrait.
let portrait = false;
const coarse = matchMedia('(pointer: coarse)');
function checkOrientation() {
  const now = coarse.matches && innerHeight > innerWidth;
  if (now === portrait) return;
  portrait = now;
  document.body.classList.toggle('portrait', now);
  if (now) {
    if (td) td.releaseAll();
    if (state === 'play') show('paused');
    game.releaseCombat(); input.clear();
  }
}
addEventListener('resize', checkOrientation);
addEventListener('orientationchange', checkOrientation);
matchMedia('(orientation: portrait)').addEventListener('change', checkOrientation);
checkOrientation();

// ---------------- per sim step ----------------
function update(dt) {
  if (state !== 'play' && state !== 'dead' && state !== 'victory') return;
  td.poll(); input.update();
  // Aim direction vs shot direction (fix of the stepwise turning on touch): the hero always faces the finger exactly
  // (set every frame in frame()); the aim assist only bends the SHOT, for the duration of this sim step, then the
  // facing goes back to the finger. Before, the assist snapped the facing itself → the hero stuck on an infected and
  // then jumped up to ~13° when the finger left the 11° cone.
  const p = game.player, faceYaw = p.yaw, shot = playing() && !p.dead ? shotYaw(faceYaw) : faceYaw;
  p.yaw = shot; lastShotYaw = shot;
  // world-space move (screen = world) → the sim's yaw-relative move (forward along yaw, strafe to its right)
  const c = Math.cos(p.yaw), n = Math.sin(p.yaw), wx = input.move.x, wy = input.move.y;
  input.move.y = wx * c + wy * n; input.move.x = -wx * n + wy * c;
  game.step(input, dt);
  if (shot !== faceYaw && !p.dead) p.yaw = faceYaw;   // facing = finger again (recoil yaw is overwritten each frame anyway)
}
const playing = () => state === 'play';
let lastShotYaw = null; // debug hook only

// ---------------- per frame: aim → yaw, render, HUD, audio ----------------
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** The facing the player asked for: exactly the right-stick direction (touch) or the point under the mouse. null = keep. */
function fingerYaw() {
  const p = game.player, a = td.aim;
  if (a.source === 'mouse' && a.mouse) {
    const pt = view.screenToSim(a.mouse.x, a.mouse.y, AIM_HEIGHT);
    if (pt && Math.hypot(pt.x - p.x, pt.y - p.y) > 0.05) return Math.atan2(pt.y - p.y, pt.x - p.x);
    return null;
  }
  if (a.source === 'touch' && a.active) return Math.atan2(a.y, a.x);
  return null;
}
/** Shot direction for a sim step: touch only, the nearest living infected inside the assist cone around the facing. */
function shotYaw(face) {
  if (td.aim.source !== 'touch' || !td.aim.active) return face;
  const p = game.player; let best = face, bestD = AIM_ASSIST_DEG * Math.PI / 180;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (Math.hypot(dx, dy) > AIM_ASSIST_RANGE) continue;
    const t = Math.atan2(dy, dx), d = Math.abs(wrap(t - face));
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}
function frame(alpha, dt) {
  const playing = state === 'play';
  if (playing && !game.player.dead) {
    const y = fingerYaw();
    if (y !== null) game.look(wrap(y - game.player.yaw), -game.player.pitch); // shortest way through ±π, no smoothing / lag
  }
  if (state === 'dead' || (playing && game.player.dead)) { deathTimer += dt; if (playing && deathTimer > 1.6) show('dead'); }
  const live = playing || state === 'dead' || state === 'victory';
  view.render(game, live ? alpha : 1, live ? dt : 0, { aimActive: playing && (td.aim.active || td.mouseFire), alarm: alarmVisual(game.state.alarm.k, 'full') });
  hud.update(live ? dt : 0);
  sfx.frame({ playing, siren: game.state.alarm.siren, fx: 'full', dt });
}

// ---------------- sim events → effects / audio ----------------
function wireEvents() {
  const rel = (x, y) => { const p = game.player, dx = x - p.x, dy = y - p.y; return { pan: Math.max(-1, Math.min(1, dx / 6)), dist: Math.hypot(dx, dy) * 2 }; };
  const byId = id => game.enemies.find(x => x.id === id);
  game.on('fire', e => { view.onFire(); sfx.shot(0, e.weapon); });
  game.on('shot', e => {
    view.onShot(e);
    if (e.hit && e.hit.type === 'entity' && e.hit.entity && e.hit.entity.type) view.infected.onHit(e.hit.entity, e.hit.point, e.dir);
  });
  game.on('impact', e => { view.onImpact(e); if (Math.random() < 0.4) sfx.impact(); });
  game.on('pumpStart', e => sfx.pump(e.after));
  game.on('shellLoaded', () => sfx.shellIn());
  game.on('weaponSwitch', () => sfx.switchOut());
  game.on('weaponReady', () => sfx.switchIn());
  game.on('dryFire', () => sfx.dry());
  game.on('reloadStart', e => { if (e.kind !== 'shell') sfx.reload(e.time, e.weapon); });
  game.on('meleeStart', () => sfx.meleeSwing());
  game.on('hit', e => sfx.hit(e.headshot, e.kill));
  game.on('dash', () => sfx.meleeSwing());
  game.on('targetHit', e => { const en = byId(e.id); if (en && !e.killed && e.first !== false) { const r = rel(en.x, en.y); sfx.infected('hurt', r.pan, r.dist); } });
  game.on('infectedAlert', e => { const r = rel(e.x, e.y); sfx.infected('alert', r.pan, r.dist); });
  game.on('infectedAttack', e => { const r = rel(e.x, e.y); sfx.infected('attack', r.pan, r.dist); });
  game.on('infectedKilled', e => { const en = byId(e.id); if (en) view.infected.onDeath(en); view.bloodSplat(e.x + e.dir.x * 0.25, e.y + e.dir.y * 0.25, 1.1); const r = rel(e.x, e.y); sfx.infected('death', r.pan, r.dist); });
  game.on('playerHurt', () => sfx.playerHurt());
  game.on('playerDied', () => { deathTimer = 0; });
  game.on('victory', e => { $('victoryKills').textContent = `Уничтожено заражённых: ${e.kills}`; setTimeout(() => { if (state === 'play') show('victory'); }, 1200); });
}
