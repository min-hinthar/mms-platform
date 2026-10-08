import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD2 (the owner, PATH_DESIGN_2026-10-07 decision 2) — the dine-in phone-pay door is PARKED until
 * live keys, and a parked door is parked only where it is ANSWERED (lib/surfaces): the Bill draws
 * no card hero, and THIS route — directly POST-able with the button gone — refuses the mint.
 *
 * What this file pins, and why each case exists:
 *   1. a dine-in cart with the door parked is refused (410, the house's sentence), the lock this
 *      attempt took is released under ITS era, and nothing past the door is spent on it — no
 *      availability read, no promo pin, no Stripe call. MUTATION (surfaces/create-intent-route-
 *      answers-open): delete the refusal and a table on TEST keys mints a PaymentIntent; red.
 *   2. the door's ORDER (PATH_DESIGN round 3 D5; #257's CRITICAL, M151): the refusal runs only
 *      AFTER `supersedeCartIntent` has finished — the call order is asserted on the spies, and
 *      `scripts/check-phone-pay-door.mjs` pins the same fact structurally in the source.
 *   3. a supersede that answers `captured` or `unknown` exits BEFORE the door and keeps the lock —
 *      the parked refusal must never run above those exits, because it frees the lock and freeing
 *      it under a chargeable predecessor is the double-charge M151 closed.
 *   4. the flip: the same dine-in cart with the door open mints — the refusal reads the switch and
 *      nothing else changes.
 *   5. a pickup cart never reads the switch (paying IS ordering): parked or not, it goes through.
 *
 * The route's other gates are mocked at their module seams (authz, the rate limit, the lock, the
 * supersede, totals, Stripe), each answering its happy value, so the only thing that decides each
 * verdict here is the door and its order. The database client is a SCRIPTED PostgREST: every
 * builder method returns the builder and the awaited answer is keyed by table and operation.
 */

vi.mock("server-only", () => ({}));

const SESSION = "00000000-0000-0000-0000-00000000pd2a";
const CART = "00000000-0000-0000-0000-00000000pd2c";
const UID = "seat-pd2";
const ERA = "2026-10-08T10:00:00.000Z";

/** The session row the route reads (mode fails closed above the door; the door reads the mode). */
let sessionRow: { mode: string; host_seat: string | null } = { mode: "dinein", host_seat: "h" };
let phonePayOpen = false;
let supersedeAnswer: "cleared" | "captured" | "unknown" = "cleared";

const h = vi.hoisted(() => ({
  release: vi.fn(),
  supersede: vi.fn(),
  availability: vi.fn(),
  create: vi.fn(),
  pin: vi.fn(),
}));

vi.mock("@mms/db/schemas", () => ({
  createIntentInput: {
    parse: (v: { cartId: string; tipRate?: number }) => ({
      cartId: v.cartId,
      tipRate: v.tipRate ?? 0,
      firstName: undefined,
      phone: undefined,
    }),
  },
}));
vi.mock("@/lib/authz", () => ({
  AuthzError: class AuthzError extends Error {
    status = 403;
  },
  assertCartMember: () => Promise.resolve({ sessionId: SESSION, uid: UID, settling: false }),
}));
vi.mock("@/lib/rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("@/lib/lock", () => ({
  acquireCartLock: () => Promise.resolve({ result: "acquired", era: ERA }),
  releaseCartLockFor: (...a: unknown[]) => {
    h.release(...a);
    return Promise.resolve(null);
  },
  releasePromoGrantFor: () => Promise.resolve(null),
  linkPaymentIntent: () => Promise.resolve({ linked: true, error: null }),
}));
vi.mock("@/lib/supersede", () => ({
  supersedeCartIntent: (...a: unknown[]) => {
    h.supersede(...a);
    return Promise.resolve(supersedeAnswer);
  },
}));
vi.mock("@/lib/availability-read", () => ({
  unavailableLineNames: (...a: unknown[]) => {
    h.availability(...a);
    return Promise.resolve([]);
  },
}));
vi.mock("@/lib/unsent-read", () => ({ kitchenDraftUnits: () => Promise.resolve(0) }));
vi.mock("@/lib/totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 1200,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 1200,
    }),
}));
vi.mock("@/lib/manual-capture", () => ({ manualCaptureMode: () => false }));
vi.mock("@/lib/tip", () => ({ tipWithinAmountCap: () => true }));
vi.mock("@/lib/pickup-contact", () => ({ pickupContactMissing: () => null }));
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (...a: unknown[]) => {
        h.create(...a);
        return Promise.resolve({ id: "pi_pd2", client_secret: "pi_pd2_secret" });
      },
      cancel: () => Promise.resolve({}),
    },
  }),
}));
// The switch under test. Every OTHER surface answers open so no unrelated parking interferes.
vi.mock("@/lib/surfaces", () => ({
  surfaceOpen: (k: string) => (k === "dineInPhonePay" ? phonePayOpen : true),
}));

/**
 * A scripted PostgREST: the builder records the table and the operation, every method returns it,
 * and awaiting it (or its terminal `single` / `maybeSingle`) answers by table. Only the rows this
 * route reads on the paths under test are scripted; an unexpected read answers an empty success.
 */
function builder(table: string) {
  let op: "select" | "update" | "insert" = "select";
  const answer = () => {
    if (table === "table_sessions") return { data: sessionRow, error: null };
    if (table === "qr_carts" && op === "select")
      return { data: { pickup_slot: null, fire_at: null }, error: null };
    if (table === "qr_carts" && op === "update") return { data: [{ id: CART }], error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "neq", "in", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      if (m === "select" && op === "select" && typeof args[0] === "string") {
        /* the projection; nothing to record */
      }
      return b;
    };
  }
  b.update = () => {
    op = "update";
    return b;
  };
  b.insert = () => {
    op = "insert";
    return b;
  };
  b.single = () => Promise.resolve(answer());
  b.maybeSingle = () => Promise.resolve(answer());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(answer()).then(res, rej);
  return b;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => builder(table),
    rpc: (name: string) => {
      if (name === "mms_pin_promo_grant") h.pin(name);
      if (name === "mms_pickup_asap") return Promise.resolve({ data: [{ ok: true }], error: null });
      if (name === "mms_pickup_slots") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

import { POST } from "./route";

function req(cartId = CART) {
  return { json: () => Promise.resolve({ cartId, tipRate: 0 }) } as unknown as Parameters<
    typeof POST
  >[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionRow = { mode: "dinein", host_seat: "h" };
  phonePayOpen = false;
  supersedeAnswer = "cleared";
});

describe("PD2 — the parked dine-in phone-pay door is ANSWERED at create-intent", () => {
  it("1. a dine-in cart with the door parked: 410, the lock released under this era, nothing spent past the door", async () => {
    const res = await POST(req());
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(
      "Paying on your phone isn’t on at the table yet — pay at the counter, and they’ll settle the whole bill there.",
    );
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledWith(CART, UID, ERA);
    expect(h.availability).not.toHaveBeenCalled();
    expect(h.pin).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("2. the door runs only AFTER the supersede has finished (D5's order)", async () => {
    await POST(req());
    expect(h.supersede).toHaveBeenCalledTimes(1);
    expect(h.supersede).toHaveBeenCalledWith(CART);
    const supersededAt = h.supersede.mock.invocationCallOrder[0]!;
    const releasedAt = h.release.mock.invocationCallOrder[0]!;
    expect(supersededAt).toBeLessThan(releasedAt);
  });

  it("3. a predecessor that captured, or could not be read, exits before the door and KEEPS the lock (M151)", async () => {
    supersedeAnswer = "captured";
    let res = await POST(req());
    expect(res.status).toBe(409);
    expect(h.release).not.toHaveBeenCalled();
    supersedeAnswer = "unknown";
    res = await POST(req());
    expect(res.status).toBe(503);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("4. the flip: the same cart with the door OPEN mints", async () => {
    phonePayOpen = true;
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clientSecret: string; attempt: string };
    expect(body.clientSecret).toBe("pi_pd2_secret");
    expect(body.attempt).toBe(ERA);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.release).not.toHaveBeenCalled();
  });

  it("5. a pickup cart never reads the switch — parked, it still goes through (paying IS ordering)", async () => {
    sessionRow = { mode: "pickup", host_seat: null };
    const res = await POST(req());
    expect(res.status).not.toBe(410);
    expect(h.availability).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
