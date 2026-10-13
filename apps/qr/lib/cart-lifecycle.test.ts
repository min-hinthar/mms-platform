import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle audit — the SERVER half of the diner stream: every new refusal is a definite non-write
 * the client can name, and every new write carries its guards in the statement.
 *
 *   • `addItemOutcome` — a sold-out dish is refused as a VALUE (a thrown message is redacted);
 *   • `sendToKitchen` / `makeItNow` — a dish the kitchen can no longer make never reaches the board;
 *   • `setLineNote` — the diner's own note edit: draft-only IN THE UPDATE, row count read, freezes
 *     refused, a guest only on their own dish;
 *   • `getCartView` — a removed line carries "we ran out" when that was staff's reason.
 *
 * The database is a recording fake: each statement's chain is captured, so a guard is asserted as
 * a predicate that was SENT, never as a comment that says it would be.
 */

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => {
  const pass = {
    parse: (x: unknown) => x,
    safeParse: (x: unknown) => ({ success: true, data: x }),
  };
  return {
    addItemInput: pass,
    applyPromoInput: pass,
    applyRewardInput: pass,
    assignLineInput: pass,
    cartViewInput: pass,
    makeItNowInput: pass,
    releaseAttemptInput: pass,
    sendToKitchenInput: pass,
    setKioskTipInput: pass,
    setLineFulfillmentInput: pass,
    // The real bound (160 · trim) is the schema's own suite's; here it only has to pass through.
    setLineNotesInput: {
      safeParse: (x: { cartItemId: string; notes: string }) => ({
        success: true,
        data: { ...x, notes: x.notes.trim() },
      }),
    },
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

const h = vi.hoisted(() => ({
  member: {} as Record<string, unknown>,
  item: {} as Record<string, unknown>,
  priceItem: null as null | (() => Promise<unknown>),
  blocking: [] as string[],
  sellable: true as boolean | null,
  touched: [] as string[],
}));

vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "host",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: "dinein",
      ...h.member,
    }),
  assertCartItemMember: () =>
    Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "host",
      cartId: "c-1",
      locked: false,
      settling: false,
      lineSeat: "u-1",
      lineState: "draft",
      comped: false,
      lineQty: 1,
      menuItemId: "11111111-1111-1111-1111-111111111111",
      ...h.item,
    }),
  AuthzError: FakeAuthzError,
  UNAVAILABLE: () => new FakeAuthzError("We’re having trouble on our end", 503, "unavailable"),
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
// The REAL ownership rule — `setLineNote`'s guest case depends on it.
vi.mock("./totals", () => ({
  getCartTotals: () => Promise.resolve({ subtotalCents: 0, totalCents: 0 }),
}));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./order-lines", () => {
  class ItemUnsellableError extends Error {
    constructor(
      message: string,
      readonly reason: "sold_out" | "gone",
    ) {
      super(message);
    }
  }
  return {
    ItemUnsellableError,
    priceItem: () => (h.priceItem ? h.priceItem() : Promise.resolve({})),
    insertOrIncLine: () => Promise.resolve(),
    touchCart: (_cart: string, ctx: string) => {
      h.touched.push(ctx);
      return Promise.resolve();
    },
  };
});
vi.mock("./availability-read", () => ({
  sendBlockingNames: () => Promise.resolve(h.blocking),
  dishSellable: () => Promise.resolve(h.sellable),
}));
vi.mock("./media-url", () => ({ safeImageUrl: (u: string) => u }));

type Res = { data: unknown; error: { message: string } | null };
type Stmt = { table: string; ops: { op: string; args: unknown[] }[] };
const stmts: Stmt[] = [];
const rpcs: { fn: string; args: unknown }[] = [];
let answer: (s: Stmt) => Res = () => ({ data: null, error: null });

function from(table: string) {
  const stmt: Stmt = { table, ops: [] };
  stmts.push(stmt);
  const settle = () => Promise.resolve(answer(stmt));
  const api: Record<string, unknown> = {};
  for (const op of ["select", "update", "eq", "in", "is", "or", "order"])
    api[op] = (...args: unknown[]) => {
      stmt.ops.push({ op, args });
      return api;
    };
  api.maybeSingle = () => {
    stmt.ops.push({ op: "maybeSingle", args: [] });
    return settle();
  };
  api.single = () => {
    stmt.ops.push({ op: "single", args: [] });
    return settle();
  };
  api.then = (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from,
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      if (fn === "mms_now")
        return Promise.resolve({ data: "2026-10-13T12:00:00.000Z", error: null });
      if (fn === "mms_fire_cart")
        return Promise.resolve({
          data: [{ fired: 1, fire_deadline: null, batch: "b-1" }],
          error: null,
        });
      return Promise.resolve({ data: "ok", error: null });
    },
  }),
}));

const { addItemOutcome, getCartView, makeItNow, sendToKitchen, setLineNote } =
  await import("./cart");

const has = (s: Stmt, op: string, ...args: unknown[]) =>
  s.ops.some((o) => o.op === op && JSON.stringify(o.args) === JSON.stringify(args));
const updatesOf = (table: string) =>
  stmts.filter((s) => s.table === table && s.ops.some((o) => o.op === "update"));

beforeEach(() => {
  stmts.length = 0;
  rpcs.length = 0;
  h.member = {};
  h.item = {};
  h.priceItem = null;
  h.blocking = [];
  h.sellable = true;
  h.touched = [];
  answer = () => ({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addItemOutcome — a sold-out dish is refused as a VALUE, before anything is written", () => {
  it("answers { ok: false, refused: 'sold_out', at } and inserts nothing", async () => {
    // MUTATION (lcb/cart/add-sold-out-thrown): rethrow it — the redacted throw is the hedge again; red.
    const { ItemUnsellableError } = await import("./order-lines");
    h.priceItem = () =>
      Promise.reject(new ItemUnsellableError("Mohinga just sold out", "sold_out"));
    const out = await addItemOutcome("c-1", "m-1");
    expect(out).toMatchObject({ ok: false, refused: "sold_out" });
    expect(out.ok === false && Number.isFinite(Date.parse(out.at))).toBe(true);
    expect(rpcs.filter((r) => r.fn.startsWith("mms_cart_item"))).toEqual([]);
  });

  it("every OTHER throw keeps its meaning (it may have committed) — it is not turned into a refusal", async () => {
    h.priceItem = () => Promise.reject(new Error("transport"));
    await expect(addItemOutcome("c-1", "m-1")).rejects.toThrow("transport");
  });

  it("a landing is addItem's own answer, wrapped", async () => {
    answer = (s) =>
      s.table === "qr_cart_items" ? { data: [], error: null } : { data: {}, error: null };
    const out = await addItemOutcome("c-1", "m-1");
    expect(out.ok).toBe(true);
  });
});

describe("sendToKitchen — a dish the kitchen can no longer make never reaches the board", () => {
  it("refuses with the names and fires NOTHING", async () => {
    // MUTATION (lcb/send/sold-out-draft-fires): drop the refusal — `mms_fire_cart` fires the dish
    // the kitchen just said no to; red.
    h.blocking = ["Mohinga"];
    const out = await sendToKitchen("c-1");
    expect(out).toEqual({ ok: false, reason: "sold_out", names: ["Mohinga"] });
    expect(rpcs.some((r) => r.fn === "mms_fire_cart")).toBe(false);
  });

  it("fires as before when nothing in the batch is blocked", async () => {
    const out = await sendToKitchen("c-1");
    expect(out.ok).toBe(true);
    expect(rpcs.some((r) => r.fn === "mms_fire_cart")).toBe(true);
  });
});

describe("makeItNow — 'Send to kitchen now' on a sold-out dish is refused and named", () => {
  it("answers sold_out and fires nothing; unknowable (null) fails open", async () => {
    // MUTATION (lcb/make-now/sold-out-fires): drop the refusal; red.
    h.sellable = false;
    expect(await makeItNow("line-1")).toEqual({ ok: false, reason: "sold_out" });
    expect(rpcs.some((r) => r.fn === "mms_fire_line")).toBe(false);
    h.sellable = null;
    expect(await makeItNow("line-1")).toEqual({ ok: true });
  });
});

describe("setLineNote — the diner's own unsent dish, guards IN THE STATEMENT", () => {
  const ok = (s: Stmt): Res =>
    s.table === "qr_carts"
      ? { data: { status: "open" }, error: null }
      : s.ops.some((o) => o.op === "update")
        ? { data: [{ id: "line-1" }], error: null }
        : { data: { state: "draft" }, error: null };

  it("writes the trimmed note to THIS line of THIS cart, only while draft and not comped, then touches", async () => {
    // MUTATION (lcb/note/draft-guard-dropped): drop `.eq("state", "draft")` — a note changes under a
    // cook already reading the ticket; red.
    answer = ok;
    expect(await setLineNote("line-1", "  No peanuts — allergy ")).toEqual({ ok: true });
    const [w] = updatesOf("qr_cart_items");
    expect(w).toBeDefined();
    expect(has(w!, "update", { notes: "No peanuts — allergy" })).toBe(true);
    expect(has(w!, "eq", "id", "line-1")).toBe(true);
    expect(has(w!, "eq", "cart_id", "c-1")).toBe(true);
    expect(has(w!, "eq", "state", "draft")).toBe(true);
    expect(has(w!, "eq", "comped", false)).toBe(true);
    expect(has(w!, "select", "id")).toBe(true);
    // peers re-sync
    expect(h.touched).toEqual(["setLineNote"]);
  });

  it("an empty note CLEARS (null), never stores ''", async () => {
    answer = ok;
    await setLineNote("line-1", "   ");
    expect(has(updatesOf("qr_cart_items")[0]!, "update", { notes: null })).toBe(true);
  });

  it("a BLOCKED write (zero rows) is not ok — and a line that left draft is named not_draft", async () => {
    // MUTATION (lcb/note/blocked-write-reads-ok): ignore the row count — "Note saved" over nothing; red.
    answer = (s) =>
      s.table === "qr_carts"
        ? { data: { status: "open" }, error: null }
        : s.ops.some((o) => o.op === "update")
          ? { data: [], error: null }
          : { data: { state: "fired" }, error: null };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "not_draft" });
    expect(h.touched).toEqual([]);
  });

  it("under a pay lock or a split freeze: busy, and nothing is written", async () => {
    // MUTATION (lcb/note/freeze-ignored): drop the freeze refusal; red.
    answer = ok;
    h.item = { locked: true };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "busy" });
    h.item = { settling: true };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "busy" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });

  it("a line already with the kitchen is named not_draft BEFORE any write", async () => {
    answer = ok;
    h.item = { lineState: "fired" };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "not_draft" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });

  it("a GUEST edits only their own dish — refused on someone else's, and pinned to their seat in the UPDATE", async () => {
    // MUTATION (lcb/note/guest-seat-unpinned): drop the guest's `by_seat` predicate — a reassign
    // landing between the read and the write puts a guest's note on a tablemate's dish; red.
    answer = ok;
    h.item = { role: "guest", lineSeat: "u-2" };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "not_yours" });
    h.item = { role: "guest", lineSeat: "u-1" };
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: true });
    expect(has(updatesOf("qr_cart_items")[0]!, "eq", "by_seat", "u-1")).toBe(true);
  });

  it("a cart that stopped being open is refused before the write", async () => {
    answer = (s) => (s.table === "qr_carts" ? { data: { status: "paid" }, error: null } : ok(s));
    expect(await setLineNote("line-1", "No egg")).toEqual({ ok: false, reason: "closed" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });
});

describe("getCartView — a removed line says 'we ran out' when that was staff's reason", () => {
  it("reads the void's reason from the audit for VOIDED lines only, advisory", async () => {
    // MUTATION (lcb/view/void-reason-unread): drop the reason — a bare "Removed" again; red.
    answer = (s) => {
      if (s.table === "qr_cart_items")
        return {
          data: [
            {
              id: "v1",
              menu_item_id: "mohinga",
              name: "Mohinga",
              qty: 1,
              modifiers: [],
              unit_price_cents: 1200,
              tax_cents: 0,
              by_seat: "u-1",
              state: "voided",
              fire_at: null,
              bumped_at: null,
              comped: false,
              fulfillment: "dinein",
              notes: null,
              created_at: "2026-10-13T11:00:00Z",
            },
            {
              id: "d1",
              menu_item_id: "tea",
              name: "Tea",
              qty: 1,
              modifiers: [],
              unit_price_cents: 300,
              tax_cents: 0,
              by_seat: "u-1",
              state: "draft",
              fire_at: null,
              bumped_at: null,
              comped: false,
              fulfillment: "dinein",
              notes: null,
              created_at: "2026-10-13T11:00:00Z",
            },
          ],
          error: null,
        };
      if (s.table === "mms_approvals")
        return {
          data: [
            { line_id: "v1", reason_code: "sold_out", created_at: "2026-10-13T11:30:00Z" },
            { line_id: "d1", reason_code: "sold_out", created_at: "2026-10-13T11:30:00Z" },
          ],
          error: null,
        };
      if (s.table === "qr_carts") return { data: {}, error: null };
      return { data: [], error: null };
    };
    const v = await getCartView("c-1");
    expect(v.items.find((i) => i.id === "v1")?.removedReason).toBe("sold_out");
    // A line that is NOT voided never carries a removal reason, whatever the audit holds.
    expect(v.items.find((i) => i.id === "d1")?.removedReason).toBeNull();
    const audit = stmts.find((s) => s.table === "mms_approvals");
    expect(audit && has(audit, "in", "line_id", ["v1"])).toBe(true);
    expect(audit && has(audit, "eq", "kind", "void")).toBe(true);
  });

  it("an unreadable audit degrades to a bare 'Removed' — never the outage screen", async () => {
    answer = (s) =>
      s.table === "qr_cart_items"
        ? {
            data: [
              {
                id: "v1",
                menu_item_id: "m",
                name: "M",
                qty: 1,
                modifiers: [],
                unit_price_cents: 1,
                tax_cents: 0,
                by_seat: null,
                state: "voided",
                fire_at: null,
                bumped_at: null,
                comped: false,
                fulfillment: "dinein",
                notes: null,
                created_at: "2026-10-13T11:00:00Z",
              },
            ],
            error: null,
          }
        : s.table === "mms_approvals"
          ? { data: null, error: { message: "timeout" } }
          : s.table === "qr_carts"
            ? { data: {}, error: null }
            : { data: [], error: null };
    const v = await getCartView("c-1");
    expect(v.items[0]?.removedReason).toBeNull();
  });
});
