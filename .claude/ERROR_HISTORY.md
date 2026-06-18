# Error history

Recent mistakes + their fix, newest first. Keeps the same bug from recurring. Trim when stale.

- **2026-06-18** — Reconciled the `0001` collision (M1·P1.0): namespaced `qr_*` session tables, repointed all QR queries at the delivery-owned `menu_items` (cents + normalized modifiers), QR-owned `tax_category` maps + resolver, money cents end-to-end, `mms_fulfill_order` writes `qr_*` and reconciles vs `intent.amount`. Gate green; validated read-only against prod (branching needs Pro, so not applied). Gems deferred (`loyalty_rewards.user_id NOT NULL`).
- **2026-06-17** — Confirmed `0001`'s `carts`/`orders`/`order_items`/`menu_items` **collide with the live delivery schema** (already present, different shapes) → `create table if not exists` no-ops and QR queries break. Bigger than the 2026-06-16 menu note: it's four tables, not one. Fixed 2026-06-18 (see above); guarded the migration + wrote `docs/DATA_RECONCILIATION.md`.
- **2026-06-17** — `next build` failed in the remote sandbox: Turbopack's `next/font/google` fetch is TLS-blocked behind the proxy. Fix: `next.config.ts` sets `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS`. Also `@mms/db` typecheck lost `process`/`server-only` under pnpm 11 — fix: declare the deps + `types: ["node"]`.
- **2026-06-16** — Webhook called `mms_fulfill_order` that didn't exist → every payment would 500. Fix: defined the idempotent function in `0001`.
- **2026-06-16** — `menu_items`/`grocery_items` referenced but not created → empty menu. Fix: added a seed table in the migration; on the shared Supabase project, **reconcile to the delivery app's real menu table** instead of the placeholder.
- **2026-06-16** — Over-broad host RLS `UPDATE` policy let a host client write any cart column → removed; all writes go through service-role Server Actions.
