// Run with `node --test` from the repository root (Node 18+, no packages).
// Wardrobe rules: per-doll hair lists, old looks falling back cleanly, the star-shop balance and
// saved ownership surviving price changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

function loadWardrobe() {
  const ctx = {
    location: { hostname: 'x' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null },
    window: { dispatchEvent() {} }, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] },
    setTimeout: fn => fn(), Intl, console
  };
  vm.createContext(ctx);
  // a style challenge naming one hairstyle for both characters, as game.js declares them
  vm.runInContext(read('i18n.js') + read('i18n-es.js') + read('hair-fit.js') + read('catalog.js') +
    'const briefs=[{key:"mall",need:{hair:"side-ponytail"}},{key:"bob",need:{hair:"curly-bob"}}];\nvar state={owned:[]};\n' + read('shop.js') +
    '\nthis.I18N=I18N;this.CATALOG=CATALOG;this.Shop=Shop;this.readLook=readLook;this.catalogOptions=catalogOptions;this.briefs=briefs;this.state=state;', ctx);
  return ctx;
}

const ADULT_HAIR = ['long-waves', 'side-ponytail', 'half-up-curls', 'sleek-curtain-bangs', 'flip-bob', 'long-braids',
  'high-bun-tendrils', 'space-buns', 'crimped-twists'];
const LITTLE_HAIR = ['ringlet-pigtails', 'curly-buns', 'curly-bob', 'tiny-pigtails', 'pixie-sweep', 'top-ponytail',
  'chin-bob-bangs', 'short-braids', 'wavy-crop'];

test('each doll has only her own hairstyles, each with art and a fit in all four views', () => {
  const { catalogOptions, CATALOG } = loadWardrobe();
  const listed = { adult: [...CATALOG.hairStyles.adult], little: [...CATALOG.hairStyles.little] };
  for (const doll of ['adult', 'little']) {
    const own = doll === 'adult' ? ADULT_HAIR : LITTLE_HAIR;
    assert.ok(listed[doll].every(id => own.includes(id)), `${doll} wears only her own set`);
    assert.deepEqual([...catalogOptions('hair', doll).map(i => i.id)], listed[doll]);
    for (const id of listed[doll]) {
      const it = CATALOG.items[id];
      for (const view of CATALOG.views) {
        assert.ok(it.art[view]?.main, `${id} ${view} art`);
        const f = it.fit[doll][view];
        assert.ok(f && [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 50, `${id} ${doll} ${view} fit`);
        assert.ok(f.clip && Number.isFinite(f.clip.x), `${id} ${doll} ${view} clip`);
      }
      assert.ok(Array.isArray(it.lum) && it.lum[1] > it.lum[0], `${id} luminance range`);
    }
  }
});

test('a saved look in a style the doll cannot wear falls back to her default hair', () => {
  const { readLook, CATALOG } = loadWardrobe();
  for (const [doll, other] of [['little', ADULT_HAIR], ['adult', LITTLE_HAIR]]) for (const hair of other) {
    const look = readLook({ hair, hairColor: 'honey', outfit: doll === 'little' ? 'denim-overalls' : 'black-flares-set' }, doll);
    assert.equal(look.hair, CATALOG.defaults[doll].hair, `${doll} ${hair}`);
    assert.equal(look.hairColor, 'honey');
  }
  // the six ids that were redrawn keep working for the doll that wears them
  for (const hair of ['long-waves', 'side-ponytail', 'half-up-curls']) assert.equal(readLook({ hair }, 'adult').hair, hair);
  for (const hair of ['ringlet-pigtails', 'curly-buns', 'curly-bob']) assert.equal(readLook({ hair }, 'little').hair, hair);
  assert.equal(CATALOG.defaults.adult.hair, 'long-waves');
  assert.equal(CATALOG.defaults.little.hair, 'ringlet-pigtails');
});

test('every hairstyle has an English and a Spanish name', () => {
  const ctx = loadWardrobe();
  for (const id of [...ADULT_HAIR, ...LITTLE_HAIR]) {
    const en = ctx.I18N.keys('en'), es = ctx.I18N.keys('es');
    assert.ok([...en].includes('catalog.item.' + id), `${id} en`);
    assert.ok([...es].includes('catalog.item.' + id), `${id} es`);
  }
});

test('every style challenge stays achievable by both characters', () => {
  const { briefs, catalogOptions, Shop } = loadWardrobe();
  for (const b of briefs) for (const doll of ['adult', 'little']) {
    const h = typeof b.need.hair === 'string' ? b.need.hair : b.need.hair[doll];
    assert.ok(catalogOptions('hair', doll).some(i => i.id === h), `${b.key} ${doll} ${h}`);
    assert.equal(Shop.price('item:' + h), 0, `${b.key} ${doll} ${h} is free`);
  }
});

test('about a quarter or less of each category costs stars', () => {
  const { CATALOG, Shop } = loadWardrobe();
  const share = keys => keys.filter(k => Shop.price(k) > 0).length / keys.length;
  // the shop's categories (jewelry = earrings and necklaces)
  for (const cats of [['outfit'], ['shoes'], ['hair'], ['earrings', 'necklace'], ['clip']])
    assert.ok(share(CATALOG.itemList.filter(i => cats.includes(i.category)).map(i => 'item:' + i.id)) <= 0.26, cats.join('+'));
  const tints = CATALOG.itemList.flatMap(i => i.tints.filter(t => t.id !== 'original').map(t => `tint:${i.id}:${t.id}`));
  assert.ok(share(tints) <= 0.26, 'colourways');
  assert.ok(share(CATALOG.hairColors.map(h => 'hair-color:' + h.id)) <= 0.3, 'hair colours');
  for (const [field, list] of Object.entries(CATALOG.makeup)) assert.ok(share(list.map(o => field + ':' + o.id)) <= 0.26, field);
});

test('bought keys of options that are free now stay owned; junk is dropped', () => {
  const { Shop } = loadWardrobe();
  const kept = Shop.readOwned(['item:curly-buns', 'tint:pink-velour-cargo:mint', 'lips:cherry', 'hair-color:strawberry',
    'item:butterfly-clip', 'item:nope', 'tint:gold-hoops:original', 'lips:nope', 42, 'item:curly-buns']);
  assert.deepEqual([...kept], ['item:curly-buns', 'tint:pink-velour-cargo:mint', 'lips:cherry', 'hair-color:strawberry', 'item:butterfly-clip']);
  assert.equal(Shop.owned('item:curly-buns'), true);
  assert.equal(Shop.owned('item:butterfly-clip'), false);
});

test('at most two hairstyles per character cost stars, and her default is free', () => {
  const { CATALOG, Shop } = loadWardrobe();
  for (const doll of ['adult', 'little']) {
    const paid = CATALOG.hairStyles[doll].filter(id => Shop.price('item:' + id) > 0);
    assert.ok(paid.length <= 2, `${doll}: ${paid}`);
    assert.equal(Shop.price('item:' + CATALOG.defaults[doll].hair), 0);
  }
});

// ----- the second wardrobe (art/fit_wear.py) -----
const NEW_OUTFITS = {
  adult: ['sarong-swimsuit', 'tankini-board-shorts', 'crochet-cover-up', 'aqua-velour-tracksuit', 'tennis-dress', 'baby-tee-cargo',
    'sequin-halter-dress', 'butterfly-satin-skirt', 'puffer-vest-slip-dress', 'plaid-knit-vest-set', 'hoodie-dress-leg-warmers', 'denim-overall-dress'],
  little: ['ruffle-swimsuit', 'rash-guard-set', 'beach-poncho', 'rainbow-tutu-tee', 'dino-romper', 'raincoat-set', 'tulle-party-dress',
    'bear-onesie', 'ballet-wrap-set']
};
const NEW_SHOES = {
  adult: ['jelly-sandals', 'flower-flip-flops', 'wedge-sandals', 'platform-boots', 'fuzzy-slippers', 'ribbon-ballet-flats'],
  little: ['toddler-sandals', 'jelly-shoes', 'bunny-slippers', 'light-up-sneakers', 'cowboy-boots', 'ballet-slippers']
};
const exists = p => { try { readFileSync(new URL(p, dist)); return true } catch { return false } };

test('every new outfit has art and a fit in all four views on its own doll only', () => {
  const { CATALOG, catalogOptions } = loadWardrobe();
  for (const [doll, ids] of Object.entries(NEW_OUTFITS)) for (const id of ids) {
    const it = CATALOG.items[id];
    assert.ok(it && it.category === 'outfit', id);
    assert.deepEqual([...it.dolls], [doll], `${id} is for ${doll} only`);
    assert.ok(catalogOptions('outfit', doll).includes(it), `${id} offered to ${doll}`);
    assert.ok(CATALOG.themes.includes(it.theme), `${id} theme`);
    assert.ok(exists(it.thumb), `${id} card picture`);
    for (const view of CATALOG.views) {
      const f = it.fit[doll][view];
      assert.ok(f && f.pieces.length, `${id} ${view} fit`);
      for (const p of f.pieces) {
        const src = p.part === 'main' ? it.art[view].main : it.art[view].parts[p.part];
        assert.ok(src && exists(src), `${id} ${view} ${p.part} sprite`);
        assert.ok(p.warp ? p.warp.every(r => r.length === 6 && r.every(Number.isFinite)) : [p.x, p.y, p.w].every(Number.isFinite), `${id} ${view} ${p.part} placement`);
      }
      assert.ok(f.skin?.length, `${id} ${view}: the bodysuit is repainted wherever the outfit lets it show`);
    }
  }
});

test('every new shoe has art and a fit in all four views; open shoes have both layers', () => {
  const { CATALOG, catalogOptions } = loadWardrobe();
  for (const [doll, ids] of Object.entries(NEW_SHOES)) for (const id of ids) {
    const it = CATALOG.items[id];
    assert.ok(it && it.category === 'shoes' && catalogOptions('shoes', doll).includes(it), id);
    assert.deepEqual([...it.dolls], [doll]);
    for (const view of CATALOG.views) {
      const f = it.fit[doll][view], feet = view === 'left' || view === 'right' ? [f.near] : [f.left, f.right];
      for (const s of feet) {
        assert.ok(s && [s.x, s.y, s.w].every(Number.isFinite), `${id} ${view} placement`);
        const src = s.part === 'main' ? it.art[view].main : it.art[view].parts[s.part];
        assert.ok(src && exists(src), `${id} ${view} ${s.part}`);
        if (s.over) assert.ok(exists(it.art[view].parts[s.over.part]) && Number.isFinite(s.over.w), `${id} ${view} over layer`);
      }
    }
  }
  for (const id of ['jelly-sandals', 'flower-flip-flops', 'wedge-sandals']) assert.equal(CATALOG.items[id].openToe, true, `${id} shows the toes`);
});

test('only the open shoes carry an over layer ({part}); the first wardrobe keeps its polygon `over` bands', () => {
  // portrait.js shoeLayers draws a shoe in two layers only when its `over` names a sprite part; the first
  // wardrobe's `over` is a list of polygons (an ankle strap's front band) and must keep the old drawing
  const { CATALOG } = loadWardrobe();
  const layered = new Set(['jelly-sandals', 'flower-flip-flops', 'wedge-sandals', 'toddler-sandals', 'jelly-shoes']);
  for (const it of CATALOG.itemList.filter(i => i.category === 'shoes')) for (const doll of it.dolls) for (const view of CATALOG.views) {
    const f = it.fit[doll]?.[view];if (!f) continue;
    for (const s of [f.left, f.right, f.near].filter(Boolean)) {
      if (layered.has(it.id)) assert.ok(typeof s.over?.part === 'string', `${it.id} ${view} over layer`);
      else assert.ok(s.over === undefined || Array.isArray(s.over), `${it.id} ${view}: over stays polygons`);
    }
  }
  assert.ok(Array.isArray(CATALOG.items['black-platform-sandals'].fit.adult.front.left.over));
  assert.ok(read('portrait.js').includes('fit.left?.over?.part'), 'shoeLayers tells the two apart by over.part');
});

test('every new item has an English and a Spanish name, and its colourways are named in both', () => {
  const ctx = loadWardrobe(), en = [...ctx.I18N.keys('en')], es = [...ctx.I18N.keys('es')];
  for (const id of [...Object.values(NEW_OUTFITS), ...Object.values(NEW_SHOES)].flat()) {
    assert.ok(en.includes('catalog.item.' + id) && es.includes('catalog.item.' + id), id);
    for (const t of ctx.CATALOG.items[id].tints) {
      const key = 'catalog.tint.' + t.id;
      assert.ok(en.includes(key) && es.includes(key), `${id} ${t.id}`);
    }
  }
  for (const th of ['all', ...ctx.CATALOG.themes]) assert.ok(en.includes('rack.' + th) && es.includes('rack.' + th), th);
});

test('at most three new outfits and two new shoes per character cost stars, the rest is free', () => {
  const { Shop } = loadWardrobe();
  for (const doll of ['adult', 'little']) {
    const outfits = NEW_OUTFITS[doll].filter(id => Shop.price('item:' + id) > 0);
    const shoes = NEW_SHOES[doll].filter(id => Shop.price('item:' + id) > 0);
    assert.ok(outfits.length <= 3 && outfits.length >= 1, `${doll} outfits: ${outfits}`);
    assert.ok(shoes.length <= 2 && shoes.length >= 1, `${doll} shoes: ${shoes}`);
    for (const id of [...outfits, ...shoes]) assert.ok(Shop.price('item:' + id) >= 6 && Shop.price('item:' + id) <= 25, id);
  }
});

test('the style challenges in game.js stay achievable by both characters with free options', () => {
  const { catalogOptions, Shop, CATALOG } = loadWardrobe();
  const src = read('game.js'), at = src.indexOf('const briefs=[');
  const briefs = vm.runInNewContext('(' + src.slice(at + 'const briefs='.length, src.indexOf('];', at) + 1) + ')');
  assert.ok(briefs.length >= 11);
  for (const b of briefs) for (const doll of ['adult', 'little']) for (const [field, v] of Object.entries(b.need)) {
    const id = typeof v === 'string' ? v : v[doll];
    if (['outfit', 'shoes', 'hair', 'earrings', 'necklace', 'clip'].includes(field)) {
      assert.ok(catalogOptions(field, doll).some(i => i.id === id), `${b.key} ${doll} ${id}`);
      assert.equal(Shop.price('item:' + id), 0, `${b.key} ${doll} ${id} is free`);
    } else if (field === 'hairColor') assert.ok(CATALOG.hairColors.some(h => h.id === id));
  }
});

test('old looks are read as before: the first wardrobe and the defaults are unchanged', () => {
  const { readLook, CATALOG } = loadWardrobe();
  for (const doll of ['adult', 'little']) {
    const d = CATALOG.defaults[doll];
    assert.deepEqual({ ...readLook(d, doll) }, { ...d });
    assert.equal(readLook({ ...d, outfit: doll === 'adult' ? 'ruffle-swimsuit' : 'sarong-swimsuit' }, doll).outfit, d.outfit, 'the other doll\'s outfit falls back');
  }
  assert.equal(readLook({ outfit: 'denim-jacket-skirt', shoes: 'lilac-mary-jane-heels' }, 'adult').outfit, 'denim-jacket-skirt');
  assert.equal(readLook({ outfit: 1, clip: 1, gem: 1 }, 'little').outfit, 'pink-gingham-bow-dress');
});
