import { calculateExpenseShares, type ExpenseInput } from '@fairshare/shared';
import { db, emitChange, groupUserIds, id, nowIso, json } from './db.js';

function nextDate(current: Date, cadence: string): Date {
  const next = new Date(current);
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (cadence === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function runRecurringExpenses(): number {
  const due = db.prepare(
    `SELECT * FROM recurring_rules WHERE active = 1 AND next_run_at <= ? ORDER BY next_run_at LIMIT 50`,
  ).all(nowIso()) as any[];
  let created = 0;
  const execute = db.transaction((rule: any) => {
    const template = json<ExpenseInput>(rule.template_json);
    const expenseId = id('exp');
    const timestamp = nowIso();
    const shares = calculateExpenseShares(template.amountMinor, template.splitMethod, template.shares);
    db.prepare(
      `INSERT INTO expenses
       (id, group_id, description, category, amount_minor, currency, paid_by_user_id, incurred_at, split_method, notes, receipt_items_json, original_amount_minor, original_currency, conversion_rate, converted_at, idempotency_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      expenseId,
      rule.group_id,
      template.description,
      template.category,
      template.amountMinor,
      template.currency,
      template.paidByUserId,
      rule.next_run_at,
      template.splitMethod,
      template.notes ?? null,
      template.receiptItems ? JSON.stringify(template.receiptItems) : null,
      template.originalAmountMinor ?? null,
      template.originalCurrency ?? null,
      template.conversionRate ?? null,
      template.conversionRate ? timestamp : null,
      `recurring:${rule.id}:${rule.next_run_at}`,
      rule.created_by,
      timestamp,
      timestamp,
    );
    const insertShare = db.prepare('INSERT INTO expense_shares (expense_id, user_id, owed_minor) VALUES (?, ?, ?)');
    for (const [userId, owedMinor] of Object.entries(shares)) insertShare.run(expenseId, userId, owedMinor);
    const nextRun = nextDate(new Date(rule.next_run_at), String(rule.cadence)).toISOString();
    db.prepare('UPDATE recurring_rules SET next_run_at = ?, updated_at = ? WHERE id = ?').run(nextRun, timestamp, rule.id);
    emitChange(groupUserIds(rule.group_id), 'expense', expenseId, 'create', { id: expenseId, ...template, shares });
  });
  for (const rule of due) {
    execute(rule);
    created += 1;
  }
  return created;
}
