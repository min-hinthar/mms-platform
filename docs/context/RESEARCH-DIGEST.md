# Research digest — the _why_ behind the build

The durable conclusions from months of prototyping + strategy work, distilled to what a session needs to build correctly. Where a fact drives code, it's stated as a rule. Architecture lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) + [`../BACKEND_ARCHITECTURE.md`](../BACKEND_ARCHITECTURE.md); this is the product/design/compliance context around it.

> Anything tagged **(confirm)** is a business figure to verify with Min before relying on it in copy or money math — don't treat it as settled.

---

## 1 · The business

**Mandalay Morning Star** — family-owned Burmese restaurant **and** attached grocery/market in Covina, CA (east San Gabriel Valley); est. 2023; owners Min Kkhant + Mi Kon Chan. Phone **(626) 665-5317**. ABC **Type 41** (beer & wine only). The clientele is a mix of Burmese diaspora and local SGV diners, so the product is **bilingual EN / Burmese (Padauk)** end-to-end, not English-with-a-translation-bolt-on.

**Why we're building this.** Two goals drive every decision:

1. **Take front-of-house labor out of ordering.** A family-run floor can't scale; self-serve QR ordering (dine-in) + grocery self-checkout lets the same staff cover more covers.
2. **Drive payment processing toward ~1% net (confirm).** Card fees are the second-biggest controllable cost. The plan is **dual-pricing / cash-discount + ACH**, not eating interchange — see §5. Treat ~1% as a _target_ contingent on the cash/debit/ACH tender mix (which the business doesn't fully control), not a guaranteed effective rate.

This is a **hybrid build-vs-buy**: we build the QR-ordering + Scan-&-Go surface (it's the differentiator and the fee-control lever); we don't rebuild commodity back-office. Min is a full-stack dev and has already shipped a Stripe ordering PWA (the delivery app), so the bar is "production app," not "prototype."

## 2 · The product — three order modes, one cart engine

1. **Dine-in QR group ordering.** Scan the table QR → a **table session** anyone at the table joins → a shared cart with **live presence**. Group ordering + presence are **dine-in only** — the earlier "remote friend can join your table" idea was cut as dishonest (you're not at the table). Don't reintroduce cross-location group carts.
2. **Takeout / pickup.** Same menu + cart, no table session.
3. **Grocery Scan & Go.** Barcode (UPC/EAN) self-checkout for the market side — native `BarcodeDetector` with a `@zxing/library` fallback. See [`../GROCERY_SCANGO.md`](../GROCERY_SCANGO.md).

**Per-person bill split is supported for all three modes** (not just dine-in). **Best-free-alternative is wired per feature** — every paid capability has a $0-tier fallback documented in [`FREE-KIT-MAP.md`](FREE-KIT-MAP.md). **Rewards / "gems"** exist in the design but gem _awards_ are deferred until accounts land (M4) — `loyalty_rewards.user_id` is `NOT NULL`, so anonymous diners can't earn yet; don't wire awards into `mms_fulfill_order` before the account link.

## 3 · Design direction (the bar the real app must hit)

- **Light = "editorial-forward"; dark = "v4 Night."** Both are real, WCAG-AA-verified token sets — the single source of truth is [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css). Type: **Fraunces** (display) · **Hanken Grotesk** (body) · **Padauk** (Burmese).
- **Motion is a spring** (`--spring` token); honor `prefers-reduced-motion` (the token collapses it). Prices animate with **NumberFlow**.
- **Sheets/modals → Radix Dialog** ([`packages/ui/src/sheet.tsx`](../../packages/ui/src/sheet.tsx)), never a hand-rolled focus trap. Always pass an accessible `title` (the v7.1 "every sheet announces 'Details'" bug).
- **Target WCAG 2.2 AA.** Focus management, labels/aria, contrast, reduced-motion, keyboard — all gating, not nice-to-have.
- **The canonical reference is [`../prototype/v7.2.html`](../prototype/v7.2.html)** — open it in a browser. It's the v7 unified build with the v7.1 red-team fixes applied, graded ≈ **4.3/5** against [`RUBRIC.md`](RUBRIC.md). The real app should match its _feel and interaction model_; it is **not** the implementation (no server, mocked data) — treat it as the spec for look + behavior, build the real thing per the architecture docs.
- **Full UX research, the Sunday north-star teardown, the paid UI-kit buy-list, and the craft spec** (component states · motion · voice) live in [`DESIGN-RESEARCH.md`](DESIGN-RESEARCH.md) — paired with the $0 stack in [`FREE-KIT-MAP.md`](FREE-KIT-MAP.md).

## 4 · Compliance / regulatory facts that constrain the code

These are non-negotiable and several directly shape money math:

- **California sales tax is category-aware, never flat.** The **80/80 rule** + CDTFA **Reg. 1603**: hot/prepared restaurant food is taxable; most **cold grocery staples are exempt**. So tax is computed **per line by `tax_category`**, on the **discounted taxable base** — never a flat % over the whole cart. (`apps/qr/lib/tax.ts` mirrors the SQL `mms_line_tax`; keep them in sync.)
- **No surprise / junk fees (CA).** **SB-478** (Honest Pricing) bans advertising a price that excludes mandatory fees; **SB-1524** then carves out a restaurant exception that _permits_ a separate service charge **only if it is clearly and conspicuously disclosed**. Net effect for us: any mandatory service charge must be shown up front in the displayed price, never appended at checkout. (Don't state SB-1524 as the prohibition — it's the disclosure-conditioned exemption.)
- **Never surcharge debit.** Card-network rules prohibit surcharging debit, so a cash-discount / dual-pricing program must **exempt debit cards** — bake the exemption into the pricing logic, don't leave it to policy. (Durbin governs interchange caps/routing, not the surcharge ban; a few states bar surcharging outright, CA allows it within network rules.)
- **EBT / SNAP is deferred to 2027.** It requires FNS retailer authorization + a SNAP-capable processor (**Forage**); retailer eligibility turns on the FNS **staple-food criteria** (e.g., the >50%-of-sales staple test). Don't build EBT tender into the card path now; it's an M6+ track with its own processor.
- **ABC Type 41 = beer & wine only.** Never tie a promo to alcohol; alcohol isn't part of the self-serve tender flow.
- **Reviews stay ungated.** Don't gate a review prompt behind a minimum star rating (FTC review-gating). Ask everyone or no one.

## 5 · Pricing & processing strategy

The ~1% net target comes from **dual-pricing / cash-discount** (the card price is the list price; cash/debit/ACH pay less), **interchange-plus** rather than flat-rate, and steering toward **ACH** for larger grocery baskets. Stripe is the card processor (SAQ-A: PAN only ever in Stripe's iframe). The pricing engine is **server-authoritative** — the client never computes or sends an amount that reaches Stripe; the PaymentIntent amount comes from `getCartTotals`. (This is the #1 red-team finding and the #1 review weight — see [`RED-TEAM.md`](RED-TEAM.md).) Debit is exempted from any surcharge per §4.

## 6 · How this maps to the build

- Money math + tax: §4 → `apps/qr/lib/{cart,tax}.ts` + `supabase/migrations/` (integer cents end-to-end).
- Auth model + RLS table sessions, private Realtime: [`../BACKEND_ARCHITECTURE.md`](../BACKEND_ARCHITECTURE.md), [`../DATA_RECONCILIATION.md`](../DATA_RECONCILIATION.md).
- The launch gate every milestone exits against: [`QA-CHECKLIST.md`](QA-CHECKLIST.md).
- The quality bar + known traps: [`RUBRIC.md`](RUBRIC.md), [`RED-TEAM.md`](RED-TEAM.md).
- Running engineering memory (loaded at session start): [`../../.claude/LEARNINGS.md`](../../.claude/LEARNINGS.md), [`../../.claude/ERROR_HISTORY.md`](../../.claude/ERROR_HISTORY.md).
