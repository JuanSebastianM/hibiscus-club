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
    Object.assign(this,{state,STORIES,objective,dailyPlan,today,storyPayout,offerable,storySteps,dailySteps,dailySummary,currentDay,bagItems,chatLine,DAILY_REWARD,dailyDone,dailyCount,districts,floorAt,depthAt,storyDone,activeStories,SCENERY_PLACES,sceneryNames});`, ctx);
  return ctx;
}

test('each character has her own stories (across all seven residents and places)', () => {
  const { STORIES } = loadIsland(undefined);
  for (const doll of ['adult', 'little']) {
    const s = STORIES[doll];
    assert.ok(s.length >= 3);
    assert.deepEqual(new Set(s.map(x => x.giver)).size, 7, doll + ' stories come from all seven residents');
    assert.deepEqual(new Set(s.flatMap(x => x.steps.map(st => st.at))).size, 7);
    for (const story of s) for (const step of story.steps) assert.ok(step.action && step.line, 'text for every step');
  }
  assert.notEqual(STORIES.adult[0].title, STORIES.little[0].title);
});

test('saves from before per-character stories keep progress without paying twice', () => {
  // fresh, mid-errand, all three old stories done, and a pre-shop save with no life at all
  const fresh = loadIsland(undefined).state.life;
  assert.deepEqual([...fresh.adult.quests], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(fresh.little.credit, 0);
  const mid = loadIsland({ adult: { name: 'Ana', scene: 2, stages: [2, 0, 0] }, little: { stages: [1, 0, 0] } }).state.life;
  assert.deepEqual([...mid.adult.quests], [2, 0, 0, 0, 0, 0, 0, 0], 'the Grown-up keeps her place in the old story');
  assert.equal(mid.adult.name, 'Ana');
  assert.equal(mid.adult.scene, 2);
  assert.deepEqual([...mid.little.quests], [0, 0, 0, 0, 0, 0, 0, 0], "Little Me's unfinished old story starts over as one of hers");
  assert.equal(mid.little.credit, 0);
  const done = loadIsland({ adult: { stages: [3, 3, 4] }, little: { stages: [3, 3, 4] } });
  assert.deepEqual([...done.state.life.adult.quests], [3, 3, 4, 0, 0, 0, 0, 0], 'only the newer stories are left');
  assert.equal(done.state.life.little.credit, 24, 'Little Me already earned 6 + 8 + 10');
  done.state.doll = 'little';
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => done.storyPayout(i)), [0, 0, 0, 6, 8, 10, 8, 10], 'the credit covers the first stories, in order');
  // credit is used up as stories finish (island-life.js subtracts it): 6 + 6 + 8 = 20, 4 left for the fourth
  done.state.life.little.credit = 4; done.state.life.little.quests = [3, 4, 4, 0];
  assert.equal(done.storyPayout(3), 6);
  const junk = loadIsland({ adult: { stages: ['x', 99, -1], quests: 'no', name: '<b>' + 'x'.repeat(50) }, little: 5 }).state.life;
  assert.deepEqual([...junk.adult.quests], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(junk.adult.name.length, 24);
  const saved = loadIsland({ adult: { quests: [6, 1, 0, 9], credit: 5, asked: true, talks: [2, 'a', 3] } }).state.life.adult;
  assert.deepEqual([...saved.quests], [0, 1, 0, 0, 0, 0, 0, 0], 'out-of-range stages are dropped');
  assert.equal(saved.credit, 5);
  assert.equal(saved.asked, true);
  assert.deepEqual([...saved.talks], [2, 0, 3, 0, 0, 0, 0]);
});

test('the objective follows the story, then the dailies, then rests', () => {
  const ctx = loadIsland(undefined), p = ctx.state.life.adult;
  let o = ctx.objective();
  assert.equal(o.kind, 'offer'); assert.equal(o.at, 'boardwalk');
  p.quests[0] = 1; o = ctx.objective();
  assert.equal(o.kind, 'story'); assert.equal(o.at, 'boardwalk'); assert.equal(o.target, 'object');
  assert.equal(ctx.storySteps('boardwalk', 'object').length, 1);
  p.quests[0] = 2; assert.deepEqual([...ctx.bagItems()], ['Striped shell']);
  p.quests = [3, 3, 4, 6, 5, 5, 5, 5];
  o = ctx.objective(); assert.equal(o.kind, 'daily');
  const day = ctx.today(p), plan = ctx.dailyPlan(day.day, 'adult');
  plan.errands.forEach((e, i) => { day.prog[i] = e.type === 'deliver' ? 2 : e.type === 'find' ? 7 : e.type === 'greet' ? 127 : 1; });
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
  const types = new Set(), places = new Set();
  for (let d = 1; d <= 28; d++) {
    const ctx = loadIsland(undefined, { now: `2026-02-${String(d).padStart(2, '0')}T12:00:00` });
    for (const doll of ['adult', 'little']) {
      const pl = ctx.dailyPlan(ctx.currentDay(), doll);
      assert.equal(pl.errands.length, 3);
      assert.equal(new Set(pl.errands.map(e => e.type)).size, 3, 'three different templates');
      for (const e of pl.errands) {
        types.add(e.type);
        if (e.type === 'deliver') { assert.notEqual(e.from, e.to); places.add(e.from); places.add(e.to); }
        if (e.type === 'greet') { assert.equal(new Set(e.who).size, 3); e.who.forEach(k => places.add(k)); }
        if (e.at !== undefined) { assert.ok(e.at >= 0 && e.at < 7); places.add(e.at); }
      }
      // seven treasures a day, one in every place; treasures and find tokens never share a spot
      assert.equal(pl.version, 3);
      assert.equal(pl.sparkles.flat().length, 7);
      assert.ok(pl.sparkles.every(s => s.length === 1));
      pl.sparkles.forEach((s, i) => { const all = [...s, ...pl.tokens[i]].map(String); assert.equal(new Set(all).size, all.length); });
    }
  }
  assert.equal(types.size, 5, 'every template shows up');
  assert.equal(places.size, 7, 'errands visit all seven places');
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

const V2_PLAN = '{"errands":[{"type":"greet","reward":3,"who":[1,3,4]},{"type":"deliver","reward":4,"from":0,"to":4,"item":0},{"type":"tidy","reward":2,"at":2}],"sparkles":[[[0.24,0.9]],[[0.92,0.86]],[[0.45,0.68]],[[0.38,0.85],[0.69,0.655]],[[0.45,0.79]]],"tokens":[[[0.77,0.93],[0.15,0.93],[0.35,0.82]],[[0.47,0.8],[0.1,0.8],[0.36,0.88]],[[0.6,0.9],[0.18,0.86],[0.3,0.92]],[[0.47,0.93],[0.1,0.8],[0.27,0.86]],[[0.37,0.77],[0.66,0.9],[0.3,0.93]]]}';

/* Plays one story from its offer to the end the way island-life.js does: accept, then each step where the
   rules say it can be done, paying storyPayout once at the end. Returns the stars paid. */
function playStory(ctx, doll, i) {
  ctx.state.doll = doll;
  const p = ctx.state.life[doll], story = ctx.STORIES[doll][i];
  assert.equal(ctx.offerable(), i, `${doll} story ${i} is offered next`);
  const o = ctx.objective();
  assert.equal(o.kind, 'offer'); assert.equal(o.at, story.giver);
  p.quests[i] = 1;
  let paid = 0;
  for (let k = 0; k < story.steps.length; k++) {
    const step = story.steps[k], next = ctx.objective();
    assert.equal(next.kind, 'story'); assert.equal(next.at, step.at); assert.equal(next.target, step.target);
    assert.ok(ctx.storySteps(step.at, step.target).some(x => x.i === i), `${doll} ${i} step ${k} can be done at ${step.at}`);
    p.quests[i]++;
    if (ctx.storyDone(p, doll, i)) { const pay = ctx.storyPayout(i); p.credit -= Math.min(p.credit, story.reward); paid += pay; }
  }
  assert.ok(ctx.storyDone(p, doll, i));
  assert.equal(ctx.storySteps(story.steps.at(-1).at, story.steps.at(-1).target).filter(x => x.i === i).length, 0, 'a finished story has nothing left to do');
  return paid;
}

test('the Sunny Cove and Breezy Park stories: two new ones per character, completable, paid once', () => {
  const ctx = loadIsland(undefined);
  for (const doll of ['adult', 'little']) {
    const s = ctx.STORIES[doll];
    assert.equal(s.length, 8);
    assert.deepEqual([...s.slice(4, 6).map(x => x.giver)], ['beach', 'park']);
    // each new story uses both new residents or objects: the sandcastle kit (beach object) and the kite stand (park object)
    const used = s.slice(4, 6).flatMap(x => x.steps.map(st => st.at + ':' + st.target));
    for (const want of ['beach:object', 'park:object', 'beach:person', 'park:person']) assert.ok(used.includes(want), `${doll} uses ${want}`);
    assert.notEqual(s[4].title, ctx.STORIES[doll === 'adult' ? 'little' : 'adult'][4].title);
    for (const story of s) for (const step of story.steps) assert.ok(step.action && step.line && !/undefined|\{/.test(step.action + step.line));
  }
  const total = { adult: 0, little: 0 };
  for (const doll of ['adult', 'little']) for (let i = 0; i < 8; i++) total[doll] += playStory(ctx, doll, i);
  assert.deepEqual(total, { adult: 80, little: 66 }, 'stories pay 6+8+10+12+10+12+10+12 and 6+6+8+10+8+10+8+10');
  for (const doll of ['adult', 'little']) { ctx.state.doll = doll; assert.equal(ctx.offerable(), -1, 'nothing left to offer'); }
  ctx.state.doll = 'adult';
  assert.notEqual(ctx.objective().kind, 'story');
  // the bag carries the kite to Sol and back to Teo (adult story 6), the seed and bucket to Teo (Little Me story 6)
  const bag = loadIsland(undefined), a = bag.state.life.adult;
  a.quests = [3, 3, 4, 6, 5, 4, 0, 0];
  assert.deepEqual([...bag.bagItems()], ['Mended kite']);
  bag.state.doll = 'little'; bag.state.life.little.quests = [3, 4, 4, 5, 5, 3, 0, 0];
  assert.deepEqual([...bag.bagItems()], ['Sunflower seed and little bucket']);
});

test('older saves: everything done before gets only the new stories, never paid again; mid-story saves keep their step', () => {
  // a save with all four stories of each character finished, and stars already paid for them
  const old = loadIsland({ adult: { quests: [3, 3, 4, 6], name: 'Ana', scene: 2, talks: [4, 1, 2] }, little: { quests: [3, 4, 4, 5] } });
  const A = old.state.life.adult;
  assert.deepEqual([...A.quests], [3, 3, 4, 6, 0, 0, 0, 0]);
  assert.deepEqual([...A.talks], [4, 1, 2, 0, 0, 0, 0]);
  assert.deepEqual([...A.topics], [false, false, false, false, false, false, false]);
  assert.equal(old.offerable(), 4, 'the Sunny Cove story is offered');
  assert.equal(old.objective().at, 'beach');
  assert.deepEqual([0, 1, 2, 3].map(i => old.storySteps(old.STORIES.adult[i].steps[0].at, old.STORIES.adult[i].steps[0].target).length), [0, 0, 0, 0]);
  assert.equal(playStory(old, 'adult', 4) + playStory(old, 'adult', 5), 22);
  assert.equal(playStory(old, 'little', 4) + playStory(old, 'little', 5), 18);
  // mid-story: the Grown-up on step 3 of the lantern concert keeps it; the new stories wait behind it
  const mid = loadIsland({ adult: { quests: [3, 3, 4, 3] } });
  assert.deepEqual([...mid.state.life.adult.quests], [3, 3, 4, 3, 0, 0, 0, 0]);
  assert.equal(mid.offerable(), -1);
  assert.equal(mid.objective().kind, 'story');
  // a saved place index beyond the places is dropped; the new places are valid
  assert.equal(loadIsland({ adult: { scene: 4 } }).state.life.adult.scene, 4);
  assert.equal(loadIsland({ adult: { scene: 6 } }).state.life.adult.scene, 6);
  assert.equal(loadIsland({ adult: { scene: 7 } }).state.life.adult.scene, 0);
});

test('a day record saved before the new places keeps its three-place plan; the next day uses all seven', () => {
  const ctx = loadIsland({ adult: { daily: { day: '2026-11-20', prog: [1, 0, 0], found: 5 } } }, { now: '2026-11-20T15:00:00' });
  const p = ctx.state.life.adult, s = ctx.dailySummary();
  assert.equal(p.daily.v, 1);
  assert.equal(s.plan.version, 1);
  assert.equal(JSON.stringify(s.plan.errands), JSON.stringify(ctx.dailyPlan('2026-11-20', 'adult', 1).errands));
  assert.equal(s.spots, 6); assert.equal(s.found, 2);
  assert.deepEqual([...s.plan.sparkles[3]], []); assert.deepEqual([...s.plan.sparkles[4]], []);
  for (const e of s.plan.errands) { if (e.at !== undefined) assert.ok(e.at < 3); if (e.type === 'greet') assert.deepEqual([...e.who], [0, 1, 2]); }
  assert.equal(p.daily.prog[0], 1, 'progress on that day stays');
  const next = loadIsland({ adult: { daily: { day: '2026-11-20', prog: [1, 0, 0], found: 5 } } }, { now: '2026-11-21T09:00:00' });
  next.today(next.state.life.adult);
  assert.equal(next.state.life.adult.daily.v, 3);
  assert.deepEqual([...next.state.life.adult.daily.prog], [0, 0, 0]);
  assert.equal(next.dailySummary().plan.version, 3);
  // a version 2 record reads back as version 2 with progress at the new places
  const v2 = loadIsland({ adult: { daily: { day: '2026-11-20', v: 2, prog: [31, 7, 0], found: 1 << 9 } } });
  assert.equal(v2.state.life.adult.daily.v, 2);
  assert.deepEqual([...v2.state.life.adult.daily.prog], [31, 7, 0]);
  assert.equal(v2.state.life.adult.daily.found, 512);
});

test('a day record saved with five places keeps its five-place plan exactly; a seven-place record reads back', () => {
  // the version 2 plan of a day, as it was before Sundae Street and Treetop Hideout opened (seeded, so fixed)
  const ctx = loadIsland({ adult: { daily: { day: '2026-11-20', v: 2, prog: [1, 0, 0], found: 1 << 9 } } }, { now: '2026-11-20T15:00:00' });
  const s = ctx.dailySummary();
  assert.equal(s.plan.version, 2);
  assert.equal(s.spots, 6, 'six treasures over five places, as that day began');
  assert.deepEqual([...s.plan.sparkles[5]], []); assert.deepEqual([...s.plan.sparkles[6]], []);
  assert.ok(s.plan.sparkles.slice(0, 5).every(x => x.length >= 1));
  for (const e of s.plan.errands) { if (e.at !== undefined) assert.ok(e.at < 5); if (e.type === 'deliver') assert.ok(e.from < 5 && e.to < 5); if (e.type === 'greet') assert.ok(e.who.every(k => k < 5)); }
  assert.equal(ctx.state.life.adult.daily.prog[0], 1);
  // V2_PLAN was printed by the quests.js of Sunny Cove and Breezy Park for this day (errands, treasures, find spots)
  assert.equal(JSON.stringify({ errands: s.plan.errands, sparkles: s.plan.sparkles.slice(0, 5), tokens: s.plan.tokens.slice(0, 5) }), V2_PLAN, 'exactly the plan that day had before');
  // same day and character, version 3: a different, seven-place plan
  assert.notEqual(JSON.stringify(ctx.dailyPlan('2026-11-20', 'adult', 3)), JSON.stringify(s.plan));
  const v3 = loadIsland({ adult: { daily: { day: '2026-11-20', v: 3, prog: [127, 7, 0], found: (1 << 14) - 1 } } });
  assert.equal(v3.state.life.adult.daily.v, 3);
  assert.deepEqual([...v3.state.life.adult.daily.prog], [127, 7, 0]);
  assert.equal(v3.state.life.adult.daily.found, (1 << 14) - 1);
  const junk = loadIsland({ adult: { daily: { day: '2026-11-20', v: 9, prog: [127, 0, 0], found: 1 << 12 } } });
  assert.equal(junk.state.life.adult.daily.v, 1, 'an unknown version is read as the oldest');
  assert.equal(junk.state.life.adult.daily.prog[0], 0);
});

test('greeting errands name three residents and count only them', () => {
  for (let d = 1; d <= 28; d++) {
    const ctx = loadIsland(undefined, { now: `2026-03-${String(d).padStart(2, '0')}T12:00:00` });
    const g = ctx.dailyPlan(ctx.currentDay(), 'adult').errands.find(e => e.type === 'greet');
    if (!g) continue;
    const other = [0, 1, 2, 3, 4, 5, 6].find(k => !g.who.includes(k));
    assert.equal(ctx.dailyCount(g, 1 << other), 0);
    assert.equal(ctx.dailyDone(g, 1 << other | 1 << g.who[0] | 1 << g.who[1]), false);
    assert.equal(ctx.dailyDone(g, g.who.reduce((m, k) => m | 1 << k, 0)), true);
    return;
  }
  assert.fail('no greeting errand in March');
});

test('new places: walkable floor lines and residents, objects and treasures on the ground', () => {
  const { districts, floorAt, depthAt } = loadIsland(undefined);
  for (const d of districts) {
    for (const [x, y] of [d.person, d.approach, ...d.spots]) {
      assert.ok(x >= (d.xMin ?? .07) && x <= (d.xMax ?? .93), `${d.id} x ${x}`);
      assert.ok(y >= floorAt(d, x) && y <= .94, `${d.id} ${x},${y} is on the walkable ground`);
    }
  }
  // treasures in the new places never sit on the resident (so a click or tap reaches her)
  for (const d of districts.slice(3)) {
    const size = (d.personSize ?? 27) / 100;
    for (const [x, y] of d.spots) assert.ok(Math.abs(x - d.person[0]) > .07 || y < d.person[1] - size || y > d.person[1] + .03, `${d.id} treasure ${x},${y} is clear of ${d.resident}`);
  }
  const beach = districts.find(d => d.id === 'beach');
  assert.ok(floorAt(beach, .15) > .66, 'feet stay in front of the lifeguard chair');
  assert.ok(Math.abs(floorAt(beach, .5) - .62) < .001);
  // Sundae Street: feet stay off the ice-cream cart; Treetop Hideout: only the strip in front of the pool and chest
  const ice = districts.find(d => d.id === 'icecream'), tree = districts.find(d => d.id === 'treehouse');
  assert.ok(floorAt(ice, .85) >= .88, 'in front of the cart');
  assert.ok(floorAt(tree, .5) > .8 && floorAt(tree, .25) > .87, 'below the pool and in front of the chest');
  // the ice-cream street's steeper perspective: smaller at the far kerb, the same size at the front
  assert.ok(depthAt(ice, .72) < depthAt(tree, .72) * .86, 'about 17 % smaller at the back of the street');
  assert.ok(Math.abs(depthAt(ice, .94) - depthAt(null, .94)) < .02);
  assert.equal(depthAt(districts[0], .6), .83);
});

test('the Sundae Street and Treetop Hideout stories: two new ones per character, completable, paid once', () => {
  const ctx = loadIsland(undefined);
  for (const doll of ['adult', 'little']) {
    const s = ctx.STORIES[doll];
    assert.deepEqual([...s.slice(6).map(x => x.giver)], ['icecream', 'treehouse']);
    const used = s.slice(6).flatMap(x => x.steps.map(st => st.at + ':' + st.target));
    for (const want of ['icecream:object', 'treehouse:object', 'icecream:person', 'treehouse:person']) assert.ok(used.includes(want), `${doll} uses ${want}`);
    assert.notEqual(s[6].title, ctx.STORIES[doll === 'adult' ? 'little' : 'adult'][6].title);
    assert.notEqual(s[7].title, ctx.STORIES[doll === 'adult' ? 'little' : 'adult'][7].title);
  }
  // a save with all six stories of each character finished gets only the two new ones, paid once
  const old = loadIsland({ adult: { quests: [3, 3, 4, 6, 5, 5], daily: { day: '2026-11-20', v: 2, prog: [0, 0, 0], found: 0 } }, little: { quests: [3, 4, 4, 5, 5, 5] } });
  assert.deepEqual([...old.state.life.adult.quests], [3, 3, 4, 6, 5, 5, 0, 0]);
  assert.equal(old.offerable(), 6);
  assert.equal(old.objective().at, 'icecream');
  assert.equal(playStory(old, 'adult', 6) + playStory(old, 'adult', 7), 22);
  assert.equal(playStory(old, 'little', 6) + playStory(old, 'little', 7), 18);
  for (const doll of ['adult', 'little']) { old.state.doll = doll; assert.equal(old.offerable(), -1); }
  // the bag carries the glowing map to Gigi and back to Nina; Little Me's notebook from Teo to the cart
  const bag = loadIsland(undefined);
  bag.state.life.adult.quests = [3, 3, 4, 6, 5, 5, 5, 4];
  assert.deepEqual([...bag.bagItems()], ['Glowing map']);
  bag.state.doll = 'little'; bag.state.life.little.quests = [3, 4, 4, 5, 5, 5, 5, 3];
  assert.deepEqual([...bag.bagItems()], ['Notebook with a flower']);
});

test('scenic postcards: the studio and all seven places', () => {
  const { SCENERY_PLACES, sceneryNames, districts } = loadIsland(undefined);
  assert.equal(SCENERY_PLACES, 7);
  assert.deepEqual([...sceneryNames()].slice(1), [...districts.map(d => d.name)]);
  for (const d of districts) assert.ok((d.postcard ?? .52) >= 0 && (d.postcard ?? .52) <= 1);
  assert.equal(districts[2].postcard, .74, 'the pavilion keeps the crop old postcards were drawn with');
  assert.equal(districts[0].postcard, undefined); assert.equal(districts[1].postcard, undefined);
  const catalog = readFileSync(new URL('catalog.js', dist), 'utf8');
  assert.match(catalog, /out\.backdrop=int\(v\.backdrop,7\)/, 'a saved look can hold every place as its scenery');
});
