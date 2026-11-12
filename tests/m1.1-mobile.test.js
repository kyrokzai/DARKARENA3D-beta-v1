// M1.1 — mobile controls & HUD editor. Playwright + Chromium (iPhone emulation).
// Run: node tests/m1.1-mobile.test.js   (SHOTS=dir to save screenshots)
// Chromium emulation ≠ iOS Safari: no real Safari zoom heuristics, safe areas are simulated via CSS variables,
// no real iPhone GPU/touch hardware. A manual iPhone run is still required.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const rectOf = (page, id) => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, id);
const tstate = page => DA(page, () => __DA3.touch);
const player = page => DA(page, () => __DA3.player);
const setP = (page, x, y, yaw = 0) => DA(page, a => __DA3.setPlayer(...a), [x, y, yaw]);
const setS = (page, obj) => DA(page, o => { Object.assign(__DA3.settings, o); __DA3.hud.layoutNow(); }, obj);
const notch = (page, l, r, b) => DA(page, ([l, r, b]) => { const s = document.documentElement.style; s.setProperty('--sa-left', l + 'px'); s.setProperty('--sa-right', r + 'px'); s.setProperty('--sa-bottom', b + 'px'); __DA3.hud.layoutNow(); }, [l, r, b]);

/** DOM-level layout audit: every visible HUD element inside the safe area, ≥44 px, no overlaps. */
const audit = page => DA(page, () => {
  const sa = __DA3.screen.safe, W = innerWidth, H = innerHeight, out = { items: [], oob: [], small: [], overlap: [] };
  const els = [...document.querySelectorAll('.hud-el')].filter(e => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden'));
  const rs = els.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.hud, circle: !e.classList.contains('hud-panel') && !e.classList.contains('slots') /* M2.0: the slot strip is a rect control */, l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: r.width }; });
  for (const r of rs) {
    out.items.push(r.id);
    if (r.l < sa.left - 0.5 || r.t < sa.top - 0.5 || r.r > W - sa.right + 0.5 || r.b > H - sa.bottom + 0.5) out.oob.push(r.id);
    if (r.s < 44) out.small.push(r.id);
  }
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    const hit = a.circle && b.circle ? Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.s + b.s) / 2 : a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    if (hit) out.overlap.push(a.id + '/' + b.id);
  }
  const pb = document.getElementById('pauseBtn').getBoundingClientRect();
  for (const r of rs) if (r.l < pb.right && pb.left < r.r && r.t < pb.bottom && pb.top < r.b) out.overlap.push(r.id + '/pause');
  return out;
});

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const iphone11 = devices['iPhone 11 landscape'];
  const iphone14 = devices['iPhone 14 Pro Max landscape'];
  const desktop = { viewport: { width: 1280, height: 720 } };

  // ---------- 1. Layout: inside safe area, ≥44 px, no overlaps — target iPhones, both look modes, sizes ----------
  {
    const { ctx, page } = await open(browser, base, iphone11);
    const screens = [['iPhone 11', 896, 414, 48, 48, 21], ['iPhone SE 2/3', 667, 375, 0, 0, 0], ['iPhone 14/15', 852, 393, 59, 59, 21], ['iPhone 14/15 Pro Max', 932, 430, 59, 59, 21]];
    const fails = [];
    let combos = 0;
    for (const [name, w, h, l, r, b] of screens) {
      await page.setViewportSize({ width: w, height: h }); await notch(page, l, r, b);
      for (const lookMode of ['touchpad', 'stick']) for (const hudScale of [0.7, 1, 1.4]) {
        await setS(page, { lookMode, hudScale }); await sleep(30);
        const a = await audit(page); combos++;
        if (a.oob.length || a.small.length || a.overlap.length) fails.push(`${name} ${lookMode} ${hudScale}: ${JSON.stringify({ oob: a.oob, small: a.small, overlap: a.overlap })}`);
      }
    }
    check(`Default layout clean on 4 target iPhones × 2 look modes × 3 sizes (${combos} combos)`, !fails.length, fails.join(' | '));
    await setS(page, { lookMode: 'touchpad', hudScale: 1 });
    await ctx.close();
  }

  // ---------- 2. Multi-finger: 2, 3, 4 simultaneous touches ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone14);
    await setP(page, 8, 8, 0);
    const fire = await rectOf(page, 'fire'), jump = await rectOf(page, 'jump');
    const mv = { x: 110, y: 290 }, look = { x: 470, y: 150 };
    // 2 fingers
    await touch(cdp, 'touchStart', [{ ...mv, id: 1 }]);
    await touch(cdp, 'touchStart', [{ ...mv, id: 1 }, { ...look, id: 2 }]);
    for (let i = 1; i <= 8; i++) { await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 50, id: 1 }, { x: look.x + i * 6, y: look.y, id: 2 }]); await sleep(25); }
    let t = await tstate(page);
    check('2 fingers: move + look both active', t.count === 2 && t.roles.includes('move') && t.roles.includes('look') && t.stick.y > 0.5, JSON.stringify(t.roles));
    // 3 fingers: + fire
    const pts3 = [{ x: mv.x, y: mv.y - 50, id: 1 }, { x: look.x + 48, y: look.y, id: 2 }, { x: fire.cx, y: fire.cy, id: 3 }];
    await touch(cdp, 'touchStart', pts3); await sleep(30);
    t = await tstate(page);
    check('3 fingers: move + look + FIRE (intent emitted)', t.count === 3 && t.actions.fire === true && t.roles.includes('btn:fire'), JSON.stringify({ roles: t.roles, fire: t.actions.fire }));
    // 4 fingers: + jump
    const pts4 = [...pts3, { x: jump.cx, y: jump.cy, id: 4 }];
    await touch(cdp, 'touchStart', pts4); await sleep(30);
    const y0 = (await player(page)).yaw;
    for (let i = 1; i <= 5; i++) { await touch(cdp, 'touchMove', [pts4[0], { x: look.x + 48 + i * 6, y: look.y, id: 2 }, pts4[2], pts4[3]]); await sleep(25); }
    t = await tstate(page);
    const y1 = (await player(page)).yaw;
    check('4 fingers: move + look + FIRE + JUMP all held, look still turns', t.count === 4 && t.actions.fire && t.actions.jump && t.stick.y > 0.5 && y1 > y0, JSON.stringify({ roles: t.roles, dyaw: +(y1 - y0).toFixed(3) }));
    // 5th finger on an occupied button / empty area is ignored
    await touch(cdp, 'touchStart', [...pts4, { x: fire.cx + 5, y: fire.cy + 5, id: 5 }]); await sleep(20);
    t = await tstate(page);
    check('5th finger on an occupied control is ignored', t.count === 4, `count=${t.count}`);
    // lift one at a time
    // CDP can only lift all fingers at once; a real browser sends pointerup per finger — deliver exactly that.
    await DA(page, () => { const [pid] = __DA3.touch.ids.find(([, tag]) => tag === 'btn:jump'); document.getElementById('game').dispatchEvent(new PointerEvent('pointerup', { pointerId: pid, pointerType: 'touch', bubbles: true })); });
    await sleep(30);
    t = await tstate(page);
    check('Lifting JUMP finger releases only jump', t.count === 3 && !t.actions.jump && t.actions.fire, JSON.stringify(t.actions));
    await touch(cdp, 'touchEnd', []); await sleep(40);
    t = await tstate(page);
    check('All fingers up: everything released', t.count === 0 && !t.actions.fire && t.stick.x === 0 && t.stick.y === 0, JSON.stringify(t));
    // FIRE + drag turns the camera (option on), and not when off.
    // M1.3: FIRE is a real weapon now and recoil also moves the aim, so ammo is emptied for this check
    // (dry trigger, no recoil) to isolate the finger-look behaviour.
    await DA(page, () => __DA3.gs.setAmmo(0, 0));
    const fy0 = (await player(page)).yaw;
    await touch(cdp, 'touchStart', [{ x: fire.cx, y: fire.cy, id: 6 }]);
    for (let i = 1; i <= 5; i++) { await touch(cdp, 'touchMove', [{ x: fire.cx - i * 8, y: fire.cy, id: 6 }]); await sleep(20); }
    await touch(cdp, 'touchEnd', []);
    const fy1 = (await player(page)).yaw;
    await setS(page, { fireLook: false });
    await touch(cdp, 'touchStart', [{ x: fire.cx, y: fire.cy, id: 7 }]);
    for (let i = 1; i <= 5; i++) { await touch(cdp, 'touchMove', [{ x: fire.cx - i * 8, y: fire.cy, id: 7 }]); await sleep(20); }
    await touch(cdp, 'touchEnd', []);
    const fy2 = (await player(page)).yaw;
    check('Drag on FIRE turns camera; option off → no turn', Math.abs(fy1 - fy0) > 0.05 && Math.abs(fy2 - fy1) < 1e-9, `on Δ=${(fy1 - fy0).toFixed(3)} off Δ=${(fy2 - fy1).toFixed(3)}`);
    await setS(page, { fireLook: true });
    // Blur during a 3-finger hold
    await touch(cdp, 'touchStart', [{ ...mv, id: 8 }, { ...look, id: 9 }, { x: fire.cx, y: fire.cy, id: 10 }]);
    await DA(page, () => dispatchEvent(new Event('blur')));
    t = await tstate(page);
    await touch(cdp, 'touchEnd', []);
    check('Blur during 3-finger hold releases all (no stuck fire/move)', t.count === 0 && !t.actions.fire && t.stick.x === 0 && t.stick.y === 0, JSON.stringify(t));
    if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(SHOTS, 'm11_play_iphone14promax.png') }); }
    await ctx.close();
  }

  // ---------- 3. Look stick mode, dead zones, sensitivity X/Y ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone14);
    await setS(page, { lookMode: 'stick' }); await setP(page, 8, 8, 0);
    const ls = await rectOf(page, 'look');
    check('Stick mode: right joystick shown', ls.w >= 44);
    const y0 = (await player(page)).yaw;
    await touch(cdp, 'touchStart', [{ x: ls.cx, y: ls.cy, id: 1 }]);
    await touch(cdp, 'touchMove', [{ x: ls.cx + ls.w * 0.42, y: ls.cy, id: 1 }]);
    await sleep(500);
    const y1 = (await player(page)).yaw;
    await touch(cdp, 'touchEnd', []); await sleep(100);
    const y2 = (await player(page)).yaw; await sleep(300);
    const y3 = (await player(page)).yaw;
    const rate = (y1 - y0) / 0.5 * 180 / Math.PI;
    check('Right stick: full deflection turns at ~200°/s, stops on release', rate > 120 && rate < 260 && Math.abs(y3 - y2) < 1e-9, `≈${rate.toFixed(0)}°/s, after release Δ=${(y3 - y2).toFixed(4)}`);
    // look dead zone
    await setS(page, { lookDeadZone: 0.3 });
    await touch(cdp, 'touchStart', [{ x: ls.cx, y: ls.cy, id: 2 }]);
    await touch(cdp, 'touchMove', [{ x: ls.cx + ls.w * 0.42 * 0.2, y: ls.cy, id: 2 }]);
    const dzA = (await tstate(page)).lookStick;
    await setS(page, { lookDeadZone: 0.05 });
    await touch(cdp, 'touchMove', [{ x: ls.cx + ls.w * 0.42 * 0.21, y: ls.cy, id: 2 }]);
    const dzB = (await tstate(page)).lookStick;
    await touch(cdp, 'touchEnd', []);
    check('Look dead zone: 20 % deflection ignored at 30 %, active at 5 %', dzA.x === 0 && dzB.x > 0.1, `dz30=${dzA.x.toFixed(2)} dz5=${dzB.x.toFixed(2)}`);
    // move dead zone
    const mv = { x: 110, y: 290 };
    await setS(page, { moveDeadZone: 0.3 });
    await touch(cdp, 'touchStart', [{ ...mv, id: 3 }]);
    await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 55 * 0.25, id: 3 }]);
    const mA = (await tstate(page)).stick;
    await setS(page, { moveDeadZone: 0 });
    await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 55 * 0.26, id: 3 }]);
    const mB = (await tstate(page)).stick;
    await touch(cdp, 'touchEnd', []);
    check('Move dead zone: 25 % deflection ignored at 30 %, active at 0 %', mA.y === 0 && mB.y > 0.15, `dz30=${mA.y.toFixed(2)} dz0=${mB.y.toFixed(2)}`);
    // sensitivity X / Y (touchpad)
    await setS(page, { lookMode: 'touchpad', moveDeadZone: 0.12, lookDeadZone: 0.12 });
    const swipe = async (dx, dy, id) => { await touch(cdp, 'touchStart', [{ x: 450, y: 180, id }]); for (let i = 1; i <= 4; i++) await touch(cdp, 'touchMove', [{ x: 450 + dx * i / 4, y: 180 + dy * i / 4, id }]); await touch(cdp, 'touchEnd', []); await sleep(40); };
    let a = await player(page); await swipe(80, 0, 4); let b = await player(page);
    await setS(page, { touchSensX: 2 }); await swipe(80, 0, 5); let c = await player(page);
    const rx = (c.yaw - b.yaw) / (b.yaw - a.yaw);
    a = await player(page); await swipe(0, -40, 6); b = await player(page);
    await setS(page, { touchSensY: 0.4 }); await swipe(0, -40, 7); c = await player(page);
    const ry = (c.pitch - b.pitch) / (b.pitch - a.pitch);
    check('Horizontal sensitivity ×2 doubles yaw per swipe', Math.abs(rx - 2) < 0.1, `ratio=${rx.toFixed(2)}`);
    check('Vertical sensitivity 0.8→0.4 halves pitch per swipe (independent of X)', Math.abs(ry - 0.5) < 0.06, `ratio=${ry.toFixed(2)}`);
    await ctx.close();
  }

  // ---------- 4. Editor: drag, resize, overlap refusal, bounds, cancel, persistence, reset ----------
  {
    const ctx = await browser.newContext(iphone14);
    let { page, cdp } = await open(browser, base, null, { ctx, play: true });
    await DA(page, () => document.getElementById('pauseBtn').click());
    await DA(page, () => document.getElementById('pauseEditHud').click()); await sleep(150);
    check('Editor opens from pause menu', await DA(page, () => __DA3.state === 'edit' && document.body.classList.contains('editing') && !document.getElementById('editBar').classList.contains('hidden')));
    const drag = async (from, to, id) => { await touch(cdp, 'touchStart', [{ ...from, id }]); for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8, id }]); await touch(cdp, 'touchEnd', []); await sleep(60); };
    // move "aim" to an empty spot
    const aim0 = await rectOf(page, 'aim');
    await drag({ x: aim0.cx, y: aim0.cy }, { x: 520, y: 120 }, 1);
    const aim1 = await rectOf(page, 'aim');
    check('Drag moves element to a free spot', Math.abs(aim1.cx - 520) < 2 && Math.abs(aim1.cy - 120) < 2, `→ (${aim1.cx.toFixed(0)}, ${aim1.cy.toFixed(0)})`);
    // drop "reload" onto "fire" → snaps back to last free position
    const rl0 = await rectOf(page, 'reload'), fi = await rectOf(page, 'fire');
    await drag({ x: rl0.cx, y: rl0.cy }, { x: fi.cx, y: fi.cy }, 2);
    const rl1 = await rectOf(page, 'reload');
    const overlapAfter = Math.hypot(rl1.cx - fi.cx, rl1.cy - fi.cy) < (rl1.w + fi.w) / 2;
    const toast = await DA(page, () => document.querySelector('.ed-toast').textContent);
    check('Drop onto another control is refused (snaps back, message)', !overlapAfter && /занято/.test(toast), `reload at (${rl1.cx.toFixed(0)},${rl1.cy.toFixed(0)}) toast="${toast}"`);
    // drag far outside the screen → clamped fully inside the safe area
    await drag({ x: aim1.cx, y: aim1.cy }, { x: 2000, y: -500 }, 3);
    const a2 = await audit(page);
    check('Drag past the edge: element stays fully on screen', !a2.oob.length, JSON.stringify(a2.oob));
    // resize selected (aim) +2 steps, and refusal when it would hit a neighbour
    await DA(page, () => { const b = document.querySelector('[data-ed=plus]'); b.click(); b.click(); });
    const aim3 = await rectOf(page, 'aim');
    check('Resize: + makes the selected element bigger', aim3.w > aim1.w + 8, `${aim1.w.toFixed(0)} → ${aim3.w.toFixed(0)} px`);
    const fire0 = await rectOf(page, 'fire');
    await drag({ x: fire0.cx, y: fire0.cy }, { x: fire0.cx, y: fire0.cy }, 4); // select fire without moving
    const before = await rectOf(page, 'fire');
    for (let i = 0; i < 6; i++) await DA(page, () => document.querySelector('[data-ed=plus]').click());
    const after = await rectOf(page, 'fire'), a3 = await audit(page);
    check('Resize into a neighbour is refused (no overlaps created)', !a3.overlap.length && after.w >= before.w, `fire ${before.w.toFixed(0)}→${after.w.toFixed(0)} overlaps=${a3.overlap}`);
    // Done → saved; reload → persists
    const saved = await DA(page, () => __DA3.editor.working && JSON.parse(JSON.stringify(__DA3.editor.working)));
    await DA(page, () => document.querySelector('[data-ed=done]').click()); await sleep(100);
    check('Done returns to pause menu', await DA(page, () => __DA3.state) === 'paused');
    if (SHOTS) {
      await DA(page, () => document.getElementById('pauseEditHud').click()); await sleep(200);
      await page.screenshot({ path: path.join(SHOTS, 'm11_editor_iphone14promax.png') });
      await DA(page, () => document.querySelector('[data-ed=cancel]').click());
    }
    await page.close();
    ({ page, cdp } = await open(browser, base, null, { ctx, play: true }));
    const layout = await DA(page, () => __DA3.layout);
    const same = ['aim', 'fire', 'reload'].every(k => Math.abs(layout[k].x - saved[k].x) < 1e-9 && Math.abs(layout[k].y - saved[k].y) < 1e-9 && layout[k].s === saved[k].s);
    check('Layout persists after page reload (localStorage)', same && layout.aim.s > 1, JSON.stringify(layout.aim));
    // Cancel discards changes
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseEditHud').click(); }); await sleep(100);
    const j0 = await rectOf(page, 'jump');
    await drag({ x: j0.cx, y: j0.cy }, { x: 420, y: 80 }, 5);
    await DA(page, () => document.querySelector('[data-ed=cancel]').click()); await sleep(60);
    const lj = await DA(page, () => __DA3.layout.jump);
    check('Cancel discards unsaved moves', Math.abs(lj.x - layout.jump.x) < 1e-9 && Math.abs(lj.y - layout.jump.y) < 1e-9);
    // Reset to BUILD 1.3 layout: needs confirmation (2 taps), then Done
    await DA(page, () => document.getElementById('pauseEditHud').click()); await sleep(60);
    await DA(page, () => document.querySelector('[data-ed=reset]').click());
    const armed = await DA(page, () => document.querySelector('[data-ed=reset]').textContent);
    await DA(page, () => document.querySelector('[data-ed=reset]').click());
    await DA(page, () => document.querySelector('[data-ed=done]').click()); await sleep(60);
    const lr = await DA(page, () => __DA3.layout);
    check('"Стандарт" asks for confirmation, then restores BUILD 1.3 layout', /Точно/.test(armed) && lr.fire.x === 0.88 && lr.fire.y === 0.72 && lr.move.x === 0.12 && lr.jump.y === 0.40 && lr.aim.s === 1, `armed="${armed}" fire=${JSON.stringify(lr.fire)}`);
    await ctx.close();
  }

  // ---------- 5. Settings persist after reload; settings-screen layout reset; minimap toggle; opacity ----------
  {
    const ctx = await browser.newContext(iphone14);
    let { page } = await open(browser, base, null, { ctx, play: false });
    await DA(page, () => document.getElementById('menuSettings').click());
    await DA(page, () => document.querySelector('.seg[data-key=lookMode] button[data-val=stick]').click());
    await DA(page, () => { const r = document.querySelector('input[data-key=hudScale]'); r.value = 1.2; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await DA(page, () => { const r = document.querySelector('input[data-key=hudOpacity]'); r.value = 0.5; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await DA(page, () => { const r = document.querySelector('input[data-key=moveDeadZone]'); r.value = 0.2; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await DA(page, () => document.querySelector('[data-tab=hud]').click());
    await DA(page, () => document.querySelector('input[data-key=showMinimap]').click());
    await page.close();
    ({ page } = await open(browser, base, null, { ctx, play: true }));
    const s = await DA(page, () => ({ ...__DA3.settings }));
    const vis = await DA(page, () => ({ mini: !document.querySelector('.hud-minimap').classList.contains('hidden'), look: !document.querySelector('.hud-look').classList.contains('hidden'), op: getComputedStyle(document.querySelector('.hud')).getPropertyValue('--hud-opacity').trim(), fireOp: getComputedStyle(document.querySelector('.hud-fire')).opacity }));
    check('Settings persist after reload (look mode, size, opacity, dead zone, minimap)', s.lookMode === 'stick' && s.hudScale === 1.2 && s.hudOpacity === 0.5 && s.moveDeadZone === 0.2 && s.showMinimap === false, JSON.stringify({ lookMode: s.lookMode, hudScale: s.hudScale, hudOpacity: s.hudOpacity, moveDeadZone: s.moveDeadZone, showMinimap: s.showMinimap }));
    check('Minimap hidden, right stick shown, opacity 50 % applied', !vis.mini && vis.look && vis.op === '0.5' && Math.abs(+vis.fireOp - 0.5) < 0.01, JSON.stringify(vis));
    const f0 = await rectOf(page, 'fire');
    check('Global size 120 % applied to buttons', Math.abs(f0.w - 92 * 1.2) < 1.5, `fire ${f0.w.toFixed(1)} px`);
    // Settings-screen "standard layout" button
    await DA(page, () => { __DA3.hud.setLayout({ ...__DA3.layout, fire: { x: 0.5, y: 0.3, s: 1.3 } }); });
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseSettings').click(); document.querySelector('[data-tab=hud]').click(); document.querySelector('[data-action=resetLayout]').click(); });
    const lf = await DA(page, () => __DA3.layout.fire);
    check('Settings → "Стандартная раскладка" restores defaults', lf.x === 0.88 && lf.s === 1, JSON.stringify(lf));
    // Menu: tabs and segmented controls
    const tabs = await DA(page, () => { const out = []; for (const t of ['touch', 'hud', 'pc', 'gfx']) { document.querySelector(`[data-tab=${t}]`).click(); out.push(!document.querySelector(`[data-page=${t}]`).classList.contains('hidden')); } return out; });
    check('Settings tabs switch pages', tabs.every(Boolean), JSON.stringify(tabs));
    await ctx.close();
  }

  // ---------- 6. Rotation: portrait pauses; landscape again → HUD relaid out, same normalized positions ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone11);
    await page.setViewportSize({ width: 896, height: 414 }); await notch(page, 48, 48, 21); await sleep(150);
    const L0 = await audit(page), fire0 = await rectOf(page, 'fire');
    const mv = { x: 120, y: 300 };
    await touch(cdp, 'touchStart', [{ ...mv, id: 1 }]); await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 50, id: 1 }]);
    await page.setViewportSize({ width: 414, height: 896 }); await sleep(250);
    const p = await DA(page, () => ({ state: __DA3.state, rotate: getComputedStyle(document.getElementById('rotate')).display, touch: __DA3.touch }));
    check('Portrait: game pauses, rotate overlay shown, held finger released', p.state === 'paused' && p.rotate === 'flex' && p.touch.count === 0 && p.touch.stick.y === 0, JSON.stringify({ state: p.state, rotate: p.rotate, count: p.touch.count }));
    await touch(cdp, 'touchEnd', []);
    await page.setViewportSize({ width: 896, height: 414 }); await sleep(250);
    await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(150);
    const L1 = await audit(page), fire1 = await rectOf(page, 'fire');
    check('Back to landscape: same layout, all controls clean', Math.abs(fire1.cx - fire0.cx) < 1 && Math.abs(fire1.cy - fire0.cy) < 1 && !L1.oob.length && !L1.overlap.length && L1.items.length === L0.items.length, JSON.stringify({ oob: L1.oob, overlap: L1.overlap }));
    // A different landscape size (e.g. Safari toolbar shown) → normalized positions scale, still clean
    await page.setViewportSize({ width: 812, height: 340 }); await sleep(200);
    const L2 = await audit(page);
    check('Smaller landscape viewport (toolbars): controls re-fit, no overlap/out of bounds', !L2.oob.length && !L2.overlap.length && !L2.small.length, JSON.stringify(L2));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm11_iphone11_notch_sim.png') });
    await ctx.close();
  }

  // ---------- 7. No accidental zoom ----------
  {
    const { ctx, page } = await open(browser, base, iphone14);
    await sleep(400);
    const probe = sel => DA(page, sel => new Promise(res => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, out = [];
      const spy = e => out.push(e.defaultPrevented); addEventListener('touchend', spy);
      const mk = (type, id) => { const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
      mk('touchstart', 1); mk('touchend', 1); { const t0 = performance.now(); while (performance.now() - t0 < 120) {} /* 120 ms real gap: no frame can interleave */ } mk('touchstart', 2); mk('touchend', 2); removeEventListener('touchend', spy); setTimeout(() => res(out), 400);
    }), sel);
    const v = await probe('#view'), f = await probe('.hud-fire'), m = await probe('.hud-minimap');
    check('Double tap on 3D view / FIRE / minimap: second tap blocked', v[1] && f[1] && m[1], JSON.stringify({ v, f, m }));
    const pinch = await DA(page, () => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.getElementById('view').dispatchEvent(e); return e.defaultPrevented; });
    check('Pinch (Safari gesturestart) prevented on game layer', pinch);
    const ta = await DA(page, () => ({ game: getComputedStyle(document.getElementById('game')).touchAction, btn: getComputedStyle(document.querySelector('.hud-fire')).touchAction, menu: getComputedStyle(document.querySelector('.screen')).touchAction, vp: document.querySelector('meta[name=viewport]').content }));
    check('touch-action none on game & controls, pan-y in menus; viewport meta locks scale', ta.game === 'none' && ta.btn === 'none' && ta.menu === 'pan-y' && /user-scalable=no/.test(ta.vp), JSON.stringify(ta));
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseSettings').click(); });
    await sleep(400);
    const mp = await probe('#settings .panel');
    check('Menus keep native taps (double tap not blocked there)', mp[0] === false && mp[1] === false, JSON.stringify(mp));
    await ctx.close();
  }

  // ---------- 8. Desktop unaffected: touch controls hidden, minimap shown, keyboard works ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { play: false });
    await page.click('#playBtn'); await sleep(200);
    const d = await DA(page, () => ({ fire: getComputedStyle(document.querySelector('.hud-fire')).display, move: getComputedStyle(document.querySelector('.hud-move')).display, mini: getComputedStyle(document.querySelector('.hud-minimap')).display }));
    await DA(page, () => __DA3.setPlayer(8, 8, 0));
    await page.keyboard.down('KeyW'); await sleep(300); await page.keyboard.up('KeyW');
    const p = await player(page);
    check('Desktop: touch controls hidden, minimap visible, WASD works, no errors', d.fire === 'none' && d.move === 'none' && d.mini !== 'none' && p.x > 8.4 && !errors.length, JSON.stringify({ ...d, x: p.x.toFixed(2), errors }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm11_desktop.png') });
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm11-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
