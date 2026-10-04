import { useState, type CSSProperties } from 'react';
import { judge, type Group } from '../lib/scoring.ts';
import { useStore } from '../store.ts';
import { bigBuys, share, usd, type InsiderFile, type Market } from '../data.ts';
import { Logo, Spark } from '../ui.tsx';

const FILTERS: [string, string][] = [['all', 'ทั้งหมด'], ['pass', 'ผ่านครบ'], ['buy', 'ผู้บริหารซื้อ'], ['tech', 'เทคฯ / AI'], ['future', 'ธีมอนาคต'], ['stable', 'มั่นคง'], ['mine', 'ที่ถืออยู่']];

export function Watch({ market, insiders }: { market: Market; insiders: InsiderFile | null }) {
  const st = useStore();
  const [f, setF] = useState('all');
  const held = new Set(st.holdings.map((h) => h.sym));
  const all = market.tickers
    .filter((t) => t.group !== 'bench' && !st.hidden.includes(t.sym))
    .map((t) => ({ t, v: judge(t, st.settings) }));
  const rows = all
    .filter(({ t, v }) => f === 'all' || (f === 'pass' ? v.passAll : f === 'mine' ? held.has(t.sym) : f === 'buy' ? bigBuys(insiders?.stocks[t.sym]?.trades).length > 0 : t.group === (f as Group)))
    .sort((a, b) => b.v.score - a.v.score || Number(b.v.passAll) - Number(a.v.passAll) || b.t.drawdown - a.t.drawdown);
  const nPass = all.filter((x) => x.v.passAll).length;

  return (
    <>
      <div className="verdict wait rise">
        <div className="kicker">รายชื่อเฝ้าดู {all.length} ตัว</div>
        <h1>{nPass ? `ผ่านครบ ${nPass} ตัว` : 'ยังไม่มีตัวผ่าน'}</h1>
      </div>

      <div className="chips" role="tablist">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={f === id} className={f === id ? 'on' : ''} onClick={() => setF(id)}>{label}</button>
        ))}
      </div>

      <ul className="rows" style={{ marginTop: 14 }}>
        {rows.map(({ t, v }, n) => (
          <li key={t.sym} className="rise" style={{ '--i': Math.min(n, 10) } as CSSProperties}>
            <a className="row" href={`#/s/${t.sym}`}>
              <span className="who"><Logo sym={t.sym} />
                <span style={{ minWidth: 0 }}>
                  <span className="sym">{t.sym}</span>{held.has(t.sym) && <span className="tag">ถืออยู่</span>}{bigBuys(insiders?.stocks[t.sym]?.trades).length > 0 && <span className="tag green">ผู้บริหารซื้อ</span>}
                  <span className="nm">{t.name} · {t.what}</span>
                </span>
              </span>
              <Spark data={t.spark} h={30} w={84} fill={false} color={v.passAll ? 'var(--brass)' : 'var(--dim)'} />
              <span className="score" style={v.passAll ? undefined : { background: 'none', color: 'var(--mute)' }}>{v.passAll ? v.score : `−${share(t.drawdown)}`}</span>
              <span className="sub lights">
                <span className={v.quality.pass ? 'ok' : 'no'}>บริษัทยังดี</span>
                <span className={v.dip.pass ? 'ok' : 'no'}>ราคาย่อ {share(t.drawdown)}</span>
                <span className={v.value.pass ? 'ok' : 'no'}>{t.valuation ? 'ไม่แพงเกิน' : 'วัดราคาไม่ได้'}</span>
                <span className="num" style={{ marginLeft: 'auto' }}>${usd(t.price)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="empty">ไม่มีหุ้นในกลุ่มนี้</p>}

      <p className="fine">
        ตัวเลขในช่องขวาคือคะแนน (เต็ม 100) ของตัวที่ผ่านครบ 3 ด่าน ตัวที่ยังไม่ผ่านจะบอกว่าราคาต่ำกว่าจุดสูงสุด 1 ปีเท่าไร (หุ้นที่เข้าตลาดไม่ถึงปี นับจากวันแรก)
        ป้าย "ผู้บริหารซื้อ" = ใน 90 วันมีผู้บริหารหรือกรรมการควักเงินตัวเองซื้อหุ้นบริษัทตั้งแต่ 1 แสนดอลลาร์ขึ้นไป รายชื่อนี้ทบทวนทุกต้นเดือน ซ่อนตัวที่ไม่สนใจได้จากหน้าของหุ้นตัวนั้น
      </p>
    </>
  );
}
