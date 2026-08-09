import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateReceipt } from '@fairshare/shared';
import { parseReceiptLines, type OcrLine } from '../src/receipt-local.js';

function lines(values: string[]): OcrLine[] {
  return values.map((text, index) => ({ text, confidence: 94, left: 10, top: index * 20, width: 400, height: 18 }));
}

test('restaurant receipt extracts items, VAT and service charge then reconciles', () => {
  const receipt = parseReceiptLines(lines([
    'THE TEST KITCHEN',
    'Chicken Fried Rice 48.00',
    'Veg Fried Rice 42.00',
    'Coke Zero 12.00',
    'Lime Iced Tea 16.00',
    'Shared Appetizer 30.00',
    'Subtotal 148.00',
    'VAT 5% 7.40',
    'Service Charge 10% 14.80',
    'TOTAL AED 170.20',
  ]));

  assert.equal(receipt.merchant, 'THE TEST KITCHEN');
  assert.equal(receipt.currency, 'AED');
  assert.equal(receipt.items.length, 5);
  assert.equal(receipt.adjustments?.length, 2);
  assert.equal(receipt.totalMinor, 17020);
  assert.equal(receipt.reconciliation?.status, 'balanced');
});

test('quantity rows use the final extended price rather than the unit price', () => {
  const receipt = parseReceiptLines(lines([
    'Grocery',
    '2 x 14.50 Sparkling Water 29.00',
    'Subtotal 29.00',
    'Total AED 29.00',
  ]));
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0]?.quantity, 2);
  assert.equal(receipt.items[0]?.unitPriceMinor, 1450);
  assert.equal(receipt.items[0]?.totalMinor, 2900);
  assert.equal(receipt.reconciliation?.status, 'balanced');
});

test('allocation applies tax and service proportionally to assigned item spend', () => {
  const receipt = parseReceiptLines(lines([
    'Cafe',
    'Ashish Item 100.00',
    'Hari Item 50.00',
    'Subtotal 150.00',
    'VAT 5% 7.50',
    'Service Charge 10% 15.00',
    'Total AED 172.50',
  ]));
  const allocation = allocateReceipt(receipt, { 0: ['ashish'], 1: ['hari'] });
  assert.equal(allocation.byUser.ashish, 11500);
  assert.equal(allocation.byUser.hari, 5750);
  assert.equal(Object.values(allocation.byUser).reduce((sum, value) => sum + value, 0), 17250);
});

test('tax-inclusive receipts do not add VAT twice', () => {
  const receipt = parseReceiptLines(lines([
    'Market',
    'Milk 5.00',
    'Bread 5.00',
    'VAT included 0.48',
    'TOTAL EUR 10.00',
  ]));
  assert.equal(receipt.taxIncluded, true);
  assert.equal(receipt.adjustments?.[0]?.includedInItemPrices, true);
  assert.equal(receipt.reconciliation?.status, 'balanced');
});

test('discounts are signed negative and conserved', () => {
  const receipt = parseReceiptLines(lines([
    'Shop',
    'Burger 50.00',
    'Pizza 50.00',
    'Coupon Discount 20.00',
    'Tax 8.00',
    'TOTAL USD 88.00',
  ]));
  assert.equal(receipt.adjustments?.find((item) => item.kind === 'discount')?.amountMinor, -2000);
  assert.equal(receipt.reconciliation?.status, 'balanced');
});
