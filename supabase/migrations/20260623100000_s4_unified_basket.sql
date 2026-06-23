-- 20260623100000_s4_unified_basket.sql — S4.1: the unified-basket spine. docs/S4_DESIGN.md.
-- One cart, lines routed by a per-line fulfillment tag (dinein | togo | grocery). The tag SUPERSEDES the
-- session mode for routing AND for tax: cold food/beverage is taxable only DINE-IN (CDTFA Reg 1603), so a
-- to-go cold line is exempt while a dine-in one is taxable. Set on add; recomputed when a food line toggles
-- for-here↔to-go. Grocery is auto-tagged + never guest-flippable. Fire routing is S4.2 (this slice only
-- records + taxes + groups). Additive + idempotent.

-- ── Per-line fulfillment tag ────────────────────────────────────────────────────────────────────────────
alter table public.qr_cart_items
  add column if not exists fulfillment text not null default 'dinein'
    check (fulfillment in ('dinein','togo','grocery'));

-- Backfill existing rows so the stored tax_cents stays consistent: a barcode menu_item_id (not uuid-shaped)
-- is grocery; otherwise by the session mode (dinein→dinein keeps dineIn=true matching the stored tax;
-- non-dinein→togo keeps dineIn=false, also matching). Near-zero live data, but correct regardless.
update public.qr_cart_items ci set fulfillment = case
    when ci.menu_item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'grocery'
    when s.mode = 'dinein' then 'dinein'
    else 'togo' end
  from public.qr_carts c
  join public.table_sessions s on s.id = c.session_id
  where ci.cart_id = c.id;

-- ── Extend the status-atomic insert with the tag (drop+recreate — signature change). Only caller is
-- insertOrIncLine (food adds); grocery scanAdd does a plain insert that sets fulfillment directly. ────────
drop function if exists public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid);
create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid, p_menu_item_id uuid, p_name text, p_modifiers jsonb,
  p_unit_price_cents integer, p_tax_cents integer, p_by_seat uuid, p_fulfillment text
) returns uuid
  language sql set search_path = '' as $$
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat, fulfillment)
  select p_cart_id, p_menu_item_id, p_name, 1, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat,
         p_fulfillment
  from public.qr_carts
  where id = p_cart_id and status = 'open'
  returning id;
$$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid, text)
  from anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, uuid, text, jsonb, integer, integer, uuid, text)
  to service_role;

-- ── mms_set_line_fulfillment: a food line's for-here↔to-go toggle. Re-derives state (open cart, DRAFT
-- line, FOOD only — grocery routing + exemption are fixed) and RECOMPUTES tax_cents from the line's
-- category + the new fulfillment (cold food flips taxability; hot stays taxable). Never changes price. ────
create or replace function public.mms_set_line_fulfillment(p_line uuid, p_fulfillment text) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_cur text; v_mid text; v_price integer; v_cat text;
begin
  if p_fulfillment not in ('dinein','togo') then return 'bad_fulfillment'; end if;
  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents
    into v_cart, v_status, v_state, v_cur, v_mid, v_price
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- can't re-route a line the kitchen has
  if v_cur = 'grocery' then return 'is_grocery'; end if;   -- grocery routing + exemption are fixed
  -- Per-line tax from the food item's category + the new fulfillment (the taxable-base flag getCartTotals
  -- reads). menu_item_id is a uuid for food (grocery is filtered out above).
  select tax_category into v_cat from public.menu_items where id = v_mid::uuid;
  update public.qr_cart_items
    set fulfillment = p_fulfillment,
        tax_cents = public.mms_line_tax(v_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')
    where id = p_line;
  return 'ok';
end $$;
revoke all on function public.mms_set_line_fulfillment(uuid, text) from public, anon, authenticated;
grant execute on function public.mms_set_line_fulfillment(uuid, text) to service_role;
