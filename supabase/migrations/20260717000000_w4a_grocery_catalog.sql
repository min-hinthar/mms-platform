-- W4a — the grocery catalog grows up (PRODUCTION_PLAN §W4a).
-- Adds the browse/merchandising fields the 395-SKU import carries (category aisle, brand, internal
-- SKU; 395 sellable of 396 parsed — CT0403 has no price in any source list and is excluded)
-- SKU, pack size, romanization synonyms) and the pg_trgm fuzzy search the W4b Browse tab uses.
-- Additive + idempotent; no money column changes (price_cents/tax_category/ebt_eligible untouched).

create extension if not exists pg_trgm with schema extensions;

alter table public.grocery_items
  add column if not exists category text
    check (category is null or category in
      ('canned-fish','canned-vegetables','tea-laphet','coffee-drinks','noodles-mohinga',
       'snacks-sweets','preserved-fruit','cooking','health','home-personal')),
  add column if not exists brand text,
  add column if not exists sku text,
  add column if not exists size_qty numeric check (size_qty is null or size_qty > 0),
  add column if not exists size_unit text
    check (size_unit is null or size_unit in ('g','ml','oz','lb','ct')),
  add column if not exists synonyms text[] not null default '{}';

-- One catalog row per internal SKU (barcode stays the PK / scan key; `sku` is the wholesale code
-- the price lists key on — the import upserts through it).
create unique index if not exists grocery_items_sku_uniq
  on public.grocery_items (sku) where sku is not null;

-- Browse reads filter by aisle; search ranks by trigram similarity over both names.
create index if not exists grocery_items_category_idx
  on public.grocery_items (category) where category is not null;
create index if not exists grocery_items_name_trgm
  on public.grocery_items using gin (name extensions.gin_trgm_ops);
create index if not exists grocery_items_name_my_trgm
  on public.grocery_items using gin (name_my extensions.gin_trgm_ops);

-- W4b search: one bounded, rank-ordered lookup over name + name_my + synonyms.
-- ILIKE catches substring hits (incl. Myanmar script, where trigram support is weak for short
-- queries); trigram similarity catches romanization typos (laphet/lahpet, mohinga/mohingar) —
-- the synonyms array carries the variants as DATA, so new spellings are a row update, not code.
-- STABLE + explicit search_path; caller is the Zod-bounded server action via the service client
-- (the table's public-read RLS is unchanged, but the fn itself stays service-role-only, house rule).
create or replace function public.mms_grocery_search(p_q text)
returns table (
  barcode text, name text, name_my text, brand text, category text,
  size_qty numeric, size_unit text, price_cents int, ebt_eligible boolean, image_url text
)
language sql stable
set search_path = ''
as $$
  select g.barcode, g.name, g.name_my, g.brand, g.category,
         g.size_qty, g.size_unit, g.price_cents, g.ebt_eligible, g.image_url
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
