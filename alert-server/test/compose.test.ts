import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../src/index.ts';

const sig = (o: object = {}) => ({ date: '2026-10-05', passing: [{ sym: 'NOW', score: 96 }, { sym: 'AVGO', score: 93 }], flagged: [], market: null, ...o });
const prev = (o: object = {}) => ({ date: '2026-10-02', passing: ['NOW'], flagged: [], marketDay: false, marketDeep: false, ...o });
const me = { held: ['NVDA', 'ACHR'], skip: [] as string[] };

test('ครั้งแรกสุดไม่ส่งอะไร', () => assert.equal(compose(sig(), null, me), null));
test('ครั้งแรกสุดเงียบ แม้ตลาดร่วงลึกอยู่', () => assert.equal(compose(sig({ market: { day: false, deep: true, text: 'x' } }), null, me), null));
test('หุ้นเข้าเกณฑ์ใหม่ → ส่ง เฉพาะตัวใหม่', () => {
  const m = compose(sig(), prev(), me)!;
  assert.match(m.body, /AVGO/); assert.doesNotMatch(m.body, /NOW/);
});
test('ตัวที่พอร์ตเต็มแล้ว/ซ่อนไว้ ไม่ส่ง', () => assert.equal(compose(sig(), prev(), { held: [], skip: ['AVGO'] }), null));
test('ไม่มีอะไรใหม่ → ไม่ส่ง', () => assert.equal(compose(sig(), prev({ passing: ['NOW', 'AVGO'] }), me), null));
test('ธงใหม่ของตัวที่ถือ → ส่ง · ของตัวที่ไม่ได้ถือ → ไม่ส่ง', () => {
  const s = sig({ passing: [], flagged: [{ sym: 'ACHR', why: 'เงินสดใกล้หมด' }, { sym: 'JOBY', why: 'x' }] });
  const m = compose(s, prev({ passing: [] }), me)!;
  assert.match(m.body, /ACHR/); assert.doesNotMatch(m.body, /JOBY/);
  assert.equal(compose(s, prev({ passing: [], flagged: ['ACHR', 'JOBY'] }), me), null);
});
test('ตลาดร่วงวันเดียว ส่งทุกครั้ง · ร่วงลึกส่งครั้งแรกครั้งเดียว', () => {
  const day = sig({ passing: [], market: { day: true, deep: false, text: 'ตลาดรวมลง 3.5% ในวันเดียว' } });
  assert.ok(compose(day, prev({ passing: [] }), me));
  const deep = sig({ passing: [], market: { day: false, deep: true, text: 'ตลาดรวมต่ำกว่าจุดสูงสุด 11%' } });
  assert.ok(compose(deep, prev({ passing: [] }), me));
  assert.equal(compose(deep, prev({ passing: [], marketDeep: true }), me), null);
});
