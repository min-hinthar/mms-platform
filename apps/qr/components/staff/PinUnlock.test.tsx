/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";

const unlockConsole = vi.fn();
const releaseLock = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({
  unlockConsole: (v: unknown) => unlockConsole(v),
  releaseLockAfterSignOut: () => releaseLock(),
}));
const signOut = vi.fn();
vi.mock("@mms/db", () => ({ browserClient: () => ({ auth: { signOut } }) }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { PinUnlock } = await import("./PinUnlock");

/**
 * P7·2 — the lock screen, in Burmese, on the `pin.*` vocabulary. The verify and the lockout are the
 * server's; what this pins is the honest STATE: the tries count down in the device's numerals, a
 * lockout makes the field read-only rather than disabled (focus was just moved there), an outage is
 * never read as a wrong PIN, and the region shows the countdown over anything transient.
 */
// Phase 2h — the sign-out is a DOCUMENT navigation; jsdom's `location.assign` cannot be spied
// (non-configurable), so the whole object is stubbed for every case.
const assign = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
  unlockConsole.mockReset();
  releaseLock.mockReset();
  releaseLock.mockResolvedValue({ released: true });
  signOut.mockReset();
  replace.mockReset();
  refresh.mockReset();
  signOut.mockResolvedValue({ error: null });
});

const pin = () => screen.getByLabelText(/PIN/) as HTMLInputElement;
const region = () => document.getElementById("unlock-msg")!;
const enter = (digits: string) => {
  fireEvent.change(pin(), { target: { value: digits } });
  fireEvent.submit(pin().closest("form")!);
};

describe("PinUnlock", () => {
  it("greets by name — the name wrapped lang=en inside the Burmese — and focuses the field on mount", () => {
    render(<PinUnlock lang="my" displayName="Daw Aye" />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.querySelector('[lang="my"] [lang="en"]')?.textContent).toBe("Daw Aye");
    expect(h2.querySelector(".chrome-en")?.textContent).toBe("Welcome back, Daw Aye");
    expect(document.activeElement).toBe(pin());
  });

  it("Unlock is refused below four digits — aria-disabled, never disabled — and the field keeps only digits", () => {
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    const unlock = screen.getByRole("button", { name: "Unlock" });
    expect(unlock.getAttribute("aria-disabled")).toBe("true");
    expect((unlock as HTMLButtonElement).disabled).toBe(false);
    enter("12a");
    expect(pin().value).toBe("12");
    expect(unlockConsole).not.toHaveBeenCalled();
    fireEvent.change(pin(), { target: { value: "1234" } });
    expect(unlock.getAttribute("aria-disabled")).toBeNull();
  });

  it("a wrong PIN counts the tries down — plural in English, Burmese numerals under my", async () => {
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "wrong", attemptsRemaining: 2 });
    const { unmount } = render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() => expect(region().textContent).toBe("Wrong PIN — 2 tries left."));
    expect(pin().value).toBe(""); // cleared for the next try, focus kept on the field
    expect(document.activeElement).toBe(pin());
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "wrong", attemptsRemaining: 1 });
    enter("1234");
    await waitFor(() => expect(region().textContent).toBe("Wrong PIN — 1 try left."));
    unmount();
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "wrong", attemptsRemaining: 2 });
    render(<PinUnlock lang="my" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() =>
      expect(region().querySelector('[lang="my"]')?.textContent).toContain("၂ ကြိမ်"),
    );
    expect(region().querySelector(".chrome-en")).toBeNull(); // no echo in a live region
  });

  it("a lockout: the countdown IS the region, the field turns READ-ONLY (focus kept), the button is refused", async () => {
    const lockedUntil = new Date(Date.now() + 65_000).toISOString();
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "locked", lockedUntil });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() =>
      expect(region().textContent).toMatch(/^Too many tries — try again in 1m 0[45]s\.$/),
    );
    expect(pin().readOnly).toBe(true);
    expect(pin().disabled).toBe(false);
    expect(document.activeElement).toBe(pin());
    expect(screen.getByRole("button", { name: "Unlock" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("when the lockout EXPIRES the region empties and the field re-opens — no refusal left behind", async () => {
    // The blind pass caught the first draft leaving "Too many tries." in the region at the exact
    // moment the field became usable again; this lets a real 2-second lockout run out and looks.
    // Real timers on purpose: the interval is created inside the component from the server's
    // `lockedUntil`, and RTL's `waitFor` does not drive vitest's fake clock.
    const lockedUntil = new Date(Date.now() + 2_000).toISOString();
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "locked", lockedUntil });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() =>
      expect(region().textContent).toMatch(/^Too many tries — try again in [12]s\.$/),
    );
    await waitFor(() => expect(region().textContent).toBe(""), { timeout: 4_000 });
    expect(pin().readOnly).toBe(false);
    fireEvent.change(pin(), { target: { value: "1234" } });
    expect(screen.getByRole("button", { name: "Unlock" }).getAttribute("aria-disabled")).toBeNull();
  }, 8_000);

  it("an outage never reads as a wrong PIN, and says no attempt was used", async () => {
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "outage" });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() => expect(region().textContent).toMatch(/no attempt was used/));
    expect(region().textContent).not.toMatch(/Wrong/);
  });

  it("no PIN on the account points at sign-out; an unknown refusal says the check failed", async () => {
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "no_pin" });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() => expect(region().textContent).toMatch(/Sign out to continue/));
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "error" });
    enter("1234");
    await waitFor(() => expect(region().textContent).toMatch(/Couldn’t check that PIN/));
  });

  it("success leaves for the console and refreshes", async () => {
    unlockConsole.mockResolvedValueOnce({ ok: true });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff"));
    expect(refresh).toHaveBeenCalled();
  });

  it("the forgotten-PIN escape is the LAST control; a sign-out that fails mid-outage says so", async () => {
    signOut.mockResolvedValueOnce({ error: { name: "AuthRetryableFetchError", status: 0 } });
    const { container } = render(<PinUnlock lang="en" displayName="Daw Aye" />);
    const controls = container.querySelectorAll("button, input, a");
    const escape = screen.getByRole("button", { name: /Forgot PIN\? Sign out/ });
    expect(controls[controls.length - 1]).toBe(escape);
    fireEvent.click(escape);
    await waitFor(() => expect(region().textContent).toMatch(/couldn’t sign out just now/));
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled(); // the session survived — nowhere to go
    expect(releaseLock).not.toHaveBeenCalled(); // the session survived — so does the lock
    signOut.mockResolvedValueOnce({ error: { status: 400, message: "nope" } });
    fireEvent.click(escape);
    await waitFor(() =>
      expect(region().textContent).toBe("Couldn’t sign out just now — try again."),
    );
  });

  it("a successful sign-out HARD-navigates to the sign-in page, which releases the lock — the escape is not a loop", async () => {
    // The lock is an httpOnly cookie the browser sign-out cannot clear; left in place, the next
    // sign-in landed straight back on this screen with no PIN to enter (blind pass, CRITICAL).
    // Phase 2h (9g) — its release is the sign-in page's (`StaffLogin`, on mount, a fresh document):
    // awaited HERE, behind a stuck action queue, it never answered and the escape went nowhere.
    // A stuck earlier action on this tab — the very state a person is escaping:
    void track(new Promise(() => {}));
    releaseLock.mockReturnValue(new Promise(() => {}));
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    const escape = screen.getByRole("button", { name: /Forgot PIN\? Sign out/ });
    fireEvent.click(escape);
    fireEvent.click(escape); // a double-tap is refused in the handler, never by `disabled`
    // MUTATION (p2h-doors/pin-signout-soft-nav): a `router.replace` — held behind the stuck action
    // like every soft navigation, so the person is stranded on the lock; red.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/staff/login"));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    // No Server Action is awaited (or even queued) before the document leaves.
    expect(releaseLock).not.toHaveBeenCalled();
    expect((escape as HTMLButtonElement).disabled).toBe(false);
  });

  it("ONE polite live region, and no aria-live written on it", () => {
    const { container } = render(<PinUnlock lang="my" displayName="Daw Aye" />);
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
    expect(container.querySelectorAll("[aria-live]").length).toBe(0);
  });
});

describe("PinUnlock — Phase 2h: the unlock is bounded, a locked tablet is never stranded (9g)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function hungUnlock() {
    let answer!: (v: unknown) => void;
    let fail!: (e: Error) => void;
    unlockConsole.mockReturnValueOnce(
      new Promise((res, rej) => {
        answer = res;
        fail = rej;
      }),
    );
    return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
  }
  const submitBtn = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const reload = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  const submit = async (digits: string) => {
    await act(async () => {
      enter(digits);
    });
  };

  it("a REJECTED unlock frees the form and says it couldn't confirm — never latched on 'Checking…'", async () => {
    const h = hungUnlock();
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    await submit("1234");
    expect(submitBtn().textContent).toBe(STAFF["entry.checking"].en);
    // MUTATION (p2h-doors/unlock-threw-unsaid): the lost answer is said as nothing (before Phase
    // 2h the rejection escaped and "Checking…" latched — the form dead until a reload); red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(submitBtn().textContent).toBe(STAFF["entry.lock.unlock"].en);
    expect(region().textContent).toBe(STAFF["pin.unlock.unknown"].en);
    // "reload the page: if it opens, you're in" — the reload is beside the region, never in it.
    expect(reload()).not.toBeNull();
    expect(region().contains(reload())).toBe(false);
  });

  it("no answer at the bound: the form frees, the region says 'no answer yet' with the reload — and a LATE unlock still opens the console", async () => {
    const h = hungUnlock();
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    await submit("1234");
    await flush(STAFF_HANG_MS - 1);
    expect(submitBtn().textContent).toBe(STAFF["entry.checking"].en);
    // MUTATION (p2h-doors/unlock-unbounded): the bound never fires — "Checking…" for as long as the
    // queue is stuck, on the one screen between staff and the console; red.
    await flush(1);
    expect(submitBtn().textContent).toBe(STAFF["entry.lock.unlock"].en);
    // MUTATION (p2h-doors/unlock-waiting-unsaid): said as "couldn't confirm"; red.
    expect(region().textContent).toBe(STAFF["pin.unlock.waiting"].en);
    expect(reload()).not.toBeNull();
    // MUTATION (p2h-doors/unlock-late-ok-dropped): the late answer is dropped — the tablet WAS
    // unlocked and the person stays on the lock screen; red.
    await act(async () => h.answer({ ok: true }));
    expect(replace).toHaveBeenCalledWith("/staff");
    expect(reload()).toBeNull();
  });

  it("a LATE throw says the PIN check couldn't be confirmed — the reload stays", async () => {
    const h = hungUnlock();
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    await submit("1234");
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["pin.unlock.waiting"].en);
    // MUTATION (p2h-doors/unlock-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(region().textContent).toBe(STAFF["pin.unlock.unknown"].en);
    expect(reload()).not.toBeNull();
  });

  it("a LATE wrong PIN is said as the wrong PIN — the reload goes, the field is cleared for another try", async () => {
    const h = hungUnlock();
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    await submit("1234");
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["pin.unlock.waiting"].en);
    await act(async () => h.answer({ ok: false, reason: "wrong", attemptsRemaining: 2 }));
    expect(region().textContent).toBe("Wrong PIN — 2 tries left.");
    expect(reload()).toBeNull();
    expect(pin().value).toBe("");
  });
});
