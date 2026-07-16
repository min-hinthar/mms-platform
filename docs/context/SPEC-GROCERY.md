# SPEC-GROCERY — browse · scan · basket · exit (W0 design source)

The design source v7.2 never had for the market (its "scango" is a restaurant flow; `grep grocery` →
0). Grounded in the W-track benchmark pass: **Sam's Club Scan & Go** (the scan-flow model — NPS >90,
~75% opt-in), **Weee!** (the Asian-grocery catalog gold standard), Walmart Scan & Go, and Amazon's
Just-Walk-Out retreat. Build W4 to this. The governing lesson: **a visible, itemized cart beats
invisible magic** — Amazon's JWO was the *fastest* exit and still lost to the Dash Cart's live ledger,
because trust beat speed. Never hide the ledger; display exactly what the server derived.

## 1 · One catalog, two doors (browse + scan)

Grocery mode = two tabs over ONE surface: **Browse** (category grid → item cards) and **Scan**
(camera). A scan deep-links to the same item card the browse path renders — promos, bilingual info,
unit price identical either way (Walmart/99 Ranch's hybrid). Diners waiting on food can browse the
market from the table. Grocery items are **always one-tap add** — never a modifier sheet for a bag of
rice.

## 2 · The item card (Weee! anatomy)

photo · **bilingual name** (EN + MY in Padauk, `lang="my"`) · price (+ struck-through original and a
%-off badge when a promo is live, tokens not hardcoded reds) · **unit price** ("$2.50/lb", "$0.34/oz" —
requires `size_qty`/`size_unit` from the W4a import) · pack spec ("200ml × 6") · EBT tag (undated
copy: *"EBT-eligible — SNAP checkout coming; pay by card today"*) · later, honest social proof from
real order counts only ("12 sold this week" — never fabricated). Variable-weight items show a weight
RANGE with the fixed price, honest about variance.

## 3 · Search (bilingual + romanization)

Index per item: Burmese script name + English name + a **`synonyms text[]`** of romanization variants
(lahpet/laphet/laphat · mohinga/mohingar) — variants are DATA, not code. `pg_trgm` fuzziness for typo
tolerance. Searching "လက်ဖက်" must find the pickled tea leaf the store seeded with a Burmese name.

## 4 · The scan loop (Sam's model — camera never blocked)

- **Viewfinder:** center reticle + dimmed surround; camera stays live scan-after-scan; **torch
  toggle** where `getCapabilities().torch`. Pause/resume affordance; auto-pause offscreen.
- **On success:** one short `navigator.vibrate(10)` pulse + a brief tone + a **300ms green frame
  flash** + an item chip (photo · name · price) sliding into the pinned cart bar — never covering
  the camera (haptics are "punctuation," redundant with sound/visual so any channel can be off).
- **On unknown barcode:** red frame + double-pulse, distinct from success.
- **Dedupe:** after an emit, suppress that code until it LEAVES the frame (N consecutive absent
  frames) — holding a jar while reading the toast must not re-add it. Same-SKU rescans merge to a
  qty bump, never a duplicate row.
- **Promo moment:** when a scanned item carries a live promo, the chip upgrades — "Shan noodles —
  $1 off applied" (server-computed in `getCartTotals`; the toast only reports). Reduced-motion-safe
  celebration; never a code-entry gate mid-scan.
- **Perf:** throttle detection to ~150–200ms; migrate `@zxing/library` → `@zxing/browser` (every
  iPhone takes the fallback path).

## 5 · The scan-failure ladder (never a dead end)

1. ~3s of no read → hint: "move closer / flatten the barcode" + auto-retry.
2. → "Search the catalog instead" + manual barcode entry.
3. → **"Ask us — we'll ring it up"** — flags the order for counter assist.
Restricted/weighed items say their path immediately (never error late). Camera permission-denied
branches on `DOMException.name`: `NotAllowedError` → Settings guidance + a Retry button that re-runs
`getUserMedia`; anything else → the search fallback.

## 6 · Weighed items

Counter-weighed (fresh lahpet, salads, meats): a **label-printing scale** emits a price-embedded
**type-2 UPC (02xxxxx)** — the app scans it like any SKU; `scanAdd` parses the embedded price
server-side, keyed by PLU prefix (ShopRite's model; price stays server-validated). Self-serve
produce (if ever): photo-grid picker, never numeric PLU entry (Dash Cart's top friction).

## 7 · Basket + checkout

Pinned collapsed cart bar (count + the **server-derived** running total — the budget display IS the
retention feature) → expands to review: per-line qty steppers (per-line lock, not a global one),
swipe/tap remove with a 5s undo, EBT-eligible subtotal line. **No tip ask, no service-charge row on a
pure-grocery basket** (shipped W1a). Checkout = the shared wallet-first pay path. One payment, always
— never split a basket into parallel checkouts (Weee!'s top-complained friction).

## 8 · Exit (sub-5-seconds, non-accusatory)

- The pass renders a **QR of the order id** (server lookup on scan — the QR carries no order data) +
  the short code, count, total, timestamp. **Persisted to localStorage** so a radio blip at the
  concrete-walled door can't strand the shopper; screen-brightness/wake hint while showing.
- **Staff scan view:** one scan → line items + total + a green check; done. Spot-check flow lists
  3 random lines to sight-verify with a one-tap OK (server-flagged: first grocery order / high total /
  N-random floor — the flag lives in the lookup, never in the QR). Copy is brand-voice: *"Quick
  check — takes a few seconds."* Never "audit," never "verification failed."
- Age-restricted SKUs (if stocked): warn at scan ("ID check on the way out"), fulfillment blocked
  server-side (status guard in SQL) until staff taps "ID verified" on the scan view.

## 9 · Offline (W7, but designed here)

Cached barcode→price map for instant local feedback; an idempotent client-side scan queue with replay
(keyed so re-sends can't double-add); the online/offline banner. Every scan still reconciles to the
server ledger — the queue is latency-hiding, never a second source of truth.
