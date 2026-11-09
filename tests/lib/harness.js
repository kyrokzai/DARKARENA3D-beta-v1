// Shared helpers for prototype browser tests: static server, page opening, checks, touch via CDP.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(p.endsWith('/') ? p + 'index.html' : p, (err, data) => {
        if (err) { rsp.writeHead(404); return rsp.end(); }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p) || '.html'] || 'application/octet-stream' });
        rsp.end(data);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

function makeChecker() {
  const results = [];
  const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
  return { results, check };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, base, contextOpts, { play = true, init = null, ctx: existing = null, path = '/prototype-3d/?debug=1' } = {}) {
  const ctx = existing || await browser.newContext(contextOpts);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + path);
  await page.waitForFunction(() => window.__DA3, null, { timeout: 15000 });
  if (play) { await page.evaluate(() => document.getElementById('playBtn').click()); await sleep(150); }
  return { ctx, page, errors, cdp };
}

/** CDP touch helper: points = [{x, y, id}] — the full list of fingers currently on the screen. */
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

module.exports = { serve, makeChecker, sleep, open, touch, ROOT };
