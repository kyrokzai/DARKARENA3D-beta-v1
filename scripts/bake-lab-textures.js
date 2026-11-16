// M3.2: bake the modular OUTPOST ZERO floor / wall PBR maps (tileable, seeded → deterministic) into
// prototype-3d/assets/models/lab/textures/<name>_{albedo,normal,orm}.webp. Run after changing tools/bake-lab-textures.html:
//   node scripts/bake-lab-textures.js
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'prototype-3d', 'assets', 'models', 'lab', 'textures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

(async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/prototype-3d/tools/bake-lab-textures.html`);
  await page.waitForFunction(() => window.__ready);
  const maps = await page.evaluate(() => window.__bake());
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [name, set] of Object.entries(maps)) for (const [kind, url] of Object.entries(set)) {
    const buf = Buffer.from(url.split(',')[1], 'base64'), file = path.join(OUT, `${name}_${kind}.webp`);
    fs.writeFileSync(file, buf); total += buf.length; console.log(path.relative(ROOT, file), (buf.length / 1024).toFixed(0) + ' KB');
  }
  console.log('total', (total / 1024).toFixed(0) + ' KB');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
