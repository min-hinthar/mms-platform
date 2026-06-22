-- 20260622050000_undo_grace.sql — S2.2: the server-clocked undo grace.
--
-- The fire model the design mandates (S2_DESIGN B3): a "send" stamps fire_at = now() + GRACE, not bare
-- now(). The line is 'fired' IMMEDIATELY (visible + honest on the diner cart — "Sent to kitchen", stepper
-- gone), but the KDS already reads only `state IN ('fired','in_progress') AND fire_at <= now()` (S2.1b),
-- so a just-sent line stays INVISIBLE to the kitchen until its grace expires. "Undo" within the grace is
-- therefore a clean batch fired→draft the kitchen never saw — no waste, no double-fire. Once fire_at
-- passes, the kitchen has pulled the ticket and undo is gone (removal then routes through a void, S2.3).
--
-- GRACE = 10s, per send-batch (Min's S2 decision; ORDER-MODEL default is 5s). One "Sent! — Undo" window
-- per fire action, SERVER-clocked (the client countdown is advisory; mms_undo_fire re-checks fire_at).
-- This migration only (1) redefines mms_fire_cart to stamp the grace and (2) adds the grace-gated undo.

-- ── mms_fire_cart — now stamps the grace deadline ───────────────────────────────────────────────────────
-- Identical to 20260622040000 except `fire_at = now() + interval '10 seconds'`. Still ONE atomic
-- statement, dine-in only, cart-open guarded, draft→fired only (A2/A3/A5 unchanged; a re-send is still a
-- clean no-op). create-or-replace preserves the existing ACL; the revoke/grant below re-asserts it.
create or replace function mms_fire_cart(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now() + interval '10 seconds'  -- the undo grace (S2.2)
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mms_fire_cart(uuid) from public, anon, authenticated;
grant execute on function public.mms_fire_cart(uuid) to service_role;

-- ── mms_undo_fire(cart) — reverse the just-sent batch WHILE still in grace ───────────────────────────────
-- The symmetric inverse of mms_fire_cart: fired→draft + fire_at=null for every line on the cart still in
-- its grace window (fire_at > now()), guarded the same way (cart 'open' AND session dine-in). It only
-- touches in-grace lines, so:
--   • a line whose grace already PASSED (the kitchen has the ticket) is left fired — the undo is a no-op
--     for it, and removal must route to a void (S2.3), never a silent fired→draft. This is exactly why
--     undo is NOT the generic mms_line_transition (whose fired→draft edge is grace-agnostic): the grace
--     gate (`ci.fire_at > now()`) is the load-bearing guard that keeps undo from un-sending cooked food.
--   • lines fired in an EARLIER (already-elapsed) batch keep their fire_at < now() → untouched.
-- Atomic (one statement); returns the number of lines un-fired (0 = grace passed / nothing to undo).
-- INVOKER + service-role-only (the cart-RPC precedent; the only caller is the service-role undo action).
create function mms_undo_fire(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'draft', fire_at = null
    from public.qr_carts c
    join public.table_sessions s on s.id = c.session_id
    where ci.cart_id = p_cart_id
      and c.id = ci.cart_id
      and c.status = 'open'
      and s.mode = 'dinein'
      and ci.state = 'fired'
      and ci.fire_at > now();   -- still in grace; the kitchen has NOT pulled it
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.mms_undo_fire(uuid) from public, anon, authenticated;
grant execute on function public.mms_undo_fire(uuid) to service_role;
