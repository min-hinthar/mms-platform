# Menu reference — our catalog × the real POS data

**Generated — do not hand-edit.** Run `node scripts/gen-menu-reference.mjs` after changing either
input; `pnpm check:docs` fails if this file drifts from them. Inputs: [`menu_catalog.json`](menu_catalog.json)
(a snapshot of prod `menu_items`) and [`pos_2026_prices.json`](pos_2026_prices.json)
(the owner's PayPal/Zettle exports).

**Pricing rule (W17a).** One price per dish — what the register rings. Dine-in and to-go
are the SAME price; what differed in the POS exports was the tax column (dine-in 25.5% = 10.5%
sales tax + a 15% dine-in service charge, since retired; to-go 10.5%). The `POS dine` / `POS togo`
columns below are the observed ring prices — where they disagree, see §Price deltas.

**How the join works.** POS rows are matched to our items on the **Burmese** name (substring,
either direction) — English labels diverge between the two systems. A match printed WITHOUT `≈`
is an exact Burmese-name match; `≈` means one name merely contains the other (kept for discovery,
never used to conclude anything about price). Use this when adding items: an exact Burmese match
means we already carry the dish, whatever the English label says.

## Our catalog

### All-Day Breakfast

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kyay-O / Si-Chat | ကြေးအိုး/ဆီချက် | $20.00 | hot_prepared | 5 | ✅ | popular | egg | Kyay-O SiChat ဆီချက် | $20.00 | $20.00 / $20.00 | 1975 |
| Mee-Shay | မြှီးရှည် | $14.00 | hot_prepared | 2 | ✅ | popular | soy | Meeshay မြှီးရှည် | $14.00 | $14.00 / $14.00 | 794 |
| Mohinga | မုန့်ဟင်းခါး | $14.00 | hot_prepared | 1 | ✅ | popular | fish · egg | Mohinga မုန့်ဟင်းခါး | $14.00 | $14.00 / $14.00 | 1068 |
| Nan-Gyi Mont Ti | နန်းကြီးမုန့်တီ | $13.00 | hot_prepared | 2 | ✅ | popular | fish | — | — | — | — |
| Ohno Khao-Swe | အုန်းနို့ခေါက်ဆွဲ | $15.00 | hot_prepared | 1 | ✅ | — | egg · gluten_wheat | Coconut Noodles အုန်းနို့ခေါက်ဆွဲ | $15.00 | $15.00 / $15.00 | 331 |
| Peas Parata | ပဲ ပလာတာ | $10.00 | hot_prepared | 1 | ✅ | — | gluten_wheat | ပဲ ပလာတာ Parata w/ Beans | $10.00 | $10.00 / — | 168 |
| Shan Noodles | ရှမ်းခေါက်ဆွဲ | $13.00 | hot_prepared | 2 | ✅ | popular | peanuts | Shan Noodles ရှမ်းခေါက်ဆွဲ | $13.00 | $13.00 / $13.00 | 342 |

### Rice / Noodles / Soups

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Biriyani (Dan-Pauk) | ဒံပေါက် ကြက်သား | $14.00 | hot_prepared | 1 | ✅ | allergen-reviewed | — | — | — | — | — |
| Burmese Fried Rice | ပဲပြုတ်ထမင်းကြော် | $12.00 | hot_prepared | 2 | ✅ | — | egg | ≈ Fried Rice ထမင်းကြော် | $12.00 | $12.00 / $12.00 | — |
| Coconut Chicken & Rice | ကြက်အုန်းထမင်း | $17.00 | hot_prepared | 0 | ✅ | — | shellfish | Coconut Chicken Rice ကြက်အုန်းထမင်း | $17.00 | $17.00 / $17.00 | 120 |
| Goat-Marrow Soup | ဆိတ်ရိုးစွပ်ပြုတ် | $19.00 | hot_prepared | 1 | ✅ | allergen-reviewed | — | — | — | — | — |
| Mixed Veggie & Shrimp Stir Fry Over Rice | ရန်ကုန်ထမင်းပေါင်း | $20.00 | hot_prepared | 2 | ✅ | — | egg · shellfish | ≈ Rice w/Veggies ထမင်းပေါင်း | $16.00 | $16.00 / — | — |
| Ngapi-Rice Salad | ငပိထမင်း | $13.00 | hot_prepared | 2 | ✅ | — | fish · egg | Ngapi-Rice Salad ငပိထမင်း | $13.00 | $13.00 / $13.00 | 39 |
| Oil-Drizzled Rice with Peas | ပဲပြုတ်ထမင်းဆီဆမ်း | $10.00 | hot_prepared | 0 | ❌ | — | — | ပဲပြုတ်ထမင်းဆီဆမ်း Burmese Rice | $10.00 | $10.00 / — | 26 |
| Peas Naan-Pyar | ပဲ နံပြား | $10.00 | hot_prepared | 1 | ✅ | — | gluten_wheat | ≈ ပဲ နံပြား (ပါဆယ်) Naan Bread w/ Beans | $10.00 | — / $10.00 | — |
| Rakhine Mont-Ti | ရခိုင်မုန့်တီ | $14.00 | hot_prepared | 2 | ✅ | — | fish | ရခိုင်မုန့်တီ Rakhine Noodles | $14.00 | $14.00 / — | 126 |
| Rice with Pickled Tea Salad | လက်ဖက်ထမင်း | $13.00 | hot_prepared | 2 | ✅ | vegan-optional | egg · peanuts · shellfish | Tea-Rice Salad လက်ဖက်ထမင်း | $13.00 | $13.00 / $13.00 | 36 |
| Tom-Yum Fried Rice / Noodles | တုန်ရန်းထမင်းကြော်/ခေါက်ဆွဲကြော် | $16.00 | hot_prepared | 3 | ✅ | — | shellfish · fish · egg | Noodles Stir Fried ခေါက်ဆွဲကြော် | $16.00 | $16.00 / $16.00 | 50 |

### Sides

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Balachaung | ဘာလချောင်ကြော် | $10.00 | hot_prepared | 0 | ✅ | — | shellfish | Balachaung ဘာလချောင်ကြော် | $10.00 | $10.00 / — | 269 |
| Balachaung (Side) | ဘာလချောင်ပွဲ | $3.00 | hot_prepared | 0 | ❌ | — | shellfish | Balachaung ဘာလချောင်ပွဲ‌ | $3.00 | $3.00 / — | 14 |
| Coconut Rice | အုန်းထမင်း | $3.50 | hot_prepared | 0 | ✅ | vegan · allergen-reviewed | — | Coconut Rice အုန်းထမင်း | $3.50 | $3.50 / $3.50 | 434 |
| Fishcake (Stuffed Salad) | ငါးဖယ်အစာသွပ် | $14.00 | hot_prepared | 1 | ❌ | — | fish | — | — | — | — |
| Lemon Salad | ရှောက်သီးသုပ် | $12.00 | hot_prepared | 1 | ❌ | vegan-optional | peanuts · sesame · shellfish | Lemon Fishcake ရှောက်သီးသုပ် | $12.00 | $12.00 / $12.00 | 27 |
| Mohinga Soup (Side) | ဟင်းခါးပွဲ | $5.00 | hot_prepared | 0 | ❌ | — | fish | Mohingh Soup ဟင်းခါးပွဲ | $5.00 | $5.00 / — | 87 |
| Ngapi Sambal (Fried) | ငပိကြော် | $10.00 | hot_prepared | 0 | ❌ | — | fish · shellfish | Ngapi Sambal ငပိကြော် | $10.00 | $10.00 / — | 125 |
| Parata (2 pcs) | ပလာတာ | $5.00 | hot_prepared | 0 | ✅ | vegan-optional | gluten_wheat | Parata ပလာတာ | $5.00 | $5.00 / $5.00 | 183 |
| Peas Steamed | ပဲပြုတ် (စားတော်ပဲ) | $5.00 | hot_prepared | 0 | ❌ | vegan · allergen-reviewed | — | ≈ ပဲပြုတ် White Peas | $5.00 | $5.00 / — | — |
| Rice | ထမင်းဖြူ | $2.00 | hot_prepared | 0 | ✅ | vegan · allergen-reviewed | — | Rice ထမင်းဖြူ | $2.00 | $2.00 / $2.00 | 2052 |
| White Peas | ပဲပြုတ် | $5.00 | hot_prepared | 0 | ✅ | — | — | ပဲပြုတ် White Peas | $5.00 | $5.00 / — | 182 |

### Curries (A la Carte)

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bamboo Shoot with Pork Soup | ဝက်မျှစ်ချဥ် | $14.00 | hot_prepared | 1 | ✅ | — | fish | Pork Bamboo Shoot ဝက်မျှစ်ချဥ် | $14.00 | $14.00 / $14.00 | 106 |
| Beef Curry | အမဲသားဟင်း/အမဲကြော်နှပ် | $19.00 | hot_prepared | 2 | ✅ | — | soy | Beef အမဲသားဟင်း | $19.00 | $19.00 / $19.00 | 401 |
| Beef Jerky (Grilled) | အမဲခြောက်ဖုတ် | $19.00 | hot_prepared | 0 | ❌ | — | — | Beef Jerky အမဲခြောက်ဖုတ် | $19.00 | $19.00 / — | 91 |
| Beef Pounded Deep Fried | အမဲထောင်းကြော် | $19.00 | hot_prepared | 1 | ✅ | spicy · allergen-reviewed | — | Beef Pounded အမဲထောင်းကြော် | $19.00 | $19.00 / $17.00 | 31 |
| Chicken Curry (Original / Masala / Coconut) | ကြက်သားဟင်း | $14.00 | hot_prepared | 2 | ✅ | popular | soy | Chicken ကြက်သားဟင်း | $14.00 | $14.00 / $14.00 | 431 |
| Chicken Giblets Curry | ကြက်အသဲမြစ် | $14.00 | hot_prepared | 1 | ✅ | allergen-reviewed | — | — | — | — | — |
| Chicken Gourd Curry | ကြက်ဗူးသီး | $14.00 | hot_prepared | 1 | ✅ | allergen-reviewed | — | Chicken Gourd ကြက်ဗူးသီး | $14.00 | $14.00 / $14.00 | 68 |
| Chicken with Dregea | ကြက်ဂွေးတောက် | $14.00 | hot_prepared | 0 | ❌ | — | — | Chicken Dregea ကြက်ဂွေးတောက် | $14.00 | $14.00 / $14.00 | 58 |
| Dried Goat | ဆိတ်သားခြောက် | $30.00 | hot_prepared | 0 | ❌ | — | — | Dried Goat ဆိတ်သားခြောက် | $30.00 | $30.00 / — | 12 |
| Duck Egg | ဘဲဥဟင်း | $14.00 | hot_prepared | 1 | ✅ | — | egg | Duck Egg ဘဲဥဟင်း | $14.00 | $14.00 / $14.00 | 159 |
| Goat Brains Curry | ဆိတ်ဦးနှောက် | $30.00 | hot_prepared | 0 | ❌ | — | — | Goat Brains ဆိတ်ဦး‌နှောက် | $30.00 | $30.00 / $30.00 | 22 |
| Goat Curry [Original/Offal] | ဆိတ်သားဟင်း/ဆိတ်ကလီစာ | $30.00 | hot_prepared | 3 | ✅ | spicy_optional · allergen-reviewed | — | Goat ဆိတ်သားဟင်း | $30.00 | $30.00 / $30.00 | 380 |
| Kayah Sausages | ကယားဝက်အူချောင်း | $14.00 | hot_prepared | 0 | ❌ | — | — | Kayah Sausages ကယားဝက်အူချောင်း | $14.00 | $14.00 / — | 7 |
| Malar Spicy Beef | အမဲမာလာ | $17.00 | hot_prepared | 0 | ✅ | — | soy | Malar Spicy Beef အမဲမာလာ | $17.00 | $17.00 / — | 213 |
| Pork Curry | ဝက်သနီ | $14.00 | hot_prepared | 1 | ✅ | — | soy | Pork ဝက်သနီ | $14.00 | $14.00 / $14.00 | 265 |
| Pork Horsegram Bean Curry | ဝက်ပုန်းရည်ကြီး | $14.00 | hot_prepared | 1 | ✅ | — | soy | Pork Horsegram Bean ဝက်ပုန်းရည်ကြီး | $14.00 | $14.00 / $14.00 | 126 |
| Pork Offals Curry | ဝက်ကလီစာ | $15.00 | hot_prepared | 1 | ✅ | — | soy | Pork Offal ဝက်ကလီစာ | $15.00 | $15.00 / $14.00 | 217 |
| Pork Skewers | ဝက်သားဒုတ်ထိုး | $15.00 | hot_prepared | 1 | ✅ | allergen-reviewed · popular | — | — | — | — | — |
| Pork Tamarind Stew | ဝက်မကျည်းနှပ် | $14.00 | hot_prepared | 0 | ❌ | — | — | Pork Tamarind ဝက်မကျည်းနှပ် | $14.00 | $14.00 / $14.00 | 151 |
| Pork with Fermented Soybean | ဝက်ပဲငပိ | $14.00 | hot_prepared | 0 | ❌ | — | soy | Pork Fermented Bean ဝက်ပဲငပိ | $14.00 | $14.00 / $14.00 | 45 |
| Shredded Beef Fry | အမဲမွှကြော် | $17.00 | hot_prepared | 0 | ❌ | — | — | Beef Fried Shredded အမဲမွှကြော် | $17.00 | $17.00 / — | 5 |

### Vegetables

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acacia with Shrimp Curry | ကင်ပွန်းချဥ်ကြော် | $15.00 | hot_prepared | 1 | ✅ | — | shellfish | Acacia Shrimp ကင်ပွန်းချဥ်ကြော် | $15.00 | $15.00 / $15.00 | 11 |
| Bamboo Shoot Mushroom Soup | မျှစ်တောချက် | $14.00 | hot_prepared | 1 | ✅ | vegetarian · allergen-reviewed · vegan-optional | — | — | — | — | — |
| Mixed Veggie Soup | သီးစုံပဲကုလားဟင်း | $14.00 | hot_prepared | 2 | ✅ | vegetarian · allergen-reviewed · spicy_optional · vegan-optional | — | — | — | — | — |
| Pinto Beans | ပဲရေပွကြော် | $12.00 | hot_prepared | 1 | ✅ | vegetarian · allergen-reviewed · vegan-optional | — | Pinto Beans (ပဲရေပွ​ကြော်) | $12.00 | $12.00 / $12.00 | 77 |
| Roselle with Shrimp Curry | ချဥ်ပေါင်ကြော် | $14.00 | hot_prepared | 1 | ✅ | popular | shellfish | Roselle Shrimp ချဥ်ပေါင်ကြော် | $14.00 | $14.00 / $14.00 | 475 |
| Stir-Fried Mixed Greens | အစိမ်းကြော် | $14.00 | hot_prepared | 0 | ❌ | — | — | Stir Fry Mixed Veggie အစိမ်းကြော် | $14.00 | $14.00 / $14.00 | 53 |
| Stir-Fried Water Spinach | ကန်စွန်းရွက်ကြော် | $14.00 | hot_prepared | 0 | ❌ | — | — | Stir Fry Water Spinach ကန်စွန်းရွက်‌ကြော် | $14.00 | $14.00 / $14.00 | 63 |
| Water Spinach Sour Soup | ကန်စွန်းရွက်ချဥ်ရည် | $14.00 | hot_prepared | 0 | ❌ | — | — | Water Spinach ကန်စွန်းရွက်ချဥ်ရည် | $14.00 | $14.00 / $14.00 | 98 |

### Seafood Curries

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bombay Duck Grilled | အာဗြဲခြောက်ဖုတ် | $20.00 | hot_prepared | 0 | ❌ | — | fish | Bombay Duck Fish အာဗြဲခြောက်ဖုတ် | $20.00 | $20.00 / — | 12 |
| Boneless Catfish Curry | ငါးခူမွှေချက် | $14.00 | hot_prepared | 1 | ✅ | — | fish | Catfish Boneless ငါးခူမွှေချက် | $14.00 | $14.00 / $14.00 | 318 |
| Catfish Head Curry (Mon-Style) | ငါးခေါင်းမွန်ချက် | $17.00 | hot_prepared | 0 | ❌ | — | fish | Catfish Head Mon ငါးခေါင်းမွန်ချက် | $17.00 | $17.00 / $17.00 | 72 |
| Crab Masala Curry | ဂဏန်းမဆလာ | $35.00 | hot_prepared | 2 | ✅ | spicy_optional | shellfish | Crab Masala ဂဏန်းမဆလာ | $35.00 | $35.00 / $35.00 | 93 |
| Crispy Shrimp in Fish Sauce | ပုဇွန်ကြော်စပ် | $15.00 | hot_prepared | 0 | ❌ | — | shellfish | Shrimp Crispy FishSauce ပုဇွန်ကြော်စပ် | $15.00 | — / $15.00 | 26 |
| Dried Silurus Fried | ငါးကျည်းခြောက်ကြော် | $25.00 | hot_prepared | 0 | ❌ | — | fish | Silurus Dried ငါးကျည်း‌ခြောက်ကြော် | $25.00 | $25.00 / — | 68 |
| Dried Snakehead Grilled | ငါးရံ့ခြောက်ဖုတ် | $25.00 | hot_prepared | 0 | ❌ | — | fish | Snakehead Dried ငါးရံ့ခြောက်ဖုတ် | $25.00 | $25.00 / — | 40 |
| Fermented Fish Paste Nga-Pi | ငပိရည်ကျို | $14.00 | hot_prepared | 1 | ✅ | — | fish | — | — | — | — |
| Fish Paste Tomato Curry | ခရမ်းချဥ်သီးငါးပိချက် | $12.00 | hot_prepared | 1 | ✅ | — | fish | — | — | — | — |
| Fried Catfish Curry | ငါးခူကြော်နှပ် | $14.00 | hot_prepared | 1 | ✅ | — | fish | Catfish Fried ငါးခူကြော်နှပ် | $14.00 | $14.00 / $14.00 | 97 |
| Fried Fish Cake Curry | ငါးဖယ်ချက် | $14.00 | hot_prepared | 1 | ✅ | — | fish | Fishcake ငါးဖယ်ချက် | $14.00 | $14.00 / $14.00 | 227 |
| Grilled Fish | ငါးကင် | $25.00 | hot_prepared | 0 | ❌ | — | fish | ငါးကင် - Grilled Fish | $25.00 | $25.00 / — | 13 |
| Hilsa Fish | ငါးသလောက်ပေါင်း | $24.00 | hot_prepared | 1 | ✅ | — | fish | — | — | — | — |
| River Prawns Curry | ပုဇွန်ထုပ်ဟင်း | $24.00 | hot_prepared | 1 | ✅ | — | shellfish | River Prawn ပုဇွန်ထုပ်ဟင်း | $24.00 | $24.00 / $24.00 | 313 |
| Salted Fish & Eggplant Stew | ငါးခြောက်ခရမ်းသီးနှပ် | $14.00 | hot_prepared | 0 | ❌ | — | fish | Salted Fish Eggplant ငါးခြောက်ခရမ်းသီးနှပ် | $14.00 | $14.00 / $12.00 | 20 |
| Salted Fish Pounded Fried | ငါးခြောက်ထောင်းကြော် | $19.00 | hot_prepared | 0 | ❌ | — | fish | Salted Fish Pounded ငါးခြောက်ထောင်းကြော် | $19.00 | $19.00 / $17.00 | 64 |
| Snakehead Innards Curry | ငါးရံ့အူဟင်း | $19.00 | hot_prepared | 1 | ✅ | — | fish | ≈ Snakehead Intestines ငါးရံ့အူ | $19.00 | $19.00 / $19.00 | — |
| Swai Fish Curry | ငါးမြင်းဟင်း | $19.00 | hot_prepared | 1 | ✅ | — | fish | Swai ငါးမြင်းဟင်း | $19.00 | $19.00 / $19.00 | 189 |
| Sweet Shrimps Curry | ပုဇွန်ကြော်နှပ် | $19.00 | hot_prepared | 1 | ✅ | — | shellfish | Shrimp ပုဇွန်ကြော်နှပ် | $19.00 | $19.00 / $19.00 | 72 |

### Appetizers / Salads

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bean Fritters | ပဲကပ်ကြော် | $10.00 | hot_prepared | 0 | ❌ | — | gluten_wheat | Bean Fritters ပဲကပ်ကြော် | $10.00 | $10.00 / — | 97 |
| Century Egg Salad | ဆေးဘဲဥသုပ် | $12.00 | cold_food | 2 | ✅ | — | peanuts · shellfish · egg | Century Egg Salad ဆေးဘဲဥသုပ် | $12.00 | $12.00 / $12.00 | 85 |
| Chicken Salad | ကြက်သားသုပ် | $15.00 | cold_food | 0 | ❌ | — | — | Chicken Salad ကြက်သားသုပ် | $15.00 | $15.00 / $15.00 | 55 |
| Everything Salad | အသုပ်စုံ | $12.00 | cold_food | 2 | ✅ | vegan-optional | peanuts · shellfish | — | — | — | — |
| Fermented Sesame Salad | နှမ်းဖတ်ချဥ်သုပ် | $12.00 | cold_food | 0 | ❌ | — | sesame | Fermented Sesame Salad နှမ်းဖတ်ချဥ်သုပ် | $12.00 | $12.00 / $12.00 | 13 |
| Grilled Aubergine Salad | ခရမ်းသီးမီးဖုတ်သုပ် | $12.00 | cold_food | 2 | ✅ | vegetarian · vegan-optional | peanuts | — | — | — | — |
| NgaPi & Veggies | ငပိတို့စရာ | $10.00 | cold_food | 0 | ✅ | — | fish · shellfish | NgaPi & Veggies -  ငပိတို့စရာ | $10.00 | $10.00 / — | 275 |
| Pickled Tea Salad | လက်ဖက်သုပ် | $14.00 | cold_food | 2 | ✅ | vegan-optional · popular | peanuts · shellfish | Tea Salad လက်ဖက်သုပ် | $14.00 | $14.00 / $14.00 | 419 |
| Tomato Salad | ခရမ်းချဥ်သီးသုပ် | $12.00 | cold_food | 2 | ✅ | vegetarian · allergen-reviewed · vegan-optional | — | Tomato Salad ခရမ်းချဥ်သီးသုပ် | $12.00 | $12.00 / $12.00 | 44 |
| Veggie Fritters | အကြော်စုံ | $12.00 | hot_prepared | 0 | ✅ | — | gluten_wheat | Fritters Veggies အကြော်စုံ | $12.00 | $12.00 / $12.00 | 355 |

### Desserts

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coconut Sago | အုန်းနို့သာကူ | $10.00 | cold_food | 0 | ❌ | — | — | အုန်းနို့သာကူ Coconut Sago | $10.00 | $10.00 / — | 17 |
| Fresh Fruit Platter | သီးစုံအချိုပွဲ | $12.00 | cold_food | 0 | ❌ | vegan | — | Fresh Fruits သီးစုံအချိုပွဲ | $12.00 | $12.00 / $12.00 | 12 |
| Sanwin Makin (Semolina Cake) | ဆနွင်းမကင်း | $10.00 | cold_food | 0 | ❌ | — | gluten_wheat | ဆနွင်းမကင်း Wheat Husk Sweets | $10.00 | $10.00 / — | 48 |

### Drinks

| Dish (EN) | မြန်မာ | Price | Tax cat | Mods | Photo | Tags | Allergens | POS name (`≈` = loose match) | POS $ | POS dine/togo | 2026 units |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bottled Water | ရေသန့်ဗူး | $1.00 | beverage_cold | 0 | ❌ | — | — | Water Bottled ရေသန့်ဗူး | $1.00 | $1.00 / — | 1 |
| Burmese Milk Tea | လက်ဖက်ရည် | $4.00 | beverage_hot | 2 | ✅ | — | dairy | Tea လက်ဖက်ရည် | $4.00 | $4.00 / $4.00 | 1791 |
| Coffee | ကော်ဖီ | $5.00 | beverage_hot | 2 | ✅ | — | dairy | — | — | — | — |
| Faluda | ဖါလူဒါ | $9.00 | beverage_cold | 0 | ✅ | popular | tree_nuts · dairy | ဖါလူဒါ Faluda | $9.00 | $9.00 / — | 451 |
| Kufee (Milk Cream) | ကူဖီးနို့မလိုင် | $5.00 | beverage_cold | 0 | ❌ | — | dairy | ကူဖီးနို့မလိုင် Kufee | $5.00 | $5.00 / — | 65 |
| Pop Soda 12oz | ဆိုဒါ | $3.00 | retail_nonfood | 0 | ✅ | — | — | — | — | — | — |
| Red Bull - SHARK 8.4 oz | အားဖြည့်ဖျော်ရည် | $4.00 | retail_nonfood | 0 | ✅ | — | — | — | — | — | — |

## Price deltas — our catalog vs the POS ring

None: every matched item is priced exactly as the register rings it.

## POS items whose dine-in and to-go rings disagree

Of 72 POS items sold BOTH ways in Jan–Jul 2026, 66 ring identically.
The rest are the candidates for a per-mode price (W17b) — low-volume ones are likely
register anomalies (a tray/party ring), not a real two-price policy.

| POS item | Dine-in | To-go | Δ | 2026 units |
| --- | --- | --- | --- | --- |
| Pork Offal ဝက်ကလီစာ | $15.00 | $14.00 | $1.00 | 217 |
| Fish Paste ငါးပိရည်ကျို | $42.00 | $14.00 | $28.00 | 197 |
| Salted Fish Pounded ငါးခြောက်ထောင်းကြော် | $19.00 | $17.00 | $2.00 | 64 |
| Beef Pounded အမဲထောင်းကြော် | $19.00 | $17.00 | $2.00 | 31 |
| Salted Fish Eggplant ငါးခြောက်ခရမ်းသီးနှပ် | $14.00 | $12.00 | $2.00 | 20 |
| Shrimp Spicy ပုဇွန်ကြော်စပ် | $15.00 | $19.00 | $4.00 | 8 |

## POS items with no match in our catalog

60 of 149 POS items did not match any catalog item on the Burmese name.
This is the W17d backlog — but READ each row before adding it: some are modifiers
(an egg add-on), some are alcohol, some are combo/tray rings, and some are a dish we
already carry under a Burmese spelling the loose match missed. Verify, don't bulk-import.

| POS item | Price | Dine / To-go | 2026 units | Variants |
| --- | --- | --- | --- | --- |
| Nangyi နန်းကြီးသုပ် | $13.00 | $13.00 / $13.00 | 1702 | — |
| Pork Skewers ဝက်ဒုတ်ထိုး | $15.00 | $15.00 / $15.00 | 662 | — |
| Red Bull - SHARK 8.4 oz | $4.00 | $4.00 / — | 501 | — |
| Chicken Masala ကြက်ကလယ် | $14.00 | $14.00 / $14.00 | 347 | — |
| Chicken Liver ကြက်သဲမြစ် | $14.00 | $14.00 / $14.00 | 266 | — |
| Hilsa ငါး‌သလောက်ကြော်နှပ် | $24.00 | $24.00 / $24.00 | 261 | — |
| Faluda | $9.00 | $9.00 / — | 238 | — |
| Everything Salad | $12.00 | $12.00 / $12.00 | 207 | — |
| Fish Paste ငါးပိရည်ကျို | $42.00 | $42.00 / $14.00 | 197 | — |
| Mixed Vegetables သီးစုံဟင်း | $14.00 | $14.00 / $14.00 | 184 | — |
| Goat Marrow ဆိတ်စွပ် | $19.00 | $19.00 / $19.00 | 163 | — |
| Pop Soda 12oz | $3.00 | $3.00 / — | 161 | — |
| Fish Paste Curry ငပိချက် | $12.00 | $12.00 / $12.00 | 90 | — |
| Biryani Chicken ကြက်သားဒံပေါက် | $14.00 | $14.00 / $14.00 | 84 | — |
| shwekyi | $10.00 | $10.00 / — | 78 | — |
| Tom Yum Fried Rice တုန်ရမ်းထမင်းကြော် | $16.00 | $16.00 / — | 65 | — |
| Coffee | $5.00 | $5.00 / $5.00 | 57 | — |
| Kufee | $5.00 | $5.00 / — | 43 | — |
| Fishcake Fried ငါးဖယ်ကြော် | $14.00 | $14.00 / $14.00 | 41 | — |
| Grilled Eggplant Salad | $12.00 | $12.00 / — | 40 | — |
| Kirin Beer 12oz | $8.00 | $8.00 / — | 27 | — |
| Grilled Eggplant | $12.00 | — / $12.00 | 15 | — |
| Tom Yum Fried Rice To-Go တုန်ရမ်းထမင်းကြော် | $16.00 | $16.00 / — | 11 | — |
| IPA - Beer 12oz | $9.00 | $9.00 / — | 9 | — |
| ကြက်ဥ Egg Add-on | $3.00 | $3.00 / — | 8 | — |
| IPA - Beer 16oz | $55.00 | $55.00 / — | 5 | — |
| Salted Fish ငါးခြောက်ချက် | $19.00 | $19.00 / $19.00 | 4 | — |
| Ye-U Sausages ရေဦးဝက်အူချောင်း | $10.00 | $10.00 / — | 2 | ပါဆယ် |
| Snakehead ငါးရံ့ဟင်း | $12.00 | — / $12.00 | 2 | — |
| During | $20.00 | $20.00 / — | 2 | — |
| Soju | $11.00 | $11.00 / — | 2 | — |
| Guiness Stout - Beer | $8.00 | $8.00 / — | 2 | — |
| banana shwe kyi | $10.00 | $10.00 / — | 2 | — |
| parata | $20.00 | $20.00 / — | 2 | — |
| coffee | $19.00 | $19.00 / — | 2 | — |
| Omelette ကြက်ဥမွှေကြော် | $12.00 | $12.00 / $12.00 | 2 | — |
| Catfish Spicy Fried ငါးခူအစပ်ကြော် | $14.00 | — / $14.00 | 1 | — |
| shwrkyi | $10.00 | $10.00 / — | 1 | — |
| shwe kyi | $10.00 | $10.00 / — | 1 | — |
| pork rinds fried | $10.00 | $10.00 / — | 1 | — |
| Duck ဘဲသားဟင်း | $19.00 | — / $19.00 | 1 | — |
| nga pi pounded | $10.00 | $10.00 / — | 1 | — |
| napi | $10.00 | $10.00 / — | 1 | — |
| during | $20.00 | $20.00 / — | 1 | — |
| tamaryat | $10.00 | $10.00 / — | 1 | — |
| nan | $10.00 | $10.00 / — | 1 | — |
| pea | $25.00 | $25.00 / — | 1 | — |
| fried little fish | $17.00 | $17.00 / — | 1 | — |
| Dried Kathapaung ကသ‌ပေါင်းခြောက် | $25.00 | $25.00 / — | 1 | — |
| House Red Wine | $7.00 | $7.00 / — | 1 | — |
| House White Wine | $7.00 | $7.00 / — | 1 | — |
| tamarinds | $10.00 | $10.00 / — | 1 | — |
| pork rind | $5.00 | $5.00 / — | 1 | — |
| Ginger Salad | $12.00 | $12.00 / — | 1 | — |
| chicken | $5.00 | $5.00 / — | 1 | — |
| Seabass Fermented Soy ကကတစ်ပဲငပိပေါင်း | $19.00 | — / $19.00 | 1 | — |
| veggie tempura half | $6.00 | $6.00 / — | 1 | — |
| wine | $22.00 | $22.00 / — | 1 | — |
| durian | $19.00 | $19.00 / — | 1 | — |
| Michaelob Ultra 16 oz | $8.00 | $8.00 / — | 1 | — |

## Counts

| Measure | Count |
| --- | --- |
| Catalog items | 97 |
| …with a photo | 63 |
| …needing photography | 34 |
| …sold out right now | 0 |
| …inactive | 0 |
| POS items (Jan–Jul 2026) | 149 |
| …matched to a catalog item | 89 |
| …unmatched (W17d backlog) | 60 |
