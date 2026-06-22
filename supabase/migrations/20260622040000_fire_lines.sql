-- 20260622040000_fire_lines.sql — S2.1b: the fire mechanism + the KDS read.
--
-- Builds on the S2.1a spine (state column + mms_line_transition). Adds the ONE unified fire timer the
-- design mandates (S2_DESIGN spine #3): a per-line `fire_at` on qr_cart_items. Dine-in stamps it `now()`
-- on send (immediate fire); pickup's scheduled fire (cart-level `fire_at = slot − prep`) lands per-line in
-- S4.2. The KDS reads ONE queue: `state IN ('fired','in_progress') AND fire_at <= now()`.
--
-- Bump (fired→in_progress→served) reuses the shipped mms_line_transition — no new RPC. This migration adds
-- only the column, its KDS index, and the fire RPC.

-- ── per-line fire timer ─────────────────────────────────────────────────────────────────────────────────
-- Nullable: a 'draft' line has no fire time yet. Set atomically with the draft→fired transition (below);
-- the S2.2 undo-grace model will stamp `now() + grace` here instead of bare `now()`.
alter table public.qr_cart_items add column if not exists fire_at timestamptz;

-- The KDS hot-path index: the queue reads live kitchen lines ordered by when they fired. Partial (only
-- fired/in_progress rows) so it stays tiny — draft/served/voided lines never sit in it.
create index if not exists qr_cart_items_kds_idx
  on public.qr_cart_items (fire_at)
  where state in ('fired', 'in_progress');

-- ── mms_fire_cart(cart) — send the cart's draft batch to the kitchen (dine-in immediate) ────────────────
-- ONE atomic statement: draft→fired + fire_at=now() for every still-draft line on the cart, but ONLY when
-- the parent cart is 'open' AND the session is dine-in. This is the single guard that satisfies three
-- design threats at once:
--   • A3 (fire after settle / cancelled cart): the `c.status='open'` join — a paid/cancelled cart fires 0.
--   • A5 (grocery must NOT fire): `s.mode='dinein'` excludes scan&go (`scango`) — grocery locks at payment,
--     never fires (ORDER-MODEL). It also excludes `pickup`, whose fire is SCHEDULED (slot−prep), not on a
--     diner "send" — pickup per-line firing is the S4.2 seam.
--   • A2 (illegal edge): only `ci.state='draft'` rows move — a re-send after firing is a clean no-op (an
--     already-fired / in-progress / served line is untouched), so a double-tap never double-fires.
-- Returns the number of lines fired (0 = nothing to fire / cart not open / not dine-in). INVOKER +
-- service-role-only (the cart-RPC precedent; the only callers are the service-role fire actions).
create function mms_fire_cart(p_cart_id uuid) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.qr_cart_items ci
    set state = 'fired', fire_at = now()
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
