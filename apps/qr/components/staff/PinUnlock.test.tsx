/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unlockConsole = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({ unlockConsole: (v: unknown) => unlockConsole(v) }));
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
afterEach(cleanup);
beforeEach(() => {
  unlockConsole.mockReset();
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

  it("a lockout: the countdown wins the region, the field turns READ-ONLY (focus kept), the button is refused", async () => {
    const lockedUntil = new Date(Date.now() + 65_000).toISOString();
    unlockConsole.mockResolvedValueOnce({ ok: false, reason: "locked", lockedUntil });
    render(<PinUnlock lang="en" displayName="Daw Aye" />);
    enter("1234");
    await waitFor(() =>
      expect(region().textContent).toMatch(/^Locked — try again in 1m 0[45]s\.$/),
    );
    expect(pin().readOnly).toBe(true);
    expect(pin().disabled).toBe(false);
    expect(document.activeElement).toBe(pin());
    expect(screen.getByRole("button", { name: "Unlock" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

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
    signOut.mockResolvedValueOnce({ error: { status: 400, message: "nope" } });
    fireEvent.click(escape);
    await waitFor(() =>
      expect(region().textContent).toBe("Couldn’t sign out just now — try again."),
    );
  });

  it("ONE polite live region, and no aria-live written on it", () => {
    const { container } = render(<PinUnlock lang="my" displayName="Daw Aye" />);
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
    expect(container.querySelectorAll("[aria-live]").length).toBe(0);
  });
});
