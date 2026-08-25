import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M119a — `openTab`'s payment-in-flight guard FAILED OPEN.
 *
 * Opening a tab is a cart mutation, so it waits behind the same mutex every other one does. The guard
 * reads the cart and asks `paymentInFlightReason`:
 *
 *     const { data: payCart } = await db.from("qr_carts").select(…).eq("id", cartId).maybeSingle();
 *     if (await paymentInFlightReason(payCart)) return { ok: false, error: "Someone's paying right now…" };
 *
 * The `{ error }` was DISCARDED. On a failed read `payCart` is null, and `paymentInFlightReason(null)`
 * returns null by DELIBERATE contract (`pay-guard.ts:38`, pinned by `pay-guard.test.ts`) — null means
 * "there is no cart", not "we could not tell". So the refusal was not merely mis-worded, it was
 * SKIPPED: a tab opens on a cart whose card is mid-authorization.
 *
 * ── Why this is a different class from M116, and worse ─────────────────────────────────────────
 * M116 was a true refusal with a false SENTENCE. This is a refusal that does not happen — a wrong
 * OUTCOME on a money path. Nothing downstream re-checks: `mms_open_tab` gates on the cart being open,
 * which it still is during an authorization.
 *
 * ── Why the fix belongs HERE and not in `paymentInFlightReason` ────────────────────────────────
 * All NINE call sites were read. Eight already refuse an unreadable or absent cart BEFORE calling —
 * `floor.ts:457-469` and `approvals.ts`/`voids.ts` bind `cartError` and return an outage, `staff-cart.ts`
 * and `terminal.ts` go through `openCartFor`'s `unavailable`/`!cart` branches, and `approvals.ts:170`
 * spells it `if (cart && …)`. `openTab` was the only one that passed a possibly-null cart from a read
 * whose error it never bound. So the guard's null contract is not the defect; one caller not honouring
 * it is. Changing that contract would edit nine sites and break a deliberately-tested one.
 *
 * ── What each case is for ───────────────────────────────────────────────────────────────────────
 *   1. an unreadable cart must REFUSE, and must not claim to know a payment is in flight  ← the defect
 *   2. a genuine in-flight payment still gets the specific, true sentence
 *   3. a clear cart still opens the tab — the fail-closed must not cost the ordinary case
 *   4. the audit row must not record a NULL session for a read that failed (the quiet second symptom)
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const CART = "00000000-0000-0000-0000-0000001190cc";
const SESSION = "00000000-0000-0000-0000-000000119055";

let cartRow: { id: string; session_id: string; locked: boolean } | null = null;
let cartError: { message: string } | null = null;
let inFlight: string | null = null;
let rpcResult: { data: string | null; error: { message: string } | null } = {
  data: "opened",
  error: null,
};
let loggedEvents: { cartId: string; sessionId: string | null; event: string }[] = [];

vi.mock("@mms/db/schemas", () => ({
  openTabInput: { safeParse: (v: { cartId: string }) => ({ success: true, data: v }) },
}));
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller: { staffId: "s1" } }),
}));
vi.mock("./authz", () => ({
  assertCartMember: () => Promise.resolve({ uid: "u1" }),
  AuthzError: class extends Error {},
}));
vi.mock("./rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("./pay-guard", () => ({
  // The REAL contract, reproduced: a null cart resolves to null — "no cart", not "unknown".
  paymentInFlightReason: (c: unknown) => Promise.resolve(c ? inFlight : null),
}));
vi.mock("./tab-events", () => ({
  logTabEvent: (e: { cartId: string; sessionId: string | null; event: string }) => {
    loggedEvents.push(e);
    return Promise.resolve();
  },
}));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: cartRow, error: cartError }),
      };
      return chain;
    },
    rpc: () => Promise.resolve(rpcResult),
  }),
}));

const { openTab } = await import("./tabs");

beforeEach(() => {
  cartRow = { id: CART, session_id: SESSION, locked: false };
  cartError = null;
  inFlight = null;
  rpcResult = { data: "opened", error: null };
  loggedEvents = [];
});

describe("M119a — openTab's payment mutex must fail CLOSED", () => {
  it("1. THE DEFECT — an unreadable cart must refuse, not skip the guard", async () => {
    cartRow = null;
    cartError = { message: "transport failure" };
    const res = await openTab({ cartId: CART });
    expect(res.ok).toBe(false);
    // …and it must not assert a payment IS in flight — it doesn't know that either.
    if (!res.ok)
      expect(res.error).not.toBe("Someone’s paying right now — try the tab again in a moment.");
  });

  it("2. a genuine in-flight payment still gets the true, specific sentence", async () => {
    inFlight = "mid_payment";
    const res = await openTab({ cartId: CART });
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.error).toBe("Someone’s paying right now — try the tab again in a moment.");
  });

  it("3. a clear cart still opens the tab — failing closed must not cost the ordinary case", async () => {
    const res = await openTab({ cartId: CART });
    expect(res).toEqual({ ok: true });
  });

  it("4. a failed read never writes an audit row with a null session", async () => {
    cartRow = null;
    cartError = { message: "transport failure" };
    await openTab({ cartId: CART });
    expect(loggedEvents).toHaveLength(0);
  });
});
