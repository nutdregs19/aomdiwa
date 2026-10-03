// Daily job: prices + fundamentals for every watched stock → static JSON the site reads.
// Run: node scripts/fetch-data.ts   (Node 24 runs TypeScript directly)
// Writes public/data/market.json, signals.json, log.json and h/<SYM>.json.
import fs from 'node:fs';
import path from 'node:path';
import { judge, marketDrop, median, DEFAULTS, type Ticker, type Valuation, type Group } from '../src/lib/scoring.ts';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DAY = 86400;
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const readJson = (p: string, fallback: any = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', JSON.stringify(data));
  fs.renameSync(p + '.tmp', p);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

async function yahoo(url: string) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.ok) return r.json();
    if (attempt >= 2) throw new Error(`${r.status} ${url.slice(0, 90)}`);
    await sleep(1500 * (attempt + 1));
  }
}

interface Series { dates: string[]; closes: number[]; price: number; name: string }

async function chart(sym: string): Promise<Series> {
  const j: any = await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5y&interval=1d`);
  const r = j.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`no chart for ${sym}`);
  const raw: (number | null)[] = r.indicators.quote[0].close;
  const dates: string[] = [], closes: number[] = [];
  r.timestamp.forEach((t: number, i: number) => {
    const c = raw[i];
    if (c != null && c > 0) { dates.push(iso(t + (r.meta.gmtoffset ?? 0))); closes.push(+c.toFixed(4)); }
  });
  if (closes.length < 2) throw new Error(`too little history for ${sym}`);
  return { dates, closes, price: closes[closes.length - 1], name: r.meta.longName ?? sym };
}

const TYPES = [
  'quarterlyTotalRevenue', 'annualTotalRevenue', 'annualDilutedEPS', 'annualDilutedAverageShares', 'trailingDilutedEPS',
  'quarterlyForwardPeRatio', 'trailingForwardPeRatio', 'quarterlyPeRatio', 'quarterlyPsRatio', 'trailingPsRatio',
];
type Pt = { d: string; v: number };

async function fundamentals(sym: string): Promise<Record<string, Pt[]>> {
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 6 * 365 * DAY;
  const j: any = await yahoo(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?type=${TYPES.join(',')}&period1=${p1}&period2=${p2}`);
  const out: Record<string, Pt[]> = {};
  for (const s of j.timeseries?.result ?? []) {
    const t = s.meta.type[0];
    out[t] = (s[t] ?? []).filter((x: any) => x?.reportedValue?.raw != null).map((x: any) => ({ d: x.asOfDate, v: x.reportedValue.raw }))
      .sort((a: Pt, b: Pt) => a.d.localeCompare(b.d));
  }
  return out;
}

/** Close on the last trading day at or before `d`. */
function closeAt(s: Series, d: string): number | null {
  let lo = 0, hi = s.dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans < 0 ? null : s.closes[ans];
}

/** Drop glitches (Yahoo has the odd 4.69 among 40s), then the median. */
function cleanMedian(pts: Pt[]): { med: number; n: number; since: string } | null {
  let v = pts.filter((p) => p.v > 0 && Number.isFinite(p.v));
  if (v.length < 4) return null;
  const m0 = median(v.map((p) => p.v));
  v = v.filter((p) => p.v > m0 / 3 && p.v < m0 * 3);
  if (v.length < 4) return null;
  return { med: median(v.map((p) => p.v)), n: v.length, since: v.reduce((a, p) => (p.d < a ? p.d : a), v[0].d) };
}

/** Yahoo's ratio is as of some past day; move it to today's price. */
function toToday(s: Series, p: Pt | undefined): number | null {
  if (!p || !(p.v > 0)) return null;
  const then = closeAt(s, p.d);
  return then ? (p.v * s.price) / then : null;
}

function valuation(s: Series, f: Record<string, Pt[]>): Valuation | null {
  const last = (k: string) => f[k]?.[f[k].length - 1];
  const dedupe = (a: Pt[]) => [...new Map(a.map((p) => [p.d, p])).values()];
  const make = (metric: Valuation['metric'], current: number | null, hist: Pt[], maxCur: number): Valuation | null => {
    const m = cleanMedian(dedupe(hist));
    if (!current || !m || current > maxCur) return null;
    return { metric, current: +current.toFixed(2), median: +m.med.toFixed(2), n: m.n, since: m.since };
  };

  // 1) price / next-year earnings — the usual yardstick for a growing, profitable company
  const fpe = make('fpe', toToday(s, last('trailingForwardPeRatio')), [...(f.quarterlyForwardPeRatio ?? []), ...(f.trailingForwardPeRatio ?? [])], 150);
  if (fpe) return fpe;

  // 2) price / last-year earnings, with our own fiscal-year-end points for a longer memory
  const eps = last('trailingDilutedEPS');
  const peFY = (f.annualDilutedEPS ?? []).map((p) => ({ d: p.d, v: p.v > 0 ? (closeAt(s, p.d) ?? 0) / p.v : 0 }));
  const pe = make('pe', eps && eps.v > 0 ? s.price / eps.v : null, [...peFY, ...(f.quarterlyPeRatio ?? [])], 150);
  if (pe) return pe;

  // 3) price / sales for companies without profit yet (above 50× the number says nothing)
  const sh = f.annualDilutedAverageShares ?? [];
  const psFY = (f.annualTotalRevenue ?? []).map((p) => {
    const shares = sh.find((x) => x.d === p.d)?.v, c = closeAt(s, p.d);
    return { d: p.d, v: shares && c && p.v > 0 ? (c * shares) / p.v : 0 };
  });
  // A company whose sales just multiplied (first revenue, a merger) has no "usual" price/sales to compare with.
  const g = revGrowth(f);
  if (g != null && g > 3) return null;
  const psHist = [...psFY, ...(f.quarterlyPsRatio ?? []), ...(f.trailingPsRatio ?? [])].filter((p) => p.v <= 50);
  return make('ps', toToday(s, last('trailingPsRatio')), psHist, 50);
}

/** Latest quarter's revenue vs the same quarter a year before. */
function revGrowth(f: Record<string, Pt[]>): number | null {
  const q = f.quarterlyTotalRevenue ?? [];
  const now = q[q.length - 1];
  if (!now) return null;
  const t = Date.parse(now.d);
  const prev = q.find((p) => Math.abs(t - Date.parse(p.d) - 365 * DAY * 1000) < 20 * DAY * 1000);
  return prev && prev.v > 0 ? +(now.v / prev.v - 1).toFixed(4) : null;
}

function weekly(s: Series, days: number): number[] {
  const from = Math.max(0, s.closes.length - days), out: number[] = [];
  for (let i = s.closes.length - 1; i >= from; i -= 5) out.push(s.closes[i]);
  return out.reverse();
}

// ---------- run ----------
const watch = readJson(path.join(ROOT, 'data-src', 'watchlist.json')).tickers as { sym: string; name: string; what: string; group: Group }[];
const prevMarket: { tickers: Ticker[] } | null = readJson(path.join(OUT, 'market.json'));
const prevBy = Object.fromEntries((prevMarket?.tickers ?? []).map((t) => [t.sym, t]));

// flags from the newest monthly review
const monthlyDir = path.join(OUT, 'monthly');
const months = fs.existsSync(monthlyDir) ? fs.readdirSync(monthlyDir).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).sort() : [];
const review = months.length ? readJson(path.join(monthlyDir, months[months.length - 1])) : null;
const reviewFlags: Record<string, string> = review?.flags ?? {};

const tickers: Ticker[] = [];
const failed: string[] = [];
for (const w of watch) {
  if (only.length && !only.includes(w.sym)) { if (prevBy[w.sym]) tickers.push(prevBy[w.sym]); continue; }
  try {
    const s = await chart(w.sym);
    const f: Record<string, Pt[]> | null = w.group === 'bench' ? {} : await fundamentals(w.sym).catch(() => null);
    const old = prevBy[w.sym];
    const yearAgo = Math.max(0, s.closes.length - 252);
    const high52 = Math.max(...s.closes.slice(yearAgo));
    // fundamentals unreachable today: keep yesterday's reading rather than pretend there is none
    const growth = f ? revGrowth(f) : old?.revGrowth ?? null;
    const flag: Ticker['flag'] = reviewFlags[w.sym]
      ? { by: 'review', why: reviewFlags[w.sym] }
      : growth != null && growth < 0
        ? { by: 'rule', why: `รายได้ไตรมาสล่าสุดลดลง ${(-growth * 100).toFixed(0)}% จากปีก่อน` }
        : null;
    tickers.push({
      sym: w.sym, name: w.name, what: w.what, group: w.group,
      price: s.price, prevClose: s.closes[s.closes.length - 2], date: s.dates[s.dates.length - 1],
      high52: +high52.toFixed(4), drawdown: +(1 - s.price / high52).toFixed(4),
      valuation: w.group === 'bench' ? null : f ? valuation(s, f) : old?.valuation ?? null, revGrowth: growth, flag, spark: weekly(s, 252), days: s.closes.length,
    });
    writeJson(path.join(OUT, 'h', `${w.sym}.json`), { d: s.dates, c: s.closes });
    console.log('ok ', w.sym.padEnd(6), s.price);
  } catch (e) {
    failed.push(w.sym);
    console.log('ERR', w.sym, String(e));
    const old = prevBy[w.sym];
    if (old) tickers.push({ ...old, name: w.name, what: w.what, group: w.group, flag: reviewFlags[w.sym] ? { by: 'review', why: reviewFlags[w.sym] } : old.flag?.by === 'rule' ? old.flag : null });
  }
  await sleep(250);
}

if (failed.length > watch.length * 0.3) {
  console.error(`หยุด: ดึงไม่ได้ ${failed.length}/${watch.length} ตัว — ไม่เขียนทับข้อมูลเดิม`);
  process.exit(1);
}

const date = tickers.reduce((a, t) => (t.date > a ? t.date : a), '');
const reviewMonth = months.length ? months[months.length - 1].slice(0, 7) : null;
writeJson(path.join(OUT, 'market.json'), { updated: new Date().toISOString(), date, failed, review: reviewMonth, tickers });

// who passes all three gates today (with default settings), and who is new since last run
const prevSignals = readJson(path.join(OUT, 'signals.json'), { passing: [], flagged: [] });
const wasPassing = new Set<string>((prevSignals.passing ?? []).map((p: any) => p.sym));
const wasFlagged = new Set<string>((prevSignals.flagged ?? []).map((p: any) => p.sym));
const verdicts = tickers.map((t) => judge(t, DEFAULTS));
const passing = verdicts.filter((v) => v.passAll).map((v) => ({ sym: v.sym, score: v.score })).sort((a, b) => b.score - a.score);
const flagged = tickers.filter((t) => t.flag).map((t) => ({ sym: t.sym, why: t.flag!.why }));
const voo = tickers.find((t) => t.sym === 'VOO');
const signals = {
  date,
  passing,
  entered: passing.filter((p) => !wasPassing.has(p.sym)).map((p) => p.sym),
  flagged,
  newFlags: flagged.filter((p) => !wasFlagged.has(p.sym)).map((p) => p.sym),
  market: marketDrop(voo),
};
writeJson(path.join(OUT, 'signals.json'), signals);

// report card: every time a stock newly passes all three gates it is written down, right or wrong
const logPath = path.join(OUT, 'log.json');
if (fs.existsSync(logPath) && !Array.isArray(readJson(logPath))) { console.error('หยุด: log.json อ่านไม่ได้ — ไม่เขียนทับประวัติ'); process.exit(1); }
const log: { sym: string; date: string; price: number; voo: number | null; score: number }[] = readJson(logPath, []);
const DAY_MS = 86400_000;
// An empty report card opens with everything that passes today; after that only newcomers are added.
{
  for (const sym of log.length ? signals.entered : passing.map((p) => p.sym)) {
    const t = tickers.find((x) => x.sym === sym)!;
    // a stock hovering around a threshold would re-enter every few days: one entry per stock per 30 days
    if (!log.some((l) => l.sym === sym && Date.parse(t.date) - Date.parse(l.date) < 30 * DAY_MS)) log.push({ sym, date: t.date, price: t.price, voo: voo?.price ?? null, score: passing.find((p) => p.sym === sym)!.score });
  }
}
writeJson(logPath, log);

console.log(`\nเสร็จ ${date} · ผ่านครบ 3 ด่าน: ${passing.map((p) => `${p.sym}(${p.score})`).join(' ') || '-'} · ติดธง: ${flagged.map((f) => f.sym).join(' ') || '-'} · ดึงไม่ได้: ${failed.join(' ') || '-'}`);
