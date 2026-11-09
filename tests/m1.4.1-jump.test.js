// M1.4.1 — jump (sim + desktop + touch). Run: node tests/m1.4.1-jump.test.js
// Part 1 runs the pure simulation in Node; part 2 drives the real page in Chromium (desktop + iPhone emulation).
// Chromium touch emulation ≠ a real iPhone: this proves the logic and the event path, not Safari itself.
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick; const f = () => (__DA3.game.tick - t0 >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const P = page => DA(page, () => { const p = __DA3.game.player; return { x: p.x, y: p.y, z: p.z, vz: p.vz, onGround: p.onGround, jumps: p.jumps, landings: p.landings, yaw: p.yaw }; });
const rectOf = (page, id) => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);

(async () => {
  // ---------------- 1. Pure simulation ----------------
  const src = f => pathToFileURL(path.join(__dirname, '..', 'prototype-3d', 'src', f)).href;
  const map = (await import(src('data/maps/training.js'))).default;
  const { Game } = await import(src('sim/game.js'));
  const { InputState } = await import(src('input/input.js'));
  const C = await import(src('config.js'));
  const setup = () => {
    const g = new Game(map, { rng: () => 0 }); const inp = new InputState();
    Object.assign(g.player, { x: 8, y: 8, prevX: 8, prevY: 8, yaw: 0 });
    const step = (n = 1) => { for (let i = 0; i < n; i++) g.step(inp.update(), 1 / 60); };
    step(1); // adopt the press counter (as after PLAY)
    return { g, inp, step, p: g.player };
  };
  {
    const { inp, step, p } = setup();
    check('Player starts on the floor', p.z === 0 && p.onGround);
    inp.setAction('jump', true); step(1);
    check('Single press: jump starts on the very next tick', !p.onGround && p.z > 0 && p.jumps === 1, `z=${p.z.toFixed(3)}`);
    let apex = 0, n = 0; while (!p.onGround && n < 300) { step(1); apex = Math.max(apex, p.z); n++; }
    const h = apex * C.CELL_SIZE, air = (n + 1) / 60;
    check('Player really rises (~1 m) and gravity brings him back', h > 0.85 && h < 1.15 && air > 0.5 && air < 0.7, `apex ${h.toFixed(2)} m, airtime ${air.toFixed(2)} s`);
    check('Landing: back to z = 0, on the ground, one landing', p.z === 0 && p.onGround && p.landings === 1 && p.vz === 0);
    step(30);
    check('Holding the button does not repeat the jump', p.jumps === 1 && p.onGround, `jumps=${p.jumps}`);
    inp.setAction('jump', false);
  }
  {
    const { inp, step, p } = setup();
    inp.setAction('jump', true); inp.setAction('jump', false); // press + release between two ticks
    step(1);
    check('Tap shorter than one tick is not lost', p.jumps === 1 && p.z > 0);
  }
  {
    const { inp, step, p } = setup();
    inp.setAction('jump', true); step(1); inp.setAction('jump', false);
    let extra = 0;
    for (let i = 0; i < 20; i++) { step(1); if (p.z > 0.2) { inp.setAction('jump', true); inp.setAction('jump', false); extra++; } }
    const top = p.z;
    let n = 0; while (!p.onGround && n < 300) { step(1); n++; }
    check('No jumps in the air (presses while airborne do not add height)', p.jumps === 1, `jumps=${p.jumps}, presses in air=${extra}`);
    check('Air presses never stack: max height stays ≈ 1 m', top * C.CELL_SIZE < 1.15);
  }
  {
    // jump buffer: a press just before touchdown jumps on landing (one extra jump, not infinite)
    const { inp, step, p } = setup();
    inp.setAction('jump', true); inp.setAction('jump', false); step(1);
    while (!(p.vz < 0 && p.z < 0.05)) step(1);
    inp.setAction('jump', true); inp.setAction('jump', false); step(1);
    let n = 0; while (p.jumps < 2 && n < 20) { step(1); n++; }
    check('Press ≤ 0.12 s before landing is buffered → one jump on touchdown', p.jumps === 2 && p.landings === 1, `jumps=${p.jumps} landings=${p.landings}`);
  }
  {
    const { inp, step, p } = setup();
    inp.keyMove.y = 1; inp.setAction('jump', true); inp.setAction('jump', false);
    const x0 = p.x; step(10);
    const vAir = (p.x - x0) / (10 / 60);
    check('Jump while moving: horizontal speed unchanged in the air', !p.onGround && Math.abs(vAir - C.PLAYER_SPEED) < 0.01, `${vAir.toFixed(2)} cells/s`);
  }
  {
    const { g, inp, step, p } = setup();
    const shots = []; g.on('shot', e => shots.push(e));
    inp.setAction('fire', true); inp.setAction('jump', true); step(30); inp.setAction('fire', false);
    const zEye = shots.map(s => s.origin.z);
    check('Jump while firing: automatic fire continues (600 RPM) in the air', shots.length === 5 && p.jumps === 1, `${shots.length} shots`);
    check('Shots come from the eye height during the jump (eye 0.8 cells + jump height)', zEye.every(z => z >= 0.8) && Math.max(...zEye) > 1.0, JSON.stringify(zEye.map(z => z && +z.toFixed(2))));
  }
  {
    const { g, inp, step, p } = setup();
    inp.setAction('jump', true); step(10);
    const z1 = p.z; g.releaseCombat(); inp.clear(); // pause: no sim steps, input cleared
    const z2 = p.z;
    step(1); // resume
    check('Pause mid-jump: height frozen while paused, jump continues after', z1 === z2 && p.z !== z1 && p.jumps === 1);
    let n = 0; while (!p.onGround && n < 300) { step(1); n++; }
    check('…and lands normally after the pause', p.onGround && p.landings === 1);
    inp.setAction('jump', true); inp.setAction('jump', false); g.releaseCombat(); inp.clear(); step(5);
    check('A press made right before pausing does not fire a jump on resume', p.jumps === 1, `jumps=${p.jumps}`);
  }

  // ---------------- 2. In the browser ----------------
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone = devices['iPhone 14 Pro Max landscape'], iphone11 = devices['iPhone 11 landscape'], se = devices['iPhone SE landscape'];

  // Desktop: Space
  {
    const { ctx, page, errors } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(8, 8, 0));
    // poll every frame: software rendering is slow (100–300 ms per frame), the whole jump lasts 0.6 s
    await DA(page, () => { window.__cam = 0; window.__zmax = 0; const f = () => { window.__cam = Math.max(window.__cam, __DA3.view.camera.position.y); window.__zmax = Math.max(window.__zmax, __DA3.game.player.z); if (window.__cam >= 0) requestAnimationFrame(f); }; f(); });
    await page.keyboard.down('Space'); await ticks(page, 6);
    const a = await P(page); a.z = await DA(page, () => window.__zmax);
    const camY = await DA(page, () => window.__cam);
    await page.keyboard.up('Space');
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.onGround ? r() : requestAnimationFrame(f)); f(); }));
    const b = await P(page);
    check('PC: Space jumps, the camera rises, then lands', a.z > 0.1 && camY > 1.7 && b.onGround && b.jumps === 1 && !errors.length, `z=${a.z.toFixed(2)} cam=${camY.toFixed(2)} m`);
    await ctx.close();
  }

  // Touch: one tap on ПРЫЖОК
  for (const [name, dev] of [['iPhone 14 Pro Max', iphone], ['iPhone 11', iphone11]]) {
    const { ctx, page, cdp, errors } = await open(browser, base, dev);
    await DA(page, () => __DA3.setPlayer(8, 8, 0));
    const j = await rectOf(page, 'jump');
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 1 }]); await touch(cdp, 'touchEnd', []);
    await ticks(page, 8);
    const a = await P(page);
    check(`${name}: first tap on ПРЫЖОК jumps`, a.jumps === 1 && !errors.length, `jumps=${a.jumps} z=${a.z.toFixed(2)}`);
    // hold: one jump only
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.onGround ? r() : requestAnimationFrame(f)); f(); }));
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 2 }]); await ticks(page, 90);
    const h = await P(page); await touch(cdp, 'touchEnd', []);
    check(`${name}: holding ПРЫЖОК = one jump, no bunny-hopping`, h.jumps === 2 && h.onGround, `jumps=${h.jumps}`);
    const vis = j.l >= 0 && j.t >= 0 && j.r <= dev.viewport.width && j.b <= dev.viewport.height && j.w >= 44 && j.h >= 44;
    check(`${name}: ПРЫЖОК on screen and ≥ 44 px`, vis, JSON.stringify(j));
    await ctx.close();
  }

  // Small screen + scaled HUD + moved button
  {
    const { ctx, page, cdp } = await open(browser, base, se);
    await DA(page, () => { __DA3.settings.hudScale = 0.8; __DA3.hud.layoutNow(); __DA3.setPlayer(8, 8, 0); });
    let j = await rectOf(page, 'jump');
    const ok1 = j.l >= 0 && j.t >= 0 && j.r <= se.viewport.width && j.b <= se.viewport.height && j.w >= 44;
    await DA(page, () => { const L = __DA3.hud.layout; L.jump.x = 0.70; L.jump.y = 0.30; __DA3.hud.setLayout(L); });
    j = await rectOf(page, 'jump');
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 1 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 6);
    const a = await P(page);
    check('iPhone SE landscape, HUD ×0.8: ПРЫЖОК fits; after moving it in the HUD layout it still jumps', ok1 && a.jumps === 1, JSON.stringify({ j, jumps: a.jumps }));
    await ctx.close();
  }

  // Multitouch: move + look + fire + jump at once; neighbours not triggered
  {
    const { ctx, page, cdp } = await open(browser, base, iphone);
    await DA(page, () => { __DA3.setPlayer(8, 8, 0); __DA3.gs.setAmmo(30, 120); window.__f = 0; __DA3.game.on('fire', () => window.__f++); });
    const fire = await rectOf(page, 'fire'), jump = await rectOf(page, 'jump');
    const mv = { x: 110, y: 290 }, look = { x: 470, y: 150 };
    await touch(cdp, 'touchStart', [{ ...mv, id: 1 }]);
    await touch(cdp, 'touchStart', [{ ...mv, id: 1 }, { ...look, id: 2 }]);
    await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 50, id: 1 }, { x: look.x + 10, y: look.y, id: 2 }]);
    const pts = [{ x: mv.x, y: mv.y - 50, id: 1 }, { x: look.x + 10, y: look.y, id: 2 }, { x: fire.x, y: fire.y, id: 3 }];
    await touch(cdp, 'touchStart', pts); await ticks(page, 3);
    const p0 = await P(page), yaw0 = p0.yaw;
    await touch(cdp, 'touchStart', [...pts, { x: jump.x, y: jump.y, id: 4 }]); await ticks(page, 6);
    for (let i = 1; i <= 4; i++) { await touch(cdp, 'touchMove', [pts[0], { x: look.x + 10 + i * 8, y: look.y, id: 2 }, pts[2], { x: jump.x, y: jump.y, id: 4 }]); await sleep(20); }
    const p1 = await P(page);
    const st = await DA(page, () => ({ t: __DA3.touch, fires: window.__f, aim: __DA3.input.aimToggle, reloading: __DA3.gs.weapon.reloading }));
    await touch(cdp, 'touchEnd', []);
    check('Multitouch: move + look + fire + jump together (in the air, still moving, turning and firing)', p1.jumps === 1 && (p1.x !== p0.x) && p1.yaw !== yaw0 && st.fires >= 2, JSON.stringify({ jumps: p1.jumps, fires: st.fires, dyaw: +(p1.yaw - yaw0).toFixed(3) }));
    check('Jump finger does not trigger neighbours (ПРИЦЕЛ / ПЕРЕЗАР.)', !st.aim && !st.reloading, JSON.stringify(st.t.roles));
    await ctx.close();
  }

  // Pause mid-jump and focus loss
  {
    const { ctx, page, cdp } = await open(browser, base, iphone);
    await DA(page, () => __DA3.setPlayer(8, 8, 0));
    const j = await rectOf(page, 'jump');
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 1 }]); await ticks(page, 10);
    await DA(page, () => document.getElementById('pauseBtn').click()); await sleep(50);
    const a = await P(page); await sleep(300); const b = await P(page);
    const held = await DA(page, () => __DA3.input.actions.jump);
    check('Pause mid-jump: position frozen, jump input released', a.z === b.z && a.z > 0 && !held, `z=${a.z.toFixed(3)}`);
    await touch(cdp, 'touchEnd', []);
    await DA(page, () => __DA3.show('play'));
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.onGround ? r() : requestAnimationFrame(f)); f(); }));
    const c = await P(page);
    check('Resume: lands, no extra jump', c.onGround && c.jumps === 1 && c.landings === 1);
    // focus loss while the button is held → released, no stuck jump
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 2 }]); await ticks(page, 2);
    await DA(page, () => { dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); __DA3.show('paused'); });
    await touch(cdp, 'touchEnd', []);
    await DA(page, () => __DA3.show('play'));
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.onGround ? r() : requestAnimationFrame(f)); f(); }));
    await ticks(page, 60);
    const d = await P(page);
    const st = await DA(page, () => ({ jump: __DA3.input.actions.jump, roles: __DA3.touch.count }));
    check('Focus loss: jump released, no repeated/stuck jumps, next tap works', d.jumps === 2 && d.onGround && !st.jump && st.roles === 0, JSON.stringify({ jumps: d.jumps, ...st }));
    await touch(cdp, 'touchStart', [{ x: j.x, y: j.y, id: 3 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 5);
    check('After focus loss the next tap jumps again', (await P(page)).jumps === 3);
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
