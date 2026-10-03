// Print today's table: node scripts/show.ts
import fs from 'node:fs';
import path from 'node:path';
import { judge, type Ticker } from '../src/lib/scoring.ts';

const m = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'market.json'), 'utf8'));
for (const t of m.tickers as Ticker[]) {
  const v = judge(t), val = t.valuation;
  console.log(
    t.sym.padEnd(6), t.group.padEnd(7), String(t.price).padStart(9), `dd ${(t.drawdown * 100).toFixed(0)}%`.padStart(7),
    (val ? `${val.metric} ${val.current}/${val.median} n${val.n} ${val.since}` : 'no-valuation').padEnd(34),
    `rev ${t.revGrowth == null ? '?' : (t.revGrowth * 100).toFixed(0) + '%'}`.padEnd(10),
    v.passAll ? `PASS ${v.score}` : '', t.flag ? `FLAG ${t.flag.why}` : '',
  );
}
