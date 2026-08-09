export type CurrencyCode = string;
export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  defaultCurrency: CurrencyCode;
}

export interface GroupSummary {
  id: string;
  name: string;
  type: 'trip' | 'home' | 'couple' | 'other';
  currency: CurrencyCode;
  simplifyDebts: boolean;
  members: UserSummary[];
  netBalanceMinor: number;
  updatedAt: string;
}

export interface ExpenseShareInput {
  userId: string;
  value?: number;
  included?: boolean;
}

export interface ExpenseInput {
  groupId: string;
  description: string;
  category: string;
  amountMinor: number;
  currency: CurrencyCode;
  paidByUserId: string;
  incurredAt: string;
  splitMethod: SplitMethod;
  shares: ExpenseShareInput[];
  notes?: string;
  receiptItems?: Array<ReceiptLineItem & { assignedUserIds: string[] }>;
  receiptDocument?: ReceiptDocument;
  originalAmountMinor?: number;
  originalCurrency?: CurrencyCode;
  conversionRate?: number;
  sourceTransactionId?: string;
  idempotencyKey?: string;
}

export interface BalanceEdge {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export interface GroupBalance {
  currency: CurrencyCode;
  netByUser: Record<string, number>;
  settlements: BalanceEdge[];
}

export type ReceiptAdjustmentKind =
  | 'tax'
  | 'tip'
  | 'service_charge'
  | 'fee'
  | 'discount'
  | 'rounding'
  | 'other';

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  sourceText?: string;
  taxCode?: string;
  taxRatePercent?: number;
  confidence?: number;
}

export interface ReceiptAdjustment {
  label: string;
  kind: ReceiptAdjustmentKind;
  /** Signed minor units. Discounts should be negative. */
  amountMinor: number;
  ratePercent?: number;
  /** Restrict this adjustment to specific item indexes when the receipt exposes tax/service groups. */
  appliesToItemIndexes?: number[];
  /** True when the amount is informational and already contained in item prices. */
  includedInItemPrices?: boolean;
  confidence?: number;
}

export interface ReceiptReconciliation {
  itemsTotalMinor: number;
  adjustmentsTotalMinor: number;
  computedTotalMinor: number;
  printedTotalMinor?: number;
  differenceMinor: number;
  status: 'balanced' | 'rounding' | 'mismatch' | 'unknown';
}

export interface ReceiptScanResult {
  merchant?: string;
  address?: string;
  currency?: CurrencyCode;
  locale?: string;
  receiptNumber?: string;
  subtotalMinor?: number;
  /** Kept for compatibility; detailed scans should also populate adjustments. */
  taxMinor?: number;
  /** Kept for compatibility; detailed scans should also populate adjustments. */
  tipMinor?: number;
  totalMinor?: number;
  purchasedAt?: string;
  taxIncluded?: boolean;
  items: ReceiptLineItem[];
  adjustments?: ReceiptAdjustment[];
  confidence: number;
  warnings?: string[];
  unparsedLines?: string[];
  reconciliation?: ReceiptReconciliation;
}

export interface ReceiptDocument extends ReceiptScanResult {
  /** Zero-based receipt item index to group member IDs selected in the matching UI. */
  itemAssignments?: Record<number, string[]>;
}
