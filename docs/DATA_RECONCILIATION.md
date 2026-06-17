# Data reconciliation — QR schema ↔ live delivery DB

**Status: blocker for M1. Do not apply `0001` to the shared project as-written.**
Discovered 2026-06-17 by inspecting the shared Supabase project (`ukuzkhuppqwtrdkjqrkv`,
`mandalay-morning-star-delivery-app`, ACTIVE_HEALTHY) read-only.

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

## Recommended plan (M1·P1.0 — do before the pay path)

Run all of this on a **Supabase branch**, never prod (per `CLAUDE.md`); merge after the M1 gate.

1. **Namespace the QR session tables** so they can't shadow delivery tables: `carts → qr_carts`,
   `cart_items → qr_cart_items`, `orders → qr_orders`, `order_items → qr_order_items`. Update
   every reference: `lib/cart.ts`, `lib/grocery.ts`, `app/api/session/route.ts`,
   `app/api/stripe/webhook/route.ts`, `app/cart/page.tsx`, and `mms_fulfill_order`.
   (Alternative considered: add a `channel`/`source` discriminator to the shared `orders`. Rejected
   for M1 — it entangles the QR pay path with the delivery order lifecycle/enum and RLS. Revisit at
   M5 if a unified order history is wanted.)
2. **Read the real menu.** Repoint `priceItem` + `menu/page.tsx` at the live `menu_items`
   (`name_en`/`name_my`, `base_price_cents`/100, `category_id → menu_categories`) and derive
   modifiers from `item_modifier_groups → modifier_groups → modifier_options.price_delta_cents`.
   Money stays in **cents** end-to-end to match the delivery app; convert at the edge only.
3. **Source `tax_category`.** The live `menu_items` has none. Add a `mms_menu_tax` mapping
   (`menu_item_id uuid → tax_category text`, plus a per-`menu_categories` default) owned by the QR
   side, so the category-aware tax engine has an input without altering the delivery table. Keep it
   in sync with `lib/tax.ts` / `mms_line_tax`.
4. **Fulfillment** writes to `qr_orders` / `qr_order_items` in cents; reconcile `intent.amount`
   against `getCartTotals` before marking paid; award gems via the delivery loyalty path
   (`loyalty_rewards`).
5. Drop the placeholder `menu_items` seed from `0001` (delivery owns the catalog).

## Current state

- QR migrations `0001`/`0002` are **not** applied to the shared project (its migration history is
  delivery-only: `baseline`, `rpc_rls_lockdown`, …). Nothing to roll back.
- The delivery loyalty ledger exists (`loyalty_rewards`, 7 rows) — reuse it for M4/M5 rewards.
- No code change here repoints the queries yet; that's the M1·P1.0 task above (needs the
  namespace-vs-discriminator sign-off in step 1).
