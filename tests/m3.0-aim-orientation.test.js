// M3.0 TOPDOWN — aim smoothness + landscape-only, in the browser with real CDP touches (iPhone-class phone emulation):
//  A. the hero follows the right finger continuously: per-frame turn = finger turn, no holds / jumps, also with infected
//     around (the aim assist used to snap the facing → stepwise turning on iPhone); through ±180° and 0° the short way;
//     fast circles with the left finger moving; fire held the whole time (no gaps), clips not restarted;
//  B. the aim assist still bends the SHOT (not the facing) inside its cone;
//  C. portrait = "rotate the phone" screen: controls hidden, the run paused, touches / aim / fire released, wave / health /
//     ammo kept; back in landscape the game stays paused until ПРОДОЛЖИТЬ; menus keep their state; desktop unaffected.
// Chromium emulation ≠ iOS Safari (no real thumbs, frame rate of software WebGL) — the owner confirms on a real iPhone.
const { chromium } = require('playwright');
const { serve, makeChecker, sleep, touch } = require('./lib/harness');

const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const D2R = Math.PI / 180, wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), deg = r => +(r / D2R).toFixed(2);

async function openTD(browser, base, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + '/prototype-3d/topdown.html?debug=1&gfx=performance');
  await page.waitForFunction(() => window.__DA3TD && !document.getElementById('playBtn').disabled, null, { timeout: 60000 });
  return { ctx, page, errors, cdp };
}
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const nextFrame = page => DA(page, () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const snap = page => DA(page, () => { const T = window.__DA3TD, g = T.game, p = g.player, w = g.state.weapon;
  return { state: T.state, yaw: p.yaw, x: p.x, y: p.y, fire: T.input.actions.fire, aimActive: T.td.aim.active, mx: T.td.move.x, my: T.td.move.y, clip: T.view.hero.clip,
    mag: w.mag, reserve: w.reserve, hp: g.state.health.hp, wave: g.state.wave.number, remaining: g.state.wave.remaining, kills: g.state.kills, shot: T.lastShotYaw, portrait: T.portrait }; });
/** Clear the arena, put the player in the middle, optionally n infected on a ring (pinned, invulnerable). */
const arena = (page, n = 0, ring = 5) => DA(page, ([n, ring]) => { const g = window.__DA3TD.game; g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e);
  const p = g.player; Object.assign(p, { x: 14, y: 7.5, prevX: 14, prevY: 7.5 }); g.state.setHealth(100);
  for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n + 0.3; const e = g.spawnInfected('hollow', p.x + Math.cos(a) * ring, p.y + Math.sin(a) * ring, a + Math.PI); e.senseT = 1e9; e.hp = 1e9; }
  const home = g.enemies.map(e => [e.x, e.y]); clearInterval(window.__pin);
  window.__pin = setInterval(() => { g.enemies.forEach((e, i) => { e.x = e.prevX = home[i][0]; e.y = e.prevY = home[i][1]; }); g.state.setHealth(100); if (g.state.weapon.mag < 5) g.state.setAmmo(30, 120); }, 50); }, [n, ring]);

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const { check, results } = makeChecker();
  try {
    const { ctx, page, errors, cdp } = await openTD(browser, base, PHONE);
    await DA(page, () => document.getElementById('playBtn').click()); await sleep(500);
    const W = await DA(page, () => ({ w: innerWidth, h: innerHeight }));
    const cx = W.w * 0.75, cy = W.h * 0.55, R = 50, mx = W.w * 0.2, my = W.h * 0.6;
    const fireTicks = () => DA(page, () => { window.__ft = []; window.__DA3TD.game.on('fire', () => window.__ft.push(window.__DA3TD.game.tick)); });
    await fireTicks();
    /** The right finger walks the given angles (one per rendered frame); optional left finger held on the move stick. */
    async function sweep(angles, { moveFinger = false } = {}) {
      const left = moveFinger ? [{ x: mx + 60, y: my, id: 8 }] : [];
      if (moveFinger) { await touch(cdp, 'touchStart', [{ x: mx, y: my, id: 8 }]); await touch(cdp, 'touchMove', [{ x: mx + 60, y: my, id: 8 }]); }
      await touch(cdp, 'touchStart', [...left, { x: cx, y: cy, id: 9 }]);
      await touch(cdp, 'touchMove', [...left, { x: cx + Math.cos(angles[0]) * R, y: cy + Math.sin(angles[0]) * R, id: 9 }]); await nextFrame(page);
      await DA(page, () => { window.__ft = []; });
      const rows = [];
      for (const a of angles) {
        await touch(cdp, 'touchMove', [...left, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, id: 9 }]);
        await nextFrame(page);
        if (moveFinger) await DA(page, () => { const p = window.__DA3TD.game.player; if (p.x > 22) { p.x = p.prevX = 8; } });
        rows.push({ finger: wrap(a), ...(await snap(page)) });
      }
      const ft = await DA(page, () => window.__ft.slice());
      await touch(cdp, 'touchEnd', []); await nextFrame(page);
      const steps = rows.slice(1).map((r, i) => Math.abs(wrap(r.yaw - rows[i].yaw)) / D2R);
      const err = rows.map(r => Math.abs(wrap(r.yaw - r.finger)) / D2R);
      const clipSwitches = rows.slice(1).filter((r, i) => r.clip !== rows[i].clip).length;
      return { rows, steps, err, ft, clipSwitches, maxStep: Math.max(...steps), maxErr: Math.max(...err), holds: steps.filter(s => s < 0.5).length, firing: rows.filter(r => r.fire).length };
    }
    const circle = (stepDeg, n, start = 0) => Array.from({ length: n }, (_, k) => (start + (k + 1) * stepDeg) * D2R);

    // ---------------- A. continuous turning ----------------
    await arena(page, 0); await sleep(300);
    let r = await sweep(circle(3, 240));
    check('A1. No infected: the hero turns with the finger every frame (2 circles, 3° steps: step ≤ 3.5°, no holds, |yaw − finger| ≤ 0.5°)',
      r.maxStep <= 3.5 && r.holds === 0 && r.maxErr <= 0.5, `max step ${r.maxStep.toFixed(1)}°, holds ${r.holds}, max err ${r.maxErr.toFixed(2)}°`);
    await arena(page, 5); await sleep(400);
    r = await sweep(circle(3, 240));
    check('A2. 5 infected around: still continuous — no stick-and-jump of the aim assist (was: 60 holds, 20 jumps up to 12.8°)',
      r.maxStep <= 3.5 && r.holds === 0 && r.maxErr <= 0.5, `max step ${r.maxStep.toFixed(1)}°, holds ${r.holds}, max err ${r.maxErr.toFixed(2)}°`);
    check('A3. Fire held the whole time while turning (stick past the fire threshold) and the stance clip is not restarted',
      r.firing === r.rows.length && r.clipSwitches === 0, `firing ${r.firing}/${r.rows.length}, clip switches ${r.clipSwitches} (${r.rows[0].clip})`);
    const gaps = r.ft.slice(1).map((t, i) => t - r.ft[i]);
    check('A4. Continuous fire: RAVEN shots every 6 sim ticks (600 RPM) during the whole turn — no interruptions', r.ft.length > 20 && gaps.every(g => g === 6), `${r.ft.length} shots, gaps ${[...new Set(gaps)]}`);
    await arena(page, 0); await sleep(200);
    const across = [...Array.from({ length: 21 }, (_, k) => (170 + k) * D2R), ...Array.from({ length: 21 }, (_, k) => (-10 + k) * D2R)];
    r = await sweep(across.slice(0, 21));
    const r2 = await sweep(across.slice(21));
    check('A5. Through ±180° and through 0°: 1° finger steps give 1° turns (the short way, no 359° spin)',
      r.maxStep <= 1.5 && r2.maxStep <= 1.5 && r.maxErr <= 0.5 && r2.maxErr <= 0.5, `±180: max step ${r.maxStep.toFixed(2)}° · 0°: max step ${r2.maxStep.toFixed(2)}°`);
    const before = await snap(page);
    r = await sweep(circle(15, 72), { moveFinger: true });
    const after = await snap(page);
    check('A6. Two fingers, fast circles (15° per frame) while walking: the facing is exactly the finger each frame, fire held, the hero moved',
      r.maxErr <= 0.5 && r.firing === r.rows.length && Math.hypot(after.x - before.x, after.y - before.y) > 0.5, `max err ${r.maxErr.toFixed(2)}°, firing ${r.firing}/${r.rows.length}, moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)} cells, clip switches ${r.clipSwitches}`);
    check('A7. Walking + turning does not restart the leg clips every frame (≤ 2 changes in 72 frames)', r.clipSwitches <= 2, `${r.clipSwitches}`);

    // ---------------- B. aim assist on the shot only ----------------
    await DA(page, () => { const g = window.__DA3TD.game; g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e); clearInterval(window.__pin);
      const p = g.player; Object.assign(p, { x: 10, y: 7.5, prevX: 10, prevY: 7.5 }); const e = g.spawnInfected('hollow', 14, 7.5, Math.PI); e.senseT = 1e9; e.hp = 1e9;
      window.__pin = setInterval(() => { e.x = e.prevX = 14; e.y = e.prevY = 7.5; }, 50); });
    await sleep(300);
    const assist = async angDeg => { const rr = await sweep(Array.from({ length: 30 }, () => angDeg * D2R)); const last = rr.rows[rr.rows.length - 1]; return { face: deg(last.yaw), shot: last.shot === null ? null : deg(last.shot) }; };
    const hp0 = await DA(page, () => window.__DA3TD.game.enemies[0].hp);
    const in6 = await assist(6), out25 = await assist(25);
    const hp1 = await DA(page, () => window.__DA3TD.game.enemies[0].hp);
    check('B1. Finger 6° off an infected: the hero faces the finger (6°), the shot goes to the infected (0°) and hits',
      Math.abs(in6.face - 6) < 0.5 && in6.shot !== null && Math.abs(in6.shot) < 0.5 && hp1 < hp0, JSON.stringify({ in6, hit: hp1 < hp0 }));
    check('B2. Finger 25° off (outside the 11° cone): the shot follows the finger', Math.abs(out25.face - 25) < 0.5 && Math.abs(out25.shot - 25) < 0.5, JSON.stringify(out25));

    // ---------------- C. landscape only ----------------
    await DA(page, () => { const g = window.__DA3TD.game; for (const e of [...g.enemies]) g.removeInfected(e); clearInterval(window.__pin); });
    await DA(page, () => window.__DA3TD.game.startWaves && window.__DA3TD.game.startWaves(1));
    await sleep(300);
    // walking + holding fire, then the phone turns to portrait
    await touch(cdp, 'touchStart', [{ x: mx, y: my, id: 8 }]); await touch(cdp, 'touchMove', [{ x: mx + 60, y: my, id: 8 }]);
    await touch(cdp, 'touchStart', [{ x: mx + 60, y: my, id: 8 }, { x: cx, y: cy, id: 9 }]); await touch(cdp, 'touchMove', [{ x: mx + 60, y: my, id: 8 }, { x: cx + R, y: cy, id: 9 }]);
    await sleep(300);
    const live = await snap(page);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    const pt = await snap(page);
    const ui = await DA(page, () => ({ rotate: getComputedStyle(document.getElementById('rotate')).display !== 'none',
      controls: ['btnDash', 'btnReload', 'btnWeapon', 'btnPause', 'stickL', 'stickR'].filter(id => { const el = document.getElementById(id); return getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; }),
      pausedScreen: !document.getElementById('paused').classList.contains('hidden') }));
    check('C1. Turned to portrait while walking and firing: "rotate the phone" screen, no joysticks / buttons, the run paused',
      live.state === 'play' && live.fire && pt.state === 'paused' && pt.portrait && ui.rotate && !ui.controls.length, JSON.stringify({ live: [live.state, live.fire], now: pt.state, ui }));
    check('C2. Fingers, aim and held fire released (nothing keeps firing / moving)', !pt.fire && !pt.aimActive && pt.mx === 0 && pt.my === 0, JSON.stringify({ fire: pt.fire, aim: pt.aimActive, move: [pt.mx, pt.my] }));
    await sleep(800);
    const pt2 = await snap(page);
    check('C3. Wave progress, health and ammo kept (and frozen while paused)', pt2.wave === live.wave && pt2.hp === live.hp && pt2.mag === pt.mag && pt2.reserve === pt.reserve && pt2.kills === pt.kills && pt2.remaining === pt.remaining,
      JSON.stringify({ live: [live.wave, live.hp, live.mag], portrait: [pt2.wave, pt2.hp, pt2.mag] }));
    await touch(cdp, 'touchEnd', []);
    await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(200);
    check('C4. While portrait, ПРОДОЛЖИТЬ does not resume the game', (await snap(page)).state === 'paused');
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(400);
    const back = await snap(page);
    const ui2 = await DA(page, () => ({ rotate: getComputedStyle(document.getElementById('rotate')).display !== 'none', pausedScreen: !document.getElementById('paused').classList.contains('hidden') }));
    check('C5. Back to landscape: the rotate screen goes away, the game STAYS paused (pause menu shown)', back.state === 'paused' && !back.portrait && !ui2.rotate && ui2.pausedScreen, JSON.stringify({ state: back.state, ui2 }));
    await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(300);
    const res = await snap(page);
    check('C6. ПРОДОЛЖИТЬ resumes with the same wave / health / ammo', res.state === 'play' && res.wave === live.wave && res.hp === live.hp && res.mag === pt.mag, JSON.stringify({ state: res.state, wave: res.wave, hp: res.hp, mag: res.mag }));
    // menus: pause menu open → rotate → back: still the pause menu
    await DA(page, () => document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77 }))); await sleep(200);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
    const pm = await snap(page);
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(300);
    const pm2 = await snap(page);
    check('C7. Pause menu open, phone turned and back: still the pause menu (no auto-resume)', pm.state === 'paused' && pm2.state === 'paused', `${pm.state} → ${pm2.state}`);
    check('C8. No page errors (phone)', !errors.length, errors.slice(0, 2).join(' | '));
    await ctx.close();

    // main menu: portrait → menu stays, ИГРАТЬ does not start a run in portrait; landscape → menu
    const m = await openTD(browser, base, PHONE);
    await m.page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
    await DA(m.page, () => document.getElementById('playBtn').click()); await sleep(300);
    const mm = await snap(m.page);
    await m.page.setViewportSize({ width: 844, height: 390 }); await sleep(300);
    const mm2 = await snap(m.page);
    check('C9. Main menu: portrait shows the rotate screen and ИГРАТЬ waits; back in landscape the menu is still there', mm.state === 'menu' && mm.portrait && mm2.state === 'menu' && !mm2.portrait, `${mm.state}/${mm.portrait} → ${mm2.state}`);
    await m.ctx.close();

    // desktop: a tall window is not a phone in portrait (mouse = fine pointer)
    const dk = await openTD(browser, base, { viewport: { width: 700, height: 900 } });
    await DA(dk.page, () => document.getElementById('playBtn').click()); await sleep(400);
    const dd = await snap(dk.page);
    check('C10. Desktop, tall window: no rotate screen, the game runs', dd.state === 'play' && !dd.portrait, `${dd.state} portrait=${dd.portrait}`);
    await dk.ctx.close();
  } catch (e) { check('test run', false, e.stack); }
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
