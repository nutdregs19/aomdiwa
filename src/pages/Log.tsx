import type { CSSProperties } from 'react';
import { useStore } from '../store.ts';
import { pct, thb, thDate, useJson, usd, type LogEntry, type Market } from '../data.ts';
import { Logo } from '../ui.tsx';

export function Log({ market }: { market: Market }) {
  const st = useStore();
  const { data, error } = useJson<LogEntry[]>('log.json');
  const voo = market.by.VOO?.price;
  const rows = (data ?? [])
    .map((l) => {
      const now = market.by[l.sym]?.price;
      const r = now ? now / l.price - 1 : null;
      const m = voo && l.voo ? voo / l.voo - 1 : null;
      return { ...l, r, m };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  const judged = rows.filter((x) => x.r != null && x.m != null && x.date < market.date);
  const beat = judged.filter((x) => x.r! > x.m!).length;
  const avg = judged.length ? judged.reduce((a, x) => a + x.r!, 0) / judged.length : 0;
  const avgM = judged.length ? judged.reduce((a, x) => a + x.m!, 0) / judged.length : 0;

  return (
    <>
      <div className="verdict wait rise">
        <div className="kicker">สมุดพก — ทุกตัวที่เคยผ่านครบ 3 ด่าน จดไว้ทั้งถูกทั้งผิด</div>
        <h1>{judged.length ? `ชนะตลาด ${beat} จาก ${judged.length}` : 'เพิ่งเริ่มจด'}</h1>
        {!judged.length && <p>ยังเร็วเกินไปที่จะวัดผล กลับมาดูใหม่เมื่อราคาขยับไปสักพัก</p>}
      </div>

      {judged.length > 0 && (
        <div className="pair rise" style={{ marginTop: 18 }}>
          <div className="card"><small>เฉลี่ยตัวที่แอปเสนอ</small><b className={avg >= 0 ? 'up' : 'down'}>{pct(avg)}</b></div>
          <div className="card"><small>ตลาดรวมช่วงเดียวกัน</small><b className={avgM >= 0 ? 'up' : 'down'}>{pct(avgM)}</b></div>
        </div>
      )}

      <section>
        <h2><span>ตัวที่ผ่านเกณฑ์</span><small>ตั้งแต่วันที่จด → ราคาล่าสุด</small></h2>
        {error && <p className="empty">โหลดสมุดพกไม่ได้</p>}
        <ul className="rows">
          {rows.map((x, n) => (
            <li key={x.sym + x.date} className="rise" style={{ '--i': Math.min(n, 10) } as CSSProperties}>
              <a className="row two" href={`#/s/${x.sym}`}>
                <span className="who"><Logo sym={x.sym} /><span style={{ minWidth: 0 }}><span className="sym">{x.sym}</span><span className="nm">จด {thDate(x.date)} ที่ ${usd(x.price)} · คะแนน {x.score}</span></span></span>
                <span className={`score ${x.r == null ? '' : x.r >= 0 ? 'good' : 'bad'}`}>{x.r == null ? '—' : pct(x.r)}</span>
                <span className="sub">{x.m == null ? 'ไม่มีข้อมูลตลาดเทียบ' : `ตลาดรวมช่วงเดียวกัน ${pct(x.m)} · ${x.r != null && x.date < market.date ? (x.r > x.m ? 'ชนะตลาด' : 'แพ้ตลาด') : 'เพิ่งจดวันนี้'}`}</span>
              </a>
            </li>
          ))}
        </ul>
        {data && !rows.length && <p className="empty">ยังไม่มีรายการ</p>}
      </section>

      {st.buys.length > 0 && (
        <section>
          <h2><span>ที่คุณซื้อจริง</span><small>จดในเครื่องนี้</small></h2>
          <ul className="rows">
            {[...st.buys].reverse().map((b, n) => {
              const now = market.by[b.sym]?.price, r = now ? now / b.price - 1 : null;
              return (
                <li key={n}>
                  <a className="row two" href={`#/s/${b.sym}`}>
                    <span className="who"><Logo sym={b.sym} /><span style={{ minWidth: 0 }}><span className="sym">{b.sym}</span><span className="nm">{thDate(b.date)} · {thb(b.thb)} บาท ที่ ${usd(b.price)}</span></span></span>
                    <span className={`score ${r == null ? '' : r >= 0 ? 'good' : 'bad'}`}>{r == null ? '—' : pct(r)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="fine">สมุดพกจดอัตโนมัติวันที่หุ้นเข้าเกณฑ์ครบ 3 ด่าน (ตัวเดิมไม่จดซ้ำภายใน 30 วัน) ด้วยเกณฑ์ตั้งต้นของแอป ไม่ได้คิดเพดานพอร์ตของใคร ผลในอดีตไม่ได้รับประกันผลในอนาคต</p>
    </>
  );
}
