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
  vm.runInContext(read('i18n.js') + read('i18n-es.js') + read('catalog.js') +
    'const briefs=[{key:"mall",need:{hair:"side-ponytail"}},{key:"bob",need:{hair:"curly-bob"}}];\nvar state={owned:[]};\n' + read('shop.js') +
    '\nthis.CATALOG=CATALOG;this.Shop=Shop;this.readLook=readLook;this.catalogOptions=catalogOptions;this.briefs=briefs;this.state=state;', ctx);
  return ctx;
}

test('Little Me only has kid hairstyles; the Grown-up keeps all six', () => {
  const { catalogOptions, CATALOG } = loadWardrobe();
  assert.deepEqual([...catalogOptions('hair', 'little').map(i => i.id)], ['ringlet-pigtails', 'curly-buns', 'curly-bob']);
  assert.equal(catalogOptions('hair', 'adult').length, 6);
  assert.deepEqual([...CATALOG.hairStyles.little], ['ringlet-pigtails', 'curly-buns', 'curly-bob']);
});

test('a saved Little Me look in a removed style falls back to her default hair', () => {
  const { readLook, CATALOG } = loadWardrobe();
  for (const hair of ['long-waves', 'side-ponytail', 'half-up-curls']) {
    const look = readLook({ hair, hairColor: 'honey', outfit: 'denim-overalls' }, 'little');
    assert.equal(look.hair, CATALOG.defaults.little.hair);
    assert.equal(look.hairColor, 'honey');
    assert.equal(look.outfit, 'denim-overalls');
    assert.equal(readLook({ hair }, 'adult').hair, hair);
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
