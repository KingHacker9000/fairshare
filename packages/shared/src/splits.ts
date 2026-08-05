import type { BalanceEdge, ExpenseShareInput, SplitMethod } from './types.js';

function distributeRemainder(total: number, raw: Array<{ userId: string; weight: number }>): Record<string, number> {
  if (total < 0 || !Number.isSafeInteger(total)) throw new Error('Total must be a non-negative integer');
  const weightSum = raw.reduce((sum, item) => sum + item.weight, 0);
  if (!(weightSum > 0)) throw new Error('At least one positive split weight is required');

  const rows = raw.map((item) => {
    const exact = (total * item.weight) / weightSum;
    const floor = Math.floor(exact);
    return { ...item, floor, remainder: exact - floor };
  });
  let left = total - rows.reduce((sum, row) => sum + row.floor, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (let i = 0; i < rows.length && left > 0; i += 1, left -= 1) rows[i]!.floor += 1;
  return Object.fromEntries(rows.map((row) => [row.userId, row.floor]));
}

export function calculateExpenseShares(
  totalMinor: number,
  method: SplitMethod,
  shares: ExpenseShareInput[],
): Record<string, number> {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new Error('Expense total must be a positive integer');
  const active = shares.filter((share) => share.included !== false);
  if (active.length === 0) throw new Error('At least one participant is required');
  if (new Set(active.map((share) => share.userId)).size !== active.length) throw new Error('Duplicate participant');

  if (method === 'equal') return distributeRemainder(totalMinor, active.map((share) => ({ userId: share.userId, weight: 1 })));

  if (method === 'exact' || method === 'adjustment') {
    const result = Object.fromEntries(active.map((share) => [share.userId, Math.round(share.value ?? 0)]));
    if (Object.values(result).some((value) => value < 0 || !Number.isSafeInteger(value))) throw new Error('Exact shares must be non-negative integers');
    if (Object.values(result).reduce((sum, value) => sum + value, 0) !== totalMinor) throw new Error('Exact shares must add up to the total');
    return result;
  }

  if (method === 'percentage') {
    const weights = active.map((share) => ({ userId: share.userId, weight: share.value ?? 0 }));
    const percent = weights.reduce((sum, item) => sum + item.weight, 0);
    if (Math.abs(percent - 100) > 0.0001) throw new Error('Percentages must add up to 100');
    return distributeRemainder(totalMinor, weights);
  }

  return distributeRemainder(totalMinor, active.map((share) => ({ userId: share.userId, weight: share.value ?? 0 })));
}

export function simplifyBalances(netByUser: Record<string, number>): BalanceEdge[] {
  const creditors = Object.entries(netByUser)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(netByUser)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const total = Object.values(netByUser).reduce((sum, amount) => sum + amount, 0);
  if (total !== 0) throw new Error(`Balances are not conserved: ${total}`);

  const edges: BalanceEdge[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]!;
    const debtor = debtors[debtorIndex]!;
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > 0) edges.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountMinor: amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }
  return edges;
}
