// DARK ARENA BUILD 1.3 — automated checks (Playwright + Chromium, mobile emulation).
// Run: node tests/build-1.3.test.js            (needs `playwright` installed: npm i -D playwright)
// Optional: GAME=DARK_ARENA_1_3.html SHOTS=dir node tests/build-1.3.test.js
// Chromium emulation does NOT reproduce Safari zoom or safe areas — the manual iPhone run is still required.
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const GAME = path.resolve(__dirname, '..', process.env.GAME || 'DARK_ARENA_1_3.html');
const URL = 'file://' + GAME + '?debug=1';
const SHOTS = process.env.SHOTS || '';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openGame(browser, device, startGame = true) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  if (startGame) {
    await page.evaluate(() => { document.getElementById('trainingBtn').click(); document.getElementById('playBtn').click(); });
    await page.evaluate(() => window.__DA.noSpawn());
  }
  return { ctx, page, errors, cdp: await ctx.newCDPSession(page) };
}
const setPlayer = (page, x, y, yaw) => page.evaluate(([x, y, yaw]) => { const p = window.__DA.player; p.x = x; p.y = y; p.yaw = yaw; p.pitch = 0; window.__DA.noSpawn(); }, [x, y, yaw]);
const getPlayer = page => page.evaluate(() => { const p = window.__DA.player; return { x: p.x, y: p.y, yaw: p.yaw }; });
async function hold(page, code, ms) { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); await sleep(50); }
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
async function centerOf(page, id) { return page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id); }

(async () => {
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphoneSE = devices['iPhone SE landscape'];
  const iphone14 = devices['iPhone 14 Pro Max landscape'];

  // ---------- 1. Menu flow without errors ----------
  {
    const { ctx, page, errors } = await openGame(browser, desktop, false);
    for (const id of ['trainingBtn', 'playBtn']) await page.click('#' + id);
    await page.keyboard.press('Escape'); await page.click('#pauseSettings'); await page.click('#settingsBack');
    await page.click('#resumeBtn'); await sleep(300);
    const st = await page.evaluate(() => window.__DA.state);
    check('Menu flow: main → training → game → pause → settings → resume', st === 'game' && errors.length === 0, errors.join('; '));
    await ctx.close();
  }

  // ---------- 2. Movement uses yaw (strafe/forward directions) ----------
  {
    const { ctx, page } = await openGame(browser, desktop);
    const cases = [
      { yaw: 0, y0: 8, key: 'KeyD', expect: 'y+' }, { yaw: 0, y0: 3.5, key: 'KeyD', expect: 'y+' }, { yaw: 0, y0: 11, key: 'KeyD', expect: 'y+' },
      { yaw: Math.PI / 2, y0: 8, key: 'KeyD', expect: 'x-' }, { yaw: 0, y0: 8, key: 'KeyA', expect: 'y-' }, { yaw: 0, y0: 8, key: 'KeyW', expect: 'x+' },
      { yaw: Math.PI, y0: 8, key: 'KeyW', expect: 'x-' },
    ];
    for (const c of cases) {
      await setPlayer(page, 8, c.y0, c.yaw);
      await hold(page, c.key, 350);
      const p = await getPlayer(page);
      const dx = p.x - 8, dy = p.y - c.y0;
      const main = c.expect[0] === 'x' ? dx : dy, other = c.expect[0] === 'x' ? dy : dx;
      const ok = (c.expect[1] === '+' ? main > 0.3 : main < -0.3) && Math.abs(other) < 0.02;
      check(`Move ${c.key} at yaw=${c.yaw.toFixed(2)} from y=${c.y0} goes ${c.expect}`, ok, `dx=${dx.toFixed(3)} dy=${dy.toFixed(3)}`);
    }
    await ctx.close();
  }

  // ---------- 3. Wall rendering does not depend on player position ----------
  {
    const { ctx, page } = await openGame(browser, desktop);
    // Positions chosen so the whole field of view (FOV 75°) sees only the flat east wall.
    for (const y of [8, 8.5, 9.57]) {
      await setPlayer(page, 8, y, 0); await sleep(120);
      const z = await page.evaluate(() => Array.from(window.__DA.zbuffer));
      const max = Math.max(...z), min = Math.min(...z);
      // Facing +X at x=8, the east wall (x=15) is 7 units away for every column (perpendicular distance).
      check(`Wall projection at (8, ${y}) facing east: all columns ≈ 7.0`, Math.abs(max - 7) < 0.05 && Math.abs(min - 7) < 0.05, `min=${min.toFixed(3)} max=${max.toFixed(3)}`);
      if (SHOTS && y !== 8.5) await page.screenshot({ path: path.join(SHOTS, `walls_yaw0_y${y}.png`) });
    }
    await ctx.close();
  }

  // ---------- 4. Collisions: walls, sliding, pillar, corner, random fuzz ----------
  {
    const { ctx, page } = await openGame(browser, desktop);
    await setPlayer(page, 13, 8, 0); await hold(page, 'KeyW', 1200);
    let p = await getPlayer(page);
    check('Walk into east wall: stops at radius distance', p.x > 14.6 && p.x <= 15 - 0.26 + 1e-6, `x=${p.x.toFixed(3)}`);
    await setPlayer(page, 14.7, 8, 0.45); await hold(page, 'KeyW', 800);
    p = await getPlayer(page);
    check('Slide along wall when pushing diagonally into it', p.y - 8 > 0.4 && p.x <= 15 - 0.26 + 1e-6, `x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}`);
    await setPlayer(page, 5, 5.5, 0); await hold(page, 'KeyW', 1000);
    p = await getPlayer(page);
    check('Pillar (x=7, rows 5–6) blocks movement', p.x <= 7 - 0.26 + 1e-6 && p.x > 6.5, `x=${p.x.toFixed(3)}`);
    await hold(page, 'KeyD', 1200);
    const p2 = await getPlayer(page);
    check('Strafe along pillar face without sticking', p2.y - p.y > 0.8, `y ${p.y.toFixed(2)} → ${p2.y.toFixed(2)}`);
    await setPlayer(page, 13, 13, Math.PI / 4); await hold(page, 'KeyW', 1500);
    p = await getPlayer(page);
    check('Corner: player stays in valid space', await page.evaluate(([x, y]) => window.__DA.canStand(x, y, 0.259), [p.x, p.y]), `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    await setPlayer(page, 8, 8, 0);
    const fuzz = await page.evaluate(async () => {
      const D = window.__DA, keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD']; let bad = 0, stuck = 0;
      for (let i = 0; i < 160; i++) {
        D.player.yaw = Math.random() * Math.PI * 2;
        const k = keys[i % 4], before = [D.player.x, D.player.y];
        document.dispatchEvent(new KeyboardEvent('keydown', { code: k }));
        await new Promise(r => setTimeout(r, 40));
        document.dispatchEvent(new KeyboardEvent('keyup', { code: k }));
        if (!D.canStand(D.player.x, D.player.y, 0.259) || !Number.isFinite(D.player.x)) bad++;
        if (before[0] === D.player.x && before[1] === D.player.y) stuck++;
      }
      return { bad, stuck };
    });
    check('Random movement fuzz (160 moves): never inside a wall', fuzz.bad === 0, `invalid=${fuzz.bad}, no-move steps=${fuzz.stuck}`);
    await ctx.close();
  }

  // ---------- 5. Settings scroll on small iPhone (touch drag) ----------
  for (const [name, dev] of [['iPhone SE', iphoneSE], ['iPhone 14 Pro Max', iphone14]]) {
    const { ctx, page, cdp } = await openGame(browser, dev, false);
    await page.evaluate(() => document.getElementById('mainSettings').click());
    const info = await page.evaluate(() => { const p = document.querySelector('#settings .panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; });
    // Drag on the label column (left side of the panel), as a player scrolling the list would.
    const c = await page.evaluate(() => { const r = document.querySelector('#settings .panel').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height * 0.7 }; });
    const before = await page.evaluate(() => ['sensX', 'sensY', 'fov', 'hudScale', 'opacity'].map(id => document.getElementById(id).value).join(','));
    await touch(cdp, 'touchStart', [{ x: c.x, y: c.y, id: 1 }]);
    for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', [{ x: c.x, y: c.y - i * 15, id: 1 }]); await sleep(16); }
    await touch(cdp, 'touchEnd', []);
    await sleep(400);
    const res = await page.evaluate(() => { const p = document.querySelector('#settings .panel'); const b = document.getElementById('settingsBack').getBoundingClientRect(); return { top: p.scrollTop, saveVisible: b.bottom <= innerHeight && b.top >= 0 }; });
    const after = await page.evaluate(() => ['sensX', 'sensY', 'fov', 'hudScale', 'opacity'].map(id => document.getElementById(id).value).join(','));
    const needs = info.sh > info.ch;
    check(`${name}: settings panel scrolls by touch`, !needs || res.top > 50, `content ${info.sh}px / visible ${info.ch}px, scrolled ${res.top}px`);
    check(`${name}: "Save" button reachable after scroll`, res.saveVisible);
    check(`${name}: scrolling does not change settings values`, before === after, `${before} → ${after}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `settings_scrolled_${name.replace(/ /g, '_')}.png`) });
    await ctx.close();
  }

  // ---------- 6. Double-tap protection: game layer blocked, menu not ----------
  {
    const { ctx, page } = await openGame(browser, iphone14);
    const probe = async (selector) => page.evaluate(sel => new Promise(res => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const prevented = [];
      const spy = e => prevented.push(e.defaultPrevented);
      addEventListener('touchend', spy);
      const mk = (type, id) => { const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
      mk('touchstart', 1); mk('touchend', 1);
      setTimeout(() => { mk('touchstart', 2); mk('touchend', 2); removeEventListener('touchend', spy); res(prevented); }, 120);
    }), selector);
    const game = await probe('#view');
    check('Double tap on arena: 2nd touchend default prevented (no zoom)', game[0] === false && game[1] === true, JSON.stringify(game));
    const free = await probe('#minimap');
    check('Double tap on HUD (minimap): 2nd touchend prevented', free[1] === true, JSON.stringify(free));
    await page.keyboard.press('Escape');
    const menu = await probe('#paused .panel');
    check('Double tap inside menu: not prevented (menu stays native)', menu[0] === false && menu[1] === false, JSON.stringify(menu));
    await ctx.close();
  }

  // ---------- 7. Multi-touch: move + look + fire simultaneously, then release ----------
  {
    const { ctx, page, cdp } = await openGame(browser, iphone14);
    await setPlayer(page, 8, 8, 0);
    const mv = await centerOf(page, 'move'), fire = await centerOf(page, 'shoot');
    const look = { x: 520, y: 140 };
    const ammo0 = await page.evaluate(() => window.__DA.ammo);
    await touch(cdp, 'touchStart', [{ x: mv.x, y: mv.y, id: 1 }]);
    await touch(cdp, 'touchStart', [{ x: mv.x, y: mv.y, id: 1 }, { x: look.x, y: look.y, id: 2 }]);
    await touch(cdp, 'touchStart', [{ x: mv.x, y: mv.y, id: 1 }, { x: look.x, y: look.y, id: 2 }, { x: fire.x, y: fire.y, id: 3 }]);
    for (let i = 1; i <= 12; i++) { await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 40, id: 1 }, { x: look.x + i * 6, y: look.y, id: 2 }, { x: fire.x, y: fire.y, id: 3 }]); await sleep(40); }
    const mid = await page.evaluate(() => ({ joy: window.__DA.joy, fire: window.__DA.fireHeld, yaw: window.__DA.player.yaw, ammo: window.__DA.ammo, x: window.__DA.player.x }));
    check('3 fingers: joystick active, look turned, fire held', mid.joy[1] < -0.5 && mid.yaw > 0.1 && mid.fire === true, JSON.stringify(mid));
    check('3 fingers: player moved forward and ammo spent', mid.x > 8.2 && mid.ammo < ammo0, `x=${mid.x.toFixed(2)} ammo ${ammo0}→${mid.ammo}`);
    await touch(cdp, 'touchEnd', []);
    await sleep(100);
    const after = await page.evaluate(() => ({ joy: window.__DA.joy, fire: window.__DA.fireHeld, look: window.__DA.lookId }));
    check('All fingers lifted: joystick 0, fire off, look released', after.joy[0] === 0 && after.joy[1] === 0 && after.fire === false && after.look === null, JSON.stringify(after));

    // Stuck-finger scenario: finger down, window loses focus (notification / app switch), finger never lifts.
    await touch(cdp, 'touchStart', [{ x: mv.x, y: mv.y, id: 5 }, { x: fire.x, y: fire.y, id: 6 }]);
    await touch(cdp, 'touchMove', [{ x: mv.x + 40, y: mv.y, id: 5 }, { x: fire.x, y: fire.y, id: 6 }]);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const blurred = await page.evaluate(() => ({ joy: window.__DA.joy, fire: window.__DA.fireHeld }));
    check('Blur while holding: joystick and fire released', blurred.joy[0] === 0 && blurred.fire === false, JSON.stringify(blurred));
    await touch(cdp, 'touchEnd', []);
    await touch(cdp, 'touchStart', [{ x: mv.x, y: mv.y, id: 7 }]);
    await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 40, id: 7 }]);
    const again = await page.evaluate(() => window.__DA.joy);
    await touch(cdp, 'touchEnd', []);
    check('Joystick responds again after forced release', again[1] < -0.5, JSON.stringify(again));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hud_iphone14promax.png') });
    await ctx.close();
  }

  // ---------- 8. HUD controls on screen and touch-sized ----------
  for (const [name, dev] of [['iPhone SE', iphoneSE], ['iPhone 14 Pro Max', iphone14]]) {
    const { ctx, page } = await openGame(browser, dev);
    const r = await page.evaluate(() => ['move', 'shoot', 'reload', 'jump', 'pauseBtn', 'levelBtn'].map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; }));
    const vw = dev.viewport.width, vh = dev.viewport.height;
    const off = r.filter(c => c.l < 0 || c.t < 0 || c.r > vw || c.b > vh).map(c => c.id);
    const small = r.filter(c => ['move', 'shoot', 'reload', 'jump'].includes(c.id) && (c.w < 44 || c.h < 44)).map(c => c.id);
    check(`${name}: HUD controls inside viewport and ≥44px`, !off.length && !small.length, `off=${off} small=${small}`);
    await ctx.close();
  }

  // ---------- 9. Portrait: game pauses ----------
  {
    const { ctx, page } = await openGame(browser, iphone14);
    await page.setViewportSize({ width: 430, height: 932 }); await sleep(200);
    const st = await page.evaluate(() => window.__DA.state);
    check('Rotating to portrait pauses the game', st === 'paused', st);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
