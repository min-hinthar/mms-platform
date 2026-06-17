# Error history

Recent mistakes + their fix, newest first. Keeps the same bug from recurring. Trim when stale.

- **2026-06-16** — Webhook called `mms_fulfill_order` that didn't exist → every payment would 500. Fix: defined the idempotent function in `0001`.
- **2026-06-16** — `menu_items`/`grocery_items` referenced but not created → empty menu. Fix: added a seed table in the migration; on the shared Supabase project, **reconcile to the delivery app's real menu table** instead of the placeholder.
- **2026-06-16** — Over-broad host RLS `UPDATE` policy let a host client write any cart column → removed; all writes go through service-role Server Actions.
