// Everything personal lives here, in this browser only (localStorage). Nothing is sent anywhere.
import { useSyncExternalStore } from 'react';
import { monthsBetween, sane, type Holding, type Settings } from './lib/scoring.ts';

export interface Buy { date: string; sym: string; thb: number; usd: number; shares: number; price: number }

export interface State {
  holdings: Holding[];
  settings: Settings;
  /** cash saved up and waiting, in baht (never negative) */
  pileThb: number;
  /** last month (YYYY-MM) whose budget was already added to the pile */
  toppedUp: string;
  buys: Buy[];
  /** stocks this person chose not to watch */
  hidden: string[];
}

const KEY = 'aomdiwa.v1';
// the user's own calendar, not UTC: in Thailand the 1st starts 7 hours before it does in UTC
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const thisMonth = () => today().slice(0, 7);

const okHolding = (h: any): h is Holding => h && typeof h.sym === 'string' && /^[A-Za-z0-9.-]{1,10}$/.test(h.sym) && h.shares > 0 && Number.isFinite(+h.shares) && h.costUsd >= 0 && Number.isFinite(+h.costUsd);
const money = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : d);

function load(): State {
  let s: Partial<State> = {};
  try { s = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { /* private window or damaged data: start fresh */ }
  const settings = sane(s.settings);
  const st: State = {
    holdings: Array.isArray(s.holdings) ? s.holdings.filter(okHolding) : [],
    settings,
    pileThb: money(s.pileThb, settings.budgetThb),
    toppedUp: /^\d{4}-\d{2}$/.test(s.toppedUp ?? '') ? s.toppedUp! : thisMonth(),
    buys: Array.isArray(s.buys) ? s.buys : [],
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((x) => typeof x === 'string') : [],
  };
  // a new month has started since the last visit: that month's budget joins the pile
  const gap = monthsBetween(st.toppedUp, thisMonth());
  if (gap > 0) { st.pileThb += gap * settings.budgetThb; st.toppedUp = thisMonth(); }
  return st;
}

let state = load();
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: keep working in memory */ }
  tell();
}
save();

// Another tab (or the Home Screen copy of the app) saved: take its version instead of overwriting it later.
addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); tell(); } });
// Coming back to an app left open for days: re-read, so a new month's budget is added and nothing stale is saved.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { state = load(); save(); } });

export const useStore = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

export function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  state.pileThb = money(state.pileThb, 0);
  save();
}
export function setSettings(patch: Partial<Settings>) { update({ settings: sane({ ...state.settings, ...patch }) }); }

export function recordBuy(sym: string, thb: number, fx: number, price: number) {
  const usd = thb / fx, shares = usd / price;
  const had = state.holdings.find((h) => h.sym === sym);
  const holdings = had
    ? state.holdings.map((h) => (h.sym === sym ? { ...h, shares: h.shares + shares, costUsd: h.costUsd + usd } : h))
    : [...state.holdings, { sym, shares, costUsd: usd }];
  const buy: Buy = { date: today(), sym, thb, usd, shares, price };
  // spending more than was saved just empties the pile; it never becomes a debt that swallows next month's budget
  update({ holdings, pileThb: state.pileThb - thb, buys: [...state.buys, buy] });
}

/** Replace the portfolio from a backup (the same shape `exportText` gives). Throws on nonsense. */
export function importText(text: string) {
  const j = JSON.parse(text);
  const hs = (Array.isArray(j) ? j : j?.holdings) as unknown;
  if (!Array.isArray(hs) || !hs.length || !hs.every(okHolding)) throw new Error('รูปแบบไม่ถูกต้อง');
  update({
    holdings: hs.map((h) => ({ sym: h.sym.toUpperCase(), shares: +h.shares, costUsd: +h.costUsd })),
    ...(j.settings ? { settings: sane(j.settings) } : {}),
    ...(Number.isFinite(j.pileThb) ? { pileThb: j.pileThb } : {}),
    ...(Array.isArray(j.buys) ? { buys: j.buys } : {}),
    ...(Array.isArray(j.hidden) ? { hidden: j.hidden.filter((x: unknown) => typeof x === 'string') } : {}),
    // keep the backup's month marker, so months that passed since the backup still add their budget
    ...(/^\d{4}-\d{2}$/.test(j.toppedUp ?? '') ? { toppedUp: j.toppedUp } : {}),
  });
  state = load(); save(); // apply any month top-up the backup is owed
}
export const exportText = () => JSON.stringify({ holdings: state.holdings, settings: state.settings, pileThb: state.pileThb, toppedUp: state.toppedUp, buys: state.buys, hidden: state.hidden }, null, 1);
export const toggleHidden = (sym: string) => update({ hidden: state.hidden.includes(sym) ? state.hidden.filter((x) => x !== sym) : [...state.hidden, sym] });
export function removeHolding(sym: string) { update({ holdings: state.holdings.filter((h) => h.sym !== sym) }); }
