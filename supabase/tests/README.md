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
does; and the INNER edges — a 4-minute-old lock and a 9-minute-old settle both still refuse (M7 · M8:
the outer edges alone let a body reading `interval '1 minute'` pass — the blind pass on 3c-ii); and
`locked = true, locked_at = NULL` still reverses (M9: the bare `locked and locked_at > …` is NULL under
three-valued logic, so the UPDATE skipped the row — Codex r1 on #314). `staff_fire_undo_test.sql`
cases 1–7 stay green on the new body. Rolls back. Every case is falsified by name in
`scripts/verify-mode-authority.mjs` (suite `p3c2`, seven rows — each window removed, the strict
`locked = false` form, the settle window widened, each window NARROWED to one minute, and the
null-stamp form restored);
the one-statement residual (the UPDATE reads its snapshot and locks nothing) was STATED in the
migration header and is closed by M261 (below) — so since M261 this file runs against
`20261006120000`'s body, and those seven rows patch THAT file (`src: "m261"`, still `suite: "p3c2"`).

## m261_undo_fire_cart_lock_test.sql (M261 · J37)

Pins `20261006120000_m261_undo_fire_cart_lock.sql`: `mms_undo_fire` takes the cart row lock FIRST
(`perform 1 … for update`, `mms_undo_counter_fire`'s line) — M261.1: an undo that matches nothing on a
cart NO line has touched still stamps that cart row's `xmax` (a cart with lines is useless here: every
line write in the transaction runs the FK check, whose `FOR KEY SHARE` stamps the same `xmax`). It proves
the lock is TAKEN, never its ORDER against a concurrent claim (two sessions — OPEN-ITEMS P2fj). And the
two facts `lib/undo-miss.ts` reads after a 0-row answer — for the diner's undo too since J37: J37.1, a
landed undo leaves NO line carrying the batch (so a re-ask reads `gone`, "brought back") and the re-ask
reverses 0; J37.2, an undo after the grace reverses 0 and the late lines KEEP the batch (so it reads
`expired`, "the kitchen has it"). Rolls back. Every case is falsified by name in
`scripts/verify-mode-authority.mjs` (suite `m261`, three rows — the lock dropped, the un-fire that keeps
`fire_batch`, the grace leg dropped). Run by hand on a throwaway Postgres 16 carrying every repo
migration — M261.1 red against the M258 body, green after; CI's `supabase` job is its first run on the
real schema.

the one-statement residual (the UPDATE reads its snapshot and locks nothing) is STATED in the
migration header — M261.

## m263_bind_session_table_test.sql (Phase 3c-ii · M263 · J41 · J40)

Pins `20261006120100_m263_bind_session_table.sql`: `mms_bind_session_table(p_session, p_table,
p_shell)`, the ONE bind both binders call (`bindTable` and `/api/session`'s claim arm). M263 — the
binder's open cart freeze read under its own row lock and the CAS in one transaction: a fresh lock (0
and 4 minutes) refuses, a stale one (6) and a NULL stamp land; a fresh split freeze (0 and 9) refuses, a
stale one (11) lands; a bound row is never re-tabled; a PAID cart's leftover lock does not refuse; a
closed, pickup or expired binder is `unmoved`; the bind writes the number only (`qr_code`,
`expires_at`, `host_seat` unchanged); 23505 and 23503 propagate; the grants, SECURITY DEFINER and the
empty search_path. J41 — an unbound row on table T's ACTIVE sticker binds to T only (`sticker:T`), a
bound one is the CAS's, an INACTIVE registration does not refuse. J40 — an untouched staff shell is
adopted (closed, its empty cart cancelled, the binder's own draft untouched); `held` for a member, an
earlier cart, a (voided) line, a name, a promo, a tab, a pay attempt, a split; `gone` for a claimed
shell, no open cart, another number, a pickup row, a closed row; a CAS that moves no row takes the
adopt back; the sticker rule and the freeze are decided before the adopt. Every session carries its
own code and every case closes what it opened (red-team #10). Rolls back. Every case is falsified by
name in `scripts/verify-mode-authority.mjs` (suite `m263`); the three row locks no single session can
observe (the binder cart's FOR SHARE, the shell cart's and the shell session's row-exclusive locks)
are the suite's documented survivors and are falsified by `scripts/verify-bind-race.mjs --mutants`.
Red on M263.1 (`raised:42883`) without the migration.
