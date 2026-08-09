import type {
  ReceiptAdjustment,
  ReceiptLineItem,
  ReceiptReconciliation,
  ReceiptScanResult,
} from './types.js';

export type ReceiptAdjustmentPolicy = 'proportional' | 'equal';

export interface ReceiptAllocationOptions {
  tax?: ReceiptAdjustmentPolicy;
  tip?: ReceiptAdjustmentPolicy;
  serviceCharge?: ReceiptAdjustmentPolicy;
  fee?: ReceiptAdjustmentPolicy;
  discount?: ReceiptAdjustmentPolicy;
  rounding?: ReceiptAdjustmentPolicy;
  other?: ReceiptAdjustmentPolicy;
}

export interface ReceiptAllocationResult {
  byUser: Record<string, number>;
  itemSubtotalByUser: Record<string, number>;
  adjustmentByUser: Record<string, number>;
  reconciliation: ReceiptReconciliation;
  warnings: string[];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ensureSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer in minor units`);
  return value;
}

function distributeSigned(totalMinor: number, weights: Array<{ userId: string; weight: number }>): Record<string, number> {
  ensureSafeInteger(totalMinor, 'Adjustment');
  const active = weights.filter((row) => Number.isFinite(row.weight) && row.weight > 0);
  if (!active.length) throw new Error('At least one positive allocation weight is required');
  const sign = totalMinor < 0 ? -1 : 1;
  const absolute = Math.abs(totalMinor);
  const weightTotal = active.reduce((total, row) => total + row.weight, 0);
  const rows = active.map((row) => {
    const exact = (absolute * row.weight) / weightTotal;
    const floor = Math.floor(exact);
    return { ...row, floor, remainder: exact - floor };
  });
  let remainder = absolute - rows.reduce((total, row) => total + row.floor, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (let index = 0; index < rows.length && remainder > 0; index += 1, remainder -= 1) rows[index]!.floor += 1;
  return Object.fromEntries(rows.map((row) => [row.userId, row.floor * sign]));
}

function normalizeLegacyAdjustments(receipt: ReceiptScanResult): ReceiptAdjustment[] {
  if (receipt.adjustments?.length) return receipt.adjustments;
  const adjustments: ReceiptAdjustment[] = [];
  if (receipt.taxMinor) adjustments.push({ label: 'Tax', kind: 'tax', amountMinor: receipt.taxMinor });
  if (receipt.tipMinor) adjustments.push({ label: 'Tip', kind: 'tip', amountMinor: receipt.tipMinor });
  return adjustments;
}

export function reconcileReceipt(receipt: ReceiptScanResult, roundingToleranceMinor = 2): ReceiptReconciliation {
  const itemsTotalMinor = sum(receipt.items.map((item) => ensureSafeInteger(item.totalMinor, 'Item total')));
  const adjustments = normalizeLegacyAdjustments(receipt);
  const adjustmentsTotalMinor = sum(
    adjustments
      .filter((adjustment) => !adjustment.includedInItemPrices)
      .map((adjustment) => ensureSafeInteger(adjustment.amountMinor, 'Adjustment')),
  );
  const computedTotalMinor = itemsTotalMinor + adjustmentsTotalMinor;
  const printedTotalMinor = receipt.totalMinor;

  if (printedTotalMinor === undefined) {
    return {
      itemsTotalMinor,
      adjustmentsTotalMinor,
      computedTotalMinor,
      differenceMinor: 0,
      status: 'unknown',
    };
  }

  ensureSafeInteger(printedTotalMinor, 'Receipt total');
  const differenceMinor = printedTotalMinor - computedTotalMinor;
  return {
    itemsTotalMinor,
    adjustmentsTotalMinor,
    computedTotalMinor,
    printedTotalMinor,
    differenceMinor,
    status: differenceMinor === 0 ? 'balanced' : Math.abs(differenceMinor) <= roundingToleranceMinor ? 'rounding' : 'mismatch',
  };
}

function itemIndexesForAdjustment(adjustment: ReceiptAdjustment, items: ReceiptLineItem[]): number[] {
  const requested = adjustment.appliesToItemIndexes?.filter((index) => Number.isInteger(index) && index >= 0 && index < items.length);
  return requested?.length ? requested : items.map((_, index) => index);
}

function peopleForItems(itemAssignments: Record<number, string[]>, indexes: number[]): string[] {
  return [...new Set(indexes.flatMap((index) => itemAssignments[index] ?? []))].sort();
}

function policyForAdjustment(adjustment: ReceiptAdjustment, options: ReceiptAllocationOptions): ReceiptAdjustmentPolicy {
  switch (adjustment.kind) {
    case 'tax': return options.tax ?? 'proportional';
    case 'tip': return options.tip ?? 'proportional';
    case 'service_charge': return options.serviceCharge ?? 'proportional';
    case 'fee': return options.fee ?? 'proportional';
    case 'discount': return options.discount ?? 'proportional';
    case 'rounding': return options.rounding ?? 'proportional';
    default: return options.other ?? 'proportional';
  }
}

export function allocateReceipt(
  receipt: ReceiptScanResult,
  itemAssignments: Record<number, string[]>,
  options: ReceiptAllocationOptions = {},
): ReceiptAllocationResult {
  if (!receipt.items.length) throw new Error('Receipt has no line items to allocate');

  const byUser: Record<string, number> = {};
  const itemSubtotalByUser: Record<string, number> = {};
  const adjustmentByUser: Record<string, number> = {};
  const itemUserContributions = new Map<number, Record<string, number>>();
  const warnings = [...(receipt.warnings ?? [])];

  for (const [index, item] of receipt.items.entries()) {
    const assigned = [...new Set(itemAssignments[index] ?? [])].sort();
    if (!assigned.length) throw new Error(`Assign at least one person to “${item.description}”`);
    const itemTotal = ensureSafeInteger(item.totalMinor, 'Item total');
    if (itemTotal < 0) throw new Error('Receipt item totals cannot be negative');
    const shares = distributeSigned(itemTotal, assigned.map((userId) => ({ userId, weight: 1 })));
    itemUserContributions.set(index, shares);
    for (const [userId, amount] of Object.entries(shares)) {
      itemSubtotalByUser[userId] = (itemSubtotalByUser[userId] ?? 0) + amount;
      byUser[userId] = (byUser[userId] ?? 0) + amount;
    }
  }

  const adjustments = normalizeLegacyAdjustments(receipt);
  for (const adjustment of adjustments) {
    if (adjustment.includedInItemPrices || adjustment.amountMinor === 0) continue;
    const indexes = itemIndexesForAdjustment(adjustment, receipt.items);
    const users = peopleForItems(itemAssignments, indexes);
    if (!users.length) continue;
    const policy = policyForAdjustment(adjustment, options);

    let weights: Array<{ userId: string; weight: number }>;
    if (policy === 'equal') {
      weights = users.map((userId) => ({ userId, weight: 1 }));
    } else {
      const relevantSpend: Record<string, number> = {};
      for (const index of indexes) {
        for (const [userId, amount] of Object.entries(itemUserContributions.get(index) ?? {})) {
          relevantSpend[userId] = (relevantSpend[userId] ?? 0) + amount;
        }
      }
      weights = users.map((userId) => ({ userId, weight: relevantSpend[userId] ?? 0 }));
      if (!weights.some((row) => row.weight > 0)) weights = users.map((userId) => ({ userId, weight: 1 }));
    }

    const shares = distributeSigned(adjustment.amountMinor, weights);
    for (const [userId, amount] of Object.entries(shares)) {
      adjustmentByUser[userId] = (adjustmentByUser[userId] ?? 0) + amount;
      byUser[userId] = (byUser[userId] ?? 0) + amount;
    }
  }

  const reconciliation = reconcileReceipt(receipt);
  if (reconciliation.status === 'mismatch') {
    warnings.push(`Receipt arithmetic is off by ${reconciliation.differenceMinor} minor units. Review the highlighted lines before saving.`);
  }

  // Small printed rounding differences are common. Treat them as a final proportional rounding line
  // so the assigned people always add up to the printed receipt total.
  if (reconciliation.printedTotalMinor !== undefined && reconciliation.differenceMinor !== 0 && reconciliation.status !== 'mismatch') {
    const users = Object.keys(itemSubtotalByUser).sort();
    const roundingShares = distributeSigned(
      reconciliation.differenceMinor,
      users.map((userId) => ({ userId, weight: Math.max(1, itemSubtotalByUser[userId] ?? 0) })),
    );
    for (const [userId, amount] of Object.entries(roundingShares)) {
      adjustmentByUser[userId] = (adjustmentByUser[userId] ?? 0) + amount;
      byUser[userId] = (byUser[userId] ?? 0) + amount;
    }
  }

  const assignedTotal = sum(Object.values(byUser));
  if (reconciliation.printedTotalMinor !== undefined && reconciliation.status !== 'mismatch' && assignedTotal !== reconciliation.printedTotalMinor) {
    throw new Error(`Receipt allocation did not conserve the printed total (${assignedTotal} != ${reconciliation.printedTotalMinor})`);
  }

  return { byUser, itemSubtotalByUser, adjustmentByUser, reconciliation, warnings };
}
