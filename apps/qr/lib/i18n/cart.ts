import type { Entry } from "./types";

/**
 * W5-L2 — the MONEY PATH's key moments (the PRODUCTION_PLAN §W5 "~20 key moments": pay CTAs, tip
 * ask, totals row labels, order status words). Sources: the v7.2
 * prototype's authored MY money copy where it exists (marked `v7.2`, adapted to the S14a glossary
 * — the prototype's `အမှာ` noun becomes `အော်ဒါ`); everything else is a Claude-authored
 * diaspora-register draft pending Min's native check (K15).
 *
 * RULES THAT BIND (pinned by lib/i18n/strings.test.ts):
 *  - Money/legal keys carry LATIN digits only ("$", "10.5%") — never ၀–၉. This deliberately
 *    overrides DESIGN-RESEARCH §voice's "Burmese numerals" for the money path.
 *  - `lib/receipt-view.ts` / `lib/totals-math.ts` stay monolingual — these entries translate at
 *    the RENDER site, keyed off the pure modules' stable keys.
 *  - (W16a: the SB-1524 service-charge keys were RETIRED with the charge itself; historical
 *    receipts render their stored values via lib/receipt-view.ts, which keeps its own copy.)
 */
export const CART = {
  // ── the two moments (W12) ──────────────────────────────────────────────────
  yourOrder: { en: "Your order", my: "သင့်အော်ဒါ" }, // shipped W12
  yourBill: { en: "Your bill", my: "သင့်ဘောက်ချာ" }, // shipped W12
  // EN values are the SHIPPED checkout copy verbatim (never reworded by translation plumbing).
  emptyCartTitle: { en: "Nothing in your cart yet", my: "ဘာမှ မထည့်ရသေးပါ" },
  emptyCartSubMenu: {
    en: "Add a dish from the menu and it’ll show up here.",
    my: "မီနူးထဲက ဟင်းတစ်ခွက် ထည့်လိုက်ရင် ဒီမှာ ပေါ်လာပါမယ်",
  },
  emptyCartSubAisles: {
    en: "Scan or browse the aisles and your items will show up here.",
    my: "စကင်ဖတ်ပြီး ဒါမှမဟုတ် စျေးထဲ လှည့်ကြည့်ပြီး ထည့်လိုက်ရင် ပစ္စည်းတွေ ဒီမှာ ပေါ်လာပါမယ်",
  },

  // ── the verbs ──────────────────────────────────────────────────────────────
  // (W18 register note — owner: "Burmese should be fun, friendly, natural": guest-facing MY moved
  // to the conversational-polite spoken register (တယ်/မယ်/ပါနော်) a friendly server actually uses,
  // away from formal-document သည်/မည် endings. Still pending Min's native check — K15.)
  sendToKitchen: { en: "Send to kitchen", my: "မီးဖိုချောင်ဆီ ပို့လိုက်မယ်" },
  viewBillAndPay: { en: "View bill & pay", my: "ဘောက်ချာကြည့်ပြီး ရှင်းမယ်" },
  pay: { en: "Pay", my: "ရှင်းမယ်" },
  placeOrder: { en: "Place order", my: "အော်ဒါ တင်မယ်" }, // v7.2 (glossary-adapted)
  payAndLeave: { en: "Pay & leave", my: "ရှင်းပြီး ထွက်မယ်" }, // v7.2
  backToYourOrder: { en: "Back to your order", my: "သင့်အော်ဒါဆီ ပြန်သွားမယ်" },
  sending: { en: "Sending…", my: "ပို့နေပါတယ်…" },
  orderWithKitchen: {
    en: "Your order’s with the kitchen.",
    my: "သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်",
  },
  countItem: { en: "item", my: "ခု" },
  countItems: { en: "items", my: "ခု" },
  // Suffix after a NAME in both tongues ("{name} is checking out" / "{name} ရှင်းနေပါတယ်").
  isCheckingOut: { en: "is checking out", my: "ရှင်းနေပါတယ်" },

  // ── tip · promo · reward ───────────────────────────────────────────────────
  addATip: { en: "Add a little extra?", my: "အပိုလေး ပေးမလား?" }, // shipped W9e (v7.2 verbatim)
  // W18 — the encouraging subline under the ask. TRUE for this surface: a phone payment's tip lands
  // in the shared team bucket (W17c-4's /staff/tips is built on exactly that).
  tipGoesToTeam: {
    en: "It all goes to the team who made your meal.",
    my: "အားလုံး ချက်ပြုတ်ကျွေးမွေးပေးတဲ့ အဖွဲ့ဆီ တိုက်ရိုက် ရောက်ပါတယ်နော်",
  },
  // W18 — said the moment a tip is on. Ambient, warm, short.
  tipThanks: { en: "Thank you so much!", my: "ကျေးဇူး အများကြီးတင်ပါတယ်နော်" },
  noTip: { en: "None", my: "မထည့်ပါ" }, // shipped W2d chip label (W18: aligned with the kiosk's word)
  customTip: { en: "Custom", my: "စိတ်ကြိုက်" },
  // W18 — the order page's way back to adding food (owner: "page navigation buttons?"). The EN label
  // comes from menuLinkText (mode-true: menu vs market vs door picker); this MY accent is mode-neutral.
  addMore: { en: "Add more", my: "ထပ်မှာမယ်" },
  promoCode: { en: "Promo code", my: "ပရိုမို ကုဒ်" }, // v7.2
  applyPromo: { en: "Apply", my: "သုံးမယ်" },
  // W18 — ဆုလာဘ် (stiff, near-liturgical) → ဆုလက်ဆောင်, the word the account masthead already uses.
  applyReward: { en: "Apply a reward", my: "ဆုလက်ဆောင် သုံးမယ်" },

  // ── totals row labels (render-site translations of receipt-view's stable keys) ──
  rowSubtotal: { en: "Subtotal", my: "အကြိုစုစုပေါင်း" },
  rowDiscount: { en: "Discount", my: "လျှော့စျေး" },
  rowPromo: { en: "Promo", my: "ပရိုမို" },
  rowReward: { en: "Reward", my: "ဆုလက်ဆောင်" },
  rowTax: { en: "Sales tax", my: "ရောင်းခွန်" }, // shipped label is "Sales tax", not "Tax"
  rowTip: { en: "Tip", my: "တစ်ပ်" },
  rowTotal: { en: "Total", my: "စုစုပေါင်း" },
  estimatedTotal: { en: "Estimated total", my: "ခန့်မှန်း စုစုပေါင်း" },
  payWholeOrder: { en: "Pay the whole order", my: "တစ်စားပွဲလုံး ရှင်းမယ်" },
  // ── A1: pay at the counter (the register, not the phone) ─────────────────
  // Claude-authored diaspora-register drafts pending Min's native check (K15). "ကောင်တာ" is the
  // loanword the kiosk strings already use for the register (lib/kiosk/strings.ts).
  payAtCounter: { en: "Pay at the counter", my: "ကောင်တာမှာ ရှင်းမယ်" },
  counterTitle: { en: "Settle up at the counter", my: "ကောင်တာမှာ ရှင်းလိုက်ပါ" },
  counterBody: {
    en: "Show this to whoever’s at the register — cash or card, either works.",
    my: "ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ — ငွေသားပဲဖြစ်ဖြစ် ကတ်ပဲဖြစ်ဖြစ် ရပါတယ်",
  },
  counterKeepOrdering: {
    en: "You can keep ordering — the counter settles whatever’s on the table.",
    my: "ဆက်မှာလို့ ရပါသေးတယ် — စားပွဲပေါ်က အားလုံးကို ကောင်တာမှာ ရှင်းပေးပါမယ်",
  },
  payOnPhoneInstead: {
    en: "Changed your mind? Pay on your phone",
    my: "စိတ်ပြောင်းသွားရင် ဖုန်းကနေ ရှင်းမယ်",
  },
  counterSettledTitle: { en: "All settled — thank you!", my: "ရှင်းပြီးပါပြီ — ကျေးဇူးတင်ပါတယ်" },
  counterSettledBody: {
    en: "This bill was settled at the counter. There’s nothing left to pay here.",
    my: "ဒီဘောက်ချာကို ကောင်တာမှာ ရှင်းပြီးပါပြီ — ဒီမှာ ဘာမှ ရှင်းစရာ မကျန်တော့ပါဘူး",
  },
  // The close when a TABLEMATE's card settled the bill on their phone — this seat cannot see that
  // receipt (it is the payer's), so the sentence promises nothing about it.
  billPaidTitle: { en: "All paid — thank you!", my: "ရှင်းပြီးပါပြီ — ကျေးဇူးတင်ပါတယ်" },
  billPaidBody: {
    en: "This bill was paid on a phone at your table. There’s nothing left to pay here.",
    my: "ဒီဘောက်ချာကို သင့်စားပွဲက ဖုန်းတစ်လုံးကနေ ရှင်းပြီးပါပြီ — ဒီမှာ ဘာမှ ရှင်းစရာ မကျန်တော့ပါဘူး",
  },

  // ── status words ───────────────────────────────────────────────────────────
  paidInFull: { en: "Paid in full", my: "အပြည့် ရှင်းပြီးပါပြီ" },
  processingPayment: { en: "Processing payment…", my: "ငွေချေနေပါတယ်…" }, // v7.2 EN; MY W18 register
  cardDeclined: { en: "Card declined", my: "ကတ်က အဆင်မပြေပါ" }, // v7.2 EN; MY W18 register
  orderLocked: { en: "Unlock the order to make changes", my: "ပြောင်းရန် အော်ဒါကို လော့ခ်ဖွင့်ပါ" }, // v7.2 (glossary-adapted)
  paidThankYou: { en: "Paid. Thank you!", my: "ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ" }, // v7.2

  // ── the pay form (Phase 1c) ────────────────────────────────────────────────
  // The wait, the reveal and the failure card around Stripe's card iframe (lib/pay-element.ts owns
  // which one shows; PaymentSection renders it). EVERY MY value in this block is new Claude-authored
  // Burmese — K15: pending Min's native check (Phase 1c pay form, 21 keys). The pay verb is ရှင်း
  // (W18 register) and the review step is the bill (ဘောက်ချာ). "Try again" is COMMON.tryAgain (v7.2).
  //
  // ⚠️ HONESTY, pinned by lib/pay-element.test.ts: no string here says "you were not charged" or
  // "start again" — an ended intent may have SUCCEEDED (a tablemate or the counter settled it). The
  // offline sentence's promise ("we'll try again when you reconnect") is `shouldAutoRetry`'s path.
  payFormLoading: {
    en: "Loading the secure card form…",
    my: "ကတ်ဖောင်ကို လုံခြုံစွာ ဖွင့်နေပါတယ်…", // `လုံခြုံစွာ` is v7.2's own word (:464)
  },
  payFormSlow: {
    en: "Still loading — this can take a moment.",
    my: "ဖွင့်နေဆဲပါ — ခဏလောက် ကြာနိုင်ပါတယ်။",
  },
  payFormOffline: {
    en: "You look offline — we’ll try again when you reconnect.",
    my: "အင်တာနက် မရှိသလိုပဲ — ပြန်ချိတ်မိတာနဲ့ ထပ်ကြိုးစားပေးပါမယ်။",
  },
  payFormSecure: {
    en: "Your card goes straight to Stripe — never to us.",
    my: "ကတ်အချက်အလက်တွေက Stripe ဆီ တိုက်ရိုက် သွားပါတယ် — ကျွန်တော်တို့ဆီ မရောက်ပါဘူး။",
  },
  payFormReady: { en: "Card form ready.", my: "ကတ်ဖောင် အသင့်ဖြစ်ပါပြီ။" }, // sr-only
  payFailNetworkTitle: { en: "The card form didn’t load", my: "ကတ်ဖောင် မပေါ်လာပါဘူး" },
  // "Nothing is lost" is OutageState's shipped voice.
  payFailBody: {
    en: "Nothing is lost — try again in a moment.",
    my: "ဘာမှ မပျောက်ပါဘူး — ခဏနေ ထပ်ကြိုးစားပါ။",
  },
  payFailOfflineBody: {
    en: "You look offline — we’ll try again when you reconnect. Nothing is lost.",
    my: "အင်တာနက် မရှိသလိုပဲ — ပြန်ချိတ်မိတာနဲ့ ထပ်ကြိုးစားပေးပါမယ်။ ဘာမှ မပျောက်ပါဘူး။",
  },
  payFailEscalated: {
    en: "Still not loading. Go back to review and try paying again from there.",
    my: "ဖွင့်လို့ မရသေးပါဘူး — ဘောက်ချာဆီ ပြန်သွားပြီး အဲ့ဒီကနေ ပြန်ရှင်းကြည့်ပါ။",
  },
  payFailEscalatedCounter: {
    en: "Still not loading. Go back to review — you can pay at the counter from there.",
    my: "ဖွင့်လို့ မရသေးပါဘူး — ဘောက်ချာဆီ ပြန်သွားပြီး ကောင်တာမှာ ရှင်းလို့ ရပါတယ်။",
  },
  payFailTimeoutTitle: {
    en: "The card form is taking too long",
    my: "ကတ်ဖောင် ဖွင့်တာ ကြာနေပါတယ်",
  },
  payFailTimeoutBody: {
    en: "It may still appear here. If not, go back to review and try again from there.",
    my: "ဒီမှာ ပေါ်လာနိုင်ပါသေးတယ် — မပေါ်ရင် ဘောက်ချာဆီ ပြန်သွားပြီး အဲ့ဒီကနေ ပြန်ရှင်းကြည့်ပါ။",
  },
  payFailTimeoutBodyCounter: {
    en: "It may still appear here. If not, go back to review — you can pay at the counter from there.",
    my: "ဒီမှာ ပေါ်လာနိုင်ပါသေးတယ် — မပေါ်ရင် ဘောက်ချာဆီ ပြန်သွားပြီး ကောင်တာမှာ ရှင်းလို့ ရပါတယ်။",
  },
  payFailIntentTitle: {
    en: "This payment can’t continue",
    my: "ဒီတစ်ကြိမ် ဆက်ရှင်းလို့ မရတော့ပါဘူး",
  },
  payFailIntentBody: {
    en: "Go back to review to see where your order stands.",
    my: "သင့်အော်ဒါ ဘယ်အခြေအနေ ရောက်နေလဲ ဘောက်ချာဆီ ပြန်သွားပြီး ကြည့်ပါ။",
  },
  payFailConfigTitle: {
    en: "Card payment isn’t available right now",
    my: "အခု ကတ်နဲ့ ရှင်းလို့ မရသေးပါဘူး",
  },
  payFailConfigBody: {
    en: "Nothing is lost — go back to review and try again a little later.",
    my: "ဘာမှ မပျောက်ပါဘူး — ဘောက်ချာဆီ ပြန်သွားပြီး နောက်မှ ထပ်ကြိုးစားပါ။",
  },
  payFailConfigBodyCounter: {
    en: "Nothing is lost — go back to review; you can pay at the counter from there.",
    my: "ဘာမှ မပျောက်ပါဘူး — ဘောက်ချာဆီ ပြန်သွားပြီး ကောင်တာမှာ ရှင်းလို့ ရပါတယ်။",
  },
  payConfirmFailed: {
    en: "Payment couldn’t start — try again.",
    my: "ငွေရှင်းလို့ မစနိုင်ပါဘူး — ထပ်ကြိုးစားပါ။",
  },
  // New as a DINER string: the only existing Burmese for it is a clause inside a staff sentence.
  payRetrying: { en: "Trying…", my: "ထပ်ကြိုးစားနေပါတယ်…" },
  payBackToReview: { en: "Back to review", my: "ဘောက်ချာဆီ ပြန်သွားမယ်" }, // EN: Checkout's top control, verbatim
} satisfies Record<string, Entry>;

/** Keys whose values are money/legal copy — the Latin-digits guard walks this list. */
export const CART_MONEY_KEYS = [
  "pay",
  "payAndLeave",
  "rowSubtotal",
  "rowDiscount",
  "rowPromo",
  "rowReward",
  "rowTax",
  "rowTip",
  "rowTotal",
  "estimatedTotal",
  "payWholeOrder",
  "paidInFull",
  // A1 — pay-prefixed by convention; they carry no amount, the rule costs them nothing.
  "payAtCounter",
  "payOnPhoneInstead",
  // Phase 1c — the pay form's wait/failure copy, pay-prefixed by the same A1 convention: no amount
  // in any of them, so the Latin-digits rule costs nothing and keeps them honest if one ever grows.
  "payFormLoading",
  "payFormSlow",
  "payFormOffline",
  "payFormSecure",
  "payFormReady",
  "payFailNetworkTitle",
  "payFailBody",
  "payFailOfflineBody",
  "payFailEscalated",
  "payFailEscalatedCounter",
  "payFailTimeoutTitle",
  "payFailTimeoutBody",
  "payFailTimeoutBodyCounter",
  "payFailIntentTitle",
  "payFailIntentBody",
  "payFailConfigTitle",
  "payFailConfigBody",
  "payFailConfigBodyCounter",
  "payConfirmFailed",
  "payRetrying",
  "payBackToReview",
] as const satisfies readonly (keyof typeof CART)[];
