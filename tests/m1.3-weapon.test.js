// M1.3 — DA-R1 RAVEN weapon system in the browser (Playwright + Chromium; desktop and iPhone emulation).
// Run: node tests/m1.3-weapon.test.js   (SHOTS=dir for screenshots). Pure sim checks: tests/sim-m1.3.test.mjs.
// Chromium ≠ iOS Safari: WebGL here is software (SwiftShader), Web Audio output is not heard, touch is emulated.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shoot = async (page, file) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, file) }); };
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick; const f = () => (__DA3.game.tick - t0 >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const recordFires = page => DA(page, () => { window.__fires = []; __DA3.game.on('fire', e => window.__fires.push(__DA3.game.tick)); });
const fires = page => DA(page, () => window.__fires.slice());
const aimAtTarget = (page, idx, zone) => DA(page, ([i, z]) => { // exact aim at a target's head/chest from the current position
  const t = __DA3.game.hittables[i], p = __DA3.game.player, d = Math.hypot(t.x - p.x, t.y - p.y);
  p.yaw = Math.atan2(t.y - p.y, t.x - p.x); p.pitch = Math.atan2((z === 'head' ? 0.81 : 0.45) - 0.8, d);
  __DA3.game.weapon.recoilClimb = 0;
}, [idx, zone]);

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone14 = devices['iPhone 14 Pro Max landscape'];

  // ---------- 1. Boot, model, budgets, framing ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop);
    await sleep(500);
    const d = await DA(page, () => ({ vm: __DA3.view.infoVM, world: __DA3.view.info, name: __DA3.gs.weapon.name, skin: __DA3.vm.skin }));
    check('Game boots with DA-R1 RAVEN equipped, no JS errors', d.name === 'DA-R1 RAVEN' && d.skin === 'obsidian' && !errors.length, errors.join(' | '));
    check('Viewmodel budget: ≤ 25 draw calls, ≤ 12k triangles', d.vm.calls > 5 && d.vm.calls <= 25 && d.vm.triangles <= 12000, JSON.stringify(d.vm));
    check('World budget unchanged (≤ 20 draw calls without targets)', d.world.calls <= 20, JSON.stringify(d.world));
    const b = await DA(page, () => { const pts = __DA3.view.vm.screenBounds(); return { minX: Math.min(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)) }; });
    check('Hip position: weapon in the lower-right, centre of the screen stays clear', b.minX > 0.08 && b.maxY < -0.05, JSON.stringify(b));
    await shoot(page, 'm13_desktop_hip.png');
    await ctx.close();
  }

  // ---------- 2. Fire rate, ammo, HUD, auto-fire stop, crosshair bloom, recoil ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(8, 8, 0)); await recordFires(page);
    const gap0 = await DA(page, () => __DA3.crosshairGap);
    await DA(page, () => __DA3.input.setAction('fire', true));
    await ticks(page, 60);
    const mid = await DA(page, () => ({ gap: __DA3.crosshairGap, pitch: __DA3.game.player.pitch }));
    await DA(page, () => __DA3.input.setAction('fire', false));
    const f = await fires(page);
    const gaps = f.slice(1).map((t, i) => t - f[i]);
    check('600 RPM: shots exactly every 6 sim ticks (0.1 s)', f.length >= 9 && gaps.every(g => g === 6), `${f.length} shots, gaps ${[...new Set(gaps)]}`);
    await ticks(page, 30);
    const hud = await DA(page, () => ({ mag: document.querySelector('[data-v=mag]').textContent, res: document.querySelector('[data-v=reserve]').textContent, model: __DA3.gs.weapon.mag }));
    check('Ammo: HUD shows the GameState count (30 − shots)', +hud.mag === hud.model && hud.model === 30 - f.length && hud.res === '120', JSON.stringify(hud));
    const after = (await fires(page)).length;
    check('Releasing the trigger stops automatic fire', after === f.length);
    check('Crosshair widens during a spray (bloom)', mid.gap > gap0 * 1.5, `${gap0.toFixed(1)} → ${mid.gap.toFixed(1)} px`);
    await ticks(page, 40);
    const p2 = await DA(page, () => ({ gap: __DA3.crosshairGap, pitch: __DA3.game.player.pitch }));
    check('Recoil climbs during the spray and mostly recovers after', mid.pitch > 0.05 && p2.pitch < mid.pitch * 0.4, `pitch ${mid.pitch.toFixed(3)} → ${p2.pitch.toFixed(3)}`);
    check('Crosshair recovers after the spray', p2.gap < mid.gap * 0.7, `${p2.gap.toFixed(1)} px`);
    // empty magazine → dry fire + auto reload → HUD reload state → 30/90
    await DA(page, () => __DA3.gs.setAmmo(1, 120));
    await DA(page, () => __DA3.input.setAction('fire', true)); await ticks(page, 20); await DA(page, () => __DA3.input.setAction('fire', false));
    const r1 = await DA(page, () => ({ reloading: __DA3.gs.weapon.reloading, text: document.querySelector('[data-v=ammoState]').textContent, dry: __DA3.sfx.stats.played.dry || 0 }));
    check('Empty mag: dry click, auto-reload, HUD "ПЕРЕЗАРЯДКА"', r1.reloading && r1.text === 'ПЕРЕЗАРЯДКА' && r1.dry >= 1, JSON.stringify(r1));
    await DA(page, () => __DA3.input.setAction('fire', true)); await ticks(page, 12);
    const blocked = await DA(page, () => __DA3.gs.weapon.mag);
    await DA(page, () => __DA3.input.setAction('fire', false));
    check('Cannot fire during reload', blocked === 0);
    await DA(page, () => new Promise(res => { const f = () => (__DA3.gs.weapon.reloading ? requestAnimationFrame(f) : res()); f(); }));
    await ticks(page, 10);
    check('Reload completes in 1.3 s → 30 / 90 on the HUD', await DA(page, () => document.querySelector('[data-v=mag]').textContent + '/' + document.querySelector('[data-v=reserve]').textContent) === '30/90');
    // Full reload recorded frame by frame from its start
    await DA(page, () => { __DA3.gs.setAmmo(12, 90); __DA3.weapon.startReload(); });
    const vmLog = await DA(page, () => new Promise(res => { const log = []; const f = () => { log.push(__DA3.vm.mag); if (__DA3.gs.weapon.reloading) requestAnimationFrame(f); else requestAnimationFrame(() => { log.push(__DA3.vm.mag); res(log); }); }; f(); }));
    const out = vmLog.filter(m => m.y < -0.1 || !m.visible).length;
    check('Reload animation: magazine leaves and returns during the reload', out > 0 && vmLog[vmLog.length - 1].y === 0 && vmLog[vmLog.length - 1].visible, `${out}/${vmLog.length} frames with the magazine out`);
    // Screenshot with the magazine out: freeze the sim step for a moment (render keeps running)
    await DA(page, () => { __DA3.gs.setAmmo(12, 90); __DA3.weapon.startReload(); const g = __DA3.game; window.__step = g.step; g.step = () => {}; __DA3.weapon.reloadT = 0.27 * 1.3; __DA3.gs.setReload(true, 0.27); });
    await sleep(400); await shoot(page, 'm13_desktop_reload.png');
    await DA(page, () => { __DA3.game.step = window.__step; });
    await ctx.close();
  }

  // ---------- 3. Muzzle flash, smoke, casings, impacts ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0));
    await DA(page, () => { __DA3.view.vm.holdFlash = true; __DA3.input.setAction('fire', true); });
    await ticks(page, 2);
    const fl = await DA(page, () => __DA3.vm.flash);
    await shoot(page, 'm13_desktop_muzzle_flash.png');
    await ticks(page, 34);
    await DA(page, () => { __DA3.view.vm.holdFlash = false; __DA3.input.setAction('fire', false); });
    await sleep(250);
    const fx = await DA(page, () => ({ vm: __DA3.vm, imp: { ...__DA3.view.impacts.stats, decals: __DA3.view.impacts.decalCount } }));
    check('Muzzle flash shown on shot', fl === true);
    check('Smoke puffs after a burst (≥ 4 shots)', fx.vm.smoke > 0 && fx.vm.stats.smokeEmitted > 0, JSON.stringify(fx.vm.stats));
    check('Casings ejected (one per shot)', fx.vm.stats.casings === fx.vm.stats.shots && fx.vm.stats.shots >= 6);
    check('Wall impacts: bullet-hole decals + sparks', fx.imp.decals >= 6 && fx.imp.sparks > 20, JSON.stringify(fx.imp));
    await sleep(300); await shoot(page, 'm13_desktop_after_burst.png');
    await ctx.close();
  }

  // ---------- 4. Hitscan vs training targets, headshot / bodyshot / kill, walls block ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => { __DA3.setPlayer(9.5, 6.5, 0); __DA3.dbg.targets(); __DA3.game.weapon.rng = () => 0; });
    await sleep(100);
    const tap = () => DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); });
    await aimAtTarget(page, 0, 'head');
    await tap(); await ticks(page, 8);
    const h1 = await DA(page, () => ({ hp: __DA3.game.hittables[0].hp, mark: document.getElementById('hitmark').className, snd: { ...__DA3.sfx.stats.played } }));
    check('Headshot on target: 50 dmg, gold hit marker, headshot sound', h1.hp === 50 && /head/.test(h1.mark) && h1.snd.headshot >= 1, JSON.stringify(h1));
    await aimAtTarget(page, 1, 'chest');
    await tap(); await ticks(page, 8);
    check('Bodyshot: 25 dmg', await DA(page, () => __DA3.game.hittables[1].hp) === 75);
    await aimAtTarget(page, 0, 'head');
    await tap(); await ticks(page, 20);
    const k = await DA(page, () => ({ alive: __DA3.game.hittables[0].alive, mark: document.getElementById('hitmark').className, snd: __DA3.sfx.stats.played.kill || 0 }));
    check('Second headshot kills: red kill marker, kill sound, target falls', !k.alive && /kill/.test(k.mark) && k.snd >= 1, JSON.stringify(k));
    await sleep(300); await shoot(page, 'm13_desktop_targets.png');
    // wall blocks: target 5 (behind the pillar) from the east
    await DA(page, () => { __DA3.setPlayer(9.5, 5.6, Math.PI); });
    const hp0 = await DA(page, () => __DA3.game.hittables[4].hp);
    await tap(); await ticks(page, 4);
    check('No shooting through walls: target behind the pillar unharmed', await DA(page, () => __DA3.game.hittables[4].hp) === hp0 && hp0 === 100);
    await ctx.close();
  }

  // ---------- 5. ADS ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0));
    const hip = await DA(page, () => ({ fov: __DA3.view.camera.fov, spread: __DA3.gs.weapon.spread }));
    await DA(page, () => { __DA3.input.aimHeld = true; }); await ticks(page, 30); await sleep(100);
    const a = await DA(page, () => { const s = __DA3.view.vm.projectAnchor('sight'); return { sx: s.x, sy: s.y, fov: __DA3.view.camera.fov, spread: __DA3.gs.weapon.spread, cross: +document.getElementById('cross').style.opacity, ads: __DA3.gs.weapon.ads }; });
    check('ADS: red-dot reticle aligned with the screen centre', Math.abs(a.sx) < 0.01 && Math.abs(a.sy) < 0.01, `ndc (${a.sx.toFixed(4)}, ${a.sy.toFixed(4)})`);
    check('ADS: FOV reduced (×0.8)', Math.abs(a.fov - hip.fov * 0.8) < 0.2, `${hip.fov} → ${a.fov.toFixed(1)}`);
    check('ADS: spread reduced, crosshair hidden', a.spread < hip.spread * 0.5 && a.cross === 0 && a.ads === 1, JSON.stringify(a));
    await shoot(page, 'm13_desktop_ads.png');
    await DA(page, () => { const g = __DA3.game, o = g.step.bind(g); window.__adsLog = []; g.step = (c, dt) => { o(c, dt); window.__adsLog.push(g.state.weapon.ads); }; __DA3.input.aimHeld = false; });
    await ticks(page, 20);
    const logA = await DA(page, () => window.__adsLog.slice(0, 12));
    const back = logA[5];
    const done = await DA(page, () => ({ ads: __DA3.gs.weapon.ads, fov: __DA3.view.camera.fov }));
    check('Leaving ADS is smooth (mid-way after 6 ticks = 0.1 s), then back to hip FOV', back > 0.2 && back < 0.8 && done.ads === 0 && Math.abs(done.fov - hip.fov) < 0.01, `per-tick ${logA.map(x => x.toFixed(2)).join(' ')}`);
    // Pause while aiming & firing → both stop
    await DA(page, () => { __DA3.input.aimHeld = true; __DA3.input.setAction('fire', true); }); await ticks(page, 15);
    await page.keyboard.press('Escape'); await sleep(150);
    const pz = await DA(page, () => ({ st: __DA3.state, fire: __DA3.input.actions.fire, aim: __DA3.input.aimHeld, ads: __DA3.game.weapon.adsWanted, trig: __DA3.game.weapon.triggerDown }));
    check('Pause while aiming + firing: fire and ADS released', pz.st === 'paused' && !pz.fire && !pz.aim && !pz.ads, JSON.stringify(pz));
    await ctx.close();
  }

  // ---------- 6. PC controls: real click locks without firing, LMB fires, RMB aims, R reloads, blur stops ----------
  {
    const { ctx, page } = await open(browser, base, desktop, { play: false });
    await recordFires(page);
    await page.click('#playBtn'); await sleep(250);
    const lock = await DA(page, () => !!document.pointerLockElement);
    check('Click on PLAY locks the mouse and does not fire', lock && (await fires(page)).length === 0);
    await page.mouse.move(640, 360); await page.mouse.down(); await ticks(page, 13); await page.mouse.up(); await ticks(page, 3);
    const fl = await fires(page), n = fl.length, gl = fl.slice(1).map((t, i) => t - fl[i]);
    check('LMB held → automatic fire at 600 RPM (gaps of 6 ticks)', n >= 3 && gl.every(g => g === 6), `${n} rounds, gaps ${[...new Set(gl)]}`);
    await page.mouse.down({ button: 'right' }); await ticks(page, 20);
    const ads = await DA(page, () => __DA3.gs.weapon.ads);
    await page.mouse.up({ button: 'right' }); await ticks(page, 20);
    check('RMB held → ADS; released → hip', ads === 1 && await DA(page, () => __DA3.gs.weapon.ads) === 0);
    await page.keyboard.press('KeyR'); await ticks(page, 2);
    check('R → reload', await DA(page, () => __DA3.gs.weapon.reloading));
    await ticks(page, 90);
    await page.mouse.down(); await ticks(page, 5);
    await DA(page, () => dispatchEvent(new Event('blur'))); await DA(page, () => document.dispatchEvent(new Event('visibilitychange')));
    await DA(page, () => __DA3.show('paused'));
    const n1 = (await fires(page)).length; await sleep(300);
    check('Focus loss while firing → fire stops', (await fires(page)).length === n1 && !(await DA(page, () => __DA3.input.actions.fire)));
    await page.mouse.up();
    await ctx.close();
  }

  // ---------- 7. Mobile: FIRE hold, ПРИЦЕЛ toggle, ПЕРЕЗАР., 4 fingers ----------
  {
    const { ctx, page, cdp } = await open(browser, base, iphone14);
    await recordFires(page);
    const c = id => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
    const fire = await c('fire'), aim = await c('aim'), reload = await c('reload');
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0)); await sleep(400); await shoot(page, 'm13_mobile_hip.png');
    await touch(cdp, 'touchStart', [{ ...fire, id: 1 }]); await ticks(page, 13); await touch(cdp, 'touchEnd', []); await ticks(page, 3);
    const ft = await fires(page), gt = ft.slice(1).map((t, i) => t - ft[i]);
    check('Touch: holding ОГОНЬ = automatic fire at 600 RPM', ft.length >= 3 && gt.every(g => g === 6), `${ft.length} rounds, gaps ${[...new Set(gt)]}`);
    await touch(cdp, 'touchStart', [{ ...aim, id: 2 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 20);
    const on = await DA(page, () => ({ ads: __DA3.gs.weapon.ads, cls: document.querySelector('.hud-aim').classList.contains('toggled') }));
    check('Touch: one tap on ПРИЦЕЛ enters ADS and stays (button lit)', on.ads === 1 && on.cls, JSON.stringify(on));
    await shoot(page, 'm13_mobile_ads.png');
    await touch(cdp, 'touchStart', [{ ...aim, id: 3 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 20);
    check('Touch: second tap leaves ADS', await DA(page, () => __DA3.gs.weapon.ads) === 0);
    await touch(cdp, 'touchStart', [{ ...reload, id: 4 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 2);
    check('Touch: ПЕРЕЗАР. starts reload', await DA(page, () => __DA3.gs.weapon.reloading));
    await ticks(page, 90);
    // 4 fingers: move + look + fire + aim toggle
    const mv = { x: 110, y: 300 }, lk = { x: 480, y: 150 };
    const before = (await fires(page)).length;
    await touch(cdp, 'touchStart', [{ ...mv, id: 5 }, { ...lk, id: 6 }, { ...fire, id: 7 }, { ...aim, id: 8 }]);
    for (let i = 1; i <= 6; i++) { await touch(cdp, 'touchMove', [{ x: mv.x, y: mv.y - 50, id: 5 }, { x: lk.x + i * 6, y: lk.y, id: 6 }, { ...fire, id: 7 }, { ...aim, id: 8 }]); await sleep(30); }
    const t4 = await DA(page, () => ({ count: __DA3.touch.count, ads: __DA3.game.weapon.adsWanted }));
    await touch(cdp, 'touchEnd', []); await ticks(page, 2);
    check('4 fingers: move + look + fire + ПРИЦЕЛ together', t4.count === 4 && t4.ads && (await fires(page)).length > before, JSON.stringify(t4));
    await shoot(page, 'm13_mobile_ads_4fingers.png');
    // pause button → ADS off, fire off
    await DA(page, () => document.getElementById('pauseBtn').click()); await sleep(80);
    check('Touch pause: ADS toggle cleared', !(await DA(page, () => __DA3.input.aimToggle)) && await DA(page, () => __DA3.game.weapon.adsWanted) === false);
    await ctx.close();
  }

  // ---------- 8. Skins: shared geometry, materials differ, stats unchanged, persistence ----------
  {
    const ctx = await browser.newContext(desktop);
    let { page } = await open(browser, base, null, { ctx });
    const s = await DA(page, async () => {
      const mod = await import('/prototype-3d/src/render/weapons/raven-model.js');
      const other = mod.createRavenModel('neon_ghost');
      const vm = __DA3.view.vm.model;
      const out = { sameGeo: other.sharedGeometry.body === vm.sharedGeometry.body && other.sharedGeometry.accent === vm.sharedGeometry.accent, colors: {} };
      for (const id of ['obsidian', 'bloodline', 'neon_ghost']) {
        __DA3.setSkin(id);
        const m = __DA3.view.vm.model.mats;
        out.colors[id] = { accent: m.accent.color.getHexString(), grip: m.grip.color.getHexString(), line: m.line.emissiveIntensity, def: JSON.stringify(__DA3.game.weapon.def.damage) + __DA3.game.weapon.def.rpm };
      }
      return out;
    });
    check('All skins share one geometry (different material instances only)', s.sameGeo);
    const c = s.colors;
    check('Skins look different: Bloodline red accent/grip, Neon glow lines', c.obsidian.accent !== c.bloodline.accent && c.bloodline.grip !== c.obsidian.grip && c.neon_ghost.line > 1 && c.obsidian.line === 0, JSON.stringify(c));
    check('Skins never change weapon stats', c.obsidian.def === c.bloodline.def && c.bloodline.def === c.neon_ghost.def);
    for (const id of ['obsidian', 'bloodline', 'neon_ghost']) {
      await DA(page, id => __DA3.setSkin(id), id); await DA(page, () => __DA3.setPlayer(4.5, 8, 0)); await sleep(350);
      await shoot(page, `m13_desktop_skin_${id}.png`);
    }
    await page.close();
    ({ page } = await open(browser, base, null, { ctx }));
    check('Debug skin choice persists after reload', await DA(page, () => __DA3.vm.skin) === 'neon_ghost');
    await ctx.close();
  }

  // ---------- 9. Frame-rate independence of viewmodel motion ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    const r = await DA(page, async () => {
      const { Spring } = await import('/prototype-3d/src/render/weapons/viewmodel.js');
      const sim = hz => { const s = new Spring(150, 0.62); s.v = 1.05; let acc = 0, t = 0; const out = []; const SUB = 1 / 240;
        while (t < 0.5) { const dt = 1 / hz; acc += dt; t += dt; while (acc >= SUB) { acc -= SUB; s.step(0, SUB); } out.push([t, s.x]); }
        return out; };
      const a = sim(30), b = sim(120), at = (arr, t) => arr.reduce((p, c) => Math.abs(c[0] - t) < Math.abs(p[0] - t) ? c : p)[1];
      return [0.1, 0.2, 0.3].map(t => Math.abs(at(a, t) - at(b, t)));
    });
    check('Recoil spring: same motion at 30 Hz and 120 Hz (fixed sub-steps)', r.every(d => d < 0.004), JSON.stringify(r.map(x => +x.toFixed(5))));
    await ctx.close();
  }

  // ---------- 10. Audio (Web Audio) ----------
  {
    const { ctx, page } = await open(browser, base, desktop, { play: false });
    await page.click('#playBtn'); await sleep(200);
    await page.mouse.down(); await ticks(page, 7); await page.mouse.up();
    await page.keyboard.press('KeyR'); await ticks(page, 2);
    const a = await DA(page, () => ({ state: __DA3.sfx.state, unlocked: __DA3.sfx.stats.unlocked, played: { ...__DA3.sfx.stats.played } }));
    check('Audio unlocked by the first gesture; shot & reload sounds triggered', a.unlocked && a.state !== 'none' && a.played.shot >= 2 && a.played.reload === 1, JSON.stringify(a));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm13-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
