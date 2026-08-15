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
  sendToKitchen: { en: "Send to kitchen", my: "မီးဖိုသို့ ပို့မယ်" },
  viewBillAndPay: { en: "View bill & pay", my: "ဘောက်ချာကြည့်ပြီး ရှင်းမယ်" },
  pay: { en: "Pay", my: "ရှင်းမယ်" },
  placeOrder: { en: "Place order", my: "အော်ဒါ တင်မယ်" }, // v7.2 (glossary-adapted)
  payAndLeave: { en: "Pay & leave", my: "ရှင်းပြီး ထွက်မယ်" }, // v7.2
  backToYourOrder: { en: "Back to your order", my: "သင့်အော်ဒါသို့ ပြန်သွား" },
  sending: { en: "Sending…", my: "ပို့နေသည်…" },
  orderWithKitchen: {
    en: "Your order’s with the kitchen.",
    my: "သင့်အော်ဒါ မီးဖိုထဲ ရောက်နေပါပြီ",
  },
  countItem: { en: "item", my: "ခု" },
  countItems: { en: "items", my: "ခု" },
  // Suffix after a NAME in both tongues ("{name} is checking out" / "{name} ရှင်းနေပါတယ်").
  isCheckingOut: { en: "is checking out", my: "ရှင်းနေပါတယ်" },

  // ── tip · promo · reward ───────────────────────────────────────────────────
  addATip: { en: "Add a little extra?", my: "အပိုလေး ပေးမလား?" }, // shipped W9e (v7.2 verbatim)
  noTip: { en: "None", my: "မပေးပါ" }, // shipped W2d chip label
  customTip: { en: "Custom", my: "စိတ်ကြိုက်" },
  promoCode: { en: "Promo code", my: "ပရိုမို ကုဒ်" }, // v7.2
  applyPromo: { en: "Apply", my: "သုံးမယ်" },
  applyReward: { en: "Apply a reward", my: "ဆုလာဘ် သုံးမယ်" },

  // ── totals row labels (render-site translations of receipt-view's stable keys) ──
  rowSubtotal: { en: "Subtotal", my: "အကြိုစုစုပေါင်း" },
  rowDiscount: { en: "Discount", my: "လျှော့စျေး" },
  rowPromo: { en: "Promo", my: "ပရိုမို" },
  rowReward: { en: "Reward", my: "ဆုလာဘ်" },
  rowTax: { en: "Sales tax", my: "ရောင်းခွန်" }, // shipped label is "Sales tax", not "Tax"
  rowTip: { en: "Tip", my: "တစ်ပ်" },
  rowTotal: { en: "Total", my: "စုစုပေါင်း" },
  estimatedTotal: { en: "Estimated total", my: "ခန့်မှန်း စုစုပေါင်း" },
  payWholeOrder: { en: "Pay the whole order", my: "တစ်စားပွဲလုံး ရှင်းမယ်" },

  // ── status words ───────────────────────────────────────────────────────────
  paidInFull: { en: "Paid in full", my: "အပြည့် ရှင်းပြီးပါပြီ" },
  processingPayment: { en: "Processing payment…", my: "ငွေချေနေသည်…" }, // v7.2
  cardDeclined: { en: "Card declined", my: "ကတ် ငြင်းပယ်ခံရသည်" }, // v7.2
  orderLocked: { en: "Unlock the order to make changes", my: "ပြောင်းရန် အော်ဒါကို လော့ခ်ဖွင့်ပါ" }, // v7.2 (glossary-adapted)
  paidThankYou: { en: "Paid. Thank you!", my: "ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ" }, // v7.2

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
] as const satisfies readonly (keyof typeof CART)[];
