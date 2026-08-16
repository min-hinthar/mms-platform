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

const updates: Record<string, unknown>[] = [];
const audits: Record<string, unknown>[] = [];

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
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve(
            updates.length > 0
              ? { data: updatedRow, error: updateError }
              : { data: itemRow, error: readError },
          ),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return chain;
        },
      };
      return chain;
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setMenuPrice — the one human-entered amount in the app", () => {
  it("writes the new price and records old → new against the caller", async () => {
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r).toEqual({ ok: true, priceCents: 1600 });
    expect(updates).toEqual([{ base_price_cents: 1600 }]);
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
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
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
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents });
    expect(r.ok).toBe(false);
    // Bounded BEFORE the gate: an out-of-range amount never reaches an authorization check, and is
    // never clamped into a plausible-looking price.
    expect(gateCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("a zero-row update is a refusal, not a silent success", async () => {
    updatedRow = null; // the `.select("id")` came back empty — the write matched nothing
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r).toEqual({ ok: false, error: "That dish is no longer on the menu." });
    expect(audits).toHaveLength(0); // no price moved, so no ledger row claims one did
  });

  it("a read TRANSPORT failure is an outage, never the verdict 'no such dish'", async () => {
    itemRow = null;
    readError = { message: "fetch failed" };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r.ok).toBe(false);
    expect(r).not.toEqual({ ok: false, error: "That dish is no longer on the menu." });
    expect(updates).toHaveLength(0);
  });

  it("a genuinely missing dish says so", async () => {
    itemRow = null;
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r).toEqual({ ok: false, error: "That dish is no longer on the menu." });
  });

  it("a write failure reports the failure — never a success we did not get", async () => {
    updateError = { message: "violates check constraint" };
    updatedRow = null;
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r.ok).toBe(false);
    expect(audits).toHaveLength(0);
  });

  it("setting the SAME price is a no-op — no write, no ledger row", async () => {
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1400 });
    expect(r).toEqual({ ok: true, priceCents: 1400 });
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("an unrecorded change is surfaced, not swallowed into a clean success", async () => {
    auditError = { message: "insert failed" };
    const r = await setMenuPrice({ menuItemId: ITEM, priceCents: 1600 });
    expect(r.ok).toBe(false);
    // The price DID land, and the copy has to say so — the manager must not re-enter it and be
    // told nothing changed, nor walk away believing the log has their name in it.
    expect(updates).toEqual([{ base_price_cents: 1600 }]);
    if (!r.ok) expect(r.error).toContain("Price saved");
  });
});
