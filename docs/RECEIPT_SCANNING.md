# Smart receipt scanning and item matching

FairShare treats receipt scanning as a **reconciliation workflow**, not a blind OCR import. The goal is to make wildly different bill layouts usable while never silently creating incorrect balances.

## Target UX

1. **Capture**
   - Camera or gallery.
   - Auto-crop/deskew/orientation in the native capture layer when available.
   - Allow retake when confidence is poor or the receipt is cropped.
   - Future: multi-photo capture for very long receipts.

2. **Understand the bill**
   - Extract merchant, date, currency and grand total.
   - Preserve every purchasable line item separately.
   - Parse quantity notation such as `2 x 14.50`.
   - Detect VAT/GST/sales tax, service charge, gratuity, tips, fees, discounts and rounding as separate signed adjustments.
   - Detect tax-inclusive receipts so VAT/GST is not added twice.
   - Keep tax codes/rates and item groups when the bill exposes them.

3. **Reconcile before splitting**
   - Compute `sum(items) + non-included adjustments`.
   - Compare that number to the printed grand total.
   - Green: exact match.
   - Amber: harmless 1–2 cent/fils/paise rounding difference; FairShare can absorb it deterministically.
   - Red: meaningful mismatch. Do not silently save; highlight low-confidence lines and let the user correct them.

4. **Match items to people**
   - Show each line as a card with price and confidence.
   - Member chips underneath: tap one person, several people, or everyone.
   - Shared item amounts divide between the selected people while preserving every cent.
   - Quick actions: `Me`, `Everyone`, `Same as above`, `Unassign all`.
   - Future smart suggestions may use only the user's own prior assignment history; suggestions must always remain editable.

5. **Allocate taxes and extras fairly**
   - Default tax/VAT/GST: proportional to the items each person consumed.
   - Item-specific tax groups: allocate only to people assigned to affected items.
   - Service charge: proportional by default, optionally equal.
   - Tip/gratuity: proportional by default, optionally equal.
   - Discounts/coupons: proportional to affected item spend unless an item group is known.
   - Rounding: deterministic proportional distribution.
   - Taxes marked as included in item prices are informational and are never charged a second time.

6. **Final review**
   - Show each person's item subtotal, tax/service/tip share, discounts, and final amount.
   - Show a conservation check: all people must add exactly to the printed grand total.
   - Save the structured receipt alongside the expense for later audit/editing.

## Layout robustness

The vision extraction prompt is layout-independent and explicitly covers restaurant checks, supermarket bills, hotel invoices, fuel receipts, VAT/GST invoices, multi-column layouts, quantity rows, discounts, and international terminology. We still cannot guarantee perfect extraction from every image. Reliability comes from three layers:

1. vision-based semantic extraction rather than fixed pixel coordinates;
2. arithmetic reconciliation against the printed total;
3. user confirmation when confidence or arithmetic is poor.

This means an unfamiliar design should normally still work, and an unreadable/cropped/ambiguous design should fail visibly instead of corrupting balances.

## Structured data

`ReceiptScanResult` now carries:

- line-item confidence and original source text;
- tax codes/rates when visible;
- signed adjustments with kinds and optional affected item indexes;
- tax-inclusive flags;
- unparsed visible lines and warnings;
- an arithmetic reconciliation result.

`allocateReceipt()` in `@fairshare/shared` deterministically converts item assignments plus taxes/fees/discounts into final per-person minor-unit balances.
