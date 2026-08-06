// Kiosk chrome dictionary (W6b). The attract-screen language choice sets which of these the kiosk
// CHROME renders; menu/item DATA keeps the app's stacked-bilingual idiom (both languages, always).
// Pure data — no i18n machinery, no context: the kiosk passes `t(lang, key)` down its own tree.
//
// ⚠️ The Burmese here is a working draft pending Min's native check (the K15/W5c pattern) — flag any
// change in the PR so the review knows copy moved.

export type KioskLang = "en" | "my";

const STRINGS = {
  touchToStart: { en: "Touch to start", my: "စတင်ရန် ထိပါ" },
  welcome: { en: "Welcome to Mandalay Morning Star", my: "မန္တလေး နံနက်ခင်းကြယ်မှ ကြိုဆိုပါသည်" },
  chooseLanguage: { en: "Choose your language", my: "ဘာသာစကား ရွေးပါ" },
  english: { en: "English", my: "English" },
  burmese: { en: "မြန်မာ", my: "မြန်မာ" },
  howToday: { en: "How are you eating today?", my: "ယနေ့ ဘယ်လိုသုံးဆောင်မလဲ။" },
  dineIn: { en: "Dine in", my: "ဆိုင်တွင် စားမည်" },
  dineInHint: { en: "Take a table number", my: "စားပွဲနံပါတ် ယူပါ" },
  toGo: { en: "To go", my: "ပါဆယ် ယူမည်" },
  toGoHint: { en: "We’ll call your name", my: "အမည်ဖြင့် ခေါ်ပါမည်" },
  grocery: { en: "Grocery", my: "ကုန်စုံ" },
  groceryHint: { en: "Scan items as you go", my: "ပစ္စည်းများကို စကင်ဖတ်ပါ" },
  yourName: { en: "Your first name", my: "သင့်အမည်" },
  namePrompt: { en: "It’s the pickup call-out", my: "ခေါ်ယူရာတွင် သုံးပါမည်" },
  tableNumber: { en: "Your table number", my: "စားပွဲနံပါတ်" },
  tablePrompt: { en: "It’s on the table tent", my: "စားပွဲပေါ်က နံပါတ်ပြားတွင် ရှိသည်" },
  tableTaken: {
    en: "That table’s already seated — please ask a server.",
    my: "ထိုစားပွဲတွင် ဧည့်သည်ရှိနေပါသည် — ဝန်ထမ်းကို မေးပါ။",
  },
  tableUnknown: {
    en: "We don’t recognize that table number — check the tent and try again.",
    my: "ထိုစားပွဲနံပါတ်ကို မတွေ့ပါ — နံပါတ်ပြားကို ပြန်စစ်ပါ။",
  },
  start: { en: "Start", my: "စတင်မည်" },
  back: { en: "Back", my: "နောက်သို့" },
  viewOrder: { en: "View order", my: "မှာယူမှု ကြည့်မည်" },
  yourOrder: { en: "Your order", my: "သင့်မှာယူမှု" },
  goesWellWith: { en: "Goes well with", my: "တွဲဖက်စားလို့ ကောင်းသည်" },
  noThanks: { en: "No thanks", my: "မလိုပါ" },
  payAtCounter: { en: "Pay at the counter", my: "ကောင်တာတွင် ငွေရှင်းပါ" },
  handoffTogo: {
    en: "Pay at the counter — we’ll call your name.",
    my: "ကောင်တာတွင် ငွေရှင်းပါ — အမည်ဖြင့် ခေါ်ပါမည်။",
  },
  // The no-name handoff (grocery, or a to-go order that skipped the name): promise only what the
  // counter can keep — there is no name to call.
  handoffCounter: {
    en: "You’re all set — pay at the counter.",
    my: "အားလုံးအဆင်သင့်ပါပြီ — ကောင်တာတွင် ငွေရှင်းပါ။",
  },
  handoffDinein: {
    en: "Take your tent to the table and pay at the counter.",
    my: "နံပါတ်ပြားကို စားပွဲသို့ယူပြီး ကောင်တာတွင် ငွေရှင်းပါ။",
  },
  handoffThanks: { en: "Thank you!", my: "ကျေးဇူးတင်ပါသည်။" },
  done: { en: "Done", my: "ပြီးပါပြီ" },
  stillThere: { en: "Still there?", my: "ရှိနေသေးပါသလား။" },
  idleBody: {
    en: "This order will clear so the kiosk is ready for the next customer.",
    my: "နောက်လာမည့်သူအတွက် ဤမှာယူမှုကို ရှင်းလင်းပါမည်။",
  },
  // Post-commitment idle (the upsell screen): the order SURVIVES — never threaten to clear it.
  idleBodyCommitted: {
    en: "No rush — your order is saved. Pay at the counter when you’re ready.",
    my: "စိတ်မပူပါနှင့် — သင့်မှာယူမှု သိမ်းထားပြီးပါပြီ။ အဆင်သင့်ဖြစ်လျှင် ကောင်တာတွင် ငွေရှင်းပါ။",
  },
  imHere: { en: "I’m still here", my: "ရှိနေပါသေးသည်" },
  startOver: { en: "Start over", my: "အစမှ ပြန်စမည်" },
  total: { en: "Total", my: "စုစုပေါင်း" },
  add: { en: "Add", my: "ထည့်မည်" },
  scanPrompt: { en: "Scan a barcode, or browse below", my: "ဘားကုဒ်ကို စကင်ဖတ်ပါ (သို့) အောက်တွင် ရွေးပါ" },
  // Honest scan refusals (W6b review): each failure names itself — "something went wrong" on a
  // simply-unknown barcode sends customers away from a working kiosk.
  scanUnknown: {
    en: "We couldn’t find that barcode — please ask at the counter.",
    my: "ထိုဘားကုဒ်ကို မတွေ့ပါ — ကောင်တာတွင် မေးပါ။",
  },
  scanUnavailable: {
    en: "That item isn’t available today.",
    my: "ထိုပစ္စည်း ယနေ့ မရနိုင်ပါ။",
  },
  scanWeighed: {
    en: "That one needs the scale — please bring it to the counter.",
    my: "ထိုပစ္စည်းကို ချိန်ရန်လိုပါသည် — ကောင်တာသို့ ယူသွားပါ။",
  },
  categories: { en: "Categories", my: "အမျိုးအစားများ" },
  menu: { en: "Menu", my: "မီနူး" },
  notConfigured: {
    en: "This kiosk isn’t set up yet — please order at the counter.",
    my: "ဤစက်ကို မပြင်ဆင်ရသေးပါ — ကောင်တာတွင် မှာယူပါ။",
  },
  somethingWrong: {
    en: "Something went wrong — please order at the counter.",
    my: "အမှားတစ်ခု ဖြစ်သွားသည် — ကောင်တာတွင် မှာယူပါ။",
  },
} as const;

export type KioskStringKey = keyof typeof STRINGS;

/** The kiosk chrome string for the chosen language. */
export function t(lang: KioskLang, key: KioskStringKey): string {
  return STRINGS[key][lang];
}
