-- W4e — compare-at (market reference) price for the grocery Sale layer.
-- The CHARGED price stays `price_cents` (the 2021-22 selling price the store honors); the new
-- `compare_at_cents` is the HIGHER competitor/market reference rendered struck-through as
-- "Compare at $X". It is DB-enforced to be a REAL discount (strictly above the selling price), so a
-- "sale" can never be fabricated as <= what we charge. It is a merchandising value derived from
-- sampled competitor prices (docs/GROCERY_MARKET_PLAN.md §pricing), NOT a former price of our own —
-- hence the "Compare at" (market-comparison) framing, which is the FTC-defensible construction.
-- Additive + idempotent; the charged/tax/EBT columns are untouched.

alter table public.grocery_items
  add column if not exists compare_at_cents int
    check (compare_at_cents is null or compare_at_cents > price_cents);

-- Search must surface the compare-at so a hit row can show the same Sale treatment as a browse card.
-- RETURNS TABLE gains a column → drop + recreate (CREATE OR REPLACE can't change the return type),
-- then re-assert the service-role-only grants.
drop function if exists public.mms_grocery_search(text);

create function public.mms_grocery_search(p_q text)
returns table (
  barcode text, name text, name_my text, brand text, category text,
  size_qty numeric, size_unit text, price_cents int, compare_at_cents int,
  ebt_eligible boolean, image_url text
)
language sql stable
set search_path = ''
as $$
  select g.barcode, g.name, g.name_my, g.brand, g.category,
         g.size_qty, g.size_unit, g.price_cents, g.compare_at_cents, g.ebt_eligible, g.image_url
  from public.grocery_items g
  where g.available and not g.weighed
    and (
      g.name ilike '%' || p_q || '%'
      or g.name_my ilike '%' || p_q || '%'
      or exists (select 1 from unnest(g.synonyms) s where s ilike '%' || p_q || '%')
      or extensions.similarity(g.name, p_q) > 0.25
    )
  order by greatest(
      extensions.similarity(g.name, p_q),
      coalesce(extensions.similarity(g.name_my, p_q), 0),
      case when g.name ilike '%' || p_q || '%' or g.name_my ilike '%' || p_q || '%' then 0.9 else 0 end,
      case when exists (select 1 from unnest(g.synonyms) s where s ilike '%' || p_q || '%') then 0.8 else 0 end
    ) desc,
    g.name asc
  limit 20;
$$;

revoke all on function public.mms_grocery_search(text) from public, anon, authenticated;
grant execute on function public.mms_grocery_search(text) to service_role;
