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

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface ReceiptScanResult {
  merchant?: string;
  currency?: CurrencyCode;
  subtotalMinor?: number;
  taxMinor?: number;
  tipMinor?: number;
  totalMinor?: number;
  purchasedAt?: string;
  items: ReceiptLineItem[];
  confidence: number;
}
