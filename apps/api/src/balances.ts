import { simplifyBalances, type GroupBalance } from '@fairshare/shared';
import { db } from './db.js';

export function calculateGroupBalance(groupId: string, currency: string): GroupBalance {
  const normalizedCurrency = currency.toUpperCase();
  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId) as Array<{ user_id: string }>;
  const netByUser: Record<string, number> = Object.fromEntries(members.map((member) => [member.user_id, 0]));

  const expenses = db.prepare(
    `SELECT e.id AS expense_id, e.paid_by_user_id, e.amount_minor, s.user_id, s.owed_minor
     FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
     WHERE e.group_id = ? AND e.deleted_at IS NULL AND e.currency = ?`,
  ).all(groupId, normalizedCurrency) as Array<{ expense_id: string; paid_by_user_id: string; amount_minor: number; user_id: string; owed_minor: number }>;

  const seen = new Set<string>();
  for (const row of expenses) {
    netByUser[row.user_id] = (netByUser[row.user_id] ?? 0) - row.owed_minor;
    if (!seen.has(row.expense_id)) {
      netByUser[row.paid_by_user_id] = (netByUser[row.paid_by_user_id] ?? 0) + row.amount_minor;
      seen.add(row.expense_id);
    }
  }

  const payments = db.prepare(
    `SELECT from_user_id, to_user_id, amount_minor FROM payments WHERE group_id = ? AND currency = ?`,
  ).all(groupId, normalizedCurrency) as Array<{ from_user_id: string; to_user_id: string; amount_minor: number }>;
  for (const payment of payments) {
    netByUser[payment.from_user_id] = (netByUser[payment.from_user_id] ?? 0) + payment.amount_minor;
    netByUser[payment.to_user_id] = (netByUser[payment.to_user_id] ?? 0) - payment.amount_minor;
  }

  return { currency: normalizedCurrency, netByUser, settlements: simplifyBalances(netByUser) };
}

export function calculateGroupBalances(groupId: string, fallbackCurrency: string): GroupBalance[] {
  const rows = db.prepare(
    `SELECT currency FROM expenses WHERE group_id = ? AND deleted_at IS NULL
     UNION SELECT currency FROM payments WHERE group_id = ?`,
  ).all(groupId, groupId) as Array<{ currency: string }>;
  const currencies = new Set(rows.map((row) => String(row.currency).toUpperCase()));
  currencies.add(fallbackCurrency.toUpperCase());
  return [...currencies].sort().map((currency) => calculateGroupBalance(groupId, currency));
}
