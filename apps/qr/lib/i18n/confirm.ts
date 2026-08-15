import type { Entry } from "./types";

/**
 * W16c — the CONFIRM step's bilingual strings (owner directive: "Important buttons like Send to
 * kitchen … or finalize pay bill should ask to confirm decision").
 *
 * These are the STATIC halves; `lib/confirm-copy.ts` assembles the lines that carry a count or an
 * amount (Latin digits only on the money path — same rule as CART_MONEY_KEYS, pinned there by
 * `confirm-copy.test.ts` over the ASSEMBLED strings, which is where an interpolated numeral could
 * actually go wrong).
 *
 * ⚠️ `confirmSendProceed.my` is the owner's OWN Burmese, quoted verbatim from the W16 directive.
 * Grammatically it reads as a completed-action statement ("…confirmed"), which is why it sits on
 * the PROCEED BUTTON (the moment the diner commits) rather than in the question. The
 * Claude-authored question forms below are K15 check-before-trust — they await Min's native read.
 */
export const CONFIRM = {
  confirmCancel: { en: "Cancel", my: "မလုပ်တော့ပါ" },

  // ── send to kitchen (the owner's named example) ────────────────────────────
  confirmSendLabel: { en: "Confirm sending to the kitchen", my: "မီးဖိုသို့ ပို့ရန် အတည်ပြုပါ" },
  confirmSendDetail: {
    en: "The kitchen starts cooking it. You’ll have a few seconds to undo.",
    my: "မီးဖိုက ချက်ပြုတ်စပြီ။ ပြန်ရုပ်သိမ်းရန် စက္ကန့်အနည်းငယ် ရပါမယ်",
  },
  confirmSendProceed: { en: "Yes, send", my: "Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ" }, // owner verbatim

  // ── finalize the bill (the CHARGE, not the intent mint) ────────────────────
  confirmPayLabel: { en: "Confirm your payment", my: "ငွေချေမှု အတည်ပြုပါ" },
  confirmPayDetail: {
    en: "This completes your payment — it can’t be undone here.",
    my: "ဒါနဲ့ ငွေချေမှု ပြီးဆုံးပါပြီ — ဒီမှာ ပြန်ရုပ်သိမ်းလို့ မရတော့ပါ",
  },
  confirmPayProceed: { en: "Yes, pay", my: "ဟုတ်ကဲ့၊ ရှင်းမယ်" },

  // ── authorize a split share (a real hold on the card) ──────────────────────
  confirmAuthorizeLabel: { en: "Confirm your share", my: "သင့်ဝေစု အတည်ပြုပါ" },
  confirmAuthorizeDetail: {
    en: "It’s a hold on your card — you’re charged once everyone’s authorized.",
    my: "ကတ်ပေါ်မှာ ကြိုပိတ်ထားတာပါ — အားလုံး အတည်ပြုပြီးမှ ကောက်ခံပါမယ်",
  },
  confirmAuthorizeProceed: { en: "Yes, authorize", my: "ဟုတ်ကဲ့၊ အတည်ပြုမယ်" },
} satisfies Record<string, Entry>;
