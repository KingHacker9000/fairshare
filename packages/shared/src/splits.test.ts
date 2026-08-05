import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateExpenseShares, simplifyBalances } from './splits.js';

test('equal split preserves every cent', () => {
  assert.deepEqual(calculateExpenseShares(1000, 'equal', [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]), { a: 334, b: 333, c: 333 });
});

test('percentage split distributes remainder deterministically', () => {
  assert.deepEqual(calculateExpenseShares(999, 'percentage', [{ userId: 'a', value: 60 }, { userId: 'b', value: 40 }]), { a: 599, b: 400 });
});

test('simplification conserves balances', () => {
  const result = simplifyBalances({ a: 1000, b: -400, c: -600 });
  assert.equal(result.reduce((sum, edge) => sum + edge.amountMinor, 0), 1000);
});
