-- W16a — the owner's money reset (2026-08-15): the 5% service charge is RETIRED; prices are now
-- MODE-DERIVED in TS (lib/mode-price.ts — dine-in = round25(base×1.15), take-out =
-- round25(base×1.05), grocery untouched), and the sales-tax rate is the owner-confirmed 10.5%
-- (L.A). SQL's share of that:
--   1) mms_tax_rate() → 0.105 (the mms_line_tax mirror reads it; parity pinned from both sides —
--      lib/tax.test.ts + supabase/tests/tax_parity_test.sql).
--   2) mms_set_line_fulfillment re-signed (+p_unit_price_cents default null): the dinein↔togo
--      toggle now RE-PRICES the line. The price itself is computed in TS (ONE pricing engine —
--      the caller re-derives via priceItem, or factor-rescales when a legacy line's option ids
--      can't be resolved) and written here under the same in-statement open+draft+food guards.
--      p_unit_price_cents null keeps the old tax-only behavior (deploy-order safety for an
--      in-flight old caller during the deploy window). The REVERSE window (new app before this
--      migration) fails CLOSED: PostgREST can't match the 3-arg call (PGRST202), so every toggle
--      returns an honest error until this applies — apply promptly on merge to keep it short.
-- No fulfill-RPC changes: service_charge_cents params keep their contract and now carry 0 for new
-- orders; historical rows keep their real stored values.

-- ── 1) the tax rate (restated from the init baseline — signature/flags identical) ────────────────
create or replace function public.mms_tax_rate() returns numeric language sql immutable
set search_path = '' as $$
  select 0.105::numeric;  -- L.A combined rate, owner-confirmed W16a (closes C13); + lib/tax.ts
$$;

-- ── 2) mms_set_line_fulfillment re-signed: + p_unit_price_cents ──────────────────────────────────
-- Restated from the 20260623100000 (s4_unified_basket) baseline. Both signatures dropped so the
-- migration is re-runnable.
drop function if exists public.mms_set_line_fulfillment(uuid, text);
drop function if exists public.mms_set_line_fulfillment(uuid, text, integer);
create function public.mms_set_line_fulfillment(
  p_line uuid,
  p_fulfillment text,
  p_unit_price_cents integer default null
) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_cart uuid; v_status text; v_state text; v_cur text; v_mid text; v_price integer; v_cat text;
        v_new_price integer;
begin
  if p_fulfillment not in ('dinein','togo') then return 'bad_fulfillment'; end if;
  -- Bound the server-derived price (belt: the caller is service-role TS, never the client, but a
  -- corrupted value must not become a charged amount). Null = legacy tax-only behavior. The 25¢
  -- floor is belt-only against today's catalog (min base $2.00, no negative deltas): a genuinely
  -- sub-25¢ food line would refuse its toggle with 'bad_price' — if a ~$0 item is ever added,
  -- widen this to allow 0 explicitly rather than relaxing the floor.
  if p_unit_price_cents is not null and (p_unit_price_cents < 25 or p_unit_price_cents > 500000) then
    return 'bad_price';
  end if;
  select ci.cart_id, c.status, ci.state, ci.fulfillment, ci.menu_item_id, ci.unit_price_cents
    into v_cart, v_status, v_state, v_cur, v_mid, v_price
    from public.qr_cart_items ci
    join public.qr_carts c on c.id = ci.cart_id
    where ci.id = p_line;
  if v_cart is null then return 'not_found'; end if;
  if v_status <> 'open' then return 'not_open'; end if;
  if v_state <> 'draft' then return 'not_draft'; end if;   -- can't re-route a line the kitchen has
  if v_cur = 'grocery' then return 'is_grocery'; end if;   -- grocery routing + exemption are fixed
  if v_cur = p_fulfillment then return 'ok'; end if;       -- no-op flip: never rewrite the price
  v_new_price := coalesce(p_unit_price_cents, v_price);
  -- Per-line tax from the food item's category + the new fulfillment, on the NEW price (the
  -- taxable-base flag getCartTotals reads). menu_item_id is a uuid for food (grocery filtered out).
  select tax_category into v_cat from public.menu_items where id = v_mid::uuid;
  -- Re-assert open + draft + food IN THE WRITE (not just the if-checks above): a concurrent
  -- mms_fire_cart (draft→fired) or webhook open→paid flip landing between the SELECT and this
  -- UPDATE must NOT re-route + re-price a line the kitchen/payment already owns.
  update public.qr_cart_items ci
    set fulfillment = p_fulfillment,
        unit_price_cents = v_new_price,
        tax_cents = public.mms_line_tax(v_new_price, coalesce(v_cat, 'hot_prepared'), p_fulfillment = 'dinein')
    where ci.id = p_line
      and ci.state = 'draft'
      and ci.fulfillment <> 'grocery'
      and exists (select 1 from public.qr_carts c where c.id = ci.cart_id and c.status = 'open');
  if not found then return 'stale'; end if;   -- raced a fire / pay between the read and the write
  return 'ok';
end $$;
revoke all on function public.mms_set_line_fulfillment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mms_set_line_fulfillment(uuid, text, integer) to service_role;
