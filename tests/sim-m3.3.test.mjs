// M3.3 TOPDOWN GAMEPLAY — simulation tests (pure JS, no browser): endless survival after wave 3, score + combo,
// accuracy, drops (medkit / ammo). Every new option is off by default: the FPS game must stay exactly as it was.
import outpost from '../prototype-3d/src/data/maps/outpost-zero.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { WAVES, TOPDOWN_WAVES, TOPDOWN_MATCH, ENDLESS, topdownEndlessWave, waveQueue } from '../prototype-3d/src/sim/waves/wave-defs.js';
import { SCORE, killPoints, comboMult } from '../prototype-3d/src/sim/score.js';
import { DROPS, PICKUP } from '../prototype-3d/src/sim/pickups.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';

const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const DT = 1 / 60;
const TD = { waves: TOPDOWN_WAVES, match: TOPDOWN_MATCH, aimHeight: 1.15, flatAim: true, dash: true };
const TD33 = { ...TD, endless: topdownEndlessWave, scoring: true, drops: true };
const mkInput = () => { const i = new InputState(); i.actions.dash = false; i.presses.dash = 0; return i; };
const run = (g, i, sec, each) => { for (let t = 0; t < sec * 60; t++) { if (each) each(t); g.step(i.update(), DT); } };
const seq = vals => { let k = 0; return () => vals[k++ % vals.length]; };
/** Kill every living infected (as a weapon kill), optionally as headshots. */
const killAll = (g, how = {}) => { for (const e of [...g.enemies]) if (e.alive) { e.applyDamage(1e6, how.headshot ? 'head' : 'chest', { dir: { x: 1, y: 0 } }); g.onEntityKilled(e, how); } };
/** Clear waves until the director reaches `n` (or the player dies). God mode: the player cannot be hurt. */
function playTo(g, i, n, how = {}) {
  g.player.invuln = 1e9;
  for (let t = 0; t < 60 * 60 * 20 && g.state.wave.number < n; t++) { g.player.invuln = 1e9; g.step(i.update(), DT); if (t % 10 === 0) killAll(g, how); }
}

// ---- 1. FPS untouched ----
{
  const g = new Game(outpost);
  check('FPS Game: no scoring, no drops, no endless', g.scoring === false && g.pickups === null && g.waves.endless === null);
  const i = mkInput(); g.restart();
  playTo(g, i, 3); run(g, i, 0.5); killAll(g);
  for (let t = 0; t < 60 * 30 && g.waves.phase !== 'victory'; t++) { g.player.invuln = 1e9; g.step(i.update(), DT); if (t % 10 === 0) killAll(g); }
  check('FPS match still ends with victory after wave 3', g.waves.phase === 'victory' && g.matchOver, g.waves.phase);
  check('FPS: score stays 0 (scoring off)', g.state.score.points === 0);
  check('FPS waves unchanged (3 × 9)', WAVES.length === 3 && WAVES.every(w => waveQueue(w).length === 9));
}

// ---- 2. endless formula (data) ----
{
  const w4 = topdownEndlessWave(4), w10 = topdownEndlessWave(10), w30 = topdownEndlessWave(30);
  const cnt = (w, t) => waveQueue(w).filter(e => e.type === t).length;
  check('Wave 4: 8 walkers + 2 mutants + 3 brutes, 6 alive, 1.04 s', cnt(w4, 'walker') === 8 && cnt(w4, 'mutant') === 2 && cnt(w4, 'brute') === 3 && w4.maxActive === 6 && Math.abs(w4.spawnInterval - 1.04) < 1e-9,
    `${cnt(w4, 'walker')}/${cnt(w4, 'mutant')}/${cnt(w4, 'brute')} max ${w4.maxActive} int ${w4.spawnInterval}`);
  check('Wave 10 is bigger than wave 4 (count, alive)', waveQueue(w10).length > waveQueue(w4).length && w10.maxActive > w4.maxActive, `${waveQueue(w10).length} / ${w10.maxActive}`);
  check('Caps: ≤ 10 alive, spawn interval ≥ 0.6 s', w30.maxActive === ENDLESS.maxActive[2] && w30.spawnInterval === ENDLESS.spawnInterval[2]);
  let grows = true; for (let n = 4; n < 40; n++) if (waveQueue(topdownEndlessWave(n + 1)).length < waveQueue(topdownEndlessWave(n)).length) grows = false;
  check('Wave size never shrinks (4 … 40)', grows);
  check('Generated waves use only the top-down types', [4, 7, 15].every(n => waveQueue(topdownEndlessWave(n)).every(e => ['walker', 'brute', 'mutant'].includes(e.type))));
}

// ---- 3. endless match ----
{
  const g = new Game(outpost, { ...TD33, waveRng: seq([0.3, 0.7, 0.1]), dropRng: () => 0.99 });
  const i = mkInput(); g.restart();
  check('Endless flag reaches GameState.wave', g.state.wave.endless === true && g.state.wave.of === 3);
  let victory = 0; g.on('victory', () => victory++);
  playTo(g, i, 6);
  check('After wave 3 the match goes on (wave 6 reached, no victory)', g.state.wave.number === 6 && victory === 0 && !g.matchOver, `wave ${g.state.wave.number}`);
  check('Generated wave object is cached (same object for the same wave)', g.waves.wave === g.waves.wave && g.waves.wave.number === 6);
  check('Director uses the wave\'s maxActive / spawnInterval', g.waves.maxActive === topdownEndlessWave(6).maxActive && g.waves.spawnInterval === topdownEndlessWave(6).spawnInterval);
  const total = waveQueue(topdownEndlessWave(6)).length;
  check('Wave 6 total = generated queue length', g.state.wave.total === total, `${g.state.wave.total} vs ${total}`);
  let maxAlive = 0; for (let t = 0; t < 60 * 25; t++) { g.player.invuln = 1e9; g.step(i.update(), DT); maxAlive = Math.max(maxAlive, g.enemies.filter(e => e.alive).length); }
  check('Never more alive than the wave allows', maxAlive <= topdownEndlessWave(6).maxActive && maxAlive > 0, `max ${maxAlive}`);
  g.restart();
  check('Restart → wave 1 again, score 0, cache harmless', g.state.wave.number === 1 && g.state.score.points === 0 && g.waves.index === 0);
}

// ---- 4. score + combo ----
{
  check('killPoints: walker 100, brute 300, mutant 200; headshot ×1.5, melee ×1.5', killPoints('walker') === 100 && killPoints('brute') === 300 && killPoints('mutant') === 200
    && killPoints('walker', { headshot: true }) === 150 && killPoints('walker', { melee: true }) === 150);
  check('comboMult: 1 → 1.25 → … capped at 3', comboMult(1) === 1 && comboMult(2) === 1.25 && comboMult(9) === 3 && comboMult(50) === 3);
  const g = new Game(outpost, { ...TD33, dropRng: () => 0.99 }); const i = mkInput(); g.restart({ waves: false });
  const mk = (type) => g.spawnInfected(type, g.player.x + 3, g.player.y, 0);
  let evs = []; g.on('score', e => { if (e.gain) evs.push(e); });
  const a = mk('walker'); a.applyDamage(1e6, 'chest'); g.onEntityKilled(a, {});
  const b = mk('walker'); b.applyDamage(1e6, 'head'); g.onEntityKilled(b, { headshot: true });
  check('Second kill inside the window: combo 2, ×1.25 with headshot → 188', g.state.score.combo === 2 && evs[1].gain === Math.round(100 * 1.5 * 1.25), `gain ${evs[1] && evs[1].gain}`);
  check('Points add up (100 + 188)', g.state.score.points === 100 + 188);
  run(g, i, SCORE.window + 0.1);
  check('Combo ends after the window, multiplier back to 1', g.state.score.combo === 0 && g.state.score.mult === 1 && g.state.score.bestCombo === 2);
  const c = mk('brute'); c.applyDamage(1e6, 'chest'); g.onEntityKilled(c, { melee: true });
  check('Melee brute after the combo ended: 300 × 1.5 = 450, combo 1', evs[2].gain === 450 && g.state.score.combo === 1);
  check('Headshot / melee kills counted', g.state.stats.headshotKills === 1 && g.state.stats.meleeKills === 1);
  const before = g.state.score.points; g.onEntityKilled(c, {}); g.onEntityKilled(c, { headshot: true });
  check('A kill is scored once (repeat calls change nothing)', g.state.score.points === before && g.state.kills === 3);
  // wave bonus
  const g2 = new Game(outpost, { ...TD33, dropRng: () => 0.99 }); const i2 = mkInput(); g2.restart();
  let waveGain = 0; g2.on('score', e => { if (e.kind === 'wave') waveGain += e.gain; });
  playTo(g2, i2, 3);
  check('Wave bonus 250 × wave (waves 1 + 2 → 750)', waveGain === SCORE.waveClear * (1 + 2), `${waveGain}`);
  check('Kills of waves 1–2 scored', g2.state.score.points >= 750 + 15 * 100, `${g2.state.score.points}`);
  // no points after death
  const pts = g2.state.score.points; g2.player.invuln = 0; g2.damagePlayer(1000);
  const e = g2.spawnInfected('walker', g2.player.x + 3, g2.player.y, 0); e.applyDamage(1e6, 'chest'); g2.onEntityKilled(e, {});
  check('No points once the player is dead', g2.state.score.points === pts && g2.player.dead);
}

// ---- 5. accuracy ----
{
  const g = new Game(outpost, { ...TD33, dropRng: () => 0.99, rng: () => 0.5 }); const i = mkInput(); g.restart({ waves: false });
  g.player.yaw = 0; const e = g.spawnInfected('brute', g.player.x + 2.5, g.player.y, Math.PI);
  e.hp = 1e9; // never dies: every round should hit
  i.setAction('fire', true); run(g, i, 0.5); i.setAction('fire', false); run(g, i, 0.1);
  const s = { ...g.state.stats };
  check('Shots counted per round, all hit the target', s.shots > 0 && s.hits === s.shots, `${s.hits}/${s.shots}`);
  g.player.yaw = Math.PI; i.setAction('fire', true); run(g, i, 0.3); i.setAction('fire', false);
  const s2 = g.state.stats;
  check('Shots into a wall add shots, not hits', s2.shots > s.shots && s2.hits === s.hits && g.state.accuracy < 1 && g.state.accuracy > 0, `${s2.hits}/${s2.shots} = ${(g.state.accuracy * 100).toFixed(0)} %`);
}

// ---- 6. drops ----
{
  check('Drop tables: brute always drops, walker rarely', DROPS.brute.always === true && DROPS.walker.medkit + DROPS.walker.ammo < 0.3);
  const g = new Game(outpost, { ...TD33, dropRng: seq([0.01]) }); const i = mkInput(); g.restart({ waves: false });
  const p = g.player, spawnAt = (type, dx) => { const e = g.spawnInfected(type, p.x + dx, p.y, 0); e.applyDamage(1e6, 'chest'); g.onEntityKilled(e, {}); return e; };
  let spawned = []; g.on('pickupSpawn', e => spawned.push(e));
  spawnAt('walker', 3);
  check('Walker kill with roll 0.01 → medkit at the kill spot', spawned.length === 1 && spawned[0].kind === 'medkit' && g.pickups.list.length === 1);
  // full HP → the medkit stays
  const it = g.pickups.list[0]; p.x = it.x; p.y = it.y; run(g, i, 0.2);
  check('Full health: medkit is not collected (stays)', g.pickups.list.length === 1);
  g.state.damage(40); const hp0 = g.state.health.hp; let taken = []; g.on('pickup', e => taken.push(e));
  run(g, i, 0.1);
  check('Hurt: walking over it heals 25 and removes it', g.state.health.hp === hp0 + PICKUP.medkit.heal && g.pickups.list.length === 0 && taken[0].kind === 'medkit' && taken[0].amount === 25, `${hp0} → ${g.state.health.hp}`);
  g.state.setHealth(g.state.health.max - 10);
  g.pickups.list.push({ id: 'x', kind: 'medkit', x: p.x, y: p.y, t: 0, ttl: 15 }); run(g, i, 0.05);
  check('Heal never exceeds max HP (90 + 25 → 100)', g.state.health.hp === g.state.health.max && g.pickups.list.length === 0, `${g.state.health.hp}`);
  // ammo
  const g2 = new Game(outpost, { ...TD33, dropRng: seq([0.99, 0.5]) }); const i2 = mkInput(); g2.restart({ waves: false });
  const p2 = g2.player, st = g2.state;
  const e1 = g2.spawnInfected('brute', p2.x + 3, p2.y, 0); e1.applyDamage(1e6, 'chest'); g2.onEntityKilled(e1, {});
  check('Brute always drops (roll 0.99 → ammo)', g2.pickups.list.length === 1 && g2.pickups.list[0].kind === 'ammo');
  const box = g2.pickups.list[0]; p2.x = box.x; p2.y = box.y; run(g2, i2, 0.1);
  check('Full reserves: ammo box stays', g2.pickups.list.length === 1);
  st.setAmmo(st.weapon.mag, 10); g2.arsenal.ammo[1].reserve = 0; g2.arsenal.ammo[2].reserve = WEAPONS[g2.arsenal.ids[2]].reserve;
  const tot0 = [0, 1, 2].map(k => g2.arsenal.total(k));
  run(g2, i2, 0.05);
  const tot1 = [0, 1, 2].map(k => g2.arsenal.total(k)), d0 = WEAPONS[g2.arsenal.ids[0]], d1 = WEAPONS[g2.arsenal.ids[1]];
  check('Ammo box: +1 magazine to the active weapon and to an empty one; a full one unchanged', g2.pickups.list.length === 0
    && tot1[0] - tot0[0] === d0.magSize && tot1[1] - tot0[1] === d1.magSize && tot1[2] === tot0[2], `${tot0} → ${tot1}`);
  st.setAmmo(st.weapon.mag, d0.reserve - 3); g2.arsenal.addAmmo(1);
  check('Reserve never exceeds the weapon\'s full reserve', st.weapon.reserve === d0.reserve);
  // ttl + overflow
  const g3 = new Game(outpost, { ...TD33, dropRng: () => 0.01 }); const i3 = mkInput(); g3.restart({ waves: false });
  g3.player.x = 3; g3.player.y = 3;
  let removed = []; g3.on('pickupRemoved', e => removed.push(e.why));
  for (let k = 0; k < PICKUP.max + 2; k++) { const e = g3.spawnInfected('walker', 10 + (k % 4) * 0.6, 4 + Math.floor(k / 4) * 0.6, 0); e.applyDamage(1e6, 'chest'); g3.onEntityKilled(e, {}); }
  check(`At most ${PICKUP.max} items on the floor (oldest removed)`, g3.pickups.list.length === PICKUP.max && removed.filter(w => w === 'overflow').length === 2, `${g3.pickups.list.length}`);
  run(g3, i3, PICKUP.ttl + 0.1);
  check('Items expire after the ttl', g3.pickups.list.length === 0 && removed.filter(w => w === 'expired').length === PICKUP.max);
  const e = g3.spawnInfected('walker', 10, 4, 0); e.applyDamage(1e6, 'chest'); g3.onEntityKilled(e, {});
  g3.restart({ waves: false });
  check('Restart clears the floor', g3.pickups.list.length === 0);
  // drop point inside a wall → moved to free floor (or none)
  const g4 = new Game(outpost, { ...TD33, dropRng: () => 0.01 }); g4.restart({ waves: false });
  const w = g4.world; let wall = null;
  for (let y = 1; y < w.height - 1 && !wall; y++) for (let x = 1; x < w.width - 1; x++) if (w.isSolid ? w.isSolid(x, y) : false) { wall = { x: x + 0.5, y: y + 0.5 }; break; }
  const pt = g4.pickups.dropPoint(wall ? wall.x - 0.5 : 0.5, wall ? wall.y : 0.5);
  check('Drop point is always on free floor', !pt || g4.pickups.dropPoint(pt.x, pt.y).x === pt.x);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
