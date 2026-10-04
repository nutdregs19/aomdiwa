import { useState } from 'react';
import SpotlightCard from '../reactbits/SpotlightCard/SpotlightCard.tsx';
import '../reactbits/SpotlightCard/SpotlightCard.css';
import { isNew, judge, metricName } from '../lib/scoring.ts';
import { toggleHidden, useStore } from '../store.ts';
import { bigBuys, money, pct, share, thDate, thMonth, useJson, usd, type History, type InsiderFile, type Market, type Review } from '../data.ts';
import { Gates, Logo, Spark } from '../ui.tsx';

const GROUP_TH = { tech: 'เทคฯ / AI โตสูง', future: 'ธีมอนาคต เสี่ยงสูง', stable: 'บริษัทใหญ่มั่นคง', bench: 'ใช้เทียบผลงาน ไม่เสนอซื้อ' } as const;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'แหล่งข่าว'; } };

const ROLE_TH: Record<string, string> = { Officer: 'ผู้บริหาร', Director: 'กรรมการ', 'Beneficial Owner (10% or more)': 'ผู้ถือหุ้นใหญ่' };

export function Stock({ market, sym, review, insiders }: { market: Market; sym: string; review: Review | null; insiders: InsiderFile | null }) {
  const st = useStore();
  const t = market.by[sym];
  const [range, setRange] = useState<'1y' | '5y'>('1y');
  const hist = useJson<History>(t ? `h/${t.sym}.json` : null).data;
  if (!t) return <p className="empty">ไม่พบหุ้น {sym} ในรายชื่อเฝ้าดู <a href="#/watch" style={{ color: 'var(--brass)' }}>กลับไปหน้าเฝ้าดู</a></p>;

  const v = judge(t, st.settings);
  const day = t.prevClose ? t.price / t.prevClose - 1 : 0;
  const series = hist ? (range === '1y' ? hist.c.slice(-252) : hist.c.filter((_, i) => i % 5 === (hist.c.length - 1) % 5)) : t.spark;
  const from = hist ? (range === '1y' ? hist.d[Math.max(0, hist.d.length - 252)] : hist.d[0]) : null;
  const chg = series.length > 1 ? series[series.length - 1] / series[0] - 1 : 0;
  const h = st.holdings.find((x) => x.sym === sym);
  const r = review?.stocks[sym];
  const val = t.valuation;
  const hidden = st.hidden.includes(sym);
  const ins = insiders?.stocks[sym];
  const buys = (ins?.trades ?? []).filter((x) => x.side === 'B'), sells = (ins?.trades ?? []).filter((x) => x.side === 'S');
  const sum = (a: typeof buys) => a.reduce((n, x) => n + x.usd, 0);
  const big = bigBuys(ins?.trades);
  // one line per person and direction: total money, how many trades, the latest date
  const perPerson = (list: typeof buys) => {
    const m = new Map<string, { name: string; role: string; side: 'B' | 'S'; usd: number; n: number; date: string; planned: boolean }>();
    for (const x of list) {
      const g = m.get(x.name) ?? { name: x.name, role: x.role, side: x.side, usd: 0, n: 0, date: x.date, planned: true };
      g.usd += x.usd; g.n++; if (x.date > g.date) g.date = x.date; g.planned = g.planned && x.planned;
      m.set(x.name, g);
    }
    return [...m.values()].sort((a, b) => b.usd - a.usd);
  };
  // the purchases that matter first, then the largest sellers
  const shown = [...perPerson(big), ...perPerson(sells)].slice(0, 6);

  return (
    <>
      <a className="back" href="#/watch">‹ เฝ้าดู</a>
      <SpotlightCard className={`card rise ${v.passAll ? 'pickcard' : ''}`} spotlightColor="rgba(226, 173, 69, 0.18)">
        <div className="pick-head">
          <div className="who">
            <Logo sym={t.sym} size={52} />
            <div>
              <div className="pick-sym">{t.sym}</div>
              <div className="pick-name">{t.name} · {t.what}</div>
              <span className="pill gold">{GROUP_TH[t.group]}</span>
            </div>
          </div>
          <div className="pick-price">
            <b>${usd(t.price)}</b>
            <span className={day >= 0 ? 'up' : 'down'}>{pct(day)} วันล่าสุด</span>
            {v.passAll && <div><span className="pill gold">คะแนน {v.score}</span></div>}
          </div>
        </div>
        <div className="pick-chart"><Spark data={series} mark={range === '1y' ? t.high52 : undefined} h={120} color={chg >= 0 ? 'var(--up)' : 'var(--down)'} /></div>
        <div className="chart-cap">
          <span>{from ? `ตั้งแต่ ${thDate(from)}` : isNew(t) ? 'ตั้งแต่เข้าตลาด' : '1 ปีที่ผ่านมา'} <b className={chg >= 0 ? 'up' : 'down'}>{pct(chg, 0)}</b></span>
          <span className="seg">
            <button className={range === '1y' ? 'on' : ''} onClick={() => setRange('1y')}>1 ปี</button>
            <button className={range === '5y' ? 'on' : ''} onClick={() => setRange('5y')}>5 ปี</button>
          </span>
        </div>
      </SpotlightCard>

      {t.flag && <p className="note"><b>ติดธงควรทบทวน</b> — {t.flag.why}<br /><span className="mute">{t.flag.by === 'rule' ? 'ขึ้นธงอัตโนมัติจากตัวเลขงบ' : 'ขึ้นธงจากบทสรุปรายเดือน'} · ตัวที่ติดธงจะไม่ถูกเสนอซื้อจนกว่าธงจะหาย</span></p>}

      {t.group !== 'bench' && (
        <section>
          <h2><span>สามด่าน</span><small>{v.passAll ? 'ผ่านครบ' : 'ยังไม่ครบ'}</small></h2>
          <div className="card"><Gates v={v} /></div>
          {val && (
            <p className="fine" style={{ marginTop: 10 }}>
              "{metricName(val.metric)}" = ต้องจ่ายกี่บาทต่อ{val.metric === 'ps' ? 'ยอดขาย' : 'กำไร'} 1 บาทของบริษัท ยิ่งต่ำยิ่งถูก
              ค่ากลางคิดจาก {val.n} จุดข้อมูลของหุ้นตัวนี้เองย้อนไปถึง {thDate(val.since)}
            </p>
          )}
        </section>
      )}

      {h && (
        <section>
          <h2><span>ที่คุณถืออยู่</span></h2>
          <div className="pair">
            <div className="card"><small>มูลค่า</small><b>${usd(h.shares * t.price)}</b></div>
            <div className="card"><small>กำไร/ขาดทุน</small><b className={h.shares * t.price >= h.costUsd ? 'up' : 'down'}>{pct(h.costUsd ? (h.shares * t.price) / h.costUsd - 1 : 0, 0)}</b></div>
          </div>
        </section>
      )}

      <section>
        <h2><span>บทสรุป{review ? `เดือน${thMonth(review.month)}` : 'รายเดือน'}</span>{review && <small>เขียนเมื่อ {thDate(review.written)}</small>}</h2>
        {r ? (
          <div className="card review">
            <p>{r.view}</p>
            <ul>
              {r.points.map((p, n) => (
                <li key={n}>{p.text} <a href={p.url} target="_blank" rel="noreferrer noopener">{host(p.url)}{p.date ? ` · ${thDate(p.date)}` : ''} ↗</a></li>
              ))}
            </ul>
            {r.risk && <p className="risk"><b>ความเสี่ยงหลัก</b> {r.risk}</p>}
          </div>
        ) : (
          <p className="card mute">รอบล่าสุดยังไม่มีบทสรุปของหุ้นตัวนี้ (บทสรุปเขียนให้เฉพาะตัวที่ถืออยู่และตัวที่ผ่านเกณฑ์)</p>
        )}
      </section>

      {t.group !== 'bench' && insiders && (
        <section>
          <h2><span>ผู้บริหารซื้อ/ขายหุ้นบริษัทตัวเอง</span><small>{insiders.days} วันล่าสุด</small></h2>
          {!ins ? (
            <p className="card mute">ไม่มีข้อมูลของหุ้นตัวนี้</p>
          ) : !ins.trades.length ? (
            <p className="card mute">ไม่มีรายการซื้อขายในตลาดช่วงนี้ (บริษัทที่จดทะเบียนนอกสหรัฐฯ บางแห่งไม่ต้องรายงาน)</p>
          ) : (
            <div className="card">
              <div className="pair inner">
                <div><small>ซื้อ {buys.length} รายการ</small><b className={big.length ? 'up' : ''}>${money(sum(buys))}</b></div>
                <div><small>ขาย {sells.length} รายการ</small><b>${money(sum(sells))}</b></div>
              </div>
              {big.length > 0 && <p className="note good">มีการควักเงินตัวเองซื้อก้อนใหญ่ {big.length} รายการ — เป็นสัญญาณที่มีน้ำหนักกว่าการขาย</p>}
              {buys.length > 0 && !big.length && <p className="sheet-sum">รายการซื้อเป็นก้อนเล็ก ๆ (ต่ำกว่า 1 แสนดอลลาร์) มักเป็นแผนซื้อหุ้นของพนักงาน ไม่ใช่การตัดสินใจลงทุน</p>}
              {shown.map((x, n) => (
                <div className="line" key={n}>
                  <span><b>{x.name}</b> <span className="mute">{ROLE_TH[x.role] ?? x.role} · {x.n > 1 ? `${x.n} ครั้ง ล่าสุด ` : ''}{thDate(x.date)}{x.planned ? ' · ตามแผนล่วงหน้า' : ''}</span></span>
                  <span className={`num ${x.side === 'B' ? 'up' : 'mute'}`} style={{ whiteSpace: 'nowrap' }}>{x.side === 'B' ? 'ซื้อ' : 'ขาย'} ${money(x.usd)}</span>
                </div>
              ))}
              <a className="why" href={ins.url} target="_blank" rel="noreferrer noopener"><b>ดูทุกรายการที่ Nasdaq ↗</b></a>
            </div>
          )}
          <p className="fine" style={{ marginTop: 10 }}>
            ข้อมูลนี้เป็นเอกสารเปิดเผยตามกฎหมาย ไม่ใช่ข่าวลับ การขายเป็นเรื่องปกติ (จ่ายภาษี กระจายทรัพย์สิน หรือขายตามแผนที่ตั้งไว้ล่วงหน้า) จึงบอกอะไรได้น้อย
            การซื้อด้วยเงินตัวเองก้อนใหญ่เกิดไม่บ่อยและมีความหมายกว่า แต่ก็ไม่ได้รับประกันว่าราคาจะขึ้น
          </p>
        </section>
      )}

      <section>
        <a className="btn ghost" href={`https://finance.yahoo.com/quote/${t.sym}`} target="_blank" rel="noreferrer noopener">ดูข้อมูลเต็มที่ Yahoo Finance ↗</a>
        {t.group !== 'bench' && <button className="btn ghost" onClick={() => toggleHidden(sym)}>{hidden ? 'กลับมาเฝ้าดูตัวนี้' : 'ซ่อนตัวนี้ ไม่ต้องเสนอให้ฉัน'}</button>}
      </section>
      <p className="fine">ตัวเลขใช้ราคาปิด {thDate(t.date)} · {t.revGrowth != null && `รายได้ไตรมาสล่าสุด ${pct(t.revGrowth, 0)} จากปีก่อน · `}ต่ำกว่าจุดสูงสุด{isNew(t) ? 'ตั้งแต่เข้าตลาด' : ' 1 ปี'} {share(t.drawdown)} · ไม่ใช่คำแนะนำการลงทุน</p>
    </>
  );
}
