import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyName, toTrade } from '../scripts/fetch-insiders.ts';

const row = (o: object) => ({ insider: 'STEVENS MARK A', relation: 'Director', lastDate: '9/8/2026', transactionType: 'Sell', sharesTraded: '1,366,000', lastPrice: '$219.72', ...o });

test('ชื่อ: นามสกุลมาก่อน → ชื่อก่อน · ชื่อกองทุนไม่สลับ', () => {
  assert.equal(tidyName('HUANG JEN HSUN'), 'Jen Hsun Huang');
  assert.equal(tidyName('VANGUARD GROUP INC'), 'Vanguard Group Inc');
});

test('ขายในตลาด', () => {
  const t = toTrade(row({}))!;
  assert.deepEqual([t.side, t.date, t.shares, t.usd, t.planned], ['S', '2026-09-08', 1366000, 300137520, false]);
});
test('ขายตามแผนล่วงหน้า', () => assert.equal(toTrade(row({ transactionType: 'Automatic Sell' }))!.planned, true));
test('ซื้อในตลาด', () => assert.equal(toTrade(row({ transactionType: 'Buy' }))!.side, 'B'));
test('ไม่นับ: ใช้สิทธิ ของขวัญ โอนนอกตลาด ราคา 0', () => {
  assert.equal(toTrade(row({ transactionType: 'Option Execute' })), null);
  assert.equal(toTrade(row({ transactionType: 'Disposition (Non Open Market)', lastPrice: '$0.00' })), null);
  assert.equal(toTrade(row({ transactionType: 'Acquisition (Non Open Market)' })), null);
  assert.equal(toTrade(row({ lastPrice: '$0.00' })), null);
  assert.equal(toTrade(row({ lastDate: 'N/A' })), null);
});
