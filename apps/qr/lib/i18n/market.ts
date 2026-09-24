import type { Entry } from "./types";

/**
 * Phase 1c — the market's Scan door: the camera primer, its hints, and every recovery panel.
 *
 * ⚠️ K15 — EVERY Burmese value below is Claude-authored and awaits Min's native read (the W5c/K15
 * check-before-trust pattern). None is owner-verbatim. Flag any edit in the PR so the review knows
 * copy moved.
 *
 * Glossary (this module):
 *   · market = စျေး (the masthead eyebrow's existing word, "Grocery · စျေး").
 *   · basket = စျေးခြင်း — PROPOSED here, K15-HIGH: the first diner-facing Burmese for the grocery
 *     basket. The app's order noun stays အော်ဒါ (S14a); a market basket is not an order.
 *   · scan = စကင်ဖတ် (the kiosk's shipped verb, `lib/kiosk/strings.ts`).
 *
 * Reused, NOT copied here: COMMON.tryAgain ("Try again", v7.2) and the kiosk's shipped
 * `scanWeighed` / `scanUnavailable` (read through the kiosk's `t()`), so one refusal has one wording.
 * English-only strings (the device help steps, the stage's sr-only names, toasts, "See all {n}")
 * stay inline at their call sites and are never keys here, so the parity guard holds.
 */
export const MARKET = {
  // ── the primer (inside the ink box, before any camera prompt) ──
  scanTitle: { en: "Scan as you shop", my: "စျေးဝယ်ရင်း စကင်ဖတ်လိုက်ပါ" },
  scanStart: { en: "Start scanning", my: "စကင်ဖတ်မယ်" },
  scanNote: {
    en: "Items we have on file go straight into your basket. The camera is on only while this screen is open.",
    my: "ဆိုင်စာရင်းထဲ ရှိတဲ့ ပစ္စည်းတွေ စျေးခြင်းထဲ တန်းရောက်ပါမယ်။ ဒီစာမျက်နှာ ဖွင့်ထားချိန်မှာပဲ ကင်မရာ ပွင့်နေပါမယ်။",
  },

  // ── starting + the live viewfinder's one line of guidance ──
  scanStarting: { en: "Starting the camera…", my: "ကင်မရာ ဖွင့်နေပါတယ်…" },
  scanHintAim: { en: "Point at a barcode", my: "ဘားကုဒ်ကို ချိန်ပါ" },
  scanHintBasket: { en: "Starting your basket…", my: "စျေးခြင်း ပြင်ဆင်နေပါတယ်…" },
  scanHintOfflineSaved: {
    en: "Offline — scans are saved and add when you’re back",
    my: "အင်တာနက် မရှိပါ — စကင်ဖတ်တာတွေ သိမ်းထားပြီး ပြန်ရလာရင် ထည့်ပေးပါမယ်",
  },
  scanHintOfflineBlocked: {
    en: "Offline — scanning needs a connection on this device",
    my: "အင်တာနက် မရှိပါ — ဒီဖုန်းမှာ စကင်ဖတ်ဖို့ အင်တာနက် လိုပါတယ်",
  },

  // ── the shared way out ──
  searchByName: { en: "Search by name", my: "နာမည်နဲ့ ရှာမယ်" },

  // ── recovery panels ──
  camDeniedTitle: {
    en: "The camera is off for this site",
    my: "ဒီဆိုက်အတွက် ကင်မရာ ပိတ်ထားပါတယ်",
  },
  camDeniedBody: {
    en: "You can still shop by name. To scan, allow the camera for this site in your browser settings, then tap Try again.",
    my: "နာမည်နဲ့ ရှာပြီး ဆက်ဝယ်လို့ ရပါတယ်။ စကင်ဖတ်ချင်ရင် ဘရောက်ဇာ ဆက်တင်မှာ ဒီဆိုက်အတွက် ကင်မရာကို ခွင့်ပြုပြီး ‘ထပ်ကြိုးစား’ ကို နှိပ်ပါ။",
  },
  camHelpSummary: { en: "How to turn the camera on", my: "ကင်မရာ ဘယ်လို ဖွင့်မလဲ" },
  camBusyTitle: { en: "Couldn’t reach the camera", my: "ကင်မရာကို ဖွင့်လို့ မရပါ" },
  camBusyBody: {
    en: "Another app may be using it, or it may be switched off in your phone’s settings. Close other camera apps, then try again.",
    my: "တခြားအက်ပ်က သုံးနေတာ ဒါမှမဟုတ် ဖုန်းဆက်တင်မှာ ပိတ်ထားတာ ဖြစ်နိုင်ပါတယ်။ ကင်မရာသုံးနေတဲ့ အက်ပ်တွေကို ပိတ်ပြီး ထပ်ကြိုးစားပါ။",
  },
  camNoneTitle: { en: "No camera found", my: "ကင်မရာ ရှာမတွေ့ပါ" },
  camNoneBody: {
    en: "We couldn’t find a camera on this device. You can still shop by name or browse the aisles.",
    my: "ဒီစက်မှာ ကင်မရာ ရှာမတွေ့ပါ — နာမည်နဲ့ ရှာပြီးဖြစ်ဖြစ်၊ စျေးထဲ လှည့်ကြည့်ပြီးဖြစ်ဖြစ် ဝယ်လို့ ရပါတယ်။",
  },
  camUnsupportedTitle: {
    en: "This browser can’t scan",
    my: "ဒီဘရောက်ဇာမှာ စကင်ဖတ်လို့ မရပါ",
  },
  camUnsupportedBody: {
    en: "Open this page in Safari or Chrome to use the camera — or search by name.",
    my: "ကင်မရာ သုံးဖို့ ဒီစာမျက်နှာကို Safari ဒါမှမဟုတ် Chrome မှာ ဖွင့်ပါ — ဒါမှမဟုတ် နာမည်နဲ့ ရှာပါ။",
  },
  camInAppTitle: {
    en: "This app’s browser can’t use the camera",
    my: "ဒီအက်ပ်ထဲက ဘရောက်ဇာမှာ ကင်မရာ သုံးလို့ မရပါ",
  },
  camInAppBody: {
    en: "Open this page in Safari or Chrome — usually from the ⋯ menu — or search by name.",
    my: "ဒီစာမျက်နှာကို Safari ဒါမှမဟုတ် Chrome မှာ ဖွင့်ပါ — များသောအားဖြင့် ⋯ မီနူးထဲမှာ ရှိပါတယ် — ဒါမှမဟုတ် နာမည်နဲ့ ရှာပါ။",
  },
  camFailedTitle: { en: "The camera didn’t start", my: "ကင်မရာ မပွင့်လာပါ" },
  camFailedBody: {
    en: "Try again, or search by name.",
    my: "ထပ်ကြိုးစားပါ၊ ဒါမှမဟုတ် နာမည်နဲ့ ရှာပါ။",
  },

  // ── the result bar's one new notice (weighed / unavailable reuse the kiosk's shipped pair) ──
  noticeUnknown: { en: "Barcode not on file", my: "ဒီဘားကုဒ် စာရင်းထဲ မရှိပါ" },
} satisfies Record<string, Entry>;
