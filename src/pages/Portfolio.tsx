import { useRef, useState } from 'react';
import { portfolioView } from '../lib/scoring.ts';
import { importText, update, useStore } from '../store.ts';
import { pct, share, thb, usd, type Market } from '../data.ts';
import { Count, Logo, Spark } from '../ui.tsx';

const GROUP_TH = { tech: 'เทคฯ / AI', future: 'ธีมอนาคต เสี่ยงสูง', stable: 'บริษัทใหญ่มั่นคง', bench: '' } as const;

export function Portfolio({ market, fx }: { market: Market; fx: number }) {
  const st = useStore();
  const s = st.settings;
  const pv = portfolioView(st.holdings, market.by);
  const cost = st.holdings.reduce((a, h) => a + h.costUsd, 0);
  const gain = pv.totalUsd - cost;
  const rows = [...st.holdings].sort((a, b) => (pv.weight[b.sym] ?? 0) - (pv.weight[a.sym] ?? 0));
  // bar length: 50% of the portfolio fills the bar, unless a cap or a holding is bigger than that
  const full = Math.max(0.5, s.capPerStock * 1.15, ...Object.values(pv.weight));
  const fullF = Math.max(0.5, s.capFuture * 1.15, pv.futureWeight);
  const bar = (v: number, f: number) => `${Math.min(100, (v / f) * 100)}%`;

  // "had you held today's mix for a year": each holding's 1-year price change, weighted as today
  const yr = (sym: string) => { const sp = market.by[sym]?.spark; return sp?.length ? sp[sp.length - 1] / sp[0] - 1 : 0; };
  const mixYr = st.holdings.reduce((a, h) => a + (pv.weight[h.sym] ?? 0) * yr(h.sym), 0);

  const dlg = useRef<HTMLDialogElement>(null);
  const [sym, setSym] = useState(market.tickers[0].sym);
  const [val, setVal] = useState('');
  const [pl, setPl] = useState('');
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    const v = Number(val), g = Number(pl || 0), t = market.by[sym];
    if (!(v > 0) || !t) { setErr('ใส่มูลค่าเป็นตัวเลขมากกว่า 0'); return; }
    if (!Number.isFinite(g)) { setErr('กำไร/ขาดทุนต้องเป็นตัวเลข เช่น 120 หรือ -45 (เว้นว่างได้)'); return; }
    const rest = st.holdings.filter((h) => h.sym !== sym);
    update({ holdings: [...rest, { sym, shares: v / t.price, costUsd: Math.max(0, v - g) }] });
    setVal(''); setPl(''); setErr(''); dlg.current?.close();
  };
  const doImport = () => { try { importText(paste); setPaste(''); setErr(''); dlg.current?.close(); } catch { setErr('ข้อความสำรองไม่ถูกต้อง ลองคัดลอกใหม่ทั้งก้อน'); } };

  const sheet = (
    <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
      <h3>เพิ่มหรือแก้หุ้นที่ถือ</h3>
      <p className="sheet-sum">ดูตัวเลขจากแอปโบรกเกอร์ของคุณ ข้อมูลนี้เก็บอยู่ในเครื่องนี้เท่านั้น</p>
      <label className="f">หุ้น
        <select value={sym} onChange={(e) => setSym(e.target.value)}>
          {market.tickers.filter((x) => x.group !== 'bench').map((x) => <option key={x.sym} value={x.sym}>{x.sym} — {x.name}</option>)}
        </select>
      </label>
      <label className="f">มูลค่าตอนนี้ (USD)<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></label>
      <label className="f">กำไร/ขาดทุนตอนนี้ (USD) ขาดทุนใส่เครื่องหมายลบ<input inputMode="text" value={pl} onChange={(e) => setPl(e.target.value)} /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={add}>บันทึกหุ้นตัวนี้</button>
      <label className="f">หรือวางข้อความสำรองพอร์ตทั้งก้อน<textarea value={paste} onChange={(e) => setPaste(e.target.value)} /></label>
      <button className="btn ghost" disabled={!paste.trim()} onClick={doImport}>นำเข้าจากข้อความสำรอง</button>
      <button className="btn ghost" onClick={() => dlg.current?.close()}>ปิด</button>
    </dialog>
  );

  if (!st.holdings.length) {
    return (
      <>
        <div className="verdict wait rise">
          <div className="kicker">พอร์ตของคุณ</div>
          <h1>ยังว่างอยู่</h1>
          <p>ใส่หุ้นที่ถืออยู่ แอปจะได้รู้ว่าตัวไหนหนักเกินไปแล้ว และไม่เสนอให้ซื้อซ้ำ</p>
        </div>
        <button className="btn" onClick={() => dlg.current?.showModal()}>ใส่หุ้นที่ถืออยู่</button>
        {sheet}
      </>
    );
  }

  return (
    <>
      <div className="total rise">
        <small>มูลค่าพอร์ต</small>
        <div className="big"><Count to={pv.totalUsd} d={2} /><i>USD</i></div>
        <div className="line num">≈ {thb(pv.totalUsd * fx)} บาท · 1 USD = {fx.toFixed(2)}</div>
        <span className={`pill ${gain >= 0 ? 'green' : ''}`}>กำไรของที่ถืออยู่ {pct(cost ? gain / cost : 0)} ({gain >= 0 ? '+' : '−'}{usd(Math.abs(gain))} USD)</span>
      </div>

      <section>
        <h2><span>สัดส่วน</span><small>ขีดขาว = เพดาน {share(s.capPerStock)} ต่อตัว</small></h2>
        <ul className="alloc card rise">
          {rows.map((h, n) => {
            const t = market.by[h.sym], w = pv.weight[h.sym] ?? 0, v = h.shares * (t?.price ?? 0), g = v - h.costUsd;
            const over = w >= s.capPerStock;
            return (
              <li key={h.sym}>
                <a className="hd" href={`#/s/${h.sym}`}>
                  <span className="s"><Logo sym={h.sym} size={30} />{h.sym}</span>
                  <span className={`w ${over ? 'down' : ''}`}>{share(w)}</span>
                  <Spark data={t?.spark ?? []} w={64} h={22} fill={false} color={g >= 0 ? 'var(--up)' : 'var(--down)'} />
                  <span className="v">{usd(v)}</span>
                </a>
                <div className="bar"><i className={over ? 'over' : ''} style={{ width: bar(w, full), ['--i' as string]: n }} /><u style={{ left: bar(s.capPerStock, full) }} /></div>
                <div className="meta">
                  <span>{!t ? 'ไม่มีราคาของตัวนี้ในรายชื่อเฝ้าดู — ไม่ถูกนับในมูลค่า' : over ? 'เกินเพดาน — แอปจะไม่เสนอซื้อเพิ่ม' : t?.flag ? `ติดธง: ${t.flag.why}` : t?.name}</span>
                  <span className={`num ${g >= 0 ? 'up' : 'down'}`}>{pct(h.costUsd ? g / h.costUsd : 0, 0)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2><span>กลุ่ม{GROUP_TH.future}</span><small>เพดานรวม {share(s.capFuture)}</small></h2>
        <div className="alloc card"><div style={{ padding: '14px 0' }}>
          <div className="hd"><span className="s">รวม</span><span className={`w ${pv.futureWeight > s.capFuture ? 'down' : ''}`}>{share(pv.futureWeight)}</span><span /><span className="v" /></div>
          <div className="bar"><i className={pv.futureWeight > s.capFuture ? 'over' : ''} style={{ width: bar(pv.futureWeight, fullF) }} /><u style={{ left: bar(s.capFuture, fullF) }} /></div>
          <div className="meta"><span>{rows.filter((h) => market.by[h.sym]?.group === 'future').map((h) => h.sym).join(' · ') || 'ไม่มี'}</span></div>
        </div></div>
      </section>

      <section>
        <h2><span>ถ้าถือสัดส่วนนี้มา 1 ปี เทียบกับตลาดรวม</span></h2>
        <div className="pair">
          <div className="card"><small>พอร์ตนี้</small><b className={mixYr >= 0 ? 'up' : 'down'}>{pct(mixYr, 0)}</b></div>
          <div className="card"><small>S&amp;P 500 (VOO)</small><b className={yr('VOO') >= 0 ? 'up' : 'down'}>{pct(yr('VOO'), 0)}</b></div>
        </div>
        <p className="fine" style={{ marginTop: 6 }}>คิดจากราคาย้อนหลัง 1 ปีของหุ้นที่ถือตอนนี้ (ตัวที่เข้าตลาดไม่ถึงปีคิดจากวันแรก) ไม่ใช่ผลตอบแทนจริงของคุณ เพราะแอปไม่รู้ว่าซื้อแต่ละตัวเมื่อไร</p>
      </section>

      <button className="btn ghost" onClick={() => dlg.current?.showModal()}>เพิ่มหรือแก้หุ้นที่ถือ</button>
      {sheet}
    </>
  );
}
