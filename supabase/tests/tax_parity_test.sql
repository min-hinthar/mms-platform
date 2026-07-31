-- supabase/tests/tax_parity_test.sql  (W8b — TS ↔ SQL tax-engine parity, SQL half)
--
-- `apps/qr/lib/tax.ts` is a HAND-MAINTAINED mirror of `mms_taxable` / `mms_line_tax`
-- (supabase/migrations/20260618000000_qr_platform_init.sql:14-39). CLAUDE.md has always said "keep
-- the TS and SQL in sync"; nothing enforced it until W8. This file asserts the SAME integers the TS
-- half asserts (apps/qr/lib/tax.test.ts), from the database side, in the migrations-check job.
--
-- ⚠️ The two halves deliberately do NOT read each other. A TS test that parsed this migration would be
-- a turbo-cache trap: turbo hashes only files INSIDE the workspace, so editing a migration leaves
-- `@mms/qr:test` a cache hit that replays a GREEN log against drifted SQL (verified in this repo).
-- Each side pins the constants independently, in its own CI job, so a one-sided edit reddens exactly
-- one of them.
--
-- Run against any QR DB (rolls back — leaves NO data behind):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tax_parity_test.sql
--
-- ⚠️ `set local plpgsql.check_asserts = on` is NOT optional. With the GUC off (it is settable per
-- session and some managed configs disable it), every ASSERT below compiles out, the file runs
-- clean, rolls back, and exits 0 — a fully green run that proved nothing.

begin;
set local plpgsql.check_asserts = on;

-- ── 1 · mms_taxable — the CDTFA category matrix (mirrors MATRIX in apps/qr/lib/tax.test.ts) ─────────
-- CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in; retail
-- non-food always taxable; grocery staples exempt. 12 cells = 6 categories × {dine-in, to-go}.
do $$
begin
  -- always taxable, both directions
  assert public.mms_taxable('hot_prepared',   true ) = true,  'PARITY: hot_prepared dine-in should be taxable';
  assert public.mms_taxable('hot_prepared',   false) = true,  'PARITY: hot_prepared to-go should be taxable';
  assert public.mms_taxable('beverage_hot',   true ) = true,  'PARITY: beverage_hot dine-in should be taxable';
  assert public.mms_taxable('beverage_hot',   false) = true,  'PARITY: beverage_hot to-go should be taxable';
  assert public.mms_taxable('retail_nonfood', true ) = true,  'PARITY: retail_nonfood dine-in should be taxable';
  assert public.mms_taxable('retail_nonfood', false) = true,  'PARITY: retail_nonfood to-go should be taxable';

  -- taxable ONLY on premises — the rule the for-here/to-go toggle flips. This is the ONLY category
  -- family whose taxability a diner can change, and `mms_set_line_fulfillment` recomputes tax_cents
  -- in SQL when they do — which is why a one-sided CATEGORY edit here IS charge-affecting.
  assert public.mms_taxable('cold_food',      true ) = true,  'PARITY: cold_food dine-in should be taxable';
  assert public.mms_taxable('cold_food',      false) = false, 'PARITY: cold_food to-go should be EXEMPT';
  assert public.mms_taxable('beverage_cold',  true ) = true,  'PARITY: beverage_cold dine-in should be taxable';
  assert public.mms_taxable('beverage_cold',  false) = false, 'PARITY: beverage_cold to-go should be EXEMPT';

  -- grocery staples: exempt both directions
  assert public.mms_taxable('grocery_food',   true ) = false, 'PARITY: grocery_food dine-in should be EXEMPT';
  assert public.mms_taxable('grocery_food',   false) = false, 'PARITY: grocery_food to-go should be EXEMPT';

  -- fail-safe default: an unmapped category over-collects rather than under-remits. The TS half
  -- asserts the same fallback (`default: return true`).
  assert public.mms_taxable('something_new',  true ) = true,  'PARITY: unknown category must default TAXABLE';
  assert public.mms_taxable('something_new',  false) = true,  'PARITY: unknown category must default TAXABLE';
  assert public.mms_taxable(null,             true ) is not distinct from public.mms_taxable('hot_prepared', true),
    'PARITY: a NULL category must behave like the taxable default';
end $$;

-- ── 2 · mms_line_tax — the rounding table (the SAME integers as apps/qr/lib/tax.test.ts) ───────────
-- Every expected value is hand-computed against rate 0.0975 and duplicated in the TS half. The rows
-- marked DRIFT change if the rate is edited to 0.098 — a table built only from tie-priced fixtures
-- (200/600/1000/1400, which round identically under both rates) would stay GREEN through exactly the
-- drift this file exists to catch.
do $$
begin
  assert public.mms_line_tax(     0, 'hot_prepared', true) =     0, 'PARITY: 0c -> 0';
  assert public.mms_line_tax(     1, 'hot_prepared', true) =     0, 'PARITY: 1c -> 0 (the M6 root cause)';
  assert public.mms_line_tax(     5, 'hot_prepared', true) =     0, 'PARITY: 5c -> 0';
  assert public.mms_line_tax(     6, 'hot_prepared', true) =     1, 'PARITY: 6c -> 1 (smallest taxed amount)';
  assert public.mms_line_tax(   100, 'hot_prepared', true) =    10, 'PARITY: 100c -> 10';
  assert public.mms_line_tax(   200, 'hot_prepared', true) =    20, 'PARITY: 200c -> 20 (exact .5 tie)';
  assert public.mms_line_tax(   600, 'hot_prepared', true) =    59, 'PARITY: 600c -> 59 (tie)';
  assert public.mms_line_tax(  1000, 'hot_prepared', true) =    98, 'PARITY: 1000c -> 98 (tie)';
  assert public.mms_line_tax(  1400, 'hot_prepared', true) =   137, 'PARITY: 1400c -> 137 (tie)';
  assert public.mms_line_tax(  1250, 'hot_prepared', true) =   122, 'PARITY: 1250c -> 122  [DRIFT: 123 at 0.098]';
  assert public.mms_line_tax(  2000, 'hot_prepared', true) =   195, 'PARITY: 2000c -> 195  [DRIFT: 196 at 0.098]';
  assert public.mms_line_tax(  9999, 'hot_prepared', true) =   975, 'PARITY: 9999c -> 975  [DRIFT: 980 at 0.098]';
  assert public.mms_line_tax( 10000, 'hot_prepared', true) =   975, 'PARITY: 10000c -> 975 [DRIFT: 980 at 0.098]';
  assert public.mms_line_tax(123456, 'hot_prepared', true) = 12037, 'PARITY: 123456c -> 12037 [DRIFT: 12099 at 0.098]';

  -- exempt categories collect exactly 0 at every amount
  assert public.mms_line_tax(123456, 'grocery_food',  true ) = 0, 'PARITY: grocery_food must collect 0';
  assert public.mms_line_tax(123456, 'grocery_food',  false) = 0, 'PARITY: grocery_food must collect 0';
  assert public.mms_line_tax(123456, 'cold_food',     false) = 0, 'PARITY: cold_food to-go must collect 0';
  assert public.mms_line_tax(123456, 'beverage_cold', false) = 0, 'PARITY: beverage_cold to-go must collect 0';
end $$;

-- ── 3 · the rate constant, asserted independently of the value table ────────────────────────────────
-- A value table alone cannot distinguish "the rate changed" from "the rounding changed". This pins the
-- rate itself, from the SQL side, using an amount whose product is exact.
--
-- NOTE the asymmetry worth knowing: the SQL rate currently has NO charge consumer — every reader of
-- the per-line `tax_cents` this function writes treats it as a boolean `> 0` flag, so a SQL-ONLY rate
-- change moves zero charged amounts while a TS-only change moves every one of them. That is precisely
-- why the SQL side needs its own guard: nothing downstream would ever notice.
do $$
declare
  v_rate numeric;
begin
  -- 1,000,000c x 0.0975 = 97,500 exactly, so this reads the rate back with no rounding involved.
  v_rate := public.mms_line_tax(1000000, 'hot_prepared', true)::numeric / 1000000;
  assert v_rate = 0.0975, format('PARITY: SQL tax rate is %s, expected 0.0975 (Covina combined)', v_rate);
end $$;

-- ── 4 · rounding MODE, not just rounding results ───────────────────────────────────────────────────
-- Guards a numeric -> float8 regression, which a value table cannot see: float8 would still produce
-- the same integers for these inputs. `round(numeric)` is half-AWAY-from-zero; `round(double)` is
-- banker's rounding (half-to-even) in some builds. 19.5 -> 20 and 20.5 -> 21 together prove
-- half-away-from-zero; half-to-even would give 20 and 20 (both to the even neighbour).
do $$
begin
  assert round(19.5::numeric) = 20, 'PARITY: round(numeric) must be half-away-from-zero, got half-to-even';
  assert round(20.5::numeric) = 21, 'PARITY: round(numeric) must be half-away-from-zero, got half-to-even';
  -- T4 (known-open, PINNED not fixed): the negative side genuinely diverges from TS. SQL rounds a
  -- negative tie AWAY from zero (-19.5 -> -20); TS Math.round rounds it toward +inf (-19). Reachable
  -- because unit_price_cents carries no `>= 0` CHECK. See docs/OPEN-ITEMS.md T4 — when that is fixed,
  -- negative amounts should become unrepresentable rather than this assertion changing value.
  assert public.mms_line_tax(-200, 'hot_prepared', true) = -20,
    'T4 pin: SQL rounds a negative tie away from zero (TS gives -19)';
end $$;

rollback;
