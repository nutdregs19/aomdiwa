// Phone notifications: this phone registers with the alert server (alert-server/), which reads the
// site's signals once a day and pushes when a stock newly passes all three gates, a held stock gets
// flagged, or the market drops hard. On iPhone this only works from the Home Screen icon (iOS 16.4+).
import { useEffect, useState } from 'react';
import { capBlock, portfolioView } from './lib/scoring.ts';
import { useStore, type State } from './store.ts';
import type { Market } from './data.ts';

// the server's address; '' hides the whole section. localStorage 'aomdiwa.alertServer' overrides (local testing).
const PROD_SERVER = 'https://aomdiwa-alert.nuttakit66.workers.dev';
const VAPID_PUBLIC = 'BL5SedXkZixLWQb1NCks3_rP3-4zLOAlzy9VAzYRaoLaoIMree7Ur_jbQ0OF7UeYkQWYsQIXxOgvVbYuSIN26ZA';
const SERVER = (() => { try { return localStorage.getItem('aomdiwa.alertServer'); } catch { return null; } })()
  ?? (import.meta.env.DEV ? 'http://localhost:8790' : PROD_SERVER);

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64: string) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function current(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(); // (.ready would wait forever without one)
  return reg ? reg.pushManager.getSubscription() : null;
}
async function post(path: string, body: unknown) {
  const r = await fetch(SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || 'server ' + r.status);
  return j;
}

/** What the server needs to know about this phone: tickers only, never amounts. */
function prefs(market: Market, st: State) {
  const pv = portfolioView(st.holdings, market.by);
  return {
    held: st.holdings.map((h) => h.sym).sort(),
    // stocks this portfolio is already full of, or the person hid: no "time to buy" alert for these.
    // Checked for every stock, passing today or not — the alert is about the ones that will pass later.
    skip: [...new Set([...market.tickers.filter((t) => t.group !== 'bench' && capBlock(t, pv, st.settings)).map((t) => t.sym), ...st.hidden])].sort(),
  };
}

let lastSync = '';
/** Keep the server's copy current. Cheap to call on every app open. */
export async function syncAlerts(market: Market, st: State) {
  if (!SERVER) return;
  const sub = await current().catch(() => null);
  if (!sub || Notification.permission !== 'granted') return;
  const p = prefs(market, st), key = JSON.stringify(p);
  if (key === lastSync) return;
  lastSync = key;
  await post('/subscribe', { sub: sub.toJSON(), ...p }).catch(() => { lastSync = ''; });
}

export function AlertSetting({ market }: { market: Market }) {
  const st = useStore();
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { current().then((s) => setOn(!!s && Notification.permission === 'granted'), () => setOn(false)); }, []);
  if (!SERVER || !VAPID_PUBLIC) return null;

  const needHome = isIos() && !isStandalone();
  const run = (f: () => Promise<void>) => async () => { setBusy(true); setMsg(''); try { await f(); } catch (e) { setMsg(String(e).includes('denied') ? 'เครื่องนี้ปิดการแจ้งเตือนของแอปไว้ เปิดได้ในการตั้งค่าของเครื่อง' : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง'); } setBusy(false); };
  const enable = run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) throw new Error('no service worker');
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
    await post('/subscribe', { sub: sub.toJSON(), ...prefs(market, st) });
    setOn(true); setMsg('เปิดแล้ว');
  });
  const disable = run(async () => {
    const sub = await current();
    if (sub) { await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    setOn(false); setMsg('ปิดแล้ว');
  });
  const test = run(async () => {
    const sub = await current();
    if (!sub) throw new Error('off');
    await post('/test', { endpoint: sub.endpoint });
    setMsg('ส่งแล้ว ถ้าไม่เด้งภายในครึ่งนาที ให้เช็คว่าเครื่องไม่ได้เปิดโหมดห้ามรบกวน');
  });

  return (
    <section>
      <h2><span>แจ้งเตือนเข้าเครื่อง</span><small>ไม่เกินวันละครั้ง ราว 7 โมงเช้า</small></h2>
      <div className="card">
        <p className="mute" style={{ fontSize: 14 }}>เด้งเมื่อมีหุ้นเพิ่งผ่านครบ 3 ด่าน (ตามเกณฑ์ตั้งต้นของแอป ไม่ใช่เกณฑ์ที่คุณปรับเอง) · หุ้นที่คุณถือติดธงทบทวน · ตลาดรวมร่วงแรง เซิร์ฟเวอร์รู้แค่ชื่อย่อหุ้นที่คุณถือ ไม่รู้จำนวนเงิน</p>
        {needHome ? (
          <p className="sheet-sum">บน iPhone ต้องเพิ่มแอปลงหน้าจอโฮมก่อน: กดปุ่มแชร์ของ Safari → "เพิ่มไปยังหน้าจอโฮม" แล้วเปิดจากไอคอนนั้น จึงจะเปิดแจ้งเตือนได้</p>
        ) : !pushSupported() ? (
          <p className="sheet-sum">เบราว์เซอร์นี้รับการแจ้งเตือนไม่ได้</p>
        ) : on ? (
          <>
            <button className="btn ghost" disabled={busy} onClick={test}>ส่งแจ้งเตือนทดสอบ</button>
            <button className="btn ghost" disabled={busy} onClick={disable}>ปิดแจ้งเตือน</button>
          </>
        ) : (
          <button className="btn" disabled={busy || on === null} onClick={enable}>เปิดแจ้งเตือน</button>
        )}
        {msg && <p className="sheet-sum">{msg}</p>}
      </div>
    </section>
  );
}
