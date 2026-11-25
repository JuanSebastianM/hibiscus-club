// Run with `node --test` from the repository root (Node 18+, no packages).
// The shared weather (nature.js) and the ambience (ambience.js): the mix table covers every place, the wind
// is bounded and repeatable, the scheduler never writes into the past, and a ten-minute run against a mock
// AudioContext keeps a steady number of audio nodes (every transient node is released when it ends).
// The audible check is a browser render: HibiscusAmbience.render(place, seconds) (see README, Ambience).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8');

function load(extra = {}) {
  const ctx = { console, Math, Object, ...extra };
  vm.createContext(ctx);
  vm.runInContext(read('nature.js') + read('ambience.js') + '\nthis.HibiscusNature=HibiscusNature;this.HibiscusAmbience=HibiscusAmbience;', ctx);
  return ctx;
}

test('the ambience mix table covers every place in the game, and only those', () => {
  const quests = read('quests.js'), game = read('game.js');
  const districts = [...quests.slice(quests.indexOf('const districts'), quests.indexOf('const DISTRICT_IDS')).matchAll(/\{id:'([a-z]+)'/g)].map(m => m[1]);
  const rooms = [...game.slice(game.indexOf('const places'), game.indexOf('const walkPins')).matchAll(/\{id:'([a-z]+)'/g)].map(m => m[1]);
  assert.equal(districts.length, 7); assert.equal(rooms.length, 6);
  const ids = ['island', ...districts, ...rooms, 'scrapbook', 'runway'];
  const { HibiscusAmbience: A } = load();
  assert.deepEqual(Object.keys(A.MIXES).sort(), [...ids].sort());
  for (const d of ['island', ...districts]) assert.ok(A.MIXES[d], d + ' has ambience');
  for (const r of ['wardrobe', 'salon', 'arcade', 'booth', 'house', 'scrapbook', 'runway']) assert.equal(A.MIXES[r], null, r + ' is indoors: silent');
});

test('wind is bounded, deterministic for a seed, and gusts every 6 to 15 seconds', () => {
  const { HibiscusNature: N } = load(), s = N.seed('beach');
  assert.equal(N.seed('beach'), N.seed('beach')); assert.notEqual(N.seed('beach'), N.seed('park'));
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 3600; t += 0.037) {
    const w = N.wind(s, t, (t * 7) % 1);
    assert.ok(Number.isFinite(w));
    lo = Math.min(lo, w); hi = Math.max(hi, w);
  }
  assert.ok(lo >= 0 && hi <= N.WIND_MAX, `${lo}..${hi}`);
  assert.ok(lo < 0.3 && hi > 0.9, 'calm spells and real gusts');
  assert.equal(N.wind(s, 1234.5, 0.3), load().HibiscusNature.wind(s, 1234.5, 0.3), 'same value in a fresh copy');
  for (let k = 0; k < 500; k++) {
    const gap = N.gustStart(s, k + 1) - N.gustStart(s, k);
    assert.ok(gap >= 6 && gap <= 15, `gap ${gap}`);
  }
  // a gust reaches the right side of the picture after the left
  const k = 40, t = N.gustStart(s, k) + 1.5;
  assert.ok(N.wind(s, t, 0) > N.wind(s, t, 1));
  // the wash: a wave every 8.5 s, bounded
  for (let t = 0; t < 200; t += 0.1) { const v = N.wash(t, 0.5); assert.ok(v >= 0 && v <= N.WASH_MAX); }
  assert.ok(Math.abs(N.washStart(100, 0.5) - (N.washStart(100 + 8.5, 0.5) - 8.5)) < 1e-9);
});

test('the scheduler window never starts in the past', () => {
  const { HibiscusAmbience: A } = load();
  for (const [until, now] of [[0, 5], [4.9, 5], [5.2, 5], [100, 5], [5.03, 5]]) {
    const w = A.window(until, now);
    assert.ok(w.from >= now + 0.03 - 1e-12, JSON.stringify({ until, now, w }));
    assert.ok(w.to >= w.from);
    if (until < now) assert.ok(w.from > until, 'a stall skips ahead, it never bursts the backlog');
  }
});

/* A small mock of the Web Audio API: counts nodes, checks every scheduled time against currentTime, and
   fires onended once a source's stop time has passed. */
function mockContext() {
  const c = { currentTime: 0, sampleRate: 4000, live: new Set(), sources: new Set(), past: [] };
  const check = (t, what) => { if (t < c.currentTime - 1e-9) c.past.push(`${what} at ${t.toFixed(3)} < ${c.currentTime.toFixed(3)}`); };
  const param = v => ({ value: v,
    setValueAtTime(x, t) { check(t, 'set'); return this; }, linearRampToValueAtTime(x, t) { check(t, 'ramp'); return this; },
    exponentialRampToValueAtTime(x, t) { check(t, 'exp'); if (!(x > 0)) c.past.push('exp ramp to ' + x); return this; },
    setTargetAtTime(x, t) { check(t, 'target'); return this; }, cancelScheduledValues() { return this; } });
  const node = extra => { const n = { context: c, connect: m => m, disconnect() { c.live.delete(n); }, ...extra }; c.live.add(n); return n; };
  const source = extra => { const s = node({ ...extra, start(t) { check(t ?? c.currentTime, 'start'); }, stop(t) { check(t, 'stop'); s.stopAt = t; c.sources.add(s); } }); return s; };
  Object.assign(c, {
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), gain: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createOscillator: () => source({ frequency: param(440), detune: param(0) }),
    createBufferSource: () => source({ playbackRate: param(1) }),
    createConvolver: () => node({}),
    createDynamicsCompressor: () => node({ threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) }),
    createBuffer: (ch, n, rate) => { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { duration: n / rate, getChannelData: i => d[i] }; },
    advance(dt) {
      c.currentTime += dt;
      for (const s of [...c.sources]) if (s.stopAt <= c.currentTime) { c.sources.delete(s); s.onended?.(); }
    }
  });
  return c;
}

test('ten minutes in every place: steady node count, nothing scheduled in the past', () => {
  const { HibiscusAmbience: A } = load();
  for (const [id, mix] of Object.entries(A.MIXES)) {
    if (!mix) continue;
    const c = mockContext(), core = A.core(c, c.createGain()), inst = A.instance(core, id, t => 5000 + t);
    const counts = [];
    for (let t = 0; t < 600; t += 0.12) {
      c.advance(0.12); inst.tick(c.currentTime);
      if (Math.round(t / 0.12) % 500 === 0) counts.push(inst.nodes);
    }
    assert.deepEqual(c.past, [], id + ': scheduled in the past');
    const early = Math.max(...counts.slice(1, 3)), late = Math.max(...counts.slice(-3));
    assert.ok(early > 5 && late < 400, `${id}: ${counts.join(',')} live nodes`);
    assert.ok(late <= early * 1.6 + 40, `${id}: nodes grow ${counts.join(',')}`);
    // leaving the place releases everything
    inst.fadeOut(c.currentTime);
    for (let i = 0; i < 40; i++) c.advance(0.1);
    inst.dispose();
    assert.equal(inst.nodes, 0, id + ': released');
  }
});
