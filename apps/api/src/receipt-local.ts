import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { reconcileReceipt, type ReceiptAdjustment, type ReceiptLineItem, type ReceiptScanResult } from '@fairshare/shared';
import { env } from './env.js';

const execFileAsync = promisify(execFile);

export interface OcrLine {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

const currencyPatterns: Array<[RegExp, string]> = [
  [/\bAED\b|\bDHS\b|د\.?إ/i, 'AED'],
  [/\bUSD\b|US\$|\$/i, 'USD'],
  [/\bINR\b|₹|\bRS\.?\b/i, 'INR'],
  [/\bEUR\b|€/i, 'EUR'],
  [/\bGBP\b|£/i, 'GBP'],
  [/\bCAD\b/i, 'CAD'],
  [/\bAUD\b/i, 'AUD'],
  [/\bSGD\b/i, 'SGD'],
  [/\bSAR\b|ر\.?س/i, 'SAR'],
  [/\bQAR\b/i, 'QAR'],
  [/\bKWD\b/i, 'KWD'],
  [/\bBHD\b/i, 'BHD'],
  [/\bOMR\b/i, 'OMR'],
  [/\bMYR\b|\bRM\b/i, 'MYR'],
];

const totalPattern = /\b(grand\s*total|amount\s*due|total\s*due|net\s*total|balance\s*due|total\s*amount|total)\b/i;
const subtotalPattern = /\b(sub\s*total|subtotal|net\s*amount|taxable\s*amount)\b/i;
const taxPattern = /\b(vat|gst|cgst|sgst|igst|sales\s*tax|tax|mwst|tva|iva)\b/i;
const servicePattern = /\b(service\s*(charge|fee)|svc\s*(charge|fee)|cover\s*charge)\b/i;
const tipPattern = /\b(tip|gratuity)\b/i;
const discountPattern = /\b(discount|coupon|promo|promotion|saving|savings|rebate)\b/i;
const roundingPattern = /\b(rounding|round\s*off|round\s*adjust)\b/i;
const feePattern = /\b(fee|tourism\s*fee|municipality\s*fee|delivery\s*fee|handling\s*fee)\b/i;
const paymentPattern = /\b(cash|change|tender|visa|mastercard|amex|card\s*payment|payment\s*method|paid\s*by|auth(?:orization)?|transaction\s*id|loyalty|points)\b/i;
const metadataPattern = /\b(invoice|receipt|gstin|vat\s*(no|number|reg)|table\s*[:#]?|server\s*[:#]?|waiter\s*[:#]?|tel\.?|phone|www\.|https?:\/\/)\b/i;

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function parseMoneyToken(raw: string): number | undefined {
  let value = raw.trim().replace(/[()]/g, '');
  const negative = /^-/.test(value) || /^\(/.test(raw);
  value = value.replace(/[^0-9.,]/g, '');
  if (!value) return undefined;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let decimalSeparator = '';
  if (lastDot >= 0 && lastComma >= 0) decimalSeparator = lastDot > lastComma ? '.' : ',';
  else if (lastDot >= 0 && /^\d{1,3}$/.test(value.slice(lastDot + 1))) decimalSeparator = '.';
  else if (lastComma >= 0 && /^\d{1,3}$/.test(value.slice(lastComma + 1))) decimalSeparator = ',';

  if (decimalSeparator) {
    const other = decimalSeparator === '.' ? ',' : '.';
    value = value.replaceAll(other, '');
    if (decimalSeparator === ',') value = value.replace(',', '.');
  } else {
    value = value.replace(/[.,]/g, '');
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  const minor = Math.round(number * 100);
  return negative ? -minor : minor;
}

function finalMoney(line: string): { amountMinor: number; source: string; start: number } | undefined {
  const candidates = [...line.matchAll(/-?\(?\d[\d\s,.]*\d(?:[.,]\d{1,3})?\)?/g)];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const match = candidates[index]!;
    const after = line.slice((match.index ?? 0) + match[0].length);
    if (/^\s*%/.test(after)) continue;
    const amountMinor = parseMoneyToken(match[0]);
    if (amountMinor !== undefined) return { amountMinor, source: match[0], start: match.index ?? 0 };
  }
  return undefined;
}

function percentFrom(line: string): number | undefined {
  const match = line.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return match ? Number(match[1]!.replace(',', '.')) : undefined;
}

function quantityFrom(line: string, totalMinor: number): { quantity: number; unitPriceMinor: number } {
  const match = line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[xX×@]\s*(\d+(?:[.,]\d{1,3})?)/);
  if (!match) return { quantity: 1, unitPriceMinor: totalMinor };
  const quantity = Number(match[1]!.replace(',', '.'));
  const unitPriceMinor = parseMoneyToken(match[2]!) ?? Math.round(totalMinor / quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return { quantity: 1, unitPriceMinor: totalMinor };
  return { quantity, unitPriceMinor };
}

function cleanDescription(line: string, amountStart: number): string {
  return line
    .slice(0, amountStart)
    .replace(/\b(AED|DHS|USD|INR|EUR|GBP|CAD|AUD|SGD|SAR|QAR|KWD|BHD|OMR|MYR|RM)\b/gi, '')
    .replace(/[₹$€£]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.·_\-]{3,}/g, ' ')
    .trim();
}

function detectCurrency(text: string): string | undefined {
  for (const [pattern, currency] of currencyPatterns) if (pattern.test(text)) return currency;
  return undefined;
}

function detectDate(text: string): string | undefined {
  const candidates = [
    /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (!match) continue;
    const year = pattern === candidates[0] ? Number(match[1]) : Number(match[3]);
    const month = pattern === candidates[0] ? Number(match[2]) : Number(match[2]);
    const day = pattern === candidates[0] ? Number(match[3]) : Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (!Number.isNaN(date.getTime()) && date.getUTCMonth() === month - 1) return date.toISOString();
  }
  return undefined;
}

function merchantFrom(lines: OcrLine[]): string | undefined {
  return lines
    .slice(0, 8)
    .map((line) => line.text.trim())
    .find((text) => text.length >= 3 && text.length <= 70 && /[A-Za-z]/.test(text) && !finalMoney(text) && !metadataPattern.test(text));
}

function adjustmentKind(text: string): ReceiptAdjustment['kind'] | undefined {
  if (taxPattern.test(text)) return 'tax';
  if (servicePattern.test(text)) return 'service_charge';
  if (tipPattern.test(text)) return 'tip';
  if (discountPattern.test(text)) return 'discount';
  if (roundingPattern.test(text)) return 'rounding';
  if (feePattern.test(text)) return 'fee';
  return undefined;
}

function confidence01(confidence: number): number {
  return Math.max(0, Math.min(1, confidence / 100));
}

export function parseReceiptLines(lines: OcrLine[]): ReceiptScanResult {
  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const allText = sorted.map((line) => line.text).join('\n');
  const items: ReceiptLineItem[] = [];
  const adjustments: ReceiptAdjustment[] = [];
  const unparsedLines: string[] = [];
  const warnings: string[] = [];
  let subtotalMinor: number | undefined;
  let totalMinor: number | undefined;

  const taxIncluded = /\b(vat|gst|tax)\s*(included|incl\.?|inclusive)|\b(incl\.?|including)\s*(vat|gst|tax)\b/i.test(allText);

  for (const line of sorted) {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const money = finalMoney(text);

    if (subtotalPattern.test(text) && money) {
      subtotalMinor = Math.abs(money.amountMinor);
      continue;
    }

    if (totalPattern.test(text) && !subtotalPattern.test(text) && money) {
      const candidate = Math.abs(money.amountMinor);
      if (totalMinor === undefined || candidate >= totalMinor) totalMinor = candidate;
      continue;
    }

    const kind = adjustmentKind(text);
    if (kind && money) {
      let amountMinor = money.amountMinor;
      if (kind === 'discount' && amountMinor > 0) amountMinor *= -1;
      adjustments.push({
        label: cleanDescription(text, money.start) || kind.replaceAll('_', ' '),
        kind,
        amountMinor,
        ratePercent: percentFrom(text),
        includedInItemPrices: kind === 'tax' && taxIncluded,
        confidence: confidence01(line.confidence),
      } as ReceiptAdjustment);
      continue;
    }

    if (!money || paymentPattern.test(text) || metadataPattern.test(text)) {
      if (text.length >= 3 && !/^[-_=*\s]+$/.test(text)) unparsedLines.push(text);
      continue;
    }

    const description = cleanDescription(text, money.start);
    if (!description || !/[A-Za-z\p{L}]/u.test(description) || /^\d+$/.test(description)) {
      unparsedLines.push(text);
      continue;
    }

    const total = Math.abs(money.amountMinor);
    const quantity = quantityFrom(text, total);
    items.push({
      description,
      quantity: quantity.quantity,
      unitPriceMinor: quantity.unitPriceMinor,
      totalMinor: total,
      sourceText: text,
      confidence: confidence01(line.confidence),
    });
  }

  if (totalMinor === undefined && subtotalMinor !== undefined) {
    const additive = adjustments.filter((adjustment) => !adjustment.includedInItemPrices).reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);
    totalMinor = subtotalMinor + additive;
    warnings.push('Grand total was not read clearly; FairShare inferred it from subtotal and adjustments. Confirm before saving.');
  }

  if (!items.length) warnings.push('No item lines were confidently recognized. Retake the receipt or enter items manually.');
  if (totalMinor === undefined) warnings.push('The printed grand total could not be recognized. Confirm the amount manually.');

  const taxMinor = adjustments.filter((adjustment) => adjustment.kind === 'tax' && !adjustment.includedInItemPrices).reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);
  const tipMinor = adjustments.filter((adjustment) => adjustment.kind === 'tip').reduce((sum, adjustment) => sum + adjustment.amountMinor, 0);
  const result: ReceiptScanResult = {
    merchant: merchantFrom(sorted),
    currency: detectCurrency(allText),
    purchasedAt: detectDate(allText),
    subtotalMinor,
    taxMinor: taxMinor || undefined,
    tipMinor: tipMinor || undefined,
    totalMinor,
    taxIncluded,
    items,
    adjustments,
    confidence: average(sorted.map((line) => confidence01(line.confidence))),
    warnings,
    unparsedLines: unparsedLines.slice(0, 80),
  } as ReceiptScanResult;

  result.reconciliation = reconcileReceipt(result);
  if (result.reconciliation.status === 'mismatch') {
    result.warnings = [
      ...(result.warnings ?? []),
      `Receipt arithmetic is off by ${result.reconciliation.differenceMinor} minor units. Review the detected lines before applying the split.`,
    ];
  }
  if (result.reconciliation.status === 'balanced') result.confidence = Math.min(1, result.confidence + 0.12);
  return result;
}

export function parseTesseractTsv(tsv: string): OcrLine[] {
  const groups = new Map<string, { words: string[]; confidences: number[]; left: number; top: number; right: number; bottom: number }>();
  for (const raw of tsv.split(/\r?\n/).slice(1)) {
    const columns = raw.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;
    const text = columns.slice(11).join('\t').trim();
    if (!text) continue;
    const key = `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`;
    const left = Number(columns[6] ?? 0);
    const top = Number(columns[7] ?? 0);
    const width = Number(columns[8] ?? 0);
    const height = Number(columns[9] ?? 0);
    const confidence = Math.max(0, Number(columns[10] ?? 0));
    const group = groups.get(key) ?? { words: [], confidences: [], left, top, right: left + width, bottom: top + height };
    group.words.push(text);
    if (confidence >= 0) group.confidences.push(confidence);
    group.left = Math.min(group.left, left);
    group.top = Math.min(group.top, top);
    group.right = Math.max(group.right, left + width);
    group.bottom = Math.max(group.bottom, top + height);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    text: group.words.join(' '),
    confidence: average(group.confidences),
    left: group.left,
    top: group.top,
    width: group.right - group.left,
    height: group.bottom - group.top,
  }));
}

function scoreReceipt(receipt: ReceiptScanResult): number {
  let score = Math.min(12, receipt.items.length) * 3 + receipt.confidence * 10;
  if (receipt.totalMinor !== undefined) score += 12;
  if (receipt.subtotalMinor !== undefined) score += 3;
  if (receipt.reconciliation?.status === 'balanced') score += 30;
  else if (receipt.reconciliation?.status === 'rounding') score += 24;
  else if (receipt.reconciliation?.status === 'mismatch') score -= Math.min(25, Math.abs(receipt.reconciliation.differenceMinor) / 10);
  return score;
}

async function preprocess(input: string, output: string): Promise<string> {
  try {
    await execFileAsync('convert', [
      input,
      '-auto-orient',
      '-colorspace', 'Gray',
      '-contrast-stretch', '1%x1%',
      '-resize', '2400x2400>',
      '-sharpen', '0x1',
      output,
    ], { maxBuffer: 4 * 1024 * 1024 });
    return output;
  } catch {
    return input;
  }
}

async function runTesseract(input: string, pageSegmentationMode: number): Promise<OcrLine[]> {
  const { stdout } = await execFileAsync('tesseract', [
    input,
    'stdout',
    '--oem', '1',
    '--psm', String(pageSegmentationMode),
    '-l', env.TESSERACT_LANG,
    'tsv',
  ], { maxBuffer: 20 * 1024 * 1024, timeout: 45_000 });
  return parseTesseractTsv(stdout);
}

export async function scanReceiptLocally(path: string): Promise<ReceiptScanResult> {
  const directory = await mkdtemp(join(tmpdir(), 'fairshare-receipt-'));
  const processed = join(directory, 'receipt.png');
  try {
    const input = await preprocess(path, processed);
    const candidates: ReceiptScanResult[] = [];
    for (const psm of [4, 6]) {
      try {
        const lines = await runTesseract(input, psm);
        if (lines.length) candidates.push(parseReceiptLines(lines));
      } catch {
        // Try the next page segmentation mode. We only fail when all modes fail.
      }
    }
    if (!candidates.length) throw new Error('Local OCR could not read this receipt. Try a sharper, flatter photo.');
    candidates.sort((a, b) => scoreReceipt(b) - scoreReceipt(a));
    return candidates[0]!;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
