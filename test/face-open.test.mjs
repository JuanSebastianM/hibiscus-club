// Run with `node --test` from the repository root. Faces stay open: for every hairstyle on its doll
// (front view, as composeDollLayers draws it), the hair in front of the face leaves the face region
// (CATALOG.faceOpen: brows, outer eye corners, cheekbones, jaw, chin) uncovered, and the eyes fully;
// and no background shows between her cheek, ear and jaw and the hair of a style that covers the ears.
// Renders art/lab.html?sheet=faceopen in headless Chromium; skipped where Playwright is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
// fringes may cover the brows (the region starts at them), never the eyes
const OPEN_FLOOR = 0.95, EYES_FLOOR = 0.97;

test('every hairstyle leaves her face open in the front view', { skip: !chromium && 'playwright not installed', timeout: 300000 }, async () => {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(root, path);
      if (!file.startsWith(root)) throw new Error('outside');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
    } catch { res.writeHead(404).end() }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/art/lab.html?sheet=faceopen&tiles=0`);
    await page.waitForFunction(() => window.labDone, null, { timeout: 280000 });
    const rows = await page.evaluate(() => window.faceOpen);
    assert.equal(rows.length, 18, 'nine styles per doll');
    for (const r of rows) {
      assert.ok(r.open >= OPEN_FLOOR, `${r.doll} ${r.hair}: ${(r.open * 100).toFixed(1)}% of the face uncovered`);
      assert.ok(r.eyes >= EYES_FLOOR, `${r.doll} ${r.hair}: ${(r.eyes * 100).toFixed(1)}% of the eyes uncovered`);
      // no pale band between cheek/ear/jaw and hair: where the style covers the ears the hair meets her
      // skin (at most a stray px); where the ears show, only loose strands may hang clear of the face
      const maxHalo = r.earsCovered ? 0.05 : 2.5;
      // the temple, hairline to the top of the ear: hair meets skin on every style
      assert.ok(r.temple <= 0.02, `${r.doll} ${r.hair}: ${r.temple.toFixed(2)} px of background at the temple per row`);
      assert.ok(r.halo <= maxHalo, `${r.doll} ${r.hair}: ${r.halo.toFixed(2)} px of background between face and hair per row`);
    }
  } finally { await browser.close(); server.close() }
});
