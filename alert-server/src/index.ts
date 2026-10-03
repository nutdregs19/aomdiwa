// Aomdiwa alert server (Cloudflare Worker, free plan).
// Once a day (07:05 Thai time) it reads the site's signals.json and pushes ONE notification per phone when:
//   - a stock newly passes all three gates (unless that phone's portfolio is already full of it, or hid it)
//   - a stock that phone holds gets a review flag
//   - the broad market fell hard
// Storage (KV): one key per phone "sub:<hash>" (ticker lists only, never amounts) and "state" (what was seen last run).
// Free-plan limit to remember: ~50 outgoing requests per run, so about 45 phones per run; the second cron picks up the rest.
import { buildPushPayload } from '@block65/webcrypto-web-push';

interface Env {
  SUBS: KVNamespace;
  VAPID_PRIVATE: string; // JWK as JSON text (wrangler secret)
}

interface Sub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  held: string[];
  skip: string[];
  updated: number;
  /** signals date this phone was last handled for (pushed, or nothing to say) */
  done?: string;
}
interface Signals {
  date: string;
  passing: { sym: string; score: number }[];
  flagged: { sym: string; why: string }[];
  market: { day: boolean; deep: boolean; text: string } | null;
}
interface State { date: string; passing: string[]; flagged: string[]; marketDay: boolean; marketDeep: boolean; tries?: { date: string; n: number } }

const APP_URL = 'https://nutdregs19.github.io/aomdiwa/';
const SIGNALS_URL = APP_URL + 'data/signals.json';
const ALLOWED = [/^https:\/\/nutdregs19\.github\.io$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
const MAX_SYMS = 80, PER_RUN = 45;

const cors = (req: Request) => {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.some((r) => r.test(o)) ? o : 'https://nutdregs19.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
};

async function subKey(endpoint: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return 'sub:' + [...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// one key per phone: two phones subscribing at the same moment can no longer overwrite each other
async function loadSubs(env: Env): Promise<{ key: string; sub: Sub }[]> {
  const out: { key: string; sub: Sub }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const k of page.keys) { const sub = (await env.SUBS.get(k.name, 'json')) as Sub | null; if (sub) out.push({ key: k.name, sub }); }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

/** VAPID keys from the stored JWK: public = raw point (0x04 | x | y), private = d. Both base64url. */
function vapidKeys(env: Env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const b = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const raw = new Uint8Array([4, ...b(jwk.x), ...b(jwk.y)]);
  const pub = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // Apple wants aes128gcm (RFC 8291) + the "vapid" scheme; this library sends exactly that
  return { subject: APP_URL, publicKey: pub, privateKey: jwk.d as string };
}

async function push(env: Env, sub: Sub, title: string, body: string, tag: string): Promise<number> {
  const payload = await buildPushPayload(
    { data: { title, body, tag, url: APP_URL }, options: { ttl: 12 * 3600, urgency: 'normal', topic: tag } },
    { endpoint: sub.endpoint, expirationTime: null, keys: sub.keys },
    vapidKeys(env),
  );
  const r = await fetch(sub.endpoint, payload);
  return r.status;
}

/** What to tell one phone today; null = nothing worth a notification. Pure, so it can be tested. */
export function compose(sig: Signals, prev: State | null, sub: Pick<Sub, 'held' | 'skip'>): { title: string; body: string } | null {
  const was = new Set(prev?.passing ?? []), wasFlag = new Set(prev?.flagged ?? []);
  // first run ever: there is no "yesterday", so nothing is "new" — say nothing at all
  if (!prev) return null;
  const entered = prev ? sig.passing.filter((p) => !was.has(p.sym) && !sub.skip.includes(p.sym)).map((p) => p.sym) : [];
  const flags = prev ? sig.flagged.filter((f) => !wasFlag.has(f.sym) && sub.held.includes(f.sym)) : [];
  const market = sig.market && ((sig.market.day) || (sig.market.deep && !prev?.marketDeep)) ? sig.market.text : null;
  const lines: string[] = [];
  if (entered.length) lines.push(`ผ่านครบ 3 ด่าน: ${entered.join(', ')}`);
  for (const f of flags) lines.push(`${f.sym} ที่คุณถือติดธงทบทวน: ${f.why}`);
  if (market) lines.push(market);
  if (!lines.length) return null;
  const title = entered.length ? 'ถึงจังหวะ — มีหุ้นเข้าเกณฑ์ใหม่' : flags.length ? 'หุ้นที่คุณถือติดธงทบทวน' : 'ตลาดร่วงแรง';
  return { title, body: lines.join('\n') };
}

async function run(env: Env) {
  const r = await fetch(SIGNALS_URL, { cf: { cacheTtl: 0 } });
  if (!r.ok) { console.log('signals', r.status); return; }
  const sig = (await r.json()) as Signals;
  const prev = (await env.SUBS.get('state', 'json')) as State | null;
  if (prev?.date === sig.date) { console.log('same day, nothing to do', sig.date); return; } // weekend / holiday
  const subs = await loadSubs(env);
  let failed = 0, sent = 0;
  for (const { key, sub } of subs) {
    if (sub.done === sig.date) continue; // handled in an earlier attempt today
    const msg = compose(sig, prev, sub);
    if (msg) {
      if (sent >= PER_RUN) { failed++; continue; } // over the per-run limit: leave for the next attempt
      try {
        const status = await push(env, sub, msg.title, msg.body, 'daily');
        sent++;
        console.log('push', status, msg.title);
        if (status === 404 || status === 410) { await env.SUBS.delete(key); continue; } // phone turned alerts off
        if (status >= 300) { failed++; continue; }
      } catch (e) { failed++; console.log('push failed', String(e)); continue; }
      await env.SUBS.put(key, JSON.stringify({ ...sub, done: sig.date }));
    }
  }
  // Move on to the new day only when every phone was served — or after three attempts, so one dead phone
  // cannot hold everyone back forever. Until then "state" stays on the old day and the next cron retries.
  const tries = prev?.tries?.date === sig.date ? prev.tries.n + 1 : 1;
  if (failed && tries < 3 && prev) {
    await env.SUBS.put('state', JSON.stringify({ ...prev, tries: { date: sig.date, n: tries } }));
    console.log('will retry', failed, 'phones; attempt', tries);
    return;
  }
  const next: State = { date: sig.date, passing: sig.passing.map((p) => p.sym), flagged: sig.flagged.map((f) => f.sym), marketDay: !!sig.market?.day, marketDeep: !!sig.market?.deep };
  await env.SUBS.put('state', JSON.stringify(next));
}

const syms = (a: unknown): string[] =>
  (Array.isArray(a) ? a : []).filter((s): s is string => typeof s === 'string' && /^[A-Z0-9.-]{1,10}$/.test(s)).slice(0, MAX_SYMS);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    if (req.method !== 'POST') return json({ ok: true, service: 'aomdiwa-alert' });

    let b: any;
    try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const endpoint = b?.sub?.endpoint ?? b?.endpoint;
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return json({ error: 'bad endpoint' }, 400);
    const key = await subKey(endpoint);

    if (url.pathname === '/subscribe') {
      const keys = b.sub?.keys;
      if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return json({ error: 'bad keys' }, 400);
      const old = (await env.SUBS.get(key, 'json')) as Sub | null;
      const next: Sub = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, held: syms(b.held), skip: syms(b.skip), updated: Date.now(), done: old?.done };
      await env.SUBS.put(key, JSON.stringify(next));
      return json({ ok: true });
    }
    if (url.pathname === '/unsubscribe') {
      await env.SUBS.delete(key);
      return json({ ok: true });
    }
    if (url.pathname === '/test') {
      const sub = (await env.SUBS.get(key, 'json')) as Sub | null;
      if (!sub) return json({ error: 'not subscribed' }, 404);
      try {
        const status = await push(env, sub, 'ทดสอบแจ้งเตือนออมดิวะ', 'ถ้าเห็นข้อความนี้ แปลว่าแจ้งเตือนใช้งานได้แล้ว', 'test');
        return json({ ok: status < 300, status });
      } catch (e) { return json({ ok: false, error: String(e) }, 502); }
    }
    return json({ error: 'not found' }, 404);
  },

  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
};
