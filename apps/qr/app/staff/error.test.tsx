/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("posthog-js", () => ({
  default: { captureException: (e: unknown) => captureException(e) },
}));
vi.mock("@/lib/error-recovery", () => ({ bumpErrorCount: () => 1, tryChunkReload: () => false }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { default: StaffError } = await import("./error");
const { StaffLangProvider } = await import("@/components/staff/StaffLangProvider");
const { STAFF } = await import("@/lib/i18n/staff");

/**
 * signin-5 — the error boundary is a takeover like the outage shell, and wears the bar the same
 * way: static mark, one h1, the switch in the tail and nowhere else, the card an h2 that takes
 * focus, the way out a HARD link to the doors by name, and Retry wired to `reset`.
 */
afterEach(cleanup);

describe("app/staff/error — the boundary wears the bar", () => {
  it("bar first, switch in the tail, card h2 focused, doors link hard, Retry resets", async () => {
    const reset = vi.fn();
    const { container } = render(
      <StaffLangProvider lang="my">
        <StaffError error={new Error("boom")} reset={reset} />
      </StaffLangProvider>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const main = container.querySelector("main.staff-main")!;
    const bar = main.firstElementChild!;
    expect(bar.tagName).toBe("HEADER");
    expect(bar.classList.contains("staff-bar")).toBe(true);
    expect(bar.querySelector(".staff-circ-here")?.getAttribute("aria-hidden")).toBe("true");
    expect(bar.querySelector(".staff-circ-here svg")?.getAttribute("class")).toMatch(/alert/);
    expect(bar.querySelector("a")).toBeNull();
    const switches = container.querySelectorAll(".staff-lang");
    expect(switches.length).toBe(1);
    expect(switches[0]!.closest(".staff-bar-tail")).not.toBeNull();
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(bar.querySelector("h1")?.textContent).toContain(STAFF["out.err.title"].my);
    const col = main.querySelector(".staff-col.entry-col")!;
    const h2 = col.querySelector("h2")!;
    expect(document.activeElement).toBe(h2);
    const back = screen.getByRole("link", { name: new RegExp(STAFF["out.err.back"].my) });
    expect(back.getAttribute("href")).toBe("/staff?doors=1");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(STAFF["out.shell.retry"].my) }));
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  });
});
