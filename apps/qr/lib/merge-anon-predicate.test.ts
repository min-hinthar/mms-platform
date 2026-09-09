import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A7 — WHO COUNTS AS SIGNED IN, at the seam where getting it wrong is silent and permanent.
 *
 * `redeemMergeToken` answers `null` for a caller it reads as still anonymous, and `null` means
 * "retry later" — the token is deliberately NOT spent. So a predicate that is too strict does not
 * fail loudly: the merge simply spins on every /account load for the rest of the account's life
 * while the diner's orders sit on the abandoned anonymous uid. That is the shape of the owner's
 * report, and it is invisible from a passing build.
 *
 * The rule this repo documents (`rewards.ts:54-58`) and applies at six other sites: test
 * `is_anonymous !== true`, never `=== false`. An anonymous session always carries the flag as
 * `true`; a REAL account may surface it as `false` OR omit it entirely depending on the
 * GoTrue/session shape, and `undefined !== false` is true.
 *
 * ⚠️ This suite exists because `MergeRedeemer.test.tsx` CANNOT cover it: that suite mocks
 * `@/lib/merge` wholesale, so the real predicate never executes there and the mutant survived.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("@mms/db/schemas", () => ({
  mergeTokenInput: { safeParse: (x: { token: string }) => ({ success: true, data: x }) },
}));

let sessionUser: Record<string, unknown> | null = null;
const rpc = vi.fn();

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: sessionUser } }) },
  }),
  serviceClient: () => ({
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        update: () => api,
        eq: () => api,
        is: () => api,
        gt: () => api,
        maybeSingle: () => Promise.resolve({ data: { anon_uid: "anon-1" }, error: null }),
        then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }),
      };
      return api;
    },
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));

const { redeemMergeToken } = await import("./merge");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { orders: 2, stars: 4, coupons: 1 }, error: null });
  sessionUser = { id: "acct-1", is_anonymous: false };
});

describe("redeemMergeToken — the anonymous test", () => {
  it("merges for an account whose session says is_anonymous: false", async () => {
    const res = await redeemMergeToken("tok");
    expect(res).toEqual({ orders: 2, stars: 4, coupons: 1 });
    expect(rpc).toHaveBeenCalledWith("mms_merge_anon_rewards", {
      p_anon: "anon-1",
      p_target: "acct-1",
    });
  });

  it("merges for an account whose session OMITS is_anonymous — the case `=== false` drops", async () => {
    // The whole point of the rule. Under the stricter test this returns null, which the client reads
    // as "not signed in yet" and retries forever, so the orders never move and nothing reports an
    // error. The two shapes are indistinguishable to every other assertion in this file.
    sessionUser = { id: "acct-2" };
    const res = await redeemMergeToken("tok");
    expect(res).toEqual({ orders: 2, stars: 4, coupons: 1 });
    expect(rpc).toHaveBeenCalledWith("mms_merge_anon_rewards", {
      p_anon: "anon-1",
      p_target: "acct-2",
    });
  });

  it("refuses — retryably — for an ANONYMOUS caller, and never calls the merge", async () => {
    // The direction that must NOT loosen: an anon session merging into itself would move nothing and
    // burn the proof. `null` rather than a zero summary, because the token has to stay redeemable.
    sessionUser = { id: "anon-1", is_anonymous: true };
    const res = await redeemMergeToken("tok");
    expect(res).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses retryably when there is no session at all", async () => {
    sessionUser = null;
    const res = await redeemMergeToken("tok");
    expect(res).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
