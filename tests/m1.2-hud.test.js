// M1.2 — gameplay HUD. Node unit checks of the GameState model + Playwright/Chromium HUD checks.
// Run: node tests/m1.2-hud.test.js   (SHOTS=dir to save screenshots)
// Chromium ≠ iOS Safari (see tests/m1.1-mobile.test.js header for the limits of emulation).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch, ROOT } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const dbg = (page, ...names) => DA(page, ns => { for (const n of ns) __DA3.dbg[n](); }, names);
const txt = (page, sel) => DA(page, s => document.querySelector(s).textContent.trim(), sel);
const has = (page, sel, cls) => DA(page, ([s, c]) => document.querySelector(s).classList.contains(c), [sel, cls]);
const widthPct = (page, sel) => DA(page, s => { const e = document.querySelector(s); return e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width * 100; }, sel);

const audit = page => DA(page, () => {
  const sa = __DA3.screen.safe, W = innerWidth, H = innerHeight, out = { items: [], oob: [], overlap: [], clipped: [] };
  const els = [...document.querySelectorAll('.hud-el')].filter(e => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden'));
  const rs = els.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.hud, circle: !e.classList.contains('hud-panel'), l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: r.width }; });
  const pb = document.getElementById('pauseBtn').getBoundingClientRect();
  rs.push({ id: 'pause', circle: false, l: pb.left, t: pb.top, r: pb.right, b: pb.bottom });
  for (const r of rs) {
    out.items.push(r.id);
    if (r.l < sa.left - 0.5 || r.t < sa.top - 0.5 || r.r > W - sa.right + 0.5 || r.b > H - sa.bottom + 0.5) out.oob.push(r.id);
  }
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    const hit = a.circle && b.circle ? Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.s + b.s) / 2 : a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    if (hit) out.overlap.push(a.id + '/' + b.id);
  }
  // text fit inside info panels
  for (const e of document.querySelectorAll('.hud-info:not(.hidden)')) {
    const box = e.getBoundingClientRect();
    for (const t of e.querySelectorAll('[data-v]')) { const r = t.getBoundingClientRect(); if (r.width && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) out.clipped.push(e.dataset.hud + ':' + t.dataset.v); }
  }
  return out;
});

(async () => {
  // ---------- 0. GameState model (pure, Node) ----------
  {
    const { GameState, CRITICAL_HP } = await import(pathToFileURL(path.join(ROOT, 'prototype-3d/src/sim/game-state.js')).href);
    const ev = []; const s = new GameState((t, d) => ev.push([t, d]));
    s.damage(30); s.heal(500); s.damage(-5);
    check('Model: damage/heal clamp to 0..max, negative damage ignored', s.health.hp === 100 && ev.filter(e => e[0] === 'health').length === 2);
    s.setHealth(25); const crit = s.critical; s.setHealth(26);
    check('Model: critical at ≤ 25 % HP', crit && !s.critical && CRITICAL_HP === 0.25);
    s.setAmmo(3, 10); s.setReload(true, 0.5); s.completeReload();
    check('Model: reload moves rounds from reserve (3/10 → 13/0)', s.weapon.mag === 13 && s.weapon.reserve === 0 && !s.weapon.reloading);
    ev.length = 0; s.setWave({ number: 2, remaining: 2, total: 2, phase: 'active' }); s.enemyKilled(); s.enemyKilled(); s.enemyKilled();
    check('Model: last kill → phase cleared + one waveCleared event', s.wave.phase === 'cleared' && s.wave.remaining === 0 && ev.filter(e => e[0] === 'waveCleared').length === 1);
    ev.length = 0; s.registerHit({ kill: true });
    check('Model: hit event carries kill/headshot', ev[0][0] === 'hit' && ev[0][1].kill === true && ev[0][1].headshot === false);
    check('Model: snapshot is plain serialisable data', JSON.parse(JSON.stringify(s.snapshot())).weapon.mag === 13);
  }

  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone14 = devices['iPhone 14 Pro Max landscape'];

  // ---------- 1. Debug mode gating + initial values ----------
  {
    const ctx = await browser.newContext(desktop), page = await ctx.newPage();
    await page.goto(base + '/prototype-3d/'); await sleep(600);
    await page.click('#playBtn'); await sleep(200);
    const d = await DA(page, () => ({ hook: typeof window.__DA3, panel: !!document.getElementById('debugPanel'), hp: document.querySelector('[data-v=hp]').textContent, mag: document.querySelector('[data-v=mag]').textContent, res: document.querySelector('[data-v=reserve]').textContent, wave: document.querySelector('[data-v=wave]').textContent, sub: document.querySelector('[data-v=remainingText]').textContent }));
    check('Without ?debug=1: no test hook, no debug panel', d.hook === 'undefined' && !d.panel, JSON.stringify(d));
    check('Initial HUD: 100 HP, 30/120, wave 1 (preparation)', d.hp === '100' && d.mag === '30' && d.res === '120' && d.wave === '1' && d.sub === 'ПОДГОТОВКА', JSON.stringify(d));
    await ctx.close();
  }

  // ---------- 2. HP, smooth drop, critical ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    check('?debug=1: debug panel present', await DA(page, () => !!document.getElementById('debugPanel') && !!__DA3.dbg));
    await dbg(page, 'hp-10');
    // Wait until the main bar has reached 90 % (0.18 s CSS transition; slower frames under load), then read the trail.
    await page.waitForFunction(() => { const e = document.querySelector('.hp-fill'); return e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width < 0.905; }, null, { timeout: 2000, polling: 'raf' });
    const t0 = { num: await txt(page, '[data-v=hp]'), fill: await widthPct(page, '.hp-fill'), trail: await widthPct(page, '.hp-trail') };
    await sleep(1400);
    const t1 = { fill: await widthPct(page, '.hp-fill'), trail: await widthPct(page, '.hp-trail') };
    check('Damage −10 → "90", bar 90 %', t0.num === '90' && Math.abs(t1.fill - 90) < 1, JSON.stringify(t1));
    check('Smooth decrease: red trail lags behind, then catches up', t0.trail > t0.fill + 3 && Math.abs(t1.trail - t1.fill) < 1, `right after: fill ${t0.fill.toFixed(0)}% trail ${t0.trail.toFixed(0)}%; later: ${t1.trail.toFixed(0)}%`);
    await dbg(page, 'hp+25'); await sleep(400);
    check('Heal caps at 100', await txt(page, '[data-v=hp]') === '100');
    await DA(page, () => __DA3.gs.setHealth(50)); await sleep(50);
    check('50 HP → "low" (amber), not critical', await has(page, '.hud-health', 'low') && !(await has(page, '.hud-health', 'critical')));
    await DA(page, () => __DA3.gs.setHealth(26)); await sleep(50);
    const c26 = await has(page, '.hud-health', 'critical');
    await DA(page, () => __DA3.gs.setHealth(25)); await sleep(50);
    const crit = await DA(page, () => ({ panel: document.querySelector('.hud-health').classList.contains('critical'), vig: document.getElementById('vignette').classList.contains('critical'), vop: +getComputedStyle(document.getElementById('vignette')).opacity }));
    check('Critical at 25 HP (not at 26): red panel + pulsing red vignette', !c26 && crit.panel && crit.vig, JSON.stringify(crit));
    if (SHOTS) { await dbg(page, 'waveStart', 'kill'); await dbg(page, 'hp=15', 'mag0'); await sleep(800); await dbg(page, 'killhit'); await sleep(70); await page.screenshot({ path: path.join(SHOTS, 'm12_desktop_critical.png') }); }
    await DA(page, () => __DA3.gs.setHealth(100)); await sleep(50);
    check('Back to 100 → critical cleared', !(await has(page, '.hud-health', 'critical')) && !(await DA(page, () => document.getElementById('vignette').classList.contains('critical'))));
    await ctx.close();
  }

  // ---------- 3. Ammo & reload ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await dbg(page, 'shot', 'shot', 'shot'); await sleep(30);
    check('3 shots → 27 / 120', await txt(page, '[data-v=mag]') === '27' && await txt(page, '[data-v=reserve]') === '120');
    await DA(page, () => __DA3.gs.setAmmo(9)); await sleep(30);
    check('≤ 30 % of magazine → low (amber)', await has(page, '.hud-ammo', 'low'));
    await dbg(page, 'mag0'); await sleep(30);
    check('Empty magazine → "ПЕРЕЗАРЯДИ" (red)', await has(page, '.hud-ammo', 'empty') && await txt(page, '[data-v=ammoState]') === 'ПЕРЕЗАРЯДИ');
    await dbg(page, 'reload'); await sleep(600);
    const mid = { state: await txt(page, '[data-v=ammoState]'), bar: await widthPct(page, '.am-reload-fill'), cls: await has(page, '.hud-ammo', 'reloading') };
    await sleep(1100);
    const after = { mag: await txt(page, '[data-v=mag]'), res: await txt(page, '[data-v=reserve]'), cls: await has(page, '.hud-ammo', 'reloading'), bar: await widthPct(page, '.am-reload-fill') };
    check('Reload in progress: "ПЕРЕЗАРЯДКА" + progress bar', mid.cls && mid.state === 'ПЕРЕЗАРЯДКА' && mid.bar > 20 && mid.bar < 80, JSON.stringify(mid));
    check('Reload done → 30 / 90, indicator cleared', after.mag === '30' && after.res === '90' && !after.cls && after.bar === 0, JSON.stringify(after));
    await dbg(page, 'dry'); await sleep(30);
    check('No ammo at all → "НЕТ ПАТРОНОВ"', await txt(page, '[data-v=ammoState]') === 'НЕТ ПАТРОНОВ');
    await ctx.close();
  }

  // ---------- 4. Waves ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await dbg(page, 'waveStart'); await sleep(350);
    const w1 = { n: await txt(page, '[data-v=wave]'), sub: await txt(page, '[data-v=remainingText]'), bar: await widthPct(page, '.wv-fill') };
    await dbg(page, 'kill', 'kill'); await sleep(350);
    const w2 = { sub: await txt(page, '[data-v=remainingText]'), bar: await widthPct(page, '.wv-fill') };
    check('Wave 1 active: "ОСТАЛОСЬ 5", bar full', w1.n === '1' && w1.sub === 'ОСТАЛОСЬ 5' && w1.bar > 99, JSON.stringify(w1));
    check('2 kills → "ОСТАЛОСЬ 3", bar 60 %', w2.sub === 'ОСТАЛОСЬ 3' && Math.abs(w2.bar - 60) < 2, JSON.stringify(w2));
    await dbg(page, 'waveNext'); await sleep(150);
    const b2 = await DA(page, () => ({ text: document.getElementById('banner').textContent, show: document.getElementById('banner').classList.contains('show') }));
    check('Next wave → number 2, 7 enemies, banner "ВОЛНА 2"', await txt(page, '[data-v=wave]') === '2' && await txt(page, '[data-v=remainingText]') === 'ОСТАЛОСЬ 7' && b2.show && b2.text === 'ВОЛНА 2', JSON.stringify(b2));
    for (let i = 0; i < 7; i++) await dbg(page, 'kill');
    await sleep(100);
    const cl = await DA(page, () => ({ sub: document.querySelector('[data-v=remainingText]').textContent, cleared: document.querySelector('.hud-wave').classList.contains('cleared'), banner: document.getElementById('banner').textContent }));
    // M1.5: the wave-complete banner text is "WAVE N COMPLETE" by the owner's spec (was "ВОЛНА N ЗАЧИЩЕНА"); panel text unchanged
    check('All killed → "ЗАЧИЩЕНА" + banner "WAVE 2 COMPLETE"', cl.sub === 'ЗАЧИЩЕНА' && cl.cleared && cl.banner === 'WAVE 2 COMPLETE', JSON.stringify(cl));
    await sleep(2000);
    check('Banner hides by itself', !(await has(page, '#banner', 'show')));
    await DA(page, () => __DA3.gs.setWave({ number: 999, remaining: 999, total: 999, phase: 'active' })); await DA(page, () => __DA3.gs.setAmmo(30, 9999)); await sleep(100);
    const a = await audit(page);
    check('Longest values (wave 999, 999 left, 9999 reserve) fit inside panels', !a.clipped.length, JSON.stringify(a.clipped));
    await ctx.close();
  }

  // ---------- 5. Hit marker ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    const op = () => DA(page, () => +getComputedStyle(document.getElementById('hitmark')).opacity);
    await dbg(page, 'hit'); await sleep(30);
    const o1 = await op(), c1 = await DA(page, () => document.getElementById('hitmark').className);
    await sleep(400);
    const o2 = await op();
    check('Hit → marker flashes on the crosshair and fades out', o1 > 0.3 && o2 < 0.05 && /show/.test(c1), `opacity ${o1.toFixed(2)} → ${o2.toFixed(2)}`);
    await dbg(page, 'head'); const c2 = await DA(page, () => document.getElementById('hitmark').className);
    await dbg(page, 'killhit'); const c3 = await DA(page, () => document.getElementById('hitmark').className);
    await sleep(30); const o3 = await op();
    check('Headshot → gold marker; kill → red marker (restarts on each hit)', /head/.test(c2) && /kill/.test(c3) && !/head/.test(c3) && o3 > 0.3, `${c2} | ${c3}`);
    await ctx.close();
  }

  // ---------- 6. No overlaps / in bounds: desktop window sizes and HUD scales ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => { __DA3.gs.setWave({ number: 12, remaining: 23, total: 23, phase: 'active' }); });
    const fails = []; let n = 0;
    for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 768], [800, 600], [1366, 768], [2560, 1080], [640, 480]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const hudScale of [0.7, 1, 1.4]) {
        await DA(page, s => { __DA3.settings.hudScale = s; __DA3.hud.layoutNow(); }, hudScale); await sleep(30);
        const a = await audit(page); n++;
        if (a.oob.length || a.overlap.length || a.clipped.length) fails.push(`${w}x${h}@${hudScale}: ${JSON.stringify(a)}`);
      }
    }
    check(`Desktop: ${n} window sizes × scales — no overlap, in bounds, text fits`, !fails.length, fails.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, base, devices['iPhone 11 landscape']);
    const fails = []; let n = 0;
    for (const [name, w, h, l, r, b] of [['iPhone 11', 896, 414, 48, 48, 21], ['iPhone SE 2/3', 667, 375, 0, 0, 0], ['iPhone 14/15', 852, 393, 59, 59, 21], ['Pro Max', 932, 430, 59, 59, 21]]) {
      await page.setViewportSize({ width: w, height: h });
      await DA(page, ([l, r, b]) => { const s = document.documentElement.style; s.setProperty('--sa-left', l + 'px'); s.setProperty('--sa-right', r + 'px'); s.setProperty('--sa-bottom', b + 'px'); }, [l, r, b]);
      for (const lookMode of ['touchpad', 'stick']) for (const hudScale of [0.7, 1, 1.4]) {
        await DA(page, o => { Object.assign(__DA3.settings, o); __DA3.hud.layoutNow(); }, { lookMode, hudScale }); await sleep(30);
        const a = await audit(page); n++;
        if (a.oob.length || a.overlap.length || a.clipped.length) fails.push(`${name} ${lookMode} ${hudScale}: ${JSON.stringify(a)}`);
      }
    }
    check(`Touch: ${n} iPhone combos with info panels — no overlap (incl. pause button), in safe area, text fits`, !fails.length, fails.join(' | '));
    await ctx.close();
  }

  // ---------- 7. Info panels never steal touches; 4 fingers still work ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone14);
    const rect = id => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
    const hp = await rect('health'), wave = await rect('wave'), ammo = await rect('ammo'), fire = await rect('fire'), jump = await rect('jump'), mini = await rect('minimap');
    await touch(cdp, 'touchStart', [{ ...hp, id: 1 }]);
    await touch(cdp, 'touchStart', [{ ...hp, id: 1 }, { ...wave, id: 2 }]);
    let t = await DA(page, () => __DA3.touch);
    check('Touch on HEALTH panel → movement stick; on WAVE panel → look', t.roles.includes('move') && t.roles.includes('look'), JSON.stringify(t.roles));
    await touch(cdp, 'touchStart', [{ ...hp, id: 1 }, { ...wave, id: 2 }, { ...fire, id: 3 }, { ...jump, id: 4 }]);
    t = await DA(page, () => __DA3.touch);
    check('4 fingers with HUD panels on screen: move + look + fire + jump', t.count === 4 && t.actions.fire && t.actions.jump, JSON.stringify(t.roles));
    await touch(cdp, 'touchEnd', []); await sleep(50);
    await touch(cdp, 'touchStart', [{ ...ammo, id: 5 }, { ...mini, id: 6 }]);
    t = await DA(page, () => __DA3.touch);
    await touch(cdp, 'touchEnd', []);
    check('Touch on AMMO panel → look; on MINIMAP → movement', t.roles.includes('look') && t.roles.includes('move'), JSON.stringify(t.roles));
    if (SHOTS) {
      await DA(page, () => { __DA3.dbg.waveStart(); __DA3.dbg.kill(); __DA3.dbg['hp-35'](); for (let i = 0; i < 7; i++) __DA3.dbg.shot(); });
      await sleep(1500); await DA(page, () => __DA3.dbg.hit()); await sleep(60);
      await page.screenshot({ path: path.join(SHOTS, 'm12_iphone14promax.png') });
      await DA(page, () => { __DA3.dbg['hp=15'](); __DA3.dbg.mag0(); }); await sleep(700); await DA(page, () => __DA3.dbg.killhit()); await sleep(70);
      await page.screenshot({ path: path.join(SHOTS, 'm12_iphone14promax_critical.png') });
    }
    await ctx.close();
  }

  // ---------- 8. Editor: info panels are editable; persistence per profile; pause button is an obstacle ----------
  {
    const ctx = await browser.newContext(iphone14);
    let { page, cdp } = await open(browser, base, null, { ctx });
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseEditHud').click(); }); await sleep(150);
    const drag = async (from, to, id) => { await touch(cdp, 'touchStart', [{ ...from, id }]); for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8, id }]); await touch(cdp, 'touchEnd', []); await sleep(60); };
    const rect = id => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, id);
    const w0 = await rect('wave');
    await drag(w0, { x: 420, y: 160 }, 1);
    const w1 = await rect('wave');
    check('Editor: WAVE panel can be dragged', Math.abs(w1.x - 420) < 2 && Math.abs(w1.y - 160) < 2, JSON.stringify(w1));
    const tb = await DA(page, () => { const t = document.getElementById('editBar').getBoundingClientRect(); return [...document.querySelectorAll('.hud-el:not(.hidden)')].filter(e => { const r = e.getBoundingClientRect(); return r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom; }).map(e => e.dataset.hud); });
    check('Editor toolbar does not cover HUD elements', !tb.length, JSON.stringify(tb));
    const h0 = await rect('health');
    await drag(h0, h0, 2);
    await DA(page, () => document.querySelector('[data-ed=plus]').click());
    const h1 = await rect('health');
    check('Editor: HEALTH panel resizable', h1.w > h0.w + 10, `${h0.w.toFixed(0)} → ${h1.w.toFixed(0)}`);
    const pb = await DA(page, () => { const r = document.getElementById('pauseBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const a0 = await rect('ammo');
    await drag(a0, pb, 3);
    const a1 = await rect('ammo');
    check('Dropping a panel onto the pause button is refused', Math.hypot(a1.x - pb.x, a1.y - pb.y) > 40, JSON.stringify(a1));
    await DA(page, () => document.querySelector('[data-ed=done]').click()); await sleep(50);
    if (SHOTS) { await DA(page, () => document.getElementById('pauseEditHud').click()); await sleep(250); await page.screenshot({ path: path.join(SHOTS, 'm12_editor_iphone14promax.png') }); await DA(page, () => document.querySelector('[data-ed=cancel]').click()); }
    // minimap hidden via settings
    await DA(page, () => { document.getElementById('pauseSettings').click(); document.querySelector('[data-tab=hud]').click(); document.querySelector('input[data-key=showMinimap]').click(); });
    await page.close();
    ({ page } = await open(browser, base, null, { ctx }));
    await DA(page, () => document.body.classList.add('touch')); await sleep(50);
    const L = await DA(page, () => ({ layouts: JSON.parse(JSON.stringify(__DA3.hud.layouts)), mini: document.querySelector('.hud-minimap').classList.contains('hidden'), showMinimap: __DA3.settings.showMinimap }));
    check('After reload: moved WAVE and bigger HEALTH kept (touch profile)', Math.abs(L.layouts.touch.wave.y - 0.07) > 0.1 && L.layouts.touch.health.s > 1, JSON.stringify({ wave: L.layouts.touch.wave, health: L.layouts.touch.health }));
    check('Desktop profile untouched by phone editing', L.layouts.desktop.wave.x === 0.5 && L.layouts.desktop.wave.y === 0.06 && L.layouts.desktop.health.s === 1.1);
    check('Minimap hidden setting persists after reload', L.mini && L.showMinimap === false, JSON.stringify(L));
    await ctx.close();
  }
  // Desktop editor edits the desktop profile
  {
    const ctx = await browser.newContext(desktop);
    let { page } = await open(browser, base, null, { ctx, play: false });
    await page.click('#playBtn'); await sleep(150);
    await page.keyboard.press('Escape'); await sleep(100);
    await DA(page, () => document.getElementById('pauseEditHud').click()); await sleep(150);
    const ids = await DA(page, () => [...document.querySelectorAll('.hud-el')].filter(e => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden')).map(e => e.dataset.hud).sort());
    check('Desktop editor shows only info panels + minimap', JSON.stringify(ids) === JSON.stringify(['ammo', 'health', 'minimap', 'wave']), JSON.stringify(ids));
    const a = await DA(page, () => { const r = document.querySelector('.hud-ammo').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x - 300, a.y - 200, { steps: 8 }); await page.mouse.up();
    await DA(page, () => document.querySelector('[data-ed=done]').click()); await sleep(50);
    await page.close();
    ({ page } = await open(browser, base, null, { ctx }));
    const l = await DA(page, () => JSON.parse(JSON.stringify(__DA3.hud.layouts)));
    check('Desktop: dragged AMMO saved in desktop profile only', Math.abs(l.desktop.ammo.x - 0.91) > 0.15 && l.touch.ammo.x === 0.5, JSON.stringify({ d: l.desktop.ammo, t: l.touch.ammo }));
    // window resize adaptation
    for (const [w, h] of [[900, 560], [1600, 900]]) { await page.setViewportSize({ width: w, height: h }); await sleep(80); }
    const au = await audit(page);
    check('Desktop window resize: panels re-fit, in bounds', !au.oob.length && !au.overlap.length, JSON.stringify(au));
    if (SHOTS) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await DA(page, () => { localStorage.clear(); }); await page.close();
      ({ page } = await open(browser, base, null, { ctx }));
      await DA(page, () => { __DA3.dbg.waveStart(); __DA3.dbg.kill(); __DA3.dbg.kill(); __DA3.dbg['hp-35'](); for (let i = 0; i < 7; i++) __DA3.dbg.shot(); });
      await sleep(1500); await DA(page, () => __DA3.dbg.hit()); await sleep(60);
      await page.screenshot({ path: path.join(SHOTS, 'm12_desktop.png') });
    }
    await ctx.close();
  }

  // ---------- 9. Opacity setting: controls follow it, info panels stay readable (≥ 70 %) ----------
  {
    const { ctx, page } = await open(browser, base, iphone14);
    await DA(page, () => { __DA3.settings.hudOpacity = 0.3; __DA3.hud.layoutNow(); });
    const o = await DA(page, () => ({ fire: +getComputedStyle(document.querySelector('.hud-fire')).opacity, hp: +getComputedStyle(document.querySelector('.hud-health')).opacity }));
    check('Opacity 30 %: buttons 0.3, info panels kept at 0.7 for readability', Math.abs(o.fire - 0.3) < 0.01 && Math.abs(o.hp - 0.7) < 0.01, JSON.stringify(o));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm12-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
