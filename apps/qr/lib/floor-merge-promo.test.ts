import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P3 / OPEN-ITEMS P2e — the table merge refuses when EITHER side carries a promo code, and the
 * sentence it refuses with names the side that carries it.
 *
 * TWO propositions, and the first is the money one. A merge re-parents server-priced lines into the
 * target cart; the discount and the per-line tax are then re-derived per cart at settle
 * (`mms_promo_discount`). The source's code is tied to the CLOSING session and its per-session
 * redemption cap, so it cannot follow — and recomputing the target's discount off the larger
 * subtotal silently swings what a guest pays, in either direction. Dropping the refusal is therefore
 * not a UX regression, it is a wrong charge. `floor.ts` carried ZERO mutants before this suite while
 * matching three money markers, so that rule was revertible with the whole gate green.
 *
 * The second is product truth. Until `clearPromoForTable` shipped in this same PR, "remove it before
 * merging" named an action nothing in the product implemented — `applyPromo` was the only writer of
 * the column and it only ever wrote a non-empty code — so the merge was refused FOREVER. The remove
 * now exists, which is what makes it worth saying WHICH table to go to; a refusal that says "one of
 * these tables" is not something a server can act on without opening both.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve({ kind: "staff", caller: CALLER }),
  requireStaff: () => Promise.resolve(CALLER),
  staffGate: () => Promise.resolve({ ok: true, caller: CALLER }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));

const CALLER = { uid: "u-s", staffId: "st-1", role: "server", displayName: "S", email: null };

type Row = Record<string, unknown>;
/** Two tables, keyed by session id. Each test rewrites them. */
let sessions: Record<string, Row | null> = {};
let carts: Record<string, Row | null> = {};
let mergeCalled = 0;

function tableApi(name: string) {
  const eqs: Record<string, unknown> = {};
  const api = {
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      eqs[col] = val;
      return api;
    },
    maybeSingle() {
      if (name === "table_sessions") {
        return Promise.resolve({ data: sessions[String(eqs.id)] ?? null, error: null });
      }
      // qr_carts is read by session_id + status='open'.
      const c = carts[String(eqs.session_id)] ?? null;
      return Promise.resolve({ data: eqs.status === "open" ? c : null, error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: (fn: string) => {
      if (fn === "mms_merge_table_orders") {
        mergeCalled += 1;
        return Promise.resolve({ data: 3, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { mergeTables } = await import("./floor");

const SRC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TGT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const cart = (over: Row = {}): Row => ({
  id: "c",
  locked: false,
  locked_at: null,
  settle_at: null,
  promo_code: null,
  ...over,
});

beforeEach(() => {
  mergeCalled = 0;
  sessions = {
    [SRC]: { id: SRC, status: "active", mode: "dinein", qr_code: "t-src", table_number: 2 },
    [TGT]: { id: TGT, status: "active", mode: "dinein", qr_code: "t-tgt", table_number: 7 },
  };
  carts = { [SRC]: cart({ id: "c-src" }), [TGT]: cart({ id: "c-tgt" }) };
});

const merge = () => mergeTables({ sourceSessionId: SRC, targetSessionId: TGT });

describe("mergeTables — a promo on either side refuses the merge", () => {
  it("merges two clean tables (the refusal is reachable, not the default answer)", async () => {
    const res = await merge();
    expect(res).toEqual({ ok: true, movedCount: 3, targetSessionId: TGT });
    expect(mergeCalled).toBe(1);
  });

  it("REFUSES when the SOURCE carries a code, and never calls the merge RPC", async () => {
    carts[SRC] = cart({ id: "c-src", promo_code: "PILOT15" });
    const res = await merge();
    expect(res).toEqual({
      ok: false,
      error:
        "This table has a promo code applied — remove it here first, then merge. The discount goes with it, so re-apply on the merged table if the guest was quoted it.",
    });
    // The money assertion: the lines never move, so no cart's discount is re-derived off a subtotal
    // it was not priced against.
    expect(mergeCalled).toBe(0);
  });

  it("REFUSES when the TARGET carries a code, and NAMES that table by its number", async () => {
    carts[TGT] = cart({ id: "c-tgt", promo_code: "PILOT15" });
    const res = await merge();
    expect(res).toEqual({
      ok: false,
      error:
        "Table 7 has a promo code applied — remove it there first, then merge. The discount goes with it, so re-apply on the merged table if the guest was quoted it.",
    });
    expect(mergeCalled).toBe(0);
  });

  it("names an UNREGISTERED target by the picker's own phrase, never a raw reg-/sticker token", async () => {
    // `tableDisplay` falls back to the qr_code when there is no tent number; dressing `reg-9f2c` up
    // as "Table reg-9f2c" would send a server looking for a table that does not exist in the room.
    sessions[TGT] = {
      id: TGT,
      status: "active",
      mode: "dinein",
      qr_code: "reg-9f2c",
      table_number: null,
    };
    carts[TGT] = cart({ id: "c-tgt", promo_code: "PILOT15" });
    const res = await merge();
    expect(res).toEqual({
      ok: false,
      error:
        "The table you picked has a promo code applied — remove it there first, then merge. The discount goes with it, so re-apply on the merged table if the guest was quoted it.",
    });
  });

  it("REFUSES when BOTH sides carry a code, and says so", async () => {
    carts[SRC] = cart({ id: "c-src", promo_code: "WELCOME10" });
    carts[TGT] = cart({ id: "c-tgt", promo_code: "PILOT15" });
    const res = await merge();
    expect(res).toEqual({
      ok: false,
      error:
        "Both tables have a promo code applied — remove them first, then merge. The discounts go with them, so re-apply on the merged table if a guest was quoted one.",
    });
    expect(mergeCalled).toBe(0);
  });
});
