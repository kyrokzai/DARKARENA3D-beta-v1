// DARK ARENA 3D prototype (M0) — browser tests. Playwright + Chromium; serves the repo on a local port.
// Run: node tests/prototype-m0.test.js   (needs `playwright`; SHOTS=dir to save screenshots)
// IMPORTANT: Chromium (desktop or iPhone emulation) is not iOS Safari. It does not reproduce Safari zoom,
// real safe-area insets or iPhone GPU performance. Headless Chromium renders WebGL in software (SwiftShader).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(p.endsWith('/') ? p + 'index.html' : p, (err, data) => {
        if (err) { rsp.writeHead(404); return rsp.end(); }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p) || '.html'] || 'application/octet-stream' });
        rsp.end(data);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function open(browser, base, contextOpts, { play = true, throttle = 0, init = null } = {}) {
  const ctx = await browser.newContext(contextOpts);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // M1.6: the game ships a 2× arena; the M0 checks are about the original Training Grounds grid (BUILD 1.3 wall count,
  // the east wall at x = 15), so they keep running on that map through the debug-only switch &map=training.
  await page.goto(base + '/prototype-3d/?debug=1&map=training');
  await page.waitForFunction(() => window.__DA3, null, { timeout: 15000 });
  if (play) { await page.evaluate(() => document.getElementById('playBtn').click()); await sleep(150); }
  return { ctx, page, errors, cdp };
}
const P = page => page.evaluate(() => window.__DA3.player);
const setP = (page, x, y, yaw = 0, pitch = 0) => page.evaluate(a => window.__DA3.setPlayer(...a), [x, y, yaw, pitch]);
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
// Hold a key for `ms` of SIMULATED time (ms × 60 Hz ticks). The loop caps catch-up at 8 steps per frame, so on a slow
// software-rendered headless browser wall-clock holds gave the player less movement than the assertions expect.
async function holdKey(page, code, ms) {
  const t0 = await page.evaluate(() => window.__DA3.game.tick);
  await page.keyboard.down(code);
  await page.waitForFunction(([t0, n]) => window.__DA3.game.tick - t0 >= n, [t0, Math.round(ms * 60 / 1000)], { timeout: Math.max(10000, ms * 20), polling: 'raf' });
  await page.keyboard.up(code); await sleep(60);
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone14 = devices['iPhone 14 Pro Max landscape'];
  const iphoneSE = devices['iPhone SE landscape'];

  // ---------- 1. Start without errors; scene built ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { play: false });
    const menuVisible = await page.isVisible('#menu');
    await page.click('#playBtn'); await sleep(500);
    const d = await page.evaluate(() => ({ state: __DA3.state, walls: __DA3.wallCount, info: __DA3.info, lock: !!document.pointerLockElement, three: !!document.querySelector('canvas#view') }));
    check('Loads without JS errors; menu shown first', menuVisible && errors.length === 0, errors.join(' | '));
    check('Play: state=play, canvas created, Pointer Lock engaged', d.state === 'play' && d.three && d.lock, JSON.stringify({ state: d.state, lock: d.lock }));
    check('Map: 66 wall cells instanced (same grid as BUILD 1.3)', d.walls === 66, `walls=${d.walls}`);
    check('Draw calls ≤ 20 and triangles ≤ 5k (budget for M0 arena)', d.info.calls > 0 && d.info.calls <= 20 && d.info.triangles <= 5000, JSON.stringify(d.info));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'desktop_1280x720.png') });
    await ctx.close();
  }

  // ---------- 2. Map rendering: pixels, camera height, scale ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await setP(page, 8, 8, 0);
    const px = await page.evaluate(() => __DA3.sample(12));
    const lum = px.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
    const lit = lum.filter(v => v > 12).length, distinct = new Set(px.map(p => p.join(','))).size;
    check('Scene is rendered (not blank): lit samples and texture variety', lit > 30 && distinct > 25, `lit=${lit}/144 distinct=${distinct}`);
    // Look straight at the east wall from 1.5 m: centre must be wall texture, much brighter than fog.
    await setP(page, 14, 8, 0);
    const near = await page.evaluate(() => __DA3.sample(3));
    const c = near[4], cl = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    check('Wall visible in front at close range', cl > 18, `centre rgb=${c}`);
    const cam = await page.evaluate(() => __DA3.camera);
    check('Camera: eye 1.6 m, cell→metres ×2', Math.abs(cam.y - 1.6) < 1e-6 && Math.abs(cam.x - 28) < 1e-6 && Math.abs(cam.z - 16) < 1e-6, JSON.stringify(cam));
    await ctx.close();
  }

  // ---------- 3. Movement (keyboard) and 4. collisions in the real page ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    for (const [yaw, key, axis, sign] of [[0, 'KeyW', 'x', 1], [0, 'KeyD', 'y', 1], [0, 'KeyA', 'y', -1], [Math.PI / 2, 'KeyD', 'x', -1], [Math.PI, 'KeyS', 'x', 1]]) {
      await setP(page, 8, 8, yaw);
      await holdKey(page, key, 300);
      const p = await P(page), d = { x: p.x - 8, y: p.y - 8 }, other = axis === 'x' ? d.y : d.x;
      check(`Key ${key} at yaw ${(yaw * 180 / Math.PI).toFixed(0)}° moves ${sign > 0 ? '+' : '−'}${axis}`, Math.sign(d[axis]) === sign && Math.abs(d[axis]) > 0.4 && Math.abs(other) < 1e-6, `dx=${d.x.toFixed(3)} dy=${d.y.toFixed(3)}`);
    }
    await setP(page, 13, 8, 0); await holdKey(page, 'KeyW', 1200);
    let p = await P(page);
    check('Collision: stops at wall (radius 0.26 cell)', p.x > 14.65 && p.x <= 14.74 + 1e-9, `x=${p.x.toFixed(3)}`);
    await setP(page, 14.7, 8, 0.45); await holdKey(page, 'KeyW', 700);
    p = await P(page);
    check('Collision: smooth slide along wall', p.y - 8 > 0.5 && p.x <= 14.74 + 1e-9, `x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}`);
    await setP(page, 5, 5.5, 0); await holdKey(page, 'KeyW', 900); await holdKey(page, 'KeyD', 900);
    p = await P(page);
    check('Collision: pillar blocks, then strafe along its face', p.x <= 6.74 + 1e-9 && p.y > 7, `x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}`);
    // Interpolated camera never inside a wall during movement
    const camOk = await page.evaluate(async () => {
      __DA3.setPlayer(13, 8, 0.2); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      let ok = true;
      for (let i = 0; i < 40; i++) { await new Promise(r => requestAnimationFrame(r)); const c = __DA3.camera; if (!__DA3.canStand(c.x / 2, c.z / 2, 0.2)) ok = false; }
      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      return ok;
    });
    check('Rendered camera position never clips into walls', camOk);
    await ctx.close();
  }

  // ---------- 5. Mouse look (Pointer Lock) + sensitivity setting ----------
  {
    // A real click is required: browsers grant Pointer Lock only on a user gesture.
    const { ctx, page } = await open(browser, base, desktop, { play: false });
    await page.click('#playBtn'); await sleep(200);
    check('Real click on PLAY engages Pointer Lock', await page.evaluate(() => !!document.pointerLockElement));
    await setP(page, 8, 8, 1);
    // Headless Chromium does not report movementX for hover moves under Pointer Lock, so we deliver
    // locked-mouse events with explicit movementX/Y (exactly what a real locked mouse produces).
    const mouse = (mx, my) => page.evaluate(([mx, my]) => { for (let i = 0; i < 5; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx / 5, movementY: my / 5 })); }, [mx, my]).then(() => sleep(60));
    const p0 = await P(page);
    await mouse(100, 0);
    const p1 = await P(page);
    await mouse(0, -50);
    const p2 = await P(page);
    check('Mouse right → turn right (yaw grows)', p1.yaw - p0.yaw > 0.15, `Δyaw=${(p1.yaw - p0.yaw).toFixed(3)} rad for 100 counts`);
    check('Mouse up → look up (pitch grows)', p2.pitch - p1.pitch > 0.05, `Δpitch=${(p2.pitch - p1.pitch).toFixed(3)}`);
    await page.evaluate(() => { __DA3.settings.mouseSens = 2; });
    await mouse(100, 0);
    const p3 = await P(page);
    const r = (p3.yaw - p2.yaw) / (p1.yaw - p0.yaw);
    check('Mouse sensitivity setting scales turn rate (×2)', Math.abs(r - 2) < 0.15, `ratio=${r.toFixed(2)}`);
    await page.keyboard.press('Escape'); await sleep(200);
    const st = await page.evaluate(() => __DA3.state);
    check('Esc releases mouse and pauses', st === 'paused', st);
    await ctx.close();
  }
  // ---------- 5b. Fallback when Pointer Lock is refused: hold left button and drag ----------
  {
    const refuse = () => { Element.prototype.requestPointerLock = function () { setTimeout(() => document.dispatchEvent(new Event('pointerlockerror'))); return Promise.reject(new Error('denied')); }; };
    const { ctx, page } = await open(browser, base, desktop, { play: false, init: refuse });
    await page.click('#playBtn'); await sleep(150);
    await setP(page, 8, 8, 1);
    const lock = await page.evaluate(() => !!document.pointerLockElement);
    await page.mouse.move(600, 360); await page.mouse.down();
    await page.mouse.move(700, 360, { steps: 5 }); await page.mouse.up(); await sleep(80);
    const p = await P(page);
    await page.mouse.move(800, 360, { steps: 5 }); await sleep(80);
    const q = await P(page);
    check('No lock → drag-to-look works, plain hover does not turn', !lock && p.yaw - 1 > 0.15 && Math.abs(q.yaw - p.yaw) < 1e-9, `lock=${lock} Δdrag=${(p.yaw - 1).toFixed(3)} Δhover=${(q.yaw - p.yaw).toFixed(3)}`);
    await page.keyboard.press('Escape'); await sleep(100);
    check('No lock → Esc pauses', (await page.evaluate(() => __DA3.state)) === 'paused');
    await ctx.close();
  }

  // ---------- 6. Mobile: multitouch joystick + look, release, zoom guards, safe area ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone14);
    await setP(page, 8, 8, 0);
    const vw = iphone14.viewport.width, vh = iphone14.viewport.height;
    const stick = { x: 110, y: vh - 100 }, look = { x: vw * 0.7, y: vh * 0.5 };
    await touch(cdp, 'touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
    await touch(cdp, 'touchStart', [{ x: stick.x, y: stick.y, id: 1 }, { x: look.x, y: look.y, id: 2 }]);
    for (let i = 1; i <= 15; i++) { await touch(cdp, 'touchMove', [{ x: stick.x, y: stick.y - 50, id: 1 }, { x: look.x + i * 8, y: look.y, id: 2 }]); await sleep(30); }
    const mid = await page.evaluate(() => ({ p: __DA3.player, t: __DA3.touch }));
    check('Two fingers at once: joystick active + look active', mid.t.roles.includes('move') && mid.t.roles.includes('look'), JSON.stringify(mid.t));
    check('Joystick moves forward while look turns right', mid.p.yaw > 0.2 && mid.p.yaw < 1.6 && Math.hypot(mid.p.x - 8, mid.p.y - 8) > 0.3, `yaw=${mid.p.yaw.toFixed(2)} pos=(${mid.p.x.toFixed(2)},${mid.p.y.toFixed(2)})`);
    // 120 px of 932 px safe width at 170° → ~21.9°
    const expected = 120 / vw * 170 * Math.PI / 180;
    check('Look sensitivity = degrees per screen width (device-independent)', Math.abs(mid.p.yaw - expected) < 0.05, `yaw=${mid.p.yaw.toFixed(3)} expected≈${expected.toFixed(3)}`);
    await touch(cdp, 'touchEnd', []); await sleep(80);
    const rel = await page.evaluate(() => __DA3.touch);
    check('Lifting fingers releases joystick and look', rel.count === 0 && rel.stick.x === 0 && rel.stick.y === 0, JSON.stringify(rel));
    // Dead zone: tiny thumb movement does not move the player
    await touch(cdp, 'touchStart', [{ x: stick.x, y: stick.y, id: 3 }]);
    await touch(cdp, 'touchMove', [{ x: stick.x + 4, y: stick.y - 4, id: 3 }]);
    const dz = await page.evaluate(() => __DA3.touch.stick);
    check('Joystick dead zone ignores ~6 px jitter', dz.x === 0 && dz.y === 0, JSON.stringify(dz));
    // Stuck finger: blur while holding
    await touch(cdp, 'touchMove', [{ x: stick.x + 60, y: stick.y, id: 3 }]);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const bl = await page.evaluate(() => __DA3.touch);
    check('Blur while holding joystick → released (no auto-walk)', bl.count === 0 && bl.stick.x === 0, JSON.stringify(bl));
    await touch(cdp, 'touchEnd', []);
    // A third finger is ignored while two roles are taken
    await touch(cdp, 'touchStart', [{ x: stick.x, y: stick.y, id: 4 }, { x: look.x, y: look.y, id: 5 }]);
    await touch(cdp, 'touchStart', [{ x: stick.x, y: stick.y, id: 4 }, { x: look.x, y: look.y, id: 5 }, { x: look.x - 100, y: look.y + 40, id: 6 }]);
    const three = await page.evaluate(() => __DA3.touch);
    await touch(cdp, 'touchEnd', []);
    check('Third finger does not steal joystick/look', three.count === 2 && three.roles.includes('move') && three.roles.includes('look'), JSON.stringify(three));
    // Zoom guards (wait so the previous real touch is outside the 350 ms double-tap window)
    await sleep(500);
    const dbl = await page.evaluate(sel => new Promise(res => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, out = [];
      const spy = e => out.push(e.defaultPrevented); addEventListener('touchend', spy);
      const mk = (type, id) => { const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
      mk('touchstart', 1); mk('touchend', 1); setTimeout(() => { mk('touchstart', 2); mk('touchend', 2); removeEventListener('touchend', spy); res(out); }, 120);
    }), '#view');
    check('Double tap on 3D view: second tap blocked (no zoom)', dbl[0] === false && dbl[1] === true, JSON.stringify(dbl));
    const ta = await page.evaluate(() => ({ game: getComputedStyle(document.getElementById('game')).touchAction, menu: getComputedStyle(document.querySelector('.screen')).touchAction }));
    check('touch-action: none on game layer, pan-y on menus', ta.game === 'none' && ta.menu === 'pan-y', JSON.stringify(ta));
    if (SHOTS) {
      await setP(page, 3, 12.5, -0.6);
      await touch(cdp, 'touchStart', [{ x: stick.x + 10, y: stick.y - 10, id: 9 }]);
      await touch(cdp, 'touchMove', [{ x: stick.x + 10, y: stick.y - 45, id: 9 }]);
      await sleep(150);
      await page.screenshot({ path: path.join(SHOTS, 'iphone14promax_landscape.png') });
      await touch(cdp, 'touchEnd', []);
    }
    // Simulated notch: safe-area insets via CSS variables → joystick and pause button shift inward
    await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--sa-left', '59px'); s.setProperty('--sa-right', '59px'); s.setProperty('--sa-bottom', '21px'); });
    await touch(cdp, 'touchStart', [{ x: 20, y: vh - 10, id: 7 }]);
    const sa = await page.evaluate(() => { const b = document.querySelector('.hud-move').getBoundingClientRect(), pb = document.getElementById('pauseBtn').getBoundingClientRect(); return { stickLeft: b.left, stickBottom: b.bottom, pauseRight: pb.right, vw: innerWidth, vh: innerHeight }; });
    await touch(cdp, 'touchEnd', []);
    check('Safe area (simulated notch 59 px): joystick and pause button stay inside', sa.stickLeft >= 59 - 0.5 && sa.stickBottom <= sa.vh - 21 + 0.5 && sa.pauseRight <= sa.vw - 59 + 0.5, JSON.stringify(sa));
    await ctx.close();
  }

  // ---------- 7. Resize / orientation ----------
  {
    const { ctx, page } = await open(browser, base, { viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: false });
    const sizes = [[1280, 720], [844, 390], [568, 320], [1920, 1080], [1024, 768]];
    let ok = true; const log = [];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h }); await sleep(200);
      const d = await page.evaluate(() => ({ c: __DA3.canvas, cam: __DA3.camera, s: __DA3.settings.renderScale, dpr: devicePixelRatio }));
      const good = d.c.cssW === w && d.c.cssH === h && Math.abs(d.cam.aspect - w / h) < 1e-6 && Math.abs(d.c.w - Math.round(w * d.dpr * d.s)) <= 1;
      ok = ok && good; log.push(`${w}x${h}→${d.c.w}x${d.c.h}${good ? '' : '!'}`);
    }
    check('Resize: canvas fills window, aspect correct, internal resolution = renderScale', ok, log.join(' '));
    await page.evaluate(() => { __DA3.settings.renderScale = 0.75; }); await sleep(150);
    const rs = await page.evaluate(() => __DA3.canvas);
    check('Render-resolution setting applies live', Math.abs(rs.w - 768) <= 1, `${rs.w}x${rs.h} @1024 css`);
    await ctx.close();
    const m = await open(browser, base, iphone14);
    await m.page.setViewportSize({ width: 430, height: 932 }); await sleep(250);
    const st = await m.page.evaluate(() => ({ state: __DA3.state, rotate: getComputedStyle(document.getElementById('rotate')).display }));
    check('Portrait on phone: game pauses and rotate overlay shows', st.state === 'paused' && st.rotate === 'flex', JSON.stringify(st));
    await m.ctx.close();
  }

  // ---------- 8. Menus usable on small phone ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphoneSE, { play: false });
    await page.evaluate(() => document.getElementById('menuSettings').click());
    const info = await page.evaluate(() => { const p = document.querySelector('#settings .panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; });
    const pt = await page.evaluate(() => { const r = document.querySelector('#settings .panel').getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height * 0.7 }; });
    await touch(cdp, 'touchStart', [{ x: pt.x, y: pt.y, id: 1 }]);
    for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', [{ x: pt.x, y: pt.y - i * 18, id: 1 }]); await sleep(16); }
    await touch(cdp, 'touchEnd', []); await sleep(400);
    const res = await page.evaluate(() => { const b = document.getElementById('settingsBack').getBoundingClientRect(); return { top: document.querySelector('#settings .panel').scrollTop, done: b.bottom <= innerHeight + 1 }; });
    check('iPhone SE: settings scroll by touch, "Готово" reachable', info.sh <= info.ch || (res.top > 40 && res.done), `content ${info.sh}/${info.ch}px, scrolled ${res.top}`);
    await ctx.close();
  }

  // ---------- 9. Performance (Chromium, software WebGL — relative numbers only) ----------
  const perf = [];
  for (const [name, opts, throttle] of [['Desktop 1280×720', desktop, 0], ['iPhone 14 Pro Max (emul.)', iphone14, 0], ['iPhone 14 Pro Max (emul.), CPU ×4', iphone14, 4]]) {
    const { ctx, page } = await open(browser, base, opts, { throttle });
    await setP(page, 3, 3, 0.8);
    const r = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1200));
      const ms = __DA3.timeRender(40);
      return { ms: +ms.toFixed(2), canvas: __DA3.canvas, info: __DA3.info, loop: { ...__DA3.stats } };
    });
    perf.push({ name, ...r });
    console.log(`INFO  perf ${name}: render ${r.ms} ms/frame, canvas ${r.canvas.w}x${r.canvas.h}, draw ${r.info.calls}, tri ${r.info.triangles}, loop ${r.loop.fps} FPS`);
    await ctx.close();
  }
  check('Perf budget: draw calls ≤ 20 in every config', perf.every(p => p.info.calls <= 20));

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify({ results, perf }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
