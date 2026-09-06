import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P3 — the staff apply/remove must be atomic against the pay freeze AND the live-intent link.
 *
 * This is `cart-promo-freeze.test.ts`'s discipline pointed at the second door. The fake PostgREST
 * below actually EVALUATES the filters against a row rather than recording the calls, so a mutant
 * that deletes an `.or()` or the `.is("live_payment_intent_id", null)` changes the OUTCOME — the row
 * moves when it must not — instead of merely changing a call list. That is the difference between a
 * guard and a transcript, and it is why every assertion here reads `row.promo_code` /
 * `row.promo_granted_cents` after the call rather than inspecting a spy.
 *
 * Both directions are pinned, deliberately. Over-blocking costs exactly as much as under-blocking on
 * this surface: a lock is only real while `locked_at` is inside CART_LOCK_TTL, so a STALE lock must
 * still let a code through — otherwise an abandoned pay screen freezes the register's promo control
 * for five minutes, on the one table the pilot script has Dad applying a code at.
 *
 * The REMOVE gets the same treatment as the apply and for a sharper reason: a remove RAISES the
 * amount fulfillment re-derives, so running it against a cart some intent is live on is the M152 (a)
 * charged-card-no-order hazard reached from the other side.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => void) => void fn() }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));

/** The staff identity, swapped per test to exercise the two auth refusals. */
let auth: { kind: string; caller?: { staffId: string; role: string } } = {
  kind: "staff",
  caller: { staffId: "st-1", role: "server" },
};
vi.mock("./staff", () => ({
  getStaffAuth: () => Promise.resolve(auth),
  STAFF_WRITE_OUTAGE: "outage",
}));

/** The caller-scoped rate gate (STAFF_PROMO_RATE), forced per test. */
let rateAllows = true;
/** Every key the gate was asked about. The gate is keyed by the CALLER, never by the table — a
 *  session-keyed budget would let one griefing table lock the register out of the whole floor. A
 *  mock that discarded the argument could not tell those two apart. */
let rateKeys: string[] = [];
vi.mock("./rate", () => ({
  withinStaffPromoRate: (key: string) => {
    rateKeys.push(key);
    return Promise.resolve(rateAllows);
  },
}));

/** The split-share mutex — its own module, so it is stubbed rather than driven from `row`. */
let inFlight: string | null = null;
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(inFlight) }));

/** What `openCartFor` resolves. `null` session / `null` cart are the two resolve refusals. */
let sessionMissing = false;
let cartMissing = false;
let resolveUnavailable = false;
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve(
      resolveUnavailable
        ? { session: null, cart: null, unavailable: true }
        : sessionMissing
          ? { session: null, cart: null, unavailable: false }
          : {
              session: { id: "s-1", status: "active", mode: "dinein", qr_code: "t7" },
              cart: cartMissing ? null : { id: "c-1", ...(row ?? {}) },
              unavailable: false,
            },
    ),
}));

// The REAL TTLs — importing them is what makes the freshness boundary here the same one production
// uses. A copy would drift the moment either constant moved.
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";

type Row = Record<string, unknown>;

/** The cart the fake DB holds. Each test rewrites it. */
let row: Row | null = null;
/** Forced failure for the follow-up diagnosis read only (the UPDATE has its own flag). */
let readFails = false;
/** Forced failure for the UPDATE itself. */
let updateFails = false;
/** How many UPDATEs actually reached the DB — the remove's no-op short-circuit is invisible
 *  otherwise, since "wrote nothing" and "wrote the same nulls" have the same row state. */
let updateCalls = 0;
/** What `mms_promo_check` answers. */
let check: { valid: boolean; reason: string | null; discount_cents: number } = {
  valid: true,
  reason: null,
  discount_cents: 900,
};
let checkFails = false;

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

/** Evaluate one PostgREST filter term, e.g. `locked_at.lte.2026-01-01T00:00:00.000Z`. */
function term(r: Row, expr: string): boolean {
  const first = expr.indexOf(".");
  const second = expr.indexOf(".", first + 1);
  const col = expr.slice(0, first);
  const op = expr.slice(first + 1, second);
  const raw = expr.slice(second + 1);
  const v = r[col];
  switch (op) {
    case "eq":
      return raw === "false" ? v === false : raw === "true" ? v === true : v === raw;
    case "is":
      return raw === "null" ? v === null || v === undefined : v === raw;
    case "lte":
      return v !== null && v !== undefined && String(v) <= raw;
    case "lt":
      return v !== null && v !== undefined && String(v) < raw;
    default:
      throw new Error(`fake db: unsupported operator "${op}" in "${expr}"`);
  }
}

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "is"; col: string; val: unknown }
  | { kind: "or"; expr: string };

const matches = (r: Row, filters: Filter[]) =>
  filters.every((f) =>
    f.kind === "eq"
      ? r[f.col] === f.val
      : f.kind === "is"
        ? f.val === null
          ? r[f.col] === null || r[f.col] === undefined
          : r[f.col] === f.val
        : f.expr.split(",").some((t) => term(r, t)),
  );

function builder(values: Row | null, exactCount = true) {
  const filters: Filter[] = [];
  const api = {
    eq(col: string, val: unknown) {
      filters.push({ kind: "eq", col, val });
      return api;
    },
    or(expr: string) {
      filters.push({ kind: "or", expr });
      return api;
    },
    is(col: string, val: unknown) {
      filters.push({ kind: "is", col, val });
      return api;
    },
    maybeSingle() {
      if (readFails) return Promise.resolve({ data: null, error: { message: "read failed" } });
      const hit = row && matches(row, filters) ? row : null;
      return Promise.resolve({ data: hit, error: null });
    },
    // The UPDATE is awaited directly, so the builder itself has to be thenable.
    then(resolve: (r: { count: number | null; error: { message: string } | null }) => void) {
      if (updateFails) {
        resolve({ count: 0, error: { message: "update failed" } });
        return;
      }
      const hit = row !== null && matches(row, filters);
      if (hit && values) Object.assign(row as Row, values);
      // ⚠️ NULL without `{ count: "exact" }`, because that is what PostgREST answers: the count is
      // read off `Content-Range`, which the server only sends when the request asked for it. A fake
      // that handed back a number regardless would let a mutant DELETE the option and survive —
      // while in production every successful write would then read `count: null`, fail the
      // `(count ?? 0) === 0` check and report a refusal on a cart that did move.
      resolve({ count: hit ? (exactCount ? 1 : null) : exactCount ? 0 : null, error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      update: (values: Row, opts?: { count?: string }) => {
        updateCalls += 1;
        return builder(values, opts?.count === "exact");
      },
      select: () => builder(null),
    }),
    rpc: (fn: string) =>
      Promise.resolve(
        fn === "mms_promo_check"
          ? checkFails
            ? { data: null, error: { message: "rpc failed" } }
            : { data: [check], error: null }
          : { data: null, error: null },
      ),
  }),
}));

const { applyPromoForTable, clearPromoForTable } = await import("./staff-promo");

const SESSION = "11111111-1111-4111-8111-111111111111";

const openCart = (over: Row = {}): Row => ({
  id: "c-1",
  status: "open",
  locked: false,
  locked_at: null,
  locked_by: null,
  settle_at: null,
  promo_code: null,
  // A LIVE attempt's pin. Whether this survives is the whole money question.
  promo_granted_cents: 900,
  live_payment_intent_id: null,
  ...over,
});

beforeEach(() => {
  auth = { kind: "staff", caller: { staffId: "st-1", role: "server" } };
  rateAllows = true;
  rateKeys = [];
  updateCalls = 0;
  inFlight = null;
  sessionMissing = false;
  cartMissing = false;
  resolveUnavailable = false;
  readFails = false;
  updateFails = false;
  checkFails = false;
  check = { valid: true, reason: null, discount_cents: 900 };
  row = openCart();
});

describe("applyPromoForTable — the staff write is atomic against the pay freeze", () => {
  it("applies on an open, unfrozen cart and voids the old grant", async () => {
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: true });
    // UPPERCASED, because `mms_promo_discount_live` looks the code up verbatim and the seed rows are
    // upper-case. A lower-case write would price at zero on every surface with no error anywhere.
    expect(row?.promo_code).toBe("PILOT15");
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("REFUSES while a tablemate holds a fresh pay lock, and leaves the live grant alone", async () => {
    row = openCart({ locked: true, locked_at: iso(30_000), locked_by: "u-2" });
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: false, reason: "locked" });
    // The money assertion: a live attempt's pin is what the webhook reconciles the charge against.
    expect(row?.promo_granted_cents).toBe(900);
    expect(row?.promo_code).toBeNull();
  });

  it("REFUSES while the table is settling, and leaves the live grant alone", async () => {
    row = openCart({ settle_at: iso(60_000) });
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: false, reason: "locked" });
    expect(row?.promo_granted_cents).toBe(900);
  });

  it("REFUSES while a LIVE intent names this cart — even past the lock TTL — and leaves the grant alone", async () => {
    // M152 (a), reached through the staff door. The lock expired five minutes ago; the intent it
    // minted captured and its webhook is late. Without this term the TTL-aware predicate lets the
    // code through and nulls the pin that capture reconciles against: a charged card and no order.
    row = openCart({
      locked: false,
      locked_at: iso(CART_LOCK_TTL_MS + 60_000),
      live_payment_intent_id: "pi_captured_late",
    });
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: false, reason: "locked" });
    expect(row?.promo_granted_cents).toBe(900);
    expect(row?.promo_code).toBeNull();
  });

  it("still APPLIES when the lock is STALE — an abandoned pay screen must not freeze the register", async () => {
    row = openCart({ locked: true, locked_at: iso(CART_LOCK_TTL_MS + 60_000), locked_by: "u-2" });
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: true });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("still APPLIES on a STALE settlement freeze — the TTL is the designed backstop, not a leak", async () => {
    // ⚠️ THIS ASSERTION WAS THE OTHER WAY ROUND FOR ONE COMMIT, and reverting it is the decision the
    // module docblock argues. `settle_at` is only ever nulled by a CLEAN release, so a strict
    // `settle_at IS NULL` predicate refuses both promo doors for the LIFE of a cart whose settlement
    // was merely abandoned — a split tapped and then paid in cash, or a terminal decline whose
    // `releaseSettlementFor` write failed (both call sites drop that error deliberately). Meanwhile
    // `canWrite` in the drill-down is TTL-aware, so the control renders ENABLED and the register taps
    // forever against "Someone's paying" for a payment that already died — and P2e re-opens, because
    // the merge refusal points at a remove that is itself refused. The Terminal window this would
    // have closed is real, PRE-EXISTING and repo-wide (`acquireSettlement` deliberately re-acquires
    // on a stale freeze, so `settleCash` already takes money there); closing it on the lowest-money
    // door at the price of a permanent dead end is a net regression. Filed as OPEN-ITEMS P3b.
    row = openCart({
      settle_at: iso(SETTLE_TTL_MS + 60_000),
      locked: false,
      locked_at: null,
      live_payment_intent_id: null,
    });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({ ok: true });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("APPLIES when no settlement has been started at all — the pilot's own happy path", async () => {
    // The other direction: Dad applies the code BEFORE settling, which is the flow PILOT_PLAN §5
    // describes. Nothing here may block that.
    row = openCart({ settle_at: null });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({ ok: true });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("still APPLIES when `locked` is true but `locked_at` is null — that is not a lock", async () => {
    row = openCart({ locked: true, locked_at: null });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({ ok: true });
  });

  it("REFUSES over a code the cart already carries, and says which situation that is", async () => {
    // The register's view is a 5s poll, so a diner can apply a code on their own phone while a
    // server has the (stale) apply form open. Without the `promo_code.is.null,promo_code.eq.<code>`
    // term that tap SILENTLY REPLACES a code the guest was already quoted, and the only trace is a
    // discount that changed. The reason matters as much as the refusal: `cart_closed` is what the
    // diagnosis answers without the attempted code passed to it — a verdict about a cart that is
    // demonstrably open, on a screen whose recovery (Remove) is one tap away.
    row = openCart({ promo_code: "WELCOME10", promo_granted_cents: 900 });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "code_applied",
    });
    expect(row?.promo_code).toBe("WELCOME10");
    expect(row?.promo_granted_cents).toBe(900);
  });

  it("still APPLIES the SAME code over itself — that is a pin refresh, not a replacement", async () => {
    // The over-blocking half. `eq.${normalized}` is what keeps a re-apply working, and a re-apply is
    // how a server clears a stale grant pinned for the code already on the cart. A bare
    // `promo_code.is.null` would refuse it and leave the pin — outranking the code it belongs to.
    // Lower-case IN, upper-case ON THE ROW: the predicate compares the NORMALIZED value, so a
    // mutant that dropped `.toUpperCase()` before building it would refuse this legitimate re-apply.
    row = openCart({ promo_code: "PILOT15", promo_granted_cents: 750 });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({ ok: true });
    expect(row?.promo_code).toBe("PILOT15");
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("answers cart_closed when the cart is genuinely closed", async () => {
    row = openCart({ status: "paid" });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "cart_closed",
    });
  });

  it("answers error — never a fabricated cart_closed — when the diagnosis read fails", async () => {
    row = openCart({ locked: true, locked_at: iso(30_000), locked_by: "u-2" });
    readFails = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(row?.promo_granted_cents).toBe(900);
  });

  it("answers error when the UPDATE itself fails — a transport failure is not a refusal", async () => {
    updateFails = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("applyPromoForTable — the gates before the write", () => {
  it("refuses an unauthenticated caller with signin, and writes NOTHING", async () => {
    auth = { kind: "anon" };
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "signin",
    });
    expect(row?.promo_code).toBeNull();
  });

  it("refuses a non-staff account with signin", async () => {
    auth = { kind: "not_staff" };
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "signin",
    });
  });

  it("answers OUTAGE — never signin — when the identity read is unavailable (W10b)", async () => {
    // Collapsing this into "go sign in" is the loop that ends in a destroyed board mid-service.
    auth = { kind: "unavailable" };
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "outage",
    });
  });

  it("refuses once the CALLER's rate window is spent, and writes NOTHING", async () => {
    rateAllows = false;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(row?.promo_code).toBeNull();
  });

  it("spends the STAFF ACCOUNT's budget, never the table's — the key is asserted, not assumed", async () => {
    // Without this the mock would answer the same for any argument, and a mutant re-keying the gate
    // to `sessionId` would survive. It is not a cosmetic difference: a session-keyed budget lets one
    // griefing table (or one server fat-fingering codes at it) lock the register's apply out for
    // every OTHER table, and a per-caller budget is what `STAFF_PROMO_RATE` exists to be.
    await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(rateKeys).toEqual(["st-1"]);
  });

  it("refuses a malformed request, naming the field that failed, and writes NOTHING", async () => {
    // The two halves get DIFFERENT verdicts, and that is the point (blind pass). A bad CODE is
    // honestly `invalid`. A bad session id is not a verdict about the code at all — answering
    // "that code isn't valid" because the page passed a bad id is the fabricated-diagnosis shape
    // this repo spent M116/M119 removing, and a test asserting it would PROTECT the wrong sentence.
    expect(await applyPromoForTable({ sessionId: SESSION, code: "   " })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await applyPromoForTable({ sessionId: "not-a-uuid", code: "pilot15" })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(row?.promo_code).toBeNull();
  });

  it("refuses a code carrying a PostgREST metacharacter, and writes NOTHING", async () => {
    // The code is interpolated into an `or()` term list (`promo_code.eq.${normalized}`), so a comma
    // or a parenthesis splits the list and 400s the whole UPDATE — a real owner-created code that
    // then fails PERMANENTLY at the register while the diner door, which has no such disjunct,
    // applies it fine. Bounded at the schema so the door answers `invalid` instead of "didn't save".
    for (const bad of ["HAPPY,HOUR", "SAVE(5)", "A.B", "TEN%OFF", "with space"]) {
      row = openCart();
      expect(await applyPromoForTable({ sessionId: SESSION, code: bad }), bad).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(row?.promo_code, bad).toBeNull();
    }
  });

  it("still accepts every shape a real promo code has", async () => {
    // The over-blocking direction. Every code on prod fits this set (PILOT15 · TEAHOUSE5 ·
    // WELCOME10, measured), and a bound that refused one of them would be the tip-cap lesson again.
    for (const good of ["PILOT15", "TEAHOUSE5", "welcome10", "SUMMER_24", "BOGO-2"]) {
      row = openCart();
      expect(await applyPromoForTable({ sessionId: SESSION, code: good }), good).toEqual({
        ok: true,
      });
      expect(row?.promo_code, good).toBe(good.toUpperCase());
    }
  });

  it("answers outage on an unreadable table — not 'that table is closed'", async () => {
    resolveUnavailable = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "outage",
    });
  });

  it("distinguishes a closed TABLE from a table with no open ORDER", async () => {
    sessionMissing = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "table_closed",
    });
    sessionMissing = false;
    cartMissing = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "no_order",
    });
  });

  it("refuses when a split share is already authorized, which the UPDATE's predicates cannot see", async () => {
    // A STALE `settle_at`, which is the exact state `paymentInFlightReason`'s share-count branch is
    // written for — it is "independent of the freshness TTL" (pay-guard.ts) because
    // `captureAllIfReady` deliberately captures on a stale freeze once the table is covered. So the
    // predicates below PASS this row, money has already been collected on it, and this pre-check is
    // the only thing standing between the two. That is what makes the guard reachable.
    row = openCart({ settle_at: iso(SETTLE_TTL_MS + 60_000) });
    inFlight = "split_in_progress";
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBeNull();
  });

  it("carries mms_promo_check's OWN verdict out verbatim, and writes NOTHING", async () => {
    // Every assertion carries the case label: a bare loop aborts on the first failure and names no
    // reason, so the report says "expected ok:false" about an input nobody can identify.
    for (const reason of ["expired", "min_not_met", "exhausted", "session_limit", "inactive"]) {
      row = openCart();
      check = { valid: false, reason, discount_cents: 0 };
      expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" }), reason).toEqual({
        ok: false,
        reason,
      });
      expect(row?.promo_code, reason).toBeNull();
      expect(row?.promo_granted_cents, reason).toBe(900);
    }
  });

  it("answers error when the validity RPC fails — an unreadable gate is not an invalid code", async () => {
    checkFails = true;
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(row?.promo_code).toBeNull();
  });
});

describe("clearPromoForTable — the remove carries the SAME five predicates (OPEN-ITEMS P2e)", () => {
  it("removes the code AND the pin in one write", async () => {
    row = openCart({ promo_code: "PILOT15", promo_granted_cents: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("nulls a PINNED grant too — `mms_promo_discount` returns the pin verbatim, so a code-only clear leaves a discount nothing can explain", async () => {
    row = openCart({ promo_code: "PILOT15", promo_granted_cents: 750 });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("REFUSES while a LIVE intent names this cart — a remove RAISES the re-derived total", async () => {
    row = openCart({
      promo_code: "PILOT15",
      promo_granted_cents: 900,
      locked: false,
      locked_at: iso(CART_LOCK_TTL_MS + 60_000),
      live_payment_intent_id: "pi_captured_late",
    });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBe("PILOT15");
    expect(row?.promo_granted_cents).toBe(900);
  });

  it("REFUSES under a fresh pay lock and under a live settlement freeze", async () => {
    row = openCart({ promo_code: "PILOT15", locked: true, locked_at: iso(30_000) });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBe("PILOT15");

    row = openCart({ promo_code: "PILOT15", settle_at: iso(60_000) });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("REFUSES on a closed cart", async () => {
    row = openCart({ promo_code: "PILOT15", status: "paid" });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "cart_closed",
    });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("still REMOVES when the lock is STALE — an abandoned pay screen must not strand a code", async () => {
    // The other direction, and it is the one that closes the P2e dead end: if a remove over-blocks
    // on an expired lock, the merge refusal points at an action that is itself refused for five
    // minutes. Over-blocking is as expensive as under-blocking.
    row = openCart({
      promo_code: "PILOT15",
      locked: true,
      locked_at: iso(CART_LOCK_TTL_MS + 60_000),
      locked_by: "u-2",
    });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("still REMOVES when `locked` is true but `locked_at` is null — that is not a lock", async () => {
    row = openCart({ promo_code: "PILOT15", locked: true, locked_at: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("still REMOVES on a STALE settlement freeze — parity with the apply, and with P2e", async () => {
    // The remove is the half that matters most here: it is the action the merge refusal points at,
    // so a strict `settle_at IS NULL` would leave a table that once tapped "Split the bill" unable
    // to remove a code OR merge, for the life of the cart, with no way out from any staff surface.
    row = openCart({
      promo_code: "PILOT15",
      settle_at: iso(SETTLE_TTL_MS + 60_000),
      locked: false,
      locked_at: null,
      live_payment_intent_id: null,
    });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("REMOVES when no settlement has been started — the merge-refusal recovery path stays open", async () => {
    row = openCart({ promo_code: "PILOT15", settle_at: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("is IDEMPOTENT — a second tap on a cart with no code is a no-op, and writes NOTHING", async () => {
    // Both halves. `ok` because the honest answer to "nothing to remove" is a no-op, not a
    // fabricated `cart_closed` from the diagnosis read — and NO WRITE, because this action is
    // deliberately unbounded, so an unconditional UPDATE makes every tap a `qr_carts` realtime
    // broadcast to the whole table plus a PostHog event plus two `revalidatePath`s, on a cart where
    // nothing changed. Row state alone cannot tell those apart: writing the same nulls looks
    // identical afterwards, which is why `updateCalls` exists.
    row = openCart({ promo_code: null, promo_granted_cents: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(updateCalls).toBe(0);
  });

  it("DOES write when only the PIN survives — a grant with no code is the P2e ghost discount", async () => {
    // The short-circuit is `code === null && pin === null`, not `code === null`. A pinned grant with
    // no code behind it is precisely the state `mms_promo_discount` returns VERBATIM, so skipping
    // the write here would leave a saving nothing on any surface can explain until the cart closes.
    row = openCart({ promo_code: null, promo_granted_cents: 750 });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(updateCalls).toBe(1);
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("refuses when a split share is already authorized — the predicates cannot see one", async () => {
    // The clear door needs this pre-check for the same reason the apply does, and worse: a remove
    // RAISES the total the webhook re-derives, so running one over a captured share is a charge that
    // can never reconcile. Stale freeze, so the UPDATE's own predicates PASS the row.
    row = openCart({ promo_code: "PILOT15", settle_at: iso(SETTLE_TTL_MS + 60_000) });
    inFlight = "split_in_progress";
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBe("PILOT15");
    expect(updateCalls).toBe(0);
  });

  it("is NOT rate-limited — it is the recovery path the merge refusal points at", async () => {
    rateAllows = false;
    row = openCart({ promo_code: "PILOT15" });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("still requires a signed-in staff caller", async () => {
    auth = { kind: "anon" };
    row = openCart({ promo_code: "PILOT15" });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "signin",
    });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("answers error when the UPDATE fails", async () => {
    row = openCart({ promo_code: "PILOT15" });
    updateFails = true;
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "error",
    });
  });
});
