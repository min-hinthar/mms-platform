# Grocery Scan & Go
**Mandalay Morning Star · grocery self-checkout · June 16, 2026**

Scan & Go is the **grocery** experience (not a second restaurant flow): point the phone camera at shelf barcodes, build a cart, pay, walk out. It shares the restaurant app's backend — server-authoritative cart, category-aware tax, Stripe — and adds only a barcode catalog + scanner.

## Flow
Home → **Grocery Scan & Go** → camera scans UPC → server prices the item + tags EBT eligibility → running cart → **/cart** (the shared checkout + Stripe Payment Element).

## What's reused vs new
| Reused (no new work) | New (this feature) |
|---|---|
| `carts` / `cart_items`, server-authoritative pricing | `grocery_items` table keyed by **barcode** (UPC/EAN) |
| Category-aware tax (`mms_line_tax`) — your 198 SKUs are already mapped | `BarcodeScanner` (native `BarcodeDetector` + `@zxing` fallback) |
| Stripe intent + webhook, the cart/checkout page | `scanAdd()` server action (barcode → price → cart line) |
| PostHog, tokens, design system | EBT eligibility tag per item |

## Tax (already solved)
Grocery items tax as to-go retail (`dineIn=false`): **`grocery_food` is exempt**, **`retail_nonfood` is taxable** (the balms, umbrellas, brooms you caught in the CDTFA map). The same `mms_line_tax` function handles it — no grocery-specific tax code.

## EBT / SNAP (the grocery-specific track)
`grocery_items.ebt_eligible` is tagged now and surfaced in the UI ("EBT" badge), but **SNAP checkout is deferred to 2027** per the POS plan: it needs Forage (USDA TPP) + FNS authorization, and — because the restaurant is >50% of sales — likely a **separate FNS firm** for the grocery side. Until then the tag is informational; payment is card/Apple Pay only.

## Deferred
- **Weighed produce** — `weighed=true` items are rejected at scan ("see staff") until a scale or manual price-by-weight entry exists.
- **Item not found** — unknown barcodes prompt manual lookup (M2: search by name).
- **Kiosk handheld scanner** — the same flow runs on a kiosk with a USB/Bluetooth HID scanner (it just types the barcode); no code change.

## Next (M2-grocery)
Server-issued grocery cart/session (replace the demo `crypto.randomUUID()` in `app/grocery/page.tsx`), name-search fallback, weighed-item entry, then the 2027 EBT integration. Catalog import: load the 198 SKUs from the POS tax map into `grocery_items` with their barcodes + `tax_category`.
