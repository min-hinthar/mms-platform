-- 20260621160000_table_merge.sql
-- S1.4 (soft convergence). The ORDER-MODEL convergence is SOFT/advisory: phones, the staff POS, and the
-- kiosk all write the same table session, the floor shows table state, and the recovery for the occasional
-- double-order (a guest scans AND tells the server) is a ONE-TAP MERGE of two table orders — a 5-second
-- cleanup, not a billing dispute. This adds the atomic server-side merge primitive.
--
-- No new tables/columns (no money columns change) — one SECURITY DEFINER function. Re-runnable
-- (create or replace + idempotent grant lockdown).

-- ── mms_merge_table_orders — fold one open cart's lines into another, then close the source table ──────
-- Moves every line from the SOURCE open cart into the TARGET open cart, then cancels the source cart and
-- closes its session (turnover — the diner-side guards already honor both flips: a cancelled cart + a
-- closed session fail is_member / the mutation guards, so a racing source-diner write lands on a closed
-- door). Money stays server-authoritative WITHOUT re-pricing: the lines being moved were already priced
-- server-side at add-time (unit_price_cents / tax_cents are stored snapshots), so a merge is a pure
-- re-parent — it never trusts or recomputes a client amount. Tax is re-derived at settle by the single TS
-- engine (lib/totals.ts: taxable lines × the flat rate on the discounted base), NOT summed from the stored
-- tax_cents, so the line's MODE (dine-in vs to-go) must stay consistent with how the target settles — the
-- caller (lib/floor.ts mergeTables, after requireStaff) enforces a same-mode merge for exactly that reason.
-- The caller also refuses a merge when either cart carries a promo_code (the discount is per-cart and can't
-- carry cleanly across a session close), so the merge never silently swings what a guest pays.
--
-- Merge rule per source line: bump an IDENTICAL target line (same menu_item_id + same normalized,
-- order-independent modifier set) when the combined qty stays within the app's 99-per-line invariant;
-- otherwise re-parent the source line as its own line — NEVER silently drop units (the column CHECK is only
-- qty>0, but the steppers/Zod/inc-RPC all cap at 99, so we preserve that ceiling without losing items).
-- Moved lines lose seat attribution (by_seat = null): a source seat doesn't exist in the target session.
-- Returns the number of UNITS moved (for the staff success toast). Atomic: both carts are row-locked and
-- must still be 'open', so a concurrent settle/clear loses the race cleanly instead of merging into a
-- paid/cancelled cart.
create or replace function mms_merge_table_orders(p_source_cart uuid, p_target_cart uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_session uuid;
  v_moved integer := 0;
  r record;
  v_match uuid;
  v_match_qty integer;
begin
  if p_source_cart = p_target_cart then
    raise exception 'merge requires two different carts';
  end if;

  -- Row-lock both carts and require BOTH still open (orders by id to avoid a deadlock with a concurrent
  -- merge of the same pair in the other direction).
  perform 1 from public.qr_carts where id in (p_source_cart, p_target_cart) and status = 'open'
    order by id for update;
  if (select count(*) from public.qr_carts
        where id in (p_source_cart, p_target_cart) and status = 'open') <> 2 then
    raise exception 'both carts must be open to merge (source=% target=%)', p_source_cart, p_target_cart;
  end if;

  select session_id into v_src_session from public.qr_carts where id = p_source_cart;

  for r in
    select id, menu_item_id, qty,
           coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(modifiers) e),
                    '[]'::jsonb) as modkey
    from public.qr_cart_items where cart_id = p_source_cart
  loop
    select t.id, t.qty into v_match, v_match_qty
    from public.qr_cart_items t
    where t.cart_id = p_target_cart
      and t.menu_item_id = r.menu_item_id
      and coalesce((select jsonb_agg(e order by e) from jsonb_array_elements_text(t.modifiers) e),
                   '[]'::jsonb) = r.modkey
    limit 1;

    if v_match is not null and v_match_qty + r.qty <= 99 then
      update public.qr_cart_items set qty = v_match_qty + r.qty where id = v_match;
      delete from public.qr_cart_items where id = r.id;
    else
      -- No identical target line (or the merge would exceed the 99 cap) → re-parent as its own line.
      update public.qr_cart_items set cart_id = p_target_cart, by_seat = null where id = r.id;
    end if;
    v_moved := v_moved + r.qty;
  end loop;

  -- Bump the target so floor/realtime peers re-sync; cancel the now-empty source cart + close its session.
  update public.qr_carts set updated_at = now() where id = p_target_cart;
  update public.qr_carts set status = 'cancelled' where id = p_source_cart;
  update public.table_sessions set status = 'closed' where id = v_src_session and status <> 'closed';

  return v_moved;
end; $$;

-- SECURITY DEFINER lockdown (parity with the other mms_* fns): never callable by anon/authenticated.
-- Postgres grants EXECUTE to PUBLIC and hosted Supabase ALSO grants anon+authenticated by name, so revoke
-- all three explicitly, then grant only service_role (the mergeTables server action, after requireStaff).
revoke all on function mms_merge_table_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function mms_merge_table_orders(uuid, uuid) to service_role;
