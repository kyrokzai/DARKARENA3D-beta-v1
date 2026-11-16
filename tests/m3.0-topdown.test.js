// M3.0 TOPDOWN — browser test: loading of the owner models, twin-stick touch (real CDP touches, multitouch),
// buttons, pause / pointer release, desktop mouse aim + fire, GLB clips driven by the sim, render budget, screenshots.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve, makeChecker, sleep, touch } = require('./lib/harness');

const SHOTS = path.join(__dirname, '..', 'docs', 'm3.0');
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function openTD(browser, base, ctxOpts, { gfx = 'performance' } = {}) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + '/prototype-3d/topdown.html?debug=1&gfx=' + gfx);
  await page.waitForFunction(() => window.__DA3TD, null, { timeout: 60000 });
  return { ctx, page, errors, cdp };
}
const S = page => page.evaluate(() => { const T = window.__DA3TD, p = T.game.player, w = T.game.state.weapon;
  return { state: T.state, x: p.x, y: p.y, yaw: p.yaw, dashes: p.dashes || 0, mag: w.mag, reloading: w.reloading, short: w.short,
    fire: T.input.actions.fire, mx: T.td.move.x, my: T.td.move.y, shots: T.game.weapon.totalShots || 0, clip: T.view.hero.clip }; });
const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const { check, results } = makeChecker();
  try {
    // ---------------- phone (landscape) ----------------
    const { ctx, page, errors, cdp } = await openTD(browser, base, PHONE);
    const info = await page.evaluate(() => ({ models: Object.keys(window.__DA3TD.view).length > 0, ver: window.__DA3TD.VERSION, load: document.getElementById('loadText').textContent }));
    check('Top-down page loads the four owner models (hero, walker, brute, mutant)', info.load === 'ГОТОВО', info.load);
    await page.evaluate(() => document.getElementById('playBtn').click()); await sleep(400);
    // the run plays the real wave 1: keep the hero alive so the controls checks below do not depend on how fast the
    // infected arrive (a slow software-GL machine took long enough for them to kill the standing hero → "aim right" read a dead hero)
    await page.evaluate(() => { setInterval(() => { const g = window.__DA3TD.game; if (!g.player.dead) g.state.setHealth(100); }, 100); });
    let s = await S(page);
    check('ИГРАТЬ starts a run', s.state === 'play' && s.clip === 'Idle', `${s.state} ${s.clip}`);
    const buttons = await page.evaluate(() => ['btnDash', 'btnReload', 'btnWeapon', 'btnMelee', 'btnPause'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }));
    check('Touch buttons visible, inside the screen, ≥ 44 px', buttons.every(b => b.in && b.w >= 44 && b.h >= 44), JSON.stringify(buttons.map(b => b.id + ':' + Math.round(b.w))));
    const overlap = await page.evaluate(() => {
      const ids = ['btnDash', 'btnReload', 'btnWeapon', 'btnMelee', 'btnPause', 'tdCards', 'tdWave', 'tdHpText', 'tdTasks']; // M3.2 HUD (REF-02)
      const r = ids.map(id => [id, document.getElementById(id).getBoundingClientRect()]), hits = [];
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], b = r[j][1];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(r[i][0] + '×' + r[j][0]); }
      return hits;
    });
    check('Buttons overlap neither each other nor the HUD texts (844×390)', overlap.length === 0, overlap.join(', '));

    // left stick → move right (screen right = +x)
    const x0 = s.x;
    await touch(cdp, 'touchStart', [{ x: 150, y: 260, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch(cdp, 'touchMove', [{ x: 150 + i * 10, y: 260, id: 1 }]); await sleep(16); }
    await sleep(700);
    s = await S(page);
    check('Left stick: the hero walks in the stick direction (screen right → +x)', s.x > x0 + 0.6 && s.mx > 0.8, `dx=${(s.x - x0).toFixed(2)} cells, stick ${s.mx.toFixed(2)}`);
    check('Walking plays a step clip', s.clip === 'Walk' || s.clip === 'Run', s.clip);
    // + right stick at the same time → aim up and fire (multitouch)
    const shots0 = s.shots;
    // M3.2: the right thumb lands on the aim ring in the bottom-right corner (REF-02 layout)
    await touch(cdp, 'touchStart', [{ x: 210, y: 260, id: 1 }, { x: 760, y: 300, id: 2 }]); // finger 1 stays where it is
    for (let i = 1; i <= 6; i++) { await touch(cdp, 'touchMove', [{ x: 210, y: 260, id: 1 }, { x: 760, y: 300 - i * 10, id: 2 }]); await sleep(16); }
    await sleep(500);
    s = await S(page);
    check('Right stick: aim follows the stick (screen up → yaw −90°)', ang(s.yaw, -Math.PI / 2) < 0.25, `yaw ${(s.yaw * 180 / Math.PI).toFixed(0)}°`);
    check('Right stick pushed past the fire ring fires (auto)', s.fire && s.shots > shots0 + 2, `${s.shots - shots0} shots`);
    check('Both thumbs at once: still moving while aiming / firing', Math.abs(s.mx) > 0.5, `move ${s.mx.toFixed(2)}`);
    await page.screenshot({ path: path.join(SHOTS, 'iphone_landscape_fire.png') });
    await touch(cdp, 'touchEnd', []); await sleep(150);
    s = await S(page);
    check('Lifting the fingers stops moving and firing', !s.fire && s.mx === 0 && s.my === 0);

    // buttons
    const tap = async id => { const r = await page.evaluate(i => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
      await touch(cdp, 'touchStart', [{ ...r, id: 9 }]); await sleep(60); await touch(cdp, 'touchEnd', []); await sleep(120); };
    const d0 = s.dashes; await tap('btnDash'); await sleep(250); s = await S(page);
    check('РЫВОК dashes (once per tap)', s.dashes === d0 + 1, `${d0} → ${s.dashes}`);
    await tap('btnReload'); s = await S(page);
    check('ПЕРЕЗ. starts a reload of a partly empty magazine', s.reloading || s.mag === 30, `mag ${s.mag}`);
    await sleep(1600); await tap('btnWeapon'); await sleep(900); s = await S(page);
    check('ОРУЖ. switches to the next weapon of the M2.0 loadout', s.short === 'AK-47', s.short);
    // aim stick while a button is held: the button keeps its own finger
    await touch(cdp, 'touchStart', [{ x: 745, y: 300, id: 3 }]); await sleep(30);
    await touch(cdp, 'touchMove', [{ x: 805, y: 300, id: 3 }]); await sleep(250);
    // the facing is set when a frame is drawn: wait for two rendered frames, not only a fixed pause (software GL is slow
    // right after a weapon switch — the fixed 250 ms read the previous facing here)
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    s = await S(page);
    check('Aim to the right → yaw 0°', ang(s.yaw, 0) < 0.25, `yaw ${(s.yaw * 180 / Math.PI).toFixed(0)}°`);
    await page.evaluate(() => document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'touch' })));
    await sleep(150); s = await S(page);
    check('Pause button (with a finger still on the aim stick) pauses and releases every control', s.state === 'paused' && !s.fire && s.mx === 0, s.state);
    await touch(cdp, 'touchEnd', []);
    await page.evaluate(() => document.getElementById('resumeBtn').click()); await sleep(200);

    // infected with the owner models, clips from the sim
    await page.evaluate(() => { const g = window.__DA3TD.game; g.restart({ waves: false }); g.startWaves(3); });
    await page.waitForFunction(() => window.__DA3TD.game.enemies.length >= 3, null, { timeout: 30000 });
    await sleep(2500);
    const inf = await page.evaluate(() => { const T = window.__DA3TD; return { types: [...new Set(T.game.enemies.map(e => e.def.id))], clips: T.game.enemies.map(e => T.view.infected.stats.clips[e.id]), calls: T.view.renderer.info.render.calls, tris: T.view.renderer.info.render.triangles }; });
    check('Infected drawn with their models and moving clips', inf.clips.length >= 3 && inf.clips.every(c => ['Walk', 'Run', 'Idle', 'Attack', 'Hit'].includes(c)), inf.types.join(',') + ' / ' + inf.clips.join(','));
    check('Render budget: draw calls ≤ 90, triangles ≤ 250 k', inf.calls <= 90 && inf.tris <= 250000, `${inf.calls} calls, ${(inf.tris / 1000).toFixed(0)} k tris`);
    // let them come close, then a close-up screenshot
    await page.waitForFunction(() => { const T = window.__DA3TD, p = T.game.player; return T.game.enemies.some(e => Math.hypot(e.x - p.x, e.y - p.y) < 3.5); }, null, { timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'iphone_landscape_infected.png') });
    // kill one and check the death clip
    await page.evaluate(() => { const T = window.__DA3TD, e = T.game.enemies.find(x => x.alive); e.applyDamage ? e.applyDamage(9999, 'body', { x: 1, y: 0 }) : (e.hp = 0); });
    await sleep(400);
    const dead = await page.evaluate(() => { const T = window.__DA3TD; return T.game.enemies.filter(e => !e.alive).map(e => T.view.infected.stats.clips[e.id]); });
    check('A killed infected plays its death clip', dead.length > 0 && dead.every(c => c === 'Death'), dead.join(','));
    check('No page errors on the phone', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();

    // ---------------- portrait phone: landscape only (owner decision after the iPhone test) ----------------
    // Was: "Portrait phone: buttons inside the screen" (portrait play). Now portrait shows the rotate screen instead.
    const pr = await openTD(browser, base, { ...PHONE, viewport: { width: 390, height: 844 } });
    await pr.page.evaluate(() => document.getElementById('playBtn').click()); await sleep(600);
    const pb = await pr.page.evaluate(() => ({ state: window.__DA3TD.state, rotate: getComputedStyle(document.getElementById('rotate')).display !== 'none',
      controls: ['btnDash', 'btnReload', 'btnWeapon', 'btnMelee', 'btnPause'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none' && document.getElementById(id).getBoundingClientRect().width > 0) }));
    check('Portrait phone: "rotate the phone" screen, no game controls, the run does not start', pb.rotate && !pb.controls.length && pb.state !== 'play', JSON.stringify(pb));
    await pr.page.screenshot({ path: path.join(SHOTS, 'iphone_portrait.png') });
    await pr.ctx.close();

    // ---------------- desktop: mouse aim + fire ----------------
    const dk = await openTD(browser, base, { viewport: { width: 1280, height: 720 } });
    await dk.page.evaluate(() => document.getElementById('playBtn').click()); await sleep(400);
    const frames2 = pg => pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // software GL: wait for drawn frames, not a fixed pause
    await dk.page.mouse.move(1150, 360); await sleep(250); await frames2(dk.page);
    let k = await S(dk.page);
    check('PC: the hero faces the mouse (right of the screen → yaw ≈ 0°)', ang(k.yaw, 0) < 0.3, `yaw ${(k.yaw * 180 / Math.PI).toFixed(0)}°`);
    await dk.page.mouse.move(640, 80); await sleep(250); await frames2(dk.page); k = await S(dk.page);
    // M3.2: the camera leads towards the aim (and flies in from the menu), so the hero is not at the screen centre —
    // the requirement is that he faces the point under the mouse (projected on the shot plane), i.e. roughly "up"
    const want = await dk.page.evaluate(() => { const T = window.__DA3TD, pt = T.view.screenToSim(640, 80, 1.15), p = T.game.player; return Math.atan2(pt.y - p.y, pt.x - p.x); });
    check('PC: mouse above the hero → the hero faces the point under the mouse (up-ish)', ang(k.yaw, want) < 0.12 && Math.sin(k.yaw) < -0.7, `yaw ${(k.yaw * 180 / Math.PI).toFixed(0)}°, point ${(want * 180 / Math.PI).toFixed(0)}°`);
    const sh = k.shots; await dk.page.mouse.down(); await sleep(500); await dk.page.mouse.up(); await sleep(100); k = await S(dk.page);
    check('PC: holding the left button fires', k.shots > sh + 2, `${k.shots - sh} shots`);
    await dk.page.screenshot({ path: path.join(SHOTS, 'desktop_1280x720.png') });
    check('No page errors on desktop', dk.errors.length === 0, dk.errors.slice(0, 2).join(' | '));
    await dk.ctx.close();
  } catch (e) { check('test run without exceptions', false, e.message); }
  await browser.close(); srv.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
