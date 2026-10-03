// Small shared pieces: sparkline chart, gate list, count-up numbers.
import { useId, useState } from 'react';
import CountUp from './reactbits/CountUp/CountUp.tsx';
import type { Candidate } from './lib/scoring.ts';

/** Area sparkline. `mark` draws a dashed line at that value (the 1-year high). */
export function Spark({ data, w = 320, h = 84, color = 'var(--brass)', mark, fill = true }: { data: number[]; w?: number; h?: number; color?: string; mark?: number; fill?: boolean }) {
  const id = useId();
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data, mark ?? -Infinity), span = hi - lo || 1, pad = 3;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
        </>
      )}
      {mark != null && <line x1="0" x2={w} y1={y(mark)} y2={y(mark)} stroke="var(--dim)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Company logo on a light tile (many logos are dark on transparent); falls back to the first letter. */
export function Logo({ sym, size = 40 }: { sym: string; size?: number }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="logo" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {bad ? sym[0] : <img src={`${import.meta.env.BASE_URL}logos/${sym}.png`} alt="" loading="lazy" onError={() => setBad(true)} />}
    </span>
  );
}

export function Gates({ v }: { v: Pick<Candidate, 'quality' | 'dip' | 'value'> }) {
  const rows = [['บริษัทยังดี', v.quality], ['ราคาย่อ', v.dip], ['ไม่แพงเกิน', v.value]] as const;
  return (
    <ul className="gates">
      {rows.map(([g, x]) => (
        <li key={g} className={x.pass ? '' : 'no'}>
          <span className="mark" aria-hidden="true">{x.pass ? '✓' : '✕'}</span>
          <span><b>{g}</b><span className="t">{x.text}</span></span>
        </li>
      ))}
    </ul>
  );
}

/** Number that counts up once when it scrolls into view. */
export const Count = ({ to, d = 0 }: { to: number; d?: number }) => <CountOnce key={to.toFixed(d)} to={to} d={d} />;

// The spring in CountUp settles slowly (and stalls while the tab is hidden), and a money figure must never
// sit on a wrong value — so once the run time is over, the exact number replaces the animation.
function CountOnce({ to, d }: { to: number; d: number }) {
  const [done, setDone] = useState(false);
  const exact = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(to);
  return done ? <span>{exact}</span> : <CountUp to={+to.toFixed(d)} from={0} duration={0.9} separator="," onEnd={() => setDone(true)} />;
}
