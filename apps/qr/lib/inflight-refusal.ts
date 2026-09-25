import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import type { PaymentInFlight } from "./pay-guard";
import { STAFF, type StaffKey } from "./i18n/staff";
import { fill } from "./i18n/fill";

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
 *
 * Critic finding (Phase 2c) — the sentences are DICTIONARY KEYS (`settle.inflight.*`, bilingual,
 * K15-HIGH), not English returned from the server: a Burmese-mode cashier was told "don't take
 * money" in English. The refusal is a typed code (`InFlightRefusal`: `code: "inflight"` + the
 * holder), decided by WHERE it happened; the components render the key. `error` keeps the English
 * (the key's own EN, filled) for a bundle older than the code. Client-importable: no server imports
 * (the `PaymentInFlight` import is type-only).
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
  // The share read FAILED (pay-guard fails closed): the refusal stands, but nobody can say who is
  // paying — never "their phone" on a transport error.
  if (i.reason === "split_unreadable") return "unsure";
  // The single-pay lock is only ever the diner's door (create-intent).
  if (i.locked && fresh(i.lockedAt, CART_LOCK_TTL_MS, i.nowMs)) return "phone";
  if (fresh(i.settleAt, SETTLE_TTL_MS, i.nowMs)) {
    if (i.settleByIsSeat === true) return "phone";
    if (i.settleByIsSeat === false) return "register";
  }
  return "unsure";
}

/** The freeze's lifetime in whole minutes — the wait a held register attempt can impose. It rides
 *  the `{n}` slot (Burmese digits in Burmese); the dictionary value carries no digit. */
export const SETTLE_MINUTES = Math.round(SETTLE_TTL_MS / 60_000);

const INFLIGHT_KEY = {
  phone: "settle.inflight.phone",
  register: "settle.inflight.register",
  unsure: "settle.inflight.unsure",
} as const satisfies Record<InFlightHolder, StaffKey>;

/** The ONE sentence per holder, as a staff message (key + slots) — what every settle control and
 *  the table page's paying banner render through `<Chrome>`. */
export function inFlightMsg(holder: InFlightHolder): {
  k: StaffKey;
  vars: { n: number };
} {
  return { k: INFLIGHT_KEY[holder], vars: { n: SETTLE_MINUTES } };
}

/** The English of `inFlightMsg` — the refusal's `error`, for a bundle that predates the code. */
export function inFlightRefusal(holder: InFlightHolder): string {
  const m = inFlightMsg(holder);
  return fill(STAFF[m.k].en, m.vars, "en");
}

/**
 * A staff settle refused while money is moving on the cart (cash, the card-on-file close, the
 * reader) — a member of each result's typed refusal union, decided by WHERE it happened.
 */
export type InFlightRefusal = {
  ok: false;
  error: string;
  code: "inflight";
  holder: InFlightHolder;
};

export function inFlightRefusalOf(holder: InFlightHolder): InFlightRefusal {
  return { ok: false, error: inFlightRefusal(holder), code: "inflight", holder };
}
