import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P5 — `getStaffFeedback` must REPORT a failed read, never answer one with an empty list.
 *
 * The T21(a) rule, on the surface that made it visible. postgrest-js RESOLVES a transport failure
 * into `{ data: null, error }`, and the old `(data ?? [])` turned that into zero rows — which
 * `/staff/feedback` rendered as the cheerful "No feedback yet. Diners are asked to rate after every
 * order." That was already the wrong sentence; the pilot's nightly sheet now sits directly above it
 * reading its rating count from a query that fails LOUD, so the same outage could put "7 ratings
 * tonight" and "No feedback yet" on one screen.
 *
 * ⚠️ THE FIXTURE SEPARATES THE TWO ANSWERS. A genuinely empty table must still return `ok` with no
 * rows — that is a real and common state — so a mutant that reported failure unconditionally is as
 * red as one that never reports it. `error`, not length, is what tells them apart.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
vi.mock("@mms/db/schemas", () => ({
  submitFeedbackInput: { parse: (x: unknown) => x },
}));
vi.mock("./rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));

let staffThrows: Error | null = null;
vi.mock("./staff", () => ({
  requireStaff: () => (staffThrows ? Promise.reject(staffThrows) : Promise.resolve({ uid: "u-1" })),
}));

type Result = { data: unknown[] | null; error: unknown };
let result: Result;
let selected: string[];

vi.mock("@mms/db/server", () => {
  const q = {
    select: (cols: string) => {
      selected.push(cols);
      return q;
    },
    order: () => q,
    limit: () => Promise.resolve(result),
  };
  return { serverClient: () => ({}), serviceClient: () => ({ from: () => q }) };
});

const { getStaffFeedback } = await import("./feedback");

beforeEach(() => {
  staffThrows = null;
  selected = [];
  result = { data: [], error: null };
});

describe("getStaffFeedback — an outage is not an empty inbox", () => {
  it("reports the rows when the read succeeds", async () => {
    result = {
      data: [
        { id: "f1", rating: 5, comment: "lovely", created_at: "2026-09-05T02:00:00.000Z" },
        { id: "f2", rating: 2, comment: null, created_at: "2026-09-05T01:00:00.000Z" },
      ],
      error: null,
    };
    const res = await getStaffFeedback();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toEqual([
      { id: "f1", rating: 5, comment: "lovely", createdAt: "2026-09-05T02:00:00.000Z" },
      { id: "f2", rating: 2, comment: null, createdAt: "2026-09-05T01:00:00.000Z" },
    ]);
  });

  it("reports a GENUINELY empty table as a successful empty read", async () => {
    // The state every quiet night is in. It must not be confused with a failure in either direction.
    result = { data: [], error: null };
    const res = await getStaffFeedback();
    expect(res).toEqual({ ok: true, rows: [] });
  });

  it("reports a FAILED read as a failure, not as no feedback", async () => {
    result = { data: null, error: { message: "connection reset" } };
    const res = await getStaffFeedback();
    expect(res).toEqual({ ok: false });
  });

  it("keeps the manager gate ahead of the read", async () => {
    staffThrows = new Error("Insufficient role");
    await expect(getStaffFeedback()).rejects.toThrow("Insufficient role");
    // Nothing was selected — the authorization decision came first, not after a service-role read.
    expect(selected).toEqual([]);
  });
});
