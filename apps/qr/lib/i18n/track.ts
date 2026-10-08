import type { Entry } from "./types";

/**
 * PD3 — the pickup promise's words on /track (docs/path-design-2026-10-07/m3-pickup-promise.md,
 * the COPY sections; appendix A3 and round D). English leading, verbatim from the spec; every
 * Burmese line is either SHIPPED (named beside it) or a DRAFT for the native sitting, filed under
 * OPEN-ITEMS "K15 · post-pay". `{t}` is a Latin clock ("6:20 PM"); `{m}` is a Latin minute count —
 * digits never become ၀–၉ on this surface (the money path's rule, lib/i18n/cart.ts).
 *
 * Not spread into DICT: these are the pickup page's own sentences, read by `lib/pickup-promise.ts`
 * (the one derivation, where `trackFill` fills the `{t}` / `{m}` slot) and the pickup components.
 * Pure literals only — the content rules parse this file (plain-words.test.ts, strings.test.ts).
 */
export const TRACK = {
  // ── the Now sentences (the h1) ──
  confirming: {
    en: "We’re confirming your payment.",
    my: "ငွေရှင်းတာကို အတည်ပြုနေပါတယ်", // DRAFT, guided (brief-m3.md:168)
  },
  booked: {
    en: "You’re booked for {t}.",
    my: "{t} အတွက် မှာထားပြီးပါပြီ", // DRAFT, guided (brief-m3.md:167)
  },
  bookedSub: {
    en: "The kitchen starts it closer to your time.",
    my: "သင့်အချိန်နီးလာမှ မီးဖိုချောင်က စချက်ပါမယ်", // DRAFT, guided (brief-m3.md:173)
  },
  // cooking: the SHIPPED `orderWithKitchen` pair (lib/i18n/cart.ts) — read from there, never copied.
  late: {
    en: "Your {t} order isn’t bagged yet.",
    my: "{t} အော်ဒါကို မထုပ်ရသေးပါဘူး", // DRAFT, guided (brief-m3.md:169)
  },
  lateSub: {
    en: "It shows here the moment it is.",
    // DRAFT, guided — the FIRST sentence of brief-m3.md:174, split at its own "။" where the EN splits.
    my: "ထုပ်ပြီးတာနဲ့ ဒီမှာ ပေါ်လာပါမယ်။",
  },
  ready: {
    en: "Your order is ready.",
    // SHIPPED — the family word for ready: Dad's `expo.verb.bagged` second clause and the wall's
    // `board.status` (lib/i18n/staff.ts). ONE Burmese word for "ready" on this screen (B9, risk 13).
    my: "ယူလို့ရပြီ",
  },
  pickedUp: {
    en: "Picked up — enjoy!",
    my: "ယူသွားပြီ — ကောင်းကောင်း သုံးဆောင်ပါနော်", // DRAFT, guided (m3.json concepts[1].screens[6])
  },
  // ── the claim ticket ──
  kickerPickup: { en: "Pickup", my: "လာယူချိန်" }, // SHIPPED — Dad's `expo.pickup` (staff.ts)
  kickerReady: { en: "Ready for pickup", my: "ယူလို့ရပြီ" }, // SHIPPED — as `ready`
  kickerPickedUp: { en: "Picked up · {t}", my: "ယူသွားပြီ" }, // SHIPPED — `expo.verb.pickedUp`
  countdown: {
    en: "in ~{m} min",
    my: "{m} မိနစ်လောက်နေရင်", // DRAFT, quiet (brief-m3.md:77)
  },
  passSub: {
    en: "Show this code at the counter.",
    // SHIPPED — `counterBody`'s first clause (lib/i18n/cart.ts), one Burmese "show this" across m1–m3 (A3).
    my: "ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ",
  },
  pickedUpSub: {
    en: "Thanks for coming by.",
    my: "လာတဲ့အတွက် ကျေးဇူးတင်ပါတယ်", // DRAFT, guided (m3.json concepts[1].screens[6])
  },
  // ── the guide card ──
  question: {
    en: "At the restaurant now?",
    my: "ဆိုင်ကို ရောက်နေပြီလား?", // DRAFT, guided (brief-m3.md:170)
  },
  imHere: { en: "I’m here", my: "ရောက်နေပြီ" }, // SHIPPED — Dad's `expo.tag.here` badge (staff.ts)
  takeBack: {
    en: "We’ll tell the counter you’re here.",
    my: "ကောင်တာကို သင်ရောက်နေပြီလို့ ပြောပေးပါမယ်", // DRAFT, guided (m3.json concepts[1].screens[3])
  },
  undo: { en: "Undo", my: "ပြန်ဖျက်" }, // SHIPPED — `kds.undo` (staff.ts); D3: a mark just made is erased
  confirmed: {
    en: "The counter knows you’re here — hang tight.",
    my: "ကောင်တာက သင်ရောက်နေတာ သိပါပြီ — ခဏလေး စောင့်ပေးပါနော်", // DRAFT, guided (brief-m3.md:202)
  },
  undone: {
    en: "Okay — we didn’t tell the counter.",
    my: "ရပါပြီ — ကောင်တာကို မပြောရသေးပါဘူး", // DRAFT, guided (m3.json concepts[1].screens[3])
  },
  refused: {
    en: "Couldn’t let the counter know — try again.",
    my: "ကောင်တာကို မပြောနိုင်ခဲ့ပါ — ထပ်စမ်းပါ", // DRAFT, guided (m3.json concepts[1].screens[3])
  },
  // B5 — the capped keyboard hold's warning, five seconds before the window is let go. No spec
  // string draws it (J29): the house's own words, decided under the owner's delegation (post-pay).
  capSoon: {
    en: "We’ll tell the counter in a few seconds.",
    my: "ခဏနေရင် ကောင်တာကို ပြောပေးပါမယ်", // DRAFT, post-pay
  },
  // ── the foot ──
  foot: {
    en: "This page catches up whenever you come back to it.",
    my: "ဒီစာမျက်နှာကို ပြန်ဖွင့်တိုင်း နောက်ဆုံးအခြေအနေကို ပြပေးပါမယ်။", // DRAFT, quiet (brief-m3.md:88)
  },
  footPickedUp: {
    en: "This receipt lives in your order history.",
    my: "ဒီဘောက်ချာက သင့်အော်ဒါမှတ်တမ်းထဲမှာ ရှိနေပါမယ်", // DRAFT, guided (m3.json concepts[1].screens[6])
  },
} as const satisfies Record<string, Entry>;

export type TrackKey = keyof typeof TRACK;
