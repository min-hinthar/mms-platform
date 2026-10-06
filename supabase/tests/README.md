# supabase/tests

Database-level tests that run against a real Postgres with the project's migrations applied — the only
place RLS, triggers, and SECURITY DEFINER grants can be proven (they're invisible to TypeScript).

## rls_membership_test.sql (M3·P3.4)

Negative + positive RLS membership tests for the group-cart / split-tender surface: a non-member of a
table session cannot read another table's session/members/cart/items/shares/order rows; a member can read
their own. Plain-SQL `assert`s (no pgTAP dependency) wrapped in a transaction that **rolls back** — it
leaves no data.

Run it:

```bash
# against the local stack (supabase start)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_membership_test.sql

# or any DB
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_membership_test.sql
```

A failed assertion aborts with a non-zero exit (so CI goes red). CI runs this on every push in
`.github/workflows/ci.yml` (the `supabase` job, after the local stack is up).

It impersonates a diner the same way the app's anon-auth does: `set local role authenticated` +
`set local request.jwt.claims` so `auth.uid()` (and thus `is_member`/`is_host`) evaluate the real policies.

## p2f_counter_cook_before_paid_test.sql (Phase 2f · P2v)

Pins `20261001000000_p2f_counter_cook_before_paid.sql`: the staff-only unpaid fire of a `reg-` counter
order and its undo (and its `closed` signal, and its refusal on an expired session), the name lock
(`mms_clear_cart_name`), the no-show write-off (SENT food only — a null `fire_at` counts as sent — the
loss gate's cooked and ceiling legs, the pay-lock and settle-freeze refusals, the 'changed' refusal
when the sent set is not the one the approver saw, the pending-request supersede, the reverse
two-tablet race) and the sweeper's counter exemption (an OPEN cart's SENT food only) — each refusal
beside the legitimate case it must not over-block. Rolls back. Every case is falsified by name in
`scripts/verify-mode-authority.mjs` (suite `p2f`); the locks no single session can observe (the fire
vs the name clear, the fire vs the sweeper) are falsified by
`scripts/verify-counter-fire-race.mjs --mutants`.

## p3c2_table_number_uniq_test.sql (Phase 3c-ii · D22)

Pins `20261005120000_p3c2_table_number_uniq.sql`: one active dine-in session per table NUMBER —
`table_sessions_active_table_uniq ON table_sessions(table_number) WHERE status='active' AND
mode='dinein'`. Case 1 FIRST (two live dine-in rows on one number → `unique_violation`, SQLSTATE
asserted) so the un-migrated run goes red on it; a closed row beside an active one accepted; two
NULL-number rows coexist; an active PICKUP row carrying the number beside the dine-in one ACCEPTED (the
mode scope); an UPDATE of a second session's NULL → the number raises 23505 (the bind path); the
PREDICATE pinned from `pg_indexes`, not the name. Rolls back. The migration's own guard (close only
EXPIRED dine-in rows carrying a number; RAISE naming the numbers on live duplicates) was proved by hand on
a throwaway Postgres 16 before CI; CI's `supabase` job is the first run on the real schema.

## m258_undo_fire_lock_guard_test.sql (Phase 3c-ii · D29 · M258)

Pins `20261005120100_m258_undo_fire_lock_guard.sql`: `mms_undo_fire(p_cart_id, p_batch)` refuses under
a FRESH pay lock (5 min) or a FRESH split freeze (10 min) — the `mms_void_line` idiom — and still
reverses under a STALE lock (the legitimate undo a bare `locked = false` would over-block, W17's rule):
fire two drafts → fresh lock → 0, both lines still fired with the batch; a 6-minute-old lock → 2; unlocked
→ 2; `settle_at = now()` → 0; an 11-minute-old settle → reverses; `anon` has no execute, `service_role`
does. `staff_fire_undo_test.sql` cases 1–7 stay green on the new body. Rolls back. Every case is
falsified by name in `scripts/verify-mode-authority.mjs` (suite `p3c2`, four rows); the one-statement
residual (the UPDATE reads its snapshot and locks nothing) is STATED in the migration header — M261.
