/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setStaffLang = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: (v: unknown) => setStaffLang(v) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangSwitch } = await import("./StaffLangSwitch");

/**
 * P2 · G6 — the control.
 *
 * The pressed state is derived from the `lang` PROP, not from local state, and that is the assertion
 * worth having: a `useState` version looks identical until the action fails or the refresh is slow,
 * at which point the button claims a language the server never stored. The rejected-action case is
 * where that divergence shows.
 *
 * (`@testing-library/jest-dom` and `user-event` are not dependencies here — assertions read
 * attributes directly and clicks go through `fireEvent`, matching `TicketText.test.tsx`.)
 */
afterEach(cleanup);
beforeEach(() => {
  setStaffLang.mockReset();
  refresh.mockReset();
  setStaffLang.mockResolvedValue({ ok: true, lang: "en" });
});

const my = () => screen.getByRole("button", { name: "မြန်မာ" });
const en = () => screen.getByRole("button", { name: "English" });

describe("StaffLangSwitch", () => {
  it("presses exactly the current language", () => {
    render(<StaffLangSwitch lang="my" />);
    expect(my().getAttribute("aria-pressed")).toBe("true");
    expect(en().getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the Burmese autonym and leaves the English one ambient", () => {
    const { container } = render(<StaffLangSwitch lang="en" />);
    expect(my().getAttribute("lang")).toBe("my");
    expect(en().hasAttribute("lang")).toBe(false);
    // Both autonyms always render — a single toggling button is ambiguous between "you are in
    // Burmese" and "switch to Burmese", and unreadable for the person who needs it most.
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("names the group", () => {
    render(<StaffLangSwitch lang="my" />);
    expect(screen.getByRole("group").getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("mounts no POLITE region — each staff view keeps its one role=status", () => {
    // The failure notice below IS an assertive region (`role="alert"` implies
    // aria-live="assertive"); an earlier version of this test and the component's docblock both
    // claimed it was not a live region at all, which is simply false about the role. What must not
    // collide is the POLITE channel the surrounding view owns, and no `aria-live` may be written on
    // a role that already implies one.
    const { container } = render(<StaffLangSwitch lang="my" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("writes the chosen language once and refreshes", async () => {
    render(<StaffLangSwitch lang="my" />);
    fireEvent.click(en());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    expect(setStaffLang).toHaveBeenCalledWith({ lang: "en" });
  });

  it("does nothing when the pressed button is tapped again", async () => {
    render(<StaffLangSwitch lang="my" />);
    fireEvent.click(my());
    await Promise.resolve();
    expect(setStaffLang).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("never DISABLES a button — that is what would drop focus, and jsdom cannot show it", async () => {
    // ⚠️ THE ASSERTION THAT CARRIES THE WEIGHT IS `disabled`, not `activeElement`. A real browser
    // moves focus to <body> when the focused element becomes disabled; jsdom does not, so the
    // focus check below passed for the whole time the buttons WERE `disabled={pending}` and the
    // shipped control lost a keyboard user's place on every switch. Re-entry is blocked by the
    // `pending` guard in `choose`, asserted in the next test, not by removing the node.
    let release!: (v: { ok: true; lang: "en" }) => void;
    setStaffLang.mockReturnValue(new Promise((r) => (release = r)));
    render(<StaffLangSwitch lang="my" />);
    const target = en();
    target.focus();
    fireEvent.click(target);
    await waitFor(() => expect(setStaffLang).toHaveBeenCalled());
    expect(target.hasAttribute("disabled")).toBe(false);
    expect(my().hasAttribute("disabled")).toBe(false);
    expect(target.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(target);
    release({ ok: true, lang: "en" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("a second tap while the first is in flight writes nothing more", async () => {
    // The re-entry guard `disabled` used to provide, kept as behaviour now that the attribute is
    // gone — otherwise dropping `disabled` would trade a focus bug for a double-write.
    let release!: (v: { ok: true; lang: "en" }) => void;
    setStaffLang.mockReturnValue(new Promise((r) => (release = r)));
    render(<StaffLangSwitch lang="my" />);
    fireEvent.click(en());
    await waitFor(() => expect(setStaffLang).toHaveBeenCalledTimes(1));
    fireEvent.click(en());
    fireEvent.click(my());
    expect(setStaffLang).toHaveBeenCalledTimes(1);
    release({ ok: true, lang: "en" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("the failure notice is an ASSERTIVE region, and only mounts on failure", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    const { container } = render(<StaffLangSwitch lang="my" />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    fireEvent.click(en());
    const alert = await screen.findByRole("alert");
    // No redundant aria-live on a role that already implies one (QA §A).
    expect(alert.hasAttribute("aria-live")).toBe(false);
  });

  it("shows an alert on failure and does NOT claim the new language", async () => {
    setStaffLang.mockResolvedValue({ ok: false, error: "nope" });
    render(<StaffLangSwitch lang="my" />);
    fireEvent.click(en());
    await screen.findByRole("alert");
    expect(refresh).not.toHaveBeenCalled();
    // Derived from the prop, so a failed write leaves the pressed state telling the truth.
    expect(my().getAttribute("aria-pressed")).toBe("true");
    expect(en().getAttribute("aria-pressed")).toBe("false");
  });

  it("both buttons stay mounted while pending", async () => {
    let release!: (v: { ok: true; lang: "en" }) => void;
    setStaffLang.mockReturnValue(new Promise((r) => (release = r)));
    render(<StaffLangSwitch lang="my" />);
    fireEvent.click(en());
    await waitFor(() => expect(setStaffLang).toHaveBeenCalled());
    expect(my()).toBeTruthy();
    expect(en()).toBeTruthy();
    release({ ok: true, lang: "en" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
