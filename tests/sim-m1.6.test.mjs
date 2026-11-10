// M1.6 simulation tests (pure logic, no browser): node tests/sim-m1.6.test.mjs
// Arena 2×, three waves × 9 (max 5 alive), AI 2.0 (memory / search / re-detection / hearing / patrol),
// animated hit zones, death fall next to walls, unchanged weapon stats.
import arena from '../prototype-3d/src/data/maps/arena-m16.js';
import training from '../prototype-3d/src/data/maps/training.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { INFECTED_TYPES } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH, SPAWN_RULES } from '../prototype-3d/src/sim/waves/wave-defs.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';
import { lineOfSight } from '../prototype-3d/src/sim/nav/grid-nav.js';
import { canStand } from '../prototype-3d/src/sim/collision.js';
import { resolveShot } from '../prototype-3d/src/sim/hitscan.js';
import { PLAYER_RADIUS } from '../prototype-3d/src/config.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const H = INFECTED_TYPES.hollow, M = 0.5;
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function setup({ map = arena, px = 8, py = 8, yaw = 0, waves = false, s = 7, opts = {} } = {}) {
  seed = s;
  const g = new Game(map, { rng: () => 0, waveRng: rng, aiRng: rng, ...opts });
  Object.assign(g.player, { x: px, y: py, prevX: px, prevY: py, yaw });
  const inp = new InputState();
  const ev = []; for (const t of ['infectedSpawn', 'infectedAlert', 'infectedLost', 'infectedReacquire', 'infectedGiveUp', 'infectedAttack', 'playerHurt', 'playerDied', 'infectedKilled', 'waveCleared', 'waveIntermission', 'victory', 'restart']) g.on(t, d => ev.push([t, d, g.tick]));
  if (waves) g.startWaves();
  const run = (sec, onStep) => { for (let i = 0; i < Math.round(sec * 60); i++) { g.step(inp.update(), 1 / 60); if (onStep && onStep() === false) break; } };
  return { g, inp, ev, run, count: t => ev.filter(e => e[0] === t).length };
}
const tp = (g, x, y) => Object.assign(g.player, { x, y, prevX: x, prevY: y });
const kill = (g, e) => { e.applyDamage(e.hp, 'body', { dir: { x: 1, y: 0, z: 0 } }); g.onInfectedKilled(e); };

// =================== A. Arena ===================
{
  const g = setup().g, w = g.world;
  const a15 = (training.grid[0].length - 2) * (training.grid.length - 2), a16 = (w.width - 2) * (w.height - 2);
  check('Arena interior area is exactly 2× M1.5 (14×14 → 28×14 cells; not 4×)', a16 === 2 * a15 && w.height === training.grid.length, `${a15} → ${a16} cells (${a16 * 4} m²)`);
  let same = true; for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) if (arena.grid[y][x] !== training.grid[y][x]) same = false;
  check('Left hall keeps the M1.5 layout and coordinates (same cells for x < 15)', same && arena.playerStart.x === training.playerStart.x && arena.playerStart.y === training.playerStart.y);
  let border = true; for (let x = 0; x < w.width; x++) if (!w.isSolidCell(x, 0) || !w.isSolidCell(x, w.height - 1)) border = false;
  for (let y = 0; y < w.height; y++) if (!w.isSolidCell(0, y) || !w.isSolidCell(w.width - 1, y)) border = false;
  check('Closed boundary: solid cells all around', border);
  // connectivity: every floor cell reachable from the player start (4-neighbour flood fill)
  const seen = new Set(), st = [[8, 8]]; let floor = 0;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) if (!w.isSolidCell(x, y)) floor++;
  while (st.length) { const [x, y] = st.pop(); const k = x + ',' + y; if (seen.has(k) || w.isSolidCell(x, y)) continue; seen.add(k); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  check('Every floor cell is reachable (no sealed pockets), incl. the new hall and side passages', seen.size === floor && seen.has('28,14') && seen.has('15,1') && seen.has('15,14'), `${seen.size}/${floor}`);
  // the player cannot leave the arena: push into every direction for 25 s each
  let out = false;
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, 2.4, -0.7, -2.4]) {
    const { g: g2, inp, run } = setup(); g2.player.yaw = yaw; inp.keyMove.y = 1;
    run(25, () => { const p = g2.player; if (!canStand(g2.world, p.x, p.y, PLAYER_RADIUS - 1e-3) || p.x < 1 || p.y < 1 || p.x > 29 || p.y > 15) { out = true; return false; } });
  }
  check('Player never leaves the arena or enters a wall (8 directions × 25 s)', !out);
  // shots stop at the new walls (partition at x = 15, rows 2–3) and at the far east wall
  const o = { x: 8, y: 2.5, z: 0.8 }, hit = resolveShot(w, [], o, { x: 1, y: 0, z: 0 }, 200);
  const far = resolveShot(w, [], { x: 8, y: 9.5, z: 0.8 }, { x: 1, y: 0, z: 0 }, 200);
  check('Weapon raycast uses the new geometry (partition blocks, open centre reaches the far wall)', hit.type === 'world' && Math.abs(hit.point.x - 15) < 1e-6 && far.type === 'world' && Math.abs(far.point.x - 29) < 1e-6, `${hit.point.x} / ${far.point.x}`);
}

// =================== B. Waves ===================
check('Config: 3 waves × 9 infected = 27, max 5 alive', WAVES.length === 3 && WAVES.every(w => w.enemies.reduce((s, e) => s + e.count, 0) === 9) && MATCH.maxActive === 5);
{
  const { g, run, ev, count } = setup({ waves: true });
  check('Match start: wave 1 of 3, 9 remaining, countdown running', g.state.wave.number === 1 && g.state.wave.of === 3 && g.state.wave.remaining === 9 && g.state.wave.total === 9 && g.state.wave.countdown > 0 && g.enemies.length === 0);
  // nobody is killed for 25 s → exactly 5 alive, 4 still waiting, HUD still counts all 9
  let maxAlive = 0; run(25, () => { maxAlive = Math.max(maxAlive, g.enemies.filter(e => e.alive).length); g.state.setHealth(100); });
  check('Never more than 5 alive: 5 on the field, 4 waiting, remaining still 9', maxAlive === 5 && g.waves.queue.length === 4 && g.state.wave.remaining === 9 && g.waves.spawned === 5, `max ${maxAlive}, waiting ${g.waves.queue.length}`);
  // spawn validity for everything spawned so far
  const sp = ev.filter(e => e[0] === 'infectedSpawn').map(e => e[1]);
  check('Spawns: on free floor', sp.every(s => canStand(g.world, s.x, s.y, SPAWN_RULES.clearance * M)));
  // free one slot → exactly one more appears, the rest keep waiting
  kill(g, g.enemies.find(e => e.alive)); run(MATCH.spawnInterval + 0.6, () => { g.state.setHealth(100); });
  check('A freed slot is refilled (6 spawned, 5 alive, 3 waiting, remaining 8)', g.waves.spawned === 6 && g.enemies.filter(e => e.alive).length === 5 && g.waves.queue.length === 3 && g.state.wave.remaining === 8);
  // kill everything as it comes; wave 2 must not start before the 9th kill
  let early = false, maxA = 0, spawnsDuringBreak = 0, sawCountdown = 0, hpAtBreak = null, reserveAtBreak = null, hpAfter = null;
  g.state.setAmmo(3, 17);
  const perWave = { 1: g.waves.spawned, 2: 0, 3: 0 }; g.on('infectedSpawn', () => { perWave[g.state.wave.number] = (perWave[g.state.wave.number] || 0) + 1; if (g.waves.phase === 'intermission') spawnsDuringBreak++; });
  let t = 0;
  run(240, () => {
    t += 1 / 60; const alive = g.enemies.filter(e => e.alive); maxA = Math.max(maxA, alive.length);
    if (g.state.wave.number === 2 && g.state.kills < 9) early = true;
    if (g.state.wave.number === 3 && g.state.kills < 18) early = true;
    if (g.waves.phase === 'intermission') { sawCountdown = Math.max(sawCountdown, g.state.wave.countdown); if (hpAtBreak === null) { g.state.setHealth(40); hpAtBreak = g.state.health.hp; reserveAtBreak = g.state.weapon.reserve; hpAfter = null; } }
    else if (hpAtBreak !== null && hpAfter === null && g.state.wave.number === 2) hpAfter = g.state.health.hp;
    else if (hpAfter !== null || hpAtBreak === null) g.state.setHealth(Math.max(g.state.health.hp, 60)); // keep the player alive outside the measured moment
    if (t > 0.7 && alive.length) { t = 0; kill(g, alive[0]); }
    if (g.matchOver) return false;
  });
  check('Each wave spawns exactly 9 infected', perWave[1] === 9 && perWave[2] === 9 && perWave[3] === 9, JSON.stringify(perWave));
  check('Next wave only after all 9 of the previous one are dead', !early);
  check('Intermission between waves: countdown shown, nothing spawns during it', sawCountdown >= Math.ceil(MATCH.intermission) - 1 && spawnsDuringBreak === 0 && count('waveIntermission') === 2, `countdown ${sawCountdown}`);
  check('Between waves: reserve ammo refilled, +30 HP, magazine untouched', reserveAtBreak === 17 && g.state.weapon.reserve === 120 && hpAtBreak === 40 && hpAfter === 70 && MATCH.healBetweenWaves === 30, `reserve ${reserveAtBreak}→${g.state.weapon.reserve}, hp ${hpAtBreak}→${hpAfter}`);
  check('Still never more than 5 alive in waves 2 and 3', maxA <= 5, `max ${maxA}`);
  check('After wave 3: victory once, 27 kills, phase victory, waveCleared ×3', g.matchOver && count('victory') === 1 && g.state.kills === 27 && g.state.wave.phase === 'victory' && count('waveCleared') === 3 && ev.find(e => e[0] === 'victory')[1].kills === 27, `kills ${g.state.kills}`);
  run(5);
  check('Nothing spawns after the victory', g.enemies.filter(e => e.alive).length === 0 && count('infectedSpawn') === 27);
  // restart
  g.restart();
  check('Restart: wave 1/3, 9 remaining, kills 0, HP 100, 30/120, no infected', g.state.wave.number === 1 && g.state.wave.remaining === 9 && g.state.kills === 0 && g.state.health.hp === 100 && g.state.weapon.mag === 30 && g.state.weapon.reserve === 120 && g.enemies.length === 0 && !g.matchOver);
  run(30, () => { g.state.setHealth(100); });
  check('After restart no extra infected: 5 alive, 5 spawned', g.enemies.filter(e => e.alive).length === 5 && g.waves.spawned === 5 && g.enemies.length === 5);
  g.restart({ waves: false }); run(10);
  check('Back to the menu (restart without waves): no infected, no wave running', g.enemies.length === 0 && g.waves.phase === 'idle');
}
{
  // restart in the middle of wave 2 and after the player's death
  const { g, run, count } = setup({ waves: true, s: 3 });
  let t = 0; run(120, () => { t += 1 / 60; g.state.setHealth(100); const a = g.enemies.filter(e => e.alive); if (t > 0.5 && a.length) { t = 0; kill(g, a[0]); } if (g.state.wave.number === 2 && g.waves.spawned >= 3) return false; });
  const mid = { wave: g.state.wave.number, n: g.enemies.length };
  g.restart(); run(0.5);
  check('Restart during wave 2 → back to wave 1, field cleared', mid.wave === 2 && mid.n > 0 && g.state.wave.number === 1 && g.enemies.length === 0 && g.state.kills === 0, JSON.stringify(mid));
  run(40, () => (g.player.dead ? false : undefined));
  check('Player can die in a wave (playerDied once)', g.player.dead && count('playerDied') === 1 && g.state.health.hp === 0);
  const sw = g.enemies.reduce((s, e) => s + e.swings, 0); run(4);
  check('No attacks on a dead player', g.enemies.reduce((s, e) => s + e.swings, 0) === sw);
  g.restart(); run(1);
  check('Restart after death: alive, HP 100, wave 1 again', !g.player.dead && g.state.health.hp === 100 && g.state.wave.number === 1 && g.enemies.length === 0);
}
{
  // spawn rules under many player positions
  const { g } = setup(); let bad = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const x = 1.5 + rng() * 27, y = 1.5 + rng() * 13; if (!canStand(g.world, x, y, PLAYER_RADIUS)) continue;
    tp(g, x, y); g.player.yaw = rng() * 6.28;
    const pt = g.waves.pickSpawn(); if (!pt) { bad++; continue; } n++;
    const dx = pt.x - x, dy = pt.y - y, d = Math.hypot(dx, dy);
    const inFace = d < SPAWN_RULES.faceDist * M && (dx * Math.cos(g.player.yaw) + dy * Math.sin(g.player.yaw)) / d > Math.cos(SPAWN_RULES.faceConeDeg * Math.PI / 180) + 1e-9;
    if (!canStand(g.world, pt.x, pt.y, SPAWN_RULES.clearance * M) || d < SPAWN_RULES.minPlayerDist * M - 1e-9 || inFace) bad++;
  }
  check('Spawn points (≈300 random player positions): free floor, ≥ 9 m away, never in front of the face', bad === 0 && n > 200, `${n} ok, ${bad} bad`);
}

// =================== C. AI 2.0 ===================
{
  // 1–3: loses sight → remembers the last position → searches there → gives up
  const { g, run, ev, count } = setup({ px: 10.5, py: 8.5 });
  const e = g.spawnInfected('hollow', 4.5, 8.5, 0);
  run(1.2);
  check('Sees the player → CHASE', e.state === 'CHASE' && e.canSee);
  // the player gets out of sight: 20 m away (beyond the 15 m detection range), the infected is put back at the west wall
  tp(g, 13.5, 8.5); Object.assign(e, { x: 1.5, y: 8.5, prevX: 1.5, prevY: 8.5 }); e.canSee = false; e.senseT = 0;
  run(0.5);
  check('Within memoryTime it still chases (no instant forgetting)', e.state === 'CHASE' && !e.canSee && e.seenAgo > 0 && e.seenAgo <= H.memoryTime);
  run(H.memoryTime);
  const known = { ...e.lastSeen };
  check('After memoryTime without sight → SEARCH at the last known position (event infectedLost)', e.state === 'SEARCH' && count('infectedLost') === 1 && Math.hypot(known.x - 13.5, known.y - 8.5) < 0.3, `${e.state} (${known.x.toFixed(2)}, ${known.y.toFixed(2)})`);
  tp(g, 27.5, 13.5); // the player slips away to the far corner of the new hall
  let reached = false, towardsPlayer = false, inWall = 0; const visited = new Set(); let maxFromKnown = 0;
  const note = () => { visited.add(Math.round(e.goal.x * 2) + ',' + Math.round(e.goal.y * 2)); maxFromKnown = Math.max(maxFromKnown, Math.hypot(e.goal.x - known.x, e.goal.y - known.y)); };
  run(8, () => { note(); if (Math.hypot(e.x - known.x, e.y - known.y) < 0.6) reached = true; if (!canStand(g.world, e.x, e.y, e.k.r * 0.98)) inWall++; if (e.state === 'CHASE') towardsPlayer = true; });
  check('Goes to the LAST KNOWN position, not to where the player really is now', reached && !towardsPlayer && Math.hypot(e.lastSeen.x - known.x, e.lastSeen.y - known.y) < 1e-9, `reached ${reached}`);
  run(H.searchTime + 12, () => { note(); if (!canStand(g.world, e.x, e.y, e.k.r * 0.98)) inWall++; if (e.state === 'IDLE') return false; });
  check('Searches a few points around it (within searchRadius), then gives up → IDLE', e.state === 'IDLE' && visited.size >= 2 && maxFromKnown <= H.searchRadius * M + 0.8 && count('infectedGiveUp') === 1, `${visited.size} goals, max ${(maxFromKnown * 2).toFixed(1)} m`);
  check('Never inside a wall while searching', inWall === 0);
  run(10);
  check('Does not know where the player is afterwards (stays IDLE, far from him)', e.state === 'IDLE' && Math.hypot(e.x - 27.5, e.y - 13.5) > 8);
}
{
  // 4: re-detection during the search
  const { g, run, count } = setup({ px: 9.2, py: 5.6 });
  const e = g.spawnInfected('hollow', 4.5, 5.6, 0); e.applyDamage(0, 'body', null);
  run(H.alertTime + H.memoryTime + 0.3);
  const wasSearch = e.state === 'SEARCH';
  let re = false; run(8, () => { if (e.state === 'CHASE' && e.canSee) { re = true; return false; } });
  check('Sight restored during SEARCH → CHASE again (infectedReacquire)', wasSearch && re && count('infectedReacquire') >= 1);
}
{
  // hearing + no omniscience
  const { g, inp, run } = setup({ px: 12.5, py: 8.5 });
  const near = g.spawnInfected('hollow', 4.5, 5.6, 0);          // 16.3 m, behind the pillar line? ensure no LOS: place behind red block
  Object.assign(near, { x: 4.5, y: 2.2, prevX: 4.5, prevY: 2.2 }); // behind the red block (4,3) seen from (12.5, 8.5)? use LOS check
  const far = g.spawnInfected('hollow', 27.5, 1.5, 0);          // 30+ m away: out of hearing
  near.senseT = far.senseT = 0;
  tp(g, 9.5, 13.5); // far from 'near' (≈ 24.6 m) → move closer but out of sight: behind the pillar
  tp(g, 9.2, 5.6); Object.assign(near, { x: 4.5, y: 5.6, prevX: 4.5, prevY: 5.6 });
  run(3);
  check('No line of sight, no noise → stays IDLE (does not sense the player through walls)', near.state === 'IDLE' && far.state === 'IDLE');
  inp.setAction('fire', true); run(0.1); inp.setAction('fire', false);
  check('Gunfire within hearRange → runs to where the shot came from (SEARCH)', near.state === 'SEARCH' && Math.hypot(near.goal.x - 9.2, near.goal.y - 5.6) < 0.8, near.state);
  check('Out of hearing range → still IDLE', far.state === 'IDLE' && Math.hypot(far.x - 9.2, far.y - 5.6) * 2 > H.hearRange);
}
{
  // 5: navigation across the big arena; wave hunters patrol after a failed search
  const { g, run } = setup({ px: 3.5, py: 13.5 });
  const e = g.spawnInfected('hollow', 27.5, 1.5, 0, { hunter: true });
  e.startSearch(g.aiCtx, 3.5, 13.5);
  tp(g, 1.5, 6.5); g.player.yaw = 0; // player left (out of sight); the infected must cross both halls to the old spot
  let inWall = 0, arrived = false, builds0 = e.nav.builds;
  run(40, () => { if (e.x < 14 && g.player.x < 5) tp(g, 27.5, 1.5); /* slips behind it once it has passed */ if (!canStand(g.world, e.x, e.y, e.k.r * 0.98)) inWall++; if (Math.hypot(e.x - 3.5, e.y - 13.5) < 0.7) { arrived = true; return false; } if (e.state === 'CHASE') return false; });
  check('Crosses the whole arena round partitions and blocks to a point 50 m away', arrived && inWall === 0, `at (${e.x.toFixed(1)}, ${e.y.toFixed(1)}) ${e.state}`);
  check('Path is not recomputed every frame (own field rebuilt only when the goal changes)', e.nav.builds - builds0 <= 1, `${e.nav.builds - builds0} rebuilds on the way`);
  let patrol = false; run(40, () => { if (e.state === 'PATROL') { patrol = true; return false; } if (e.state === 'CHASE' || e.state === 'ALERT') return false; });
  check('Hunter that found nothing → PATROL (roams, does not stand forever)', patrol, e.state);
  const p0 = { x: e.x, y: e.y }; let moved = 0; run(12, () => { moved = Math.max(moved, Math.hypot(e.x - p0.x, e.y - p0.y)); });
  check('Patrol really moves', moved > 1 || e.state !== 'PATROL', `${(moved * 2).toFixed(1)} m`);
}
{
  // 6–8: attack timer, single damage, nothing after death (new arena)
  const { g, run, ev } = setup({ px: 20, py: 5 });
  const e = g.spawnInfected('hollow', 20.6, 5, Math.PI);
  run(5);
  const hurts = ev.filter(x => x[0] === 'playerHurt'), gaps = hurts.slice(1).map((h, i) => (h[2] - hurts[i][2]) / 60);
  const sw = ev.find(x => x[0] === 'infectedAttack');
  check('Attack: blow lands 0.36 s into the swing, 15 HP, once per swing, ≥ 1.2 s apart', hurts.length >= 2 && hurts.every(h => h[1].damage === 15) && e.blows === hurts.length && e.blows <= e.swings && gaps.every(t => t >= H.attackCooldown - 1e-6) && Math.abs((hurts[0][2] - sw[2]) / 60 - H.attackDuration * H.attackHitAt) < 0.03, `blows ${e.blows}/${e.swings}, gaps ${gaps.map(t => t.toFixed(2))}`);
  const hp = g.state.health.hp; kill(g, e); run(3);
  check('No damage after its death; kill counted once', g.state.health.hp === hp && g.state.kills === 1 && e.state === 'DEAD');
}
{
  const r = WEAPONS.raven;
  check('9: RAVEN unchanged — head 50 / body 25, 600 RPM, 30/120, reload 1.3 s', r.damage.head === 50 && r.damage.body === 25 && r.rpm === 600 && r.magSize === 30 && r.reserve === 120 && r.reloadTime === 1.3);
  check('Infected collider and balance unchanged (radius 0.3 m, 100 HP, 15 dmg, 1.5 m, 1.2 s)', H.radius === 0.3 && H.hp === 100 && H.attackDamage === 15 && H.attackRange === 1.5 && H.attackCooldown === 1.2 && H.detectRange === 15 && H.runSpeed === 4.2);
}

// =================== D. Animated hit zones ===================
{
  const { g, run } = setup({ px: 3, py: 8 });
  const shotAt = (e, hb, dz = 0) => { // ray from the player's eye to a hit-zone centre (+dz cells)
    const o = { x: g.player.x, y: g.player.y, z: 0.8 }, tz = (hb.cz ?? (hb.z0 + hb.z1) / 2) + dz, dx = hb.cx - o.x, dy = hb.cy - o.y, dzz = tz - o.z, l = Math.hypot(dx, dy, dzz);
    return resolveShot(g.world, [e], o, { x: dx / l, y: dy / l, z: dzz / l }, 200);
  };
  const e = g.spawnInfected('hollow', 9, 8, Math.PI); e.senseT = 1e9; run(0.5);
  const idle = { f: e.pose.headF, u: e.pose.headU, hips: e.pose.hipsY };
  check('Idle: head zone at the hunched head (≈ 0.2–0.4 m forward, ≈ 1.5–1.7 m up)', idle.f > 0.18 && idle.f < 0.42 && idle.u > 1.5 && idle.u < 1.72, `fwd ${idle.f.toFixed(2)} m, up ${idle.u.toFixed(2)} m`);
  check('Head shot → head; chest and legs → body; above the head → miss', shotAt(e, e.hitboxes()[0]).zone === 'head' && shotAt(e, e.hitboxes()[1]).zone === 'body' && shotAt(e, e.hitboxes()[3]).zone === 'body' && shotAt(e, e.hitboxes()[0], 0.14).type !== 'entity');
  // 13: walking / running — the zones lean and bob with the body
  const r = g.spawnInfected('hollow', 20, 9, Math.PI); r.applyDamage(0, 'body', null); tp(g, 3, 9);
  let run1 = null; run(4, () => { if (r.state === 'CHASE' && r.speed > r.k.run * 0.97) { run1 = { f: r.pose.headF, u: r.pose.headU }; return false; } });
  check('Running: head zone moves forward and down with the lean (vs idle)', run1 && run1.f > idle.f + 0.12 && run1.u < idle.u - 0.1, run1 && `fwd ${idle.f.toFixed(2)}→${run1.f.toFixed(2)}, up ${idle.u.toFixed(2)}→${run1.u.toFixed(2)}`);
  const hbR = r.hitboxes()[0], along = (hbR.cx - r.x) * Math.cos(r.facing) + (hbR.cy - r.y) * Math.sin(r.facing);
  check('Head zone is placed along the facing direction, at the pose height (running)', Math.abs(along * 2 - r.pose.headF) < 1e-6 && Math.abs(hbR.cz * 2 - r.pose.headU) < 1e-6 && shotAt(r, hbR).zone === 'head');
  // the M1.5 fixed head spot (1.6 m up, 0.17 m forward) is now empty air above the running infected's back
  const old = { cx: r.x + Math.cos(r.facing) * 0.17 * M, cy: r.y + Math.sin(r.facing) * 0.17 * M, cz: 1.6 * M };
  // seen from the side (2 cells to its right), where the forward lean matters
  const so = { x: r.x - Math.sin(r.facing) * 2, y: r.y + Math.cos(r.facing) * 2, z: 0.8 }, sd = { x: old.cx - so.x, y: old.cy - so.y, z: old.cz - so.z }, sl = Math.hypot(sd.x, sd.y, sd.z);
  const oldShot = resolveShot(g.world, [r], so, { x: sd.x / sl, y: sd.y / sl, z: sd.z / sl }, 200);
  check('M1.5 defect fixed: a shot at the old static head spot no longer scores a headshot on a running infected', oldShot.type !== 'entity' || oldShot.zone !== 'head', oldShot.type + ' ' + (oldShot.zone || ''));
  // 14–15: attack lunge
  const a = g.spawnInfected('hollow', 3.6, 8, Math.PI); tp(g, 3, 8);
  let strike = null, wind = null; run(3, () => { if (a.state === 'ATTACK') { const f = a.attackT / H.attackDuration; if (f > 0.15 && f < 0.25 && !wind) wind = { f: a.pose.headF }; if (f >= H.attackHitAt + 0.08 && !strike) { strike = { f: a.pose.headF, u: a.pose.headU }; return false; } } g.state.setHealth(100); });
  check('Attack: the head zone follows the lunge (forward and down at the strike vs wind-up)', strike && wind && strike.f > wind.f + 0.12, strike && `wind-up ${wind.f.toFixed(2)} → strike ${strike.f.toFixed(2)} m`);
  tp(g, 3, 5); // step aside and shoot the lunging head from the side: the zone is where the head is drawn
  const sideShot = shotAt(a, a.hitboxes()[0]);
  check('Shot at the leaning head during the attack → head', sideShot.type === 'entity' && sideShot.zone === 'head');
  // hit reaction: a frontal headshot snaps the head back, then it returns
  const h = g.spawnInfected('hollow', 9, 3, Math.PI); h.senseT = 1e9; run(0.3); const f0 = h.pose.headF;
  h.applyDamage(0, 'head', { dir: { x: 1, y: 0, z: 0 } }); h.pain = false; run(0.08); const f1 = h.pose.headF; run(0.6);
  check('Headshot from the front: head zone recoils backwards, then returns (0.35 s)', f1 < f0 - 0.04 && Math.abs(h.pose.headF - f0) < 0.05, `${f0.toFixed(2)} → ${f1.toFixed(2)} → ${h.pose.headF.toFixed(2)} m`);
  // determinism / frame-rate independence of the pose: same sim steps → same pose
  const P = () => { const s = setup({ px: 3, py: 8 }); const x = s.g.spawnInfected('hollow', 12, 8, Math.PI); s.run(2.5); return [x.pose.phase, x.pose.headF, x.pose.hipsY, x.x]; };
  const p1 = P(), p2 = P();
  check('Pose is computed in the fixed-step sim → deterministic, independent of the render frame rate', p1.every((v, i) => v === p2[i]));
}

// =================== E. Death next to walls ===================
{
  const tiny = { id: 'closet', name: 'closet', grid: ['111', '101', '111'], legend: { 1: 'concrete' }, playerStart: { x: 1.5, y: 1.5, yaw: 0 }, lamps: [] };
  const fallOf = (map, x, y, facing, dir, px = 8, py = 8) => { const s = setup({ map, px, py }); const e = s.g.spawnInfected('hollow', x, y, facing); e.senseT = 1e9; e.applyDamage(100, 'body', { dir }); s.g.onInfectedKilled(e); s.run(1.0); return { e, g: s.g, run: s.run }; };
  const free = (g, e) => { const L = H.fallLength * M, a = e.fall.angle; let ok = true; for (let t = 0; t <= 1; t += 0.1) if (!canStand(g.world, e.x + Math.cos(a) * L * t, e.y + Math.sin(a) * L * t, H.fallHalfWidth * M)) ok = false; return ok; };
  const open = fallOf(arena, 8.5, 9.5, Math.PI, { x: -1, y: 0, z: 0 }, 12, 9.5); // shot from the front (bullet travels −x = backwards for it? facing π → forward is −x)
  const openB = fallOf(arena, 8.5, 9.5, 0, { x: -1, y: 0, z: 0 }, 12, 9.5);       // facing +x, bullet −x → from the front → falls on its back
  check('Open floor, shot from the front → falls on its back, away from the shooter', openB.e.fall.kind === 'back' && Math.abs(Math.cos(openB.e.fall.angle - Math.PI)) > 0.99 && free(openB.g, openB.e));
  check('Open floor, shot from behind → falls forward on its face', open.e.fall.kind === 'front' && free(open.g, open.e));
  // 17: back against the west wall (x = 1), shot from the front: the body cannot fall into the wall
  const wall = fallOf(arena, 1.4, 9.5, 0, { x: -1, y: 0, z: 0 }, 6, 9.5);
  check('Back against a wall: falls into free space (turns), not into the wall', wall.e.fall.kind !== 'crumple' && free(wall.g, wall.e) && Math.cos(wall.e.fall.angle - Math.PI) < 0.5, `${wall.e.fall.kind}, ${(wall.e.fall.angle * 57.3).toFixed(0)}°`);
  check('…and the body twists to match the fall direction', Math.abs(Math.atan2(Math.sin(wall.e.facing - wall.e.fall.facing), Math.cos(wall.e.facing - wall.e.fall.facing))) < 0.05);
  // 18: corner (north-west), shot diagonally into the corner
  const corner = fallOf(arena, 1.4, 1.4, Math.PI / 4, { x: -0.7, y: -0.7, z: 0 }, 5, 5);
  check('In a corner: a free direction is found', corner.e.fall.kind !== 'crumple' && free(corner.g, corner.e), `${corner.e.fall.kind}, ${(corner.e.fall.angle * 57.3).toFixed(0)}°`);
  // next to an obstacle (the pillar, cell 7,5): shot towards it
  const obst = fallOf(arena, 6.6, 5.5, Math.PI, { x: 1, y: 0, z: 0 }, 2, 5.5);
  check('Next to an obstacle: falls clear of it', free(obst.g, obst.e), `${obst.e.fall.kind}, ${(obst.e.fall.angle * 57.3).toFixed(0)}°`);
  const closet = fallOf(tiny, 1.5, 1.5, 0, { x: 1, y: 0, z: 0 }, 1.5, 1.5);
  check('Nowhere to fall (1-cell closet) → crumples in place', closet.e.fall.kind === 'crumple');
  wall.run(H.corpseTime);
  check('Corpse leaves the sim after corpseTime (resources freed)', wall.g.enemies.length === 0 && wall.g.hittables.length === 0);
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
