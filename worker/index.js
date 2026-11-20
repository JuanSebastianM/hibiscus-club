/* Hibiscus Club Worker. wrangler.jsonc routes only /api/* and /stats here (assets.run_worker_first);
   every game file is served straight from static assets without running this code.

     POST /api/e   anonymous gameplay events -> Workers Analytics Engine (always a fast, empty reply)
     GET  /stats   the owner's private stats page (see stats.js)

   Nothing here stores or logs IP addresses, user agents, referrers, names or any identifier. */
import { parseBatch, deviceClass, countryCode, toDataPoint, LIMITS } from './events.js';
import { handleStats } from './stats.js';

const reply = (status, headers = {}) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/e') {
      try { return await collect(request, env, url); } catch { return reply(204); }
    }
    if (url.pathname === '/stats') return handleStats(request, env, url);
    if (url.pathname.startsWith('/api/')) return reply(404);
    return env.ASSETS.fetch(request); // not reached with the shipped config; kept as a safe default
  }
};

/* Browsers mark their own same-origin requests with Sec-Fetch-Site; older ones send Origin. This only
   stops other websites from posting through visitors' browsers: a script can forge both headers. */
function sameOrigin(request, url) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';
  return request.headers.get('Origin') === url.origin;
}

async function readCapped(request, cap) {
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) { reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

async function collect(request, env, url) {
  if (request.method !== 'POST') return reply(405, { Allow: 'POST' });
  if (!sameOrigin(request, url)) return reply(403);
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (type && !type.startsWith('text/plain') && !type.startsWith('application/json')) return reply(415);
  if (Number(request.headers.get('Content-Length')) > LIMITS.bodyBytes) return reply(413);
  const text = await readCapped(request, LIMITS.bodyBytes);
  if (text === null) return reply(413);
  const events = parseBatch(text);
  if (!events) return reply(400);
  // The page already sends nothing under GPC or Do Not Track; this catches anything that slips through.
  if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') return reply(204);
  const where = { country: countryCode(request.cf), device: deviceClass(request.headers.get('User-Agent')) };
  if (env.EVENTS) for (const ev of events) {
    try { env.EVENTS.writeDataPoint(toDataPoint(ev, where)); } catch {}
  }
  return reply(204);
}
