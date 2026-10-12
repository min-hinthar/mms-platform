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
  scanHintAim: { en: "Point at the code on the package", my: "ပစ္စည်းပေါ်က ကုဒ်ကို ချိန်ပါ" }, // K15 draft (plain words 2026-09-24)
  scanHintBasket: { en: "Starting your basket…", my: "စျေးခြင်း ပြင်ဆင်နေပါတယ်…" },
  // PD4 (critic's fix B4) — "saved and CHECKED", never "saved and add": a saved code may be
  // refused at replay (unknown · weighed · unavailable), so the lens promises only the check.
  scanHintOfflineSaved: {
    en: "Offline — scans are saved and checked when you’re back",
    my: "အင်တာနက် မရှိပါ — စကင်ဖတ်တာတွေ သိမ်းထားပြီး ပြန်ရလာရင် စစ်ပေးပါမယ်", // K15 draft (PD4)
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

  // ── PD4 · the miss tag inside the lens (weighed / unavailable reuse the kiosk's shipped pair) ──
  // "This CODE isn't in the app yet", not "we couldn't find that item": the ITEM is usually in the
  // app under its synthetic code — only the real shelf code is missing (C6) — so the words motivate
  // "Search by name" instead of contradicting it (m4 decision 9). "yet" leans on C6.
  noticeUnknown: { en: "This code isn’t in the app yet.", my: "ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။" }, // K15 draft (PD4)
  // The quiet line under the tag — the owner's default (PATH_DESIGN decision 6). The Burmese is the
  // tail of the kiosk's shipped `scanUnknown` ("…ကောင်တာမှာ မေးကြည့်ပါနော်"), the fewest new claims.
  askCounter: { en: "Or ask at the counter", my: "ကောင်တာမှာ မေးကြည့်ပါနော်" }, // K15 draft (PD4)

  // ── PD4 · the Name sheet over the live lens ──
  // The coverage truth, said where the miss happens (the primer is seen only before the first
  // camera grant). In the just-opened AND the no-match states (decision 14).
  notYou: {
    en: "It’s not you — most shelf codes aren’t in the app yet.",
    my: "သင့်အမှား မဟုတ်ပါဘူး — ဆိုင်က ကုဒ်အများစု အက်ပ်ထဲ မရောက်သေးလို့ပါ။", // K15 draft (PD4)
  },
  // "laphet" IS a real synonym of Tea Leaves (grocery_catalog synonyms); the critic's note: a
  // two-word example ("tea leaf") is not "one word".
  oneWord: {
    en: "One word from the name is enough — like “laphet” or “လက်ဖက်”.",
    my: "နာမည်ထဲက စကားလုံး တစ်လုံးဆို ရပါပြီ — “laphet” ဒါမှမဟုတ် “လက်ဖက်” လိုမျိုးပေါ့။", // K15 draft (PD4)
  },
  tryOneWord: {
    en: "Try one word from the name — or ask at the counter.",
    my: "နာမည်ထဲက စကားလုံး တစ်လုံးနဲ့ ထပ်ရှာကြည့်ပါ — ဒါမှမဟုတ် ကောင်တာမှာ မေးပါ။", // K15 draft (PD4)
  },
  // The actor-first NEXT sentence directly above the dead end's one hero (the diner register, B9).
  keepScanning: {
    en: "Keep scanning — this one can wait for the counter.",
    my: "ဆက်စကင်ဖတ်ပါ — ဒီတစ်ခုက ကောင်တာမှာ စောင့်လို့ ရပါတယ်။", // K15 draft (PD4)
  },
  backToCamera: { en: "Back to the camera", my: "ကင်မရာဆီ ပြန်သွားမယ်" }, // K15 draft (PD4)
  searching: { en: "Searching…", my: "ရှာနေပါတယ်…" }, // K15 draft (PD4)
  searchNeedsConnection: {
    en: "Search needs a connection — or ask at the counter.",
    my: "ရှာဖို့ အင်တာနက် လိုပါတယ် — ဒါမှမဟုတ် ကောင်တာမှာ မေးကြည့်ပါနော်", // K15 draft (PD4)
  },
  searchUnavailable: {
    en: "Search unavailable — please try again.",
    my: "ရှာလို့ မရသေးပါ — ထပ်ကြိုးစားပါ။", // K15 draft (PD4)
  },
  // The busy result row keeps full ink and says so in a word (B10) — never opacity.
  adding: { en: "Adding…", my: "ထည့်နေပါတယ်…" }, // K15 draft (PD4)
  // The add-Undo in flight (B2 — past tense only after the confirmed write).
  removing: { en: "Removing…", my: "ဖျက်နေပါတယ်…" }, // K15 draft (PD4)

  // ── PD4 · the tag for the counter (held up for Dad; only in a sheet a miss opened) ──
  forTheCounter: { en: "For the counter", my: "ကောင်တာအတွက်" }, // K15 draft (PD4)
  // The query the shopper tried, so the handoff carries its own context (appendix C) — never a
  // code or a price.
  lookedFor: { en: "Looked for", my: "ရှာခဲ့တာ" }, // K15 draft (PD4)

  // ── PD4 · offline (critic's fix B4/B5): a code absent from the cache is UNKNOWN, never "not in
  // the app" — the cache omits weighed and unavailable items, so absence proves nothing ──
  savedScan: { en: "A saved scan", my: "သိမ်းထားတဲ့ စကင်" }, // K15 draft (PD4)
  savedCheck: {
    en: "Saved — we’ll check this code when you’re back online.",
    my: "သိမ်းထားပါတယ် — အင်တာနက် ပြန်ရရင် ဒီကုဒ်ကို စစ်ပေးပါမယ်။", // K15 draft (PD4)
  },
} satisfies Record<string, Entry>;
