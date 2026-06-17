# Scaffold Red-Team + Fixes (M0)
**June 16, 2026** — adversarial review of the M0 scaffold against the QA checklist, by an independent staff-engineer reviewer.

## Verdict
The scaffold **encodes the right P0 architecture** — the Stripe amount is genuinely server-derived and un-spoofable, RLS keys off a `session_id` JWT claim, Realtime is private, and the Payment Element keeps PAN off-DOM (SAQ-A). But M0 is a **blueprint**: three load-bearing pieces are deferred to M1, and there was one real money bug. Go to keep building; **no real card until the M1 items below land.**

## Fixed in this pass
- **Tax math (High)** — `getCartTotals` now computes tax on the **discounted taxable base** (per-line), not a pro-rata scale of the rounded aggregate. A flat promo across mixed taxable/exempt lines now stays CDTFA-correct. (`apps/qr/lib/cart.ts`)
- **Over-broad host RLS (High)** — removed the client `cart UPDATE` policy (it allowed a host client to write `promo_code`/`session_id` directly). All writes now go through service-role Server Actions; clients are default-deny on writes. (`migrations/0001`)
- **JWT claim collision** — `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`). (`migrations/0001`)
- **Presence churn (Low)** — `useGroupCart` takes a stable `{seat,name}` from the session JWT instead of a fresh `crypto.randomUUID()` per subscribe. (`apps/qr/lib/realtime.ts`)
- **Stripe idempotency (Low)** — `create-intent` passes an idempotency key (`pi_{cart}_{amount}`) so double-submits don't mint duplicate intents. (`create-intent/route.ts`)
- **Poured 2 of the 3 missing beams** — added the `menu_items` table **+ seed** (the menu RSC + pricing now resolve) and the idempotent **`mms_fulfill_order`** function (the webhook no longer dead-ends). (`migrations/0001`)
- **Session-mint route shape (C2)** — added `POST /api/session` that creates/joins the table session and returns the seat/role; JWT signing is the one remaining TODO (clearly marked). (`app/api/session/route.ts`)

## Still open — the M1 "walking pay path" gate (do not run real cards until done)
1. **Sign the table-session JWT** in `/api/session` with `SUPABASE_JWT_SECRET` (claims: `session_id`, `seat`, `app_role`, `role:authenticated`) — until then RLS authorizes nothing and group cart is inert.
2. **Build the Payment Element client component + a cart-create action** — the cart page is a stub; nothing mounts `<Elements>` yet.
3. **Authz on every Server Action + `create-intent`** — `addItem`/`setQty`/`applyPromo`/create-intent are public POSTs; gate each on session membership + lock (IDOR otherwise). Merge identical cart lines (qty is hardcoded to 1).
4. **Reconcile the webhook amount** against `getCartTotals` before fulfilling (the cart could mutate between intent-create and webhook); award gems in `mms_fulfill_order`.
5. **CSP + lint/types** — drop `script-src 'unsafe-inline'` for a nonce-based CSP (Next middleware); add the flat ESLint config + `packages/config`; let `next dev` generate `next-env.d.ts`.

These are exactly the milestones in `ARCHITECTURE.md` §5 — the review confirms the design, and names the order to build it.
