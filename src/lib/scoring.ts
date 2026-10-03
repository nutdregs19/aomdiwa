// The whole "is it time to buy?" logic. Pure functions, no DOM, no network —
// the daily fetch script, the alert server and the app all import this file so they always agree.
// (Erasable TypeScript only: Node runs this file directly.)

export type Group = 'tech' | 'future' | 'stable' | 'bench';

export interface Valuation {
  /** fpe = price / next-year earnings · pe = price / last-year earnings · ps = price / sales */
  metric: 'fpe' | 'pe' | 'ps';
  current: number;
  median: number;
  n: number; // how many history points the median comes from
  since: string; // oldest point, YYYY-MM-DD
}

export interface Ticker {
  sym: string;
  name: string;
  what: string;
  group: Group;
  price: number;
  prevClose: number;
  date: string; // last trading day, YYYY-MM-DD
  high52: number;
  /** how far below the 52-week high, 0.18 = 18% */
  drawdown: number;
  valuation: Valuation | null;
  /** latest quarter revenue vs the same quarter a year earlier, 0.25 = +25%; null = unknown */
  revGrowth: number | null;
  /** set by rule or by the monthly review; a flagged stock is never offered */
  flag: { by: 'rule' | 'review'; why: string } | null;
  spark: number[]; // ~1 year of weekly closes
  /** trading days of history we have; under ~250 the stock is newly listed and "1 year" labels would lie */
  days?: number;
}

export interface Settings {
  budgetThb: number;
  capPerStock: number; // 0.25
  capFuture: number; // 0.35
  dipBig: number; // 0.10 — tech + stable
  dipFuture: number; // 0.25
  maxMonths: number; // 3 — spend at most this many months of budget at once
}

export const DEFAULTS: Settings = { budgetThb: 4000, capPerStock: 0.25, capFuture: 0.35, dipBig: 0.1, dipFuture: 0.25, maxMonths: 3 };

/** Whatever was typed or imported, the rules only ever see sensible numbers (a 0% threshold would divide by zero). */
export function sane(x: Partial<Settings> | null | undefined): Settings {
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
  return {
    budgetThb: n(x?.budgetThb, 1, 1e7, DEFAULTS.budgetThb),
    capPerStock: n(x?.capPerStock, 0.01, 1, DEFAULTS.capPerStock),
    capFuture: n(x?.capFuture, 0.01, 1, DEFAULTS.capFuture),
    dipBig: n(x?.dipBig, 0.01, 0.95, DEFAULTS.dipBig),
    dipFuture: n(x?.dipFuture, 0.01, 0.95, DEFAULTS.dipFuture),
    maxMonths: n(x?.maxMonths, 1, 120, DEFAULTS.maxMonths),
  };
}

export interface Gate { pass: boolean; text: string }
export interface Verdict {
  sym: string;
  quality: Gate;
  dip: Gate;
  value: Gate;
  passAll: boolean;
  score: number; // 0–100, only meaningful when passAll
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const METRIC_TH = { fpe: 'ราคาต่อกำไรปีหน้า', pe: 'ราคาต่อกำไร', ps: 'ราคาต่อยอดขาย' } as const;
export const metricName = (m: Valuation['metric']) => METRIC_TH[m];

/** Listed for less than about a year. */
export const isNew = (t: Pick<Ticker, 'days'>) => t.days != null && t.days < 250;

export const dipNeeded = (g: Group, s: Settings) => (g === 'future' ? s.dipFuture : s.dipBig);

/** The three gates for one stock. Says nothing about anyone's portfolio. */
export function judge(t: Ticker, s: Settings = DEFAULTS): Verdict {
  const quality: Gate = t.flag
    ? { pass: false, text: `ติดธงทบทวน: ${t.flag.why}` }
    : { pass: true, text: t.revGrowth == null ? 'ไม่ติดธง' : `ไม่ติดธง · รายได้ ${t.revGrowth >= 0 ? '+' : ''}${pct(t.revGrowth)} จากปีก่อน` };

  const need = dipNeeded(t.group, s);
  const dip: Gate = {
    pass: t.drawdown >= need,
    // right at the line, whole percents would read "25% (need 25%) — fail": show one decimal there
    text: `ต่ำกว่าจุดสูงสุด${isNew(t) ? 'ตั้งแต่เข้าตลาด' : ' 1 ปี'} ${Math.abs(t.drawdown - need) < 0.01 ? (t.drawdown * 100).toFixed(1) + '%' : pct(t.drawdown)} (เกณฑ์ ${pct(need)})`,
  };

  const v = t.valuation;
  const value: Gate = !v
    ? { pass: false, text: 'ยังวัดความถูกแพงไม่ได้ (กำไร/รายได้ยังน้อยเกินไป)' }
    : {
        pass: v.current <= v.median,
        text: `${METRIC_TH[v.metric]} ${v.current.toFixed(1)} เท่า · ค่ากลางของตัวเอง ${v.median.toFixed(1)} เท่า`,
      };

  const passAll = t.group !== 'bench' && quality.pass && dip.pass && value.pass;
  let score = 0;
  if (passAll && v) {
    const depth = Math.min(t.drawdown / need, 2) / 2; // 0.5 at the threshold, 1 at twice the threshold
    const cheap = Math.min((v.median - v.current) / v.median, 0.5) / 0.5; // 1 when half its usual price
    score = Math.round(100 * (0.5 * depth + 0.5 * cheap));
  }
  return { sym: t.sym, quality, dip, value, passAll, score };
}

export interface Holding { sym: string; shares: number; costUsd: number }

export interface PortfolioView {
  totalUsd: number;
  weight: Record<string, number>;
  futureWeight: number;
}

export function portfolioView(holdings: Holding[], byS: Record<string, Ticker>): PortfolioView {
  const val = (h: Holding) => h.shares * (byS[h.sym]?.price ?? 0);
  const totalUsd = holdings.reduce((a, h) => a + val(h), 0);
  const weight: Record<string, number> = {};
  let fut = 0;
  for (const h of holdings) {
    weight[h.sym] = totalUsd ? val(h) / totalUsd : 0;
    if (byS[h.sym]?.group === 'future') fut += val(h);
  }
  return { totalUsd, weight, futureWeight: totalUsd ? fut / totalUsd : 0 };
}

export interface Candidate extends Verdict { blocked: string | null }

/**
 * Is this portfolio already too heavy in this stock (or in the high-risk group) to buy more?
 * Judged on today's weights, before buying: "over the cap → no more of it". An empty portfolio blocks nothing.
 */
export function capBlock(t: Pick<Ticker, 'sym' | 'group'>, pv: PortfolioView, s: Settings = DEFAULTS): string | null {
  if (!(pv.totalUsd > 0)) return null;
  const w = pv.weight[t.sym] ?? 0;
  if (w >= s.capPerStock) return `หนัก ${pct(w)} ของพอร์ตแล้ว เกินเพดาน ${pct(s.capPerStock)}`;
  if (t.group === 'future' && pv.futureWeight >= s.capFuture) return `กลุ่มเสี่ยงสูงรวม ${pct(pv.futureWeight)} ของพอร์ตแล้ว เกินเพดาน ${pct(s.capFuture)}`;
  return null;
}

/**
 * Rank the stocks that pass all three gates, then strike out the ones this portfolio already holds too much of.
 * `hidden` stocks are never candidates, but still count in the portfolio's weights.
 */
export function rank(tickers: Ticker[], holdings: Holding[], s: Settings = DEFAULTS, hidden: string[] = []): Candidate[] {
  const byS = Object.fromEntries(tickers.map((t) => [t.sym, t]));
  const pv = portfolioView(holdings, byS);
  const out: Candidate[] = [];
  for (const t of tickers) {
    if (hidden.includes(t.sym)) continue;
    const v = judge(t, s);
    if (v.passAll) out.push({ ...v, blocked: capBlock(t, pv, s) });
  }
  return out.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.score - a.score || a.sym.localeCompare(b.sym));
}

/** The one stock to buy this round, or null = keep the cash. */
export const topPick = (c: Candidate[]) => c.find((x) => !x.blocked) ?? null;

/** Saved-up cash may be spent at most `maxMonths` budgets at a time. */
export const spendable = (pileThb: number, s: Settings = DEFAULTS) => Math.max(0, Math.min(pileThb, s.budgetThb * s.maxMonths));

/** Whole months between two YYYY-MM strings (b − a). */
export function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Broad market fell hard: ≥3% in a day, or ≥10% under its 1-year high. */
export function marketDrop(voo: Ticker | undefined): { day: boolean; deep: boolean; text: string } | null {
  if (!voo) return null;
  const chg = voo.prevClose ? voo.price / voo.prevClose - 1 : 0;
  const day = chg <= -0.03, deep = voo.drawdown >= 0.1;
  if (!day && !deep) return null;
  return { day, deep, text: day ? `ตลาดรวมลง ${pct(-chg)} ในวันเดียว` : `ตลาดรวมต่ำกว่าจุดสูงสุด ${pct(voo.drawdown)}` };
}

export const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
