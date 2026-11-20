// Run with `node --test` from the repository root (Node 18+, no packages).
// The island adventure's rules (dist/quests.js): old saves migrating, each character's stories,
// daily errands being deterministic per day and character, and the clock guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

/* quests.js with a fake clock; `state` is game.js's save, built here from a raw save the way loadGame does. */
function loadIsland(rawLife, { now = '2026-11-20T10:00:00', dayMax = '' } = {}) {
  const RealDate = Date;
  const fixed = new RealDate(now).getTime();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
  const ctx = {
    location: { hostname: 'x' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null },
    window: { dispatchEvent() {} }, document: {}, Intl, console, Date: FakeDate,
    itemName: id => id, look: () => ({ outfit: 'green-hibiscus-sundress' })
  };
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js') + read('i18n-es.js') +
    'var dollNames={adult:"Grown-up",little:"Little Me"};var state={doll:"adult"};\n' + read('quests.js') +
    `\nstate.life=loadIslandLife(${JSON.stringify(rawLife)});state.dayMax=${JSON.stringify(dayMax)};
    Object.assign(this,{state,STORIES,objective,dailyPlan,today,storyPayout,offerable,storySteps,dailySteps,dailySummary,currentDay,bagItems,chatLine,DAILY_REWARD});`, ctx);
  return ctx;
}

test('each character has her own stories (at least three, across all three residents and places)', () => {
  const { STORIES } = loadIsland(undefined);
  for (const doll of ['adult', 'little']) {
    const s = STORIES[doll];
    assert.ok(s.length >= 3);
    assert.deepEqual(new Set(s.map(x => x.giver)).size, 3, doll + ' stories come from all three residents');
    assert.deepEqual(new Set(s.flatMap(x => x.steps.map(st => st.at))).size, 3);
    for (const story of s) for (const step of story.steps) assert.ok(step.action && step.line, 'text for every step');
  }
  assert.notEqual(STORIES.adult[0].title, STORIES.little[0].title);
});

test('saves from before per-character stories keep progress without paying twice', () => {
  // fresh, mid-errand, all three old stories done, and a pre-shop save with no life at all
  const fresh = loadIsland(undefined).state.life;
  assert.deepEqual([...fresh.adult.quests], [0, 0, 0, 0]);
  assert.equal(fresh.little.credit, 0);
  const mid = loadIsland({ adult: { name: 'Ana', scene: 2, stages: [2, 0, 0] }, little: { stages: [1, 0, 0] } }).state.life;
  assert.deepEqual([...mid.adult.quests], [2, 0, 0, 0], 'the Grown-up keeps her place in the old story');
  assert.equal(mid.adult.name, 'Ana');
  assert.equal(mid.adult.scene, 2);
  assert.deepEqual([...mid.little.quests], [0, 0, 0, 0], "Little Me's unfinished old story starts over as one of hers");
  assert.equal(mid.little.credit, 0);
  const done = loadIsland({ adult: { stages: [3, 3, 4] }, little: { stages: [3, 3, 4] } });
  assert.deepEqual([...done.state.life.adult.quests], [3, 3, 4, 0], 'only the new fourth story is left');
  assert.equal(done.state.life.little.credit, 24, 'Little Me already earned 6 + 8 + 10');
  done.state.doll = 'little';
  assert.deepEqual([0, 1, 2, 3].map(i => done.storyPayout(i)), [0, 0, 0, 0], 'credit covers the first stories');
  // credit is used up as stories finish (island-life.js subtracts it): 6 + 6 + 8 = 20, 4 left for the fourth
  done.state.life.little.credit = 4;
  assert.equal(done.storyPayout(3), 6);
  const junk = loadIsland({ adult: { stages: ['x', 99, -1], quests: 'no', name: '<b>' + 'x'.repeat(50) }, little: 5 }).state.life;
  assert.deepEqual([...junk.adult.quests], [0, 0, 0, 0]);
  assert.equal(junk.adult.name.length, 24);
  const saved = loadIsland({ adult: { quests: [6, 1, 0, 9], credit: 5, asked: true, talks: [2, 'a', 3] } }).state.life.adult;
  assert.deepEqual([...saved.quests], [0, 1, 0, 0], 'out-of-range stages are dropped');
  assert.equal(saved.credit, 5);
  assert.equal(saved.asked, true);
  assert.deepEqual([...saved.talks], [2, 0, 3]);
});

test('the objective follows the story, then the dailies, then rests', () => {
  const ctx = loadIsland(undefined), p = ctx.state.life.adult;
  let o = ctx.objective();
  assert.equal(o.kind, 'offer'); assert.equal(o.at, 'boardwalk');
  p.quests[0] = 1; o = ctx.objective();
  assert.equal(o.kind, 'story'); assert.equal(o.at, 'boardwalk'); assert.equal(o.target, 'object');
  assert.equal(ctx.storySteps('boardwalk', 'object').length, 1);
  p.quests[0] = 2; assert.deepEqual([...ctx.bagItems()], ['Striped shell']);
  p.quests = [3, 3, 4, 6];
  o = ctx.objective(); assert.equal(o.kind, 'daily');
  const day = ctx.today(p), plan = ctx.dailyPlan(day.day, 'adult');
  plan.errands.forEach((e, i) => { day.prog[i] = e.type === 'deliver' ? 2 : e.type === 'find' || e.type === 'greet' ? 7 : 1; });
  assert.equal(ctx.objective().kind, 'rest');
});

test('daily errands: three per character per day, the same all day, new the next day', () => {
  const a = loadIsland(undefined, { now: '2026-11-20T08:00:00' });
  const b = loadIsland(undefined, { now: '2026-11-20T23:59:00' });
  const c = loadIsland(undefined, { now: '2026-11-21T00:01:00' });
  const plan = (ctx, doll) => JSON.stringify(ctx.dailyPlan(ctx.currentDay(), doll));
  assert.equal(plan(a, 'adult'), plan(b, 'adult'), 'a reload during the day keeps the same set');
  assert.notEqual(plan(a, 'adult'), plan(c, 'adult'), 'a new set after midnight');
  assert.notEqual(plan(a, 'adult'), plan(a, 'little'), 'each character has her own set');
  const types = new Set();
  for (let d = 1; d <= 28; d++) {
    const ctx = loadIsland(undefined, { now: `2026-02-${String(d).padStart(2, '0')}T12:00:00` });
    for (const doll of ['adult', 'little']) {
      const pl = ctx.dailyPlan(ctx.currentDay(), doll);
      assert.equal(pl.errands.length, 3);
      assert.equal(new Set(pl.errands.map(e => e.type)).size, 3, 'three different templates');
      for (const e of pl.errands) { types.add(e.type); if (e.type === 'deliver') assert.notEqual(e.from, e.to); }
      // treasures and find tokens never share a spot
      pl.sparkles.forEach((s, i) => { const all = [...s, ...pl.tokens[i]].map(String); assert.equal(new Set(all).size, all.length); });
    }
  }
  assert.equal(types.size, 5, 'every template shows up');
});

test('turning the clock back does not refill the dailies', () => {
  const ctx = loadIsland(undefined, { now: '2026-11-19T12:00:00', dayMax: '2026-11-20' });
  assert.equal(ctx.currentDay(), '2026-11-20');
  const p = ctx.state.life.adult, day = ctx.today(p);
  day.prog[0] = 2;
  assert.equal(ctx.today(p).prog[0], 2, 'progress for the latest day stays');
  const later = loadIsland(undefined, { now: '2026-11-22T12:00:00', dayMax: '2026-11-20' });
  assert.equal(later.currentDay(), '2026-11-22');
  assert.equal(later.state.dayMax, '2026-11-22');
});

test('small talk rotates and uses her name only when she has one', () => {
  const ctx = loadIsland({ adult: { name: 'Coral' } }), p = ctx.state.life.adult;
  const lines = new Set();
  for (let k = 0; k < 24; k++) { p.talks[0] = k; lines.add(ctx.chatLine(0).text); }
  assert.ok(lines.size >= 10, 'many different lines');
  assert.ok([...lines].some(l => l.includes('Coral')));
  const anon = loadIsland(undefined), q = anon.state.life.adult;
  for (let k = 0; k < 24; k++) { q.talks[0] = k; assert.ok(!/\{name\}|undefined/.test(anon.chatLine(0).text)); }
});
