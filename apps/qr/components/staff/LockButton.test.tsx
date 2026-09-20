/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";

const lockConsole = vi.fn();
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: () => lockConsole() }));
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (m: string) => haptic(m) }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { LockButton } = await import("./LockButton");
const { StaffBar } = await import("./StaffBar");

/**
 * signin-3 · chrome-1 — the Lock circle. What is worth pinning: busy is SPOKEN through the name and
 * never native `disabled` (focus stays on the circle a person just tapped); a second tap while the
 * first is held posts nothing; a refusal is a dictionary KEY — Burmese under the Burmese switch —
 * rendered in the bar's own line beneath the tail, never a sibling between two circles; an outage
 * (refused or thrown) says so and releases the circle; a gone session re-gates instead of
 * explaining; and the circle wears the console's press idiom and buzzes a commit.
 */
afterEach(cleanup);
beforeEach(() => {
  lockConsole.mockReset();
  haptic.mockReset();
  replace.mockReset();
  refresh.mockReset();
  lockConsole.mockResolvedValue({ ok: true });
});

const circle = () => screen.getByRole("button", { name: /Lock this tablet|Locking…/ });

describe("LockButton", () => {
  it("speaks busy through its name, is never natively disabled, refuses a second tap while held, then locks", async () => {
    let settle!: (v: unknown) => void;
    lockConsole.mockReturnValue(new Promise((r) => (settle = r)));
    render(<LockButton lang="en" />);
    const b = circle();
    b.focus();
    fireEvent.click(b);
    expect(lockConsole).toHaveBeenCalledTimes(1);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Locking…" })).toBe(b);
    expect(document.activeElement).toBe(b);
    fireEvent.click(b); // held — refused by the handler, not by the DOM
    expect(lockConsole).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/lock"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1); // one commit per ACCEPTED tap, none for the refused one
    expect(haptic).toHaveBeenCalledWith("commit");
  });

  it("a `no_pin` answer is the dictionary's — Burmese under the Burmese switch — in the bar's line beneath the tail, and the circle is live again", async () => {
    lockConsole.mockResolvedValue({ ok: false, reason: "no_pin" });
    const { container } = render(<StaffBar lang="my" title="kds.title" lock />);
    const b = screen.getByRole("button", { name: STAFF["shell.lock"].my });
    fireEvent.click(b);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(STAFF["shell.lock.err.noPin"].my);
    expect(alert.textContent).not.toContain("Set a PIN"); // no English echo inside a live region
    expect(alert.querySelector('[lang="my"]')).not.toBeNull();
    expect(alert.className).toBe("staff-bar-msg");
    // A CHILD of the tail (the rule below keys on that), never a sibling of the circles' row.
    expect(alert.parentElement).toBe(container.querySelector(".staff-bar-tail"));
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(b.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(b);
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["refused", () => lockConsole.mockResolvedValue({ ok: false, reason: "outage" })],
    ["THROWN", () => lockConsole.mockRejectedValue(new Error("fetch failed"))],
  ])("an outage — %s — says the outage key and releases the circle", async (_, arm) => {
    arm();
    render(<LockButton lang="en" />);
    fireEvent.click(circle());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(STAFF["shell.lock.err.outage"].en);
    expect(circle().getAttribute("aria-busy")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(circle());
    expect(lockConsole).toHaveBeenCalledTimes(2);
  });

  it("a gone session (`auth`) re-gates the page instead of explaining from a bar circle", async () => {
    lockConsole.mockResolvedValue({ ok: false, reason: "auth" });
    render(<LockButton lang="en" />);
    fireEvent.click(circle());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(circle().getAttribute("aria-busy")).toBeNull();
  });

  it("wears the press idiom like every other bar circle", () => {
    render(<LockButton lang="en" />);
    expect(circle().className).toBe("staff-circ staff-press");
  });
});

describe("the refusal line's CSS", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  it("takes the tail's full width beneath the utilities row, ordered last — a child rule, matching the DOM above", () => {
    const rule = css.match(/\.staff-bar-tail > \.staff-bar-msg\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/flex-basis:\s*100%/);
    expect(rule![1]).toMatch(/order:\s*[1-9]/);
  });
});
