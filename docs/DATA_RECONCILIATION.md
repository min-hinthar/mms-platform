# Data reconciliation — QR schema ↔ live delivery DB

**Status: RECONCILED (M1·P1.0, 2026-06-18).** `0001`/`0002` are rewritten to coexist with the
live delivery schema (namespaced `qr_*`, money in cents, real menu) and all QR code is repointed.
Still **not applied to prod** — apply on a Supabase branch (blocked: branching needs the Pro plan)
or via `supabase db push` against a branch, and merge after the M1 gate.
Discovered 2026-06-17 by inspecting the shared Supabase project (`ukuzkhuppqwtrdkjqrkv`,
`mandalay-morning-star-delivery-app`, ACTIVE_HEALTHY) read-only; reconciled 2026-06-18.

## The finding

`packages/db/migrations/0001_qr_ordering.sql` creates `carts`, `orders`, `order_items`, and
`menu_items` with `create table if not exists`. **All four already exist** in the live delivery
schema with different shapes, so the QR `create`s silently **no-op** and the QR code then runs
against the delivery tables — every cart/menu/fulfillment query breaks.

| Table         | Live delivery shape (rows)                                                                                                                    | QR `0001` assumes                                                                                | Conflict                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu_items`  | `id uuid`, `slug`, `name_en`, `name_my`, `base_price_cents int`, `category_id uuid`, `is_active`, `is_sold_out`, `allergens[]`, `tags[]` (60) | `id text`, `name`, `price numeric`, `category text`, `tax_category`, `modifiers jsonb`, `diet[]` | No `tax_category`, no `modifiers`, no `price`/`name`/`category`; ids are uuid not `t1`/`n1`. `lib/cart.ts priceItem` + `menu/page.tsx` select non-existent columns. |
| `carts`       | per-`user_id`, `items jsonb`, `subtotal_cents` (8)                                                                                            | per-`session_id`, `locked`, `promo_code`                                                         | Different concept (saved user cart vs. table-session cart). QR cart code selects `session_id`/`locked` — absent.                                                    |
| `orders`      | `user_id`, `address_id`, `*_cents int`, delivery fields, `status` enum, `stripe_payment_intent_id` (20)                                       | `session_id`, `subtotal numeric`, `service_charge`, `tax`, `total`, `status` text                | `mms_fulfill_order` inserts `session_id`/`subtotal`/`service_charge`/`total` — none exist.                                                                          |
| `order_items` | `menu_item_id uuid`, `name_snapshot`, `base_price_snapshot`, `quantity`, `line_total_cents` (129)                                             | `menu_item_id text`, `name`, `qty`, `modifiers`, `unit_price`, `tax`                             | Column + type mismatch.                                                                                                                                             |

Modifiers in the delivery app are **normalized** (`modifier_groups` / `modifier_options` /
`item_modifier_groups`), not a `modifiers jsonb` column. Money is stored as integer **cents**,
not `numeric` dollars. Bilingual text is `name_en` / `name_my`.

Safe (no collision, additive): `table_sessions`, `session_members`, `promo_codes`,
`grocery_items`, and the tax functions (`mms_tax_rate` / `mms_taxable` / `mms_line_tax`).

## Plan (M1·P1.0) — done ✅

Decision: **namespace** (not a `channel`/`source` discriminator on the shared `orders`). The
discriminator was rejected for M1 — it entangles the QR pay path with the delivery order
lifecycle (`order_status` enum: `pending_approval…delivered`), `user_id NOT NULL`, and RLS.
Revisit at M5 if a unified order history is wanted.

1. ✅ **Namespaced the QR session tables** so they can't shadow delivery tables: `qr_carts`,
   `qr_cart_items`, `qr_orders`, `qr_order_items`. Repointed every reference: `lib/cart.ts`,
   `lib/grocery.ts`, `app/api/session/route.ts`, `app/api/stripe/webhook/route.ts`,
   `app/cart/page.tsx`, and `mms_fulfill_order`.
2. ✅ **Reads the real menu.** `priceItem` + `menu/page.tsx` hit the live `menu_items`
   (`name_en`/`name_my`, `base_price_cents`, `category_id → menu_categories`); modifiers come from
   `item_modifier_groups → modifier_groups → modifier_options.price_delta_cents`, intersected
   server-side so a client can't smuggle a foreign option id. **Money is integer cents
   end-to-end** (`CartTotals`/`CartItem`, `lib/tax.ts`, the migration, grocery `price_cents`);
   convert to dollars at the UI edge only.
3. ✅ **Sources `tax_category`** QR-side: `mms_menu_category_tax` (per-category default) +
   `mms_menu_tax` (per-item override), resolved by `mms_menu_tax_category()`. Delivery `menu_items`
   is untouched. Seed covers all 8 live categories (verified read-only); kept in sync with
   `lib/tax.ts` / `mms_line_tax` (now cents).
4. ✅ **Fulfillment** writes `qr_orders`/`qr_order_items` in cents and **reconciles** the breakdown
   against `intent.amount` (webhook recomputes `getCartTotals` with the `tipRate` carried in intent
   metadata; `mms_fulfill_order` re-checks the sum == the charge). ⚠️ **Gems deferred:**
   `loyalty_rewards.user_id` is `NOT NULL`, so anonymous QR diners can't earn gems until an account
   link exists (M4) — `TODO(M4)` left in `mms_fulfill_order`.
5. ✅ Dropped the placeholder `menu_items` create + seed from `0001` (delivery owns the catalog).

## Current state

- QR migrations `0001`/`0002` are reconciled but **not** applied to the shared project (its
  migration history is delivery-only: `baseline`, `rpc_rls_lockdown`, …). Nothing to roll back.
- **Branch validation blocked:** Supabase branching requires the **Pro plan** (org is not on it),
  so the DDL was not applied/rolled-back on prod. Data-dependent parts validated read-only:
  the category-tax seed covers all 8 live categories, and the cents tax math matches `lib/tax.ts`.
  Apply on a branch (post-upgrade) before merge.
- The delivery loyalty ledger exists (`loyalty_rewards`) — reuse it for M4 rewards once QR orders
  can be tied to an account (see step 4 blocker).
- The gate (`turbo lint typecheck build`) is green with all queries repointed.
