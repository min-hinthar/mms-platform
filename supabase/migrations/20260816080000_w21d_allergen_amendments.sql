-- 20260816080000_w21d_allergen_amendments.sql — Codex backlog sweep (#187, both P1s).
--
-- Two W17d-2 items under-declared allergens their own DESCRIPTIONS name — and the item sheet's
-- bold "Contains" disclosure is built exclusively from `allergens`, so a diner was told less than
-- the menu text admits:
--   · sanwin-makin — "baked with coconut and butter" → DAIRY was missing (had gluten_wheat only);
--   · shrimp-crispy-fish-sauce — "tossed in spicy fish sauce" → FISH was missing (shellfish only).
--
-- Idempotent (array_append guarded by a not-contains predicate); the catalog snapshot
-- (docs/data/menu_catalog.json) is updated in the same commit so the generated reference agrees.

update public.menu_items
   set allergens = array_append(allergens, 'dairy')
 where slug = 'sanwin-makin' and not ('dairy' = any(allergens));

update public.menu_items
   set allergens = array_append(allergens, 'fish')
 where slug = 'shrimp-crispy-fish-sauce' and not ('fish' = any(allergens));
