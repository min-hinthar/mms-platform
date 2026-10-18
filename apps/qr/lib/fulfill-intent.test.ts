import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M160(b) — the ONE fulfillment of a succeeded single-pay intent, pinned by values.
 *
 * This is the webhook's generic `payment_intent.succeeded` arm, moved to `lib/` so the
 * stranded-payment recovery runs the same code. Before the move it had no mutant at all (the route
 * is `verify:slice-exempt`), so every rule below was revertible with every gate green. Each case
 * names the money rule it holds; the fixtures are chosen so the two paths a mutant would merge
 * produce DIFFERENT numbers (a partial capture, a promo smaller than the combined discount).
 */
vi.mock("server-only", () => ({}));

const afterCalls: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterCalls.push(fn);
  },
}));

const captures: { event: string; properties: Record<string, unknown> }[] = [];
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({
    capture: (c: { event: string; properties: Record<string, unknown> }) => captures.push(c),
    flush: () => Promise.resolve(),
  }),
}));

const qboEnqueued: string[] = [];
vi.mock("./qbo/client", () => ({
  enqueueQboSync: (_db: unknown, orderId: string) => {
    qboEnqueued.push(orderId);
    return Promise.resolve();
  },
  syncOrderToQbo: () => Promise.resolve({}),
}));

const counterClosed: string[] = [];
vi.mock("./staff-open-cart", () => ({
  closeCounterStyleSession: (id: string) => {
    counterClosed.push(id);
    return Promise.resolve();
  },
}));

const tabEvents: Record<string, unknown>[] = [];
vi.mock("./tab-events", () => ({
  logTabEvent: (e: Record<string, unknown>) => {
    tabEvents.push(e);
    return Promise.resolve();
  },
}));

type Totals = {
  totalCents: number;
  subtotalCents: number;
  discountCents: number;
  promoCents: number;
  serviceChargeCents: number;
  taxCents: number;
  tipCents: number;
};
let totals: Totals;
let totalsThrows = false;
const totalsAsked: { cartId: string; tipRate: number }[] = [];
vi.mock("./totals", () => ({
  getCartTotals: (cartId: string, tipRate: number) => {
    totalsAsked.push({ cartId, tipRate });
    if (totalsThrows) return Promise.reject(new Error("cart unreadable"));
    return Promise.resolve(totals);
  },
}));

// ── the database ──
let existingOrder: { id: string } | null = null;
let existingError: { message: string } | null = null;
let cartRow: { status: string; tab_type: string; promo_code: string | null } | null = null;
let cartError: { message: string } | null = null;
let fulfillAnswer: { data: string | null; error: { message: string } | null } = {
  data: "order-1",
  error: null,
};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const upserts: Record<string, unknown>[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "mms_fulfill_order") return Promise.resolve(fulfillAnswer);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (table === "qr_orders")
              return Promise.resolve({ data: existingOrder, error: existingError });
            if (table === "qr_carts")
              return Promise.resolve({
                data: cartError ? null : { ...cartRow, session_id: "sess-1" },
                error: cartError,
              });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upserts.push({ table, ...row });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const { fulfillSucceededIntent } = await import("./fulfill-intent");

const CART = "11111111-1111-4111-8111-111111111111";
function intent(over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return {
    id: "pi_test_1",
    amount: 5200,
    amount_received: 5200,
    currency: "usd",
    status: "succeeded",
    metadata: { cartId: CART, tipRate: "0.18", earnerUid: "payer-1", ...meta },
    ...over,
  } as never;
}
const rpcsNamed = (fn: string) => rpcCalls.filter((c) => c.fn === fn);
async function drainAfter() {
  for (const fn of afterCalls.splice(0)) await fn();
}

beforeEach(() => {
  afterCalls.length = 0;
  captures.length = 0;
  qboEnqueued.length = 0;
  counterClosed.length = 0;
  tabEvents.length = 0;
  totalsAsked.length = 0;
  rpcCalls.length = 0;
  upserts.length = 0;
  totals = {
    totalCents: 5200,
    subtotalCents: 4600,
    discountCents: 800,
    promoCents: 300,
    serviceChargeCents: 0,
    taxCents: 500,
    tipCents: 900,
  };
  totalsThrows = false;
  existingOrder = null;
  existingError = null;
  cartRow = { status: "open", tab_type: "none", promo_code: null };
  cartError = null;
  fulfillAnswer = { data: "order-1", error: null };
});

describe("idempotency on the PaymentIntent id", () => {
  it("an order already on record answers already_recorded and fulfills NOTHING", async () => {
    existingOrder = { id: "order-0" };
    const out = await fulfillSucceededIntent(intent(), "track");
    expect(out).toEqual({ kind: "already_recorded", orderId: "order-0" });
    expect(rpcCalls).toEqual([]);
    expect(captures).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("an UNREADABLE order lookup is retry — never 'no order yet' (W10c M30)", async () => {
    existingError = { message: "timeout" };
    const out = await fulfillSucceededIntent(intent(), "webhook");
    expect(out).toEqual({ kind: "retry", step: "order_lookup" });
    expect(rpcsNamed("mms_fulfill_order")).toHaveLength(0);
  });
});

describe("the cross-tender guard (S1.3) — and M160's cancelled cart", () => {
  it.each(["cancelled", "paid"])(
    "a %s cart records a refund-needed row and writes NO order",
    async (status) => {
      cartRow = { status, tab_type: "none", promo_code: null };
      const out = await fulfillSucceededIntent(intent(), "cron");
      expect(out).toEqual({ kind: "settled_elsewhere", cartStatus: status });
      expect(rpcsNamed("mms_fulfill_order")).toHaveLength(0);
      expect(upserts).toEqual([
        {
          table: "qr_refunds_needed",
          payment_intent: "pi_test_1",
          cart_id: CART,
          amount_cents: 5200,
          reason: "card_after_settle",
        },
      ]);
      // Nothing downstream of an order runs either: no kitchen fire, no Stars, no QBO.
      await drainAfter();
      expect(rpcsNamed("mms_fire_pending_food")).toHaveLength(0);
      expect(rpcsNamed("mms_earn_on_fulfill")).toHaveLength(0);
      expect(qboEnqueued).toEqual([]);
    },
  );

  it("an UNREADABLE cart is retry, never a fulfillment past the guard (W10c M30)", async () => {
    cartError = { message: "connection reset" };
    const out = await fulfillSucceededIntent(intent(), "webhook");
    expect(out).toEqual({ kind: "retry", step: "cart_lookup" });
    expect(rpcsNamed("mms_fulfill_order")).toHaveLength(0);
    expect(upserts).toEqual([]);
  });

  it("a succeeded intent with no cartId writes nothing and says so", async () => {
    const out = await fulfillSucceededIntent(intent({ metadata: {} }), "webhook");
    expect(out).toEqual({ kind: "no_cart_metadata" });
    expect(rpcCalls).toEqual([]);
  });
});

describe("the reconcile — against what was CAPTURED (W23c)", () => {
  it("a re-derived total that disagrees records reconcile_mismatch and writes NO order", async () => {
    totals = { ...totals, totalCents: 5000 };
    const out = await fulfillSucceededIntent(intent(), "staff");
    expect(out).toEqual({ kind: "amount_mismatch", cartCents: 5000, capturedCents: 5200 });
    expect(rpcsNamed("mms_fulfill_order")).toHaveLength(0);
    expect(upserts).toEqual([
      {
        table: "qr_refunds_needed",
        payment_intent: "pi_test_1",
        cart_id: CART,
        amount_cents: 5200,
        reason: "reconcile_mismatch",
      },
    ]);
  });

  it("a PARTIAL capture reconciles on amount_received, and the order records that figure", async () => {
    // The hold was $60.00; the kitchen ran out of a dish and $52.00 was captured.
    const out = await fulfillSucceededIntent(
      intent({ amount: 6000, amount_received: 5200 }),
      "cron",
    );
    expect(out).toEqual({ kind: "fulfilled", orderId: "order-1" });
    const [call] = rpcsNamed("mms_fulfill_order");
    expect(call?.args.p_amount_cents).toBe(5200);
    expect(captures.find((c) => c.event === "payment_succeeded")?.properties.amount_cents).toBe(
      5200,
    );
  });

  it("a totals read that throws is retry, with nothing written", async () => {
    totalsThrows = true;
    const out = await fulfillSucceededIntent(intent(), "webhook");
    expect(out).toEqual({ kind: "retry", step: "totals" });
    expect(rpcsNamed("mms_fulfill_order")).toHaveLength(0);
    expect(upserts).toEqual([]);
  });

  it("re-derives at the tip rate the intent carries (the breakdown the charge was built from)", async () => {
    await fulfillSucceededIntent(intent(), "webhook");
    expect(totalsAsked).toEqual([{ cartId: CART, tipRate: 0.18 }]);
  });
});

describe("the fulfillment itself", () => {
  it("passes the breakdown, and the PROMO's own cents apart from the combined discount (M22)", async () => {
    await fulfillSucceededIntent(intent(), "webhook");
    expect(rpcsNamed("mms_fulfill_order")[0]?.args).toEqual({
      p_cart_id: CART,
      p_payment_intent: "pi_test_1",
      p_amount_cents: 5200,
      p_subtotal_cents: 4600,
      p_discount_cents: 800,
      p_promo_cents: 300,
      p_service_charge_cents: 0,
      p_tax_cents: 500,
      p_tip_cents: 900,
    });
  });

  it("a Terminal charge carries its tender and the staff member who ran it (W6c)", async () => {
    await fulfillSucceededIntent(
      intent({}, { kind: "terminal", settledByStaffId: "staff-9" }),
      "webhook",
    );
    const args = rpcsNamed("mms_fulfill_order")[0]?.args;
    expect(args?.p_tender).toBe("terminal");
    expect(args?.p_settled_by).toBe("staff-9");
    await drainAfter();
    expect(counterClosed).toEqual(["sess-1"]);
  });

  it("a failed mms_fulfill_order is retry — and none of an order's side effects run", async () => {
    fulfillAnswer = { data: null, error: { message: "cart is not open" } };
    const out = await fulfillSucceededIntent(intent(), "track");
    expect(out).toEqual({ kind: "retry", step: "fulfill" });
    await drainAfter();
    expect(rpcsNamed("mms_fire_pending_food")).toHaveLength(0);
    expect(rpcsNamed("mms_earn_on_fulfill")).toHaveLength(0);
    expect(rpcsNamed("mms_redeem_cart_reward")).toHaveLength(0);
    expect(captures).toEqual([]);
  });

  it("an order fires the kitchen, earns the payer's Star and redeems the reward — once", async () => {
    const out = await fulfillSucceededIntent(intent(), "webhook");
    expect(out).toEqual({ kind: "fulfilled", orderId: "order-1" });
    await drainAfter();
    expect(rpcsNamed("mms_fire_pending_food")).toEqual([
      { fn: "mms_fire_pending_food", args: { p_cart_id: CART } },
    ]);
    expect(rpcsNamed("mms_earn_on_fulfill")).toEqual([
      { fn: "mms_earn_on_fulfill", args: { p_order: "order-1", p_earner: "payer-1" } },
    ]);
    expect(rpcsNamed("mms_redeem_cart_reward")).toHaveLength(1);
    expect(qboEnqueued).toEqual(["order-1"]);
    expect(captures.filter((c) => c.event === "payment_succeeded")).toHaveLength(1);
  });

  it("a tab close is audited with the diner as actor unless staff closed it", async () => {
    cartRow = { status: "open", tab_type: "secure", promo_code: null };
    await fulfillSucceededIntent(
      intent({}, { closedBy: "staff", closedByStaffId: "s-1" }),
      "webhook",
    );
    await drainAfter();
    expect(tabEvents).toEqual([
      expect.objectContaining({ actorKind: "staff", actorStaffId: "s-1", tabType: "secure" }),
    ]);
  });
});

describe("analytics — the webhook's payload unchanged, a recovered order marked", () => {
  it("the webhook's payment_succeeded carries no recovered_via", async () => {
    cartRow = { status: "open", tab_type: "none", promo_code: " pilot15 " };
    await fulfillSucceededIntent(intent(), "webhook");
    const p = captures.find((c) => c.event === "payment_succeeded")?.properties;
    expect(p).not.toHaveProperty("recovered_via");
    expect(p?.promo_cents).toBe(300);
    expect(p?.promo_code).toBe("PILOT15");
  });

  it.each(["track", "staff", "cron"] as const)("a %s recovery says which door", async (via) => {
    await fulfillSucceededIntent(intent(), via);
    expect(captures.find((c) => c.event === "payment_succeeded")?.properties.recovered_via).toBe(
      via,
    );
  });
});

/**
 * "Never a second copy" — PARSED, not scanned (LEARNINGS #60). Every `.rpc("mms_fulfill_order", …)`
 * call in the app is collected from the TypeScript AST (a comment or a string elsewhere is not a
 * call expression), and there must be exactly ONE, in this module. A recovery door that grew its
 * own fulfillment would add a second and redden this.
 */
describe("the card fulfillment has ONE call site", () => {
  const APP = join(import.meta.dirname, "..");
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...sources(p));
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  }
  /** The ONE matcher — the probe test below falsifies this same function, not a copy of it. */
  function fulfillCallsIn(code: string): number {
    const sf = ts.createSourceFile("probe.tsx", code, ts.ScriptTarget.Latest, true);
    let n = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "rpc" &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        node.arguments[0].text === "mms_fulfill_order"
      )
        n++;
      // ⚠️ `forEachChild` is a SEARCH primitive — a truthy return would abort the walk.
      ts.forEachChild(node, (c) => {
        visit(c);
      });
    };
    visit(sf);
    return n;
  }
  const fulfillCalls = (file: string) => fulfillCallsIn(readFileSync(file, "utf8"));

  it("exactly one, in lib/fulfill-intent.ts", () => {
    const sites = ["app", "lib", "components"]
      .flatMap((d) => sources(join(APP, d)))
      .flatMap((f) => Array(fulfillCalls(f)).fill(relative(APP, f)) as string[]);
    expect(sites).toEqual(["lib/fulfill-intent.ts"]);
  });

  it("the matcher sees a call, and not a comment or a bare string", () => {
    const probe = fulfillCallsIn;
    expect(probe('db.rpc("mms_fulfill_order", {});')).toBe(1);
    expect(probe('// db.rpc("mms_fulfill_order", {});')).toBe(0);
    expect(probe('const s = "mms_fulfill_order";')).toBe(0);
    expect(probe('await serviceClient().rpc("mms_fulfill_order", { p_cart_id: c });')).toBe(1);
  });
});
