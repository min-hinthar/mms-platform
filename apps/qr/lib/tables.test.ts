import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3c-ii (D23) — the picker's occupancy is keyed on the table NUMBER through the ONE predicate
 * (`seatedTableNumbers`), and a failed read is NO list.
 *
 * Both halves were live defects (findings 1 and 6): occupancy keyed on the sticker TOKEN read a
 * generated-code session bound to 7 as "Open" — the bind (D21) writes the number and never the
 * code, so every late-bound table would have been offered as empty — and `{ data: active }` with no
 * error branch marked EVERY table Open when the sessions read failed.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

type Answer = { data: unknown; error: { message: string } | null };
let registry: Answer = { data: [], error: null };
let sessions: Answer = { data: [], error: null };
/** Every table_sessions read's predicates, so the number-keyed shape is asserted here too. */
let sessionEqs: [string, unknown][] = [];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const eqs: [string, unknown][] = [];
      const answer = () => (table === "qr_tables" ? registry : sessions);
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eqs.push([col, val]);
          if (table === "table_sessions") sessionEqs.push([col, val]);
          return chain;
        },
        gt: () => chain,
        order: () => chain,
        then: (res: (v: Answer) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(res, rej),
      };
      return chain;
    },
  }),
}));

const { getDineInTables } = await import("./tables");

const TABLES = [
  { table_number: 7, qr_code: "STICKER7" },
  { table_number: 8, qr_code: "STICKER8" },
];

beforeEach(() => {
  registry = { data: TABLES, error: null };
  sessions = { data: [], error: null };
  sessionEqs = [];
});

describe("getDineInTables — occupancy by NUMBER, through the one predicate", () => {
  it("a generated-code session bound to 7 reads OCCUPIED (the token could never see it)", async () => {
    sessions = {
      data: [{ id: "s1", mode: "dinein", host_seat: "a", qr_code: "GENCODE7", table_number: 7 }],
      error: null,
    };
    expect(await getDineInTables()).toEqual([
      { tableNumber: 7, occupied: true },
      { tableNumber: 8, occupied: false },
    ]);
  });

  it("a NUMBERLESS live session on a table's own sticker (the stranded shape) reads OCCUPIED — the same party `seatedSessionFor`'s token read finds (Codex r2 on #314)", async () => {
    sessions = {
      data: [{ id: "s1", mode: "dinein", host_seat: "a", qr_code: "STICKER7", table_number: null }],
      error: null,
    };
    expect(await getDineInTables()).toEqual([
      { tableNumber: 7, occupied: true },
      { tableNumber: 8, occupied: false },
    ]);
  });

  it("a numberless session on a GENERATED code marks nothing (no sticker to map it to)", async () => {
    sessions = {
      data: [
        { id: "s1", mode: "dinein", host_seat: "a", qr_code: "GENCODE12", table_number: null },
      ],
      error: null,
    };
    expect(await getDineInTables()).toEqual([
      { tableNumber: 7, occupied: false },
      { tableNumber: 8, occupied: false },
    ]);
  });

  it("the token never reaches the client: the output carries numbers and occupancy only", async () => {
    const out = await getDineInTables();
    for (const t of out) expect(Object.keys(t).sort()).toEqual(["occupied", "tableNumber"]);
  });

  it("the sessions read is the live-dine-in predicate, never keyed on qr_code", async () => {
    await getDineInTables();
    expect(sessionEqs).toContainEqual(["mode", "dinein"]);
    expect(sessionEqs).toContainEqual(["status", "active"]);
    expect(sessionEqs.some(([col]) => col === "qr_code")).toBe(false);
  });

  it("a FAILED sessions read is no list at all — never every table Open (finding 6)", async () => {
    sessions = { data: null, error: { message: "fetch failed" } };
    expect(await getDineInTables()).toEqual([]);
  });

  it("a failed registry read degrades to [] as before", async () => {
    registry = { data: null, error: { message: "fetch failed" } };
    expect(await getDineInTables()).toEqual([]);
  });
});
