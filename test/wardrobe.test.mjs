// Run with `node --test` from the repository root (Node 18+, no packages).
// Wardrobe rules: per-doll hair lists, old looks falling back cleanly, the star-shop balance and
// saved ownership surviving price changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

// portrait.js's colour helpers, which Surprise me uses to sort colourways into families
function colourHelpers() {
  const src = read('portrait.js');
  return src.match(/^const hexRgb=.*$/m)[0] + '\n' + src.match(/^function rgbToHsl\(r,g,b\)\{[\s\S]*?\n\}/m)[0] + '\n' +
    src.match(/^function lookKey\(shot,view='front'\)\{[\s\S]*?\n\}/m)[0] + '\n';
}

function loadWardrobe() {
  const ctx = {
    location: { hostname: 'x' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null },
    window: { dispatchEvent() {} }, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] },
    setTimeout: fn => fn(), Intl, console
  };
  vm.createContext(ctx);
  // a style challenge naming one hairstyle for both characters, as game.js declares them
  vm.runInContext(read('i18n.js') + read('i18n-es.js') + read('hair-fit.js') + read('catalog.js') +
    colourHelpers() + 'const briefs=[{key:"mall",need:{hair:"side-ponytail"}},{key:"bob",need:{hair:"curly-bob"}}];\nvar state={owned:[]};\n' + read('shop.js') +
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

test('open shoes lift the foot onto their footbed in every view: the heel stands on the sole from behind too', () => {
  const { CATALOG } = loadWardrobe();
  const floor = { adult: 866, little: 856 };
  for (const id of ['jelly-sandals', 'flower-flip-flops', 'wedge-sandals', 'toddler-sandals', 'jelly-shoes']) {
    const it = CATALOG.items[id], doll = it.dolls[0], fit = it.fit[doll];
    for (const view of CATALOG.views) assert.ok(fit[view].foot?.bed?.length, `${id} ${view} has a footbed`);
    const back = fit.back.foot.bed[0][1], side = fit.left.foot.bed;
    assert.ok(back < floor[doll] - 8, `${id}: from behind the heel is lifted onto the sole (${back})`);
    assert.ok(fit.back.foot.top < back - 40, `${id}: the lift is spread over the lower leg, not squashed into the heel`);
    // as high as the side view's bed under the heel (within the insole seen from above)
    const heel = side.filter(([x]) => x > side[side.length - 1][0] - 45).map(([, y]) => y);
    assert.ok(Math.abs(back - Math.max(...heel)) < 12, `${id}: back and side agree on the heel height`);
    for (const view of ['left', 'right']) assert.ok(Number.isFinite(fit[view].trim), `${id} ${view}: the foot is kept inside the shoe`);
  }
  // the right view mirrors the left
  const j = CATALOG.items['jelly-sandals'].fit.adult;
  assert.equal(j.left.foot.bed.length, j.right.foot.bed.length);
});

test('necklaces from the side lie around the neck (near half only) and from behind across the nape', () => {
  const { CATALOG } = loadWardrobe();
  for (const id of ['pearl-starfish-necklace', 'butterfly-necklace']) for (const doll of ['adult', 'little']) {
    const fit = CATALOG.items[id].fit[doll];
    const chin = { adult: 150, little: 200 }[doll];
    for (const view of ['left', 'right', 'back']) {
      const rbs = fit[view].ribbons;
      assert.ok(rbs?.length, `${id} ${doll} ${view} is laid along the neck`);
      for (const rb of rbs) {
        assert.ok(rb.src.length >= 2 && rb.dst.length >= 2 && rb.k > 0 && rb.in >= 0 && rb.out >= 0);
        // it starts at the base of the neck, below the chin: never hanging from the ear or the jaw
        assert.ok(rb.dst.every(([, y]) => y >= chin - 2), `${id} ${doll} ${view}: below the chin`);
      }
    }
    // the right view is the left mirrored (handedness flipped), the clasp at the nape
    const l = fit.left.ribbons[0], r = fit.right.ribbons[0], M = { adult: 181, little: 207 }[doll];
    assert.equal(r.hand, -(l.hand ?? 1));
    assert.deepEqual([...r.dst[0]], [M - l.dst[0][0], l.dst[0][1]]);
    assert.ok(l.dst[0][0] > l.dst[l.dst.length - 1][0], `${id} ${doll}: from the nape (back) to the front`);
  }
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

// ----- accessories: hats, glasses, bags (Grown-up), toys (Little Me) -----
const ACC = {
  adult: { hat: ['bucket-hat', 'sun-hat', 'baseball-cap', 'tiara', 'bow-headband'],
    glasses: ['heart-sunglasses', 'round-tinted-glasses', 'cat-eye-glasses'],
    bag: ['beaded-tote', 'heart-purse', 'beach-tote', 'mini-backpack'], toy: [] },
  little: { hat: ['sun-bonnet', 'bear-beanie', 'party-crown'], glasses: ['star-sunglasses', 'round-play-glasses'],
    bag: [], toy: ['plush-bunny', 'teddy-bear', 'kitten-plush', 'sand-bucket'] }
};

test('accessories: each doll has her own, each with art on disk and a fit in every view it shows', () => {
  const { catalogOptions, CATALOG } = loadWardrobe();
  const finite = f => [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 8 && f.h > 8;
  for (const doll of ['adult', 'little']) for (const [cat, ids] of Object.entries(ACC[doll])) {
    assert.deepEqual([...catalogOptions(cat, doll).map(i => i.id)], ids, `${doll} ${cat}`);
    for (const id of ids) {
      const it = CATALOG.items[id];
      assert.deepEqual([...it.dolls], [doll], `${id} is ${doll}'s only`);
      const views = cat === 'glasses' ? ['front', 'left', 'right'] : CATALOG.views;
      for (const view of CATALOG.views) {
        const f = it.fit[doll][view];
        if (!views.includes(view)) { assert.equal(f, undefined, `${id} hidden ${view}`); continue; }
        assert.ok(f && finite(f), `${id} ${view} fit`);
        assert.ok(existsSync(new URL(it.art[view].main, dist)), `${id} ${view} sprite on disk`);
        // placed on the right part of her: hats and glasses on the head, held things at the hand
        const top = doll === 'adult' ? -120 : -110, head = doll === 'adult' ? 160 : 230;
        if (cat === 'hat') assert.ok(f.y > top && f.y < head && f.y + f.h / 2 < head, `${id} ${view} on the head`);
        if (cat === 'glasses') assert.ok(f.y + f.h / 2 > 40 && f.y + f.h / 2 < (doll === 'adult' ? 110 : 150), `${id} ${view} at the eyes`);
        if (it.kind === 'held') {
          assert.ok(Array.isArray(f.grip) && f.grip.length >= 3, `${id} ${view} grip`);
          const gy = f.grip.reduce((s, p) => s + p[1], 0) / f.grip.length;
          assert.ok(f.y < gy && f.y + f.h > gy && f.y + f.h < 860, `${id} ${view} hangs from the hand`);
        }
        if (cat === 'glasses' && view !== 'front') assert.ok(Array.isArray(f.lens), `${id} ${view} frame front over the hair`);
        if (cat === 'hat' && f.cut) assert.ok(f.cut.length > 6 && f.cut.every(p => p.every(Number.isFinite)), `${id} ${view} hair cut`);
      }
      assert.ok(existsSync(new URL(it.thumb, dist)), `${id} card picture`);
    }
  }
  // the right views mirror the left ones where there is no art of their own
  for (const id of ['heart-sunglasses', 'tiara', 'plush-bunny']) {
    const it = CATALOG.items[id], d = it.dolls[0], M = { adult: 181, little: 207 }[d];
    const l = it.fit[d].left, r = it.fit[d].right;
    assert.ok(Math.abs((M - l.x - l.w) - r.x) < .02, `${id} right = mirrored left`);
  }
});

test('accessories: names in both languages, mostly free, a few showpieces per doll', () => {
  const { I18N, CATALOG, Shop } = loadWardrobe();
  const es = I18N.dict ? I18N.dict('es') : null;
  for (const doll of ['adult', 'little']) {
    let paid = 0;
    const all = Object.values(ACC[doll]).flat();
    for (const id of all) {
      I18N.set?.('en');
      const en = CATALOG.items[id].name;
      assert.ok(en && en.length > 2, `${id} English name`);
      assert.match(read('i18n-es.js'), new RegExp(`'catalog\\.item\\.${id}':'[^']+'`), `${id} Spanish name`);
      const p = Shop.price('item:' + id);
      if (p) { paid++; assert.ok(p >= 10 && p <= 18, `${id} price ${p}`); }
    }
    assert.ok(paid >= 1 && paid <= 3, `${doll}: ${paid} showpieces`);
    assert.ok(paid * 2 < all.length, `${doll}: most accessories are free`);
  }
  for (const key of ['tab.extras', 'tab.extrasLabel', 'group.hat', 'group.glasses', 'group.bag', 'group.toy', 'none.hat', 'none.glasses', 'none.bag', 'none.toy']) {
    assert.match(read('i18n.js'), new RegExp(`'${key.replace('.', '\\.')}':`), `${key} en`);
    assert.match(read('i18n-es.js'), new RegExp(`'${key.replace('.', '\\.')}':`), `${key} es`);
  }
});

test('accessories: old looks, saves and postcards read exactly as before (none), and are validated', () => {
  const { readLook, CATALOG, Shop } = loadWardrobe();
  for (const doll of ['adult', 'little']) {
    const d = CATALOG.defaults[doll];
    for (const f of ['hat', 'glasses', 'bag', 'toy']) assert.equal(d[f], 'none');
    // a look saved before the accessories existed
    const old = { ...d };for (const f of ['hat', 'glasses', 'bag', 'toy']) delete old[f];
    const read1 = readLook(old, doll);
    for (const f of ['hat', 'glasses', 'bag', 'toy']) assert.equal(read1[f], 'none', `${doll} old look ${f}`);
    // the other doll's things, unknown ids and junk fall back to none
    const other = doll === 'adult' ? { hat: 'bear-beanie', toy: 'teddy-bear', glasses: 'star-sunglasses' } : { hat: 'tiara', bag: 'beach-tote', glasses: 'heart-sunglasses' };
    const bad = readLook({ ...d, ...other, bag: doll === 'adult' ? 42 : 'beach-tote' }, doll);
    for (const f of ['hat', 'glasses', 'bag', 'toy']) assert.equal(bad[f], 'none', `${doll} ${f} validated`);
    for (const [f, ids] of Object.entries(ACC[doll])) for (const id of ids) assert.equal(readLook({ ...d, [f]: id }, doll)[f], id);
    // owning: a free accessory needs no purchase; a paid one is a try-on until bought
    assert.deepEqual([...Shop.missing(readLook({ ...d, hat: ACC[doll].hat[0] }, doll))], []);
  }
  assert.deepEqual([...Shop.missing(readLook({ ...CATALOG.defaults.adult, hat: 'tiara' }, 'adult'))], ['item:tiara']);
  // lookKey (portrait.js) caches by look: the accessories are part of it
  assert.match(read('portrait.js'), /shot\.hat,shot\.glasses,shot\.bag,shot\.toy/);
});

test('accessories: Surprise me uses them now and then, only owned ones', () => {
  const { Shop, CATALOG, state } = loadWardrobe();
  let seed = 3;const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const doll of ['adult', 'little']) {
    let worn = 0;const n = 300;
    for (let i = 0; i < n; i++) {
      const res = Shop.surprise(doll, CATALOG.defaults[doll], rnd);
      if (res.look.hat !== 'none') worn++;
      for (const f of ['hat', 'glasses', 'bag', 'toy']) if (res.look[f] !== 'none') assert.ok(Shop.owned('item:' + res.look[f]), `${f} ${res.look[f]} owned`);
    }
    assert.ok(worn > n * .08 && worn < n * .45, `${doll} wears a hat in ${worn} of ${n} surprises`);
  }
  assert.equal(state.owned.length, 0);
});
