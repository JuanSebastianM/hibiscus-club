// Run with `node --test` from the repository root (Node 18+, no packages).
// Dressed dolls in high resolution (round 3, dist/worn.js, dist/worn-data.js, art/build_worn.py): the art,
// masks and no-arm side views on disk at the size the data says, the registration of each doll's new base
// to the old one, the approved outfits on by default in all four views (?worn=0 turns them off, ?worn=1
// shows every worn picture), and the old path when art is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const read = name => readFileSync(new URL(name, dist), 'utf8');
const VIEWS = ['front', 'left', 'right', 'back'];
// block C2: bodies redrawn by the image model, fitted to the base at import (art/build_worn.py REDRAWN)
const REDRAWN = ['aqua-velour-tracksuit', 'baby-tee-cargo', 'black-flares-set', 'butterfly-satin-skirt', 'green-hibiscus-sundress',
  'lilac-satin-bow-dress', 'pink-velour-cargo', 'sarong-swimsuit', 'sequin-halter-dress', 'tankini-board-shorts',
  'puffer-vest-slip-dress', 'plaid-knit-vest-set', 'hoodie-dress-leg-warmers', 'denim-overall-dress'];
// block C3: their no-arm deliveries are not used (the puppet rebuilds the garment behind the arm)
const NOARM_UNUSED = ['puffer-vest-slip-dress', 'plaid-knit-vest-set', 'hoodie-dress-leg-warmers'];
// worn art there but not on by default (the puppet's side walk is not clean yet)
const NOT_DEFAULT = [];
const PILOT = ['tennis-dress', 'denim-jacket-skirt', 'crochet-cover-up', 'hibiscus-flares', ...REDRAWN];
// Little Me: the two Gemini outfits taken (the GPT base reduced to 512 x 1024, shipped at 1 px per doll px)
const LITTLE = ['ballet-wrap-set', 'beach-poncho', 'bear-onesie', 'denim-overalls', 'dino-romper', 'lilac-cord-pinafore',
  'mint-cardigan-dress', 'pink-gingham-bow-dress', 'rainbow-tutu-tee', 'raincoat-set', 'rash-guard-set', 'ruffle-swimsuit',
  'star-pajamas', 'tulle-party-dress', 'yellow-dot-dress'];
// Little Me outfits with worn art that stay on the old path by default (none)
const LITTLE_NOT_DEFAULT = [];
const OUTFITS = { adult: PILOT, little: LITTLE };
const HEIGHT = { adult: 873, little: 863 };

/* Every Grown-up outfit in the catalog (items written inline and the generated pack entries). */
function CATALOG_ADULT_OUTFITS(doll = 'adult') {
  const c = read('catalog.js'), ids = new Set();
  for (const m of c.matchAll(new RegExp(`\\{id:'([a-z-]+)',category:'outfit',dolls:\\['${doll}'\\]`, 'g'))) ids.add(m[1]);
  for (const m of c.matchAll(new RegExp(`"([a-z-]+)":\\{"cat":"outfits-${doll}"`, 'g'))) ids.add(m[1]);
  return [...ids];
}
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
function loadWorn({ search = '', fail = false } = {}) {
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

test('the worn art is on disk at the size worn-data.js gives, with a garment mask, for all four views', () => {
  const D = wornData();
  assert.equal(D.scale, 2);
  for (const doll of ['adult', 'little']) {
  assert.deepEqual(Object.keys(D[doll]).sort(), [...OUTFITS[doll]].sort());
  for (const id of OUTFITS[doll]) for (const view of VIEWS) {
    const e = D[doll][id][view], k = e.k || D.scale;
    assert.ok(e, `${id} ${view}`);
    for (const f of [e.src, e.mask]) assert.ok(existsSync(new URL(f, dist)), f);
    if (doll === 'adult' && (view === 'left' || view === 'right')) {
      if (NOARM_UNUSED.includes(id)) assert.ok(!e.noarm, `${id} ${view} no no-arm file`);
      else {
      assert.ok(e.noarm && existsSync(new URL(e.noarm, dist)), `${id} ${view} no-arm garment`);
      assert.deepEqual(webpSize(readFileSync(new URL(e.noarm, dist))), [...e.size], `${id} ${view} no-arm size`);
      }
      if (e.sleeve) assert.deepEqual(webpSize(readFileSync(new URL(e.sleeve, dist))), [e.size[0] * k, e.size[1] * k], `${id} ${view} sleeve size`);
    }
    const [w, h] = webpSize(readFileSync(new URL(e.src, dist)));
    assert.deepEqual([w, h], [e.size[0] * k, e.size[1] * k], `${id} ${view} picture size`);
    assert.deepEqual(webpSize(readFileSync(new URL(e.mask, dist))), [...e.size], `${id} ${view} mask size`);
    // the picture covers the old base doll (397 x 873 front and back, about 182 wide from the side)
    assert.ok(e.at[1] <= 8 && e.at[1] + e.size[1] >= HEIGHT[doll] - 10, `${id} ${view} head to feet`);
    assert.ok(existsSync(new URL(D.thumbs[doll][id], dist)), `${id} card picture`);
  }
  }
});

test('the delivered sources are kept losslessly in art/source/round3', () => {
  for (const view of VIEWS) {
    for (const doll of ['adult', 'little']) assert.ok(existsSync(new URL(`art/source/round3/base-${doll}-${view}.webp`, root)), `base ${doll} ${view}`);
    for (const id of PILOT) assert.ok(existsSync(new URL(`art/source/round3/worn-adult-${id}-${view}.webp`, root)), `${id} ${view}`);
  }
  for (const id of PILOT) for (const view of ['left', 'right'])
    assert.ok(existsSync(new URL(`art/source/round3/worn-adult-${id}-${view}-noarm.webp`, root)), `${id} ${view} noarm`);
});

test('the default outfit (hibiscus flares) is worn with its sleeve layers, and floor-length trousers go over the shoes', () => {
  const e = wornData().adult['hibiscus-flares'];
  for (const view of ['left', 'right']) assert.ok(e[view].sleeve, `${view} sleeve layer`);
  const w = read('worn.js');
  assert.match(w, /function hemLayer\(/);
  assert.match(w, /if\(shoes\)put\('shoesFront',shoes\.front\);\n    \/\/ floor-length trousers: the hem over the shoes/);
  assert.match(readFileSync(new URL('art/build_worn.py', root), 'utf8'), /MIRROR = \{\("adult", "hibiscus-flares"\): \{"right": "left"\}\}/);
});

test('the redrawn bodies are fitted to the base at import: warp, head and hands from the base, one colour in every view', () => {
  const py = readFileSync(new URL('art/build_worn.py', root), 'utf8');
  for (const id of REDRAWN) assert.ok(py.includes(`"${id}"`), `${id} in REDRAWN`);
  assert.match(py, /def fit_redrawn\(/);
  assert.match(py, /def restore_from_base\(/);
  assert.match(py, /MATCH_COLOUR = \{\("adult", "sequin-halter-dress"\): "front",/);
  // sleeves cut from the fitted view, so the swinging sleeve is the still picture's fabric
  assert.match(py, /def sleeve_from_fitted\(/);
  const D = wornData().adult;
  for (const id of ['aqua-velour-tracksuit', 'black-flares-set', 'pink-velour-cargo', 'lilac-satin-bow-dress', 'butterfly-satin-skirt', 'baby-tee-cargo'])
    for (const view of ['left', 'right']) assert.ok(D[id][view].sleeve, `${id} ${view} sleeve layer`);
});

test('the garment behind the resting arms is rebuilt for the puppet, and puppet.js keeps it with the garment', () => {
  const w = read('worn.js'), p = read('puppet.js');
  assert.match(w, /function armFootprint\(/);
  assert.match(w, /function fillUnderArms\(/);
  assert.match(w, /out\[1\]\.fill=fill/);
  // puppet.js: no inpainting over it, its pixels never go with the arm, the rebuilt skirt lies under the arms
  assert.match(p, /inpaintUnder\(d,L\.fill\?/);
  assert.match(p, /if\(L\.fill\)for\(let i=0;i<lb\.length;i\+\+\)if\(L\.fill\[i\]/);
  assert.match(p, /groups\.skirtUnder/);
});

test('each doll\'s new base registers to her old one: one scale, and every region within half a doll pixel', () => {
  for (const doll of ['adult', 'little']) for (const view of VIEWS) {
    const r = wornData().reg[doll][view];
    assert.ok(r.a > 3.1 && r.a < 3.3, `${doll} ${view} scale ${r.a}`);
    assert.ok(Math.abs(r.regions.headScale - 1) < .01, `${view} head scale ${r.regions.headScale}`);
    for (const [name, m] of Object.entries(r.regions)) {
      if (name === 'headScale') continue;
      assert.ok(Math.hypot(...m.shift) <= .5, `${view} ${name} shift ${m.shift}`);
      assert.ok(m.edge < 1.5, `${view} ${name} edge ${m.edge}`);
    }
  }
});

test('the approved outfits are worn by default in every view; ?worn=0 is the old path; other outfits the old path', () => {
  const on = loadWorn(), off = loadWorn({ search: '?worn=0' }), all = loadWorn({ search: '?worn=1' });
  for (const id of PILOT) for (const view of VIEWS) assert.ok(all.use({ doll: 'adult', outfit: id }, view), `?worn=1 ${id} ${view}`);
  for (const id of PILOT) for (const view of VIEWS) {
    if (NOT_DEFAULT.includes(id)) { assert.equal(on.use({ doll: 'adult', outfit: id }, view), null, `${id} ${view} flat by default`); continue }
    assert.ok(on.use({ doll: 'adult', outfit: id }, view), `${id} ${view}`);
    assert.equal(off.use({ doll: 'adult', outfit: id }, view), null);
  }
  assert.equal(on.portraitScale({ doll: 'adult', outfit: 'tennis-dress' }), 2);
  
  assert.equal(on.portraitScale({ doll: 'little', outfit: 'tennis-dress' }), 1);
  assert.equal(off.portraitScale({ doll: 'adult', outfit: 'tennis-dress' }), 1);
  for (const id of CATALOG_ADULT_OUTFITS().filter(id => !NOT_DEFAULT.includes(id))) assert.ok(on.use({ doll: 'adult', outfit: id }, 'front'), `every Grown-up outfit is worn: ${id}`);
  assert.equal(on.use({ doll: 'little', outfit: 'tennis-dress' }, 'front'), null);
  for (const id of LITTLE) for (const view of VIEWS) assert.ok(on.use({ doll: 'little', outfit: id }, view), `little ${id} ${view}`);
  assert.equal(on.portraitScale({ doll: 'little', outfit: 'dino-romper' }), 2, 'Little Me at 2x too');
  const little = CATALOG_ADULT_OUTFITS('little');
  assert.equal(little.length, 15);
  for (const id of little.filter(id => !LITTLE_NOT_DEFAULT.includes(id))) assert.ok(on.use({ doll: 'little', outfit: id }, 'front'), `every Little Me outfit is worn: ${id}`);
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
