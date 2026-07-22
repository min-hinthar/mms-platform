-- W5c pre-merge hardening — modifier-option allergen + tax metadata.
--
-- The deep pre-merge pass found two real defects in the new "Choose your add-ons" group:
--  1) SAFETY (HIGH): allergen-bearing add-ons (Balachaung→shellfish, eggs, Mohinga Soup→fish/egg,
--     fritters/soup→gluten) attach to items tagged `allergen-reviewed` with `allergens = '{}'` — an
--     AUDITED "contains nothing" claim — so a shellfish-free diner could add shellfish with zero warning.
--     Fix: carry per-option `allergens` so the item sheet can surface "contains shellfish" on the option
--     row + fold a chosen add-on's allergens into the item's Contains line (fail-safe honesty preserved).
--  2) TAX (MED): the add-ons are all HOT prepared food, but they fold into the parent line's single
--     tax_category — so a hot add-on on a COLD to-go salad rides the salad's to-go exemption (CDTFA under-
--     collection, restaurant-unfavorable). `tax_category` per option is STAGED here for the real fix but
--     is NOT yet consumed: the charge authority (`getCartTotals`) reads each line's `tax_cents` only as a
--     boolean taxable flag and taxes the full `unit_price_cents`, so a partial taxable base can't be
--     expressed without a per-line taxable-base engine change (its own milestone — docs/OPEN-ITEMS.md C11).
--     Feeding a per-part `tax_cents` into that boolean authority OVER-charges the whole line, so the code
--     keeps the single-category-per-line model for now; this column records the intended add-on category.
--
-- Both columns are nullable/defaulted + additive — no read path changes shape, every existing row is valid.

alter table public.modifier_options
  add column if not exists allergens text[] not null default '{}';

alter table public.modifier_options
  add column if not exists tax_category text;

-- Bound tax_category to the same CDTFA set as menu_items.tax_category (null = inherit the parent item).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'modifier_options_tax_category_check'
      and conrelid = 'public.modifier_options'::regclass
  ) then
    alter table public.modifier_options add constraint modifier_options_tax_category_check
      check (tax_category is null or tax_category in
        ('hot_prepared','cold_food','beverage_hot','beverage_cold','retail_nonfood','grocery_food'));
  end if;
end $$;
