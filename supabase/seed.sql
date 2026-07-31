-- Seed: Mandalay Morning Star catalog for the QR/platform project (fasnpdhtvqtzjlvruqcu).
-- Pulled 2026-06-18 from the live delivery DB (ukuzkhuppqwtrdkjqrkv) with exact UUIDs preserved
-- so every FK (menu_items.category_id, modifier_options.group_id, item_modifier_groups) lines up.
-- Money is integer CENTS. Applied AFTER the schema migration, via `supabase db push` / seed.
-- Idempotent: every insert is ON CONFLICT DO NOTHING, so re-running is safe.
--
-- 8 categories · 60 menu items · 7 modifier groups · 14 options · 7 item→group links.

insert into menu_categories (id, slug, name, sort_order, is_active) values ('2fa67ae4-0709-48e8-942d-a37d5ea64e89','all-day-breakfast','All-Day Breakfast',10,true),
('3a6e126f-7a4a-4f47-a404-66f100e4aaa8','rice-noodles-soups','Rice / Noodles / Soups',20,true),
('8c069537-e7bc-47cd-a9ee-338539a8f764','sides','Sides',30,true),
('b8fc8e28-1adc-4ddd-8792-73fe4e320d48','curries-a-la-carte','Curries (A la Carte)',40,true),
('48b9ad45-3000-49fe-9c1d-342134f0295f','vegetables','Vegetables',50,true),
('91a0c27f-f00c-4a62-88ef-a5f952777e67','seafood-curries','Seafood Curries',60,true),
('e04ee0c4-10eb-4d26-b065-a0d1fc759391','appetizers-salads','Appetizers / Salads',70,true),
('2dd45bdd-dc99-443e-b3c9-63c3b0262e10','drinks','Drinks',80,true)
on conflict (id) do nothing;

insert into modifier_groups (id, slug, name, selection_type, min_select, max_select) values ('acec222e-c859-4107-b971-c8916a150ad4','beef_curry_style','Beef Curry Style','single',1,1),
('13b87d9a-fc26-4555-ba7d-97e20b8b1198','chicken_curry_style','Chicken Curry Style','single',1,1),
('f3d9171d-8c71-4504-847a-63a7021de48b','goat_curry_cut','Goat Choice','single',1,1),
('dc4943e3-a0b8-445b-a74f-4220cad2352f','kyay_o_addons','Add-ons','multiple',0,5),
('8e503358-61cb-44b6-bffb-3e8f24c0a9c0','kyay_o_protein','Protein Option','single',1,1),
('08e48092-ff7c-4e62-95de-df5104df8179','kyay_o_style','Style','single',1,1),
('7533d535-ac12-4cc2-95ec-717f9e125304','tom_yum_base','Choose Base','single',1,1)
on conflict (id) do nothing;

insert into modifier_options (id, group_id, slug, name, price_delta_cents, sort_order, is_active) values ('030b657e-5617-476e-ace4-654a3f06f256','acec222e-c859-4107-b971-c8916a150ad4','beef_curry_style__non_spicy_braised','Non-spicy braised',0,1,true),
('49ab6ee8-7e39-4397-bb8a-357f79fb5c52','acec222e-c859-4107-b971-c8916a150ad4','beef_curry_style__spiced','Spiced',0,0,true),
('19abeff6-c3e7-4c71-88a7-94359ffd2cfd','13b87d9a-fc26-4555-ba7d-97e20b8b1198','chicken_curry_style__coconut','Coconut',0,2,true),
('7a9480d0-88e6-4458-8b0a-f809dd7906a4','13b87d9a-fc26-4555-ba7d-97e20b8b1198','chicken_curry_style__masala','Masala',0,1,true),
('5ac1a7b3-fd7c-4e76-a541-bd3b4f232fe1','13b87d9a-fc26-4555-ba7d-97e20b8b1198','chicken_curry_style__original','Original',0,0,true),
('962bd183-0634-43f8-a2de-5a4e3498f2cc','f3d9171d-8c71-4504-847a-63a7021de48b','goat_curry_cut__offal','Offal',0,1,true),
('847d411b-d50b-4125-9130-5bb7673b7854','f3d9171d-8c71-4504-847a-63a7021de48b','goat_curry_cut__original','Original',0,0,true),
('65758586-5445-464c-b252-81f7c0e17542','dc4943e3-a0b8-445b-a74f-4220cad2352f','kyay_o_addons__brains','Brains add-on',200,0,true),
('ecfcf6db-cbab-4488-82f7-3908f9d55300','8e503358-61cb-44b6-bffb-3e8f24c0a9c0','kyay_o_protein__chicken_plus_egg','Chicken + egg',0,1,true),
('8db5facc-909a-4a12-a525-c9a54f59de63','8e503358-61cb-44b6-bffb-3e8f24c0a9c0','kyay_o_protein__pork_default','Pork (default)',0,0,true),
('e0b4cf25-bb93-4c58-b628-8d7d6cd382ad','08e48092-ff7c-4e62-95de-df5104df8179','kyay_o_style__si_chat','Si-Chat (Dry)',0,1,true),
('bc931fa7-db70-4f6c-9583-b49fd1e43c24','08e48092-ff7c-4e62-95de-df5104df8179','kyay_o_style__soup','Kyay-O (Soup)',0,0,true),
('463ec903-9b55-4526-97c5-b96a92f075da','7533d535-ac12-4cc2-95ec-717f9e125304','tom_yum_base__fried_noodles','Fried Noodles',0,1,true),
('1346f6b9-57ec-4928-89e5-273ae7306b7f','7533d535-ac12-4cc2-95ec-717f9e125304','tom_yum_base__fried_rice','Fried Rice',0,0,true)
on conflict (id) do nothing;

insert into menu_items (id, category_id, slug, name_en, name_my, description_en, base_price_cents, image_url, is_active, is_sold_out, allergens, tags) values ('088c806d-1d17-46df-8b53-648f48d194ff','48b9ad45-3000-49fe-9c1d-342134f0295f','acacia-with-shrimp-curry','Acacia with Shrimp Curry','ကင်ပွန်းချဥ်ကြော်','Acacia sour leaf curry with shrimp.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/088c806d-1d17-46df-8b53-648f48d194ff/fallback.jpg',true,false,'{shellfish}','{}'),
('cfa52704-712b-4efb-ab8a-cf638a455c5f','8c069537-e7bc-47cd-a9ee-338539a8f764','balachaung','Balachaung','ဘာလချောင်ကြော်','Shrimp condiment with fried onions, shrimp, garlic, ginger & red chilies.',300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/cfa52704-712b-4efb-ab8a-cf638a455c5f/fallback.jpg',true,false,'{shellfish}','{}'),
('f85460a2-c91c-4f48-96d8-3774ba314052','48b9ad45-3000-49fe-9c1d-342134f0295f','bamboo-shoot-mushroom-soup','Bamboo Shoot Mushroom Soup','မျှစ်တောချက်','Young bamboo shoots cooked with mushrooms in savory soup.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f85460a2-c91c-4f48-96d8-3774ba314052/fallback.jpg',true,false,'{}','{vegetarian,allergen-reviewed,vegan-optional}'),
('38663247-1155-4ca4-bd89-4fd4a5ec986b','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','bamboo-shoot-with-pork-soup','Bamboo Shoot with Pork Soup','ဝက်မျှစ်ချဥ်','Pork in mildly spiced tamarind broth infused with bamboo shoots.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/38663247-1155-4ca4-bd89-4fd4a5ec986b/fallback.jpg',true,false,'{fish}','{}'),
('2befdc69-1888-43bf-a474-c1ec7030f05b','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','beef-curry','Beef Curry','အမဲသားဟင်း/အမဲကြော်နှပ်','Slow-cooked Burmese-Indian beef curry; non-spicy braised option available.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/2befdc69-1888-43bf-a474-c1ec7030f05b/fallback.jpg',true,false,'{soy}','{}'),
('ffda706a-73ab-4e49-b5ff-05fd1caf988b','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','beef-pounded-deep-fried','Beef Pounded Deep Fried','အမဲထေါင်းကြော်','Pulled braised beef cooked in spicy chili oil.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/ffda706a-73ab-4e49-b5ff-05fd1caf988b/fallback.jpg',true,false,'{}','{spicy,allergen-reviewed}'),
('c26a1c24-4e6a-4d01-99f0-b6d81550c90f','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','biriyani-dan-pauk','Biriyani (Dan-Pauk)','ဒံပေါက် ကြက်သား','Burmese-Indian slow-cooked Biriyani rice with Chicken.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/c26a1c24-4e6a-4d01-99f0-b6d81550c90f/photo.jpg',true,false,'{}','{allergen-reviewed}'),
('f8317f03-442c-4c86-af53-4c0371178504','91a0c27f-f00c-4a62-88ef-a5f952777e67','boneless-catfish-curry','Boneless Catfish Curry','ငါးခူမွှေချက်','Boneless catfish in mildly spiced tamarind sauce.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f8317f03-442c-4c86-af53-4c0371178504/fallback.jpg',true,false,'{fish}','{}'),
('40463cf4-dbfe-4232-98aa-d8a922555930','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','burmese-fried-rice','Burmese Fried Rice','ပဲပြုတ်ထမင်းကြော်','Stir-fried rice with eggs, onion, garlic, and boiled yellow peas.',1300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/40463cf4-dbfe-4232-98aa-d8a922555930/fallback.jpg',true,false,'{egg}','{}'),
('ceba4a55-9408-4b75-9829-a4364b1b7ceb','2dd45bdd-dc99-443e-b3c9-63c3b0262e10','burmese-milk-tea','Burmese Milk Tea','လက်ဖတ်ရည်','Burmese roasted black tea with evaporated + condensed milk.',400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/ceba4a55-9408-4b75-9829-a4364b1b7ceb/photo.jpg',true,false,'{dairy}','{}'),
('cb09a65c-7fb0-41ae-8126-44ee87058516','e04ee0c4-10eb-4d26-b065-a0d1fc759391','century-egg-salad','Century Egg Salad','ဆေးဘဲဥသုပ်','Century egg + tomato + shallot + chickpea powder; includes peanuts + dried shrimp powder.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/cb09a65c-7fb0-41ae-8126-44ee87058516/photo.jpg',true,false,'{peanuts,shellfish,egg}','{}'),
('d3b48fbc-506f-4cf4-ae5e-dd8d34bf81a9','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','chicken-curry','Chicken Curry (Original / Masala / Coconut)','ကြက်သားဟင်း','Farm-raised chicken curry; masala spicy or sweet coconut option available.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/d3b48fbc-506f-4cf4-ae5e-dd8d34bf81a9/photo.jpg',true,false,'{soy}','{}'),
('86a048b9-c668-467f-8af4-9ab765ef8e52','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','chicken-giblets-curry','Chicken Giblets Curry','ကြက်အသဲမြစ်','Chicken gizzards and liver in traditional Burmese curry.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/86a048b9-c668-467f-8af4-9ab765ef8e52/fallback.jpg',true,false,'{}','{allergen-reviewed}'),
('638cd72b-ad68-4450-939b-03d4c75e6c95','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','chicken-gourd-curry','Chicken Gourd Curry','ကြက်ဗူးသီး','Chicken curry cooked with bottle gourd in traditional Burmese style.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/638cd72b-ad68-4450-939b-03d4c75e6c95/fallback.jpg',true,false,'{}','{allergen-reviewed}'),
('fe88c38a-d36b-497a-9a37-582b9dbc9e95','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','coconut-chicken-and-rice','Coconut Chicken & Rice','ကြက်အုန်းထမင်း','Coconut rice with balachaung + Burmese chicken curry cooked in coconut oil.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/fe88c38a-d36b-497a-9a37-582b9dbc9e95/photo.jpg',true,false,'{shellfish}','{}'),
('55d6acc1-4dfe-4e1c-8547-9158d7ca28ae','8c069537-e7bc-47cd-a9ee-338539a8f764','coconut-rice','Coconut Rice','အုန်းထမင်း','Coconut-cream cooked rice.',300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/55d6acc1-4dfe-4e1c-8547-9158d7ca28ae/photo.jpg',true,false,'{}','{vegan,allergen-reviewed}'),
('f97b16a6-ea42-42a1-9495-778bba281890','2dd45bdd-dc99-443e-b3c9-63c3b0262e10','coffee','Coffee','ကော်ဖီ','Hot or cold coffee, 10 oz.',650,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f97b16a6-ea42-42a1-9495-778bba281890/fallback.jpg',true,false,'{dairy}','{}'),
('f1991fc7-03bd-41f3-b6e9-e2d500b055fb','91a0c27f-f00c-4a62-88ef-a5f952777e67','crab-masala-curry','Crab Masala Curry','ဂဏန်းမဆလာ','Whole Dungeness crab simmered in masala chili curry with tamarind.',3000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f1991fc7-03bd-41f3-b6e9-e2d500b055fb/fallback.jpg',true,false,'{shellfish}','{spicy_optional}'),
('f6b331f0-2e64-4521-9aaf-0ffabc1f167e','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','duck-egg-curry','Duck Egg','ဘဲဥဟင်း','Boiled duck eggs cooked in tomato-based curry.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f6b331f0-2e64-4521-9aaf-0ffabc1f167e/photo.jpg',true,false,'{egg}','{}'),
('00aff0e8-7335-49df-bdf0-a8c2e3ddf4d4','e04ee0c4-10eb-4d26-b065-a0d1fc759391','everything-salad','Everything Salad','အသုပ်စုံ','Seaweed, noodles, potato, banana shoots, papaya, lettuce; includes peanuts + dried shrimp powder.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/00aff0e8-7335-49df-bdf0-a8c2e3ddf4d4/photo.jpg',true,false,'{peanuts,shellfish}','{vegan-optional}'),
('6f7f1c26-a925-49cf-bf68-ef533bd7b73e','2dd45bdd-dc99-443e-b3c9-63c3b0262e10','faluda','Faluda','ဖါလူဒါ','Burmese sundae with pudding, jelly, assorted nuts.',900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/6f7f1c26-a925-49cf-bf68-ef533bd7b73e/photo.jpg',true,false,'{tree_nuts,dairy}','{}'),
('4ac59984-ce2b-42cf-9400-51e44bef6310','91a0c27f-f00c-4a62-88ef-a5f952777e67','fermented-fish-paste-ngapi','Fermented Fish Paste Nga-Pi','ငပိရည်ကျို','Platter of vegetables with fermented fish paste dip.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/4ac59984-ce2b-42cf-9400-51e44bef6310/photo.jpg',true,false,'{fish}','{}'),
('4bf987ba-2804-46dd-a791-241be12188f0','91a0c27f-f00c-4a62-88ef-a5f952777e67','fish-paste-tomato-curry','Fish Paste Tomato Curry','ခရမ်းချဥ်သီးငါးပိချက်','Fish paste in tomato curry with ginger/onions/garlic.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/4bf987ba-2804-46dd-a791-241be12188f0/fallback.jpg',true,false,'{fish}','{}'),
('ddcd6b38-5a97-4c12-bdb6-17abadb138a0','8c069537-e7bc-47cd-a9ee-338539a8f764','fishcake-stuffed-salad','Fishcake (Stuffed Salad)','ငါးဖယ်အစာသွပ်','Fried fishcake stuffed with traditional vegetable fillings, fried garlic, and seasonings.',1400,NULL,true,false,'{fish}','{}'),
('22059c71-67e5-4913-a2cb-f74ad6586e07','91a0c27f-f00c-4a62-88ef-a5f952777e67','fried-catfish-curry','Fried Catfish Curry','ငါးခူကြော်နှပ်','Fried catfish curry.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/22059c71-67e5-4913-a2cb-f74ad6586e07/fallback.jpg',true,false,'{fish}','{}'),
('bbe1d830-ef3a-4839-9bf9-36bcc3accc2e','91a0c27f-f00c-4a62-88ef-a5f952777e67','fried-fish-cake-curry','Fried Fish Cake Curry','ငါးဖယ်ချက်','Crispy fish cakes simmered in mildly spiced tamarind sauce.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/bbe1d830-ef3a-4839-9bf9-36bcc3accc2e/fallback.jpg',true,false,'{fish}','{}'),
('304c176a-40fc-444a-a35a-fc31adb89ab1','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','goat-curry','Goat Curry [Original/Offal]','ဆိတ်သားဟင်း/ဆိတ်ကလီစာ','Braised goat in Burmese-Indian masala curry (choice of meat or offal).',3000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/304c176a-40fc-444a-a35a-fc31adb89ab1/photo.jpg',true,false,'{}','{spicy_optional,allergen-reviewed}'),
('c41a7d19-3079-45a6-b454-1a5acbd55905','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','goat-marrow-soup','Goat-Marrow Soup','ဆိတ်ရိုးစွပ်ပြုတ်','Goat stew + bone marrow infused soup with chickpeas and potatoes. Best paired with Parata.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/c41a7d19-3079-45a6-b454-1a5acbd55905/photo.jpg',true,false,'{}','{allergen-reviewed}'),
('21c5f66c-dce4-47e9-9fd4-5b72e19168ac','e04ee0c4-10eb-4d26-b065-a0d1fc759391','grilled-aubergine-salad','Grilled Aubergine Salad','ခရမ်းသီးမီးဖုတ်သုပ်','Grilled eggplant with shallot, chili, lime, peanuts; crispy shallots + coriander.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/21c5f66c-dce4-47e9-9fd4-5b72e19168ac/fallback.jpg',true,false,'{peanuts}','{vegetarian,vegan-optional}'),
('e2c0804b-1658-413e-ba61-e15de1c19f51','91a0c27f-f00c-4a62-88ef-a5f952777e67','hilsa-fish','Hilsa Fish','ငါးသလောက်ပေါင်း','Hilsa fish in tomato-based curry.',2400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/e2c0804b-1658-413e-ba61-e15de1c19f51/photo.jpg',true,false,'{fish}','{}'),
('54737e73-a455-4330-af28-83f6cfbdb762','2fa67ae4-0709-48e8-942d-a37d5ea64e89','kyay-o','Kyay-O / Si-Chat','ကြေးအိုး/ဆီချက်','Rice vermicelli noodle soup (or dry) with pork, meatballs, intestines, eggs, bok choy. Chicken + egg option available.',1800,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/54737e73-a455-4330-af28-83f6cfbdb762/fallback.jpg',true,false,'{egg}','{}'),
('a9089e20-a6a6-448e-af44-4147e916131c','8c069537-e7bc-47cd-a9ee-338539a8f764','lemon-salad','Lemon Salad','ရှောက်သီးသုပ်','Refreshing traditional lemon salad with vegetables, shrimp powder, onions, fried garlic, and seasonings.',1200,NULL,true,false,'{peanuts,sesame,shellfish}','{vegan-optional}'),
('2656ac9a-5d5d-4868-955a-2f06ffdb3efb','2fa67ae4-0709-48e8-942d-a37d5ea64e89','mee-shay','Mee-Shay','မြှီးရှည်','Mandalay specialty rice noodles in sweet soybean sauce with pork, crunchy rind, pickled mustard.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/2656ac9a-5d5d-4868-955a-2f06ffdb3efb/photo.jpg',true,false,'{soy}','{}'),
('2b83fb0b-1257-4956-a8cd-4d39c2b549c8','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','mixed-veggie-shrimp-stir-fry-rice','Mixed Veggie & Shrimp Stir Fry Over Rice','ရန်ကုန်ထမင်းပေါင်း','Crisp, fresh vegetables and tender quail eggs with succulent shrimp, stir-fried and served over a bed of steamed rice.',2000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/2b83fb0b-1257-4956-a8cd-4d39c2b549c8/fallback.jpg',true,false,'{egg,shellfish}','{}'),
('11d56144-8191-4c8c-8027-dd4e8809129d','48b9ad45-3000-49fe-9c1d-342134f0295f','mixed-veggie-soup','Mixed Veggie Soup','သီးစုံပဲကုလားဟင်း','Burmese Indian-style assorted vegetables in savory, mildly spicy soup.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/11d56144-8191-4c8c-8027-dd4e8809129d/fallback.jpg',true,false,'{}','{vegetarian,allergen-reviewed,spicy_optional,vegan-optional}'),
('8c1a9bd3-fa11-420b-b505-2866c3461ea0','2fa67ae4-0709-48e8-942d-a37d5ea64e89','mohinga','Mohinga','မုန့်ဟင်းခါး','Traditional fish broth soup with rice noodles, garnishes, bean fritters, egg slices.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/8c1a9bd3-fa11-420b-b505-2866c3461ea0/photo.jpg',true,false,'{fish,egg}','{}'),
('15665442-5819-4b58-898e-bcdbd588da78','2fa67ae4-0709-48e8-942d-a37d5ea64e89','nan-gyi-mont-ti','Nan-Gyi Mont Ti','နန်းကြီးမုန့်တီ','Rice noodles with fish cake, garnishes, and crunch tossed in Mandalay chicken curry sauce.',1300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/15665442-5819-4b58-898e-bcdbd588da78/photo.jpg',true,false,'{fish}','{popular}'),
('91e9b2b4-199e-4035-a25a-d17aa82fadb1','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','ngapi-rice-salad','Ngapi-Rice Salad','ငပိထမင်း','Rice tossed in fermented fish paste curry (Nga-Pi), served with sunny-side-up egg.',1300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/91e9b2b4-199e-4035-a25a-d17aa82fadb1/fallback.jpg',true,false,'{fish,egg}','{}'),
('cea9f2e8-6bc1-40af-ae56-66bf72b7e10a','2fa67ae4-0709-48e8-942d-a37d5ea64e89','ohno-khao-swe','Ohno Khao-Swe','အုန်းနို့ခေါက်ဆွဲ','Coconut cream + chickpea curry broth with wheat noodles, chicken drum, egg, garnishes.',1500,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/cea9f2e8-6bc1-40af-ae56-66bf72b7e10a/photo.jpg',true,false,'{egg,gluten_wheat}','{}'),
('e2de3e65-1152-46b0-aada-531adf232409','8c069537-e7bc-47cd-a9ee-338539a8f764','parata','Parata (2 pcs)','ပလာတာ','Two pieces. Great with goat marrow soup/curries.',500,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/e2de3e65-1152-46b0-aada-531adf232409/photo.jpg',true,false,'{gluten_wheat}','{vegan-optional}'),
('b1c97519-5e99-414d-b86e-b8cb4899e649','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','peas-naan-pyar','Peas Naan-Pyar','ပဲ နံပြား','Slow-cooked Burmese Peas served with Naan (Pita Bread).',1000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/b1c97519-5e99-414d-b86e-b8cb4899e649/photo.jpg',true,false,'{gluten_wheat}','{}'),
('6834a8b3-e576-4db7-a148-1af1522a3c07','2fa67ae4-0709-48e8-942d-a37d5ea64e89','peas-parata','Peas Parata','ပဲ ပလာတာ','Slow-cooked Burmese Peas (ပဲပြုတ်) served with two sides of crispy Paratas.',1000,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/6834a8b3-e576-4db7-a148-1af1522a3c07/photo.jpg',true,false,'{gluten_wheat}','{}'),
('fc019b1a-4bf5-4440-8802-d37cb95a8b28','8c069537-e7bc-47cd-a9ee-338539a8f764','peas-steamed','Peas Steamed','ပဲပြုတ် (စားတော်ပဲ)','Slow-steamed Burmese brown peas, a quintessential Burmese breakfast side.',500,NULL,true,false,'{}','{vegan,allergen-reviewed}'),
('bb17dac2-a4c8-4f2a-b995-7bb3223ac91a','e04ee0c4-10eb-4d26-b065-a0d1fc759391','pickled-tea-salad','Pickled Tea Salad','လက်ဖတ်သုပ်','Pickled tea leaves + lettuce + crispy beans/nuts; includes peanuts + dried shrimp powder.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/bb17dac2-a4c8-4f2a-b995-7bb3223ac91a/photo.jpg',true,false,'{peanuts,shellfish}','{vegan-optional}'),
('8a6b004b-d26c-42ee-8b46-df41d2d29d73','48b9ad45-3000-49fe-9c1d-342134f0295f','pinto-beans','Pinto Beans','ပဲရေပွကြော်','Pinto beans stir-fried in Burmese style with onions, garlic, and spices.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/8a6b004b-d26c-42ee-8b46-df41d2d29d73/fallback.jpg',true,false,'{}','{vegetarian,allergen-reviewed,vegan-optional}'),
('8c6835b4-f950-463d-8fb1-f4909bcc9ddf','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','pork-curry','Pork Curry','ဝက်သနီ','Classic pork curry in sweet, mildly spiced sauce.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/8c6835b4-f950-463d-8fb1-f4909bcc9ddf/photo.jpg',true,false,'{soy}','{}'),
('1e445471-24e3-4d5a-8587-0833de439274','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','pork-horsegram-bean-curry','Pork Horsegram Bean Curry','ဝက်ပုန်းရည်ကြီး','Pork curry with horse gram beans; mildly spiced, earthy/nutty.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/1e445471-24e3-4d5a-8587-0833de439274/fallback.jpg',true,false,'{soy}','{}'),
('3aca57d6-2826-4e7d-9a40-322bf20d80ae','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','pork-offals-curry','Pork Offals Curry','ဝက်ကလီစာ','Pork offal + intestines + liver in mildly spiced sauce.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/3aca57d6-2826-4e7d-9a40-322bf20d80ae/photo.jpg',true,false,'{soy}','{}'),
('9c73efd6-2f03-4132-9269-8db3cb40d900','b8fc8e28-1adc-4ddd-8792-73fe4e320d48','pork-skewers','Pork Skewers','ဝက်သားဒုတ်ထိုး','Slow-cooked pork + intestines + liver in herbal spices; served with dipping sauce.',1500,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/9c73efd6-2f03-4132-9269-8db3cb40d900/fallback.jpg',true,false,'{}','{allergen-reviewed}'),
('b5e32112-3b8d-4231-b333-24b6af8be6f3','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','rakhine-mont-ti','Rakhine Mont-Ti','ရခိုင်မုန့်တီ','Traditional Rakhine Fish Soup with rice noodles, fish cakes, and onions.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/b5e32112-3b8d-4231-b333-24b6af8be6f3/photo.jpg',true,false,'{fish}','{}'),
('3bb53db5-6bdb-4d05-896f-9897789a9111','8c069537-e7bc-47cd-a9ee-338539a8f764','rice','Rice','ထမင်းဖြူ','Steamed plain white rice.',200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/3bb53db5-6bdb-4d05-896f-9897789a9111/fallback.jpg',true,false,'{}','{vegan,allergen-reviewed}'),
('06ec04ba-107b-426a-8ba7-ca900d59228a','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','rice-with-pickled-tea-salad','Rice with Pickled Tea Salad','လက်ဖက်ထမင်း','Rice tossed in pickled tea salad + garnishes, served with sunny-side-up egg.',1300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/06ec04ba-107b-426a-8ba7-ca900d59228a/photo.jpg',true,false,'{egg,peanuts,shellfish}','{vegan-optional}'),
('f4559130-0db0-490a-9079-c6e02d887147','91a0c27f-f00c-4a62-88ef-a5f952777e67','river-prawns-curry','River Prawns Curry','ပုဇွန်ထုပ်ဟင်း','Whole river prawns curry with aromatics + prawn oil.',2400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/f4559130-0db0-490a-9079-c6e02d887147/photo.jpg',true,false,'{shellfish}','{}'),
('b0e89c58-3560-42b5-830f-946ed18f1ec7','48b9ad45-3000-49fe-9c1d-342134f0295f','roselle-with-shrimp-curry','Roselle with Shrimp Curry','ချဥ်ပေါင်ကြော်','Roselle sour leaf curry with shrimp.',1400,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/b0e89c58-3560-42b5-830f-946ed18f1ec7/photo.jpg',true,false,'{shellfish}','{}'),
('a0fcb3f8-a047-43a0-98e9-46dd59431cf6','2fa67ae4-0709-48e8-942d-a37d5ea64e89','shan-noodles','Shan Noodles','ရှမ်းခေါက်ဆွဲ','Rice noodles with savory tomato-based sauce (pork) + peanuts, fried garlic, pickled mustard, chili paste.',1300,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/a0fcb3f8-a047-43a0-98e9-46dd59431cf6/fallback.jpg',true,false,'{peanuts}','{}'),
('6b506332-57f5-48a4-826e-29f5b96dc9cb','91a0c27f-f00c-4a62-88ef-a5f952777e67','snakehead-innards-curry','Snakehead Innards Curry','ငါးရံအူဟင်း','Snakehead intestines curry in spiced sauce.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/6b506332-57f5-48a4-826e-29f5b96dc9cb/fallback.jpg',true,false,'{fish}','{}'),
('c7bf96da-0823-4dfa-b47e-5ab0baffc42b','91a0c27f-f00c-4a62-88ef-a5f952777e67','swai-fish-curry','Swai Fish Curry','ငါးမြင်းဟင်း','Swai fish in mildly spiced sauce.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/c7bf96da-0823-4dfa-b47e-5ab0baffc42b/photo.jpg',true,false,'{fish}','{}'),
('5e47099b-3aa9-42ba-af2b-ac07cbf3d625','91a0c27f-f00c-4a62-88ef-a5f952777e67','sweet-shrimps-curry','Sweet Shrimps Curry','ပုဇွန်ကြော်နှပ်','Shrimp in mildly spiced sauce.',1900,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/5e47099b-3aa9-42ba-af2b-ac07cbf3d625/fallback.jpg',true,false,'{shellfish}','{}'),
('9bae9967-9899-4a41-8ef3-83590be924b4','3a6e126f-7a4a-4f47-a404-66f100e4aaa8','tom-yum-fried-rice-or-noodles','Tom-Yum Fried Rice / Noodles','တုန်ရန်းထမင်းကြော်/ခေါက်ဆွဲကြော်','Stir-fry with shrimp + vegetables + tom yum aromatics (lemongrass/galangal/kaffir lime).',1600,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/9bae9967-9899-4a41-8ef3-83590be924b4/fallback.jpg',true,false,'{shellfish,fish,egg}','{}'),
('a0d20fac-8480-41f3-ba6a-9327bfd621fc','e04ee0c4-10eb-4d26-b065-a0d1fc759391','tomato-salad','Tomato Salad','ခရမ်းချဥ်သီးသုပ်','Organic tomatoes + shallots + chickpea powder + lettuce + Thai chili.',1200,'https://ukuzkhuppqwtrdkjqrkv.supabase.co/storage/v1/object/public/menu-photos/a0d20fac-8480-41f3-ba6a-9327bfd621fc/photo.jpg',true,false,'{}','{vegetarian,allergen-reviewed,vegan-optional}')
on conflict (id) do nothing;

insert into item_modifier_groups (item_id, group_id) values ('54737e73-a455-4330-af28-83f6cfbdb762','08e48092-ff7c-4e62-95de-df5104df8179'),
('54737e73-a455-4330-af28-83f6cfbdb762','8e503358-61cb-44b6-bffb-3e8f24c0a9c0'),
('54737e73-a455-4330-af28-83f6cfbdb762','dc4943e3-a0b8-445b-a74f-4220cad2352f'),
('9bae9967-9899-4a41-8ef3-83590be924b4','7533d535-ac12-4cc2-95ec-717f9e125304'),
('304c176a-40fc-444a-a35a-fc31adb89ab1','f3d9171d-8c71-4504-847a-63a7021de48b'),
('2befdc69-1888-43bf-a474-c1ec7030f05b','acec222e-c859-4107-b971-c8916a150ad4'),
('d3b48fbc-506f-4cf4-ae5e-dd8d34bf81a9','13b87d9a-fc26-4555-ba7d-97e20b8b1198')
on conflict do nothing;

-- ============ Tax classification (CA CDTFA) ============
-- tax_category lives as a column on menu_items (set in the schema migration with a CHECK + default).
-- Set per category here, then override prepared HOT drinks (taxable even to-go).
update menu_items mi set tax_category = m.tax
from (values
  ('all-day-breakfast', 'hot_prepared'),
  ('rice-noodles-soups','hot_prepared'),
  ('sides',             'hot_prepared'),
  ('curries-a-la-carte','hot_prepared'),
  ('vegetables',        'hot_prepared'),
  ('seafood-curries',   'hot_prepared'),
  ('appetizers-salads', 'cold_food'),
  ('drinks',            'beverage_cold')
) as m(slug, tax)
join menu_categories c on c.slug = m.slug
where mi.category_id = c.id;

update menu_items set tax_category = 'beverage_hot' where slug in ('coffee', 'burmese-milk-tea');

-- ============ Grocery Scan & Go — the real 2022 catalog (W4a; generated, see supabase/data/) ============
-- GENERATED from supabase/data/grocery_catalog.json — do not hand-edit rows here.
-- 395 SKUs from the owner's wholesale/retail price lists (2021–2022 vintage).
-- ⚠️ PRICES NEED OWNER CONFIRMATION before this runs against the LIVE project — see
-- docs/GROCERY_MARKET_PLAN.md §catalog. Barcodes are GS1 store-internal EAN-13 (prefix 299),
-- deterministic per SKU; when a real shelf UPC is captured, insert/update that row's barcode.
insert into grocery_items
  (barcode, name, name_my, price_cents, tax_category, ebt_eligible, category, brand, sku, size_qty, size_unit, synonyms, compare_at_cents)
values
 ('2990030604133','Catfish & Noni Leaf Curry','ငါးခူရဲယိုရွက်ဟင်း-ဗူးဝိူင်း',390,'grocery_food',true,'canned-fish','Grandma','CF0413',120,'g','{}'::text[],549),
 ('2990071804011','Chicken Curry Paste','ကြက်သားဟင်းအနှစ်',286,'grocery_food',true,'canned-fish','Grandma','GR0401',150,'g','{}'::text[],399),
 ('2990030604010','Fish Curry Sauce (US)','ငါးဟင်းအနှစ်',292,'grocery_food',true,'canned-fish','Grandma','CF0401',150,'g','{}'::text[],399),
 ('2990190401030','Fish Sauce Frd 100g','ငံပြာရည်ကြော်',195,'grocery_food',true,'canned-fish','Grandma','SD0103',100,'g',array['ngan pya yay','fish sauce']::text[],249),
 ('2990190801106','Fish with Salt (100g)','ငါးဆားနယ်',325,'grocery_food',true,'canned-fish','Grandma','SH0110',100,'g','{}'::text[],449),
 ('2990071802055','Fried Carp Fish with Curry Sauce (100g)','ငါးကြင်းကြော်နှပ်',292,'grocery_food',true,'canned-fish','Grandma','GR0205',100,'g','{}'::text[],399),
 ('2990030604058','Fried Dried Fish with Tomato','ငါးခြောက်ခရမ်းချဉ်',429,'grocery_food',true,'canned-fish','Grandma','CF0405',130,'g','{}'::text[],599),
 ('2990030602016','Hilsa Fish Stm','ငါးသလောက်ပေါင်း',286,'grocery_food',true,'canned-fish','Grandma','CF0201',130,'g','{}'::text[],399),
 ('2990030602092','Hilsa Fish Stm-1 lb','ငါးသလောက်ပေါင်း -1 lb',715,'grocery_food',true,'canned-fish','Grandma','CF0209',400,'g','{}'::text[],799),
 ('2990030602023','Hilsa Tomato Fish Curry','ငါးသလောက်ခရမ်းချဉ်',286,'grocery_food',true,'canned-fish','Grandma','CF0202',130,'g','{}'::text[],399),
 ('2990030602108','Hilsa Tomato Fish Curry-1lb','ငါးသလောက်ခရမ်းချဉ် -1lb',748,'grocery_food',true,'canned-fish','Grandma','CF0210',400,'g','{}'::text[],null),
 ('2990030604027','Mon traditional Thingyan fry','မွန်ရိုးရာသင်္ကြန်ကြော်-130g',390,'grocery_food',true,'canned-fish','Grandma','CF0402',130,'g','{}'::text[],549),
 ('2990030602030','Nga Gyin with Fermented Soy Beans','ငါးကြင်းပဲငပိ',292,'grocery_food',true,'canned-fish','Grandma','CF0203',100,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],399),
 ('2990030602078','Sardine -160g','ငါးသေတ္တာ(ဘူးရှည်)-155g',104,'grocery_food',true,'canned-fish','Grandma','CF0207',155,'g','{}'::text[],149),
 ('2990030602061','Sardines in Tomato Sauce','ငါးသေတ္တာ',130,'grocery_food',true,'canned-fish','Grandma','CF0206',150,'g','{}'::text[],199),
 ('2990030604102','Sour Bamboo Shoot & Fish Curry-400g','ငါးမျှစ်ချဉ်-400g',663,'grocery_food',true,'canned-fish','Grandma','CF0410',400,'g','{}'::text[],799),
 ('2990030604126','Squid Curry','ကင်းပွန်းဟင်း-ဘူးဝိုင်း',390,'grocery_food',true,'canned-fish','Grandma','CF0412',125,'g','{}'::text[],549),
 ('2990071802031','Steamed Nga Gyin Fish in Curry Sauce (130g)','ငါးကြင်းပေါင်း',292,'grocery_food',true,'canned-fish','Grandma','GR0203',130,'g','{}'::text[],399),
 ('2990030604164','Striped Caffish & Mango Curry -120g','ငါးတန်သရက်သီး-ဘူးဝိုင်း',390,'grocery_food',true,'canned-fish','Grandma','CF0416',120,'g','{}'::text[],549),
 ('2990030604171','Striped Caffish & Mango Curry -1lb','ငါးတန်သရက်သီး-1lb',715,'grocery_food',true,'canned-fish','Grandma','CF0417',400,'g','{}'::text[],799),
 ('2990030604140','Striped Caffish & Tomato Curry -120g','ငါးတန်ခရမ်းချဉ်သီး-ဗူးဝိုင်း',390,'grocery_food',true,'canned-fish','Grandma','CF0414',120,'g','{}'::text[],549),
 ('2990030604157','Striped Caffish & Tomato Curry -1lb','ငါးတန်ခရမ်းချဉ်သီး-1lb',715,'grocery_food',true,'canned-fish','Grandma','CF0415',400,'g','{}'::text[],799),
 ('2990030604072','Tomato and Drumstick Curry-400g','ငါးခခြာက်ခရမ်းချဉ်သီးဒန့်တလွန်-400g',663,'grocery_food',true,'canned-fish','Grandma','CF0407',400,'g','{}'::text[],799),
 ('2990030602085','Sardin In Tomato Sauce','ဆားဒင်း ၁ပေါင်ဘူး',371,'grocery_food',true,'canned-fish',null,'CF0208',null,null,'{}'::text[],499),
 ('2990030604119','Bamboo Ta La Pop Curry(400 g)','မျှစ်တာလပေါဟင်း-400g',546,'grocery_food',true,'canned-vegetables','Grandma','CF0411',400,'g','{}'::text[],799),
 ('2990031407122','Banana Blossom (400g)','ငှက်ပျောဖူးပြုတ် -400g',520,'grocery_food',true,'canned-vegetables','Grandma','CN0712',400,'g','{}'::text[],799),
 ('2990031407153','Boiled Banana Stem (400g)','ငှက်ပျောအူပြုတ်(400g)',455,'grocery_food',true,'canned-vegetables','Grandma','CN0715',400,'g','{}'::text[],699),
 ('2990031407184','Boiled Jackfruit (400g)','ပိန္နဲကွင်းပြုတ်-400g',455,'grocery_food',true,'canned-vegetables','Grandma','CN0718',400,'g','{}'::text[],699),
 ('2990031407078','Boiled Pithecellobium Lobatum Benth(400g)','တညင်းသီးပြုပ် -400g',624,'grocery_food',true,'canned-vegetables','Grandma','CN0707',400,'g','{}'::text[],949),
 ('2990031407160','Boiled Senna Siamea (400g)','မယ်ဇလီပြုပ်-400g',520,'grocery_food',true,'canned-vegetables','Grandma','CN0716',400,'g','{}'::text[],799),
 ('2990030604089','Boiled Yellow Bea-400g','စားတော်ပဲပြုတ်-400g',390,'grocery_food',true,'canned-vegetables','Grandma','CF0408',400,'g',array['pe','bean']::text[],599),
 ('2990030603020','Chickpea Curry','သတ်သတ်လွတ်ကုလားပဲဟင်း-150g',260,'grocery_food',true,'canned-vegetables','Grandma','CF0302',150,'g',array['pe','bean']::text[],399),
 ('2990030603044','Chickpea Curry (1lb)','သတ်သတ်လွတ်ကုလားပဲဟင်း(1lb)',572,'grocery_food',true,'canned-vegetables','Grandma','CF0304',400,'g',array['pe','bean']::text[],849),
 ('2990030603068','Chickpea Vegetable Curry-400g','သီးစုံကုလားပဲဟင်း-400g',572,'grocery_food',true,'canned-vegetables','Grandma','CF0306',400,'g',array['pe','bean']::text[],849),
 ('2990031407214','Curcuma Zedoaria(400 g)','မာလာဖူး-400g',520,'grocery_food',true,'canned-vegetables','Grandma','CN0721',400,'g',array['mala','malar']::text[],799),
 ('2990031407115','Dillenia indica (400g)','သပြူသီးပြုတ် -400g',429,'grocery_food',true,'canned-vegetables','Grandma','CN0711',400,'g','{}'::text[],649),
 ('2990071803045','Fried Acacia Concinna-150g','ကင်ပွန်းချဉ်ရွက်ကြော်-150g',260,'grocery_food',true,'canned-vegetables','Grandma','GR0304',150,'g','{}'::text[],399),
 ('2990030604188','Fried Broad Bean in Tomato','ခရမ်းချဉ်သီးပဲကြီးကြော်',390,'grocery_food',true,'canned-vegetables','Grandma','CF0418',130,'g',array['pe','bean']::text[],599),
 ('2990190809119','Fried Fish Paste with Lemon Grass','စပါးလင်ငပိကြော်',325,'grocery_food',true,'canned-vegetables','Grandma','SH0911',150,'g',array['ngapi','nga pi','shrimp paste']::text[],499),
 ('2990030603013','Fried Roselle Leaves (150g)','ချဉ်ပေါင်ကြော်-150g',260,'grocery_food',true,'canned-vegetables','Grandma','CF0301',150,'g','{}'::text[],399),
 ('2990030604096','Fried Santol Fruit-130g','သစ်တိုသီးကြော်-130g',260,'grocery_food',true,'canned-vegetables','Grandma','CF0409',130,'g','{}'::text[],399),
 ('2990071803038','Fried Tamarind Paste [Grandma]','မန်ကျည်းသီးထောင်ကြော်(Grandma)',260,'grocery_food',true,'canned-vegetables','Grandma','GR0303',130,'g','{}'::text[],399),
 ('2990071804035','Instant Fresh water fish (150g)','ရေချိုငပိဖျော်ရည်-150g',260,'grocery_food',true,'canned-vegetables','Grandma','GR0403',150,'g',array['ngapi','nga pi','shrimp paste']::text[],399),
 ('2990071804066','Instant Fresh water fish (400g)','ငပိရေချို-400g',650,'grocery_food',true,'canned-vegetables','Grandma','GR0406',400,'g',array['ngapi','nga pi','shrimp paste']::text[],999),
 ('2990071804073','Instant Fresh water fish (400g)Ready','အသင့်စားငပိရေချို-400g',689,'grocery_food',true,'canned-vegetables','Grandma','GR0407',400,'g',array['ngapi','nga pi','shrimp paste']::text[],999),
 ('2990160603020','Mango Pickle (400g)','သရက်သီးသနပ် (Grandma)',572,'grocery_food',true,'canned-vegetables','Grandma','PF0302',400,'g','{}'::text[],849),
 ('2990190809102','Pithecellobium Lobatum Benth with Shrimp Paste','တညင်းသီးငပိချက် (ဗူးဝိုင်း)',390,'grocery_food',true,'canned-vegetables','Grandma','SH0910',150,'g',array['ngapi','nga pi','shrimp paste']::text[],599),
 ('2990190809133','Pithecellobium Lobatum Benth with Shrimp Paste','တညင်းသီးငပိချက် (ဗူးရှည်)',390,'grocery_food',true,'canned-vegetables','Grandma','SH0913',150,'g',array['ngapi','nga pi','shrimp paste']::text[],599),
 ('2990030603051','Roselle Lvs Frd (1lb)','ချဉ်ပေါင်ကြော် -1lb',572,'grocery_food',true,'canned-vegetables','Grandma','CF0305',400,'g','{}'::text[],849),
 ('2990071804059','Salted Soy Bean in Tomato Sauce','ခရမ်းချဉ်သီးပဲငပိ',260,'grocery_food',true,'canned-vegetables','Grandma','GR0405',150,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],399),
 ('2990031409133','Soy Bean Curd (160g)','ဆီတို့ဖူး-160g',358,'grocery_food',true,'canned-vegetables','Grandma','CN0913',160,'g',array['pe','bean']::text[],549),
 ('2990031409041','Soy Bean Swt Can - Ahphwar Letyar','ပဲငပိ အချိုဖွားလက်ရာ',260,'grocery_food',true,'canned-vegetables','Grandma','CN0904',150,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],399),
 ('2990030604065','Tomato (400g)','ကိုင်းခရမ်းချဉ်-400g',520,'grocery_food',true,'canned-vegetables','Grandma','CF0406',400,'g','{}'::text[],799),
 ('2990030604034','Tomato Pounded Ngapi (130g)','ခရမ်းချဉ်သီးငပိချက်',390,'grocery_food',true,'canned-vegetables','Grandma','CF0403',130,'g',array['ngapi','nga pi','shrimp paste']::text[],599),
 ('2990031407177','Steam Banana -400g','ဌက်ပျောပေါင်း-400g',446,'grocery_food',true,'canned-vegetables',null,'CN0717',null,null,'{}'::text[],649),
 ('2990032002012','Tea Mix - Authetic Myanmar','အော်တေးတစ်တီးမစ်',715,'grocery_food',true,'coffee-drinks','Authentic','CT0201',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002180','Best Thai Teamix','ဘက်ထိုင်းတီးမစ်',715,'grocery_food',true,'coffee-drinks','Best','CT0218',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032001053','Coffee Mix-Birdy (528g)','ဘတ်ဒီကော်ဖီမစ်',585,'grocery_food',true,'coffee-drinks','Birdy','CT0105',411,'g',array['kaw phi','coffee mix']::text[],849),
 ('2990032004016','Calsome Nutritious Cereal Drink','ကယ်ဆီယမ်ကွေကာ',780,'grocery_food',true,'coffee-drinks','Calsome','CT0401',750,'g',array['kaw phi','coffee mix']::text[],1149),
 ('2990032001015','Gold Roast Coffeemix(Big) (1000g)','ဂိုးရို့ကော်ဖီ(Big)',1007,'grocery_food',true,'coffee-drinks','Gold Roast','CT0101',1000,'g',array['kaw phi','coffee mix']::text[],1449),
 ('2990032001022','Gold Roast Coffeemix(Small) (600g)','ဂိုးရို့ကော်ဖီ(Small)',715,'grocery_food',true,'coffee-drinks','Gold Roast','CT0102',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002029','Grand Palace Tea','ဂရမ်းပဲလေ့တီးမစ်',715,'grocery_food',true,'coffee-drinks','Grand Palace','CT0202',600,'g',array['pe','bean','kaw phi','coffee mix']::text[],1049),
 ('2990032001121','Coffee Mix (Special)-Happy','ဟက်ပီးရှယ်ကော်ဖီမစ်',734,'grocery_food',true,'coffee-drinks','Happy','CT0112',660,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002135','Coffee Mix -Happy','ဟက်ပီးကော်ဖီမစ်',734,'grocery_food',true,'coffee-drinks','Happy','CT0213',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002104','Tea Mix -Happy','ဟက်ပီးတီးမစ်',734,'grocery_food',true,'coffee-drinks','Happy','CT0210',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032001107','Haw Nan Coffeemix','ဟော်နန်းကော်ဖီမစ်',715,'grocery_food',true,'coffee-drinks','Haw Nan','CT0110',350,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002166','Tea Mix Hello','Hello တီးမစ်',715,'grocery_food',true,'coffee-drinks','Hello','CT0216',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002098','Tea Mix-Hi Tea (900g)','ဟိုင်းတီး တီးမစ်',618,'grocery_food',true,'coffee-drinks','Hi Tea','CT0209',900,'g',array['kaw phi','coffee mix']::text[],899),
 ('2990032001091','Italo Coffeemix','အိုင်တလိုကော်ဖီမစ်',715,'grocery_food',true,'coffee-drinks','Italo','CT0109',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002128','Coffee Mix-Platinum','ပလက်တီနမ်ကော်ဖီမစ်',715,'grocery_food',true,'coffee-drinks','Platinum','CT0212',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002036','Tea Mix - Platinum Milk Tea (750g)','ပလက်တီနမ် တီးမစ်',715,'grocery_food',true,'coffee-drinks','Platinum','CT0203',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032001077','Premier Coffeemix','ပရီမီယား ကော်ဖီမစ်',715,'grocery_food',true,'coffee-drinks','Premier','CT0107',540,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032001138','Premier Coffeemix(2 plus 1)','ပရီမီယား ကော်ဖီမစ်(2plus 1)',780,'grocery_food',true,'coffee-drinks','Premier','CT0113',540,'g',array['kaw phi','coffee mix']::text[],1149),
 ('2990032002043','Tea mix - Royal Myanmar 600g','ရွိုင်ရယ်မြန်မာတီးမစ်',715,'grocery_food',true,'coffee-drinks','Royal Myanmar','CT0204',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990041803013','Royal D','ရွိုင်ရယ်ဒီ',247,'grocery_food',true,'coffee-drinks','Royal-D','DR0301',null,null,array['kaw phi','coffee mix']::text[],349),
 ('2990032002197','SIP Coffeemixd-750g','အက်အိုင်ပီ ကော်ဖီမစ်-750g',715,'grocery_food',true,'coffee-drinks','SIP','CT0219',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032003019','Tea Black Powder-Soe Win','စိုးဝင်းအကျရည်',449,'grocery_food',true,'coffee-drinks','Soe Win','CT0301',160,'g',array['kaw phi','coffee mix']::text[],649),
 ('2990032001039','Coffee Mix - Sunday','ဆန်းဒေး ကော်ဖီမစ်',734,'grocery_food',true,'coffee-drinks','Sunday','CT0103',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032001084','Sunday 3 in 1 Coffeemix (Natphyaw)','ဆန်းဒေးကော်ဖီမစ်(နှပ်ဖျော်)',715,'grocery_food',true,'coffee-drinks','Sunday','CT0108',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002111','Sunday Shop Made Tea Mix','ဆန်းဒေးတီးမစ်(ဆိုင်ဖျော်)',734,'grocery_food',true,'coffee-drinks','Sunday','CT0211',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002067','Sunday Teamix','ဆန်းဒေးတီးမစ်',650,'grocery_food',true,'coffee-drinks','Sunday','CT0206',750,'g',array['kaw phi','coffee mix']::text[],949),
 ('2990032001060','Coffee Mix Super (600g)','စူပါကော်ဖီမစ် (၆၀၀g)',689,'grocery_food',true,'coffee-drinks','Super','CT0106',600,'g',array['kaw phi','coffee mix']::text[],999),
 ('2990032004047','Super Oat Mix','Sueper ကွေကာ',715,'grocery_food',true,'coffee-drinks','Super','CT0404',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002159','T-Time Myanmar Teamix -750g','တီ-တိုင်းမြန်မာတီးမစ် - 750g',715,'grocery_food',true,'coffee-drinks','T-Time Myanmar','CT0215',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002074','Tea Mix-Tea Master (600g)','တီးမာစတာ-တီးမစ်',715,'grocery_food',true,'coffee-drinks','Tea Master','CT0207',600,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032002081','Tea Mix-Tea Plus (900g)','တီးပလပ်တီးမစ်',715,'grocery_food',true,'coffee-drinks','Tea Plus','CT0208',750,'g',array['kaw phi','coffee mix']::text[],1049),
 ('2990032004078','Vigo Oat Mix','Vigo ကွေကာ',682,'grocery_food',true,'coffee-drinks','Vigo','CT0407',500,'g',array['kaw phi','coffee mix']::text[],999),
 ('2990032004061','Vigo Oat Mix (Corn)','Vigo ကွေကာ ပြောင်းဖူး',682,'grocery_food',true,'coffee-drinks','Vigo','CT0406',500,'g',array['kaw phi','coffee mix']::text[],999),
 ('2990032004054','Vigo Oat Mix(banna)','Vigo ကွေကာ ငှက်ပျောသိး',682,'grocery_food',true,'coffee-drinks','Vigo','CT0405',500,'g',array['kaw phi','coffee mix']::text[],999),
 ('2990032001176','Saint Tea- Teamin (Itolo)','စိမ့်တီးတီးမစ်',817,'grocery_food',true,'coffee-drinks',null,'CT0117',null,null,'{}'::text[],1199),
 ('2990031402066','Tempura Flour, Shwe Late Pyar','ရွှေလိပ်ပြာ အကြော်မှုန့်',179,'grocery_food',true,'cooking','Golden Butterfly','CN0206',150,'g','{}'::text[],249),
 ('2990031402028','Chick Pea Pwdr - Hmwe','မွှေးပဲစိမ်းမှုန့်',179,'grocery_food',true,'cooking','Hmwe','CN0202',150,'g',array['pe','bean']::text[],249),
 ('2990031402042','Chickpea Pwdr Rst - Hmwe','မွှေးကုလားပဲဘယာကြော်မှုန့်',179,'grocery_food',true,'cooking','Hmwe','CN0204',150,'g',array['pe','bean']::text[],249),
 ('2990031402035','Hmwaye Beans Powder 150g','မွှေးပဲကျက်မှုန့်',179,'grocery_food',true,'cooking','Hmwe','CN0203',150,'g',array['pe','bean']::text[],249),
 ('2990031402219','Hmwaye Beans Tempura Flour Powder 150g','မွှေးမတ်ပဲအကြော်မှုန့်',299,'grocery_food',true,'cooking','Hmwe','CN0221',150,'g',array['pe','bean']::text[],399),
 ('2990031403070','Hmwe Roasted Tofu Powder-150g','မွှေးတို့ဟူးမှုန့်-150g',194,'grocery_food',true,'cooking','Hmwe','CN0307',150,'g','{}'::text[],249),
 ('2990031403063','Hnwe Roasted Rice Powder-150g','မွှေးမုန့်ဟင်းခါးအမှုန့်-150g',179,'grocery_food',true,'cooking','Hmwe','CN0306',150,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],249),
 ('2990031402059','Rice Pwdr Rst - Hmwe','မွှေးဆန်လှော်မှုန့်',179,'grocery_food',true,'cooking','Hmwe','CN0205',150,'g','{}'::text[],249),
 ('2990031402196','Curry Powder - Ka Lar Lay(240g)','ကုလားလေးမဆလာ(240g)',658,'grocery_food',true,'cooking','Kalarlay','CN0219',240,'g','{}'::text[],849),
 ('2990131901049','Marian Plum pownded Shrimp Paste (pck)- Morning Star','မရမ်းသီးငပိထောင်း(၁၀ထုတ်တွဲ)(Morning Star)',858,'grocery_food',true,'cooking','Morning Star','MS0104',500,'g',array['ngapi','nga pi','shrimp paste','zee','zi','plum']::text[],null),
 ('2990031409010','Horsegram Soy Pst - Myaing','မြိုင် ပုန်းရည်ကြီး',598,'grocery_food',true,'cooking','Myain','CN0901',170,'g',array['pe','bean']::text[],799),
 ('2990031409089','Horsegran Soy Pst- Myin Pyan','ပုန်းရည်ကြီး -မြင်းပျံ',523,'grocery_food',true,'cooking','Myin Pyan','CN0908',370,'g',array['pe','bean']::text[],699),
 ('2990160607011','Soya Bean Sauce (Owl)','ဇီးကွက်ပုန်းရည်ကြီး',658,'grocery_food',true,'cooking','Owl','PF0701',300,'g',array['pe','bean']::text[],849),
 ('2990031401021','Bean Black (1000g)','ချင်းပဲ (900g)',1170,'grocery_food',true,'cooking','Sein Hinthar','CN0102',900,'g',array['gyin','ginger','pe','bean']::text[],null),
 ('2990031402011','Bean Powder Rst (US)','စိန်င်္ဟာ ပဲအကျက်မှုန့်',195,'grocery_food',true,'cooking','Sein Hinthar','CN0201',160,'g',array['pe','bean']::text[],249),
 ('2990031401106','Big Bean','ပဲကြီး',390,'grocery_food',true,'cooking','Sein Hinthar','CN0110',453,'g',array['pe','bean']::text[],499),
 ('2990031401090','Black Eye Beans','ပဲလွန်းကြား',390,'grocery_food',true,'cooking','Sein Hinthar','CN0109',453,'g',array['pe','bean']::text[],499),
 ('2990031401076','Black Eye Beans(White)','ပဲလွန်းဖြူ',390,'grocery_food',true,'cooking','Sein Hinthar','CN0107',453,'g',array['pe','bean']::text[],499),
 ('2990191403026','Butter Bean Rsd','ပဲကြီးလှော်',390,'grocery_food',true,'cooking','Sein Hinthar','SN0302',227,'g',array['pe','bean']::text[],499),
 ('2990031401052','Chick Pea -454g','ကုလားပဲခြမ်း-454g',390,'grocery_food',true,'cooking','Sein Hinthar','CN0105',454,'g',array['pe','bean']::text[],499),
 ('2990031402080','Chili Powder (160g)','ငြုပ်သီးအကျက်မှုန့် အထုပ်-160g',358,'grocery_food',true,'cooking','Sein Hinthar','CN0208',160,'g','{}'::text[],449),
 ('2990031402073','Chili Pwdr Rst Bot(220g)','ငြုပ်သီးအကျက်မှုန့် ဗူး',520,'grocery_food',true,'cooking','Sein Hinthar','CN0207',220,'g','{}'::text[],699),
 ('2990031402165','Chilli Powder Roasted bot-220g','ငြုပ်သီးအစိမ်းမှုန့် ဗူး-220g',500,'grocery_food',true,'cooking','Sein Hinthar','CN0216',220,'g','{}'::text[],649),
 ('2990031402202','Chilli Powder Roasted pack-160g','ငြုပ်သီးအစိမ်းမှုန့် အထုတ်-160g',390,'grocery_food',true,'cooking','Sein Hinthar','CN0220',160,'g','{}'::text[],499),
 ('2990190803025','Dried Catfish - Can','ငါးတန်ခြောက်-ဗူး',1300,'grocery_food',true,'cooking','Sein Hinthar','SH0302',160,'g','{}'::text[],null),
 ('2990190803018','Dried Catfish - Packet','ငါးတန်ခြောက်-အထုတ်',845,'grocery_food',true,'cooking','Sein Hinthar','SH0301',160,'g','{}'::text[],999),
 ('2990190801113','Dwarf Catfish Pst-1000g','မော်လမြိုင်ငဇင်ရိုင်းငပိ-1000g',13000,'grocery_food',true,'cooking','Sein Hinthar','SH0111',1000,'g',array['ngapi','nga pi','shrimp paste']::text[],null),
 ('2990190801038','Dwarf Catfish Pst-454g','မော်လမြိုင်ငဇင်ရိုင်းငပိ-၄၅၄g',546,'grocery_food',true,'cooking','Sein Hinthar','SH0103',454,'g',array['ngapi','nga pi','shrimp paste']::text[],699),
 ('2990190801120','Dwarf Catfish Pst-5 viss','မော်လမြိုင်ငဇင်ရိုင်းငပိ-8 ပိဿာ',13000,'grocery_food',true,'cooking','Sein Hinthar','SH0112',null,null,array['ngapi','nga pi','shrimp paste']::text[],null),
 ('2990190802028','Fish Sauce(Aoe Tat)-330g','အိုးတက်ငံပြာရည်(330g)',260,'grocery_food',true,'cooking','Sein Hinthar','SH0202',330,'g',array['ngan pya yay','fish sauce']::text[],349),
 ('2990191407086','Fried Chickpeas (1000g)','ကုလားကြော်(၁၀၀၀g)',780,'grocery_food',true,'cooking','Sein Hinthar','SN0708',1000,'g',array['pe','bean']::text[],999),
 ('2990191407079','Fried Peas (1000g)','ပဲဖူးကြော်(၁၀၀၀g)',780,'grocery_food',true,'cooking','Sein Hinthar','SN0707',1000,'g',array['pe','bean']::text[],999),
 ('2990031404060','Ka Yin Gyi - Salted Fish (8 viss)','ကရင်ကြီး ငပိ (၈ပိဿာ)',13000,'grocery_food',true,'cooking','Sein Hinthar','CN0406',null,null,array['ngapi','nga pi','shrimp paste']::text[],null),
 ('2990031404077','Ka Yin Gyi - Salted Fish -2400g','ကရင်ကြီး ငပိ (2400g)',2600,'grocery_food',true,'cooking','Sein Hinthar','CN0407',2400,'g',array['ngapi','nga pi','shrimp paste']::text[],null),
 ('2990031404022','Ka Yin Gyi - Salted Fish Big Bot','ကရင်ကြီး ငပိ ဗူးကြီး(700g)',975,'grocery_food',true,'cooking','Sein Hinthar','CN0402',700,'g',array['ngapi','nga pi','shrimp paste']::text[],null),
 ('2990031404039','Ka Yin Gyi - Salted Fish Small Bot(454g)','ကရင်ကြီး ငပိ ဗူးသေး(454g)',572,'grocery_food',true,'cooking','Sein Hinthar','CN0403',454,'g',array['ngapi','nga pi','shrimp paste']::text[],749),
 ('2990031409140','Peanut Oil (Sein Hinthar)-4000g','စိန်င်္ဟသာမြေပဲဆီ-4000g',5200,'grocery_food',true,'cooking','Sein Hinthar','CN0914',4000,'g',array['pe','bean']::text[],null),
 ('2990031401069','Pepper Black bottle(Hanthar)-85g','ငြုပ်သကောင်းမှုန့် ပုလင်း(ဟံသာ)-85g',260,'grocery_food',true,'cooking','Sein Hinthar','CN0106',85,'g','{}'::text[],349),
 ('2990031401113','Red Bean','ပဲနီလေး',390,'grocery_food',true,'cooking','Sein Hinthar','CN0111',380,'g',array['pe','bean']::text[],499),
 ('2990031402172','Roasted Chili Powder (Hanthar)','ငြုပ်သီးအကျက်မှုန့်ဗူး(ဟံသာ)',358,'grocery_food',true,'cooking','Sein Hinthar','CN0217',160,'g','{}'::text[],449),
 ('2990031409102','Salted Preserved Dry Soya Beans 227g','ပဲငပိအစေ့ခြောက် 227g',455,'grocery_food',true,'cooking','Sein Hinthar','CN0910',227,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],599),
 ('2990031409119','Salted Preserved Soya Beans','ပဲငပိအဝိုင်းခြောက်',455,'grocery_food',true,'cooking','Sein Hinthar','CN0911',113,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],599),
 ('2990190402013','Shrimp Marian Pst Pnd','မရမ်းသီးငပိထောင်းဗူး',234,'grocery_food',true,'cooking','Sein Hinthar','SD0201',100,'g',array['ngapi','nga pi','shrimp paste']::text[],299),
 ('2990190801045','Shrimp Paste, Sein Hinthar Brand (454g)','စိမ်းစားငပိ -၄၅၄ g',546,'grocery_food',true,'cooking','Sein Hinthar','SH0104',454,'g',array['ngapi','nga pi','shrimp paste']::text[],699),
 ('2990031409058','Soy Sauce','လှောင်ချိုင်ပဲဆီ',260,'grocery_food',true,'cooking','Sein Hinthar','CN0905',340,'g',array['pe','bean']::text[],349),
 ('2990031409164','Soy Sauce - Wei Wan','ဝေ့ဝမ်းပဲငံပြာရည်',390,'grocery_food',true,'cooking','Sein Hinthar','CN0916',700,'g',array['ngan pya yay','fish sauce','pe','bean']::text[],499),
 ('2990031409072','Soya Bean Curd-280g','ဆီတို့ဖူး-280g',358,'grocery_food',true,'cooking','Sein Hinthar','CN0907',280,'g',array['pe','bean']::text[],449),
 ('2990031402103','Turmeric Powder Bot','နနွန်းမှုန့် ဗူး',325,'grocery_food',true,'cooking','Sein Hinthar','CN0210',160,'g','{}'::text[],399),
 ('2990031402110','Turmeric Pwdr Pck','နနွန်းမှုန့် အထုပ်',260,'grocery_food',true,'cooking','Sein Hinthar','CN0211',160,'g','{}'::text[],349),
 ('2990031401083','White Pea','စားတော်ပဲ',390,'grocery_food',true,'cooking','Sein Hinthar','CN0108',453,'g',array['pe','bean']::text[],499),
 ('2990190802011','fish Sauce-SeinHinthar(8Viss)','ငံပြာရည်-စိန်င်္ဟာ(၈ ပိဿာ)',13000,'grocery_food',true,'cooking','Sein Hinthar','SH0201',null,null,array['ngan pya yay','fish sauce']::text[],null),
 ('2990031402134','Curry Powder, Shwe Kyatpha (540g)','ရွှေကြက်ဖမဆလာ',4934,'grocery_food',true,'cooking','Shwe Kyat Pha','CN0213',null,null,'{}'::text[],null),
 ('2990031402097','Curry Pwdr - Sweety','ဆွီတီးမဆလာ',561,'grocery_food',true,'cooking','Sweety','CN0209',240,'g','{}'::text[],749),
 ('2990031409065','Soybean Round Slt-Taung Tan Mal','တောင်တန်းမယ် ပဲပုတ်ခြောက်ပဲငပိ အဝိုင်း',449,'grocery_food',true,'cooking','Taung Tan Mal','CN0906',250,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],599),
 ('2990201302059','Furmerted Bean Curd-(Times Mon)','ဆီတို့ဟူး(Times Mon)',572,'grocery_food',true,'cooking','Times Mon','TM0205',300,'g',array['pe','bean']::text[],749),
 ('2990201302011','Mango Paste - Times Mon','သရက်သီးသနပ် (Times Mon)',572,'grocery_food',true,'cooking','Times Mon','TM0201',275,'g','{}'::text[],749),
 ('2990201305036','Roasted Bean Powder (160g) Times Mon','ပဲကျပ်မှုန့် (၁၆၀g) Times Mon',286,'grocery_food',true,'cooking','Times Mon','TM0503',160,'g',array['pe','bean']::text[],349),
 ('2990201305012','Roasted Chilli powder (160g) Times Mon','ငြုပ်သီးအကျက်မှုန့် (၁၆၀g) Times Mon',260,'grocery_food',true,'cooking','Times Mon','TM0501',160,'g','{}'::text[],349),
 ('2990201304053','Roasted Lablab Beans (160g) Times Mon','ပဲကြီးလှော် (၁၆၀g) Times Mon',358,'grocery_food',true,'cooking','Times Mon','TM0405',160,'g',array['pe','bean']::text[],449),
 ('2990031402189','Roasted Chickpea Powder','ပဲကျတ်မှုန့် (ဟံသာ)',371,'grocery_food',true,'cooking',null,'CN0218',null,null,array['pe','bean']::text[],499),
 ('2990031409034','Soy Bean Slt Pck','ပဲငပိခြောက်ထုတ်',520,'grocery_food',true,'cooking',null,'CN0903',null,null,array['ngapi','nga pi','shrimp paste','pe','bean']::text[],699),
 ('2990191404016','Fish Crackers-Hinthar (155g)','ဟင်္သာငါးမုန့် (155g)',493,'grocery_food',true,'health','Hinthar','SN0401',155,'g','{}'::text[],null),
 ('2990031403094','Hmwe Soya Chunks','မွှေးအသားတု',740,'grocery_food',true,'health','Hmwe','CN0309',150,'g','{}'::text[],null),
 ('2990130401090','Lingzhi Analgesic Balm','လင်ဇီးလိမ်းဆေး(6pcs/pk)',4485,'retail_nonfood',false,'health','Lingzhi','MD0109',600,'g','{}'::text[],null),
 ('2990130401076','Dermatitis Med- Madi','မဒီတင်းတိတ်ပြောက်ဆေး',344,'retail_nonfood',false,'health','MaDi','MD0107',null,null,'{}'::text[],null),
 ('2990191404030','Fish Crackers-Ngwe Pinlae (155g)','ငါးမုန့်ငွေပင်လယ်ငါးမုန့်(120g)',598,'grocery_food',true,'health','Ngwe Pinlae','SN0403',160,'g','{}'::text[],null),
 ('2990160601088','Betel Lvs Stm-250g','ကွမ်းရွက်ပေါင်း(250g)',455,'retail_nonfood',false,'health','Sein Hinthar','PF0108',250,'g',array['kun','betel','kwun']::text[],null),
 ('2990160601064','Betel Nut (Circle)','ကွမ်းသီးအဝိုင်းညှပ်',1040,'retail_nonfood',false,'health','Sein Hinthar','PF0106',454,'g',array['kun','betel','kwun']::text[],null),
 ('2990160601040','Betel Nut (Whole)','ကွမ်းသီးလုံး',650,'retail_nonfood',false,'health','Sein Hinthar','PF0104',454,'g',array['kun','betel','kwun']::text[],null),
 ('2990031401045','Deired Chilli','ငြုပ်သီးအခြောက်တောင့်',455,'grocery_food',true,'health','Sein Hinthar','CN0104',200,'g','{}'::text[],null),
 ('2990031406118','Dried Quince-110g','ချဉ်စော်ကားသီးခြောက်-110g',390,'grocery_food',true,'health','Sein Hinthar','CN0611',110,'g','{}'::text[],null),
 ('2990031406132','Dried Thit-To Fruit (200g)','သစ်တိုသီးခြောက်-200g',325,'grocery_food',true,'health','Sein Hinthar','CN0613',200,'g','{}'::text[],null),
 ('2990031409126','Dried Tofu pk-160g','တို့ဟူးခြောက်ထုပ် -160g',390,'grocery_food',true,'health','Sein Hinthar','CN0912',160,'g','{}'::text[],null),
 ('2990031412010','Fried Sesame (227g)','နှမ်းလှော်-227g',442,'grocery_food',true,'health','Sein Hinthar','CN1201',227,'g','{}'::text[],null),
 ('2990031412027','Fried Sesame (454g)','နှမ်းလှော်-454g',520,'grocery_food',true,'health','Sein Hinthar','CN1202',454,'g','{}'::text[],null),
 ('2990031406019','Marium Plum Drd','ဟင်းချက်မရမ်းပြား -454g',780,'grocery_food',true,'health','Sein Hinthar','CN0601',454,'g',array['zee','zi','plum']::text[],null),
 ('2990031406071','Mustard Lvs Prsvd - Shan','ရှမ်းစွန်တန်(113.5g)',514,'grocery_food',true,'health','Sein Hinthar','CN0607',113,'g','{}'::text[],null),
 ('2990031406125','Preserved Marstard Leaf','ရှမ်းစွန်တန်(160g)',585,'grocery_food',true,'health','Sein Hinthar','CN0612',160,'g','{}'::text[],null),
 ('2990031404046','Shrimp Drd','ပုဇွန်ခြောက် သမီးကြီး',1170,'grocery_food',true,'health','Sein Hinthar','CN0404',200,'g','{}'::text[],null),
 ('2990160601026','Slack Lime, Sein Hinthar Brand (100g)','ထုံး',130,'retail_nonfood',false,'health','Sein Hinthar','PF0102',180,'g',array['shauk','citron','preserved lime']::text[],null),
 ('2990191404047','Sticky Rice Cup (Kauk Hnyin)','ကောက်ညှင်းခွက်',390,'grocery_food',true,'health','Sein Hinthar','SN0404',200,'g','{}'::text[],null),
 ('2990031411013','White Seaweed','ကျောက်ပွင့်',650,'grocery_food',true,'health','Sein Hinthar','CN1101',100,'g','{}'::text[],null),
 ('2990130401083','Shan Yoma Balm','ရှမ်းရိုးမ လိမ်းဆေး(12pcs/pk)',4485,'retail_nonfood',false,'health','Shan Yoma','MD0108',100,'g','{}'::text[],null),
 ('2990031406026','Bamboo Sprouts (265g)','ရွေပန်းပွင့်မိုးကုတ်မှျစ်ချဉ်',897,'grocery_food',true,'health','Shwe Panpwint','CN0602',265,'g','{}'::text[],null),
 ('2990031406033','Mustard Lvs Soup Inst-Shwe Panpwint','ရွေပန်းပွင့်စွန်တန်',897,'grocery_food',true,'health','Shwe Panpwint','CN0603',265,'g','{}'::text[],null),
 ('2990031406040','Quince Drd (265g)','ရွေပန်းပွင့် ချဉ်စော်ကားသီး',897,'grocery_food',true,'health','Shwe Panpwint','CN0604',265,'g','{}'::text[],null),
 ('2990130401106','Salted Lemon Flakes, Sin Tone Ma Nwe Brand (145g)','ဂျင်းရှောက်ဆင်တုံးမနွယ်-ရွှေအိုးဝေ',673,'retail_nonfood',false,'health','Sin Tone Ma Nwe','MD0110',450,'g',array['shauk','citron','preserved lime']::text[],null),
 ('2990201302066','Dried Soybean-160g','ရှမ်းတို့ဟူးခြောက် -160g',500,'grocery_food',true,'health','Times Mon','TM0206',160,'g',array['pe','bean']::text[],null),
 ('2990201302073','Golden Dried Shrimp-160g(Times Mon)','ရွှေပုဇွန်ခြောက်-160g(Times Mon)',1560,'grocery_food',true,'health','Times Mon','TM0207',160,'g','{}'::text[],null),
 ('2990130401137','Salted Lemon Flakes- Tun Shwe Wa','ထွန်းရွှေဝါကြက်သွန်ဖြုအစာကြေဆေး',4784,'retail_nonfood',false,'health','Tun Shwe War','MD0113',740,'g','{}'::text[],null),
 ('2990130401144','Tun Shwe Wa Blood-Pressure Remedy','ထွန်းရွှေဝါသွေးတိုးကျဆေး',4784,'retail_nonfood',false,'health','Tun Shwe War','MD0114',740,'g','{}'::text[],null),
 ('2990130401045','Oo Chan Ti - Salted Lemon Flakes','ဦးချိန်တီ',224,'retail_nonfood',false,'health','U Chain Te','MD0104',840,'g','{}'::text[],null),
 ('2990130401113','Analgesic Balm - U Sai','ဦးစိုင်းဒဏ်ကြေဆေး(12pcs)',4186,'retail_nonfood',false,'health','U sai','MD0111',40,'g','{}'::text[],null),
 ('2990130401052','Turmeric Pill','နနွင်းခါးဆေးလုံး',449,'retail_nonfood',false,'health','Unbranded','MD0105',1000,'g','{}'::text[],null),
 ('2990130402042','Salted Lemon Fakes','ဇာတိ၀င်္ကအစာကြေဆေး(12pcs)',4784,'retail_nonfood',false,'health','Zar Ti Wun Ka','MD0204',50,'g','{}'::text[],null),
 ('2990130402035','Salted Lemon Fakes-Zi Wa Thu Ka','ဇီ၀သုခလေနိုင်ဆေး(ဇီဝက)',4784,'retail_nonfood',false,'health','ZiWathu ka','MD0203',null,null,'{}'::text[],null),
 ('2990130402066','Blood Stimulant medi -(Nalone Thuka)','နှလုံးသုခ သွေးအားတိုးဆေး',4485,'retail_nonfood',false,'health','nalone thuka','MD0206',500,'g','{}'::text[],null),
 ('2990160303029','Makeup - Arche','အာချီမိတ်ကပ်',329,'retail_nonfood',false,'home-personal','Arche','PC0302',50,'g','{}'::text[],null),
 ('2990160301049','Soap-Carbolic (110g)','ကာဘော်လစ်ဆပ်ပြာ',164,'retail_nonfood',false,'home-personal','Carbolic','PC0104',null,null,'{}'::text[],null),
 ('2990160303043','COYA Snow','ကိုရာစနိုး',329,'retail_nonfood',false,'home-personal','Coya','PC0304',800,'g','{}'::text[],null),
 ('2990160301087','Family Care Soap','Family Care ဆပ်ပြာ',194,'retail_nonfood',false,'home-personal','Family Care','PC0108',100,'g','{}'::text[],null),
 ('2990160301032','Life Soap 100g','လိုက်ဖ် ဆပ်ပြာ (၁၀၀g)',179,'retail_nonfood',false,'home-personal','Life','PC0103',115,'g','{}'::text[],null),
 ('2990062302052','Foot Wear- baby shoes (man)','ဖိနပ်ကလေးစီးကတ္တီပါ (ကျား)',822,'retail_nonfood',false,'home-personal','Myanmar','FW0205',1000,'g','{}'::text[],null),
 ('2990160301025','Paris Soap','ပဲရစ်ဆပ်ပြာ',179,'retail_nonfood',false,'home-personal','Paris','PC0102',100,'g',array['pe','bean']::text[],null),
 ('2990210201015','Umbrella Pathine 22" Water Proof','ပုသိမ်ထီး ၂၂" ရေစိုခံ',2138,'retail_nonfood',false,'home-personal','Pathein','UB0101',null,null,array['pathein umbrella','hti']::text[],null),
 ('2990210201046','Umbrella Pathine 28"','ပုသိမ်ထီး ၂၈"',2138,'retail_nonfood',false,'home-personal','Pathein','UB0104',null,null,array['pathein umbrella','hti']::text[],null),
 ('2990160304040','Facial Foarm Pon','ပွန်းမျက်နှာသစ်',658,'retail_nonfood',false,'home-personal','Pon','PC0404',100,'g','{}'::text[],null),
 ('2990160303012','Makeup - Promina','ပရိုမီနာ',576,'retail_nonfood',false,'home-personal','Promina','PC0301',500,'g','{}'::text[],null),
 ('2990160302022','Coconut Oil','အုန်းဆီ',195,'retail_nonfood',false,'home-personal','Sein Hinthar','PC0202',70,'g','{}'::text[],null),
 ('2990160302015','Grewia Polygama 130g','တလျော်ကင်ပွန်း(130g)',429,'retail_nonfood',false,'home-personal','Sein Hinthar','PC0201',130,'g','{}'::text[],null),
 ('2990160305030','ThaNatKhar (Ingredient List: Hesperethusa Crenulata)','ေရႊၿပည္နန္းသနပ္ခါးဘူးေသး',336,'retail_nonfood',false,'home-personal','Shwe Pyi Nan','PC0503',null,null,'{}'::text[],null),
 ('2990160305078','ThaNatKhar (Ingredient List: Hesperethusa Crenulata)','ေရႊၿပည္နန္းသနပ္ခါး အရည္',493,'retail_nonfood',false,'home-personal','Shwe Pyi Nan','PC0507',null,null,'{}'::text[],null),
 ('2990160305023','ThaNatKhar (Ingredient List: Hesperethusa Crenulata)','ေရႊၿပည္နန္းသနပ္ခါးဘူးႀကီး',449,'retail_nonfood',false,'home-personal','Shwe Pyi Nan','PC0502',null,null,'{}'::text[],null),
 ('2990062302014','Sin Kyae Foot Wear','ဆင်ကြယ်ဖိနပ်',1316,'retail_nonfood',false,'home-personal','Sin Kyae','FW0201',540,'g','{}'::text[],null),
 ('2990062302038','Footwear Men - Three Elephants','ဖီနပ်ကျားစီးဆင်သုံးကောင်ဖိနပ်',1794,'retail_nonfood',false,'home-personal','Sin Thone Kaung','FW0203',540,'g','{}'::text[],null),
 ('2990160305016','ThaNatKhar - Tagungyi maukmai 111g','သနပ်ခါး-တောင်ကြီးမောက်မယ်',576,'retail_nonfood',false,'home-personal','Taung Gyi Mauk Mal','PC0501',74,'g',array['thanaka','thanakha','thanatkha']::text[],null),
 ('2990160304064','Top Country Powder -200ml','မြင်းခေါင်းပေါင်ဒါ -200ml',897,'retail_nonfood',false,'home-personal','Top Country','PC0406',200,'g','{}'::text[],null),
 ('2990160304057','Top Country Powder-100 ml','မြင်းခေါင်းပေါင်ဒါ-100ml',598,'retail_nonfood',false,'home-personal','Top Country','PC0405',100,'g','{}'::text[],null),
 ('2990212001019','Betelnut Cracker','ကွမ်းညှပ်',822,'retail_nonfood',false,'home-personal','Unbranded','UT0101',null,null,array['kun','betel','kwun']::text[],null),
 ('2990081302019','Brooms','တံမြက်စည်းအလတ်',299,'retail_nonfood',false,'home-personal','Unbranded','HM0201',null,null,'{}'::text[],null),
 ('2990081304013','Candle -WinWin','ဝင်းဝင်းဖယောင်းတိုင်',194,'retail_nonfood',false,'home-personal','Unbranded','HM0401',null,null,'{}'::text[],null),
 ('2990212001057','Chinese Pan(size14)','ဒယ်အိုး(Size 14)',2542,'retail_nonfood',false,'home-personal','Unbranded','UT0105',null,null,'{}'::text[],null),
 ('2990062302113','Foot Wear- Girl (Yinmar)','မစီးဖိနပ် (ယင်းမာ)',374,'retail_nonfood',false,'home-personal','Yin Mar','FW0211',null,null,'{}'::text[],null),
 ('2990031403087','Fish Flavour Noodle Sauce,Aoe bho(400g)','အိုးဘိုမုန့်ဟင်းခါး (400g)',748,'grocery_food',true,'noodles-mohinga','Aoe Bho','CN0308',400,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1149),
 ('2990190401092','Instant Noodle Sauce(Rakhine Monhti), Eait Sea Sein (300g)','အိမ့်စည်းစိမ်ရခိုင်မုန့်တီ(၁၀ထုတ်)',2242,'grocery_food',true,'noodles-mohinga','Eaint Sisane','SD0109',500,'g',array['monti','mont di','rakhine noodle','monhti']::text[],null),
 ('2990190809089','Coconut Milk (400g)','အုန်းနို့-400g',715,'grocery_food',true,'noodles-mohinga','Grandma','SH0908',400,'g','{}'::text[],1099),
 ('2990190809096','Instant Noodle Sauce (Coconut milk noodles) 400g','အုန်းနို့ခေါက်ဆွဲအနှစ်(သတ်သတ်လွတ်) (400g)',715,'grocery_food',true,'noodles-mohinga','Grandma','SH0909',400,'g',array['noodle','khao swe','kyay oh']::text[],1099),
 ('2990190809034','Instant Noodle Sauce (Coconut milk noodles)chicken 400g','အုန်းနို့ခေါက်ဆွဲအနှစ် (ကြက်သား)(400g)',780,'grocery_food',true,'noodles-mohinga','Grandma','SH0903',400,'g',array['noodle','khao swe','kyay oh']::text[],1199),
 ('2990190809041','Instant Noodle Sauce (Monhinga)400g','စိန်ဟင်္သာမုန့်ဟင်းခါး(ဗူး)400g',780,'grocery_food',true,'noodles-mohinga','Grandma','SH0904',400,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1199),
 ('2990190809072','Rakhin Mon-Ti (150g)','ရခိုင်မုန့်တီသုပ်-grandma',390,'grocery_food',true,'noodles-mohinga','Grandma','SH0907',150,'g',array['monti','mont di','rakhine noodle','monhti']::text[],599),
 ('2990031403018','Fish Broth Inst - Khin Htwe Yi (300g)','ခင်ထွေးရီမုန့်ဟင်းခါးရည်',822,'grocery_food',true,'noodles-mohinga','Khin Htwe Yi','CN0301',300,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1249),
 ('2990031405029','Malar Hotpot - Lashio Shan Shan 450g','မာလာဟော့ပေါ့(လားရှိုးရှမ်းရှမ်း)',822,'grocery_food',true,'noodles-mohinga','Lashio Shan Shan','CN0502',480,'g',array['mala','malar']::text[],1249),
 ('2990031405036','Marlar Curry Sauce (350g)','မာလာဟင်း-350g(လာရိူးရှမ်းရှမ်း)',740,'grocery_food',true,'noodles-mohinga','Lashio Shan Shan','CN0503',350,'g',array['mala','malar']::text[],1149),
 ('2990142202012','Noodle Soup-Lashio Shan Shan','မြေအိုးမြီးရှည် (လာရိူးရှမ်းရှမ်း)',673,'grocery_food',true,'noodles-mohinga','Lashio Shan Shan','NV0201',null,null,'{}'::text[],1049),
 ('2990131901056','Spicy Pounded Shrimp - Morning Star','ရခိုင်အာပူထောင်း(Morning Star)',858,'grocery_food',true,'noodles-mohinga','Morning Star','MS0105',500,'g','{}'::text[],1299),
 ('2990031403056','Instant Tofu Bean Paste Noodle- (100g)','တို့ဟူးနွေး 100g (အမေ့အကြိုက်)',374,'grocery_food',true,'noodles-mohinga','Mother A Kyite','CN0305',100,'g',array['pe','bean']::text[],599),
 ('2990031403025','Fish Broth Inst - MM D''Cho (300g)','မြောင်းမြ ဒေါ်ချိုမုန့်ဟင်းခါးရည်',822,'grocery_food',true,'noodles-mohinga','MyaungMya Daw Cho','CN0302',300,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1249),
 ('2990031403032','Nan Tha Pyay - Fish Flavor Noodle Sauce','နန်းသပြေ မုန့်ဟင်းခါး',822,'grocery_food',true,'noodles-mohinga','Nan Tapyay','CN0303',300,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1249),
 ('2990142201060','Noodle- Ngwe ngan','ငွေငန်းခေါက်ဆွဲ',187,'grocery_food',true,'noodles-mohinga','Ngwe Ngan','NV0106',363,'g',array['noodle','khao swe','kyay oh']::text[],299),
 ('2990031405043','Mala Shan-Style Noodle Paste - Opera','မာလာရှမ်းကောအနှစ်အထုတ် (Opera',715,'grocery_food',true,'noodles-mohinga','Opera','CN0504',227,'g',array['shan kaw','shan noodle','mala','malar']::text[],1099),
 ('2990031403049','Fish Flavour Noodle Sauce,Sanpya Dawkyi Brand (200g)','စံပြဒေါ်ကြည် မုန့်ဟင်းခါး',785,'grocery_food',true,'noodles-mohinga','San Pya Daw kyi','CN0304',200,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],1199),
 ('2990190809157','Instant Noodle Sauce (Monhinga)-KhinLay yi-300g','ခင်လေးရီမုန့်ဟင်းခါး-300g',650,'grocery_food',true,'noodles-mohinga','Sein Hinthar','SH0915',300,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],999),
 ('2990190809140','Instant Noodle Sauce (Monhinga)-Shwe Latt Yar-300g','ရွှေလက်ရာမုန့်ဟင်းခါး-300g',650,'grocery_food',true,'noodles-mohinga','Sein Hinthar','SH0914',300,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],999),
 ('2990190809058','Instant Noodle Sauce (Monhinga)350g','စိန်ဟင်္သာမုန့်ဟင်းခါး(အထုပ်)350g',650,'grocery_food',true,'noodles-mohinga','Sein Hinthar','SH0905',350,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],999),
 ('2990142201077','Noodle Soup 350g, Mawlamyine','မော်လမြိုင်အုန်းနို့ခေါက်ဆွဲခြောက်-350g',390,'grocery_food',true,'noodles-mohinga','Sein Hinthar','NV0107',350,'g',array['noodle','khao swe','kyay oh']::text[],599),
 ('2990142201084','Rice Noodle Soup 500g, Mawlamyine','မော်လမြိုင်မုန့်ဖတ်ခြောက်-350g',390,'grocery_food',true,'noodles-mohinga','Sein Hinthar','NV0108',350,'g','{}'::text[],599),
 ('2990031405081','Shanminthar-Instant Malar Paste Noodle(120g)','ရှမ်းမင်းသား မာလာ-120g',150,'grocery_food',true,'noodles-mohinga','Shanminthar','CN0508',120,'g',array['mala','malar']::text[],249),
 ('2990031405067','Shanminthar-Instant Shan Paste Noodle(120g)','ရှမ်းမင်းသား ရှမ်းအရသာ-120g',150,'grocery_food',true,'noodles-mohinga','Shanminthar','CN0506',120,'g','{}'::text[],249),
 ('2990031405050','Shanminthar-Instant Tofu Bean Paste Noodle(120g)','ရှမ်းမင်းသား တို့ဟူးနွေး 120g',150,'grocery_food',true,'noodles-mohinga','Shanminthar','CN0505',120,'g',array['pe','bean']::text[],249),
 ('2990031405074','Shanminthar-Instant Toneyan Paste Noodle(120g)','ရှမ်းမင်းသား တုန်ယမ်း-120g',150,'grocery_food',true,'noodles-mohinga','Shanminthar','CN0507',120,'g','{}'::text[],249),
 ('2990142201015','Noodle,Shwe Oo Down Brand (336g)','ရွှေဥဒေါင်းခေါက်ဆွဲခြောက်',179,'grocery_food',true,'noodles-mohinga','Shwe Ou Down','NV0101',336,'g',array['noodle','khao swe','kyay oh']::text[],298),
 ('2990142201039','Noodle, Son Nyi Naung','စွန်ညီနောင်ခေါက်ဆွဲ',187,'grocery_food',true,'noodles-mohinga','Son Nyi Naung','NV0103',300,'g',array['noodle','khao swe','kyay oh']::text[],299),
 ('2990201308037','Dried Rice Noddle-450g (Times Mon)','မုန့်ဟင်းခါးခြောက် -450g (Times Mon)',455,'grocery_food',true,'noodles-mohinga','Times Mon','TM0803',450,'g',array['mohinga','mohingar','mont hin gar','moh hin ga']::text[],699),
 ('2990201308051','Konjac Noodles -320g (Times Mon)','၀ဥခေါက်ဆွဲ-320g (Times Mon)',572,'grocery_food',true,'noodles-mohinga','Times Mon','TM0805',320,'g',array['noodle','khao swe','kyay oh']::text[],899),
 ('2990201308068','Konjac Vermicelli -160g (Times Mon)','၀ဥကြာဇံ-160g (Times Mon)',286,'grocery_food',true,'noodles-mohinga','Times Mon','TM0806',160,'g','{}'::text[],449),
 ('2990201308020','Malar Shan kaw (Times Mon)','မာလာရှမ်းကော(Times Mon)အထုတ်',715,'grocery_food',true,'noodles-mohinga','Times Mon','TM0802',190,'g',array['shan kaw','shan noodle','mala','malar']::text[],1099),
 ('2990201308044','Malar Shan kaw Liquid (Times Mon)','မာလာရှမ်းကောအနှစ်-250g (Times Mon)',715,'grocery_food',true,'noodles-mohinga','Times Mon','TM0804',250,'g',array['shan kaw','shan noodle','mala','malar']::text[],1099),
 ('2990201308013','Noodle Soup-(Times Mon)','မြေအိုးမြီးရှည်(Times Mon)',644,'grocery_food',true,'noodles-mohinga','Times Mon','TM0801',190,'g','{}'::text[],999),
 ('2990142201053','Noodle, Shwe Joekyar (540g)','ရွှေကြိုးကြာကြက်ဥခေါက်ဆွဲလုံး',247,'grocery_food',true,'noodles-mohinga','shwe Kyo Kyar','NV0105',540,'g',array['noodle','khao swe','kyay oh']::text[],399),
 ('2990142201046','Noodle, Shwe Joekyar Brand (300g)','ရွှေကြိုးကြာကြက်ဥခေါက်ဆွဲပြား',187,'grocery_food',true,'noodles-mohinga','shwe Kyo Kyar','NV0104',300,'g',array['noodle','khao swe','kyay oh']::text[],299),
 ('2990160606090','Plum Prvsd - A Pyo Gyi','အပျိုကြီးဇီးယို',740,'grocery_food',true,'preserved-fruit','A Pyo Gyi','PF0609',760,'g',array['zee','zi','plum']::text[],999),
 ('2990160602078','Preserve Fruit, Ar Pu Shar Pu','အာပူလျာပူ-ဇီးအစပ်',822,'grocery_food',true,'preserved-fruit','Ar Pu Shar Pu','PF0207',670,'g',array['zee','zi','plum']::text[],999),
 ('2990160606182','Damsom & Perserved( 180 g)','အေးဇီးဖြူသီး',224,'grocery_food',true,'preserved-fruit','Aye','PF0618',180,'g',array['zee','zi','plum']::text[],299),
 ('2990160606106','Damson Plum Prsvd (100g)-Aye(yellow)','မက်မန်းသီး-အေး(Yellow)',239,'grocery_food',true,'preserved-fruit','Aye','PF0610',240,'g',array['zee','zi','plum']::text[],349),
 ('2990160606076','Damson Plum Prsvd (100g)[red]','မက်မန်းသီး-အေး(red)',239,'grocery_food',true,'preserved-fruit','Aye','PF0607',240,'g',array['zee','zi','plum']::text[],349),
 ('2990160606120','Grape Fruit, Aye Brand (100g)','အေးစပျစ်သီး',90,'grocery_food',true,'preserved-fruit','Aye','PF0612',null,null,'{}'::text[],149),
 ('2990160602061','Lemon Flakes Slt - Falbu','ရှောက်သီးဆေးပြား(၁၀တွဲဗူး)-ဖလ်ဗူး',1151,'grocery_food',true,'preserved-fruit','Fal Bu','PF0206',450,'g',array['shauk','citron','preserved lime']::text[],null),
 ('2990160602092','Honey Citron Preserve - Hlyan Htet','ပျားရှောက်ပေါင်း-လှျမ်းထက်',449,'grocery_food',true,'preserved-fruit','Hlan Htet','PF0209',100,'g',array['shauk','citron','preserved lime']::text[],649),
 ('2990160602054','Lin Yaung Chi - Preserved Lemon','လင်းရောင်ခြည်ရှောက်ပေါင်း',449,'grocery_food',true,'preserved-fruit','Lin Yang Chi','PF0205',null,null,array['shauk','citron','preserved lime']::text[],649),
 ('2990160602115','Sweet Citron - Lin Yaung Chi (500g)','လင်းရောင်ခြည်ရှောက်ချိုမေး(500g)',1196,'grocery_food',true,'preserved-fruit','Lin Yang Chi','PF0211',500,'g',array['shauk','citron','preserved lime']::text[],null),
 ('2990160606113','Maung Pwint Thit','မောင်ပွင့်သစ်(သရက်ယို)',673,'grocery_food',true,'preserved-fruit','Maung','PF0611',200,'g','{}'::text[],949),
 ('2990160606038','Plum Prsvd 760g - Maung','ဇီးထုတ်-မောင်(20pcs)',822,'grocery_food',true,'preserved-fruit','Maung','PF0603',500,'g',array['zee','zi','plum']::text[],999),
 ('2990160606175','Plum Toffee- Mg','မောင်ဇီးတော်ဖီ',224,'grocery_food',true,'preserved-fruit','Maung','PF0617',250,'g',array['zee','zi','plum']::text[],299),
 ('2990160604027','Mariam Plum - Moe Nat Thuzar','မရမ်းယို-မိုးနတ်သူဇာ',673,'grocery_food',true,'preserved-fruit','Moe Nut Thuzar','PF0402',300,'g',array['zee','zi','plum']::text[],949),
 ('2990160606151','Damson Plum Prsvd (Red)Ngwe Nan Taw-240g','မက်မန်းသီး(အနီ) ငွေနန်းတော်-240g',187,'grocery_food',true,'preserved-fruit','Ngwe Nan Taw','PF0615',240,'g',array['zee','zi','plum']::text[],249),
 ('2990160606199','Plum Toffee - Pyi Taing Htaung','ပစ်တိုင်းထောင်ဇီးတော်ဖိ',299,'grocery_food',true,'preserved-fruit','Pyit Tine Taung','PF0619',160,'g',array['zee','zi','plum']::text[],399),
 ('2990160602108','Citron Preserve - Shwe Let Yar','ရှောက်ပေါင်း-ရွှေလက်ရာ',449,'grocery_food',true,'preserved-fruit','Sein Hinthar','PF0210',null,null,array['shauk','citron','preserved lime']::text[],649),
 ('2990031407016','Crataeva Nurvala Lvs Slt','ခံတက်ချဉ် အထုပ်(283g)',390,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0701',null,null,'{}'::text[],549),
 ('2990031407030','Indian Trumpet Fruit','ကြောင်လျာသီး(အထုပ်)-227g',390,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0703',227,'g','{}'::text[],549),
 ('2990160603082','Mango Sour Prsvd -400g','သရက်ချဉ်ထုပ်(400g)',474,'grocery_food',true,'preserved-fruit','Sein Hinthar','PF0308',null,null,'{}'::text[],649),
 ('2990031407047','Pithecellobium Lobatum Banth -454g','တညင်းသီးဆားရေစိမ် ကော်ဗူး',390,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0704',454,'g','{}'::text[],549),
 ('2990031400079','Pithecellobium Lobatum Banth -454g','တညင်းသီးဆားရေစိမ် ပုလင်း',390,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN07',null,null,'{}'::text[],549),
 ('2990031407221','Salted Crataeva Nurvala Leaf-bot','ခံတက်ချဉ်ဗူး',403,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0722',283,'g','{}'::text[],549),
 ('2990191910081','Salted Lemon Flakes[Shwe Hinthar]','စိန်င်္ဟာရှောက်သီးပေါင်း-အထုပ်',858,'grocery_food',true,'preserved-fruit','Sein Hinthar','SS1008',null,null,array['shauk','citron','preserved lime']::text[],999),
 ('2990031407054','Santol Pickle','သစ်တိုသီး ဆာစိမ်',358,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0705',227,'g','{}'::text[],499),
 ('2990031406088','Shan Kamchi','ရှမ်းချဉ် အထုတ်(400g)',429,'grocery_food',true,'preserved-fruit','Sein Hinthar','CN0608',400,'g','{}'::text[],599),
 ('2990160603044','Mango Prsved - Shanma','သရက်ယို-ရှမ်းမ',785,'grocery_food',true,'preserved-fruit','Shan Ma','PF0304',700,'g','{}'::text[],999),
 ('2990160604041','Mariam Plum Spc-Shan Ma','ရှမ်းမမရမ်းစိမ်းယို',748,'grocery_food',true,'preserved-fruit','Shan Ma','PF0404',250,'g',array['zee','zi','plum']::text[],999),
 ('2990160604034','Marian Plum - Shanma','မရမ်းယို-ရှမ်းမ',785,'grocery_food',true,'preserved-fruit','Shan Ma','PF0403',250,'g',array['zee','zi','plum']::text[],999),
 ('2990160606052','Plum Prvsd - Shanma','ဇိးယို-ရှမ်းမ',785,'grocery_food',true,'preserved-fruit','Shan Ma','PF0605',800,'g',array['zee','zi','plum']::text[],999),
 ('2990160602030','Lemon Flakes-Shwe Myaing Thu','ရှောက်ပေါင်း-ရွှေမြိုင်သူ',449,'grocery_food',true,'preserved-fruit','Shwe Myaing Thu','PF0203',140,'g',array['shauk','citron','preserved lime']::text[],649),
 ('2990191405044','Fruits Prsvd-Swe Myo Mate','ဆွေမျိုးမေ့ ယိုစုံ',523,'grocery_food',true,'preserved-fruit','Shwemyomae','SN0504',500,'g','{}'::text[],749),
 ('2990160603075','Tanta Prsved','တမ်းတယိုစုံ',748,'grocery_food',true,'preserved-fruit','Tanta','PF0307',380,'g','{}'::text[],999),
 ('2990160603037','Mango Prsvd 3 in 1','သရီးအင်ဝမ်းသရက်ယို',673,'grocery_food',true,'preserved-fruit','Three in one','PF0303',700,'g','{}'::text[],949),
 ('2990201304084','Damson Plum Fruit(yellow)-160 Times Mon','မက်မန်းသီး(အဝါ) -160g (Times Mon)',214,'grocery_food',true,'preserved-fruit','Times Mon','TM0408',160,'g',array['zee','zi','plum']::text[],299),
 ('2990201303032','Lemon (Times Mon)','သံပရာပေါင်း(Times Mon)',286,'grocery_food',true,'preserved-fruit','Times Mon','TM0303',150,'g','{}'::text[],399),
 ('2990201303018','Salted Lemon Flakes- Times Mon','ရှောက်မျှင် (Times Mon)',429,'grocery_food',true,'preserved-fruit','Times Mon','TM0301',140,'g',array['shauk','citron','preserved lime']::text[],599),
 ('2990201303049','Shredded Mango-300g Times Mon','သရက်ချဉ်-300g Times Mon',474,'grocery_food',true,'preserved-fruit','Times Mon','TM0304',300,'g','{}'::text[],649),
 ('2990201303063','Sour Tamarind Leaf (300g) - Times Mon','မန်ကျည်းရွက်ချဉ်-300g Times Mon',585,'grocery_food',true,'preserved-fruit','Times Mon','TM0306',300,'g','{}'::text[],799),
 ('2990192001085','Damson Plum - Tone Tone','မက်မန်းသီး(Tone Tone)',449,'grocery_food',true,'preserved-fruit','Tone Tone','ST0108',180,'g',array['zee','zi','plum']::text[],649),
 ('2990192001030','Dried Apple-220g (Tone Tone)','နာနတ်သီးခြောက် -220g (Tone Tone)',449,'grocery_food',true,'preserved-fruit','Tone Tone','ST0103',200,'g','{}'::text[],649),
 ('2990192001016','Dried Plam-180g (Tone Tone)','အစေ့လွတ်ဇီးချို -180g (Tone Tone)',449,'grocery_food',true,'preserved-fruit','Tone Tone','ST0101',180,'g',array['zee','zi','plum']::text[],649),
 ('2990192001078','Dried Quince-140(Tone Tone)','ချဉ်စော်ကားသီးခြောက-140(Tone Tone)',449,'grocery_food',true,'preserved-fruit','Tone Tone','ST0107',140,'g','{}'::text[],649),
 ('2990192001023','Dried Strawberry (200g) - Tone Tone','စတော်ဘယ်ရီခြောက်-200g (Tone Tone)',449,'grocery_food',true,'preserved-fruit','Tone Tone','ST0102',200,'g','{}'::text[],649),
 ('2990160606083','Fruits Prsvd - Ya Tha Po','ယိုစုံ - ရသာပို',120,'grocery_food',true,'preserved-fruit','Ya Tha Po','PF0608',null,null,'{}'::text[],149),
 ('2990160601019','Betel Lvs Stm','ကွမ်းရွက်ပေါင်း (454g)',980,'grocery_food',true,'preserved-fruit',null,'PF0101',null,null,array['kun','betel','kwun']::text[],null),
 ('2990160606069','Plum Spicy Preserved - Shanma','ရှမ်းမဇီးယိုအခြောက်အစပ်',780,'grocery_food',true,'preserved-fruit',null,'PF0606',null,null,array['zee','zi','plum']::text[],999),
 ('2990021101160','Cake Drd - D Ko','ဒီကို ကိတ်ခြောက်',374,'grocery_food',true,'snacks-sweets','Dko','BK0116',200,'g','{}'::text[],499),
 ('2990191406027','Soft Flour Cake 250g - Go Go Lay','ဂိုးဂိုးလေးကြာဇံမရွေး',299,'grocery_food',true,'snacks-sweets','Go Go Lay','SN0602',22,'g','{}'::text[],399),
 ('2990191403101','Hot Hot Crab Masala Snack','ဟော့ဟော့ဂဏန်းမာဆလာအရသာ',299,'grocery_food',true,'snacks-sweets','Hot Hot','SN0310',162,'g','{}'::text[],399),
 ('2990191403088','Snack Crispy- Hot Hot','ဟော့ဟော့ကြော်စုံ',299,'grocery_food',true,'snacks-sweets','Hot Hot','SN0308',160,'g','{}'::text[],399),
 ('2990191403033','Chick Pea Snack Mxd - Jayarjit 120g','စာလေးခွေ-ဂျေရာဂျစ်',411,'grocery_food',true,'snacks-sweets','Jayar Jit','SN0303',120,'g',array['pe','bean']::text[],549),
 ('2990191403118','Assorted Fried Snack - Kaung Htaik','ကောင်းထိုက် အကြော်စုံ',411,'grocery_food',true,'snacks-sweets','Kaung Htike','SN0311',110,'g','{}'::text[],549),
 ('2990191403040','Crispy Snacks, Sar Kaung Brand ( 200g)','ကောင်းထိုက် ဘယာကြော်',411,'grocery_food',true,'snacks-sweets','Kaung Htike','SN0304',200,'g','{}'::text[],549),
 ('2990031408037','Kaung Htike-Fried Onion','ကောင်းထိုက်ကြက်သွန်ကြော်',336,'grocery_food',true,'snacks-sweets','Kaung Htike','CN0803',200,'g','{}'::text[],449),
 ('2990191403019','Snack Crispy- Kaung Kyike','ကောင်းကြိုက်ဘယာကြော်',411,'grocery_food',true,'snacks-sweets','Kaung Kyaik','SN0301',200,'g','{}'::text[],549),
 ('2990021101177','Butter Bread Kaung Mon(180g)','ကောင်းမွန်ထောပါတ်မုန့်ကြွပ်',411,'grocery_food',true,'snacks-sweets','Kaung Mon','BK0117',180,'g','{}'::text[],549),
 ('2990191405051','kaung Mon Black Sesame Brittle Snacks(220 g)','ကောင်းမွန်နှမ်းနက်ယို',411,'grocery_food',true,'snacks-sweets','Kaung Mon','SN0505',220,'g','{}'::text[],549),
 ('2990021101184','Maria Biscuit','Maria ဘီစကစ်',374,'grocery_food',true,'snacks-sweets','Maria','BK0118',235,'g','{}'::text[],499),
 ('2990131901100','Dried Shrimp Balachoung (160g)-Morning Star','ပုဇွန်ခြောက်ဘာလချောင်ကြော် 160g (Morning Star)',650,'grocery_food',true,'snacks-sweets','Morning Star','MS0110',160,'g',array['balachaung','balachong','bala chaung']::text[],749),
 ('2990131901063','Fried Burmese Loach with Sauce- Morning Star','ငါးကျီးငံပြာရည်ကြော် (Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0106',300,'g',array['ngan pya yay','fish sauce']::text[],749),
 ('2990131901087','Fried Dired Soy Bean with Chive Root-Morning Star','ပဲငပိခြောက်ဂျူးမြစ်ကြော်(Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0108',200,'g',array['ngapi','nga pi','shrimp paste','pe','bean']::text[],749),
 ('2990131901070','Fried Marian with fried Shrimp Paste - Msorning Star','မရမ်းသီးငပိကြော်(Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0107',300,'g',array['ngapi','nga pi','shrimp paste']::text[],749),
 ('2990131901032','Fried Shirmp Paste- Morning Star','ပုဇွန်ခြောက်ငပိကြော် (Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0103',240,'g',array['ngapi','nga pi','shrimp paste']::text[],749),
 ('2990131901094','Fried Shrimp with fish sauce-Morning Star','ပုဇွန်ငံပြာရည်ကြော် (Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0109',240,'g',array['ngan pya yay','fish sauce']::text[],749),
 ('2990131901131','Fried Strimp Paste with Quince-300g (Mornig Star)','ချဉ်စော်ကားသီးငပိကြော်-300g (Morning Star)',559,'grocery_food',true,'snacks-sweets','Morning Star','MS0113',300,'g',array['ngapi','nga pi','shrimp paste']::text[],749),
 ('2990131901018','Spicy Fried Anchovy Fish-Morning Star','ငါးနီတူအစပ်ကြော်(Morning Star)',650,'grocery_food',true,'snacks-sweets','Morning Star','MS0101',240,'g','{}'::text[],749),
 ('2990191408014','Wafer - Mwa Mwa Lay','ဝေဖာ-မွမွလေး',411,'grocery_food',true,'snacks-sweets','Mwa Mwa Lay','SN0801',350,'g','{}'::text[],549),
 ('2990021101061','Nay Win - Butter Bread','နေဝင်းထောပါတ်မုန့်ကြွပ်',411,'grocery_food',true,'snacks-sweets','Nay Win','BK0106',240,'g','{}'::text[],549),
 ('2990021101139','Cake Drd (Milk)- Ni Lar','နီလာနို့စိမ်းကိတ်ခြောက်',329,'grocery_food',true,'snacks-sweets','Ni Lar','BK0113',280,'g','{}'::text[],449),
 ('2990021101122','Cake Drd(Null) - Ni Lar','နီလာပလိမ်းကိတ်ခြောက်',314,'grocery_food',true,'snacks-sweets','Ni Lar','BK0112',200,'g','{}'::text[],399),
 ('2990191407024','Sunflower Seed, Point Brand (325g)','ပွိုင့် နေကြာစေ့-325g',493,'grocery_food',true,'snacks-sweets','Point','SN0702',325,'g','{}'::text[],649),
 ('2990021101078','Mixed Berries Cashew Rusk [200g]','ဆာလာမုန့်ကြွပ်',411,'grocery_food',true,'snacks-sweets','Sarlar','BK0107',200,'g','{}'::text[],549),
 ('2990190401023','Bombay Duck Rst (142g)','အာဗြဲမီးကင်',500,'grocery_food',true,'snacks-sweets','Sein Hinthar','SD0102',142,'g','{}'::text[],699),
 ('2990191404023','Fish Cracker, Sein Hinthar Brand (155g)','စိန်င်္ဟာသာငါးမုန့် (155g)',429,'grocery_food',true,'snacks-sweets','Sein Hinthar','SN0402',155,'g','{}'::text[],599),
 ('2990190401054','Fried Bombay Duck Balachoung (Sein Hin thar)','အာဗြဲခြောက် ဘာလချောင်ကြော် (စိန်င်္ဟာ)',500,'grocery_food',true,'snacks-sweets','Sein Hinthar','SD0105',142,'g',array['balachaung','balachong','bala chaung']::text[],699),
 ('2990031408044','Fried Garlic Bot(Hanthar)','ကြက်သွန်ဖြူကြော်ဗူး(ဟံသာ)',500,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN0804',160,'g','{}'::text[],699),
 ('2990031408013','Fried Garlic Bot(Sein Hinthar)-198g','ကြက်သွန်ဖြူကြော်ဗူး',500,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN0801',198,'g','{}'::text[],699),
 ('2990191405075','Marian Plum Preserve - Shwe Let Yar (100g)','ရွှေလက်ရာမရမ်းပြားယို-100g',260,'grocery_food',true,'snacks-sweets','Sein Hinthar','SN0507',100,'g',array['zee','zi','plum']::text[],349),
 ('2990031410061','Natural Palm Sugar-sein hinthar-283g','ထန်လှျက်ခဲဘူး(အချောင်း)',455,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN1006',283,'g','{}'::text[],599),
 ('2990031410030','Natural Palm Sweet(Bround)-sein hinthar','ထန်လှျက်ခဲအညိုရောင်(ဗူး)',500,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN1003',283,'g','{}'::text[],699),
 ('2990031407061','Natural Palm Sweet(White)-sein hinthar','ထန်လှျက်ခဲအဖြူအလုံး(အထုပ်)',455,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN0706',283,'g','{}'::text[],599),
 ('2990031410047','Natural Palm sweet(Black) pk','ထန်လှျက်ခဲအမဲရောင်(ဖါ)',23400,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN1004',18500,'g','{}'::text[],null),
 ('2990031408051','Onion Frd Bag(Sein Hinthar)-227g','ကြက်သွန်နီကြော်(အထုပ်)227g',390,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN0805',227,'g','{}'::text[],549),
 ('2990031408068','Onion Frd Bag(Sein Hinthar)-400g','ကြက်သွန်နီကြော်(အထုပ်)400g',644,'grocery_food',true,'snacks-sweets','Sein Hinthar','CN0806',400,'g','{}'::text[],749),
 ('2990190401115','Red Fish Balachaung - Shwe Let Yar','ရွှေလက်ရာငါးနီတူဘာလချောင်ကြော်',455,'grocery_food',true,'snacks-sweets','Sein Hinthar','SD0111',null,null,array['balachaung','balachong','bala chaung']::text[],599),
 ('2990191403095','Rice Crackers','မုန့်လေပွေ',390,'grocery_food',true,'snacks-sweets','Sein Hinthar','SN0309',120,'g','{}'::text[],549),
 ('2990191403064','Roasted Salted Peanuts-160g','မြေပဲဆားလှော်-160g',325,'grocery_food',true,'snacks-sweets','Sein Hinthar','SN0306',160,'g',array['pe','bean']::text[],449),
 ('2990190402044','Shrimp Pst Balachong-PwarKyin','ဖွားကြင်ဘာလချောင်ကြာ် (စိန်င်္ဟာသာ)',546,'grocery_food',true,'snacks-sweets','Sein Hinthar','SD0204',283,'g',array['balachaung','balachong','bala chaung']::text[],749),
 ('2990191405068','White Seaweed- Sein Hinthar','ကျောက်ဖရုံယို-စိန်င်္ဟသာ',325,'grocery_food',true,'snacks-sweets','Sein Hinthar','SN0506',200,'g','{}'::text[],449),
 ('2990021101023','Butter Bread Crispy - Shwe Kyee','ရွှေကျီးထောပါတ်မုန့်ကြွပ်',411,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0102',330,'g','{}'::text[],549),
 ('2990021101030','Butter Bread Crispy - Shwe Kyee Thaedaw','ရွှေကျီးသဲတော မုန့်ကြွပ်',374,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0103',250,'g','{}'::text[],499),
 ('2990021101054','Cake Drd - Shwe Kyee','ရွှေကျီးကိတ်ခြောက်',411,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0105',200,'g','{}'::text[],549),
 ('2990021101085','Crispy Butter Bread','ရွှေကျီး-ရွှေလုံး',897,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0108',450,'g','{}'::text[],null),
 ('2990021102013','Egg Soft Flour Cake - Shwe Kyee','ရွှေကျီးကြက်ဥမရွေး',329,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0201',200,'g','{}'::text[],449),
 ('2990021102020','Milk Rusk Sticks(160g)','ရွှေကျီး-နို့မှုန့်ချောင်း (160g)',247,'grocery_food',true,'snacks-sweets','Shwe Kyee','BK0202',160,'g','{}'::text[],349),
 ('2990191407048','Sunflower Seeds- 170g (Swal Naypye)','စွဲနေပြီ နေကြာစေ့ 170g',329,'grocery_food',true,'snacks-sweets','Swal Naypye','SN0704',170,'g','{}'::text[],449),
 ('2990201301045','Fried Achovy Fish Balachaung (175g)-Times Mon','ငါးနီတူဘာလချောင်ကြော် -175g (Times Mon)',500,'grocery_food',true,'snacks-sweets','Times Mon','TM0104',175,'g',array['balachaung','balachong','bala chaung']::text[],699),
 ('2990201301021','Fried Bombay Duck Fish - Times Mon','အာဗြဲခြောက်ဘာလချောင်ကြော် -(Times Mon)',585,'grocery_food',true,'snacks-sweets','Times Mon','TM0102',142,'g',array['balachaung','balachong','bala chaung']::text[],749),
 ('2990201301076','Fried Dried Shrimp with Fish Sauce','ငံပြာရည်ကြော်-150g (Times Mon)',520,'grocery_food',true,'snacks-sweets','Times Mon','TM0107',150,'g',array['ngan pya yay','fish sauce']::text[],699),
 ('2990201302134','Onion Frd (Times Mon)-160g','ကြက်သွန်ကြော်',500,'grocery_food',true,'snacks-sweets','Times Mon','TM0213',160,'g','{}'::text[],699),
 ('2990201304022','Plum Taggery -Times Mon','ဇီးထန်းညက် (Times Mon)',500,'grocery_food',true,'snacks-sweets','Times Mon','TM0402',160,'g',array['zee','zi','plum']::text[],699),
 ('2990201301014','Shrimp Pst Balachong- Times Mon','ပုဇွန်ဘာလချောင်ကြော်(Times Mon)',520,'grocery_food',true,'snacks-sweets','Times Mon','TM0101',200,'g',array['balachaung','balachong','bala chaung']::text[],699),
 ('2990201301052','Shrimp pst Balachong 180g','ဖွားကြင်ဘာလချောင်ကြာ် (Times Mon)',546,'grocery_food',true,'snacks-sweets','Times Mon','TM0105',180,'g',array['balachaung','balachong','bala chaung']::text[],749),
 ('2990021101115','WA-Phee Biscuit','၀ဖီး ဘီးစကစ်',396,'grocery_food',true,'snacks-sweets','WA phee','BK0111',240,'g','{}'::text[],549),
 ('2990191405013','Peanut Candy - Yathar Kaung','ရသာကောင်း မြေပဲချိုချဉ်',449,'grocery_food',true,'snacks-sweets','Yathar Kaung','SN0501',300,'g',array['pe','bean']::text[],599),
 ('2990191405020','Sesame Brittle - Yathar Kaung','နှမ်းနက်ယို ရသာကောင်း',329,'grocery_food',true,'snacks-sweets','Yathar Kaung','SN0502',126,'g','{}'::text[],449),
 ('2990191407055','Sunflower Seeds-135g Yee Shin','ရီရှင်းနေကြာစေ့ 135g',202,'grocery_food',true,'snacks-sweets','Yee Shin','SN0705',135,'g','{}'::text[],249),
 ('2990191403071','Crispy Snacks -Ywart Ywart Sat Sat','ရွရွစပ်စပ်အကြော်စုံ',299,'grocery_food',true,'snacks-sweets','Ywart Ywart Sat Sat','SN0307',135,'g','{}'::text[],399),
 ('2990021101146','Butter Bread (Nice Food)','နိုက်ဖု ထောပတ်မုန့်ကြွပ် (270g)',408,'grocery_food',true,'snacks-sweets',null,'BK0114',null,null,'{}'::text[],549),
 ('2990190401108','Fish Cake Curry','ငါးရွှေဘာလချောင်ကြော် (ဟံသာ)',742,'grocery_food',true,'snacks-sweets',null,'SD0110',null,null,array['balachaung','balachong','bala chaung']::text[],null),
 ('2990200201124','Tea Leaves -400g','ဇယန်းလက်ဖက်ချိုနှပ်-400g',644,'grocery_food',true,'tea-laphet','Grandma','TB0112',400,'g',array['laphet','lahpet','letphet','pickled tea']::text[],999),
 ('2990200201117','Tea Leaves with Chilli-400g','ဇယန်းလက်ဖက်ချဉ်စပ်နှပ်-400g',644,'grocery_food',true,'tea-laphet','Grandma','TB0111',400,'g',array['laphet','lahpet','letphet','pickled tea']::text[],999),
 ('2990200201209','Tea Lvs H&S Bot - Zayan (Sein Hinthar)-120g','ဇယန်းလက်ဖက်ချိုနှပ်သံဗူး-120g',286,'grocery_food',true,'tea-laphet','Grandma','TB0120',120,'g',array['laphet','lahpet','letphet','pickled tea']::text[],449),
 ('2990200201186','Tea Lvs H&S Bot - Zayan Chilli(Sein Hinthar)-120g','ဇယန်းလက်ဖက်ချဉ်စပ်သံဗူး-120g',286,'grocery_food',true,'tea-laphet','Grandma','TB0118',120,'g',array['laphet','lahpet','letphet','pickled tea']::text[],449),
 ('2990131905023','Ginger -320g (Morning Star)','ဂျင်းသားအထုပ် 320g (Morning Star)',520,'grocery_food',true,'tea-laphet','Morning Star','MS0502',320,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],799),
 ('2990131905016','Golden Palaung Pickied Tea Leaf -160g (Morning Star)','ရွှေပလောင်လက်ဖက်အဆိမ့်',429,'grocery_food',true,'tea-laphet','Morning Star','MS0501',null,null,array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],649),
 ('2990131905047','Golden Palaung Pickied Tea Leaf Spicy-160g (Morning Star)','လက်ဖက်ညွန့်စပ်ကဲ-(Morning Star)-160g',429,'grocery_food',true,'tea-laphet','Morning Star','MS0504',160,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],649),
 ('2990032003040','Tea Lvs Drd-Saw Bwa Gyi','စော်ဘွားကြီးလက်ဖက်ခြောက်',247,'grocery_food',true,'tea-laphet','Sawbwa Min','CT0304',70,'g',array['laphet','lahpet','letphet','pickled tea']::text[],399),
 ('2990200201216','Assorted Roasted Mixed Bean & Ginger(300 g)','ဖွားကြင်ဂျင်းသုပ်-300g',520,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0121',300,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger','pe','bean']::text[],799),
 ('2990200201223','Assorted Roasted Mixed Bean & Tea Leaves','စိန်ဟင်္သာလက်ဖက်ချိုနှပ်ထုတ်-454g',520,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0122',454,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger','pe','bean']::text[],799),
 ('2990200202138','Assorted Roasted Mixed Bean & Tea Leaves-227g','ဖွားကြင်လူကြီးအကြိုက်အကြော်စုံလက်ဖက်-227g',585,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0213',227,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],899),
 ('2990200203029','Assorted Roasted Mixed Bean Big(454g)','ပဲနှစ်ပြန်ကြော် အထုတ်ကြီး(၄၅၄g)',682,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0302',454,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],1049),
 ('2990200202121','Assorted Roasted Mixed Bean and Zayan Tealeaf (227g)','ဇယန်းလက်ဖက်နှင့် အကြော်စုံအထုတ်(227g)',422,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0212',227,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],649),
 ('2990200203036','Assorted Roasted Mixed Bean small(227g)','ပဲနှစ်ပြန်ကြော် (၂၂၇g)',358,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0303',227,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],549),
 ('2990200203050','Assorted Roasted Mixed Bean small(260g)','ပဲနှစ်ပြန်ကြော် (၂၆၀g)',455,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0305',260,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],699),
 ('2990200203043','Assorted Roasted Mixed Bean(One One)(454g)','ဝမ်းဝမ်း ပဲနှစ်ပြန်ကြော် (၄၅၄g)',715,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0304',454,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],1099),
 ('2990200201230','Ginger-Japan-227','ဂျပန်ဂျင်းပြားနှပ်-227g',390,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0123',227,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],599),
 ('2990200201193','Steamed Ginger-227g','ဂျင်းပေါင်း-227g',585,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0119',227,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],899),
 ('2990200202114','Tea & Bean Asst Rst Mxd-Shwe Hinthar (640g)','စိန်င်္ဟသာတစ်ခါစားလက်ဖက်နှင့် အကြော်စုံ ချိုနှပ်(640g)',455,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0211',640,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],699),
 ('2990200202039','Tea & Bean Asst Rst Mxd-Shwe Hinthar Spicy (640g)','စိန်င်္ဟသာတစ်ခါစားလက်ဖက်နှင့် အကြော်စုံ ချဉ်စပ်(640g)',552,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0203',640,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],849),
 ('2990200201094','Tea Lvs - Sein Hintar (1000g)','စိန်င်္ဟသာလက်ဖက်အသား(၁၀၀၀g)',1690,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0109',1000,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],null),
 ('2990032003033','Tea Lvs Drd-Sein Hinthar','စိန်င်္ဟသာလက်ဖက်ခြောက်',117,'grocery_food',true,'tea-laphet','Sein Hinthar','CT0303',113,'g',array['laphet','lahpet','letphet','pickled tea']::text[],195),
 ('2990200201063','Tea Lvs H&S - Sein Hintar 227g','ရှူးရှဲနှပ်- စိန်င်္ဟသာ(၂၂၇g)',455,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0106',227,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],699),
 ('2990200201056','Tea Lvs H&S Bot - Zayan(454g)','ဇယန်းလက်ဖက်ချဉ်စပ်ဗူး (၄၅၄g)',644,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0105',454,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],999),
 ('2990200201100','Tea Lvs-Sein Hinthar (227g)','လက်ဖက်အသား- စိန်င်္ဟသာ(227g)',455,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0110',227,'g',array['laphet','lahpet','letphet','pickled tea']::text[],699),
 ('2990032003064','Tealeaf-Pintaya-115g','ပင်းတယရွက်စိမ်းလက်ဖက်ခြောက်-115g',390,'grocery_food',true,'tea-laphet','Sein Hinthar','CT0306',115,'g',array['laphet','lahpet','letphet','pickled tea']::text[],599),
 ('2990032003071','Tealeaf-Taungtanthulay-115g','တောင်တန်းသူလေးကောက်ညှင်းမွှေးလက်ဖက်ခြောက်',390,'grocery_food',true,'tea-laphet','Sein Hinthar','CT0307',115,'g',array['laphet','lahpet','letphet','pickled tea']::text[],599),
 ('2990200201032','Zayan Tea Lvs Bot','ဇယန်းလက်ဖက်ချိုနပ်ဗူး(454g)',644,'grocery_food',true,'tea-laphet','Sein Hinthar','TB0103',454,'g',array['laphet','lahpet','letphet','pickled tea','pe','bean']::text[],999),
 ('2990032003026','Tea Lvs Drd-Soe Win (80g)','စိုးဝင်းလက်ဖက်ခြောက်',374,'grocery_food',true,'tea-laphet','Soe Win','CT0302',80,'g',array['laphet','lahpet','letphet','pickled tea']::text[],599),
 ('2990201302042','Natural Zayan Tea Leaf(454g) Times Mon','ဇယန်းလက်ဖက်အညွန့်(၄၅၄g) Times Mon',858,'grocery_food',true,'tea-laphet','Times Mon','TM0204',454,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],1149),
 ('2990201302110','Tea Leaf Chilli- Times Mon','ဇယန်းလက်ဖက်အညွန့်ချဉ်စပ်(၂၅၀g) Times Mon',520,'grocery_food',true,'tea-laphet','Times Mon','TM0211',250,'g',array['laphet','lahpet','letphet','pickled tea','gyin','ginger']::text[],799),
 ('2990201302103','Natural Zayan Tea Leaf (250g)','Gramdma ဇယန်းလက်ဖက်အညွန့်(၂၅၀)',594,'grocery_food',true,'tea-laphet',null,'TM0210',null,null,array['laphet','lahpet','letphet','pickled tea']::text[],899),
 ('2990200201179','Steamed Ginger-227g','ဂျင်းပေါင်း-227g',668,'grocery_food',true,'tea-laphet',null,'TB0117',null,null,array['gyin','ginger']::text[],1049),
 ('2990032003057','Tea Lvs Drd (120g)','တောင်ကြီးလက်ဖက်ခြောက်',327,'grocery_food',true,'tea-laphet',null,'CT0305',null,null,array['laphet','lahpet','letphet','pickled tea']::text[],499)
-- CHARGED money columns (price_cents/tax_category/ebt_eligible) are set on INSERT ONLY and
-- deliberately omitted from the DO UPDATE: once a row exists they are owner-owned, so a re-run
-- refreshes browse fields without reverting a hand-corrected live price to the 2021-22 estimate.
-- compare_at_cents IS refreshed — it's a derived market reference (regenerated from competitor
-- sampling), not a charged amount. The CASE guards the CHECK (compare_at > price): if an owner
-- hand-RAISED a live price above this row's seed compare-at, refreshing it verbatim would violate
-- the CHECK and abort the ENTIRE batch upsert — so we null it instead (no fake sale on that row).
on conflict (barcode) do update set
  name = excluded.name, name_my = excluded.name_my,
  category = excluded.category, brand = excluded.brand, sku = excluded.sku,
  size_qty = excluded.size_qty, size_unit = excluded.size_unit, synonyms = excluded.synonyms,
  compare_at_cents = case
    when excluded.compare_at_cents > grocery_items.price_cents then excluded.compare_at_cents
    else null end;

-- ── W9d — seed the loud "Save N%" pill's featured set ────────────────────────────────────────────
-- MUST live here, not only in 20260731000000_w9d_featured_deal.sql: config.toml [db.seed] loads this
-- file AFTER migrations, so the migration's identical backfill runs against an EMPTY grocery_items on
-- a fresh `db reset` and features nothing. Without this copy the feature would ship switched off in
-- every local/CI/preview environment while looking fine on the live project. Keep the two in sync.
--
-- Top 2 per aisle by ABSOLUTE savings among real ≥20% markdowns (dollars off beats percent off for a
-- shopper), barcode breaking ties so the set is reproducible. 8 aisles clear the bar → 16 of 396 SKUs.
-- Guarded on `= false` so a re-run never clobbers the owner's own curation.
with ranked as (
  select
    barcode,
    row_number() over (
      partition by category
      order by (compare_at_cents - price_cents) desc, barcode
    ) as rnk
  from grocery_items
  where compare_at_cents is not null
    and compare_at_cents > price_cents
    and available
    and (compare_at_cents - price_cents)::numeric / compare_at_cents >= 0.20
)
update grocery_items g
set is_featured_deal = true
from ranked r
where g.barcode = r.barcode
  and r.rnk <= 2
  and g.is_featured_deal = false;

-- ============ W5c — menu depth: bilingual descriptions + modifier labels + real modifier coverage ============
-- Requires migration 20260721000000_w5c_menu_depth.sql (description_my / name_my columns).
-- Idempotent both ways: value-stable UPDATEs + ON CONFLICT DO NOTHING inserts — safe to re-run locally
-- and to apply verbatim to live (the live rows predate the seed, so the earlier inserts no-op there).
-- ⚠️ Burmese strings are Claude-authored diaspora register — pending Min's native check (OPEN-ITEMS K15/K16).
-- ⚠️ The NEW modifier coverage (spice on made-to-order/salad dishes, drink sweetness + temperature,
--    rice pairing at real side prices, v7.2's soft-egg add-on) mirrors docs/prototype/v7.2.html MODS +
--    description-promised choices (e.g. Coffee "Hot or cold") — kitchen confirmation before real service.

-- ── Bilingual descriptions (all 60 items) ───────────────────────────────────────────────────────────
update menu_items set description_my = v.d from (values
  ('acacia-with-shrimp-curry','ပုစွန်ထည့် ကင်ပွန်းရွက်ချဥ် ကြော်ချက်။'),
  ('balachaung','ကြက်သွန်ကြော်၊ ပုစွန်ခြောက်၊ ချင်း၊ ငရုတ်သီးနီတို့ဖြင့် ကြော်ထားသော ဘာလချောင်။'),
  ('bamboo-shoot-mushroom-soup','မျှစ်နုနှင့် မှိုကို အရသာရှိရှိ ချက်ထားသော တောချက်ဟင်း။'),
  ('bamboo-shoot-with-pork-soup','ဝက်သားနှင့် မျှစ်ချဥ်ကို မန်ကျည်းရည်ဖြင့် ချက်သော အချဥ်ဟင်း။'),
  ('beef-curry','ဖြည်းဖြည်းနှပ်ချက်ထားသော မြန်မာ့အိန္ဒိယဟန် အမဲသားဟင်း။'),
  ('beef-pounded-deep-fried','နှပ်ပြီးထောင်းထားသော အမဲသားကို ငရုတ်ဆီစပ်စပ်ဖြင့် ကြော်ချက်။'),
  ('biriyani-dan-pauk','ကြက်သားနှင့် ဖြည်းဖြည်းချက် ဒံပေါက်ထမင်း။'),
  ('boneless-catfish-curry','အရိုးမပါ ငါးခူကို မန်ကျည်းအနှစ်ဖြင့် မွှေချက်ထားသည်။'),
  ('burmese-fried-rice','ကြက်ဥ၊ ကြက်သွန်၊ ပဲပြုတ်တို့ဖြင့် ကြော်ထားသော မြန်မာထမင်းကြော်။'),
  ('burmese-milk-tea','နို့ဆီနှင့် နို့စိမ်းရောဖျော်ထားသော မြန်မာလက်ဖက်ရည် — လက်ဖက်ရည်ဆိုင်အရသာ။'),
  ('century-egg-salad','ဆေးဘဲဥ၊ ခရမ်းချဥ်သီး၊ ကြက်သွန်နီ၊ ပဲမှုန့်တို့ဖြင့် သုပ်ထားသည် (မြေပဲနှင့် ပုစွန်ခြောက်မှုန့် ပါသည်)။'),
  ('chicken-curry','ခြံမွေးကြက်ဖြင့် ချက်သော ကြက်သားဟင်း — ရိုးရိုး၊ မဆလာ၊ အုန်းနို့ ရွေးနိုင်သည်။'),
  ('chicken-giblets-curry','ကြက်အသဲအမြစ်ကို ရိုးရာဟန်ချက်ထားသော ဟင်း။'),
  ('chicken-gourd-curry','ကြက်သားနှင့် ဗူးသီးကို မြန်မာဟန် ချက်ထားသည်။'),
  ('coconut-chicken-and-rice','အုန်းထမင်း၊ ဘာလချောင်နှင့် အုန်းဆီချက် ကြက်သားဟင်း တွဲဖက်။'),
  ('coconut-rice','အုန်းနို့ဖြင့် ချက်ထားသော ထမင်းမွှေး။'),
  ('coffee','ပူပူ သို့မဟုတ် ရေခဲထည့် ကော်ဖီ (၁၀ အောင်စ)။'),
  ('crab-masala-curry','ဂဏန်းတစ်ကောင်လုံးကို မဆလာငရုတ်အနှစ်နှင့် မန်ကျည်းဖြင့် ပြုတ်ချက်။'),
  ('duck-egg-curry','ဘဲဥပြုတ်ကို ခရမ်းချဥ်သီးအနှစ်ဖြင့် ချက်ထားသော ဟင်း။'),
  ('everything-salad','ရေမှော်၊ ခေါက်ဆွဲ၊ အာလူး၊ ငှက်ပျောဖူး၊ သင်္ဘောသီးပါ အသုပ်စုံ (မြေပဲနှင့် ပုစွန်ခြောက်မှုန့် ပါသည်)။'),
  ('faluda','ပူတင်း၊ ကျောက်ကျော၊ အခွံမာသီးစုံပါ မြန်မာဖါလူဒါ။'),
  ('fermented-fish-paste-ngapi','ငပိရည်ကျိုနှင့် စားဖွယ်ဟင်းသီးဟင်းရွက်စုံ။'),
  ('fish-paste-tomato-curry','ငါးပိကို ခရမ်းချဥ်သီး၊ ချင်း၊ ကြက်သွန်ဖြင့် ချက်ထားသည်။'),
  ('fishcake-stuffed-salad','ဟင်းသီးဟင်းရွက်အစာသွပ် ငါးဖယ်ကြော်နှင့် ကြက်သွန်ဖြူကြော်။'),
  ('fried-catfish-curry','ငါးခူကြော်ကို အနှစ်ဖြင့် ပြန်နှပ်ချက်ထားသည်။'),
  ('fried-fish-cake-curry','ငါးဖယ်ကြော်ကို မန်ကျည်းအနှစ်ဖြင့် နှပ်ချက်ထားသည်။'),
  ('goat-curry','ဆိတ်သားကို မြန်မာ့အိန္ဒိယ မဆလာဟန် နှပ်ချက် (အသား သို့ ကလီစာ ရွေးနိုင်သည်)။'),
  ('goat-marrow-soup','ဆိတ်ရိုးတွင်းဆီ၊ ကုလားပဲ၊ အာလူးပါ စွပ်ပြုတ် — ပလာတာနှင့် အတွဲညီသည်။'),
  ('grilled-aubergine-salad','မီးဖုတ်ခရမ်းသီးကို ကြက်သွန်၊ ငရုတ်၊ သံပရာ၊ မြေပဲဖြင့် သုပ်ထားသည်။'),
  ('hilsa-fish','ငါးသလောက်ကို ခရမ်းချဥ်သီးအနှစ်ဖြင့် ပေါင်းချက်။'),
  ('kyay-o','ဆန်ကြာဇံ၊ ဝက်သား၊ အသားလုံး၊ အူ၊ ဘဲဥ၊ ဟင်းနုနွယ်ပါ ကြေးအိုး — ဟင်းရည် သို့ ဆီချက်။'),
  ('lemon-salad','ရှောက်သီးလတ်ဆတ်ဆတ်ကို ကြက်သွန်၊ ပုစွန်ခြောက်မှုန့်၊ ကြက်သွန်ဖြူကြော်ဖြင့် သုပ်ထားသည်။'),
  ('mee-shay','မန္တလေးမြှီးရှည် — ပဲငံပြာရည်အချို၊ ဝက်သား၊ အခေါက်ကြွပ်၊ မုန်ညင်းချဥ်။'),
  ('mixed-veggie-shrimp-stir-fry-rice','ဟင်းသီးဟင်းရွက်စုံ၊ ငုံးဥ၊ ပုစွန်တို့ကို ကြော်ချက်ကာ ထမင်းဖြူပေါ် တင်ပေးသည်။'),
  ('mixed-veggie-soup','ဟင်းသီးဟင်းရွက်စုံကို ကုလားဟင်းဟန် အနည်းငယ်စပ်စပ် ချက်ထားသည်။'),
  ('mohinga','ငါးဟင်းရည်နှင့် မုန့်ဖတ်၊ အကြော်စုံ၊ ဘဲဥလှီး — မြန်မာ့နံနက်စာ ဂန္ထဝင်။'),
  ('nan-gyi-mont-ti','နန်းကြီးမုန့်ဖတ်ကို မန္တလေးကြက်သားဟင်းအနှစ်၊ ငါးဖယ်၊ အကြွပ်စုံဖြင့် သုပ်ထားသည်။'),
  ('ngapi-rice-salad','ငပိအနှစ်နှင့် ထမင်းသုပ် — ကြက်ဥတစ်ဖက်ကြော် ပါသည်။'),
  ('ohno-khao-swe','အုန်းနို့ကုလားပဲဟင်းရည်၊ ဂျုံခေါက်ဆွဲ၊ ကြက်ပေါင်၊ ဘဲဥ၊ အကြော်စုံပါ အုန်းနို့ခေါက်ဆွဲ။'),
  ('parata','နှစ်ချပ်။ ဆိတ်ရိုးစွပ်ပြုတ်နှင့်ဖြစ်စေ ဟင်းများနှင့်ဖြစ်စေ တွဲစားလို့ကောင်းသည်။'),
  ('peas-naan-pyar','ဖြည်းဖြည်းပြုတ် စားတော်ပဲနှင့် နံပြား။'),
  ('peas-parata','စားတော်ပဲပြုတ်နှင့် ပလာတာကြွပ်ကြွပ် နှစ်ချပ်။'),
  ('peas-steamed','ဖြည်းဖြည်းပေါင်းပြုတ်ထားသော စားတော်ပဲ — မြန်မာ့နံနက်စာ အမယ်စစ်စစ်။'),
  ('pickled-tea-salad','လက်ဖက်နှင့် ဆလတ်၊ ပဲကြော်အကြွပ်စုံ (မြေပဲနှင့် ပုစွန်ခြောက်မှုန့် ပါသည်)။'),
  ('pinto-beans','ပဲရေပွကို ကြက်သွန်၊ ကြက်သွန်ဖြူ၊ ဟင်းခတ်အမွှေးဖြင့် မြန်မာဟန် ကြော်ချက်။'),
  ('pork-curry','ဝက်သနီ — အချိုအနှစ်နှင့် အစပ်သင့်ရုံချက်ထားသော ဂန္ထဝင်ဝက်သားဟင်း။'),
  ('pork-horsegram-bean-curry','ဝက်သားကို ပုန်းရည်ကြီးနှင့် ချက်ထားသော အနံ့မွှေးဟင်း။'),
  ('pork-offals-curry','ဝက်ကလီစာ၊ အူ၊ အသဲတို့ကို အစပ်သင့်ရုံ ချက်ထားသည်။'),
  ('pork-skewers','ဝက်သား၊ အူ၊ အသဲကို ဆေးဖက်အမွှေးအကြိုင်ဖြင့် ဖြည်းဖြည်းနှပ်ထားသော ဒုတ်ထိုး — နှစ်စရာအနှစ်ရည် ပါသည်။'),
  ('rakhine-mont-ti','ရခိုင်ရိုးရာ ငါးဟင်းရည်နှင့် မုန့်ဖတ်၊ ငါးဖယ်၊ ကြက်သွန်။'),
  ('rice','ပေါင်းချက်ထားသော ထမင်းဖြူ။'),
  ('rice-with-pickled-tea-salad','လက်ဖက်သုပ်နှင့် ထမင်းရော — ကြက်ဥတစ်ဖက်ကြော် ပါသည်။'),
  ('river-prawns-curry','မြစ်ပုစွန်တစ်ကောင်လုံးကို ပုစွန်ဆီထွက်နှင့် မွှေးမွှေးချက်ထားသည်။'),
  ('roselle-with-shrimp-curry','ပုစွန်ထည့် ချဥ်ပေါင်ရွက် ကြော်ချက်။'),
  ('shan-noodles','ရှမ်းခေါက်ဆွဲ — ခရမ်းချဥ်သီးဝက်သားအနှစ်၊ မြေပဲ၊ ကြက်သွန်ဖြူကြော်၊ မုန်ညင်းချဥ်၊ ငရုတ်သီးအနှစ်။'),
  ('snakehead-innards-curry','ငါးရံ့အူကို အနှစ်စပ်စပ်ဖြင့် ချက်ထားသည်။'),
  ('swai-fish-curry','ငါးမြင်းကို အစပ်သင့်ရုံ အနှစ်ဖြင့် ချက်ထားသည်။'),
  ('sweet-shrimps-curry','ပုစွန်ကို အချိုအနှစ်ဖြင့် ကြော်နှပ်ချက်။'),
  ('tom-yum-fried-rice-or-noodles','ပုစွန်၊ ဟင်းသီးဟင်းရွက်နှင့် တုန်ရန်းအမွှေး (စပါးလင်၊ ချင်းခါး၊ ရှောက်ရွက်) ကြော်ချက်။'),
  ('tomato-salad','အော်ဂဲနစ်ခရမ်းချဥ်သီး၊ ကြက်သွန်နီ၊ ပဲမှုန့်၊ ဆလတ်၊ ယိုးဒယားငရုတ်သီး သုပ်။')
) as v(slug, d) where menu_items.slug = v.slug;

-- ── Bilingual labels for the EXISTING modifier groups + options ─────────────────────────────────────
update modifier_groups set name_my = v.m from (values
  ('beef_curry_style','အမဲဟင်း ချက်နည်း'),
  ('chicken_curry_style','ကြက်ဟင်း ချက်နည်း'),
  ('goat_curry_cut','ဆိတ်သား ရွေးချယ်မှု'),
  ('kyay_o_addons','ကြေးအိုး ထပ်ထည့်စရာ'),
  ('kyay_o_protein','အသား ရွေးချယ်မှု'),
  ('kyay_o_style','ပုံစံ'),
  ('tom_yum_base','အခြေခံရွေး')
) as v(slug, m) where modifier_groups.slug = v.slug;

update modifier_options set name_my = v.m from (values
  ('beef_curry_style__spiced','အစပ်ချက်'),
  ('beef_curry_style__non_spicy_braised','အစပ်မပါ ကြော်နှပ်'),
  ('chicken_curry_style__original','ရိုးရိုး'),
  ('chicken_curry_style__masala','မဆလာ'),
  ('chicken_curry_style__coconut','အုန်းနို့'),
  ('goat_curry_cut__original','ရိုးရိုးအသား'),
  ('goat_curry_cut__offal','ကလီစာ'),
  ('kyay_o_addons__brains','ဦးနှောက် ထပ်ထည့်'),
  ('kyay_o_protein__pork_default','ဝက်သား (ပုံမှန်)'),
  ('kyay_o_protein__chicken_plus_egg','ကြက်သား + ဘဲဥ'),
  ('kyay_o_style__soup','ကြေးအိုး (ဟင်းရည်)'),
  ('kyay_o_style__si_chat','ဆီချက် (အခြောက်)'),
  ('tom_yum_base__fried_rice','ထမင်းကြော်'),
  ('tom_yum_base__fried_noodles','ခေါက်ဆွဲကြော်')
) as v(slug, m) where modifier_options.slug = v.slug;

-- Kyay-O's own add-on group keeps its Brains option but takes a distinct name, so it never reads as
-- a duplicate of the universal "Choose your add-ons" group on the same sheet.
update modifier_groups set name = 'Kyay-O add-ons' where slug = 'kyay_o_addons';

-- ── NEW modifier groups (v7.2 MODS + description-promised choices) ──────────────────────────────────
-- All OPTIONAL except drink temperature (Coffee's own description promises "Hot or cold" — the kitchen
-- must know, so it's required; that puts the two drinks on the "Choose" pill, everything else keeps
-- one-tap add). Spice level rides only on made-to-order dishes (noodles/stir-fries/hand-mixed salads)
-- and the owner-tagged spicy_optional items — batch-pot curries can't honestly promise a per-order heat.
insert into modifier_groups (id, slug, name, name_my, selection_type, min_select, max_select) values
  ('d5cd2b17-fc24-401e-ae41-563ba61008d3','spice_level','Spice level','အစပ်အဆင့်','single',0,1),
  ('3d89569d-673a-4f9d-a199-95adc1d674de','sweetness','Sweetness','အချိုအဆင့်','single',0,1),
  ('817e6de9-9ab6-4a9e-b9d5-fcfaffb4f6fa','drink_temp','Temperature','ပူ/အေး','single',1,1),
  ('ad144971-f0d5-4095-8d24-43d2bf774fe5','addons','Choose your add-ons','ထပ်ထည့်စရာ ရွေးပါ','multiple',0,8)
on conflict (id) do nothing;

insert into modifier_options (id, group_id, slug, name, name_my, price_delta_cents, sort_order, is_active) values
  ('f5404218-dc4d-4717-9527-d88996ea708c','d5cd2b17-fc24-401e-ae41-563ba61008d3','spice_level__mild','Mild','အစပ်လျှော့',0,0,true),
  ('9fb0557d-1d1e-439a-853d-93e467534047','d5cd2b17-fc24-401e-ae41-563ba61008d3','spice_level__medium','Medium','ပုံမှန်အစပ်',0,1,true),
  ('8fdbce8c-8356-47cb-adaa-e0be4710471c','d5cd2b17-fc24-401e-ae41-563ba61008d3','spice_level__burmese_hot','Burmese 🔥','မြန်မာအစပ်',0,2,true),
  ('a115864a-61f5-4c12-a419-3dd919cdb9c7','3d89569d-673a-4f9d-a199-95adc1d674de','sweetness__less_sweet','Less sweet','အချိုလျှော့',0,0,true),
  ('61a615a7-c7a6-4350-8585-b02cb3898eaa','3d89569d-673a-4f9d-a199-95adc1d674de','sweetness__normal','Normal','ပုံမှန်',0,1,true),
  ('0b03c9ea-332f-41b5-9835-7521734f8c3a','3d89569d-673a-4f9d-a199-95adc1d674de','sweetness__extra_sweet','Extra sweet','အချိုပို',0,2,true),
  ('af086083-d010-416d-aff9-d970afb58346','817e6de9-9ab6-4a9e-b9d5-fcfaffb4f6fa','drink_temp__hot','Hot','ပူပူ',0,0,true),
  ('ccc7309d-c771-4403-8536-36208b6db8e4','817e6de9-9ab6-4a9e-b9d5-fcfaffb4f6fa','drink_temp__iced','Iced','ရေခဲထည့်',0,1,true),
  ('f3693d6a-690b-4129-aaa6-a403496f65ad','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__steamed_white_rice','Steamed White Rice','ထမင်းဖြူ',200,0,true),
  ('206a7668-925d-45e7-a631-3a73fcbacd13','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__coconut_rice','Coconut Rice','အုန်းထမင်း',300,1,true),
  ('e2d2b664-1bd0-4830-865d-5491f4f8b7d9','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__boiled_egg','Boiled Egg (1 pc)','ဥပြုတ် (၁ လုံး)',150,2,true),
  ('5472eb0f-5833-4cff-b398-b4b3254d0c4b','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__sunny_egg','Sunny Egg (1 pc)','ကြက်ဥ တစ်ဖက်ကြော် (၁ လုံး)',200,3,true),
  ('a00996d2-e440-4c66-9bfc-12e4d468fe1e','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__mohinga_soup','Mohinga Soup','မုန့်ဟင်းခါးဟင်းရည်',400,4,true),
  ('95972310-fec3-4d24-8f01-0be2702c647c','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__ohn_noh_soup','Ohn-Noh Soup','အုန်းနို့ဟင်းရည်',400,5,true),
  ('8f73d056-3928-4905-a81b-11a6451a6b9a','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__balachaung','Balachaung','ဘာလချောင်',200,6,true),
  ('9f594b18-33a2-4722-ac88-6f8ea93e01a8','ad144971-f0d5-4095-8d24-43d2bf774fe5','addons__veggie_fritters','Veggie Fritters (2 pcs)','ဟင်းသီးဟင်းရွက်ကြော် (၂ ခု)',300,7,true)
on conflict (id) do nothing;

-- Spice level → made-to-order noodle/stir-fry dishes, hand-mixed salads, + owner-tagged spicy_optional.
insert into item_modifier_groups (item_id, group_id)
select mi.id, 'd5cd2b17-fc24-401e-ae41-563ba61008d3'::uuid from menu_items mi where mi.slug in (
  'shan-noodles','nan-gyi-mont-ti','mee-shay','rakhine-mont-ti','kyay-o','mohinga','ohno-khao-swe',
  'burmese-fried-rice','mixed-veggie-shrimp-stir-fry-rice','tom-yum-fried-rice-or-noodles',
  'pickled-tea-salad','lemon-salad','tomato-salad','grilled-aubergine-salad','century-egg-salad',
  'everything-salad','ngapi-rice-salad','rice-with-pickled-tea-salad','fishcake-stuffed-salad',
  'crab-masala-curry','goat-curry','mixed-veggie-soup'
) on conflict do nothing;

-- Sweetness + Temperature → the two made-to-order drinks (Faluda's build is fixed).
insert into item_modifier_groups (item_id, group_id)
select mi.id, g.id from menu_items mi
cross join (values ('3d89569d-673a-4f9d-a199-95adc1d674de'::uuid), ('817e6de9-9ab6-4a9e-b9d5-fcfaffb4f6fa'::uuid)) as g(id)
where mi.slug in ('burmese-milk-tea','coffee')
on conflict do nothing;

-- Add-ons → every main (the owner's real add-on menu: rice, eggs, side soups, balachaung, fritters).
-- Drinks and plain sides sit them out; salads keep them (tea salad + mohinga soup is the classic pairing).
insert into item_modifier_groups (item_id, group_id)
select mi.id, 'ad144971-f0d5-4095-8d24-43d2bf774fe5'::uuid from menu_items mi
where mi.category_id in (select id from menu_categories where slug in
  ('all-day-breakfast','rice-noodles-soups','curries-a-la-carte','seafood-curries','vegetables','appetizers-salads'))
on conflict do nothing;

-- ── W5c·r2 — engaging EN descriptions (owner feedback: "more elaborate, engaging, fun") ─────────────
-- Voice: sensory + warm, honest (no invented ingredients/claims); a few lines adapt the owner's own
-- customer-review phrasing (parata, pork curry, tea salad). Overrides the terse originals everywhere
-- (fresh seed AND live re-run — value-stable, idempotent).
update menu_items set description_en = v.d from (values
  ('acacia-with-shrimp-curry','Tangy acacia leaves and sweet shrimp — sour, savory, and green all at once. A village classic you rarely find stateside.'),
  ('balachaung','The crunchy, garlicky, shrimpy condiment that makes everything better. Spoon it over rice and watch the table go quiet.'),
  ('bamboo-shoot-mushroom-soup','Young bamboo shoots and mushrooms in a clean, savory broth — earthy, gentle, quietly addictive.'),
  ('bamboo-shoot-with-pork-soup','Tender pork and sour bamboo shoots in a tamarind broth — bright, tangy comfort in a bowl.'),
  ('beef-curry','Slow-braised until the beef gives up completely — deep Burmese-Indian spices in a rich, clinging gravy.'),
  ('beef-pounded-deep-fried','Braised beef pulled, pounded, and crisped in chili oil — intensely beefy, with a slow-building heat.'),
  ('biriyani-dan-pauk','Burmese-style biriyani slow-cooked until every grain turns golden and fragrant, with tender chicken throughout.'),
  ('boneless-catfish-curry','Silky boneless catfish in a gently spiced tamarind sauce — bright, mellow, made for spooning over rice.'),
  ('burmese-fried-rice','Golden fried rice with eggs and buttery boiled yellow peas — simple, comforting, exactly what you want it to be.'),
  ('burmese-milk-tea','Strong black tea pulled with condensed and evaporated milk — the teahouse staple, sweet and silky.'),
  ('century-egg-salad','Creamy century egg tossed with tomato, shallot, and chickpea powder — savory, punchy, unlike any salad you''ve met. (Peanuts + dried shrimp inside.)'),
  ('chicken-curry','Farm-raised chicken three ways — comforting original, punchy masala, or sweet coconut. Pick your lane.'),
  ('chicken-giblets-curry','Gizzards and liver simmered in classic Burmese curry spices — rich, old-school, for people who know.'),
  ('chicken-gourd-curry','Chicken and bottle gourd stewed soft and mellow — a homestyle curry straight out of a Burmese kitchen.'),
  ('coconut-chicken-and-rice','Coconut rice, coconut-oil chicken curry, and balachaung crunch on one plate — creamy, salty, unstoppable.'),
  ('coconut-rice','Rice steamed in coconut cream — subtly sweet, fragrant, the upgrade your curry deserves.'),
  ('coffee','Hot or iced, 10 oz — roasted deep, poured fresh.'),
  ('crab-masala-curry','A whole Dungeness crab, happily drowned in masala chili-tamarind curry — messy, fiery, worth every napkin.'),
  ('duck-egg-curry','Boiled duck eggs in a glossy tomato curry — golden yolks, tangy sauce, pure comfort.'),
  ('everything-salad','Seaweed, noodles, potato, banana shoots, papaya, lettuce — the salad that couldn''t choose and chose right. (Peanuts + dried shrimp inside.)'),
  ('faluda','The Burmese sundae: pudding, jelly, and assorted nuts in glorious layers — dessert and drink at the same time.'),
  ('fermented-fish-paste-ngapi','The bold one — pungent nga-pi dip with a garden of vegetables for dunking. Fearless eaters, this is your table.'),
  ('fish-paste-tomato-curry','Fish paste mellowed into a tomato, ginger, and garlic curry — deep umami with a bright edge.'),
  ('fishcake-stuffed-salad','Fried fishcake stuffed with herby vegetable fillings and crowned with fried garlic — crispy outside, garden inside.'),
  ('fried-catfish-curry','Catfish fried first, then simmered back into a rich sauce — twice the flavor, zero apologies.'),
  ('fried-fish-cake-curry','Crispy fish cakes soaked in mildly spiced tamarind sauce until plump and savory-sour.'),
  ('goat-curry','Goat braised low and slow in Burmese-Indian masala until it surrenders — choose tender meat or go full offal.'),
  ('goat-marrow-soup','Goat stew with bone marrow, chickpeas, and potatoes in a soul-warming broth. Order the parata — you''ll be dipping.'),
  ('grilled-aubergine-salad','Smoky grilled eggplant with shallot, chili, lime, and peanuts, topped with crispy shallots and coriander — bright and addictive.'),
  ('hilsa-fish','Hilsa — the beloved king of fish — simmered in a rich tomato curry.'),
  ('kyay-o','The works: rice vermicelli with pork, meatballs, intestines, egg, and bok choy — brothy Kyay-O or dry-tossed Si-Chat, your call.'),
  ('lemon-salad','Fresh lemon tossed with shallots, shrimp powder, and fried garlic — puckery, crunchy, impossible to stop eating.'),
  ('mee-shay','Mandalay''s signature noodle: sweet soybean pork sauce, crunchy rind, pickled mustard — chewy, tangy, iconic.'),
  ('mixed-veggie-shrimp-stir-fry-rice','Crisp vegetables, tender quail eggs, and plump shrimp stir-fried over steamed rice — a full-color, full-flavor plate.'),
  ('mixed-veggie-soup','Assorted vegetables in a gently spicy Burmese-Indian soup — cozy, warming, secretly the table favorite.'),
  ('mohinga','The national breakfast: catfish-lemongrass broth, rice noodles, crispy fritters, egg slices — Myanmar in a bowl.'),
  ('nan-gyi-mont-ti','Thick rice noodles tossed in Mandalay chicken curry sauce with fish cake and crunch on top — comfort food, Burmese-style.'),
  ('ngapi-rice-salad','Rice tossed through savory nga-pi curry, topped with a sunny-side-up egg — funky, golden, gloriously Burmese.'),
  ('ohno-khao-swe','Coconut-chickpea curry broth over wheat noodles with chicken, egg, and all the crunchy garnishes — silky, rich, legendary.'),
  ('parata','Two pieces, flaming hot off the griddle — flaky, crispy, the things that curry dreams are made of.'),
  ('peas-naan-pyar','Slow-cooked buttery Burmese peas scooped up with pillowy naan — humble, hearty, beloved.'),
  ('peas-parata','Slow-cooked Burmese peas with two crispy paratas — the teahouse breakfast that built a nation.'),
  ('peas-steamed','Slow-steamed brown peas, seasoned just right — the quintessential Burmese breakfast side.'),
  ('pickled-tea-salad','Fermented tea leaves with lettuce, crunchy beans, sesame, and peanuts — tart, nutty, super flavorful, and famously hard to share.'),
  ('pinto-beans','Pinto beans stir-fried Burmese-style with onions, garlic, and spices — creamy inside, savory all over.'),
  ('pork-curry','Pork braised in a sweet, gently spiced sauce — tender with a bite, flavor through every piece, not just where the sauce touches.'),
  ('pork-horsegram-bean-curry','Pork simmered with earthy horse-gram beans — nutty, deep, mildly spiced. A countryside classic.'),
  ('pork-offals-curry','Pork offal, intestines, and liver in a mildly spiced sauce — rich, honest, nose-to-tail cooking.'),
  ('pork-skewers','Pork, intestines, and liver slow-simmered in herbal spices, skewer-style with a punchy dipping sauce — Burmese street food, done right.'),
  ('rakhine-mont-ti','Rakhine-style fish soup with rice noodles, fish cakes, and onions — peppery, clean, coastal.'),
  ('rice','Steamed white rice — the faithful companion.'),
  ('rice-with-pickled-tea-salad','Pickled tea salad tossed through warm rice with a sunny-side-up egg — tart, nutty laphet in full-meal form.'),
  ('river-prawns-curry','Whole river prawns simmered with aromatics and glossy prawn oil — sweet, deep, decadent.'),
  ('roselle-with-shrimp-curry','Sour roselle leaves and shrimp in a bright, tangy stir-fry — the green that tastes like home.'),
  ('shan-noodles','Rice noodles in savory tomato-pork sauce with peanuts, fried garlic, pickled mustard, and chili paste — Shan State''s greatest export.'),
  ('snakehead-innards-curry','Snakehead innards in a boldly spiced sauce — a delicacy for the adventurous.'),
  ('swai-fish-curry','Swai simmered gently in a mildly spiced sauce — flaky, light, easy to love.'),
  ('sweet-shrimps-curry','Shrimp glazed in a sweet, mildly spiced sauce — glossy, juicy, gone in minutes.'),
  ('tom-yum-fried-rice-or-noodles','Shrimp and vegetables stir-fried with lemongrass, galangal, and kaffir lime — tom yum''s zing in fried-rice or noodle form.'),
  ('tomato-salad','Organic tomatoes, shallots, chickpea powder, and Thai chili over lettuce — juicy, tangy, quietly spicy.')
) as v(slug, d) where menu_items.slug = v.slug;

-- ── W5c pre-merge hardening — add-on allergens · tax category · self-pairing unlinks ────────────────
-- Requires migration 20260721120000_w5c_modifier_allergen_tax.sql. Value-stable + idempotent.
-- Allergen tags are CONSERVATIVE (over-warn is the safe direction; kitchen refines in the C11 pass):
--   Balachaung→shellfish, eggs→egg, Mohinga Soup→fish+egg, Ohn-Noh Soup + Veggie Fritters→gluten.
-- All 8 add-ons are HOT prepared food → tax_category='hot_prepared'. STAGED metadata only (records the
-- add-on category for a future per-line taxable-base tax engine); NOT yet consumed — the charge authority
-- taxes per-line single-category today, so a hot add-on on a cold to-go parent is under-taxed (OPEN-ITEMS C11).
update modifier_options set tax_category = 'hot_prepared'
  where group_id = 'ad144971-f0d5-4095-8d24-43d2bf774fe5';

update modifier_options set allergens = v.a from (values
  ('addons__boiled_egg', array['egg']),
  ('addons__sunny_egg', array['egg']),
  ('addons__mohinga_soup', array['fish','egg']),
  ('addons__ohn_noh_soup', array['gluten_wheat']),
  ('addons__balachaung', array['shellfish']),
  ('addons__veggie_fritters', array['gluten_wheat'])
) as v(slug, a) where modifier_options.slug = v.slug;

-- Self-pairing unlinks (product-UX finding): a soup dish must not offer its OWN soup as a side, and a
-- dish whose recipe already lists a component must not upsell that component. Unlink the add-ons GROUP
-- from these three flagship dishes (the schema links at group level — no per-option suppression). The
-- seed's earlier blanket link uses `on conflict do nothing`, so on a FRESH reset these rows would be
-- (re)created by that block and this DELETE removes them; on live the same rows are deleted directly.
delete from item_modifier_groups
  where group_id = 'ad144971-f0d5-4095-8d24-43d2bf774fe5'
    and item_id in (select id from menu_items where slug in
      ('mohinga','ohno-khao-swe','coconut-chicken-and-rice'));
