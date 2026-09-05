"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { staffApplyPromoInput, staffClearPromoInput } from "@mms/db/schemas";
import { getStaffAuth } from "./staff";
import { openCartFor } from "./staff-open-cart";
import { paymentInFlightReason } from "./pay-guard";
import { refusedPromoReason } from "./promo-refusal";
import { withinStaffPromoRate } from "./rate";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import { getPostHogClient } from "./posthog-server";

/**
 * P3 — the SECOND door onto `qr_carts.promo_code`, and the FIRST one that can close it again.
 *
 * Until this module, `applyPromo` (lib/cart.ts) was the only writer of that column in the app, it
 * only ever wrote a non-empty code, and it was reachable only from the diner's own Checkout. Two
 * things follow, and this module is both of them:
 *
 *   1. **Dad cannot apply the pilot code.** PILOT_PLAN §5 has a table typing `PILOT15` at checkout
 *      and then paying CASH at the counter — a settle that never opens Checkout. Without a staff
 *      apply the incentive only reaches guests who both have the app open and finish on their own
 *      phone, which is not the pilot that was designed.
 *   2. **A promo can never be REMOVED** (OPEN-ITEMS P2e), while `lib/floor.ts` refuses a table merge
 *      with "remove it before merging" — naming an action the product did not implement, so that
 *      merge was refused permanently. P3 makes that much worse by putting a code on every table, so
 *      the remove ships in the same PR as the apply. `clearPromoForTable` is that action.
 *
 * ## The five predicates are not optional, and they are not a style choice
 *
 * Both writes carry `applyPromo`'s FULL predicate set — status, the TTL-aware pay lock, the TTL-aware
 * settlement freeze, and `live_payment_intent_id is null` — because the pin (`promo_granted_cents`)
 * is what a captured charge reconciles against. `mms_promo_discount` returns that pin VERBATIM when
 * it is set (M70), so nulling it beside a code change on a cart some intent is still live on charges
 * an amount fulfillment can no longer re-derive: a charged card and no order. That hazard is
 * IDENTICAL for a remove — arguably worse, since a remove RAISES the amount the webhook re-derives —
 * which is why P2e names the link gate explicitly. `applyPromo`'s own comments carry the full
 * archaeology (M70 · M152 a); read them before touching either statement here.
 *
 * ## Row counts, and why NOT `.select("id")`
 *
 * `.update()` returns no row count, so a blocked write reports success (the W17 lesson). The count
 * comes from `{ count: "exact" }` and deliberately NOT from `.select("id")`: a mutation with
 * `.select()` asks PostgREST for `return=representation`, and PostgREST 14 re-applies the top-level
 * `or()` against the RETURNING projection — with only `id` in scope `locked` falls out and the whole
 * UPDATE 400s with 42703. That outage is documented at `lock.ts:66-73`, where it once gave every
 * checkout a spurious 409. `{ count: "exact" }` reads the affected-row count off Content-Range with
 * no re-projection, which is the row-count check P2e asks for, taken the way this codebase has
 * already learned to take it.
 *
 * ## Why a REASON enum rather than a rendered sentence
 *
 * The six staff server modules return English `error: "…"` strings, and OPEN-ITEMS P2c defers
 * converting them because doing so changes a plain-string contract across an auth path. This module
 * is NEW, so it inherits no such debt: it returns a stable reason the RENDER SITE maps to a
 * bilingual twin — the `<OutageText>` pattern, and the same contract the diner's `applyPromo`
 * already uses. That matters here specifically: the person applying this code at the register reads
 * Burmese, and a refusal he cannot read is the pilot failing at the one surface it exists to test.
 */

/**
 * Everything that can stop a staff promo write, as a stable key.
 *
 * `invalid` … `session_limit` arrive VERBATIM from `mms_promo_check` — the single validity/caps gate,
 * shared with the diner path — so this union must stay a superset of that function's `reason` values.
 * The rest are this door's own: the two auth outcomes, the caller-scoped rate gate, the two
 * resolve failures, and the three the shared `refusedPromoReason` diagnosis can return.
 */
export type StaffPromoReason =
  | "invalid"
  | "inactive"
  | "not_started"
  | "expired"
  | "min_not_met"
  | "exhausted"
  | "session_limit"
  | "outage"
  | "signin"
  | "rate_limited"
  | "table_closed"
  | "no_order"
  | "cart_closed"
  | "locked"
  | "error";

export type StaffPromoResult = { ok: true } | { ok: false; reason: StaffPromoReason };

const no = (reason: StaffPromoReason): StaffPromoResult => ({ ok: false, reason });

/**
 * The gate, four ways — `getStaffAuth` rather than `staffGate`, deliberately.
 *
 * `staffGate` collapses its three refusals into one pre-rendered ENGLISH sentence, which is exactly
 * the contract this module does not want (see the docblock). `getStaffAuth` is the primitive it is
 * built on and it keeps the W10b discriminant intact, so an outage stays an outage — never "go sign
 * in", the loop that ends in a destroyed board mid-service.
 *
 * No role floor: applying or removing a promo is routine service, like `clearTable`, not a loss
 * action like a void. Any ACTIVE staff member may do it. (`staffGate`'s role arm is therefore not a
 * refusal this module can produce, which is why `StaffPromoReason` has no `role` member.)
 */
async function staffOrReason(): Promise<
  { ok: true; staffId: string; role: string } | { ok: false; reason: StaffPromoReason }
> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "signin" };
  return { ok: true, staffId: auth.caller.staffId, role: auth.caller.role };
}

/** Both writes re-test the freeze in the SAME statement that writes; these are its cutoffs. */
const freezeCutoffs = () => ({
  lockCutoff: new Date(Date.now() - CART_LOCK_TTL_MS).toISOString(),
  settleCutoff: new Date(Date.now() - SETTLE_TTL_MS).toISOString(),
});

/**
 * Apply a promo code to a table's open order, as staff (P3).
 *
 * Addressed by SESSION: the caller is authorized against the table they are standing at, and the
 * cart is resolved from it server-side. A cart id in the request would let one staff POST reach any
 * other table's order — the same reason `clearTable` and `settleCash` take a session id.
 *
 * The code itself is never trusted: `mms_promo_check` is the single gate (active · window ·
 * min-subtotal · global cap · per-session cap) and it PRICES the quote too. The quote is used ONLY
 * to decide ok-or-refuse — never rendered as the delivered discount, because the two are allowed to
 * differ by TWO mechanisms the quote cannot see:
 *
 *   1. THE PIN. `mms_promo_discount` returns `promo_granted_cents` verbatim whenever it is non-null
 *      (M70) and only then falls through to the live derivation; `mms_promo_check` never reads it.
 *      On a cart carrying an authorized grant the charge is the pin and the quote is not.
 *   2. THE REWARD-FIRST CLAMP. `computeTotals` applies
 *      `min(promoRaw, max(subtotal − reward, 0))` (M22), so a Morning Star reward covering the
 *      basket takes the delivered promo to 0 while the quote stays whole. The RPC knows nothing
 *      about rewards.
 *
 * (Their subtotals do NOT differ: since `20260622060000_voids_comps.sql` both `mms_promo_check` and
 * `mms_promo_discount_live` exclude voided and comped lines with the same predicate. Checked in the
 * SQL, because an earlier draft of this comment asserted the opposite and a wrong mechanism is worse
 * than none — it is the mechanism the next reader acts on.)
 *
 * The delivered figure is `getCartTotals().promoCents`, which is what the drill-down shows and what
 * the settle charges.
 */
export async function applyPromoForTable(raw: unknown): Promise<StaffPromoResult> {
  const gate = await staffOrReason();
  if (!gate.ok) return no(gate.reason);

  const parsed = staffApplyPromoInput.safeParse(raw);
  // A malformed code cannot be a valid one, and `invalid` is the sentence staff needs either way —
  // there is no honest second verdict for "that is not a code shape we accept".
  if (!parsed.success) return no("invalid");
  const { sessionId, code } = parsed.data;

  // Anti-enumeration, keyed by the CALLER. A Server Action is a public POST, so a stolen staff
  // cookie is all a code-space scan needs. Deliberately NOT the diner's session-keyed
  // `mms_promo_attempt` budget: spending that would let a guest who fat-fingers ten codes on their
  // own phone disable the register's apply for five minutes — see STAFF_PROMO_RATE.
  if (!(await withinStaffPromoRate(gate.staffId))) return no("rate_limited");

  const { session, cart, unavailable } = await openCartFor(sessionId);
  // W10b — a failed read is not a cleared table. Refusing with the outage truth beats telling a
  // server standing at a live table that it is gone.
  if (unavailable) return no("outage");
  if (!session) return no("table_closed");
  if (!cart) return no("no_order");

  // The fast, HONEST pre-check (parity with settleCash): it names the situation before the write
  // does, and it catches the one state the UPDATE's predicates cannot see — a split share already
  // authorized or captured on a cart whose settlement freeze has gone stale. The predicates below
  // are still the race-closing claim; this is the readable refusal.
  if (await paymentInFlightReason(cart)) return no("locked");

  const db = serviceClient();
  const { data: rows, error: chkErr } = await db.rpc("mms_promo_check", {
    p_code: code,
    p_cart_id: cart.id,
  });
  if (chkErr) return no("error");
  const check = rows?.[0];
  if (!check?.valid) return no((check?.reason ?? "invalid") as StaffPromoReason);

  const normalized = code.toUpperCase();
  const { lockCutoff, settleCutoff } = freezeCutoffs();
  const { count, error: updErr } = await db
    .from("qr_carts")
    // M70 — a new code voids any grant pinned for the OLD one, in the SAME statement as the code
    // write so the two cannot drift apart (`mms_pin_promo_grant` only pins when null, so a stale
    // grant left here would silently outrank the code just applied).
    .update({ promo_code: normalized, promo_granted_cents: null }, { count: "exact" })
    .eq("id", cart.id)
    .eq("status", "open")
    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)
    .is("live_payment_intent_id", null);
  if (updErr) return no("error");
  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id));

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${gate.staffId}`,
          event: "staff_promo_applied",
          properties: {
            role: gate.role,
            mode: session.mode,
            sessionId,
            promo_code: normalized,
            // The QUOTE, not the outcome — same caveat as the diner event. A reward, a void or a
            // comp landing afterwards all move what is actually delivered, and M22's reward-first
            // clamp can take it to 0. The delivered figure rides `staff_settle_cash` /
            // `payment_succeeded`, the events fulfillment consumes a redemption on.
            discount_cents: check.discount_cents,
          },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail an applied promo on a capture error */
      }
    });
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/**
 * Remove the promo code from a table's open order, as staff (OPEN-ITEMS P2e).
 *
 * ## Why the pin goes in the SAME payload
 *
 * `mms_promo_discount` returns `promo_granted_cents` VERBATIM whenever it is non-null and only falls
 * through to the live derivation when it is null (M70). Clearing `promo_code` alone would therefore
 * leave the pinned discount in force with no code behind it — a discount nothing on any surface can
 * explain, surviving until the cart closes. Both columns are nulled in one statement for the same
 * reason `applyPromo` writes both in one: two statements can drift, one cannot.
 *
 * ## Why the link gate is on a REMOVE too
 *
 * A remove looks like the safe direction and is not. If an intent is live, its hold was authorized
 * at an amount that INCLUDED the discount; dropping the code and the pin makes the webhook re-derive
 * a HIGHER total than the amount captured, and the reconcile refuses — a charged card with no order,
 * the same M152 (a) hazard as an apply, reached from the other side.
 *
 * ## Deliberately idempotent, and deliberately NOT rate-limited
 *
 * No `promo_code is not null` predicate: a second tap must not answer a refusal, and the honest
 * answer to "nothing to remove" is a no-op, not a fabricated `cart_closed` from the diagnosis read.
 * And no rate gate — unlike the apply, a remove carries no guessable secret, so there is nothing to
 * enumerate; it is also the RECOVERY path the merge refusal points at, and a staff member locked out
 * of removing a promo would be locked out of merging the table too. Over-blocking is as expensive as
 * under-blocking (the delivery repo's gate lesson, and this repo's tip-cap one). `clearTable` and
 * `settleCash` are unbounded for the same reason: the caller is an authenticated staff member.
 */
export async function clearPromoForTable(raw: unknown): Promise<StaffPromoResult> {
  const gate = await staffOrReason();
  if (!gate.ok) return no(gate.reason);

  const parsed = staffClearPromoInput.safeParse(raw);
  if (!parsed.success) return no("error");
  const { sessionId } = parsed.data;

  const { session, cart, unavailable } = await openCartFor(sessionId);
  if (unavailable) return no("outage");
  if (!session) return no("table_closed");
  if (!cart) return no("no_order");
  if (await paymentInFlightReason(cart)) return no("locked");

  const db = serviceClient();
  const { lockCutoff, settleCutoff } = freezeCutoffs();
  const { count, error: updErr } = await db
    .from("qr_carts")
    .update({ promo_code: null, promo_granted_cents: null }, { count: "exact" })
    .eq("id", cart.id)
    .eq("status", "open")
    .or(`locked.eq.false,locked_at.is.null,locked_at.lte.${lockCutoff}`)
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`)
    .is("live_payment_intent_id", null);
  if (updErr) return no("error");
  if ((count ?? 0) === 0) return no(await refusedPromoReason(cart.id));

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${gate.staffId}`,
          event: "staff_promo_cleared",
          properties: { role: gate.role, mode: session.mode, sessionId },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail a cleared promo on a capture error */
      }
    });
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}
