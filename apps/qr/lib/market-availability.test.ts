import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
/**
 * M190 (lifecycle residuals) — `setGroceryAvailable`, the first writer `grocery_items.available` has
 * had, and proof that its write REACHES the shopper: the same fake table backs the staff write, the
 * scan (`scanAdd` → "unavailable") and the aisle grid (`getGroceryCatalog`). The fake EVALUATES every
 * `.eq()` the write chains, so a dropped compare-and-swap term changes which row moves.
 * verify:slice mutants: `lcr/market-availability/*`.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The gate as `staffGate` answers it: ok, or a refusal sentence (signin · role · outage). */
let gate: { ok: true } | { ok: false; error: string } = { ok: true };
let gateRole: string | null = null;
vi.mock("./staff", () => ({
  staffGate: (role: string, outage: string) => {
    gateRole = role;
    void outage;
    return Promise.resolve(
      gate.ok ? { ok: true, caller: { staffId: "st", role: "server" } } : gate,
    );
  },
}));
// The shopper's scan path, as `grocery-scan.test.ts` mocks it: a member of a scan-and-go basket.
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({
      uid: "seat-1",
      sessionId: "sess-1",
      role: "host",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: "scango",
    }),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./cart-failure", () => ({ whyCartUnavailable: () => Promise.resolve("unreadable") }));
let added = 0;
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => {
    added += 1;
    return Promise.resolve();
  },
  touchCart: () => Promise.resolve(),
}));

type Row = Record<string, unknown>;
const JAR = "88800011";
let items: Row[] = [];
let failRead = false;
let failWrite = false;
/** A write landing between the action's read and its compare-and-swap (another tablet). */
let beforeWrite: (() => void) | null = null;
let writes = 0;

function chain(kind: "select" | "update", patch: Row | null) {
  const filters: ((r: Row) => boolean)[] = [];
  let cols: string | null = null;
  const run = () => {
    if (kind === "select" && failRead) return { data: null, error: { message: "boom" } };
    if (kind === "update") {
      if (failWrite) return { data: null, error: { message: "boom" } };
      if (beforeWrite) {
        const w = beforeWrite;
        beforeWrite = null;
        w();
      }
      writes += 1;
    }
    const hit = items.filter((r) => filters.every((f) => f(r)));
    if (kind === "update") for (const r of hit) Object.assign(r, patch);
    const shaped = cols
      ? hit.map((r) => Object.fromEntries(cols!.split(",").map((c) => [c, r[c]])))
      : hit;
    return { data: shaped, error: null };
  };
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c;
      return api;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return api;
    },
    order: () => api,
    maybeSingle() {
      const r = run();
      return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
    },
    then(res: (v: unknown) => unknown) {
      return Promise.resolve(run()).then(res);
    },
  };
  return api;
}
const client = () => ({
  from: () => ({
    select: (c: string) => (chain("select", null).select as (c: string) => unknown)(c),
    update: (patch: Row) => chain("update", patch),
  }),
});
vi.mock("@mms/db/server", () => ({ serviceClient: client, publicClient: client }));

const { setGroceryAvailable } = await import("./market-availability");
const { scanAdd, getGroceryCatalog } = await import("./grocery");

const CART = "11111111-1111-4111-8111-111111111111";
const jar = () => items.find((r) => r.barcode === JAR)!;

beforeEach(() => {
  items = [
    {
      barcode: JAR,
      name: "Pickled tea leaf",
      name_my: null,
      brand: null,
      category: "tea-laphet",
      size_qty: null,
      size_unit: null,
      price_cents: 650,
      compare_at_cents: null,
      tax_category: "grocery_food",
      ebt_eligible: true,
      weighed: false,
      available: true,
      image_url: null,
      is_featured_deal: false,
    },
  ];
  gate = { ok: true };
  gateRole = null;
  failRead = false;
  failWrite = false;
  beforeWrite = null;
  writes = 0;
  added = 0;
});

describe("setGroceryAvailable — the market's out-of-stock toggle", () => {
  it("marks a jar out of stock, and the SHOPPER sees it: the scan refuses and the grid drops it", async () => {
    // Before: the jar scans and is on the grid.
    expect((await scanAdd(CART, JAR)).ok).toBe(true);
    expect((await getGroceryCatalog()).map((i) => i.barcode)).toEqual([JAR]);
    added = 0;

    const r = await setGroceryAvailable({
      barcode: JAR,
      available: false,
      expectedAvailable: true,
    });
    expect(r).toEqual({ ok: true, available: false });
    expect(jar().available).toBe(false);
    // The shopper's three doors: the scan answers "unavailable" and writes nothing; the grid leaves it out.
    expect(await scanAdd(CART, JAR)).toEqual({ ok: false, reason: "unavailable", barcode: JAR });
    expect(added).toBe(0);
    expect(await getGroceryCatalog()).toEqual([]);

    // And back in stock: scannable again.
    expect(
      await setGroceryAvailable({ barcode: JAR, available: true, expectedAvailable: false }),
    ).toEqual({ ok: true, available: true });
    expect((await scanAdd(CART, JAR)).ok).toBe(true);
  });

  it("is gated at the SERVER floor — the same role rule as the menu's 86", async () => {
    await setGroceryAvailable({ barcode: JAR, available: false, expectedAvailable: true });
    expect(gateRole).toBe("server");
  });

  it("a refused gate writes nothing and says its sentence", async () => {
    gate = { ok: false, error: "Sign in again." };
    expect(
      await setGroceryAvailable({ barcode: JAR, available: false, expectedAvailable: true }),
    ).toEqual({ ok: false, error: "Sign in again.", code: "sentence" });
    expect(jar().available).toBe(true);
    expect(writes).toBe(0);
  });

  it("a flip made against a STALE screen is refused, and nothing is written", async () => {
    jar().available = false; // another tablet already marked it
    const r = await setGroceryAvailable({
      barcode: JAR,
      available: false,
      expectedAvailable: true,
    });
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(writes).toBe(0);
  });

  it("the compare-and-swap: a write landing between the read and the swap is NOT overwritten", async () => {
    // The action reads `available: true`; before its swap another tablet marks it OUT. The swap is
    // keyed on the state just read, so it must match nothing.
    beforeWrite = () => {
      jar().available = false;
    };
    const r = await setGroceryAvailable({
      barcode: JAR,
      available: false,
      expectedAvailable: true,
    });
    // Zero rows, read back through `.select(…)`: "someone else", never a claimed success.
    expect(r).toMatchObject({ ok: false, code: "stale" });
    expect(jar().available).toBe(false);
  });

  it("the row count is READ: a swap that matched nothing never answers ok", async () => {
    beforeWrite = () => {
      items = []; // the item left the catalog mid-flip
    };
    const r = await setGroceryAvailable({
      barcode: JAR,
      available: false,
      expectedAvailable: true,
    });
    expect(r).toMatchObject({ ok: false, code: "gone" });
  });

  it("already in the requested state: ok, and no second write", async () => {
    expect(
      await setGroceryAvailable({ barcode: JAR, available: true, expectedAvailable: true }),
    ).toEqual({ ok: true, available: true });
    expect(writes).toBe(0);
  });

  it("an unknown barcode is gone; a failed read or write is the outage, never 'no such item'", async () => {
    expect(
      await setGroceryAvailable({ barcode: "99999999", available: false, expectedAvailable: true }),
    ).toMatchObject({ ok: false, code: "gone" });
    failRead = true;
    // The outage is the dictionary's sentence verbatim — the string `<OutageText>` twins in Burmese
    // (Codex r2 on #363); a reworded literal here would silently stay English on a Burmese tablet.
    expect(
      await setGroceryAvailable({ barcode: JAR, available: false, expectedAvailable: true }),
    ).toEqual({ ok: false, code: "sentence", error: STAFF["browse.market.err.outage"].en });
    failRead = false;
    failWrite = true;
    expect(
      await setGroceryAvailable({ barcode: JAR, available: false, expectedAvailable: true }),
    ).toMatchObject({ ok: false, code: "sentence" });
    expect(jar().available).toBe(true);
  });

  it("a malformed request is refused before the gate", async () => {
    expect(
      await setGroceryAvailable({
        barcode: "not-a-code",
        available: false,
        expectedAvailable: true,
      }),
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(gateRole).toBeNull();
  });
});
