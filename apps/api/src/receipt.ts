import { readFile } from 'node:fs/promises';
import { reconcileReceipt, type ReceiptAdjustment, type ReceiptLineItem, type ReceiptScanResult } from '@fairshare/shared';
import { env } from './env.js';
import { scanReceiptLocally } from './receipt-local.js';

const emptyResult: ReceiptScanResult = { items: [], adjustments: [], confidence: 0, warnings: [] };

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function sanitizeItems(value: unknown): ReceiptLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ReceiptLineItem[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const totalMinor = finiteInteger(item.totalMinor);
    if (!description || totalMinor === undefined || totalMinor < 0) return [];
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    const unitPriceMinor = finiteInteger(item.unitPriceMinor) ?? Math.round(totalMinor / quantity);
    return [{
      description,
      quantity,
      unitPriceMinor,
      totalMinor,
      sourceText: typeof item.sourceText === 'string' ? item.sourceText : undefined,
      taxCode: typeof item.taxCode === 'string' ? item.taxCode : undefined,
      taxRatePercent: typeof item.taxRatePercent === 'number' && Number.isFinite(item.taxRatePercent) ? item.taxRatePercent : undefined,
      confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? Math.max(0, Math.min(1, item.confidence)) : undefined,
    } as ReceiptLineItem];
  });
}

function sanitizeAdjustments(value: unknown): ReceiptAdjustment[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(['tax', 'tip', 'service_charge', 'fee', 'discount', 'rounding', 'other']);
  return value.flatMap((raw): ReceiptAdjustment[] => {
    if (!raw || typeof raw !== 'object') return [];
    const adjustment = raw as Record<string, unknown>;
    const amountMinor = finiteInteger(adjustment.amountMinor);
    if (amountMinor === undefined) return [];
    const rawKind = typeof adjustment.kind === 'string' ? adjustment.kind : 'other';
    const kind = allowed.has(rawKind) ? rawKind as ReceiptAdjustment['kind'] : 'other';
    const indexes = Array.isArray(adjustment.appliesToItemIndexes)
      ? adjustment.appliesToItemIndexes.filter((index): index is number => Number.isInteger(index) && Number(index) >= 0).map(Number)
      : undefined;
    return [{
      label: typeof adjustment.label === 'string' && adjustment.label.trim() ? adjustment.label.trim() : kind.replaceAll('_', ' '),
      kind,
      amountMinor,
      ratePercent: typeof adjustment.ratePercent === 'number' && Number.isFinite(adjustment.ratePercent) ? adjustment.ratePercent : undefined,
      appliesToItemIndexes: indexes?.length ? indexes : undefined,
      includedInItemPrices: adjustment.includedInItemPrices === true,
      confidence: typeof adjustment.confidence === 'number' && Number.isFinite(adjustment.confidence) ? Math.max(0, Math.min(1, adjustment.confidence)) : undefined,
    } as ReceiptAdjustment];
  });
}

function sanitizeReceipt(parsed: Record<string, unknown>): ReceiptScanResult {
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((value): value is string => typeof value === 'string') : [];
  const result = {
    merchant: typeof parsed.merchant === 'string' ? parsed.merchant.trim() || undefined : undefined,
    address: typeof parsed.address === 'string' ? parsed.address.trim() || undefined : undefined,
    currency: typeof parsed.currency === 'string' ? parsed.currency.trim().toUpperCase().slice(0, 3) || undefined : undefined,
    locale: typeof parsed.locale === 'string' ? parsed.locale : undefined,
    receiptNumber: typeof parsed.receiptNumber === 'string' ? parsed.receiptNumber : undefined,
    subtotalMinor: finiteInteger(parsed.subtotalMinor),
    taxMinor: finiteInteger(parsed.taxMinor),
    tipMinor: finiteInteger(parsed.tipMinor),
    totalMinor: finiteInteger(parsed.totalMinor),
    purchasedAt: typeof parsed.purchasedAt === 'string' ? parsed.purchasedAt : undefined,
    taxIncluded: typeof parsed.taxIncluded === 'boolean' ? parsed.taxIncluded : undefined,
    items: sanitizeItems(parsed.items),
    adjustments: sanitizeAdjustments(parsed.adjustments),
    confidence: typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    warnings,
    unparsedLines: Array.isArray(parsed.unparsedLines) ? parsed.unparsedLines.filter((value): value is string => typeof value === 'string') : [],
  } as ReceiptScanResult;

  result.reconciliation = reconcileReceipt(result);
  if (result.reconciliation.status === 'mismatch') {
    result.warnings = [
      ...(result.warnings ?? []),
      `The extracted lines do not match the printed total by ${result.reconciliation.differenceMinor} minor units. Review the highlighted values before splitting.`,
    ];
  }
  return result;
}

async function scanWithOptionalVision(path: string, mimeType: string): Promise<ReceiptScanResult> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing for the optional vision provider');
  const data = await readFile(path);
  const response = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Extract a receipt into JSON for an expense-splitting app. Do not guess unreadable monetary values. Monetary values are integer minor units. Return merchant, address, currency, locale, receiptNumber, purchasedAt, subtotalMinor, taxMinor, tipMinor, totalMinor, taxIncluded, confidence, items, adjustments, warnings and unparsedLines. Items have description, quantity, unitPriceMinor, totalMinor, sourceText, taxCode, taxRatePercent and confidence. Adjustments have label, kind (tax|tip|service_charge|fee|discount|rounding|other), signed amountMinor, ratePercent, appliesToItemIndexes, includedInItemPrices and confidence. Preserve item lines, make discounts negative, do not double-count included VAT/GST, exclude payment/tender/change lines, and verify item totals plus non-included adjustments against the printed grand total before responding.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract, itemize and reconcile this receipt.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data.toString('base64')}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Optional vision provider failed: ${response.status}`);
  const payload = (await response.json()) as any;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Optional vision provider returned no structured content');
  return sanitizeReceipt(JSON.parse(content) as Record<string, unknown>);
}

export async function scanReceipt(path: string, mimeType: string): Promise<ReceiptScanResult> {
  if (env.OCR_PROVIDER === 'disabled') return emptyResult;
  if (env.OCR_PROVIDER === 'local') return scanReceiptLocally(path);
  return scanWithOptionalVision(path, mimeType);
}
