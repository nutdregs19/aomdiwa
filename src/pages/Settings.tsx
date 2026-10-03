import { useState } from 'react';
import { DEFAULTS, type Settings as S } from '../lib/scoring.ts';
import { exportText, importText, removeHolding, setSettings, toggleHidden, update, useStore } from '../store.ts';
import { thDate, usd, type Market } from '../data.ts';
import { AlertSetting } from '../push.tsx';

function Num({ label, hint, value, onChange, pct, unit }: { label: string; hint?: string; value: number; onChange: (v: number) => void; pct?: boolean; unit?: string }) {
  const [txt, setTxt] = useState(String(pct ? Math.round(value * 100) : value));
  return (
    <label className="f">{label}{hint && <span className="hint"> — {hint}</span>}
      <span className="unit">
        <input
          inputMode="decimal" value={txt}
          onChange={(e) => {
            const s = e.target.value.replace(/[^\d.]/g, '');
            setTxt(s);
            const v = Number(s);
            if (s !== '' && Number.isFinite(v) && (!pct || (v > 0 && v <= 100))) onChange(pct ? v / 100 : v);
          }}
        />
        <i>{unit ?? (pct ? '%' : 'บาท')}</i>
      </span>
    </label>
  );
}

export function Settings({ market }: { market: Market }) {
  const st = useStore();
  const s = st.settings;
  const set = (k: keyof S) => (v: number) => setSettings({ [k]: v });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [key, setKey] = useState(0); // remount the inputs after a reset/import

  const copy = async () => {
    try { await navigator.clipboard.writeText(exportText()); setMsg('คัดลอกแล้ว เก็บข้อความนี้ไว้ในโน้ตหรือส่งให้ตัวเองทางแชต'); }
    catch { setPaste(exportText()); setMsg('คัดลอกอัตโนมัติไม่ได้ ข้อความอยู่ในช่องด้านล่าง กดค้างแล้วคัดลอกเอง'); }
  };
  const doImport = () => { try { importText(paste); setPaste(''); setKey((k) => k + 1); setMsg('นำเข้าเรียบร้อย'); } catch { setMsg('ข้อความสำรองไม่ถูกต้อง ลองคัดลอกใหม่ทั้งก้อน'); } };

  return (
    <div key={key}>
      <div className="verdict wait rise"><div className="kicker">ตั้งค่า</div><h1>ปรับให้เป็นของคุณ</h1></div>

      <section>
        <h2><span>เงินลงทุน</span></h2>
        <div className="card">
          <Num label="งบต่อเดือน" value={s.budgetThb} onChange={set('budgetThb')} />
          <Num label="เงินสะสมรอจังหวะตอนนี้" hint="ทุกต้นเดือนแอปบวกงบเดือนใหม่ให้เอง" value={Math.round(st.pileThb)} onChange={(v) => update({ pileThb: v })} />
          <Num label="ลงได้สูงสุดต่อครั้ง กี่เท่าของงบ" value={s.maxMonths} onChange={(v) => v >= 1 && set('maxMonths')(v)} unit="เท่า" />
        </div>
      </section>

      <section>
        <h2><span>เพดานและเกณฑ์</span><small>ค่าตั้งต้น {DEFAULTS.capPerStock * 100} / {DEFAULTS.capFuture * 100} / {DEFAULTS.dipBig * 100} / {DEFAULTS.dipFuture * 100}</small></h2>
        <div className="card">
          <Num pct label="หุ้นหนึ่งตัวไม่เกิน" hint="เกินแล้วไม่เสนอซื้อเพิ่ม" value={s.capPerStock} onChange={set('capPerStock')} />
          <Num pct label="กลุ่มธีมอนาคต (เสี่ยงสูง) รวมไม่เกิน" value={s.capFuture} onChange={set('capFuture')} />
          <Num pct label="หุ้นใหญ่ต้องย่อจากจุดสูงสุดอย่างน้อย" value={s.dipBig} onChange={set('dipBig')} />
          <Num pct label="หุ้นธีมอนาคตต้องย่ออย่างน้อย" value={s.dipFuture} onChange={set('dipFuture')} />
          <button className="btn ghost" onClick={() => { setSettings({ ...DEFAULTS, budgetThb: s.budgetThb }); setKey((k) => k + 1); }}>กลับไปใช้ค่าตั้งต้น</button>
        </div>
      </section>

      <AlertSetting market={market} />

      <section>
        <h2><span>หุ้นที่ถือ</span><small>เพิ่มหรือแก้ที่หน้าพอร์ต</small></h2>
        <div className="card">
          {st.holdings.length ? st.holdings.map((h) => (
            <div className="line" key={h.sym}>
              <span><b className="num">{h.sym}</b> <span className="mute num">{h.shares.toFixed(4)} หุ้น · ทุน ${usd(h.costUsd)}</span></span>
              <button onClick={() => confirm(`เอา ${h.sym} ออกจากพอร์ตในแอป? (ไม่กระทบหุ้นจริงในโบรกเกอร์)`) && removeHolding(h.sym)}>เอาออก</button>
            </div>
          )) : <p className="mute">ยังไม่ได้ใส่หุ้น</p>}
        </div>
      </section>

      {st.hidden.length > 0 && (
        <section>
          <h2><span>หุ้นที่ซ่อนไว้</span></h2>
          <div className="card">
            {st.hidden.map((sym) => (
              <div className="line" key={sym}><b className="num">{sym}</b><button onClick={() => toggleHidden(sym)}>กลับมาเฝ้าดู</button></div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2><span>สำรองและย้ายเครื่อง</span></h2>
        <div className="card">
          <p className="mute" style={{ fontSize: 14 }}>พอร์ตของคุณเก็บอยู่ในเครื่องนี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่องจะหาย สำรองไว้เป็นข้อความได้</p>
          <button className="btn ghost" onClick={copy}>คัดลอกข้อความสำรอง</button>
          <label className="f">วางข้อความสำรองเพื่อนำเข้า<textarea value={paste} onChange={(e) => setPaste(e.target.value)} /></label>
          <button className="btn ghost" disabled={!paste.trim()} onClick={doImport}>นำเข้า (แทนที่พอร์ตในเครื่องนี้)</button>
          {msg && <p className="sheet-sum">{msg}</p>}
        </div>
      </section>

      <section>
        <h2><span>เกี่ยวกับข้อมูล</span></h2>
        <div className="card mute" style={{ fontSize: 14 }}>
          <p>ราคาและตัวเลขงบมาจาก Yahoo Finance อัปเดตวันละครั้งหลังตลาดสหรัฐฯ ปิด (ล่าสุด {thDate(market.date)}) อัตราแลกเปลี่ยนจาก Frankfurter</p>
          <p style={{ marginTop: 8 }}>บทสรุปรายเดือนเขียนโดย AI (Claude) จากข่าวและงบที่มีลิงก์ต้นทางกำกับทุกข้อ อาจผิดพลาดได้ กดลิงก์ตรวจเองก่อนตัดสินใจ</p>
          <p style={{ marginTop: 8 }}>ออมดิวะไม่ใช่ที่ปรึกษาการลงทุน ไม่ได้รับอนุญาตจาก ก.ล.ต. ไม่รับเงินและไม่ซื้อขายแทนใคร ทุกการตัดสินใจและผลที่เกิดเป็นของผู้ใช้เอง</p>
        </div>
      </section>
    </div>
  );
}
