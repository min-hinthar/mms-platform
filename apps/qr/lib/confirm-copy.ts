import { t } from "./i18n";

/**
 * W16c — the confirm step's copy (and, since Phase 1b, the send/pay copy that replaced two of its
 * confirms), assembled PURE (M46: decision logic lives in lib/, testable
 * without a DOM). The static halves live in `lib/i18n/confirm.ts`; what happens here is the part
 * that can actually go wrong — interpolating a COUNT or an AMOUNT into both tongues.
 *
 * The money rule (same as CART_MONEY_KEYS, enforced here because this is where a numeral is
 * minted): every digit that reaches a diner on the money path is LATIN, never ၀–၉ — in the
 * Burmese line too. `confirm-copy.test.ts` walks every decision and asserts it.
 */

export type ConfirmDecision =
  /** A split share's manual-capture HOLD (SharePay) — real money committed, and the ONE confirm
   *  left. Phase 1b (owner, 2026-09-23: "Drop both") retired the send-to-kitchen confirm (the
   *  server-clocked undo is the safety net) and the card-pay confirm (the Pay button names the sum;
   *  a second "Pay $X?" asked the same question twice). What those two confirms carried now lives
   *  where the diner acts — `sentCopy`, `payProceedLabel` and `unsentPayNote` below. */
  { kind: "authorizeShare"; amountCents: number };

export type ConfirmCopy = {
  /** EN accessible name for the confirm group (an aria-label can't carry two langs). */
  label: string;
  questionEn: string;
  questionMy: string;
  detailEn: string;
  detailMy: string;
  proceedEn: string;
  proceedMy: string;
  cancelEn: string;
  cancelMy: string;
};

/** Latin, always — `toFixed(2)` on integer cents, never a locale-formatted numeral. */
export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function confirmCopy(d: ConfirmDecision): ConfirmCopy {
  const shared = {
    cancelEn: t("en", "confirmCancel"),
    cancelMy: t("my", "confirmCancel"),
  };
  switch (d.kind) {
    case "authorizeShare": {
      const amount = dollars(d.amountCents);
      return {
        ...shared,
        label: t("en", "confirmAuthorizeLabel"),
        questionEn: `Approve ${amount} on your card?`,
        questionMy: `သင့်ကတ်ပေါ်မှာ ${amount} အတည်ပြုမှာ သေချာပါသလား?`,
        detailEn: t("en", "confirmAuthorizeDetail"),
        detailMy: t("my", "confirmAuthorizeDetail"),
        proceedEn: `${t("en", "confirmAuthorizeProceed")} ${amount}`,
        proceedMy: `${t("my", "confirmAuthorizeProceed")} ${amount}`,
      };
    }
  }
}

/**
 * Phase 1b — the send-to-kitchen OUTCOME, now that no confirm precedes it. The owner's own Burmese
 * from the W16 directive ("Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ" — a completed-action statement:
 * "…confirmed") sat on the confirm's proceed button because that was the moment of commitment;
 * with one tap it becomes TRUE only when the send lands, so it moves to the success line.
 */
export function sentCopy(fired: number): { en: string; my: string } {
  return {
    en: `Sent to the kitchen — ${fired} ${fired === 1 ? "item" : "items"} on the way.`,
    my: t("my", "sentConfirmed"),
  };
}

/** Phase 1b — the card Pay button: the last thing under the thumb names the sum it charges (the
 *  job the retired confirm's proceed button did). Latin digits (the money-path rule). */
export function payProceedLabel(amountCents: number): string {
  return `Pay ${dollars(amountCents)}`;
}

/**
 * W19, re-homed by Phase 1b — a diner who forgot to send can still pay: the charge INCLUDES the
 * drafts and the kitchen starts them the moment payment lands. The retired confirm named them;
 * this note stands ABOVE the Pay button instead, so it is read before the tap rather than after.
 * Null when nothing is unsent. Latin digits in both tongues.
 */
export function unsentPayNote(unsent: number): { en: string; my: string } | null {
  if (unsent <= 0) return null;
  return {
    en: `Includes ${unsent} ${unsent === 1 ? "item" : "items"} not sent yet — the kitchen starts ${unsent === 1 ? "it" : "them"} the moment you pay.`,
    my: `မပို့ရသေးတဲ့ ${unsent} ခုပါဝင်ပါတယ် — ငွေရှင်းပြီးတာနဲ့ မီးဖိုချောင်က စချက်ပေးပါမယ်။`,
  };
}

/**
 * Phase 1b — what a guest who is NOT the host sees where the host's "Send to kitchen" would be.
 * Only the host fires the table (`mms_fire_cart` refuses anyone else), and until now a guest saw
 * nothing there at all — their dishes sat in a cart with no sign of how they reach the kitchen.
 * Names the host when the table knows them. The MY line is Claude-authored: K15 check-before-trust.
 */
/** Plain words (2026-09-24): who the table's "host" is, said the way a guest would say it. "Host" is
 *  the system's role name; a parent at the table does not know it means "the phone that started the
 *  table". Read by `hostSendsCopy` and Checkout's unsent-dishes note — one binding, never retyped. */
export const TABLE_STARTER = "The person who started your table";

export function hostSendsCopy(hostName: string | null): { en: string; my: string } {
  const who = hostName?.trim() || null;
  return {
    en: `${who ?? TABLE_STARTER} sends the table’s order to the kitchen — your dishes go with it.`,
    my: `${who ? `${who} က` : "စားပွဲ စဖွင့်တဲ့သူက" /* K15 draft (plain words 2026-09-24) */} စားပွဲရဲ့ အော်ဒါကို မီးဖိုချောင်ဆီ ပို့ပေးပါမယ် — သင့်ဟင်းတွေလည်း တစ်ခါတည်း ပါသွားပါမယ်။`,
  };
}
