# Smart receipt scanning and item matching

FairShare treats receipt scanning as a **reconciliation workflow**, not a blind OCR import. The default path has **no paid AI API and no hosted LLM**.

## Default zero-subscription architecture

```text
receipt photo
   ↓
ImageMagick preprocessing (orientation, grayscale, contrast, resize, sharpen)
   ↓
Tesseract OCR on the existing FairShare server
   ↓
layout-independent deterministic receipt parser
   ↓
subtotal / tax / VAT / GST / service / tip / discount classification
   ↓
arithmetic reconciliation against the printed grand total
   ↓
item-to-person matching UI
   ↓
proportional tax/extras allocation + exact-cent conservation
```

Tesseract is a lightweight OCR engine, not a generative LLM. FairShare runs two page-segmentation passes and chooses the extraction that best reconciles with the bill. The default Docker image includes English OCR. Additional Tesseract language packs can be added later without changing the receipt data model.

`OCR_PROVIDER=local` is the default. The old external vision path remains an **optional** provider only; it is not required and no API key is needed for normal receipt scanning.

## Target UX

1. **Capture**
   - Camera or gallery.
   - Server-side orientation/contrast/resize preprocessing now.
   - Retake when confidence is poor or the receipt is cropped.
   - Future: multi-photo stitching for very long supermarket receipts.

2. **Understand the bill**
   - Extract merchant, date, currency and grand total where readable.
   - Preserve purchasable line items separately.
   - Parse quantity notation such as `2 x 14.50`.
   - Detect VAT/GST/sales tax, service charge, gratuity, tips, fees, discounts and rounding as signed adjustments.
   - Detect common tax-inclusive wording so VAT/GST is not added twice.

3. **Reconcile before splitting**
   - Compute `sum(items) + non-included adjustments`.
   - Compare that number to the printed grand total.
   - Green: exact match.
   - Amber: harmless 1–2 cent/fils/paise rounding difference; FairShare absorbs it deterministically.
   - Red: meaningful mismatch. The itemized one-tap split is blocked until the user corrects OCR values or retakes the receipt.

4. **Match items to people**
   - Each line has member chips plus `Me`, `Everyone`, `Same as above`, and `Clear` shortcuts.
   - Shared items divide among selected people while preserving every cent.
   - `Fix OCR` allows correction of an incorrectly read item name or amount.

5. **Allocate taxes and extras fairly**
   - Tax/VAT/GST: proportional to the items each person consumed by default.
   - Service charge: proportional by default.
   - Tip/gratuity: proportional by default.
   - Discounts/coupons: signed negative adjustments distributed proportionally.
   - Rounding: deterministic proportional distribution.
   - Taxes marked as included in item prices are informational and never charged a second time.
   - Detected adjustment amounts can be corrected before the split is applied.

6. **Final review and audit**
   - Show each person's item subtotal, tax/extras share, and final amount.
   - Show a conservation check: all people add exactly to the printed grand total.
   - Save the structured receipt, reconciliation result and item assignments in `receipt_documents` alongside the expense.

## Supporting different bill designs

FairShare does not use merchant-specific pixel templates. The local parser works from OCR lines and receipt semantics, looking for monetary values plus labels such as subtotal, total, VAT, GST, CGST, SGST, IGST, tax, service charge, gratuity, tip, fee, coupon, discount and rounding. That lets the same pipeline handle many restaurant, supermarket, hotel, fuel and international invoice layouts.

No OCR system can guarantee every photographed receipt. Reliability comes from three independent checks:

1. OCR confidence;
2. semantic line classification;
3. arithmetic reconciliation against the printed total.

An unfamiliar but readable design should normally work. A faded, cropped or ambiguous receipt should fail visibly instead of silently corrupting balances.

## Future on-device path

For Android/iOS we can later use Google ML Kit Text Recognition in a custom Expo development build so the image never needs to leave the device. For web we can optionally run Tesseract.js/WASM in the browser. Both can feed the same deterministic parser and allocation engine, so this migration does not change any expense logic.
