/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
};
vi.mock("@mms/db", () => ({ browserClient: () => ({ auth }) }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const releaseLock = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({ releaseLockAfterSignOut: () => releaseLock() }));

const { StaffLogin } = await import("./StaffLogin");

/**
 * P7·2 — the first screen Dad sees. What is worth pinning is not the Supabase wiring (unchanged since
 * S1.1a) but the four things the conversion could have broken: the copy is marked Burmese and the
 * interpolated ADDRESS is not; every refusal is `aria-disabled`, never native `disabled` (the rule
 * the language switch measured — a disabled button drops focus to <body>); the W10b attribution
 * holds in both tongues (a transport failure never blames the address or the code); and the view
 * still has exactly ONE polite live region.
 */
afterEach(cleanup);
beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  replace.mockReset();
  refresh.mockReset();
  releaseLock.mockReset();
  releaseLock.mockResolvedValue({ released: true });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
});

const email = () => screen.getByLabelText(/Staff email/) as HTMLInputElement;
const submitOf = (el: HTMLElement) => fireEvent.submit(el.closest("form")!);
const status = () => document.getElementById("staff-auth-msg")!;
const RETRYABLE = { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 };

describe("StaffLogin", () => {
  it("under Burmese the heading, the sub and the label are marked — and the placeholder is the brand's domain", () => {
    render(<StaffLogin lang="my" />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.querySelector('[lang="my"]')?.textContent).toBe("ခန်းမသို့ ဝင်ပါ");
    expect(h2.querySelector(".chrome-en")?.textContent).toBe("Sign in to the floor");
    expect(email().placeholder).toBe("you@mandalaymorningstar.com");
    expect(document.querySelector('label[for="staff-email"] [lang="my"]')).not.toBeNull();
  });

  it("Send is REFUSED until an address is typed — aria-disabled, never disabled, and it stays in the tab order", () => {
    render(<StaffLogin lang="en" />);
    const send = screen.getByRole("button", { name: "Send code" });
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect((send as HTMLButtonElement).disabled).toBe(false);
    submitOf(email());
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    expect(send.getAttribute("aria-disabled")).toBeNull();
  });

  it("a sent code moves to the code step, focuses the code field, and names the address wrapped lang=en inside the Burmese sentence", async () => {
    render(<StaffLogin lang="my" />);
    fireEvent.change(email(), { target: { value: " Min@Example.com " } });
    submitOf(email());
    const code = await screen.findByLabelText(/Sign-in code/);
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "min@example.com" }),
    );
    await waitFor(() => expect(document.activeElement).toBe(code));
    const addr = status().querySelector('[lang="my"] [lang="en"]');
    expect(addr?.textContent).toBe("min@example.com");
    expect(status().querySelector('[role="status"]')).toBeNull(); // the region IS the <p>
  });

  it("a 429 blocks THIS address, points at Google, keeps focus on the field — and a different address is free", async () => {
    auth.signInWithOtp.mockResolvedValue({
      error: { status: 429, message: "over_email_send_rate_limit" },
    });
    render(<StaffLogin lang="en" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    await waitFor(() => expect(status().textContent).toMatch(/Continue with Google/));
    const send = screen.getByRole("button", { name: "Use Google instead" });
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect((send as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(email());
    // The block is scoped to the address that tripped it.
    fireEvent.change(email(), { target: { value: "other@example.com" } });
    expect(
      screen.getByRole("button", { name: "Send code" }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("a transport failure on send blames the SERVICE, not the address (W10b), in the device language", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: RETRYABLE });
    const { unmount } = render(<StaffLogin lang="en" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    await waitFor(() => expect(status().textContent).toMatch(/your email is fine/));
    unmount();
    render(<StaffLogin lang="my" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    await waitFor(() =>
      expect(status().querySelector('[lang="my"]')?.textContent).toMatch(/အီးမေးလ်က မှန်ပါတယ်/),
    );
    // A live region never echoes — a bilingual announcement says everything twice.
    expect(status().querySelector(".chrome-en")).toBeNull();
  });

  it("a wrong code says so; a transport failure on verify says the code may still be good", async () => {
    render(<StaffLogin lang="en" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    const code = await screen.findByLabelText(/Sign-in code/);
    fireEvent.change(code, { target: { value: "123 456" } });
    expect((code as HTMLInputElement).value).toBe("123456"); // whitespace stripped, digits kept as issued
    auth.verifyOtp.mockResolvedValueOnce({ error: { status: 403, message: "Token has expired" } });
    submitOf(code);
    await waitFor(() => expect(status().textContent).toMatch(/didn’t match or has expired/));
    auth.verifyOtp.mockResolvedValueOnce({ error: RETRYABLE });
    submitOf(code);
    await waitFor(() => expect(status().textContent).toMatch(/your code may still be good/));
    expect(replace).not.toHaveBeenCalled();
    auth.verifyOtp.mockResolvedValueOnce({ error: null });
    submitOf(code);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff"));
  });

  it("the resend countdown speaks the device's numerals", async () => {
    render(<StaffLogin lang="my" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    await screen.findByLabelText(/Sign-in code/);
    fireEvent.click(screen.getByRole("button", { name: /Use a different email/ }));
    const send = await screen.findByRole("button", { name: /Resend in 60s/ });
    expect(send.querySelector('[lang="my"]')?.textContent).toContain("၆၀");
    expect(send.getAttribute("aria-disabled")).toBe("true");
  });

  it("ONE polite live region, and no aria-live written on it", () => {
    const { container } = render(<StaffLogin lang="my" denied />);
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
    expect(container.querySelectorAll("[aria-live]").length).toBe(0);
    // The denied alert is a DIFFERENT channel (assertive), not a second polite region.
    expect(container.querySelectorAll('[role="alert"]').length).toBe(1);
  });

  it("denied: the alert carries the escape, and a failed sign-out mid-outage says so instead of bouncing", async () => {
    auth.signOut.mockResolvedValue({ error: RETRYABLE });
    render(<StaffLogin lang="en" denied />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(status().textContent).toMatch(/couldn’t sign out just now/));
    expect(refresh).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled(); // the session survived — so does the lock
  });

  it("denied: a successful sign-out releases the device lock, once, then re-gates", async () => {
    // A wrong account can be signed in on a LOCKED tablet; the browser sign-out cannot clear the
    // httpOnly lock, so the right account's first screen was the lock with no PIN to enter.
    render(<StaffLogin lang="en" denied />);
    const out = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(out);
    fireEvent.click(out); // refused in the handler — never `disabled`
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect((out as HTMLButtonElement).disabled).toBe(false);
  });

  it("the code field carries NO Burmese placeholder — an attribute value cannot be marked", async () => {
    // The first draft put `ts(lang, …)` in `placeholder`; under Burmese it rendered in the Latin
    // face at 0.18em tracking and was voiced as English (blind pass, CRITICAL). The label says it.
    render(<StaffLogin lang="my" />);
    fireEvent.change(email(), { target: { value: "min@example.com" } });
    submitOf(email());
    const code = (await screen.findByLabelText(/Sign-in code/)) as HTMLInputElement;
    expect(code.placeholder).toBe("");
    expect(code.getAttribute("aria-describedby")).toBeNull();
    expect(email).toBeDefined();
  });

  it("Google: an outage says it is not you; any other failure names the provider", async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ error: { status: 0 } });
    render(<StaffLogin lang="en" />);
    const google = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(google);
    await waitFor(() => expect(status().textContent).toMatch(/it’s not you/));
    auth.signInWithOAuth.mockResolvedValueOnce({ error: { status: 400, message: "bad request" } });
    fireEvent.click(google);
    await waitFor(() => expect(status().textContent).toMatch(/Couldn’t start Google sign-in/));
    expect((google as HTMLButtonElement).disabled).toBe(false);
  });
});
