import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2f · P2v (Codex r3 on #308) — `/api/session` never attaches a diner to a counter order.
 *
 * A register (`reg-`) counter order is minted by staff with NO member row. The route used to refuse
 * only CREATING a reserved code, so a client that knew an active `reg-` code could JOIN it — become a
 * member (and, on its null `host_seat`, its host) — and add a to-go draft after staff reviewed the
 * order but before Send. The counter Send fires every draft, so an item nobody at the counter saw
 * reached the kitchen unpaid. The decision is `reservedCodeRefusal` (lib/session-code.ts, falsified
 * by value there); this suite pins the WIRING: a refused join answers before ANY write — no expiry
 * slide, no host claim, no membership, no cart.
 */

vi.mock("server-only", () => ({}));

const SEAT = "00000000-0000-0000-0000-00000000cx30";

type Sess = {
  id: string;
  mode: string;
  host_seat: string | null;
  qr_code: string;
  table_number: number | null;
};

/** The active session `findActive` sees for the requested code (null = none). */
let active: Sess | null = null;
/** Every write the route issued, as `table:op`. */
let writes: string[] = [];

vi.mock("@/lib/authz", () => ({ isTransportFailure: () => false }));
vi.mock("@/lib/rate", () => ({ withinJoinRate: () => Promise.resolve(true) }));
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));

vi.mock("@mms/db/server", () => ({
  sessionClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: SEAT } }, error: null }) },
  }),
  serviceClient: () => ({
    from: (table: string) => {
      let op: "select" | "insert" | "update" = "select";
      let row: Record<string, unknown> | null = null;
      const result = () => {
        if (op === "insert") {
          if (table === "table_sessions")
            return {
              data: { id: "sess-new", mode: "dinein", host_seat: SEAT, table_number: null, ...row },
              error: null,
            };
          if (table === "qr_carts") return { data: { id: "cart-1" }, error: null };
          return { data: null, error: null };
        }
        if (op === "update") return { data: { host_seat: SEAT }, error: null };
        if (table === "table_sessions") return { data: active, error: null };
        if (table === "qr_carts") return { data: { id: "cart-1" }, error: null };
        return { data: null, count: 0, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        lte: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: (r: Record<string, unknown>) => {
          op = "insert";
          row = r;
          writes.push(`${table}:insert`);
          return chain;
        },
        update: () => {
          op = "update";
          writes.push(`${table}:update`);
          return chain;
        },
        maybeSingle: () => Promise.resolve(result()),
        single: () => Promise.resolve(result()),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(res, rej),
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

function req(body: Record<string, unknown>) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: (h: string) => (h === "authorization" ? "Bearer anon-token" : null) },
  } as unknown as Parameters<typeof POST>[0];
}

function sess(qr_code: string, mode: string, host_seat: string | null = null): Sess {
  return { id: "sess-1", mode, host_seat, qr_code, table_number: null };
}

beforeEach(() => {
  active = null;
  writes = [];
});

describe("/api/session — reserved codes (Codex r3 on #308)", () => {
  it("refuses a diner JOIN to an active reg- counter order, before any write", async () => {
    active = sess("reg-ABCD1234", "pickup");
    for (const mode of ["pickup", "dinein", "scango"]) {
      const res = await POST(req({ qrCode: "reg-ABCD1234", mode }));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string; cartId?: string };
      expect(body.error).toMatch(/counter order/);
      expect(body.cartId).toBeUndefined();
    }
    // No expiry slide, no host claim, no membership row, no cart — the join touched nothing.
    expect(writes).toEqual([]);
  });

  it("still refuses CREATING a reg- session (no active one)", async () => {
    const res = await POST(req({ qrCode: "reg-ABCD1234", mode: "pickup" }));
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("still lets a device join an active kiosk- session", async () => {
    active = sess("kiosk-ABCD1234", "pickup", SEAT);
    const res = await POST(req({ qrCode: "kiosk-ABCD1234", mode: "pickup" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cartId: string; role: string; joinCode: string };
    expect(body).toMatchObject({ cartId: "cart-1", role: "host", joinCode: "kiosk-ABCD1234" });
  });

  it("an ordinary dine-in sticker join is unaffected", async () => {
    active = sess("ABCD2345", "dinein", "someone-else");
    const res = await POST(req({ qrCode: "ABCD2345", mode: "dinein" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cartId: string; role: string; created: boolean };
    expect(body).toMatchObject({ cartId: "cart-1", role: "guest", created: false });
    expect(writes).toContain("session_members:insert");
  });
});
