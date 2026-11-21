// Run with `node --test` from the repository root (Node 18+, no packages).
// Dressed dolls in high resolution (round 3 pilot, dist/worn.js, dist/worn-data.js, art/build_worn.py):
// the art and masks on disk at the size the data says, the registration of the new base to the old one,
// every pilot outfit resolving in all four views behind the flag, and the old path when art is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const read = name => readFileSync(new URL(name, dist), 'utf8');
const VIEWS = ['front', 'left', 'right', 'back'];
const PILOT = ['tennis-dress', 'denim-jacket-skirt', 'crochet-cover-up'];

function wornData() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('worn-data.js') + '\nthis.WORN_DATA=WORN_DATA;', ctx);
  return ctx.WORN_DATA;
}
/* Width and height of a WebP file (VP8X, VP8L or VP8 header). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)] }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}
/* worn.js with the renderer it calls stubbed: `fail` makes every picture fail to load. */
function loadWorn({ search = '?worn=1', fail = false } = {}) {
  const lru = () => { const m = new Map(); return { get: k => m.get(k), set: (k, v) => (m.set(k, v), v), clear: () => m.clear() } };
  const ctx = {
    location: { search }, console: { warn() {} },
    lruCache: lru, dollCaches: { doll: lru(), body: lru() },
    memo: (c, k, make) => { let p = c.get(k); if (!p) { p = Promise.resolve().then(make); c.set(k, p) } return p },
    asset: src => fail ? Promise.reject(new Error('missing ' + src)) : Promise.resolve({ naturalWidth: 2, naturalHeight: 2 }),
    catalogItem: id => ({ id, tints: [], fit: { adult: Object.fromEntries(VIEWS.map(v => [v, { clip: {} }])) } }),
    dollView: () => ({ origin: [100, 145], art: 'x' }), bodyKey: (s, v) => s.outfit + '|' + v,
    spriteCanvas: () => Promise.resolve({ width: 397 }), shoeLayers: () => Promise.resolve(null),
    hairLayers: () => Promise.resolve({ back: null, front: null }), spriteItemLayer: () => Promise.resolve(null), clipSprite: () => Promise.resolve(null)
  };
  vm.createContext(ctx);
  vm.runInContext(read('worn-data.js') + read('worn.js') + '\nthis.Worn=Worn;', ctx);
  return ctx.Worn;
}

test('the pilot art is on disk at the size worn-data.js gives, with a garment mask, for all four views', () => {
  const D = wornData();
  assert.equal(D.scale, 2);
  assert.deepEqual(Object.keys(D.adult).sort(), [...PILOT].sort());
  for (const id of PILOT) for (const view of VIEWS) {
    const e = D.adult[id][view];
    assert.ok(e, `${id} ${view}`);
    for (const f of [e.src, e.mask]) assert.ok(existsSync(new URL(f, dist)), f);
    const [w, h] = webpSize(readFileSync(new URL(e.src, dist)));
    assert.deepEqual([w, h], [e.size[0] * D.scale, e.size[1] * D.scale], `${id} ${view} picture size`);
    assert.deepEqual(webpSize(readFileSync(new URL(e.mask, dist))), [...e.size], `${id} ${view} mask size`);
    // the picture covers the old base doll (397 x 873 front and back, about 182 wide from the side)
    assert.ok(e.at[1] <= 8 && e.at[1] + e.size[1] >= 865, `${id} ${view} head to feet`);
  }
});

test('the delivered sources are kept losslessly in art/source/round3', () => {
  for (const view of VIEWS) {
    assert.ok(existsSync(new URL(`art/source/round3/base-adult-${view}.webp`, root)), `base ${view}`);
    for (const id of PILOT) assert.ok(existsSync(new URL(`art/source/round3/worn-adult-${id}-${view}.webp`, root)), `${id} ${view}`);
  }
});

test('the new base registers to the old one: one scale, and every region within half a doll pixel', () => {
  const reg = wornData().reg.adult;
  for (const view of VIEWS) {
    const r = reg[view];
    assert.ok(r.a > 3.1 && r.a < 3.3, `${view} scale ${r.a}`);
    assert.ok(Math.abs(r.regions.headScale - 1) < .01, `${view} head scale ${r.regions.headScale}`);
    for (const [name, m] of Object.entries(r.regions)) {
      if (name === 'headScale') continue;
      assert.ok(Math.hypot(...m.shift) <= .5, `${view} ${name} shift ${m.shift}`);
      assert.ok(m.edge < 1.5, `${view} ${name} edge ${m.edge}`);
    }
  }
});

test('behind ?worn=1 the pilot outfits resolve in every view; without it, and for other outfits, the old path', () => {
  const on = loadWorn(), off = loadWorn({ search: '' });
  for (const id of PILOT) for (const view of VIEWS) {
    assert.ok(on.use({ doll: 'adult', outfit: id }, view), `${id} ${view}`);
    assert.equal(off.use({ doll: 'adult', outfit: id }, view), null);
  }
  assert.equal(on.portraitScale({ doll: 'adult', outfit: 'tennis-dress' }), 2);
  assert.equal(on.portraitScale({ doll: 'adult', outfit: 'hibiscus-flares' }), 1);
  assert.equal(on.portraitScale({ doll: 'little', outfit: 'tennis-dress' }), 1);
  assert.equal(off.portraitScale({ doll: 'adult', outfit: 'tennis-dress' }), 1);
  assert.equal(on.use({ doll: 'adult', outfit: 'hibiscus-flares' }, 'front'), null);
  assert.equal(on.use({ doll: 'little', outfit: 'tennis-dress' }, 'front'), null);
});

test('when the worn picture cannot load, that outfit and view go back to the old path (never a bald doll)', async () => {
  const W = loadWorn({ fail: true });
  const shot = { doll: 'adult', outfit: 'tennis-dress', hair: 'long-waves', shoes: 'none', necklace: 'none', earrings: 'none', clip: 'none' };
  assert.equal(await W.ops(shot, 'front'), null, 'ops falls back');
  assert.equal(W.use(shot, 'front'), null, 'and remembers it');
  assert.ok(W.use(shot, 'left'), 'other views still try');
});

test('the renderer asks worn.js first, composes at 2x for it, and the pages load it after portrait.js', () => {
  const p = read('portrait.js');
  assert.match(p, /async function dollOps\(shot,view\)\{\n  if\(typeof Worn!=='undefined'\)\{const w=await Worn\.ops\(shot,view\);if\(w\)return w\}/);
  assert.match(p, /function composeDoll\(raw,view='front',scale=1\)/);
  assert.match(p, /Worn\.portraitScale\(shot\)/);
  for (const page of ['dist/index.html', 'art/lab.html', 'art/puppet-lab.html']) {
    const html = readFileSync(new URL(page, root), 'utf8');
    const i = html.indexOf('portrait.js'), d = html.indexOf('worn-data.js'), w = html.indexOf('worn.js"');
    assert.ok(i > 0 && d > i && w > d, `${page} loads worn-data.js and worn.js after portrait.js`);
  }
  // the pilot never touches the save
  assert.doesNotMatch(read('worn.js'), /localStorage|hibiscus-club-v1/);
});
