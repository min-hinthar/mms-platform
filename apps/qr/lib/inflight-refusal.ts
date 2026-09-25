import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import type { PaymentInFlight } from "./pay-guard";

/**
 * Phase 2c · register (OPEN-ITEMS P2w) — the staff settle's "a payment is in flight" refusal, TRUE
 * about who holds the money. Pure; the one read it needs (is the freeze's owner a seat of this
 * session?) is `settleOwnerIsSeat` in lib/inflight-read.ts.
 *
 * "Someone’s already paying on their phone" used to be the only sentence, and it is false after an
 * unknown-outcome card-on-file close: `closeSecureTab` deliberately HOLDS its freeze when it cannot
 * tell whether the charge landed, so the "try again" `settle.card.unknown` invites was refused with a
 * sentence about a guest's phone. Every staff settle (cash, the card on file, the reader) owns its
 * freeze under a per-request `crypto.randomUUID()` (A3 · M201), which is never a seat; a diner's
 * split owns it under the host's seat id. So the owner tells the two apart — and when it cannot be
 * read, the sentence names both places and promises neither.
 *
 * The lifetimes are the freezes' own (lib/lock-ttl), measured the way `paymentInFlightReason` does
 * (`Date.now() − ts < ttl`), so the two can never disagree about whether a hold is live.
 */
export type InFlightHolder = "phone" | "register" | "unsure";

const fresh = (ts: string | null, ttlMs: number, nowMs: number) =>
  ts != null && nowMs - new Date(ts).getTime() < ttlMs;

export function inFlightHolder(i: {
  reason: PaymentInFlight;
  locked: boolean;
  lockedAt: string | null;
  settleAt: string | null;
  /** The fresh freeze's owner (`settle_by`) is a member seat of this session (`true`), is not
   *  (`false`), or could not be read (`null`). */
  settleByIsSeat: boolean | null;
  nowMs: number;
}): InFlightHolder {
  // A share already authorized/captured: guests paying their parts on their phones.
  if (i.reason === "split_in_progress") return "phone";
  // The single-pay lock is only ever the diner's door (create-intent).
  if (i.locked && fresh(i.lockedAt, CART_LOCK_TTL_MS, i.nowMs)) return "phone";
  if (fresh(i.settleAt, SETTLE_TTL_MS, i.nowMs)) {
    if (i.settleByIsSeat === true) return "phone";
    if (i.settleByIsSeat === false) return "register";
  }
  return "unsure";
}

/** The freeze's lifetime in whole minutes — the wait a held register attempt can impose. */
const SETTLE_MINUTES = Math.round(SETTLE_TTL_MS / 60_000);

export function inFlightRefusal(holder: InFlightHolder): string {
  switch (holder) {
    case "phone":
      return "Someone’s already paying on their phone — wait for that to finish.";
    case "register":
      return `A payment started at the register on this table hasn’t finished — don’t take cash or another card yet. If it went through, the table settles itself shortly; if it hasn’t settled within ${SETTLE_MINUTES} minutes, try again.`;
    case "unsure":
      return "A payment on this table is already going through — on a guest’s phone or at the register. Don’t take another tender until it finishes.";
  }
}
