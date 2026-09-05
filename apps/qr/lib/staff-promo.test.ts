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
vi.mock("./rate", () => ({ withinStaffPromoRate: () => Promise.resolve(rateAllows) }));

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

function builder(values: Row | null) {
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
    then(resolve: (r: { count: number; error: { message: string } | null }) => void) {
      if (updateFails) {
        resolve({ count: 0, error: { message: "update failed" } });
        return;
      }
      const hit = row !== null && matches(row, filters);
      if (hit && values) Object.assign(row as Row, values);
      resolve({ count: hit ? 1 : 0, error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      update: (values: Row) => builder(values),
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

  it("REFUSES on a STALE settlement freeze — the Stripe Terminal window (blind pass, CRITICAL)", async () => {
    // The reader PI is invisible to every other gate: `lib/terminal.ts` writes no `qr_carts` column
    // (`linkPaymentIntent` has exactly one caller, `create-intent`), never takes the single-pay
    // lock, and creates no share row — so `paymentInFlightReason` counts zero. Its only guard is
    // this freeze, kept alive by the register's CLIENT poll. Close the panel for ten minutes and a
    // TTL-aware predicate would let the promo move under a capturable charge: the capture then
    // reconciles to a different total and the guest is charged with no order.
    row = openCart({
      settle_at: iso(SETTLE_TTL_MS + 60_000),
      locked: false,
      locked_at: null,
      live_payment_intent_id: null,
    });
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBeNull();
    expect(row?.promo_granted_cents).toBe(900);
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

  it("diagnoses the stale-settle refusal as LOCKED, never a fabricated cart_closed", async () => {
    // The write and the diagnosis have to agree. Without `anySettleStarted` the diagnosis falls
    // through every branch and answers `cart_closed` on a cart that is demonstrably open — the
    // M116/M119 fabricated-verdict shape, on the one refusal that prevents a charged card with no
    // order. This asserts the REASON, which is the only thing that distinguishes the two.
    row = openCart({ settle_at: iso(SETTLE_TTL_MS + 60_000), status: "open" });
    const res = await applyPromoForTable({ sessionId: SESSION, code: "pilot15" });
    expect(res).toEqual({ ok: false, reason: "locked" });
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
    // ⚠️ `settle_at: null`, and that is the whole point of the fixture. It used to be a STALE
    // `settle_at`, and the Terminal fix above made that DEGENERATE: the tightened predicate now
    // refuses a stale freeze on its own, so dropping the `paymentInFlightReason` pre-check changed
    // no outcome and the mutant SURVIVED. `paymentInFlightReason`'s share-count branch is
    // explicitly "independent of the freshness TTL" (pay-guard.ts) — a cart whose settlement was
    // released while a share is still authorized/captured is exactly what it exists for, and it is
    // the ONE state where this pre-check is the only thing standing between a promo write and money
    // already collected. Separating the two paths is what makes the guard reachable.
    row = openCart({ settle_at: null });
    inFlight = "split_in_progress";
    expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBeNull();
  });

  it("carries mms_promo_check's OWN verdict out verbatim, and writes NOTHING", async () => {
    for (const reason of ["expired", "min_not_met", "exhausted", "session_limit", "inactive"]) {
      row = openCart();
      check = { valid: false, reason, discount_cents: 0 };
      expect(await applyPromoForTable({ sessionId: SESSION, code: "pilot15" })).toEqual({
        ok: false,
        reason,
      });
      expect(row?.promo_code).toBeNull();
      expect(row?.promo_granted_cents).toBe(900);
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

  it("REFUSES on a STALE settlement freeze — and this is the deterministic half", async () => {
    // A remove RAISES the total the webhook re-derives, so a captured reader charge can never
    // reconcile again. Same Terminal window as the apply; strictly worse outcome.
    row = openCart({
      promo_code: "PILOT15",
      settle_at: iso(SETTLE_TTL_MS + 60_000),
      locked: false,
      locked_at: null,
      live_payment_intent_id: null,
    });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(row?.promo_code).toBe("PILOT15");
  });

  it("REMOVES when no settlement has been started — the merge-refusal recovery path stays open", async () => {
    row = openCart({ promo_code: "PILOT15", settle_at: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
    expect(row?.promo_code).toBeNull();
  });

  it("is IDEMPOTENT — a second tap on a cart with no code is a no-op, never a fabricated refusal", async () => {
    row = openCart({ promo_code: null, promo_granted_cents: null });
    expect(await clearPromoForTable({ sessionId: SESSION })).toEqual({ ok: true });
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
