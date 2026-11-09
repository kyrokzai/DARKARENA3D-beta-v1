// M1.3 weapon simulation tests (pure logic, no browser): node tests/sim-m1.3.test.mjs
import map from '../prototype-3d/src/data/maps/training.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';
import { resolveShot, aimDir, EYE_Z, WALL_H } from '../prototype-3d/src/sim/hitscan.js';
import { TrainingTarget } from '../prototype-3d/src/sim/targets.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const zero = () => 0; // rng → no spread offset, deterministic recoil yaw
function setup({ x = 8, y = 8, yaw = 0, pitch = 0, rng = zero, def } = {}) {
  const g = new Game(map, { rng });
  if (def) g.weapon.equip(def);
  Object.assign(g.player, { x, y, prevX: x, prevY: y, yaw, pitch });
  const inp = new InputState();
  const ev = []; for (const t of ['shot', 'impact', 'targetHit', 'miss', 'dryFire', 'reloadStart', 'reloadEnd', 'hit']) g.on(t, d => ev.push([t, d, g.tick]));
  const run = (sec, hz = 60) => { const dt = 1 / hz; for (let i = 0; i < Math.round(sec * hz); i++) g.step(inp.update(), dt); };
  return { g, inp, ev, run, w: () => g.state.weapon, count: t => ev.filter(e => e[0] === t).length };
}

// ---- config ----
{
  const r = WEAPONS.raven;
  check('RAVEN config: 30/120, auto, 600 RPM, reload 1.3 s', r.magSize === 30 && r.reserve === 120 && r.fireMode === 'auto' && r.rpm === 600 && r.reloadTime === 1.3);
  const { g } = setup();
  check('Equip writes the weapon into GameState (no parallel combat state)', g.state.weapon.name === 'DA-R1 RAVEN' && g.state.weapon.mag === 30 && g.state.weapon.reserve === 120);
}

// ---- rate of fire ----
for (const hz of [60, 30, 144, 240]) {
  const s = setup({ yaw: 0 }); s.inp.setAction('fire', true); s.run(1.0, hz);
  // 600 RPM = shots at t = 0, 0.1 … 0.9 → 10 shots in the first second
  check(`600 RPM held for 1 s @${hz} Hz → 10 shots`, s.count('shot') === 10, `${s.count('shot')} shots`);
}
{
  const s = setup(); s.inp.setAction('fire', true); s.run(3.5);
  check('Holding fire empties exactly 30 rounds (30/120 → 0/120)', s.count('shot') === 30 && s.w().mag === 0 && s.w().reserve === 120, `${s.count('shot')} shots, ${s.w().mag}/${s.w().reserve}`);
  check('Empty magazine: dry-fire event once, then auto-reload starts', s.count('dryFire') === 1 && s.count('reloadStart') === 1);
}
{
  const s = setup(); s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false); s.run(1 / 60);
  s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false); s.run(0.2);
  check('Taps cannot exceed 600 RPM (second tap inside 0.1 s is ignored)', s.count('shot') === 1, `${s.count('shot')}`);
  s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false);
  check('After the cooldown a tap fires again (short bursts possible)', s.count('shot') === 2);
}
{
  const s = setup(); s.inp.setAction('fire', true); s.run(0.25); s.inp.setAction('fire', false); s.run(0.5);
  check('Releasing the trigger stops automatic fire', s.count('shot') === 3, `${s.count('shot')} shots`);
  s.inp.setAction('fire', true); s.run(0.05); s.g.releaseCombat(); s.inp.clear(); s.run(0.5);
  check('Pause/focus loss (release + input clear) stops fire', s.count('shot') === 4, `${s.count('shot')}`);
}

{
  const s = setup(); s.inp.setAction('fire', true); s.inp.setAction('fire', false); s.run(1 / 60); s.run(0.3);
  check('A tap shorter than one tick still fires exactly one round', s.count('shot') === 1 && s.w().mag === 29);
}

// ---- reload ----
{
  const s = setup(); s.inp.setAction('reload', true); s.inp.setAction('reload', false); s.run(0.1);
  check('Reload ignored with a full magazine', s.count('reloadStart') === 0);
  s.g.state.setAmmo(20); s.inp.setAction('reload', true); s.inp.setAction('reload', false); s.run(0.6);
  const mid = { r: s.w().reloading, p: s.w().reloadProgress };
  s.inp.setAction('fire', true); s.run(0.3); s.inp.setAction('fire', false);
  check('During reload: progress reported, firing blocked', mid.r && mid.p > 0.4 && mid.p < 0.5 && s.count('shot') === 0, JSON.stringify(mid));
  s.run(0.6);
  check('Reload takes 1.3 s and refills 20/120 → 30/110', !s.w().reloading && s.w().mag === 30 && s.w().reserve === 110 && s.count('reloadEnd') === 1, `${s.w().mag}/${s.w().reserve}`);
  s.g.state.setAmmo(0, 0); s.inp.setAction('fire', true); s.run(0.3);
  check('No reserve: dry fire, no reload', s.count('dryFire') === 1 && s.count('reloadStart') === 1 && !s.w().reloading);
}

// ---- ADS ----
{
  const s = setup(); const sp0 = s.g.weapon.currentSpread();
  s.inp.aimHeld = true; s.run(0.1); const mid = s.g.weapon.ads; s.run(0.15);
  const sp1 = s.g.weapon.currentSpread();
  check('ADS (hold) blends in over 0.18 s', mid > 0.4 && mid < 0.7 && s.g.weapon.ads === 1, `t=0.1→${mid.toFixed(2)}`);
  check('ADS reduces spread (×0.3)', Math.abs(sp1 - sp0 * 0.3) < 1e-9, `${sp0.toFixed(2)}° → ${sp1.toFixed(2)}°`);
  check('GameState carries ADS & spread for the HUD', s.g.state.weapon.ads === 1 && Math.abs(s.g.state.weapon.spread - sp1) < 1e-9);
  s.inp.aimHeld = false; s.inp.toggleAim(); s.run(0.3);
  check('Touch toggle keeps ADS on after the tap', s.g.weapon.ads === 1);
  s.inp.clear(); s.g.releaseCombat(); s.run(0.3);
  check('Pause/blur leaves ADS', s.g.weapon.ads === 0);
  s.inp.toggleAim(); s.run(0.3); s.g.state.setAmmo(10); s.inp.setAction('reload', true); s.inp.setAction('reload', false); s.run(0.3);
  check('Reload drops out of ADS', s.g.weapon.ads < 0.1);
}

// ---- spread: movement and bloom ----
{
  const s = setup(); const still = s.g.weapon.currentSpread();
  s.inp.keyMove.y = 1; s.run(0.2); const moving = s.g.weapon.currentSpread(); s.inp.keyMove.y = 0; s.run(0.1);
  check('Moving increases spread', moving > still * 2, `${still.toFixed(2)}° → ${moving.toFixed(2)}°`);
  s.inp.setAction('fire', true); s.run(0.65); const bloom = s.g.weapon.currentSpread(); s.inp.setAction('fire', false); s.run(0.6);
  check('Spray widens spread (bloom), recovers after 0.6 s', bloom > still + 1 && Math.abs(s.g.weapon.currentSpread() - still) < 1e-9, `${bloom.toFixed(2)}° → ${s.g.weapon.currentSpread().toFixed(2)}°`);
}

// ---- recoil ----
{
  const s = setup({ yaw: 0, pitch: 0 }); s.inp.setAction('fire', true); s.run(0.95);
  const climbed = s.g.player.pitch, yawDrift = Math.abs(s.g.player.yaw > Math.PI ? s.g.player.yaw - 2 * Math.PI : s.g.player.yaw);
  s.inp.setAction('fire', false); s.run(0.6);
  check('Recoil: vertical climb during a 10-round spray', climbed > 0.06 && climbed < 0.2, `pitch +${(climbed * 180 / Math.PI).toFixed(1)}°`);
  check('Recoil: horizontal drift small vs vertical', yawDrift < climbed * 0.5, `yaw ${(yawDrift * 180 / Math.PI).toFixed(2)}°`);
  check('Recoil recovers (≥ 75 % of the climb returns after release)', s.g.player.pitch < climbed * 0.25, `${(s.g.player.pitch * 180 / Math.PI).toFixed(2)}° left`);
  const a = setup(); a.inp.aimHeld = true; a.run(0.3); a.inp.setAction('fire', true); a.run(0.95);
  check('ADS reduces recoil climb', a.g.player.pitch < climbed * 0.8, `${(a.g.player.pitch * 180 / Math.PI).toFixed(1)}° vs ${(climbed * 180 / Math.PI).toFixed(1)}°`);
}

// ---- hitscan: walls, floor/ceiling, targets, head/body, walls block ----
{
  const s = setup({ x: 9.5, y: 5.5, yaw: Math.PI });
  s.g.spawnTrainingTargets([{ x: 5.5, y: 5.6 }]);
  s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false);
  const imp = s.ev.find(e => e[0] === 'impact');
  check('Shot west from (9.5,5.5) hits the pillar face at x = 8', imp && imp[1].kind === 'wall' && Math.abs(imp[1].point.x - 8) < 1e-6 && imp[1].normal.x === 1, imp && JSON.stringify(imp[1].point));
  check('Target behind the pillar is NOT hit (no shooting through walls)', s.count('targetHit') === 0 && s.g.hittables[0].hp === 100);
  const d = setup({ pitch: -0.5 }); d.inp.setAction('fire', true); d.run(1 / 60);
  const f = d.ev.find(e => e[0] === 'impact');
  check('Aiming down hits the floor', f && f[1].kind === 'floor' && Math.abs(f[1].point.z) < 1e-9);
  const u = setup({ pitch: 0.6 }); u.inp.setAction('fire', true); u.run(1 / 60);
  const c = u.ev.find(e => e[0] === 'impact');
  check('Aiming up hits the ceiling', c && c[1].kind === 'ceiling' && Math.abs(c[1].point.z - WALL_H) < 1e-9);
}
{
  const tx = 12.5, ty = 8;
  const aimAt = z => { const dist = Math.hypot(tx - 8, ty - 8); return Math.atan2(z - EYE_Z, dist); };
  const s = setup({ yaw: 0, pitch: aimAt(1.62 * 0.5) }); s.g.spawnTrainingTargets([{ x: tx, y: ty }]);
  s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false); s.run(0.6);
  const h1 = s.ev.find(e => e[0] === 'targetHit'), hudHit = s.ev.find(e => e[0] === 'hit');
  check('Head aim → headshot (50 dmg), HUD hit event headshot', h1 && h1[1].zone === 'head' && h1[1].damage === 50 && hudHit && hudHit[1].headshot === true, h1 && JSON.stringify(h1[1]));
  s.g.player.pitch = aimAt(1.62 * 0.5); s.inp.setAction('fire', true); s.run(1 / 60); s.inp.setAction('fire', false);
  const kills = s.ev.filter(e => e[0] === 'targetHit' && e[1].killed);
  check('Second headshot kills the 100 HP target; HUD gets kill', kills.length === 1 && s.ev.filter(e => e[0] === 'hit').pop()[1].kill === true);
  s.run(3);
  check('Target respawns after 2.5 s', s.g.hittables[0].alive && s.g.hittables[0].hp === 100);
  const b = setup({ yaw: 0, pitch: aimAt(0.9 * 0.5) }); b.g.spawnTrainingTargets([{ x: tx, y: ty }]);
  b.inp.setAction('fire', true); b.run(1 / 60);
  const hb = b.ev.find(e => e[0] === 'targetHit');
  check('Chest aim → bodyshot (25 dmg)', hb && hb[1].zone === 'body' && hb[1].damage === 25 && b.g.hittables[0].hp === 75);
  const m = setup({ yaw: 0.6 }); m.g.spawnTrainingTargets([{ x: tx, y: ty }]); m.inp.setAction('fire', true); m.run(1 / 60);
  check('Missing the target → world impact, no hit event', m.count('targetHit') === 0 && m.count('hit') === 0 && m.count('impact') === 1);
  // direct resolver: entity nearer than wall wins; wall nearer than entity blocks
  const g = new Game(map); const t = new TrainingTarget('t', 10, 8);
  const o = { x: 8, y: 8, z: EYE_Z }, dir = aimDir(0, 0);
  check('Resolver: target in front of a wall is hit first', resolveShot(g.world, [t], o, dir, 60).type === 'entity');
  check('Resolver: wall between shooter and target blocks', resolveShot(g.world, [new TrainingTarget('t2', 16.5, 8)], o, dir, 60).type === 'world');
}

// ---- spread really scatters shots (seeded) and stays inside the cone ----
{
  let seed = 7; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const s = setup({ rng }); s.inp.setAction('fire', true); s.run(2.0);
  const shots = s.ev.filter(e => e[0] === 'shot');
  // angle between each pellet and the aim line at that moment must stay inside that shot's cone
  const inCone = shots.every(e => { const { dir, aim, spread } = e[1]; const c = dir.x * aim.x + dir.y * aim.y + dir.z * aim.z; return Math.acos(Math.min(1, c)) * 180 / Math.PI <= spread + 1e-6; });
  const within = shots.every(e => e[1].spread <= WEAPONS.raven.spread.max + 1e-9);
  const distinct = new Set(shots.map(e => e[1].dir.y.toFixed(5))).size;
  check('Seeded spread: shots scatter, every shot inside its cone, spread ≤ max', within && inCone && distinct > 10, `${distinct} distinct of ${shots.length}`);
}

// ---- generic system: other fire modes / shotgun ----
{
  const pistol = { ...WEAPONS.raven, id: 'test-pistol', fireMode: 'semi', rpm: 400, magSize: 12, reserve: 48 };
  const s = setup({ def: pistol }); s.inp.setAction('fire', true); s.run(1);
  check('Generic: semi-auto fires once per trigger pull', s.count('shot') === 1 && s.g.state.weapon.magSize === 12);
  const burst = { ...WEAPONS.raven, id: 'test-burst', fireMode: 'burst', burstCount: 3, rpm: 900 };
  const b = setup({ def: burst }); b.inp.setAction('fire', true); b.run(1);
  check('Generic: burst mode fires 3 per pull', b.count('shot') === 3);
  const sg = { ...WEAPONS.raven, id: 'test-shotgun', fireMode: 'semi', pellets: 8, magSize: 6, reserve: 24 };
  let seed = 3; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const q = setup({ def: sg, rng }); q.inp.setAction('fire', true); q.run(1 / 60);
  check('Generic: shotgun = 8 pellets, 1 round used', q.count('shot') === 8 && q.g.state.weapon.mag === 5);
}

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
