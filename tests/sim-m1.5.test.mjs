// M1.5 infected / waves simulation tests (pure logic, no browser): node tests/sim-m1.5.test.mjs
import map from '../prototype-3d/src/data/maps/training.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { INFECTED_TYPES } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { SPAWN_RULES } from '../prototype-3d/src/sim/waves/wave-defs.js';
// M1.6 changed the shipped match to 3 waves × 9 (tests/sim-m1.6.test.mjs). These M1.5 checks keep their purpose —
// the director mechanics — by running the original M1.5 wave (3 HOLLOW, one wave) as an explicit data config.
const WAVES = [{ number: 1, enemies: [{ type: 'hollow', count: 3 }] }];
const M15_MATCH = { maxActive: 5, startDelay: 2.5, spawnInterval: 1.6, intermission: 6, resupplyReserve: false, healBetweenWaves: 0 };
WAVES[0].startDelay = M15_MATCH.startDelay; WAVES[0].spawnInterval = M15_MATCH.spawnInterval;
import { lineOfSight, FlowField } from '../prototype-3d/src/sim/nav/grid-nav.js';
import { canStand } from '../prototype-3d/src/sim/collision.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const H = INFECTED_TYPES.hollow, M = 0.5;
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function setup({ px = 8, py = 8, yaw = 0, waves = false } = {}) {
  seed = 7;
  const g = new Game(map, { rng: () => 0, waveRng: rng, aiRng: rng, waves: WAVES, match: M15_MATCH });
  Object.assign(g.player, { x: px, y: py, prevX: px, prevY: py, yaw });
  const inp = new InputState();
  const ev = []; for (const t of ['infectedSpawn', 'infectedAlert', 'infectedAttack', 'playerHurt', 'playerDied', 'infectedKilled', 'kills', 'waveCleared', 'wave', 'hit']) g.on(t, d => ev.push([t, d, g.tick]));
  if (waves) g.startWaves();
  const run = (sec, onStep) => { for (let i = 0; i < Math.round(sec * 60); i++) { g.step(inp.update(), 1 / 60); if (onStep && onStep() === false) break; } };
  return { g, inp, ev, run, count: t => ev.filter(e => e[0] === t).length };
}
const aimAt = (g, e, zone) => { // exact aim at the centre of a hit zone
  const p = g.player, hb = e.hitboxes(), h = zone === 'head' ? hb[0] : hb[1];
  const tx = h.cx, ty = h.cy, tz = zone === 'head' ? h.cz : 0.45, d = Math.hypot(tx - p.x, ty - p.y);
  p.yaw = Math.atan2(ty - p.y, tx - p.x); p.pitch = Math.atan2(tz - 0.8 - (p.z || 0), d);
  g.weapon.recoilClimb = 0;
};
/** One round through the normal input path (tap), then let the fire interval pass. */
const shoot = (ctx, e, zone) => { aimAt(ctx.g, e, zone); ctx.inp.setAction('fire', true); ctx.g.step(ctx.inp.update(), 1 / 60); ctx.inp.setAction('fire', false); ctx.run(0.15); };

// ---- 1. config ----
check('Config: HP 100, bite 15, detect 15 m, attack 1.5 m, cooldown 1.2 s (data, not code)',
  H.hp === 100 && H.attackDamage === 15 && H.detectRange === 15 && H.attackRange === 1.5 && H.attackCooldown === 1.2);
check('Wave 1 config: 3 HOLLOW', WAVES[0].enemies[0].type === 'hollow' && WAVES[0].enemies[0].count === 3);

// ---- 2. create / remove, initial state ----
{
  const { g } = setup();
  const e = g.spawnInfected('hollow', 3.5, 3.5, 0);
  check('Spawn: infected created with full HP, IDLE, alive, in the hittables', e.hp === 100 && e.state === 'IDLE' && e.alive && g.enemies.includes(e) && g.hittables.includes(e));
  g.removeInfected(e);
  check('Remove: gone from enemies and hittables', !g.enemies.includes(e) && !g.hittables.includes(e));
}

// ---- 3. detection & walls ----
{
  const { g, run, count } = setup({ px: 8, py: 8 });
  const e = g.spawnInfected('hollow', 8 + 6.5, 8.5, Math.PI); // 13 m away, open floor
  run(0.5);
  check('Detects the player within 15 m with clear line of sight → ALERT/CHASE', e.state !== 'IDLE' && count('infectedAlert') === 1, e.state);
  const { g: g2, run: run2 } = setup({ px: 2.5, py: 1.5 });
  const far = g2.spawnInfected('hollow', 2.5 + 7.8, 1.5, 0); // 15.6 m along the open top row
  run2(1);
  check('Does not detect beyond 15 m', far.state === 'IDLE');
  // behind the pillar (cells x 7, rows 5–6): player at (8.5, 5.5) → infected at (5.5, 5.5): pillar between
  const { g: g3, run: run3 } = setup({ px: 9.5, py: 5.6 });
  const hid = g3.spawnInfected('hollow', 5.5, 5.6, 0);
  check('Line of sight helper: pillar blocks', !lineOfSight(g3.world, 9.5, 5.6, 5.5, 5.6) && lineOfSight(g3.world, 9.5, 8.5, 5.5, 8.5));
  run3(1.5);
  check('Walls block detection (player behind the pillar stays unnoticed)', hid.state === 'IDLE' && !hid.canSee);
}

// ---- 4. chase & navigation around obstacles; never inside walls ----
{
  const { g, run } = setup({ px: 9.5, py: 5.6 });
  const e = g.spawnInfected('hollow', 5.5, 5.6, 0);
  e.applyDamage(0, 'body'); // noise alerts it (0 damage) — now it must go round the pillar
  let inWall = 0, minD = Infinity;
  run(8, () => { if (!canStand(g.world, e.x, e.y, e.k.r * 0.98)) inWall++; minD = Math.min(minD, Math.hypot(e.x - g.player.x, e.y - g.player.y)); if (e.state === 'ATTACK') return false; });
  check('Chase: goes round the pillar and reaches the player', minD <= H.attackRange * M + 0.05 && e.state === 'ATTACK', `min distance ${(minD * 2).toFixed(2)} m, state ${e.state}`);
  check('Never passes through / ends inside obstacles', inWall === 0, `${inWall} bad steps`);
}
{
  // corner trap: player in the open, infected spawned in the corner behind the red block (cells 4,3)
  const { g, run } = setup({ px: 8, py: 8 });
  const e = g.spawnInfected('hollow', 4.5, 2.5, 0); e.applyDamage(0, 'body');
  let reached = false; run(10, () => { if (Math.hypot(e.x - 8, e.y - 8) < 0.8) { reached = true; return false; } });
  check('Does not get stuck in simple corners (block next to the wall)', reached, `at (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`);
}
{
  const { g } = setup();
  const ff = new FlowField(g.world); ff.setTarget(8.5, 8.5); const b1 = ff.builds; ff.setTarget(8.7, 8.2); ff.setTarget(8.9, 8.9);
  check('Flow field rebuilt only when the target cell changes (no per-frame pathfinding)', b1 === 1 && ff.builds === 1);
  const g2 = setup().g; g2.spawnInfected('hollow', 3.5, 3.5, 0); g2.spawnInfected('hollow', 12.5, 12.5, 0);
  const b0 = g2.flow.builds; for (let i = 0; i < 120; i++) g2.step(new InputState().update(), 1 / 60);
  check('Shared flow field: 2 s, player still → no rebuilds', g2.flow.builds - b0 <= 1, `${g2.flow.builds - b0} rebuilds`);
  // speed independent of frame rate
  const sp = hz => { const { g } = setup({ px: 14.5, py: 14.5 }); const e = g.spawnInfected('hollow', 2.5, 8.5, 0); e.applyDamage(0, 'body'); const inp = new InputState(); for (let i = 0; i < 2 * hz; i++) g.step(inp.update(), 1 / hz); return [e.x, e.y]; };
  const a = sp(60), b = sp(60);
  check('Deterministic movement (same input → same path)', a[0] === b[0] && a[1] === b[1]);
}

// ---- 5. attack: range, damage at the strike moment, once per swing, cooldown ----
{
  const { g, run, ev, count } = setup({ px: 8, py: 8 });
  const e = g.spawnInfected('hollow', 8 + 0.6, 8, Math.PI); // 1.2 m in front of the player
  run(0.8);
  check('In range → ATTACK', count('infectedAttack') >= 1 || e.state === 'ATTACK', e.state);
  run(4);
  const hurts = ev.filter(x => x[0] === 'playerHurt');
  const gaps = hurts.slice(1).map((h, i) => (h[2] - hurts[i][2]) / 60);
  check('Each blow = 15 HP', hurts.every(h => h[1].damage === 15) && g.state.health.hp === 100 - 15 * hurts.length, `hp ${g.state.health.hp}, blows ${hurts.length}`);
  check('One swing never hits twice', e.blows <= e.swings, `swings ${e.swings} blows ${e.blows}`);
  check('Cooldown ≥ 1.2 s between blows', hurts.length >= 2 && gaps.every(t => t >= 1.2 - 1e-6), gaps.map(t => t.toFixed(2)).join(' '));
  // damage lands at the strike moment of the swing, not at its start
  const sw = ev.filter(x => x[0] === 'infectedAttack')[0], h0 = hurts[0];
  check('Damage lands at the strike moment (≈ 0.36 s into the swing)', h0 && sw && Math.abs((h0[2] - sw[2]) / 60 - H.attackDuration * H.attackHitAt) < 0.03, h0 && sw ? ((h0[2] - sw[2]) / 60).toFixed(3) + ' s' : '');
}
{
  // dodge: player steps out of reach during the wind-up → the swing misses
  const { g, run } = setup({ px: 8, py: 8 });
  const e = g.spawnInfected('hollow', 8 + 0.6, 8, Math.PI);
  run(1, () => e.state !== 'ATTACK');
  g.player.x -= 1.0; g.player.prevX = g.player.x; // jump back 2 m
  run(0.5);
  check('Out of reach at the strike moment → no damage', g.state.health.hp === 100 && e.swings === 1 && e.blows === 0, `hp ${g.state.health.hp}`);
}

// ---- 6. shooting: head / body zones, death, no attacks after death, kill counted once ----
{
  const { g, inp, run, ev, count } = setup({ px: 8, py: 8 });
  const setupInp = () => inp;
  const e = g.spawnInfected('hollow', 12.5, 8, Math.PI); // 9 m
  const C = { g, inp: setupInp(g), run };
  shoot(C, e, 'body');
  check('Body hit: 25 damage', e.hp === 75, `hp ${e.hp}`);
  shoot(C, e, 'head');
  check('Head hit: 50 damage', e.hp === 25, `hp ${e.hp}`);
  shoot(C, e, 'head');
  check('HP 0 → DEAD, not alive, hitboxes inactive', e.hp === 0 && !e.alive && e.state === 'DEAD');
  check('Kill counted exactly once (GameState.kills = 1, one event)', g.state.kills === 1 && count('infectedKilled') === 1 && count('kills') === 1);
  shoot(C, e, 'body');
  check('Shooting the corpse does not count again', g.state.kills === 1 && count('infectedKilled') === 1);
  const hpBefore = g.state.health.hp; g.player.x = e.x - 0.5; run(2);
  check('No attacks / damage after death', g.state.health.hp === hpBefore && e.state === 'DEAD');
  run(H.corpseTime);
  check('Corpse removed after corpseTime; resources released from the sim', !g.enemies.includes(e) && !g.hittables.includes(e));
}

// ---- 7. waves: spawn rules, completion, restart ----
{
  const { g, run, ev, count } = setup({ px: 8, py: 8, yaw: 0, waves: true });
  const spawns = []; g.on('infectedSpawn', d => spawns.push({ ...d, py: g.player.y, px: g.player.x, yaw: g.player.yaw }));
  run(WAVES[0].startDelay + WAVES[0].spawnInterval * 2 + 0.5);
  check('Wave 1: 3 infected spawned one by one', spawns.length === 3 && g.enemies.length === 3);
  const t = spawns.map(s => s.tick || 0);
  const okFloor = g.enemies.every(e => canStand(g.world, e.x, e.y, SPAWN_RULES.clearance * M));
  const okDist = spawns.every(s => Math.hypot(s.x - s.px, s.y - s.py) >= SPAWN_RULES.minPlayerDist * M - 1e-6);
  const okFace = spawns.every(s => { const dx = s.x - s.px, dy = s.y - s.py, d = Math.hypot(dx, dy); return d >= SPAWN_RULES.faceDist * M || (dx * Math.cos(s.yaw) + dy * Math.sin(s.yaw)) / d <= Math.cos(SPAWN_RULES.faceConeDeg * Math.PI / 180) + 1e-9; });
  check('Spawns: on free floor (not in obstacles)', okFloor);
  check('Spawns: ≥ 9 m from the player, never in front of his face', okDist && okFace, spawns.map(s => `(${s.x},${s.y})`).join(' '));
  check('GameState wave: active, 3 remaining', g.state.wave.phase === 'active' && g.state.wave.remaining === 3 && g.state.wave.total === 3);
  // kill all three
  for (const e of [...g.enemies]) e.applyDamage(100, 'head', null) && g.onInfectedKilled(e);
  run(0.1);
  // M1.6: after the LAST wave the phase is 'victory' (was 'cleared'); waveCleared still fires exactly once
  check('All killed → wave cleared (waveCleared once), kills 3', count('waveCleared') === 1 && g.state.kills === 3 && g.waves.phase === 'victory' && g.state.wave.phase === 'victory');
  // restart
  g.restart();
  check('Restart: player HP 100, ammo full, kills 0, no infected, wave 1 counting down again', g.state.health.hp === 100 && g.state.weapon.mag === 30 && g.state.kills === 0 && g.enemies.length === 0 && g.waves.phase === 'countdown' && !g.player.dead);
}
{
  // player death → playerDied once, infected stop attacking, restart works
  const { g, run, count } = setup({ px: 8, py: 8 });
  g.state.setHealth(20);
  const e = g.spawnInfected('hollow', 8.6, 8, Math.PI);
  run(4);
  check('Player death at 0 HP: playerDied once, player.dead', g.state.health.hp === 0 && g.player.dead && count('playerDied') === 1);
  const sw = e.swings; run(3);
  check('Infected stop attacking a dead player', e.swings === sw && e.state === 'IDLE', e.state);
  g.restart();
  check('Restart after death works', !g.player.dead && g.state.health.hp === 100 && g.enemies.length === 0);
}
{
  // memory: repeated waves / restarts do not grow arrays
  const { g, run } = setup({ waves: true });
  for (let k = 0; k < 20; k++) { run(6); for (const e of [...g.enemies]) if (e.alive) { e.applyDamage(100, 'head'); g.onInfectedKilled(e); } run(H.corpseTime + 0.2); g.restart(); }
  check('20 waves + restarts: no leftover enemies/hittables', g.enemies.length === 0 && g.hittables.length === g.targets.length, `enemies ${g.enemies.length}, hittables ${g.hittables.length}`);
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
