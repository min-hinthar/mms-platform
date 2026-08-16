import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W17b — the price editor is the ONE place a money amount crosses from a human into the system, so
 * every rule that keeps it honest is pinned here:
 *   - the MANAGER floor is server-side (the console's UI gating is cosmetic; a Server Action is a
 *     public POST endpoint), and the refusal must not have touched the price;
 *   - the amount is bounded BEFORE any gate or write — an out-of-range price is rejected, never
 *     clamped into something plausible. The REAL `setMenuPriceInput` schema is used here (not a
 *     stand-in), so a widened bound in `packages/db` reddens this file;
 *   - a zero-row update is a REFUSAL, not a silent success (`.update()` returns no row count, so
 *     only the chained `.select("id")` makes it visible);
 *   - a transport failure on the read is not the verdict "no such dish" (postgrest-js RESOLVES a
 *     failure into `{ data: null, error }`);
 *   - the ledger records old → new against the caller's staffId, and its failure is surfaced rather
 *     than swallowed into a clean success — a price change with no record of who made it is the one
 *     thing the table exists to prevent.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let gateResult: { ok: true; caller: { staffId: string } } | { ok: false; error: string } = {
  ok: true,
  caller: { staffId: "staff-1" },
};
const gateCalls: unknown[] = [];
vi.mock("./staff", () => ({
  staffGate: (minRole?: string) => {
    gateCalls.push(minRole);
    return Promise.resolve(gateResult);
  },
  STAFF_WRITE_OUTAGE: "outage",
}));

const ITEM = "11111111-1111-4111-8111-111111111111";

type Row = { id: string; name_en: string; base_price_cents: number } | null;
let itemRow: Row = { id: ITEM, name_en: "Mohinga", base_price_cents: 1400 };
let readError: { message: string } | null = null;
let updatedRow: { id: string } | null = { id: ITEM };
let updateError: { message: string } | null = null;
let auditError: { message: string } | null = null;
/** Set to model a CONCURRENT edit: the row's price changes to this the instant our read returns,
 *  which is exactly the read-then-write window the compare-and-swap exists to close. */
let raceTo: number | null = null;

const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
const audits: Record<string, unknown>[] = [];

/**
 * The double models the real chain shape — and, critically, the COMPARE-AND-SWAP: `.eq()` filters are
 * COLLECTED, and the update resolves to a row only when the asserted `base_price_cents` still matches
 * the row's current value. A mock that ignored the filters would let a CAS-less implementation pass,
 * which is the degenerate-fixture trap.
 */
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "menu_price_audit") {
        return {
          insert: (row: Record<string, unknown>) => {
            audits.push(row);
            return Promise.resolve({ error: auditError });
          },
        };
      }
      const mk = (mode: "read" | "write", patch?: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          maybeSingle: () => {
            if (mode === "read") {
              const seen = itemRow;
              // The other manager's write lands here — after we read, before we write.
              if (raceTo != null && itemRow) itemRow = { ...itemRow, base_price_cents: raceTo };
              return Promise.resolve({ data: seen, error: readError });
            }
            if (updateError) return Promise.resolve({ data: null, error: updateError });
            // The CAS: the asserted price must still be the row's price, or the update matches
            // nothing — exactly what a concurrent write does in Postgres.
            const cas = filters.base_price_cents;
            const stale = cas !== undefined && itemRow != null && cas !== itemRow.base_price_cents;
            if (stale || updatedRow == null) return Promise.resolve({ data: null, error: null });
            updates.push({ patch: patch ?? {}, filters });
            if (itemRow)
              itemRow = { ...itemRow, base_price_cents: patch?.base_price_cents as number };
            return Promise.resolve({ data: updatedRow, error: null });
          },
          update: (p: Record<string, unknown>) => mk("write", p),
        };
        return chain;
      };
      return mk("read");
    },
  }),
}));

const { setMenuPrice } = await import("./menu-price");

beforeEach(() => {
  gateCalls.length = 0;
  updates.length = 0;
  audits.length = 0;
  gateResult = { ok: true, caller: { staffId: "staff-1" } };
  itemRow = { id: ITEM, name_en: "Mohinga", base_price_cents: 1400 };
  readError = null;
  updatedRow = { id: ITEM };
  updateError = null;
  auditError = null;
  raceTo = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setMenuPrice — the one human-entered amount in the app", () => {
  it("W21d — refuses when the price MOVED since the manager's screen rendered", async () => {
    // The screen showed $14 → the manager confirms $16 — but another manager already set $18.
    // The old id-keyed CAS read the LIVE $18 and wrote $16 anyway; the confirmation was a lie.
    itemRow = { id: ITEM, name_en: "Mohinga", base_price_cents: 1800 };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("$18.00");
    expect(updates).toEqual([]); // nothing written
    expect(audits).toEqual([]); // no ledger row claiming a change that shouldn't happen
  });

  it("writes the new price and records old → new against the caller", async () => {
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r).toEqual({ ok: true, priceCents: 1600 });
    expect(updates.map((u) => u.patch)).toEqual([{ base_price_cents: 1600 }]);
    // The write is compare-and-swapped on the price we read, not just the id.
    expect(updates[0]?.filters).toEqual({ id: ITEM, base_price_cents: 1400 });
    expect(audits).toEqual([
      {
        menu_item_id: ITEM,
        changed_by: "staff-1",
        old_price_cents: 1400,
        new_price_cents: 1600,
      },
    ]);
  });

  it("gates at MANAGER, and a refused caller changes nothing", async () => {
    gateResult = { ok: false, error: "That needs a manager — ask one to step in." };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r).toEqual({ ok: false, error: "That needs a manager — ask one to step in." });
    expect(gateCalls).toEqual(["manager"]); // not the default "server" floor
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it.each([
    ["below the floor", 24],
    ["above the ceiling", 500001],
    ["negative", -1400],
    ["fractional cents", 1400.5],
  ])("refuses a price %s before the gate or any write", async (_label, priceCents) => {
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    // Bounded BEFORE the gate: an out-of-range amount never reaches an authorization check, and is
    // never clamped into a plausible-looking price.
    expect(gateCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("a zero-row update over a VANISHED dish says the dish is gone", async () => {
    updatedRow = null; // the `.select("id")` came back empty — the write matched nothing
    itemRow = null; // ...and the re-read confirms it: the dish is really gone
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r).toEqual({ ok: false, error: "That dish is no longer on the menu." });
    expect(audits).toHaveLength(0); // no price moved, so no ledger row claims one did
  });

  it("LOSING the race changes nothing and names the price that won", async () => {
    // Another manager set it to 1800 between our read and our write. The compare-and-swap matches
    // zero rows, so our 1600 must NOT land — and, above all, no ledger row may claim we changed it
    // "from 1400", which was already gone. That stale old_price_cents is the whole reason for the CAS.
    raceTo = 1800; // our read sees 1400; the row is 1800 by the time our write runs
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Someone else just set");
      expect(r.error).toContain("$18.00");
    }
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("a read TRANSPORT failure is an outage, never the verdict 'no such dish'", async () => {
    itemRow = null;
    readError = { message: "fetch failed" };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    expect(r).not.toEqual({ ok: false, error: "That dish is no longer on the menu." });
    expect(updates).toHaveLength(0);
  });

  it("a genuinely missing dish says so", async () => {
    itemRow = null;
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r).toEqual({ ok: false, error: "That dish is no longer on the menu." });
  });

  it("a write failure reports the failure — never a success we did not get", async () => {
    updateError = { message: "violates check constraint" };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    expect(audits).toHaveLength(0);
  });

  it("setting the SAME price is a no-op — no write, no ledger row", async () => {
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1400, expectedPriceCents: 1400 });
    expect(r).toEqual({ ok: true, priceCents: 1400 });
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("an unrecorded change is surfaced, not swallowed into a clean success", async () => {
    auditError = { message: "insert failed" };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600, expectedPriceCents: 1400 });
    expect(r.ok).toBe(false);
    // The price DID land, and the copy has to say so — the manager must not re-enter it and be
    // told nothing changed, nor walk away believing the log has their name in it.
    expect(updates.map((u) => u.patch)).toEqual([{ base_price_cents: 1600 }]);
    if (!r.ok) expect(r.error).toContain("Price saved");
  });
});
