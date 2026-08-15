-- W15 prod apply — POS truth (generated; apply via MCP execute_sql post-merge)
begin;
update menu_items set base_price_cents = 2000 where slug = 'kyay-o' and base_price_cents = 1800;
update menu_items set base_price_cents = 1400 where slug = 'pickled-tea-salad' and base_price_cents = 1200;
update menu_items set base_price_cents = 500 where slug = 'coffee' and base_price_cents = 650;
update menu_items set base_price_cents = 1200 where slug = 'burmese-fried-rice' and base_price_cents = 1300;
update menu_items set base_price_cents = 1200 where slug = 'fish-paste-tomato-curry' and base_price_cents = 1400;
update menu_items set base_price_cents = 1200 where slug = 'pinto-beans' and base_price_cents = 1400;
update menu_items set base_price_cents = 1500 where slug = 'pork-offals-curry' and base_price_cents = 1400;
update menu_items set base_price_cents = 1500 where slug = 'acacia-with-shrimp-curry' and base_price_cents = 1400;
update menu_items set base_price_cents = 1700 where slug = 'coconut-chicken-and-rice' and base_price_cents = 1400;
update menu_items set base_price_cents = 350 where slug = 'coconut-rice' and base_price_cents = 300;
update menu_items set tags = array_append(tags, 'popular') where slug = 'mohinga' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'kyay-o' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'mee-shay' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'faluda' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'pork-skewers' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'roselle-with-shrimp-curry' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'pickled-tea-salad' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'shan-noodles' and not ('popular' = any(tags));
update menu_items set tags = array_append(tags, 'popular') where slug = 'chicken-curry' and not ('popular' = any(tags));
insert into menu_items (id, category_id, slug, name_en, name_my, description_en, base_price_cents, image_url, is_active, is_sold_out, allergens, tags) values
('0ee160fd-f7e6-40e9-90f8-90f48aef1a5b','e04ee0c4-10eb-4d26-b065-a0d1fc759391','veggie-fritters','Veggie Fritters','အကြော်စုံ','Assorted crispy vegetable fritters — a teahouse classic.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/0ee160fd-f7e6-40e9-90f8-90f48aef1a5b/fallback.jpg',true,false,'{gluten}','{}'),
('9464e363-f438-4663-8985-080b36dfd5aa','e04ee0c4-10eb-4d26-b065-a0d1fc759391','ngapi-and-veggies','NgaPi & Veggies','ငပိတို့စရာ','Pounded ngapi dip with a platter of fresh and boiled vegetables.',1000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/9464e363-f438-4663-8985-080b36dfd5aa/fallback.jpg',true,false,'{fish,shellfish}','{}'),
('e4b35594-e4fe-4733-918f-015d2c192c3f','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','malar-spicy-beef','Malar Spicy Beef','အမဲမာလာ','Beef simmered in numbing-spicy mala chili oil.',1700,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/e4b35594-e4fe-4733-918f-015d2c192c3f/fallback.jpg',true,false,'{soy}','{}'),
('79e82f48-b318-469f-a99d-c99b54b30cd9','8c069537-e7bc-47cd-a9ee-338539a8f764','white-peas','White Peas','ပဲပြုတ်','Boiled white peas with fried onions and oil — the classic side.',500,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/79e82f48-b318-469f-a99d-c99b54b30cd9/fallback.jpg',true,false,'{}','{}'),
('ce7fb4af-1af4-44b6-bdf7-4fa797bd4e99','2dd45bdd-dc99-443e-b3c9-63c3b0262e10','shark-energy-drink','Red Bull - SHARK 8.4 oz','အားဖြည့်ဖျော်ရည်','Shark energy drink, chilled can.',400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/ce7fb4af-1af4-44b6-bdf7-4fa797bd4e99/fallback.jpg',true,false,'{}','{}'),
('dcd423e2-1695-4f51-872e-954e89db34bc','2dd45bdd-dc99-443e-b3c9-63c3b0262e10','pop-soda','Pop Soda 12oz','ဆိုဒါ','Assorted soda, 12 oz chilled can.',300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/dcd423e2-1695-4f51-872e-954e89db34bc/fallback.jpg',true,false,'{}','{}')
on conflict (id) do nothing;
update menu_items set tax_category = 'retail_nonfood' where slug in ('shark-energy-drink', 'pop-soda');
update grocery_items set price_cents = 390, compare_at_cents = case when compare_at_cents <= 390 then null else compare_at_cents end where sku = 'ST0107' and price_cents = 449;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'SN0505' and price_cents = 411;
update grocery_items set price_cents = 163, compare_at_cents = case when compare_at_cents <= 163 then null else compare_at_cents end where sku = 'NV0104' and price_cents = 187;
update grocery_items set price_cents = 520, compare_at_cents = case when compare_at_cents <= 520 then null else compare_at_cents end where sku = 'CF0407' and price_cents = 663;
update grocery_items set price_cents = 286, compare_at_cents = case when compare_at_cents <= 286 then null else compare_at_cents end where sku = 'SN0704' and price_cents = 329;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'CN0201' and price_cents = 195;
update grocery_items set price_cents = 208, compare_at_cents = case when compare_at_cents <= 208 then null else compare_at_cents end where sku = 'SH0202' and price_cents = 260;
update grocery_items set price_cents = 650, compare_at_cents = case when compare_at_cents <= 650 then null else compare_at_cents end where sku = 'PF0307' and price_cents = 748;
update grocery_items set price_cents = 390, compare_at_cents = case when compare_at_cents <= 390 then null else compare_at_cents end where sku = 'SN0501' and price_cents = 449;
update grocery_items set price_cents = 780, compare_at_cents = case when compare_at_cents <= 780 then null else compare_at_cents end where sku = 'CN0604' and price_cents = 897;
update grocery_items set price_cents = 169, compare_at_cents = case when compare_at_cents <= 169 then null else compare_at_cents end where sku = 'CN0307' and price_cents = 194;
update grocery_items set price_cents = 293, compare_at_cents = case when compare_at_cents <= 293 then null else compare_at_cents end where sku = 'GR0403' and price_cents = 260;
update grocery_items set price_cents = 572, compare_at_cents = case when compare_at_cents <= 572 then null else compare_at_cents end where sku = 'CN0219' and price_cents = 658;
update grocery_items set price_cents = 104, compare_at_cents = case when compare_at_cents <= 104 then null else compare_at_cents end where sku = 'PF0608' and price_cents = 120;
update grocery_items set price_cents = 780, compare_at_cents = case when compare_at_cents <= 780 then null else compare_at_cents end where sku = 'CN0602' and price_cents = 897;
update grocery_items set price_cents = 163, compare_at_cents = case when compare_at_cents <= 163 then null else compare_at_cents end where sku = 'NV0103' and price_cents = 187;
update grocery_items set price_cents = 4160, compare_at_cents = case when compare_at_cents <= 4160 then null else compare_at_cents end where sku = 'MD0204' and price_cents = 4784;
update grocery_items set price_cents = 715, compare_at_cents = case when compare_at_cents <= 715 then null else compare_at_cents end where sku = 'PF0207' and price_cents = 822;
update grocery_items set price_cents = 163, compare_at_cents = case when compare_at_cents <= 163 then null else compare_at_cents end where sku = 'NV0106' and price_cents = 187;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'BK0106' and price_cents = 411;
update grocery_items set price_cents = 390, compare_at_cents = case when compare_at_cents <= 390 then null else compare_at_cents end where sku = 'ST0103' and price_cents = 449;
update grocery_items set price_cents = 520, compare_at_cents = case when compare_at_cents <= 520 then null else compare_at_cents end where sku = 'CN0901' and price_cents = 598;
update grocery_items set price_cents = 260, compare_at_cents = case when compare_at_cents <= 260 then null else compare_at_cents end where sku = 'SN0307' and price_cents = 299;
update grocery_items set price_cents = 390, compare_at_cents = case when compare_at_cents <= 390 then null else compare_at_cents end where sku = 'ST0101' and price_cents = 449;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'CN0205' and price_cents = 179;
update grocery_items set price_cents = 325, compare_at_cents = case when compare_at_cents <= 325 then null else compare_at_cents end where sku = 'BK0116' and price_cents = 374;
update grocery_items set price_cents = 195, compare_at_cents = case when compare_at_cents <= 195 then null else compare_at_cents end where sku = 'CF0302' and price_cents = 260;
update grocery_items set price_cents = 215, compare_at_cents = case when compare_at_cents <= 215 then null else compare_at_cents end where sku = 'BK0202' and price_cents = 247;
update grocery_items set price_cents = 2000, compare_at_cents = case when compare_at_cents <= 2000 then null else compare_at_cents end where sku = 'UB0101' and price_cents = 2138;
update grocery_items set price_cents = 780, compare_at_cents = case when compare_at_cents <= 780 then null else compare_at_cents end where sku = 'CN0603' and price_cents = 897;
update grocery_items set price_cents = 78, compare_at_cents = case when compare_at_cents <= 78 then null else compare_at_cents end where sku = 'PF0612' and price_cents = 90;
update grocery_items set price_cents = 215, compare_at_cents = case when compare_at_cents <= 215 then null else compare_at_cents end where sku = 'GR0405' and price_cents = 260;
update grocery_items set price_cents = 520, compare_at_cents = case when compare_at_cents <= 520 then null else compare_at_cents end where sku = 'NV0108' and price_cents = 390;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'SN0302' and price_cents = 390;
update grocery_items set price_cents = 163, compare_at_cents = case when compare_at_cents <= 163 then null else compare_at_cents end where sku = 'PF0615' and price_cents = 187;
update grocery_items set price_cents = 520, compare_at_cents = case when compare_at_cents <= 520 then null else compare_at_cents end where sku = 'CN0715' and price_cents = 455;
update grocery_items set price_cents = 4160, compare_at_cents = case when compare_at_cents <= 4160 then null else compare_at_cents end where sku = 'MD0203' and price_cents = 4784;
update grocery_items set price_cents = 390, compare_at_cents = case when compare_at_cents <= 390 then null else compare_at_cents end where sku = 'ST0108' and price_cents = 449;
update grocery_items set price_cents = 644, compare_at_cents = case when compare_at_cents <= 644 then null else compare_at_cents end where sku = 'CN0309' and price_cents = 740;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'SN0304' and price_cents = 411;
update grocery_items set price_cents = 293, compare_at_cents = case when compare_at_cents <= 293 then null else compare_at_cents end where sku = 'CN0803' and price_cents = 336;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'CN0204' and price_cents = 179;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'BK0105' and price_cents = 411;
update grocery_items set price_cents = 2000, compare_at_cents = case when compare_at_cents <= 2000 then null else compare_at_cents end where sku = 'UB0104' and price_cents = 2138;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'NV0101' and price_cents = 179;
update grocery_items set price_cents = 520, compare_at_cents = case when compare_at_cents <= 520 then null else compare_at_cents end where sku = 'NV0107' and price_cents = 390;
update grocery_items set price_cents = 286, compare_at_cents = case when compare_at_cents <= 286 then null else compare_at_cents end where sku = 'SN0502' and price_cents = 329;
update grocery_items set price_cents = 429, compare_at_cents = case when compare_at_cents <= 429 then null else compare_at_cents end where sku = 'SN0702' and price_cents = 493;
update grocery_items set price_cents = 715, compare_at_cents = case when compare_at_cents <= 715 then null else compare_at_cents end where sku = 'CN0502' and price_cents = 822;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'BK0107' and price_cents = 411;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'CN0306' and price_cents = 179;
update grocery_items set price_cents = 715, compare_at_cents = case when compare_at_cents <= 715 then null else compare_at_cents end where sku = 'CN0303' and price_cents = 822;
update grocery_items set price_cents = 358, compare_at_cents = case when compare_at_cents <= 358 then null else compare_at_cents end where sku = 'SN0301' and price_cents = 411;
update grocery_items set price_cents = 325, compare_at_cents = case when compare_at_cents <= 325 then null else compare_at_cents end where sku = 'BK0103' and price_cents = 374;
update grocery_items set price_cents = 156, compare_at_cents = case when compare_at_cents <= 156 then null else compare_at_cents end where sku = 'CN0206' and price_cents = 179;
update grocery_items set price_cents = 1950, compare_at_cents = case when compare_at_cents <= 1950 then null else compare_at_cents end where sku = 'SD0109' and price_cents = 2242;
update grocery_items set price_cents = 260, compare_at_cents = case when compare_at_cents <= 260 then null else compare_at_cents end where sku = 'PF0619' and price_cents = 299;
update grocery_items set price_cents = 208, compare_at_cents = case when compare_at_cents <= 208 then null else compare_at_cents end where sku = 'PF0607' and price_cents = 239;
update grocery_items set price_cents = 215, compare_at_cents = case when compare_at_cents <= 215 then null else compare_at_cents end where sku = 'DR0301' and price_cents = 247;
update grocery_items set price_cents = 286, compare_at_cents = case when compare_at_cents <= 286 then null else compare_at_cents end where sku = 'BK0201' and price_cents = 329;
insert into grocery_items (barcode, name, name_my, price_cents, tax_category, ebt_eligible, category, brand, sku, size_qty, size_unit, synonyms, compare_at_cents) values
('2991500010003','Balachaung (House Made)','ဘာလချောင်ကြော် (ဆိုင်လုပ်)',1000,'grocery_food',true,'cooking',null,'HM1501',null,null,'{}'::text[],null),
('2991500010010','Shredded Goat (Dried)','ဆိတ်သားမွှ',3000,'grocery_food',true,'canned-fish',null,'HM1502',null,null,'{}'::text[],null),
('2991500010027','Dried Goat','ဆိတ်သားခြောက်',3000,'grocery_food',true,'canned-fish',null,'HM1503',null,null,'{}'::text[],null),
('2991500010034','Fried Crickets','ပုရစ်ကြော်',5000,'grocery_food',true,'snacks-sweets',null,'HM1504',null,null,'{}'::text[],null),
('2991500010041','Fried Crickets (Small)','ပုရစ်ကြော် (အသေး)',2000,'grocery_food',true,'snacks-sweets',null,'HM1505',null,null,'{}'::text[],null),
('2991500010058','Dried Kathapaung','ကသပေါင်းခြောက်',2500,'grocery_food',true,'cooking',null,'HM1506',null,null,'{}'::text[],null),
('2991500010065','Silurus Dried (Fried)','ငါးကျည်းခြောက်ကြော်',2500,'grocery_food',true,'canned-fish',null,'HM1507',null,null,'{}'::text[],null),
('2991500010072','Snakehead Dried','ငါးရံ့ခြောက်ဖုတ်',2500,'grocery_food',true,'canned-fish',null,'HM1508',null,null,'{}'::text[],null),
('2991500010089','Dried Chili','ငရုတ်သီးခြောက်',455,'grocery_food',true,'cooking',null,'HM1509',null,null,'{}'::text[],null)
on conflict (barcode) do nothing;
commit;