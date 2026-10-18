import type { FulfillIntentOutcome } from "./fulfill-intent";
import type { StaffKey } from "./i18n/staff";

/**
 * M160(b) — the stranded-paid-cart recovery's DECISIONS, pure.
 *
 * A paid cart with no order has no way home when the webhook never lands (C18's 2026-09-07 test
 * pass: five charged cards, zero orders). The recovery asks Stripe itself — `retrieve`, with the
 * secret key — and, only when Stripe's own answer says the money moved, runs the SAME fulfillment
 * the webhook runs (`fulfillSucceededIntent`). Everything that decides "may this intent be
 * fulfilled by a door that is not the signed webhook?" lives here, as values, so each rule is
 * falsified by a mutant rather than by a render with five mocks (CLAUDE.md, W17: decision logic
 * belongs in `lib/`).
 *
 * ⚠️ EVERY RULE FAILS CLOSED. A refusal costs a guest a few minutes — the webhook is still
 * redelivering for 72 hours, staff can still take payment, and the refusal is logged by name. A
 * wrong fulfillment is an order for money that did not move, or food fired against a superseded
 * intent. The two mistakes are not symmetric, so anything this module does not recognise refuses.
 */

/** Why a recovery door would not fulfill. Logged by name; never shown to a guest verbatim. */
export type RecoveryRefusal =
  /** Stripe does not say `succeeded` — nothing has been charged that an order could record. */
  | "not_succeeded"
  /** A split share (its own fulfillment, `mms_fulfill_split_order`) or a Terminal settle (the
   *  register's own poll owns it, and it carries no cart→intent link to prove it is current), or
   *  any kind this module has never seen. */
  | "unsupported_kind"
  /** Not a dollar charge — create-intent only ever mints `usd`. */
  | "wrong_currency"
  /** The intent's metadata does not bind it to the cart (or the payer) the caller asked about. */
  | "unbound"
  /** The cart the metadata names does not exist in this database (another app's PaymentIntent on
   *  the shared Stripe account, or a cart long since deleted). */
  | "no_cart"
  /** The cart is still OPEN and its `live_payment_intent_id` does not name this intent — a later
   *  attempt owns it (M151), or nothing does. Fulfilling here would price a superseded attempt. */
  | "superseded";

/** What a recovery door tells its caller. Serializable: it crosses the Server Action boundary. */
export type RecoveryAnswer =
  /** An order exists for this payment now (written by this call, or already on record). */
  | { kind: "recorded" }
  /** Stripe says the card has not been charged (yet). */
  | { kind: "not_paid" }
  /** The card WAS charged, but no order could be written: the cart was settled another way, or the
   *  charge no longer matches the cart. A refund-needed row carries it (`qr_refunds_needed`). */
  | { kind: "refund_needed" }
  /** This door cannot check this payment (a refusal above other than `not_succeeded`). */
  | { kind: "refused" }
  /** No card payment is waiting on this cart (no intent linked). */
  | { kind: "nothing" }
  /** Asked too often — the rate window is spent. */
  | { kind: "wait" }
  /** Stripe or the database could not be read; nothing was written. */
  | { kind: "error" };

/** The binding a door asserts: the cart it found the intent on, and (for a guest) the payer. */
export type RecoveryExpect = {
  cartId: string;
  /** The guest's verified uid, which must equal the intent's `earnerUid`. `null` for staff and the
   *  cron, whose authority is their own (staffGate, the cron secret), not the payer's. */
  payerUid: string | null;
};

/** The cart as the verdict needs it: null when no row exists. */
export type RecoveryCart = { status: string; linkedIntent: string | null } | null;

/** The intent as the verdict reads it — the fields Stripe's `retrieve` returns. */
export type RecoveryIntent = {
  id: string;
  status: string;
  currency: string;
  metadata: Record<string, string | undefined> | null | undefined;
};

/** Kinds a recovery door may fulfill: a diner's automatic-capture card (no `kind`), or a pickup
 *  hold the webhook captured (`pickup_manual`, which reaches `succeeded` only once captured). */
const RECOVERABLE_KINDS: ReadonlySet<string | undefined> = new Set([undefined, "pickup_manual"]);

/** The kind rule, named ONCE: the verdict refuses everything else, and the cron's prefilter reads
 *  the same function so it never lists an intent the verdict would refuse (or the reverse). */
export function isRecoverableKind(kind: string | undefined): boolean {
  return RECOVERABLE_KINDS.has(kind);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` is shaped like a cart id — checked BEFORE it reaches a `uuid` column (a non-uuid
 *  `.eq` is a Postgres 22P02, which would read as an outage rather than as "not ours"). */
export function isCartIdShape(id: string | undefined | null): id is string {
  return typeof id === "string" && UUID.test(id);
}

/**
 * May a recovery door fulfill this intent? The order of the checks is the order of what can be
 * known: Stripe's status first (the only proof money moved), then what the intent IS, then whom it
 * belongs to, then whether the cart still names it.
 *
 * ⚠️ THE LINK RULE APPLIES ONLY TO AN OPEN CART. A cart that is `paid` (another tender) or
 * `cancelled` (cleared) can never take an order from this intent — `fulfillSucceededIntent` records
 * the charge as refund-needed and writes NO order, which is the correct outcome for a charged card
 * there (OPEN-ITEMS M160: "a recovery path that fulfills that one is a defect, not a heal"). The
 * link is cleared or moved on those paths for reasons that say nothing about this charge, so
 * refusing them would strand a real charge with no ledger row at all.
 */
export function recoveryVerdict(input: {
  intent: RecoveryIntent;
  expect: RecoveryExpect;
  cart: RecoveryCart;
}): { ok: true } | { ok: false; refusal: RecoveryRefusal } {
  const { intent, expect, cart } = input;
  if (intent.status !== "succeeded") return { ok: false, refusal: "not_succeeded" };
  const meta = intent.metadata ?? {};
  if (!isRecoverableKind(meta.kind)) return { ok: false, refusal: "unsupported_kind" };
  if (intent.currency !== "usd") return { ok: false, refusal: "wrong_currency" };
  if (!isCartIdShape(meta.cartId) || meta.cartId !== expect.cartId)
    return { ok: false, refusal: "unbound" };
  if (expect.payerUid !== null && meta.earnerUid !== expect.payerUid)
    return { ok: false, refusal: "unbound" };
  if (!cart) return { ok: false, refusal: "no_cart" };
  if (cart.status === "open" && cart.linkedIntent !== intent.id)
    return { ok: false, refusal: "superseded" };
  return { ok: true };
}

/** A refusal, as the door says it: `not_succeeded` is the one a guest or a server can act on. */
export function refusalAnswer(refusal: RecoveryRefusal): RecoveryAnswer {
  return refusal === "not_succeeded" ? { kind: "not_paid" } : { kind: "refused" };
}

/**
 * The shared fulfillment's outcome, as the door says it. `refund_needed` covers BOTH no-order
 * outcomes that carry a charge: neither may ever be said as "recorded".
 */
export function fulfillAnswer(outcome: FulfillIntentOutcome): RecoveryAnswer {
  switch (outcome.kind) {
    case "fulfilled":
    case "already_recorded":
      return { kind: "recorded" };
    case "settled_elsewhere":
    case "amount_mismatch":
      return { kind: "refund_needed" };
    case "no_cart_metadata":
      return { kind: "refused" };
    case "retry":
      return { kind: "error" };
  }
}

/**
 * The cron's window, in Stripe's unix SECONDS. `minAgeMs` keeps the sweep off a payment whose
 * webhook is merely in flight (measured: an order lands 1–2 s after the charge, C18); `lookbackMs`
 * bounds the list, so a sweep never walks the account's whole history — and keeps C18's five
 * 2026-09-07 test-pass intents, whose carts no longer exist, out of it by construction.
 */
export function sweepWindow(
  nowMs: number,
  lookbackMs: number,
  minAgeMs: number,
): { gte: number; lte: number } {
  return {
    gte: Math.floor((nowMs - lookbackMs) / 1000),
    lte: Math.floor((nowMs - minAgeMs) / 1000),
  };
}

/**
 * The /track trigger's schedule, in ms after the tracker mounts with no order: one ask well past
 * the webhook's measured 1–2 s, and one after the live read's ~30 s give-up. Bounded — two asks per
 * mount, never a loop — and the server's per-cart window bounds a reloading guest too.
 */
export const TRACK_RECOVERY_ASK_MS: readonly number[] = [12_000, 40_000];

/**
 * Staff's "Check payment" answer, in the dictionary's words. Each key says only what the answer
 * established — "went through" for `recorded` alone, "charged, no order" for `refund_needed` alone —
 * so a server never takes a second payment off a sentence the server's retrieve did not support.
 */
export function checkPaymentSays(answer: RecoveryAnswer): StaffKey {
  switch (answer.kind) {
    case "recorded":
      return "settle.check.recorded";
    case "not_paid":
      return "settle.check.notPaid";
    case "refund_needed":
      return "settle.check.refund";
    case "refused":
      return "settle.check.refused";
    case "nothing":
      return "settle.check.nothing";
    case "wait":
      return "settle.check.wait";
    case "error":
      return "settle.check.error";
  }
}

/**
 * What /track does with a guest-door answer. `refresh`: an order exists now — re-read it (the live
 * subscription may have missed the insert). `stranded`: Stripe said charged and no order could be
 * written — say so, and send the guest to a person. Everything else changes nothing on screen: the
 * page's own copy (still confirming, then the give-up banner) is already the honest one, and a
 * guest is never told "not charged" off a redirect that said succeeded.
 */
export function trackRecoveryShows(answer: RecoveryAnswer): "refresh" | "stranded" | null {
  if (answer.kind === "recorded") return "refresh";
  if (answer.kind === "refund_needed") return "stranded";
  return null;
}
