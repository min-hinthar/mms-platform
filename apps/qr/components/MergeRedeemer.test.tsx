/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A7 — THE ORDERS THAT DID NOT FOLLOW THE DINER.
 *
 * The owner's report was "orders not automatically linked" after signing in. The cause was a
 * SEQUENCE, not a broken call, which is why it needs a component suite rather than a pure module:
 * every individual piece worked, and they ran in the wrong order.
 *
 * A diner reaches /account BEFORE they sign in — that is what the page is for — so this component
 * mounts while `AccountUpgrade` has minted no merge token at all. The old code read that absence as
 * a terminal verdict and latched `done`, disarming itself permanently; the SIGNED_IN that arrived
 * seconds later, once the token DID exist, hit the guard and returned. The merge never ran.
 *
 * These tests drive the real sequence: mount empty → token appears → auth event → redeem. Asserting
 * on `redeemMergeToken` CALLS rather than on the celebration overlay, because the linkage is what
 * regressed; the overlay is downstream of it and can be silent on a legitimate nothing-to-merge.
 */

const redeemMergeToken = vi.fn();
vi.mock("@/lib/merge", () => ({ redeemMergeToken: (t: string) => redeemMergeToken(t) }));

let storedToken: string | null = null;
const clearMergeToken = vi.fn(() => {
  storedToken = null;
});
vi.mock("@/lib/mergeTokenStore", () => ({
  readMergeToken: () => storedToken,
  clearMergeToken: () => clearMergeToken(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@mms/ui", () => ({
  useAnimationPreference: () => ({ shouldAnimate: false }),
  useDeviceTier: () => "low",
}));
vi.mock("./Confetti", () => ({ Confetti: () => null }));

// The auth listener, captured so a test can fire the events Supabase would.
type Listener = (event: string, session: unknown) => void;
let listener: Listener | null = null;
const unsubscribe = vi.fn();
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    auth: {
      onAuthStateChange: (cb: Listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

const { MergeRedeemer } = await import("./MergeRedeemer");

/** A real (non-anonymous) account session, in the shape the listener tests against. */
const ACCOUNT = { user: { id: "u-1", is_anonymous: false } };

/** Flush the deferred mount attempt, which rides requestAnimationFrame. */
async function settle() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await Promise.resolve();
  });
}

afterEach(cleanup);
beforeEach(() => {
  redeemMergeToken.mockReset();
  redeemMergeToken.mockResolvedValue({ orders: 2, stars: 4, coupons: 0 });
  clearMergeToken.mockClear();
  storedToken = null;
  listener = null;
});

describe("MergeRedeemer — a token minted AFTER mount still gets redeemed", () => {
  it("redeems on the sign-in event even though the mount found no token", async () => {
    // THE REPORTED DEFECT, in its exact order. Mount is the ordinary first frame of a session: the
    // diner has not signed in, so there is nothing stashed. Then they enter their email, the token
    // is minted, the code is verified, and SIGNED_IN fires.
    render(<MergeRedeemer />);
    await settle();
    expect(redeemMergeToken).not.toHaveBeenCalled(); // nothing to redeem YET — correct so far

    storedToken = "tok-1"; // AccountUpgrade mints it while the diner submits their email
    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      await Promise.resolve();
    });

    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledWith("tok-1"));
    expect(clearMergeToken).toHaveBeenCalled(); // terminal outcome — the token is spent
  });

  it("still redeems on a USER_UPDATED confirm, the other shape a real account arrives in", async () => {
    render(<MergeRedeemer />);
    await settle();
    storedToken = "tok-2";
    await act(async () => {
      listener?.("USER_UPDATED", ACCOUNT);
      await Promise.resolve();
    });
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledWith("tok-2"));
  });

  it("never redeems for an ANONYMOUS session, however many events arrive", async () => {
    // The anon gate mints sessions constantly; a merge fired on one would move nothing and burn the
    // token. `is_anonymous: true` is the only explicitly-anonymous shape.
    render(<MergeRedeemer />);
    await settle();
    storedToken = "tok-3";
    await act(async () => {
      listener?.("SIGNED_IN", { user: { id: "anon", is_anonymous: true } });
      await Promise.resolve();
    });
    expect(redeemMergeToken).not.toHaveBeenCalled();
  });

  it("redeems for an account whose session OMITS the anonymous flag", async () => {
    // The repo's documented rule: a real account may surface `is_anonymous` as false OR not at all,
    // and only an anonymous session is explicitly `true`. A `=== false` test would drop this diner.
    render(<MergeRedeemer />);
    await settle();
    storedToken = "tok-4";
    await act(async () => {
      listener?.("SIGNED_IN", { user: { id: "u-2" } });
      await Promise.resolve();
    });
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledWith("tok-4"));
  });

  it("does not drop a sign-in that lands while an attempt is still in flight", async () => {
    // The Google return: /account re-mounts, the mount attempt goes out, and the PKCE exchange
    // fires SIGNED_IN a beat later — while that first attempt is still awaiting the server. Dropped
    // rather than deferred, the one event proving a real account has arrived is the one thrown away.
    storedToken = "tok-5";
    let release: (v: unknown) => void = () => {};
    redeemMergeToken.mockImplementationOnce(
      () => new Promise((r) => (release = r)), // the mount attempt, held open
    );
    render(<MergeRedeemer />);
    await settle();
    expect(redeemMergeToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT); // arrives mid-flight
      await Promise.resolve();
    });
    // Still one call — correctly not concurrent.
    expect(redeemMergeToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(null); // the first attempt resolves "not signed in yet"
      await Promise.resolve();
      await Promise.resolve();
    });
    // …and the deferred event is drained, rather than lost.
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(2));
  });

  it("stops after a terminal redeem — never merges twice", async () => {
    storedToken = "tok-6";
    render(<MergeRedeemer />);
    await settle();
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(1));
    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      await Promise.resolve();
    });
    expect(redeemMergeToken).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying while the server answers 'not yet', and does not spend the token", async () => {
    // `null` means transient: the session has not landed server-side. The token must survive it, or
    // the retry has nothing left to redeem.
    storedToken = "tok-7";
    redeemMergeToken.mockResolvedValueOnce(null);
    render(<MergeRedeemer />);
    await settle();
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(1));
    expect(clearMergeToken).not.toHaveBeenCalled();

    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      await Promise.resolve();
    });
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(2));
  });
});

describe("MergeRedeemer — a shared device hands over cleanly", () => {
  it("re-arms after a sign-out, so the NEXT guest's orders still follow them", async () => {
    // The shared-tablet handover: `AccountStatus.toGuest()` signs out, mints a fresh anonymous
    // session and calls `router.refresh()`, which does not re-run client effects — so this
    // component keeps its tree position and its refs. Latched from the first guest's redemption,
    // the second guest's sign-in returns at the guard and their orders stay on the abandoned uid.
    storedToken = "tok-a";
    render(<MergeRedeemer />);
    await settle();
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(1)); // guest one, terminal

    await act(async () => {
      listener?.("SIGNED_OUT", null); // the handover
      await Promise.resolve();
    });

    storedToken = "tok-b"; // guest two signs into their own account
    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      await Promise.resolve();
    });
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledWith("tok-b"));
  });

  it("does not re-merge for the SAME guest just because an event repeats", async () => {
    // The other direction: re-arming must need a sign-out, not any event at all, or the exactly-once
    // guarantee the whole latch exists for is gone.
    storedToken = "tok-c";
    render(<MergeRedeemer />);
    await settle();
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledTimes(1));
    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      listener?.("USER_UPDATED", ACCOUNT);
      await Promise.resolve();
    });
    expect(redeemMergeToken).toHaveBeenCalledTimes(1);
  });
});

describe("MergeRedeemer — an in-flight attempt cannot spend the NEXT guest's token", () => {
  it("discards a redemption that resolves AFTER the handover", async () => {
    // Codex P2 on the merge head. Resetting the refs on sign-out does not cancel a request already
    // awaiting the server: it resolves afterwards, latches `done` and calls `clearMergeToken()` —
    // deleting the token the next guest has just stashed and re-blocking the very person the reset
    // was for. A promise cannot be un-awaited, so the attempt is stamped and its answer dropped.
    storedToken = "tok-first";
    let release: (v: unknown) => void = () => {};
    redeemMergeToken.mockImplementationOnce(() => new Promise((r) => (release = r)));
    render(<MergeRedeemer />);
    await settle();
    expect(redeemMergeToken).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener?.("SIGNED_OUT", null); // the tablet changes hands mid-request
      await Promise.resolve();
    });
    storedToken = "tok-second"; // the next guest stashes theirs

    await act(async () => {
      release({ orders: 1, stars: 3, coupons: 0 }); // the FIRST guest's request lands, terminally
      await Promise.resolve();
      await Promise.resolve();
    });
    // The stale answer neither spent the new token nor re-latched the redeemer.
    expect(clearMergeToken).not.toHaveBeenCalled();
    expect(storedToken).toBe("tok-second");

    await act(async () => {
      listener?.("SIGNED_IN", ACCOUNT);
      await Promise.resolve();
    });
    await waitFor(() => expect(redeemMergeToken).toHaveBeenCalledWith("tok-second"));
  });

  it("still spends the token when NO handover happened", async () => {
    // The stamp must only discard across an identity change — otherwise it would break the ordinary
    // redemption it is guarding, which is every redemption.
    storedToken = "tok-plain";
    render(<MergeRedeemer />);
    await settle();
    await waitFor(() => expect(clearMergeToken).toHaveBeenCalled());
  });
});
