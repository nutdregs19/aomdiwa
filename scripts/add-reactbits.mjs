// Pull React Bits components (reactbits.dev, TS + plain CSS variant) into src/reactbits/<Name>/.
// Run: node scripts/add-reactbits.mjs Aurora CountUp ...   — never overwrites a file that is already there.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'src', 'reactbits');
for (const name of process.argv.slice(2)) {
  const r = await fetch(`https://reactbits.dev/r/${name}-TS-CSS.json`);
  if (!r.ok) { console.log('ไม่พบ', name, r.status); continue; }
  const j = await r.json();
  for (const f of j.files) {
    const out = path.join(dir, name, path.basename(f.path));
    if (fs.existsSync(out)) { console.log('มีอยู่แล้ว ข้าม', out); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.content);
    console.log('เขียน', path.relative(dir, out));
  }
  console.log('  ต้องใช้:', (j.dependencies ?? []).join(' ') || '-');
}
