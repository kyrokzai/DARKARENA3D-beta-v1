// M2.0 HEAVY ARSENAL — pure-logic tests (no browser): node tests/sim-m2.0.test.mjs
// Three weapons as data on the generic WeaponSystem (RAVEN unchanged, AK-47 MOD, DA-S12 KRAIT), separate ammo,
// holster→draw switching (no fire / reload / ADS / strike during it, no ammo lost or doubled, fast switching),
// pump cycle, pellets + falloff + walls, shell-by-shell reload with interruption, melee with every weapon, three
// variants, kills, resupply of the whole loadout, the flashlight state, and the three waves cleared with each weapon.
import outpost from '../prototype-3d/src/data/maps/outpost-zero.js';
import { Game } from '../prototype-3d/src/sim/game.js';
import { InputState } from '../prototype-3d/src/input/input.js';
import { WEAPONS, LOADOUT, STOCK_STRIKE } from '../prototype-3d/src/sim/weapons/defs.js';
import { falloffK } from '../prototype-3d/src/sim/weapons/weapon-system.js';
import { INFECTED_TYPES, OUTPOST_VARIANTS } from '../prototype-3d/src/sim/enemies/infected-defs.js';
import { WAVES, MATCH } from '../prototype-3d/src/sim/waves/wave-defs.js';

const results = [];
const check = (name, ok, info = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const RV = WEAPONS.raven, AK = WEAPONS.ak47, KR = WEAPONS.krait, H = INFECTED_TYPES.hollow, M = 0.5, DT = 1 / 60;
let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function setup({ px = 8, py = 8, yaw = 0, s = 7, shotRng = () => 0.5 } = {}) {
  seed = s;
  const g = new Game(outpost, { rng: shotRng, waveRng: rng, aiRng: rng });
  Object.assign(g.player, { x: px, y: py, prevX: px, prevY: py, yaw });
  const inp = new InputState();
  const ev = []; for (const t of ['fire', 'shot', 'hit', 'targetHit', 'reloadStart', 'reloadEnd', 'reloadCancel', 'shellLoaded', 'weaponSwitch', 'weaponSwap', 'weaponReady', 'meleeStart', 'meleeHit', 'infectedKilled', 'flashlight', 'dryFire']) g.on(t, d => ev.push([t, d, g.tick]));
  const step = (n = 1, each) => { for (let i = 0; i < n; i++) { g.step(inp.update(), DT); if (each) each(i); } };
  const sec = s => step(Math.round(s * 60));
  const count = t => ev.filter(e => e[0] === t).length;
  const select = i => { inp.selectWeapon(i); step(1); };
  const ready = () => { let n = 0; while (g.arsenal.switching && n++ < 200) step(1); };
  const equip = i => { select(i); ready(); };
  const pull = () => { inp.setAction('fire', true); step(1); inp.setAction('fire', false); };
  return { g, inp, ev, step, sec, count, select, ready, equip, pull };
}
/** Aim the player at an infected's chest (eye height 1.6 m is above the chest: a level shot would pass over it). */
const aimAt = (g, e) => { const p = g.player, c = e.hitboxes()[1]; p.yaw = Math.atan2(c.cy - p.y, c.cx - p.x); p.pitch = Math.atan2(c.cz - 0.8 - (p.z || 0), Math.hypot(c.cx - p.x, c.cy - p.y)); };
const place = (g, distM, variant = 'guard', angDeg = 0) => { const p = g.player, a = p.yaw + angDeg * Math.PI / 180; const e = g.spawnInfected('hollow', p.x + Math.cos(a) * distM * M, p.y + Math.sin(a) * distM * M, a + Math.PI, { variant }); e.senseT = 1e9; return e; };

// ============ 1. Data ============
{
  check('1. Three weapons as data, loadout RAVEN / AK-47 / KRAIT (slots 1 / 2 / 3), all on the shared stock strike', LOADOUT.join() === 'raven,ak47,krait' && [RV, AK, KR].every((w, i) => w.slot === i + 1 && w.melee === STOCK_STRIKE && w.switch.holster > 0 && w.switch.draw > 0 && Object.isFrozen(w)));
  check('2. RAVEN unchanged (30 / 120, 600 RPM, 25 / 50, 1.3 s, recoil and spread as in M1.9)', RV.magSize === 30 && RV.reserve === 120 && RV.rpm === 600 && RV.damage.body === 25 && RV.damage.head === 50 && RV.reloadTime === 1.3 && RV.recoil.pitch === 0.55 && RV.spread.max === 3.2 && RV.ads.spreadMult === 0.3 && RV.skins.length === 3);
  check('3. AK-47 MOD: 30 / 120, auto 600 RPM, 34 / 68, reload 1.8 s; recoil and bloom stronger than RAVEN, ADS less precise', AK.magSize === 30 && AK.reserve === 120 && AK.fireMode === 'auto' && AK.rpm === 600 && AK.damage.body === 34 && AK.damage.head === 68 && AK.reloadTime === 1.8 && AK.recoil.pitch > RV.recoil.pitch && AK.recoil.yaw > RV.recoil.yaw && AK.spread.max > RV.spread.max && AK.spread.perShot > RV.spread.perShot && AK.ads.spreadMult > RV.ads.spreadMult);
  check('4. KRAIT: 8 shells, 48 reserve, pump ≤ 75 RPM, 8 pellets × 12 / 18, shell-by-shell reload, damage falloff', KR.magSize === 8 && KR.reserve === 48 && KR.fireMode === 'pump' && KR.rpm <= 75 && KR.pellets === 8 && KR.damage.body === 12 && KR.damage.head === 18 && KR.reload.type === 'shell' && KR.falloff.min < 1);
}

// ============ 2. AK-47 ============
{
  const { g, inp, step, count, equip, ev } = setup();
  equip(1);
  check('5. Key 2 → AK-47 in the hands after holster + draw; HUD state shows it (30 / 120)', g.arsenal.activeId === 'ak47' && g.state.weapon.id === 'ak47' && g.state.weapon.mag === 30 && g.state.weapon.reserve === 120 && g.state.arsenal.active === 1 && g.state.arsenal.phase === 'ready');
  inp.setAction('fire', true); step(Math.round(1.0 * 60)); inp.setAction('fire', false); step(2);
  const ticks = ev.filter(e => e[0] === 'fire').map(e => e[2]), gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
  check('6. AK-47 rate: 600 RPM exactly (a shot every 6 ticks at 60 Hz, 10 in 1 s), one round each', ticks.length === 10 && gaps.every(x => x === 6) && g.state.weapon.mag === 20, `${ticks.length} shots, gaps ${[...new Set(gaps)]}`);
  // recoil / bloom vs RAVEN on the same 10-round burst
  const burst = id => { const s = setup(); if (id !== 0) s.equip(id); const p0 = s.g.player.pitch; s.inp.setAction('fire', true); s.step(60); const climb = s.g.player.pitch - p0, spread = s.g.weapon.currentSpread(); s.inp.setAction('fire', false); return { climb, spread }; };
  const r = burst(0), a = burst(1);
  check('7. AK-47 kicks harder and spreads wider on a long burst than RAVEN (sustained fire loses accuracy)', a.climb > r.climb * 1.3 && a.spread > r.spread * 1.3, `climb ${(a.climb * 57.3).toFixed(1)}° vs ${(r.climb * 57.3).toFixed(1)}°, spread ${a.spread.toFixed(2)}° vs ${r.spread.toFixed(2)}°`);
  const s = setup(); s.equip(1); s.inp.aimHeld = true; s.step(30); const adsSpread = s.g.weapon.currentSpread(); s.inp.aimHeld = false; s.step(30); const hip = s.g.weapon.currentSpread();
  check('8. AK-47 ADS reduces the spread but not to zero (not a laser)', adsSpread < hip && adsSpread > 0.3, `${adsSpread.toFixed(2)}° vs ${hip.toFixed(2)}°`);
  const k = setup(); k.equip(1); const e = place(k.g, 6, 'technician'); e.k.headR = 1e-4; k.inp.setAction('fire', true); let t = 0; while (e.alive && t++ < 120) { aimAt(k.g, e); k.step(1); } k.inp.setAction('fire', false); // the player pulls the recoil back down
  check('9. AK-47: 3 body hits kill an infected (34 × 3 ≥ 100), counted once', !e.alive && k.g.state.kills === 1 && k.count('infectedKilled') === 1 && k.count('fire') === 3, `${k.count('fire')} shots`);
  const rl = setup(); rl.equip(1); rl.g.state.setAmmo(4, 120); rl.inp.setAction('reload', true); rl.inp.setAction('reload', false); rl.step(Math.round(1.75 * 60)); const mid = rl.g.state.weapon.mag; rl.step(10);
  check('10. AK-47 reload takes 1.8 s (not done at 1.75 s), then 30 / 94', mid === 4 && rl.g.state.weapon.mag === 30 && rl.g.state.weapon.reserve === 94);
}

// ============ 3. KRAIT: pellets, pump, falloff, walls ============
{
  const { g, inp, step, ev, count, equip, pull } = setup({ shotRng: rng });
  equip(2);
  pull(); step(2);
  const shots = ev.filter(e => e[0] === 'shot'), fires = count('fire');
  check('11. KRAIT: one trigger pull = one shell, 8 pellets in a cone around the aim', fires === 1 && shots.length === 8 && g.state.weapon.mag === 7 && new Set(shots.map(x => x[1].dir.x.toFixed(5) + x[1].dir.y.toFixed(5))).size === 8);
  const ang = shots.map(x => Math.acos(Math.min(1, x[1].dir.x * x[1].aim.x + x[1].dir.y * x[1].aim.y + x[1].dir.z * x[1].aim.z)) * 57.3);
  check('12. Pellet cone ≈ aim spread + 3.6° half-angle (no pellet outside it)', Math.max(...ang) <= KR.pelletSpread + KR.spread.max + 0.01 && Math.max(...ang) > 1, `max ${Math.max(...ang).toFixed(2)}°`);
  // pump cycle: held trigger does not fire again; a new pull inside the cycle does nothing
  step(60); inp.setAction('fire', true); step(90); inp.setAction('fire', false); step(2); // a fresh pull, held for 1.5 s
  const f1 = count('fire');
  pull(); step(2); const f2 = count('fire');
  check('13. Pump: one shot per pull (holding the trigger 1.5 s does not repeat); a new pull fires again (≤ 75 RPM)', f1 === 2 && f2 === 3, `fires ${f1} → ${f2}`);
  const s2 = setup(); s2.equip(2); s2.pull(); s2.step(10); s2.pull(); s2.step(2);
  const early = s2.count('fire'); s2.step(50); s2.pull(); s2.step(2);
  const ticks = s2.ev.filter(e => e[0] === 'fire').map(e => e[2]);
  check('14. No shot before the pump cycle is complete (pull at 0.18 s ignored, next at ≥ 0.8 s)', early === 1 && s2.count('fire') === 2 && ticks[1] - ticks[0] >= 48, `gap ${ticks[1] - ticks[0]} ticks`);
  // damage per pellet + falloff
  check('15. Falloff: full damage ≤ 6 m, 65 % at 14 m, 30 % beyond 22 m', falloffK(KR.falloff, 5) === 1 && Math.abs(falloffK(KR.falloff, 14) - 0.65) < 1e-9 && falloffK(KR.falloff, 30) === 0.3);
  const near = setup({ shotRng: () => 0.5 }); near.equip(2); const en = place(near.g, 2.5, 'guard'); en.k.headR = 1e-4; aimAt(near.g, en); near.pull(); near.step(2);
  const hits = near.ev.filter(x => x[0] === 'targetHit'), dealt = hits.reduce((a, x) => a + x[1].damage, 0);
  check('16. Point blank (2.5 m, centred): 8 pellets × 12 = 96 body damage — one confirmation (hit event) per shot', hits.length === 8 && Math.abs(dealt - 96) < 1e-6 && near.count('hit') === 1, `${hits.length} pellets, ${dealt}`);
  const far = setup({ shotRng: rng }); far.equip(2); far.g.player.x = 3; far.g.player.y = 8; const ef = place(far.g, 18, 'worker'); far.pull(); far.step(2);
  check('17. At 18 m one shell never kills (falloff + cone): the infected survives', ef.alive && ef.hp > 0, `hp ${ef.hp.toFixed(1)}`);
  // walls block pellets
  const w = setup({ px: 4.5, py: 2.5, yaw: -Math.PI / 2 }); w.equip(2);
  let wallX = null; for (let y = 2; y >= 0; y--) if (w.g.world.isSolidCell(4, y)) { wallX = y; break; }
  const behind = w.g.spawnInfected('hollow', 4.5, -0.6, Math.PI / 2, { variant: 'guard' }); behind.senseT = 1e9;
  w.pull(); w.step(2);
  check('18. Walls block every pellet (an infected behind the wall takes no damage)', behind.hp === H.hp && w.ev.filter(x => x[0] === 'shot').every(x => x[1].hit.type !== 'entity'));
}

// ============ 4. KRAIT shell-by-shell reload ============
{
  const { g, inp, step, ev, count, equip, pull } = setup();
  equip(2); g.state.setAmmo(3, 48);
  inp.setAction('reload', true); inp.setAction('reload', false);
  const mags = []; step(Math.round(4 * 60), () => mags.push(g.state.weapon.mag));
  const ups = mags.slice(1).map((m, i) => m - mags[i]).filter(d => d !== 0);
  check('19. Shell reload: one shell at a time (+1 steps), 3 → 8 and 48 → 43, then stops (no endless loading)', ups.every(d => d === 1) && ups.length === 5 && g.state.weapon.mag === 8 && g.state.weapon.reserve === 43 && count('shellLoaded') === 5 && count('reloadEnd') === 1);
  const sh = ev.filter(x => x[0] === 'shellLoaded').map(x => x[2]), gaps = sh.slice(1).map((t, i) => t - sh[i]);
  check('20. Each shell takes 0.5 s (start 0.35 s, then a shell every 30 ticks)', gaps.every(x => x === 30), JSON.stringify(gaps));
  // interruption by a trigger pull: the current shell finishes, then the shot (trigger still held)
  const s = setup(); s.equip(2); s.g.state.setAmmo(1, 48); s.inp.setAction('reload', true); s.inp.setAction('reload', false); s.sec(1.0);
  const before = s.g.state.weapon.mag; s.inp.setAction('fire', true); s.step(1); const firesAt = s.count('fire'); s.sec(1.2); s.inp.setAction('fire', false);
  check('21. Fire during a shell reload: loading stops after the current shell and the held trigger fires when ready', before === 2 && firesAt === 0 && s.count('fire') === 1 && s.count('shellLoaded') === 2 && !s.g.state.weapon.reloading && s.g.state.weapon.mag === 2, `mag ${s.g.state.weapon.mag}, shells ${s.count('shellLoaded')}`);
  const s3 = setup(); s3.equip(2); s3.g.state.setAmmo(1, 48); s3.inp.setAction('reload', true); s3.inp.setAction('reload', false); s3.sec(1.0); s3.pull(); s3.sec(1.2);
  check('22. A short tap during the reload stops it but does not fire later on its own (no surprise shot)', s3.count('fire') === 0 && !s3.g.state.weapon.reloading && s3.g.state.weapon.mag === 3);
  const e = setup(); e.equip(2); e.g.state.setAmmo(0, 48); e.pull(); e.step(1);
  check('23. Empty KRAIT: pulling the trigger clicks and starts the shell reload', e.count('dryFire') === 1 && e.count('reloadStart') === 1 && e.g.state.weapon.reloading);
  const h = setup(); h.equip(2); h.g.state.setAmmo(0, 48); for (let i = 0; i < 3 * 30; i++) { h.inp.setAction('fire', i % 2 === 0); h.step(1); } h.inp.setAction('fire', false); h.sec(0.5);
  check('23b. Hammering the trigger on an empty KRAIT never locks it: the first shell still goes in, then it fires', h.count('shellLoaded') >= 1 && h.count('fire') >= 1, `shells ${h.count('shellLoaded')}, fires ${h.count('fire')}`);
  const z = setup(); z.equip(2); z.g.state.setAmmo(5, 2); z.inp.setAction('reload', true); z.inp.setAction('reload', false); z.sec(3);
  check('24. Reserve runs out: loads only what is left (5 + 2 → 7 / 0)', z.g.state.weapon.mag === 7 && z.g.state.weapon.reserve === 0 && z.count('shellLoaded') === 2);
}

// ============ 5. Switching ============
{
  const { g, inp, step, count, select, ready, equip, pull, ev } = setup();
  pull(); step(5);
  select(1); const during = []; let n = 0; while (g.arsenal.switching && n++ < 100) { inp.setAction('fire', true); inp.setAction('melee', true); inp.setAction('melee', false); inp.setAction('reload', true); inp.setAction('reload', false); inp.aimHeld = true; step(1); during.push(g.weapon.ads); }
  inp.setAction('fire', false); inp.aimHeld = false; step(2);
  const sw = ev.find(e => e[0] === 'weaponSwitch'), rd = ev.find(e => e[0] === 'weaponReady');
  check('25. Switch RAVEN → AK-47: holster 0.28 s + draw 0.48 s; nothing fires, strikes, reloads or aims meanwhile', rd && rd[2] - sw[2] >= Math.round((RV.switch.holster + AK.switch.draw) * 60) - 1 && ev.filter(e => e[0] === 'fire' && e[2] > sw[2] && e[2] < rd[2]).length === 0 && ev.filter(e => (e[0] === 'meleeStart' || e[0] === 'reloadStart') && e[2] < rd[2]).length === 0 && during.every(a => a === 0), `${rd && rd[2] - sw[2]} ticks`);
  check('26. Separate magazines: RAVEN keeps 29 / 120 while the AK-47 is in the hands (30 / 120)', g.arsenal.ammo[0].mag === 29 && g.arsenal.ammo[0].reserve === 120 && g.state.weapon.mag >= 29 && g.state.arsenal.slots[0].mag === 29);
  // a magazine reload interrupted by a switch moves nothing
  const r = setup(); r.g.state.setAmmo(10, 120); r.inp.setAction('reload', true); r.inp.setAction('reload', false); r.sec(1.0); r.equip(2); r.equip(0);
  check('27. Reload cancelled by a switch: no rounds moved (RAVEN still 10 / 120), not reloading after coming back', r.g.state.weapon.mag === 10 && r.g.state.weapon.reserve === 120 && !r.g.state.weapon.reloading && r.count('reloadCancel') === 1);
  const k = setup(); k.equip(2); k.g.state.setAmmo(2, 48); k.inp.setAction('reload', true); k.inp.setAction('reload', false); k.sec(1.4); k.equip(1); k.equip(2);
  check('28. Shell reload cancelled by a switch: shells already loaded stay (2 + 2 = 4 / 46)', k.g.state.weapon.mag === 4 && k.g.state.weapon.reserve === 46);
  // fast switching: random presses for 30 s, total ammo of every weapon conserved (no shooting)
  const f = setup({ s: 3 }); const tot0 = [0, 1, 2].map(i => f.g.arsenal.total(i));
  for (let i = 0; i < 30 * 60; i++) { if (rng() < 0.08) f.inp.selectWeapon(Math.floor(rng() * 3)); if (rng() < 0.02) f.inp.selectWeapon(rng() < 0.5 ? 'next' : 'prev'); if (rng() < 0.03) { f.inp.setAction('reload', true); f.inp.setAction('reload', false); } f.step(1); }
  f.ready(); f.step(5);
  check('29. Fast switching (≈ 180 requests in 30 s, reloads mixed in): no rounds lost or created for any weapon', [0, 1, 2].every(i => f.g.arsenal.total(i) === tot0[i]) && f.g.arsenal.switches > 25, `${f.g.arsenal.switches} switches, totals ${[0, 1, 2].map(i => f.g.arsenal.total(i))}`);
  const w = setup(); w.inp.selectWeapon('next'); w.step(1); w.ready(); const a1 = w.g.arsenal.activeId; w.inp.selectWeapon('next'); w.step(1); w.ready(); const a2 = w.g.arsenal.activeId; w.inp.selectWeapon('next'); w.step(1); w.ready(); const a3 = w.g.arsenal.activeId; w.inp.selectWeapon('prev'); w.step(1); w.ready();
  check('30. Mouse wheel: next / prev cycle RAVEN → AK-47 → KRAIT → RAVEN → KRAIT', a1 === 'ak47' && a2 === 'krait' && a3 === 'raven' && w.g.arsenal.activeId === 'krait');
  const same = setup(); same.select(0); same.step(3);
  check('31. Selecting the weapon already in the hands does nothing (no animation, no reload cancel)', !same.g.arsenal.switching && same.count('weaponSwitch') === 0);
  const re = setup(); re.select(2); re.step(5); re.select(1); re.ready();
  check('32. A new choice while putting the old weapon away is honoured (RAVEN → [KRAIT] → AK-47)', re.g.arsenal.activeId === 'ak47' && re.count('weaponSwap') === 1);
}

// ============ 6. Melee, ADS, reload after switching; pause; restart ============
{
  const res = [];
  for (const i of [0, 1, 2]) {
    const s = setup(); s.equip(i); const e = place(s.g, 1.3, OUTPOST_VARIANTS[i]); s.step(2);
    s.inp.setAction('melee', true); s.inp.setAction('melee', false); s.sec(1);
    s.inp.aimHeld = true; s.sec(0.6); const ads = s.g.weapon.ads; s.inp.aimHeld = false; s.sec(0.4);
    s.g.state.setAmmo(1, 40); s.inp.setAction('reload', true); s.inp.setAction('reload', false); s.sec(6);
    res.push({ w: s.g.arsenal.activeId, melee: H.hp - e.hp, ads, mag: s.g.state.weapon.mag });
  }
  check('33. With every weapon: the same stock strike (34), ADS works, reload works after the switch', res.every(r => r.melee === 34 && r.ads === 1) && res[0].mag === 30 && res[1].mag === 30 && res[2].mag === 8, JSON.stringify(res));
  const m = setup(); m.step(2); m.inp.setAction('melee', true); m.inp.setAction('melee', false); m.step(2); m.select(2); m.step(10);
  check('34. A switch requested during a strike waits for it to end (strike not cut, then the switch)', m.g.melee.strikes === 1 && (m.sec(1), m.g.arsenal.activeId === 'krait'));
  const p = setup(); p.inp.selectWeapon(1); p.g.releaseCombat(); p.sec(1);
  check('35. Pause: a weapon key pressed just before pausing is dropped', p.g.arsenal.activeId === 'raven' && p.count('weaponSwitch') === 0);
  const r = setup(); r.equip(2); r.g.state.setAmmo(2, 10); r.g.state.setFlashlight(true); r.g.restart(); r.step(1);
  check('36. Restart: RAVEN in the hands, every weapon full (30/120, 30/120, 8/48), flashlight off', r.g.arsenal.activeId === 'raven' && [0, 1, 2].every(i => r.g.arsenal.total(i) === [150, 150, 56][i]) && !r.g.state.flashlight);
  const d = setup(); d.g.damagePlayer(1000); d.inp.selectWeapon(2); d.sec(1);
  check('37. A dead player cannot switch weapons', d.g.arsenal.activeId === 'raven');
}

// ============ 7. Flashlight state ============
{
  const { g, inp, step, count } = setup();
  const t = () => { inp.setAction('light', true); inp.setAction('light', false); step(1); };
  t(); const on = g.state.flashlight; t(); const off = g.state.flashlight; t();
  check('38. Flashlight: one press toggles on / off (state + event for the HUD / renderer), works with any weapon', on && !off && g.state.flashlight && count('flashlight') === 3);
  const s = setup(); s.equip(2); s.inp.setAction('light', true); s.inp.setAction('light', false); s.step(1); s.inp.aimHeld = true; s.sec(0.5);
  check('39. Flashlight with KRAIT in ADS stays on (independent of weapon / aim)', s.g.state.flashlight && s.g.weapon.ads === 1);
}

// ============ 8. Kills, variants, resupply, three waves with each weapon ============
{
  const res = [];
  for (const i of [0, 1, 2]) for (const v of OUTPOST_VARIANTS) {
    const s = setup({ shotRng: () => 0.5 }); s.equip(i); const e = place(s.g, i === 2 ? 3 : 6, v); e.k.headR = 1e-4; aimAt(s.g, e);
    let n = 0; s.inp.setAction('fire', true); while (e.alive && n++ < 600) { aimAt(s.g, e); s.step(1); if (i === 2) { s.inp.setAction('fire', false); s.step(1); s.inp.setAction('fire', true); } }
    s.inp.setAction('fire', false);
    res.push([s.g.arsenal.activeId, v, !e.alive && s.g.state.kills === 1 && s.count('infectedKilled') === 1, s.count('fire')]);
  }
  check('40. Every weapon kills GUARD / TECHNICIAN / WORKER the same way (kill counted once; RAVEN 4, AK-47 3 shots, KRAIT ≤ 2 shells close)', res.every(r => r[2]) && res.filter(r => r[0] === 'raven').every(r => r[3] === 4) && res.filter(r => r[0] === 'ak47').every(r => r[3] === 3) && res.filter(r => r[0] === 'krait').every(r => r[3] <= 2), JSON.stringify(res));
  const rs = setup(); rs.g.state.setAmmo(10, 7); rs.equip(1); rs.g.state.setAmmo(5, 3); rs.equip(2); rs.g.state.setAmmo(1, 2); rs.g.arsenal.resupply();
  check('41. Resupply between waves refills the reserve of all three weapons (magazines untouched)', rs.g.state.weapon.mag === 1 && rs.g.state.weapon.reserve === 48 && rs.g.arsenal.ammo[0].reserve === 120 && rs.g.arsenal.ammo[1].reserve === 120 && rs.g.arsenal.ammo[0].mag === 10 && rs.g.arsenal.ammo[1].mag === 5);
  // three full waves, a scripted player who only uses one weapon (aims at the nearest visible infected, fires, reloads)
  const match = (slots, maxMin = 12) => {
    const s = setup({ px: 15, py: 8, s: 11, shotRng: rng }); const g = s.g, p = g.player; g.startWaves(1);
    let used = 0, t = 0, wi = 0;
    while (!g.matchOver && t < maxMin * 3600 && !p.dead) {
      if (t % 600 === 0 && slots.length > 1) { wi = (wi + 1) % slots.length; }
      if (!g.arsenal.switching && g.arsenal.active !== slots[wi]) s.inp.selectWeapon(slots[wi]);
      const vis = g.enemies.filter(e => e.alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (vis) { p.yaw = Math.atan2(vis.y - p.y, vis.x - p.x); p.pitch = Math.atan2((vis.hitboxes()[1].cz - 0.8), Math.hypot(vis.x - p.x, vis.y - p.y)); }
      const krait = g.arsenal.activeId === 'krait';
      s.inp.setAction('fire', !!vis && (!krait || t % 2 === 0));
      if (!vis && g.state.weapon.mag < g.state.weapon.magSize && !g.state.weapon.reloading && t % 30 === 0) { s.inp.setAction('reload', true); s.inp.setAction('reload', false); }
      if (g.state.health.hp < 40) g.state.setHealth(100); // the test player is immortal-ish: we measure ammo, not dodging
      s.step(1); t++; used = Math.max(used, 1);
    }
    const tot = [0, 1, 2].map(i => g.arsenal.total(i));
    return { won: g.matchOver && g.state.wave.phase === 'victory' || (g.matchOver && g.state.kills === 27), kills: g.state.kills, min: +(t / 3600).toFixed(1), ammoLeft: tot };
  };
  const mR = match([0]), mA = match([1]), mK = match([2]), mX = match([0, 1, 2]);
  check('42. Three waves (27 infected) can be cleared with RAVEN only / AK-47 only / KRAIT only / mixed — ammo never runs out', [mR, mA, mK, mX].every(m => m.won && m.kills === 27), JSON.stringify({ raven: mR, ak47: mA, krait: mK, mixed: mX }));
  check('43. Waves and infected unchanged: 3 × 9 (3/3/3), max 5 alive, HOLLOW 100 HP, blow 15', WAVES.length === 3 && WAVES.every(w => w.enemies.reduce((s, e) => s + e.count, 0) === 9) && MATCH.maxActive === 5 && H.hp === 100 && H.attackDamage === 15);
}

// ============ 9. Independent review fixes ============
{
  // R1: a queued choice (1 → 2 while drawing, then 3) — the intermediate weapon never fires / reloads / is ready to act
  const q = setup(); q.inp.setAction('fire', true); q.select(1); let n = 0; while (q.g.arsenal.phase !== 'draw' && n++ < 100) q.step(1);
  q.select(2); n = 0; while (q.g.arsenal.switching && n++ < 300) q.step(1);
  const fired = q.ev.filter(e => e[0] === 'fire').map(e => e[1].weapon || q.g.weapon.def.id);
  const readyIds = q.ev.filter(e => e[0] === 'weaponReady').map(e => e[1].id);
  q.inp.setAction('fire', false);
  check('44. Review: a choice queued during the draw starts in the same tick — the intermediate AK-47 never fires', q.g.arsenal.activeId === 'krait' && q.ev.filter(e => e[0] === 'fire' && e[1].weapon === 'ak47').length === 0 && q.ev.filter(e => e[0] === 'fire').length <= 1, `ready ${readyIds}, fires ${fired}`);
  // R2: the camera keeps recovering the recoil climb after a switch (spray → switch → aim returns down)
  const r = setup(); r.equip(1); const p0 = r.g.player.pitch; r.inp.setAction('fire', true); r.step(30); r.inp.setAction('fire', false);
  const peak = r.g.player.pitch - p0; r.select(0); r.sec(2);
  const left = r.g.player.pitch - p0;
  check('45. Review: recoil recovery continues across a weapon switch (aim does not stay high)', peak > 0.02 && left < peak * 0.5, `peak ${(peak * 57.3).toFixed(2)}°, after ${(left * 57.3).toFixed(2)}°`);
  const rr = setup(); rr.equip(1); rr.inp.setAction('fire', true); rr.step(30); rr.inp.setAction('fire', false); rr.g.restart(); rr.step(1);
  check('46. Restart clears the recoil climb (fresh weapon state)', (rr.g.weapon.recoilClimb || 0) === 0);
  // R3: a pull held during the closing phase of a shell reload fires when the shotgun is ready
  const e = setup(); e.equip(2); e.g.state.setAmmo(6); e.step(1); e.inp.setAction('reload', true); e.step(1); e.inp.setAction('reload', false);
  n = 0; while (e.g.weapon.shell && e.g.weapon.shell.phase !== 'end' && n++ < 400) e.step(1);
  const inEnd = !!(e.g.weapon.shell && e.g.weapon.shell.phase === 'end'), f0 = e.count('fire');
  e.inp.setAction('fire', true); e.step(1); e.sec(1.2); e.inp.setAction('fire', false);
  check('47. Review: a held pull during the shell reload’s closing phase fires once it is ready (not dropped)', inEnd && e.count('fire') === f0 + 1 && e.g.state.weapon.mag === 7, `mag ${e.g.state.weapon.mag}, fires ${e.count('fire') - f0}`);
  // R4: a pull in the last 0.15 s of the pump cycle is buffered (held) and fires as soon as the cycle ends
  const b = setup(); b.equip(2); b.pull(); const cyc = 60 / KR.rpm; b.sec(cyc - 0.1);
  b.inp.setAction('fire', true); b.step(1); b.inp.setAction('fire', true); b.sec(0.2); b.inp.setAction('fire', false);
  check('48. Review: a pull just before the pump finishes is buffered and fires when ready', b.count('fire') === 2, `fires ${b.count('fire')}`);
  // R5: changing one's mind during the holster (2 then 1 again) reverses instead of a full cycle
  const m = setup(); m.select(1); m.step(6); const t0 = m.g.tick; m.select(0); n = 0; while (m.g.arsenal.switching && n++ < 300) m.step(1);
  const took = m.g.tick - t0;
  check('49. Review: back to the same weapon during the holster reverses (short, no swap, ammo untouched)', m.g.arsenal.activeId === 'raven' && m.count('weaponSwap') === 0 && took < Math.round(RV.switch.draw * 60) && m.g.state.weapon.mag === 30, `${took} ticks`);
  // R6: opts.weapon chooses the starting slot
  const g6 = new Game(outpost, { rng: () => 0.5, waveRng: rng, aiRng: rng, weapon: 'krait' });
  check('50. Review: opts.weapon and the arsenal agree on the starting slot', g6.arsenal.activeId === g6.weapon.def.id, `${g6.arsenal.activeId} / ${g6.weapon.def.id}`);
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
