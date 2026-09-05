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

  it("mounts NO live region — each staff view keeps its one", () => {
    const { container } = render(<StaffLangSwitch lang="my" />);
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
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

  it("keeps focus on the tapped button", async () => {
    render(<StaffLangSwitch lang="my" />);
    const target = en();
    target.focus();
    fireEvent.click(target);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(document.activeElement).toBe(target);
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
