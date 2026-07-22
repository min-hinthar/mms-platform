-- W5c — menu item depth: bilingual catalog columns + a real quantity path for the item sheet.
--
-- 1) `menu_items.description_my`, `modifier_groups.name_my`, `modifier_options.name_my` — the bilingual
--    depth the sheet renders (F6 is name-deep today: names are bilingual, everything else is EN-only).
--    All nullable + additive: absent Burmese simply doesn't render; no read path changes shape.
-- 2) The two cart-line write RPCs gain a bounded quantity so the sheet's pre-add qty stepper lands
--    "2 × Mohinga" as ONE write instead of N racing round-trips. Same money rule as ever: the server
--    prices a UNIT (priceItem) and qty only multiplies it downstream (getCartTotals). The column-level
--    backstop already exists — `qr_cart_items_qty_range CHECK (qty between 1 and 99)` (20260619000100)
--    bounds EVERY write path, so no new constraint is needed here.
--
-- Idempotent + guarded throughout; additive only (no destructive DDL).
-- ⚠️ Deploy order: apply this migration to live BEFORE the app deploy that carries the new
-- `p_by`/`p_qty` call sites (the TS only sends them for qty>1, so old-DB/new-code survives a plain
-- add — but a sheet qty>1 add would PGRST202 until this lands). New-DB/old-code is fully safe
-- (both params are trailing defaults).

alter table public.menu_items add column if not exists description_my text;
alter table public.modifier_groups add column if not exists name_my text;
alter table public.modifier_options add column if not exists name_my text;

-- ── mms_cart_item_inc_qty — bump by a bounded amount (default 1) ────────────────────────────────────
-- Signature change (new trailing `p_by` with a default) ⇒ drop + recreate: a defaulted param is a NEW
-- overload, and keeping the old (uuid) signature alongside would make PostgREST rpc resolution
-- ambiguous for `{p_id}`-only callers (AddButton "+", grocery scan). Both dropped for idempotent re-apply.
-- Semantics preserved from 20260622090000: comped lines immutable, silent no-op AT the cap, RAISE only
-- when the cart is closed/gone. `least(..., 99)` makes an over-cap bump a partial fill (95 + 9 → 99),
-- matching the old "never exceed 99, never error for it" behavior.
drop function if exists public.mms_cart_item_inc_qty(uuid);
drop function if exists public.mms_cart_item_inc_qty(uuid, integer);
create function public.mms_cart_item_inc_qty(p_id uuid, p_by integer default 1) returns void
  language plpgsql set search_path = '' as $$
declare v_open boolean;
begin
  -- Bound the bump IN the statement (doctrine: the guard lives in SQL, not just the caller's Zod).
  if p_by is null or p_by < 1 or p_by > 99 then
    raise exception 'invalid quantity' using errcode = 'P0001';
  end if;
  update public.qr_cart_items ci
    set qty = least(ci.qty + p_by, 99)
    from public.qr_carts c
    where ci.id = p_id and c.id = ci.cart_id and c.status = 'open' and ci.qty < 99 and not ci.comped;
  if not found then
    -- 0 rows: cart closed/gone, OR open-but-at-the-99-cap, OR the line is comped (immutable). Only the
    -- closed-cart case signals; a capped or comped line is an intentional silent no-op.
    select (c.status = 'open') into v_open
      from public.qr_cart_items ci
      join public.qr_carts c on c.id = ci.cart_id
      where ci.id = p_id;
    if v_open is distinct from true then
      raise exception 'cart is no longer open' using errcode = 'P0001';
    end if;
  end if;
end $$;
revoke all on function public.mms_cart_item_inc_qty(uuid, integer) from public, anon, authenticated;
grant execute on function public.mms_cart_item_inc_qty(uuid, integer) to service_role;

-- ── mms_cart_item_insert_if_open — insert with a bounded quantity (default 1) ───────────────────────
-- Same drop-both-signatures dance as W3's p_notes addition (a defaulted param = a new overload).
-- The qty bound rides in the WHERE: an out-of-range p_qty inserts nothing and returns null, which the
-- TS caller already treats as a refused write (fail-closed, same as a closed cart).
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text);
drop function if exists public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer);
create function public.mms_cart_item_insert_if_open(
  p_cart_id uuid,
  p_menu_item_id text,
  p_name text,
  p_modifiers jsonb,
  p_unit_price_cents integer,
  p_tax_cents integer,
  p_by_seat uuid,
  p_fulfillment text,
  p_notes text default null,
  p_qty integer default 1
) returns uuid
  language sql set search_path = '' as $$
  insert into public.qr_cart_items
    (cart_id, menu_item_id, name, qty, modifiers, unit_price_cents, tax_cents, by_seat, fulfillment, notes)
  select p_cart_id, p_menu_item_id, p_name, p_qty, p_modifiers, p_unit_price_cents, p_tax_cents, p_by_seat,
         p_fulfillment, p_notes
  from public.qr_carts
  where id = p_cart_id and status = 'open' and p_qty between 1 and 99
  returning id;
$$;
revoke all on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.mms_cart_item_insert_if_open(uuid, text, text, jsonb, integer, integer, uuid, text, text, integer)
  to service_role;
