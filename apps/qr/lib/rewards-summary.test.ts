import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T12 — the rewards error→null rule, made mechanical.
 *
 * W9c/J8 fixed a real defect in all three `mms_rewards_summary` readers: a swallowed RPC error left
 * `summary` null, the `?? 0` fallbacks below it rendered, and a diner sitting on Gold was shown an
 * authoritative-looking **zeroed hub** — 0 Stars, $0 lifetime, tier `new`. Worse, `TierUpCelebration`
 * banks that fabricated rank in localStorage as its baseline, so the NEXT healthy visit fires a
 * full-screen "Tier unlocked" for a climb that never happened.
 *
 * The fix was three `if (summaryErr) return null` guards and NOTHING pinned them: there was no
 * `rewards.ts` suite, and the file's only mutant (`rewards/history-payer-read-unscoped`) covers a
 * different function. Deleting any one of the three restored J8 with every check green.
 *
 * ⚠️ EACH READER IS TESTED IN BOTH DIRECTIONS. A suite that only asserted "an error yields null"
 * would pass against a reader that returns null unconditionally — which is its own defect (a
 * permanently blank rewards hub), and exactly the degenerate fixture `verify:slice` calls a
 * surviving mutant. The happy-path case is what separates the two.
 */

vi.mock("server-only", () => ({}));

/** The RPC's answer for the next call — set per test. */
let rpcAnswer: { data: unknown; error: unknown } = { data: null, error: null };
let rpcCalls: { fn: string; args: unknown }[] = [];

function sel() {
  const api = {
    select: () => api,
    eq: () => api,
    is: () => api,
    gt: () => api,
    order: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return api;
}

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("./staff", () => ({ getStaffAuth: () => Promise.resolve(null) }));
vi.mock("./rate", () => ({ withinMutationRate: () => Promise.resolve(true) }));
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "uid-1", email: null, is_anonymous: true } } }),
    },
  }),
  serviceClient: () => ({
    from: () => sel(),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcAnswer);
    },
  }),
}));

const { getRewardsState, getRewardsBadge, getRewardsProgress } = await import("./rewards");

/** A healthy summary that is NOT the zeroed fabrication — every field differs from the `?? 0`
 *  fallbacks, so a reader that silently falls back cannot pass the happy-path assertions. */
const GOLD = {
  stars: 23,
  spend_cents: 41_250,
  tier_id: "gold",
  milestone_step: 5,
  orders_to_next: 2,
};

beforeEach(() => {
  rpcCalls = [];
  rpcAnswer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** The three readers, each with the field that proves it did NOT fabricate. */
const READERS = [
  {
    name: "getRewardsState",
    read: () => getRewardsState(),
    healthy: (r: Record<string, unknown> | null) => {
      expect(r?.stars).toBe(23);
      expect(r?.spendCents).toBe(41_250);
      expect(r?.tierId).toBe("gold");
    },
  },
  {
    name: "getRewardsBadge",
    read: () => getRewardsBadge(),
    healthy: (r: Record<string, unknown> | null) => {
      expect(r?.stars).toBe(23);
      expect(r?.tierId).toBe("gold");
    },
  },
  {
    name: "getRewardsProgress",
    read: () => getRewardsProgress(),
    healthy: (r: Record<string, unknown> | null) => {
      expect(r?.stars).toBe(23);
      expect(r?.tierId).toBe("gold");
      expect(r?.ordersToNext).toBe(2);
    },
  },
] as const;

describe("mms_rewards_summary readers — a failed read is not 'you have nothing'", () => {
  for (const reader of READERS) {
    it(`${reader.name} returns null when the summary RPC errors`, async () => {
      rpcAnswer = { data: null, error: { message: "boom", code: "57014" } };
      // MUTATION: drop this reader's `if (summaryErr) return null` → the `?? 0` fallbacks render a
      // zeroed hub as fact, and this assertion fails.
      await expect(reader.read()).resolves.toBeNull();
    });

    it(`${reader.name} still reports a HEALTHY summary — the guard is not an unconditional null`, async () => {
      rpcAnswer = { data: GOLD, error: null };
      const r = (await reader.read()) as Record<string, unknown> | null;
      expect(r).not.toBeNull();
      reader.healthy(r);
    });

    it(`${reader.name} reads the summary for the caller's OWN uid`, async () => {
      rpcAnswer = { data: GOLD, error: null };
      await reader.read();
      const call = rpcCalls.find((c) => c.fn === "mms_rewards_summary");
      // The identity is the whole authorization: this read runs service-role, so an unscoped or
      // client-supplied uid would hand one diner another's balance.
      expect(call).toBeTruthy();
      expect(call?.args).toEqual({ p_user: "uid-1" });
    });
  }

  it("a brand-new diner (no row, no error) is NOT treated as a failure", async () => {
    // ⚠️ The guard is on the ERROR, deliberately not on `!summary`: a first-time diner legitimately
    // has no summary row, and the `?? 0` fallbacks are exactly what renders their first visit.
    // Narrowing the guard to `if (!summary) return null` would blank the hub for every new diner.
    rpcAnswer = { data: null, error: null };
    const r = await getRewardsBadge();
    expect(r).not.toBeNull();
    expect(r?.stars).toBe(0);
    expect(r?.tierId).toBe("new");
  });
});
