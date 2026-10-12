# QR app — build spec (June 16, 2026) + as-built post-payment paths

**Mandalay Morning Star · the QR app's monorepo (dine-in · pickup · grocery Scan & Go · kiosk) · June 16, 2026**

The plan and architecture for turning the v7.2 QR prototype into a production app — a QR-only Turborepo monorepo beside the separate delivery repo. Grounded in the v7.1 red-team and its `RealBuild_QA_Checklist`.

> **Status: the June-16 product/spec overview — NOT as-built.** Kept for the _why_ (the red-team P0s it
> answers). Where it differs from the shipped app the as-built docs win: auth/RLS/routing + schema →
> [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md); the visual/motion/depth vocabulary →
> [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md); env + email wiring → [`ENV.md`](ENV.md); current state +
> next tasks → [`HANDOFF.md`](HANDOFF.md). Premises corrected in place below: `apps/delivery` was never
> moved in and the two apps never shared a database (§1); the tax function's home and the webhook's
> events (§2); the analytics taxonomy is mostly unshipped (§4); the milestones are `ROADMAP.md`'s (§5);
> the CSP's home (§6). The post-payment artifact paths — durable receipt · receipt email · live
> tracking — are **§8**, appended as-built.

---

## 1 · Why a monorepo (and how the existing app fits)

The existing **`mandalay-morning-star-delivery-app`** (Next.js · TS strict · Tailwind · Supabase · Stripe · Burmese-gem loyalty) is mature and **already owns** the menu/catalog, payments, loyalty, and bilingual content. The QR dine-in/kiosk app should **reuse** all of that, not fork it. **That premise did not hold.** The delivery PWA stayed its own repo on its own Supabase project (`ukuzkhuppqwtrdkjqrkv`); QR owns its **whole** schema — catalog and rewards included — on `fasnpdhtvqtzjlvruqcu`, and the two share **one Stripe account** and nothing else. M5 unified the reusable _packages_ and the hardened patterns, not the database (`docs/M5_DESIGN.md`, `docs/QR_FROM_DELIVERY.md`). What the monorepo actually holds:

```
mms-platform/
├─ apps/
│  └─ qr/              ← the QR dine-in / Pickup / grocery Scan&Go app (the only app here)
├─ packages/
│  ├─ ui/              ← design tokens (editorial-forward + Night) + Radix Sheet/Button/NumberFlow
│  ├─ db/              ← Supabase clients + generated types + Zod schemas (no SQL — see supabase/)
│  └─ config/          ← shared tsconfig + eslint
├─ supabase/           ← migrations · seed.sql · SQL tests · config.toml (the CLI layout)
├─ scripts/            ← the guards and harnesses: verify-slice, the check-* guards, the race harnesses, review-bundle
├─ turbo.json · pnpm-workspace.yaml · tsconfig.base.json
```

**Rules** (2026 monorepo best practice): one-way deps (apps → packages, never reverse); namespaced packages (`@mms/ui`, `@mms/db`, `@mms/config`); single-version policy via `overrides:` in `pnpm-workspace.yaml` (pnpm 10+ reads them there, not from `package.json`); import from package roots only.

**The delivery app was never moved in** (reshaped 2026-06-24): the repos stay separate and QR _learns from_ delivery instead — adopting its hardened mobile/a11y/motion patterns and reusable primitives (`docs/M5_DESIGN.md`, `docs/QR_FROM_DELIVERY.md`). `packages/db/src/factory.ts` is what keeps co-location possible later: the client construction made generic over each app's own generated `Database` type and injected with each app's own project env — **one client idiom, two databases**. Full co-location is reconsidered at M6.

> GitHub: `min-hinthar/mms-platform` — **public**, deliberately, for free Actions minutes (`setup.sh` creates it with `gh repo create --public`; it drifted private once and was made public again on 2026-10-08 — re-measure with `gh api repos/min-hinthar/mms-platform --jq .private`). Repository visibility is not a licence: the code stays proprietary, "all rights reserved" (README → License). CI lanes, the review, the required checks and the merge ritual: [`WORKFLOW.md`](WORKFLOW.md); the live branch-protection state: OPEN-ITEMS C28.

## 2 · QR app architecture (the risky parts, designed in)

These directly answer the red-team's P0s.

**Server-authoritative cart + pricing (fixes client-trust C1/C2).** The browser never computes the total. The cart lives in Postgres (`qr_carts`/`qr_cart_items`), mutated only through **Server Actions** that re-derive every line price from the menu row + validated modifiers. `getCartTotals()` runs server-side: subtotal → promo (server-validated) → reward → **category-aware tax** (10.5%, on the discounted taxable base) → tip. The 5% SB-1524 service charge shipped and was **retired** at W16a (owner directive, 2026-08-15 — `serviceChargeCents` is a constant `0` for new orders); its `> 0`-gated row and its disclosure stay in the receipt model forever, because orders settled before that date carry a real charge that owes its explanation (§8). The client renders what the server returns.

**Category-aware tax engine (replaces the flat 10.5% gap).** The SQL function `mms_line_tax(amount_cents, category, dine_in)` (`supabase/migrations/20260618000000_qr_platform_init.sql`) and its TS mirror `apps/qr/lib/tax.ts` — pinned to each other by `lib/tax.test.ts` + `supabase/tests/tax_parity_test.sql` — implement CA 80/80 / Reg 1603 (hot/prepared always taxable; cold to-go food per the rule; non-food retail taxable). Tax is computed per line, server-side, from the item's tax category — never a flat rate.

**Stripe, server-driven (PCI = SAQ-A).** A Route Handler `POST /api/stripe/create-intent` creates a **PaymentIntent** for the **server-computed** amount with `automatic_payment_methods`; the client mounts the **Payment Element** (Apple/Google Pay surface, card) — card data stays in Stripe's iframe, never our DOM. Fulfillment is webhook-driven (`payment_intent.succeeded`), idempotent, signature-verified; the handler (`apps/qr/app/api/stripe/webhook/route.ts`) acts on five more events, listed with what each one does in [`ENV.md`](ENV.md) → Wiring Production. API version pinned. Store Stripe IDs, never PANs.

**Multi-device group cart (v1) — Realtime + RLS.** A diner scans the table QR → server issues a short-lived, signed **table-session** token bound to that physical QR (not guessable). Guests join a **private** Supabase Realtime channel `table:{sessionId}` (`{ private: true }`); **authorization is enforced by RLS on `realtime.messages`** + RLS on `qr_carts`/`qr_cart_items` (only members of an active session can read/mutate that cart; only the host can lock/unlock/remove others). Presence shows who's at the table; broadcast syncs adds. No client-asserted identity is trusted. (This is the attack surface the red-team flagged — it is closed by server-issued sessions + RLS, not by a public `channel("table-N")`.)

**PostHog funnel (free tier).** `instrumentation-client.ts` + a reverse-proxy rewrite. Event taxonomy below; **no PII in properties** (opaque seat IDs, never names/emails/PANs); `person_profiles: 'identified_only'`; cookieless + consent.

**Accessibility carried from v7.2.** Radix Dialog for sheets (focus trap + naming for free), one focus owner, `lang` per locale, `next/image` for LCP/CLS, reduced-motion. The v7.2 prototype stays the **copy** reference (strings verbatim); the as-built **visual/motion** reference is [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) — read it before any visual work. It owns what a prototype cannot: the one selection vocabulary, the `mms-pop`/`mms-rise`/`mms-stagger` motion kit with its reduced-motion escort, and the W22a·depth layer (two-tier `--sh-paper` shadows, the `PaperAmbient` page ground — pages carry LINES, cards keep DOTS — and the `/track` thermal-slip print ceremony).

## 3 · Data model deltas (Supabase)

Tables (RLS-protected, QR's own project — not additive to delivery): `table_sessions` (id, qr_code, mode, status, host_seat, expires_at), `session_members` (session_id, seat_id = `auth.uid()`, display_name, role), `qr_carts` (session_id, status, locked), `qr_cart_items` (cart_id, menu_item_id, qty, modifiers jsonb, unit_price_cents, tax_cents, by_seat), `qr_orders`/`qr_order_items` (server-priced snapshot in cents, stripe_payment_intent_id), `promo_codes` (code, kind, value, max_uses, used). RLS: every policy keys off membership in an **active** `table_session` (`is_member`/`is_host`); host-only columns gated by `role='host'`. Service-role only for price/tax writes. The SQL lives in `supabase/migrations/` (CLI layout, starting `20260618000000_qr_platform_init.sql`) — `packages/db` keeps clients + generated types + Zod only. Current schema map: [`BACKEND_ARCHITECTURE.md §6`](BACKEND_ARCHITECTURE.md).

## 4 · PostHog event taxonomy (funnel) — planned, mostly unshipped

> **Measured 2026-10-08:** four of the fifteen events below have a call site in `apps/qr` (`mode_selected`, `payment_succeeded`, `payment_failed`, `promo_applied`); what ships uses other names (e.g. `item_added_to_cart`, `menu_item_add_clicked`, the `grocery_*` and `staff_*` events). Grep `apps/qr` for `capture(` and `event: "` before relying on this list. The PII rules below stand.

`qr_scanned` → `mode_selected` → `menu_viewed` → `item_viewed` → `add_to_cart` → `cart_viewed` → `checkout_started` → `payment_succeeded` / `payment_failed`; plus `promo_applied`, `split_changed`, `member_joined`, `order_ready`, `feedback_submitted`, `review_redirect`. Properties: `mode`, `seat_count`, `item_category`, opaque `session_id` — never names. First report: the `add_to_cart → cart_viewed → checkout_started` middle (where QR apps leak 30–40%).

## 5 · Milestones

Superseded: the milestones, as built and as planned, are [`ROADMAP.md`](../ROADMAP.md)'s (this spec's June list no longer matches it). Each milestone exits against the QA checklist ([`context/QA-CHECKLIST.md`](context/QA-CHECKLIST.md)).

## 6 · Deploy checklist (condensed; full list in QA checklist)

Vercel (apps/qr) + Supabase + Stripe + PostHog. Env via Vercel/Supabase secrets (never committed). **Security headers/CSP:** the per-request nonce CSP in `apps/qr/proxy.ts`, the static headers in `next.config.ts` (see [`ENV.md`](ENV.md) → CSP note); **SRI**/self-host for any external script; `next/image` self-hosted dish photos; Stripe webhook secret; Supabase RLS enabled + policies tested; PostHog reverse-proxy. Preview deploys per PR; `pnpm turbo build lint typecheck test` green; smoke-test the pay path; rollback = redeploy previous.

## 7 · Maps to the QA checklist

P0 server-authoritative cart → §2 + `lib/cart.ts`. P0 promo server-validation → `promo_codes` + action. P0 group-cart auth → §2 table-session + RLS. P0 Stripe SAQ-A → §2 Payment Element + webhook. P1 SRI/CSP, self-host images, escape user strings → §6 + React. P2 PostHog PII rules, CCPA → §4. Edge-case matrix → covered by server-authoritative state + RLS (the prototype's client races disappear).

## 8 · The post-payment artifact paths (as-built: W7a → W22r)

Three surfaces render one settled order — the live `/track` tracker, the session-less durable receipt, and the receipt email. They share **one** derivation, because a receipt that disagrees with itself is worse than no receipt.

**One identity, one module.** `apps/qr/lib/brand.ts` holds the restaurant's name, street address, display + `tel:` phone, contact inbox, and socials — every string copied **verbatim** from the delivery repo's production constants, the set the owner already runs. There are **no business hours** anywhere in either repo, so none are offered (an invented hour is exactly the honesty violation `DESIGN-LANGUAGE.md` forbids). The receipt card, the tracker's contact foot, and the email shell all read it; nothing re-types an address.

**The pure receipt model.** `apps/qr/lib/receipt-view.ts` derives everything a receipt shows: zero-gated breakdown rows (`buildReceiptRows`), `tenderLabel` — with `receiptStatusLabel` beside it in `lib/refund-view.ts` since W23b (a refunded or partly refunded order keeps its receipt but never claims "Paid in full") — `fulfillmentLabel` + `groupReceiptLines` (the Bill's destination vocabulary — "At your table / To-go / Grocery" — with headings only when the basket spans 2+, because a lone heading over every line is noise not clarity), and `SERVICE_CHARGE_DISCLOSURE`. Amounts are the fulfillment-time **snapshot** rendered verbatim; nothing here recomputes, and tax is ONE order-level row (a per-line sum can differ by a rounding cent — the charge is right, and a receipt must not surface the mismatch).

**The durable artifact (`/track?r=…`).** `lib/receipt-entry.ts` is a `server-only` **module, not a `"use server"` action**: every export of an action module is a POST-able endpoint, and this read trades a bare order id for a full receipt, so its callers own the authorization. `lib/receipt-token.ts` mints the one deliberate exception to the `lib/orders.ts` doctrine that ids are lookups and never credentials — an opaque ≥256-bit `base64url` bearer in `mms_receipt_tokens`: 90-day TTL, one token → one order, PII-free, service-role only, revocable by deleting the row, and reused rather than rotated while live (a link a diner already emailed themselves must not die under them). The page is `noindex` and mounts **no** live layer: it is the copy that outlives the 4h anon session, a cleared table, and the device.

**The receipt email.** `lib/receipt.ts` (the actions) authorizes the SSR-verified uid as the order's earner **or** a recorded `qr_order_payers` row, rate-limits the ask (`RECEIPT_RATE`, 5 per 10 min), and drains the send through `after()` so the response never waits on Resend; `receipt_sent_at` stamps only a **handed-off** send, because the address column alone proves an ask and nothing more. `lib/email.tsx` sends via the Resend SDK from `RESEND_RECEIPT_FROM` (falling back to `RESEND_FROM`), sets `replyTo` to the brand inbox so a reply reaches a human, and ships a **plain-text part rendered from the same React element** as the HTML — one element, two MIME parts that cannot disagree. All templates share `emails/MmsEmailLayout.tsx` (hosted true-PNG badge, bilingual kicker, solid triad bar — email clients drop gradients — and the full identity footer), each supplying its own honest reason line. Wiring, the sender-identity decision, and the hosted-badge trap: [`ENV.md`](ENV.md).

**Live tracking.** `lib/track-order.ts` owns ONE `TRACK_ORDER_SELECT` literal plus `shapeTrackedOrder`, shared by the browser Realtime read (`useOrderStatus`, authorized per-subscriber by `qr_order_read` RLS) and both server fallback reads (`getMyOrderFallback` — `earned_by = uid`, or a uid-scoped `qr_order_payers` row for a split payer). `FallbackOrder = TrackedOrder` by definition, so a snapshot order and a live one cannot drift; before W22r this contract was three hand-copied selects and three hand-copied mappers, which is exactly how shapes drift. Lines sort by id, matching `getReceiptEntry`'s `.order("id")` — the tracker lists the same receipt in the same order as the durable page and the email, and a status-triggered refetch never reshuffles it. The step rail shows only **real** stamps (`created_at` / `togo_ready_at` / `togo_picked_up_at`); "In the kitchen" stays bare because no honest clock exists for it yet.

The visual treatment of these surfaces — the two-tier `--sh-paper` depth, the `PaperAmbient` page ground, and the print ceremony on the paid slip — belongs to [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md), not here.

> Sources: [Turborepo + pnpm monorepo 2026](https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix) · [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) · [Stripe + Next.js 2026](https://dev.to/sameer_saleem/the-ultimate-guide-to-stripe-nextjs-2026-edition-2f33) · v7.1 red-team + `MMS_QR_RealBuild_QA_Checklist`.
