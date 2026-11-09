// Pure simulation tests for the Three.js prototype (no browser, no three.js): node tests/sim-m0.test.mjs
import map from '../prototype-3d/src/data/maps/training.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { canStand } from '../prototype-3d/src/sim/collision.js';
import { PLAYER_RADIUS, PLAYER_SPEED, SIM_HZ } from '../prototype-3d/src/config.js';

const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const DT = 1 / SIM_HZ;
const run = (g, move, seconds) => { for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) g.step({ move }, DT); };
const fresh = (x, y, yaw) => { const g = new Game(map); Object.assign(g.player, { x, y, yaw, prevX: x, prevY: y }); return g; };

// Map identical to BUILD 1.3
check('Map is 16×16 with 66 solid cells', map.grid.length === 16 && map.grid.every(r => r.length === 16) && new Game(map).world.solidCells().length === 66);

// Directions follow yaw (the BUILD 1.2 bug must not come back)
for (const [yaw, mv, axis, sign, label] of [
  [0, { x: 1, y: 0 }, 'y', 1, 'strafe right @yaw 0 → +y'], [0, { x: -1, y: 0 }, 'y', -1, 'strafe left @yaw 0 → −y'],
  [0, { x: 0, y: 1 }, 'x', 1, 'forward @yaw 0 → +x'], [Math.PI / 2, { x: 1, y: 0 }, 'x', -1, 'strafe right @yaw 90° → −x'],
  [Math.PI, { x: 0, y: 1 }, 'x', -1, 'forward @yaw 180° → −x'],
]) {
  for (const y0 of [3.5, 8, 11]) {
    const g = fresh(8, y0, yaw); run(g, mv, 0.3);
    const d = { x: g.player.x - 8, y: g.player.y - y0 }, other = axis === 'x' ? d.y : d.x;
    check(`${label} (start y=${y0})`, Math.sign(d[axis]) === sign && Math.abs(d[axis]) > 0.5 && Math.abs(other) < 1e-6, `dx=${d.x.toFixed(3)} dy=${d.y.toFixed(3)}`);
  }
}

// Speed identical to 1.3
{ const g = fresh(4, 8, 0); run(g, { x: 0, y: 1 }, 1); check('Speed = 2.75 cells/s (5.5 m/s)', Math.abs(g.player.x - 4 - PLAYER_SPEED) < 0.02, `${(g.player.x - 4).toFixed(3)} cells`); }
// Diagonal input is normalised
{ const g = fresh(5, 8, 0); run(g, { x: 1, y: 1 }, 1); const d = Math.hypot(g.player.x - 5, g.player.y - 8); check('Diagonal not faster than straight', d <= PLAYER_SPEED + 0.02, d.toFixed(3)); }

// Collisions
{ const g = fresh(13, 8, 0); run(g, { x: 0, y: 1 }, 2); check('Stops at east wall', g.player.x <= 15 - PLAYER_RADIUS + 1e-9 && g.player.x > 15 - PLAYER_RADIUS - PLAYER_SPEED * DT, g.player.x.toFixed(4)); }
{ const g = fresh(14.7, 8, 0.45); run(g, { x: 0, y: 1 }, 1); check('Slides along wall', g.player.y - 8 > 0.9 && g.player.x <= 15 - PLAYER_RADIUS + 1e-9, `x=${g.player.x.toFixed(3)} y=${g.player.y.toFixed(3)}`); }
{ const g = fresh(5, 5.5, 0); run(g, { x: 0, y: 1 }, 1.5); check('Pillar blocks', g.player.x <= 7 - PLAYER_RADIUS + 1e-9 && g.player.x > 6.6, g.player.x.toFixed(3)); const y = g.player.y; run(g, { x: 1, y: 0 }, 1); check('Strafe along pillar face', g.player.y - y > 2, `${y.toFixed(2)}→${g.player.y.toFixed(2)}`); }
{ const g = fresh(13, 13, Math.PI / 4); run(g, { x: 0, y: 1 }, 2); check('Corner: valid position', canStand(g.world, g.player.x, g.player.y, PLAYER_RADIUS - 1e-6), `(${g.player.x.toFixed(3)}, ${g.player.y.toFixed(3)})`); }
{ // fuzz with a deterministic RNG
  let s = 12345; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = fresh(8, 8, 0); let bad = 0;
  for (let i = 0; i < 5000; i++) {
    g.player.yaw = r() * Math.PI * 2;
    g.step({ move: { x: r() * 2 - 1, y: r() * 2 - 1 } }, DT * (1 + r() * 2));
    if (!canStand(g.world, g.player.x, g.player.y, PLAYER_RADIUS - 1e-6)) bad++;
  }
  check('Fuzz 5000 random steps: never inside walls', bad === 0, `invalid=${bad}`);
}
// Look clamp
{ const g = fresh(8, 8, 0); g.look(0, 10); check('Pitch clamped', g.player.pitch <= 1.4 + 1e-9); g.look(-0.5, 0); check('Yaw wrapped to [0, 2π)', g.player.yaw >= 0 && g.player.yaw < Math.PI * 2); }
// Snapshot is plain data
{ const g = fresh(8, 8, 0); run(g, { x: 0, y: 1 }, 0.5); const s = JSON.parse(JSON.stringify(g.snapshot())); check('Snapshot serialisable', s.tick === 30 && typeof s.player.x === 'number'); }

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
