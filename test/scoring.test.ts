import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, rank, topPick, spendable, marketDrop, monthsBetween, sane, DEFAULTS, type Ticker, type Holding } from '../src/lib/scoring.ts';

const T = (o: Partial<Ticker> & { sym: string }): Ticker => ({
  name: o.sym, what: '', group: 'tech', price: 100, prevClose: 100, date: '2026-10-02', high52: 125, drawdown: 0.2,
  valuation: { metric: 'fpe', current: 20, median: 25, n: 8, since: '2024-01-01' }, revGrowth: 0.2, flag: null, spark: [], ...o,
});

test('ผ่านครบ 3 ด่าน', () => {
  const v = judge(T({ sym: 'A' }));
  assert.equal(v.passAll, true);
  assert.ok(v.score > 0 && v.score <= 100);
});

test('ย่อไม่ถึงเกณฑ์ = ไม่ผ่าน', () => assert.equal(judge(T({ sym: 'A', drawdown: 0.05 })).passAll, false));
test('หุ้นเสี่ยงสูงต้องย่อ 25%', () => {
  assert.equal(judge(T({ sym: 'A', group: 'future', drawdown: 0.2 })).passAll, false);
  assert.equal(judge(T({ sym: 'A', group: 'future', drawdown: 0.3 })).passAll, true);
});
test('แพงกว่าค่ากลางตัวเอง = ไม่ผ่าน', () =>
  assert.equal(judge(T({ sym: 'A', valuation: { metric: 'fpe', current: 30, median: 25, n: 8, since: '' } })).passAll, false));
test('วัดความถูกแพงไม่ได้ = ไม่ผ่าน', () => assert.equal(judge(T({ sym: 'A', valuation: null })).passAll, false));
test('ติดธง = ไม่ผ่าน แม้ราคาถูกแค่ไหน', () =>
  assert.equal(judge(T({ sym: 'A', drawdown: 0.6, flag: { by: 'review', why: 'x' } })).passAll, false));
test('กองดัชนีไม่ถูกเสนอ', () => assert.equal(judge(T({ sym: 'VOO', group: 'bench' })).passAll, false));

test('เพดาน 25% ต่อตัว: ตัวที่หนักเกินถูกข้าม ตัวรองได้แทน', () => {
  const ts = [T({ sym: 'BIG', drawdown: 0.4 }), T({ sym: 'OK', drawdown: 0.15 }), T({ sym: 'X', drawdown: 0 })];
  const h: Holding[] = [{ sym: 'BIG', shares: 41, costUsd: 0 }, { sym: 'X', shares: 59, costUsd: 0 }];
  const c = rank(ts, h);
  assert.ok(c.find((x) => x.sym === 'BIG')!.blocked);
  assert.equal(topPick(c)!.sym, 'OK');
});

test('เพดานกลุ่มเสี่ยงสูง 35%', () => {
  const ts = [T({ sym: 'F1', group: 'future', drawdown: 0.5 }), T({ sym: 'F2', group: 'future', drawdown: 0 }), T({ sym: 'S', group: 'stable', drawdown: 0 })];
  const h: Holding[] = [{ sym: 'F2', shares: 36, costUsd: 0 }, { sym: 'S', shares: 64, costUsd: 0 }];
  const c = rank(ts, h);
  assert.match(c[0].blocked ?? '', /กลุ่มเสี่ยงสูง/);
  assert.equal(topPick(c), null);
});

test('พอร์ตว่าง: ซื้อครั้งแรกไม่ชนเพดาน', () => assert.equal(topPick(rank([T({ sym: 'A' })], []))!.sym, 'A'));
test('ไม่มีตัวผ่าน = เก็บเงินสด', () => assert.equal(topPick(rank([T({ sym: 'A', drawdown: 0 })], [])), null));

test('เงินสะสมลงได้ไม่เกิน 3 เท่าของงบ', () => {
  assert.equal(spendable(20000, { ...DEFAULTS, budgetThb: 5000 }), 15000);
  assert.equal(spendable(4000, { ...DEFAULTS, budgetThb: 5000 }), 4000);
  assert.equal(spendable(-10), 0);
});

test('ตลาดร่วงแรง', () => {
  assert.equal(marketDrop(T({ sym: 'VOO', price: 100, prevClose: 100, drawdown: 0.02 })), null);
  assert.equal(marketDrop(T({ sym: 'VOO', price: 96, prevClose: 100, drawdown: 0.05 }))!.day, true);
  assert.equal(marketDrop(T({ sym: 'VOO', price: 100, prevClose: 100, drawdown: 0.12 }))!.deep, true);
});

test('นับเดือน', () => { assert.equal(monthsBetween('2026-10', '2027-01'), 3); assert.equal(monthsBetween('2026-10', '2026-10'), 0); });

test('พอร์ตเล็ก (ถือตัวเดียว) ยังซื้อตัวอื่นได้ ไม่ถูกเพดานล็อกทั้งหมด', () => {
  const ts = [T({ sym: 'HELD', drawdown: 0.3 }), T({ sym: 'NEW', drawdown: 0.15 })];
  const c = rank(ts, [{ sym: 'HELD', shares: 1.2, costUsd: 0 }]);
  assert.ok(c.find((x) => x.sym === 'HELD')!.blocked);
  assert.equal(topPick(c)!.sym, 'NEW');
});

test('หุ้นที่ซ่อนไว้ไม่ถูกเสนอ แต่ยังนับน้ำหนักในพอร์ต', () => {
  const ts = [T({ sym: 'HID', drawdown: 0.3 }), T({ sym: 'SMALL', drawdown: 0.2 })];
  const h: Holding[] = [{ sym: 'HID', shares: 92, costUsd: 0 }, { sym: 'SMALL', shares: 8, costUsd: 0 }];
  const c = rank(ts, h, DEFAULTS, ['HID']);
  assert.equal(c.length, 1);
  assert.equal(c[0].sym, 'SMALL');
  assert.equal(c[0].blocked, null); // 8% of the real total, not 100% of a total that forgot HID
});

test('ค่าตั้งค่าเพี้ยนถูกดึงกลับเป็นค่าตั้งต้น', () => {
  const s = sane({ dipBig: 0, capPerStock: 5, budgetThb: -1, maxMonths: NaN } as any);
  assert.deepEqual(s, DEFAULTS);
  assert.ok(Number.isFinite(judge(T({ sym: 'A' }), s).score));
});
