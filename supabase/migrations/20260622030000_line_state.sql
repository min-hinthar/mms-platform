-- 20260622030000_line_state.sql — S2.1a: line-state spine.
--
-- Adds the PRE-SETTLEMENT line lifecycle (draft→fired→in_progress→served, +voided) to qr_cart_items —
-- the open cart IS the table order until settle, so the kitchen-life of each line lives here, not on
-- qr_orders (S2_DESIGN spine #1). Plus the atomic, legal-edge-guarded transition RPC that the fire/bump
-- (S2.1b), undo (S2.2), and void (S2.3) paths all drive.
--
-- Pure spine: there is NO firing path yet, so every line stays 'draft' until S2.1b wires fire. Backfill
-- of existing rows = 'draft' is correct (nothing fired pre-S2).

-- ── state column ──────────────────────────────────────────────────────────────────────────────────────
-- default 'draft' backfills every existing line; the CHECK is the DB-side guard mirroring the TS LineState
-- union (S2_DESIGN: bound inputs at the DB, not just the client).
alter table public.qr_cart_items
  add column if not exists state text not null default 'draft'
    check (state in ('draft','fired','in_progress','served','voided'));

-- ── mms_line_transition(line, to_state) — atomic, legal-edge-only, cart-open-guarded ────────────────────
-- The legal transition GRAPH lives in SQL (S2_DESIGN A2), not just the client:
--   draft        → fired | voided
--   fired        → in_progress | served | draft (undo within grace, S2.2) | voided
--   in_progress  → served | voided
--   served       → voided                         (a served line can still be voided/comped — gated S2.3)
--   voided       → ∅ (terminal)
-- Atomicity (A1): the single UPDATE matches only when the row is in a LEGAL from-state for p_to AND the
-- parent cart is 'open' (A3 — never fire into a paid/cancelled cart). Any illegal jump, terminal-state
-- mutation, or non-open cart → 0 rows (the caller treats 0 as "no transition" and raises / no-ops). A
-- same-state repeat is also 0 (not a legal edge) — so a double-fire / double-bump is a safe no-op.
-- Returns the affected row count (0 or 1). INVOKER + service-role-only (the cart-RPC precedent — the only
-- caller is the service-role staff action; DEFINER would only widen the surface, advisor 0029).
create function mms_line_transition(p_line uuid, p_to text) returns integer
  language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_to not in ('draft','fired','in_progress','served','voided') then
    raise exception 'illegal target line state %', p_to;
  end if;
  update public.qr_cart_items ci set state = p_to
    from public.qr_carts c
    where ci.id = p_line and c.id = ci.cart_id and c.status = 'open'
      and (
        (p_to = 'fired'       and ci.state = 'draft') or
        (p_to = 'in_progress' and ci.state = 'fired') or
        (p_to = 'served'      and ci.state in ('fired','in_progress')) or
        (p_to = 'draft'       and ci.state = 'fired') or
        (p_to = 'voided'      and ci.state in ('draft','fired','in_progress','served'))
      );
  get diagnostics n = row_count;
  return n;
end $$;

-- EXECUTE lockdown (mirror the cart-RPC pattern, 20260619000200): Postgres grants PUBLIC and Supabase
-- also grants anon+authenticated by name, so revoke all three, then grant only the service-role caller.
revoke all on function public.mms_line_transition(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_line_transition(uuid, text) to service_role;
