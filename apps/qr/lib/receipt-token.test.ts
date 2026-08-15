import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W7a — the durable receipt token IS the entire authorization on the session-less `?r=` view, so
 * every predicate is pinned here (the orders-payers.test.ts pattern: the mock RECORDS the query;
 * the assertions are about the predicate, not a chosen answer). The mock deliberately answers a
 * ROW for any un-predicated read — so a mutant that drops the shape gate or the expiry predicate
 * turns a refusal test red instead of passing vacuously.
 */

vi.mock("server-only", () => ({}));

type Q = {
  table: string;
  cols: string;
  eq: [string, unknown][];
  gt: [string, string][];
  upserted?: Record<string, unknown>;
  updated?: Record<string, unknown>;
  onConflict?: string;
};
let queries: Q[] = [];
let tokenRow: { token?: string; expires_at?: string; order_id?: string } | null = null;
let upsertError: { message: string } | null = null;

function table(name: string) {
  const q: Q = { table: name, cols: "", eq: [], gt: [] };
  queries.push(q);
  const api = {
    select(cols: string) {
      q.cols = cols;
      return api;
    },
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    gt(col: string, val: string) {
      q.gt.push([col, val]);
      return api;
    },
    maybeSingle() {
      return Promise.resolve({ data: tokenRow, error: null });
    },
    upsert(row: Record<string, unknown>, opts: { onConflict?: string }) {
      q.upserted = row;
      q.onConflict = opts.onConflict;
      return Promise.resolve({ error: upsertError });
    },
    update(row: Record<string, unknown>) {
      q.updated = row;
      return api;
    },
    then(res: (v: { error: null }) => unknown) {
      // Awaited update chains (the sliding-TTL bump) land here.
      return Promise.resolve({ error: null }).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({ serviceClient: () => ({ from: table }) }));

const { isReceiptTokenShape, mintReceiptToken, resolveReceiptOrder, RECEIPT_TOKEN_TTL_MS } =
  await import("./receipt-token");

const ORDER = "22222222-2222-4222-8222-222222222222";
const GOOD_TOKEN = "A".repeat(43); // base64url shape

beforeEach(() => {
  queries = [];
  tokenRow = null;
  upsertError = null;
});

describe("isReceiptTokenShape", () => {
  it("accepts a 43-char base64url bearer, refuses junk and pathological input", () => {
    expect(isReceiptTokenShape(GOOD_TOKEN)).toBe(true);
    expect(isReceiptTokenShape("short")).toBe(false);
    expect(isReceiptTokenShape("has spaces ".repeat(5))).toBe(false);
    expect(isReceiptTokenShape("x".repeat(500))).toBe(false);
    expect(isReceiptTokenShape(null)).toBe(false);
  });
});

describe("resolveReceiptOrder — the predicate IS the authorization", () => {
  it("resolves only by exact token AND unexpired (the expiry lives in the query)", async () => {
    tokenRow = { order_id: ORDER };
    const r = await resolveReceiptOrder(GOOD_TOKEN);
    expect(r).toBe(ORDER);
    const q = queries.find((x) => x.table === "mms_receipt_tokens");
    expect(q?.eq).toContainEqual(["token", GOOD_TOKEN]);
    // Without this predicate an EXPIRED link resolves forever — the TTL is the whole bound on a
    // forwarded/leaked bearer.
    expect(q?.gt.some(([col]) => col === "expires_at")).toBe(true);
  });

  it("refuses a junk-shaped token WITHOUT touching the database", async () => {
    tokenRow = { order_id: ORDER }; // the mock would answer — the shape gate must never ask
    await expect(resolveReceiptOrder("../../etc/passwd")).resolves.toBeNull();
    expect(queries).toHaveLength(0);
  });
});

describe("mintReceiptToken — one stable token per order", () => {
  it("reuses a LIVE stored token, sliding its TTL (an emailed link must not die under the diner)", async () => {
    tokenRow = {
      token: "stored-token",
      expires_at: new Date(Date.now() + 1000_000).toISOString(),
    };
    await expect(mintReceiptToken(ORDER)).resolves.toBe("stored-token");
    const read = queries.find((x) => x.table === "mms_receipt_tokens");
    expect(read?.eq).toContainEqual(["order_id", ORDER]);
    expect(queries.some((x) => x.upserted)).toBe(false); // no rotation while the stored one is live
    // The sliding bump (review MED — the email's "works for 90 days" must be true on a re-send)
    // targets the STORED token and extends, never shortens.
    const bump = queries.find((x) => x.updated);
    expect(bump?.eq).toContainEqual(["token", "stored-token"]);
    const exp = new Date(bump?.updated?.expires_at as string).getTime();
    expect(exp).toBeGreaterThan(Date.now() + RECEIPT_TOKEN_TTL_MS - 60_000);
  });

  it("rotates an EXPIRED token — never revives the old value", async () => {
    tokenRow = { token: "dead-token", expires_at: new Date(Date.now() - 1000).toISOString() };
    const minted = await mintReceiptToken(ORDER);
    expect(minted).not.toBeNull();
    expect(minted).not.toBe("dead-token");
    const q = queries.find((x) => x.upserted);
    expect(q?.onConflict).toBe("order_id");
    expect(q?.upserted?.order_id).toBe(ORDER);
    // The fresh expiry is a real future TTL, computed not transcribed.
    const exp = new Date(q?.upserted?.expires_at as string).getTime();
    expect(exp).toBeGreaterThan(Date.now() + RECEIPT_TOKEN_TTL_MS - 60_000);
  });

  it("returns null when the write fails (best-effort — never a broken receipt)", async () => {
    upsertError = { message: "boom" };
    await expect(mintReceiptToken(ORDER)).resolves.toBeNull();
  });
});
