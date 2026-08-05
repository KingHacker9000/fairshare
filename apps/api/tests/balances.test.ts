import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateExpenseShares, simplifyBalances } from '@fairshare/shared';

test('itemized exact split rejects a mismatch', () => {
  assert.throws(() => calculateExpenseShares(1000, 'exact', [{ userId: 'a', value: 500 }, { userId: 'b', value: 499 }]));
});

test('debt simplification creates at most creditors plus debtors minus one edges', () => {
  const edges = simplifyBalances({ a: 500, b: 300, c: -200, d: -600 });
  assert.ok(edges.length <= 3);
  assert.equal(edges.reduce((sum, edge) => sum + edge.amountMinor, 0), 800);
});
