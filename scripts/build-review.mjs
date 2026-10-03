// Merge research parts into one monthly review file.
// node scripts/build-review.mjs <YYYY-MM> <written YYYY-MM-DD> <part.json> [part.json ...]
// Each part: { market?: {...}, stocks: { SYM: { view, points:[{text,url,date}], risk, flag } } }
// Refuses to overwrite an existing month, and drops any point without a real https link.
import fs from 'node:fs';
import path from 'node:path';

const [month, written, ...parts] = process.argv.slice(2);
if (!/^\d{4}-\d{2}$/.test(month ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(written ?? '') || !parts.length) { console.error('วิธีใช้: build-review.mjs 2026-10 2026-10-03 A.json B.json'); process.exit(1); }
const ROOT = path.join(import.meta.dirname, '..');
const out = path.join(ROOT, 'public', 'data', 'monthly', `${month}.json`);
if (fs.existsSync(out)) { console.error('มีไฟล์เดือนนี้อยู่แล้ว ไม่เขียนทับ:', out); process.exit(1); }
const known = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data-src', 'watchlist.json'), 'utf8')).tickers.map((t) => t.sym));

const okUrl = (u) => typeof u === 'string' && /^https:\/\/[^\s]+\.[^\s]+/.test(u);
const cleanPoints = (pts, where) => (pts ?? []).filter((p) => {
  const ok = p && typeof p.text === 'string' && p.text.trim() && okUrl(p.url);
  if (!ok) console.log('ตัดข้อที่ไม่มีลิงก์:', where, JSON.stringify(p).slice(0, 80));
  return ok;
}).map((p) => ({ text: p.text.trim(), url: p.url, ...(/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') ? { date: p.date } : {}) }));

const review = { month, written, stocks: {}, flags: {} };
for (const f of parts) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.market) review.market = { view: j.market.view, points: cleanPoints(j.market.points, 'market'), calendar: (j.market.calendar ?? []).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.text).map((c) => ({ date: c.date, text: c.text, ...(okUrl(c.url) ? { url: c.url } : {}) })) };
  for (const [sym, s] of Object.entries(j.stocks ?? {})) {
    if (!known.has(sym)) { console.log('ข้าม (ไม่อยู่ในรายชื่อ):', sym); continue; }
    const points = cleanPoints(s.points, sym);
    if (!s.view || !points.length) { console.log('ข้าม (ไม่มีเนื้อหา):', sym); continue; }
    review.stocks[sym] = { view: s.view, points, ...(s.risk ? { risk: s.risk } : {}), flag: s.flag || null };
    if (s.flag) review.flags[sym] = s.flag;
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out + '.tmp', JSON.stringify(review, null, 1));
fs.renameSync(out + '.tmp', out);
console.log(`เขียน ${out}\nหุ้น ${Object.keys(review.stocks).length} ตัว · ธง: ${Object.entries(review.flags).map(([k, v]) => `${k} (${v})`).join(' · ') || '-'}`);
