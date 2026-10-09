import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD1 — `nudgeHost` against a scripted `mms_nudge_host`: the action is authz + one RPC, and what it
 * must get right is the ANSWER's reading — a zero-row refusal is a refusal with its reason, `recent`
 * is a success that carries the standing stamp, a thrown or errored call never claims a nudge.
 */
vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => ({
  nudgeHostInput: {
    safeParse: (x: unknown) => {
      const cartId = (x as { cartId?: unknown } | null)?.cartId;
      return typeof cartId === "string" && cartId.length > 0
        ? { success: true, data: { cartId } }
        : { success: false };
    },
  },
}));

type Authz = {
  uid: string;
  sessionId: string;
  role: "host" | "guest";
  locked: boolean;
  settling: boolean;
};
const GUEST: Authz = {
  uid: "s-thiri",
  sessionId: "sess",
  role: "guest",
  locked: false,
  settling: false,
};
let authz: Authz | (() => never) = GUEST;
class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
vi.mock("./authz", () => ({
  AuthzError,
  assertCartMember: () => {
    if (typeof authz === "function") return Promise.reject(authz());
    return Promise.resolve(authz);
  },
}));
let rateOk = true;
vi.mock("./rate", () => ({
  withinMutationRate: () => Promise.resolve(rateOk),
}));

type Row = { ok: boolean; reason: string; nudged_at: string | null };
let rpcAnswer: { data: Row[] | null; error: { message: string } | null } = {
  data: [{ ok: true, reason: "ok", nudged_at: "2026-10-08T10:00:00.000Z" }],
  error: null,
};
const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({ rpc }) }));

const { nudgeHost } = await import("./send-nudge");

beforeEach(() => {
  authz = GUEST;
  rateOk = true;
  rpc.mockClear();
  rpcAnswer = {
    data: [{ ok: true, reason: "ok", nudged_at: "2026-10-08T10:00:00.000Z" }],
    error: null,
  };
});

describe("nudgeHost", () => {
  it("a guest's nudge lands: the RPC is called with the caller's SEAT, never a client value", async () => {
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: true,
      nudgedAt: "2026-10-08T10:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("mms_nudge_host", {
      p_cart_id: "c-1",
      p_seat: "s-thiri",
    });
  });
  it("the host is refused before the RPC — the host waits on nobody", async () => {
    authz = { ...GUEST, role: "host" };
    // MUTATION (send-nudge/host-pre-check-dropped): the role check dropped — the host's tap reaches
    // the SQL (which refuses too); red by the call count.
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "is_host",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("`recent` is a SUCCESS carrying the standing stamp — the guest's line keeps showing", async () => {
    rpcAnswer = {
      data: [{ ok: false, reason: "recent", nudged_at: "2026-10-08T09:59:30.000Z" }],
      error: null,
    };
    // MUTATION (send-nudge/recent-read-as-a-failure): a second tap inside the minute says "That
    // didn't go through" over a nudge that stands; red.
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: true,
      nudgedAt: "2026-10-08T09:59:30.000Z",
    });
  });
  it("every SQL refusal is a refusal with its reason, and never claims a nudge", async () => {
    for (const reason of ["is_host", "no_host", "not_member"] as const) {
      rpcAnswer = {
        data: [{ ok: false, reason, nudged_at: null }],
        error: null,
      };
      expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
        ok: false,
        reason,
      });
    }
    rpcAnswer = {
      data: [{ ok: false, reason: "closed", nudged_at: null }],
      error: null,
    };
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
  });
  it("an errored or empty RPC, a lost session and the rate limit all fail honestly", async () => {
    rpcAnswer = { data: null, error: { message: "boom" } };
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "error",
    });
    rpcAnswer = { data: [], error: null };
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "error",
    });
    authz = () => new AuthzError("closed", 409, "cart_closed");
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
    authz = GUEST;
    rateOk = false;
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    expect(await nudgeHost({})).toMatchObject({ ok: false, reason: "error" });
  });
});
