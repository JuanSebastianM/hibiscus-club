// Run with `node --test` from the repository root (Node 18+, no packages).
// Where the in-scene conversation bubbles go (dist/talk-place.js): inside the scene, off every face,
// apart from each other, the tail reaching the speaker, flipping near the edges and the top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../dist/talk-place.js', import.meta.url), 'utf8') + '\nthis.TalkPlace = TalkPlace;', ctx);
const { TalkPlace } = ctx;

/* A figure standing with its feet at (fx, fy): its box, and its head (the top quarter, middle 60 %). */
function figure(fx, fy, h = 160) {
  const w = h * 0.41, body = { x: fx - w / 2, y: fy - h, w, h };
  return { body, head: { x: body.x + w * 0.2, y: body.y, w: w * 0.6, h: h * 0.25 } };
}
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* Checks every rule for one placement and returns it. */
function placeAndCheck(scene, resident, her, sizes = [[300, 110], [230, 160]]) {
  const items = [
    { w: sizes[0][0], h: sizes[0][1], head: resident.head, prefer: ['above', 'right', 'left'], reach: 40, body: resident.body },
    { w: sizes[1][0], h: sizes[1][1], head: her.head, prefer: ['above', 'left', 'right'], reach: 50, body: her.body }
  ];
  const faces = [resident.head, her.head];
  const spots = TalkPlace.place(scene, items, { avoid: faces, soft: [resident.body, her.body] });
  assert.ok(spots, 'the bubbles fit');
  spots.forEach((s, i) => {
    assert.ok(s.x >= 8 && s.y >= 8 && s.x + s.w <= scene.w - 8 && s.y + s.h <= scene.h - 8, `bubble ${i} inside the scene: ${JSON.stringify(s)}`);
    for (const f of faces) assert.ok(!overlaps(s, f), `bubble ${i} off every face`);
    const head = items[i].head;
    if (s.side === 'above') {
      assert.ok(s.y + s.h <= head.y, 'above the head');
      const tipX = s.x + s.tail;
      assert.ok(tipX >= head.x - 1 && tipX <= head.x + head.w + 1, 'the tail points at the head');
      assert.ok(s.tail >= 20 && s.tail <= s.w - 20, 'the tail stays clear of the corners');
    } else {
      assert.ok(s.side === 'left' ? s.x + s.w <= head.x : s.x >= head.x + head.w - 1, 'beside the figure, on its side');
      const tipY = s.y + s.tail;
      assert.ok(tipY >= head.y && tipY <= items[i].body.y + items[i].body.h * 0.6, 'the tail points at the face or upper body');
    }
  });
  assert.ok(!overlaps(spots[0], spots[1]), 'the bubbles do not overlap');
  return spots;
}

test('the usual case: both bubbles above the two speakers', () => {
  const scene = { w: 900, h: 560 };
  const spots = placeAndCheck(scene, figure(530, 410), figure(420, 440, 180));
  assert.equal(spots.map(s => s.side).join(), 'above,above');
  assert.ok(spots[0].x > spots[1].x, 'the resident (on the right) keeps her bubble on the right');
});

test('a resident at the top of the scene gets a bubble beside her head', () => {
  const scene = { w: 900, h: 560 };
  const spots = placeAndCheck(scene, figure(600, 170), figure(420, 470, 180));
  assert.notEqual(spots[0].side, 'above');
});

test('near the left and right edges the bubbles flip or slide inward', () => {
  const scene = { w: 900, h: 560 };
  const left = placeAndCheck(scene, figure(40, 400), figure(160, 460, 180));
  assert.ok(left.every(s => s.x >= 8));
  const right = placeAndCheck(scene, figure(870, 400), figure(740, 460, 180));
  assert.ok(right.every(s => s.x + s.w <= scene.w - 8));
  const corner = placeAndCheck(scene, figure(860, 180), figure(60, 470, 180));
  assert.equal(corner[0].side, 'left', 'top right corner: beside her head, on the inside');
});

test('a tall reply stack goes beside her when there is no room above', () => {
  const scene = { w: 680, h: 425 };
  const spots = placeAndCheck(scene, figure(400, 320, 115), figure(330, 365, 138), [[260, 120], [230, 250]]);
  assert.notEqual(spots[1].side, 'above');
});

test('a caption can sit along the bottom, and nothing is returned when nothing fits', () => {
  const scene = { w: 600, h: 400 };
  const her = figure(300, 360, 150);
  const [caption] = TalkPlace.place(scene, [{ w: 300, h: 90, head: { x: 280, y: 30, w: 60, h: 30 }, prefer: ['bottom'] }], { avoid: [her.head] });
  assert.equal(caption.side, 'bottom');
  assert.equal(caption.y + caption.h, scene.h - 8);
  assert.equal(TalkPlace.place(scene, [{ w: 700, h: 90, head: her.head }]), null, 'wider than the scene');
  assert.equal(TalkPlace.place({ w: 300, h: 200 }, [
    { w: 280, h: 120, head: { x: 100, y: 130, w: 30, h: 30 } }, { w: 280, h: 120, head: { x: 180, y: 130, w: 30, h: 30 } }
  ], { avoid: [] }), null, 'two big bubbles in a tiny scene');
});

test('every placement in a sweep of positions keeps the rules', () => {
  for (const scene of [{ w: 913, h: 570 }, { w: 820, h: 512 }, { w: 680, h: 425 }]) {
    for (let rx = 0.06; rx <= 0.95; rx += 0.11) for (let ry = 0.35; ry <= 0.95; ry += 0.15) {
      const h = scene.h * 0.27, resident = figure(rx * scene.w, ry * scene.h, h);
      const hx = rx > 0.5 ? rx - 0.13 : rx + 0.13, her = figure(hx * scene.w, Math.min(0.94, ry + 0.04) * scene.h, scene.h * 0.3);
      const spots = TalkPlace.place(scene, [
        { w: 280, h: 110, head: resident.head, prefer: ['above', 'right', 'left'], reach: 30, body: resident.body },
        { w: 220, h: 150, head: her.head, prefer: ['above', 'left', 'right'], reach: 50, body: her.body }
      ], { avoid: [resident.head, her.head] });
      if (!spots) continue; // the game then uses the bottom sheet
      for (const s of spots) {
        assert.ok(TalkPlace.inside(s, scene), 'inside');
        assert.ok(!overlaps(s, resident.head) && !overlaps(s, her.head), 'off the faces');
      }
      assert.ok(!overlaps(spots[0], spots[1]));
    }
  }
});
