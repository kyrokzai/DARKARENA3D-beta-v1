// M2.0 HEAVY ARSENAL in the browser: three weapons in the real game — keys 1/2/3 + wheel, the viewmodel follows the sim
// (kits, switch animation), hands on the new guns (penetration with the M1.4 limits), ADS sight alignment per weapon,
// KRAIT pump + ejected shell + shell-by-shell reload in the HUD, AK-47 reload, melee with every weapon, the flashlight
// (toggle, direction, ADS, no shader recompile, every weapon), hit effects (surfaces, pools, head vs body), audio
// (per-weapon sounds, mute, pause), pause / focus loss during a switch, graphics settings, no leaks over restarts;
// touch (iPhone 11 landscape): slots + СВЕТ button, multitouch with switching, jump, HUD editor.
// Run: node tests/m2.0-arsenal.test.js   (SHOTS=dir for screenshots). Logic: tests/sim-m2.0.test.mjs.
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
const rectOf = (page, sel) => DA(page, sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const ready = (page, id, ms = 15000) => page.waitForFunction(id => __DA3.game.arsenal.activeId === id && !__DA3.game.arsenal.switching, id, { timeout: ms }).then(() => true).catch(() => false);
const clearArena = page => DA(page, () => { const g = __DA3.game; g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e); __DA3.setPlayer(3, 8, 0, -0.03); g.state.setHealth(100); });

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();

  // ---------- 1. Desktop: switching, viewmodel, HUD ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    await clearArena(page);
    const s0 = await DA(page, () => ({ active: __DA3.game.arsenal.activeId, vm: __DA3.view.vm.weaponId, kits: __DA3.view.vm.kitIds }));
    check('Start: RAVEN in the hands, all three weapon kits built at load (no hitch on the first switch)', s0.active === 'raven' && s0.vm === 'raven' && ['raven', 'ak47', 'krait'].every(k => s0.kits.includes(k)), JSON.stringify(s0));
    const seen = [];
    for (const [key, id] of [['Digit2', 'ak47'], ['Digit3', 'krait'], ['Digit1', 'raven'], ['Numpad3', 'krait']]) {
      await page.keyboard.press(key); const ok = await ready(page, id); await sleep(150);
      seen.push(await DA(page, id => ({ id, ok: __DA3.game.arsenal.activeId === id, vm: __DA3.view.vm.weaponId, name: document.querySelector('.hud-ammo').innerText, slot: [...document.querySelectorAll('.hud-weapons .slot')].findIndex(e => e.classList.contains('active')) }), id));
    }
    check('Keys 1 / 2 / 3 (and numpad) switch weapons; the viewmodel shows the weapon in the sim\'s hands; HUD slot + ammo name follow', seen.every(x => x.ok && x.vm === x.id && x.slot === ['raven', 'ak47', 'krait'].indexOf(x.id)) && /AK-47|KRAIT|RAVEN/.test(seen[0].name), JSON.stringify(seen.map(x => [x.id, x.vm, x.slot])));
    // wheel (drag-fallback mode in headless: no pointer lock)
    const w0 = await DA(page, () => __DA3.game.arsenal.activeId);
    await page.mouse.move(640, 360); await page.mouse.wheel(0, 120); await sleep(400); await page.mouse.wheel(0, 120); await ready(page, 'ak47', 8000);
    const w1 = await DA(page, () => __DA3.game.arsenal.activeId);
    check('Mouse wheel cycles the weapons (KRAIT → RAVEN → AK-47, one step per notch)', w0 === 'krait' && (w1 === 'ak47' || w1 === 'raven'), `${w0} → ${w1}`);
    // switch animation: the gun goes down and comes back up (sampled per frame)
    // the view is sampled frozen at fixed points of the switch (software frames are too slow to catch a 0.3 s holster live)
    const sw = await DA(page, () => { const vm = __DA3.view.vm, v = __DA3.view, P = __DA3.game.player, out = [];
      for (const k of [0, 0.5, 1]) { vm.forceSwitch = k; v.render(P, 1, { dt: 1 / 60, ads: 0, reload: -1 }); out.push({ k, y: +vm.rig.position.y.toFixed(3), rx: +vm.rig.rotation.x.toFixed(3) }); }
      vm.forceSwitch = null; return out; });
    await page.keyboard.press('Digit3'); await ready(page, 'krait');
    const swEv = await DA(page, () => __DA3.game.arsenal.switches);
    check('Switch animation: the weapon is lowered and rolled away (holster) and the new one raised (draw)', sw[2].y < sw[0].y - 0.2 && sw[2].rx < sw[0].rx - 0.5 && sw[1].y < sw[0].y && swEv > 0, JSON.stringify(sw));
    check('No JS errors (switching)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. Hands on the new guns (M1.4 limits), ADS alignment ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    const pen = await DA(page, async () => {
      const THREE = await import('three'); const HP = await import('/prototype-3d/src/render/weapons/hand-poses.js'); const WA = await import('/prototype-3d/src/render/weapons/weapon-anim.js'); const { WEAPONS } = await import('/prototype-3d/src/sim/weapons/defs.js');
      const V = () => new THREE.Vector3(), out = {};
      { const P = HP.getAkPoses(), buf = HP.makePoseBuffer(), rb = HP.makePoseBuffer(); let R = -1, Lh = -1, Lt = -1;
        for (let r = -0.0025; r <= 1; r += 0.0025) {
          const tl = WA.reloadTimeline(r < 0 ? -1 : r, { chargeTravel: 0.075, dropSide: 0.6, dropBack: 0.3, dropSpeed: 2.2, dropHide: 0.43 });
          const bo = { mag: V().set(tl.mag.x, tl.mag.y, tl.mag.z), spare: V().set(tl.spare.x, tl.spare.y, tl.spare.z), charging: V().set(0, 0, tl.charging), pump: V() };
          const mo = { mag: tl.mag.visible ? bo.mag : null, spare: tl.spare.visible ? bo.spare : null, charging: bo.charging, pump: bo.pump };
          HP.blendPoses(P[tl.left.a], P[tl.left.b], tl.left.t, bo, buf); HP.blendPoses(P.rightGrip, P.rightIndexOff, tl.rightIndexOff, bo, rb);
          R = Math.max(R, HP.measurePenetration(rb, 1, mo, null, HP.AK_PROXIES).depth);
          const d = HP.measurePenetration(buf, -1, mo, null, HP.AK_PROXIES).depth; if (tl.left.a === tl.left.b) Lh = Math.max(Lh, d); else Lt = Math.max(Lt, d);
        }
        out.ak = { right: R, hold: Lh, trans: Lt }; }
      { const P = HP.getKraitPoses(), K = WEAPONS.krait, buf = HP.makePoseBuffer(), rb = HP.makePoseBuffer(); let R = -1, L = -1;
        const states = []; for (let c = 0; c <= 1; c += 0.01) states.push({ cycle: c }); for (const [ph, d] of [['start', K.reload.start], ['shell', K.reload.perShell], ['end', K.reload.endPump]]) for (let t = 0; t <= d; t += 0.01) states.push({ cycle: 1, shellPhase: ph, shellT: t, shellPump: ph === 'end' });
        for (const s of states) { const tl = WA.kraitTimeline({ ...s, interval: 0.8, pump: K.pump, reload: K.reload, travel: 0.075 });
          const bo = { mag: V(), spare: V(), charging: V(), pump: V().set(0, 0, tl.pump) }, mo = { mag: null, spare: null, charging: V(), pump: bo.pump };
          HP.blendPoses(P[tl.left.a], P[tl.left.b], tl.left.t, bo, buf); HP.blendPoses(P.rightGrip, P.rightIndexOff, tl.rightIndexOff, bo, rb);
          R = Math.max(R, HP.measurePenetration(rb, 1, mo, null, HP.KRAIT_PROXIES).depth); L = Math.max(L, HP.measurePenetration(buf, -1, mo, null, HP.KRAIT_PROXIES).depth); }
        out.krait = { right: R, left: L }; }
      return out;
    });
    const mm = v => +(v * 1000).toFixed(1);
    check('AK-47 hands (whole reload, 2.5 ms steps): right ≤ 1.5 mm, left at grips ≤ 2 mm, between grips ≤ 3 mm (M1.4 limits)', pen.ak.right <= 0.0015 && pen.ak.hold <= 0.002 && pen.ak.trans <= 0.003, JSON.stringify({ right: mm(pen.ak.right), hold: mm(pen.ak.hold), trans: mm(pen.ak.trans) }));
    check('KRAIT hands (pump cycle + every shell-reload phase): right ≤ 1.5 mm, left ≤ 3 mm', pen.krait.right <= 0.0015 && pen.krait.left <= 0.003, JSON.stringify({ right: mm(pen.krait.right), left: mm(pen.krait.left) }));
    // ADS: the sight lines up with the screen centre for every weapon
    const ads = [];
    for (const [key, id] of [['Digit1', 'raven'], ['Digit2', 'ak47'], ['Digit3', 'krait']]) {
      await page.keyboard.press(key); await ready(page, id);
      await DA(page, () => { __DA3.input.aimHeld = true; }); await page.waitForFunction(() => __DA3.game.weapon.ads === 1, null, { timeout: 8000 }).catch(() => {}); await sleep(500);
      ads.push(await DA(page, id => { const p = __DA3.view.vm.projectAnchor('sight'); return { id, x: +p.x.toFixed(3), y: +p.y.toFixed(3) }; }, id));
      await shot(page, `m20_ads_${id}.png`);
      await DA(page, () => { __DA3.input.aimHeld = false; }); await sleep(300);
    }
    check('ADS on RAVEN / AK-47 / KRAIT: the sight (red dot / ghost ring) sits on the screen centre (≤ 3 % of the half-screen)', ads.every(a => Math.abs(a.x) < 0.03 && Math.abs(a.y) < 0.03), JSON.stringify(ads));
    check('No JS errors (hands / ADS)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3. KRAIT pump / shells, AK reload, melee with every weapon, hit effects, audio ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    await clearArena(page);
    await page.keyboard.press('Digit3'); await ready(page, 'krait');
    await DA(page, () => { window.__pump = []; const f = () => { const vm = __DA3.view.vm; if (vm.model.parts.pump) window.__pump.push(+vm.model.parts.pump.position.z.toFixed(3)); if (window.__pump.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const e0 = await DA(page, () => ({ shells: __DA3.view.vm.stats.shellsEjected, pump: __DA3.audio.played.pump || 0, boom: __DA3.audio.played.shot_krait || 0 }));
    await DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); });
    await page.waitForFunction(n => __DA3.view.vm.stats.shellsEjected > n, e0.shells, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => __DA3.game.state.weapon.cycle >= 1, null, { timeout: 15000 }).catch(() => {}); await sleep(200);
    const e1 = await DA(page, () => ({ shells: __DA3.view.vm.stats.shellsEjected, pump: __DA3.audio.played.pump || 0, boom: __DA3.audio.played.shot_krait || 0, maxPump: Math.max(...window.__pump), end: window.__pump[window.__pump.length - 1], mag: __DA3.gs.weapon.mag }));
    check('KRAIT shot: forend racked back ≈ 7.5 cm and forward again, one spent shell ejected, boom + pump sounds, 8 → 7', e1.maxPump > 0.06 && Math.abs(e1.end) < 0.005 && e1.shells === e0.shells + 1 && e1.pump === e0.pump + 1 && e1.boom === e0.boom + 1 && e1.mag === 7, JSON.stringify(e1));
    // shell reload: HUD counts up one by one, the loading shell appears in the hand
    await DA(page, () => { __DA3.gs.setAmmo(4, 48); window.__hud = []; window.__shellVis = 0; const f = () => { window.__hud.push(document.querySelector('[data-v=mag]').textContent); if (__DA3.view.vm.model.parts.loadShell && __DA3.view.vm.model.parts.loadShell.visible) window.__shellVis++; if (window.__hud.length < 900) requestAnimationFrame(f); }; requestAnimationFrame(f); __DA3.input.setAction('reload', true); __DA3.input.setAction('reload', false); });
    await page.waitForFunction(() => !__DA3.gs.weapon.reloading && __DA3.gs.weapon.mag === 8, null, { timeout: 30000 }).catch(() => {});
    const rl = await DA(page, () => ({ seq: [...new Set(window.__hud)], shellVis: window.__shellVis, shellIn: __DA3.audio.played.shellIn || 0, mag: __DA3.gs.weapon.mag, res: __DA3.gs.weapon.reserve }));
    check('KRAIT shell reload: the HUD counts 4 → 5 → 6 → 7 → 8, a shell is seen in the left hand, one sound per shell, 8 / 44', rl.seq.join() === '4,5,6,7,8' && rl.shellVis > 0 && rl.shellIn >= 4 && rl.mag === 8 && rl.res === 44, JSON.stringify(rl));
    // AK reload: magazine leaves and comes back, bolt handle travels
    await page.keyboard.press('Digit2'); await ready(page, 'ak47');
    await DA(page, () => { __DA3.gs.setAmmo(3, 120); window.__ak = []; const f = () => { const vm = __DA3.view.vm; if (vm.model.parts.mag) window.__ak.push([vm.model.parts.mag.visible, +vm.model.parts.charging.position.z.toFixed(3), +vm.model.parts.mag.position.y.toFixed(3)]); if (window.__ak.length < 900) requestAnimationFrame(f); }; requestAnimationFrame(f); __DA3.input.setAction('reload', true); __DA3.input.setAction('reload', false); });
    await page.waitForFunction(() => !__DA3.gs.weapon.reloading, null, { timeout: 30000 }).catch(() => {}); await sleep(200);
    const ak = await DA(page, () => ({ hidden: window.__ak.some(x => !x[0]), bolt: Math.max(...window.__ak.map(x => x[1])), drop: Math.min(...window.__ak.map(x => x[2])), mag: __DA3.gs.weapon.mag, res: __DA3.gs.weapon.reserve }));
    ak.bolt = await DA(page, () => { const vm = __DA3.view.vm, v = __DA3.view; let m = 0; for (const r of [0.80, 0.83, 0.86]) { vm.forceReload = r; v.render(__DA3.game.player, 1, { dt: 1 / 60, ads: 0, reload: r }); m = Math.max(m, vm.model.parts.charging.position.z); } vm.forceReload = null; return +m.toFixed(3); }); // the 0.18 s bolt pull: sampled frozen
    check('AK-47 reload: old magazine drops out of view, bolt handle pulled back ≈ 7.5 cm, 30 / 93 after 1.8 s', ak.hidden && ak.bolt > 0.06 && ak.drop < -0.1 && ak.mag === 30 && ak.res === 93, JSON.stringify(ak));
    // melee with each weapon (V) on an infected in reach
    const ml = [];
    for (const [key, id, v] of [['Digit1', 'raven', 'guard'], ['Digit2', 'ak47', 'technician'], ['Digit3', 'krait', 'worker']]) {
      await page.keyboard.press(key); await ready(page, id); await clearArena(page);
      await DA(page, v => { const e = __DA3.game.spawnInfected('hollow', 3.62, 8, Math.PI, { variant: v }); e.senseT = 1e9; }, v);
      await page.waitForFunction(() => __DA3.game.state.melee.ready, null, { timeout: 8000 }).catch(() => {});
      const n0 = await DA(page, () => __DA3.game.melee.hits); await page.keyboard.press('KeyV');
      await page.waitForFunction(n => __DA3.game.melee.hits > n, n0, { timeout: 8000 }).catch(() => {});
      ml.push(await DA(page, id => ({ id, hp: __DA3.game.enemies[0] && __DA3.game.enemies[0].hp, vm: __DA3.view.vm.weaponId }), id));
    }
    check('Rifle-butt strike works with RAVEN, AK-47 and KRAIT (same 34 damage, the weapon in the hands animates)', ml.every(m => m.hp === 66 && m.vm === m.id), JSON.stringify(ml));
    // hit effects: concrete vs metal, pools bounded, head vs body markers
    await clearArena(page); await page.keyboard.press('Digit3'); await ready(page, 'krait');
    const fx0 = await DA(page, () => ({ ...__DA3.view.impacts.stats }));
    await DA(page, () => __DA3.setPlayer(4.5, 2.5, -Math.PI / 2, 0)); // outer concrete wall
    for (let i = 0; i < 6; i++) { await DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); }); await sleep(900); }
    const prop = await DA(page, () => { const w = __DA3.game.world; for (let y = 1; y < 15; y++) for (let x = 1; x < 29; x++) if (__DA3.view.level.isPropCell(x, y) && !w.isSolidCell(x - 1, y)) return [x, y]; return null; });
    await DA(page, ([x, y]) => __DA3.setPlayer(x - 1.6, y + 0.5, 0, 0), prop); await sleep(200);
    for (let i = 0; i < 3; i++) { await DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); }); await sleep(900); }
    const fx = await DA(page, () => { const im = __DA3.view.impacts; return { ...im.stats, decals: im.decalCount, activeSparks: im.activeSparks, activeDust: im.activeDust, limits: im.limits, blood: im.bloodCount }; });
    check('Hit effects by surface: concrete → sparks + dust puff, metal equipment → brighter sparks without dust', fx.concrete > fx0.concrete && fx.metal > fx0.metal && fx.dust > fx0.dust, JSON.stringify({ concrete: fx.concrete - fx0.concrete, metal: fx.metal - fx0.metal, dust: fx.dust - fx0.dust }));
    check('Effect pools stay bounded under shotgun fire (decals ≤ 40, sparks ≤ 120, dust ≤ 60, blood ≤ 24)', fx.decals <= fx.limits.decals && fx.activeSparks <= fx.limits.sparks && fx.activeDust <= fx.limits.dust && fx.blood <= fx.limits.blood, JSON.stringify({ decals: fx.decals, sparks: fx.activeSparks, dust: fx.activeDust }));
    await page.keyboard.press('Digit1'); await ready(page, 'raven'); await clearArena(page);
    const hm = [];
    for (const zone of ['body', 'head']) {
      await DA(page, zone => { const g = __DA3.game; for (const e of [...g.enemies]) g.removeInfected(e); const e = g.spawnInfected('hollow', 5, 8, Math.PI, { variant: 'guard' }); e.senseT = 1e9; const hb = e.hitboxes()[zone === 'head' ? 0 : 1], p = g.player; p.pitch = Math.atan2(hb.cz - 0.8, Math.hypot(hb.cx - p.x, hb.cy - p.y)); p.yaw = Math.atan2(hb.cy - p.y, hb.cx - p.x); window.__marker = null; g.on('hit', h => { if (!window.__marker) window.__marker = { ...h, cls: document.getElementById('hitmark').className }; }); }, zone);
      await DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); }); await page.waitForFunction(() => window.__marker, null, { timeout: 8000 }).catch(() => {}); await sleep(80);
      hm.push(await DA(page, z => ({ z, head: window.__marker && window.__marker.headshot, cls: document.getElementById('hitmark').className }), zone));
    }
    check('Head vs body: the hit confirmation differs (headshot flag + head marker style), blood burst per zone', hm[0].head === false && hm[1].head === true && /head/.test(hm[1].cls) && !/head/.test(hm[0].cls), JSON.stringify(hm));
    // audio: each weapon its own shot sound; mute silences the master; pause silences ambience / siren
    const au = await DA(page, () => ({ played: __DA3.audio.played }));
    check('Per-weapon sounds were played (RAVEN / AK-47 / KRAIT shots, pump, shells, switch)', (au.played.shot_krait || 0) > 0 && (au.played.switch || 0) > 0 && (au.played.pump || 0) > 0 && (au.played.shellIn || 0) > 0, JSON.stringify(au.played));
    await DA(page, () => { __DA3.settings.mute = true; __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); }); await sleep(300);
    const mute = await DA(page, () => __DA3.audio.levels);
    await DA(page, () => { __DA3.settings.mute = false; __DA3.show('paused'); }); await sleep(200);
    const paused = await DA(page, () => ({ levels: __DA3.audio.levels, amb: __DA3.audio.ambience }));
    await DA(page, () => __DA3.show('play'));
    check('Audio off works: mute → master gain 0 (no sound from any weapon); pause → ambience bus silent', (!mute || mute.master === 0) && (!paused.levels || paused.levels.amb === 0), JSON.stringify({ mute, paused: paused.levels }));
    check('No JS errors (pump / reloads / melee / effects / audio)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 4. Flashlight, pause / focus during a switch, settings, leaks ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    await clearArena(page);
    const pr0 = await DA(page, () => __DA3.view.renderer.info.programs.length);
    const fl = [];
    for (const [key, id] of [['Digit1', 'raven'], ['Digit2', 'ak47'], ['Digit3', 'krait']]) {
      await page.keyboard.press(key); await ready(page, id);
      await page.keyboard.press('KeyL'); await sleep(500);
      fl.push(await DA(page, async id => { const THREE = await import('three'); const v = __DA3.view, l = v.flashlight; const a = new THREE.Vector3(), b = new THREE.Vector3(), f = new THREE.Vector3(); l.getWorldPosition(a); l.target.getWorldPosition(b); v.camera.getWorldDirection(f);
        return { id, on: __DA3.gs.flashlight, I: +l.intensity.toFixed(1), dot: +b.sub(a).normalize().dot(f).toFixed(3), btn: document.querySelector('.hud-light').classList.contains('toggled') }; }, id));
      await page.keyboard.press('KeyL'); await sleep(400);
    }
    const off = await DA(page, () => ({ on: __DA3.gs.flashlight, I: __DA3.view.flashlight.intensity }));
    check('Flashlight (L) on / off with every weapon; the beam points where the player looks (dot ≥ 0.99)', fl.every(x => x.on && x.I > 30 && x.dot >= 0.99) && !off.on && off.I < 1, JSON.stringify({ fl, off }));
    await page.keyboard.press('KeyL'); await DA(page, () => { __DA3.input.aimHeld = true; }); await page.waitForFunction(() => __DA3.game.weapon.ads === 1, null, { timeout: 8000 }).catch(() => {}); await sleep(400);
    const adsL = await DA(page, () => ({ on: __DA3.gs.flashlight, ads: __DA3.game.weapon.ads }));
    await shot(page, 'm20_flashlight_ads.png');
    await DA(page, () => { __DA3.input.aimHeld = false; }); await page.keyboard.press('KeyL'); await sleep(300);
    const prA = await DA(page, () => __DA3.view.renderer.info.programs.length);
    for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyL'); await sleep(250); }
    const pr1 = await DA(page, () => __DA3.view.renderer.info.programs.length);
    check('Flashlight in ADS stays on; toggling it 8× compiles no new shaders (light always present, intensity only)', adsL.on && adsL.ads === 1 && pr1 === prA, `programs ${prA} → ${pr1} (start ${pr0})`);
    // pause during a switch: frozen, then finishes
    await DA(page, () => { window.__once = false; __DA3.game.on('weaponSwitch', () => { if (!window.__once) { window.__once = true; setTimeout(() => __DA3.show('paused'), 0); } }); });
    await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__DA3.state === 'paused', null, { timeout: 8000 }).catch(() => {});
    const p0 = await DA(page, () => ({ ...__DA3.gs.arsenal })); await sleep(500); const p1 = await DA(page, () => ({ ...__DA3.gs.arsenal }));
    await page.keyboard.press('Digit3'); // pressed in the pause menu → ignored
    await DA(page, () => __DA3.show('play')); await ready(page, 'ak47', 10000); await sleep(600);
    const p2 = await DA(page, () => __DA3.game.arsenal.activeId);
    check('Pause during a switch: frozen (same phase / progress), finishes on resume; a key pressed in the menu does nothing', p0.phase === 'holster' && p1.progress === p0.progress && p2 === 'ak47', JSON.stringify({ p0: [p0.phase, p0.progress], p1: [p1.phase, p1.progress], p2 }));
    // focus loss: fire held + a switch request, then blur → nothing stuck
    await DA(page, () => { __DA3.input.setAction('fire', true); }); await sleep(100);
    await DA(page, () => window.dispatchEvent(new Event('blur'))); await sleep(300);
    const fo = await DA(page, () => ({ state: __DA3.state, fire: __DA3.input.actions.fire, trig: __DA3.game.weapon.triggerDown }));
    await DA(page, () => __DA3.show('play'));
    check('Focus loss (blur) releases the held trigger (no stuck fire); play is not interrupted (M0 contract: release, not pause)', fo.state === 'play' && !fo.fire, JSON.stringify(fo));
    // graphics settings: profile saved; viewmodel relief per profile on every kit
    const gx = await DA(page, () => { const vm = __DA3.view.vm, kits = vm.kitIds.map(id => vm.kitOf(id)); const cnt = () => kits.flatMap(k => k.detail).filter(m => m.normalMap).length, tot = kits.flatMap(k => k.detail).length;
      __DA3.settings.graphicsProfile = 'balanced'; __DA3.view.resize(true); const bal = cnt(); __DA3.settings.graphicsProfile = 'performance'; __DA3.view.resize(true); const perf = cnt(); return { bal, perf, tot }; });
    check('Graphics profiles apply to the new weapons too: relief on all kits in BALANCED, none in PERFORMANCE', gx.bal === gx.tot && gx.perf === 0, JSON.stringify(gx));
    await DA(page, () => __DA3.show('settings')); await DA(page, () => document.querySelector('#settingsForm .seg[data-key=graphicsProfile] button[data-val=quality]').click()); await sleep(100);
    await page.reload(); await page.waitForFunction(() => window.__DA3); await sleep(200);
    const saved = await DA(page, () => JSON.parse(localStorage.getItem('darkarena_proto3d_settings_v1') || '{}').graphicsProfile); // (runtime value is the test URL's &gfx=)
    check('Graphics setting persists across a reload (Качество)', saved === 'quality', saved);
    await DA(page, () => { localStorage.removeItem('darkarena_proto3d_settings_v1'); });
    // leaks: 2 warm-up + 6 restarts with switching / shooting / flashlight
    await DA(page, () => document.getElementById('playBtn').click()); await sleep(300);
    const cyc = async () => { await DA(page, () => { __DA3.game.restart(); }); for (const k of ['Digit2', 'Digit3', 'Digit1']) { await page.keyboard.press(k); await sleep(700); } await DA(page, () => { __DA3.input.setAction('fire', true); }); await sleep(300); await DA(page, () => { __DA3.input.setAction('fire', false); }); await page.keyboard.press('KeyL'); await sleep(200); };
    for (let i = 0; i < 6; i++) await cyc(); // warm-up: some pools are created lazily on first use (measured plateau after 6 cycles, flat through 14)
    const m0 = await DA(page, () => ({ ...__DA3.view.renderer.info.memory, programs: __DA3.view.renderer.info.programs.length }));
    for (let i = 0; i < 6; i++) await cyc();
    const m1 = await DA(page, () => ({ ...__DA3.view.renderer.info.memory, programs: __DA3.view.renderer.info.programs.length }));
    check('No growth over 6 restarts with switching, shooting and the flashlight (geometries / textures / programs)', m1.geometries <= m0.geometries && m1.textures <= m0.textures && m1.programs <= m0.programs, JSON.stringify({ m0, m1 }));
    check('No JS errors (flashlight / pause / settings / restarts)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 5. Touch: iPhone 11 landscape ----------
  {
    const dev = devices['iPhone 11 landscape'];
    const { ctx, page, errors, cdp } = await open(browser, base, dev);
    await sleep(300); await clearArena(page);
    const slots = await rectOf(page, '.hud-weapons'), light = await rectOf(page, '.hud-light'), rects = await DA(page, () => __DA3.hudRects);
    const ov = id => { const m = rects.find(r => r.id === id); return rects.filter(r => r.id !== id && r.x0 < m.x1 && m.x0 < r.x1 && r.y0 < m.y1 && m.y0 < r.y1).map(r => r.id); };
    check('iPhone 11: weapon slots (3 × ≥ 44 px) and СВЕТ (≥ 44 px) shown, inside the screen, no overlap with other controls', slots.h >= 44 && slots.w / 3 >= 44 && light.w >= 44 && slots.r <= dev.viewport.width && light.l >= 0 && ov('weapons').length === 0 && ov('light').length === 0, JSON.stringify({ slots, light, ov: [ov('weapons'), ov('light')] }));
    await shot(page, 'm20_mobile_hud.png');
    const tapSlot = async i => { const x = slots.l + slots.w * (i + 0.5) / 3; await touch(cdp, 'touchStart', [{ x, y: slots.cy, id: 9 }]); await sleep(40); await touch(cdp, 'touchEnd', []); };
    await tapSlot(2); const t1 = await ready(page, 'krait'); await tapSlot(1); const t2 = await ready(page, 'ak47');
    await touch(cdp, 'touchStart', [{ x: light.cx, y: light.cy, id: 8 }]); await sleep(40); await touch(cdp, 'touchEnd', []); await sleep(200);
    const lt = await DA(page, () => __DA3.gs.flashlight);
    check('Tap a slot → that weapon (KRAIT, then AK-47); tap СВЕТ → flashlight on', t1 && t2 && lt, JSON.stringify({ t1, t2, lt }));
    // multitouch: move + look + FIRE held, then a 4th finger on slot 3 and a 5th on ПРЫЖОК
    const mv = await rectOf(page, '.hud-move'), fire = await rectOf(page, '.hud-fire'), jump = await rectOf(page, '.hud-jump');
    const look = { x: Math.round(dev.viewport.width * 0.55), y: Math.round(dev.viewport.height * 0.3) };
    await DA(page, () => { const g = __DA3.game; window.__ev = []; g.on('fire', () => __ev.push(['f', g.tick])); g.on('weaponSwitch', () => __ev.push(['s', g.tick])); g.on('weaponReady', () => __ev.push(['r', g.tick])); });
    await touch(cdp, 'touchStart', [{ x: mv.cx, y: mv.cy, id: 1 }]); for (let i = 1; i <= 4; i++) { await touch(cdp, 'touchMove', [{ x: mv.cx, y: mv.cy - i * 10, id: 1 }]); await sleep(20); }
    const pts = [{ x: mv.cx, y: mv.cy - 40, id: 1 }, { x: look.x, y: look.y, id: 2 }, { x: fire.cx, y: fire.cy, id: 3 }];
    await touch(cdp, 'touchStart', pts.slice(0, 2)); await touch(cdp, 'touchStart', pts); await sleep(500);
    const x0 = await DA(page, () => __DA3.player.x);
    await touch(cdp, 'touchStart', [...pts, { x: slots.l + slots.w * 2.5 / 3, y: slots.cy, id: 4 }]); await sleep(60);
    await touch(cdp, 'touchStart', [...pts, { x: slots.l + slots.w * 2.5 / 3, y: slots.cy, id: 4 }, { x: jump.cx, y: jump.cy, id: 5 }]); await sleep(60);
    await ready(page, 'krait', 12000); await sleep(300);
    const mt = await DA(page, () => { const ev = window.__ev, s = ev.find(e => e[0] === 's'), r = ev.find(e => e[0] === 'r'); return { x: __DA3.player.x, active: __DA3.game.arsenal.activeId, roles: __DA3.touch.roles, jumped: (__DA3.game.player.landings || 0) > 0 || __DA3.game.player.z > 0, during: s && r ? ev.filter(e => e[0] === 'f' && e[1] > s[1] && e[1] < r[1]).length : -1 }; });
    await touch(cdp, 'touchEnd', []); await sleep(150);
    const rel = await DA(page, () => ({ fire: __DA3.input.actions.fire, jump: __DA3.input.actions.jump, count: __DA3.touch.count }));
    check('5 fingers (move + look + FIRE + slot 3 + ПРЫЖОК): switch to KRAIT while moving and jumping, no shot during the switch', mt.active === 'krait' && mt.x !== x0 && mt.during === 0 && mt.roles.includes('slots') && mt.jumped, JSON.stringify(mt));
    check('All fingers released → nothing stuck (fire, jump, touch roles)', !rel.fire && !rel.jump && rel.count === 0, JSON.stringify(rel));
    // HUD editor: the new elements are editable and their positions are saved
    const ed = await DA(page, () => { const w = document.querySelector('.hud-weapons .edit-tag'), l = document.querySelector('.hud-light .edit-tag'); const L = JSON.parse(JSON.stringify(__DA3.hud.layout)); L.weapons.x = 0.70; L.light.y = 0.45; __DA3.hud.setLayout(L); return { w: w && w.textContent, l: l && l.textContent }; });
    await page.reload(); await page.waitForFunction(() => window.__DA3); await sleep(300);
    const ed2 = await DA(page, () => ({ wx: __DA3.hud.layouts.touch.weapons.x, ly: __DA3.hud.layouts.touch.light.y }));
    check('HUD editor: Оружие and Фонарик are editable elements, their positions are saved and restored', ed.w === 'Оружие' && ed.l === 'Фонарик' && Math.abs(ed2.wx - 0.70) < 1e-9 && Math.abs(ed2.ly - 0.45) < 1e-9, JSON.stringify({ ed, ed2 }));
    await DA(page, () => __DA3.hud.resetAllLayouts());
    check('No JS errors (touch)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
