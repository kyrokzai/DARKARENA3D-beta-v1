// M1.7 OUTPOST ZERO in the browser: environment (props, decor, windows / steppe perspective, monitors, signs,
// textures, light budget), the three infected variants (creation, animation ↔ hit zones, hits, death, pooling),
// the alarm between waves (HUD, beacons, light tint, siren; pause / menu / death / restart / settings), ambience
// and mix (unlock, volume, mute, ducking, no growing loops) and a gameplay regression pass (jump, fire, ADS,
// reload, multitouch, pause, menu, three waves, victory, death, restart, saved settings).
// Run: node tests/m1.7-outpost.test.js   (SHOTS=dir for screenshots). Logic: tests/sim-m1.7.test.mjs.
// Chromium (software WebGL) ≠ iPhone Safari: nothing here is a statement about device performance.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shoot = async (page, file) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, file) }); };
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick, s0 = performance.now(); const f = () => (__DA3.game.tick - t0 >= n || performance.now() - s0 > 6000 ? res() : requestAnimationFrame(f)); f(); }), n); // capped: never hangs
const WAVES = '/prototype-3d/?debug=1&waves=1&gfx=performance'; // M1.7-level render cost (see tests/lib/harness.js)
const VARIANTS = ['guard', 'technician', 'worker'];

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const desktop = { viewport: { width: 1280, height: 720 } };

  // ---------- A. Environment ----------
  {
    const bad = [];
    const { ctx, page, errors } = await open(browser, base, desktop, { play: false, init: () => {} });
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', r => bad.push('failed ' + r.url()));
    await page.reload(); await page.waitForFunction(() => window.__DA3, null, { timeout: 15000 });
    await DA(page, () => document.getElementById('playBtn').click()); await sleep(300);
    const env = await DA(page, async () => {
      const T = await import('/prototype-3d/src/render/outpost/outpost-textures.js');
      const tex = T.getOutpostTextures(); const o = __DA3.outpost, lv = __DA3.view.level;
      const texOk = Object.entries(tex).filter(([, t]) => t && t.isTexture).map(([k, t]) => [k, !!(t && t.image && t.image.width > 0 && t.image.height > 0)]);
      let point = 0, dir = 0, hemi = 0, shadows = 0, dressLights = 0; lv.dressing.group && lv.dressing.group.traverse(x => { if (x.isLight) dressLights++; }); lv.group.traverse(x => { if (x.isPointLight) point++; }); __DA3.view.scene.traverse(x => { if (x.isDirectionalLight) dir++; if (x.isHemisphereLight) hemi++; if (x.isLight && x.castShadow) shadows++; });
      return { o, texOk, signs: T.SIGN_TEXT, point, dir, hemi, shadows, dressLights, mapId: __DA3.game.world.width + 'x' + __DA3.game.world.height, monTexV: tex.monitors.version };
    });
    check('2. Environment loads: 13 props, 5 CCTV monitors, 7 windows, 7 beacons, signs; ≤ 9 dressing draw calls', env.o.stats.props === 13 && env.o.monitors === 5 && env.o.stats.windows === 7 && env.o.stats.beacons === 7 && env.o.stats.signs >= 8 && env.o.drawCalls <= 9 && env.mapId === '30x16', JSON.stringify(env.o));
    check('8. All outpost textures generated (atlas, signs, monitors, steppe, light pool) and no failed / 404 requests', env.texOk.every(([, ok]) => ok) && !bad.length, JSON.stringify(env.texOk) + ' ' + bad.join(' '));
    check('Light budget: still 4 pooled point lights + 1 hemisphere + 1 daylight (no per-lamp lights, no shadows)', env.point === 4 && env.dressLights === 0 && env.hemi === 1 && env.dir <= 2 && env.shadows === 0 && env.o.lights === 4, JSON.stringify({ levelPoint: env.point, dressing: env.dressLights, dir: env.dir, hemi: env.hemi, shadows: env.shadows }));
    const S = env.signs;
    check('Bilingual signs: ҚАУІПТІ АЙМАҚ / ОПАСНАЯ ЗОНА, КІРУГЕ БОЛМАЙДЫ / ВХОД ЗАПРЕЩЁН, СЕКТОР 01, БАЙЛАНЫС / СВЯЗЬ', S.danger.join('/') === 'ҚАУІПТІ АЙМАҚ/ОПАСНАЯ ЗОНА' && S.noEntry.join('/') === 'КІРУГЕ БОЛМАЙДЫ/ВХОД ЗАПРЕЩЁН' && S.sector[0] === 'СЕКТОР 01' && S.comms.join('/') === 'БАЙЛАНЫС/СВЯЗЬ');
    // monitors: prepared texture (never redrawn per frame), shader noise only; a feed switches rarely
    const mon = await DA(page, async () => {
      const T = await import('/prototype-3d/src/render/outpost/outpost-textures.js'); const tex = T.getOutpostTextures().monitors;
      const d = __DA3.view.level.dressing, cell = d.meshes.screens.geometry.getAttribute('cell'), before = Array.from(cell.array).join(), v0 = tex.version;
      for (let i = 0; i < 60; i++) __DA3.view.render(__DA3.game.player, 1, { dt: 1 / 60, enemies: [], enemyDt: 1 / 60 });
      const after60 = Array.from(cell.array).join(), v1 = tex.version, t1 = d.mats.screens.uniforms.time.value;
      d.update(8, 0); const after8 = Array.from(cell.array).join();
      return { same60: before === after60, texConst: v0 === v1, switched: before !== after8, time: t1 > 0.9, isShader: d.mats.screens.isShaderMaterial };
    });
    check('CCTV monitors: prepared atlas (texture never re-uploaded), shader noise, a feed switches only every few seconds', mon.texConst && mon.same60 && mon.switched && mon.time && mon.isShader, JSON.stringify(mon));
    // 7. window perspective: the steppe is infinitely far → the same view direction gives the same colour from two
    //    positions (no parallax, not a flat picture on the glass); horizon at eye level (sky above, ground below)
    const px = await DA(page, () => {
      const v = __DA3.view, r = v.renderer, gl = r.getContext(), out = {};
      const read = (fx, fy) => { const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, p = new Uint8Array(4); gl.readPixels(Math.floor(fx * w), Math.floor((1 - fy) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [p[0], p[1], p[2]]; };
      // sample inside the glass panes (left of the centre mullion, above / below the transom at eye level), weapon hidden
      const at = (x, y) => { __DA3.setPlayer(x, y, -Math.PI / 2, 0); v.render(__DA3.game.player, 1, { dt: 0, enemies: [], enemyDt: 0, showWeapon: false }); return { c: read(0.523, 0.43), up: read(0.523, 0.42), down: read(0.523, 0.55) }; };
      out.a = at(20.0, 3.0); out.b = at(20.06, 3.0); out.near = at(20.0, 2.2);
      return out;
    });
    const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    check('7. Window perspective: steppe has no parallax — same ray, same colour after moving sideways 0.24 m or 1.6 m closer', diff(px.a.c, px.b.c) <= 14 && diff(px.a.c, px.near.c) <= 14 && diff(px.a.down, px.near.down) <= 14 && lum(px.a.c) > 60, JSON.stringify(px));
    check('7. Horizon at eye level through the window: sky above is brighter than the ground below', lum(px.a.up) > lum(px.a.down) + 4 && lum(px.a.down) > 40, `${lum(px.a.up).toFixed(0)} vs ${lum(px.a.down).toFixed(0)}`);
    // 6 (integration): a real RAVEN shot at an electrical cabinet stops on the cabinet face
    const shot = await DA(page, () => new Promise(res => { const g = __DA3.game; g.waves.reset(); __DA3.setPlayer(16.6, 3.5, 0, 0); __DA3.gs.setAmmo(30, 120); let hit = null; const off = g.on ? null : null; g.on('impact', e => { if (!hit) hit = e; }); __DA3.input.setAction('fire', true); setTimeout(() => { __DA3.input.setAction('fire', false); res(hit && { x: hit.point ? hit.point.x : hit.x, type: hit.type || 'world' }); }, 250); void off; }));
    check('6. Real shot at the electrical cabinet (prop on a solid cell) hits its face — bullets do not pass through', shot && Math.abs(shot.x - 18) < 0.02, JSON.stringify(shot));
    await shoot(page, 'm17_env.png');
    check('No JS errors (environment)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- B. Infected variants ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: '/prototype-3d/?debug=1' });
    await DA(page, () => __DA3.show('paused')); // the test steps the sim itself (deterministic)
    const r = await DA(page, async ({ VARIANTS }) => {
      const THREE = await import('three'); const { InputState } = await import('/prototype-3d/src/input/input.js');
      const g = __DA3.game, v = __DA3.infectedView, inp = new InputState(), V = new THREE.Vector3();
      const clear = () => { for (const e of [...g.enemies]) g.removeInfected(e); v.update(g.enemies, 0, 1); };
      const step = (n = 1) => { for (let i = 0; i < n; i++) { g.step(inp.update(), 1 / 60); g.state.setHealth(100); v.update(g.enemies, 1 / 60, 1); } };
      const headErr = e => { const grp = v.groupOf(e); grp.updateMatrixWorld(true); V.set(0, 0.085, 0.015).applyMatrix4(grp.children.find(o => o.isBone).getObjectByName('head').matrixWorld); const hb = e.hitboxes()[0]; return Math.hypot(V.x - hb.cx * 2, V.y - hb.cz * 2, V.z - hb.cy * 2); };
      g.waves.reset(); clear(); __DA3.setPlayer(4, 8, 0, 0);
      const out = { created: {}, meshes: {}, geo: {}, mats: {}, err: {}, hits: {}, dead: {} };
      const es = VARIANTS.map((vr, i) => g.spawnInfected('hollow', 9 + i * 0.01, 7.6 + i * 0.9, Math.PI, { variant: vr })); // clear line of sight (the comm column is at x 7, y 5–7)
      v.update(g.enemies, 0, 1);
      // M1.8: 3 LOD levels per infected, one drawn at a time; each variant has its own baked skin / outfit materials
      for (const [i, e] of es.entries()) { const grp = v.groupOf(e), m = grp.children.filter(o => o.isSkinnedMesh && o.visible); out.created[VARIANTS[i]] = v.variantOf(e); out.meshes[VARIANTS[i]] = m.length; out.geo[VARIANTS[i]] = m.map(x => x.geometry.uuid).join(); out.mats[VARIANTS[i]] = m.map(x => x.material.uuid).join(); out.eyes = (out.eyes || new Set()).add(m.find(x => x.material === m[2].material).material.uuid); }
      // a second GUARD shares the GUARD geometry
      const g2 = g.spawnInfected('hollow', 12, 12, Math.PI, { variant: 'guard' }); v.update(g.enemies, 0, 1);
      const g2m = v.groupOf(g2).children.filter(o => o.isSkinnedMesh && o.visible); out.sharedGuard = g2m.map(x => x.geometry.uuid).join() === out.geo.guard && g2m.map(x => x.material.uuid).join() === out.mats.guard; out.eyes = out.eyes.size;
      g.removeInfected(g2);
      // animation ↔ hit zones while chasing (each variant): max head-zone error over 2 s
      for (const e of es) e.senseT = 0;
      const maxErr = { guard: 0, technician: 0, worker: 0 };
      for (let i = 0; i < 120; i++) { step(); es.forEach((e, k) => { if (e.alive) maxErr[VARIANTS[k]] = Math.max(maxErr[VARIANTS[k]], headErr(e)); }); }
      out.err = maxErr; out.states = es.map(e => e.state);
      // hits: real hitscan from the player at each infected's chest zone → hit effects + damage
      const { resolveShot } = await import('/prototype-3d/src/sim/hitscan.js');
      for (const [k, e] of es.entries()) {
        const hb = e.hitboxes()[1], o = { x: g.player.x, y: g.player.y, z: 0.8 }, d = { x: hb.cx - o.x, y: hb.cy - o.y, z: hb.cz - o.z }, l = Math.hypot(d.x, d.y, d.z);
        const h = resolveShot(g.world, g.hittables, o, { x: d.x / l, y: d.y / l, z: d.z / l }, 40);
        const b0 = v.stats.bodyBursts + v.stats.headBursts;
        if (h.type === 'entity') { const res = h.entity.applyDamage(25, h.zone, { dir: d }); v.onHit(h.point, { x: d.x / l, y: d.y / l, z: d.z / l }, h.zone); void res; }
        out.hits[VARIANTS[k]] = { type: h.type, same: h.entity === e, hp: e.hp, burst: v.stats.bodyBursts + v.stats.headBursts > b0 };
      }
      // death: kill all three, corpses stay, then are removed and their instances go back to the pools
      for (const e of es) { e.applyDamage(e.hp, 'body', { dir: { x: 1, y: 0, z: 0 } }); g.onInfectedKilled(e); }
      step(30); out.deadStates = es.map(e => e.state + ':' + !!v.groupOf(e));
      step(Math.round(60 * 4.3)); out.afterCorpse = { enemies: g.enemies.length, active: v.stats.active, pool: v.poolSize };
      // 16. resource reuse: 4 cycles of 5 mixed infected → instances bounded, geometries stable
      const cycle = (c) => {
        for (let i = 0; i < 5; i++) g.spawnInfected('hollow', 6 + i, 12, 0, { variant: VARIANTS[(c + i) % 3] });
        step(2); __DA3.view.render(g.player, 1, { dt: 1 / 60, enemies: g.enemies, enemyDt: 1 / 60 });
        for (const e of g.enemies) if (e.alive) { e.applyDamage(e.hp, 'body', null); g.onInfectedKilled(e); }
        step(Math.round(60 * 4.3));
      };
      cycle(0); // first cycle uploads every variant once
      const mem0 = __DA3.view.renderer.info.memory.geometries, created0 = v.stats.created;
      for (let c = 1; c < 5; c++) cycle(c);
      out.reuse = { created: v.stats.created - created0, totalCreated: v.stats.created, pool: v.poolSize, memDelta: __DA3.view.renderer.info.memory.geometries - mem0, byVariant: v.stats.byVariant };
      return out;
    }, { VARIANTS });
    check('9. All three variants are created and rendered with their own look (GUARD / TECHNICIAN / WORKER)', VARIANTS.every(v => r.created[v] === v) && new Set(Object.values(r.geo)).size === 3, JSON.stringify(r.created));
    check('9. Each variant = 3 draw calls (skin / outfit / eyes); geometry + materials shared by every infected of a variant (M1.8: own baked materials per variant, eyes material shared by all)', VARIANTS.every(v => r.meshes[v] === 3) && r.sharedGuard && new Set(Object.values(r.mats)).size === 3 && r.eyes === 1);
    check('12. Animation in sync with the sim hit zones for every variant (head bone within 6 cm while chasing)', VARIANTS.every(v => r.err[v] < 0.06) && r.states.every(s => s !== 'IDLE'), JSON.stringify(r.err));
    check('13. Hit reaction: a real hitscan ray hits each variant, 25 damage, hit effect shown', VARIANTS.every(v => r.hits[v].type === 'entity' && r.hits[v].same && r.hits[v].hp === 75 && r.hits[v].burst), JSON.stringify(r.hits));
    check('15. Death: every variant falls (DEAD, body still drawn), then the corpse is removed and the instance returns to its pool', r.deadStates.every(s => s === 'DEAD:true') && r.afterCorpse.enemies === 0 && r.afterCorpse.active === 0 && r.afterCorpse.pool >= 3, JSON.stringify({ d: r.deadStates, a: r.afterCorpse }));
    check('16. Resource cleanup: 4 × 5 mixed infected reuse pooled instances (≤ 5 new), geometry count stable', r.reuse.created <= 5 && r.reuse.memDelta <= 0, JSON.stringify(r.reuse));
    check('No JS errors (variants)', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // line-up of the three in the viewer (visual acceptance helper) + triangle budget
  {
    const ctx = await browser.newContext(desktop); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/prototype-3d/tools/infected-viewer.html?lineup=1&anim=walk&t=0.8'); await page.waitForFunction(() => window.__iv, null, { timeout: 20000 });
    const tri = await DA(page, async () => { const M = await import('/prototype-3d/src/render/enemies/hollow-model.js'); return Object.fromEntries(__iv.variants.map(v => [v, M.getHollowAssets(v).trisLod])); });
    // M1.8 budget (higher-detail models with LOD): LOD0 ≤ 14k and ≤ 1.3× the HOLLOW of the same build, LOD2 ≤ 5k
    check('Variant triangle budget (M1.8): LOD0 ≤ 14k and ≤ 1.3× the HOLLOW, far LOD2 ≤ 5k', VARIANTS.every(v => tri[v][0] <= 14000 && tri[v][0] <= tri.hollow[0] * 1.3 && tri[v][2] <= 5000), JSON.stringify(tri));
    await shoot(page, 'm17_lineup.png');
    check('No JS errors (viewer line-up)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- C. Alarm between waves + D. sound (real waves, real audio graph) ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES, play: false });
    const pre = await DA(page, () => __DA3.audio.state);
    await page.click('#playBtn'); await sleep(400); // user gesture → AudioContext unlocked (Safari-compatible path)
    const unlocked = await DA(page, () => ({ st: __DA3.audio.state, un: __DA3.sfx.stats.unlocked }));
    check('25. Web Audio is created / resumed only by the user gesture (ИГРАТЬ click) and then runs', (pre === 'none' || pre === 'suspended') && unlocked.st === 'running' && unlocked.un, JSON.stringify({ pre, unlocked }));
    await ticks(page, 30);
    const amb0 = await DA(page, () => __DA3.audio);
    check('Ambience: one persistent graph built once (wind, vent hum, equipment), on while playing', amb0.ambience.built === 1 && amb0.ambience.loops > 0 && amb0.ambience.on && amb0.levels.amb > 0.05, JSON.stringify(amb0.ambience));
    // 26–27: volume and mute follow the settings on the next frame
    await DA(page, () => { __DA3.settings.volume = 0.3; }); await ticks(page, 3);
    const vol = await DA(page, () => __DA3.audio.levels.master);
    await DA(page, () => { __DA3.settings.mute = true; }); await ticks(page, 3);
    const muted = await DA(page, () => ({ m: __DA3.audio.levels.master, on: __DA3.audio.ambience.on }));
    await DA(page, () => { __DA3.settings.mute = false; __DA3.settings.volume = 0.7; }); await ticks(page, 3);
    check('26. Volume setting drives the master gain immediately (0.3)', Math.abs(vol - 0.3) < 1e-3, String(vol));
    check('27. Mute → master gain 0 and the ambience is switched off', muted.m === 0 && !muted.on, JSON.stringify(muted));
    // 28: a shot ducks the ambience (priority shots > infected > alarm > ambience)
    const duck = await DA(page, () => new Promise(res => { const d0 = __DA3.audio.ducks; __DA3.gs.setAmmo(30, 120); __DA3.input.setAction('fire', true); setTimeout(() => { const l = __DA3.audio.levels; __DA3.input.setAction('fire', false); res({ ducks: __DA3.audio.ducks - d0, amb: l.ambDuck, alarm: l.alarmDuck }); }, 120); }));
    check('28. Priority: shots duck the ambience (and the alarm bus) while firing', duck.ducks > 0 && duck.amb < 0.7 && duck.alarm < 0.95, JSON.stringify(duck));
    // play through wave 1, then watch the intermission
    await DA(page, () => { window.__al = { rows: [], hemi0: null }; setInterval(() => { if (__DA3.state === 'play') __DA3.gs.setHealth(100); }, 100);
      const kill = () => { const g = __DA3.game; if (__DA3.state === 'play' && g.waves.phase === 'active' && g.enemies.some(e => e.alive)) __DA3.dbg.infKill(); if (!(g.waves.phase === 'intermission')) setTimeout(kill, 150); }; kill(); });
    await page.waitForFunction(() => __DA3.game.waves.phase === 'intermission', null, { timeout: 90000 }).catch(() => {});
    const hemiIdle = await DA(page, () => __DA3.view.level.hemi.color.getHexString());
    await page.waitForFunction(() => __DA3.alarm.warn && __DA3.sfx.sirenActive, null, { timeout: 15000 }).catch(() => {});
    await ticks(page, 10);
    const on = await DA(page, () => { const a = __DA3.alarm, d = __DA3.view.level.dressing; return { a, siren: __DA3.sfx.sirenActive, sirenGain: __DA3.audio.levels.siren, hemi: __DA3.view.level.hemi.color.getHexString(), beacon: d.mats.beacon.color.getHexString(), halo: d.meshes.halos.visible, warnText: document.getElementById('alarmWarn').innerText.replace(/\s+/g, ' '), bannerless: true }; });
    await shoot(page, 'm17_alarm.png');
    check('18/19. Alarm during the intermission: HUD warning «ДАБЫЛ · ТРЕВОГА / ВОЛНА 2», red edge, beacons glow, red light tint', on.a.warn && on.a.edge > 0.05 && on.a.visual > 0.5 && on.halo && on.beacon !== '3a0806' && on.hemi !== hemiIdle && /ДАБЫЛ · ТРЕВОГА/.test(on.warnText) && /ВОЛНА 2/.test(on.warnText), JSON.stringify(on));
    check('6.3 Siren plays inside the alarm, quieter than the shot level (gain ≤ 0.06)', on.siren && on.sirenGain > 0 && on.sirenGain <= 0.06, String(on.sirenGain));
    // 21. pause → siren and ambience stop; resume → restored
    await page.keyboard.press('KeyP'); await sleep(350);
    const paused = await DA(page, () => ({ st: __DA3.state, siren: __DA3.sfx.sirenActive, amb: __DA3.audio.ambience.on, t: __DA3.alarm.t }));
    await sleep(300);
    const paused2 = await DA(page, () => __DA3.alarm.t);
    await page.click('#resumeBtn'); await sleep(250); await ticks(page, 6);
    const resumed = await DA(page, () => ({ st: __DA3.state, siren: __DA3.sfx.sirenActive, want: __DA3.alarm.siren, amb: __DA3.audio.ambience.on, warn: __DA3.alarm.warn, a: __DA3.alarm.phase, t: __DA3.alarm.t }));
    check('21. Pause during the siren: siren and ambience stop, the alarm freezes', paused.st === 'paused' && !paused.siren && !paused.amb && paused2 === paused.t, JSON.stringify(paused));
    check('21. Resume: the alarm continues where it was (siren / warning restored while its window lasts)', resumed.st === 'play' && resumed.amb && resumed.siren === resumed.want && resumed.t >= paused.t, JSON.stringify(resumed));
    // 20. end: wave 2 begins with everything back to normal
    await page.waitForFunction(() => __DA3.game.waves.phase !== 'intermission', null, { timeout: 15000 }).catch(() => {});
    await ticks(page, 4);
    const off = await DA(page, () => ({ a: __DA3.alarm, siren: __DA3.sfx.sirenActive, hemi: __DA3.view.level.hemi.color.getHexString(), beacon: __DA3.view.level.dressing.mats.beacon.color.getHexString(), halo: __DA3.view.level.dressing.meshes.halos.visible, wave: __DA3.gs.wave.number, au: __DA3.audio.siren }));
    check('20. After the intermission: siren stopped, warning hidden, edge 0, beacons dark, lights back to normal, wave 2', !off.siren && !off.a.warn && off.a.edge === 0 && off.a.k === 0 && off.beacon === '3a0806' && !off.halo && off.hemi === hemiIdle && off.wave === 2, JSON.stringify(off));
    check('24. No repeating audio loops: every siren start has its stop, none active', off.au.starts >= 1 && off.au.starts === off.au.stops + off.au.forced && !off.au.active, JSON.stringify(off.au));
    // 22. back to the menu during the next alarm → silent, alarm reset
    await DA(page, () => { const kill = () => { const g = __DA3.game; if (__DA3.state === 'play' && g.waves.phase === 'active' && g.enemies.some(e => e.alive)) __DA3.dbg.infKill(); if (g.waves.phase !== 'intermission') setTimeout(kill, 150); }; kill(); });
    await page.waitForFunction(() => __DA3.sfx.sirenActive, null, { timeout: 90000 }).catch(() => {});
    const second = await DA(page, () => ({ siren: __DA3.sfx.sirenActive, wave: __DA3.gs.wave.number }));
    await page.keyboard.press('KeyP'); await sleep(450); await page.click('#quitBtn'); await sleep(350);
    const menu = await DA(page, () => ({ st: __DA3.state, siren: __DA3.sfx.sirenActive, amb: __DA3.audio.ambience.on, a: __DA3.alarm, ambGain: __DA3.audio.levels.amb }));
    check('22/29. В ГЛАВНОЕ МЕНЮ during the alarm: siren off, ambience off, alarm reset', second.siren && menu.st === 'menu' && !menu.siren && !menu.amb && menu.a.phase === 'off' && menu.a.k === 0 && !menu.a.warn, JSON.stringify({ second, menu }));
    // 23. restart → match from wave 1 with no alarm; 30. ambience graph not duplicated by restarts
    for (let i = 0; i < 3; i++) { await page.click('#playBtn'); await sleep(250); await page.keyboard.press('KeyP'); await sleep(450); await page.click('#quitBtn'); await sleep(150); }
    await page.click('#playBtn'); await sleep(300); await ticks(page, 10);
    const rs = await DA(page, () => ({ a: __DA3.alarm, wave: __DA3.gs.wave.number, au: __DA3.audio }));
    check('23. Restart: wave 1, alarm off, no siren', rs.wave === 1 && rs.a.phase === 'off' && !rs.au.siren.active, JSON.stringify(rs.a));
    check('30. No growth of audio sources: ambience built once, same persistent loops after 4 restarts', rs.au.ambience.built === 1 && rs.au.ambience.loops === amb0.ambience.loops, JSON.stringify(rs.au.ambience));
    // death during the alarm → death screen silences everything; ЗАНОВО resets
    await DA(page, () => { const kill = () => { const g = __DA3.game; if (__DA3.state === 'play' && g.waves.phase === 'active' && g.enemies.some(e => e.alive)) __DA3.dbg.infKill(); if (g.waves.phase !== 'intermission') setTimeout(kill, 150); }; kill(); });
    await page.waitForFunction(() => __DA3.sfx.sirenActive, null, { timeout: 90000 }).catch(() => {});
    await DA(page, () => __DA3.game.damagePlayer(500)); await page.waitForFunction(() => __DA3.state === 'dead', null, { timeout: 10000 }).catch(() => {}); await ticks(page, 2); await sleep(100);
    const dead = await DA(page, () => ({ st: __DA3.state, siren: __DA3.sfx.sirenActive, amb: __DA3.audio.ambience.on }));
    await page.click('#restartBtn'); await sleep(250); await ticks(page, 5);
    const again = await DA(page, () => ({ a: __DA3.alarm, siren: __DA3.sfx.sirenActive, wave: __DA3.gs.wave.number, hp: __DA3.gs.health.hp }));
    check('Death during the alarm: siren and ambience stop; ЗАНОВО → wave 1, full HP, no alarm', dead.st === 'dead' && !dead.siren && !dead.amb && again.wave === 1 && again.hp === 100 && again.a.phase === 'off' && !again.siren, JSON.stringify({ dead, again }));
    check('No JS errors (alarm / sound)', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // alarm settings: soft dims, off removes visuals and the siren (forced alarm state through the same pure function)
  {
    const { ctx, page, errors } = await open(browser, base, desktop, {});
    const res = {};
    for (const fx of ['full', 'soft', 'off']) {
      res[fx] = await DA(page, async fx => {
        const m = await import('/prototype-3d/src/sim/waves/alarm.js'); __DA3.settings.alarmFx = fx;
        const g = __DA3.game; g.waves.reset(); let peak = 0, siren = false, beacon = 0;
        for (let i = 0; i < 90; i++) { g.state.setAlarm(m.alarmState(2.0 + i / 60, 6)); await new Promise(r => requestAnimationFrame(r)); peak = Math.max(peak, __DA3.alarm.edge); siren = siren || __DA3.sfx.sirenActive; beacon = Math.max(beacon, __DA3.view.level.alarm); }
        g.state.setAlarm(m.ALARM_OFF); await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r));
        return { peak, siren, beacon, after: __DA3.alarm.edge, sirenAfter: __DA3.sfx.sirenActive };
      }, fx);
    }
    check('Setting «Тревога»: full > soft > off (off = no red edge, no beacons, no siren); everything clears afterwards', res.full.peak > res.soft.peak && res.soft.peak > 0 && res.off.peak === 0 && res.off.beacon === 0 && !res.off.siren && res.full.siren && res.soft.siren && Object.values(res).every(r => r.after === 0 && !r.sirenAfter), JSON.stringify(res));
    // 42. the setting is saved and restored
    await page.evaluate(() => { __DA3.show('settings'); }); await sleep(80);
    await page.evaluate(() => { const b = document.querySelector('#settingsForm .seg[data-key=alarmFx] button[data-val=soft]'); b.click(); });
    await page.reload(); await page.waitForFunction(() => window.__DA3, null, { timeout: 15000 });
    const saved = await DA(page, () => ({ fx: __DA3.settings.alarmFx, ui: [...document.querySelectorAll('#settingsForm .seg[data-key=alarmFx] button.on')].map(b => b.dataset.val) }));
    check('42. Settings persist: «Тревога: мягкая» saved and restored after a reload (other settings intact)', saved.fx === 'soft' && saved.ui.every(v => v === 'soft') && saved.ui.length >= 1, JSON.stringify(saved));
    await page.evaluate(() => { localStorage.removeItem('darkarena_proto3d_settings_v1'); });
    check('No JS errors (alarm settings)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- E. Gameplay regression pass on OUTPOST ZERO ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop, { path: WAVES });
    // 31–34 desktop: jump, fire, ADS, reload
    await DA(page, () => { __DA3.setPlayer(4, 8, 0, 0); __DA3.gs.setAmmo(30, 120); window.__f = 0; __DA3.game.on('fire', () => window.__f++); });
    await DA(page, () => { window.__zmax = 0; window.__zt = setInterval(() => { window.__zmax = Math.max(window.__zmax, __DA3.player.z); }, 16); });
    await page.keyboard.down('Space'); await ticks(page, 4); await page.keyboard.up('Space'); await ticks(page, 30);
    const z = await DA(page, () => { clearInterval(window.__zt); return window.__zmax; });
    await page.mouse.move(640, 360); await page.mouse.down({ button: 'left' }); await ticks(page, 20); await page.mouse.up({ button: 'left' });
    const fired = await DA(page, () => ({ f: window.__f, mag: __DA3.gs.weapon.mag }));
    await page.mouse.down({ button: 'right' }); await ticks(page, 30); const ads = await DA(page, () => __DA3.gs.weapon.ads); await page.mouse.up({ button: 'right' }); await ticks(page, 20);
    await page.keyboard.press('KeyR'); await ticks(page, 100);
    const rel = await DA(page, () => __DA3.gs.weapon.mag);
    check('31–34. Jump (in the air), fire (rounds spent), ADS (aim 1), reload (full magazine) still work in OUTPOST ZERO', z > 0.1 && fired.f >= 2 && fired.mag < 30 && ads > 0.95 && rel === 30, JSON.stringify({ z, fired, ads, rel }));
    // 38–39: three full waves with mixed variants → victory
    await DA(page, () => { __DA3.game.restart({ waves: true }); window.__v = { spawns: [], maxAlive: 0 }; __DA3.game.on('infectedSpawn', e => window.__v.spawns.push(e.variant)); setInterval(() => { const g = __DA3.game; if (__DA3.state !== 'play') return; __DA3.gs.setHealth(100); const alive = g.enemies.filter(e => e.alive).length; window.__v.maxAlive = Math.max(window.__v.maxAlive, alive); if (alive >= 5 || (alive > 0 && g.waves.queue.length === 0)) __DA3.dbg.infKill(); }, 150); });
    await page.waitForFunction(() => __DA3.state === 'victory', null, { timeout: 300000 }).catch(() => {});
    const vic = await DA(page, () => ({ st: __DA3.state, kills: __DA3.gs.kills, v: window.__v, alarm: __DA3.alarm.phase, siren: __DA3.sfx.sirenActive }));
    const cnt = vic.v.spawns.reduce((c, v) => (c[v] = (c[v] || 0) + 1, c), {});
    check('38/39. Three full waves (27 = 9 GUARD + 9 TECHNICIAN + 9 WORKER, ≤ 5 alive) → victory screen; no alarm after the last wave', vic.st === 'victory' && vic.kills === 27 && cnt.guard === 9 && cnt.technician === 9 && cnt.worker === 9 && vic.v.maxAlive <= 5 && vic.alarm === 'off' && !vic.siren, JSON.stringify({ cnt, max: vic.v.maxAlive, alarm: vic.alarm }));
    await shoot(page, 'm17_victory.png');
    // 41/40: restart, death screen, menu
    await page.click('#winRestartBtn'); await sleep(200);
    const rs = await DA(page, () => ({ st: __DA3.state, wave: __DA3.gs.wave.number, kills: __DA3.gs.kills, en: __DA3.game.enemies.length }));
    await page.waitForFunction(() => __DA3.game.enemies.some(e => e.alive), null, { timeout: 30000 }).catch(() => {});
    await DA(page, () => __DA3.game.damagePlayer(500)); await page.waitForFunction(() => __DA3.state === 'dead', null, { timeout: 10000 }).catch(() => {});
    const dd = await DA(page, () => __DA3.state);
    await page.click('#deadMenuBtn'); await sleep(150);
    check('41/40/37. ЗАНОВО restarts at wave 1; death screen on death; ГЛАВНОЕ МЕНЮ returns to the menu', rs.st === 'play' && rs.wave === 1 && rs.kills === 0 && rs.en === 0 && dd === 'dead' && await DA(page, () => __DA3.state) === 'menu', JSON.stringify(rs));
    const menuText = await DA(page, () => document.getElementById('menu').innerText.replace(/\s+/g, ' ').trim());
    check('Menu: OUTPOST ZERO subtitle, same three buttons, no technical hints', menuText === 'DARK ARENA OUTPOST ZERO ИГРАТЬ НАСТРОЙКИ ОБ ИГРЕ', menuText);
    await shoot(page, 'm17_menu.png');
    check('No JS errors (gameplay pass)', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // 35/36: phone landscape — multitouch move + fire + jump, pause by touch (iPhone 11 emulation)
  {
    const { ctx, page, cdp, errors } = await open(browser, base, devices['iPhone 11 landscape'], { path: WAVES });
    const rect = id => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
    const btn = {}; for (const id of ['fire', 'jump', 'move']) btn[id] = await rect(id);
    await DA(page, () => { window.__f = 0; __DA3.game.on('fire', () => window.__f++); __DA3.gs.setAmmo(30, 120); __DA3.setPlayer(8, 8, 0, 0); });
    const p0 = await DA(page, () => __DA3.player);
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y, id: 2 }]);
    await touch(cdp, 'touchMove', [{ x: 110, y: btn.move.y - 50, id: 2 }]);
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y - 50, id: 2 }, { x: btn.fire.x, y: btn.fire.y, id: 3 }]); await ticks(page, 8);
    await touch(cdp, 'touchStart', [{ x: 110, y: btn.move.y - 50, id: 2 }, { x: btn.fire.x, y: btn.fire.y, id: 3 }, { x: btn.jump.x, y: btn.jump.y, id: 4 }]); await ticks(page, 8);
    const mt = await DA(page, () => ({ f: window.__f, z: __DA3.player.z, x: __DA3.player.x, n: __DA3.touch.count }));
    await touch(cdp, 'touchEnd', []); await ticks(page, 3);
    check('35. Multitouch on iPhone 11 landscape: move + fire + jump at the same time', mt.f >= 1 && mt.z > 0 && Math.abs(mt.x - p0.x) > 0.05 && mt.n === 3, JSON.stringify(mt));
    await page.tap('#pauseBtn'); await sleep(120); const ps = await DA(page, () => ({ st: __DA3.state, siren: __DA3.sfx.sirenActive })); await page.tap('#resumeBtn'); await sleep(120);
    check('36. Pause by touch and resume', ps.st === 'paused' && await DA(page, () => __DA3.state) === 'play');
    await shoot(page, 'm17_phone.png');
    check('No JS errors (phone)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm17-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
