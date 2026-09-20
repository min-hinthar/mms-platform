/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setPin = vi.fn();
const removePin = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({
  setPin: (v: unknown) => setPin(v),
  removePin: () => removePin(),
}));
const signOut = vi.fn();
vi.mock("@mms/db", () => ({ browserClient: () => ({ auth: { signOut } }) }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { SignedInCard } = await import("./SignedInCard");

/**
 * A4·4 — the signed-in state of the sign-in screen: who you are, your PIN, sign out — the old
 * `/staff/profile`, which was the one console page with no Burmese below the bar (K25). What is
 * worth pinning: the copy is marked and the NAME is not; the two refusals the card can explain
 * itself are EXPLAINED (a greyed button on a two-field form says nothing), with focus moved to
 * the field at fault; the action's reason codes each land in the card's ONE live region as a key;
 * nothing is natively `disabled`; and the escape is the last control.
 */
afterEach(cleanup);
beforeEach(() => {
  setPin.mockReset();
  removePin.mockReset();
  signOut.mockReset();
  replace.mockReset();
  refresh.mockReset();
  setPin.mockResolvedValue({ ok: true });
  removePin.mockResolvedValue({ ok: true });
  signOut.mockResolvedValue({ error: null });
});

const ME = { displayName: "Daw Aye", email: "aye@example.com" };
const region = () => document.getElementById("me-msg")!;
const pinField = () => document.getElementById("pin-new") as HTMLInputElement;
const confirmField = () => document.getElementById("pin-confirm") as HTMLInputElement;
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } });
const submit = () => fireEvent.submit(pinField().closest("form")!);

describe("SignedInCard", () => {
  it("names the person (lang=en inside the Burmese), the email verbatim, and heads the PIN form by state", () => {
    const { unmount } = render(<SignedInCard lang="my" hasPin={false} {...ME} />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.querySelector('[lang="my"] [lang="en"]')?.textContent).toBe("Daw Aye");
    expect(h2.querySelector(".chrome-en")?.textContent).toBe("Signed in as Daw Aye");
    expect(screen.getByText("aye@example.com")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3 }).querySelector(".chrome-en")?.textContent).toBe(
      "Set a tablet PIN",
    );
    // First-time: the field is simply "PIN" (Burmese, with the echo beneath); there is no Remove.
    expect(screen.getByLabelText(/^ပင်နံပါတ်PIN$/)).toBe(pinField());
    expect(screen.queryByRole("button", { name: /Remove PIN/ })).toBeNull();
    unmount();
    render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Change your PIN");
    expect(screen.getByLabelText("New PIN")).toBe(pinField());
    expect(screen.getByLabelText("Confirm PIN")).toBe(confirmField());
    expect(screen.getByRole("button", { name: "Remove PIN" })).toBeTruthy();
  });

  it("the escape is the LAST control, and the CARD alone has exactly ONE polite live region (on the sign-in screen the view's provider takes it over — ViewStatus.test)", () => {
    render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1]!.textContent).toBe("Sign out");
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
    expect(document.querySelectorAll('[role="alert"]').length).toBe(0);
    // Nothing is natively disabled at rest.
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  it("a short PIN is EXPLAINED, not greyed: the region says the rule, focus goes to the field, nothing is sent", async () => {
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    type(pinField(), "12");
    type(confirmField(), "12");
    submit();
    await waitFor(() => expect(region().textContent).toBe("PIN must be 4–8 digits."));
    expect(document.activeElement).toBe(pinField());
    expect(setPin).not.toHaveBeenCalled();
  });

  it("a mismatch is explained with focus on the confirm field; the fields keep only digits", async () => {
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    type(pinField(), "24a68");
    expect(pinField().value).toBe("2468");
    type(confirmField(), "2469");
    submit();
    await waitFor(() => expect(region().textContent).toBe("Those PINs don’t match."));
    expect(document.activeElement).toBe(confirmField());
    expect(setPin).not.toHaveBeenCalled();
  });

  it("a good pair is sent, the fields clear, the page refreshes, and the region says what changed", async () => {
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    type(pinField(), "2468");
    type(confirmField(), "2468");
    submit();
    await waitFor(() =>
      expect(region().textContent).toBe("PIN set — you can now lock the tablet."),
    );
    expect(setPin).toHaveBeenCalledWith({ pin: "2468" });
    expect(pinField().value).toBe("");
    expect(confirmField().value).toBe("");
    expect(refresh).toHaveBeenCalled();
  });

  it("the server's reasons each land as a KEY — Burmese-marked, no echo — and an outage never reads as a bad PIN", async () => {
    setPin.mockResolvedValueOnce({ ok: false, reason: "trivial" });
    const { unmount } = render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    type(pinField(), "1234");
    type(confirmField(), "1234");
    submit();
    await waitFor(() => expect(region().textContent).toBe("Choose a less guessable PIN."));
    setPin.mockResolvedValueOnce({ ok: false, reason: "outage" });
    submit();
    await waitFor(() =>
      expect(region().textContent).toBe(
        "We can’t reach the sign-in service — that didn’t save. Try again in a moment.",
      ),
    );
    expect(pinField().value).toBe("1234"); // nothing was checked — the pair stays for the retry
    unmount();
    setPin.mockResolvedValueOnce({ ok: false, reason: "save" });
    render(<SignedInCard lang="my" hasPin={true} {...ME} />);
    type(pinField(), "2468");
    type(confirmField(), "2468");
    submit();
    await waitFor(() =>
      expect(region().querySelector('[lang="my"]')?.textContent).toBe(
        "ပင်နံပါတ် မသိမ်းနိုင်ပါ။ ထပ်စမ်းပါ။",
      ),
    );
    expect(region().querySelector(".chrome-en")).toBeNull();
  });

  it("an `auth` answer refreshes the page (it re-gates to the form) rather than explaining a session that is gone", async () => {
    setPin.mockResolvedValueOnce({ ok: false, reason: "auth" });
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    type(pinField(), "2468");
    type(confirmField(), "2468");
    submit();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(region().textContent).toBe("");
  });

  it("Update PIN is refused only while a save is in flight — aria-disabled, never disabled", async () => {
    let settle: (v: unknown) => void = () => {};
    setPin.mockReturnValueOnce(new Promise((r) => (settle = r)));
    render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    type(pinField(), "2468");
    type(confirmField(), "2468");
    submit();
    const btn = screen.getByRole("button", { name: "Saving…" });
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    submit(); // re-entry refused in the handler
    expect(setPin).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(region().textContent).toBe("PIN updated."));
    expect(
      screen.getByRole("button", { name: "Update PIN" }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("a REJECTED action (lost connection, uncaught server error) is the outage sentence, the pair is kept, and the button comes back", async () => {
    // A Server Action's promise rejects on transport failure — no `{ ok: false }` to fall through
    // to. The first draft left `busy` latched forever here (blind pass, CRITICAL 1).
    setPin.mockRejectedValueOnce(new Error("fetch failed"));
    render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    type(pinField(), "2468");
    type(confirmField(), "2468");
    submit();
    await waitFor(() =>
      expect(region().textContent).toBe(
        "We can’t reach the sign-in service — that didn’t save. Try again in a moment.",
      ),
    );
    const btn = screen.getByRole("button", { name: "Update PIN" });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(pinField().value).toBe("2468");
    expect(confirmField().value).toBe("2468");
    // …and a second submit goes through: the latch was released.
    submit();
    await waitFor(() => expect(region().textContent).toBe("PIN updated."));
    // The same for Remove.
    removePin.mockRejectedValueOnce(new Error("fetch failed"));
    fireEvent.click(screen.getByRole("button", { name: "Remove PIN" }));
    await waitFor(() =>
      expect(region().textContent).toBe(
        "We can’t reach the sign-in service — that didn’t save. Try again in a moment.",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Remove PIN" }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("after a successful Remove the button unmounts, so focus is moved to the PIN field first (QA §A: focus moved on remove)", async () => {
    const { rerender } = render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    const remove = screen.getByRole("button", { name: "Remove PIN" });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(region().textContent).toBe("PIN removed."));
    expect(document.activeElement).toBe(pinField());
    // The server re-renders with hasPin=false (router.refresh) — the field keeps focus across it.
    rerender(<SignedInCard lang="en" hasPin={false} {...ME} />);
    expect(screen.queryByRole("button", { name: "Remove PIN" })).toBeNull();
    expect(document.activeElement).toBe(pinField());
  });

  it("Remove PIN answers in the region either way and refreshes only on success", async () => {
    removePin.mockResolvedValueOnce({ ok: false, reason: "save" });
    render(<SignedInCard lang="en" hasPin={true} {...ME} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove PIN" }));
    await waitFor(() => expect(region().textContent).toBe("Couldn’t remove your PIN. Try again."));
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove PIN" }));
    await waitFor(() => expect(region().textContent).toBe("PIN removed."));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a REJECTED sign-out (the auth client throwing — a lock, storage) releases the latch and says so; the retry goes through", async () => {
    // Codex round 2 on #284: `signOut` can REJECT rather than resolve `{ error }` — the same latch
    // shape as the PIN writes, one control down.
    signOut.mockRejectedValueOnce(new Error("Navigator lock timeout"));
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(region().textContent).toBe("Couldn’t sign out just now — try again."),
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login"));
  });

  it("a FAILED sign-out stays put and says whose fault it is (transport → the service); a good one leaves", async () => {
    signOut.mockResolvedValueOnce({
      error: { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
    });
    render(<SignedInCard lang="en" hasPin={false} {...ME} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(region().textContent).toBe(
        "We can’t reach the sign-in service — couldn’t sign out just now. Try again in a moment.",
      ),
    );
    expect(replace).not.toHaveBeenCalled();
    signOut.mockResolvedValueOnce({
      error: { name: "AuthApiError", message: "nope", status: 400 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(region().textContent).toBe("Couldn’t sign out just now — try again."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login"));
    expect(refresh).toHaveBeenCalled();
  });
});
