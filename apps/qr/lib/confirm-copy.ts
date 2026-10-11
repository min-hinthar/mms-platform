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
/** Plain words (2026-09-24, corrected by the blind review): who the table's "host" is, said the way a
 *  guest would say it. "Host" is the system's role name — and "the person who started your table"
 *  was FALSE for a staff-opened table, whose host is simply the first diner to scan
 *  (`register.ts` inserts `host_seat: null`; `/api/session` claims it on that first scan). So the
 *  words name the ROLE — the one who sends the table's orders, which `mms_fire_cart` makes true for
 *  every host — never an event that may not have happened. ONE binding, in two grammatical
 *  persons: the guest's own table (`TABLE_STARTER`, sentence-initial; `TABLE_STARTER_MID` inside a
 *  sentence) and a table spoken of from outside (`TABLE_SENDER_THIRD`). Read by `hostSendsCopy`,
 *  Checkout, cart.ts, split.ts, SendToKitchenButton, SettlementBoard and SplitSection — never
 *  retyped. */
const SENDER = "person sending your table’s orders";
export const TABLE_STARTER = `The ${SENDER}`;
export const TABLE_STARTER_MID = `the ${SENDER}`;
export const TABLE_SENDER_THIRD = "the person sending the table’s orders";

export function hostSendsCopy(hostName: string | null): { en: string; my: string } {
  const who = hostName?.trim() || null;
  return {
    // No name known: the role sentence ("The person sending your table’s orders sends the table’s
    // order…") would say "send" twice, so the fallback names the sender plainly by what they hold.
    en: who
      ? `${who} sends the table’s order to the kitchen — your dishes go with it.`
      : "One person at your table sends the order to the kitchen from their phone — your dishes go with it.",
    my: `${who ? `${who} က` : "စားပွဲက တစ်ယောက်က သူ့ဖုန်းကနေ" /* K15 draft (2026-09-24; was စားပွဲ စဖွင့်တဲ့သူက) */} စားပွဲရဲ့ အော်ဒါကို မီးဖိုချောင်ဆီ ပို့ပေးပါမယ် — သင့်ဟင်းတွေလည်း တစ်ခါတည်း ပါသွားပါမယ်။`,
  };
}

/**
 * PD1 (m1 screen 1, row C) — the quiet human fallback under the guest's next step. TRUE because the
 * console's Send fires a diner's round too (`lib/staff-send-view.ts`: a host table gets a secondary
 * console Send with the host note; `lib/checkout-stage.ts`: "The console can ALWAYS send"). Named
 * when the table can name its host (`chosenName`); the role branch otherwise. ဝန်ထမ်း is the shipped
 * diner word for staff (`counterBody`). Both MY lines are K15 drafts (m1, quiet).
 */
export function staffCanSendCopy(hostName: string | null): { en: string; my: string } {
  const who = hostName?.trim() || null;
  return who
    ? {
        en: `If ${who} is away, our staff can send it too.`,
        my: `${who} မရှိရင် ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။`,
      }
    : {
        en: "If they’re away, our staff can send it too.",
        my: "သူ မရှိရင် ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။",
      };
}

/**
 * PD1 (owner answer 3; m1 B7) — the quiet "Let {host} know" and its settled confirmation. Offered
 * ONLY for a host the table can name (`nudgeOffered` takes `chosenName(host)`): "Let Guest know"
 * would name a placeholder, so there is no role branch and no English-only orphan. The confirmation
 * claims only what the stamp keeps — the host's Order page and order bar draw the waiting line
 * whenever they look, until the Send clears it. Both MY lines are K15 drafts (m1, quiet).
 */
export function nudgeCopy(hostName: string): {
  button: { en: string; my: string };
  seen: { en: string; my: string };
} {
  const who = hostName.trim();
  return {
    button: { en: `Let ${who} know`, my: `${who} ကို ပြောလိုက်မယ်` },
    seen: { en: `${who} can see you’re waiting.`, my: `စောင့်နေတာ ${who} မြင်ရပါပြီ` },
  };
}

/**
 * PD1 (the blind pass on #335) — a tablemate's nudge already stands: `mms_nudge_host` answered
 * `taken` with THEIR seat. The guest is told whose nudge it was — never "{host} can see you're
 * waiting", which would claim a stamp that is not theirs. The tablemate is named only by a name the
 * table CHOSE (`chosenName`); otherwise "Someone at your table". Both MY lines are K15 drafts (m1,
 * quiet).
 */
export function alreadyNudgedCopy(
  nudgerName: string | null,
  hostName: string,
): { en: string; my: string } {
  const who = nudgerName?.trim() || null;
  const host = hostName.trim();
  return who
    ? {
        en: `${who} already let ${host} know — they can see the table’s waiting.`,
        my: `${who} က ${host} ကို ပြောပြီးသားပါ — စားပွဲက စောင့်နေတာ မြင်ရပါတယ်`,
      }
    : {
        en: `Someone at your table already let ${host} know — they can see the table’s waiting.`,
        my: `စားပွဲက တစ်ယောက်က ${host} ကို ပြောပြီးသားပါ — စောင့်နေတာ မြင်ရပါတယ်`,
      };
}
