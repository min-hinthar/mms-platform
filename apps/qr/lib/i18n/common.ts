import type { Entry } from "./types";

/**
 * W5-L1 — shared chrome, navigation, and actions + the S14a GLOSSARY. Register: casual-warm
 * diaspora Burmese (တယ်/မယ်/နော် — DESIGN-RESEARCH §voice), never translation-ese. Every MY string
 * here is a Claude-authored working draft pending Min's native check (K15) unless it came verbatim
 * from `docs/prototype/v7.2.html` (marked `v7.2`).
 *
 * THE GLOSSARY (S14a — one concept, one name):
 *   order (noun)  = အော်ဒါ   (diaspora-natural; NEVER the formal မှာယူမှု — the kiosk fork's drift)
 *   bill/receipt  = ဘောက်ချာ
 *   to order (vb) = မှာယူ / မှာ  (the verb stays natural — the rule binds the NOUN)
 *   Stars (✦ loyalty currency) = Stars (untranslated brand term, ✦ glyph carries it)
 *   the market (grocery) = စျေး
 */
export const COMMON = {
  // ── actions ────────────────────────────────────────────────────────────────
  add: { en: "Add", my: "ထည့်" }, // v7.2
  cancel: { en: "Cancel", my: "မလုပ်တော့ပါ" },
  close: { en: "Close", my: "ပိတ်" },
  tryAgain: { en: "Try again", my: "ထပ်ကြိုးစား" }, // v7.2
  refresh: { en: "Refresh", my: "ပြန်စစ်" },

  // ── navigation (mirrors lib/menu-href's label rules — pair with the SAME mode logic) ──
  backToMenu: { en: "Back to menu", my: "မီနူးသို့ ပြန်သွား" },
  browseMenu: { en: "Browse the menu", my: "မီနူး ကြည့်မယ်" },
  backToMarket: { en: "Back to the market", my: "စျေးသို့ ပြန်သွား" },
  browseMarket: { en: "Browse the market", my: "စျေး ကြည့်မယ်" },
  chooseHowOrdering: { en: "Choose how you’re ordering", my: "ဘယ်လို မှာယူမလဲ ရွေးပါ" }, // v7.2 root

  // ── header / chrome ────────────────────────────────────────────────────────
  rewards: { en: "Rewards", my: "ဆုလာဘ်" }, // v7.2
  myOrders: { en: "My orders", my: "ကျွန်ုပ့် အော်ဒါများ" },
} satisfies Record<string, Entry>;
