// Insider trades: officers and directors buying or selling their own company's stock.
// These are public filings (SEC Form 4). sec.gov refuses requests from this PC (403 on www.sec.gov, 3–4 Oct 2026),
// so the same records are read from Nasdaq's public insider-activity feed instead.
// Run: node scripts/fetch-insiders.ts [SYM ...]   → public/data/insiders.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'data', 'insiders.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DAYS = 90;
const only = process.argv.slice(2);

export interface Trade {
  /** B = bought on the open market · S = sold on the open market */
  side: 'B' | 'S';
  name: string;
  role: string;
  date: string;
  shares: number;
  usd: number;
  /** done under a schedule fixed in advance ("Automatic"): says little about what the person thinks today */
  planned: boolean;
}
export interface Insiders { trades: Trade[]; url: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (s: unknown) => Number(String(s ?? '').replace(/[$,()\s]/g, '')) || 0;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-'.])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** "HUANG JEN HSUN" (surname first, as filed) → "Jen Hsun Huang"; funds and companies are left as they are. */
export function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  const parts = s.split(' ');
  if (parts.length < 2 || /\b(LLC|L\.?P\.?|INC|CORP|TRUST|FUND|PARTNERS|CAPITAL|HOLDINGS|LTD|GROUP|MANAGEMENT)\b/i.test(s)) return titleCase(s);
  return titleCase([...parts.slice(1), parts[0]].join(' '));
}

/** One Nasdaq row → a trade, or null for anything that is not an open-market buy or sell (grants, option exercises, gifts…). */
export function toTrade(row: any): Trade | null {
  const type = String(row?.transactionType ?? '');
  const side = /\bBuy\b/i.test(type) ? 'B' : /\bSell\b/i.test(type) ? 'S' : null;
  if (!side || /Non Open Market/i.test(type)) return null;
  const m = String(row.lastDate ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const shares = num(row.sharesTraded), price = num(row.lastPrice);
  if (!m || !(shares > 0) || !(price > 0)) return null;
  return {
    side, name: tidyName(String(row.insider ?? '')), role: String(row.relation ?? ''),
    date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
    shares, usd: Math.round(shares * price), planned: /Automatic/i.test(type),
  };
}

async function run() {
  const watch = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data-src', 'watchlist.json'), 'utf8')).tickers as { sym: string; group: string }[])
    .filter((t) => t.group !== 'bench' && (!only.length || only.includes(t.sym)));
  let old: { stocks: Record<string, Insiders> } = { stocks: {} };
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);
  const stocks: Record<string, Insiders> = { ...old.stocks };
  const failed: string[] = [];
  for (const { sym } of watch) {
    const nq = sym.replace('-', '.'); // BRK-B is BRK.B at Nasdaq
    try {
      const r = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(nq)}/insider-trades?limit=60&type=ALL&sortColumn=lastDate&sortOrder=DESC`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(String(r.status));
      const j: any = await r.json();
      if (j?.status?.rCode !== 200) throw new Error('rCode ' + j?.status?.rCode);
      const rows: any[] = j.data?.transactionTable?.table?.rows ?? [];
      const trades = rows.map(toTrade).filter((t): t is Trade => !!t && t.date >= since);
      stocks[sym] = { trades, url: `https://www.nasdaq.com/market-activity/stocks/${nq.toLowerCase()}/insider-activity` };
      console.log('ok ', sym.padEnd(6), `ซื้อ ${trades.filter((t) => t.side === 'B').length}`, `ขาย ${trades.filter((t) => t.side === 'S').length}`);
    } catch (e) {
      failed.push(sym); // keep whatever we had for this stock
      console.log('ERR', sym, String(e));
    }
    await sleep(300);
  }
  if (failed.length > watch.length * 0.5) { console.error(`หยุด: ดึงไม่ได้ ${failed.length}/${watch.length} ตัว — ไม่เขียนทับข้อมูลเดิม`); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + '.tmp', JSON.stringify({ updated: new Date().toISOString(), days: DAYS, failed, stocks }));
  fs.renameSync(OUT + '.tmp', OUT);
  console.log(`\nเสร็จ · ดึงไม่ได้: ${failed.join(' ') || '-'}`);
}

if (process.argv[1]?.endsWith('fetch-insiders.ts')) await run();
