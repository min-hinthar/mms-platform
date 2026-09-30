/**
 * P2dd · P2cy — the two DEFINITE refusals the cart's line RPCs raise
 * (`supabase/migrations/20260929000000_p2dd_p2cy_line_guards.sql`), named once.
 *
 * An RPC error is normally not a verdict: the response may have been lost after the write committed,
 * which is why `insertOrIncLine` keeps every other error an untyped throw (the staff add reads it
 * `unconfirmed`). These two are different. Each is a `raise … using errcode = 'P0001'` inside the
 * function, so the transaction ABORTED and nothing was written — and PostgREST returns that SQLSTATE
 * and message verbatim. A lost response never carries them; a transport failure has no P0001.
 *
 *   `paying` — the table's settlement freeze is fresh: the cart is being paid right now.
 *   `sent`   — the line left 'draft' (a Send won the race): it is never grown, re-counted or removed.
 *
 * Both halves of the match are required. The message alone could come from any other raise that
 * happened to share the words; the code alone is every plpgsql raise in the schema.
 */
export const RPC_CART_PAYING = "cart is being paid";
export const RPC_LINE_SENT = "line already sent";

export type LineRpcRefusal = "paying" | "sent";

export function lineRpcRefusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): LineRpcRefusal | null {
  if (!error || error.code !== "P0001") return null;
  if (error.message === RPC_CART_PAYING) return "paying";
  if (error.message === RPC_LINE_SENT) return "sent";
  return null;
}

/**
 * P2cy — the line RPC refused because the table is being PAID (a fresh settlement freeze, checked
 * under the cart's row lock). A DEFINITE non-write, like `CartClosedError`: the raise aborted the
 * transaction. The message is the diner's own freeze sentence (`addItem`'s pre-check), so a diner
 * who lost the race to the settlement reads the same words as one who didn't; staff map the type to
 * their `paying` code.
 */
export class CartPayingError extends Error {
  constructor() {
    super("Your table is paying — you can’t change the order while everyone pays");
    this.name = "CartPayingError";
  }
}
