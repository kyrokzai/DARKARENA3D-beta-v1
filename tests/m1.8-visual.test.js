// M1.8 VISUAL QUALITY in the browser: real drawing-buffer size per graphics profile on emulated iPhones and desktop,
// MSAA, no nearest-neighbour CSS upscale, profile persistence + migration, adaptive resolution; infected models
// (baked PBR maps load, colour spaces, three variants, LOD levels and switching, animation ↔ hit zones on every LOD,
// all animations); environment textures (resolution, filtering); no WebGL errors; no leaks across restarts.
// Run: node tests/m1.8-visual.test.js   (SHOTS=dir for screenshots). Logic: tests/sim-m1.8.test.mjs.
// Chromium (software WebGL) ≠ iPhone Safari: resolution numbers are exact, performance is not measured here.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const KEY = 'darkarena_proto3d_settings_v1';
const VARIANTS = ['guard', 'technician', 'worker'];

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();

  // ---------- 1. Drawing buffer = profile policy on real device sizes; MSAA; no pixelated CSS ----------
  const DEVS = [['iPhone 11', devices['iPhone 11 landscape']], ['iPhone 14 Pro Max', devices['iPhone 14 Pro Max landscape']], ['Desktop', { viewport: { width: 1280, height: 720 } }]];
  const table = [];
  for (const [name, dev] of DEVS) for (const prof of ['performance', 'balanced', 'quality']) {
    const ctx = await browser.newContext(dev);
    await ctx.addInitScript(([k, p]) => localStorage.setItem(k, JSON.stringify({ graphicsProfile: p, settingsVersion: 2, autoResolution: false })), [KEY, prof]);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/prototype-3d/?debug=1'); await page.waitForFunction(() => window.__DA3, null, { timeout: 15000 }); await sleep(200);
    const r = await DA(page, async () => {
      const q = await import('/prototype-3d/src/render/quality.js'); const c = __DA3.view.renderer.domElement, gl = __DA3.view.renderer.getContext();
      const exp = q.computePixelRatio(innerWidth, innerHeight, devicePixelRatio, __DA3.settings.graphicsProfile, __DA3.settings.renderScale, 1);
      return { css: [innerWidth, innerHeight], dpr: devicePixelRatio, buf: [gl.drawingBufferWidth, gl.drawingBufferHeight], exp: [exp.width, exp.height], aa: gl.getContextAttributes().antialias, msaa: q.getProfile(__DA3.settings.graphicsProfile).msaa, budget: q.getProfile(__DA3.settings.graphicsProfile).maxPixels, ir: getComputedStyle(c).imageRendering, cssW: c.clientWidth, cssH: c.clientHeight };
    });
    table.push({ name, prof, ...r });
    check(`${name} / ${prof}: drawing buffer ${r.buf.join('×')} = profile policy, within budget, MSAA ${r.msaa ? 'on' : 'off'}, canvas = viewport, no pixelated upscale`,
      r.buf[0] === r.exp[0] && r.buf[1] === r.exp[1] && r.buf[0] * r.buf[1] <= r.budget && r.aa === r.msaa && r.cssW === r.css[0] && r.cssH === r.css[1] && r.ir === 'auto' && !errors.length, JSON.stringify(r));
    await ctx.close();
  }
  const m17px = (w, h, d) => Math.round(w * Math.min(d, 2) * 0.75) * Math.round(h * Math.min(d, 2) * 0.75);
  const b14 = table.find(t => t.name === 'iPhone 14 Pro Max' && t.prof === 'balanced'), b11 = table.find(t => t.name === 'iPhone 11' && t.prof === 'balanced');
  check('Sharper than M1.7 by default (balanced): iPhone 11 native, iPhone 14 Pro Max > 1.7× the M1.7 pixel count', b11.buf[0] === b11.css[0] * b11.dpr && b14.buf[0] * b14.buf[1] > 1.7 * m17px(b14.css[0], b14.css[1], b14.dpr), `${b11.buf.join('×')} / ${b14.buf.join('×')}`);

  // ---------- 2. Settings: profile persists; an M1.7 save (renderScale 0.75) is migrated once; adaptive guard ----------
  {
    const ctx = await browser.newContext(devices['iPhone 11 landscape']);
    await ctx.addInitScript(k => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify({ renderScale: 0.75, volume: 0.4, mouseSens: 1.7 })); sessionStorage.setItem('seeded', '1'); } }, KEY);
    const page = await ctx.newPage(); await page.goto(base + '/prototype-3d/?debug=1'); await page.waitForFunction(() => window.__DA3);
    const mig = await DA(page, () => ({ rs: __DA3.settings.renderScale, v: __DA3.settings.volume, ms: __DA3.settings.mouseSens, prof: __DA3.settings.graphicsProfile }));
    check('Migration: an M1.7 save (renderScale 0.75 = the old blur) → 1.0; other saved settings kept', mig.rs === 1 && mig.v === 0.4 && mig.ms === 1.7 && mig.prof === 'balanced', JSON.stringify(mig));
    await DA(page, () => { __DA3.show('settings'); }); await sleep(100);
    await DA(page, () => document.querySelector('#settingsForm .seg[data-key=graphicsProfile] button[data-val=quality]').click()); await sleep(100);
    await page.reload(); await page.waitForFunction(() => window.__DA3); await sleep(200);
    const saved = await DA(page, () => ({ prof: __DA3.settings.graphicsProfile, ui: [...document.querySelectorAll('#settingsForm .seg[data-key=graphicsProfile] button.on')].map(b => b.dataset.val), aa: __DA3.view.resolution.msaa, rs: __DA3.settings.renderScale }));
    check('Graphics profile is saved and restored (Качество графики → Качество), MSAA from the profile after reload', saved.prof === 'quality' && saved.ui.length >= 1 && saved.ui.every(v => v === 'quality') && saved.aa === true && saved.rs === 1, JSON.stringify(saved));
    // adaptive resolution: feed slow frames → lower buffer; fast frames → back
    const ad = await DA(page, () => { const v = __DA3.view; v.autoRes.reset(); __DA3.settings.autoResolution = true; window.dispatchEvent(new Event('resize'));
      const w0 = v.resolution.buffer[0]; for (let i = 0; i < 400; i++) v.sampleFrame(1 / 25); const w1 = v.resolution.buffer[0], f1 = v.autoRes.factor;
      for (let i = 0; i < 4000; i++) v.sampleFrame(1 / 120); return { w0, w1, w2: v.resolution.buffer[0], f1 }; });
    check('Adaptive resolution: slow frames (25 fps) lower the drawing buffer, fast frames restore it', ad.w1 < ad.w0 && ad.w2 === ad.w0 && ad.f1 < 1, JSON.stringify(ad));
    await DA(page, k => localStorage.removeItem(k), KEY);
    await ctx.close();
  }

  // ---------- 3. Infected: baked maps, materials, LOD, animation ↔ hit zones, all animations ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } }, { gfx: null });
    await DA(page, () => __DA3.show('paused'));
    const r = await DA(page, async ({ VARIANTS }) => {
      const THREE = await import('three'); const M = await import('/prototype-3d/src/render/enemies/hollow-model.js'); const { InputState } = await import('/prototype-3d/src/input/input.js');
      const out = { assets: {}, mats: {} };
      for (const v of VARIANTS) { const A = M.getHollowAssets(v); await Promise.all([A.mats.skin.userData.ready, A.mats.rags.userData.ready]); out.assets[v] = { tris: A.trisLod, lods: A.lods.length };
        out.mats[v] = ['skin', 'rags'].map(k => { const m = A.mats[k]; return { baked: !!m.userData.baked, map: m.map && m.map.image && [m.map.image.width, m.map.image.height], cs: m.map && m.map.colorSpace, ncs: m.normalMap && m.normalMap.colorSpace, vc: m.vertexColors }; }); }
      out.mapStats = M.getMapStats();
      const uv = M.getHollowAssets('guard').lods.map(L => L.skin.getAttribute('uv').count > 0); out.uvAll = uv.every(Boolean);
      // animation ↔ hit zones on LOD0 and LOD1 for every variant (deterministic stepping)
      const g = __DA3.game, view = __DA3.infectedView, inp = new InputState(), V = new THREE.Vector3();
      g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e); view.update(g.enemies, 0, 1);
      __DA3.setPlayer(4, 8, 0, 0);
      const es = VARIANTS.map((v, i) => g.spawnInfected('hollow', 9, 7.6 + i * 0.9, Math.PI, { variant: v }));
      const headErr = e => { const grp = view.groupOf(e); grp.updateMatrixWorld(true); V.set(0, 0.085, 0.015).applyMatrix4(grp.children.find(o => o.isBone).getObjectByName('head').matrixWorld); const hb = e.hitboxes()[0]; return Math.hypot(V.x - hb.cx * 2, V.y - hb.cz * 2, V.z - hb.cy * 2); };
      out.err = {}; out.lodSeen = {};
      for (const [cam, lodName] of [[{ x: 9.5, z: 16 }, 'near'], [{ x: 9 * 2 - 22, z: 16 }, 'far']]) {
        for (let i = 0; i < 90; i++) { g.step(inp.update(), 1 / 60); g.state.setHealth(100); view.update(g.enemies, 1 / 60, 1, cam); es.forEach((e, k) => { const key = VARIANTS[k] + '_' + lodName; out.err[key] = Math.max(out.err[key] || 0, headErr(e)); out.lodSeen[key] = view.lodOf(e); }); }
      }
      // visible meshes per infected = 3 (one LOD at a time)
      out.visible = es.map(e => view.groupOf(e).children.filter(o => o.isSkinnedMesh && o.visible).length);
      return out;
    }, { VARIANTS });
    check('Baked PBR maps: 12 files loaded (3 variants × skin / outfit × colour + normal-roughness), none failed', r.mapStats.loaded === 12 && r.mapStats.failed === 0, JSON.stringify(r.mapStats));
    check('Materials: baked colour (1024², sRGB) + normal/roughness map (linear), vertex colours off once loaded', VARIANTS.every(v => r.mats[v].every(m => m.baked && m.map[0] === 1024 && m.cs === 'srgb' && m.ncs === '' && !m.vc)), JSON.stringify(r.mats.guard));
    check('Three LOD levels per variant with a real reduction (LOD1 ≤ 60 %, LOD2 ≤ 40 % of LOD0); LOD0 ≤ 14k triangles', VARIANTS.every(v => r.assets[v].lods === 3 && r.assets[v].tris[1] <= r.assets[v].tris[0] * 0.6 && r.assets[v].tris[2] <= r.assets[v].tris[0] * 0.4 && r.assets[v].tris[0] <= 14000), JSON.stringify(r.assets));
    check('LOD switches with distance (near = LOD0, far = LOD2) and only one level is drawn (3 meshes)', VARIANTS.every(v => r.lodSeen[v + '_near'] === 0 && r.lodSeen[v + '_far'] === 2) && r.visible.every(n => n === 3), JSON.stringify({ lod: r.lodSeen, vis: r.visible }));
    check('Animation stays on the sim hit zones for every variant on LOD0 and LOD2 (head ≤ 6 cm)', Object.values(r.err).every(x => x < 0.06), JSON.stringify(r.err));
    check('No JS errors (models)', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // all animations of the three models in the viewer, no errors; screenshots for the acceptance
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } }); const errors = [];
    let frames = 0;
    for (const v of VARIANTS) for (const a of ['idle', 'walk', 'run', 'turn', 'attack', 'hit', 'headshot', 'death', 'deathFront', 'crumple']) {
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/prototype-3d/tools/infected-viewer.html?variant=${v}&anim=${a}&t=0.6`); await page.waitForFunction(() => window.__iv, null, { timeout: 20000 });
      const ok = await DA(page, () => { const b = __iv.bones(); return Object.values(b).every(p => p.every(Number.isFinite)); });
      if (ok) frames++;
      if (SHOTS && (a === 'walk' || a === 'attack')) { await sleep(1200); await page.screenshot({ path: path.join(SHOTS, `m18_${v}_${a}.png`) }); }
      await page.close();
    }
    check('All 10 animations play for all 3 variants (finite bone poses, no errors)', frames === 30 && !errors.length, `${frames}/30 ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---------- 4. Environment textures, WebGL errors, leaks across restarts ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } }, { path: '/prototype-3d/?debug=1&waves=1', gfx: null });
    const env = await DA(page, () => {
      const out = {}; __DA3.view.scene.traverse(o => { if (o.name === 'floor' || o.name.startsWith('walls-panel')) { const t = o.material.map; out[o.name] = { w: t.image.width, h: t.image.height, mag: t.magFilter, min: t.minFilter, aniso: t.anisotropy, bump: !!o.material.bumpMap }; } });
      return out;
    });
    const wall = env['walls-panel'], floor = env.floor;
    check('Environment: walls 256×384 px per 2×3 m face (M1.7: 32×48), floor 256 px per cell (M1.7: 16), linear + anisotropic filtering (balanced: walls ×2, floor ×4), bump maps', wall && wall.w === 256 && wall.h === 384 && wall.mag === 1006 && wall.min === 1008 && wall.aniso >= 2 && wall.bump && floor.w === 256 && floor.aniso >= 4 && floor.bump, JSON.stringify(env));
    // profile switch at runtime: PERFORMANCE drops anisotropy and bump maps (the measured per-pixel costs), BALANCED restores them
    const sw = await DA(page, async () => { const pick = () => { const o = {}; __DA3.view.scene.traverse(m => { if (m.name === 'floor') o.floor = [m.material.map.anisotropy, !!m.material.bumpMap]; if (m.name === 'walls-panel') o.wall = [m.material.map.anisotropy, !!m.material.bumpMap]; }); return o; };
      __DA3.settings.graphicsProfile = 'performance'; window.dispatchEvent(new Event('resize')); __DA3.view.resize(true); const perf = pick();
      __DA3.settings.graphicsProfile = 'balanced'; __DA3.view.resize(true); return { perf, bal: pick() }; });
    check('Profile switch applies live: PERFORMANCE = no anisotropy, no bump maps; BALANCED restores them', sw.perf.floor[0] === 1 && !sw.perf.floor[1] && !sw.perf.wall[1] && sw.bal.floor[0] >= 4 && sw.bal.floor[1] && sw.bal.wall[1], JSON.stringify(sw));
    // restart cycles: memory must not grow; WebGL error flag clean
    const mem = await DA(page, async () => {
      const info = () => ({ g: __DA3.view.renderer.info.memory.geometries, t: __DA3.view.renderer.info.memory.textures });
      const cycle = async () => { const g = __DA3.game; g.restart({ waves: true }); for (const [i, v] of ['guard', 'technician', 'worker', 'guard', 'worker'].entries()) g.spawnInfected('hollow', 6 + i, 12, 0, { variant: v }); for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r)); };
      await cycle(); await cycle(); const m0 = info(); // warm-up: the first restarts upload maps of variants / LODs not drawn yet (lazy, not a leak)
      for (let k = 0; k < 4; k++) await cycle();
      const gl = __DA3.view.renderer.getContext(); return { m0, m1: info(), glErr: gl.getError(), lost: gl.isContextLost() };
    });
    check('No WebGL errors, context alive; 4 restarts with mixed infected do not grow geometries / textures', mem.glErr === 0 && !mem.lost && mem.m1.g <= mem.m0.g && mem.m1.t <= mem.m0.t, JSON.stringify(mem));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm18_ingame.png') });
    check('No JS errors (environment / restarts)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm18-results.json'), JSON.stringify({ results, table }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
