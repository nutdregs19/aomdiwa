// Company logos → public/logos/<SYM>.png. Run: node scripts/fetch-logos.mjs
// Only fetches the ones that are missing; never overwrites.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'logos');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const watch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-src', 'watchlist.json'), 'utf8')).tickers;
const sources = [
  (s) => `https://financialmodelingprep.com/image-stock/${s}.png`,
  (s) => `https://assets.parqet.com/logos/symbol/${s}?format=png&size=128`,
];
fs.mkdirSync(OUT, { recursive: true });
for (const { sym } of watch) {
  const out = path.join(OUT, `${sym}.png`);
  if (fs.existsSync(out)) continue;
  let done = false;
  for (const [n, src] of sources.entries()) {
    try {
      const r = await fetch(src(sym), { headers: { 'User-Agent': UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      const isPng = buf.length > 400 && buf[0] === 0x89 && buf[1] === 0x50;
      if (r.ok && isPng) { fs.writeFileSync(out, buf); console.log('ok ', sym, `แหล่ง ${n + 1}`, buf.length); done = true; break; }
    } catch { /* try the next source */ }
  }
  if (!done) console.log('ไม่พบ', sym);
}
