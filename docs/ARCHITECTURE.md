# MMS Platform — Build Spec & Architecture

**Mandalay Morning Star · monorepo for delivery + QR dine-in/kiosk ordering · June 16, 2026**

The plan and architecture for turning the v7.2 QR prototype into a production app, alongside the existing delivery PWA, in one Turborepo monorepo. Grounded in the v7.1 red-team and its `RealBuild_QA_Checklist`.

---

## 1 · Why a monorepo (and how the existing app fits)

The existing **`mandalay-morning-star-delivery-app`** (Next.js 16.1.2 · React 19.2.3 · TS strict · Tailwind 4 · Supabase · Stripe · Burmese-gem loyalty · v1.9 launch-ready) is mature and **already owns** the menu/catalog, payments, loyalty, and bilingual content. The QR dine-in/kiosk app should **reuse** all of that, not fork it. A Turborepo monorepo lets both apps share one Supabase project, one design system, one menu, and one loyalty ledger:

```
mms-platform/
├─ apps/
│  ├─ delivery/        ← move the existing delivery app here (git subtree/clone)
│  └─ qr/              ← NEW: the QR dine-in / Scan&Go / Pickup app (this scaffold = apps/web)
├─ packages/
│  ├─ ui/              ← design tokens (editorial-forward + Night) + Radix Sheet/Button/NumberFlow
│  ├─ db/              ← Supabase client + generated types + migrations (RLS, tax fn)
│  └─ config/          ← shared tsconfig + eslint
├─ turbo.json · pnpm-workspace.yaml · tsconfig.base.json
```

**Rules** (2026 monorepo best practice): one-way deps (apps → packages, never reverse); namespaced packages (`@mms/ui`, `@mms/db`, `@mms/config`); single-version policy via root `pnpm.overrides`; import from package roots only.

**Migration of the delivery app** (one-time): `git clone` the existing repo into `apps/delivery/`, delete its `.git`, point its Supabase/Stripe imports at `@mms/db`, dedupe shared deps to the root. Until then `apps/delivery` is a placeholder; the QR app (`apps/qr`) is fully scaffolded and runs independently against the same Supabase project.

> GitHub: this scaffold is local. To create the repo: `gh repo create mms-platform --private --source=. --remote=origin` then `git add -A && git commit -m "scaffold" && git push -u origin main`. (Connect the GitHub connector if you want me to push for you.)

## 2 · QR app architecture (the risky parts, designed in)

These directly answer the red-team's P0s.

**Server-authoritative cart + pricing (fixes client-trust C1/C2).** The browser never computes the total. The cart lives in Postgres (`carts`/`cart_items`), mutated only through **Server Actions** that re-derive every line price from the menu row + validated modifiers. `getCartTotal()` runs server-side: subtotal → promo (server-validated) → **category-aware tax** → 5% SB-1524 service charge → tip. The client renders what the server returns.

**Category-aware tax engine (replaces the flat 10.5% gap).** `packages/db` ships a SQL function `mms_line_tax(category, dine_in)` + a TS mirror in `apps/qr/lib/tax.ts`, implementing CA 80/80 / Reg 1603 (hot/prepared always taxable; cold to-go food per the rule; non-food retail taxable). Tax is computed per line, server-side, from the item's tax category — never a flat rate.

**Stripe, server-driven (PCI = SAQ-A).** A Route Handler `POST /api/stripe/create-intent` creates a **PaymentIntent** for the **server-computed** amount with `automatic_payment_methods`; the client mounts the **Payment Element** (Apple/Google Pay surface, card) — card data stays in Stripe's iframe, never our DOM. Fulfillment is webhook-driven (`payment_intent.succeeded` / `checkout.session.completed`), idempotent, signature-verified. API version pinned. Store Stripe IDs, never PANs.

**Multi-device group cart (v1) — Realtime + RLS.** A diner scans the table QR → server issues a short-lived, signed **table-session** token bound to that physical QR (not guessable). Guests join a **private** Supabase Realtime channel `table:{sessionId}` (`{ private: true }`); **authorization is enforced by RLS on `realtime.messages`** + RLS on `carts`/`cart_items` (only members of an active session can read/mutate that cart; only the host can lock/unlock/remove others). Presence shows who's at the table; broadcast syncs adds. No client-asserted identity is trusted. (This is the attack surface the red-team flagged — it is closed by server-issued sessions + RLS, not by a public `channel("table-N")`.)

**PostHog funnel (free tier).** `instrumentation-client.ts` + a reverse-proxy rewrite. Event taxonomy below; **no PII in properties** (opaque seat IDs, never names/emails/PANs); `person_profiles: 'identified_only'`; cookieless + consent.

**Accessibility carried from v7.2.** Radix Dialog for sheets (focus trap + naming for free), one focus owner, `lang` per locale, `next/image` for LCP/CLS, reduced-motion. The v7.2 prototype is the visual/interaction reference.

## 3 · Data model deltas (Supabase)

New tables (RLS-protected), additive to the delivery schema: `table_sessions` (id, qr_code, mode, status, host_seat, expires_at), `session_members` (session_id, seat_id, display_name, role), `carts` (session_id, status, locked), `cart_items` (cart_id, menu_item_id, qty, modifiers jsonb, unit_price, tax, by_seat), `orders`/`order_items` (server-priced snapshot, stripe_payment_intent_id), `promo_codes` (code, kind, value, max_uses, used). RLS: every policy keys off membership in an **active** `table_session`; host-only columns gated by `role='host'`. Service-role only for price/tax writes. See `packages/db/migrations/0001_qr_ordering.sql`.

## 4 · PostHog event taxonomy (funnel)

`qr_scanned` → `mode_selected` → `menu_viewed` → `item_viewed` → `add_to_cart` → `cart_viewed` → `checkout_started` → `payment_succeeded` / `payment_failed`; plus `promo_applied`, `split_changed`, `member_joined`, `order_ready`, `feedback_submitted`, `review_redirect`. Properties: `mode`, `seat_count`, `item_category`, opaque `session_id` — never names. First report: the `add_to_cart → cart_viewed → checkout_started` middle (where QR apps leak 30–40%).

## 5 · Milestones

**M0 Scaffold (this turn):** monorepo + `apps/qr` skeleton, tokens, Radix Sheet, Supabase client, tax fn + RLS migration, server-cart action, Stripe intent + webhook routes, Realtime hook, PostHog, broad screen stubs. **M1 Walking pay path:** menu RSC → server cart → Payment Element → webhook fulfillment → track (Scan&Go, solo). **M2 Tax + promos** server-validated; QBO sync. **M3 Group cart** (table session + RLS + Realtime presence, host lock). **M4 Pickup scheduling** (slot capacity + fire-time). **M5 Rewards/loyalty** reuse from delivery app. **M6 Kiosk** + Stripe Terminal (server-driven). Each milestone exits against the QA checklist.

## 6 · Deploy checklist (condensed; full list in QA checklist)

Vercel (apps/qr) + Supabase + Stripe + PostHog. Env via Vercel/Supabase secrets (never committed). **Security headers/CSP** in `next.config` middleware; **SRI**/self-host for any external script; `next/image` self-hosted dish photos; Stripe webhook secret; Supabase RLS enabled + policies tested; PostHog reverse-proxy. Preview deploys per PR; `pnpm turbo build lint typecheck test` green; smoke-test the pay path; rollback = redeploy previous.

## 7 · Maps to the QA checklist

P0 server-authoritative cart → §2 + `lib/cart.ts`. P0 promo server-validation → `promo_codes` + action. P0 group-cart auth → §2 table-session + RLS. P0 Stripe SAQ-A → §2 Payment Element + webhook. P1 SRI/CSP, self-host images, escape user strings → §6 + React. P2 PostHog PII rules, CCPA → §4. Edge-case matrix → covered by server-authoritative state + RLS (the prototype's client races disappear).

> Sources: [Turborepo + pnpm monorepo 2026](https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix) · [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) · [Stripe + Next.js 2026](https://dev.to/sameer_saleem/the-ultimate-guide-to-stripe-nextjs-2026-edition-2f33) · v7.1 red-team + `MMS_QR_RealBuild_QA_Checklist`.
