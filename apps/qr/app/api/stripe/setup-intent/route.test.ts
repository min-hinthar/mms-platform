import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M116 — a refusal that fails closed must not also fabricate a diagnosis.
 *
 * Securing a tab is a dine-in concept, so the route refuses a pickup/scan-and-go session with
 * "Tabs are for dine-in tables." That sentence is TRUE for a genuine pickup session and FALSE for
 * an unreadable one — and the route reached it either way, because it resolved the mode in a SECOND
 * read whose `{ error }` it discarded:
 *
 *     const { data: sess } = await db.from("table_sessions").select("mode")…
 *     if (sess?.mode !== "dinein") return … "Tabs are for dine-in tables." … 400
 *
 * On a failed read `sess` is null, `sess?.mode` is undefined, `undefined !== "dinein"` passes, and a
 * diner sitting at a real dine-in table is told their table is not one. The refusal was right; the
 * SENTENCE was a claim about their session that the code never learned.
 *
 * ── Why the window is real and not merely theoretical ───────────────────────────────────────────
 * `assertCartMember` reads `table_sessions` too, and it already fails CLOSED (503) on an unreadable
 * row. So the interesting case is not "the database is down for the whole request" — it is the gap
 * BETWEEN the two reads: authz succeeds, a blip lands, the route's own read fails. Case 2 is exactly
 * that, and it is the one the old code got wrong. The fix removes the window by removing the second
 * read: `mode` now comes off the row `assertCartMember` already proved active (M108).
 *
 * ── What each case is for ───────────────────────────────────────────────────────────────────────
 *   1. a genuine pickup session still gets the specific, TRUE sentence — the fix must not cost it
 *   2. authz OK + the route's own session read failing must NOT produce that sentence  ← the defect
 *   3. an unreadable session at authz time surfaces as the 503 it already is, not a 400
 *   4. a dine-in session still mints the SetupIntent
 *   5. the route must not read `table_sessions` AT ALL — the structural pin that keeps the second
 *      read deleted rather than merely corrected
 */

vi.mock("server-only", () => ({}));

/**
 * Hoisted because `vi.mock` factories are lifted above every top-level statement: the factory below
 * uses this class as a VALUE, so declaring it normally throws "Cannot access before initialization".
 * The mutable fixtures (`authzResult`, `authzThrows`, `tablesRead`) do not need it — they are only
 * dereferenced inside the arrow functions, at call time.
 */
const { AuthzError } = vi.hoisted(() => {
  class AuthzError extends Error {
    status: 401 | 403 | 404 | 503;
    code?: string;
    constructor(message: string, status: 401 | 403 | 404 | 503, code?: string) {
      super(message);
      this.name = "AuthzError";
      this.status = status;
      this.code = code;
    }
  }
  return { AuthzError };
});

const SESSION = "00000000-0000-0000-0000-0000001160aa";
const CART = "00000000-0000-0000-0000-0000001160cc";

let authzResult: { sessionId: string; uid: string; mode: string } | null = null;
// `AuthzError` here is a const binding from the hoisted factory, not a class DECLARATION, so it is
// a value only — `InstanceType<typeof …>` is how you name what it constructs.
let authzThrows: InstanceType<typeof AuthzError> | null = null;
/** Every table the route touched — case 5 asserts `table_sessions` is not among them. */
let tablesRead: string[] = [];

vi.mock("@/lib/authz", () => ({
  AuthzError,
  assertCartMember: () => {
    if (authzThrows) return Promise.reject(authzThrows);
    return Promise.resolve(authzResult);
  },
}));

vi.mock("@/lib/rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: () => {} }),
}));

vi.mock("@mms/db/schemas", () => ({
  secureTabInput: { parse: (v: { cartId: string }) => ({ cartId: v.cartId }) },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { create: () => Promise.resolve({ id: "cus_test116" }) },
    setupIntents: { create: () => Promise.resolve({ client_secret: "seti_test116_secret" }) },
  }),
}));

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      tablesRead.push(table);
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        upsert: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: { message: "read failed" } }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

function req(cartId = CART) {
  return { json: () => Promise.resolve({ cartId }) } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  authzThrows = null;
  tablesRead = [];
  authzResult = { sessionId: SESSION, uid: "seat-1", mode: "dinein" };
});

describe("M116 — setup-intent refuses without fabricating a diagnosis", () => {
  it("1. still tells a genuine pickup session the true, specific reason", async () => {
    authzResult = { sessionId: SESSION, uid: "seat-1", mode: "pickup" };
    const res = await POST(req());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Tabs are for dine-in tables." });
  });

  it("2. THE DEFECT — a blip between the two reads must not call a dine-in table a pickup one", async () => {
    // authz succeeded and reported dinein; the route's OWN session read is the one that fails. The
    // mocked `single()` above always errors, so the old code's `sess?.mode !== "dinein"` passed and
    // answered "Tabs are for dine-in tables." to a seated diner. The fixed route never asks.
    authzResult = { sessionId: SESSION, uid: "seat-1", mode: "dinein" };
    const res = await POST(req());
    const body = (await res.json()) as { error?: string; clientSecret?: string };
    expect(body.error).not.toBe("Tabs are for dine-in tables.");
    expect(res.status).toBe(200);
    expect(body.clientSecret).toBe("seti_test116_secret");
  });

  it("3. an unreadable session at authz time stays the 503 it already is", async () => {
    authzThrows = new AuthzError(
      "We’re having trouble on our end — try again in a moment",
      503,
      "unavailable",
    );
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toBe("Tabs are for dine-in tables.");
    expect(body.error).toContain("trouble on our end");
  });

  it("4. a dine-in session still mints the SetupIntent", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientSecret: "seti_test116_secret" });
  });

  it("5. the route never reads table_sessions — the second read is DELETED, not corrected", async () => {
    await POST(req());
    expect(tablesRead).not.toContain("table_sessions");
    // and it does still reach its own sidecar, so case 5 is not passing because nothing ran
    expect(tablesRead).toContain("mms_tab_secure");
  });
});
