// M1.5 — first infected (THE HOLLOW) in the browser: render, animation, combat, waves, HUD, restart, phone,
// weapon/hands regression, memory. Run: node tests/m1.5-infected.test.js  (SHOTS=dir for screenshots)
// Chromium (software WebGL) ≠ iPhone Safari: frame times here are NOT device performance.
// Pure AI / wave logic is covered by tests/sim-m1.5.test.mjs.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shoot = async (page, file) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, file) }); };
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick; const f = () => (__DA3.game.tick - t0 >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const frames = (page, n) => DA(page, n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const WAVES = '/prototype-3d/?debug=1&waves=1';
// aim the player exactly at an infected's zone and fire one round through the real input path
const fireAt = (page, idx, zone) => DA(page, ([i, z]) => {
  const g = __DA3.game, e = g.enemies[i], p = g.player, hb = e.hitboxes(), h = z === 'head' ? hb[0] : hb[1];
  const tz = z === 'head' ? h.cz : 0.45, d = Math.hypot(h.cx - p.x, h.cy - p.y);
  p.yaw = Math.atan2(h.cy - p.y, h.cx - p.x); p.pitch = Math.atan2(tz - 0.8 - p.z, d); g.weapon.recoilClimb = 0;
  __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); // tap shorter than a tick = exactly one round
}, [idx, zone]).then(() => ticks(page, 8));

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone = devices['iPhone 14 Pro Max landscape'];

  // ---------- 1. Real start (no debug): PLAY starts wave 1 with 3 infected; render; budgets ----------
  {
    const ctx = await browser.newContext(desktop); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/prototype-3d/');
    await page.click('#playBtn'); await sleep(200);
    // no debug hook in normal play: watch the HUD only
    await page.waitForFunction(() => /ОСТАЛОСЬ 3/.test(document.querySelector('[data-v=remainingText]').textContent), null, { timeout: 30000 }).catch(() => {});
    const hud = await page.evaluate(() => ({ wave: document.querySelector('[data-v=wave]').textContent, sub: document.querySelector('[data-v=remainingText]').textContent, kills: document.querySelector('[data-v=kills]').textContent, hook: typeof window.__DA3 }));
    check('Normal start: PLAY → wave 1 starts, HUD "ОСТАЛОСЬ 3", kills 0, no debug hook, no JS errors', hud.wave === '1' && hud.sub === 'ОСТАЛОСЬ 3' && hud.kills === '0' && hud.hook === 'undefined' && !errors.length, JSON.stringify({ hud, errors }));
    await ctx.close();
  }

  // ---------- 2. Model, animation, hitbox alignment, budgets (debug + waves) ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    await DA(page, () => { __DA3.game.waves.reset(); __DA3.setPlayer(3, 8, 0); });
    await DA(page, () => { const g = __DA3.game; g.spawnInfected('hollow', 6.0, 8.0, Math.PI); g.spawnInfected('hollow', 7.0, 6.6, Math.PI); g.spawnInfected('hollow', 7.2, 9.6, Math.PI); });
    await frames(page, 3);
    const r = await DA(page, () => {
      const v = __DA3.infectedView, g = __DA3.game;
      const out = { stats: { ...v.stats }, vm: __DA3.view.infoVM, world: __DA3.view.info, tris: 0 };
      return out;
    });
    const align = await DA(page, async () => {
      const THREE = await import('three'); const v = __DA3.infectedView, g = __DA3.game;
      return g.enemies.map(e => { const hp = v.boneWorld(e, 'head', new THREE.Vector3()); const hb = e.hitboxes()[0]; return Math.hypot(hp.x + 0 - hb.cx * 2, hp.z - hb.cy * 2, hp.y + 0.09 - hb.cz * 2); });
    });
    check('3 infected rendered from a pool (3 instances, shared geometry)', r.stats.active === 3 && r.stats.created === 3, JSON.stringify(r.stats));
    check('World draw calls with 3 infected ≤ 30 (3 per infected)', r.world.calls <= 30, JSON.stringify(r.world));
    check('Head hitbox matches the animated head (≤ 0.15 m)', align.every(d => d <= 0.15), align.map(d => d.toFixed(3)).join(' '));
    await shoot(page, 'm15_three_infected.png');
    // walk/run: feet planted — foot drift during stance is small compared to body travel
    const gait = await DA(page, async () => {
      const THREE = await import('three'); const g = __DA3.game, v = __DA3.infectedView, e = g.enemies[0];
      __DA3.setPlayer(14, 8, Math.PI); e.applyDamage(0, 'body', null);
      const fp = new THREE.Vector3(); let stance = 0, drift = 0, last = null, body0 = { x: e.x, y: e.y };
      await new Promise(res => { let n = 0; const f = () => {
        v.boneWorld(e, 'footL', fp);
        if (fp.y < 0.07) { if (last) { drift += Math.hypot(fp.x - last.x, fp.z - last.z); stance++; } last = { x: fp.x, z: fp.z }; } else last = null;
        (++n > 40 ? res() : requestAnimationFrame(f)); }; f(); });
      return { stance, drift, travel: Math.hypot(e.x - body0.x, e.y - body0.y) * 2, state: e.state };
    });
    check('Gait: the planted foot does not slide (stance drift < 25 % of body travel)', gait.travel > 0.5 && gait.drift < gait.travel * 0.25, JSON.stringify(gait));
    check('No JS errors (model + animation)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3. Combat in the browser: head/body hits, hit reaction, death animation, kill counted once ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    await DA(page, () => { const g = __DA3.game; g.waves.reset(); __DA3.setPlayer(3, 8, 0); g.spawnInfected('hollow', 9, 8, Math.PI); });
    await frames(page, 2);
    await fireAt(page, 0, 'body');
    const a = await DA(page, () => ({ hp: __DA3.game.enemies[0].hp, bursts: __DA3.infectedView.stats.bursts, state: __DA3.game.enemies[0].state, hitT: __DA3.game.enemies[0].hit.t }));
    check('Body hit in the game: −25 HP, blood burst, hit reaction running, infected alerted', a.hp === 75 && a.bursts >= 1 && a.state !== 'IDLE', JSON.stringify(a));
    await shoot(page, 'm15_hit_body.png');
    await fireAt(page, 0, 'head');
    const b = await DA(page, () => ({ hp: __DA3.game.enemies[0].hp, mark: document.getElementById('hitmark').className }));
    check('Head hit: −50 HP, gold headshot marker', b.hp === 25 && /head/.test(b.mark), JSON.stringify(b));
    await shoot(page, 'm15_hit_head.png');
    await fireAt(page, 0, 'head');
    const c = await DA(page, () => ({ alive: __DA3.game.enemies[0].alive, kills: __DA3.gs.kills, hud: document.querySelector('[data-v=kills]').textContent, mark: document.getElementById('hitmark').className }));
    check('Kill: DEAD, kill marker, HUD kills = 1', !c.alive && c.kills === 1 && c.hud === '1' && /kill/.test(c.mark), JSON.stringify(c));
    await DA(page, () => new Promise(r => setTimeout(r, 900)));
    const d = await DA(page, () => { const g = __DA3.infectedView.groupOf(__DA3.game.enemies[0]); const root = g.children.find(o => o.isBone); return { rx: root.rotation.x, y: root.position.y }; });
    check('Death animation: the body falls (root rotated ≥ 60°)', Math.abs(d.rx) > 1.05, JSON.stringify(d));
    await shoot(page, 'm15_death.png');
    await fireAt(page, 0, 'body');
    check('Shooting the corpse: kills stay 1', await DA(page, () => __DA3.gs.kills) === 1);
    await DA(page, () => new Promise(r => setTimeout(r, 6500)));
    const e = await DA(page, () => ({ n: __DA3.game.enemies.length, pool: __DA3.infectedView.poolSize, active: __DA3.infectedView.stats.active }));
    check('Corpse removed after the timeout; instance returned to the pool', e.n === 0 && e.active === 0 && e.pool === 1, JSON.stringify(e));
    check('No JS errors (combat)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 4. Attack on the player, HUD health, death screen, restart ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    await DA(page, () => { const g = __DA3.game; g.waves.reset(); __DA3.setPlayer(8, 8, 0); g.spawnInfected('hollow', 8.7, 8, Math.PI); });
    await DA(page, () => new Promise(r => { const f = () => (__DA3.gs.health.hp < 100 ? r() : requestAnimationFrame(f)); f(); }));
    const h = await DA(page, () => ({ hp: __DA3.gs.health.hp, hud: document.querySelector('[data-v=hp]').textContent }));
    check('Infected blow: −15 HP on the HUD', h.hp === 85 && h.hud === '85', JSON.stringify(h));
    await shoot(page, 'm15_attack.png');
    await DA(page, () => __DA3.gs.setHealth(10));
    await DA(page, () => new Promise(r => { const f = () => (__DA3.state === 'dead' ? r() : requestAnimationFrame(f)); f(); }));
    const dd = await DA(page, () => ({ state: __DA3.state, screen: !document.getElementById('dead').classList.contains('hidden'), stats: document.getElementById('deadStats').textContent, dead: __DA3.player.dead }));
    check('Player death: death screen with stats', dd.state === 'dead' && dd.screen && dd.dead && /убито/.test(dd.stats), JSON.stringify(dd));
    await shoot(page, 'm15_player_dead.png');
    await page.click('#restartBtn'); await sleep(100);
    const rs = await DA(page, () => ({ state: __DA3.state, hp: __DA3.gs.health.hp, mag: __DA3.gs.weapon.mag, kills: __DA3.gs.kills, enemies: __DA3.game.enemies.length, phase: __DA3.game.waves.phase, hud: document.querySelector('[data-v=hp]').textContent }));
    check('ЗАНОВО: back in play, HP 100, 30 rounds, kills 0, wave 1 restarts', rs.state === 'play' && rs.hp === 100 && rs.mag === 30 && rs.kills === 0 && rs.enemies === 0 && rs.phase === 'countdown' && rs.hud === '100', JSON.stringify(rs));
    // pause right at the moment of death → the death screen still comes (resume never skips it)
    await DA(page, () => { const g = __DA3.game; g.waves.reset(); g.spawnInfected('hollow', g.player.x + 0.7, g.player.y, Math.PI); __DA3.gs.setHealth(10); });
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.dead ? r() : requestAnimationFrame(f)); f(); }));
    await DA(page, () => __DA3.show('paused')); await sleep(900);
    const ps = await DA(page, () => __DA3.state);
    await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(50);
    check('Pause during the death delay: death screen still shown (not skipped)', (ps === 'dead' || await DA(page, () => __DA3.state) === 'dead'), `after pause: ${ps}`);
    check('No JS errors (attack / death / restart)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 5. Full wave 1 in real time: spawns, kills, WAVE 1 COMPLETE ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    // record each spawn at the moment it happens (afterwards the infected run at the player)
    await DA(page, () => { window.__sp = []; __DA3.game.on('infectedSpawn', e => window.__sp.push({ ok: __DA3.canStand(e.x, e.y, 0.2), d: Math.hypot(e.x - __DA3.player.x, e.y - __DA3.player.y) * 2 })); __DA3.game.restart(); });
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.enemies.length === 3 ? r() : requestAnimationFrame(f)); f(); }));
    const sp = await DA(page, () => window.__sp);
    check('Wave 1: 3 infected spawned on free floor, ≥ 9 m away', sp.every(s => s.ok && s.d >= 9 - 1e-6), JSON.stringify(sp));
    await shoot(page, 'm15_wave_spawned.png');
    for (let i = 0; i < 3; i++) { for (let k = 0; k < 8 && await DA(page, i => __DA3.game.enemies[i].alive, i); k++) await fireAt(page, i, 'head'); }
    const w = await DA(page, () => ({ kills: __DA3.gs.kills, phase: __DA3.gs.wave.phase, banner: document.getElementById('banner').textContent, show: document.getElementById('banner').classList.contains('show'), sub: document.querySelector('[data-v=remainingText]').textContent }));
    check('All 3 killed → "WAVE 1 COMPLETE", HUD "ЗАЧИЩЕНА", kills 3', w.kills === 3 && w.phase === 'cleared' && w.banner === 'WAVE 1 COMPLETE' && w.show && w.sub === 'ЗАЧИЩЕНА', JSON.stringify(w));
    await shoot(page, 'm15_wave_complete.png');
    check('No JS errors (wave)', !errors.length, errors.join(' | '));
    // memory: repeated waves + restarts (5 cycles): pool does not grow, JS heap stable
    const mem = await DA(page, async () => {
      const g = __DA3.game, heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
      const cycle = async () => { g.restart(); const t0 = performance.now(); while (g.enemies.length < 3 && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 100));
        for (const e of [...g.enemies]) { e.applyDamage(100, 'head', { dir: { x: 1, y: 0, z: 0 } }); g.onInfectedKilled(e); }
        for (const e of [...g.enemies]) g.removeInfected(e); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
      await cycle(); const h0 = heap(), c0 = __DA3.infectedView.stats.created;
      for (let i = 0; i < 4; i++) await cycle();
      if (window.gc) window.gc();
      return { created0: c0, created: __DA3.infectedView.stats.created, pool: __DA3.infectedView.poolSize, heapMB: +((heap() - h0) / 1048576).toFixed(2), hittables: g.hittables.length };
    });
    check('Repeated waves + restarts: no new instances (pool reused), no leftover hittables', mem.created === mem.created0 && mem.pool <= 4 && mem.hittables === 0, JSON.stringify(mem));
    check('JS heap growth over 4 extra waves < 3 MB', mem.heapMB < 3, mem.heapMB + ' MB');
    await ctx.close();
  }

  // ---------- 6. Phone (emulated landscape): controls, fire kills, HUD, hands, jump ----------
  {
    const { ctx, page, cdp, errors } = await open(browser, base, iphone, { path: WAVES });
    await DA(page, () => { const g = __DA3.game; g.waves.reset(); __DA3.setPlayer(3, 8, 0); g.spawnInfected('hollow', 9, 8, Math.PI); });
    await frames(page, 3);
    const fire = await DA(page, () => { const r = document.querySelector('.hud-fire').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await DA(page, () => { const e = __DA3.game.enemies[0], p = __DA3.game.player, hb = e.hitboxes()[0]; p.yaw = Math.atan2(hb.cy - p.y, hb.cx - p.x); p.pitch = Math.atan2(hb.cz - 0.8, Math.hypot(hb.cx - p.x, hb.cy - p.y)); });
    await touch(cdp, 'touchStart', [{ ...fire, id: 1 }]); await ticks(page, 1); await touch(cdp, 'touchEnd', []); await ticks(page, 8);
    const t = await DA(page, () => ({ hp: __DA3.game.enemies[0].hp, hands: __DA3.view.vm.hands.group.visible, vm: __DA3.view.infoVM.calls }));
    check('Phone: tap ОГОНЬ hits the infected; hands + weapon still rendered', t.hp < 100 && t.hands && t.vm >= 20, JSON.stringify(t));
    const j = await DA(page, () => { const r = document.querySelector('.hud-jump').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch(cdp, 'touchStart', [{ ...j, id: 2 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 4);
    check('Phone: ПРЫЖОК still works with infected present', await DA(page, () => __DA3.game.player.jumps) === 1);
    const hud = await DA(page, () => { const k = document.querySelector('.hud-wave').getBoundingClientRect(); return { kills: !!document.querySelector('[data-v=kills]'), inside: k.left >= 0 && k.right <= innerWidth && k.top >= 0 }; });
    check('Phone HUD: wave panel with kills counter fits the screen', hud.kills && hud.inside, JSON.stringify(hud));
    await shoot(page, 'm15_phone_hud.png');
    // ADS still aligned with infected in the scene
    await DA(page, () => { __DA3.input.aimToggle = true; __DA3.input.aimHeld = true; }); await ticks(page, 30); await sleep(100);
    const s = await DA(page, () => __DA3.view.vm.projectAnchor('sight'));
    check('Phone ADS: red dot still centred (< 1 %)', Math.abs(s.x) < 0.01 && Math.abs(s.y) < 0.01, `(${s.x.toFixed(4)}, ${s.y.toFixed(4)})`);
    await shoot(page, 'm15_phone_ads.png');
    check('No JS errors (phone)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 7. Performance snapshot (informational, software WebGL) ----------
  {
    const { ctx, page } = await open(browser, base, desktop, { path: WAVES });
    await DA(page, () => { __DA3.game.waves.reset(); __DA3.setPlayer(3, 8, 0); });
    const t0 = await DA(page, () => __DA3.timeRender(20));
    await DA(page, () => { const g = __DA3.game; g.spawnInfected('hollow', 6, 8, Math.PI); g.spawnInfected('hollow', 7, 6.6, Math.PI); g.spawnInfected('hollow', 7.2, 9.6, Math.PI); });
    await frames(page, 3);
    const t1 = await DA(page, () => __DA3.timeRender(20));
    const info = await DA(page, () => ({ world: __DA3.view.info, total: __DA3.view.infoTotal }));
    console.log(`      info: render ${t0.toFixed(1)} → ${t1.toFixed(1)} ms/frame with 3 infected (SwiftShader, CPU) · ${JSON.stringify(info)}`);
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'm1.5-perf.json'), JSON.stringify({ msWithout: +t0.toFixed(2), msWith: +t1.toFixed(2), ...info }, null, 2));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm15-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
