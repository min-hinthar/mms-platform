import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assertCartMember` — the ONE authorization guard, and (since M108) the ONE producer of the
 * session mode every dine-in/to-go fork downstream reads.
 *
 * This file exists because of a gap the blind adversarial pass found in M108's own fix: moving the
 * mode onto `CartAuthz` deleted two fail-open reads, but it relocated the DECISION into a module
 * with no test, no mutant, and no `check-money-coverage` marker. `mode: sess.mode` could be edited
 * to `mode: "pickup"` with all 205 mutants, 981 tests and CI green — every dine-in add would then
 * ring the to-go tax, which is exactly the defect M108 closed, one file upstream of where its guards
 * point. Every other suite that touches authz mocks it wholesale, so nothing executed this body.
 *
 * So the assertions below are about what the REAL function returns and refuses, with the DB answers
 * scripted per table. The mode cases assert against `lineTax` on a `cold_food` unit price — the one
 * category whose dine-in and to-go arms produce different integers — so a collapsed or constant mode
 * cannot pass by agreeing with the other arm.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

const SESSION = "5e551011-0000-4000-8000-000000000001";
const OTHER_SESSION = "5e551011-0000-4000-8000-0000000000ff";
const CART = "ca97f000-0000-4000-8000-000000000002";
const UID = "u-diner-1";

type Answer<T> = { data: T | null; error: { message: string } | null };

let authUser: Answer<{ user: { id: string } | null }>;
let cartRow: Answer<Record<string, unknown>>;
let sessionRow: Answer<Record<string, unknown>>;
/** A DIFFERENT session, so a query that filters on the wrong id resolves to the wrong mode, not null. */
let otherSessionRow: Answer<Record<string, unknown>>;
let memberRow: Answer<Record<string, unknown>>;
/** Columns the session SELECT actually asked PostgREST for — a column not requested is not returned. */
let sessionCols = "";

/**
 * The mock ENFORCES each query's predicates rather than ignoring them (Codex round 2, P2). A chain
 * whose `.eq()` accepts anything answers the same row for `.eq("id", cart.session_id)` and for
 * `.eq("id", uid)` — so every assertion below would have stayed green while a cart took ANOTHER
 * session's mode, and with it the wrong routing tag and tax. A mock looser than the database is a
 * fixture that cannot express the bug.
 */
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({ auth: { getUser: () => Promise.resolve(authUser) } }),
  serviceClient: () => ({
    from: (table: string) => {
      const eqs: [string, unknown][] = [];
      const pred = (col: string) => eqs.find(([c]) => c === col)?.[1];
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          if (table === "table_sessions") sessionCols = cols;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          eqs.push([col, val]);
          return chain;
        },
        lt: () => Promise.resolve({ error: null }),
        update: () => chain,
        maybeSingle: () => {
          const miss = { data: null, error: null };
          if (table === "qr_carts") {
            return Promise.resolve(pred("id") === CART ? cartRow : miss);
          }
          if (table === "table_sessions") {
            const a =
              pred("id") === SESSION
                ? sessionRow
                : pred("id") === OTHER_SESSION
                  ? otherSessionRow
                  : miss;
            if (!a.data) return Promise.resolve(a);
            // Model PostgREST honestly: a column the caller did not SELECT is absent from the row.
            const picked: Record<string, unknown> = {};
            for (const c of sessionCols.split(",").map((s) => s.trim()))
              if (c in a.data) picked[c] = a.data[c];
            return Promise.resolve({ data: picked, error: a.error });
          }
          if (table === "session_members") {
            // Both known sessions have this seat as a member, so the mode test below can repoint the
            // cart without tripping membership — but the query must still be scoped to a REAL
            // session and to THIS seat, or it misses.
            const scoped =
              (pred("session_id") === SESSION || pred("session_id") === OTHER_SESSION) &&
              pred("seat_id") === UID;
            return Promise.resolve(scoped ? memberRow : miss);
          }
          return Promise.resolve(miss);
        },
      };
      return chain;
    },
  }),
}));

const { assertCartMember, AuthzError } = await import("./authz");
const { lineTax } = await import("./tax");

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

beforeEach(() => {
  authUser = { data: { user: { id: UID } }, error: null };
  cartRow = {
    data: {
      session_id: SESSION,
      locked: false,
      locked_at: null,
      locked_by: null,
      settle_at: null,
      settle_by: null,
      status: "open",
    },
    error: null,
  };
  sessionRow = { data: { status: "active", expires_at: future(), mode: "dinein" }, error: null };
  // Same shape, different mode: a read filtered on the wrong id lands here and reports "pickup".
  otherSessionRow = {
    data: { status: "active", expires_at: future(), mode: "pickup" },
    error: null,
  };
  memberRow = { data: { seat_id: UID, role: "guest" }, error: null };
  sessionCols = "";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("assertCartMember — the mode it returns IS the session's mode", () => {
  it("reports the session row's mode, not a constant", async () => {
    // Both arms from the real function: a constant of either value fails one of them, and a mode
    // dropped from the SELECT (so `sess.mode` is undefined) fails both.
    sessionRow.data!.mode = "dinein";
    expect((await assertCartMember(CART)).mode).toBe("dinein");
    sessionRow.data!.mode = "pickup";
    expect((await assertCartMember(CART)).mode).toBe("pickup");
    sessionRow.data!.mode = "scango";
    expect((await assertCartMember(CART)).mode).toBe("scango");
  });

  it("actually SELECTs the mode column — it cannot be returned without being asked for", async () => {
    await assertCartMember(CART);
    expect(sessionCols.split(",").map((s) => s.trim())).toContain("mode");
  });

  it("reads the mode of THIS CART's session, not some other row", async () => {
    // The predicate, not just the column. A second active session exists with the opposite mode, so
    // a read filtered on the wrong id (the cart id, the uid, nothing at all) either resolves to
    // "pickup" or to no row — both fail. Without this, `.eq()` could be dropped entirely and every
    // other assertion here would still pass while a cart took another table's tax treatment.
    cartRow.data!.session_id = OTHER_SESSION;
    expect((await assertCartMember(CART)).mode).toBe("pickup");
    cartRow.data!.session_id = SESSION;
    expect((await assertCartMember(CART)).mode).toBe("dinein");
  });

  it("carries the tax fork end to end — the two arms differ on cold food", async () => {
    sessionRow.data!.mode = "dinein";
    const dineIn = (await assertCartMember(CART)).mode === "dinein";
    sessionRow.data!.mode = "pickup";
    const toGo = (await assertCartMember(CART)).mode === "dinein";
    // Computed, never transcribed. If these ever agree the fixture is degenerate, not the code.
    expect(lineTax(1200, "cold_food", dineIn)).not.toBe(lineTax(1200, "cold_food", toGo));
  });
});

describe("assertCartMember — an unknowable answer is 503, never a verdict (W10a)", () => {
  it("a failed SESSION read is 503, not 'expired' — and no mode is produced", async () => {
    // The whole reason M108's fix is safe: the read that now decides the tax fork refuses rather
    // than defaulting. If this ever became a verdict, a dropped read would choose a tax arm again.
    sessionRow = { data: null, error: { message: "connection terminated" } };
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("a failed CART read is 503, not 404", async () => {
    cartRow = { data: null, error: { message: "connection terminated" } };
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("a failed MEMBERSHIP read is 503, not 'not a member'", async () => {
    memberRow = { data: null, error: { message: "connection terminated" } };
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});

describe("assertCartMember — the refusals that ARE verdicts", () => {
  it("a missing cart is 404 no_cart", async () => {
    cartRow = { data: null, error: null };
    await expect(assertCartMember(CART)).rejects.toMatchObject({ code: "no_cart", status: 404 });
  });

  it("a paid cart is 403 cart_closed", async () => {
    cartRow.data!.status = "paid";
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "cart_closed",
      status: 403,
    });
  });

  it("a closed session is 403 session_expired", async () => {
    sessionRow.data!.status = "closed";
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "session_expired",
      status: 403,
    });
  });

  it("an expired session is 403 session_expired", async () => {
    sessionRow.data!.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(assertCartMember(CART)).rejects.toMatchObject({
      code: "session_expired",
      status: 403,
    });
  });

  it("a non-member is 403 not_member", async () => {
    memberRow = { data: null, error: null };
    await expect(assertCartMember(CART)).rejects.toMatchObject({ code: "not_member", status: 403 });
  });

  it("every refusal is an AuthzError", async () => {
    cartRow = { data: null, error: null };
    await expect(assertCartMember(CART)).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("assertCartMember — the freeze state it reports", () => {
  it("a FRESH lock is effective and names its seat", async () => {
    cartRow.data!.locked = true;
    cartRow.data!.locked_at = new Date().toISOString();
    cartRow.data!.locked_by = "seat-2";
    const a = await assertCartMember(CART);
    expect(a.locked).toBe(true);
    expect(a.lockedBy).toBe("seat-2");
  });

  it("a STALE lock is ignored — an abandoned pay screen never freezes the cart forever", async () => {
    cartRow.data!.locked = true;
    cartRow.data!.locked_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    cartRow.data!.locked_by = "seat-2";
    const a = await assertCartMember(CART);
    expect(a.locked).toBe(false);
    expect(a.lockedBy).toBeNull();
  });

  it("a FRESH settlement freezes the table; a stale one does not", async () => {
    cartRow.data!.settle_at = new Date().toISOString();
    cartRow.data!.settle_by = "seat-host";
    expect((await assertCartMember(CART)).settling).toBe(true);
    cartRow.data!.settle_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const a = await assertCartMember(CART);
    expect(a.settling).toBe(false);
    expect(a.settleBy).toBeNull();
  });
});
