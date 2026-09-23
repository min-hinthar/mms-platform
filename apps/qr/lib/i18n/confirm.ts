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
 * ⚠️ `sentConfirmed.my` is the owner's OWN Burmese, quoted verbatim from the W16 directive.
 * Grammatically it reads as a completed-action statement ("…confirmed"). It sat on the send
 * confirm's proceed button while that confirm existed; Phase 1b retired the confirm, so it now
 * rides the send's SUCCESS line — the moment the statement becomes true. The Claude-authored
 * question forms below are K15 check-before-trust — they await Min's native read.
 */
export const CONFIRM = {
  confirmCancel: { en: "Cancel", my: "မလုပ်တော့ပါ" },

  // ── the send outcome (Phase 1b: the send confirm is retired; see lib/confirm-copy sentCopy) ──
  sentConfirmed: { en: "Sent to the kitchen", my: "Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ" }, // owner verbatim

  // ── authorize a split share (a real hold on the card) ──────────────────────
  confirmAuthorizeLabel: { en: "Confirm your share", my: "သင့်ဝေစု အတည်ပြုပါ" },
  confirmAuthorizeDetail: {
    en: "It’s a hold on your card — you’re charged once everyone’s authorized.",
    my: "ကတ်ပေါ်မှာ ကြိုပိတ်ထားတာပါ — အားလုံး အတည်ပြုပြီးမှ ကောက်ခံပါမယ်",
  },
  confirmAuthorizeProceed: { en: "Yes, authorize", my: "ဟုတ်ကဲ့၊ အတည်ပြုမယ်" },
} satisfies Record<string, Entry>;
