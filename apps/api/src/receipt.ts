import { readFile } from 'node:fs/promises';
import type { ReceiptScanResult } from '@fairshare/shared';
import { env } from './env.js';

const emptyResult: ReceiptScanResult = { items: [], confidence: 0 };

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
          content:
            'Extract receipt data. Return JSON with merchant, currency, subtotalMinor, taxMinor, tipMinor, totalMinor, purchasedAt, confidence (0..1), and items [{description, quantity, unitPriceMinor, totalMinor}]. All monetary values must be integer minor units. Omit unknown scalar fields.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract and itemize this receipt.' },
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
  const parsed = JSON.parse(content) as ReceiptScanResult;
  return { ...emptyResult, ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}
