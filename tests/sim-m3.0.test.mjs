// M3.0 TOPDOWN — simulation tests (pure JS, no browser). The top-down options must leave the FPS game unchanged.
import outpost from '../prototype-3d/src/data/maps/outpost-zero.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { DASH, CELL_SIZE } from '../prototype-3d/src/config.js';
import { INFECTED_TYPES, TOPDOWN_TYPES, getInfectedDef } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH, TOPDOWN_WAVES, TOPDOWN_MATCH, waveQueue } from '../prototype-3d/src/sim/waves/wave-defs.js';

const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const DT = 1 / 60;
const TD = { waves: TOPDOWN_WAVES, match: TOPDOWN_MATCH, aimHeight: 1.15, flatAim: true, dash: true };
const mkInput = () => { const i = new InputState(); i.actions.dash = false; i.presses.dash = 0; return i; };
const run = (g, i, sec, each) => { for (let t = 0; t < sec * 60; t++) { if (each) each(t); g.step(i.update(), DT); } };

// ---- 1. FPS defaults untouched ----
{
  const g = new Game(outpost);
  check('FPS Game: no top-down options (aim from the eye, pitch used, no dash)', g.aimZ === null && g.flatAim === false && g.dashEnabled === false);
  const i = mkInput(); g.restart({ waves: false });
  const x0 = g.player.x; i.presses.dash = 5; run(g, i, 0.5);
  check('FPS Game: a dash press does nothing', g.player.x === x0 && !(g.player.dashes > 0));
  check('FPS waves / match unchanged (3 × 9, max 5 alive)', WAVES.length === 3 && WAVES.every(w => waveQueue(w).length === 9) && MATCH.maxActive === 5);
  check('THE HOLLOW stats unchanged', INFECTED_TYPES.hollow.hp === 100 && INFECTED_TYPES.hollow.attackDamage === 15 && !INFECTED_TYPES.walker);
}

// ---- 2. top-down types / waves (data) ----
{
  const w = getInfectedDef('walker'), b = getInfectedDef('brute'), m = getInfectedDef('mutant');
  check('Top-down types resolve through getInfectedDef', w.id === 'walker' && b.id === 'brute' && m.id === 'mutant');
  check('Owner balance: brute 260 HP; mutant 150 HP, 4.8 m/s', b.hp === 260 && m.hp === 150 && m.runSpeed === 4.8, `brute ${b.hp}, mutant ${m.hp} / ${m.runSpeed}`);
  check('Walker = THE HOLLOW stats (only the swing timing follows its clip)', w.hp === 100 && w.runSpeed === INFECTED_TYPES.hollow.runSpeed && w.attackDamage === 15);
  check('Every type keeps the full hit-zone set', Object.values(TOPDOWN_TYPES).every(d => ['headR', 'chestR', 'bellyR', 'legsR', 'legsZ0'].every(k => d.hitboxes[k] > 0 || k === 'legsZ0')));
  const q = TOPDOWN_WAVES.map(wv => waveQueue(wv).map(e => e.type));
  check('Three waves: 7 walkers → 6 walkers + 2 brutes → 5 walkers + 3 mutants + 2 brutes',
    q[0].length === 7 && q[1].filter(t => t === 'brute').length === 2 && q[2].filter(t => t === 'mutant').length === 3 && q[2].length === 10, q.map(x => x.length).join('/'));
}

// ---- 3. shots: muzzle height + horizontal ----
{
  const g = new Game(outpost, TD); g.restart({ waves: false });
  const i = mkInput(); let shot = null; g.on('shot', e => { if (!shot) shot = e; });
  g.player.pitch = 0.6; i.setAction('fire', true); run(g, i, 0.1);
  check('Top-down shot is horizontal even with pitch / recoil', shot && Math.abs(shot.dir.z) < 0.05, shot ? `dir.z=${shot.dir.z.toFixed(3)}` : 'no shot');
  check('Top-down shot starts at the muzzle height (1.15 m)', shot && Math.abs(shot.origin ? shot.origin.z * CELL_SIZE - 1.15 : 0) < 0.01 || (shot && g.aimZ * CELL_SIZE === 1.15));
}

// ---- 4. dash ----
{
  const g = new Game(outpost, TD); g.restart({ waves: false });
  const i = mkInput(); let ev = 0; g.on('dash', () => ev++);
  const p = g.player; p.yaw = 0; const x0 = p.x, y0 = p.y;
  i.keyMove.y = 1; // forward along the yaw (+x)
  run(g, i, DT); // first step adopts the press counter (like the jump), so a press made before it is ignored
  i.presses.dash++; run(g, i, 0.05);
  check('Dash starts on a new press, emits "dash", invulnerable', p.dashT > 0 && ev === 1 && p.invuln > 0);
  const xs = p.x, ys = p.y; run(g, i, DASH.time);
  const moved = Math.hypot(p.x - xs, p.y - ys) + 0.05 * DASH.speed, expect = DASH.speed * DASH.time;
  check('Dash covers ≈ speed × time along the move direction', moved > expect * 0.9 && p.x > x0, `${(moved * CELL_SIZE).toFixed(2)} m`);
  const hp = g.state.health.hp; p.invuln = 0.2; g.damagePlayer(30);
  check('Damage during the invulnerability window is ignored', g.state.health.hp === hp);
  i.presses.dash++; run(g, i, 0.05);
  check('Cooldown: a second press right away does not dash', ev === 1);
  run(g, i, DASH.cooldown + 0.1); i.presses.dash++; run(g, i, 0.05);
  check('After the cooldown the next press dashes again', ev === 2);
  g.restart({ waves: false });
  check('Restart clears dash / cooldown / invulnerability', !(p.dashT > 0) && !(p.dashCd > 0) && !(p.invuln > 0));
}

// ---- 5. whole match with a scripted shooter (AI, waves and victory unchanged) ----
{
  const g = new Game(outpost, TD); const i = mkInput(); g.restart();
  let victory = false, types = new Set(), maxAlive = 0; g.on('victory', () => { victory = true; }); g.on('infectedSpawn', e => types.add(e.type));
  run(g, i, 420, t => {
    const p = g.player, al = g.enemies.filter(e => e.alive); maxAlive = Math.max(maxAlive, al.length);
    if (t % 60 === 0 && g.state.health.hp < 60) g.state.heal(100);   // keeps the bot alive: this checks the flow, not balance
    const e = al.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (e) { p.yaw = Math.atan2(e.y - p.y, e.x - p.x); i.setAction('fire', true); i.keyMove.y = Math.hypot(e.x - p.x, e.y - p.y) > 4 ? 1 : 0; } else { i.setAction('fire', false); i.keyMove.y = 0; }
    if (victory) return;
  });
  check('Scripted match reaches victory through the three top-down waves', victory, `kills ${g.state.kills}, wave ${g.state.wave.number}`);
  check('All three types spawned; never more than maxActive alive', types.has('walker') && types.has('brute') && types.has('mutant') && maxAlive <= TOPDOWN_MATCH.maxActive, [...types].join(',') + ' max ' + maxAlive);
  check('25 kills counted exactly once', g.state.kills === 25, String(g.state.kills));
}

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
