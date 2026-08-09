import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateReceipt, reconcileReceipt } from './receipts.js';
import type { ReceiptScanResult } from './types.js';

test('allocates tax and service charge in proportion to consumed items', () => {
  const receipt: ReceiptScanResult = {
    currency: 'AED',
    confidence: 0.98,
    items: [
      { description: 'Pasta', quantity: 1, unitPriceMinor: 1000, totalMinor: 1000 },
      { description: 'Steak', quantity: 1, unitPriceMinor: 2000, totalMinor: 2000 },
    ],
    adjustments: [
      { label: 'VAT', kind: 'tax', amountMinor: 300 },
      { label: 'Service charge', kind: 'service_charge', amountMinor: 330 },
    ],
    totalMinor: 3630,
  };

  const result = allocateReceipt(receipt, { 0: ['ashish'], 1: ['veeraj'] });
  assert.deepEqual(result.byUser, { ashish: 1210, veeraj: 2420 });
  assert.equal(Object.values(result.byUser).reduce((sum, value) => sum + value, 0), 3630);
  assert.equal(result.reconciliation.status, 'balanced');
});

test('splits shared line items before allocating tax', () => {
  const receipt: ReceiptScanResult = {
    currency: 'USD',
    confidence: 1,
    items: [
      { description: 'Pizza', quantity: 1, unitPriceMinor: 3000, totalMinor: 3000 },
      { description: 'Drink', quantity: 1, unitPriceMinor: 1000, totalMinor: 1000 },
    ],
    adjustments: [{ label: 'Sales tax', kind: 'tax', amountMinor: 400 }],
    totalMinor: 4400,
  };

  const result = allocateReceipt(receipt, { 0: ['a', 'b'], 1: ['a'] });
  assert.deepEqual(result.byUser, { a: 2750, b: 1650 });
});

test('handles negative discounts and tax already included in item prices', () => {
  const receipt: ReceiptScanResult = {
    currency: 'EUR',
    confidence: 0.95,
    items: [
      { description: 'Meal', quantity: 1, unitPriceMinor: 2500, totalMinor: 2500 },
    ],
    adjustments: [
      { label: 'VAT 20%', kind: 'tax', amountMinor: 417, includedInItemPrices: true },
      { label: 'Coupon', kind: 'discount', amountMinor: -500 },
    ],
    totalMinor: 2000,
  };

  const result = allocateReceipt(receipt, { 0: ['a'] });
  assert.deepEqual(result.byUser, { a: 2000 });
  assert.equal(result.reconciliation.status, 'balanced');
});

test('flags extraction arithmetic that does not match the printed grand total', () => {
  const receipt: ReceiptScanResult = {
    currency: 'INR',
    confidence: 0.7,
    items: [{ description: 'Food', quantity: 1, unitPriceMinor: 10000, totalMinor: 10000 }],
    adjustments: [{ label: 'GST', kind: 'tax', amountMinor: 500 }],
    totalMinor: 12000,
  };
  const reconciliation = reconcileReceipt(receipt);
  assert.equal(reconciliation.status, 'mismatch');
  assert.equal(reconciliation.differenceMinor, 1500);
});
