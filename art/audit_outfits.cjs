#!/usr/bin/env node
/* Outfit audit: renders art/lab.html?sheet=audit for every outfit of both dolls (two variants each: a
   long hairstyle with bare feet on a dark background, a short one with shoes and a necklace on a light
   one) and saves each sheet as a PNG: the four views at 1x and fixed crops at 2.5x of the neck, the
   shoulders, the cuffs and hands, the waist, the crotch and the hem in every view.

   Usage (from the repo root, Playwright installed):
     node art/audit_outfits.cjs OUTDIR [ids=a,b] [doll=adult|little] [variant=a|b]
*/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || 'audit-out');
const params = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root)) { res.writeHead(404).end(); return; }
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  const dolls = params.doll ? [params.doll] : ['adult', 'little'];
  for (const doll of dolls) {
    await page.goto(`http://127.0.0.1:${port}/art/lab.html?sheet=one&doll=${doll}`);
    const ids = params.ids ? params.ids.split(',') : await page.evaluate(d => catalogOptions('outfit', d).map(i => i.id), doll);
    for (const id of ids) {
      if (!(await page.evaluate(([d, i]) => catalogOptions('outfit', d).some(o => o.id === i), [doll, id]))) continue;
      const q = new URLSearchParams({ sheet: 'audit', doll, ids: id, variant: params.variant || 'a,b', ...(params.tint ? { tint: params.tint } : {}) });
      await page.goto(`http://127.0.0.1:${port}/art/lab.html?${q}`);
      await page.waitForFunction(() => window.labDone, null, { timeout: 120000 });
      const sheets = await page.evaluate(() => [...document.querySelectorAll('canvas[data-name]')].map(c => [c.dataset.name, c.toDataURL('image/png')]));
      for (const [name, url] of sheets) fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      console.log(doll, id, sheets.length);
    }
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
