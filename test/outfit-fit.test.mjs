// Run with `node --test` from the repository root (Node 18+, no packages).
// How outfits are worn (catalog.js, art/fit_wear.py): her neck is never covered by a garment's back
// neckline, long sleeves leave her hands out of the cuffs, hoods are either worn up over the hair or
// lie on her back, no row of a warped garment is drawn out into a whisker, and every sprite exists.
// The pixels themselves are judged at zoom with art/audit_outfits.cjs (art/lab.html?sheet=audit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

function load() {
  const ctx = {
    location: { hostname: 'x', search: '' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null },
    window: { dispatchEvent() {}, addEventListener() {} }, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] },
    setTimeout: fn => fn(), Intl, console
  };
  ctx.window.HibiscusPuppetRig = undefined;
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js') + read('i18n-es.js') + read('hair-fit.js') + read('catalog.js') +
    '\nthis.CATALOG=CATALOG;this.catalogOptions=catalogOptions;this.readLook=readLook;', ctx);
  vm.runInContext(read('puppet-rig.js') + '\nthis.R=typeof HibiscusPuppetRig!=="undefined"?HibiscusPuppetRig:window.HibiscusPuppetRig;', ctx);
  return ctx;
}
const outfits = ctx => ['adult', 'little'].flatMap(d => [...ctx.catalogOptions('outfit', d)].map(it => [d, it]));
// the neck's base line in the front view (doll-local y at the centre line): nothing of an outfit above it is
// drawn in front of her, except a hood worn up
const NECK_BASE = { adult: 164, little: 207 };
const inPoly = (poly, [x, y]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

test('front and side views: the garment above the neck base is drawn behind her (or erased), so her neck and chin show', () => {
  const ctx = load();
  for (const [doll, it] of outfits(ctx)) {
    for (const view of ['front', 'left', 'right']) {
      const f = it.fit[doll][view];
      if (f.hood) continue; // a hood worn up: drawn over her hair, its face opening cut out
      const shapes = [...(f.behind || []), ...(f.erase || [])].filter(s => s.poly);
      const x = view === 'front' ? 200 : view === 'left' ? 60 : CATALOG_MIRROR(doll) - 60;
      for (const y of [NECK_BASE[doll] - 60, NECK_BASE[doll] - 20, NECK_BASE[doll] - 4])
        assert.ok(shapes.some(s => inPoly(s.poly, [x, y])), `${it.id} ${doll} ${view}: neck at y ${y} is not kept clear`);
    }
  }
  function CATALOG_MIRROR(d) { return d === 'adult' ? 181 : 207 }
});

test('the beach poncho wears its hood up over her hair in every view, with her face open in front', () => {
  const ctx = load();
  const f = ctx.CATALOG.items['beach-poncho'].fit.little;
  for (const view of ctx.CATALOG.views) assert.ok(f[view].hood && f[view].hood.region.length, `hood ${view}`);
  assert.ok(f.front.hood.face.length && f.left.hood.face.length && f.right.hood.face.length, 'face opening');
  assert.equal(f.back.hood.face.length, 0, 'no opening from behind');
});

test('long sleeves: her hands are drawn over the cuffs and her bare arm is hidden inside the sleeve (front and back)', () => {
  const ctx = load();
  const long = [...ctx.R.LONG_SLEEVES];
  assert.ok(long.length >= 10);
  for (const id of long) {
    const it = ctx.CATALOG.items[id];
    for (const doll of it.dolls) for (const view of ['front', 'back']) {
      const f = it.fit[doll][view];
      assert.equal(f.hands?.length, 2, `${id} ${view} hands`);
      assert.equal(f.hideArms?.length, 2, `${id} ${view} arms hidden in the sleeves`);
      // the hand region starts at the wrist, below every hidden arm row
      const handTop = Math.min(...f.hands.map(h => Math.min(...h.poly.map(p => p[1]))));
      const armBottom = Math.max(...f.hideArms.map(h => Math.max(...h.poly.map(p => p[1]))));
      assert.ok(armBottom <= handTop + 6, `${id} ${view}: the hidden arm reaches into the hand`);
    }
  }
});

test('short sleeves and side long sleeves: the near arm comes out of the sleeve opening in side views', () => {
  const ctx = load();
  for (const id of ['tennis-dress', 'baby-tee-cargo', 'butterfly-satin-skirt', 'denim-overall-dress', 'crochet-cover-up',
    'rash-guard-set', 'rainbow-tutu-tee', 'dino-romper', 'tulle-party-dress', 'raincoat-set', 'bear-onesie', 'ballet-wrap-set']) {
    const it = ctx.CATALOG.items[id];
    for (const view of ['left', 'right']) {
      const clip = it.fit[it.dolls[0]][view].armClip;
      assert.ok(clip?.some(s => s.ellipse), `${id} ${view}: arm through the sleeve opening`);
    }
  }
});

test('no hem row of a warped garment is stretched far wider than the rows above it (whiskers)', () => {
  const ctx = load();
  // the second wardrobe (art/fit_wear.py despike); the first wardrobe's warps were drawn by hand
  for (const [doll, it] of outfits(ctx).filter(([, it]) => it.thumb?.startsWith('assets/wear/'))) for (const view of ctx.CATALOG.views) {
    for (const p of it.fit[doll][view].pieces || []) {
      if (!p.warp || p.keep) continue;
      const k = p.warp.map(([, , a, da, b, db]) => (db - da) / (b - a));
      // the hem's last rows (where a short run widened to the body used to draw out into a whisker)
      k.forEach((v, i) => {
        if (i < k.length - 3) return;
        const win = k.slice(i - 6, i).sort((a, b) => a - b), med = win[win.length >> 1];
        assert.ok(v <= med * 1.4 + 1e-6, `${it.id} ${doll} ${view} ${p.part}: row ${i} scale ${v.toFixed(3)} vs ${med.toFixed(3)}`);
      });
    }
  }
});

test('every outfit has its sprites on disk in all four views, and an old look in a removed outfit falls back', () => {
  const ctx = load();
  for (const [doll, it] of outfits(ctx)) for (const view of ctx.CATALOG.views) {
    const art = it.art[view];
    assert.ok(art, `${it.id} ${view} art`);
    for (const src of [art.main, ...Object.values(art.parts || {})].filter(Boolean))
      assert.ok(existsSync(new URL(src, dist)), `${src} exists`);
  }
  assert.equal(ctx.readLook({ outfit: 'no-such-outfit' }, 'little').outfit, ctx.CATALOG.defaults.little.outfit);
});
