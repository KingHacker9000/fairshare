import { readFile } from 'node:fs/promises';
import { reconcileReceipt, type ReceiptAdjustment, type ReceiptLineItem, type ReceiptScanResult } from '@fairshare/shared';
import { env } from './env.js';

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
    }];
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
    }];
  });
}

function sanitizeReceipt(parsed: Record<string, unknown>): ReceiptScanResult {
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((value): value is string => typeof value === 'string') : [];
  const result: ReceiptScanResult = {
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
  };

  result.reconciliation = reconcileReceipt(result);
  if (result.reconciliation.status === 'mismatch') {
    result.warnings = [
      ...(result.warnings ?? []),
      `The extracted lines do not match the printed total by ${result.reconciliation.differenceMinor} minor units. Review the highlighted values before splitting.`,
    ];
  }
  return result;
}

export async function scanReceipt(path: string, mimeType: string): Promise<ReceiptScanResult> {
  if (env.OCR_PROVIDER === 'disabled') return emptyResult;
  if (!env.OPENAI_API_KEY) throw new Error('Receipt OCR is enabled but OPENAI_API_KEY is missing');

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
          content: `You are a receipt understanding engine for an expense-splitting app. Receipts may be restaurant checks, supermarket bills, hotel invoices, fuel receipts, handwritten/printed hybrids, VAT/GST invoices, multi-column receipts, or layouts in different countries.

Return one JSON object only. Do not guess unreadable monetary values. Monetary values must be integer minor units in the receipt currency.

Schema:
{
  "merchant"?: string,
  "address"?: string,
  "currency"?: string,
  "locale"?: string,
  "receiptNumber"?: string,
  "purchasedAt"?: ISO-8601 string,
  "subtotalMinor"?: integer,
  "taxMinor"?: integer,
  "tipMinor"?: integer,
  "totalMinor"?: integer,
  "taxIncluded"?: boolean,
  "confidence": number 0..1,
  "items": [{
    "description": string,
    "quantity": number,
    "unitPriceMinor": integer,
    "totalMinor": integer,
    "sourceText"?: string,
    "taxCode"?: string,
    "taxRatePercent"?: number,
    "confidence"?: number 0..1
  }],
  "adjustments": [{
    "label": string,
    "kind": "tax"|"tip"|"service_charge"|"fee"|"discount"|"rounding"|"other",
    "amountMinor": signed integer,
    "ratePercent"?: number,
    "appliesToItemIndexes"?: integer[],
    "includedInItemPrices"?: boolean,
    "confidence"?: number 0..1
  }],
  "warnings"?: string[],
  "unparsedLines"?: string[]
}

Rules:
1. Preserve each purchasable line item separately whenever possible; do not merge unrelated items.
2. Expand quantity notation such as 2 x 4.50 into quantity=2, unitPriceMinor=450, totalMinor=900.
3. Discounts must be negative adjustments unless the printed item total already reflects them.
4. Extract every tax/VAT/GST/service-charge/fee/tip/rounding line separately into adjustments. If a tax is already included in item prices, set includedInItemPrices=true so it is not added twice.
5. When a tax code or rate clearly applies only to some items, populate appliesToItemIndexes using zero-based item indexes.
6. Do not treat cash tendered, card payment, change due, previous balance, loyalty points, or suggested tip percentages as purchasable items or additive adjustments.
7. totalMinor means the final amount actually due/charged. Re-check arithmetic before responding: item totals + non-included adjustments should equal totalMinor. If not, re-read once, then emit a warning rather than inventing a value.
8. Put visible but unresolved lines in unparsedLines. Lower confidence for blurred/cropped/ambiguous scans.
9. Handle both tax-exclusive and tax-inclusive regions and labels such as VAT, GST, CGST, SGST, IGST, sales tax, service charge, municipality fee, tourism fee, cover charge, discount, coupon, rounding, gratuity and tip.
10. Never infer who consumed an item; person matching is handled by the app after extraction.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract, itemize, classify adjustments, and reconcile this receipt against its printed grand total.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data.toString('base64')}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OCR provider failed: ${response.status}`);
  const payload = (await response.json()) as any;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OCR provider returned no structured content');
  const parsed = JSON.parse(content) as Record<string, unknown>;
  return sanitizeReceipt(parsed);
}
