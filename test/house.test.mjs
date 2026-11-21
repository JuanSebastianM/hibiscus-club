// Run with `node --test` from the repository root (Node 18+, no packages).
// Dream House rules (dist/decor-logic.js with dist/decor-data.js and the furniture manifest):
// save validation, placement constraints, depth order, goals and rewards, Surprise me layouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');
const manifest = JSON.parse(read('assets/decor/manifest.json'));

function load() {
  const ctx = { console, Math, JSON, Number, Array, Object, Set, Map };
  vm.createContext(ctx);
  vm.runInContext(read('decor-data.js') + read('decor-logic.js') + '\nthis.DECOR=DECOR;this.L=DecorLogic;', ctx);
  ctx.L.setItems(manifest.items);
  return ctx;
}
// a deterministic random source
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const plain = v => JSON.parse(JSON.stringify(v)); // values made inside the vm have their own prototypes
const piece = (id, x, y, extra = {}) => ({ id, x, y, s: 1, f: false, z: 0, host: null, trial: false, ...extra });

test('data: every room, treatment, price, surface and recipe names something real', () => {
  const { DECOR, L } = load();
  const ids = new Set(manifest.items.map(i => i.id));
  assert.equal(DECOR.rooms.length, 6);
  for (const r of DECOR.rooms) {
    assert.ok(manifest.items.some(i => i.room === r.own), r.id);
    for (const w of r.walls) assert.ok(DECOR.walls[w], w);
    for (const f of r.floors) assert.ok(DECOR.floors[f], f);
  }
  for (const id of Object.keys(DECOR.prices)) assert.ok(ids.has(id), id);
  for (const id of Object.keys(DECOR.surfaces)) assert.ok(ids.has(id), id);
  for (const [room, R] of Object.entries(DECOR.recipes)) {
    const all = [...R.back.flat().flatMap(s => [...s.pick, ...(s.chair ? [s.chair] : [])]), ...R.mid.flat().flatMap(s => s.pick), ...R.front, ...R.wall, ...R.top];
    for (const id of all) assert.ok(ids.has(id), room + ': ' + id);
    for (const id of R.wall) assert.equal(L.item(id).placement, 'wall', id);
  }
});

test('stars: only a few showpieces cost stars, priced like the wardrobe', () => {
  const { DECOR } = load();
  const paid = Object.entries(DECOR.prices);
  assert.ok(paid.length >= 6 && paid.length <= manifest.items.length * 0.15, `${paid.length} paid pieces`);
  for (const [id, p] of paid) assert.ok(Number.isInteger(p) && p >= 6 && p <= 25, id);
  for (const id of ['canopy-bed', 'fireplace', 'ball-pit', 'kiddie-pool', 'disco-ball', 'fish-tank', 'dollhouse']) assert.ok(DECOR.prices[id], id);
});

test('placement: floor pieces stay on the floor band and inside the room, smaller at the back', () => {
  const { L } = load();
  const { ROOM, FLOOR } = L;
  for (const [x, y] of [[-500, -500], [5000, 5000], [768, 0], [0, 1152], [1536, 700]]) {
    const p = L.constrain(piece('sofa', x, y), 'living');
    assert.ok(p.y >= FLOOR.y0 && p.y <= FLOOR.y1, `y ${p.y}`);
    const [l, r] = L.floorEdges(p.y);
    assert.ok(p.x >= l && p.x <= r, `x ${p.x} within ${l}..${r}`);
    const b = L.box(p);
    assert.ok(b.r > ROOM.frame.l + b.w * 0.3 && b.x < ROOM.frame.r - b.w * 0.3, 'most of it on screen');
  }
  const back = L.constrain(piece('armchair', 768, 650), 'living'), front = L.constrain(piece('armchair', 768, 1090), 'living');
  assert.ok(L.scaleOf(back) < L.scaleOf(front), 'further back is smaller');
  assert.ok(L.scaleOf(front) / L.scaleOf(back) < 1.25, 'only slightly');
});

test('grounding: every standing piece keeps its whole footprint on the floor, rear feet never above the wall line', () => {
  const { L, DECOR } = load();
  const ids = [...manifest.items.filter(i => i.placement === 'floor' || i.placement === 'surface').map(i => i.id), '@adult', '@little'];
  for (const id of ids) {
    assert.ok(Object.hasOwn(DECOR.ground, id), 'ground depth listed for ' + id);
    for (const s of [0.5, 1, 1.8]) for (const f of [false, true]) for (const [x, y] of [[0, 0], [1536, 0], [0, 1152], [1536, 1152], [768, 640], [768, 660], [-999, 900], [2999, 700]]) {
      const p = L.constrain(piece(id, x, y, { s, f }), 'bedroom'), fp = L.footprint(p);
      const [l, r] = L.floorEdges(fp.rear);
      const tag = `${id} s${s} f${f} @${x},${y}`;
      assert.ok(fp.rear >= L.ROOM.back.y1 - 0.01, `${tag}: rear feet ${fp.rear} above the wall line`);
      assert.ok(fp.front <= L.ROOM.frame.b, `${tag}: past the front edge`);
      if (fp.r - fp.l < r - l - 8) assert.ok(fp.l >= l - 0.01 && fp.r <= r + 0.01, `${tag}: a foot off the floor ${fp.l}..${fp.r} vs ${l}..${r}`);
    }
  }
  // a deep piece against the back wall stands lower than a shallow one
  const bed = L.constrain(piece('single-bed', 768, 0), 'bedroom'), shelf = L.constrain(piece('bookshelf', 768, 0), 'bedroom');
  assert.ok(bed.y > shelf.y + 40, `bed ${bed.y} vs bookshelf ${shelf.y}`);
  assert.ok(Math.abs(L.footprint(bed).rear - L.ROOM.back.y1) < 4, 'pushed to the back, the bed\'s rear feet touch the wall line');
  // bigger is deeper: resizing re-grounds
  const big = L.constrain(piece('single-bed', 768, 0, { s: 1.8 }), 'bedroom');
  assert.ok(big.y > bed.y, 'a bigger bed stands further forward');
});

test('grounding: rugs lie wholly on the floor; wall pieces stay between moulding and skirting', () => {
  const { L } = load();
  for (const id of manifest.items.filter(i => i.placement === 'rug').map(i => i.id)) for (const [x, y] of [[0, 0], [1536, 1152], [768, 600], [0, 1152]]) {
    const p = L.constrain(piece(id, x, y), 'living'), fp = L.footprint(p);
    assert.ok(fp.rear >= L.ROOM.back.y1 && fp.front <= L.ROOM.frame.b, `${id}: rug edges ${fp.rear}..${fp.front}`);
    const [l, r] = L.floorEdges(fp.rear);
    assert.ok(fp.l >= l - 0.01 && fp.r <= r + 0.01, `${id}: rug sides on the floor`);
  }
  for (const id of manifest.items.filter(i => i.placement === 'wall').map(i => i.id)) for (const room of ['bedroom', 'patio']) for (const [x, y] of [[0, 0], [1536, 1152], [768, 640]]) {
    const b = L.box(L.constrain(piece(id, x, y), room));
    assert.ok(b.b <= L.ROOM.back.y1 - L.SKIRT + 0.01, `${id} in ${room}: bottom ${b.b} on the skirting or floor`);
    assert.ok(b.x >= L.ROOM.back.x0 && b.r <= L.ROOM.back.x1, `${id}: on the back wall only`);
  }
});

test('grounding: pieces from earlier saves are re-grounded on load', () => {
  const { L } = load();
  // saved by the first version, with the bed's front feet just below the wall line
  const h = L.readHouse({ rooms: { bedroom: { p: [['single-bed', 400, 652, 100, 0], ['@adult', 900, 645, 100, 0]] } } });
  const [bed] = L.readPieces(h.rooms.bedroom.p, 'bedroom');
  assert.ok(L.footprint(bed).rear >= L.ROOM.back.y1 - 0.5, 'rear feet back on the floor');
  assert.ok(bed.y > 700);
});

test('placement: wall pieces stay on the wall, rugs on the floor, flip only when allowed', () => {
  const { L } = load();
  for (const [x, y] of [[0, 0], [1536, 1152], [768, 900]]) {
    const w = L.constrain(piece('framed-picture', x, y), 'bedroom'), b = L.box(w), z = L.WALL;
    assert.ok(b.x >= z.x0 - 0.5 && b.r <= z.x1 + 0.5 && b.y >= z.y0 - 0.5 && b.b <= z.y1 + 0.5, JSON.stringify(b));
    const out = L.constrain(piece('pennant-banner', x, y), 'patio');
    assert.ok(L.box(out).y >= L.WALL_OUT.y0 - 0.5, 'patio wall pieces stay on the garden wall, not in the sky');
    const rug = L.constrain(piece('round-rug', x, y), 'bedroom');
    assert.ok(rug.y >= L.RUG.y0 && rug.y <= L.RUG.y1);
  }
  assert.equal(L.constrain(piece('fridge', 700, 800, { f: true }), 'kitchen').f, false, 'the fridge may not be mirrored');
  assert.equal(L.constrain(piece('sofa', 700, 800, { f: true }), 'living').f, true);
  const big = L.constrain(piece('sofa', 700, 800, { s: 9 }), 'living');
  assert.equal(big.s, L.SCALE.max);
  assert.equal(L.constrain(piece('sofa', 700, 800, { s: 0 }), 'living').s, L.SCALE.min);
});

test('placement: a surface piece snaps onto a tabletop and rides along with it', () => {
  const { L } = load();
  const table = L.constrain(piece('dining-table', 760, 860), 'kitchen');
  const bowl = piece('fruit-bowl', 0, 0);
  const s = L.surfaceOf(table);
  assert.ok(s && s.y < table.y && s.x0 < s.x1);
  const host = L.hostAt((s.x0 + s.x1) / 2, s.y + 10, [table, bowl], bowl);
  assert.equal(host, table);
  bowl.host = host; bowl.x = (s.x0 + s.x1) / 2; L.constrain(bowl, 'kitchen');
  assert.equal(bowl.y, s.y);
  assert.equal(L.hostAt(100, 1050, [table, bowl], bowl), null, 'nothing to stand on far from the table');
  // drawn right after its host even though its floor point is higher up the screen
  const chair = L.constrain(piece('dining-chair', 760, 1000), 'kitchen');
  const order = L.sortPieces([chair, bowl, table]);
  assert.deepEqual(order.map(p => p.id), ['dining-table', 'fruit-bowl', 'dining-chair']);
  // a non-surface piece cannot use a tabletop
  assert.equal(L.constrain(piece('sofa', 760, 300, { host: table }), 'kitchen').host, null);
});

test('depth order: wall, then rugs, then standing pieces back to front; forward/back adjust it', () => {
  const { L } = load();
  const rug = L.constrain(piece('round-rug', 760, 900), 'living');
  const table = L.constrain(piece('coffee-table', 760, 880), 'living');
  const chairFront = L.constrain(piece('armchair', 700, 980), 'living');
  const sofa = L.constrain(piece('sofa', 760, 680), 'living');
  const pic = L.constrain(piece('framed-picture', 760, 200), 'living');
  const all = [chairFront, rug, table, pic, sofa];
  assert.deepEqual(L.sortPieces(all).map(p => p.id), ['framed-picture', 'round-rug', 'sofa', 'coffee-table', 'armchair']);
  assert.ok(L.reorder(table, all, 1), 'the table can come in front of the overlapping chair');
  assert.deepEqual(L.sortPieces(all).map(p => p.id).slice(-2), ['armchair', 'coffee-table']);
  assert.ok(L.reorder(table, all, -1));
  assert.deepEqual(L.sortPieces(all).map(p => p.id).slice(-2), ['coffee-table', 'armchair']);
  const lone = L.constrain(piece('garden-gnome', 200, 1080), 'living');
  assert.equal(L.reorder(lone, [...all, lone], 1), false, 'nothing overlapping: no change');
});

test('saves: round trip, unknown ids dropped, numbers clamped, caps enforced, paid pieces need owning', () => {
  const { L, DECOR } = load();
  const pieces = [L.constrain(piece('dining-table', 760, 860), 'kitchen')];
  const bowl = piece('fruit-bowl', 800, 0, { host: pieces[0] }); L.constrain(bowl, 'kitchen'); pieces.push(bowl);
  pieces.push(L.constrain(piece('fridge', 300, 700, { s: 1.2, z: 2 }), 'kitchen'));
  pieces.push(piece('canopy-bed', 500, 800, { trial: true }));
  const saved = L.writePieces(pieces);
  assert.equal(saved.length, 3, 'a preview is never saved');
  assert.deepEqual(JSON.parse(JSON.stringify(saved[1].slice(-2))), [0, 0], 'the bowl remembers its host by index');
  const back = L.readPieces(saved, 'kitchen');
  assert.equal(back[1].host, back[0]);
  assert.equal(back[2].s, 1.2); assert.equal(back[2].z, 2);
  const house = L.readHouse({ at: 'kitchen', rooms: { kitchen: { w: 'florals', f: 'deck', p: [
    ...saved, ['no-such-thing', 1, 2, 100, 0], ['sofa', 'x', null, 9999, 7], 'junk', null, ['@adult', 9e9, -9e9, 100, 1], ['@adult', 1, 1, 100, 0],
    ['fish-tank', 400, 900, 100, 0], ['wall-clock', 700, 300, 100, 1]
  ] }, nowhere: { p: [] } }, owned: ['fish-tank', 'sofa', 42], done: ['kitchen', 'attic'], goals: ['bed', 'fly'] });
  const k = house.rooms.kitchen;
  assert.equal(house.at, 'kitchen');
  assert.equal(k.w, 'florals'); assert.equal(k.f, 'pink-check', 'a patio floor is not offered indoors');
  assert.deepEqual(plain(house.owned), ['fish-tank']);
  assert.deepEqual(plain(house.done), ['kitchen']); assert.deepEqual(plain(house.goals), ['bed']);
  const ids = k.p.map(e => e[0]);
  assert.ok(!ids.includes('no-such-thing'));
  assert.equal(ids.filter(id => id === '@adult').length, 1, 'each character once');
  assert.ok(ids.includes('fish-tank'), 'a bought piece stays');
  const sofa = k.p.find(e => e[0] === 'sofa');
  assert.equal(sofa[3], L.SCALE.max * 100);
  assert.equal(k.p.find(e => e[0] === 'wall-clock')[4], 0, 'the clock cannot be mirrored');
  assert.equal(Object.keys(house.rooms).length, 6);
  assert.deepEqual(plain(house.rooms.patio), { w: 'pink-siding', f: 'lawn', b: 'patio-1', p: [] }, 'a room never decorated starts painted');
  // paid piece not owned is dropped
  assert.equal(L.readHouse({ rooms: { bedroom: { p: [['canopy-bed', 500, 800, 100, 0]] } } }).rooms.bedroom.p.length, 0);
  // the cap
  const many = Array.from({ length: 80 }, (_, i) => ['flower-vase', 200 + i * 10, 800, 100, 0]);
  assert.equal(L.readHouse({ rooms: { living: { p: [...many, ['@little', 700, 900, 100, 0]] } } }).rooms.living.p.length, DECOR.cap);
  // anything at all
  for (const junk of [undefined, null, 7, 'x', [], { rooms: [] }, { rooms: { bedroom: 'x' } }, { at: {}, owned: 'canopy-bed' }]) {
    const h = L.readHouse(junk);
    assert.equal(h.at, 'bedroom'); assert.equal(Object.keys(h.rooms).length, 6);
  }
});

test('saves stay small: six full rooms', () => {
  const { L, DECOR } = load();
  const rooms = {};
  for (const r of DECOR.rooms) {
    const list = [];
    for (let i = 0; i < 40; i++) list.push(L.constrain(piece(manifest.items[(i * 7) % manifest.items.length].id, 160 + (i % 10) * 120, 660 + i * 10, { z: i % 3, s: 1.1, f: i % 2 === 1 }), r.id));
    rooms[r.id] = { w: r.walls[1], f: r.floors[1], p: L.writePieces(list) };
  }
  const json = JSON.stringify(L.readHouse({ rooms, owned: Object.keys(DECOR.prices) }));
  assert.ok(json.length < 16000, `${json.length} bytes`);
  console.log(`# six full rooms: ${json.length} bytes`);
});

test('goals and furnished rooms', () => {
  const { L } = load();
  const empty = { w: 'candy-stripes', f: 'honey-oak', pieces: [] };
  assert.equal(L.goalsMet({ bedroom: empty }).size, 0);
  const table = piece('bedside-table', 700, 700);
  const lamp = piece('lava-lamp', 700, 600, { host: table });
  const room = { w: 'lilac', f: 'honey-oak', pieces: [piece('single-bed', 400, 700), piece('poster', 600, 200), piece('heart-rug', 700, 900), table, lamp, piece('wardrobe', 1100, 680), piece('@little', 800, 900)] };
  assert.deepEqual([...L.goalsMet({ bedroom: room })].sort(), ['bed', 'friend', 'paint', 'rug', 'top', 'wall']);
  assert.ok(!L.goalsMet({ bedroom: { ...empty, pieces: [piece('canopy-bed', 1, 1, { trial: true })] } }).has('bed'), 'a preview does not count');
  assert.ok(L.isFurnished('bedroom', room.pieces), 'six pieces, three of them the room\'s own');
  assert.ok(!L.isFurnished('bedroom', room.pieces.slice(0, 5)));
  assert.ok(!L.isFurnished('kitchen', room.pieces), 'bedroom pieces do not furnish the kitchen');
  // a character does not count as furniture
  assert.ok(!L.isFurnished('bedroom', [...room.pieces.slice(1, 6), piece('@adult', 1, 1)]), 'a character does not count');
});

test('Surprise me: tidy layouts from owned pieces only, every room, many times', () => {
  const { L } = load();
  for (const room of L.ROOM_IDS) {
    let ownTotal = 0, runs = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const out = L.surprise(room, () => false, seeded(seed * 97 + room.length));
      assert.ok(out.length >= 5 && out.length <= 40, `${room} #${seed}: ${out.length}`);
      assert.ok(out.every(p => !L.price(p.id)), 'no unbought paid piece');
      // the room's own collection leads
      const own = out.filter(p => L.item(p.id).room === L.roomDef(room).own).length;
      assert.ok(own >= 2, `${room} #${seed} own pieces`);
      ownTotal += own; runs++;
      for (const p of out) {
        const before = JSON.stringify([p.x, p.y]);
        L.constrain(p, room);
        const [bx, by] = JSON.parse(before); assert.ok(Math.abs(bx - p.x) < 0.05 && Math.abs(by - p.y) < 0.05, `${room} #${seed}: ${p.id} already where it belongs`);
      }
      // no two standing pieces on top of each other at the same depth
      const standing = out.filter(p => L.layer(p) === 2 && !p.host);
      for (let i = 0; i < standing.length; i++) for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i], b = standing[j];
        if (Math.abs(a.y - b.y) > 50) continue;
        const [a0, a1] = L.footprintRange(a), [b0, b1] = L.footprintRange(b);
        assert.ok(Math.min(a1, b1) - Math.max(a0, b0) <= Math.min(a1 - a0, b1 - b0) * 0.3, `${room} #${seed}: ${a.id} and ${b.id} pile up`);
      }
      // rugs never pile on rugs
      const rugs = out.filter(p => L.layer(p) === 1);
      assert.ok(rugs.length <= 2);
    }
    assert.ok(ownTotal / runs >= 3.5, `${room}: ${ownTotal / runs} own pieces on average`);
    // with the showpieces bought, they can appear
    const owned = new Set();
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) seen = L.surprise(room, () => true, seeded(seed)).some(p => L.price(p.id));
    void owned;
    if (['bedroom', 'living', 'playroom', 'patio'].includes(room)) assert.ok(seen, `${room}: bought showpieces get used`);
  }
});

test('free spots: tap-to-add never stacks a new piece on an old one when there is room', () => {
  const { L } = load();
  const list = [];
  for (const id of ['sofa', 'armchair', 'coffee-table', 'tall-plant', 'side-table']) {
    const p = L.findSpot(id, list, 'living', seeded(3));
    for (const q of list) if (Math.abs(q.y - p.y) < 40) {
      const A = L.box(p), B = L.box(q);
      assert.ok(Math.min(A.r, B.r) - Math.max(A.x, B.x) < Math.min(A.w, B.w) * 0.6, `${id} on ${q.id}`);
    }
    list.push(p);
  }
  const wall = L.findSpot('wall-clock', list, 'living', seeded(4));
  assert.equal(L.item(wall.id).placement, 'wall');
});

// ---------- painted rooms ----------
// inside the floor quadrilateral (back-left, back-right, front-right, front-left), with a little tolerance
const insideQuad = (q, x, y, tol = 0.5) => {
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -tol * Math.hypot(bx - ax, by - ay)) return false;
  }
  return true;
};

test('painted rooms: eighteen backdrops, three per room, with sound measured geometry and names', () => {
  const { DECOR, L } = load();
  assert.equal(DECOR.backdrops.length, 18);
  const en = read('i18n.js'), es = read('i18n-es.js');
  for (const r of DECOR.rooms) assert.equal(L.schemes(r.id).length, 3, r.id);
  for (const b of DECOR.backdrops) {
    const [bl, br, fr, fl] = b.floor, tag = b.id;
    assert.ok(readFileSync(new URL(b.file, dist)).length > 10000, tag + ' picture');
    assert.ok(readFileSync(new URL(b.thumb, dist)).length < 12000, tag + ' thumbnail is small');
    assert.ok(en.includes(`'house.scheme.${b.id}'`) && es.includes(`'house.scheme.${b.id}'`), tag + ' named in both languages');
    assert.equal(bl[1], br[1]); assert.equal(fl[1], fr[1]);
    assert.ok(bl[1] > 600 && bl[1] < 1000 && fr[1] > bl[1] + 140 && fr[1] <= 1152, tag + ' floor lines');
    assert.ok(bl[0] < br[0] && fl[0] < bl[0] && fr[0] > br[0], tag + ' floor widens toward the viewer');
    // the side lines meet at the vanishing point, above the floor
    const [vx, vy] = b.vp;
    assert.ok(vy < bl[1] - 150, tag + ' horizon above the floor');
    for (const [a, c] of [[bl, fl], [br, fr]]) {
      const x = a[0] + (c[0] - a[0]) * (vy - a[1]) / (c[1] - a[1]);
      assert.ok(Math.abs(x - vx) < 3, `${tag}: side line misses the vanishing point by ${x - vx}`);
    }
    // wide-angle paintings: a 6 m back wall indoors (7.5 m on the terraces), so a room reads as a room
    assert.ok(b.scale > 0.38 && b.scale < 0.7, tag + ' scale ' + b.scale);
    const wallM = (br[0] - bl[0]) / (b.scale * 280);
    assert.ok(wallM > 4.5 && wallM < 8, `${tag}: back wall ${wallM.toFixed(1)} m wide`);
    for (const z of b.wall) assert.ok(z[0] < z[2] && z[1] < z[3] && z[3] <= bl[1] && z[0] >= 0 && z[2] <= 1536, tag + ' wall zone');
    for (const o of b.openings) assert.ok(['window', 'door', 'arch', 'awning'].includes(o[4]) && o[0] < o[2] && o[1] < o[3], tag + ' opening');
    // a door at the back wall keeps the floor in front of it clear
    if (b.openings.some(o => o[4] === 'door')) assert.ok(b.clear.some(c => c[1] <= bl[1] + 6), tag + ' clear before door');
  }
});

test('painted rooms: every standing piece and rug stays on that room\'s floor, at every corner and size', () => {
  const { DECOR, L } = load();
  const standing = [...manifest.items.filter(i => i.placement === 'floor' || i.placement === 'surface').map(i => i.id), '@adult', '@little'];
  const rugs = manifest.items.filter(i => i.placement === 'rug').map(i => i.id);
  const spots = [[0, 0], [1536, 0], [0, 1152], [1536, 1152], [768, 0], [768, 2000], [-999, 950], [2999, 950]];
  for (const b of DECOR.backdrops) {
    const q = b.floor, yb = q[0][1];
    for (const id of standing) for (const s of [0.5, 1, 1.8]) for (const f of [false, true]) for (const [x, y] of spots) {
      const p = L.constrain(piece(id, x, y, { s, f }), b.id), fp = L.footprint(p, b.id), tag = `${b.id} ${id} s${s} f${f} @${x},${y}`;
      assert.ok(fp.rear >= yb - 0.01, `${tag}: rear feet ${fp.rear} above the floor line ${yb}`);
      assert.ok(fp.front <= q[2][1], `${tag}: past the front edge`);
      const [l, r] = L.floorEdges(fp.rear, b.id);
      if (fp.r - fp.l < r - l - 8) for (const [cx, cy] of [[fp.l, fp.rear], [fp.r, fp.rear], [fp.l, fp.front], [fp.r, fp.front]])
        assert.ok(insideQuad(q, cx, cy) && cx >= 0 && cx <= 1536, `${tag}: foot ${cx},${cy} off the floor`);
    }
    for (const id of rugs) for (const [x, y] of spots) {
      const p = L.constrain(piece(id, x, y), b.id), fp = L.footprint(p, b.id);
      for (const [cx, cy] of [[fp.l, fp.rear], [fp.r, fp.rear], [fp.l, fp.front], [fp.r, fp.front]])
        assert.ok(insideQuad(q, cx, cy), `${b.id} ${id}: rug corner ${cx},${cy} off the floor`);
    }
    // further back is smaller, growing toward the viewer with this painting's floor but never blown up
    const back = L.constrain(piece('armchair', 768, yb + 5), b.id), front = L.constrain(piece('armchair', 768, 1140), b.id);
    const k = L.scaleOf(front, b.id) / L.scaleOf(back, b.id);
    assert.ok(k > 1.05 && k <= 1.5 + 1e-9, `${b.id}: front/back ${k}`);
    // nothing reaches the picture's front edge: rugs end 30 px before it, standing pieces 24
    for (const id of rugs) assert.ok(L.box(L.constrain(piece(id, 768, 2000), b.id), b.id).b <= q[2][1] - 29.9, `${b.id} ${id}: rug cut off`);
    assert.ok(L.constrain(piece('armchair', 768, 2000), b.id).y <= q[2][1] - 23.9, b.id + ' front margin');
    // sizes against the room: a bed a quarter to a third of the back wall, a bunk bed well under the door
    const wallW = q[1][0] - q[0][0], at = id => L.box(L.constrain(piece(id, 768, 0), b.id), b.id);
    if (b.room !== 'patio') {
      assert.ok(at('single-bed').w / wallW < 0.36 && at('sofa').w / wallW < 0.37 && at('bathtub').w / wallW < 0.3, `${b.id}: furniture too wide for the room`);
      const door = b.openings.find(o => o[4] === 'door');
      if (door) assert.ok(at('bunk-bed').h < (yb - door[1]) * 0.7, `${b.id}: the bunk bed is not well under the door`);
    }
  }
});

test('painted rooms: wall pieces stay in the wall zones and off windows and doors', () => {
  const { DECOR, L } = load();
  const wall = manifest.items.filter(i => i.placement === 'wall').map(i => i.id);
  for (const b of DECOR.backdrops) {
    const g = L.geo(b.id);
    for (const id of wall) for (const [x, y] of [[0, 0], [1536, 1152], [768, 400], [400, 300], [1100, 500]]) {
      const p = L.constrain(piece(id, x, y), b.id), bx = L.box(p, b.id), tag = `${b.id} ${id} @${x},${y}`;
      const inZone = g.zones.some(z => z.hang
        ? DECOR.hangers.includes(id) && bx.y >= z.y0 - 0.5 && bx.y <= z.y1 + 0.5 && bx.x >= z.x0 - 0.5 && bx.r <= z.x1 + 0.5 && bx.b <= g.back.y1
        : bx.x >= z.x0 - 0.5 && bx.r <= z.x1 + 0.5 && bx.y >= z.y0 - 0.5 && bx.b <= z.y1 + 0.5);
      assert.ok(inZone, `${tag}: outside the wall zones ${JSON.stringify(bx)}`);
      // decor windows never cover a painted opening
      if (['curtain-window', 'round-window'].includes(id)) for (const o of g.openings)
        assert.ok(Math.min(bx.r, o.x1) <= Math.max(bx.x, o.x0) + 0.5 || Math.min(bx.b, o.y1) <= Math.max(bx.y, o.y0) + 0.5, `${tag}: a decor window over the painted ${o.kind}`);
      // where the wall has room beside the openings, the piece keeps off them
      const blocked = g.openings.filter(o => !(DECOR.overOpenings[id] || []).includes(o.kind));
      const overlap = blocked.reduce((s, o) => s + Math.max(0, Math.min(bx.r, o.x1) - Math.max(bx.x, o.x0)) * Math.max(0, Math.min(bx.b, o.y1) - Math.max(bx.y, o.y0)), 0);
      const z = g.zones[0];
      const roomBeside = g.zones.length === 1 && blocked.every(o => o.x0 - z.x0 > bx.w + 14 || z.x1 - o.x1 > bx.w + 14);
      if (roomBeside) assert.ok(overlap < bx.w * bx.h * 0.02, `${tag}: covers an opening`);
    }
  }
});

test('painted rooms: switching schemes or back to paint keeps every piece, grounded', () => {
  const { DECOR, L } = load();
  for (const r of DECOR.rooms) {
    const ids = [...L.schemes(r.id).map(b => b.id), r.id];
    for (let seed = 1; seed <= 10; seed++) {
      let from = ids[seed % ids.length];
      const list = L.surprise(from, () => true, seeded(seed * 31));
      const n = list.length;
      for (const to of [...ids, ids[0]]) {
        L.regeo(list, from, to); L.settle(list, to);
        assert.equal(list.length, n, `${r.id}: ${from} -> ${to} lost pieces`);
        for (const p of list) {
          const before = [p.x, p.y]; L.constrain(p, to);
          assert.ok(Math.abs(before[0] - p.x) < 1.01 && Math.abs(before[1] - p.y) < 1.01, `${from} -> ${to}: ${p.id} not grounded`);
          if (p.host) assert.ok(list.includes(p.host), 'host kept');
        }
        from = to;
      }
    }
  }
});

test('painted rooms: saves remember the scheme, old saves keep their look, unknown ids fall back', () => {
  const { DECOR, L } = load();
  // a new house: every room starts in its first painted scheme
  const fresh = L.readHouse(undefined);
  for (const r of DECOR.rooms) assert.equal(fresh.rooms[r.id].b, L.defaultScheme(r.id));
  // an old save (no b): a decorated room keeps its paint and floor, an untouched one goes painted
  const old = L.readHouse({ rooms: { bedroom: { w: 'lilac', f: 'cherry', p: [['single-bed', 400, 700, 100, 0]] }, kitchen: { w: 'mint-stripes', f: 'pink-check', p: [['fridge', 300, 700, 100, 0]] } } });
  assert.equal(old.rooms.bedroom.b, undefined); assert.equal(old.rooms.kitchen.b, undefined, 'furnished with the default paint: kept procedural');
  assert.equal(old.rooms.living.b, 'living-1');
  // chosen scheme, chosen paint over painted (''), another room's scheme, junk
  const h = L.readHouse({ rooms: { bedroom: { b: 'bedroom-3', p: [['single-bed', 400, 700, 100, 0]] }, kitchen: { b: '', w: 'butter', p: [] }, living: { b: 'bedroom-2', p: [['sofa', 1, 1, 100, 0]] }, bathroom: { b: 42 }, patio: { b: 'nope', p: [] } } });
  assert.equal(h.rooms.bedroom.b, 'bedroom-3'); assert.equal(h.rooms.kitchen.b, ''); assert.equal(h.rooms.living.b, undefined);
  assert.equal(h.rooms.bathroom.b, 'bathroom-1', 'untouched room'); assert.equal(h.rooms.patio.b, 'patio-1');
  // pieces of a painted room are grounded in its geometry and read back unchanged
  const [pb] = L.readPieces(h.rooms.bedroom.p, 'bedroom-3');
  assert.ok(L.footprint(pb, 'bedroom-3').rear >= L.geo('bedroom-3').back.y1 - 0.5);
  assert.deepEqual(plain(L.writePieces(L.readPieces(h.rooms.bedroom.p, 'bedroom-3'))), plain(h.rooms.bedroom.p));
  assert.deepEqual(plain(L.readHouse(plain(h))), plain(h), 'reads back exactly');
  // goals: the starting scheme is not a new look, another scheme is
  assert.ok(!L.goalsMet({ bedroom: { w: 'candy-stripes', f: 'honey-oak', b: 'bedroom-1', pieces: [] } }).has('paint'));
  assert.ok(L.goalsMet({ bedroom: { w: 'candy-stripes', f: 'honey-oak', b: 'bedroom-2', pieces: [] } }).has('paint'));
});

test('painted rooms: Surprise me lays out every scheme tidily, big pieces at the back, doors kept clear', () => {
  const { DECOR, L } = load();
  const big = ['single-bed', 'bunk-bed', 'canopy-bed', 'fridge', 'bathtub', 'shower', 'dollhouse', 'play-kitchen', 'toy-shelf', 'wardrobe', 'bookshelf'];
  for (const b of DECOR.backdrops) {
    let atBack = 0, total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const out = L.surprise(b.id, () => false, seeded(seed * 53 + b.id.length));
      assert.ok(out.length >= 4 && out.length <= 40, `${b.id} #${seed}: ${out.length}`);
      for (const p of out) {
        const before = [p.x, p.y]; L.constrain(p, b.id);
        assert.ok(Math.abs(before[0] - p.x) < 0.05 && Math.abs(before[1] - p.y) < 0.05, `${b.id} #${seed}: ${p.id} where it belongs`);
      }
      for (const p of out.filter(p => big.includes(p.id))) { total++; if (L.footprint(p, b.id).rear < L.geo(b.id).back.y1 + 30) atBack++ }
      // no decor window where the painting has its own windows and doors
      if (b.openings.length) assert.ok(!out.some(p => ['curtain-window', 'round-window'].includes(p.id)), `${b.id} #${seed}: a decor window`);
      // the doorway stays free, apart from a centrepiece that has nowhere else to go
      const blocking = out.filter(p => L.inClear(p, b.id) > 0.25);
      assert.ok(blocking.length <= 1, `${b.id} #${seed}: ${blocking.map(p => p.id)} in front of a door`);
    }
    // (beside a wide door in the back wall there may be no room for big pieces: they stand out in the room)
    if (total && !b.openings.some(o => o[4] === 'door')) assert.ok(atBack / total > 0.8, `${b.id}: big pieces against the back wall ${atBack}/${total}`);
  }
});
