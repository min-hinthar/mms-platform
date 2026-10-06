import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * J37 — the diner's `undoFire` after a 0-row answer, and the self-review on #315's corrections to it.
 * `mms_undo_fire` reverses 0 lines for four facts, read by `lib/undo-miss.ts` from the lines themselves:
 * the grace passed (`expired`); dishes the un-fire could still move are in their grace, so the RPC's
 * freshness legs refused it (`frozen` → the lock's own reason — J45); staff voided the batch
 * (`voided`); or an EARLIER undo of this batch landed and its answer was lost (`gone`). The diagnosis
 * runs FOR REAL here through a mocked client that EVALUATES every filter (`eq` · `neq` · `gt`) against
 * `h.lines` / `h.carts` — so a dropped or added filter is a different answer, never just a different
 * recorded call — and these cases falsify the wiring in cart.ts by VALUE.
 */
type Line = {
  id: string;
  cart_id: string;
  fire_batch: string | null;
  state: string;
  comped: boolean;
  fire_at: string | null;
};
type Probe = "first" | "live" | "voided";
const h = vi.hoisted(() => ({
  unfired: 0 as number | null,
  rpcError: null as { message: string } | null,
  /** The rows `undoMissReason` reads, filtered FOR REAL by the mock below. */
  lines: [] as Line[],
  carts: [] as { id: string; status: string }[],
  /** A failed read per line probe: the first (`neq state voided`), the grace check (`eq state fired`)
   *  and the void check (`eq state voided`). */
  itemErr: {} as Partial<Record<"first" | "live" | "voided", { message: string }>>,
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

// `undoMissReason`'s reads, evaluated when AWAITED against `h.lines` / `h.carts`: three line probes
// (`.from("qr_cart_items").select("id").eq(…)….limit(1)`) and the cart's status
// (`.from("qr_carts").select("status").eq("id", …).maybeSingle()`).
function query(table: string) {
  const eqs: [string, unknown][] = [];
  const neqs: [string, unknown][] = [];
  const gts: [string, string][] = [];
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
    eqs.every(([c, v]) => row[c] === v) &&
    neqs.every(([c, v]) => row[c] !== v) &&
    gts.every(([c, v]) => typeof row[c] === "string" && Date.parse(row[c]) > Date.parse(v));
  const probe = (): Probe =>
    neqs.some(([c]) => c === "state")
      ? "first"
      : eqs.some(([c, v]) => c === "state" && v === "voided")
        ? "voided"
        : "live";
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
    gt: (col: string, v: string) => {
      h.filters.push([`>${col}`, "now"]);
      gts.push([col, v]);
      return q;
    },
    limit: (n: number) =>
      Promise.resolve().then(() => {
        const err = h.itemErr[probe()];
        return settle(
          err
            ? { data: null, error: err }
            : {
                data: h.lines
                  .filter(match)
                  .slice(0, n)
                  .map((l) => ({ id: l.id })),
                error: null,
              },
        );
      }),
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
  h.itemErr = {};
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

/** A minute either side of now: a line whose grace has run out, and one still inside it. */
const LAPSED = () => new Date(Date.now() - 60_000).toISOString();
const IN_GRACE = () => new Date(Date.now() + 60_000).toISOString();
/** A line of THIS send (batch-1 on cart-1), fired, its grace already over, unless overridden. */
const line = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  cart_id: "cart-1",
  fire_batch: "batch-1",
  state: "fired",
  comped: false,
  fire_at: LAPSED(),
  ...over,
});
/** A line an earlier undo brought back: a draft, its batch and grace cleared. */
const restored = (id: string): Line =>
  line(id, { state: "draft", fire_batch: null, fire_at: null });

describe("undoFire — the 0-row answer read from the lines, never guessed (J37)", () => {
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

  it("0 rows, the cart open and NO line carries the batch → ok, gone — an earlier undo of this batch LANDED and its answer was lost", async () => {
    h.lines = [restored("line-1"), line("line-0", { fire_batch: "other-batch" })];
    // MUTATION (cart-undo/retried-undo-reads-expired): every 0 is `expired` — a re-ask after a lost
    // answer says "already with the kitchen" and closes the window over drafts; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: true,
      unfired: 0,
      gone: true,
    });
    // THIS cart and THIS batch, the kitchen's lines first, the cart only after them, then the voids.
    expect(h.filters).toEqual([
      ["cart_id", "cart-1"],
      ["fire_batch", "batch-1"],
      ["!state", "voided"],
      ["id", "cart-1"],
      ["cart_id", "cart-1"],
      ["fire_batch", "batch-1"],
      ["state", "voided"],
    ]);
    expect(h.reads).toEqual(["qr_cart_items", "qr_carts", "qr_cart_items"]);
    // Not a second undo: nothing touched, nothing counted, no lock re-read.
    expect(h.touched).toEqual([]);
    expect(h.captured).toEqual([]);
    expect(h.authzCalls).toBe(1);
  });

  it("0 rows while the batch's lines are still fired but past their grace → expired (the kitchen has it)", async () => {
    h.lines = [line("line-1")];
    // MUTATION (cart-undo/kitchen-batch-reads-as-gone): every 0 is `gone` — "Brought back" over
    // food being cooked; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.touched).toEqual([]);
    expect(h.authzCalls).toBe(1); // a lapsed grace is the clock, not a lock: no re-read
  });

  it("a line the kitchen moved on (in progress, served) still carries the batch → expired", async () => {
    h.lines = [line("line-1", { state: "in_progress" }), line("line-2", { state: "served" })];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("staff VOIDED the whole batch → `voided`, never ok: nothing came back to this order (self-review on #315)", async () => {
    // `mms_void_line` keeps `fire_batch`. The un-fire moved nothing, no line the kitchen could have
    // carries the batch, the cart is open — and the only evidence is a void, not a landed undo.
    h.lines = [line("line-1", { state: "voided", fire_at: IN_GRACE() })];
    // MUTATION (undo-miss/all-voided-reads-gone): the void check answers `gone` — the diner hears
    // "Brought back to your order" over a dish staff removed; red.
    // MUTATION (undo-miss/voided-line-counts-as-kitchen): the voided line counts as the kitchen's —
    // `expired`, "already with the kitchen" over a dish nobody is cooking; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "voided" });
    expect(h.touched).toEqual([]);
    expect(h.authzCalls).toBe(1);
  });

  it("a void beside an undo that landed (its answer lost) reads `voided` too — no column tells the two apart, and its sentence is true of both", async () => {
    h.lines = [line("line-1", { state: "voided" }), restored("line-2")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "voided" });
  });

  it("a COMPED line, fired and still in grace, is the kitchen's → expired: never `frozen`, never 'brought back'", async () => {
    // Un-fire skips a comped line (a committed loss), so it stays fired with the batch while the
    // kitchen cooks it. It is not one the un-fire could move, so the 0 is no refusal either.
    h.lines = [line("line-1", { comped: true, fire_at: IN_GRACE() })];
    // MUTATION (undo-miss/comped-line-reads-frozen): the grace check forgets `comped` — "try again"
    // over a dish no undo can ever take back; red.
    // MUTATION (undo-miss/comped-line-reads-gone): the first probe drops comped lines — the
    // all-comped batch reads "Brought back" over food on the pass; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.authzCalls).toBe(1);
  });

  it("a MERGE that committed after authz's read and before the RPC (the cart cancelled, the batch on the target) → expired, never 'brought back'", async () => {
    // `mms_merge_table_orders` cancels this cart and moves (or folds) its lines onto the target. Only
    // the race reaches here: once the cart is cancelled, authz refuses the next ask (below).
    h.lines = [line("line-1", { cart_id: "cart-2", fire_at: IN_GRACE() })];
    h.carts = [
      { id: "cart-1", status: "cancelled" },
      { id: "cart-2", status: "open" },
    ];
    // MUTATION (undo-miss/closed-cart-reads-gone): the cart's status is never consulted — `gone`,
    // "Brought back" over the merged table's dishes; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("a cart PAID after authz's read and before the RPC → expired — nothing on it is coming back, and no lock re-read", async () => {
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.carts = [{ id: "cart-1", status: "paid" }];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.authzCalls).toBe(1);
  });

  it("a re-ask AFTER the cart closed (merged or paid) is refused by authz before any RPC — the hook's confirm says it could not confirm", async () => {
    h.authz = [new FakeAuthzError("Cart is no longer open", 403, "cart_closed")];
    await expect(undoFire("cart-1", "batch-1")).rejects.toMatchObject({ code: "cart_closed" });
    expect(h.rpcCalls).toEqual([]);
    expect(h.reads).toEqual([]);
  });

  it("a merge committing BETWEEN the two reads still reads expired — the lines are read first (blind pass on #315)", async () => {
    // The lines are on this cart when the first read resolves; the merge commits right after it.
    h.lines = [line("line-1")];
    h.between = () => {
      h.lines = [line("line-1", { cart_id: "cart-2" })];
      h.carts = [
        { id: "cart-1", status: "cancelled" },
        { id: "cart-2", status: "open" },
      ];
    };
    // MUTATION (undo-miss/cart-read-before-lines): the cart read first sees `open`, the merge
    // commits, the lines read sees nothing → `gone`, "Brought back" over dishes being cooked; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("every unreadable check stays expired — the conservative steer, for the diner's door too", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // The first probe. (staff-send/undo-unread-check-reads-as-gone patches it; judged by the
    // console's suite — this pins the same rule from the diner's side.)
    h.itemErr = { first: { message: "boom" } };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    // The cart. MUTATION (undo-miss/unread-cart-reads-gone); red.
    h.itemErr = {};
    h.cartErr = { message: "boom" };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    // The grace check, over an in-grace line. MUTATION (undo-miss/unread-grace-check-reads-frozen):
    // an unread grace check says "try again" on no evidence; red.
    h.cartErr = null;
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.itemErr = { live: { message: "boom" } };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    // The void check, with nothing else carrying the batch. MUTATION
    // (undo-miss/unread-void-check-reads-gone): an unread void check says "Brought back"; red.
    h.lines = [];
    h.itemErr = { voided: { message: "boom" } };
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(err).toHaveBeenCalledTimes(4);
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

describe("undoFire — dishes still undoable in their grace mean the 0 was a REFUSAL, not 'too late' (J45)", () => {
  it("in-grace lines refused under a FRESH pay lock → locked: the window stays open", async () => {
    // authz's first read saw no lock; the RPC's own statement (M258) met a fresh one and refused.
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.authz = [
      { locked: false, settling: false },
      { locked: true, settling: false },
    ];
    // MUTATION (cart-undo/frozen-reads-expired): the refusal falls through to `expired` — "already
    // with the kitchen" and the window closes for good over dishes the undo would bring back; red.
    // MUTATION (undo-miss/frozen-reads-expired): the diagnosis never says `frozen`; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "locked" });
    expect(h.authzCalls).toBe(2);
    expect(h.touched).toEqual([]);
  });

  it("…and under a fresh split freeze → settling", async () => {
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.authz = [
      { locked: false, settling: false },
      { locked: false, settling: true },
    ];
    // MUTATION (cart-undo/fresh-freeze-reads-locked): the freeze is never told apart; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({
      ok: false,
      reason: "settling",
    });
  });

  it("a lock taken AND freed inside one checkout (gone by the re-read) still answers `locked` — the lines, not the re-read, decide (self-review on #315)", async () => {
    // create-intent acquires, refuses an unsent draft, frees — all between the RPC and the re-read.
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.authz = [{ locked: false, settling: false }];
    // MUTATION (cart-undo/freed-lock-reads-expired): only a lock still held on the re-read keeps the
    // window — the freed one answers `expired` over dishes still in their grace; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "locked" });
    expect(h.authzCalls).toBe(2);
  });

  it("a grace that ran out UNDER a fresh lock → expired: the clock refused it, never 'please try again' (self-review on #315)", async () => {
    h.lines = [line("line-1")]; // fired, but past its grace
    h.authz = [
      { locked: false, settling: false },
      { locked: true, settling: false },
    ];
    // MUTATION (undo-miss/lapsed-grace-reads-frozen): the grace check forgets `fire_at` — "That
    // didn't go through — please try again" with the Undo about to vanish; red.
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "expired" });
    expect(h.authzCalls).toBe(1);
  });

  it("an un-comped twin of the comped case IS undoable → locked (the two fixtures differ only in `comped`)", async () => {
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "locked" });
  });

  it("a re-read that THROWS (a transport failure) still answers the lines' verdict — locked", async () => {
    h.lines = [line("line-1", { fire_at: IN_GRACE() })];
    h.authz = [{ locked: false, settling: false }, new Error("socket hang up")];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "locked" });
  });

  it("`gone` and `voided` need no lock re-read", async () => {
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
    h.authzCalls = 0;
    h.lines = [line("line-1", { state: "voided" })];
    await expect(undoFire("cart-1", "batch-1")).resolves.toEqual({ ok: false, reason: "voided" });
    expect(h.authzCalls).toBe(1);
  });
});
