import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readMyLiveOrders` answers WHETHER the read succeeded, so /account's live row (and the chooser note
 * that reads the same list) keeps its last good list on a failure instead of applying an empty one.
 * An auth lookup that ERRORED is a failed read, not "signed out" (Codex round 2 on #302): the wake
 * refresh would otherwise erase the only order status on the page. A confirmed signed-out answer
 * (no session at all) is a real, empty result.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

/** Every query chain resolves to an empty, successful read. */
function chain(): unknown {
  const done = Promise.resolve({ data: [], error: null });
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "gt", "neq", "in", "or", "order", "limit"])
    api[m] = () => api;
  api.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done.then(res, rej);
  return api;
}

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({ auth: { getUser: () => h.getUser() } }),
  serviceClient: () => ({ from: () => chain() }),
}));

const { readMyLiveOrders } = await import("./orders");

beforeEach(() => {
  h.getUser.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readMyLiveOrders — an auth ERROR is a failed read, not a signed-out one", () => {
  it("a transient auth failure reports ok:false (RED when it answers ok:true with [])", async () => {
    h.getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" }),
    });
    await expect(readMyLiveOrders()).resolves.toEqual({ ok: false, orders: [] });
  });

  it("a confirmed signed-out answer (no session) is a real, empty result", async () => {
    h.getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError" }),
    });
    await expect(readMyLiveOrders()).resolves.toEqual({ ok: true, orders: [] });
  });

  it("a signed-in read whose queries succeed is ok", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "uid-1" } }, error: null });
    await expect(readMyLiveOrders()).resolves.toEqual({ ok: true, orders: [] });
  });
});
