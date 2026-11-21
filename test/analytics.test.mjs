// Run with `node --test` from the repository root (Node 18+, no packages).
// Keeps the client's event schema identical to the Worker's, checks every track() call in the game
// against it, exercises the Worker's validation, and checks i18n key parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { SCHEMA, parseBatch, checkEvent, deviceClass, countryCode, toDataPoint, LIMITS } from '../worker/events.js';

const dist = new URL('../dist/', import.meta.url);
const read = name => readFileSync(new URL(name, dist), 'utf8');

function loadClient(env = {}) {
  const listeners = {};
  const context = {
    location: { protocol: 'https:', hostname: env.hostname || 'hibiscus-club.example.workers.dev' },
    navigator: { globalPrivacyControl: env.gpc, doNotTrack: env.dnt, sendBeacon: (url, body) => { context.sent.push({ url, body: JSON.parse(body) }); return true; } },
    document: { addEventListener: () => {}, querySelector: () => null, visibilityState: 'visible' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    setTimeout: () => 1, clearTimeout: () => {}, console, sent: [], listeners
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('analytics.js') + '\nthis.HibiscusAnalytics = HibiscusAnalytics;', context);
  return context;
}

test('client schema is identical to the Worker schema', () => {
  const client = loadClient().HibiscusAnalytics.SCHEMA;
  assert.deepEqual(JSON.parse(JSON.stringify(client)), JSON.parse(JSON.stringify(SCHEMA)));
});

test('every track() call in the game uses a listed event (and a listed literal detail)', () => {
  const files = readdirSync(dist).filter(f => f.endsWith('.js') && f !== 'analytics.js');
  let calls = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/\btrack\('([^']+)'(?:,'([^']*)'(?=[,)]))?/g)) {
      calls++;
      assert.ok(Object.hasOwn(SCHEMA.events, m[1]), `${f}: unknown event ${m[1]}`);
      if (m[2] !== undefined) assert.ok(SCHEMA.events[m[1]].includes(m[2]), `${f}: ${m[1]} detail ${m[2]}`);
    }
  }
  assert.ok(calls >= 20, 'expected the game to be instrumented');
});

test('client batches, aggregates makeover counts and sends only schema values', () => {
  const ctx = loadClient(), A = ctx.HibiscusAnalytics;
  A.init(true, () => ({ c: 'adult', l: 'es' }));
  A.track('room', 'salon');
  for (let i = 0; i < 5; i++) A.track('makeover', 'hair');
  A.track('makeover', 'nails');
  A.track('purchase', 'outfit', '20-plus');
  A.track('room', 'not-a-room');
  A.track('nonsense', 'x');
  A.track('purchase', 'outfit'); // no band
  assert.equal(ctx.sent.length, 0, 'nothing sent before a flush');
  ctx.listeners.pagehide();
  assert.equal(ctx.sent.length, 1);
  const { url, body } = ctx.sent[0];
  assert.equal(url, '/api/e');
  assert.deepEqual(body, { v: 1, ev: [
    { e: 'room', d: 'salon', c: 'adult', l: 'es' },
    { e: 'purchase', d: 'outfit', c: 'adult', l: 'es', b: '20-plus' },
    { e: 'makeover', d: 'hair', c: 'adult', l: 'es', n: 5 },
    { e: 'makeover', d: 'nails', c: 'adult', l: 'es', n: 1 }
  ] });
  assert.ok(parseBatch(JSON.stringify(body)), 'the Worker accepts what the client sends');
});

for (const [name, env] of [['GPC', { gpc: true }], ['Do Not Track', { dnt: '1' }], ['localhost', { hostname: 'localhost' }], ['127.0.0.1', { hostname: '127.0.0.1' }]]) {
  test(`client sends nothing with ${name}`, () => {
    const ctx = loadClient(env), A = ctx.HibiscusAnalytics;
    A.init(true, () => ({ c: 'adult', l: 'en' }));
    A.track('visit', 'map'); A.flush(); ctx.listeners.pagehide();
    assert.equal(ctx.sent.length, 0);
  });
}

test('client sends nothing when the player turns sharing off, and drops what was queued', () => {
  const ctx = loadClient(), A = ctx.HibiscusAnalytics;
  A.init(true, () => ({ c: 'little', l: 'en' }));
  A.track('visit', 'map');
  A.setEnabled(false);
  A.track('room', 'salon'); A.flush();
  assert.equal(ctx.sent.length, 0);
  const off = loadClient();
  off.HibiscusAnalytics.init(false, () => ({ c: 'little', l: 'en' }));
  off.HibiscusAnalytics.track('visit', 'map'); off.HibiscusAnalytics.flush();
  assert.equal(off.sent.length, 0);
});

test('Worker validation rejects anything outside the allowlists', () => {
  const ok = { e: 'room', d: 'salon', c: 'adult', l: 'en' };
  const batch = ev => JSON.stringify({ v: 1, ev });
  assert.ok(parseBatch(batch([ok])));
  for (const bad of [
    { ...ok, e: 'Room' }, { ...ok, d: 'kitchen' }, { ...ok, c: 'baby' }, { ...ok, l: 'fr' },
    { ...ok, name: 'Ana' }, { ...ok, n: 2 }, { ...ok, b: '1-9' }, { e: 'makeover', d: 'hair', c: 'adult', l: 'en', n: 0 },
    { e: 'makeover', d: 'hair', c: 'adult', l: 'en', n: 101 }, { e: 'makeover', d: 'hair', c: 'adult', l: 'en', n: 1.5 },
    { e: 'purchase', d: 'outfit', c: 'adult', l: 'en' }, { e: 'purchase', d: 'outfit', c: 'adult', l: 'en', b: '5' },
    { ...ok, d: 'salon'.repeat(100) }, null, 'room', []
  ]) assert.equal(checkEvent(bad), null, JSON.stringify(bad));
  assert.equal(parseBatch(batch([ok, { ...ok, d: 'kitchen' }])), null, 'one bad event rejects the batch');
  assert.equal(parseBatch(batch([])), null);
  assert.equal(parseBatch(batch(Array(LIMITS.events + 1).fill(ok))), null);
  assert.equal(parseBatch(JSON.stringify({ v: 2, ev: [ok] })), null);
  assert.equal(parseBatch(JSON.stringify({ v: 1, ev: [ok], id: 'x' })), null);
  assert.equal(parseBatch('not json'), null);
});

test('island adventure events carry fixed values only (never a player name)', () => {
  const ev = (e, d) => ({ e, d, c: 'little', l: 'es' });
  for (const [e, d] of [['daily', 'deliver'], ['daily', 'tidy'], ['findable', 'market'], ['tutorial', 'done'], ['tutorial', 'skipped'], ['name', 'yes'], ['name', 'no'], ['errand', 'story-4'], ['errand', 'story-6'], ['district', 'pavilion'], ['district', 'beach'], ['chat', 'park'], ['findable', 'beach']])
    assert.ok(checkEvent(ev(e, d)), `${e} ${d}`);
  for (const bad of [ev('name', 'Coral'), ev('name', 'yes '), { ...ev('name', 'yes'), name: 'Coral' }, ev('daily', 'story-1'), ev('findable', 'studio'), ev('tutorial', 'later'), ev('errand', 'story-7'), ev('district', 'icecream'), ev('district', 'treehouse')])
    assert.equal(checkEvent(bad), null, JSON.stringify(bad));
  const ctx = loadClient(), A = ctx.HibiscusAnalytics;
  A.init(true, () => ({ c: 'adult', l: 'en' }));
  A.track('name', 'Coral'); A.track('name', 'yes'); A.track('findable', 'boardwalk'); A.track('daily', 'greet');
  ctx.listeners.pagehide();
  assert.deepEqual(ctx.sent[0].body.ev.map(x => x.e + ':' + x.d), ['name:yes', 'findable:boardwalk', 'daily:greet']);
});

test('Worker data point holds only coarse fields', () => {
  const [ev] = parseBatch(JSON.stringify({ v: 1, ev: [{ e: 'purchase', d: 'hair', c: 'little', l: 'es', b: '10-19' }] }));
  assert.deepEqual(toDataPoint(ev, { country: 'MX', device: 'phone' }),
    { indexes: ['purchase'], blobs: ['purchase', 'hair', 'little', 'es', 'MX', 'phone', '10-19'], doubles: [1] });
  assert.equal(countryCode({ country: 'MX' }), 'MX');
  assert.equal(countryCode({ country: '<script>' }), 'XX');
  assert.equal(countryCode(undefined), 'XX');
  assert.equal(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'), 'phone');
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131 Mobile Safari/537.36'), 'phone');
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/131 Safari/537.36'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131'), 'desktop');
  assert.equal(deviceClass(null), 'unknown');
});

test('i18n dictionaries have the same keys', () => {
  const ctx = { location: { hostname: 'x' }, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, window: { dispatchEvent() {} }, document: {}, Intl, console };
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js') + read('i18n-es.js') + '\nthis.I18N = I18N;', ctx);
  const en = [...ctx.I18N.keys('en')].filter(k => !k.startsWith('catalog.')).sort();
  const es = [...ctx.I18N.keys('es')].filter(k => !k.startsWith('catalog.')).sort();
  assert.deepEqual(es.filter(k => !en.includes(k)), [], 'Spanish-only keys');
  assert.deepEqual(en.filter(k => !es.includes(k)), [], 'English keys missing from Spanish');
});
