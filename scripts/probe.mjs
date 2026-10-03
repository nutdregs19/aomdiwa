// One-off probe: what does Yahoo actually return for fundamentals? (run: node scripts/probe.mjs NVDA)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sym = process.argv[2] ?? 'NVDA';
const types = [
  'quarterlyTotalRevenue', 'quarterlyNetIncome', 'quarterlyDilutedEPS', 'quarterlyGrossProfit', 'quarterlyOperatingIncome',
  'annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualDilutedAverageShares',
  'trailingTotalRevenue', 'trailingDilutedEPS',
  'quarterlyForwardPeRatio', 'quarterlyPeRatio', 'quarterlyPsRatio', 'quarterlyMarketCap',
  'trailingForwardPeRatio', 'trailingPeRatio', 'trailingPsRatio', 'trailingMarketCap',
];
const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 6 * 365 * 86400;
const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?type=${types.join(',')}&period1=${p1}&period2=${p2}`;
const r = await fetch(url, { headers: { 'User-Agent': UA } });
console.log('status', r.status);
const j = await r.json();
for (const s of j.timeseries?.result ?? []) {
  const t = s.meta.type[0];
  const rows = (s[t] ?? []).filter(Boolean).map((x) => `${x.asOfDate}=${x.reportedValue?.fmt ?? x.reportedValue?.raw}`);
  console.log(t.padEnd(28), rows.length, rows.join(' '));
}
const c = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5y&interval=1d`, { headers: { 'User-Agent': UA } });
const cj = await c.json();
const res = cj.chart?.result?.[0];
console.log('chart', c.status, res?.timestamp?.length, Object.keys(res?.meta ?? {}).join(','));
console.log(JSON.stringify(res?.meta).slice(0, 900));
