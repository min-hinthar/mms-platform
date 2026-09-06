-- supabase/tests/pilot15_promo_test.sql  (pilot P3 — the incentive row, asserted from the database)
--
-- `20260905120000_pilot15_promo.sql` inserts ONE row and creates no objects, so the usual
-- "verify the objects this file creates" check has nothing to look at. The row IS the object, and
-- every number on it is a policy decision that reaches a guest's bill. This file is that
-- verification, run on a real stack in CI where the app-layer suites cannot reach.
--
-- ── What each case is for ───────────────────────────────────────────────────────────────────────
--   1. The row exists with the POLICY the migration's docblock argues for. A typo in any of the five
--      numbers is a different promo than the one that was decided on, and four of them are silent:
--      a wrong `per_session_limit` lets one table redeem twice, a wrong `min_subtotal_cents` refuses
--      the smallest tables, a wrong `max_uses` removes the leak ceiling, a null `valid_until` makes
--      it standing forever.
--   2. The WINDOW is bounded and not already-expired. Deliberately compared against a FIXED date
--      (the day the row was authored) rather than `now()`: an assertion that the pilot window is
--      still open would redden this suite for everyone the moment the pilot ends, which teaches the
--      next reader to ignore a red guard. What can never be right is a window that closes BEFORE the
--      migration was written — a typo'd year, dead on arrival.
--   3. `promo_pct_max_100` actually REFUSES `value > 1`, red-first. This is the constraint that makes
--      `0.15` mean 15% instead of 1500%, and nothing else in the repo has ever watched it reject
--      anything — the exact hole the W17 cash-tip lesson names ("prove a DB constraint against the
--      real database, red-first"). An over-tight bound is checked too: 0.15 must still be accepted,
--      or a refusal-only test would happily pass on a constraint that blocks real service.
--   4. `mms_promo_check` PRICES it at 15% of a real cart and answers `valid`. The arithmetic lives in
--      SQL (`round(v_subtotal * v_promo.value)`), so this is the only place the fraction-versus-
--      percentage decision is actually exercised end to end: a `value` of 15 would quote 1500% here.
--   5. The per-session cap REFUSES a second redemption on the same table session, through
--      `mms_promo_check` — the cap the plan chose, asserted rather than assumed.
--   6. RE-APPLYING THE MIGRATION CANNOT RESURRECT A SWITCHED-OFF CODE OR REFUND A SPENT BUDGET.
--      The file's `on conflict (code) do update` deliberately EXCLUDES `active` and `used`, and that
--      exclusion is the only thing standing between a routine re-apply and (a) turning a code the
--      owner killed in an emergency back on, (b) handing back redemptions already counted. Nothing
--      tested it, so the two most consequential words in the migration — the two column names NOT in
--      the update list — were unguarded. The migration file is `\ir`-INCLUDED rather than
--      transcribed here, so this case can never drift from the statement it is about.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pilot15_promo_test.sql
--
-- ── RED-FIRST: what was falsified, exactly ──────────────────────────────────────────────────────
-- Run on a local PostgreSQL 16 cluster with the full migration stack applied in order (Docker is
-- unavailable in the agent environment, so `supabase db start` is not; the Supabase-shaped
-- prerequisites — the `auth`/`extensions`/`realtime` schemas, `auth.uid()`, the three roles — were
-- created by hand and all 98 files then applied with zero failures). TWELVE falsifications were run,
-- each induced red, watched fail, and restored green:
--   1  · value 0.15 → 0.20 · per_session_limit 1 → 2 · max_uses 200 → null
--   2  · valid_until → null · valid_until → a typo'd 2025
--   3  · `promo_pct_max_100` dropped (the probe insert of 15 then SUCCEEDS)
--   4  · `mms_promo_check`'s `round(v_subtotal * v_promo.value)` halved · its `upper(p_code)` removed
--   5  · its `per_session_limit` branch neutered to `if false then`
--   6  · `active` ADDED to the migration's do-update list · `used` ADDED to it · the whole list
--        replaced by `do nothing` (the policy columns then never update)
--
-- ⚠️ TWELVE OF 22 ASSERTIONS, NOT ALL OF THEM, and saying "every assertion was induced red"
-- was the wrong claim — it is exactly the "green for the wrong reason" shape this repo audits guards
-- for. The rest are pinned by construction rather than by a falsification of their own: several sit
-- in the SAME `do $$` block as one that WAS falsified, and a block aborts at its first failing
-- ASSERT, so falsifying one hides the others behind it. Two are honestly weaker than the rest and
-- are named so nobody reads more into them:
--   · `assert p.active` (case 1) cannot fail on a FRESH stack — the row is inserted moments earlier
--     and `active` takes its column default. It is a live assertion against PROD, where the owner's
--     dark switch (`update promo_codes set active = false`) is the one thing that turns it red, and
--     case 6 is what actually guards the mechanism.
--   · `assert p.valid_from is null` (case 2) restates the insert. It earns its place by making a
--     LATER addition of a second start gate a deliberate edit to this file.
--   · `assert exists (… PILOT15PROBE)` (case 3, the over-tight-bound half) cannot fail on its own:
--     the `insert` above it is UNGUARDED, so a refusal raises and aborts the block before the ASSERT
--     is reached. The bound is genuinely proven — by the insert succeeding — but the assertion after
--     it adds nothing, and counting it as a check would overstate what this file demonstrates.
-- The GUC below is proven live by the fact that any falsification fired at all.
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional — with the GUC off every ASSERT compiles
-- out and the file exits 0 having proved nothing.

begin;
set local plpgsql.check_asserts = on;

-- ── 1 · the row exists, with the policy the migration argues for ────────────────────────────────
do $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = 'PILOT15';
  assert p.code is not null, 'PILOT15 is missing — the pilot has no incentive row';
  assert p.kind = 'pct', format('PILOT15 kind is %s, expected pct', p.kind);
  -- 0.15, NOT 15. `promo_pct_max_100` refuses the latter, but the assertion names the value so a
  -- future edit to 0.10 or 0.20 is a deliberate change to this file, not a silent one.
  assert p.value = 0.15, format('PILOT15 value is %s, expected 0.15 (a FRACTION — 15%%)', p.value);
  assert p.max_uses = 200, format('PILOT15 max_uses is %s, expected 200', p.max_uses);
  assert p.per_session_limit = 1,
    format('PILOT15 per_session_limit is %s, expected 1 — one redemption per table session',
           p.per_session_limit);
  assert p.min_subtotal_cents = 0,
    format('PILOT15 min_subtotal_cents is %s, expected 0', p.min_subtotal_cents);
  assert p.active, 'PILOT15 is inactive — a code nobody can spend';
end $$;

-- ── 2 · the window is BOUNDED, and not written already-expired ──────────────────────────────────
do $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = 'PILOT15';
  assert p.valid_until is not null,
    'PILOT15 has no valid_until — a standing 15% discount nobody remembers to switch off';
  -- Fixed date, never `now()`: see the header. This catches a typo'd year, which is the failure that
  -- ships a code that can never be spent.
  assert p.valid_until > timestamptz '2026-09-05 00:00:00+00',
    format('PILOT15 closes at %s, before the day it was written — dead on arrival', p.valid_until);
  -- `valid_from` null is the deliberate choice (the owner-gated apply is the start gate). Asserted so
  -- that adding one later is a decision made here, not a second gate added silently somewhere else.
  assert p.valid_from is null,
    format('PILOT15 has a valid_from (%s) — the apply is meant to be the only start gate',
           p.valid_from);
end $$;

-- ── 3 · promo_pct_max_100 REFUSES a percentage where a fraction belongs (red-first) ─────────────
do $$
declare v_refused boolean := false;
begin
  begin
    insert into public.promo_codes (code, kind, value, max_uses, per_session_limit, min_subtotal_cents)
      values ('PILOT15PROBE', 'pct', 15, 1, 1, 0);
  exception when check_violation then
    v_refused := true;
  end;
  assert v_refused,
    'promo_pct_max_100 accepted a pct value of 15 — a 1500% discount would price a basket negative';

  -- …and the legitimate value still passes. An over-tight bound blocks real service, and a
  -- refusal-only test would never notice.
  insert into public.promo_codes (code, kind, value, max_uses, per_session_limit, min_subtotal_cents)
    values ('PILOT15PROBE', 'pct', 0.15, 1, 1, 0);
  assert exists (select 1 from public.promo_codes where code = 'PILOT15PROBE'),
    'promo_pct_max_100 refused 0.15 — the bound is tighter than the policy it guards';
end $$;

-- ── 4 · mms_promo_check prices it at 15% of a real cart ─────────────────────────────────────────
-- ⚠️ 4000, not 1000: at 1000 a 15% quote is 150, which is ALSO what a flat-150 row would answer and
-- what several rounding variants land on. 4000 → 600 separates 0.15 from its neighbours by a margin
-- no other plausible rule reproduces (a degenerate fixture is the surviving-mutant failure mode, one
-- layer down).
do $$
declare
  host uuid := '00000000-0000-0000-0000-0000000015a0';
  sess uuid; cart uuid; r record;
begin
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'PILOT15A', 'dinein', 'active', host);
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, 'cccccccc-0000-4000-8000-000000000015', 'Mohinga', 2, 2000, 0, null, 'dinein');

  select * into r from public.mms_promo_check('PILOT15', cart);
  assert r.valid, format('PILOT15 was refused on a clean 4000c cart: %s', r.reason);
  assert r.discount_cents = 600,
    format('PILOT15 quoted %s on a 4000c cart, expected 600 (15%%)', r.discount_cents);

  -- Lower-case in, same verdict out: `mms_promo_check` upper-cases its input, which is why the app
  -- may accept whatever a server types at the register.
  select * into r from public.mms_promo_check('pilot15', cart);
  assert r.valid and r.discount_cents = 600,
    'mms_promo_check did not normalise a lower-case PILOT15';
end $$;

-- ── 5 · the per-session cap refuses a SECOND redemption on the same table session ───────────────
do $$
declare
  host uuid := '00000000-0000-0000-0000-0000000015b0';
  sess uuid; cart uuid; ord uuid; r record;
begin
  sess := gen_random_uuid(); cart := gen_random_uuid();
  insert into public.table_sessions (id, qr_code, mode, status, host_seat)
    values (sess, 'PILOT15B', 'dinein', 'active', host);
  insert into public.qr_carts (id, session_id, promo_code) values (cart, sess, 'PILOT15');
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, 'cccccccc-0000-4000-8000-000000000015', 'Mohinga', 2, 2000, 0, null, 'dinein');

  -- Spend it: subtotal 4000, discount 600, all of it the promo → total 3400.
  ord := public.mms_fulfill_order(
    cart, 'pi_pilot15_case5', 3400, 4000, 600, 0, 0, 0, null, 'card', 600);
  assert ord is not null, 'PILOT15.5 fixture drift: fulfillment should succeed';
  assert exists (select 1 from public.promo_redemptions where code = 'PILOT15' and session_id = sess),
    'PILOT15.5: a delivering promo must record a redemption';

  -- A second cart on the SAME session must now be refused by the per-session cap.
  cart := gen_random_uuid();
  insert into public.qr_carts (id, session_id) values (cart, sess);
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, unit_price_cents, tax_cents, by_seat, fulfillment)
    values (cart, 'cccccccc-0000-4000-8000-000000000015', 'Mohinga', 2, 2000, 0, null, 'dinein');
  select * into r from public.mms_promo_check('PILOT15', cart);
  assert not r.valid and r.reason = 'session_limit',
    format('PILOT15.5: a second redemption on one table answered valid=%s reason=%s',
           r.valid, r.reason);
end $$;

-- ── 6 · re-applying the migration cannot resurrect a dark-switched code, or refund a spent budget ─
-- The migration is INCLUDED, not copied: `\ir` resolves relative to THIS FILE, so the statement under
-- test is the one that will actually be applied, and a future edit to its do-update list is caught
-- here instead of drifting past a hand-typed twin. Everything is still inside the transaction the
-- footer rolls back.
update public.promo_codes
   set active = false,            -- the owner's emergency dark switch
       used = 5,                  -- a budget already spent
       value = 0.99,              -- and a policy column that SHOULD be corrected by a re-apply
       max_uses = 1
 where code = 'PILOT15';

\ir ../migrations/20260905120000_pilot15_promo.sql

do $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = 'PILOT15';
  assert not p.active,
    'a re-apply turned PILOT15 back ON — `active` must stay out of the do-update list, or routine '
    'redeployment silently reverses the owner''s emergency switch-off';
end $$;

do $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = 'PILOT15';
  assert p.used = 5,
    format('a re-apply reset PILOT15.used to %s — `used` is a consumed BUDGET, not policy, and '
           'resetting it hands back redemptions already counted against max_uses', p.used);
end $$;

do $$
declare p public.promo_codes%rowtype;
begin
  select * into p from public.promo_codes where code = 'PILOT15';
  -- …and the POLICY columns must still update, or `do update` is `do nothing` wearing a costume and
  -- an edited window in the migration would read as applied while prod kept the old numbers.
  assert p.value = 0.15,
    format('a re-apply left PILOT15.value at %s — the do-update list is not doing its job', p.value);
  assert p.max_uses = 200,
    format('a re-apply left PILOT15.max_uses at %s', p.max_uses);
end $$;

rollback;
