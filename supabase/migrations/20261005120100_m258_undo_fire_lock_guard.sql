-- 20261005120100_m258_undo_fire_lock_guard.sql — M258 (Phase 3c-ii · D29): `mms_undo_fire` refuses under a
-- FRESH pay lock or a FRESH split freeze, in the SQL's own idiom.
--
-- THE HOLE (D20, filed as M258). `mms_undo_fire` read open · dinein · fired · not comped · in-grace ·
-- batch — and never the cart's LOCK. The only lock check was the action's pre-read (`undoFire`,
-- lib/cart.ts → `assertCartMember`), so two devices could interleave: host A's undo passes the
-- action's check → guest B's create-intent takes the lock and reads ZERO drafts → A's RPC flips the
-- batch back to draft → B's charge mints over drafts the gate would have refused, and the kitchen
-- cooks dishes nobody paid for. The guard belongs in the statement, where the lock is.
--
-- THE PREDICATE is `mms_void_line`'s (20260622090000, B2) and `mms_counter_no_show`'s
-- (20261001000000): a fresh single-pay lock is `locked and locked_at > now() - 5 minutes`
-- (CART_LOCK_TTL_MS, lib/lock-ttl.ts; `lockedFresh` in lib/authz.ts), a fresh split freeze is
-- `settle_at > now() - 10 minutes` (SETTLE_TTL_MS; `settlingFresh`). The row's bare `c.locked = false`
-- is REJECTED: `locked` is sticky — `acquireCartLock` takes a STALE lock over rather than clearing it
-- and `assertCartMember` ignores one past its TTL — so an abandoned pay tab would block every later
-- undo and the action would say "That's already with the kitchen" over lines the kitchen never saw
-- (W17's rule: a refusal must not over-block the legitimate case; case M2 of the test is that case).
--
-- THE RESIDUAL, stated (owner question 1, default taken: no row lock). The UPDATE's `from qr_carts c`
-- reads its SNAPSHOT and locks nothing, so a lock that COMMITS after this statement's snapshot is
-- invisible to it — a window exactly one statement wide, the shape 20260929000000's header describes
-- for a predicate without a row lock. The counter twin (`mms_undo_counter_fire`) takes
-- `perform 1 from public.qr_carts where id = p_cart_id for update` first for exactly this reason;
-- upgrading this function to that lock (cart → line, the order every settlement uses) is the
-- recommended follow-up and keeps 20260929000000's "fires never lock the cart" prose in need of
-- restating. Whichever side wins the one-statement race, the charge equals the cart and nothing is
-- cooked as paid without a send (the create-intent gate re-reads drafts after its lock).
--
-- The body is 20260624030000_s4_money_remediation.sql's (the LATEST definition) restated IN FULL with
-- the two conjuncts added after `c.status = 'open'`; same signature (the `(uuid)` overload was
-- dropped there; database.types.ts is unchanged); revoke/grant restated because `create or replace`
-- keeps the row's ACL but a reader of this file must see the grant the function runs under.
-- Applied ONE FILE AT A TIME via the Supabase MCP, never `db push` (CLAUDE.md: the prod history is
-- divergent). Pinned by supabase/tests/m258_undo_fire_lock_guard_test.sql and falsified case by case in
-- scripts/verify-mode-authority.mjs (suite `p3c2`); staff_fire_undo_test.sql cases 1–7 stay green.

create or replace function public.mms_undo_fire(p_cart_id uuid, p_batch uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null, fire_batch = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and not (c.locked and c.locked_at > now() - interval '5 minutes')   -- M258: a FRESH pay lock refuses
      and (c.settle_at is null or c.settle_at <= now() - interval '10 minutes')   -- M258: a FRESH split freeze refuses
      and s.mode = 'dinein'
      and ci.state = 'fired'
      and not ci.comped                -- a comped line is a committed loss; undo must skip it (S2-audit S4)
      and ci.fire_at > now()           -- still in grace; the kitchen has NOT pulled it (else removal → void)
      and ci.fire_batch = p_batch;     -- ONLY this send's batch (the UI's Undo corresponds to one send)
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mms_undo_fire(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mms_undo_fire(uuid, uuid) to service_role;
