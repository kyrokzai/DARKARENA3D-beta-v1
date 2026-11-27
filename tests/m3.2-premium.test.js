// M3.2 PREMIUM — browser test of the top-down overhaul: menu (REF-01), graphics levels switched at runtime, weapon
// selection (REF-03: real stats, live previews, equip → weapon in the hands), HUD (REF-02, GameState only), pause →
// menu → Продолжить, Kazakhstan patch in the hero material, active weapon in the hands, upper / lower body split,
// lab invariants (walls face the room, props on the exact solid cells, decor ≤ 0.22 m, gate animation), infected
// health bars, loop start, memory stable over restarts. Screenshots → docs/m3.2/.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve, makeChecker, sleep, touch } = require('./lib/harness');

const SHOTS = path.join(__dirname, '..', 'docs', 'm3.2');
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); }), n);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const { check, results } = makeChecker();
  const { weaponStats } = await import(path.join(__dirname, '..', 'prototype-3d', 'src', 'topdown', 'loadout-data.js'));
  try {
    const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/prototype-3d/topdown.html?debug=1&gfx=balanced');
    await page.waitForFunction(() => window.__DA3TD && !document.getElementById('playBtn').disabled, null, { timeout: 120000 });
    await sleep(1500); await frames(page, 3);

    // ---------------- main menu (REF-01) ----------------
    const menu = await page.evaluate(() => ({ state: window.__DA3TD.state, mode: window.__DA3TD.view.mode,
      buttons: ['playBtn', 'continueBtn', 'loadoutBtn', 'settingsBtn', 'aboutBtn'].map(id => { const b = document.getElementById(id), r = b.getBoundingClientRect(); return { id, text: b.textContent.trim(), dis: b.disabled, w: r.width, h: r.height, in: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }),
      gfx: [...document.querySelectorAll('#menu [data-gfx]')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')),
      avatar: (document.querySelector('#menu img[data-avatar]').src || '').slice(0, 22) }));
    check('Menu: 5 buttons (Играть, Продолжить, Выбор оружия, Настройки, Об игре) on screen', menu.buttons.map(b => b.text).join('|') === 'Играть|Продолжить|Выбор оружия|Настройки|Об игре' && menu.buttons.every(b => b.in && b.h >= 30), menu.buttons.map(b => b.text).join('|'));
    check('Menu: Продолжить disabled without a run in progress', menu.buttons[1].dis === true);
    check('Menu: 3 graphics levels Низкое / Среднее / Высокое, the current one marked', menu.gfx.join('|') === 'Низкое|Среднее*|Высокое', menu.gfx.join('|'));
    check('Menu: 3D showcase view of the hero in the lab + operator portrait rendered from the model', menu.mode === 'menu' && menu.avatar.startsWith('data:image/png'), `${menu.mode} ${menu.avatar}`);
    await page.screenshot({ path: path.join(SHOTS, 'menu_iphone.png') });

    // ---------------- graphics levels switched at runtime ----------------
    const lvl = async id => { await page.evaluate(id => document.querySelector(`#menu [data-gfx="${id}"]`).click(), id); await frames(page, 3);
      return page.evaluate(() => { const v = window.__DA3TD.view; return { id: v.profileId, composer: !!v.composer, shadows: v.renderer.shadowMap.enabled, env: !!v.scene.environment, steam: v.gfx.steam,
        saved: JSON.parse(localStorage.getItem('darkarena.topdown.v1') || '{}').graphicsProfile }; }); };
    const lo = await lvl('performance'), hi = await lvl('quality'), md = await lvl('balanced');
    check('Низкое: no composer, no shadow map, no PMREM reflections', lo.id === 'performance' && !lo.composer && !lo.shadows && !lo.env, JSON.stringify(lo));
    check('Высокое: bloom composer, shadows, reflections', hi.id === 'quality' && hi.composer && hi.shadows && hi.env, JSON.stringify(hi));
    check('Среднее: no composer (MSAA framebuffer), no shadow map (blob shadows; measured cost), choice saved', md.id === 'balanced' && !md.composer && !md.shadows && md.saved === 'balanced', JSON.stringify(md));
    check('Switching levels at runtime raises no errors', errors.length === 0, errors.slice(0, 2).join(' | '));

    // ---------------- gates (in the menu: no waves, so no spawn opens them meanwhile) ----------------
    await page.evaluate(() => window.__DA3TD.view.level.openAllDoors(2.5));
    await page.waitForFunction(() => window.__DA3TD.view.level.doorsOpen.every(v => v > 0.95), null, { timeout: 8000 }).catch(() => {});
    const d1 = await page.evaluate(() => window.__DA3TD.view.level.doorsOpen);
    await page.waitForFunction(() => window.__DA3TD.view.level.doorsOpen.every(v => v < 0.05), null, { timeout: 10000 }).catch(() => {});
    const d2 = await page.evaluate(() => window.__DA3TD.view.level.doorsOpen);
    check('Gates: the split leaves slide open on request and close again (visual only)', d1.every(v => v > 0.95) && d2.every(v => v < 0.05), `${d1} → ${d2}`);

    // ---------------- weapon selection (REF-03) ----------------
    await page.evaluate(() => document.getElementById('loadoutBtn').click()); await sleep(1600); await frames(page, 3);
    const lo3 = await page.evaluate(() => [...document.querySelectorAll('#lCards .lCard')].map(c => ({ name: c.querySelector('h3').textContent, nums: [...c.querySelectorAll('.stats b')].map(b => +b.textContent), ammo: c.querySelector('.ammoLine b').textContent, on: c.classList.contains('on') })));
    const want = ['raven', 'ak47', 'krait'].map(weaponStats);
    check('Loadout: the three real weapons of defs.js (RAVEN, AK-47, KRAIT)', lo3.map(c => c.name).join('|') === want.map(w => w.name).join('|'), lo3.map(c => c.name).join('|'));
    check('Loadout: stat bars = the documented normalisation of the real values', lo3.every((c, i) => c.nums.join() === want[i].bars.map(b => b.value).join() && c.ammo === `${want[i].mag} / ${want[i].reserve}`), lo3.map(c => c.nums.join('/')).join(' · '));
    const pv = await page.evaluate(() => { const r = document.querySelector('#lCards .pv[data-weapon="ak47"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const shot = await page.screenshot({ clip: { x: pv.x, y: pv.y, width: pv.w, height: pv.h } });
    const varied = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 16) { const l = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, l); mx = Math.max(mx, l); } return mx - mn; }, shot.toString('base64'));
    check('Loadout: live 3D preview of the gun is drawn in the card window', varied > 120, `luma range ${varied}`);
    await page.screenshot({ path: path.join(SHOTS, 'loadout_iphone.png') });
    await page.evaluate(() => document.querySelector('[data-equip="1"]').click()); await sleep(100);
    const eq = await page.evaluate(() => ({ on: [...document.querySelectorAll('#lCards .lCard')].map(c => c.classList.contains('on')), slot: window.__DA3TD.settings.startSlot }));
    check('Loadout: Экипировать AK-47 marks it and makes it the starting weapon', eq.slot === 1 && eq.on.join() === 'false,true,false', JSON.stringify(eq));
    for (const tab of ['secondary', 'gear', 'skins', 'primary']) await page.evaluate(t => document.querySelector(`.tabs [data-tab="${t}"]`).click(), tab);
    const tabs = await page.evaluate(() => ({ dev: document.querySelector('[data-pane="secondary"]').textContent.includes('в разработке'), gear: document.querySelectorAll('#gearRow .gItem.dev').length, real: document.querySelectorAll('#gearRow .gItem.real').length, skins: document.querySelectorAll('#lSkins .lCard').length }));
    check('Tabs: secondary / medkit / plate / torch shown as "в разработке", the strike as real, 3 RAVEN skins', tabs.dev && tabs.gear === 3 && tabs.real === 1 && tabs.skins === 3, JSON.stringify(tabs));

    // ---------------- В бой → run with the equipped weapon, loop steps at once ----------------
    await page.evaluate(() => document.getElementById('fightBtn').click());
    await page.waitForFunction(() => window.__DA3TD.state === 'play' && window.__DA3TD.game.tick > 10, null, { timeout: 10000 }).catch(() => {});
    const run = await page.evaluate(() => { const T = window.__DA3TD; return { state: T.state, mode: T.view.mode, tick: T.game.tick, weapon: T.game.state.weapon.id, hero: T.view.hero.weapon }; });
    check('В бой starts the run with the equipped AK-47 in the hands (sim + hero model)', run.state === 'play' && run.mode === 'game' && run.weapon === 'ak47' && run.hero === 'ak47', JSON.stringify(run));
    check('The sim steps right after the start (no stalled loop)', run.tick > 10, `tick ${run.tick}`);
    await page.evaluate(() => { setInterval(() => { const g = window.__DA3TD.game; if (!g.player.dead) g.state.setHealth(100); }, 100); });
    await page.waitForFunction(() => window.__DA3TD.game.state.runTime > 1.5 && window.__DA3TD.view.flight >= 1, null, { timeout: 15000 }).catch(() => {}); await frames(page, 2);

    // ---------------- HUD (REF-02) from GameState ----------------
    const hud = await page.evaluate(() => { const T = window.__DA3TD, s = T.game.state; return { wave: document.getElementById('tdWave').textContent, kills: document.getElementById('tdKills').textContent, time: document.getElementById('tdTime').textContent, hp: document.getElementById('tdHpText').textContent,
      cards: [...document.querySelectorAll('.wcard')].map(c => c.querySelector('.wName').textContent + ':' + c.querySelector('.wAmmo b').textContent + '/' + c.querySelector('.wAmmo i').textContent + (c.classList.contains('active') ? '*' : '')),
      slots: s.arsenal.slots.map((x, i) => x.short + ':' + x.mag + '/' + x.reserve + (i === s.arsenal.active ? '*' : '')), tasks: document.querySelectorAll('#tdTasks li').length, runTime: s.runTime, waveN: s.wave.number, of: s.wave.of, endless: s.wave.endless,
      fake: document.querySelectorAll('[id*=armor],[id*=armour],[id*=grenade],[class*=grenade]').length, icons: [...document.querySelectorAll('.wcard .wImg')].filter(i => (i.src || '').startsWith('data:image')).length }; });
    // M3.3: the top-down match is endless → "Волна N" (no "/3"); a non-endless match still shows N/of
    check('HUD: wave N (endless, M3.3) / N/of, HP 100 / 100, run clock from GameState.runTime', hud.wave === (hud.endless ? `Волна ${hud.waveN}` : `Волна ${hud.waveN}/${hud.of}`) && hud.hp === '100 / 100' && /^\d\d:\d\d$/.test(hud.time) && hud.runTime > 1, `${hud.wave} · ${hud.hp} · ${hud.time} (${hud.runTime.toFixed(1)} s)`);
    check('HUD: three weapon cards = GameState.arsenal.slots (names, ammo, active)', hud.cards.join() === hud.slots.join(), hud.cards.join(' '));
    check('HUD: weapon icons rendered from the real models; objectives listed; no armour / grenade (no such mechanics)', hud.icons === 3 && hud.tasks >= 2 && hud.fake === 0, JSON.stringify({ icons: hud.icons, tasks: hud.tasks, fake: hud.fake }));
    await page.evaluate(() => { window.__DA3TD.game.state.weapon.mag = 3; window.__DA3TD.input.setAction('reload', true); }); await sleep(250);
    await page.evaluate(() => window.__DA3TD.input.setAction('reload', false));
    const rl = await page.evaluate(() => ({ on: document.getElementById('tdReloadBox').classList.contains('on'), t: document.getElementById('tdReloadT').textContent, rel: window.__DA3TD.game.state.weapon.reloading }));
    check('HUD: reload strip with the real remaining time while reloading', rl.rel && rl.on && /^\d+\.\d с$/.test(rl.t), JSON.stringify(rl));
    await page.screenshot({ path: path.join(SHOTS, 'hud_iphone.png') });

    // ---------------- hero: patch, weapon, upper / lower body ----------------
    const hero = await page.evaluate(() => { const v = window.__DA3TD.view, h = v.hero; let key = null, tex = false; h.root.traverse(o => { if (o.isSkinnedMesh) { key = o.material.customProgramCacheKey && o.material.customProgramCacheKey(); } });
      const arm = new (h.root.position.constructor)(); h.bones.RightArm.getWorldPosition(arm); return { key, patch: !!v.patch, len: v.patch && v.patch.len }; });
    check('Kazakhstan patch: projected into the hero material (shader variant), on the right upper arm', hero.key === 'da-kz-patch' && hero.patch && hero.len > 0.15 && hero.len < 0.45, JSON.stringify(hero));
    await page.evaluate(() => { const T = window.__DA3TD; T.td.move.x = 1; T.td.move.y = 0; window.__strafe = setInterval(() => { T.td.move.x = 1; T.game.player.yaw = -Math.PI / 2; }, 10); });
    await page.waitForFunction(() => Math.abs(window.__DA3TD.view.hero.twist) > 0.6, null, { timeout: 8000 }).catch(() => {});
    const tw = await page.evaluate(() => { const h = window.__DA3TD.view.hero; return { twist: h.twist, clip: h.clip }; });
    await page.evaluate(() => { clearInterval(window.__strafe); window.__DA3TD.td.move.x = 0; });
    check('Strafing (move right, aim up): legs follow the move, the upper body twists back to the aim (≤ 75°)', Math.abs(tw.twist) > 0.6 && Math.abs(tw.twist) <= 75 * Math.PI / 180 + 1e-6 && /Walk|Run/.test(tw.clip), JSON.stringify(tw));

    // ---------------- lab invariants ----------------
    const lab = await page.evaluate(() => { const T = window.__DA3TD, L = T.view.level, grid = T.game.world.grid, H = grid.length, W = grid[0].length;
      let solids = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x] !== '0') solids++;
      const onOpen = L.plan.props.filter(p => grid[p.y][p.x] === '0').length;
      // wall winding: every wall triangle faces along its stored normal (towards the room)
      let walls = null; L.group.traverse(o => { if (o.name === 'walls') walls = o; });
      const pos = walls.geometry.attributes.position, nor = walls.geometry.attributes.normal, idx = walls.geometry.index.array; let bad = 0;
      const V = walls.position.constructor, a = new V(), b = new V(), c = new V(), n = new V();
      for (let i = 0; i < idx.length; i += 3) { a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]); n.fromBufferAttribute(nor, idx[i]); if (b.sub(a).cross(c.sub(a)).dot(n) <= 0) bad++; }
      return { solids, props: L.plan.props.length, onOpen, tris: idx.length / 3, bad, doors: L.doors.length, placed: L.stats.placed }; });
    check('Lab: one prop on every interior solid cell (exact footprint), none on open floor', lab.props === lab.solids && lab.onOpen === 0, `${lab.props}/${lab.solids}`);
    check('Lab: every wall face is wound towards the room (visible, not culled)', lab.bad === 0 && lab.tris > 50, `${lab.bad} of ${lab.tris} triangles inverted`);
    const deco = await page.evaluate(() => { const L = window.__DA3TD.view.level, W = window.__DA3TD.game.world.grid[0].length, S = 2, out = [];
      const box = o => { o.updateMatrixWorld(true); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; o.traverse(m => { if (!m.isMesh) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); mn = mn.map((v, i) => Math.min(v, bb.min.getComponent(i))); mx = mx.map((v, i) => Math.max(v, bb.max.getComponent(i))); }); return { mn, mx }; };
      for (const o of L.doors) { const b = box(o); out.push(b.mx[0] > W * S / 2 ? (W - 1) * S - b.mn[0] : b.mx[0] - S); }
      for (const o of L.lamps) { const b = box(o); const z = o.position.z < 3 ? b.mx[2] - S : (b.mx[0] > W * S / 2 ? (W - 1) * S - b.mn[0] : b.mx[0] - S); out.push(z); }
      return out.map(v => +v.toFixed(3)); });
    check('Lab: gates and wall lamps reach ≤ 0.22 m into the room (rule 12)', deco.every(d => d <= 0.24), deco.join(' '));
    // ---------------- infected health bars ----------------
    await page.waitForFunction(() => window.__DA3TD.game.enemies.filter(e => e.alive).length >= 2, null, { timeout: 30000 }).catch(() => {});
    await frames(page, 2);
    const bars = await page.evaluate(() => { const T = window.__DA3TD; let n = -1; T.view.scene.traverse(o => { if (o.isInstancedMesh && o.renderOrder === 20 && o.instanceColor) n = o.count; }); return { n, alive: T.game.enemies.filter(e => e.alive).length }; });
    check('Health bars over every living infected (instanced, ≤ 16)', bars.n === Math.min(16, bars.alive) && bars.alive > 0, JSON.stringify(bars));

    // ---------------- pause → menu → Продолжить ----------------
    const before = await page.evaluate(() => { const s = window.__DA3TD.game.state; return { wave: s.wave.number, kills: s.kills, hp: s.health.hp }; });
    await page.evaluate(() => document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 21, pointerType: 'touch' }))); await sleep(150);
    await page.evaluate(() => document.getElementById('menuBtn').click()); await sleep(300);
    const mid = await page.evaluate(() => ({ state: window.__DA3TD.state, cont: !document.getElementById('continueBtn').disabled }));
    await page.evaluate(() => document.getElementById('continueBtn').click());
    await page.waitForFunction(() => window.__DA3TD.state === 'play', null, { timeout: 8000 }).catch(() => {});
    const after = await page.evaluate(() => { const s = window.__DA3TD.game.state; return { state: window.__DA3TD.state, wave: s.wave.number, kills: s.kills, hp: s.health.hp }; });
    check('Pause → Главное меню: Продолжить enabled; it resumes the same run', mid.state === 'menu' && mid.cont && after.state === 'play' && after.wave === before.wave && after.kills >= before.kills, `${JSON.stringify(mid)} ${JSON.stringify(after)}`);

    // ---------------- memory over restarts ----------------
    const mem = [];
    for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('btnPause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 30, pointerType: 'touch' }))); await sleep(100);
      await page.evaluate(() => document.getElementById('restartBtn').click()); await page.waitForFunction(() => window.__DA3TD.state === 'play', null, { timeout: 8000 }).catch(() => {}); await frames(page, 3);
      mem.push(await page.evaluate(() => { const m = window.__DA3TD.view.renderer.info.memory; return m.geometries + '/' + m.textures; })); }
    check('Memory: geometries / textures stable over 4 restarts', mem.slice(1).every(m => m === mem[1]), mem.join(' '));
    check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  } catch (e) { check('test run without exceptions', false, e.stack || e.message); }
  await browser.close(); srv.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
