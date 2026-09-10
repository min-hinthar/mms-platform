/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A7b — the Google recovery, end to end in a DOM.
 *
 * The owner reported that signing in with Google did nothing and fell back to email OTP. The cause was
 * not the Supabase config this repo had filed it under: Google completes, Supabase correctly refuses at
 * the LINK step with `identity_already_exists`, the card renders the right recovery — and then erases
 * it. `AccountUpgrade` derived the recovery live from `useSearchParams()` and stripped the query in an
 * effect, on the strength of a comment claiming Next's search params do not react to `replaceState`.
 * They do (Next 16.2.9 patches it), so the message vanished and the button reverted to the very call
 * that had just been refused.
 *
 * ⚠️ THE FIRST CASE IS THE RED-FIRST ONE. It renders with the bounce, lets the mount effects flush, then
 * empties the search params exactly as the patched `replaceState` does, and asserts the recovery is
 * STILL there. Against the pre-A7b derivation it fails; that is what makes it a guard rather than a
 * green file.
 *
 * The suite also pins the two things that had no test at all and could flip silently: which Supabase
 * call the button fires, and that the merge token is secured BEFORE the session is abandoned.
 */

const auth = {
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};
vi.mock("@mms/db", () => ({ browserClient: () => ({ auth }) }));

let params = new URLSearchParams();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => params,
}));

const mintMergeToken = vi.fn();
vi.mock("@/lib/merge", () => ({ mintMergeToken: () => mintMergeToken() }));
vi.mock("@/lib/rewards", () => ({ ensureProfile: () => Promise.resolve() }));
// WelcomeBackChooser is a child of the card and reads both of these on its own frame.
vi.mock("@/lib/deviceIdentity", () => ({ readIdentities: () => [], readLend: () => null }));

// A real-enough token store: the carry decision reads back what the stash wrote, and a fake that always
// answers null (or always answers the token) would make the read-back assertion vacuous.
let stored: string | null = null;
vi.mock("@/lib/mergeTokenStore", () => ({
  stashMergeToken: (t: string) => {
    if (!stashDisabled) stored = t;
  },
  readMergeToken: () => stored,
  clearMergeToken: () => {
    stored = null;
  },
}));
let stashDisabled = false;

vi.mock("@mms/ui", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

const { AccountUpgrade } = await import("./AccountUpgrade");

/**
 * Flush the rAF-deferred mount effects the card uses (auto-recovery, resume, focus).
 *
 * Real frames, not fake timers: `waitFor` polls on real `setTimeout`, so faking it deadlocks every
 * assertion that waits on an async handler. jsdom fires rAF on its own ~16ms interval, and several of
 * these effects chain a frame onto a state update, so this yields more than once.
 */
async function flushFrames() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const BOUNCE = "identity_already_exists";

/** Every url `history.replaceState` was called with, oldest first — see the strip assertion below. */
let replaceStateCalls: string[] = [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  replaceStateCalls = [];
  const realReplaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    if (typeof url === "string") replaceStateCalls.push(url);
    realReplaceState(data, unused, url as string);
  });
  for (const fn of Object.values(auth)) if (typeof fn === "function") fn.mockReset?.();
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.linkIdentity.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  mintMergeToken.mockReset();
  mintMergeToken.mockResolvedValue({ kind: "minted", token: "tok-abc" });
  refresh.mockReset();
  stored = null;
  stashDisabled = false;
  params = new URLSearchParams();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/account");
});

describe("the bounce survives the URL cleanup", () => {
  it("KEEPS the recovery after the search params empty — the erasure defect", async () => {
    params = new URLSearchParams(`error=server_error&error_code=${BOUNCE}`);
    // Suppress the auto-recovery so this case measures the RENDER, not the redirect.
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    const { rerender } = render(<AccountUpgrade stars={3} />);
    await flushFrames();

    // Exactly what Next's patched replaceState does after the strip effect runs.
    params = new URLSearchParams();
    rerender(<AccountUpgrade stars={3} />);
    await flushFrames();

    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with Google/i })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("already has a Morning Star account");
  });

  it("restores the recovery on a RELOAD, where the URL no longer carries it", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    const first = render(<AccountUpgrade stars={3} />);
    await flushFrames();
    first.unmount();

    // A fresh document: the query was cleaned before the reload, so only sessionStorage remembers.
    params = new URLSearchParams();
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
  });

  it("shows the ordinary card when there was no bounce at all", async () => {
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("leaves a co-present ?resume= alive long enough for the resume effect to act on it", async () => {
    // ⚠️ The old strip replaced the whole URL with `pathname`, discarding EVERY other param — and it is
    // declared before the resume effect, so it ran first. A lend-mode return arriving beside a bounce
    // therefore lost `resume` before anything could act on it, and (because the strip does propagate to
    // useSearchParams) `resumeParam` then flipped to null and tore that effect down mid-flight.
    //
    // Asserting on the final URL would be wrong: the resume effect deletes `resume` itself once it
    // fires, so a passing URL check cannot tell "preserved then consumed" from "never there". The
    // BEHAVIOUR is the evidence — with no remembered identity, resume drives a merge-suppressed OTP to
    // the owner's address.
    window.history.replaceState(null, "", `/account?error_code=${BOUNCE}&resume=owner%40x.com`);
    params = new URLSearchParams(`error_code=${BOUNCE}&resume=owner@x.com`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1"); // isolate: no auto-recovery racing it
    // Only the CARD's own writes are evidence — the setup calls above are this test arranging the URL.
    replaceStateCalls.length = 0;
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(auth.signInWithOtp.mock.calls[0]?.[0]).toMatchObject({ email: "owner@x.com" });
    // A resume is the owner returning to their OWN account, so the friend's Stars are never swept along.
    expect(mintMergeToken).not.toHaveBeenCalled();

    // ⚠️ ASSERT THE STRIP'S OWN CALL, and the mutation gate is why. Neither of the two obvious
    // assertions can separate `${url.pathname}${url.search}` from a bare `url.pathname`:
    //   · the FINAL url is `/account` either way, because the resume effect deletes `resume` itself
    //     once it fires — "preserved then consumed" and "never there" look identical;
    //   · the BEHAVIOUR above is identical too, because `useSearchParams` is mocked here and does
    //     not react to `replaceState`. Next 16 propagates it (that is the whole defect this file
    //     exists for), the mock cannot, so `resumeParam` stays truthy under either variant.
    // The one observable difference is the URL the strip itself wrote, so that is what is asserted.
    // The strip runs first (a plain effect; the resume effect defers to a frame), so the card's FIRST
    // write is the one under test. The resume effect's later write legitimately drops `resume`.
    expect(replaceStateCalls.length).toBeGreaterThan(0);
    const stripped = replaceStateCalls[0]!;
    expect(stripped).not.toContain("error_code");
    expect(stripped).not.toContain("error_description");
    expect(stripped).toContain("resume=");
  });
});

describe("which call the button fires", () => {
  it("fires signInWithOAuth after a bounce, never linkIdentity again", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    fireEvent.click(screen.getByRole("button", { name: /Sign in with Google/i }));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));
    // linkIdentity is the 422 repeated — another whole round trip to the same refusal.
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("fires linkIdentity on an ordinary first press — the uid-preserving path", async () => {
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    await waitFor(() => expect(auth.linkIdentity).toHaveBeenCalledTimes(1));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // Nothing to merge on this path: the uid is kept, so no token should be minted.
    expect(mintMergeToken).not.toHaveBeenCalled();
  });
});

describe("the automatic recovery", () => {
  it("completes the sign-in without a second press", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it("marks the attempt spent BEFORE leaving, so a return cannot re-fire it", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(window.sessionStorage.getItem("mms.oauth_recovered")).not.toBeNull();
  });

  it("does NOT auto-recover once the attempt is spent — the loop guard", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // ...but the manual recovery is still offered, so the diner is never stranded.
    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
  });

  it("never auto-recovers a bounce it cannot name", async () => {
    params = new URLSearchParams("error=server_error");
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Couldn’t finish with Google");
  });

  it("never auto-recovers an ordinary visit", async () => {
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("the carry is secured before the session is abandoned", () => {
  it("stashes the minted token before signInWithOAuth is called", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    let storedAtCall: string | null = null;
    auth.signInWithOAuth.mockImplementation(() => {
      storedAtCall = stored; // what localStorage held at the moment the session was abandoned
      return Promise.resolve({ error: null });
    });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    // ⚠️ Read INSIDE the call, not after it. Asserting on the final value would pass even if the mint
    // were awaited afterwards — lexical order is not sequencing.
    expect(storedAtCall).toBe("tok-abc");
  });

  it("does NOT redirect when the mint FAILS — the permanent-orphan guard", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    mintMergeToken.mockResolvedValue({ kind: "failed" });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(mintMergeToken).toHaveBeenCalled());
    // The old code redirected regardless, and the anon uid became unreachable the moment it did.
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "couldn’t get this device’s Stars ready",
    );
  });

  it("does NOT redirect when the stash silently fails", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    stashDisabled = true; // private mode / storage quota — stashMergeToken swallows it by design
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(mintMergeToken).toHaveBeenCalled());
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("private browsing");
  });

  it("offers a way through that says what it costs, and it works", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    mintMergeToken.mockResolvedValue({ kind: "failed" });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(mintMergeToken).toHaveBeenCalled());

    const escape = screen.getByRole("button", { name: /leave this device’s Stars behind/i });
    fireEvent.click(escape);
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));
  });

  it("does not offer the escape hatch when nothing is blocked", async () => {
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(screen.queryByRole("button", { name: /leave this device’s Stars behind/i })).toBeNull();
  });

  it("proceeds without a token when there is nothing to carry", async () => {
    // Over-blocking is a failure too: a diner with nothing on this device must never be stopped.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    mintMergeToken.mockResolvedValue({ kind: "nothing-to-carry" });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));
  });

  it("does NOT wedge at busy when the mint's SERVER ACTION rejects", async () => {
    // ⚠️ A Server Action promise rejects at the TRANSPORT — a lost connection — before
    // `mintMergeToken`'s own try/catch can run, so there is no `{ kind }` to fall through to. An
    // uncaught call threw past every line below it, leaving the card busy forever with no message.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    mintMergeToken.mockRejectedValue(new Error("Failed to fetch"));
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "couldn’t get this device’s Stars ready",
      ),
    );
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // And the way through is offered, so a dropped connection is not a dead end either.
    expect(screen.getByRole("button", { name: /leave this device’s Stars behind/i })).toBeTruthy();
  });

  it("clears the stashed token when the OAuth call itself errors", async () => {
    // The redirect never happened, so the token is unbound — and MergeRedeemer redeems on ANY later
    // non-anonymous sign-in on this device, including a staff member's.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    auth.signInWithOAuth.mockResolvedValue({ error: { message: "provider down" } });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(stored).toBeNull();
  });
});

describe("round 1 — the doors that could race, and the one that must lose", () => {
  it("a lend-mode ?resume= SUPPRESSES the automatic recovery entirely", async () => {
    // ⚠️ THE MONEY CASE, and the one my own earlier resume test hid by setting the spent flag to
    // "isolate" the paths — which meant they were never exercised together at all. With both params
    // present the auto-recovery would mint and carry the FRIEND's Stars into the OWNER's account,
    // which is exactly what the merge-suppressed resume path exists to prevent.
    window.history.replaceState(null, "", `/account?error_code=${BOUNCE}&resume=owner%40x.com`);
    params = new URLSearchParams(`error_code=${BOUNCE}&resume=owner@x.com`);
    // Attempt NOT spent — the recovery is otherwise fully armed, so only the resume rule stops it.
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // No token was minted, so nothing of the friend's could travel.
    expect(mintMergeToken).not.toHaveBeenCalled();
    expect(stored).toBeNull();
    // And the manual recovery is still offered: after a handover, which account is a person's call.
    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
  });

  it("a manual press during the deferred frame does not start a SECOND mint", async () => {
    // Two concurrent mints delete each other's rows via mintMergeToken's `.neq("token", …)` prune,
    // leaving a stashed token whose row is gone — every check passes and the proof is worthless.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    render(<AccountUpgrade stars={3} />);
    // Press BEFORE flushing, so the manual handler and the auto-recovery frame overlap.
    fireEvent.click(screen.getByRole("button", { name: /Sign in with Google/i }));
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());

    expect(mintMergeToken).toHaveBeenCalledTimes(1);
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("releases the lock when a start fails, so the card is never wedged", async () => {
    // The other direction: a lock that is taken and not released turns one refusal into a dead card.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: "provider down" } });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    fireEvent.click(screen.getByRole("button", { name: /Sign in with Google/i }));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));

    auth.signInWithOAuth.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /Sign in with Google/i }));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2));
  });

  it("does not spend the attempt when the marker could not be recorded", async () => {
    // Redirecting on an unrecorded attempt is how the one-shot becomes a loop.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (k === "mms.oauth_recovered") throw new Error("QuotaExceededError");
      realSet.call(this, k, v);
    });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    // The manual button carries the diner instead.
    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("hands the card back when the automatic start REJECTS outright", async () => {
    // A fire-and-forget call has nothing downstream to surface a rejection, so `busy` stuck true and
    // the manual button stayed disabled with an unbound token still stashed.
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    auth.signInWithOAuth.mockRejectedValue(new Error("storage unavailable"));
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());

    expect(stored).toBeNull(); // the unbound proof is cleared, not left for the next person
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Sign in with Google/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it("the escape hatch resumes the EMAIL flow when email was what blocked", async () => {
    // Wiring it straight to Google sent a diner who had typed an address to a different provider,
    // plausibly a different account. Continuing without your Stars is not consent to that.
    mintMergeToken.mockResolvedValue({ kind: "failed" });
    render(<AccountUpgrade stars={3} />);
    await flushFrames();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "me@example.com" } });
    auth.updateUser.mockResolvedValue({ error: { code: "email_exists", message: "taken" } });
    fireEvent.submit(screen.getByRole("button", { name: /Email me a code/i }).closest("form")!);
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalled());
    fireEvent.submit(screen.getByRole("button", { name: /Send sign-in code/i }).closest("form")!);
    await waitFor(() => expect(mintMergeToken).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /leave this device’s Stars behind/i }));
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(auth.signInWithOtp.mock.calls[0]?.[0]).toMatchObject({ email: "me@example.com" });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("a11y", () => {
  it("keeps exactly ONE live region on the card", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("names the button inside the message, so the control is findable", async () => {
    params = new URLSearchParams(`error_code=${BOUNCE}`);
    window.sessionStorage.setItem("mms.oauth_recovered", "1");
    render(<AccountUpgrade stars={3} />);
    await flushFrames();
    const label = screen.getByRole("button", { name: /Sign in with Google/i }).textContent ?? "";
    expect(screen.getByRole("status").textContent).toContain(label.trim());
  });
});
