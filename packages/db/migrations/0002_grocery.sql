-- 0002_grocery.sql — Grocery Scan & Go (barcode self-checkout). Reuses qr_carts/qr_cart_items,
-- the category-aware tax engine, and Stripe. New: a UPC-keyed catalog + EBT eligibility.
-- Money is integer CENTS end-to-end (parity with menu_items / qr_cart_items).

create table if not exists grocery_items (
  barcode text primary key,                 -- UPC-A / EAN-13
  name text not null, name_my text,
  price_cents int not null,
  tax_category text not null,               -- parity with lib/tax.ts: grocery_food | retail_nonfood | beverage_cold ...
  ebt_eligible boolean not null default false,  -- SNAP: true for grocery food staples (fulfillment = 2027 / Forage)
  weighed boolean not null default false,   -- produce by weight (scale/manual entry — deferred)
  image_url text,
  available boolean not null default true
);
alter table grocery_items enable row level security;
create policy grocery_public_read on grocery_items for select using (true);

-- Seed — representative of the 198 SKUs already mapped to CA tax categories (CDTFA Pub 22 work):
-- food staples are exempt + EBT-eligible; the non-food retail items (balms, umbrellas, brooms) are taxable + not EBT.
insert into grocery_items (barcode,name,name_my,price_cents,tax_category,ebt_eligible) values
 ('0011110001010','Shwe Bo Pawsan Rice 10lb','ရွှေဘို ပေါ်ဆန်း',2499,'grocery_food',true),
 ('0011110002020','Pickled Tea Leaf (Laphet) 400g','လက်ဖက်စို',849,'grocery_food',true),
 ('0011110003030','Fish Sauce 700ml','ငါးငံပြာရည်',599,'grocery_food',true),
 ('0011110004040','Roasted Chickpea Flour 1kg','ပဲမှုန့်',649,'grocery_food',true),
 ('0011110005050','Thanaka Balm 100g','သနပ်ခါး',799,'retail_nonfood',false),
 ('0011110006060','Bamboo Umbrella','ထီး',1499,'retail_nonfood',false)
on conflict (barcode) do nothing;
