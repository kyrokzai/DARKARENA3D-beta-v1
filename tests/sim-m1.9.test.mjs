// M1.9 FIRST-PERSON COMBAT POLISH — pure-logic tests (no browser): node tests/sim-m1.9.test.mjs
// Ammo (30-round magazine), the rifle-butt melee (data, timing, cooldown, mutual exclusion with shooting / reload / ADS,
// range / arc, damage, stagger, knockback, swing interruption, kill, all three variants, pause, restart, death),
// "not a win button" balance, and the melee button in the touch HUD layout.
import outpost from '../prototype-3d/src/data/maps/outpost-zero.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { WEAPONS } from '../prototype-3d/src/sim/weapons/defs.js';
import { INFECTED_TYPES, OUTPOST_VARIANTS } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH } from '../prototype-3d/src/sim/waves/wave-defs.js';
import { canStand } from '../prototype-3d/src/sim/collision.js';
import { HUD_ELEMENTS, DEFAULT_LAYOUTS, computeRects, findOverlaps, inBounds, MIN_TOUCH, cloneDefaultLayout, sanitizeLayouts } from '../prototype-3d/src/ui/hud-layout.js';
import { DEFAULT_SETTINGS } from '../prototype-3d/src/config.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const R = WEAPONS.raven, ML = R.melee, H = INFECTED_TYPES.hollow, M = 0.5, DT = 1 / 60;
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function setup({ px = 8, py = 8, yaw = 0, s = 7 } = {}) {
  seed = s;
  const g = new Game(outpost, { rng: () => 0.5, waveRng: rng, aiRng: rng });
  Object.assign(g.player, { x: px, y: py, prevX: px, prevY: py, yaw });
  const inp = new InputState();
  const ev = []; for (const t of ['meleeStart', 'meleeHit', 'meleeMiss', 'fire', 'playerHurt', 'infectedKilled', 'hit', 'reloadStart', 'reloadEnd', 'melee']) g.on(t, d => ev.push([t, d, g.tick]));
  const step = (n = 1, each) => { for (let i = 0; i < n; i++) { g.step(inp.update(), DT); if (each) each(i); } };
  const press = () => { inp.setAction('melee', true); inp.setAction('melee', false); };
  const count = t => ev.filter(e => e[0] === t).length;
  return { g, inp, ev, step, press, count };
}
/** An infected `dist` metres (centre to centre) in front of the player, at `angDeg` from the view direction, frozen senses. */
function place(g, dist, angDeg = 0, variant = 'guard', facePlayer = true) {
  const p = g.player, a = p.yaw + angDeg * Math.PI / 180;
  const x = p.x + Math.cos(a) * dist * M, y = p.y + Math.sin(a) * dist * M;
  const e = g.spawnInfected('hollow', x, y, facePlayer ? a + Math.PI : 0, { variant }); e.senseT = 1e9;
  return e;
}

// ============ 1. Ammo: 30-round magazine ============
{
  const { g, inp, step, count } = setup();
  check('1. RAVEN magazine = 30, reserve 120 (data in defs.js), GameState starts 30 / 120', R.magSize === 30 && R.reserve === 120 && g.state.weapon.magSize === 30 && g.state.weapon.mag === 30 && g.state.weapon.reserve === 120);
  inp.setAction('fire', true); step(1); inp.setAction('fire', false); step(10);
  check('2. One shot uses one round (29 / 120)', g.state.weapon.mag === 29 && count('fire') === 1);
  inp.setAction('fire', true); step(Math.round(3.5 * 60)); inp.setAction('fire', false); step(2);
  check('3. Full auto empties the magazine after exactly 30 rounds (no 31st shot), then the empty mag starts an auto-reload', count('fire') === 30 && g.state.weapon.mag <= 30 && count('reloadStart') === 1, `shots ${count('fire')}`);
  step(Math.round((R.reloadTime + 0.1) * 60));
  check('4. Reload refills to 30 and moves the rounds from the reserve (30 / 90)', g.state.weapon.mag === 30 && g.state.weapon.reserve === 90 && count('reloadEnd') === 1);
  g.state.setAmmo(12, 5); g.weapon.startReload(); step(Math.round((R.reloadTime + 0.1) * 60));
  check('5. Partial reserve: 12 + 5 → 17 / 0, never above 30', g.state.weapon.mag === 17 && g.state.weapon.reserve === 0);
  // ammo budget per wave (reserve refilled at waves 2 and 3): rounds ≥ 2 × the body shots needed for 9 infected
  const perWave = R.magSize + R.reserve, needed = 9 * Math.ceil(H.hp / R.damage.body);
  check('6. Ammo is enough for the three waves: 150 rounds per wave (resupply on) vs 36 body hits for 9 infected (×4 margin)', MATCH.resupplyReserve === true && perWave >= needed * 4, `${perWave} vs ${needed}`);
}

// ============ 2. Melee data ============
{
  const keys = ['damage', 'range', 'arcDeg', 'duration', 'hitAt', 'cooldown', 'stagger', 'knockback', 'reactPower', 'reactTime'];
  check('7. Melee is data: every parameter in RAVEN defs.melee, finite and positive', !!ML && keys.every(k => Number.isFinite(ML[k]) && ML[k] > 0) && typeof ML.interruptAttack === 'boolean' && Object.isFrozen(ML));
  const blows = Math.ceil(H.hp / ML.damage), cycle = ML.duration + ML.cooldown;
  const meleeKill = (blows - 1) * cycle + ML.duration * ML.hitAt, gunKill = (Math.ceil(H.hp / R.damage.body) - 1) * 60 / R.rpm;
  check('8. Balance: 3 blows to kill (moderate damage), cycle ≈ 0.95 s, short range (≤ 2 m), frontal arc ≤ 90°', blows === 3 && cycle >= 0.9 && cycle <= 1.1 && ML.range <= 2 && ML.arcDeg <= 90, `blows ${blows}, cycle ${cycle.toFixed(2)} s`);
  check('9. Not a "win button": a melee kill takes ≥ 5× longer than shooting the same infected', meleeKill >= gunKill * 5, `melee ${meleeKill.toFixed(2)} s vs gun ${gunKill.toFixed(2)} s`);
}

// ============ 3. Strike timing, damage, events ============
{
  const { g, step, press, ev, count } = setup();
  const e = place(g, 1.3);
  step(2); press(); const t0 = g.tick;
  step(1); const startedNow = count('meleeStart') === 1 && g.state.melee.active; step(1);
  check('10. A press starts the strike on that tick (meleeStart, GameState.melee active) and the motion runs from the next tick', startedNow && g.state.melee.progress > 0);
  const progress = []; step(60, () => progress.push(g.state.melee.progress));
  const hit = ev.find(x => x[0] === 'meleeHit');
  const hitTick = hit ? hit[2] - t0 : -1, want = Math.round(ML.duration * ML.hitAt * 60);
  check('11. The blow lands once, at hitAt (≈ 0.19 s after the press)', count('meleeHit') === 1 && Math.abs(hitTick - want) <= 1, `tick ${hitTick} (want ${want})`);
  check('12. Damage = 34 (body), hit confirmation for the HUD (hit event with melee flag)', e.hp === H.hp - ML.damage && ev.some(x => x[0] === 'hit' && x[1].melee === true && !x[1].kill));
  const active = progress.slice(0, Math.round(ML.duration * 60) - 2); // samples while the strike runs (it started 2 ticks before the window)
  check('13. GameState.melee.progress rises monotonically to 1 during the strike, then the cooldown counts 1 → 0', active.every((v, i) => i === 0 || v >= active[i - 1]) && !g.state.melee.active && g.state.melee.ready && g.state.melee.cooldown === 0);
  check('14. GameState snapshot carries the melee state (save / replay)', g.snapshot().state.melee && 'progress' in g.snapshot().state.melee);
}

// ============ 4. Cooldown / spam ============
{
  const { g, step, press, count } = setup();
  place(g, 1.3);
  step(2); for (let i = 0; i < 5 * 60; i++) { press(); step(1); } // a press on EVERY tick for 5 s
  const maxStrikes = Math.floor(5 / (ML.duration + ML.cooldown)) + 1;
  check('15. No spamming: a press every tick for 5 s gives at most one strike per cycle (presses during strike / cooldown are ignored)', count('meleeStart') <= maxStrikes && count('meleeStart') >= maxStrikes - 1, `${count('meleeStart')} strikes (max ${maxStrikes})`);
}

// ============ 5. Range and arc ============
{
  const res = [];
  for (const [dist, ang, expect] of [[1.0, 0, true], [1.9, 0, true], [2.3, 0, false], [1.3, 30, true], [1.3, -30, true], [1.3, 45, false], [1.3, 180, false]]) {
    const { g, step, press, count } = setup();
    place(g, dist, ang); step(2); press(); step(40);
    res.push([dist, ang, count('meleeHit') === 1, expect]);
  }
  check('16. Range: hits up to 1.7 m from the infected\'s surface (≈ 2.0 m centre to centre), misses at 2.3 m', res.slice(0, 3).every(r => r[2] === r[3]), JSON.stringify(res.slice(0, 3).map(r => [r[0], r[2]])));
  check('17. Arc: ±30° hits, 45° and behind miss (frontal 70° arc)', res.slice(3).every(r => r[2] === r[3]), JSON.stringify(res.slice(3).map(r => [r[1], r[2]])));
  const { g, step, press, count, ev } = setup();
  const near = place(g, 1.2, 0, 'guard'), far = place(g, 1.8, 10, 'worker');
  step(2); press(); step(40);
  check('18. One target per blow: the closest infected in the arc is hit, the other is untouched', count('meleeHit') === 1 && near.hp === H.hp - ML.damage && far.hp === H.hp);
  const miss = setup(); miss.step(2); miss.press(); miss.step(40);
  check('19. A strike into the air is a miss (meleeMiss, no damage, no hit marker)', miss.count('meleeMiss') === 1 && miss.count('meleeHit') === 0 && miss.count('hit') === 0);
}

// ============ 6. Never in the same moment as a shot / during reload / ADS ============
{
  const { g, inp, step, press, ev, count } = setup();
  place(g, 1.3);
  inp.setAction('fire', true); step(12);
  const before = count('fire'); press(); const t0 = g.tick; step(Math.round(ML.duration * 60) - 1);
  const during = ev.filter(x => x[0] === 'fire' && x[2] >= t0).length;
  step(30);
  inp.setAction('fire', false);
  check('20. Holding fire + strike: no shot during the strike, firing resumes after it', before >= 2 && during === 0 && count('fire') > before, `before ${before}, during ${during}, after ${count('fire') - before}`);
  const r = setup(); r.g.state.setAmmo(10, 120); r.inp.setAction('reload', true); r.inp.setAction('reload', false); r.step(5); r.press(); r.step(30);
  check('21. No strike during a reload (the press is ignored, the reload completes normally)', r.count('meleeStart') === 0 && (r.step(80), r.g.state.weapon.mag === 30));
  const a = setup(); a.inp.aimHeld = true; a.step(30); const adsBefore = a.g.weapon.ads; a.press(); a.step(12); const adsDuring = a.g.weapon.ads; a.step(60);
  check('22. ADS is released for the strike and comes back after it (aim still held)', adsBefore === 1 && adsDuring < 0.2 && a.g.weapon.ads === 1, `${adsBefore} → ${adsDuring.toFixed(2)} → ${a.g.weapon.ads}`);
  const b = setup(); b.step(2); b.press(); b.step(3); b.inp.setAction('reload', true); b.inp.setAction('reload', false); b.g.state.setAmmo(10, 120); b.step(3);
  check('23. A reload cannot start during a strike (no animation clash)', b.count('reloadStart') === 0 && !b.g.state.weapon.reloading);
  const s = setup(); s.inp.setAction('fire', true); s.step(20); s.inp.setAction('fire', false); s.step(5); place(s.g, 1.3); s.press(); s.step(30); // shoot first (nobody in front), then strike
  const t = setup(); place(t.g, 1.3); t.g.state.setAmmo(5, 120); t.g.weapon.startReload(); t.step(Math.round((R.reloadTime + 0.05) * 60)); t.press(); t.step(30);
  check('24. Strike works right after shooting and right after a reload', s.count('meleeHit') === 1 && t.count('meleeHit') === 1 && t.g.state.weapon.mag === 30);
}

// ============ 7. Infected reaction: stagger, knockback, interruption, kill ============
{
  const { g, step, press } = setup();
  const e = place(g, 1.2); const x0 = e.x;
  step(2); press(); step(Math.round(ML.duration * ML.hitAt * 60) + 1);
  const stun = e.stun, pow = e.hit.pow, cd = e.cooldown;
  step(40);
  const moved = (e.x - x0) / M; // metres pushed along +x (away from the player)
  check('25. Stagger: slowed (stun) and no new swing for 0.5 s; stronger hit reaction (power 1.8, 0.5 s)', stun > ML.stagger - 0.05 && cd > ML.stagger - 0.05 && pow === ML.reactPower && e.hit.dur === ML.reactTime);
  check('26. Knockback: pushed ≈ 0.3–0.5 m away from the player, never into a wall', moved > 0.25 && moved < 0.6 && canStand(g.world, e.x, e.y, e.k.r - 1e-3), `${moved.toFixed(2)} m`);
  // a swing that has not landed yet is cancelled
  const s2 = setup(); const a = place(s2.g, 1.2); a.senseT = 0; s2.step(1);
  a.canSee = true; a.setState('ATTACK'); s2.step(4); s2.press(); s2.step(Math.round(H.attackDuration * 60) + 5);
  check('27. A blow before the infected\'s own strike cancels that swing (no damage to the player from it)', a.interrupted === 1 && s2.count('playerHurt') === 0 && a.blows === 0);
  // a swing that already landed is not undone
  const s3 = setup(); const b = place(s3.g, 1.2); s3.step(1);
  b.canSee = true; b.setState('ATTACK'); s3.step(Math.round(H.attackDuration * H.attackHitAt * 60) + 2); s3.press(); s3.step(30);
  check('28. A swing that already landed is not undone (interruption only before the strike)', b.interrupted === 0 && s3.count('playerHurt') === 1);
  // kill by melee
  const k = setup(); const v = place(k.g, 1.3); k.step(2);
  for (let i = 0; i < 3; i++) { k.press(); k.step(Math.round((ML.duration + ML.cooldown) * 60) + 2); v.x = k.g.player.x + 1.3 * M; v.y = k.g.player.y; } // keep it in reach
  check('29. Three blows kill: counted once (kills 1, infectedKilled 1), it falls (DEAD), the kill hit marker is shown', !v.alive && v.state === 'DEAD' && k.g.state.kills === 1 && k.count('infectedKilled') === 1 && k.ev.some(x => x[0] === 'hit' && x[1].kill && x[1].melee));
}

// ============ 8. All three variants behave the same ============
{
  const out = OUTPOST_VARIANTS.map(variant => {
    const { g, step, press } = setup(); const e = place(g, 1.2, 0, variant); const x0 = e.x;
    step(2); press(); step(60); press(); step(60);
    const hb = e.hitboxes().map(h => [h.cx, h.cy, h.cz ?? h.z1].map(n => n.toFixed(4)).join());
    return { variant, hp: e.hp, moved: ((e.x - x0) / M).toFixed(4), hits: e.meleeHits, hb: hb.join('|'), state: e.state };
  });
  check('30. GUARD / TECHNICIAN / WORKER: identical damage, knockback, reaction and hit zones after two blows', out.every(o => o.hp === H.hp - 2 * ML.damage && o.hits === 2 && o.moved === out[0].moved && o.hb === out[0].hb && o.state === out[0].state), JSON.stringify(out.map(o => [o.variant, o.hp, o.moved])));
}

// ============ 9. Pause, restart, death ============
{
  const { g, step, press, count } = setup();
  place(g, 1.3); step(2);
  press(); g.releaseCombat(); step(30); // pressed just before the pause menu opened
  check('31. Pause: a press made right before pausing does not strike when play resumes', count('meleeStart') === 0);
  press(); step(1); g.releaseCombat(); step(40);
  check('32. A strike already running when the pause opens finishes cleanly (one strike, one result)', count('meleeStart') === 1 && count('meleeHit') + count('meleeMiss') === 1);
  press(); step(3); g.restart(); step(1);
  check('33. Restart resets the melee (no strike running, ready, full ammo 30 / 120)', !g.state.melee.active && g.state.melee.ready && g.state.weapon.mag === 30 && g.state.weapon.reserve === 120);
  const d = setup(); d.g.damagePlayer(1000); d.step(2); d.press(); d.step(30);
  check('34. A dead player cannot strike', d.count('meleeStart') === 0 && d.g.player.dead);
}

// ============ 10. Melee does not break the infected / waves ============
{
  // a strike interrupts the swing, but the infected still gets its blows in a melee-only fight (no stun-lock)
  const { g, step, press, count } = setup();
  const e = place(g, 1.2); e.senseT = 0; step(1); e.canSee = true; e.setState('CHASE');
  let t = 0; while (e.alive && t < 10 * 60) { if (g.state.melee.ready) press(); e.lastSeen.x = g.player.x; e.lastSeen.y = g.player.y; step(1); t++; }
  check('35. Melee-only duel: the infected dies after 3 blows but still lands a blow (no stun-lock, melee is a last resort)', !e.alive && count('playerHurt') >= 1 && g.state.health.hp >= 100 - 3 * H.attackDamage, `hurt ${count('playerHurt')}, hp ${g.state.health.hp}, ${(t / 60).toFixed(2)} s`);
  // a full wave cleared with melee kills only (infected brought in front of the player one by one)
  const w = setup(); w.g.startWaves(1); let guard = 0;
  while (w.g.state.wave.number === 1 && w.g.state.wave.phase !== 'cleared' && guard++ < 60 * 400) {
    const target = w.g.enemies.find(x => x.alive);
    if (target) { target.x = w.g.player.x + 1.2 * M; target.y = w.g.player.y; target.prevX = target.x; target.prevY = target.y; target.cooldown = 1; if (w.g.state.melee.ready) w.press(); }
    w.g.state.setHealth(100); w.step(1);
  }
  check('36. Wave 1 can be cleared with melee kills: wave counter, kills and the director keep working (9 kills)', w.g.state.wave.phase === 'cleared' && w.g.state.kills === 9, `${w.g.state.wave.phase}, kills ${w.g.state.kills}`);
  check('37. Gameplay data unchanged: one infected type (100 HP), 3 waves × 9 (3/3/3 variants), max 5 alive, RAVEN 25 / 50', H.hp === 100 && WAVES.length === 3 && WAVES.every(x => x.enemies.reduce((s, q) => s + q.count, 0) === 9) && MATCH.maxActive === 5 && R.damage.body === 25 && R.damage.head === 50);
}

// ============ 11. Touch HUD: УДАР button ============
{
  check('38. HUD catalogue: melee button (action melee, touch only), default position in the touch layout', HUD_ELEMENTS.melee && HUD_ELEMENTS.melee.action === 'melee' && HUD_ELEMENTS.melee.kind === 'button' && HUD_ELEMENTS.melee.touchOnly && DEFAULT_LAYOUTS.touch.melee && !DEFAULT_LAYOUTS.desktop.melee);
  const screens = { 'iPhone SE': { w: 667, h: 375, safe: { left: 0, right: 0, top: 0, bottom: 0 } }, 'iPhone 11': { w: 896, h: 414, safe: { left: 48, right: 48, top: 0, bottom: 21 } }, 'iPhone 14 Pro Max': { w: 932, h: 430, safe: { left: 59, right: 59, top: 0, bottom: 21 } } };
  const out = [];
  for (const [name, sc] of Object.entries(screens)) for (const hudScale of [0.8, 1, 1.2]) {
    const rects = computeRects(cloneDefaultLayout('touch'), { ...DEFAULT_SETTINGS, hudScale }, sc, 'touch');
    const m = rects.find(r => r.id === 'melee'), ov = findOverlaps(rects).filter(p => p.includes('melee'));
    out.push({ name, hudScale, ok: !!m && ov.length === 0 && inBounds(m, sc) && m.w >= MIN_TOUCH, ov });
  }
  check('39. Default layout: УДАР never overlaps another control, stays in the safe area and ≥ 44 px (3 iPhones × 3 HUD scales)', out.every(o => o.ok), JSON.stringify(out.filter(o => !o.ok)));
  const old = sanitizeLayouts({ touch: { move: { x: 0.1, y: 0.8, s: 1 }, fire: { x: 0.9, y: 0.7, s: 1.2 } } });
  check('40. A layout saved before M1.9 keeps its positions and gets the new button at its default place', old.touch.fire.x === 0.9 && old.touch.fire.s === 1.2 && old.touch.melee.x === DEFAULT_LAYOUTS.touch.melee.x);
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
