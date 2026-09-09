"use server";
import { serviceClient } from "@mms/db/server";
import { counterPayInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import {
  COUNTER_PAY_REFUSAL_COPY,
  counterPayRefusal,
  type CounterPayRefusal,
} from "./counter-pay-state";
import { getCartOrderId } from "./order";

/**
 * A1 — the diner's "Pay at the counter" ask, and its withdrawal.
 *
 * Both are member-authorized cart writes (`assertCartMember`: a verified seat in this active
 * session, the same gate every cart mutation passes). The rules are `counterPayRefusal`'s; this
 * file only applies them and performs the ONE write each, status-guarded IN the statement and
 * verified by row count (`.update()` alone reports success on zero rows — CLAUDE.md, W17).
 *
 * The write carries no freeze predicate of its own beyond `status = 'open'`, and that is a
 * decision, not an omission: `counter_requested_at` is an ASK. It is read by the floor and by the
 * Bill, and by nothing that moves money — `settleCash` / the Terminal re-derive the live total and
 * take their own freeze — so a stamp landing a beat after a lock is a stale sentence on a chip,
 * not a wrong charge. The lock still refuses at the top (a table mid-card-payment should not be
 * told to walk to the register), it just does not need to be atomic with the stamp.
 */
export type CounterPayResult =
  | { ok: true; counterRequestedAt: string | null }
  | { ok: false; reason: CounterPayRefusal | "closed" | "error"; error: string };

const CLOSED = "This order’s already settled — there’s nothing left to pay.";
const OUTAGE = "Couldn’t reach the counter just now — please try again.";

function fromAuthz(e: unknown): CounterPayResult {
  if (e instanceof AuthzError && (e.code === "cart_closed" || e.code === "no_cart"))
    return { ok: false, reason: "closed", error: CLOSED };
  // Transport failures and a lost session both land here: the honest answer is "try again", never
  // a fabricated verdict about the table (M116's fabricated-diagnosis class).
  return { ok: false, reason: "error", error: OUTAGE };
}

export async function requestCounterPay(raw: unknown): Promise<CounterPayResult> {
  const parsed = counterPayInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error", error: OUTAGE };
  const { cartId } = parsed.data;
  let authz: Awaited<ReturnType<typeof assertCartMember>>;
  try {
    authz = await assertCartMember(cartId);
  } catch (e) {
    return fromAuthz(e);
  }
  const db = serviceClient();
  // W10b — a failed count is not an EMPTY table. Refusing the ask on "nothing to settle" over a
  // full order would be the false verdict, so an unreadable count is an outage, not `empty`.
  const { count, error: countError } = await db
    .from("qr_cart_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cartId);
  if (countError) return { ok: false, reason: "error", error: OUTAGE };
  const refusal = counterPayRefusal({
    mode: authz.mode,
    locked: authz.locked,
    settling: authz.settling,
    itemCount: count ?? 0,
  });
  if (refusal) return { ok: false, reason: refusal, error: COUNTER_PAY_REFUSAL_COPY[refusal] };

  const now = new Date().toISOString();
  // Re-asking is idempotent and keeps the FIRST stamp: the floor sorts the longest-waiting ask
  // first, and a second tap must not push a table back down the list. `is null` makes the
  // no-op a zero-row update, which the read below turns back into the live value.
  const { data: rows, error } = await db
    .from("qr_carts")
    .update({ counter_requested_at: now })
    .eq("id", cartId)
    .eq("status", "open")
    .is("counter_requested_at", null)
    .select("id");
  if (error) return { ok: false, reason: "error", error: OUTAGE };
  if (rows && rows.length > 0) return { ok: true, counterRequestedAt: now };
  // Zero rows: either already asked (fine) or the cart closed between authz and the write.
  const { data: cart, error: readError } = await db
    .from("qr_carts")
    .select("status,counter_requested_at")
    .eq("id", cartId)
    .maybeSingle();
  if (readError || !cart) return { ok: false, reason: "error", error: OUTAGE };
  if (cart.status !== "open") return { ok: false, reason: "closed", error: CLOSED };
  return { ok: true, counterRequestedAt: cart.counter_requested_at };
}

export async function withdrawCounterPay(raw: unknown): Promise<CounterPayResult> {
  const parsed = counterPayInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error", error: OUTAGE };
  const { cartId } = parsed.data;
  try {
    await assertCartMember(cartId);
  } catch (e) {
    return fromAuthz(e);
  }
  // No freeze check: taking an ask BACK never needs to wait for anything — a table that started a
  // card payment after asking has, by that act, changed its mind, and the stamp should follow.
  const { error } = await serviceClient()
    .from("qr_carts")
    .update({ counter_requested_at: null })
    .eq("id", cartId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, reason: "error", error: OUTAGE };
  // Zero rows here means "already null" or "already settled" — both leave the ask withdrawn.
  return { ok: true, counterRequestedAt: null };
}

/**
 * What became of this cart, for a Bill that just lost its read (`getCartView` answers `cart_closed`
 * the moment the register settles). The diner's screen needs to know whether to leave for the
 * receipt or stay put — and "the read failed" alone cannot tell a settle from a blip.
 *
 * `paid` carries the order id only when the CALLER may see that order (`getCartOrderId`, member-
 * gated); a paid cart whose order this seat cannot read reports `paid` with `orderId: null`, and
 * the caller shows the plain "settled at the counter" close rather than a tracker it cannot load.
 */
export type CounterPayOutcome =
  | { kind: "open" }
  | { kind: "paid"; orderId: string | null }
  | { kind: "gone" }
  | { kind: "unknown" };

export async function counterPayOutcome(raw: unknown): Promise<CounterPayOutcome> {
  const parsed = counterPayInput.safeParse(raw);
  if (!parsed.success) return { kind: "unknown" };
  const { cartId } = parsed.data;
  const { data: cart, error } = await serviceClient()
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  if (error) return { kind: "unknown" };
  if (!cart) return { kind: "gone" };
  if (cart.status === "open") return { kind: "open" };
  if (cart.status !== "paid") return { kind: "gone" };
  const orderId = await getCartOrderId(cartId).catch(() => null);
  return { kind: "paid", orderId };
}
