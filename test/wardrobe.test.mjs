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
