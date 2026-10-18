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
  | "superseded"
  /** The charge has been refunded, in full or in part (Codex on #365 @ a2636db). A PaymentIntent
   *  stays `succeeded` after a refund, and `charge.refunded` for a charge with no order writes no
   *  row — so an operator who refunds a stranded charge in Stripe would otherwise get an order fired
   *  for money that already went back. */
  | "refunded"
  /** The intent's charge was not read (not expanded, or none): nothing proves it was not refunded. */
  | "charge_unread";

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

/**
 * The cart as the verdict needs it: null when no row exists. The settlement-freeze fields are what
 * binds a secure-tab close (`secureTabBound`); a read that leaves them out can never bind by them.
 */
export type RecoveryCart = {
  status: string;
  linkedIntent: string | null;
  /** `qr_carts.settle_by` — the request-unique owner of the settlement freeze (A3 · M201). */
  settleBy?: string | null;
  /** `qr_carts.settle_at` — when that freeze was written. */
  settleAt?: string | null;
  /** `qr_carts.locked` / `locked_at` — the pay lock a diner's attempt takes (`acquireCartLock`). */
  locked?: boolean | null;
  lockedAt?: string | null;
} | null;

/** The charge, as far as the refund rule reads it — `latest_charge` EXPANDED. */
export type RecoveryCharge = { amount_refunded: number; refunded: boolean };

/** The intent as the verdict reads it — the fields Stripe's `retrieve` returns, with
 *  `expand: ["latest_charge"]` (a bare id, or nothing, refuses as `charge_unread`). */
export type RecoveryIntent = {
  id: string;
  status: string;
  currency: string;
  metadata: Record<string, string | undefined> | null | undefined;
  latest_charge?: string | RecoveryCharge | null;
};

/** What every recovery read of an intent must expand, named ONCE: the refund rule reads it. */
export const RECOVERY_EXPAND = ["latest_charge"] as const;

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
 * Codex on #365 @ a2636db (P1) — a secure-tab close's off-session charge (`closeSecureTab`) is
 * minted under the table's settlement freeze and NEVER written to `live_payment_intent_id`, so the
 * link rule alone calls every one of them superseded and a charged tab whose webhook was lost had
 * no way home. Its binding is the freeze it was minted under, read from the DATABASE:
 *
 *   • the intent is a staff close's shape — `closedBy: "staff"` and a `settleAttempt` (only
 *     `closeSecureTab` writes both on a kind-less intent; the Terminal's carries `kind: "terminal"`
 *     and was refused above);
 *   • the cart's `settle_by` is still THAT attempt — a later close, a Terminal settle or a cash
 *     settle writes its own owner, and a release nulls it;
 *   • the cart names no live intent — a guest's attempt that took the cart since links its own;
 *   • and no pay lock was taken after the freeze (`not locked or locked_at < settle_at`, the same
 *     stored-values term as `readLiveIntentUnderFreeze`): `acquireCartLock` admits under a stale
 *     freeze and leaves `settle_by` behind, so the owner alone cannot prove nobody came after.
 *
 * Freshness is deliberately NOT required: the freeze's 10-minute TTL is how long it BLOCKS other
 * doors, and a lost webhook is by definition older than that. A cart someone settled since is not
 * open, so it skips this rule and lands on the refund-needed ledger like every other.
 *
 * The one thing the row cannot say: a pay lock taken AFTER the freeze and then RELEASED (a diner's
 * "Edit order" nulls `locked_at` with the lock). The cart then reads as never touched. That is
 * safe, not merely tolerated: the shared fulfillment reconciles the CAPTURED amount against the
 * cart as it now stands, so an edited cart is `amount_mismatch` → a refund-needed row and no order,
 * and an unedited one is exactly the bill this charge paid.
 *
 * Which door: only the cron. The guest door needs an `earnerUid` this intent never carries, and
 * staff's Check payment reads the cart's link, which this intent never wrote (OPEN-ITEMS M160).
 */
export function secureTabBound(intent: RecoveryIntent, cart: NonNullable<RecoveryCart>): boolean {
  const meta = intent.metadata ?? {};
  const attempt = meta.settleAttempt;
  if (meta.closedBy !== "staff" || typeof attempt !== "string" || attempt === "") return false;
  if (cart.settleBy !== attempt || cart.linkedIntent !== null) return false;
  if (typeof cart.settleAt !== "string") return false;
  if (!cart.locked) return true;
  return cart.lockedAt != null && Date.parse(cart.lockedAt) < Date.parse(cart.settleAt);
}

/** The refund rule: refused on ANY refund, and on a charge it could not read. */
function chargeRefusal(intent: RecoveryIntent): RecoveryRefusal | null {
  const charge = intent.latest_charge;
  if (charge == null || typeof charge === "string") return "charge_unread";
  if (charge.refunded || charge.amount_refunded > 0) return "refunded";
  return null;
}

/**
 * May a recovery door fulfill this intent? The order of the checks is the order of what can be
 * known: Stripe's status first (the only proof money moved), then what the intent IS, then whom it
 * belongs to, then whether the cart still names it — or, for a secure-tab close, still holds the
 * freeze it was charged under (`secureTabBound`).
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
  const charge = chargeRefusal(intent);
  if (charge) return { ok: false, refusal: charge };
  const meta = intent.metadata ?? {};
  if (!isRecoverableKind(meta.kind)) return { ok: false, refusal: "unsupported_kind" };
  if (intent.currency !== "usd") return { ok: false, refusal: "wrong_currency" };
  if (!isCartIdShape(meta.cartId) || meta.cartId !== expect.cartId)
    return { ok: false, refusal: "unbound" };
  if (expect.payerUid !== null && meta.earnerUid !== expect.payerUid)
    return { ok: false, refusal: "unbound" };
  if (!cart) return { ok: false, refusal: "no_cart" };
  if (cart.status === "open" && cart.linkedIntent !== intent.id && !secureTabBound(intent, cart))
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
