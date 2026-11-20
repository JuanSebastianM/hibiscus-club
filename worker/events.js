/* Hibiscus Club analytics: the event schema and request validation for POST /api/e.
   The client keeps an identical copy of SCHEMA in dist/analytics.js; test/analytics.test.mjs fails
   if the two drift apart, or if the game calls track() with a name or detail that is not listed here.

   Wire format (text/plain or application/json, at most LIMITS.bodyBytes):
     {"v":1,"ev":[{"e":"room","d":"salon","c":"adult","l":"en"},
                  {"e":"makeover","d":"hair","c":"little","l":"es","n":4},
                  {"e":"purchase","d":"outfit","c":"adult","l":"en","b":"20-plus"}]}
   e = event, d = detail, c = character, l = UI language, n = count (aggregated events only),
   b = price band (purchases only). Anything else, anywhere, rejects the whole batch. */

const ROOMS = ['map', 'wardrobe', 'salon', 'booth', 'scrapbook', 'arcade', 'garden', 'runway', 'life'];
const DISTRICTS = ['boardwalk', 'market', 'pavilion'];
const CATEGORIES = ['outfit', 'shoes', 'jewelry', 'hair', 'hair-color', 'makeup', 'nails', 'accessory'];
const GAMES = ['memory', 'bouquet', 'runway'];

export const SCHEMA = {
  events: {
    'visit': ROOMS,             // page load, detail = the room it opened on
    'room': ROOMS,              // a room was opened (including the first one)
    'district': DISTRICTS,      // Island Life travel
    'lang': ['en', 'es'],       // language switched to
    'character': ['adult', 'little'], // character switched to
    'makeover': CATEGORIES,     // owned option put on (aggregated: n per category per flush)
    'tryon': CATEGORIES,        // locked option tried on (aggregated like makeover)
    'surprise': ['wardrobe', 'salon'],
    'favorite': ['saved', 'worn'],
    'purchase': CATEGORIES,     // one per bought option, with a price band
    'game-start': GAMES,
    'game-done': GAMES,
    'chat': DISTRICTS,          // walked up to a resident and started a conversation
    'errand': ['story-1', 'story-2', 'story-3'],
    'photo': ['studio', ...DISTRICTS], // postcard taken in the booth, detail = scenery
    'challenge': ['picnic', 'disco', 'seashell', 'mall', 'rosy', 'midnight', 'homecoming', 'bob'],
    'postcard': ['png'],        // postcard downloaded
    'sound': ['on', 'off'],
    'sparkle': ['on', 'off']
  },
  counted: ['makeover', 'tryon'],
  bands: ['1-9', '10-19', '20-plus'],
  characters: ['adult', 'little'],
  langs: ['en', 'es']
};

export const LIMITS = { bodyBytes: 4096, events: 20, maxCount: 100 };

const has = (list, v) => typeof v === 'string' && list.includes(v);

/* One event object -> a clean copy, or null if anything about it is off. */
export function checkEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const counted = SCHEMA.counted.includes(raw.e), purchase = raw.e === 'purchase';
  const allowed = ['e', 'd', 'c', 'l', ...(counted ? ['n'] : []), ...(purchase ? ['b'] : [])];
  if (Object.keys(raw).some(k => !allowed.includes(k))) return null;
  if (!Object.hasOwn(SCHEMA.events, raw.e) || !has(SCHEMA.events[raw.e], raw.d)) return null;
  if (!has(SCHEMA.characters, raw.c) || !has(SCHEMA.langs, raw.l)) return null;
  const ev = { e: raw.e, d: raw.d, c: raw.c, l: raw.l, n: 1, b: '' };
  if (counted && 'n' in raw) {
    if (!Number.isInteger(raw.n) || raw.n < 1 || raw.n > LIMITS.maxCount) return null;
    ev.n = raw.n;
  }
  if (purchase) {
    if (!has(SCHEMA.bands, raw.b)) return null;
    ev.b = raw.b;
  }
  return ev;
}

/* The request body -> an array of clean events, or null to reject the batch. */
export function parseBatch(text) {
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some(k => k !== 'v' && k !== 'ev') || body.v !== 1) return null;
  if (!Array.isArray(body.ev) || !body.ev.length || body.ev.length > LIMITS.events) return null;
  const out = body.ev.map(checkEvent);
  return out.every(Boolean) ? out : null;
}

/* Coarse device class from the User-Agent. Only the class is stored, never the UA.
   (iPadOS Safari reports a Mac UA by default, so most iPads count as desktop.) */
export function deviceClass(ua) {
  if (typeof ua !== 'string' || !ua) return 'unknown';
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Windows Phone|Android/i.test(ua)) return 'phone';
  return 'desktop';
}

/* Two-letter country from request.cf (XX when unknown; T1 is Tor in Cloudflare's data). */
export function countryCode(cf) {
  const c = cf && cf.country;
  return typeof c === 'string' && /^[A-Z][A-Z0-9]$/.test(c) ? c : 'XX';
}

/* Analytics Engine row. index1 = event name (the sampling key, so a busy event never crowds out
   a rare one). blob1 event, blob2 detail, blob3 character, blob4 language, blob5 country,
   blob6 device, blob7 price band. double1 = count. */
export function toDataPoint(ev, where) {
  return {
    indexes: [ev.e],
    blobs: [ev.e, ev.d, ev.c, ev.l, where.country, where.device, ev.b],
    doubles: [ev.n]
  };
}
