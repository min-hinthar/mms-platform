import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M160(b) — the two people-facing doors. What each one binds, what it bounds, and what it never
 * asks Stripe for. The recovery itself is mocked: its rules are pinned in payment-recovery.test.ts
 * and payment-recovery-verdict.test.ts; this suite pins the AUTHORITY each door passes into it.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidated.push(p) }));

let user: { id: string } | null = { id: "guest-uid" };
let authError: { message: string; status?: number; name?: string } | null = null;
let order: { id: string; earned_by: string | null } | null = null;
let linkedCart: { id: string; live_payment_intent_id?: string | null } | null = null;
let readError: { message: string } | null = null;
const eqs: [string, unknown][] = [];
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user }, error: authError }) },
  }),
  serviceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          eqs.push([col, v]);
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: readError ? null : table === "qr_orders" ? order : linkedCart,
            error: readError,
          }),
      };
      return chain;
    },
  }),
}));

let transport = false;
vi.mock("./authz", () => ({ isTransportFailure: () => transport }));

let gateOk = true;
vi.mock("./staff", () => ({
  staffGate: () =>
    Promise.resolve(gateOk ? { ok: true, caller: { role: "server" } } : { ok: false, error: "no" }),
}));

let uidRateOk = true;
let cartRateOk = true;
const rateKeys: string[] = [];
vi.mock("./rate", () => ({
  withinRecoverRate: (uid: string) => {
    rateKeys.push(`uid:${uid}`);
    return Promise.resolve(uidRateOk);
  },
  withinRecoverCartRate: (cartId: string) => {
    rateKeys.push(`cart:${cartId}`);
    return Promise.resolve(cartRateOk);
  },
}));

const recovered: { id: string; expect: unknown; via: string }[] = [];
let recoverAnswer: { kind: string } = { kind: "recorded" };
vi.mock("./payment-recovery", () => ({
  recoverIntent: (id: string, expect: unknown, via: string) => {
    recovered.push({ id, expect, via });
    return Promise.resolve(recoverAnswer);
  },
}));

const { recoverMyPayment, checkTablePayment } = await import("./payment-recovery-actions");

const CART = "66666666-6666-4666-8666-666666666666";
const SESSION = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  user = { id: "guest-uid" };
  authError = null;
  order = null;
  linkedCart = { id: CART };
  readError = null;
  eqs.length = 0;
  transport = false;
  gateOk = true;
  uidRateOk = true;
  cartRateOk = true;
  rateKeys.length = 0;
  recovered.length = 0;
  recoverAnswer = { kind: "recorded" };
  revalidated.length = 0;
});

describe("recoverMyPayment — the guest's door on /track", () => {
  it("binds the recovery to the cart that LINKS the intent and to the caller's own uid", async () => {
    const out = await recoverMyPayment({ paymentIntent: "pi_abc" });
    expect(out).toEqual({ kind: "recorded" });
    expect(eqs).toContainEqual(["live_payment_intent_id", "pi_abc"]);
    expect(recovered).toEqual([
      { id: "pi_abc", expect: { cartId: CART, payerUid: "guest-uid" }, via: "track" },
    ]);
  });

  it("the caller's OWN order already on record answers recorded WITHOUT asking Stripe", async () => {
    order = { id: "o-1", earned_by: "guest-uid" };
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "recorded" });
    expect(recovered).toEqual([]);
  });

  // M160(b) blind pass on #365 @ 1b760cb — the short-circuit read is keyed on the PI id alone, so
  // answering `recorded` from it before any binding told ANY signed-in caller whether a PaymentIntent
  // id they hold has an order. Only the caller's own order short-circuits; anyone else's falls
  // through to the bound recovery (the cart link, then the verdict's payer check), which refuses.
  it.each([
    ["someone else's", "another-uid"],
    ["an unattributed (cash/staff)", null],
  ])(
    "%s order on record is NOT answered from the read — it goes through the bound recovery",
    async (_l, earnedBy) => {
      order = { id: "o-1", earned_by: earnedBy };
      recoverAnswer = { kind: "refused" };
      expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "refused" });
      expect(recovered).toEqual([
        { id: "pi_abc", expect: { cartId: CART, payerUid: "guest-uid" }, via: "track" },
      ]);
    },
  );

  it("no cart links the intent: nothing — a guest door never fulfills an unlinked intent", async () => {
    linkedCart = null;
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "nothing" });
    expect(recovered).toEqual([]);
  });

  it("is bounded per caller BEFORE any read, and per cart before Stripe", async () => {
    uidRateOk = false;
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "wait" });
    expect(eqs).toEqual([]);
    uidRateOk = true;
    cartRateOk = false;
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "wait" });
    expect(rateKeys).toContain(`cart:${CART}`);
    expect(recovered).toEqual([]);
  });

  it("no session is refused; an auth OUTAGE is an error, not a refusal (W10a)", async () => {
    user = null;
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "refused" });
    authError = { message: "fetch failed" };
    transport = true;
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "error" });
    expect(recovered).toEqual([]);
  });

  it.each([{}, { paymentIntent: "ch_123" }, { paymentIntent: `pi_${"a".repeat(260)}` }, null])(
    "refuses a malformed ask %#",
    async (raw) => {
      expect(await recoverMyPayment(raw)).toEqual({ kind: "refused" });
      expect(recovered).toEqual([]);
    },
  );

  it("an unreadable order or cart is an error, never a fulfillment", async () => {
    readError = { message: "timeout" };
    expect(await recoverMyPayment({ paymentIntent: "pi_abc" })).toEqual({ kind: "error" });
    expect(recovered).toEqual([]);
  });
});

describe("checkTablePayment — staff's Check payment", () => {
  it("is staff-authorized: no staff gate, no check", async () => {
    gateOk = false;
    expect(await checkTablePayment({ sessionId: SESSION })).toEqual({ kind: "refused" });
    expect(recovered).toEqual([]);
  });

  it("checks the intent the table's OPEN cart links, asserting no payer", async () => {
    linkedCart = { id: CART, live_payment_intent_id: "pi_table" };
    const out = await checkTablePayment({ sessionId: SESSION });
    expect(out).toEqual({ kind: "recorded" });
    expect(eqs).toEqual([
      ["session_id", SESSION],
      ["status", "open"],
    ]);
    expect(recovered).toEqual([
      { id: "pi_table", expect: { cartId: CART, payerUid: null }, via: "staff" },
    ]);
    expect(revalidated).toContain(`/staff/table/${SESSION}`);
  });

  it("no linked intent: nothing to check, and Stripe is not asked", async () => {
    linkedCart = { id: CART, live_payment_intent_id: null };
    expect(await checkTablePayment({ sessionId: SESSION })).toEqual({ kind: "nothing" });
    expect(recovered).toEqual([]);
  });

  it("is bounded per cart before Stripe", async () => {
    linkedCart = { id: CART, live_payment_intent_id: "pi_table" };
    cartRateOk = false;
    expect(await checkTablePayment({ sessionId: SESSION })).toEqual({ kind: "wait" });
    expect(recovered).toEqual([]);
  });

  it("a not-paid answer revalidates nothing (nothing changed)", async () => {
    linkedCart = { id: CART, live_payment_intent_id: "pi_table" };
    recoverAnswer = { kind: "not_paid" };
    expect(await checkTablePayment({ sessionId: SESSION })).toEqual({ kind: "not_paid" });
    expect(revalidated).toEqual([]);
  });

  it("refuses a malformed session id", async () => {
    expect(await checkTablePayment({ sessionId: "nope" })).toEqual({ kind: "refused" });
    expect(recovered).toEqual([]);
  });
});
