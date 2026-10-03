import { useRef, useState, type CSSProperties } from 'react';
import ShinyText from '../reactbits/ShinyText/ShinyText.tsx';
import '../reactbits/ShinyText/ShinyText.css';
import SpotlightCard from '../reactbits/SpotlightCard/SpotlightCard.tsx';
import '../reactbits/SpotlightCard/SpotlightCard.css';
import { isNew, judge, marketDrop, rank, spendable, topPick } from '../lib/scoring.ts';
import { recordBuy, useStore } from '../store.ts';
import { share, thDate, thMonth, usd, type Market, type Review } from '../data.ts';
import { Count, Gates, Logo, Spark } from '../ui.tsx';

const i = (n: number) => ({ '--i': n }) as CSSProperties;

export function Home({ market, fx, review }: { market: Market; fx: number; review: Review | null }) {
  const st = useStore();
  const s = st.settings;
  const canSpend = spendable(st.pileThb, s);
  const cands = rank(market.tickers, st.holdings, s, st.hidden);
  // nothing left to spend this round (already bought, or the pile is empty): no "time to buy" headline
  const spent = canSpend <= 0;
  const pick = spent ? null : topPick(cands);
  const t = pick ? market.by[pick.sym] : null;
  const others = cands.filter((c) => c !== pick);
  const drop = marketDrop(market.by.VOO);
  const flagged = st.holdings.map((h) => market.by[h.sym]).filter((x) => x?.flag);

  const dlg = useRef<HTMLDialogElement>(null);
  const [sym, setSym] = useState('');
  const [amt, setAmt] = useState('');
  const openBuy = () => { setSym(pick?.sym ?? market.tickers[0].sym); setAmt(String(Math.round(canSpend))); dlg.current?.showModal(); };
  const bt = market.by[sym];
  const amount = Number(amt);
  const okAmt = amount > 0 && Number.isFinite(amount);

  return (
    <>
      <div className={`verdict rise ${pick ? 'go' : 'wait'}`}>
        <div className="kicker">เดือนนี้</div>
        <h1>{pick ? <ShinyText text="ถึงจังหวะ" color="#e2ad45" shineColor="#fff3cf" speed={3} delay={1.2} /> : spent ? 'ลงครบแล้ว' : 'ยังไม่ถึงจังหวะ'}</h1>
        {!pick && (spent
          ? <p>เงินรอบนี้ใช้หมดแล้ว งบเดือนถัดไปจะเข้ามาเองตอนต้นเดือน</p>
          : <p>ยังไม่มีหุ้นตัวไหนผ่านครบทั้ง 3 ด่านโดยไม่ชนเพดานของพอร์ต เก็บเงินไว้ก่อน</p>)}
      </div>

      {pick && t && (
        <SpotlightCard className="card pickcard rise" spotlightColor="rgba(226, 173, 69, 0.22)">
          <a href={`#/s/${t.sym}`} style={i(1)}>
            <div className="pick-head">
              <div className="who">
                <Logo sym={t.sym} size={52} />
                <div>
                  <div className="pick-sym">{t.sym}</div>
                  <div className="pick-name">{t.name} · {t.what}</div>
                </div>
              </div>
              <div className="pick-price">
                <b>${usd(t.price)}</b>ต่อหุ้น
                <div><span className="pill">−{share(t.drawdown)} จากจุดสูงสุด</span></div>
              </div>
            </div>
            <div className="pick-chart"><Spark data={t.spark} mark={t.high52} /></div>
            <div className="chart-cap"><span>{isNew(t) ? 'ตั้งแต่เข้าตลาด' : '1 ปีที่ผ่านมา'}</span><span>เส้นประ = จุดสูงสุด ${usd(t.high52)}</span></div>
          </a>
          <Gates v={pick} />
          {review?.stocks[pick.sym] && <a className="why" href={`#/s/${t.sym}`}><span className="clamp">{review.stocks[pick.sym].view}</span><b>อ่านต่อและดูแหล่งข่าว ›</b></a>}
        </SpotlightCard>
      )}

      <div className="money rise" style={i(2)}>
        <div className="card"><small>ลงได้รอบนี้</small><b className="num"><Count to={pick ? canSpend : 0} /><i>บาท</i></b></div>
        <div className="card"><small>เงินสะสมรอจังหวะ</small><b className="num"><Count to={st.pileThb} /><i>บาท</i></b></div>
      </div>
      <button className={`rise ${pick ? 'btn' : 'btn ghost'}`} style={i(3)} onClick={openBuy}>บันทึกว่าซื้อแล้ว</button>

      {drop && <p className="note info">{drop.text} — วันแบบนี้มักมีหุ้นเข้าเกณฑ์เพิ่ม ลองดูหน้าเฝ้าดู</p>}
      {flagged.map((f) => (
        <p className="note" key={f.sym}><b className="num">{f.sym}</b> ที่คุณถืออยู่ติดธงทบทวน: {f.flag!.why}</p>
      ))}

      {others.length > 0 && (
        <section>
          <h2><span>{pick ? 'ตัวอื่นที่ผ่านครบ 3 ด่าน' : 'ตัวที่ผ่านครบ 3 ด่านตอนนี้'}</span><small>คะแนนเต็ม 100</small></h2>
          <ul className="rows">
            {others.map((c, n) => {
              const x = market.by[c.sym];
              return (
                <li key={c.sym} className="rise" style={i(4 + n)}>
                  <a className="row" href={`#/s/${c.sym}`}>
                    <span className="who"><Logo sym={c.sym} /><span style={{ minWidth: 0 }}><span className="sym">{c.sym}</span><span className="nm">{x.name}</span></span></span>
                    <Spark data={x.spark} h={30} w={84} fill={false} color={c.blocked ? 'var(--dim)' : 'var(--brass)'} />
                    <span className="score" style={c.blocked ? { background: 'none', color: 'var(--dim)' } : undefined}>{c.blocked ? '—' : c.score}</span>
                    <span className={`sub ${c.blocked ? 'warn' : ''}`}>{c.blocked ?? `ย่อ ${share(x.drawdown)} · ${c.value.text}`}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {review?.market && (
        <section>
          <h2><span>ภาพรวมตลาด เดือน{thMonth(review.month)}</span><small>เขียนเมื่อ {thDate(review.written)}</small></h2>
          <div className="card review">
            <p>{review.market.view}</p>
            <ul>
              {review.market.points.map((p, n) => <li key={n}>{p.text} <a href={p.url} target="_blank" rel="noreferrer noopener">ที่มา ↗</a></li>)}
            </ul>
            {!!review.market.calendar?.length && (
              <>
                <p className="risk"><b>วันสำคัญที่รออยู่</b></p>
                <ul>
                  {review.market.calendar.map((c, n) => <li key={n}><span className="num">{thDate(c.date)}</span> — {c.text}{c.url && <> <a href={c.url} target="_blank" rel="noreferrer noopener">ที่มา ↗</a></>}</li>)}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      <p className="fine">
        ออมดิวะจัดอันดับจากเกณฑ์ที่เปิดให้เห็นทั้งหมด ไม่ใช่คำแนะนำการลงทุนจากผู้มีใบอนุญาต ราคาหุ้นขึ้นลงได้และอาจขาดทุน
        คนกดซื้อและรับผลคือคุณเอง
      </p>

      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <h3>บันทึกว่าซื้อแล้ว</h3>
        <p className="sheet-sum">กดซื้อในแอปโบรกเกอร์ของคุณก่อน แล้วค่อยมาจดไว้ที่นี่ พอร์ตกับเงินสะสมจะอัปเดตตาม</p>
        <label className="f">หุ้นที่ซื้อ
          <select value={sym} onChange={(e) => setSym(e.target.value)}>
            {market.tickers.filter((x) => x.group !== 'bench').map((x) => <option key={x.sym} value={x.sym}>{x.sym} — {x.name}</option>)}
          </select>
        </label>
        <label className="f">จำนวนเงิน (บาท)
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        {bt && okAmt && (
          <p className="sheet-sum num">≈ {usd(amount / fx)} USD · {(amount / fx / bt.price).toFixed(4)} หุ้น ที่ราคา {usd(bt.price)}</p>
        )}
        {bt && !judge(bt, s).passAll && <p className="err">ตัวนี้ยังไม่ผ่านครบ 3 ด่าน — จดได้ถ้าคุณตัดสินใจซื้อเอง</p>}
        <button className="btn" disabled={!okAmt} onClick={() => { recordBuy(sym, amount, fx, bt.price); dlg.current?.close(); }}>บันทึก</button>
        <button className="btn ghost" onClick={() => dlg.current?.close()}>ยกเลิก</button>
      </dialog>
    </>
  );
}
