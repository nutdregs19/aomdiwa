import { useEffect, useState } from 'react';
import Aurora from './reactbits/Aurora/Aurora.tsx';
import { useFx, useJson, useMarket, thDate, type InsiderFile, type Review } from './data.ts';
import { rank, spendable, topPick } from './lib/scoring.ts';
import { useStore } from './store.ts';
import { syncAlerts } from './push.tsx';
import { Home } from './pages/Home.tsx';
import { Portfolio } from './pages/Portfolio.tsx';
import { Watch } from './pages/Watch.tsx';
import { Stock } from './pages/Stock.tsx';
import { Log } from './pages/Log.tsx';
import { Settings } from './pages/Settings.tsx';

const TABS = [
  ['', 'วันนี้'],
  ['port', 'พอร์ต'],
  ['watch', 'เฝ้าดู'],
  ['log', 'สมุดพก'],
  ['set', 'ตั้งค่า'],
] as const;

function useRoute() {
  const read = () => { const h = location.hash.replace(/^#\/?/, ''); try { return decodeURIComponent(h); } catch { return h; } };
  const [r, set] = useState(read);
  useEffect(() => {
    const f = () => { set(read()); window.scrollTo(0, 0); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const route = useRoute();
  const { market, error } = useMarket();
  const review = useJson<Review>(market?.review ? `monthly/${market.review}.json` : null).data;
  const insiders = useJson<InsiderFile>(market ? 'insiders.json' : null).data;
  const fx = useFx();
  const st = useStore();
  const [tab, arg] = route.split('/');
  // gold sky when there is something to buy, a quiet one when the answer is "wait"
  const canSpend = spendable(st.pileThb, st.settings);
  const go = !!market && canSpend > 0 && !!topPick(rank(market.tickers, st.holdings, st.settings, st.hidden));

  useEffect(() => { if (market) void syncAlerts(market, st); }, [market, st]);

  return (
    <>
      {!calm && (
        <div className={`sky ${go ? '' : 'wait'}`} aria-hidden="true">
          <Aurora colorStops={['#1f7a55', '#e2ad45', '#2f6d7a']} amplitude={1.1} blend={0.6} speed={0.5} />
        </div>
      )}
      <div className="app">
        <header className="top">
          <a className="brand" href="#/">ออมดิวะ</a>
          {market && <div className="asof">ราคาปิด {thDate(market.date)}</div>}
        </header>

        {error && <p className="empty">โหลดข้อมูลราคาไม่ได้ ลองเปิดใหม่อีกครั้งเมื่อมีสัญญาณอินเทอร์เน็ต</p>}
        {!market && !error && <p className="empty">กำลังโหลดราคา…</p>}
        {market && (
          tab === '' ? <Home market={market} fx={fx.rate} review={review} />
          : tab === 'port' ? <Portfolio market={market} fx={fx.rate} />
          : tab === 'watch' ? <Watch market={market} insiders={insiders} />
          : tab === 's' ? <Stock key={arg} market={market} sym={(arg ?? '').toUpperCase()} review={review} insiders={insiders} />
          : tab === 'log' ? <Log market={market} />
          : tab === 'set' ? <Settings market={market} />
          : <p className="empty">ไม่พบหน้านี้ <a href="#/" style={{ color: 'var(--brass)' }}>กลับหน้าแรก</a></p>
        )}
      </div>

      <div className="tabs">
        <nav>
          {TABS.map(([id, label]) => (
            <a key={id} href={`#/${id}`} aria-current={tab === id || (id === 'watch' && tab === 's') ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </div>
    </>
  );
}
