import { beforeEach, describe, expect, it, vi } from "vitest";
import { cartSoldOutReading } from "./dish-sold-out";

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
  blocking: [] as { id: string; name: string; why: "sold_out" | "gone" }[],
  sellable: "available" as "available" | "sold_out" | "gone" | null,
  touched: [] as string[],
  /** The order the clock and the availability reads were ISSUED in (Codex P2 on #362). */
  log: [] as string[],
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
  sendBlockers: () => Promise.resolve(h.blocking),
  dishAvailability: () => {
    h.log.push("dish");
    return Promise.resolve(h.sellable);
  },
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
      if (fn === "mms_now") h.log.push("clock");
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
  h.sellable = "available";
  h.touched = [];
  h.log = [];
  answer = () => ({ data: null, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addItemOutcome — a sold-out dish is refused as a VALUE, before anything is written", () => {
  it("answers { ok: false, refused: 'sold_out', at } and inserts nothing", async () => {
    // MUTATION (lcb/cart/add-sold-out-thrown): rethrow it — the redacted throw is the hedge again; red.
    const { ItemUnsellableError } = await import("./order-lines");
    h.priceItem = () =>
      Promise.reject(new ItemUnsellableError("Mohinga just sold out", "sold_out"));
    h.sellable = "sold_out";
    const out = await addItemOutcome("c-1", "m-1");
    expect(out).toMatchObject({ ok: false, refused: "sold_out" });
    expect(out.ok === false && Number.isFinite(Date.parse(out.at))).toBe(true);
    expect(rpcs.filter((r) => r.fn.startsWith("mms_cart_item"))).toEqual([]);
  });

  it("Codex P2 on #362 — the refusal's stamp is taken BEFORE a read that confirms the dish is unavailable", async () => {
    // `priceItem`'s read found the 86; a stamp taken AFTER it can postdate a restock and a cart view
    // that read the dish available, so the stale mark outvoted the fresher reading on /menu.
    // MUTATION (lcb/cart/refusal-stamped-after-the-read): confirm first, stamp after; red.
    const { ItemUnsellableError } = await import("./order-lines");
    h.priceItem = () =>
      Promise.reject(new ItemUnsellableError("Mohinga just sold out", "sold_out"));
    h.sellable = "sold_out";
    const out = await addItemOutcome("c-1", "m-1");
    expect(out).toEqual({ ok: false, refused: "sold_out", at: "2026-10-13T12:00:00.000Z" });
    expect(h.log).toEqual(["clock", "dish"]);
  });

  it("Codex P2 on #362 — a dish restocked between `priceItem`'s read and the confirm is ADDED, never refused on a stale read", async () => {
    // MUTATION (lcb/cart/restocked-add-refused): refuse on the first read regardless; red.
    const { ItemUnsellableError } = await import("./order-lines");
    let calls = 0;
    h.priceItem = () =>
      (calls += 1) === 1
        ? Promise.reject(new ItemUnsellableError("Mohinga just sold out", "sold_out"))
        : Promise.resolve({});
    h.sellable = "available";
    answer = (s) =>
      s.table === "qr_cart_items" ? { data: [], error: null } : { data: {}, error: null };
    const out = await addItemOutcome("c-1", "m-1");
    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("a dish no longer on the menu is refused as `gone` — never as an 86 (#362 Codex round 1)", async () => {
    // MUTATION (lcb/cart/add-gone-reads-sold-out): answer `sold_out` for every unsellable dish; red.
    const { ItemUnsellableError } = await import("./order-lines");
    h.priceItem = () =>
      Promise.reject(new ItemUnsellableError("Mohinga is no longer on the menu", "gone"));
    h.sellable = "gone";
    expect(await addItemOutcome("c-1", "m-1")).toMatchObject({ ok: false, refused: "gone" });
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
    h.blocking = [
      { id: "m1", name: "Mohinga", why: "sold_out" },
      { id: "m2", name: "Shan Noodles", why: "gone" },
    ];
    const out = await sendToKitchen("c-1");
    // #362 — each dish carries WHY, so the sentence says "sold out" or "no longer on the menu".
    expect(out).toEqual({
      ok: false,
      reason: "unavailable",
      dishes: [
        { name: "Mohinga", why: "sold_out" },
        { name: "Shan Noodles", why: "gone" },
      ],
    });
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
    h.sellable = "sold_out";
    expect(await makeItNow("line-1")).toEqual({ ok: false, reason: "sold_out" });
    expect(rpcs.some((r) => r.fn === "mms_fire_line")).toBe(false);
    // MUTATION (lcb/make-now/gone-reads-sold-out): name every unavailable dish `sold_out`; red.
    h.sellable = "gone";
    expect(await makeItNow("line-1")).toEqual({ ok: false, reason: "gone" });
    h.sellable = null;
    expect(await makeItNow("line-1")).toEqual({ ok: true });
  });
});

describe("setLineNote — the diner's own unsent dish, guards IN THE STATEMENT", () => {
  const OPEN = { status: "open", locked: false, locked_at: null, settle_at: null };
  const ok = (s: Stmt): Res =>
    s.table === "qr_carts"
      ? { data: OPEN, error: null }
      : s.ops.some((o) => o.op === "update")
        ? { data: [{ id: "line-1" }], error: null }
        : { data: { state: "draft", notes: null }, error: null };
  const zeroRows =
    (line: { state: string; notes: string | null }) =>
    (s: Stmt): Res =>
      s.table === "qr_carts"
        ? { data: OPEN, error: null }
        : s.ops.some((o) => o.op === "update")
          ? { data: [], error: null }
          : { data: line, error: null };

  it("writes the trimmed note to THIS line of THIS cart, only while draft and not comped, then touches", async () => {
    // MUTATION (lcb/note/draft-guard-dropped): drop `.eq("state", "draft")` — a note changes under a
    // cook already reading the ticket; red.
    // MUTATION (lcb/note/cart-scope-dropped): drop `.eq("cart_id", cartId)`; red.
    // MUTATION (lcb/note/comp-guard-dropped): drop `.eq("comped", false)` — a guest rewrites the
    // note on a dish staff comped; red.
    answer = ok;
    expect(await setLineNote("line-1", "  No peanuts — allergy ", "")).toEqual({ ok: true });
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
    await setLineNote("line-1", "   ", "No egg");
    expect(has(updatesOf("qr_cart_items")[0]!, "update", { notes: null })).toBe(true);
  });

  it("the write is a COMPARE-AND-SWAP on the note the sheet was seeded from (#362 blind pass 1)", async () => {
    // MUTATION (lcb/note/cas-predicate-dropped): drop the compare — a staff allergy note written
    // while the sheet was open is overwritten (or, with an untouched field, erased) on Save; red.
    answer = ok;
    await setLineNote("line-1", "No egg", "No peanuts — allergy");
    expect(has(updatesOf("qr_cart_items")[0]!, "eq", "notes", "No peanuts — allergy")).toBe(true);
    stmts.length = 0;
    // Seeded from NO note: the compare is `notes is null` (every writer stores '' as null).
    await setLineNote("line-1", "No egg", "");
    const w = updatesOf("qr_cart_items")[0]!;
    expect(has(w, "is", "notes", null)).toBe(true);
    expect(w.ops.some((o) => o.op === "eq" && o.args[0] === "notes")).toBe(false);
  });

  it("a note that CHANGED under the sheet is refused as `changed`, carrying the note now on the order", async () => {
    // MUTATION (lcb/note/changed-unnamed): fold it into `stale` — the sheet cannot re-seed and the
    // diner is never told their Save met someone else's note; red.
    answer = zeroRows({ state: "draft", notes: "No peanuts — allergy" });
    expect(await setLineNote("line-1", "No egg", "")).toEqual({
      ok: false,
      reason: "changed",
      notes: "No peanuts — allergy",
    });
    // …and a note CLEARED underneath is a change too.
    answer = zeroRows({ state: "draft", notes: null });
    expect(await setLineNote("line-1", "No egg", "Old")).toEqual({
      ok: false,
      reason: "changed",
      notes: null,
    });
    expect(h.touched).toEqual([]);
  });

  it("a BLOCKED write (zero rows) is not ok — and a line that left draft is named not_draft", async () => {
    // MUTATION (lcb/note/blocked-write-reads-ok): ignore the row count — "Note saved" over nothing; red.
    answer = zeroRows({ state: "fired", notes: null });
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "not_draft" });
    expect(h.touched).toEqual([]);
    // A line staff REMOVED is named as removed, never as "gone to the kitchen" (blind pass 8).
    answer = zeroRows({ state: "voided", notes: null });
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "voided" });
  });

  it("under a pay lock or a split freeze (the authz read): busy, and nothing is written", async () => {
    // MUTATION (lcb/note/freeze-ignored): drop the freeze refusal; red.
    answer = ok;
    h.item = { locked: true };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "busy" });
    h.item = { settling: true };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "busy" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });

  it("a freeze landing between the authz read and the write is caught by the PRE-WRITE re-read (#362 blind pass 5)", async () => {
    // MUTATION (lcb/note/freeze-reread-ignored): re-read `status` only — a lock taken after the
    // authz read lets the note land beside a payment; red.
    const fresh = new Date(Date.now() - 1_000).toISOString();
    answer = (s) =>
      s.table === "qr_carts"
        ? { data: { ...OPEN, locked: true, locked_at: fresh }, error: null }
        : ok(s);
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "busy" });
    answer = (s) =>
      s.table === "qr_carts" ? { data: { ...OPEN, settle_at: fresh }, error: null } : ok(s);
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "busy" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
    const read = stmts.find((s) => s.table === "qr_carts");
    expect(read && has(read, "select", "status,locked,locked_at,settle_at")).toBe(true);
    // A lock that has LAPSED is no freeze — the same rule `assertCartMember` applies.
    const lapsed = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    answer = (s) =>
      s.table === "qr_carts"
        ? { data: { ...OPEN, locked: true, locked_at: lapsed }, error: null }
        : ok(s);
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: true });
  });

  it("a line already with the kitchen is named not_draft BEFORE any write; a removed one, voided", async () => {
    answer = ok;
    h.item = { lineState: "fired" };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "not_draft" });
    h.item = { lineState: "voided" };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "voided" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });

  it("a GUEST edits only their own dish — refused on someone else's, and pinned to their seat in the UPDATE", async () => {
    // MUTATION (lcb/note/guest-seat-unpinned): drop the guest's `by_seat` predicate — a reassign
    // landing between the read and the write puts a guest's note on a tablemate's dish; red.
    answer = ok;
    h.item = { role: "guest", lineSeat: "u-2" };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "not_yours" });
    h.item = { role: "guest", lineSeat: "u-1" };
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: true });
    expect(has(updatesOf("qr_cart_items")[0]!, "eq", "by_seat", "u-1")).toBe(true);
  });

  it("a cart that stopped being open is refused before the write", async () => {
    // MUTATION (lcb/note/closed-cart-written): drop the status refusal; red.
    answer = (s) =>
      s.table === "qr_carts" ? { data: { ...OPEN, status: "paid" }, error: null } : ok(s);
    expect(await setLineNote("line-1", "No egg", "")).toEqual({ ok: false, reason: "closed" });
    expect(updatesOf("qr_cart_items")).toHaveLength(0);
  });

  it("a `seen` the sheet could never have held is refused, never sent", async () => {
    answer = ok;
    expect(await setLineNote("line-1", "No egg", "x".repeat(161))).toEqual({
      ok: false,
      reason: "error",
    });
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

/** A cart line row as `getCartView` reads it — only what a case varies is passed. */
const row = (o: Record<string, unknown>) => ({
  id: "l1",
  menu_item_id: "11111111-1111-1111-1111-111111111111",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unit_price_cents: 1200,
  tax_cents: 0,
  by_seat: "u-1",
  state: "draft",
  fire_at: null,
  bumped_at: null,
  comped: false,
  fulfillment: "dinein",
  notes: null,
  created_at: "2026-10-13T11:00:00Z",
  ...o,
});

describe("getCartView — the settlement's own void says 'we ran out' too (#362 blind pass 7)", () => {
  it("reads `qr_dropped_lines` for a voided line's reason, beside staff's audit", async () => {
    // MUTATION (lcb/view/dropped-reason-unread): read only `mms_approvals` — a dish the capture
    // voided because it could not be made reaches a tablemate's phone as "Our staff removed it"; red.
    answer = (s) => {
      if (s.table === "qr_cart_items") return { data: [row({ state: "voided" })], error: null };
      if (s.table === "mms_approvals") return { data: [], error: null };
      if (s.table === "qr_dropped_lines")
        return {
          data: [{ line_id: "l1", reason_code: "sold_out", dropped_at: "2026-10-13T11:30:00Z" }],
          error: null,
        };
      if (s.table === "qr_carts") return { data: {}, error: null };
      return { data: [], error: null };
    };
    const v = await getCartView("c-1");
    expect(v.items[0]?.removedReason).toBe("sold_out");
    const read = stmts.find((s) => s.table === "qr_dropped_lines");
    expect(read && has(read, "eq", "cart_id", "c-1")).toBe(true);
    expect(read && has(read, "in", "line_id", ["l1"])).toBe(true);
  });
});

describe("getCartView — each line carries WHY its dish can't be made (#362 Codex round 1)", () => {
  const ids = {
    sold: "11111111-1111-1111-1111-111111111111",
    delisted: "22222222-2222-2222-2222-222222222222",
    missing: "33333333-3333-3333-3333-333333333333",
    fine: "44444444-4444-4444-4444-444444444444",
  };
  const lines = [
    row({ id: "a", menu_item_id: ids.sold }),
    row({ id: "b", menu_item_id: ids.delisted }),
    row({ id: "c", menu_item_id: ids.missing }),
    row({ id: "d", menu_item_id: ids.fine }),
    row({ id: "e", menu_item_id: "012345678905", fulfillment: "grocery" }),
  ];
  const catalog = [
    { id: ids.sold, is_sold_out: true, is_active: true, image_url: null, name_my: null },
    { id: ids.delisted, is_sold_out: false, is_active: false, image_url: null, name_my: null },
    { id: ids.fine, is_sold_out: false, is_active: true, image_url: null, name_my: null },
  ];

  it("marks an 86 `sold_out`, a delisted or vanished dish `gone`, and gates both", async () => {
    // MUTATION (lcb/view/delisted-unmarked): mark only `is_sold_out` — a delisted dish is named by
    // the Send, carries no mark on /cart, and its refusals stop holding; red.
    answer = (s) =>
      s.table === "qr_cart_items"
        ? { data: lines, error: null }
        : s.table === "menu_items"
          ? { data: catalog, error: null }
          : s.table === "qr_carts"
            ? { data: {}, error: null }
            : { data: [], error: null };
    const v = await getCartView("c-1");
    const by = (id: string) => v.items.find((i) => i.id === id);
    expect([by("a")?.unavailable, by("a")?.soldOut]).toEqual(["sold_out", true]);
    expect([by("b")?.unavailable, by("b")?.soldOut]).toEqual(["gone", true]);
    expect([by("c")?.unavailable, by("c")?.soldOut]).toEqual(["gone", true]);
    expect([by("d")?.unavailable, by("d")?.soldOut]).toEqual([null, false]);
    expect([by("e")?.unavailable, by("e")?.soldOut]).toEqual([null, false]);
    const read = stmts.find((s) => s.table === "menu_items");
    expect(read && has(read, "select", "id,is_sold_out,is_active,image_url,name_my")).toBe(true);
  });

  it("an UNREADABLE catalog marks nothing — never 'gone' for every line", async () => {
    // MUTATION (lcb/view/failed-catalog-reads-gone): treat a failed read as an empty catalog —
    // every dish on the order would read "No longer on the menu" on a blip; red.
    answer = (s) =>
      s.table === "qr_cart_items"
        ? { data: lines, error: null }
        : s.table === "menu_items"
          ? { data: null, error: { message: "timeout" } }
          : s.table === "qr_carts"
            ? { data: {}, error: null }
            : { data: [], error: null };
    const v = await getCartView("c-1");
    expect(v.items.map((i) => i.unavailable ?? null)).toEqual([null, null, null, null, null]);
    expect(v.items.some((i) => i.soldOut)).toBe(false);
    // #362 blind pass 9 — and it says NOTHING about availability either way: a dish line's flag is
    // unknown, not "available", so /menu's freshest-reading rule cannot clear a real sold-out mark
    // with it. MUTATION (lcb/view/failed-catalog-reads-available): answer `false` for every line;
    // red. A grocery line is never a dish, so it stays `false`.
    expect(v.items.map((i) => i.soldOut)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    ]);
    expect(cartSoldOutReading(v.items, ids.fine, v.dbNow ?? "2026-10-08T10:00:00.000Z", true)).toBe(
      null,
    );
  });
});
