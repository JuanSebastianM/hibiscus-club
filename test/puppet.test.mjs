// Run with `node --test` from the repository root (Node 18+, no packages).
// Puppet rig (dist/puppet-rig.js): the measured data is complete and agrees with the catalog, the
// pose math is sound (rest = identity, blending), the walk keeps the stance foot planted without
// hopping, and the clips are deterministic per character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../dist/puppet-rig.js');
const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

function loadCatalog() {
  const ctx = {
    location: { hostname: 'x' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null },
    window: { dispatchEvent() {} }, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] },
    setTimeout: fn => fn(), Intl, console
  };
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js') + read('hair-fit.js') + read('catalog.js') + '\nthis.CATALOG=CATALOG;', ctx);
  return ctx.CATALOG;
}
const DOLLS = ['adult', 'little'], VIEWS = ['front', 'left', 'right', 'back'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('every doll and view has every joint, inside the doll canvas', () => {
  for (const doll of DOLLS) for (const view of VIEWS) {
    const rg = R.rig(doll, view);
    for (const bone of R.BONES) {
      const j = rg.joints[R.PIVOT[bone]];
      assert.ok(j, `${doll} ${view} has a pivot for ${bone}`);
      assert.ok(j[0] > 0 && j[0] < 1 && j[1] > 0 && j[1] < 1, `${doll} ${view} ${bone} inside the canvas`);
    }
    for (const end of ['hand0', 'hand1', 'toe0', 'toe1']) assert.ok(rg.joints[end], `${doll} ${view} ${end}`);
    assert.ok(rg.neckCut < rg.px.neck[1] + 20 && rg.skirtTop > rg.px.chest[1], `${doll} ${view} cuts in order`);
    // limbs hang down from the body: shoulder above elbow above wrist, hip above knee above ankle
    for (const i of [0, 1]) {
      assert.ok(rg.px['sh' + i][1] < rg.px['el' + i][1] && rg.px['el' + i][1] < rg.px['wr' + i][1], `${doll} ${view} arm ${i}`);
      assert.ok(rg.px['hip' + i][1] < rg.px['kn' + i][1] && rg.px['kn' + i][1] < rg.px['an' + i][1], `${doll} ${view} leg ${i}`);
    }
    if (view !== 'back') assert.ok(rg.face && rg.face.eyes.length === (rg.side ? 1 : 2), `${doll} ${view} face`);
  }
});

test('rig origins agree with the catalog, and the right view mirrors the left', () => {
  const CATALOG = loadCatalog();
  for (const doll of DOLLS) for (const view of VIEWS) assert.deepEqual([...CATALOG.dolls[doll].views[view].origin], R.ORIGINS[doll][view], `${doll} ${view}`);
  for (const doll of DOLLS) {
    const l = R.rig(doll, 'left'), r = R.rig(doll, 'right'), ol = R.ORIGINS[doll].left[0], or = R.ORIGINS[doll].right[0];
    for (const k of Object.keys(l.px)) {
      assert.ok(near(r.px[k][0], or + R.MIRROR[doll] - (l.px[k][0] - ol)), `${doll} ${k} mirrored x`);
      assert.equal(r.px[k][1], l.px[k][1]);
    }
    assert.equal(l.dir, -1); assert.equal(r.dir, 1);
  }
});

test('the side-view arm polygon in the catalog lies around the rig arm', () => {
  const CATALOG = loadCatalog();
  for (const doll of DOLLS) {
    const dv = CATALOG.dolls[doll].views.left, rg = R.rig(doll, 'left'), [ox, oy] = dv.origin;
    const inside = ([x, y]) => { let c = false; const p = dv.arm.map(([a, b]) => [a + ox, b + oy]); for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c } return c };
    for (const k of ['el0', 'wr0']) assert.ok(inside(rg.px[k]), `${doll} ${k} inside the near arm`);
  }
});

test('every outfit has a garment kind; unknown outfits count as skirts (they never tear)', () => {
  const CATALOG = loadCatalog();
  for (const it of CATALOG.itemList.filter(i => i.category === 'outfit')) assert.ok(['trousers', 'skirt'].includes(R.OUTFIT_KIND[it.id]), it.id);
  assert.equal(R.outfitKind('not-an-outfit'), 'skirt');
});

test('the rest pose leaves every bone where it is', () => {
  for (const doll of DOLLS) for (const view of VIEWS) {
    const rg = R.rig(doll, view), W = R.forward(rg, R.restPose());
    for (const m of W) assert.deepEqual(m.map(v => Math.round(v * 1e9) / 1e9 + 0), [1, 0, 0, 1, 0, 0]);
  }
});

test('local matrices rotate about the joint and blend by angle (no collapse at half way)', () => {
  const J = [100, 200], b = { r: Math.PI / 2, x: 0, y: 0, sx: 1, sy: 1 };
  const full = R.localMatrix(b, J, 1), half = R.localMatrix(b, J, .5);
  assert.deepEqual(R.apply(full, J).map(v => Math.round(v * 1e6) / 1e6), J);
  const p = [100, 300], q = R.apply(half, p);
  assert.ok(near(Math.hypot(q[0] - J[0], q[1] - J[1]), 100, 1e-9), 'half rotation keeps the length');
  assert.ok(near(Math.atan2(q[1] - J[1], q[0] - J[0]), Math.PI / 2 + Math.PI / 4, 1e-9));
});

test('mixPose and addPose blend as documented', () => {
  const a = R.restPose(), b = R.restPose();
  b.bones[R.B.head].r = 1; b.bones[R.B.hips].x = 10; b.face.jaw = 3; b.face.smile = .5;
  const m = R.mixPose(R.copyPose(a), b, .25);
  assert.ok(near(m.bones[R.B.head].r, .25) && near(m.bones[R.B.hips].x, 2.5));
  const s = R.addPose(R.copyPose(b), b, 1);
  assert.ok(near(s.bones[R.B.head].r, 2) && near(s.face.smile, 1) && near(s.face.jaw, 3), 'rotations add, the jaw takes the larger');
  assert.equal(R.mixPose(R.copyPose(a), b, 0).bones[R.B.head].r, 0);
});

test('clips are deterministic per character, and two characters do not move in sync', () => {
  const rg = R.rig('adult', 'front');
  const ctx = seed => ({ seed, doll: 'adult', rig: rg, energy: 1 });
  const at = (seed, t) => R.idlePose(t, ctx(seed));
  assert.deepEqual(at(5, 3.3), at(5, 3.3));
  let differ = 0; for (let t = 0; t < 10; t += .5) if (Math.abs(at(5, t).bones[R.B.hips].x - at(9, t).bones[R.B.hips].x) > .2) differ++;
  assert.ok(differ > 10, 'different seeds sway differently');
  // blinks: natural intervals (2.4 s to 6 s), each a quick close and open
  let closed = 0, starts = [], was = false;
  for (let t = 0; t < 120; t += 1 / 120) { const b = R.blinkAt(t, 1234); if (b > .9) closed++; if (b > .5 && !was) starts.push(t); was = b > .5 }
  const gaps = starts.slice(1).map((s, i) => s - starts[i]).filter(g => g > .4);
  assert.ok(starts.length >= 20 && starts.length <= 60, `blinks per two minutes: ${starts.length}`);
  assert.ok(Math.min(...gaps) >= 2.3 && Math.max(...gaps) <= 6.1, 'blink intervals');
  assert.ok(closed / 120 / 120 < .05, 'eyes are open nearly all the time');
});

function footWorld(doll, view, phase, pace = 0) {
  const rg = R.rig(doll, view), p = R.walkPose(phase, { seed: 1, doll, rig: rg, pace }), W = R.forward(rg, p);
  return { rg, p, toe: R.apply(W[R.B.foot0], rg.px.toe0), ankle: R.apply(W[R.B.foot0], rg.px.an0), hips: R.apply(W[R.B.hips], rg.px.hips) };
}
test('side walk: the stance foot stays planted while the body travels (no sliding), at every pace', () => {
  for (const doll of DOLLS) for (const view of ['left', 'right']) for (const pace of [0, .5, 1]) {
    const C = R.cycleLength(doll, view, pace), g = R.gait(doll, pace), dir = R.rig(doll, view).dir;
    // world x of the toe = local x + distance travelled (the body moves `dir` while the cycle runs)
    const xs = [], ys = [];
    for (let ph = g.stance * .2; ph < g.stance * .7; ph += .01) { const f = footWorld(doll, view, ph, pace); xs.push(f.toe[0] + dir * ph * C); ys.push(f.toe[1]) }
    const slide = Math.max(...xs) - Math.min(...xs), lift = Math.max(...ys) - Math.min(...ys);
    // under 2 doll px: about 0.4 screen px at the size she walks in the scenes
    assert.ok(slide < 2, `${doll} ${view} pace ${pace}: toe slides ${slide.toFixed(2)} px during stance`);
    assert.ok(lift < 1.5, `${doll} ${view} pace ${pace}: toe stays on the ground (${lift.toFixed(2)} px)`);
  }
});
test('walking pace: short hops stroll, crossing a scene is brisk (Grown-up under 4 s, Little Me under 5 s)', () => {
  // a walk-in place is about 1.5 times as wide as it is tall; the walker is .325 (Grown-up) or .225
  // (Little Me) of its height for 970 doll px, so the full width is width / (size / 970) doll px
  for (const [doll, size, limit] of [['adult', .325, 4], ['little', .225, 5]]) {
    const width = 1.51 / (size / 970), pace = R.paceFor(doll, width), t = width / R.walkSpeed(doll, 'left', pace);
    assert.ok(pace > .99 && t <= limit, `${doll} crosses in ${t.toFixed(2)} s`);
    assert.equal(R.paceFor(doll, R.DOLL[doll].legLength), 0, 'a short hop strolls');
    assert.ok(R.walkSpeed(doll, 'left', 0) < R.walkSpeed(doll, 'left', .5) && R.walkSpeed(doll, 'left', .5) < R.walkSpeed(doll, 'left', 1));
    const g = R.gait(doll, 1); assert.ok(2 / g.cycle * 60 <= 340, 'cadence stays a walk');
  }
});
test('side walk: no hopping (hips move a couple of px), feet reach the ground, knees bend forward', () => {
  for (const doll of DOLLS) for (const view of ['left', 'right']) {
    const ys = [], rg = R.rig(doll, view), ground = rg.px.root[1];
    let lowest = -1e9;
    for (let ph = 0; ph < 1; ph += .02) {
      const f = footWorld(doll, view, ph, 1);ys.push(f.hips[1]);
      const W = R.forward(rg, f.p), knee = R.apply(W[R.B.shin0], rg.px.kn0), hip = R.apply(W[R.B.thigh0], rg.px.hip0), an = R.apply(W[R.B.foot0], rg.px.an0);
      // the knee is on the facing side of the hip-ankle line
      const cross = (an[0] - hip[0]) * (knee[1] - hip[1]) - (an[1] - hip[1]) * (knee[0] - hip[0]);
      assert.ok(cross * rg.dir <= 1e-3 * Math.abs(cross) + 1e-6 || Math.abs(cross) < 50, `${doll} ${view} knee bends the right way at ${ph.toFixed(2)}`);
      lowest = Math.max(lowest, f.toe[1]);
    }
    const bob = Math.max(...ys) - Math.min(...ys);
    assert.ok(bob <= 5.5, `${doll} ${view} hip bob ${bob.toFixed(2)} px (of a ${rg.legLength} px leg)`);
    assert.ok(Math.abs(lowest - (rg.px.toe0[1])) < 2, `${doll} ${view}: the toe reaches the ground`);
  }
});
test('front and back walk: the stance foot is planted against the travel; the toddler stands wider', () => {
  for (const doll of DOLLS) for (const view of ['front', 'back']) {
    const rg = R.rig(doll, view), C = R.cycleLength(doll, view), g = R.GAIT[doll], toward = view === 'front' ? 1 : -1;
    const ys = [];
    for (let ph = .05; ph < g.stance * .9; ph += .01) {
      const p = R.walkPose(ph, { seed: 1, doll, rig: rg }), W = R.forward(rg, p), a = R.apply(W[R.B.foot0], rg.px.an0);
      ys.push(a[1] + toward * ph * C - p.bones[R.B.root].y);
    }
    const slide = Math.max(...ys) - Math.min(...ys);
    assert.ok(slide < 2.5, `${doll} ${view}: foot slides ${slide.toFixed(2)} px`);
  }
  const kid = R.walkPose(.3, { seed: 1, doll: 'little', rig: R.rig('little', 'front') });
  assert.ok(kid.bones[R.B.thigh0].r > 0 && kid.bones[R.B.thigh1].r < 0, 'toddle: legs slightly apart');
});
test('emotes end, and a wave lifts the arm', () => {
  const rg = R.rig('adult', 'front'), ctx = { seed: 1, doll: 'adult', rig: rg };
  for (const name of Object.keys(R.DURATION)) {
    assert.equal(R.emotePose(name, R.DURATION[name] + .01, ctx).done, true, name);
    const end = R.emotePose(name, R.DURATION[name], ctx).pose;
    assert.ok(end.bones.every(b => Math.abs(b.r) < 1e-6), `${name} returns to rest`);
  }
  // the raised-arm emotes cross-fade the posed arm in and out: none at the start and the end, full between
  for (const [name, pose, arms] of [['wave', 'wave', [1, 0]], ['cheer', 'cheer', [1, 1]], ['pose', 'hip', [1, 0]]]) {
    const at = t => R.emotePose(name, t, ctx).pose.raise;
    assert.equal(at(0).pose, pose, name);
    assert.deepEqual(at(0).w, [0, 0], `${name} starts on the standing arm`);
    assert.deepEqual(at(R.DURATION[name] - .01).w, [0, 0], `${name} ends on the standing arm`);
    assert.deepEqual(at(R.DURATION[name] / 2).w, arms, `${name} shows the posed arm(s)`);
    // the posed hand is above the shoulder for the wave and the cheer, at the hip for the pose
    const art = R.POSE_ARMS.adult[pose].arms[0];
    if (pose === 'hip') assert.ok(art.hand[1] > art.el[1] && art.hand[0] > art.el[0], 'the hand comes back in to the hip');
    else assert.ok(art.hand[1] < art.sh[1] - 40, `${name}: the hand is above the shoulder`);
  }
});
test('raised-arm art: every pose of both dolls is on disk, registered on the doll, with its joints in order', () => {
  for (const doll of DOLLS) for (const pose of Object.values(R.RAISED)) {
    const s = R.POSE_ARMS[doll][pose];
    assert.ok(s, `${doll} ${pose}`);
    assert.ok(existsSync(new URL(s.file, dist)), s.file);
    for (const [k, j] of Object.entries(s.arms)) {
      for (const p of Object.values(j)) {
        assert.ok(p[0] >= s.at[0] - 20 && p[0] <= s.at[0] + s.size[0] + 20 && p[1] >= s.at[1] - 20 && p[1] <= s.at[1] + s.size[1] + 20, `${doll} ${pose} joint inside its picture`);
      }
      // the arm is on its own side of the doll (0: the viewer's left)
      assert.ok(+k === 0 ? j.sh[0] < 199 : j.sh[0] > 199, `${doll} ${pose} arm ${k} side`);
    }
  }
});
test('face displacement: the jaw opens only below the mouth line, tapering to the corners', () => {
  for (const doll of DOLLS) for (const view of ['front', 'left']) {
    const f = R.rig(doll, view).face, m = f.mouth, mid = m[Math.floor(m.length / 2)];
    const up = R.faceDisplace(f, { jaw: 1 }, mid[0], mid[1] - .25, false), down = R.faceDisplace(f, { jaw: 1 }, mid[0], mid[1] + .25, true);
    assert.equal(up[1], 0); assert.ok(down[1] > .5, `${doll} ${view} lower lip drops`);
    const corner = f.corners[0], c = R.faceDisplace(f, { jaw: 1 }, corner[0], corner[1] + .25, true);
    assert.ok(c[1] < down[1] * .3, `${doll} ${view} corners stay closed`);
    const smile = R.faceDisplace(f, { smile: 1 }, corner[0], corner[1], false);
    assert.ok(smile[1] < 0, `${doll} ${view} a smile lifts the corner`);
    const neck = R.faceDisplace(f, { jaw: 1 }, mid[0], f.chin + 30, true);
    assert.equal(neck[1], 0, 'the neck does not move');
  }
});
test('expression art: every doll and view names a sheet slot, and the face picks a valid expression', () => {
  assert.equal(R.EXPRESSIONS.length, 12);
  for (const doll of DOLLS) for (const v of ['front', 'side']) {
    const a = R.EXPRESSION_ART[doll][v]; if (!a) continue;
    assert.ok(a.cell.length === 2 && a.at.length === 2 && a.scale > 0);
    for (const f of [a.file, a.lips]) assert.ok(existsSync(new URL(f, dist)), f + ' exists');
  }
  assert.ok(R.EXPRESSION_ART.adult.front && R.EXPRESSION_ART.little.front, 'both dolls have front heads');
  for (const name of R.EXPRESSIONS) assert.ok(['face', 'eyes', 'mouth'].includes(R.EXPRESSION_REGION[name]), name);
  // channels: a blink while talking keeps both; talking follows the jaw; the Grown-up's smile stays her own
  const T = (f, d = 'little') => R.expressionTargets({ blink: [0, 0], jaw: 0, smile: 0, wide: 0, glance: 0, laugh: 0, surprise: 0, jawMax: 4, ...f }, d);
  assert.deepEqual([T({}).eye, T({}).mouth], [null, null]);
  assert.deepEqual([T({ blink: [1, 1], jaw: 3 }).eye, T({ blink: [1, 1], jaw: 3 }).mouth], ['blink', 'talk-ah']);
  assert.equal(T({ blink: [.3, .3] }).eye, 'half-closed'); assert.equal(T({ blink: [.3, .3] }, 'adult').eye, null);
  assert.equal(T({ jaw: 1.2 }).mouth, 'talk-eh'); assert.equal(T({ jaw: 1.2, wide: -1 }).mouth, 'talk-oh');
  assert.equal(T({ smile: 1 }).mouth, 'big-smile'); assert.equal(T({ smile: 1 }, 'adult').mouth, null);
  assert.equal(T({ glance: -1 }).eye, R.SIDE_GLANCES ? 'look-left' : null); assert.equal(T({ laugh: 1 }).mouth, 'laugh');
  const base = { blink: [0, 0], jaw: 0, smile: 0, wide: 0, glance: 0, laugh: 0, surprise: 0, jawMax: 4 };
  assert.equal(R.expressionFor(base), 'neutral');
  assert.equal(R.expressionFor({ ...base, blink: [1, 1] }), 'blink');
  assert.equal(R.expressionFor({ ...base, jaw: 3.5 }), 'talk-ah');
  assert.equal(R.expressionFor({ ...base, smile: .9 }), 'big-smile');
  for (const k of ['laugh', 'surprise']) assert.ok(R.EXPRESSIONS.includes(R.expressionFor({ ...base, [k]: 1 })));
});
test("expression slots: Little Me's profile heads, and the Grown-up talking, blinking and laughing from her smile", () => {
  // both dolls have side heads now (Little Me's sheet was redrawn as a true profile)
  assert.ok(R.EXPRESSION_ART.little.side && R.EXPRESSION_ART.adult.side, 'both dolls have side heads');
  // the Grown-up's smiling heads: one row of six, every name has a region and a pack-2 fallback, files exist
  assert.equal(R.SMILE_EXPRESSIONS.length, 6);
  for (const name of R.SMILE_EXPRESSIONS) {
    assert.ok(['eyes', 'mouth', 'face'].includes(R.EXPRESSION_REGION[name]), name);
    assert.ok(name in R.EXPRESSION_FALLBACK, name + ' falls back');
    const fb = R.EXPRESSION_FALLBACK[name];
    assert.ok(fb === null || R.EXPRESSIONS.includes(fb), name + ' -> ' + fb);
  }
  for (const v of ['front', 'side']) {
    const sm = R.EXPRESSION_ART.adult[v].smile;
    assert.ok(sm, 'adult ' + v + ' smile sheet');
    for (const f of [sm.file, sm.lips]) assert.ok(existsSync(new URL(f, dist)), f + ' exists');
    for (const n of sm.names) assert.ok(R.SMILE_EXPRESSIONS.includes(n), n);
  }
  assert.equal(R.EXPRESSION_ART.little.front.smile, undefined, 'Little Me keeps her own talk shapes');
  const T = (f, d) => R.expressionTargets({ blink: [0, 0], jaw: 0, smile: 0, wide: 0, glance: 0, laugh: 0, surprise: 0, jawMax: 4, ...f }, d);
  // the Grown-up: smile, talk, smile; a smiling blink; a smiling laugh; at rest her own face
  assert.deepEqual([T({}, 'adult').eye, T({}, 'adult').mouth], [null, null]);
  assert.equal(T({ jaw: .1 }, 'adult').mouth, null, 'a tiny jaw drift at rest keeps her own face');
  assert.equal(T({ jaw: .4 }, 'adult').mouth, 'smile-rest', 'between syllables: the drawn resting smile');
  assert.equal(T({ jaw: 1.2 }, 'adult').mouth, 'smile-eh'); assert.equal(T({ jaw: 1.2, wide: -1 }, 'adult').mouth, 'smile-oh');
  assert.equal(T({ jaw: 3 }, 'adult').mouth, 'smile-ah');
  assert.equal(T({ blink: [1, 1] }, 'adult').eye, 'smile-blink'); assert.equal(T({ laugh: 1 }, 'adult').mouth, 'smile-laugh');
  assert.deepEqual([T({ blink: [1, 1], jaw: 3 }, 'adult').eye, T({ blink: [1, 1], jaw: 3 }, 'adult').mouth], ['smile-blink', 'smile-ah']);
  // Little Me (front and profile) keeps the pack-2 shapes
  assert.equal(T({ jaw: 1.2 }, 'little').mouth, 'talk-eh'); assert.equal(T({ jaw: .4 }, 'little').mouth, null);
  assert.equal(T({ blink: [1, 1] }, 'little').eye, 'blink'); assert.equal(T({ laugh: 1 }, 'little').mouth, 'laugh');
  // talking moves through the smiling heads without ever showing the closed pack-2 mouth
  const rg = R.rig('adult', 'front'), seen = new Set();
  for (let t = 0; t < 8; t += 1 / 30) {
    const p = R.idlePose(t, { seed: 3, doll: 'adult', rig: rg, energy: 1 });R.addPose(p, R.talkPose(t, { seed: 3, doll: 'adult', rig: rg }), 1);
    const m = R.expressionTargets({ ...p.face, jawMax: rg.face.jawMax }, 'adult').mouth;
    assert.ok(m === null || m.startsWith('smile-'), 'talk shape ' + m);
    seen.add(m);
  }
  for (const n of ['smile-eh', 'smile-ah']) assert.ok(seen.has(n), n + ' while talking');
});
test('no side-eye: while SIDE_GLANCES is off, idle and emotes never pick a glance, and nothing looks surprised at rest', () => {
  assert.equal(R.SIDE_GLANCES, false);
  const glance = new Set(['look-left', 'look-right']);
  const CATALOG = loadCatalog();
  for (const doll of [...DOLLS, 'resident']) for (const view of VIEWS) {
    const rg = R.rig(doll === 'resident' ? 'adult' : doll, view);
    for (const seed of [1, 7, 42, 1234]) {
      const ctx = { seed, doll, rig: rg, energy: 1 };
      let smiles = 0;
      for (let t = 0; t < 120; t += 1 / 15) {
        const f = { ...R.idlePose(t, ctx).face, jawMax: 3 };
        const tg = R.expressionTargets(f, doll === 'little' ? 'little' : 'adult');
        assert.ok(!glance.has(tg.eye) && !glance.has(R.expressionFor(f)), `${doll} ${view} idle at ${t.toFixed(2)}`);
        assert.ok(tg.mouth !== 'surprised' && f.surprise === 0, 'no surprise at rest');
        if (f.smile > .3) smiles++;
      }
      assert.ok(smiles > 0, `${doll} ${view} ${seed}: idle has warm moments`);
    }
    const outfit = CATALOG.itemList.find(i => i.category === 'outfit' && i.dolls.includes(doll === 'little' ? 'little' : 'adult')).id;
    for (const name of R.EMOTES) {
      const played = R.emoteFor(name, outfit, view);
      for (let t = 0; t <= R.DURATION[played]; t += .05) {
        const f = { ...R.emotePose(played, t, { seed: 1, doll, rig: rg }).pose.face, jawMax: 3 };
        assert.ok(!glance.has(R.expressionTargets(f, 'adult').eye) && !glance.has(R.expressionFor(f)), `${doll} ${view} ${played} at ${t}`);
      }
    }
  }
});
test('arm-safe emotes: raised arms only in the front view on bare or short sleeves; everywhere else no emote lifts an upper arm', () => {
  const CATALOG = loadCatalog();
  assert.equal(R.RAISED_ARM_EMOTES, true);
  const outfits = CATALOG.itemList.filter(i => i.category === 'outfit');
  for (const it of outfits) assert.ok(['long', 'puff', 'none'].includes(R.sleevesOf(it.id)), it.id);
  for (const id of R.RAISED_FALLBACK) assert.ok(outfits.some(o => o.id === id), `fallback ${id} is an outfit`);
  for (const doll of DOLLS) for (const view of VIEWS) {
    const rg = R.rig(doll, view), ctx = { seed: 1, doll, rig: rg };
    for (const it of outfits.filter(o => o.dolls.includes(doll))) for (const name of R.EMOTES) {
      const played = R.emoteFor(name, it.id, view);
      const raised = view === 'front' && R.sleevesOf(it.id) !== 'long' && !R.RAISED_FALLBACK.has(it.id);
      if (R.ARM_SAFE[name]) assert.equal(played, raised ? name : R.ARM_SAFE[name], `${it.id} ${view} ${name}`);
      // a raised-arm emote replaces the standing arm (which only starts outward as it fades); the others
      // keep it against the body
      const max = R.RAISED[played] ? 14 : R.ARM_SAFE_MAX;
      for (let t = 0; t <= R.DURATION[played]; t += .05) {
        const pose = R.emotePose(played, t, ctx).pose;
        for (const b of ['arm0', 'arm1']) assert.ok(Math.abs(pose.bones[R.B[b]].r) <= max * R.DEG + 1e-9, `${doll} ${view} ${it.id} ${played} ${b} at ${t.toFixed(2)}: ${(pose.bones[R.B[b]].r / R.DEG).toFixed(1)} deg`);
      }
    }
    // the hands stay below the shoulders in every arm-safe emote
    for (const v of Object.values(R.ARM_SAFE)) for (let t = 0; t < R.DURATION[v]; t += .1) {
      const W = R.forward(rg, R.emotePose(v, t, ctx).pose);
      for (const i of [0, 1]) assert.ok(R.apply(W[R.B['hand' + i]], rg.px['hand' + i])[1] > rg.px['sh' + i][1] + 40, `${doll} ${view} ${v} hand ${i} low`);
    }
  }
  // walking still swings the arms
  const rg = R.rig('adult', 'left'), w = R.walkPose(0, { seed: 1, doll: 'adult', rig: rg });
  assert.ok(Math.abs(w.bones[R.B.arm0].r) > 5 * R.DEG, 'arms swing when walking');
});
test('residents have every torso joint and a face', () => {
  for (const id of Object.keys(R.RESIDENTS)) {
    const rg = R.residentRig(id);
    for (const k of ['root', 'hips', 'spine', 'chest', 'neck', 'head']) assert.ok(rg.px[k], `${id} ${k}`);
    assert.equal(rg.face.eyes.length, 2);
    assert.ok(rg.neckCut > rg.face.chin - 10 && rg.neckCut < rg.px.chest[1]);
  }
});

test('portrait puppet: choosing a scenery, frame or sticker repaints at once, even in the same clothes', async () => {
  // puppet.js portrait(), run with stand-ins for the renderer
  const src = read('puppet.js').match(/\n {4}portrait\(canvas,opts=\{\}\)\{[\s\S]*?\n {4}\},\n/)[0].trim().replace(/,$/, '');
  const loads = [], shown = [];
  const env = {
    normalShot: s => ({ ...s }), kick() {},
    lookKey: s => [s.doll, s.outfit, s.hair].join('|'), // as in portrait.js: no scenery, frame or sticker
    paintPortraitParts: s => { loads.push(s.backdrop); return Promise.resolve({ geo: {}, back: s.backdrop }); }
  };
  const api = new Function(...Object.keys(env), `return {${src}}`)(...Object.values(env));
  const p = { ready: Promise.resolve(true), dead: false, fail() {}, setView() {}, emote() {}, setLook: s => shown.push(s.backdrop) };
  api.create = () => p;
  const q = api.portrait({}, { shot: { doll: 'adult', outfit: 'a', hair: 'h', backdrop: 0 } });
  await q.ready;
  const tick = () => new Promise(r => setTimeout(r, 0));
  q.setLookPortrait({ doll: 'adult', outfit: 'a', hair: 'h', backdrop: 3 });
  await tick();
  assert.deepEqual(loads, [0, 3], 'the new scenery is loaded');
  assert.deepEqual(shown, [3], 'and shown');
  q.setLookPortrait({ doll: 'adult', outfit: 'a', hair: 'h', backdrop: 3 });
  await tick();
  assert.deepEqual(shown, [3], 'the same look and scenery changes nothing');
});
