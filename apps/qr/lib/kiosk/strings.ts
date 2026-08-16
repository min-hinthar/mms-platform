// Kiosk chrome dictionary (W6b). The attract-screen language choice sets which of these the kiosk
// CHROME renders; menu/item DATA keeps the app's stacked-bilingual idiom (both languages, always).
// Pure data — no i18n machinery, no context: the kiosk passes `t(lang, key)` down its own tree.
//
// W18 register (owner: "Burmese should be fun, friendly, natural"): the MY side moved from the
// formal-document register (ပါသည်/မည်) to the conversational-polite spoken register (တယ်/မယ်,
// warmed with နော် where a host would actually say it) — the way staff talk to a guest, not the
// way a ministry writes to one. Vocabulary follows the app glossary (S14a: အော်ဒါ, not မှာယူမှု).
//
// ⚠️ The Burmese here is a working draft pending Min's native check (the K15/W5c pattern) — flag any
// change in the PR so the review knows copy moved.

export type KioskLang = "en" | "my";

const STRINGS = {
  touchToStart: { en: "Touch to start", my: "စဖို့ ထိလိုက်ပါ" },
  welcome: {
    en: "Welcome to Mandalay Morning Star",
    my: "မင်္ဂလာပါ — မန္တလေး နံနက်ခင်းကြယ်က ကြိုဆိုပါတယ်",
  },
  chooseLanguage: { en: "Choose your language", my: "ဘာသာစကား ရွေးပါ" },
  english: { en: "English", my: "English" },
  burmese: { en: "မြန်မာ", my: "မြန်မာ" },
  howToday: { en: "How are you eating today?", my: "ဒီနေ့ ဘယ်လို စားကြမလဲ?" },
  dineIn: { en: "Dine in", my: "ဆိုင်မှာ စားမယ်" },
  dineInHint: { en: "Take a table number", my: "စားပွဲနံပါတ် ယူလိုက်ပါ" },
  toGo: { en: "To go", my: "ပါဆယ် ယူမယ်" },
  toGoHint: { en: "We’ll call your name", my: "နာမည်နဲ့ ခေါ်ပေးပါ့မယ်" },
  grocery: { en: "Grocery", my: "ကုန်စုံ" },
  groceryHint: { en: "Scan items as you go", my: "ပစ္စည်းတွေကို စကင်ဖတ်သွားရုံပါပဲ" },
  yourName: { en: "Your first name", my: "သင့်နာမည်" },
  namePrompt: { en: "It’s the pickup call-out", my: "အော်ဒါရရင် နာမည်နဲ့ ခေါ်ပေးဖို့ပါ" },
  tableNumber: { en: "Your table number", my: "စားပွဲနံပါတ်" },
  tablePrompt: { en: "It’s on the table tent", my: "စားပွဲပေါ်က နံပါတ်ပြားမှာ ကြည့်လို့ရပါတယ်" },
  tableTaken: {
    en: "That table’s already seated — please ask a server.",
    my: "အဲဒီစားပွဲမှာ ဧည့်သည်ရှိနေပါတယ် — ဝန်ထမ်းကို မေးကြည့်ပါနော်။",
  },
  tableUnknown: {
    en: "We don’t recognize that table number — check the tent and try again.",
    my: "အဲဒီနံပါတ်ကို ရှာမတွေ့ပါ — နံပါတ်ပြားကို ပြန်ကြည့်ပြီး ထပ်စမ်းပေးပါ။",
  },
  start: { en: "Start", my: "စမယ်" },
  back: { en: "Back", my: "နောက်သို့" },
  viewOrder: { en: "View order", my: "အော်ဒါ ကြည့်မယ်" },
  yourOrder: { en: "Your order", my: "သင့်အော်ဒါ" },
  goesWellWith: { en: "Goes well with", my: "တွဲစားရင် ကောင်းတယ်နော်" },
  noThanks: { en: "No thanks", my: "မလိုပါ" },
  payAtCounter: { en: "Pay at the counter", my: "ကောင်တာမှာ ရှင်းမယ်" },
  // W17c-3 → W18 — the tip ask, warm and encouraging (owner: "tip ask should be fun and
  // encourage!"). "Add a tip?" stays a QUESTION — but the percentages now lead and "No tip" sits
  // last and quiet (owner: "none is not encouraged lol"), still one honest tap away.
  addATip: { en: "Add a little extra?", my: "အပိုလေး ထည့်မလား?" },
  tipForTheTeam: {
    en: "It all goes to the team who made your food.",
    my: "အားလုံး ချက်ပြုတ်ကျွေးမွေးပေးတဲ့ အဖွဲ့ဆီ တိုက်ရိုက် ရောက်ပါတယ်နော်။",
  },
  noTip: { en: "No tip", my: "မထည့်ပါ" },
  handoffTogo: {
    en: "Pay at the counter — we’ll call your name.",
    my: "ကောင်တာမှာ ရှင်းလိုက်ပါ — နာမည်နဲ့ ခေါ်ပေးပါ့မယ်နော်။",
  },
  // The no-name handoff (grocery, or a to-go order that skipped the name): promise only what the
  // counter can keep — there is no name to call.
  handoffCounter: {
    en: "You’re all set — pay at the counter.",
    my: "အားလုံး အဆင်သင့်ပါပြီ — ကောင်တာမှာ ရှင်းလိုက်ပါ။",
  },
  handoffDinein: {
    en: "Take your tent to the table and pay at the counter.",
    my: "နံပါတ်ပြားလေးကို စားပွဲဆီယူသွားပြီး ကောင်တာမှာ ရှင်းလိုက်ပါနော်။",
  },
  handoffThanks: { en: "Thank you!", my: "ကျေးဇူး အများကြီးတင်ပါတယ်!" },
  done: { en: "Done", my: "ပြီးပါပြီ" },
  stillThere: { en: "Still there?", my: "ရှိနေသေးလား?" },
  idleBody: {
    en: "This order will clear so the kiosk is ready for the next customer.",
    my: "နောက်တစ်ယောက်အတွက် ဒီအော်ဒါကို ရှင်းလိုက်ပါမယ်။",
  },
  // Post-commitment idle (the upsell screen): the order SURVIVES — never threaten to clear it.
  idleBodyCommitted: {
    en: "No rush — your order is saved. Pay at the counter when you’re ready.",
    my: "စိတ်မပူပါနဲ့ — သင့်အော်ဒါ သိမ်းပြီးသားပါ။ အဆင်သင့်ဖြစ်ရင် ကောင်တာမှာ ရှင်းလိုက်ပါ။",
  },
  imHere: { en: "I’m still here", my: "ရှိနေပါသေးတယ်" },
  startOver: { en: "Start over", my: "အစကနေ ပြန်စမယ်" },
  total: { en: "Total", my: "စုစုပေါင်း" },
  add: { en: "Add", my: "ထည့်မယ်" },
  scanPrompt: {
    en: "Scan a barcode, or browse below",
    my: "ဘားကုဒ် စကင်ဖတ်ပါ — ဒါမှမဟုတ် အောက်မှာ ရွေးလိုက်ပါ",
  },
  // Honest scan refusals (W6b review): each failure names itself — "something went wrong" on a
  // simply-unknown barcode sends customers away from a working kiosk.
  scanUnknown: {
    en: "We couldn’t find that barcode — please ask at the counter.",
    my: "ဒီဘားကုဒ်ကို ရှာမတွေ့ပါ — ကောင်တာမှာ မေးကြည့်ပါနော်။",
  },
  scanUnavailable: {
    en: "That item isn’t available today.",
    my: "ဒီပစ္စည်း ဒီနေ့ မရသေးပါ။",
  },
  scanWeighed: {
    en: "That one needs the scale — please bring it to the counter.",
    my: "ဒီပစ္စည်းက ချိန်ဖို့လိုပါတယ် — ကောင်တာဆီ ယူသွားပေးပါနော်။",
  },
  categories: { en: "Categories", my: "အမျိုးအစားများ" },
  menu: { en: "Menu", my: "မီနူး" },
  notConfigured: {
    en: "This kiosk isn’t set up yet — please order at the counter.",
    my: "ဒီစက် အဆင်သင့်မဖြစ်သေးပါ — ကောင်တာမှာ မှာလိုက်ပါနော်။",
  },
  somethingWrong: {
    en: "Something went wrong — please order at the counter.",
    my: "တစ်ခုခု မှားသွားပါတယ် — ကောင်တာမှာ မှာလိုက်ပါနော်။",
  },
} as const;

export type KioskStringKey = keyof typeof STRINGS;

/** The kiosk chrome string for the chosen language. */
export function t(lang: KioskLang, key: KioskStringKey): string {
  return STRINGS[key][lang];
}
