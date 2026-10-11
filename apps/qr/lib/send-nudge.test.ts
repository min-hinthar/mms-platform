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
let authz: Authz | (() => Error) = GUEST;
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

type Row = { ok: boolean; reason: string; nudged_at: string | null; nudge_seat: string | null };
const LANDED: Row = {
  ok: true,
  reason: "ok",
  nudged_at: "2026-10-08T10:00:00.000Z",
  nudge_seat: "s-thiri",
};
let rpcAnswer: { data: Row[] | null; error: { message: string } | null } = {
  data: [LANDED],
  error: null,
};
const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({ rpc }) }));

const { nudgeHost } = await import("./send-nudge");

beforeEach(() => {
  authz = GUEST;
  rateOk = true;
  rpc.mockClear();
  rpcAnswer = { data: [LANDED], error: null };
});

describe("nudgeHost", () => {
  it("a guest's nudge lands: the RPC is called with the caller's SEAT, never a client value", async () => {
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: true,
      nudge: { seat: "s-thiri", at: "2026-10-08T10:00:00.000Z" },
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
  it("a payment holding the cart refuses the nudge before the RPC — nobody can send under it", async () => {
    // MUTATION (send-nudge/nudge-ignores-the-pay-lock): the refusal dropped — a stamp lands naming a
    // wait nobody can end, while the Bill hides the button; red by the reason and the call count.
    for (const freeze of [{ locked: true }, { settling: true }]) {
      rpc.mockClear();
      authz = { ...GUEST, ...freeze };
      expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
        ok: false,
        reason: "locked",
      });
      expect(rpc).not.toHaveBeenCalled();
    }
  });
  it("`recent` is a SUCCESS carrying the standing stamp — the guest's line keeps showing", async () => {
    rpcAnswer = {
      data: [
        {
          ok: false,
          reason: "recent",
          nudged_at: "2026-10-08T09:59:30.000Z",
          nudge_seat: "s-thiri",
        },
      ],
      error: null,
    };
    // MUTATION (send-nudge/recent-read-as-a-failure): a second tap inside the minute says "That
    // didn't go through" over a nudge that stands; red.
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: true,
      nudge: { seat: "s-thiri", at: "2026-10-08T09:59:30.000Z" },
    });
  });
  it("ANOTHER seat's standing stamp is `taken`, carrying THAT seat — never a success for the caller", async () => {
    // The blind pass on #335: Thiri nudged; Mya taps inside the minute. The answer names Thiri's
    // stamp, and Mya is never told "Aye can see you're waiting" for a nudge that is not hers.
    authz = { ...GUEST, uid: "s-mya" };
    rpcAnswer = {
      data: [
        {
          ok: false,
          reason: "taken",
          nudged_at: "2026-10-08T09:59:30.000Z",
          nudge_seat: "s-thiri",
        },
      ],
      error: null,
    };
    // MUTATION (send-nudge/taken-read-as-a-success): `taken` mapped to ok — Mya's phone settles over
    // Thiri's nudge; red.
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "taken",
      nudge: { seat: "s-thiri", at: "2026-10-08T09:59:30.000Z" },
    });
  });
  it("a success carries the SERVER's seat — a `recent` naming another seat is refused, never relabelled", async () => {
    // The action trusts the stamp it reads, not the phone that asked: a `recent` row whose seat is
    // not the caller's is not a shape `mms_nudge_host` writes, so it is never read as theirs.
    authz = { ...GUEST, uid: "s-mya" };
    rpcAnswer = {
      data: [
        {
          ok: false,
          reason: "recent",
          nudged_at: "2026-10-08T09:59:30.000Z",
          nudge_seat: "s-thiri",
        },
      ],
      error: null,
    };
    // MUTATION (send-nudge/recent-trusts-any-seat): the seat check dropped — Mya reads Thiri's
    // stamp as her own; red.
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({ ok: false, reason: "error" });
    // …and an `ok` whose stamp names ANOTHER seat is refused too (the last blind pass on #335: the
    // guard covered `recent` only). The SQL always stamps the caller, so this row is not one it
    // writes — never a success, never a confirmation drawn over someone else's stamp.
    rpcAnswer = { data: [LANDED], error: null };
    // MUTATION (send-nudge/ok-trusts-any-seat): the seat check dropped from the ok branch — Mya is
    // told her nudge landed over Thiri's stamp; red.
    // MUTATION (send-nudge/success-reports-the-callers-seat): the stamp's seat taken from the caller
    // instead of the row — the foreign stamp relabelled as Mya's own and reported ok; red.
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({ ok: false, reason: "error" });
    // …while the caller's own landed nudge reports the seat the SQL stamped.
    authz = GUEST;
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: true,
      nudge: { seat: "s-thiri", at: "2026-10-08T10:00:00.000Z" },
    });
  });
  it("a fresh freeze the SQL saw (`paying`) and nothing left to send are refusals with their own words", async () => {
    rpcAnswer = {
      data: [{ ok: false, reason: "paying", nudged_at: null, nudge_seat: null }],
      error: null,
    };
    expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({ ok: false, reason: "locked" });
    rpcAnswer = {
      data: [{ ok: false, reason: "nothing_to_send", nudged_at: null, nudge_seat: null }],
      error: null,
    };
    // MUTATION (send-nudge/nothing-to-send-read-as-a-failure): the reason dropped to the generic
    // failure — "try again" over a cart with nothing to send; red.
    expect(await nudgeHost({ cartId: "c-1" })).toEqual({
      ok: false,
      reason: "nothing_to_send",
      error: "There’s nothing waiting to send right now.",
    });
  });
  it("a closed cart is never called PAID — a merge cancels one, a sweep closes its table", async () => {
    rpcAnswer = {
      data: [{ ok: false, reason: "closed", nudged_at: null, nudge_seat: null }],
      error: null,
    };
    const r = await nudgeHost({ cartId: "c-1" });
    // MUTATION (send-nudge/closed-said-as-paid): the old "already paid" sentence restored; red.
    expect(r).toMatchObject({ ok: false, reason: "closed" });
    expect(r.ok === false && r.error).toBe(
      "This order has moved or closed — there’s nothing to send.",
    );
    expect(r.ok === false && r.error).not.toMatch(/paid/i);
  });
  it("every SQL refusal is a refusal with its reason, and never claims a nudge", async () => {
    for (const reason of ["is_host", "no_host", "not_member"] as const) {
      rpcAnswer = {
        data: [{ ok: false, reason, nudged_at: null, nudge_seat: null }],
        error: null,
      };
      expect(await nudgeHost({ cartId: "c-1" })).toMatchObject({
        ok: false,
        reason,
      });
    }
    rpcAnswer = {
      data: [{ ok: false, reason: "closed", nudged_at: null, nudge_seat: null }],
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
