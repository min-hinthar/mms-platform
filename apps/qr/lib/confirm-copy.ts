import { t } from "./i18n";

/**
 * W16c — the confirm step's copy, assembled PURE (M46: decision logic lives in lib/, testable
 * without a DOM). The static halves live in `lib/i18n/confirm.ts`; what happens here is the part
 * that can actually go wrong — interpolating a COUNT or an AMOUNT into both tongues.
 *
 * The money rule (same as CART_MONEY_KEYS, enforced here because this is where a numeral is
 * minted): every digit that reaches a diner on the money path is LATIN, never ၀–၉ — in the
 * Burmese line too. `confirm-copy.test.ts` walks every decision and asserts it.
 */

export type ConfirmDecision =
  | { kind: "sendToKitchen"; itemCount: number }
  /** The CHARGE (PaymentSection.confirm), not the intent mint — see docs/W16_PLAN.md §W16c.
   *  `unsentCount` (W19): qty units of still-draft food in the charge (lib/checkout-stage
   *  unsentFoodQty). The confirm names them so "forgot to send, paid anyway" is an informed
   *  choice — those dishes are fired the moment payment lands, never lost. */
  | { kind: "pay"; amountCents: number; unsentCount?: number }
  /** A split share's manual-capture HOLD (SharePay) — real money committed, so same policy. */
  | { kind: "authorizeShare"; amountCents: number };

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
    case "sendToKitchen": {
      // The count is what the send COMMITS — showing it is the whole point of the step (a diner
      // who added a round for the table sees "5 items", not a bare "are you sure?").
      const n = d.itemCount;
      const unit = n === 1 ? t("en", "countItem") : t("en", "countItems");
      return {
        ...shared,
        label: t("en", "confirmSendLabel"),
        // MY has no plural — `ခု` is invariant (lib/i18n/cart.ts countItem/countItems).
        questionEn: n > 0 ? `Send ${n} ${unit} to the kitchen?` : "Send this to the kitchen?",
        questionMy:
          n > 0
            ? `${n} ${t("my", "countItems")} မီးဖိုသို့ ပို့မှာ သေချာပါသလား?`
            : "မီးဖိုသို့ ပို့မှာ သေချာပါသလား?",
        detailEn: t("en", "confirmSendDetail"),
        detailMy: t("my", "confirmSendDetail"),
        proceedEn: t("en", "confirmSendProceed"),
        proceedMy: t("my", "confirmSendProceed"),
      };
    }
    case "pay": {
      const amount = dollars(d.amountCents);
      // W19 — name the unsent dishes IN the charge confirm. Latin digits in both tongues (the
      // money-path rule); appended to the detail so the question stays the amount.
      const unsent = d.unsentCount ?? 0;
      const unsentEn =
        unsent > 0
          ? ` Includes ${unsent} ${unsent === 1 ? "item" : "items"} not sent yet — the kitchen starts ${unsent === 1 ? "it" : "them"} the moment you pay.`
          : "";
      const unsentMy =
        unsent > 0
          ? ` မပို့ရသေးတဲ့ ${unsent} ခုပါဝင်ပါတယ် — ငွေရှင်းပြီးတာနဲ့ မီးဖိုက စချက်ပေးပါမယ်။`
          : "";
      return {
        ...shared,
        label: t("en", "confirmPayLabel"),
        questionEn: `Charge ${amount} to your card?`,
        questionMy: `သင့်ကတ်မှ ${amount} ကောက်ခံမှာ သေချာပါသလား?`,
        detailEn: `${t("en", "confirmPayDetail")}${unsentEn}`,
        detailMy: `${t("my", "confirmPayDetail")}${unsentMy}`,
        // The amount rides the proceed button too: the last thing under the thumb names the sum.
        proceedEn: `${t("en", "confirmPayProceed")} ${amount}`,
        proceedMy: `${t("my", "confirmPayProceed")} ${amount}`,
      };
    }
    case "authorizeShare": {
      const amount = dollars(d.amountCents);
      return {
        ...shared,
        label: t("en", "confirmAuthorizeLabel"),
        questionEn: `Authorize ${amount} on your card?`,
        questionMy: `သင့်ကတ်ပေါ်မှာ ${amount} အတည်ပြုမှာ သေချာပါသလား?`,
        detailEn: t("en", "confirmAuthorizeDetail"),
        detailMy: t("my", "confirmAuthorizeDetail"),
        proceedEn: `${t("en", "confirmAuthorizeProceed")} ${amount}`,
        proceedMy: `${t("my", "confirmAuthorizeProceed")} ${amount}`,
      };
    }
  }
}
