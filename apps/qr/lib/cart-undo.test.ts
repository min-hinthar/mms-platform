import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * J37 — the diner's `undoFire` after a 0-row answer. `mms_undo_fire` reverses 0 lines for two facts:
 * the grace passed (the kitchen has the batch — `expired`), or an EARLIER undo of this batch landed and
 * its answer was lost (un-fire clears `fire_batch`, so no line carries it — `gone`). Before J37 the diner
 * heard "already with the kitchen" for both, so a re-ask after a lost response closed the window as
 * expired over dishes that were drafts. The diagnosis is the console's (`lib/undo-miss.ts`, moved out of
 * staff-send.ts), and it runs FOR REAL here through the mocked client — so these cases falsify the
 * wiring in cart.ts by VALUE, and the moved function's own rules for the diner's door.
 */
type Line = { id: string; cart_id: string; fire_batch: string | null; state: string };
const h = vi.hoisted(() => ({
  unfired: 0 as number | null,
  rpcError: null as { message: string } | null,
  /** The rows `undoMissReason` reads, filtered FOR REAL by the mock below — a dropped filter is a
   *  different answer, never just a different recorded call. */
  lines: [] as Line[],
  carts: [] as { id: string; status: string }[],
  batchErr: null as { message: string } | null,
  cartErr: null as { message: string } | null,
  /** Each read, in the order it RESOLVED: "qr_cart_items" · "qr_carts". */
  reads: [] as string[],
  /** Runs once, right after the first read resolves — a write committing between two reads. */
  between: null as null | (() => void),
  /** `assertCartMember`'s answer per call (the last repeats); an Error entry is thrown. */
  authz: [] as ({ locked: boolean; settling: boolean } | Error)[],
  authzCalls: 0,
  rpcCalls: [] as { fn: string; args: unknown }[],
  filters: [] as [string, unknown][],
  touched: [] as string[],
  captured: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => {
  const pass = { parse: (x: unknown) => x };
  return {
    addItemInput: pass,
    applyPromoInput: pass,
    applyRewardInput: pass,
    assignLineInput: pass,
    cartViewInput: pass,
    releaseAttemptInput: pass,
    makeItNowInput: pass,
    sendToKitchenInput: pass,
    setKioskTipInput: pass,
    setLineFulfillmentInput: pass,
    setQtyInput: pass,
    undoFireInput: pass,
  };
});
class FakeAuthzError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}
vi.mock("./authz", () => ({
  assertCartMember: () => {
    const at = h.authz[Math.min(h.authzCalls, h.authz.length - 1)] ?? {
      locked: false,
      settling: false,
    };
    h.authzCalls += 1;
    if (at instanceof Error) return Promise.reject(at);
    return Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "host",
      locked: at.locked,
      lockedBy: at.locked ? "u-2" : null,
      settling: at.settling,
      settleBy: at.settling ? "u-2" : null,
      mode: "dinein",
    });
  },
  assertCartItemMember: () => Promise.reject(new Error("not under test")),
  AuthzError: FakeAuthzError,
  UNAVAILABLE: () => new FakeAuthzError("We’re having trouble on our end", 503, "unavailable"),
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({
    capture: (e: { event: string }) => {
      h.captured.push(e.event);
    },
    flush() {},
  }),
}));
vi.mock("./order-lines", () => ({
  priceItem: () => Promise.resolve({}),
  insertOrIncLine: () => Promise.resolve(),
  touchCart: (cartId: string) => {
    h.touched.push(cartId);
    return Promise.resolve();
  },
}));
vi.mock("./media-url", () => ({ safeImageUrl: (u: string) => u, mediaUrl: (u: string) => u }));

// `undoMissReason`'s two reads, evaluated when AWAITED against `h.lines` / `h.carts`:
// `.from("qr_cart_items").select("id").eq(…).eq(…).neq(…).limit(1)` and
// `.from("qr_carts").select("status").eq("id", …).maybeSingle()`.
function query(table: string) {
  const eqs: [string, unknown][] = [];
  const neqs: [string, unknown][] = [];
  const settle = <T>(value: T) => {
    h.reads.push(table);
    const between = h.between;
    if (h.reads.length === 1 && between) {
      h.between = null;
      between();
    }
    return value;
  };
  const match = (row: Record<string, unknown>) =>
    eqs.every(([c, v]) => row[c] === v) && neqs.every(([c, v]) => row[c] !== v);
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      h.filters.push([col, v]);
      eqs.push([col, v]);
      return q;
    },
    neq: (col: string, v: unknown) => {
      h.filters.push([`!${col}`, v]);
      neqs.push([col, v]);
      return q;
    },
    limit: (n: number) =>
      Promise.resolve().then(() =>
        settle(
          h.batchErr
            ? { data: null, error: h.batchErr }
            : {
                data: h.lines
                  .filter(match)
                  .slice(0, n)
                  .map((l) => ({ id: l.id })),
                error: null,
              },
        ),
      ),
    maybeSingle: () =>
      Promise.resolve().then(() =>
        settle(
          h.cartErr
            ? { data: null, error: h.cartErr }
            : {
                data: h.carts.filter(match).map((c) => ({ status: c.status }))[0] ?? null,
                error: null,
              },
        ),
      ),
  };
  return q;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => query(table),
    rpc: (fn: string, args: unknown) => {
      h.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: h.unfired, error: h.rpcError });
    },
  }),
}));

const { undoFire } = await import("./cart");

beforeEach(() => {
  h.unfired = 0;
  h.rpcError = null;
  h.lines = [];
  h.carts = [{ id: "cart-1", status: "open" }];
  h.batchErr = null;
  h.cartErr = null;
  h.reads = [];
  h.between = null;
  h.authz = [];
  h.authzCalls = 0;
  h.rpcCalls = [];
  h.filters = [];
  h.touched = [];
  h.captured = [];
});

const fired = (id: string, state = "fired", batch = "batch-1"): Line => ({
  id,
  cart_id: "cart-1",
  fire_batch: batch,
  state,
});

describe("undoFire — the 0-row answer read, never guessed (J37)", () => {
  it("takes back THIS batch: ok with the count, touches the cart and counts it", async () => {
    h.unfired = 2;
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 2,
      gone: false,
    });
    expect(h.rpcCalls).toEqual([
      { fn: "mms_undo_fire", args: { p_cart_id: "cart-1", p_batch: "batch-1" } },
    ]);
    expect(h.touched).toEqual(["cart-1"]);
    expect(h.captured).toEqual(["undo_fire"]);
    expect(h.reads).toEqual([]); // a real un-fire needs no diagnosis
    expect(h.authzCalls).toBe(1); // …and no second authz read
  });

  it("0 rows, the cart open and NO line still carries the batch → ok, gone — an earlier undo of this batch LANDED and its answer was lost", async () => {
    h.unfired = 0;
    h.lines = [fired("line-0", "draft", "other-batch")];
    // MUTATION (cart-undo/retried-undo-reads-expired): every 0 is `expired` — a re-ask after a lost
    // answer says "already with the kitchen" and closes the window over drafts; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 0,
      gone: true,
    });
    // The reads asked about THIS cart and THIS batch, lines first.
    expect(h.filters).toEqual([
      ["cart_id", "cart-1"],
      ["fire_batch", "batch-1"],
      ["!state", "voided"],
      ["id", "cart-1"],
    ]);
    expect(h.reads).toEqual(["qr_cart_items", "qr_carts"]);
    // Not a second undo: nothing touched, nothing counted.
    expect(h.touched).toEqual([]);
    expect(h.captured).toEqual([]);
  });

  it("0 rows while the batch's lines still carry it → expired (the kitchen has it)", async () => {
    h.unfired = 0;
    h.lines = [fired("line-1")];
    // MUTATION (cart-undo/kitchen-batch-reads-as-gone): every 0 is `gone` — "Brought back" over
    // food being cooked; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.touched).toEqual([]);
    expect(h.reads).toEqual(["qr_cart_items"]); // lines decide; the cart is never asked
  });

  it("a line the kitchen moved on (in progress, served) still carries the batch → expired", async () => {
    h.unfired = 0;
    h.lines = [fired("line-1", "in_progress"), fired("line-2", "served")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("a VOIDED line keeps its batch but is not with the kitchen → gone once the rest came back (blind pass on #315)", async () => {
    // The first undo brought back line-2 (its batch cleared) beside line-1, voided in the grace —
    // `mms_void_line` keeps `fire_batch`. The answer was lost; the re-ask must not read `expired`.
    h.unfired = 0;
    h.lines = [fired("line-1", "voided"), fired("line-2", "draft", "")];
    // MUTATION (undo-miss/voided-line-counts-as-kitchen): the state filter dropped — the voided line
    // reads as a dish being cooked and the window closes "already with the kitchen" over drafts; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 0,
      gone: true,
    });
  });

  it("a COMPED line stays fired with the batch → expired: the kitchen is cooking it, and 'brought back' is never said over it", async () => {
    // Un-fire skips a comped line (a committed loss). The conservative sentence is true of it; the
    // read shows any line that DID come back (lib/undo-miss.ts docblock).
    h.unfired = 0;
    h.lines = [fired("line-1")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("a MERGE moved the batch off this cart (the cart cancelled) → expired, never 'brought back' (blind pass on #315)", async () => {
    // `mms_merge_table_orders` re-parents the lines (batch, state, grace intact) onto the target cart
    // and cancels this one: nothing here carries the batch, and the dishes are cooking at the other table.
    h.unfired = 0;
    h.lines = [{ ...fired("line-1"), cart_id: "cart-2" }];
    h.carts = [
      { id: "cart-1", status: "cancelled" },
      { id: "cart-2", status: "open" },
    ];
    // MUTATION (undo-miss/closed-cart-reads-gone): `gone` without the cart's status — "Brought back"
    // over the merged table's dishes; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("a paid cart reads expired too — nothing on it is coming back", async () => {
    h.unfired = 0;
    h.carts = [{ id: "cart-1", status: "paid" }];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("a merge committing BETWEEN the two reads still reads expired — the lines are read first (blind pass on #315)", async () => {
    // The lines are on this cart when the first read resolves; the merge commits right after it.
    h.unfired = 0;
    h.lines = [fired("line-1")];
    h.between = () => {
      h.lines = [{ ...fired("line-1"), cart_id: "cart-2" }];
      h.carts = [
        { id: "cart-1", status: "cancelled" },
        { id: "cart-2", status: "open" },
      ];
    };
    // MUTATION (undo-miss/cart-read-before-lines): the cart read first sees `open`, the merge
    // commits, the lines read sees nothing → `gone`, "Brought back" over dishes being cooked; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("an unreadable batch check stays expired — the conservative steer, for the diner's door too", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.unfired = 0;
    h.batchErr = { message: "boom" };
    // (staff-send/undo-unread-check-reads-as-gone patches the shared module; it is judged by the
    // console's suite — this pins the same rule from the diner's side.)
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("an unreadable CART check stays expired — no evidence the cart is still open", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.unfired = 0;
    h.cartErr = { message: "boom" };
    // MUTATION (undo-miss/unread-cart-reads-gone): an unread status answers `gone`; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("an RPC error is `error`, never a diagnosis", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.unfired = null;
    h.rpcError = { message: "boom" };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "error" });
    expect(h.reads).toEqual([]);
    err.mockRestore();
  });
});

describe("undoFire — a lock that landed after authz's read is the lock's refusal, not 'too late' (J45)", () => {
  it("0 rows over in-grace lines under a FRESH pay lock → locked: the window stays open", async () => {
    // authz's first read saw no lock; the RPC's own statement (M258) met a fresh one and refused.
    h.unfired = 0;
    h.lines = [fired("line-1")];
    h.authz = [
      { locked: false, settling: false },
      { locked: true, settling: false },
    ];
    // MUTATION (cart-undo/fresh-lock-reads-expired): no re-read — "already with the kitchen" and the
    // window closes for good over dishes the undo would bring back once the lock lifts; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "locked" });
    expect(h.authzCalls).toBe(2);
    expect(h.touched).toEqual([]);
  });

  it("…and under a fresh split freeze → settling", async () => {
    h.unfired = 0;
    h.lines = [fired("line-1")];
    h.authz = [
      { locked: false, settling: false },
      { locked: false, settling: true },
    ];
    // MUTATION (cart-undo/fresh-freeze-reads-expired): the settling arm dropped; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: false,
      reason: "settling",
    });
  });

  it("no lock on the re-read → expired (the grace really ran out)", async () => {
    h.unfired = 0;
    h.lines = [fired("line-1")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.authzCalls).toBe(2);
  });

  it("a re-read that THROWS (the cart closed under the tap) leaves the diagnosis standing — expired", async () => {
    h.unfired = 0;
    h.lines = [fired("line-1")];
    h.authz = [{ locked: false, settling: false }, new Error("Cart is no longer open")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("`gone` needs no lock re-read — the batch is back whatever the lock says", async () => {
    h.unfired = 0;
    h.authz = [
      { locked: false, settling: false },
      { locked: true, settling: false },
    ];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 0,
      gone: true,
    });
    expect(h.authzCalls).toBe(1);
  });
});
