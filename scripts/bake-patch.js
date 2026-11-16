// M3.2: rasterise the Kazakhstan flag shoulder patch (prototype-3d/assets/models/hero/kz_patch.svg, own drawing made by
// scripts/make-kz-patch.py) into kz_patch.webp (RGBA, 512 px wide) for the hero's material. Run after changing the SVG:
//   node scripts/bake-patch.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const DIR = path.join(__dirname, '..', 'prototype-3d', 'assets', 'models', 'hero');
(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'kz_patch.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = await page.evaluate(async svg => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await img.decode();
    const w = 512, h = Math.round(512 * img.naturalHeight / img.naturalWidth), c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', 0.92);
  }, svg);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(DIR, 'kz_patch.webp'), buf);
  console.log('kz_patch.webp', (buf.length / 1024).toFixed(1) + ' KB');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
