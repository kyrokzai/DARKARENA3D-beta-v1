// M1.4 — first-person hands + weapon animations (Playwright + Chromium; desktop and iPhone emulation).
// Run: node tests/m1.4-hands.test.js   (SHOTS=dir for screenshots).
// Chromium ≠ iOS Safari: WebGL here is software (SwiftShader), timings are NOT iPhone performance.
// Penetration is measured against the weapon's proxy volumes (oriented boxes, hand-poses.js), not the render mesh.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open } = require('./lib/harness');

const SHOTS = process.env.SHOTS || '';
const { results, check } = makeChecker();
const DA = (page, fn, arg) => page.evaluate(fn, arg);
const shoot = async (page, file) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, file) }); };
const ticks = (page, n) => DA(page, n => new Promise(res => { const t0 = __DA3.game.tick; const f = () => (__DA3.game.tick - t0 >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const frames = (page, n) => DA(page, n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); }), n);
const MOD = '/prototype-3d/src/render/weapons/';

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1280, height: 720 } };
  const iphone = devices['iPhone 14 Pro Max landscape'];

  // ---------- 1. Pure kinematics: anatomy, penetration over the whole reload, magazine in the hand ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop);
    const k = await DA(page, async MOD => {
      const THREE = await import('three');
      const HM = await import(MOD + 'hands-model.js'), HP = await import(MOD + 'hand-poses.js'), WA = await import(MOD + 'weapon-anim.js');
      const out = {};
      // anatomy
      const h = __DA3.view.vm.hands;
      out.fingers = HM.FINGERS.slice(); out.digits = Object.keys(h.tips.right);
      out.segs = Object.fromEntries([...HM.FINGERS, 'thumb'].map(f => [f, h.tips.right[f].length - 1]));
      out.stats = h.stats();
      out.lengths = Object.fromEntries(HM.FINGERS.map(f => [f, [0, 1, 2].reduce((s, i) => s + HM.fingerLength(f, i), 0)]));
      // every reload key pose exists
      out.missing = WA.LEFT_KEYS.map(k => k[1]).filter(n => !HP.POSES[n]);
      // scan the timeline (step 0.0025 = 3.25 ms): penetration, holds vs transitions, magazine / spare continuity
      const buf = HP.makePoseBuffer(), rb = HP.makePoseBuffer();
      const V = () => new THREE.Vector3();
      const o2 = { mag: V(), spare: V(), charging: V() };
      const holds = new Set(['leftGuard', 'leftMagHold', 'leftSpareHold', 'leftMagSlap', 'leftCharge']);
      let maxHold = { d: -1 }, maxTrans = { d: -1 }, maxRight = { d: -1 }, magJump = 0, spareJump = 0, prevMag = null, prevSpare = null;
      const palmToMag = [], palmToSpare = [], palmToCharging = [];
      const magProxy = HP.PROXIES.find(p => p.name === 'mag'), spareProxy = HP.PROXIES.find(p => p.name === 'spare'), chProxy = HP.PROXIES.find(p => p.name === 'charging');
      const palm = V(), H = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1), cm = [0, 1, 2].map(() => new THREE.Matrix4()), cp = [0, 1, 2, 3].map(V);
      const palmOf = (pose) => { H.compose(pose.pos, pose.quat, ONE); return palm.set(0, HM.PALM_LEN * 0.5, 0).applyMatrix4(H); };
      for (let i = -4; i <= 400; i++) {
        const r = i < 0 ? -1 : i / 400, tl = WA.reloadTimeline(r);
        o2.mag.set(tl.mag.x, tl.mag.y, tl.mag.z); o2.spare.set(tl.spare.x, tl.spare.y, tl.spare.z); o2.charging.set(0, 0, tl.charging);
        const offs = { mag: tl.mag.visible && (r < 0.36 || r >= 0.62) ? o2.mag : null, spare: tl.spare.visible ? o2.spare : null, charging: o2.charging };
        HP.blendPoses(HP.POSES[tl.left.a], HP.POSES[tl.left.b], tl.left.t, o2, buf);
        HP.blendPoses(HP.POSES.rightGrip, HP.POSES.rightIndexOff, tl.rightIndexOff, o2, rb);
        const L = HP.measurePenetration(buf, -1, offs), R = HP.measurePenetration(rb, 1, offs);
        const isHold = tl.left.a === tl.left.b ? holds.has(tl.left.a) : (tl.left.t < 0.01 && holds.has(tl.left.a)) || (tl.left.t > 0.99 && holds.has(tl.left.b));
        const rec = { d: L.depth, r, part: L.part, proxy: L.proxy, keys: tl.left.a + '>' + tl.left.b };
        if (isHold) { if (L.depth > maxHold.d) maxHold = rec; } else if (L.depth > maxTrans.d) maxTrans = rec;
        if (R.depth > maxRight.d) maxRight = { d: R.depth, r, part: R.part, proxy: R.proxy };
        // magazine in the hand
        if (r >= 0.23 && r <= 0.35) palmToMag.push(HP.proxyDistance(palmOf(buf), magProxy, { mag: o2.mag }));
        if (r >= 0.47 && r <= 0.61) palmToSpare.push(HP.proxyDistance(palmOf(buf), spareProxy, { spare: o2.spare }));
        if (r >= 0.79 && r <= 0.86) { H.compose(buf.pos, buf.quat, ONE); palmToCharging.push(Math.min(...['index'].map(f => { HM.fingerChain(H, -1, f, buf.f[f], buf.spread[HM.FINGERS.indexOf(f)], cm, cp); return Math.min(...[2, 3].map(j => HP.proxyDistance(cp[j], chProxy, { charging: o2.charging }))) - HM.fingerRadius(f, 2); }))); }
        // continuity (no teleport) while visible
        if (tl.mag.visible && prevMag && prevMag.v) magJump = Math.max(magJump, Math.hypot(tl.mag.x - prevMag.x, tl.mag.y - prevMag.y, tl.mag.z - prevMag.z));
        if (tl.spare.visible && prevSpare && prevSpare.v) spareJump = Math.max(spareJump, Math.hypot(tl.spare.x - prevSpare.x, tl.spare.y - prevSpare.y, tl.spare.z - prevSpare.z));
        prevMag = { ...tl.mag, v: tl.mag.visible }; prevSpare = { ...tl.spare, v: tl.spare.visible };
      }
      // swap: the spare's last visible position equals the real mag's first position after the swap
      const a = JSON.parse(JSON.stringify(WA.reloadTimeline(0.6199))), b = JSON.parse(JSON.stringify(WA.reloadTimeline(0.62)));
      out.swap = { spare: [a.spare.x, a.spare.y, a.spare.z], mag: [b.mag.x, b.mag.y, b.mag.z], spareVisible: a.spare.visible, magVisible: b.mag.visible };
      out.maxHold = maxHold; out.maxTrans = maxTrans; out.maxRight = maxRight; out.magJump = magJump; out.spareJump = spareJump;
      out.palmToMag = Math.max(...palmToMag); out.palmToSpare = Math.max(...palmToSpare); out.palmToCharging = Math.max(...palmToCharging);
      // right grip contacts: index tip on the trigger, fingers wrapped round the grip
      HP.blendPoses(HP.POSES.rightGrip, HP.POSES.rightGrip, 0, o2, rb);
      H.compose(rb.pos, rb.quat, ONE); const mats = Array.from({ length: 3 }, () => new THREE.Matrix4()), pts = Array.from({ length: 4 }, V);
      HM.fingerChain(H, 1, 'index', rb.f.index, rb.spread[0], mats, pts);
      out.triggerDist = pts[3].distanceTo(new THREE.Vector3(...HP.TRIGGER_POINT));
      const gripProxy = HP.PROXIES.find(p => p.name === 'grip');
      const q = V(); // closest point of each finger to the grip surface (sampled along all three phalanges)
      out.gripTips = ['middle', 'ring', 'pinky'].map(f => { HM.fingerChain(H, 1, f, rb.f[f], rb.spread[HM.FINGERS.indexOf(f)], mats, pts); let m = Infinity; for (let sg = 0; sg < 3; sg++) for (let k = 0; k <= 8; k++) m = Math.min(m, HP.proxyDistance(q.lerpVectors(pts[sg], pts[sg + 1], k / 8), gripProxy, null) - HM.fingerRadius(f, sg)); return m; });
      // left support hand touches the handguard (finger pads within a few mm of its surface)
      HP.blendPoses(HP.POSES.leftGuard, HP.POSES.leftGuard, 0, o2, buf); H.compose(buf.pos, buf.quat, ONE);
      const hg = HP.PROXIES.find(p => p.name === 'handguard');
      out.guardTips = HM.FINGERS.map(f => { HM.fingerChain(H, -1, f, buf.f[f], buf.spread[HM.FINGERS.indexOf(f)], mats, pts); return Math.min(...[1, 2, 3].map(j => HP.proxyDistance(pts[j], hg, null))) - HM.fingerRadius(f, 2); });
      // live rig = same kinematics (hands.tips are produced by fingerChain from the pose buffer)
      __DA3.view.vm.forceReload = -1; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const live = __DA3.view.vm.handPoses.right; H.compose(live.pos, live.quat, ONE);
      HM.fingerChain(H, 1, 'index', live.f.index, live.spread[0], mats, pts);
      out.liveTipErr = pts[3].distanceTo(h.tips.right.index[3]);
      __DA3.view.vm.forceReload = null;
      return out;
    }, MOD);
    check('Anatomy: 4 fingers + thumb per hand, 3 phalanges each (15 per hand), 2 hands', k.fingers.join() === 'index,middle,ring,pinky' && k.digits.length === 5 && Object.values(k.segs).every(n => n === 3) && k.stats.instances.fingers === 34, JSON.stringify({ segs: k.segs, inst: k.stats.instances }));
    check('Anatomy: middle finger longest, little finger shortest, index ≈ ring (±5 mm)', k.lengths.middle > Math.max(k.lengths.index, k.lengths.ring) && k.lengths.pinky < Math.min(k.lengths.index, k.lengths.ring) && Math.abs(k.lengths.index - k.lengths.ring) <= 0.005, JSON.stringify(k.lengths));
    check('Every reload keyframe pose exists', !k.missing.length, k.missing.join());
    check('Right hand never enters the weapon (whole reload, 3 ms steps)', k.maxRight.d <= 0.0015, `${(k.maxRight.d * 1000).toFixed(1)} mm ${k.maxRight.part}/${k.maxRight.proxy}`);
    check('Left hand at grips (handguard, magazine, slap, charging handle): ≤ 2 mm', k.maxHold.d <= 0.002, `${(k.maxHold.d * 1000).toFixed(1)} mm at r=${k.maxHold.r} ${k.maxHold.part}/${k.maxHold.proxy} ${k.maxHold.keys}`);
    check('Left hand between grips: ≤ 3 mm (proxy tolerance), no pass-through', k.maxTrans.d <= 0.003, `${(k.maxTrans.d * 1000).toFixed(1)} mm at r=${k.maxTrans.r} ${k.maxTrans.part}/${k.maxTrans.proxy} ${k.maxTrans.keys}`);
    check('Old magazine stays in the palm while pulled out (palm ≤ 30 mm from it)', k.palmToMag <= 0.03, `${(k.palmToMag * 1000).toFixed(1)} mm`);
    check('New magazine stays in the palm until inserted', k.palmToSpare <= 0.03, `${(k.palmToSpare * 1000).toFixed(1)} mm`);
    check('Index finger hooked on the charging handle while pulling it (≤ 5 mm)', k.palmToCharging <= 0.005, `${(k.palmToCharging * 1000).toFixed(1)} mm`);
    check('Magazines never teleport (≤ 3 cm per 3 ms while visible)', k.magJump <= 0.03 && k.spareJump <= 0.03, `mag ${(k.magJump * 1000).toFixed(1)} mm, spare ${(k.spareJump * 1000).toFixed(1)} mm`);
    check('Swap is seamless: new mag hands over to the real mag at the same spot', k.swap.spareVisible && k.swap.magVisible && k.swap.spare.every((v, i) => Math.abs(v - k.swap.mag[i]) < 0.003), JSON.stringify(k.swap));
    check('Right index fingertip on the trigger (≤ 6 mm)', k.triggerDist <= 0.006, `${(k.triggerDist * 1000).toFixed(1)} mm`);
    check('Right middle/ring/little fingers wrap the grip (contact within 4 mm)', k.gripTips.every(d => d <= 0.004 && d >= -0.002), k.gripTips.map(d => (d * 1000).toFixed(1)).join(' / ') + ' mm');
    check('Left fingers touch the handguard (≤ 4 mm)', k.guardTips.filter(d => d <= 0.004 && d >= -0.002).length >= 3, k.guardTips.map(d => (d * 1000).toFixed(1)).join(' / ') + ' mm');
    check('Live rig uses the same kinematics as the solver', k.liveTipErr < 1e-4, `${(k.liveTipErr * 1e6).toFixed(1)} µm`);
    check('No JS errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. In game (desktop): visibility, budget, hip framing, ADS, firing ----------
  {
    const { ctx, page, errors } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0)); await sleep(400);
    const on = await DA(page, () => ({ vm: __DA3.view.infoVM, hs: __DA3.view.vm.hands.stats(), vis: __DA3.view.vm.hands.group.visible }));
    const fpsOn = await DA(page, () => new Promise(res => { const t0 = performance.now(); let n = 0; const f = () => (++n >= 60 ? res((performance.now() - t0) / 60) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await DA(page, () => __DA3.view.vm.hands.setVisible(false)); await frames(page, 3);
    const off = await DA(page, () => __DA3.view.infoVM);
    const fpsOff = await DA(page, () => new Promise(res => { const t0 = performance.now(); let n = 0; const f = () => (++n >= 60 ? res((performance.now() - t0) / 60) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await DA(page, () => __DA3.view.vm.hands.setVisible(true)); await frames(page, 3);
    check('Hands visible in game with no JS errors', on.vis && !errors.length, errors.join(' | '));
    check('Hands cost: +7 draw calls (instanced), ≤ 14k triangles', on.vm.calls - off.calls === on.hs.drawCalls && on.hs.drawCalls === 7 && on.hs.triangles <= 14000, `VM ${off.calls}→${on.vm.calls} calls, ${off.triangles}→${on.vm.triangles} tris`);
    console.log(`      info: software-Chromium frame time ${fpsOff.toFixed(1)} → ${fpsOn.toFixed(1)} ms (not iPhone performance)`);
    const hip = await DA(page, () => { const pts = __DA3.view.vm.handScreenPoints(); const vis = p => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      return { left: pts.filter(p => p.side === 'left' && vis(p)).length, centre: Math.min(...pts.filter(vis).map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) }; });
    check('Hip: left hand on screen, no hand point in the central ±15% box', hip.left >= 5 && hip.centre > 0.15, JSON.stringify(hip));
    await shoot(page, 'm14_desktop_hip.png');
    // breathing: the rig moves slightly at rest (and nothing else drives it)
    const b1 = await DA(page, () => __DA3.vm.rig.y); await sleep(500); const b2 = await DA(page, () => __DA3.vm.rig.y);
    check('Idle breathing moves the weapon rig slightly (< 3 mm)', Math.abs(b1 - b2) > 1e-5 && Math.abs(b1 - b2) < 0.003, `${((b2 - b1) * 1000).toFixed(2)} mm`);
    // ADS
    await DA(page, () => { __DA3.input.aimHeld = true; }); await ticks(page, 30); await sleep(100);
    const a = await DA(page, () => { const s = __DA3.view.vm.projectAnchor('sight'); const pts = __DA3.view.vm.handScreenPoints();
      return { sx: s.x, sy: s.y, centre: Math.min(...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) }; });
    check('ADS: red dot at the screen centre (< 1%) with hands on the weapon', Math.abs(a.sx) < 0.01 && Math.abs(a.sy) < 0.01, `ndc (${a.sx.toFixed(4)}, ${a.sy.toFixed(4)})`);
    check('ADS: hands do not cover the reticle (no hand point within ±12% of centre)', a.centre > 0.12, `nearest ${a.centre.toFixed(3)}`);
    await shoot(page, 'm14_desktop_ads.png');
    await DA(page, () => { __DA3.input.aimHeld = false; }); await ticks(page, 20);
    // single shot: index squeezes the trigger, then returns
    const idx0 = await DA(page, () => __DA3.view.vm.handPoses.right.f.index[1]);
    await DA(page, () => { window.__pull = 0; window.__poll = true; const f = () => { window.__pull = Math.max(window.__pull, __DA3.view.vm.handPoses.right.f.index[1]); if (window.__poll) requestAnimationFrame(f); }; f(); __DA3.input.setAction('fire', true); });
    await ticks(page, 2); await DA(page, () => __DA3.input.setAction('fire', false)); await ticks(page, 20); await DA(page, () => { window.__poll = false; });
    const idx = await DA(page, () => ({ pull: window.__pull, after: __DA3.view.vm.handPoses.right.f.index[1] }));
    check('Single shot: index finger squeezes the trigger and returns', idx.pull > idx0 + 0.02 && Math.abs(idx.after - idx0) < 1e-6, `${idx0.toFixed(3)} → ${idx.pull.toFixed(3)} → ${idx.after.toFixed(3)}`);
    // automatic fire: hands stay on the weapon (they are children of it) and the grip pose does not drift
    await DA(page, () => { __DA3.gs.setAmmo(30, 120); __DA3.input.setAction('fire', true); });
    const drift = await DA(page, () => new Promise(res => { const h = __DA3.view.vm.hands; const p0 = h.palmCenter.left.toArray(), t0 = h.tips.right.index[3].toArray(); let n = 0, dp = 0, dt = 0;
      const f = () => { const p = h.palmCenter.left.toArray(), t = h.tips.right.index[3].toArray();
        dp = Math.max(dp, Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2])); dt = Math.max(dt, Math.hypot(t[0] - t0[0], t[1] - t0[1], t[2] - t0[2]));
        (++n > 25 || __DA3.gs.weapon.mag < 8 ? res({ dp, dt, n, mag: __DA3.gs.weapon.mag }) : requestAnimationFrame(f)); }; f(); }));
    await shoot(page, 'm14_desktop_fire.png');
    const mag = drift.mag;
    await DA(page, () => __DA3.input.setAction('fire', false));
    // the hands are children of the weapon: in weapon space the left palm must not move at all,
    // the right index only by the trigger squeeze (≤ 12 mm at the tip)
    check('Auto fire: left hand stays on the handguard, right index stays on the trigger', drift.dp < 0.0005 && drift.dt < 0.012 && drift.n >= 3 && mag < 30, `${drift.n} frames, left ${(drift.dp * 1000).toFixed(2)} mm, index tip ${(drift.dt * 1000).toFixed(1)} mm, mag ${mag}`);
    await ctx.close();
  }

  // ---------- 3. Reload in real time; pause and focus loss mid-reload; GameState untouched ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0));
    await DA(page, () => { __DA3.gs.setAmmo(10, 120); window.__t0 = __DA3.game.tick; __DA3.weapon.startReload(); });
    // sample the live left pose at reload marks (the hands follow the sim's reload progress)
    const marks = await DA(page, () => new Promise(res => { const seen = {}; const f = () => { const w = __DA3.gs.weapon; if (w.reloading) { const r = w.reloadProgress, k = Math.floor(r * 10); if (!(k in seen)) seen[k] = { r: +r.toFixed(3), mag: __DA3.vm.mag.visible, ch: __DA3.view.vm.model.parts.charging.position.z }; requestAnimationFrame(f); } else res({ seen, ticks: __DA3.game.tick - window.__t0 }); }; f(); }));
    await ticks(page, 2);
    const done = await DA(page, () => ({ mag: __DA3.gs.weapon.mag, res: __DA3.gs.weapon.reserve, left: __DA3.view.vm.handPoses.left.pos.toArray() }));
    const guard = await DA(page, async MOD => (await import(MOD + 'hand-poses.js')).POSES.leftGuard.pos.toArray(), MOD);
    check('Reload timing unchanged: 1.3 s (78 ticks), 30 / 100 after', Math.abs(marks.ticks - 78) <= 2 && done.mag === 30 && done.res === 100, `${marks.ticks} ticks, ${done.mag}/${done.res}`);
    check('Hands animate through the reload (magazine out, back in)', Object.values(marks.seen).some(s => !s.mag) && Object.keys(marks.seen).length >= 6, JSON.stringify(marks.seen));
    check('After reload the left hand is back on the handguard', done.left.every((v, i) => Math.abs(v - guard[i]) < 1e-4), JSON.stringify(done.left));
    // pause mid reload: progress and pose freeze, then the reload finishes normally
    await DA(page, () => { __DA3.gs.setAmmo(5, 100); __DA3.weapon.startReload(); }); await ticks(page, 35);
    await page.keyboard.press('Escape'); await sleep(100);
    const p1 = await DA(page, () => ({ st: __DA3.state, r: __DA3.gs.weapon.reloadProgress, left: __DA3.view.vm.handPoses.left.pos.toArray() }));
    await sleep(400);
    const p2 = await DA(page, () => ({ r: __DA3.gs.weapon.reloadProgress, left: __DA3.view.vm.handPoses.left.pos.toArray() }));
    await shoot(page, 'm14_desktop_reload_paused.png');
    check('Pause mid-reload: reload progress and hand pose frozen', p1.st === 'paused' && p1.r === p2.r && p1.left.every((v, i) => v === p2.left[i]), `r ${p1.r.toFixed(3)} → ${p2.r.toFixed(3)}`);
    await DA(page, () => __DA3.show('play')); await ticks(page, 60);
    check('Resume: reload completes, 30 rounds', await DA(page, () => !__DA3.gs.weapon.reloading && __DA3.gs.weapon.mag === 30));
    // focus loss mid reload
    await DA(page, () => { __DA3.gs.setAmmo(5, 100); __DA3.weapon.startReload(); }); await ticks(page, 20);
    await DA(page, () => { dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); __DA3.show('paused'); }); await sleep(250);
    const fz = await DA(page, () => ({ r: __DA3.gs.weapon.reloadProgress, reloading: __DA3.gs.weapon.reloading }));
    await DA(page, () => __DA3.show('play')); await ticks(page, 70);
    const fz2 = await DA(page, () => ({ reloading: __DA3.gs.weapon.reloading, mag: __DA3.gs.weapon.mag, left: __DA3.view.vm.handPoses.left.pos.toArray() }));
    check('Focus loss mid-reload: animation resumes and finishes with hands back on the weapon', fz.reloading && !fz2.reloading && fz2.mag === 30 && fz2.left.every((v, i) => Math.abs(v - guard[i]) < 1e-4), JSON.stringify({ fz, mag: fz2.mag }));
    // the viewmodel never writes gameplay state
    const gsKeys = await DA(page, () => { const before = JSON.stringify(__DA3.gs.weapon); __DA3.view.vm.forceReload = 0.5; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { const after = JSON.stringify(__DA3.gs.weapon); __DA3.view.vm.forceReload = null; r(before === after); }))); });
    check('Hands / animation never write GameState', gsKeys);
    // screenshots of the reload stages (frozen with the debug hook)
    if (SHOTS) for (const r of [0.04, 0.19, 0.30, 0.45, 0.55, 0.66, 0.83, 0.97]) {
      await DA(page, r => { __DA3.view.vm.forceReload = r; }, r); await frames(page, 4);
      await shoot(page, `m14_reload_${String(r).replace('.', '_')}.png`);
    }
    await DA(page, () => { __DA3.view.vm.forceReload = null; });
    await ctx.close();
  }

  // ---------- 4. Skins with hands; dispose ----------
  {
    const { ctx, page } = await open(browser, base, desktop);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0));
    const s0 = await DA(page, () => ({ mats: Object.values(__DA3.view.vm.hands.mats).map(m => m.uuid).join(), def: JSON.stringify(__DA3.game.weapon.def) }));
    const per = {};
    for (const id of ['obsidian', 'bloodline', 'neon_ghost']) {
      await DA(page, id => __DA3.setSkin(id), id); await frames(page, 4);
      per[id] = await DA(page, () => ({ vis: __DA3.view.vm.hands.group.visible, mats: Object.values(__DA3.view.vm.hands.mats).map(m => m.uuid).join(), def: JSON.stringify(__DA3.game.weapon.def), parent: __DA3.view.vm.hands.group.parent === __DA3.view.vm.model.group }));
      await shoot(page, `m14_skin_${id}.png`);
    }
    check('All three skins work with the hands (hands unchanged, still attached)', Object.values(per).every(p => p.vis && p.parent && p.mats === s0.mats));
    check('Skins never change weapon stats (with hands)', Object.values(per).every(p => p.def === s0.def));
    const disp = await DA(page, async MOD => {
      const HM = await import(MOD + 'hands-model.js'); const h = HM.createHands(); let n = 0;
      for (const m of Object.values(h.meshes)) m.geometry.addEventListener('dispose', () => n++);
      for (const m of Object.values(h.mats)) m.addEventListener('dispose', () => n++);
      const total = Object.keys(h.meshes).length + Object.keys(h.mats).length; h.dispose(); return { n, total };
    }, MOD);
    check('Hands dispose their geometries and materials', disp.n >= disp.total, JSON.stringify(disp));
    await ctx.close();
  }

  // ---------- 5. iPhone (emulated landscape): hip and ADS ----------
  {
    const { ctx, page, errors } = await open(browser, base, iphone);
    await DA(page, () => __DA3.setPlayer(4.5, 8, 0)); await sleep(400);
    const hip = await DA(page, () => { const pts = __DA3.view.vm.handScreenPoints(); const vis = p => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      return { left: pts.filter(p => p.side === 'left' && vis(p)).length, centre: Math.min(...pts.filter(vis).map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) }; });
    check('Phone hip: hands on screen, centre clear', hip.left >= 5 && hip.centre > 0.15 && !errors.length, JSON.stringify(hip));
    await shoot(page, 'm14_phone_hip.png');
    await DA(page, () => { __DA3.input.aimToggle = true; __DA3.input.aimHeld = true; }); await ticks(page, 30); await sleep(100);
    const a = await DA(page, () => { const s = __DA3.view.vm.projectAnchor('sight'); const pts = __DA3.view.vm.handScreenPoints(); return { sx: s.x, sy: s.y, centre: Math.min(...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) }; });
    check('Phone ADS: red dot centred (< 1%), hands clear of the reticle', Math.abs(a.sx) < 0.01 && Math.abs(a.sy) < 0.01 && a.centre > 0.12, JSON.stringify(a));
    await shoot(page, 'm14_phone_ads.png');
    await ctx.close();
  }

  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'm14-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
