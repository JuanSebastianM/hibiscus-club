/* GET /stats: the owner's private stats page, rendered on the server from the Analytics Engine SQL API.
   Needs three Worker secrets: STATS_KEY (the sign-in key), CF_ACCOUNT_ID and CF_API_TOKEN (a token with
   Account > Account Analytics > Read). Without them it shows setup steps and no data. Signing in sets an
   HttpOnly, Secure, SameSite=Strict cookie on /stats holding an expiring HMAC, never the key itself. */
import { SCHEMA } from './events.js';

const DATASET = 'hibiscus_club_events';
const COOKIE = 'hc_stats';
const SESSION_DAYS = 7;
const RANGES = {
  '24h': { label: '24 hours', days: 1, bucket: 'hour' },
  '7d': { label: '7 days', days: 7, bucket: 'day' },
  '30d': { label: '30 days', days: 30, bucket: 'day' },
  '90d': { label: '90 days', days: 90, bucket: 'day' }
};
const SERIES = { a: '#7a4fb0', b: '#c2387a' }; // lilac, berry: validated as a 2-slot palette on #fffafd

const NAMES = {
  room: { map: 'Island map', wardrobe: 'Dress-Up Studio', salon: 'Beauty Salon', booth: 'Photo Booth', scrapbook: 'Scrapbook', arcade: 'Star Arcade', garden: 'Flower Garden', runway: 'Island Runway', life: 'Island Life' },
  district: { boardwalk: 'Pearl Boardwalk', market: 'Flower Market', pavilion: 'Starlight Pavilion', studio: 'Pink studio' },
  category: { outfit: 'Outfits', shoes: 'Shoes', jewelry: 'Jewelry', hair: 'Hairstyles', 'hair-color': 'Hair color', makeup: 'Makeup', nails: 'Nails', accessory: 'Hair accessories' },
  game: { memory: 'Memory Match', bouquet: 'Bouquet orders', runway: 'Runway rehearsal' },
  challenge: { picnic: 'Picnic in paradise', disco: 'Disco by the sea', seashell: 'Seashell sweetheart', mall: 'Mall crawl Saturday', rosy: 'Rosy glow-up', midnight: 'Midnight boardwalk', homecoming: 'Island homecoming', bob: 'Bouncy bob bash' },
  errand: { 'story-1': 'A shell for the show', 'story-2': 'A window-box wish', 'story-3': 'Opening-night lights' },
  device: { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown' },
  lang: { en: 'English', es: 'Spanish' },
  band: { '1-9': '1–9', '10-19': '10–19', '20-plus': '20+' }
};

/* ---------- entry ---------- */
export async function handleStats(request, env, url) {
  try {
    const missing = ['STATS_KEY', 'CF_ACCOUNT_ID', 'CF_API_TOKEN'].filter(k => typeof env[k] !== 'string' || !env[k].trim());
    const weakKey = !missing.includes('STATS_KEY') && env.STATS_KEY.length < 16;
    if (missing.length || weakKey) return html(setupPage(missing, weakKey));
    if (request.method === 'POST') return await signInOrOut(request, env, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
    if (!(await validSession(request, env))) return html(signInPage());
    const key = Object.hasOwn(RANGES, url.searchParams.get('range')) ? url.searchParams.get('range') : '7d';
    let body;
    try { body = dashboard(await loadStats(env, RANGES[key]), key); }
    catch (e) { body = errorPage(e, key); }
    return html(body);
  } catch {
    return html(shell('Stats unavailable', '<main class="narrow"><h1>Stats unavailable</h1><p>Something went wrong while building this page. Try again in a minute.</p></main>'), 500);
  }
}

/* ---------- sign-in ---------- */
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
/* Constant-time: compare fixed-length digests, never the raw strings. */
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(String(s)))));
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(x, y);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
function readCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}
async function validSession(request, env) {
  const m = /^(\d{10})\.([0-9a-f]{64})$/.exec(readCookie(request));
  if (!m || Number(m[1]) * 1000 < Date.now()) return false;
  return sameSecret(m[2], await hmac(env.STATS_KEY, 'hibiscus-stats:' + m[1]));
}
function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/stats; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
async function signInOrOut(request, env, url) {
  const site = request.headers.get('Sec-Fetch-Site');
  const sameOrigin = site ? site === 'same-origin' : request.headers.get('Origin') === url.origin;
  if (!sameOrigin) return new Response(null, { status: 403 });
  if (Number(request.headers.get('Content-Length')) > 2048) return new Response(null, { status: 413 });
  let form;
  try { form = await request.formData(); } catch { return html(signInPage('Enter your stats key.'), 400); }
  if (form.get('action') === 'sign-out') return redirect(cookie('', 0));
  const given = form.get('key');
  if (typeof given !== 'string' || !given || given.length > 512 || !(await sameSecret(given, env.STATS_KEY)))
    return html(signInPage('That key did not match. Check the STATS_KEY secret and try again.'), 401);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return redirect(cookie(`${exp}.${await hmac(env.STATS_KEY, 'hibiscus-stats:' + exp)}`, SESSION_DAYS * 86400));
}
const redirect = setCookie => new Response(null, { status: 303, headers: { Location: '/stats', 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' } });

/* ---------- data ---------- */
class SqlError extends Error {
  constructor(status, detail) { super('SQL API ' + status); this.status = status; this.detail = detail; }
}
async function sql(env, query) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID.trim())}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CF_API_TOKEN.trim()}` }, body: query
  });
  const text = await res.text();
  if (!res.ok) throw new SqlError(res.status, text.slice(0, 400));
  try { return JSON.parse(text).data || []; } catch { throw new SqlError(res.status, 'The SQL API did not return JSON.'); }
}
/* Analytics Engine may sample: every stored row stands for _sample_interval real events, so counts are
   SUM(_sample_interval * double1) (double1 is the event's own count, 1 except for aggregated makeover
   and try-on events). `w` and `samples` let the page say when a figure is an estimate. */
async function loadStats(env, range) {
  const since = `timestamp > NOW() - INTERVAL '${range.days}' DAY`;
  const bucket = range.bucket === 'hour' ? 'toStartOfHour(timestamp)' : 'toStartOfDay(timestamp)';
  const [timeline, visits, events] = await Promise.all([
    sql(env, `SELECT ${bucket} AS t, SUM(_sample_interval * double1) AS n FROM ${DATASET} WHERE blob1 = 'visit' AND ${since} GROUP BY t ORDER BY t FORMAT JSON`),
    sql(env, `SELECT blob5 AS country, blob6 AS device, blob4 AS lang, SUM(_sample_interval * double1) AS n, SUM(_sample_interval) AS w, count() AS samples FROM ${DATASET} WHERE blob1 = 'visit' AND ${since} GROUP BY country, device, lang FORMAT JSON`),
    sql(env, `SELECT blob1 AS e, blob2 AS d, blob7 AS b, SUM(_sample_interval * double1) AS n, SUM(_sample_interval) AS w, count() AS samples FROM ${DATASET} WHERE blob1 != 'visit' AND ${since} GROUP BY e, d, b FORMAT JSON`)
  ]);
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const sampled = [...visits, ...events].some(r => num(r.w) > num(r.samples));
  const ev = {}, bands = {};
  for (const r of events) {
    if (!Object.hasOwn(SCHEMA.events, r.e)) continue;
    (ev[r.e] ||= {})[r.d] = (ev[r.e][r.d] || 0) + num(r.n);
    if (r.e === 'purchase') (bands[r.d] ||= {})[r.b] = (bands[r.d][r.b] || 0) + num(r.n);
  }
  const by = key => {
    const out = {};
    for (const r of visits) out[r[key] || 'unknown'] = (out[r[key] || 'unknown'] || 0) + num(r.n);
    return out;
  };
  return { range, sampled, timeline: buckets(range, timeline.map(r => [String(r.t), num(r.n)])),
    visits: visits.reduce((s, r) => s + num(r.n), 0), countries: by('country'), devices: by('device'), langs: by('lang'), ev, bands };
}
/* Every hour or day in the range, including empty ones, in UTC. */
function buckets(range, rows) {
  const hour = range.bucket === 'hour', step = hour ? 3600e3 : 86400e3, now = Date.now();
  const keyOf = ms => { const iso = new Date(ms).toISOString(); return hour ? iso.slice(0, 13) : iso.slice(0, 10); };
  const list = [];
  for (let ms = Math.floor((now - range.days * 86400e3) / step) * step; ms <= now; ms += step) list.push({ key: keyOf(ms), n: 0 });
  const at = new Map(list.map(b => [b.key, b]));
  for (const [t, n] of rows) {
    const k = t.replace(' ', 'T').slice(0, hour ? 13 : 10);
    if (at.has(k)) at.get(k).n += n;
  }
  return list.map(b => ({ ...b, label: hour ? b.key.slice(11) + ':00' : b.key.slice(5) }));
}

/* ---------- markup helpers ---------- */
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const sum = obj => Object.values(obj || {}).reduce((s, n) => s + n, 0);
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
function countryName(code) {
  if (code === 'XX') return 'Unknown';
  if (code === 'T1') return 'Tor network';
  try { return regionNames?.of(code) || code; } catch { return code; }
}
function bar(value, max, color = SERIES.b) {
  const w = max > 0 ? Math.max(value > 0 ? 1 : 0, (value / max) * 100) : 0;
  return `<svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect y="1" width="${w.toFixed(2)}" height="8" fill="${color}"/></svg>`;
}
/* A ranked single-series table: label, count, share bar. */
function rankTable(caption, rows, { head = 'Item', empty = 'Nothing yet.', limit = 0 } = {}) {
  let list = rows.filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  if (limit && list.length > limit) {
    const rest = list.slice(limit).reduce((s, r) => s + r[1], 0);
    list = [...list.slice(0, limit), ['Other', rest]];
  }
  if (!list.length) return `<section class="card"><h2>${esc(caption)}</h2><p class="empty">${esc(empty)}</p></section>`;
  const max = Math.max(...list.map(r => r[1])), total = list.reduce((s, r) => s + r[1], 0);
  return `<section class="card"><h2>${esc(caption)}</h2><table><thead><tr><th scope="col">${esc(head)}</th><th scope="col" class="num">Count</th><th scope="col" class="share"><span class="sr-only">Share</span></th></tr></thead><tbody>${
    list.map(([label, n]) => `<tr><th scope="row">${esc(label)}</th><td class="num">${fmt(n)}<small> · ${Math.round((n / total) * 100)}%</small></td><td class="share">${bar(n, max)}</td></tr>`).join('')
  }</tbody></table></section>`;
}
/* Two series per row (e.g. starts vs completions), with a legend and the numbers in text. */
function pairTable(caption, rows, a, b, { head = 'Item', note = '' } = {}) {
  const max = Math.max(1, ...rows.flatMap(r => [r[1], r[2]]));
  const legend = `<p class="legend"><span><i style="background:${SERIES.a}"></i>${esc(a)}</span><span><i style="background:${SERIES.b}"></i>${esc(b)}</span></p>`;
  return `<section class="card"><h2>${esc(caption)}</h2>${legend}<table><thead><tr><th scope="col">${esc(head)}</th><th scope="col" class="num">${esc(a)}</th><th scope="col" class="num">${esc(b)}</th><th scope="col" class="share"><span class="sr-only">Comparison</span></th></tr></thead><tbody>${
    rows.map(([label, x, y]) => `<tr><th scope="row">${esc(label)}</th><td class="num">${fmt(x)}</td><td class="num">${fmt(y)}</td><td class="share"><div class="pair">${bar(x, max, SERIES.a)}${bar(y, max, SERIES.b)}</div></td></tr>`).join('')
  }</tbody></table>${note ? `<p class="note">${note}</p>` : ''}</section>`;
}
function timelineChart(data) {
  const pts = data.timeline, max = Math.max(0, ...pts.map(p => p.n));
  const W = pts.length * 10, H = 100, unit = data.range.bucket === 'hour' ? 'hour' : 'day';
  const rects = pts.map((p, i) => {
    const h = max ? (p.n / max) * (H - 4) : 0;
    return `<g><rect class="hit" x="${i * 10}" y="0" width="10" height="${H}"/><rect x="${i * 10 + 1}" y="${(H - h).toFixed(2)}" width="8" height="${h.toFixed(2)}" rx="1.5" fill="${SERIES.b}"/><title>${esc(p.key)}${unit === 'hour' ? ':00 UTC' : ''}: ${fmt(p.n)} visit${Math.round(p.n) === 1 ? '' : 's'}</title></g>`;
  }).join('');
  const ticks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<span>${esc(pts[i].label)}</span>`).join('');
  const table = `<details><summary>Show as a table</summary><table><thead><tr><th scope="col">${unit === 'hour' ? 'Hour (UTC)' : 'Day (UTC)'}</th><th scope="col" class="num">Visits</th></tr></thead><tbody>${
    pts.slice().reverse().map(p => `<tr><th scope="row">${esc(unit === 'hour' ? p.key.replace('T', ' ') + ':00' : p.key)}</th><td class="num">${fmt(p.n)}</td></tr>`).join('')}</tbody></table></details>`;
  return `<section class="card wide"><h2>Visits per ${unit}</h2><p class="sub">Page loads of the game, ${unit === 'hour' ? 'hour by hour' : 'day by day'} in UTC. Busiest ${unit}: ${fmt(max)}.</p>
    <div class="chart"><span class="ymax" aria-hidden="true">${fmt(max)}</span><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Bar chart of visits per ${unit}; the same numbers are in the table below.">${rects}</svg><div class="ticks" aria-hidden="true">${ticks}</div></div>${table}</section>`;
}
const listOf = (event, names) => (SCHEMA.events[event] || []).map(id => [names[id] || id, 0, id]);

/* ---------- pages ---------- */
function dashboard(d, rangeKey) {
  const ev = d.ev, get = (e, id) => ev[e]?.[id] || 0;
  const range = `<nav class="ranges" aria-label="Time range">${Object.entries(RANGES).map(([k, r]) => `<a href="/stats?range=${k}" ${k === rangeKey ? 'aria-current="page"' : ''}>${r.label}</a>`).join('')}</nav>`;
  const tiles = [
    ['Visits', d.visits], ['Rooms opened', sum(ev.room)], ['Mini-games finished', sum(ev['game-done'])],
    ['Postcards taken', sum(ev.photo)], ['Purchases', sum(ev.purchase)]
  ].map(([k, v]) => `<div class="tile"><b>${fmt(v)}</b><span>${k}</span></div>`).join('');
  const rows = (e, names) => listOf(e, names).map(([label, , id]) => [label, get(e, id)]);
  const games = SCHEMA.events['game-start'].map(id => [NAMES.game[id], get('game-start', id), get('game-done', id)]);
  const makeover = SCHEMA.events.makeover.map(id => [NAMES.category[id], get('makeover', id), get('tryon', id)]);
  const purchases = SCHEMA.events.purchase.map(id => [id, d.bands[id] || {}]).filter(([, b]) => sum(b) > 0);
  const purchaseTable = purchases.length
    ? `<table><thead><tr><th scope="col">Category</th>${SCHEMA.bands.map(b => `<th scope="col" class="num">${esc(NAMES.band[b])}</th>`).join('')}<th scope="col" class="num">Total</th></tr></thead><tbody>${
      purchases.map(([id, b]) => `<tr><th scope="row">${esc(NAMES.category[id])}</th>${SCHEMA.bands.map(k => `<td class="num">${fmt(b[k] || 0)}</td>`).join('')}<td class="num"><b>${fmt(sum(b))}</b></td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">No purchases yet.</p>';
  const small = (title, list) => `<section class="card"><h2>${esc(title)}</h2><table><tbody>${list.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${fmt(v)}</td></tr>`).join('')}</tbody></table></section>`;
  const body = `<header class="top"><div><p class="eyebrow">✦ Hibiscus Club</p><h1>Island stats</h1><p class="sub">Anonymous counts for the last ${esc(d.range.label)}.</p></div>
    <form method="post" action="/stats"><input type="hidden" name="action" value="sign-out"><button class="ghost">Sign out</button></form></header>
    ${range}
    ${d.sampled ? '<p class="notice" role="note"><b>Estimated figures.</b> Cloudflare sampled some of these events, so each stored event is scaled up by the number of events it stands for. Totals are close estimates, not exact counts.</p>' : ''}
    <div class="tiles">${tiles}</div>
    <div class="grid">
      ${timelineChart(d)}
      ${rankTable('Top countries', Object.entries(d.countries).map(([c, n]) => [countryName(c), n]), { head: 'Country', limit: 12, empty: 'No visits yet.' })}
      ${rankTable('Devices', Object.entries(d.devices).map(([k, n]) => [NAMES.device[k] || k, n]), { head: 'Device', empty: 'No visits yet.' })}
      ${rankTable('Game language at visit', Object.entries(d.langs).map(([k, n]) => [NAMES.lang[k] || k, n]), { head: 'Language', empty: 'No visits yet.' })}
      ${rankTable('Rooms opened', rows('room', NAMES.room), { head: 'Room', empty: 'No rooms opened yet.' })}
      ${pairTable('Mini-games', games, 'Started', 'Finished', { head: 'Game' })}
      ${pairTable('Makeover actions', makeover, 'Changes', 'Try‑ons', { head: 'Category', note: 'Changes put on something she owns; try-ons put on something locked from the star shop.' })}
      <section class="card"><h2>Star-shop purchases</h2><p class="sub">Items bought, by category and price in stars.</p>${purchaseTable}</section>
      ${rankTable('Postcards taken, by scenery', rows('photo', NAMES.district), { head: 'Scenery', empty: 'No postcards yet.' })}
      ${rankTable('Style challenges completed', rows('challenge', NAMES.challenge), { head: 'Brief', empty: 'No challenges completed yet.' })}
      ${small('Scrapbook and favorites', [['Postcards downloaded', sum(ev.postcard)], ['Favorite looks saved', get('favorite', 'saved')], ['Favorite looks worn', get('favorite', 'worn')], ['Surprise me! in the studio', get('surprise', 'wardrobe')], ['Surprise me! in the salon', get('surprise', 'salon')]])}
      ${small('Island Life', [...rows('district', NAMES.district).filter(r => r[0] !== 'Pink studio').map(([k, v]) => ['Trips to ' + k, v]), ...rows('chat', NAMES.district).filter(r => r[0] !== 'Pink studio').map(([k, v]) => ['Conversations at ' + k, v]), ...rows('errand', NAMES.errand).map(([k, v]) => ['Errand done: ' + k, v])])}
      ${small('Settings changed', [['Switched to English', get('lang', 'en')], ['Switched to Spanish', get('lang', 'es')], ['Switched to Grown-up', get('character', 'adult')], ['Switched to Little Me', get('character', 'little')], ['Sound turned off', get('sound', 'off')], ['Sound turned on', get('sound', 'on')], ['Sparkles turned off', get('sparkle', 'off')], ['Sparkles turned on', get('sparkle', 'on')]])}
    </div>
    <footer><p>Times are UTC. Visits are page loads, not people: nothing identifies a player, so one person playing twice counts twice. Players who turned off sharing, or whose browser sends Global Privacy Control or Do Not Track, are not counted. Analytics Engine keeps events for three months.</p></footer>`;
  return shell('Island stats', `<main>${body}</main>`);
}
function signInPage(error = '') {
  return shell('Sign in', `<main class="narrow"><p class="eyebrow">✦ Hibiscus Club</p><h1>Island stats</h1><p class="sub">Enter the stats key to see anonymous play counts.</p>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/stats" class="signin"><label for="key">Stats key</label><input id="key" name="key" type="password" autocomplete="current-password" required maxlength="512" autofocus><button class="primary">Sign in</button></form>
    <p class="note">The key stays in a private cookie for this page only, for ${SESSION_DAYS} days or until you sign out.</p></main>`);
}
function setupPage(missing, weakKey) {
  const items = [
    ['STATS_KEY', 'A long random password you will type to open this page (at least 16 characters). For example, run <code>openssl rand -base64 24</code>.'],
    ['CF_ACCOUNT_ID', 'Your Cloudflare account ID (Workers &amp; Pages overview, or the URL of the dashboard).'],
    ['CF_API_TOKEN', 'An API token with the single permission <b>Account → Account Analytics → Read</b> (My Profile → API Tokens → Create Token → Create Custom Token).']
  ];
  return shell('Set up stats', `<main class="narrow"><p class="eyebrow">✦ Hibiscus Club</p><h1>Stats are not set up yet</h1>
    <p class="sub">No data is shown until all three secrets are set on the <b>hibiscus-club</b> Worker.</p>
    ${weakKey ? '<p class="error" role="alert">STATS_KEY is shorter than 16 characters. Set a longer one.</p>' : ''}
    <ol class="steps">${items.map(([k, v]) => `<li><b><code>${k}</code></b>${missing.includes(k) ? ' <span class="tag">missing</span>' : ' <span class="tag ok">set</span>'}<br>${v}</li>`).join('')}</ol>
    <p>Add each one in the Cloudflare dashboard under <b>Workers &amp; Pages → hibiscus-club → Settings → Variables and Secrets → Add → Secret</b>, or run <code>npx wrangler secret put NAME</code>. Then reload this page.</p></main>`);
}
function errorPage(e, rangeKey) {
  const status = e instanceof SqlError ? e.status : 0;
  const hint = status === 401 || status === 403
    ? 'Cloudflare refused the API token. Check that CF_API_TOKEN has <b>Account → Account Analytics → Read</b> for this account and that CF_ACCOUNT_ID is the same account.'
    : /does not exist|unknown table|not found/i.test(e?.detail || '')
      ? 'The events dataset does not exist yet. Cloudflare creates it with the first event, so play the game once on the live site and try again.'
      : 'The Analytics Engine SQL API did not answer as expected. Try again in a minute.';
  return shell('Stats unavailable', `<main class="narrow"><p class="eyebrow">✦ Hibiscus Club</p><h1>Stats unavailable</h1><p class="error" role="alert">${hint}</p>
    ${e instanceof SqlError ? `<details><summary>Details from Cloudflare (HTTP ${status})</summary><pre>${esc(e.detail)}</pre></details>` : ''}
    <p><a href="/stats?range=${esc(rangeKey)}">Try again</a></p><form method="post" action="/stats"><input type="hidden" name="action" value="sign-out"><button class="ghost">Sign out</button></form></main>`);
}

function html(body, status = 200) {
  return new Response(body, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}
function shell(title, main) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Hibiscus Club</title><style>${CSS}</style></head><body>${main}</body></html>`;
}
const CSS = `:root{color-scheme:light;--plum:#552d51;--muted:#7b5a77;--berry:#a93169;--line:#efc4dc;--paper:#fffafd;font:16px/1.45 "Trebuchet MS","Segoe UI",sans-serif;color:var(--plum)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#fff6fa repeating-linear-gradient(0deg,transparent 0 13px,#f5cadd45 13px 26px),repeating-linear-gradient(90deg,transparent 0 13px,#f5cadd45 13px 26px)}
main{max-width:1240px;margin:auto;padding:28px clamp(16px,4vw,48px) 48px}main.narrow{max-width:560px}
h1{font:italic bold clamp(1.9rem,5vw,2.6rem)/1.1 Georgia,serif;margin:2px 0 6px;color:var(--plum)}h2{font:bold 1.05rem/1.25 Georgia,serif;margin:0 0 10px}
.eyebrow{margin:0;color:var(--berry);font-weight:bold;letter-spacing:.06em;text-transform:uppercase;font-size:.78rem}.sub{margin:0 0 14px;color:var(--muted)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
button,input{font:inherit;color:inherit}button{cursor:pointer;border-radius:999px;padding:9px 18px;border:2px solid #d695bc;background:#fff}
.primary{background:linear-gradient(#e2569a,#c2387a);color:#fff;border-color:#b02f6d;font-weight:bold}.ghost{background:#fff8fc}
:focus-visible{outline:3px solid #7a41a6;outline-offset:3px}
.ranges{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 16px}.ranges a{padding:7px 14px;border-radius:999px;border:2px solid var(--line);background:#fff;color:var(--plum);text-decoration:none;font-weight:bold;font-size:.92rem}.ranges a[aria-current]{background:#7a4fb0;border-color:#7a4fb0;color:#fff}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}.tile{background:var(--paper);border:2px solid var(--line);border-radius:16px;padding:12px 16px}.tile b{display:block;font:bold 1.9rem/1.1 Georgia,serif}.tile span{color:var(--muted);font-size:.9rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}.card{background:var(--paper);border:2px solid var(--line);border-radius:16px;padding:16px;min-width:0;box-shadow:0 3px 12px #a1336712}.card.wide{grid-column:1/-1}
table{width:100%;border-collapse:collapse;font-size:.94rem}th,td{padding:6px 4px;border-bottom:1px solid #f3d6e6;text-align:left;vertical-align:middle}thead th{font-size:.8rem;color:var(--muted);font-weight:bold}tbody th{font-weight:normal}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}thead .num{white-space:normal}.num small{color:var(--muted)}.share{width:34%}.pair{display:grid;gap:3px}thead th{hyphens:none}
svg.bar{display:block;width:100%;height:10px;background:#f7e6f0;border-radius:3px}
.legend{display:flex;gap:16px;margin:-4px 0 6px;font-size:.88rem;color:var(--muted)}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.chart{position:relative;padding-left:0}.chart svg{display:block;width:100%;height:170px}.chart .hit{fill:transparent}.chart g:hover rect:not(.hit){fill:#a12a63}.ymax{position:absolute;top:-2px;right:0;font-size:.78rem;color:var(--muted)}
.chart svg{border-bottom:2px solid #e5aed0}.ticks{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-top:4px}
details{margin-top:10px}summary{cursor:pointer;color:var(--berry);font-weight:bold}details table{margin-top:6px}details pre{white-space:pre-wrap;word-break:break-word;font-size:.82rem;background:#fff;padding:8px;border-radius:8px}
.notice{background:#f4ecff;border:2px solid #cdb6ec;border-radius:12px;padding:10px 14px;margin:0 0 14px}.error{background:#fff0f3;border:2px solid #eba2b5;border-radius:12px;padding:10px 14px;color:#8a1f45}
.empty,.note{color:var(--muted);font-size:.9rem;margin:6px 0 0}footer{margin-top:22px;color:var(--muted);font-size:.88rem;max-width:72ch}
.signin{display:grid;gap:8px;margin:18px 0}.signin input{padding:10px 12px;border:2px solid #d695bc;border-radius:12px;background:#fff;width:100%}.signin button{justify-self:start}
.steps{padding-left:1.2em}.steps li{margin-bottom:12px}code{background:#fbe6f1;padding:1px 5px;border-radius:5px;font-size:.9em;overflow-wrap:anywhere}a{color:var(--berry);font-weight:bold}.tag{font-size:.75rem;font-weight:bold;padding:1px 8px;border-radius:999px;background:#fde0e8;color:#8a1f45}.tag.ok{background:#e4f5e7;color:#25633a}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;
