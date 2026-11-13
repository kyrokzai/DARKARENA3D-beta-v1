// M2.0 touch HUD ergonomics in the browser (Chromium iPhone emulation): node tests/m2.0-hud-ergonomics.test.js
// Not a coordinate check — real fingers (CDP touch events) on the game layer:
//  A. move + look + fire at the same time (3 fingers) on iPhone 11 / SE / 14 Pro Max, two HUD sizes;
//  B. the left thumb: floating-stick starts all over the movement thumb area and full-throw drags never switch a
//     weapon or toggle the flashlight, at HUD sizes 0.7 / 1 / 1.4;
//  C. the flashlight button: taps with an imprecise finger (8 directions around the centre) always toggle the light
//     and never change the weapon; each slot selects its own weapon;
//  D. the HUD editor: move + resize the new elements, save, reload — kept, still clean, still working by touch;
//  E. pause / settings menus open while the HUD size is changed 0.7…1.4: no overlap, nothing above the menus.
// Chromium emulation ≠ iOS Safari (no real thumbs, no Safari gesture heuristics) — final check on a real iPhone.
const { chromium, devices } = require('playwright');
const { serve, makeChecker, sleep, open, touch } = require('./lib/harness');

const DA = (page, fn, arg) => page.evaluate(fn, arg);
const notch = (page, l, r, b) => DA(page, ([l, r, b]) => { const s = document.documentElement.style; s.setProperty('--sa-left', l + 'px'); s.setProperty('--sa-right', r + 'px'); s.setProperty('--sa-bottom', b + 'px'); __DA3.hud.layoutNow(); }, [l, r, b]);
const setS = (page, o) => DA(page, o => { Object.assign(__DA3.settings, o); __DA3.hud.layoutNow(); }, o);
const rectOf = (page, id) => DA(page, id => { const r = document.querySelector('.hud-' + id).getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, id);
const game = page => DA(page, () => { const g = __DA3.game, p = g.player; return { x: p.x, y: p.y, yaw: p.yaw, weapon: g.arsenal.activeId, switching: g.arsenal.switching, light: g.state.flashlight, mag: g.state.weapon.mag, switches: g.arsenal.switches || 0 }; });
const reset = page => DA(page, () => { const g = __DA3.game; for (const e of [...g.enemies]) g.removeInfected(e); g.waves.reset && g.waves.reset(); __DA3.setPlayer(8, 8, 0, 0); __DA3.gs.setHealth(100); });
/** DOM audit: overlaps (rect-aware), out of the safe area, the pause button. */
const audit = page => DA(page, () => {
  const sa = __DA3.screen.safe, W = innerWidth, H = innerHeight, out = { overlap: [], oob: [] };
  const els = [...document.querySelectorAll('.hud-el')].filter(e => getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden'));
  const rs = els.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.hud, circle: !e.classList.contains('hud-panel') && !e.classList.contains('slots'), l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: r.width }; });
  const pb = document.getElementById('pauseBtn').getBoundingClientRect();
  rs.push({ id: 'pause', circle: false, l: pb.left, t: pb.top, r: pb.right, b: pb.bottom });
  for (const r of rs) if (r.l < sa.left - 0.5 || r.t < sa.top - 0.5 || r.r > W - sa.right + 0.5 || r.b > H - sa.bottom + 0.5) out.oob.push(r.id);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.circle && b.circle ? Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.s + b.s) / 2 : a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) out.overlap.push(a.id + '/' + b.id);
  }
  return out;
});
const SCREENS = [['iPhone 11', 'iPhone 11 landscape', 896, 414, 48, 48, 21], ['iPhone SE', 'iPhone SE landscape', 667, 375, 0, 0, 0], ['iPhone 14 Pro Max', 'iPhone 14 Pro Max landscape', 932, 430, 59, 59, 21], ['iPhone 11 + Safari bars', 'iPhone 11 landscape', 896, 330, 48, 48, 21]];

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const { check, results } = makeChecker();
  const errorsAll = [];

  for (const [name, dev, W, H, l, r, b] of SCREENS) {
    const { ctx, page, cdp, errors } = await open(browser, base, devices[dev]);
    await page.setViewportSize({ width: W, height: H }); await notch(page, l, r, b); await sleep(60);
    const sa = await DA(page, () => __DA3.screen.safe), sw = W - sa.left - sa.right, sh = H - sa.top - sa.bottom;

    // ---------- A. move + look + fire simultaneously ----------
    for (const hudScale of [1, 1.4]) {
      await setS(page, { hudScale, lookMode: 'touchpad' }); await reset(page); await sleep(60);
      const fire = await rectOf(page, 'fire');
      const mv = { x: sa.left + sw * 0.16, y: sa.top + sh * 0.74 }, lk = { x: sa.left + sw * 0.58, y: sa.top + sh * 0.30 };
      const g0 = await game(page);
      await touch(cdp, 'touchStart', [{ ...mv, id: 1 }]);
      await touch(cdp, 'touchStart', [{ ...mv, id: 1 }, { ...lk, id: 2 }]);
      await touch(cdp, 'touchStart', [{ ...mv, id: 1 }, { ...lk, id: 2 }, { x: fire.cx, y: fire.cy, id: 3 }]);
      for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', [{ x: mv.x + 6 * i, y: mv.y - 5 * i, id: 1 }, { x: lk.x + 9 * i, y: lk.y, id: 2 }, { x: fire.cx, y: fire.cy, id: 3 }]); await sleep(40); }
      const roles = await DA(page, () => __DA3.touch.roles.slice().sort());
      await sleep(250);
      const g1 = await game(page);
      await touch(cdp, 'touchEnd', []); await sleep(80);
      const moved = Math.hypot(g1.x - g0.x, g1.y - g0.y), turned = Math.abs(g1.yaw - g0.yaw);
      check(`A ${name} ×${hudScale}: move + look + fire at once (3 fingers, 3 roles; walked, turned, fired; weapon unchanged)`,
        roles.join() === ['btn:fire', 'look', 'move'].sort().join() && moved > 0.05 && turned > 0.05 && g1.mag < g0.mag && g1.weapon === g0.weapon && g1.light === g0.light,
        `roles ${roles}, moved ${moved.toFixed(2)}, turned ${turned.toFixed(2)}, mag ${g0.mag}→${g1.mag}, ${g0.weapon}→${g1.weapon}`);
      await DA(page, () => __DA3.gs.setAmmo(30, 120));
    }

    // ---------- B. left thumb over the whole movement area, three HUD sizes ----------
    for (const hudScale of [0.7, 1, 1.4]) {
      await setS(page, { hudScale, lookMode: 'touchpad' }); await reset(page); await sleep(60);
      const g0 = await game(page);
      let starts = 0, notMove = [];
      for (let ix = 0; ix < 6; ix++) for (let iy = 0; iy < 4; iy++) {
        const p = { x: sa.left + sw * (0.03 + ix * 0.066), y: sa.top + sh * (0.47 + iy * 0.15) };
        await touch(cdp, 'touchStart', [{ ...p, id: 7 }]);
        const role = await DA(page, () => __DA3.touch.roles.join());
        if (role !== 'move') notMove.push(`(${p.x.toFixed(0)},${p.y.toFixed(0)})→${role || 'none'}`);
        // full throw in the worst direction (up-right, towards the slots / flashlight) and back
        for (const k of [0.5, 1, 1.6]) await touch(cdp, 'touchMove', [{ x: p.x + 70 * k, y: p.y - 70 * k, id: 7 }]);
        await touch(cdp, 'touchEnd', []); starts++;
      }
      await sleep(500);
      const g1 = await game(page);
      check(`B ${name} ×${hudScale}: ${starts} thumb landings in the movement area all start the stick; drags over the HUD never switch weapons or toggle the light`,
        !notMove.length && g1.weapon === g0.weapon && !g1.switching && g1.light === g0.light, notMove.slice(0, 4).join(' ') + ` ${g0.weapon}→${g1.weapon} light ${g0.light}→${g1.light}`);
    }

    // ---------- C. flashlight button with an imprecise finger; slots select their own weapon ----------
    for (const hudScale of [0.7, 1, 1.4]) {
      await setS(page, { hudScale }); await reset(page); await sleep(60);
      const L = await rectOf(page, 'light'), S = await rectOf(page, 'weapons');
      const gap = Math.max(S.l - L.r, L.l - S.r, S.t - L.b, L.t - S.b);
      let toggles = 0, bad = [];
      const w0 = (await game(page)).weapon;
      for (let k = 0; k < 9; k++) {
        const a = k * Math.PI / 4, rr = k === 8 ? 0 : L.w * 0.4;
        const p = { x: L.cx + Math.cos(a) * rr, y: L.cy + Math.sin(a) * rr };
        const before = (await game(page)).light;
        await touch(cdp, 'touchStart', [{ ...p, id: 5 }]); await sleep(40); await touch(cdp, 'touchEnd', []); await sleep(60);
        const g = await game(page);
        if (g.light !== before) toggles++; else bad.push(`(${p.x.toFixed(0)},${p.y.toFixed(0)}) no toggle`);
        if (g.weapon !== w0 || g.switching) bad.push('weapon changed');
      }
      check(`C ${name} ×${hudScale}: flashlight taps (centre + 8 off-centre) all toggle the light, never the weapon; slots ≥ 12 px away (${gap.toFixed(0)} px)`, toggles === 9 && !bad.length && gap >= 12, bad.slice(0, 3).join(' '));
      if (hudScale === 1) {
        const got = [];
        for (const i of [1, 2, 0]) {
          const x = S.l + S.w * (i + 0.5) / 3;
          await touch(cdp, 'touchStart', [{ x, y: S.cy, id: 6 }]); await sleep(40); await touch(cdp, 'touchEnd', []);
          await DA(page, () => new Promise(r => { const t0 = performance.now(); const f = () => (!__DA3.game.arsenal.switching || performance.now() - t0 > 3000 ? r() : setTimeout(f, 30)); f(); }));
          got.push((await game(page)).weapon);
        }
        check(`C ${name}: tapping slot 2 / 3 / 1 selects AK-47 / KRAIT / RAVEN`, got.join() === 'ak47,krait,raven', got.join());
      }
    }
    await setS(page, { hudScale: 1 });
    errorsAll.push(...errors.map(e => name + ': ' + e));
    await ctx.close();
  }

  // ---------- D. editor: move + resize the new elements, save, reload ----------
  {
    const ctx = await browser.newContext(devices['iPhone 11 landscape']);
    let { page, cdp } = await open(browser, base, null, { ctx });
    await notch(page, 48, 48, 21);
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseEditHud').click(); }); await sleep(150);
    const drag = async (from, to, id) => { await touch(cdp, 'touchStart', [{ ...from, id }]); for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8, id }]); await touch(cdp, 'touchEnd', []); await sleep(80); };
    const tb = () => DA(page, () => { const t = document.getElementById('editBar').getBoundingClientRect(); return [...document.querySelectorAll('.hud-el:not(.hidden)')].filter(e => getComputedStyle(e).display !== 'none').filter(e => { const r = e.getBoundingClientRect(); return r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom; }).map(e => e.dataset.hud); });
    const sa = await DA(page, () => ({ ...__DA3.screen.safe, W: innerWidth, H: innerHeight })), sw = sa.W - sa.left - sa.right, sh = sa.H - sa.top - sa.bottom;
    const at = (fx, fy) => ({ x: sa.left + sw * fx, y: sa.top + sh * fy });
    const barRows = () => DA(page, () => { const b = document.getElementById('editBar'); return { compact: b.classList.contains('compact'), h: b.getBoundingClientRect().height }; });
    const covered0 = await tb(), rows0 = await barRows();
    const S0 = await rectOf(page, 'weapons'), L0 = await rectOf(page, 'light');
    const sT = at(0.56, 0.62), lT = at(0.53, 0.35); // free spots on iPhone 11 (slots clear of the thumb area even at +10 %)
    await drag({ x: S0.cx, y: S0.cy }, sT, 1);
    await DA(page, () => document.querySelector('[data-ed=plus]').click()); await sleep(60);
    await drag({ x: L0.cx, y: L0.cy }, lT, 2);
    const S1 = await rectOf(page, 'weapons'), L1 = await rectOf(page, 'light');
    const a1 = await audit(page), covered1 = await tb(), rows1 = await barRows();
    check('D Editor: slots and flashlight can be dragged (slots also enlarged); the toolbar covers no control; compact form ≤ 2 rows', Math.abs(S1.cx - sT.x) < 3 && Math.abs(S1.cy - sT.y) < 3 && Math.abs(L1.cx - lT.x) < 3 && S1.w > S0.w && !a1.overlap.length && !covered0.some(id => !['wave', 'health', 'minimap', 'ammo'].includes(id)) && !covered1.some(id => !['wave', 'health', 'minimap', 'ammo'].includes(id)) && [rows0, rows1].every(r => !r.compact || r.h < 110), JSON.stringify({ S1, L1, overlap: a1.overlap, covered0, covered1, rows0, rows1 }));
    // the floating-stick thumb area: a button dragged into it slides along its edge (editor = what is played)
    const zone = at(0.25, 0.70);
    await drag({ x: L1.cx, y: L1.cy }, zone, 3);
    const Lz = await rectOf(page, 'light'), zx = sa.left + sw * 0.4, zy = sa.top + sh * 0.42;
    check('D Editor: a button dragged into the movement thumb area stays at its edge (not inside)', !(Lz.l < zx - 0.5 && Lz.b > zy + 0.5), JSON.stringify({ Lz, zx, zy }));
    await drag({ x: Lz.cx, y: Lz.cy }, lT, 4);
    const L1b = await rectOf(page, 'light');
    await DA(page, () => document.querySelector('[data-ed=done]').click()); await sleep(150);
    await page.reload(); await page.waitForFunction(() => window.__DA3); await DA(page, () => document.getElementById('playBtn').click()); await sleep(200); await notch(page, 48, 48, 21);
    const S2 = await rectOf(page, 'weapons'), L2 = await rectOf(page, 'light'), a2 = await audit(page);
    check('D After save + reload: new positions / size kept exactly as shown in the editor, layout clean', Math.abs(S2.cx - S1.cx) < 3 && Math.abs(S2.cy - S1.cy) < 3 && Math.abs(L2.cx - L1b.cx) < 3 && Math.abs(L2.cy - L1b.cy) < 3 && Math.abs(S2.w - S1.w) < 2 && !a2.overlap.length && !a2.oob.length, JSON.stringify({ S2, L2, L1b, a2 }));
    const l0 = (await game(page)).light;
    await touch(cdp, 'touchStart', [{ x: L2.cx, y: L2.cy, id: 3 }]); await sleep(40); await touch(cdp, 'touchEnd', []); await sleep(60);
    await touch(cdp, 'touchStart', [{ x: S2.l + S2.w * 2.5 / 3, y: S2.cy, id: 4 }]); await sleep(40); await touch(cdp, 'touchEnd', []); await sleep(1300);
    const g = await game(page);
    check('D Moved elements still work by touch (flashlight toggles, slot 3 → KRAIT)', g.light !== l0 && g.weapon === 'krait', JSON.stringify(g));
    // reset to the standard layout
    await DA(page, () => { document.getElementById('pauseBtn').click(); document.getElementById('pauseEditHud').click(); }); await sleep(150);
    await DA(page, () => { const b = document.querySelector('[data-ed=reset]'); b.click(); b.click(); document.querySelector('[data-ed=done]').click(); }); await sleep(150);
    await DA(page, () => { const r = document.getElementById('resumeBtn'); if (r && r.offsetParent) r.click(); }); await sleep(150);
    const S3 = await rectOf(page, 'weapons'), a3 = await audit(page);
    check('D Reset restores the standard layout (slots back in the top band), clean', S3.cy < 70 && !a3.overlap.length, JSON.stringify({ S3, a3 }));
    await ctx.close();
  }

  // ---------- E. menus open + HUD size changes ----------
  {
    const { ctx, page } = await open(browser, base, devices['iPhone 11 landscape']);
    await notch(page, 48, 48, 21);
    await DA(page, () => document.getElementById('pauseBtn').click()); await sleep(120);
    await DA(page, () => document.getElementById('pauseSettings').click()); await sleep(150);
    const fails = [];
    await DA(page, () => document.getElementById('pauseBtn').click()); await sleep(80); await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(80); // (first pause above)
    for (let s = 0.7; s <= 1.401; s += 0.1) {
      await DA(page, () => document.getElementById('pauseBtn').click()); await sleep(100);
      await DA(page, () => document.getElementById('pauseSettings').click()); await sleep(120);
      await DA(page, v => { const el = document.querySelector('input[type=range][data-key=hudScale]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, s.toFixed(2)); await sleep(60);
      // menus open: the menu is what the finger hits (the HUD never covers it)
      const top = await DA(page, () => { const panel = document.querySelector('#settings .panel').getBoundingClientRect(); const pts = [[panel.left + 20, panel.top + 20], [panel.left + panel.width / 2, panel.top + panel.height / 2], [panel.right - 20, panel.top + 30]]; return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#settings')); }).every(Boolean); });
      await DA(page, () => document.getElementById('settingsBack').click()); await sleep(100);
      const pauseTop = await DA(page, () => { const p = document.querySelector('#paused .panel').getBoundingClientRect(); const e = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); return !!(e && e.closest('#paused')); });
      await DA(page, () => document.getElementById('resumeBtn').click()); await sleep(150);
      // back in play at the new size: the HUD is clean (incl. the pause button) and the new controls respond
      const a = await audit(page), st = await DA(page, () => ({ playing: __DA3.state, scale: __DA3.settings.hudScale }));
      if (a.overlap.length || a.oob.length || !top || !pauseTop || Math.abs(st.scale - s) > 0.01) fails.push(`${s.toFixed(1)}: ${JSON.stringify(a)} settingsOnTop=${top} pauseOnTop=${pauseTop} ${JSON.stringify(st)}`);
    }
    check('E Settings → HUD size 0.7 → 1.4 (8 steps): menus stay above the HUD; back in play the HUD is clean at every size', !fails.length, fails.slice(0, 3).join(' | '));
    await ctx.close();
  }

  check('No page errors', !errorsAll.length, errorsAll.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
