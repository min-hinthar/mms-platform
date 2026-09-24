import { CartClosedError, ItemUnreadableError, ItemUnsellableError } from "./order-lines";

/**
 * Phase 2a · padserver — the staff add's refusal, CODED (order-pad spec, commit group 1).
 *
 * `staffAddItem` used to answer every failure with one sentence, so a caller could not tell "nothing
 * was written, try something else" from "the write may have landed, do not add it again". The order
 * pad needs exactly that difference: with an add key (the existing `p_scan_id` ledger), resending the
 * SAME key can never double an add, but a NEW tap mints a NEW key — so an outcome that may have
 * committed must never read as a definite failure that invites one.
 *
 * The code is decided by WHERE the throw happened (the price phase vs the write phase), never by
 * message text (LEARNINGS #60). Pricing writes nothing, so its failures are definite; the write is a
 * status-atomic RPC whose response can be lost after it committed, so every throw out of it is
 * `unconfirmed` whatever it says — except the guard's own typed "not open" (`CartClosedError`), a
 * definite non-write, which is `closed`.
 */

/** A failure `addFailureCode` can decide from the phase + the thrown value. */
export type AddFailureCode = "sold_out" | "gone" | "outage" | "failed" | "unconfirmed" | "closed";

/**
 * Every code `staffAddItem` can answer with. The pre-read refusals are decided by the branch that
 * refused (gate, parse, cart read, the payment mutex); the rest by `addFailureCode`.
 *   • `signin`   — the gate wants a sign-in (a redirect on the console, not a sentence);
 *   • `sentence` — any other gate refusal (role floor, the gate's own outage copy): show `error`;
 *   • `invalid`  — the request failed the schema;
 *   • `outage`   — the table/cart read failed, or the catalog read did (from `addFailureCode`);
 *   • `closed`   — the table is closed, or the insert found its order no longer open (nothing
 *                  written); `no-cart` — it has no open order;
 *   • `paying`   — a payment is in flight on this table.
 */
export type StaffWriteCode =
  | "signin"
  | "sentence"
  | "invalid"
  | "closed"
  | "no-cart"
  | "paying"
  | AddFailureCode;

export function addFailureCode(phase: "price" | "write", err: unknown): AddFailureCode {
  // The ONE definite refusal out of the write: the insert RPC's status-atomic guard answered "not
  // open" (null, no error) — nothing was written, so the add is not in doubt. Typed at the throw
  // (`CartClosedError`), never matched by message: an RPC error carries the same sentence.
  if (phase === "write" && err instanceof CartClosedError) return "closed";
  // Anything else out of the write may have committed — the one outcome a caller must never retry
  // under a new key.
  if (phase === "write") return "unconfirmed";
  if (err instanceof ItemUnsellableError) return err.reason;
  if (err instanceof ItemUnreadableError) return "outage";
  // Cardinality refusal, or anything else priceItem threw before a write was attempted.
  return "failed";
}
