// Dev script (M1.8): bake the infected PBR maps in headless Chromium and write them to prototype-3d/assets/infected/.
// Usage (repo root): node scripts/bake-infected.js [variant …]   — needs Playwright (as the browser tests).
// The game itself never runs this; it only loads the JPEGs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { serve } = require('../tests/lib/harness');
(async () => {
  const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['guard', 'technician', 'worker'];
  const out = path.join(__dirname, '..', 'prototype-3d', 'assets', 'infected'); fs.mkdirSync(out, { recursive: true });
  const srv = await serve(); const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/prototype-3d/tools/bake-infected.html`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
  for (const v of variants) for (const part of ['skin', 'rags']) {
    const t0 = Date.now();
    const r = await p.evaluate(([v, part]) => window.__bake(v, part), [v, part]);
    for (const [k, url] of [['color', r.color], ['nr', r.nr]]) fs.writeFileSync(path.join(out, `${v}_${part}_${k}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${v} ${part}: ${r.size}² coverage ${(r.coverage * 100).toFixed(1)} % in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
