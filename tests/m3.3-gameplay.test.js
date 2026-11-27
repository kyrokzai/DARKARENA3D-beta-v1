// M3.3 TOPDOWN GAMEPLAY — browser test (iPhone landscape emulation): endless waves in the HUD, score + combo from
// GameState, the score pill does not overlap other HUD panels, drops rendered (instanced, no extra lights) and
// collected with a toast, run summary on death (points, waves held, accuracy, combo, record), record in the menu
// profile and kept after a reload. Screenshots → docs/m3.3/.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve, makeChecker, sleep } = require('./lib/harness');

const SHOTS = path.join(__dirname, '..', 'docs', 'm3.3');
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const waitMs = (page, ms) => page.evaluate(ms => new Promise(r => setTimeout(r, ms)), ms);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const { check, results } = makeChecker();
  try {
    const ctx = await browser.newContext(PHONE), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/prototype-3d/topdown.html?debug=1&gfx=balanced');
    await page.evaluate(() => { try { localStorage.removeItem('darkarena.topdown.v1'); } catch (_) {} });
    await page.reload();
    await page.waitForFunction(() => window.__DA3TD && !document.getElementById('playBtn').disabled, null, { timeout: 120000 });
    await sleep(1200);
    check('Version M3.3', await page.evaluate(() => window.__DA3TD.VERSION === 'M3.3 TOPDOWN'));
    check('Menu profile: no record yet', (await page.textContent('#profileStat')) === 'Рекорд: —');
    await page.click('#playBtn'); await sleep(2200);

    // ---------- game options + HUD ----------
    const opts = await page.evaluate(() => { const g = window.__DA3TD.game; return { scoring: g.scoring, drops: !!g.pickups, endless: !!g.waves.endless, wave: document.getElementById('tdWave').textContent, score: document.getElementById('tdScore').textContent }; });
    check('Top-down game: scoring, drops and endless waves on', opts.scoring && opts.drops && opts.endless, JSON.stringify(opts));
    check('HUD: "Волна 1" (endless, no /3) and score 0', opts.wave === 'Волна 1' && opts.score === '0', `${opts.wave} · ${opts.score}`);
    const overlap = await page.evaluate(() => {
      const r = id => document.getElementById(id) ? document.getElementById(id).getBoundingClientRect() : null;
      const box = s => document.querySelector(s).getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const sc = r('tdScoreBox'), others = ['.hProfile', '.hTask', '.hWave', '#btnPause'].map(box);
      return { any: others.some(o => hit(sc, o)), inView: sc.left >= 0 && sc.right <= innerWidth && sc.top >= 0, w: Math.round(sc.width) };
    });
    check('Score pill: inside the screen, overlaps no other HUD panel (844 × 390)', !overlap.any && overlap.inView, JSON.stringify(overlap));

    // ---------- score + combo ----------
    const sc = await page.evaluate(async () => {
      const g = window.__DA3TD.game, p = g.player; p.invuln = 1e9;
      g.pickups.rng = () => 0.05; // every kill drops (walker: medkit at 0.05)
      const kill = (type, dx, dy, how) => { const e = g.spawnInfected(type, p.x + dx, p.y + dy, 0); e.applyDamage(1e6, how.headshot ? 'head' : 'chest', { dir: { x: 1, y: 0 } }); g.onEntityKilled(e, how); };
      kill('walker', 1.4, 0.6, {}); kill('walker', 1.9, 0.6, { headshot: true }); kill('mutant', 2.4, 0.6, {});
      await new Promise(r => setTimeout(r, 900));
      return { points: g.state.score.points, combo: g.state.score.combo, txt: document.getElementById('tdScore').textContent, comboOn: document.getElementById('tdCombo').classList.contains('on'),
        comboTxt: document.getElementById('tdComboX').textContent, items: g.pickups.list.length };
    });
    const expect = 100 + Math.round(150 * 1.25) + Math.round(200 * 1.5);
    check('Score: 100 + 188 (headshot ×1.25) + 300 (mutant ×1.5) = 588, shown in the HUD', sc.points === expect && sc.txt === String(expect), `${sc.points} / "${sc.txt}"`);
    check('Combo 3 shown with its multiplier', sc.comboOn && sc.combo === 3 && sc.comboTxt === '×1,5 · КОМБО 3', sc.comboTxt);
    check('Three kills → three drops on the floor', sc.items === 3);
    await page.screenshot({ path: path.join(SHOTS, 'hud_combo_drops.png') });

    // ---------- drops: render + collect ----------
    const rv = await page.evaluate(async () => {
      const T = window.__DA3TD, v = T.view.pickups, scene = T.view.scene;
      await new Promise(r => setTimeout(r, 300));
      let inst = 0, vis = 0; scene.traverse(o => { if (o.isInstancedMesh && o.parent === scene && o.count > 0 && o.visible) { inst++; vis += o.count; } });
      let lights = 0; scene.traverse(o => { if (o.isPointLight) lights++; });
      return { inst, vis, lights };
    });
    check('Drops drawn as instanced meshes (≤ 5 extra draw calls), no new lights (4 pooled point lights)', rv.inst >= 3 && rv.lights <= 4, JSON.stringify(rv));
    const col = await page.evaluate(async () => {
      const g = window.__DA3TD.game, p = g.player, st = g.state;
      st.damage(40); const hp0 = st.health.hp; const it = g.pickups.list.find(i => i.kind === 'medkit');
      const toasts = []; g.on('pickup', e => toasts.push(e));
      p.x = it.x; p.y = it.y; await new Promise(r => setTimeout(r, 1000));
      return { hp0, hp: st.health.hp, toasts, toast: document.getElementById('tdToast').textContent, shown: document.getElementById('tdToast').classList.contains('show') || toasts.length > 0 };
    });
    check('Walking over a medkit heals (+25 per kit, max 100) and shows a toast', col.hp > col.hp0 && col.toasts[0] && col.toasts[0].kind === 'medkit' && /^\+\d+ HP$/.test(col.toast), `${col.hp0} → ${col.hp} · "${col.toast}"`);
    await page.screenshot({ path: path.join(SHOTS, 'pickup_toast.png') });

    // ---------- endless: wave 4+ ----------
    const wv = await page.evaluate(async () => {
      const g = window.__DA3TD.game; g.player.invuln = 1e9;
      for (let i = 0; i < 6000 && g.state.wave.number < 5; i++) { g.player.invuln = 1e9; for (const e of [...g.enemies]) if (e.alive) { e.applyDamage(1e6, 'chest', { dir: { x: 1, y: 0 } }); g.onEntityKilled(e, {}); } await new Promise(r => setTimeout(r, 4)); }
      await new Promise(r => setTimeout(r, 600));
      return { n: g.state.wave.number, txt: document.getElementById('tdWave').textContent, over: g.matchOver, state: window.__DA3TD.state, tasks: [...document.querySelectorAll('#tdTasks li')].map(l => l.textContent) };
    });
    check('After wave 3 the run continues (wave 5, no victory screen)', wv.n === 5 && wv.txt === 'Волна 5' && !wv.over && wv.state === 'play', JSON.stringify({ n: wv.n, txt: wv.txt, state: wv.state }));
    check('Objectives: brutes / mutants over all waves so far (M3.2 never showed them) + "Продержаться"', wv.tasks.some(t => t.startsWith('Уничтожить громил')) && wv.tasks.some(t => t.startsWith('Уничтожить мутантов')), wv.tasks.join(' | '));

    // ---------- death → summary ----------
    await page.evaluate(() => { const g = window.__DA3TD.game; g.player.invuln = 0; g.damagePlayer(1000); });
    await page.waitForFunction(() => window.__DA3TD.state === 'dead', null, { timeout: 20000 });
    await sleep(400);
    const sum = await page.evaluate(() => { const s = window.__DA3TD.game.state; return { pts: document.getElementById('sumPoints').textContent, points: s.score.points, rec: !document.getElementById('sumRecord').classList.contains('hidden'),
      lead: document.getElementById('deadLead').textContent, cells: [...document.querySelectorAll('#sumGrid div')].map(d => d.querySelector('dt').textContent + '=' + d.querySelector('dd').textContent),
      panel: (() => { const r = document.querySelector('#dead .panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }; });
    check('Summary: points = GameState score (formatted), new record', sum.pts === sum.points.toLocaleString('ru-RU').replace(/ /g, ' ') && sum.rec, `${sum.pts}`);
    check('Summary: waves held (4) and the wave of death (5)', sum.lead === 'Застава держалась 4 волны. Погибли на волне 5.', sum.lead);
    check('Summary: wave, kills, time, accuracy, best combo, headshots', sum.cells.length === 6 && sum.cells[0] === 'Волна=5' && sum.cells.some(c => c.startsWith('Точность=')) && sum.cells.some(c => c.startsWith('Лучшее комбо=')), sum.cells.join(' '));
    check('Summary panel fits the phone screen (390 px high)', sum.panel);
    await page.screenshot({ path: path.join(SHOTS, 'summary.png') });

    // ---------- record persists ----------
    await page.click('#dead [data-to-menu]'); await sleep(600);
    const prof = await page.textContent('#profileStat');
    check('Menu profile shows the record (points · wave)', prof === `Рекорд: ${sum.pts} · волна 5`, prof);
    await page.reload();
    await page.waitForFunction(() => window.__DA3TD && !document.getElementById('playBtn').disabled, null, { timeout: 120000 });
    check('Record kept after a reload (localStorage)', (await page.textContent('#profileStat')) === prof);
    // a worse run does not replace it
    await page.click('#playBtn'); await sleep(1500);
    await page.evaluate(() => { const g = window.__DA3TD.game, p = g.player; const e = g.spawnInfected('walker', p.x + 2, p.y, 0); e.applyDamage(1e6, 'chest', { dir: { x: 1, y: 0 } }); g.onEntityKilled(e, {}); p.invuln = 0; g.damagePlayer(1000); });
    await page.waitForFunction(() => window.__DA3TD.state === 'dead', null, { timeout: 20000 });
    const worse = await page.evaluate(() => ({ rec: !document.getElementById('sumRecord').classList.contains('hidden'), stat: document.getElementById('deadStat').textContent }));
    check('A worse run: no "new record", the record is shown instead', !worse.rec && worse.stat === `Рекорд: ${sum.pts} · волна 5`, worse.stat);
    // restart clears score / drops
    await page.click('#againBtn'); await sleep(900);
    const rs = await page.evaluate(() => { const g = window.__DA3TD.game; return { pts: g.state.score.points, items: g.pickups.list.length, txt: document.getElementById('tdScore').textContent, wave: g.state.wave.number }; });
    check('ЗАНОВО: score 0, floor empty, wave 1', rs.pts === 0 && rs.items === 0 && rs.txt === '0' && rs.wave === 1, JSON.stringify(rs));
    check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check('test ran without exceptions', false, e.stack); }
  await browser.close(); srv.close();
  const passed = results.filter(r => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
