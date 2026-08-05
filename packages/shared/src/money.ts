export function assertMinorAmount(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Money must be a safe integer in minor units');
  return value;
}

export function formatMoney(minor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

export function parseDecimalToMinor(input: string): number {
  const normalized = input.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) throw new Error('Enter a valid amount with at most two decimals');
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return assertMinorAmount(negative ? -minor : minor);
}
