// M1.9 FIRST-PERSON COMBAT POLISH in the browser: hands / gloves / sleeves (procedural relief, two-tone glove,
// outward-facing lathe geometry, budget), RAVEN materials (relief per slot, skins stay cosmetic), the melee strike in
// the real game (V key, viewmodel strike timeline, impact feedback, sounds, all three variants, kill, hit zones on the
// reaction pose, pause), HUD ammo (30-round magazine), and the touch УДАР button (iPhone 11 landscape: size, no
// overlap, tap → strike, multitouch with move + look + fire, cooldown ring, HUD editor). Logic: tests/sim-m1.9.test.mjs.
// Run: node tests/m1.9-fp-combat.test.js   (SHOTS=dir for screenshots). Chromium (software WebGL) ≠ iPhone Safari.
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const VARIANTS = ['guard', 'technician', 'worker'];
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
const rectOf = (page, id) => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, hidden: document.querySelector('.hud-' + id).classList.contains('hidden') }; }, id);
/** Clear the arena, put the player at (3, 8) looking +x and one infected `d` cells ahead (senses frozen). */
const arenaWith = (page, variant, d = 0.62) => DA(page, ([variant, d]) => {
  const g = __DA3.game; g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e); __DA3.setPlayer(3, 8, 0, 0); g.state.setHealth(100);
  if (!variant) return null; const e = g.spawnInfected('hollow', 3 + d, 8, Math.PI, { variant }); e.senseT = 1e9; return e.id;
}, [variant, d]);
const waitStrikes = (page, n, ms = 20000) => page.waitForFunction(n => __DA3.game.melee.strikes >= n && !__DA3.game.state.melee.active, n, { timeout: ms }).then(() => true).catch(() => false);
const waitReady = (page, ms = 20000) => page.waitForFunction(() => __DA3.game.state.melee.ready, null, { timeout: ms }).catch(() => {});

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();

  // ---------- 1. Hands, gloves, sleeves ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    const h = await DA(page, async () => {
      const THREE = await import('three'); const vm = __DA3.view.vm, hands = vm.hands, out = { mats: {} };
      for (const [k, m] of Object.entries(hands.mats)) out.mats[k] = { nm: !!m.normalMap, nmSize: m.normalMap && m.normalMap.image && m.normalMap.image.width, ncs: m.normalMap && m.normalMap.colorSpace, metal: m.metalness, rough: m.roughness, vc: m.vertexColors };
      out.stats = hands.stats();
      // two-tone glove: palm-side vertices lighter than back-of-hand vertices (vertex colours by normal)
      const caps = hands.meshes.caps.geometry, n = caps.getAttribute('normal'), c = caps.getAttribute('color');
      let palm = 0, back = 0, np = 0, nb = 0; for (let i = 0; i < n.count; i++) { const l = c.getX(i) + c.getY(i) + c.getZ(i); if (n.getZ(i) > 0.6) { palm += l; np++; } else if (n.getZ(i) < -0.6) { back += l; nb++; } }
      out.palmBack = [palm / np, back / nb];
      // every lathe part faces OUTWARDS (the M1.8 sleeve showed the inside of its far wall)
      out.outward = {};
      for (const k of ['sleeve', 'cuff', 'strap', 'insert', 'caps']) {
        const g = hands.meshes[k].geometry, P = g.getAttribute('position'), N = g.getAttribute('normal'); let ok = 0, tot = 0;
        for (let i = 0; i < P.count; i++) { const rx = P.getX(i), rz = P.getZ(i), r = Math.hypot(rx, rz); if (r < 1e-4) continue; tot++; if ((N.getX(i) * rx + N.getZ(i) * rz) / r > 0) ok++; }
        out.outward[k] = +(ok / tot).toFixed(3);
      }
      out.sleeveLen = (() => { const P = hands.meshes.sleeve.geometry.getAttribute('position'); let y0 = 0, y1 = 0; for (let i = 0; i < P.count; i++) { y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); } return +(y1 - y0).toFixed(3); })();
      return out;
    });
    const m = h.mats;
    check('Hands: every material has a procedural relief (normal map, linear colour space): fingers, palm, cuff, rubber guards, strap, sleeve, insert', Object.values(m).every(x => x.nm && x.ncs === '') && Object.keys(m).length >= 7, JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.nmSize]))));
    check('Gloves: matte materials (no metallic "shiny pads" any more), two-tone — palm side lighter than the back of the hand', Object.values(m).every(x => x.metal <= 0.05 && x.rough >= 0.5) && m.finger.vc && m.glove.vc && h.palmBack[0] > h.palmBack[1] * 1.15, JSON.stringify(h.palmBack.map(v => +v.toFixed(3))));
    check('Geometry faces outwards on every lathe part (sleeve / cuff / strap / insert / fingers) — fixes the "glowing" inside-out forearm', Object.values(h.outward).every(v => v > 0.97), JSON.stringify(h.outward));
    check('Hands budget kept: 7 draw calls (instanced), ≤ 14k triangles; sleeve long enough to leave the screen (≥ 0.45 m)', h.stats.drawCalls === 7 && h.stats.triangles <= 14000 && h.sleeveLen >= 0.45, JSON.stringify({ ...h.stats, sleeve: h.sleeveLen }));
    // RAVEN materials: relief per slot, skins cosmetic
    const w = await DA(page, () => {
      const vm = __DA3.view.vm, mats = vm.model.mats, out = {};
      for (const k of ['body', 'polymer', 'grip', 'accent', 'steel']) out[k] = { nm: !!mats[k].normalMap, rough: !!mats[k].roughnessMap };
      const def = __DA3.game.weapon.def, before = JSON.stringify(def); const skins = [];
      for (const s of ['obsidian', 'bloodline', 'neon_ghost', 'obsidian']) { __DA3.setSkin(s); skins.push([s, !!mats.accent.normalMap, mats.accent.normalMap === mats.body.normalMap ? 'metal' : 'carbon']); }
      out.skins = skins; out.statsSame = JSON.stringify(def) === before;
      return out;
    });
    check('RAVEN: every material slot has a relief (machined metal / stippled polymer / carbon weave) and a soft roughness map', ['body', 'polymer', 'grip', 'accent', 'steel'].every(k => w[k].nm && w[k].rough), JSON.stringify(w.skins));
    check('Skins stay cosmetic: switching OBSIDIAN / BLOODLINE / NEON GHOST changes the relief of the accent panel only, weapon data unchanged', w.statsSame && w.skins.every(s => s[1]) && w.skins[0][2] === 'carbon' && w.skins[1][2] === 'metal');
    // the reload / ADS still work with the new hands (poses applied, no NaN)
    const anim = await DA(page, () => { const vm = __DA3.view.vm, out = [];
      for (const r of [-1, 0.2, 0.5, 0.8, 0.96]) { vm.forceReload = r; __DA3.view.render(__DA3.game.player, 1, { dt: 1 / 60, ads: 0, reload: r }); const pts = vm.handScreenPoints(); out.push([r, pts.length, pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))]); }
      vm.forceReload = null; return out; });
    check('Reload stages render with the new hands (finite joint positions, hands on screen in every stage)', anim.every(a => a[2] && a[1] > 0), JSON.stringify(anim));
    check('No JS errors (hands / weapon)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. Melee in the real game (desktop) ----------
  {
    const { ctx, page, errors } = await open(browser, base, { viewport: { width: 1280, height: 720 } });
    const hint = await DA(page, () => document.getElementById('hint').textContent);
    check('Controls hint lists the new key (V — удар прикладом)', /V — удар прикладом/.test(hint), hint);
    // viewmodel strike timeline (frozen frames)
    const tl = await DA(page, () => { const vm = __DA3.view.vm, out = {}; const P = __DA3.game.player;
      for (const p of [null, 0.1, 0.2, 0.32, 0.42, 0.7, 1]) { vm.forceMelee = p; __DA3.view.render(P, 1, { dt: 1 / 60, ads: 0, reload: -1 }); out[p ?? 'grip'] = { ry: +vm.rig.rotation.y.toFixed(3), z: +vm.rig.position.z.toFixed(3), phase: vm.meleePhase, near: vm.handScreenPoints().length }; }
      vm.forceMelee = null; return out; });
    check('Viewmodel strike: wind-up (rifle cocked back, muzzle left) → strike (rotated ≈ 90°, thrust forward) → back to the exact grip pose', tl['0.2'].ry > tl.grip.ry + 0.2 && tl['0.32'].ry < tl.grip.ry - 1.2 && tl['0.32'].z < tl.grip.z - 0.12 && Math.abs(tl['1'].ry - tl.grip.ry) < 1e-3 && Math.abs(tl['1'].z - tl.grip.z) < 1e-3 && tl['0.1'].phase === 'windup' && tl['0.32'].phase === 'strike' && tl['0.7'].phase === 'return', JSON.stringify(tl));
    check('Hands stay attached to the rifle and in front of the camera in every strike phase (no part behind the near plane / lost)', Object.values(tl).every(t => t.near >= tl.grip.near * 0.8), JSON.stringify(Object.fromEntries(Object.entries(tl).map(([k, v]) => [k, v.near]))));
    // V key → strike on each variant until it dies
    const out = [];
    for (const v of VARIANTS) {
      await arenaWith(page, v);
      const s0 = await DA(page, () => ({ strikes: __DA3.game.melee.strikes, imp: __DA3.view.vm.stats.meleeImpacts, sw: __DA3.audio.played.meleeSwing || 0, hit: __DA3.audio.played.meleeHit || 0, kills: __DA3.kills }));
      for (let i = 1; i <= 3; i++) {
        await waitReady(page); await DA(page, () => { const e = __DA3.game.enemies.find(x => x.alive); if (e) { e.x = 3.62; e.y = 8; } }); // keep it in reach after the knockback
        await page.keyboard.press('KeyV'); await waitStrikes(page, s0.strikes + i);
        if (i === 1) { await sleep(60); await shot(page, `m19_melee_hit_${v}.png`); }
      }
      const r = await DA(page, s0 => { const e = __DA3.game.enemies[0]; return { strikes: __DA3.game.melee.strikes - s0.strikes, dead: !!e && !e.alive, state: e && e.state, kills: __DA3.kills - s0.kills, imp: __DA3.view.vm.stats.meleeImpacts - s0.imp, sw: (__DA3.audio.played.meleeSwing || 0) - s0.sw, hit: (__DA3.audio.played.meleeHit || 0) - s0.hit, view: e ? __DA3.infectedView.variantOf(e) : null }; }, s0);
      out.push({ v, ...r });
    }
    check('V key: three strikes kill GUARD, TECHNICIAN and WORKER (counted once each, death fall), the variant model stays', out.every(o => o.strikes === 3 && o.dead && o.state === 'DEAD' && o.kills === 1 && o.view === o.v), JSON.stringify(out));
    check('Feedback on every blow: rifle impact jolt + swing / impact sounds (Web Audio counters)', out.every(o => o.imp === 3 && o.sw === 3 && o.hit === 3), JSON.stringify(out.map(o => [o.v, o.imp, o.sw, o.hit])));
    // hit zones stay on the animated body during the stronger melee reaction (rule 11)
    const hz = await DA(page, async () => {
      const THREE = await import('three'); const { InputState } = await import('/prototype-3d/src/input/input.js');
      const g = __DA3.game, view = __DA3.infectedView, inp = new InputState(), V = new THREE.Vector3(), out = {};
      __DA3.show('paused'); g.waves.reset(); for (const e of [...g.enemies]) g.removeInfected(e); __DA3.setPlayer(3, 8, 0, 0);
      const es = ['guard', 'technician', 'worker'].map((v, i) => { const e = g.spawnInfected('hollow', 3.6, 7.7 + i * 0.3, Math.PI, { variant: v }); e.senseT = 1e9; return e; });
      const headErr = e => { const grp = view.groupOf(e); grp.updateMatrixWorld(true); V.set(0, 0.085, 0.015).applyMatrix4(grp.children.find(o => o.isBone).getObjectByName('head').matrixWorld); const hb = e.hitboxes()[0]; return Math.hypot(V.x - hb.cx * 2, V.y - hb.cz * 2, V.z - hb.cy * 2); };
      const m = g.weapon.def.melee; es.forEach(e => e.applyMelee(m.damage, { x: 1, y: 0, z: 0 }, m));
      let maxLean = 0;
      for (let i = 0; i < 40; i++) { g.step(inp.update(), 1 / 60); g.state.setHealth(100); view.update(g.enemies, 1 / 60, 1, { x: 7, z: 16 }); es.forEach(e => { out[e.variant] = Math.max(out[e.variant] || 0, headErr(e)); maxLean = Math.max(maxLean, e.pose.hitK * e.pose.hitPow); }); }
      out.maxLean = +maxLean.toFixed(2); __DA3.show('play'); return out;
    });
    check('Melee reaction: the stronger flinch is visible (power 1.8) and the head stays on the sim hit zone for all variants (≤ 6 cm)', hz.maxLean > 1.2 && VARIANTS.every(v => hz[v] < 0.06), JSON.stringify(hz));
    // pause during a strike: frozen, then finishes; no strike queued from a key pressed in the menu
    await arenaWith(page, 'guard'); await waitReady(page);
    const s1 = await DA(page, () => __DA3.game.melee.strikes);
    // the page pauses itself on the first frame where the strike runs (software frames are slow: no cross-call timing)
    await DA(page, () => { window.__pauseAt = null; const f = () => { const m = __DA3.game.state.melee; if (m.active && m.progress > 0) { __DA3.show('paused'); window.__pauseAt = m.progress; } else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.keyboard.press('KeyV'); await page.waitForFunction(() => window.__pauseAt !== null, null, { timeout: 8000 }).catch(() => {});
    const p0 = await DA(page, () => __DA3.game.state.melee.progress); await sleep(400); const p1 = await DA(page, () => __DA3.game.state.melee.progress);
    await page.keyboard.press('KeyV'); // pressed in the pause menu → ignored
    await DA(page, () => __DA3.show('play')); await waitStrikes(page, s1 + 1); await sleep(1500);
    const pz = await DA(page, s1 => ({ strikes: __DA3.game.melee.strikes - s1, active: __DA3.game.state.melee.active }), s1);
    check('Pause during a strike: the strike freezes, finishes after resuming; V pressed in the pause menu does nothing', p0 > 0 && p1 === p0 && pz.strikes === 1 && !pz.active, JSON.stringify({ p0, p1, ...pz }));
    // ammo HUD: 30-round magazine
    await arenaWith(page, null);
    await DA(page, () => __DA3.game.restart({ waves: false })); await sleep(150);
    const hud = async () => DA(page, () => ({ mag: document.querySelector('[data-v=mag]').textContent, res: document.querySelector('[data-v=reserve]').textContent, st: document.querySelector('[data-v=ammoState]').textContent }));
    const a0 = await hud();
    await DA(page, () => { __DA3.input.setAction('fire', true); __DA3.input.setAction('fire', false); }); await page.waitForFunction(() => __DA3.gs.weapon.mag === 29, null, { timeout: 5000 }).catch(() => {}); await sleep(100);
    const a1 = await hud();
    await DA(page, () => __DA3.gs.setAmmo(0, 120)); await sleep(100); const a2 = await hud();
    await DA(page, () => { __DA3.input.setAction('reload', true); __DA3.input.setAction('reload', false); }); await page.waitForFunction(() => __DA3.gs.weapon.reloading, null, { timeout: 5000 }).catch(() => {}); const a3 = await hud();
    await page.waitForFunction(() => !__DA3.gs.weapon.reloading, null, { timeout: 15000 }).catch(() => {}); await sleep(100); const a4 = await hud();
    check('HUD ammo: 30 / 120 at start, 29 after a shot, empty magazine prompts a reload, reload shows, then 30 / 90', a0.mag === '30' && a0.res === '120' && a1.mag === '29' && a2.mag === '0' && a2.st === 'ПЕРЕЗАРЯДИ' && a3.st === 'ПЕРЕЗАРЯДКА' && a4.mag === '30' && a4.res === '90', JSON.stringify([a0, a1, a2, a3, a4]));
    check('No JS errors (melee in the game)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3. Touch: УДАР button on iPhone 11 landscape ----------
  {
    const dev = devices['iPhone 11 landscape'];
    const { ctx, page, errors, cdp } = await open(browser, base, dev);
    await sleep(300);
    const mel = await rectOf(page, 'melee'), others = await DA(page, () => __DA3.hudRects);
    const ov = others.filter(r => r.id !== 'melee').filter(r => { const m = others.find(x => x.id === 'melee'); return Math.hypot(r.cx - m.cx, r.cy - m.cy) < (r.w + m.w) / 2 && r.x0 < m.x1 && m.x0 < r.x1 && r.y0 < m.y1 && m.y0 < r.y1; }).map(r => r.id);
    check('iPhone 11: УДАР button shown (touch HUD), ≥ 44 px, inside the screen, no overlap with other controls', !mel.hidden && mel.w >= 44 && mel.l >= 0 && mel.r <= dev.viewport.width && mel.b <= dev.viewport.height && ov.length === 0, JSON.stringify({ mel, ov }));
    await shot(page, 'm19_mobile_hud.png');
    await arenaWith(page, 'technician'); await waitReady(page);
    const s0 = await DA(page, () => __DA3.game.melee.strikes);
    await DA(page, () => { window.__cool = []; const f = () => { window.__cool.push(document.querySelector('.hud-melee').classList.contains('cooling')); if (window.__cool.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await touch(cdp, 'touchStart', [{ x: mel.cx, y: mel.cy, id: 1 }]); await sleep(40);
    const pressed = await DA(page, () => document.querySelector('.hud-melee').classList.contains('pressed'));
    await touch(cdp, 'touchEnd', []);
    await page.waitForFunction(s0 => __DA3.game.melee.strikes > s0, s0, { timeout: 8000 }).catch(() => {});
    await waitStrikes(page, s0 + 1); await waitReady(page); await sleep(200);
    const cooling = await DA(page, () => window.__cool.some(Boolean));
    const after = await DA(page, s0 => ({ strikes: __DA3.game.melee.strikes - s0, hp: __DA3.game.enemies[0] && __DA3.game.enemies[0].hp, coolingAfter: document.querySelector('.hud-melee').classList.contains('cooling') }), s0);
    check('Tap on УДАР → one strike that hits (pressed style on the button); cooldown ring while it runs, cleared when ready', pressed && cooling && after.strikes === 1 && after.hp === 66 && !after.coolingAfter, JSON.stringify({ pressed, ringSeen: cooling, ...after }));
    // multitouch: move stick + look + FIRE held, then a 4th finger on УДАР
    const fire = await rectOf(page, 'fire'), mv = await rectOf(page, 'move');
    await arenaWith(page, null); await waitReady(page);
    const look = { x: Math.round(dev.viewport.width * 0.55), y: Math.round(dev.viewport.height * 0.3) };
    const pts = [{ x: mv.cx, y: mv.cy - 40, id: 1 }, { x: look.x, y: look.y, id: 2 }, { x: fire.cx, y: fire.cy, id: 3 }];
    await touch(cdp, 'touchStart', [{ x: mv.cx, y: mv.cy, id: 1 }]); // the stick base lands under the thumb…
    for (let i = 1; i <= 4; i++) { await touch(cdp, 'touchMove', [{ x: mv.cx, y: mv.cy - i * 10, id: 1 }]); await sleep(20); } // …and is pushed forward
    await touch(cdp, 'touchStart', pts.slice(0, 2)); await touch(cdp, 'touchStart', pts); await sleep(400);
    // sim events with ticks (exact, independent of how late the test polls)
    await DA(page, () => { const g = __DA3.game; window.__ev = []; g.on('fire', () => __ev.push(['f', g.tick])); g.on('meleeStart', () => __ev.push(['m', g.tick])); });
    const f0 = await DA(page, () => ({ shots: __DA3.view.vm.stats.shots, strikes: __DA3.game.melee.strikes, x: __DA3.player.x }));
    await touch(cdp, 'touchStart', [...pts, { x: mel.cx, y: mel.cy, id: 4 }]); await sleep(40);
    await page.waitForFunction(n => __DA3.game.state.melee.active || __DA3.game.melee.strikes > n, f0.strikes, { timeout: 8000 }).catch(() => {});
    const fs1 = await DA(page, () => __DA3.view.vm.stats.shots);
    await page.waitForFunction(() => !__DA3.game.state.melee.active, null, { timeout: 8000 }).catch(() => {});
    const fs2 = await DA(page, () => __DA3.view.vm.stats.shots);
    await sleep(700); const f1 = await DA(page, () => { const ev = window.__ev, m = ev.find(e => e[0] === 'm'), dur = Math.round(__DA3.game.weapon.def.melee.duration * 60);
      return { shots: __DA3.view.vm.stats.shots, strikes: __DA3.game.melee.strikes, x: __DA3.player.x, roles: __DA3.touch.roles || null, count: __DA3.touch.count,
        before: m ? ev.filter(e => e[0] === 'f' && e[1] < m[1]).length : -1, during: m ? ev.filter(e => e[0] === 'f' && e[1] >= m[1] && e[1] < m[1] + dur).length : -1, afterS: m ? ev.filter(e => e[0] === 'f' && e[1] >= m[1] + dur).length : -1 }; });
    await touch(cdp, 'touchEnd', []); await sleep(100);
    const rel = await DA(page, () => ({ fire: __DA3.input.actions.fire, melee: __DA3.input.actions.melee, count: __DA3.touch.count }));
    check('4 fingers (move + look + FIRE + УДАР): the strike happens while moving, no shot during it (sim ticks), firing resumes after', f1.strikes === f0.strikes + 1 && f1.before > 0 && f1.during === 0 && f1.afterS > 0 && f1.x !== f0.x, JSON.stringify({ x0: f0.x, x1: f1.x, before: f1.before, during: f1.during, after: f1.afterS, roles: f1.roles }));
    check('All fingers released → no stuck fire / melee', !rel.fire && !rel.melee && rel.count === 0, JSON.stringify(rel));
    // HUD editor lists the button and keeps it on screen
    const ed = await DA(page, () => { const el = document.querySelector('.hud-melee'); return { tag: el.querySelector('.edit-tag') && el.querySelector('.edit-tag').textContent, lbl: el.querySelector('.lbl').textContent }; });
    check('HUD layout editor: УДАР is an editable element (label "Удар прикладом", short label УДАР)', ed.tag === 'Удар прикладом' && ed.lbl === 'УДАР', JSON.stringify(ed));
    check('No JS errors (touch)', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
