-- 20260731000000_w9d_featured_deal.sql — W9d: an honest "Save %" badge.
--
-- THE PROBLEM (measured, not assumed): the loud sale pill was gated on `pct >= 15`, and **306 of the
-- 396 catalogued SKUs clear that bar — 77% of the market**. The catalog's real discounts cluster at
-- 25–35% (5%-buckets: 10:7, 15:9, 20:39, 25:110, 30:65, 35:76, 40:7), because our wholesale-vs-retail
-- basis marks down nearly everything. So a percentage threshold CANNOT thin it: there is no cut point
-- that leaves a meaningful few. A badge on three quarters of the shelf is wallpaper, and wallpaper on
-- a price claim is worse than nothing — it trains a shopper to ignore the one place we say "this is
-- genuinely a good buy".
--
-- WHY A COLUMN, not a computed rule: a per-aisle percentile would move the badge between SKUs on every
-- catalog refresh. An item that was "featured" last week silently isn't today, with no price change —
-- which is a worse trust failure than over-badging. Featured is a DECISION, so it is stored.
--
-- The quiet inline "Compare at $X" strike is untouched: it shows on every genuine discount and remains
-- the honest, non-shouty surface. This column governs only the loud pill.
begin;

alter table public.grocery_items
  add column if not exists is_featured_deal boolean not null default false;

comment on column public.grocery_items.is_featured_deal is
  'W9d — show the loud "Save N%" pill. A merchandising DECISION, not a computed threshold: 77% of the '
  'catalog clears any sane percentage gate, so a stored flag is the only way the badge means anything. '
  'Owner-editable: update this column to curate. The quiet "Compare at" strike is independent and shows '
  'on every real discount.';

-- Seed a BOUNDED, DETERMINISTIC starting set so the feature ships alive rather than switched off:
-- the top 2 per aisle by ABSOLUTE savings (dollars off beats percent off for a shopper — $3 off a $12
-- jar is a better deal than 40% off a $2 packet), among items with a real markdown of at least 20%.
-- `barcode` breaks ties so the result is reproducible, and it is computed HERE rather than hardcoded
-- as a barcode list so it adapts to whatever catalog the target database actually holds.
--
-- Computed against supabase/data/grocery_catalog.json: 8 aisles clear the ≥20% bar, so 16 of 396 SKUs
-- (4.0%) — few enough that the pill reads as a real pick.
-- Guarded: only ever sets true where the flag is still at its default, so re-running never clobbers
-- the owner's own curation.
--
-- ⚠️ This UPDATE is a NO-OP on a fresh database: `supabase/config.toml [db.seed]` loads seed.sql AFTER
-- migrations, so `grocery_items` is still empty here on a `db reset`. It exists for databases whose
-- catalog is ALREADY loaded (the live project). The identical block is repeated at the end of the
-- grocery-catalog upsert in seed.sql so a fresh local/CI/preview environment ships the feature ALIVE
-- rather than silently switched off. Keep the two copies in sync.
with ranked as (
  select
    barcode,
    row_number() over (
      partition by category
      order by (compare_at_cents - price_cents) desc, barcode
    ) as rnk
  from public.grocery_items
  where compare_at_cents is not null
    and compare_at_cents > price_cents
    and available
    -- ≥20% off: the seed should not feature a token markdown just because its aisle is thin.
    and (compare_at_cents - price_cents)::numeric / compare_at_cents >= 0.20
)
update public.grocery_items g
set is_featured_deal = true
from ranked r
where g.barcode = r.barcode
  and r.rnk <= 2
  and g.is_featured_deal = false;

commit;
