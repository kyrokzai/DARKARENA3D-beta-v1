// DARK ARENA M3.0 TOPDOWN — entry point. Same simulation as the FPS game (M2.0: weapons, infected AI, waves,
// OUTPOST ZERO), created with the top-down options: shot height 1.15 m, horizontal shots, dash, top-down waves.
// Wires: top-down input → InputState → Game (fixed 60 Hz) → top-down renderer / HUD / audio.
// M3.2: main menu (REF-01, 3D hero in the lab), weapon selection (REF-03, real defs + live 3D previews; the equipped
// weapon is the one in the hands at the start, all three are carried), settings / about, graphics levels
// Низкое / Среднее / Высокое switched at runtime, Продолжить for a paused run, saved settings (versioned key).
import { SIM_HZ, DEFAULT_SETTINGS } from '../config.js';
import arena from '../data/maps/outpost-zero.js';
import { Game } from '../sim/game.js';
import { startLoop } from '../core/loop.js';
import { InputState } from '../input/input.js';
import { TOPDOWN_WAVES, TOPDOWN_MATCH } from '../sim/waves/wave-defs.js';
import { LOADOUT } from '../sim/weapons/defs.js';
import { loadoutStats, GEAR } from './loadout-data.js';
import { TD_GRAPHICS, TD_GRAPHICS_ORDER } from './graphics.js';
import { SKINS } from '../render/weapons/raven-skins.js';
import { alarmVisual } from '../sim/waves/alarm.js';
import { createSfx } from '../audio/sfx.js';
import { loadModels, loadLab } from './models.js';
import { createTopdownRenderer } from './renderer.js';
import { createTopdownInput } from './input.js';
import { createTopdownHud } from './hud.js';

export const VERSION = 'M3.2 TOPDOWN';
export const AIM_HEIGHT = 1.15;          // m: muzzle height of the top-down hero (chest / belly zones of every type)
export const AIM_ASSIST_DEG = 11;         // touch only: the aim snaps to the nearest infected inside this cone…
export const AIM_ASSIST_RANGE = 9;        // …within this many cells (18 m)

const $ = id => document.getElementById(id);
const DEBUG = /[?&]debug=1(&|$)/.test(location.search);
const settings = { ...DEFAULT_SETTINGS, startSlot: 0, ravenSkin: 'obsidian', best: null };
// saved settings (versioned key; Safari private mode can throw → try / catch, defaults stay)
const STORE = 'darkarena.topdown.v1';
const SAVED = ['graphicsProfile', 'volume', 'mute', 'startSlot', 'ravenSkin', 'best'];
try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o && o.v === 1) for (const k of SAVED) if (o[k] !== undefined) settings[k] = o[k]; } catch (_) {}
if (!TD_GRAPHICS[settings.graphicsProfile]) settings.graphicsProfile = 'balanced';
if (!(settings.startSlot >= 0 && settings.startSlot < LOADOUT.length)) settings.startSlot = 0;
if (!SKINS[settings.ravenSkin]) settings.ravenSkin = 'obsidian';
function save() { try { const o = { v: 1 }; for (const k of SAVED) o[k] = settings[k]; localStorage.setItem(STORE, JSON.stringify(o)); } catch (_) {} }
// test hook (rule 7, ?debug=1 only): &gfx=performance|balanced|quality picks the graphics profile for the session
{ const q = new URLSearchParams(location.search), gfx = q.get('gfx'); if (DEBUG && ['performance', 'balanced', 'quality'].includes(gfx)) settings.graphicsProfile = gfx; }
const game = new Game(arena, { waves: TOPDOWN_WAVES, match: TOPDOWN_MATCH, aimHeight: AIM_HEIGHT, flatAim: true, dash: true });
const input = new InputState();
input.actions.dash = false; input.presses.dash = 0;   // M3.0 action (the FPS InputState has no dash)
const sfx = createSfx(() => settings);
const gameEl = $('game');

let state = 'loading', view = null, hud = null, td = null, deathTimer = 0, runActive = false;
const SCREENS = ['menu', 'loadout', 'settings', 'about', 'paused', 'dead', 'victory'];
const MODE_OF = { loading: 'menu', menu: 'menu', settings: 'menu', about: 'menu', loadout: 'loadout', play: 'game', paused: 'game', dead: 'game', victory: 'game' };
function show(next) {
  if (next === 'play' && portrait) return; // landscape only: play / resume wait until the phone is turned back
  state = next;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== next);
  document.body.classList.toggle('playing', next === 'play');
  if (next !== 'play' && td) { td.releaseAll(); game.releaseCombat(); sfx.silence(); }
  if (view) view.setMode(MODE_OF[next] || 'menu');
  if (next === 'menu') { $('continueBtn').disabled = !runActive; refreshProfile(); }
}

// ---------------- loading ----------------
const loadBar = $('loadFill'), playBtn = $('playBtn');
playBtn.disabled = true;
const loadF = { m: 0, l: 0 }, showLoad = () => { loadBar.style.width = ((loadF.m * 0.55 + loadF.l * 0.45) * 100).toFixed(0) + '%'; };
Promise.all([loadModels(f => { loadF.m = f; showLoad(); }), loadLab(f => { loadF.l = f; showLoad(); })]).then(([models, lab]) => {
  view = createTopdownRenderer({ container: gameEl, world: game.world, models, lab, getProfileId: () => settings.graphicsProfile });
  view.hero.setSkin(settings.ravenSkin); view.previews.setSkin(settings.ravenSkin);
  hud = createTopdownHud(gameEl, game, { waves: TOPDOWN_WAVES });
  td = createTopdownInput({
    layer: gameEl, input,
    buttons: { dash: $('btnDash'), reload: $('btnReload'), weapon: $('btnWeapon'), melee: $('btnMelee'), pause: $('btnPause') },
    sticks: { move: { base: $('stickL'), knob: $('stickL').firstElementChild }, aim: { base: $('stickR'), knob: $('stickR').firstElementChild } },
    onPause: () => { if (state === 'play') show('paused'); },
    isPlaying: () => state === 'play',
  });
  wireEvents();
  buildLoadout();
  game.arsenal.start = settings.startSlot; game.arsenal.reset();
  try { hud.setIcons(view.previews.icons()); } catch (e) { console.warn('weapon icons', e); }
  view.setPreviewSource(() => state === 'loadout' && tab === 'primary' ? [...document.querySelectorAll('#lCards .pv')].map(el => ({ id: el.dataset.weapon, rect: el.getBoundingClientRect() })) : null);
  $('loadText').textContent = 'ГОТОВО';
  playBtn.disabled = false;
  if (state === 'loading') { state = 'menu'; view.setMode('menu'); }
  // the loop starts in the NEXT animation frame: the set-up above (shader compiles, icon renders) can block the main
  // thread for seconds, and a frame timestamp from before that block would give the loop a large negative first dt
  // (its accumulator then stays negative and the sim does not step for that long — seen in M3.2 testing)
  requestAnimationFrame(() => { startLoop({ hz: SIM_HZ, update, frame }); requestAnimationFrame(() => { document.body.classList.remove('booting'); setAvatar(); }); });
  if (DEBUG) window.__DA3TD = { game, view, input, td, hud, show, settings, setGraphics, get state() { return state; }, get lastShotYaw() { return lastShotYaw; }, get portrait() { return portrait; }, VERSION };
}).catch(err => { $('loadText').textContent = 'Ошибка загрузки моделей: ' + err.message; console.error(err); });

function startRun() {
  if (portrait) return;
  game.arsenal.start = settings.startSlot; // the equipped weapon is in the hands at the start (all three are carried)
  game.restart(); view.hero.reset(); hud.reset(); deathTimer = 0; runActive = true; show('play');
}
function endRun(won) {
  runActive = false;
  const s = game.state, wave = won ? s.wave.of : s.wave.number, b = settings.best;
  if (!b || wave > b.wave || (wave === b.wave && s.kills > b.kills)) { settings.best = { wave, of: s.wave.of, kills: s.kills }; save(); }
  $('deadStat').textContent = `Волна ${s.wave.number}/${s.wave.of} · уничтожено ${s.kills} · ${fmtTime(s.runTime)}`;
}
const fmtTime = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function refreshProfile() {
  const b = settings.best, txt = b ? `Рекорд: волна ${b.wave}/${b.of} · ${b.kills} убито` : 'Рекорд: —';
  for (const el of document.querySelectorAll('#profileStat,[data-profile-stat]')) el.textContent = txt;
}
function setAvatar() { try { const url = view.avatar(128); for (const img of document.querySelectorAll('img[data-avatar]')) img.src = url; } catch (e) { console.warn('avatar', e); } }

playBtn.addEventListener('click', startRun);
$('fightBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('againBtn2').addEventListener('click', startRun);
$('restartBtn').addEventListener('click', startRun);
$('resumeBtn').addEventListener('click', () => show('play'));
$('continueBtn').addEventListener('click', () => { if (runActive) show('play'); });
$('menuBtn').addEventListener('click', () => show('menu'));
for (const b of document.querySelectorAll('[data-to-menu]')) b.addEventListener('click', () => show('menu'));
$('loadoutBtn').addEventListener('click', () => show('loadout'));
$('backBtn').addEventListener('click', () => show('menu'));
$('settingsBtn').addEventListener('click', () => show('settings'));
$('aboutBtn').addEventListener('click', () => show('about'));
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => show('menu'));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') show('paused'); });

// ---------------- graphics level (menu selector + settings) ----------------
function setGraphics(id) {
  if (!TD_GRAPHICS[id]) return;
  settings.graphicsProfile = id; save();
  if (view) view.setProfile(id);
  for (const b of document.querySelectorAll('[data-gfx]')) b.classList.toggle('on', b.dataset.gfx === id);
  const g = TD_GRAPHICS[id];
  $('gfxDesc').textContent = { performance: 'Низкое: без теней и свечения, сниженное разрешение — для старых iPhone и длительной игры.',
    balanced: 'Среднее: тени 1024, свечение в половинном разрешении, MSAA — рекомендуемо для iPhone 11+.',
    quality: 'Высокое: тени 2048, полное свечение, максимум частиц — для новых iPhone и ПК.' }[id] + ` (${g.label})`;
}
for (const b of document.querySelectorAll('[data-gfx]')) b.addEventListener('click', () => setGraphics(b.dataset.gfx));
setGraphics(settings.graphicsProfile);
// sound
$('volRange').value = settings.volume; $('muteChk').checked = !!settings.mute;
$('volRange').addEventListener('input', e => { settings.volume = +e.target.value; save(); });
$('muteChk').addEventListener('change', e => { settings.mute = e.target.checked; save(); });

// ---------------- weapon selection (REF-03) ----------------
let tab = 'primary';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function buildLoadout() {
  $('lCards').innerHTML = loadoutStats().map(w => `
    <article class="lCard" data-slot="${w.slot}">
      <div class="cHead"><i class="cTag"></i><h3>${esc(w.name)}</h3><div class="cls">${esc(w.cls)}</div></div>
      <div class="pv" data-weapon="${w.id}" role="img" aria-label="${esc(w.full)}"></div>
      <div class="cBody"><div class="stats">${w.bars.map(b => `<span>${b.label}</span><div class="bar" title="${esc(b.raw)}"><i style="width:${b.value}%"></i></div><b>${b.value}</b>`).join('')}</div>
      <div class="ammoLine"><span>Боеприпасы: ${esc(w.caliber)}</span><b>${w.mag} / ${w.reserve}</b></div>
      <button type="button" class="equip" data-equip="${w.slot}"></button></div>
    </article>`).join('');
  const gear = GEAR.map(g => `<div class="gItem ${g.state}"><svg class="ico ${g.cls}"><use href="#${g.icon}"/></svg><div><b>${g.name}</b><small>${g.note}</small></div></div>`).join('');
  $('gearRow').innerHTML = gear; $('gearBig').innerHTML = gear;
  $('lSkins').innerHTML = Object.entries(SKINS).map(([id, k]) => `
    <article class="lCard" data-skin="${id}"><h3>${esc(k.label)}</h3><div class="cls">RAVEN · косметика</div>
      <div class="sw">${['body', 'polymer', 'accent', 'steel'].map(p => `<i style="background:#${(k[p] && k[p].color || 0).toString(16).padStart(6, '0')}"></i>`).join('')}</div>
      <p class="small">${esc(k.note || '')}</p><button type="button" class="equip" data-skin-pick="${id}"></button></article>`).join('')
    + '<p class="small" style="align-self:end">Скины AK-47 MOD и KRAIT — нет (в разработке). Скин не меняет характеристики.</p>';
  for (const b of document.querySelectorAll('[data-equip]')) b.addEventListener('click', () => { settings.startSlot = +b.dataset.equip; save(); if (!runActive) { game.arsenal.start = settings.startSlot; game.arsenal.reset(); } markLoadout(); });
  for (const b of document.querySelectorAll('[data-skin-pick]')) b.addEventListener('click', () => { settings.ravenSkin = b.dataset.skinPick; save(); view.hero.setSkin(settings.ravenSkin); view.previews.setSkin(settings.ravenSkin); markLoadout(); });
  for (const t of document.querySelectorAll('.tabs [data-tab]')) t.addEventListener('click', () => setTab(t.dataset.tab));
  markLoadout();
}
function markLoadout() {
  for (const c of document.querySelectorAll('#lCards .lCard')) { const on = +c.dataset.slot === settings.startSlot; c.classList.toggle('on', on); c.querySelector('.equip').innerHTML = on ? '<svg class="ico"><use href="#i-check"/></svg> Экипировано' : 'Экипировать'; }
  for (const c of document.querySelectorAll('#lSkins .lCard')) { const on = c.dataset.skin === settings.ravenSkin; c.classList.toggle('on', on); c.querySelector('.equip').innerHTML = on ? '<svg class="ico"><use href="#i-check"/></svg> Выбран' : 'Выбрать'; }
}
function setTab(id) {
  tab = id;
  for (const t of document.querySelectorAll('.tabs [data-tab]')) t.classList.toggle('on', t.dataset.tab === id);
  for (const p of document.querySelectorAll('.lBody [data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== id);
  $('lTitle').textContent = { primary: 'Выбор оружия', secondary: 'Вторичное оружие', gear: 'Снаряжение', skins: 'Скины' }[id];
  document.querySelector('[data-pane-gear-row]').classList.toggle('hidden', id === 'gear');
}

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
  view.render(game, live ? alpha : 1, live ? dt : 0, { uiDt: dt, aimActive: playing && (td.aim.active || td.mouseFire), alarm: alarmVisual(game.state.alarm.k, 'full') });
  hud.update(live ? dt : 0);
  sfx.frame({ playing, siren: game.state.alarm.siren, fx: 'full', dt });
}

// ---------------- sim events → effects / audio ----------------
function wireEvents() {
  const rel = (x, y) => { const p = game.player, dx = x - p.x, dy = y - p.y; return { pan: Math.max(-1, Math.min(1, dx / 6)), dist: Math.hypot(dx, dy) * 2 }; };
  const byId = id => game.enemies.find(x => x.id === id);
  game.on('fire', e => { view.onFire(e, game.player.yaw); sfx.shot(0, e.weapon); });
  game.on('shot', e => {
    view.onShot(e);
    if (e.hit && e.hit.type === 'entity' && e.hit.entity && e.hit.entity.type) view.infected.onHit(e.hit.entity, e.hit.point, e.dir);
  });
  game.on('impact', e => { view.onImpact(e); if (Math.random() < 0.4) sfx.impact(); });
  game.on('pumpStart', e => { sfx.pump(e.after); if (e.after) view.onPump(game.player.yaw); });
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
  game.on('playerDied', () => { deathTimer = 0; endRun(false); });
  game.on('victory', e => { endRun(true); $('victoryKills').textContent = `Уничтожено заражённых: ${e.kills} · время ${fmtTime(game.state.runTime)}`; setTimeout(() => { if (state === 'play') show('victory'); }, 1200); });
}
