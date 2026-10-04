// Shared market data: the static JSON the daily job publishes + today's USD/THB rate.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Ticker } from './lib/scoring.ts';

export interface Market { updated: string; date: string; review: string | null; tickers: Ticker[]; by: Record<string, Ticker> }

export interface Point { text: string; url: string; date?: string }
export interface StockReview { view: string; points: Point[]; risk?: string; flag?: string | null }
export interface Review {
  month: string; written: string;
  market?: { view: string; points: Point[]; calendar?: { date: string; text: string; url?: string }[] };
  stocks: Record<string, StockReview>;
  flags: Record<string, string>;
}
export interface LogEntry { sym: string; date: string; price: number; voo: number | null; score: number }
export interface History { d: string[]; c: number[] }
export interface Trade { side: 'B' | 'S'; name: string; role: string; date: string; shares: number; usd: number; planned: boolean }
export interface InsiderFile { updated: string; days: number; stocks: Record<string, { trades: Trade[]; url: string }> }

/** A purchase that says something: own decision (not a scheduled plan) and real money. Small same-day buys by dozens of staff are payroll plans. */
export const BIG_BUY = 100_000;
export const bigBuys = (trades: Trade[] | undefined) => (trades ?? []).filter((t) => t.side === 'B' && !t.planned && t.usd >= BIG_BUY);
export const money = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} พันล้าน` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} ล้าน` : v >= 1e3 ? `${Math.round(v / 1e3)} พัน` : String(Math.round(v)));

const BASE = import.meta.env.BASE_URL + 'data/';
const cache = new Map<string, Promise<any>>();
function getJson<T>(name: string): Promise<T> {
  if (!cache.has(name)) cache.set(name, fetch(BASE + name, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }));
  return cache.get(name)!;
}

// An app left open in the phone's app switcher would show last week's prices forever:
// when it comes back to the front after 30+ minutes, drop the cache and load again.
let version = 0, loadedAt = Date.now();
const watchers = new Set<() => void>();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - loadedAt < 30 * 60_000) return;
  cache.clear(); loadedAt = Date.now(); version++;
  watchers.forEach((f) => f());
});
const useVersion = () => useSyncExternalStore((f) => { watchers.add(f); return () => watchers.delete(f); }, () => version);

export function useJson<T>(name: string | null): { data: T | null; error: boolean } {
  const v = useVersion();
  const [st, set] = useState<{ data: T | null; error: boolean; name: string | null }>({ data: null, error: false, name: null });
  useEffect(() => {
    if (!name) return;
    let live = true;
    // keep showing the old numbers while the fresh ones load; only a different file starts from empty
    set((old) => (old.name === name ? old : { data: null, error: false, name }));
    getJson<T>(name).then(
      (d) => { if (live) set({ data: d, error: false, name }); },
      () => { cache.delete(name); if (live) set((old) => (old.name === name && old.data ? old : { data: null, error: true, name })); },
    );
    return () => { live = false; };
  }, [name, v]);
  return name && st.name === name ? st : { data: null, error: false };
}

export function useMarket() {
  const { data, error } = useJson<Omit<Market, 'by'>>('market.json');
  const market = useMemo(() => (data ? ({ ...data, by: Object.fromEntries(data.tickers.map((t) => [t.sym, t])) } as Market) : null), [data]);
  return { market, error };
}

// ---- baht per dollar ----
const FX_KEY = 'aomdiwa.fx';
const FX_FALLBACK = 33.5;
function cachedFx(): { rate: number; day: string } | null {
  try { return JSON.parse(localStorage.getItem(FX_KEY) ?? 'null'); } catch { return null; }
}
async function fetchFx(): Promise<number> {
  const tryUrl = async (u: string, pick: (j: any) => number) => { const r = await fetch(u); if (!r.ok) throw new Error(); const v = pick(await r.json()); if (!(v > 20 && v < 60)) throw new Error(); return v; };
  try { return await tryUrl('https://api.frankfurter.dev/v1/latest?from=USD&to=THB', (j) => j.rates.THB); }
  catch { return tryUrl('https://open.er-api.com/v6/latest/USD', (j) => j.rates.THB); }
}
export function useFx(): { rate: number; live: boolean } {
  const c = cachedFx();
  const today = new Date().toISOString().slice(0, 10);
  const [fx, set] = useState({ rate: c?.rate ?? FX_FALLBACK, live: c?.day === today });
  useEffect(() => {
    if (c?.day === today) return;
    fetchFx().then((rate) => {
      try { localStorage.setItem(FX_KEY, JSON.stringify({ rate, day: today })); } catch { /* fine */ }
      set({ rate, live: true });
    }, () => { /* offline: keep the last known rate */ });
  }, []);
  return fx;
}

// ---- formatting ----
const nf = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const usd = (v: number, d = 2) => nf(d).format(v);
export const thb = (v: number) => nf(0).format(Math.round(v));
export const pct = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
export const share = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
export const thDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
export const thMonth = (ym: string) => new Date(ym + '-15T12:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
