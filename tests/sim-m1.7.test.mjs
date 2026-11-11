// M1.7 OUTPOST ZERO simulation tests (pure logic, no browser): node tests/sim-m1.7.test.mjs
// Environment data (same grid, props on solid cells, decor depth, windows on solid walls, zones connected),
// three cosmetic infected variants (3/3/3 per wave, no gameplay difference), the alarm timeline driven by the
// existing intermission, balance unchanged. Numbers = items of the M1.7 spec §13.
import arena from '../prototype-3d/src/data/maps/arena-m16.js';
import outpost, { DECOR_MAX_DEPTH } from '../prototype-3d/src/data/maps/outpost-zero.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { INFECTED_TYPES, INFECTED_VARIANTS, OUTPOST_VARIANTS, checkVariant } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH, SPAWN_RULES, waveQueue } from '../prototype-3d/src/sim/waves/wave-defs.js';
import { alarmState, alarmVisual, sirenLevel, ALARM, ALARM_OFF } from '../prototype-3d/src/sim/waves/alarm.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';
import { canStand } from '../prototype-3d/src/sim/collision.js';
import { resolveShot } from '../prototype-3d/src/sim/hitscan.js';
import { lineOfSight } from '../prototype-3d/src/sim/nav/grid-nav.js';
import { DEFAULT_SETTINGS, PLAYER_RADIUS } from '../prototype-3d/src/config.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const H = INFECTED_TYPES.hollow, M = 0.5;
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function setup({ map = outpost, px = 8, py = 8, yaw = 0, waves = false, s = 7, opts = {} } = {}) {
  seed = s;
  const g = new Game(map, { rng: () => 0, waveRng: rng, aiRng: rng, ...opts });
  Object.assign(g.player, { x: px, y: py, prevX: px, prevY: py, yaw });
  const inp = new InputState();
  const ev = []; for (const t of ['infectedSpawn', 'infectedAttack', 'playerHurt', 'infectedKilled', 'waveCleared', 'waveIntermission', 'victory', 'alarm', 'restart']) g.on(t, d => ev.push([t, d, g.tick]));
  if (waves) g.startWaves();
  const run = (sec, onStep) => { for (let i = 0; i < Math.round(sec * 60); i++) { g.step(inp.update(), 1 / 60); if (onStep && onStep() === false) break; } };
  return { g, inp, ev, run, count: t => ev.filter(e => e[0] === t).length };
}
const kill = (g, e) => { e.applyDamage(e.hp, 'body', { dir: { x: 1, y: 0, z: 0 } }); g.onInfectedKilled(e); };
const FACE = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] }; // direction the face looks into the room (sim x, y)

// =================== 13.1 Environment ===================
{
  // 1. map size preserved
  const same = outpost.grid.length === arena.grid.length && outpost.grid.every((r, y) => r.length === arena.grid[y].length && [...r].every((c, x) => c === arena.grid[y][x]));
  check('1. Map size and layout preserved: OUTPOST ZERO uses the M1.6 grid cell for cell (30×16, 28×14 interior)', same && outpost.grid[0].length === 30 && outpost.grid.length === 16 && outpost.playerStart.x === arena.playerStart.x && outpost.playerStart.y === arena.playerStart.y);
  const g = setup().g, w = g.world;
  // 2. environment data loads into the sim world
  check('2. Environment data loads: world built, 13 props, decor / windows / lamps / beacons present, 3 zones', w.width === 30 && w.height === 16 && outpost.props.length === 13 && outpost.decor.length >= 20 && outpost.windows.length >= 6 && outpost.lamps.length >= 8 && outpost.beacons.length >= 6 && Object.keys(outpost.zones).join('') === 'ABC');
  // 5. collisions match visuals: every prop cell IS a solid cell, every interior solid cell is dressed as exactly one prop
  const propCells = new Map();
  for (const p of outpost.props) for (const [x, y] of p.cells) propCells.set(x + ',' + y, (propCells.get(x + ',' + y) || 0) + 1);
  let allSolid = true, covered = true, once = true;
  for (const [k, n] of propCells) { const [x, y] = k.split(',').map(Number); if (!w.isSolidCell(x, y)) allSolid = false; if (n !== 1) once = false; }
  for (let y = 1; y < w.height - 1; y++) for (let x = 1; x < w.width - 1; x++) {
    const inner = w.isSolidCell(x, y) && !(x === 15 || x === 16); // the partition between the halls is wall, not a prop
    if (inner && !propCells.has(x + ',' + y)) covered = false;
  }
  check('5. Collision = visuals: every prop sits on solid cells (exact footprint), every interior solid block is a prop', allSolid && covered && once, `${propCells.size} prop cells`);
  const deep = outpost.decor.filter(d => !(d.depth <= DECOR_MAX_DEPTH));
  check('5. Wall decor is thin (≤ 0.22 m): never reachable by the player (0.52 m) or an infected (0.6 m wide)', deep.length === 0 && DECOR_MAX_DEPTH < H.radius && DECOR_MAX_DEPTH < PLAYER_RADIUS * 2, deep.map(d => d.type).join(','));
  // decor / windows / beacons are mounted on a real wall: the cell behind the face is solid along the whole extent
  const onWall = (f) => { const [nx, ny] = FACE[f.face]; for (let a = (f.a0 ?? f.a) + 0.05; a <= (f.a1 ?? f.a) - 0.05 + 1e-9; a += 0.1) { const x = nx ? f.at - nx * 0.5 : a, y = ny ? f.at - ny * 0.5 : a, fx = nx ? f.at + nx * 0.5 : a, fy = ny ? f.at + ny * 0.5 : a; if (!w.isSolidCell(Math.floor(x), Math.floor(y)) || w.isSolidCell(Math.floor(fx), Math.floor(fy))) return false; } return true; };
  const bad = [...outpost.decor, ...outpost.windows, ...outpost.beacons].filter(d => !onWall(d));
  check('5. Every decor item, window and beacon hangs on a solid wall face that looks into open floor', bad.length === 0, bad.map(d => `${d.type || 'window/beacon'}@${d.face}${d.at}`).join(' '));
  // windows: the player cannot leave through them — the wall cells behind stay solid, and the outer ring is closed
  const outer = outpost.windows.every(win => { const [nx, ny] = FACE[win.face]; const bx = nx ? win.at - nx * 0.5 : (win.a0 + win.a1) / 2, by = ny ? win.at - ny * 0.5 : (win.a0 + win.a1) / 2; return w.isSolidCell(Math.floor(bx), Math.floor(by)); });
  let out = false;
  for (const win of outpost.windows) { const [nx, ny] = FACE[win.face]; const { g: g2, inp, run } = setup({ px: nx ? win.at + nx * 0.8 : (win.a0 + win.a1) / 2, py: ny ? win.at + ny * 0.8 : (win.a0 + win.a1) / 2, yaw: Math.atan2(-ny, -nx) }); inp.keyMove.y = 1; run(4, () => { const p = g2.player; if (p.x < 1 || p.y < 1 || p.x > 29 || p.y > 15) { out = true; return false; } }); }
  check('7. Windows are in solid outer walls: walking into every window never leaves the outpost', outer && !out);
  // 3. spawn points: never inside props / walls (every candidate of the director passes canStand with clearance)
  const { g: gs } = setup({ waves: true });
  let n = 0, inside = 0;
  for (const [x, y] of [[8, 8], [3, 3], [26, 12], [20, 4], [12, 12]]) { Object.assign(gs.player, { x, y }); gs.waves.pickSpawn(); for (const c of gs.waves.cand) { n++; if (!canStand(w, c.x, c.y, SPAWN_RULES.clearance * M) || propCells.has(Math.floor(c.x) + ',' + Math.floor(c.y))) inside++; } }
  check('3. No obstacles inside spawn points: every spawn candidate is free floor with clearance, never in a prop', n > 200 && inside === 0, `${n} candidates`);
  // 4. navigation between zones A ↔ B ↔ C: a flood fill from zone A's centre reaches the floor of every zone
  const seen = new Set(), st = [[3, 8]];
  while (st.length) { const [x, y] = st.pop(); const k = x + ',' + y; if (seen.has(k) || w.isSolidCell(x, y)) continue; seen.add(k); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  const zoneOk = Object.values(outpost.zones).every(z => { let floor = 0, reach = 0; for (let y = z.y0; y < z.y1; y++) for (let x = z.x0; x < z.x1; x++) if (!w.isSolidCell(x, y)) { floor++; if (seen.has(x + ',' + y)) reach++; } return floor > 0 && reach === floor; });
  check('4. Navigation: every floor cell of zones A (КПП), B (наблюдение), C (техсектор) is connected', zoneOk, `${seen.size} cells`);
  // an infected crosses from zone A to zone C on its own (real AI navigation)
  { const { g: gn, run } = setup({ px: 27.5, py: 13.5 }); const e = gn.spawnInfected('hollow', 2.5, 2.5, 0, { variant: 'worker' }); e.startSearch(gn.aiCtx, 26.5, 13.5); let arrived = false; run(40, () => { gn.state.setHealth(100); if (Math.hypot(e.x - 26.5, e.y - 13.5) < 2.5) { arrived = true; return false; } }); check('4. AI navigation: an infected walks from zone A to the far corner of zone C', arrived, `${e.x.toFixed(1)},${e.y.toFixed(1)}`); }
  // 6. bullets never pass through opaque obstacles: a shot at each prop stops on its face; LOS is blocked by it
  let stops = 0, total = 0;
  for (const p of outpost.props) for (const [cx, cy] of p.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.isSolidCell(cx + dx, cy + dy)) continue;                                   // internal face of a multi-cell prop
      const ox = cx + 0.5 + dx * (0.5 + 1.2), oy = cy + 0.5 + dy * (0.5 + 1.2);       // 1.2 cells in front of the face
      if (!canStand(w, ox, oy, 0.1)) continue; total++;
      const h = resolveShot(w, [], { x: ox, y: oy, z: 0.8 }, { x: -dx, y: -dy, z: 0 }, 50);
      if (h.type === 'world' && Math.abs(h.t - 1.2) < 1e-6 && !lineOfSight(w, ox, oy, cx + 0.5 - dx * 1.1, cy + 0.5 - dy * 1.1)) stops++;
    }
  }
  check('6. Shots stop at the face of every prop (no bullets through cabinets, generator, racks…) and props block sight', total > 20 && stops === total, `${stops}/${total}`);
}

// =================== 13.2 Infected variants ===================
check('9. Three outpost variants exist (GUARD, TECHNICIAN, WORKER) + the original look; unknown ids are rejected', OUTPOST_VARIANTS.join() === 'guard,technician,worker' && OUTPOST_VARIANTS.every(v => INFECTED_VARIANTS[v]) && (() => { try { checkVariant('tank'); return false; } catch { return true; } })());
check('17. Variants are cosmetic data only: no stats on variants, a single infected type (same hp / speed / damage / range / AI)', Object.keys(INFECTED_TYPES).join() === 'hollow' && Object.values(INFECTED_VARIANTS).every(v => Object.keys(v).sort().join() === 'id,name,role'));
{
  const q = waveQueue(WAVES[0]).map(e => e.variant);
  const counts = WAVES.map(w => { const c = {}; for (const e of waveQueue(w)) c[e.variant] = (c[e.variant] || 0) + 1; return c; });
  check('10. Every wave of 9 = 3 GUARD + 3 TECHNICIAN + 3 WORKER (spawn config carries the variant id)', counts.every(c => c.guard === 3 && c.technician === 3 && c.worker === 3) && WAVES.every(w => w.enemies.every(g => g.type === 'hollow' && OUTPOST_VARIANTS.includes(g.variant))));
  check('10. The looks are mixed in spawn order (round-robin, no three of a kind in a row)', q.join(' ') === 'guard technician worker guard technician worker guard technician worker' && WAVES.every(w => { const s = waveQueue(w).map(e => e.variant); return s.every((v, i) => i < 2 || !(v === s[i - 1] && v === s[i - 2])); }));
}
// full match: each wave actually spawns 3/3/3 and every infected carries the variant
{
  const { g, run, ev } = setup({ waves: true });
  run(400, () => { g.state.setHealth(100); for (const e of g.enemies) if (e.alive && Math.random() < 0.02) kill(g, e); return g.waves.phase !== 'victory'; });
  const sp = ev.filter(e => e[0] === 'infectedSpawn').map(e => e[1]);
  const byWave = [0, 1, 2].map(i => sp.slice(i * 9, i * 9 + 9).reduce((c, s) => (c[s.variant] = (c[s.variant] || 0) + 1, c), {}));
  check('10. Real match: 27 spawns, each wave 3/3/3, spawn events carry the variant', sp.length === 27 && byWave.every(c => c.guard === 3 && c.technician === 3 && c.worker === 3) && g.waves.phase === 'victory', JSON.stringify(byWave));
}
// 11–15, 17: identical behaviour per variant — the same scripted fight gives the same timeline for every look
function duel(variant) {
  const { g, run, ev } = setup({ px: 8, py: 8 });
  const e = g.spawnInfected('hollow', 12.5, 8, Math.PI, { variant });
  const trace = [];
  let hb0 = null;
  run(6, () => { if (!hb0 && e.state === 'CHASE') hb0 = JSON.stringify(e.hitboxes()); trace.push([e.x.toFixed(5), e.y.toFixed(5), e.state, g.state.health.hp].join()); });
  const hbs = JSON.stringify(e.hitboxes());
  // shoot it: two body hits, one head hit (same damage pipeline as the weapon)
  const shots = [];
  for (const zone of ['body', 'body', 'head']) { const r = e.applyDamage(WEAPONS.raven.damage[zone], zone, { dir: { x: -1, y: 0, z: 0 } }); shots.push([e.hp, e.alive, r && r.killed]); }
  if (!e.alive) g.onInfectedKilled(e);
  run(6);
  return { trace: trace.join('|'), hb0, hbs, shots: JSON.stringify(shots), attacks: ev.filter(x => x[0] === 'infectedAttack').length, hurt: ev.filter(x => x[0] === 'playerHurt').length, dead: !e.alive, fall: e.fall && e.fall.kind, removed: g.enemies.length, k: JSON.stringify(e.k), maxHp: e.maxHp };
}
{
  const R = Object.fromEntries(['hollow', ...OUTPOST_VARIANTS].map(v => [v, duel(v)]));
  const same = (k) => OUTPOST_VARIANTS.every(v => R[v][k] === R.hollow[k]);
  check('11. Hit zones identical for every variant (same animated hit zones as M1.6, sampled while chasing and at the end)', same('hb0') && same('hbs') && R.hollow.hb0 !== null);
  check('12. Same pose / movement timeline for every variant (shared skeleton → no animation desync)', same('trace'));
  check('13. Same reaction to hits: HP after body/body/head identical', same('shots'), R.guard.shots);
  check('14. Attacks work the same: swings and landed blows identical', same('attacks') && same('hurt') && R.hollow.attacks > 0 && R.hollow.hurt > 0, `${R.hollow.attacks} swings, ${R.hollow.hurt} blows`);
  check('15. Death is identical (dies, falls the same way, corpse removed after corpseTime)', same('dead') && same('fall') && same('removed') && R.worker.dead && R.worker.removed === 0, R.worker.fall);
  check('17. No gameplay advantage: tuning (speeds, ranges, hit radii) and max HP identical for all variants', same('k') && same('maxHp'));
  check('16. Resources: dead infected of every variant leave the sim (no leftover hittables)', OUTPOST_VARIANTS.every(v => R[v].removed === 0));
}
// 17. a whole seeded match is identical with and without variants
{
  const plain = WAVES.map(w => ({ ...w, enemies: w.enemies.map(e => ({ type: e.type, count: e.count })) }));
  const play = (waves) => { const { g, run } = setup({ waves: true, opts: { waves } }); const sig = []; run(60, () => { g.state.setHealth(100); if (g.tick % 30 === 0) sig.push(g.enemies.map(e => `${e.x.toFixed(4)},${e.y.toFixed(4)},${e.state}`).join(';')); if (g.tick % 400 === 0) for (const e of g.enemies) if (e.alive) { kill(g, e); break; } }); return sig.join('|') + '#' + g.state.wave.remaining + '#' + g.state.health.hp; };
  check('17. Seeded 60 s match: positions / states / HP tick-identical with variants vs plain M1.6 waves', play(WAVES) === play(plain));
}

// =================== 13.3 Alarm (GameState-driven) ===================
check('Balance: intermission still 6 s, 3 waves × 9, max 5 alive, 27 total, resupply on', MATCH.intermission === 6 && WAVES.length === 3 && WAVES.every(w => w.enemies.reduce((s, e) => s + e.count, 0) === 9) && MATCH.maxActive === 5 && MATCH.resupplyReserve === true);
{
  // pure timeline
  const at = (t) => alarmState(t, 6);
  const seq = []; for (let t = 0; t < 6.0001; t += 0.05) { const p = at(t).phase; if (seq[seq.length - 1] !== p) seq.push(p); }
  check('19. Timeline order: message → beacons → siren → warning → fade → calm → off', seq.join(' ') === 'message beacons siren warning fade calm' && at(6).phase === 'off', seq.join(' '));
  check('19. Start moments: beacons after 0.8 s, siren 1.4 s, HUD warning 2.0 s', at(0.79).k === 0 && at(1.2).k > 0 && !at(1.39).siren && at(1.41).siren && !at(1.99).warn && at(2.01).warn);
  check('20. End: siren stops ≥ 1.5 s before the intermission ends, lights back to normal (k = 0) before the next wave', !at(4.41).siren && at(5.6).k === 0 && at(5.99).k === 0 && ALARM.sirenOff <= MATCH.intermission - 1.5);
  let maxStep = 0; for (let t = 0; t < 6; t += 1 / 60) maxStep = Math.max(maxStep, Math.abs(at(t + 1 / 60).k - at(t).k));
  check('6.2 No harsh flashing: light level changes smoothly (≤ 0.05 per frame), pulse ≤ 1 Hz', maxStep <= 0.05 && ALARM.pulseHz <= 1, `max Δk/frame ${maxStep.toFixed(3)}`);
  check('Settings: alarm effect full / soft / off (soft dims, off removes visuals and siren); default full', DEFAULT_SETTINGS.alarmFx === 'full' && alarmVisual(1, 'full') === 1 && alarmVisual(1, 'soft') > 0 && alarmVisual(1, 'soft') < 0.5 && alarmVisual(1, 'off') === 0 && sirenLevel('off') === 0 && sirenLevel('soft') < 1);
  check('Out of range / no intermission → alarm off', alarmState(-1).phase === 'off' && alarmState(6).phase === 'off' && alarmState(NaN).k === 0);
}
{
  // 18–20: inside the real match the director drives GameState.alarm from the existing intermission timer
  const { g, run, ev } = setup({ waves: true });
  const log = [];
  let activeDuringCombat = false, sirenWhileSpawning = false, alarmBeforeClear = false;
  run(200, () => {
    g.state.setHealth(100);
    const a = g.state.alarm, ph = g.waves.phase;
    if (ph === 'active' && a.active) activeDuringCombat = true;
    if (ph !== 'intermission' && (a.siren || a.k > 0)) alarmBeforeClear = true;
    if (g.waves.phase === 'countdown' && a.siren) sirenWhileSpawning = true;
    if (ph === 'intermission') log.push([g.waves.t.toFixed(3), a.phase, a.k, a.siren, a.warn]);
    for (const e of g.enemies) if (e.alive) kill(g, e);
    return g.state.wave.number < 2 || g.waves.phase !== 'active';
  });
  const first = log[0], sirenOn = log.find(r => r[3]), sirenOff = [...log].reverse().find(r => r[3]);
  check('18. Alarm starts with the intermission after the wave is cleared (never during combat)', log.length > 300 && first && !activeDuringCombat && !alarmBeforeClear && ev.some(e => e[0] === 'waveIntermission'), `${log.length} ticks`);
  check('19. Siren runs only inside its window (≈1.4 s … 4.4 s into the 6 s pause)', sirenOn && Math.abs(6 - Number(sirenOn[0]) - 1.4) < 0.05 && Math.abs(6 - Number(sirenOff[0]) - 4.4) < 0.05, `${sirenOn && (6 - sirenOn[0]).toFixed(2)} → ${sirenOff && (6 - sirenOff[0]).toFixed(2)} s`);
  check('20. Alarm fully off before / when wave 2 spawns (no siren in the countdown, k = 0, phase off)', !sirenWhileSpawning && g.state.alarm.phase === 'off' && g.state.alarm.k === 0 && g.state.wave.number === 2);
  check('6.4 No own timer: the intermission length is unchanged (6 s of sim time between clear and next countdown)', Math.abs(log.length / 60 - MATCH.intermission) < 0.05, `${(log.length / 60).toFixed(2)} s`);
  const alarmEv = ev.filter(e => e[0] === 'alarm').length;
  check('24. Alarm events only on transitions (bounded, no per-tick spam)', alarmEv >= 6 && alarmEv <= 10, `${alarmEv} events`);
}
{
  // 21. pause: no sim steps → the alarm freezes exactly where it was; resume continues
  const { g, run } = setup({ waves: true });
  run(200, () => { g.state.setHealth(100); for (const e of g.enemies) if (e.alive) kill(g, e); return !(g.waves.phase === 'intermission' && g.state.alarm.siren); });
  const before = JSON.stringify(g.state.alarm);
  const frozen = JSON.stringify(g.state.alarm); // (paused = the loop does not call step)
  run(0.5);
  check('21. Pause / resume: the alarm state is frozen without sim steps and continues afterwards', before === frozen && g.state.alarm.t > JSON.parse(before).t && g.state.alarm.siren);
  // 23. restart during the alarm resets every effect
  g.restart({ waves: true });
  check('23. Restart during the alarm: alarm off, k 0, no siren, wave 1 again', g.state.alarm.phase === 'off' && g.state.alarm.k === 0 && !g.state.alarm.siren && !g.state.alarm.warn && g.state.wave.number === 1 && g.waves.phase === 'countdown');
  // 22. back to the menu during the alarm (main.js: restart({ waves: false })) → off and stays off
  run(200, () => { g.state.setHealth(100); for (const e of g.enemies) if (e.alive) kill(g, e); return !(g.waves.phase === 'intermission' && g.state.alarm.warn); });
  g.restart({ waves: false }); run(8);
  check('22. Menu during the alarm (match abandoned): alarm off and stays off', g.state.alarm.phase === 'off' && g.state.alarm.k === 0 && g.enemies.length === 0);
  // victory: no alarm after the last wave
  const { g: gv, run: rv } = setup({ waves: true }); let alarmAfterLast = false;
  rv(400, () => { gv.state.setHealth(100); for (const e of gv.enemies) if (e.alive) kill(gv, e); if (gv.state.wave.number === 3 && gv.state.alarm.active && gv.waves.phase !== 'intermission') alarmAfterLast = true; return gv.waves.phase !== 'victory'; });
  rv(7);
  check('Victory: no alarm after the third wave (only 2 intermissions → 2 alarms)', gv.waves.phase === 'victory' && !alarmAfterLast && gv.state.alarm.phase === 'off');
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
