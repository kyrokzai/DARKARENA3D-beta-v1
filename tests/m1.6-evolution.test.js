// M1.6 in the browser: clean interactive menu, three-wave match → victory, animated hit zones vs bones,
// animation continuity, planted feet, death next to walls, pause, phone landscape, render budget.
// Run: node tests/m1.6-evolution.test.js   (SHOTS=dir for screenshots). Logic: tests/sim-m1.6.test.mjs.
// Chromium (software WebGL) ≠ iPhone Safari: nothing here is a statement about device performance.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shoot = async (page, file) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, file) }); };
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick; const f = () => (__DA3.game.tick - t0 >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const WAVES = '/prototype-3d/?debug=1&waves=1';
const visibleButtons = (page, id) => DA(page, id => [...document.getElementById(id).querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()), id);

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone = devices['iPhone 14 Pro Max landscape'], iphone11 = devices['iPhone 11 landscape'];

  // ---------- 1. Main menu (normal page, no debug): clean, three working buttons, keyboard ----------
  {
    const ctx = await browser.newContext(desktop); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/prototype-3d/'); await sleep(300);
    const m = await page.evaluate(() => ({ text: document.getElementById('menu').innerText.replace(/\s+/g, ' ').trim(), focus: document.activeElement && document.activeElement.id, hook: typeof window.__DA3 }));
    check('Main menu: only the title (+ M1.7 subtitle OUTPOST ZERO) and ИГРАТЬ / НАСТРОЙКИ / ОБ ИГРЕ (no technical or control hints)', m.text === 'DARK ARENA OUTPOST ZERO ИГРАТЬ НАСТРОЙКИ ОБ ИГРЕ' && m.hook === 'undefined', m.text);
    check('Keyboard: ИГРАТЬ focused when the menu opens', m.focus === 'playBtn');
    await shoot(page, 'm16_menu.png');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const f2 = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press('Enter'); await sleep(80);
    const about = await page.evaluate(() => ({ vis: !document.getElementById('about').classList.contains('hidden'), ver: document.getElementById('aboutVersion').textContent, text: document.getElementById('about').innerText }));
    check('Keyboard: ↓ ↓ Enter opens ОБ ИГРЕ with the description and the current version (M1.7)', f2 === 'aboutBtn' && about.vis && about.ver === 'M1.7' && /DARK ARENA/.test(about.text) && /три волны/.test(about.text), JSON.stringify({ f2, ver: about.ver }));
    await shoot(page, 'm16_about.png');
    await page.keyboard.press('Escape'); await sleep(50);
    check('Esc returns from ОБ ИГРЕ to the menu', await page.isVisible('#menu') && !(await page.isVisible('#about')));
    // settings: open with the mouse, change a value, it is saved and survives a reload
    await page.click('#menuSettings'); await sleep(80);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#settingsForm [data-tab], #settingsForm .tab')].map(b => b.textContent.trim()));
    check('НАСТРОЙКИ opens the existing settings (sound, graphics, controls, HUD tabs)', await page.isVisible('#settings') && await page.evaluate(() => !!document.querySelector('#settingsForm [data-key=volume]') && !!document.querySelector('#settingsForm [data-key=renderScale]') && !!document.querySelector('#settingsForm [data-key=mouseSens]') && !!document.querySelector('#settingsForm [data-key=hudScale]')), tabs.join(' | '));
    await page.evaluate(() => { const i = document.querySelector('#settingsForm [data-key=volume]'); i.value = '0.35'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); const t = document.querySelector('#settingsForm [data-key=showMinimap]'); t.click(); });
    await page.click('#settingsBack'); await sleep(50);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('darkarena_proto3d_settings_v1') || '{}'));
    await page.reload(); await sleep(300);
    await page.click('#menuSettings'); await sleep(80);
    const after = await page.evaluate(() => ({ vol: document.querySelector('#settingsForm [data-key=volume]').value, mini: document.querySelector('#settingsForm [data-key=showMinimap]').checked }));
    check('Settings are saved and restored after a reload', stored.volume === 0.35 && stored.showMinimap === false && Math.abs(+after.vol - 0.35) < 1e-9 && after.mini === false, JSON.stringify({ stored: { volume: stored.volume, showMinimap: stored.showMinimap }, after }));
    await page.evaluate(() => document.querySelector('#settingsForm [data-key=showMinimap]').click());
    await page.keyboard.press('Escape'); await sleep(50);
    // ИГРАТЬ (keyboard) starts a new match from wave 1
    await page.keyboard.press('Enter'); await sleep(400);
    const hud = await page.evaluate(() => ({ playing: document.body.classList.contains('playing'), wave: document.querySelector('[data-v=wave]').textContent, of: document.querySelector('[data-v=waveOf]').textContent, sub: document.querySelector('[data-v=remainingText]').textContent, kills: document.querySelector('[data-v=kills]').textContent }));
    check('Enter on ИГРАТЬ starts the match: wave 1/3, preparation', hud.playing && hud.wave === '1' && hud.of === '/3' && hud.sub === 'ПОДГОТОВКА' && hud.kills === '0', JSON.stringify(hud));
    await page.waitForFunction(() => /ОСТАЛОСЬ 9/.test(document.querySelector('[data-v=remainingText]').textContent), null, { timeout: 30000 }).catch(() => {});
    check('Wave 1 becomes active: HUD "ОСТАЛОСЬ 9" (counts infected that have not appeared yet)', await page.evaluate(() => document.querySelector('[data-v=remainingText]').textContent) === 'ОСТАЛОСЬ 9');
    // pause menu
    await page.keyboard.press('KeyP'); await sleep(450);
    const pb = await visibleButtons(page, 'paused');
    check('Pause: ПРОДОЛЖИТЬ / НАСТРОЙКИ / В ГЛАВНОЕ МЕНЮ', pb.join('|') === 'ПРОДОЛЖИТЬ|НАСТРОЙКИ|В ГЛАВНОЕ МЕНЮ', pb.join('|'));
    await shoot(page, 'm16_pause.png');
    await page.click('#pauseSettings'); await sleep(60); const inSet = await page.isVisible('#settings'); await page.click('#settingsBack'); await sleep(60);
    check('Pause → НАСТРОЙКИ → back to the pause', inSet && await page.isVisible('#paused'));
    // Esc on the pause screen resumes (and does not immediately pause again)
    await page.keyboard.press('Escape'); await sleep(200);
    const escResume = await page.evaluate(() => document.body.classList.contains('playing'));
    await page.keyboard.press('KeyP'); await sleep(450);
    check('Esc on the pause screen resumes the match', escResume && await page.isVisible('#paused'));
    // a key still held from the fight must not press a menu button (Space would otherwise hit the focused button)
    const focusNow = await page.evaluate(() => document.activeElement && document.activeElement.id);
    await page.click('#resumeBtn'); await sleep(100); await page.keyboard.down('Space'); await page.keyboard.press('KeyP'); await sleep(120);
    const early = await page.evaluate(() => document.activeElement && document.activeElement.id); await page.keyboard.up('Space'); await sleep(500);
    check('Menu focus arrives after a short delay: a held Space cannot press ПРОДОЛЖИТЬ / ЗАНОВО by accident', focusNow === 'resumeBtn' && early !== 'resumeBtn' && await page.isVisible('#paused') && await page.evaluate(() => document.activeElement.id) === 'resumeBtn', `${focusNow} / early: ${early}`);
    await page.click('#resumeBtn'); await sleep(100);
    check('ПРОДОЛЖИТЬ resumes the same match', await page.evaluate(() => document.body.classList.contains('playing') && /ОСТАЛОСЬ/.test(document.querySelector('[data-v=remainingText]').textContent)));
    await page.keyboard.press('KeyP'); await sleep(450); await page.click('#quitBtn'); await sleep(100);
    check('В ГЛАВНОЕ МЕНЮ returns to the main menu', await page.isVisible('#menu') && !(await page.evaluate(() => document.body.classList.contains('playing'))));
    await page.click('#playBtn'); await sleep(300);
    const again = await page.evaluate(() => ({ sub: document.querySelector('[data-v=remainingText]').textContent, kills: document.querySelector('[data-v=kills]').textContent, hp: document.querySelector('[data-v=hp]').textContent }));
    check('ИГРАТЬ after returning starts a NEW match (preparation, 0 kills, 100 HP)', again.sub === 'ПОДГОТОВКА' && again.kills === '0' && again.hp === '100', JSON.stringify(again));
    check('No JS errors (menus, normal page)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. Whole match: 3 waves × 9, ≤ 5 alive, intermission UI, victory screen, restart, menu ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    await DA(page, () => { window.__log = { maxAlive: 0, spawns: {}, subs: new Set(), banners: new Set(), waiting: 0 };
      __DA3.game.on('infectedSpawn', () => { const n = __DA3.gs.wave.number; window.__log.spawns[n] = (window.__log.spawns[n] || 0) + 1; });
      const tick = () => { const g = __DA3.game, alive = g.enemies.filter(e => e.alive).length; const L = window.__log;
        L.maxAlive = Math.max(L.maxAlive, alive); L.subs.add(document.querySelector('[data-v=remainingText]').textContent.replace(/\d+$/, 'N'));
        const b = document.getElementById('banner'); if (b.classList.contains('show')) L.banners.add(b.textContent);
        if (__DA3.gs.wave.phase === 'active' && __DA3.gs.wave.remaining > alive) L.waiting = Math.max(L.waiting, __DA3.gs.wave.remaining - alive);
        if (__DA3.state === 'play') { __DA3.gs.setHealth(100); if (alive >= 5 || (alive > 0 && g.waves.queue.length === 0)) __DA3.dbg.infKill(); }
        if (!g.matchOver) setTimeout(tick, 150); };
      tick(); });
    await page.waitForFunction(() => __DA3.state === 'victory', null, { timeout: 240000 }).catch(() => {});
    const r = await DA(page, () => ({ state: __DA3.state, kills: __DA3.gs.kills, log: { ...window.__log, subs: [...window.__log.subs], banners: [...window.__log.banners] }, stats: document.getElementById('winStats').textContent, phase: __DA3.gs.wave.phase }));
    check('Three waves, 9 infected each (27 spawned)', r.log.spawns[1] === 9 && r.log.spawns[2] === 9 && r.log.spawns[3] === 9, JSON.stringify(r.log.spawns));
    check('Never more than 5 alive at once; the others wait and the HUD still counts them', r.log.maxAlive === 5 && r.log.waiting >= 3, `max ${r.log.maxAlive}, up to ${r.log.waiting} waiting`);
    check('Wave transition UI: "WAVE N COMPLETE", countdown "ВОЛНА 2/3 ЧЕРЕЗ N", banner "ВОЛНА 2 / 3"', r.log.banners.includes('WAVE 1 COMPLETE') && r.log.banners.includes('WAVE 2 COMPLETE') && r.log.banners.includes('ВОЛНА 2 / 3') && r.log.banners.includes('ВОЛНА 3 / 3') && r.log.subs.includes('ВОЛНА 2 ЧЕРЕЗ N') && r.log.subs.includes('ВОЛНА 3 ЧЕРЕЗ N'), JSON.stringify({ b: r.log.banners, s: r.log.subs }));
    check('Victory screen after wave 3 with the kill count (27)', r.state === 'victory' && r.kills === 27 && /27/.test(r.stats) && r.phase === 'victory', r.stats);
    const vb = await visibleButtons(page, 'victory');
    check('Victory screen buttons: ЗАНОВО / ГЛАВНОЕ МЕНЮ', vb.join('|') === 'ЗАНОВО|ГЛАВНОЕ МЕНЮ');
    await shoot(page, 'm16_victory.png');
    await page.click('#winRestartBtn'); await sleep(200);
    const rs = await DA(page, () => ({ state: __DA3.state, wave: __DA3.gs.wave.number, rem: __DA3.gs.wave.remaining, kills: __DA3.gs.kills, enemies: __DA3.game.enemies.length, hp: __DA3.gs.health.hp, mag: __DA3.gs.weapon.mag }));
    check('ЗАНОВО: new match — wave 1, 9 remaining, 0 kills, no infected, 100 HP, 30 rounds', rs.state === 'play' && rs.wave === 1 && rs.rem === 9 && rs.kills === 0 && rs.enemies === 0 && rs.hp === 100 && rs.mag === 30, JSON.stringify(rs));
    // die → death screen → ГЛАВНОЕ МЕНЮ
    await page.waitForFunction(() => __DA3.game.enemies.some(e => e.alive), null, { timeout: 30000 });
    await DA(page, () => { const g = __DA3.game; g.damagePlayer(200); });
    await page.waitForFunction(() => __DA3.state === 'dead', null, { timeout: 10000 }).catch(() => {});
    const db = await visibleButtons(page, 'dead');
    check('Death screen: ЗАНОВО / ГЛАВНОЕ МЕНЮ', (await DA(page, () => __DA3.state)) === 'dead' && db.join('|') === 'ЗАНОВО|ГЛАВНОЕ МЕНЮ');
    await page.click('#deadMenuBtn'); await sleep(150);
    const mn = await DA(page, () => ({ state: __DA3.state, enemies: __DA3.game.enemies.length, dead: __DA3.player.dead, phase: __DA3.game.waves.phase }));
    check('ГЛАВНОЕ МЕНЮ after death: menu, match cleared', mn.state === 'menu' && mn.enemies === 0 && !mn.dead && mn.phase === 'idle', JSON.stringify(mn));
    check('No JS errors (whole match)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3. Animation ↔ hit zones, continuity, planted feet, death near walls (deterministic stepping) ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: '/prototype-3d/?debug=1' });
    await DA(page, () => __DA3.show('paused')); // the page loop no longer steps the sim: the test steps it itself
    const r = await DA(page, async () => {
      const THREE = await import('three'); const { InputState } = await import('/prototype-3d/src/input/input.js');
      const g = __DA3.game, v = __DA3.infectedView, inp = new InputState(), V = new THREE.Vector3(), W = new THREE.Vector3();
      const clear = () => { for (const e of [...g.enemies]) g.removeInfected(e); v.update(g.enemies, 0, 1); };
      const step = () => { g.step(inp.update(), 1 / 60); g.state.setHealth(100); v.update(g.enemies, 1 / 60, 1); };
      const headErr = e => { // bone-based head centre vs the sim head zone (metres)
        const grp = v.groupOf(e); grp.updateMatrixWorld(true);
        V.set(0, 0.085, 0.015).applyMatrix4(grp.children.find(o => o.isBone).getObjectByName('head').matrixWorld);
        const hb = e.hitboxes()[0]; return Math.hypot(V.x - hb.cx * 2, V.y - hb.cz * 2, V.z - hb.cy * 2);
      };
      const chestErr = e => { const grp = v.groupOf(e); V.set(0, 0.13, 0).applyMatrix4(grp.children.find(o => o.isBone).getObjectByName('chest').matrixWorld); const hb = e.hitboxes()[1]; return Math.hypot(V.x - hb.cx * 2, V.y - hb.cz * 2, V.z - hb.cy * 2); };
      const bone = (e, n) => v.boneWorld(e, n, W).clone();
      const out = { err: {}, chest: {}, jump: {}, states: [] };
      // --- a full encounter: idle → alert → run → attack → hit reactions; record zone errors and per-tick bone jumps
      clear(); __DA3.setPlayer(4, 9, 0);
      const e = g.spawnInfected('hollow', 10.5, 9, Math.PI); // 13 m: inside the 15 m detection range
      let prev = null, lastState = '', footStance = 0, footDrift = 0, travel = 0, lastFoot = null, strikeLag = null, swingTick = -1;
      for (let i = 0; i < 60 * 9; i++) {
        if (i === 60 * 5) e.applyDamage(0, 'head', { dir: { x: 1, y: 0, z: 0 } });
        if (i === 60 * 6) e.applyDamage(0, 'body', { dir: { x: 0.7, y: 0.7, z: 0 } });
        const x0 = e.x, y0 = e.y; step();
        if (e.state !== lastState) { out.states.push(e.state); lastState = e.state; if (e.state === 'ATTACK') swingTick = i; }
        const st = e.hit.t > 0 ? 'HIT' : e.state;
        out.err[st] = Math.max(out.err[st] || 0, headErr(e)); out.chest[st] = Math.max(out.chest[st] || 0, chestErr(e));
        const cur = { head: bone(e, 'head'), handR: bone(e, 'handR'), footL: bone(e, 'footL'), hips: bone(e, 'hips') };
        if (prev) for (const k of Object.keys(cur)) { const d = cur[k].distanceTo(prev[k]) - Math.hypot(e.x - x0, e.y - y0) * 2; out.jump[k] = Math.max(out.jump[k] || 0, d); }
        prev = cur;
        // planted feet while running at full speed: the stance foot must not move over the floor
        if (e.state === 'CHASE' && e.speed > e.k.run * 0.95) { travel += Math.hypot(e.x - x0, e.y - y0) * 2; if (cur.footL.y < 0.085) { if (lastFoot) { footDrift += Math.hypot(cur.footL.x - lastFoot.x, cur.footL.z - lastFoot.z); footStance++; } lastFoot = cur.footL; } else lastFoot = null; }
        // the visible strike (hand lowest/most forward) coincides with the sim's damage moment
        if (e.state === 'ATTACK' && strikeLag === null && e.blowDealt) strikeLag = { ticks: i - swingTick, raise: e.pose.raise, across: e.pose.across };
      }
      out.gait = { footStance, footDrift, travel };
      out.strike = strikeLag;
      // --- deaths next to a wall, in a corner, next to the pillar and in the open: where do the limbs end up?
      const B = ['head', 'chest', 'hips', 'handL', 'handR', 'foreArmL', 'foreArmR', 'footL', 'footR', 'shinL', 'shinR'];
      out.deaths = {};
      for (const [name, x, y, facing, dir] of [['wall', 1.4, 9.5, 0, { x: -1, y: 0 }], ['corner', 1.4, 1.4, Math.PI / 4, { x: -0.7, y: -0.7 }], ['pillar', 6.6, 5.5, Math.PI, { x: 1, y: 0 }], ['open', 10, 9.5, 0, { x: -1, y: 0 }], ['openFront', 10, 11.5, 0, { x: 1, y: 0 }]]) {
        clear(); __DA3.setPlayer(20, 2, 0);
        const d = g.spawnInfected('hollow', x, y, facing); d.senseT = 1e9; step();
        d.applyDamage(100, 'body', { dir: { ...dir, z: 0 } }); g.onInfectedKilled(d);
        let minY = 9, inWall = 0, maxStep = 0, pv = null, stillAt = null;
        for (let i = 0; i < 60 * 2.6; i++) { step(); const hp = bone(d, 'head'); if (pv) { maxStep = Math.max(maxStep, hp.distanceTo(pv)); if (i > 70 && hp.distanceTo(pv) < 1e-4 && stillAt === null) stillAt = i; } pv = hp; }
        for (const n of B) { const p = bone(d, n); minY = Math.min(minY, p.y); if (!__DA3.canStand(p.x / 2, p.z / 2, 0.04)) inWall++; }
        const head = bone(d, 'head');
        out.deaths[name] = { kind: d.fall.kind, minY: +minY.toFixed(3), inWall, headY: +head.y.toFixed(2), maxStep: +maxStep.toFixed(3), settled: stillAt !== null };
      }
      // corpse instance returns to the pool after corpseTime
      for (let i = 0; i < 60 * 2; i++) step();
      out.pool = { enemies: g.enemies.length, active: v.stats.active, pool: v.poolSize };
      clear();
      return out;
    });
    const mx = o => Math.max(...Object.values(o));
    check('Encounter runs through IDLE → ALERT → CHASE → ATTACK → RECOVER', ['IDLE', 'ALERT', 'CHASE', 'ATTACK', 'RECOVER'].every(s => r.states.includes(s)), r.states.join(' → '));
    check('Head hit zone follows the animated head in every state (≤ 6 cm): idle, run, attack, hit reaction', mx(r.err) <= 0.06, Object.entries(r.err).map(([k, v]) => `${k} ${(v * 100).toFixed(1)} cm`).join(', '));
    check('Chest hit zone follows the chest (≤ 8 cm)', mx(r.chest) <= 0.08, Object.entries(r.chest).map(([k, v]) => `${k} ${(v * 100).toFixed(1)} cm`).join(', '));
    check('Smooth transitions: no bone jumps between states (per 1/60 s: head < 6 cm, hand < 16 cm, hips < 3 cm)', r.jump.head < 0.06 && r.jump.handR < 0.16 && r.jump.hips < 0.03, Object.entries(r.jump).map(([k, v]) => `${k} ${(v * 100).toFixed(1)} cm`).join(', '));
    check('Planted feet while running: stance-foot drift < 8 % of the distance travelled', r.gait.travel > 3 && r.gait.footStance > 10 && r.gait.footDrift < r.gait.travel * 0.08, `${(r.gait.footDrift / r.gait.travel * 100).toFixed(1)} % over ${r.gait.travel.toFixed(1)} m`);
    check('Attack timing: the blow lands 0.36 s into the swing, when the claw has come down (visible strike = damage)', r.strike && Math.abs(r.strike.ticks / 60 - 0.357) < 0.03 && r.strike.raise < 1.6 && r.strike.across > -0.1, JSON.stringify(r.strike));
    const D = r.deaths;
    check('Death by a wall: no limb inside the wall, body on the floor', D.wall.inWall === 0 && D.wall.headY < 0.4 && D.wall.kind !== 'crumple', JSON.stringify(D.wall));
    check('Death in a corner: no limb inside the walls', D.corner.inWall === 0 && D.corner.headY < 0.4, JSON.stringify(D.corner));
    check('Death next to an obstacle: clear of it', D.pillar.inWall === 0 && D.pillar.headY < 0.4, JSON.stringify(D.pillar));
    check('Death in the open: on the back (shot from the front) / on the face (shot from behind)', D.open.kind === 'back' && D.openFront.kind === 'front' && D.open.inWall === 0 && D.openFront.inWall === 0);
    check('Limbs do not sink into the floor (lowest joint ≥ 2 cm above it in all five deaths)', Object.values(D).every(d => d.minY >= 0.02), Object.entries(D).map(([k, d]) => `${k} ${d.minY}`).join(', '));
    check('Falls are continuous and come to rest (no teleport: head < 12 cm per tick; settled)', Object.values(D).every(d => d.maxStep < 0.12 && d.settled), Object.entries(D).map(([k, d]) => `${k} ${d.maxStep}`).join(', '));
    check('Body removed after corpseTime; its model instance is back in the pool', r.pool.enemies === 0 && r.pool.active === 0 && r.pool.pool >= 1, JSON.stringify(r.pool));
    check('No JS errors (animation checks)', !errors.length, errors.join(' | '));
    // pause freezes the animation (real loop)
    await DA(page, () => { __DA3.show('play'); __DA3.setPlayer(4, 9, 0); __DA3.game.spawnInfected('hollow', 12, 9, Math.PI); });
    await ticks(page, 80);
    await DA(page, () => __DA3.show('paused')); await sleep(120);
    const snap = () => DA(page, async () => { const THREE = await import('three'); const e = __DA3.game.enemies[0], v = __DA3.infectedView; return ['head', 'handR', 'footL'].map(n => v.boneWorld(e, n, new THREE.Vector3()).toArray()).flat(); });
    const a = await snap(); await sleep(450); const b = await snap();
    check('Pause: infected animation frozen (bones do not move), resumes afterwards', a.every((x, i) => Math.abs(x - b[i]) < 1e-6));
    await shoot(page, 'm16_paused_fight.png');
    await ctx.close();
  }

  // ---------- 4. Render budget on the big arena: 5 infected, lights, arena geometry ----------
  {
    const { ctx, page } = await open(browser, base, desktop, { path: '/prototype-3d/?debug=1' });
    const lv = await DA(page, () => ({ props: __DA3.outpost ? __DA3.outpost.stats.props : 0, propCells: (() => { const w = __DA3.game.world; let n = 0; for (let y = 1; y < w.height - 1; y++) for (let x = 1; x < w.width - 1; x++) if (w.isSolidCell(x, y) && x !== 15 && x !== 16) n++; return n; })(), walls: __DA3.wallCount, lights: __DA3.view.level.lightCount, lamps: __DA3.view.level.lampCount, w: __DA3.game.world.width, h: __DA3.game.world.height }));
    check('Arena rendered: 30 × 16 grid, 9 lamp fixtures but still only 4 real lights (as M1.5)', lv.w === 30 && lv.h === 16 && lv.lamps === 9 && lv.lights === 4 && lv.walls + (lv.props === 13 ? lv.propCells : 0) > 100, JSON.stringify(lv)); // M1.7: 21 solid interior cells are drawn as outpost props
    await DA(page, () => { __DA3.setPlayer(3, 8, 0); const g = __DA3.game; for (const [x, y] of [[6, 8], [7, 6.6], [7.2, 9.6], [8.5, 7.4], [8.8, 8.8]]) g.spawnInfected('hollow', x, y, Math.PI).senseT = 1e9; });
    await sleep(600);
    const info = await DA(page, () => ({ world: __DA3.view.info, total: __DA3.view.infoTotal, inst: __DA3.infectedView.stats }));
    check('5 infected on screen: world ≤ 30 draw calls, whole frame ≤ 60 calls / ≤ 60k triangles', info.world.calls <= 30 && info.total.calls <= 60 && info.total.triangles <= 60000, JSON.stringify(info));
    await shoot(page, 'm16_five_infected.png');
    // lights follow the player through both halls without changing their number
    const seen = new Set();
    for (const x of [3, 9, 15, 21, 27]) { await DA(page, x => __DA3.setPlayer(x, 8, 0), x); await sleep(700); seen.add(await DA(page, () => __DA3.view.level.lightCount)); }
    check('Light pool stays at 4 lights while moving through both halls', seen.size === 1 && seen.has(4));
    await ctx.close();
  }

  // ---------- 5. Phone (emulated landscape): menu by touch, HUD buttons, jump / fire / reload / ADS, multitouch, pause, restart ----------
  for (const [name, dev] of [['iPhone 14 Pro Max', iphone], ['iPhone 11', iphone11]]) {
    const { ctx, page, cdp, errors } = await open(browser, base, dev, { path: WAVES, play: false });
    const land = await DA(page, () => innerWidth > innerHeight);
    const mb = await DA(page, () => [...document.querySelectorAll('#menu button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: r.height, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }));
    check(`${name}: landscape; menu buttons on screen and ≥ 40 px tall`, land && mb.length === 3 && mb.every(b => b.in && b.h >= 40), JSON.stringify(mb));
    if (name === 'iPhone 11') await shoot(page, 'm16_phone_menu.png');
    await page.tap('#aboutBtn'); await sleep(80); const ab = await page.isVisible('#about'); await page.tap('#aboutBack'); await sleep(80);
    await page.tap('#menuSettings'); await sleep(80); const se = await page.isVisible('#settings'); await page.tap('#settingsBack'); await sleep(80);
    check(`${name}: ОБ ИГРЕ and НАСТРОЙКИ open and close by touch`, ab && se && await page.isVisible('#menu'));
    await page.tap('#playBtn'); await sleep(300);
    const rect = id => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }, id);
    const btn = {}; for (const id of ['fire', 'aim', 'reload', 'jump', 'move', 'wave', 'health', 'ammo']) btn[id] = await rect(id);
    check(`${name}: HUD buttons and panels inside the screen; controls ≥ 44 px`, Object.values(btn).every(b => b.in) && ['fire', 'aim', 'reload', 'jump'].every(id => btn[id].w >= 44 && btn[id].h >= 44), JSON.stringify(Object.fromEntries(Object.entries(btn).map(([k, b]) => [k, b.in]))));
    await DA(page, () => { window.__f = 0; __DA3.game.on('fire', () => window.__f++); __DA3.gs.setAmmo(20, 120); setInterval(() => { if (__DA3.state === 'play') __DA3.gs.setHealth(100); }, 100); /* the wave is live: keep the tester alive */ });
    // jump
    await touch(cdp, 'touchStart', [{ x: btn.jump.x, y: btn.jump.y, id: 1 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 5);
    const jumps = await DA(page, () => __DA3.game.player.jumps);
    // fire (hold) + move + jump together
    await DA(page, () => new Promise(r => { const f = () => (__DA3.game.player.onGround ? r() : requestAnimationFrame(f)); f(); }));
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y, id: 2 }]);
    await touch(cdp, 'touchMove', [{ x: 110, y: btn.move.y - 50, id: 2 }]);
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y - 50, id: 2 }, { x: btn.fire.x, y: btn.fire.y, id: 3 }]); await ticks(page, 8);
    const x0 = await DA(page, () => __DA3.game.player.x);
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y - 50, id: 2 }, { x: btn.fire.x, y: btn.fire.y, id: 3 }, { x: btn.jump.x, y: btn.jump.y, id: 4 }]); await ticks(page, 10);
    const mt = await DA(page, () => ({ fires: window.__f, jumps: __DA3.game.player.jumps, x: __DA3.game.player.x, count: __DA3.touch.count }));
    await touch(cdp, 'touchEnd', []); await ticks(page, 3);
    check(`${name}: jump by tap; multitouch move + fire + jump together`, jumps === 1 && mt.jumps === 2 && mt.fires >= 2 && mt.x !== x0 && mt.count === 3, JSON.stringify(mt));
    // reload
    await touch(cdp, 'touchStart', [{ x: btn.reload.x, y: btn.reload.y, id: 5 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 3);
    const rel = await DA(page, () => __DA3.gs.weapon.reloading);
    await DA(page, () => new Promise(r => { const f = () => (__DA3.gs.weapon.reloading ? requestAnimationFrame(f) : r()); f(); }));
    // ADS toggle
    await touch(cdp, 'touchStart', [{ x: btn.aim.x, y: btn.aim.y, id: 6 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 30); await sleep(80);
    const ads = await DA(page, () => { const s = __DA3.view.vm.projectAnchor('sight'); return { ads: __DA3.gs.weapon.ads, x: s.x, y: s.y, mag: __DA3.gs.weapon.mag }; });
    check(`${name}: reload by tap (magazine full again), ADS toggle with the red dot centred`, rel && ads.mag === 30 && ads.ads === 1 && Math.abs(ads.x) < 0.01 && Math.abs(ads.y) < 0.01, JSON.stringify(ads));
    if (name === 'iPhone 11') await shoot(page, 'm16_phone_ads.png');
    await touch(cdp, 'touchStart', [{ x: btn.aim.x, y: btn.aim.y, id: 7 }]); await touch(cdp, 'touchEnd', []); await ticks(page, 20);
    // pause by touch, focus loss, resume
    await page.tap('#pauseBtn'); await sleep(100);
    const pz = await DA(page, () => ({ st: __DA3.state, ads: __DA3.input.aimToggle }));
    await page.tap('#resumeBtn'); await sleep(100);
    await DA(page, () => { dispatchEvent(new Event('blur')); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); }); await sleep(100);
    const fl = await DA(page, () => ({ st: __DA3.state, fire: __DA3.input.actions.fire, count: __DA3.touch.count }));
    await page.tap('#resumeBtn'); await sleep(100);
    check(`${name}: pause button and focus loss pause the match; ПРОДОЛЖИТЬ resumes`, pz.st === 'paused' && fl.st === 'paused' && !fl.fire && fl.count === 0 && await DA(page, () => __DA3.state) === 'play', JSON.stringify({ pz, fl }));
    // wave is running on the phone; HUD shows it; restart from the pause → menu → ИГРАТЬ
    await page.waitForFunction(() => __DA3.gs.wave.phase === 'active' && __DA3.game.enemies.length >= 2, null, { timeout: 40000 }).catch(() => {});
    const wv = await DA(page, () => ({ sub: document.querySelector('[data-v=remainingText]').textContent, of: document.querySelector('[data-v=waveOf]').textContent, n: __DA3.game.enemies.length }));
    if (name === 'iPhone 11') await shoot(page, 'm16_phone_hud.png');
    await page.tap('#pauseBtn'); await sleep(100); await page.tap('#quitBtn'); await sleep(100); await page.tap('#playBtn'); await sleep(300);
    const again = await DA(page, () => ({ st: __DA3.state, wave: __DA3.gs.wave.number, rem: __DA3.gs.wave.remaining, enemies: __DA3.game.enemies.length, kills: __DA3.gs.kills }));
    check(`${name}: wave shown in the HUD (ОСТАЛОСЬ 9, /3); menu → ИГРАТЬ restarts the match cleanly`, wv.sub === 'ОСТАЛОСЬ 9' && wv.of === '/3' && wv.n >= 2 && again.st === 'play' && again.wave === 1 && again.rem === 9 && again.enemies === 0 && again.kills === 0, JSON.stringify({ wv, again }));
    check(`${name}: no JS errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm16-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
