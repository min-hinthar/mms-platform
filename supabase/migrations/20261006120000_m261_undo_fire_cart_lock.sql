-- 20261006120000_m261_undo_fire_cart_lock.sql — M261 (3c-ii owner question 1, delegated 2026-10-06):
-- `mms_undo_fire` takes the CART ROW LOCK before it decides, as its counter twin does.
--
-- THE RESIDUAL 20261005120100 STATED. M258 put the two freshness legs (a fresh pay lock, a fresh split
-- freeze) into the UPDATE's predicate — but `from public.qr_carts c` READS a snapshot and locks nothing,
-- so a lock that commits after that snapshot is invisible to the statement: host A's undo can still flip
-- the batch back in the one-statement window after guest B's create-intent took the lock and read zero
-- drafts. `mms_undo_counter_fire` (20261001000000) opens with this exact line for exactly this reason.
--
-- THE MECHANISM. The lock CONFLICTS with every write that changes what the predicate reads — the pay
-- lock's `UPDATE qr_carts SET locked …` (`acquireCartLock`, lib/lock.ts) and every settlement claim's
-- `UPDATE qr_carts SET settle_at …` — so the two orders are total:
--   · the claim committed first → our lock waits for it; the UPDATE after it is a NEW statement with a
--     NEW snapshot (READ COMMITTED), sees the fresh lock and reverses nothing (M258's legs);
--   · we locked first → the claim waits until our un-fire has COMMITTED, and create-intent's drafts read
--     (a later statement) sees the drafts and refuses the charge.
-- `for update`, byte for byte the counter twin's (one idiom for both undos). The cost: a tablemate's add
-- on the same table (the line RPCs' P2cy `for share`, and any FK check's `for key share`) waits for one
-- undo's commit — milliseconds, inside a ten-second window. `for share` would also order these and is
-- the lighter choice; parity won.
--
-- LOCK ORDER is cart → line, the order every settlement function uses. This AMENDS the sentence in
-- 20260929000000_p2dd_p2cy_line_guards.sql's header that `mms_undo_fire` "write[s] lines only and never
-- lock[s] the cart": it now locks the cart FIRST, which keeps that file's deadlock argument whole — no
-- function locks a line and then the cart (`mms_line_transition` / `mms_bump_ticket` / the fires lock
-- lines only; a pattern scan of the latest definition of all 81 dollar-quoted functions in the migrations on
-- 2026-10-06 found ten that lock or write both tables, all ten cart-first — a scan, not a proof), so a
-- bump waiting on our line lock finishes without ever wanting the cart we hold. That file is NOT edited:
-- it is the record of what ran.
--
-- J37 needs NO change here: un-fire already clears `fire_batch`, so "no line on the cart still carries the
-- batch" IS "an earlier undo of it landed" — the diagnosis `lib/undo-miss.ts` reads after a 0-row answer,
-- for the diner and the console alike. The integer contract is unchanged ON PURPOSE: a sentinel would be
-- misread by whichever app build is live during the apply (`staffUndoFire`'s `if (!unfired)`).
--
-- The body is 20261005120100's restated IN FULL with the one `perform` line added; same signature, same
-- return type; revoke/grant restated (`create or replace` keeps the ACL, but a reader must see the grant).
-- DEPLOY ORDER: none — no build calls anything new and every build reads the same integer. Applied ONE
-- FILE via the Supabase MCP after review, never `db push` (CLAUDE.md: prod history is divergent). Pinned by
-- supabase/tests/m261_undo_fire_cart_lock_test.sql and m258_undo_fire_lock_guard_test.sql (which now runs
-- against this body); falsified in scripts/verify-mode-authority.mjs (suite `m261`; M258's seven mutants
-- now patch THIS file and are still judged by `p3c2`). M261.1 proves the lock is TAKEN; its ORDER against a
-- concurrent claim needs two sessions and is OPEN-ITEMS P2fj's to prove.

create or replace function public.mms_undo_fire(p_cart_id uuid, p_batch uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  perform 1 from public.qr_carts where id = p_cart_id for update;   -- M261: the cart row first (cart → line), as mms_undo_counter_fire
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null, fire_batch = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and not (c.locked and c.locked_at is not null and c.locked_at > now() - interval '5 minutes')   -- M258: a FRESH pay lock refuses (a NULL stamp is not fresh — three-valued logic)
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
