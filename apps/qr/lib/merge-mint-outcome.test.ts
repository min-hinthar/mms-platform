import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A7b — `mintMergeToken`'s three answers, and why collapsing them into `null` lost value.
 *
 * The caller's question is "is anything lost if we abandon this anonymous session?", and the old
 * `string | null` return could not express it: `null` meant BOTH "a non-anonymous caller has nothing
 * to carry" (safe to proceed) and "we could not secure the carry" (proceeding destroys the diner's
 * orders permanently). The caller guessed proceed, every time.
 *
 * These cases pin each answer to the condition that produces it, so a future edit cannot quietly
 * re-merge two of them.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("@mms/db/schemas", () => ({
  mergeTokenInput: { safeParse: (x: { token: string }) => ({ success: true, data: x }) },
}));

let sessionUser: Record<string, unknown> | null = null;
let getUserThrows = false;
let insertError: { message: string } | null = null;
const inserted: Record<string, unknown>[] = [];

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: {
      getUser: () => {
        if (getUserThrows) return Promise.reject(new Error("network"));
        return Promise.resolve({ data: { user: sessionUser } });
      },
    },
  }),
  serviceClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: insertError });
      },
      delete: () => {
        const api: Record<string, unknown> = {
          eq: () => api,
          neq: () => Promise.resolve({ error: null }),
        };
        return api;
      },
    }),
  }),
}));

const { mintMergeToken } = await import("./merge");

beforeEach(() => {
  sessionUser = { id: "anon-1", is_anonymous: true };
  getUserThrows = false;
  insertError = null;
  inserted.length = 0;
});

describe("mintMergeToken", () => {
  it("mints for an anonymous caller and returns the token it stored", async () => {
    const out = await mintMergeToken();
    expect(out.kind).toBe("minted");
    if (out.kind !== "minted") throw new Error("unreachable: asserted minted above");
    expect(inserted).toHaveLength(1);
    // The token handed back MUST be the one bound in the row — the client stashes this exact value and
    // `redeemMergeToken` resolves the row by it. A mismatch would stash a proof nothing can redeem.
    expect(inserted[0]?.token).toBe(out.token);
    expect(inserted[0]?.anon_uid).toBe("anon-1");
  });

  it("mints a 256-bit URL-safe token", async () => {
    const out = await mintMergeToken();
    if (out.kind !== "minted") throw new Error("unreachable: asserted minted above");
    // 32 random bytes in base64url is 43 chars, and base64url must survive a URL and localStorage.
    expect(out.token).toHaveLength(43);
    expect(out.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("answers nothing-to-carry for a CONFIRMED non-anonymous caller", async () => {
    sessionUser = { id: "real-1", is_anonymous: false };
    expect(await mintMergeToken()).toEqual({ kind: "nothing-to-carry" });
  });

  it("answers nothing-to-carry when a real account OMITS the flag entirely", async () => {
    // A real account may surface `is_anonymous` as false or not at all — the repo's documented rule.
    // Reading the omission as anonymous here would mint a pointless token; reading it as a FAILURE
    // would block a sign-in that costs the diner nothing.
    sessionUser = { id: "real-2" };
    expect(await mintMergeToken()).toEqual({ kind: "nothing-to-carry" });
  });

  it("answers FAILED — not nothing-to-carry — when there is no user at all", async () => {
    // ⚠️ The direction that matters. An unreadable session is "we could not tell", and the old code
    // folded it in with the safe case: `!user || is_anonymous !== true` both returned null, so a
    // session read that came back empty let the redirect proceed and orphaned the device.
    sessionUser = null;
    expect(await mintMergeToken()).toEqual({ kind: "failed" });
  });

  it("answers failed when the insert errors", async () => {
    insertError = { message: "duplicate key" };
    expect(await mintMergeToken()).toEqual({ kind: "failed" });
  });

  it("answers failed when the session read throws", async () => {
    getUserThrows = true;
    expect(await mintMergeToken()).toEqual({ kind: "failed" });
  });

  it("never returns minted without having written a row", async () => {
    // The proof is the ROW, not the string: a token returned without a row behind it resolves to
    // nothing at redeem time, so the carry silently moves zero.
    insertError = { message: "boom" };
    const out = await mintMergeToken();
    expect(out.kind).not.toBe("minted");
  });
});
