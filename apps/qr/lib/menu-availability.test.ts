import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W23a — the 86 toggle. `menu_items.is_sold_out` was read by ~15 surfaces and written by nothing, so
 * this is the first code that can ever set it. What has to stay true:
 *   - the role floor is SERVER (the cook at the wok must be able to flip it) but it IS a floor —
 *     a Server Action is a public POST endpoint and the console's UI gating is cosmetic;
 *   - a flip made against a STALE screen is refused, not applied (two people, one dish);
 *   - a zero-row update is a REFUSAL, not a silent success (`.update()` returns no row count);
 *   - a transport failure is not the verdict "no such dish";
 *   - `sold_out_at` is stamped with the flag and CLEARED on the way back, so a stale timestamp can
 *     never outlive the flag it describes — it is the only signal a flag has outlived its shift;
 *   - the ledger records the direction against the caller, and its failure is surfaced.
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

type Row = { id: string; name_en: string; is_sold_out: boolean } | null;
let itemRow: Row = { id: ITEM, name_en: "Mohinga", is_sold_out: false };
let readError: { message: string } | null = null;
let updatedRow: { id: string } | null = { id: ITEM };
let updateError: { message: string } | null = null;
let auditError: { message: string } | null = null;
/** Models a CONCURRENT flip: the row changes the instant our read returns — the read-then-write
 *  window the compare-and-swap exists to close. */
let raceTo: boolean | null = null;

const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
const audits: Record<string, unknown>[] = [];

/** The double models the CAS itself: `.eq()` filters are COLLECTED and the update resolves to a row
 *  only while the asserted `is_sold_out` still matches. A mock that ignored the filters would let a
 *  CAS-less implementation pass — the degenerate-fixture trap. */
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "menu_availability_audit") {
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
              // The other person's flip lands here — after we read, before we write.
              if (raceTo != null && itemRow) itemRow = { ...itemRow, is_sold_out: raceTo };
              return Promise.resolve({ data: seen, error: readError });
            }
            if (updateError) return Promise.resolve({ data: null, error: updateError });
            const cas = filters.is_sold_out;
            const stale = cas !== undefined && itemRow != null && cas !== itemRow.is_sold_out;
            if (stale || updatedRow == null) return Promise.resolve({ data: null, error: null });
            updates.push({ patch: patch ?? {}, filters });
            if (itemRow) itemRow = { ...itemRow, is_sold_out: patch?.is_sold_out as boolean };
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

const { setItemSoldOut } = await import("./menu-availability");

beforeEach(() => {
  gateCalls.length = 0;
  updates.length = 0;
  audits.length = 0;
  gateResult = { ok: true, caller: { staffId: "staff-1" } };
  itemRow = { id: ITEM, name_en: "Mohinga", is_sold_out: false };
  readError = null;
  updatedRow = { id: ITEM };
  updateError = null;
  auditError = null;
  raceTo = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const flip = (soldOut: boolean, expected = !soldOut) =>
  setItemSoldOut({ menuItemId: ITEM, soldOut, expectedSoldOut: expected });

describe("setItemSoldOut — the first thing that can ever set is_sold_out", () => {
  it("takes a dish off and stamps WHEN, because nothing else will clear it", async () => {
    const r = await flip(true);
    expect(r).toEqual({ ok: true, soldOut: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch.is_sold_out).toBe(true);
    // The stamp is the only signal a flag has outlived its shift — the owner chose a MANUAL
    // lifetime, so there is no timer that would otherwise reveal a stale 86.
    expect(typeof updates[0]!.patch.sold_out_at).toBe("string");
  });

  it("CLEARS the stamp on the way back, so it can never outlive its flag", async () => {
    itemRow = { id: ITEM, name_en: "Mohinga", is_sold_out: true };
    const r = await flip(false);
    expect(r).toEqual({ ok: true, soldOut: false });
    expect(updates[0]!.patch.is_sold_out).toBe(false);
    expect(updates[0]!.patch.sold_out_at).toBeNull();
  });

  it("gates on a STAFF role — a Server Action is a public POST, the console's gating is cosmetic", async () => {
    await flip(true);
    expect(gateCalls).toEqual(["server"]);
  });

  it("refuses a signed-out caller and writes nothing", async () => {
    gateResult = { ok: false, error: "Staff sign-in required." };
    const r = await flip(true);
    expect(r.ok).toBe(false);
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("refuses a flip made against a STALE screen", async () => {
    // Someone else already took it off; this tap was made on a render that showed it available.
    itemRow = { id: ITEM, name_en: "Mohinga", is_sold_out: true };
    const r = await setItemSoldOut({ menuItemId: ITEM, soldOut: true, expectedSoldOut: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Mohinga");
    expect(updates).toEqual([]);
    expect(audits).toEqual([]); // no ledger row for a decision nobody made
  });

  it("loses a CONCURRENT flip honestly rather than reporting success", async () => {
    // Our read sees available; the other tablet writes sold-out before our update lands. The CAS
    // matches zero rows — and without the `.select("id")` verdict that reads as success.
    raceTo = true;
    const r = await flip(true);
    expect(r.ok).toBe(false);
    expect(audits).toEqual([]);
  });

  it("treats a zero-row update as a refusal, not a silent success", async () => {
    updatedRow = null;
    const r = await flip(true);
    expect(r.ok).toBe(false);
    expect(audits).toEqual([]);
  });

  it("does not turn a transport failure into 'that dish is gone'", async () => {
    // postgrest-js RESOLVES a failure into { data: null, error } — a data-only destructure would
    // answer "no such dish" about a dish that is right there.
    readError = { message: "network" };
    itemRow = null;
    const r = await flip(true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("no longer on the menu");
    expect(updates).toEqual([]);
  });

  it("is a no-op with NO ledger row when the dish is already in that state", async () => {
    itemRow = { id: ITEM, name_en: "Mohinga", is_sold_out: true };
    const r = await setItemSoldOut({ menuItemId: ITEM, soldOut: true, expectedSoldOut: true });
    expect(r).toEqual({ ok: true, soldOut: true });
    expect(updates).toEqual([]);
    // Two cooks tapping 86 on the same empty pan is one decision, not two.
    expect(audits).toEqual([]);
  });

  it("records WHO took the dish off and in which direction", async () => {
    await flip(true);
    expect(audits).toEqual([
      {
        menu_item_id: ITEM,
        changed_by: "staff-1",
        sold_out: true,
        changed_at: updates[0]!.patch.sold_out_at,
      },
    ]);
    // The invariant, not just the field's presence: ONE instant reaches both writes, so the dish's
    // "sold out since" stamp and its ledger entry can never disagree about when the cook decided.
    expect(typeof updates[0]!.patch.sold_out_at).toBe("string");
  });

  it("surfaces a ledger failure instead of swallowing it into a clean success", async () => {
    auditError = { message: "insert failed" };
    const r = await flip(true);
    expect(r.ok).toBe(false);
    // The flag DID land and the copy says so — an unrecorded correct 86 beats putting a dish the
    // kitchen cannot make back on sale.
    expect(updates).toHaveLength(1);
    if (!r.ok) expect(r.error).toContain("off the menu");
  });
});
