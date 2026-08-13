# M6 — Kiosk · Terminal · EBT (2027) — Design of Record

> **Status:** forward-planning / design-of-record. M6 is the roadmap's **far-future** milestone (the
> [`ROADMAP.md`](../ROADMAP.md) `⏸ M6` block), **distinct from the Richness track (R1–R9)** that runs first.
> Most of M6 is **gated on real-world prerequisites** (physical card hardware + government authorization),
> so it can't be _built_ now — this doc is the plan to build _from_ when 2027 arrives, grounded in the seams
> S2–S4 already laid. Refine on a real session when the prerequisites land; don't treat any data shape here
> as frozen (esp. §3.3 C2 — the EBT payment↔line model is deliberately undecided).
>
> **Reference docs:** [`docs/S4_DESIGN.md`](S4_DESIGN.md) §S4.3c (the split-tender / EBT seam this builds on),
> [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md), [`docs/GROCERY_SCANGO.md`](GROCERY_SCANGO.md),
> [`docs/context/RESEARCH-DIGEST.md`](context/RESEARCH-DIGEST.md) (EBT/Forage/FNS research), the compliance
> notes in [`CLAUDE.md`](../CLAUDE.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

---

## 1. Scope & framing

M6 is **in-person commerce**: a self-serve kiosk, an attended card terminal, and EBT/SNAP acceptance. The
QR app already does server-authoritative pricing, the unified mixed-fulfillment basket (S4), the per-line
fulfillment tag + `ebt_eligible` snapshot (S4.3), and a per-payer split-tender ledger (M3·P3.3b) — so M6 is
**three additive surfaces over an existing spine**, not a new app.

| Phase    | What                                                                | Built on                                         | Hard prerequisite (why it can't ship today)                                               |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **P6.1** | Kiosk shell + handheld HID barcode scanner                          | grocery `scanAdd` (M2·P2.3, unchanged)           | a kiosk device + HID scanner; no software blocker                                         |
| **P6.2** | Stripe **Terminal** (server-driven, S700 reader) for in-person card | the existing PaymentIntent + webhook fulfillment | a physical S700 reader + Stripe Terminal enablement                                       |
| **P6.3** | **EBT/SNAP** acceptance (Forage + FNS) + weighed-produce entry      | S4.3c `ebt_eligible` partition seam              | **FNS retailer authorization + a USDA-TPP/Forage account** (multi-month, the gating item) |

**Not a code milestone today.** P6.1's kiosk shell is the only piece buildable without hardware/authorization,
and even it wants a device to validate against. The value of this doc is to make 2027 a **branch off existing
seams, not a discovery** — exactly the discipline S4.3c already applied to the EBT data model.

---

## 2. P6.1 — Kiosk shell + HID scanner

**Goal:** a locked-down, always-on self-serve surface that reuses the diner flow with kiosk affordances.

- **Reuse, don't fork.** The kiosk runs the existing menu → cart → checkout, with a kiosk **mode** (like
  `dinein`/`pickup`/`scango`) that drives: attract-loop idle screen, auto-reset/cart-clear on inactivity
  (a session timeout shorter than the diner sweep), oversized touch targets, no external nav/keyboard chrome.
- **HID scanner = keyboard-wedge.** A handheld HID scanner emits barcodes as keystrokes + Enter; capture them
  with a focused-input / keydown buffer and route through the **existing `scanAdd`** (server-authoritative,
  barcode → catalog lookup). **No change to the grocery flow** — the scanner is just another input device.
  (`docs/GROCERY_SCANGO.md` is the contract.)
- **a11y/perf:** kiosks are shared, fixed displays — the mobile GPU/blur budget is less binding, but keep the
  reduced-motion + token discipline. Add a screen-reader/￼high-contrast affordance for ADA kiosk compliance
  (a 2027 a11y task in its own right).
- **Hardening:** the kiosk session must NOT carry a personal account (no rewards upgrade UI in kiosk mode);
  it's an anonymous walk-up. Lock the surface to the order flow (kiosk OS-level + app-level route guard).

**Buildable now?** The shell + HID capture are buildable and testable against a desktop + a USB scanner.
Defer until there's a target device so the idle/reset/ADA details are validated for real.

---

## 3. P6.2 — Stripe Terminal (in-person card)

**Goal:** take a physical card (chip/contactless) on an attended S700 reader, settling the same order ledger.

- **Server-driven Terminal.** Use Stripe Terminal's server-driven model: the server creates a PaymentIntent
  with `payment_method_types: ['card_present']`, the reader collects + confirms, and **fulfillment stays the
  existing webhook path** (signature-verified, idempotent on the PI id — `mms_fulfill_order`). The amount is
  still `getCartTotals` (server-authoritative); the reader never sets price. SAQ-A posture holds — card data
  lives in the reader + Stripe, never our code.
- ~~**Connection token endpoint.** Add a service-role route minting Terminal `connection_token`s (the only new
  secret surface); the reader SDK exchanges it. Treat like the Stripe secret keys (Vercel/Actions only).~~
  **Corrected at build (W6c, 2026-08-06):** connection tokens are the **SDK-driven** integration's
  requirement. The server-driven S700 model this section specifies needs none — the reader is
  commanded through the Stripe API from staff-gated server actions, and the only new config is the
  server-only `STRIPE_TERMINAL_READER_ID` (a device name, not a credential). See `docs/W6C_PLAN.md`.
- **Reconciliation.** Same `intent.amount` vs `getCartTotals` 409-on-mismatch guard the online flow uses.
- **Compliance:** **never surcharge debit** (SB-1524); service charge disclosed (already enforced). Tips on a
  card-present flow go through the reader's tipping or the existing tip step — decide at build (reader tipping
  changes the PI amount timing).

**Prerequisite:** a physical S700 + Terminal enabled on the shared Stripe account. No software blocker beyond that.

---

## 4. P6.3 — EBT/SNAP (the gated, load-bearing phase) — 2027

**This is the phase with the long pole.** EBT acceptance needs **FNS retailer authorization** (a federal
application, multi-month, with a likely **separate FNS firm** because of the 50%-rule on prepared/hot food —
see compliance notes) **and** a SNAP-EBT processor (**Forage** / a USDA-TPP). Neither is a code task; both must
be in hand before any of this ships. The **data seam is already built** (S4.3c) so 2027 is a tender-time branch.

### 4.1 What S4.3c already gave us (don't rebuild)

- **`qr_order_items.ebt_eligible`** — eligibility-at-sale, snapshotted from `grocery_items.ebt_eligible` by
  `mms_snapshot_ebt_eligibility(order)` in the settlement `after()` drain (off the money path). This is the
  permanent audit record AND the partition key. Food/prepared lines stay `false` (never SNAP-eligible).
- The per-payer PI ledger (`qr_cart_shares`) — generalizable to "a tender covers a line subset."

### 4.2 The 2027 EBT tender-split flow (specified in S4.3c, executed here)

1. **Partition** the basket at checkout: the **EBT-eligible subset** (`fulfillment='grocery'` AND
   `ebt_eligible`) vs the **rest** (prepared food, tax, service, tip).
2. The **EBT card** (via Forage) authorizes/captures the **eligible subtotal**; a **second tender**
   (card-present via P6.2 / Apple Pay / cash) covers the remainder.
3. **Fulfillment stamps which tender paid which lines** (the association shape — see C2 below).
4. **Tax wrinkle (CDTFA):** SNAP purchases are **tax-exempt on otherwise-taxable items** — so the tax engine
   (`apps/qr/lib/tax.ts` ↔ `mms_line_tax`) needs an EBT-paid branch that zeroes tax on the SNAP-covered lines.
   This is a real 2027 tax change; keep TS ↔ SQL in sync as always.

### 4.3 The one thing deliberately NOT decided — C2: payment↔line-subset shape

S4.3c left this open **on purpose** (committing now would risk a 2027 rewrite of a money table). Two candidates:

- **(a) `qr_payment_lines` join** (PaymentIntent ↔ order_item, N:M-ready) — flexible, handles partial captures.
- **(b) per-line `qr_order_items.paid_by_intent`** — simpler, assumes ≤1 tender per line.

**Decide from the real Forage PI model** (one EBT PI + one card PI? partial captures? auth-then-capture
timing?). **Recommendation to revisit in 2027:** lean (a) `qr_payment_lines` unless Forage's model is strictly
one-PI-per-tender with no partials — the join also closes **C3** (split-order line refunds, the S4.3b
`split_unsupported` deferral) on the same shape. Don't pick until the integration is in hand.

### 4.4 EBT non-negotiables (compliance)

- **FNS authorization first** — no EBT code path ships before the retailer is FNS-authorized + Forage-onboarded.
- **50%-rule** — if >50% of revenue is prepared/hot food, SNAP eligibility is restricted; likely a **separate
  FNS firm** for the grocery side. A business/legal decision, not code — but it shapes which catalog items can
  be `ebt_eligible` and possibly which legal entity owns the EBT flow.
- **Weighed-produce entry** — EBT staples include by-weight produce; needs a scale-integration / manual-weight
  entry path feeding `scanAdd` with a derived price (server-authoritative). New input, same pricing rule.
- **No tax on SNAP-covered lines** (CDTFA, §4.2).

---

## 5. Cross-cutting: the co-location question (M5 deferred this to M6)

M5 kept QR and the delivery app as **separate repos** and explicitly **deferred full-repo co-location to M6**
"if Terminal/kiosk need a shared runtime." Decide at M6 start:

- **Do kiosk/Terminal actually need delivery's runtime?** Likely **no** — kiosk/Terminal are QR-domain
  (dine-in/grocery), not delivery. The shared surface is still just the Stripe account + `@mms/ui` craft, which
  the M5 "learn-from" transfer already addresses. **Recommendation:** keep repos separate unless a concrete
  shared-runtime need emerges; revisit only if M6 surfaces one. (This is a re-confirmation point, not a commitment.)

---

## 6. Dependencies, prerequisites & lead times (the real critical path)

| Item                              | Type                     | Lead time    | Blocks              |
| --------------------------------- | ------------------------ | ------------ | ------------------- |
| FNS retailer authorization        | Federal application      | **Months**   | all of P6.3         |
| Forage / USDA-TPP account         | Vendor onboarding        | Weeks–months | P6.3 EBT execution  |
| 50%-rule / separate-firm decision | Business/legal           | —            | P6.3 scope + entity |
| Stripe Terminal + S700 reader     | Hardware + Stripe enable | Days–weeks   | P6.2                |
| Kiosk device + HID scanner        | Hardware                 | Days         | P6.1 validation     |

**Critical path = FNS authorization** — start that application well before any P6.3 build session.

---

## 7. Out of scope / explicitly deferred

- Any EBT **code path** before FNS authorization + Forage onboarding (don't build against a guessed API).
- The C2 money-table shape (decide from the real Forage PI model — §4.3).
- Delivery-app co-location unless a concrete shared-runtime need appears (§5).
- Online/remote EBT (this is in-person SNAP at the kiosk/counter; online EBT is a separate FNS program).

---

## 8. When 2027 arrives — first session checklist

1. Confirm FNS authorization + Forage account are in hand (else P6.3 stays blocked — do P6.1/P6.2 only).
2. Read the real Forage PaymentIntent model → **decide C2** (§4.3) → migration for the chosen shape.
3. Add the EBT-paid tax branch (CDTFA exemption) — TS ↔ SQL in sync, with tests.
4. Re-confirm the co-location decision (§5).
5. Build per-phase as gated PRs with the same pre-PR + pre-merge adversarial-review discipline.
