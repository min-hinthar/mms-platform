/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staff-lang-server", () => ({ readStaffLang: async () => "my" }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { StaffOutageShell } = await import("./StaffOutageShell");
const { STAFF } = await import("@/lib/i18n/staff");

/**
 * signin-5 — the outage takeover wears the SAME bar as the page it replaces: a static, marked
 * leading slot (no Screens link — the doors need the auth answer this shell says is unknowable —
 * and no Lock), the page's name as the one h1, the language switch in the tail's fixed slot and
 * NOWHERE else; the card beneath is the entry column's, its heading an h2 that still takes focus.
 */
afterEach(cleanup);

describe("StaffOutageShell — the takeover wears the bar", () => {
  it("leads with the bar (static mark, switch in the tail); the card's heading is the h2 and takes focus", async () => {
    const { container } = render(await StaffOutageShell({ what: "what.floor" }));
    const main = container.querySelector("main.staff-main")!;
    expect(main).not.toBeNull();
    const bar = main.firstElementChild!;
    expect(bar.tagName).toBe("HEADER");
    expect(bar.classList.contains("staff-bar")).toBe(true);
    const mark = bar.querySelector(".staff-circ-here");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.querySelector("svg")?.getAttribute("class")).toMatch(/alert/);
    expect(bar.querySelector("a")).toBeNull();
    expect(screen.queryByRole("button", { name: STAFF["shell.lock"].my })).toBeNull();
    const switches = container.querySelectorAll(".staff-lang");
    expect(switches.length).toBe(1);
    expect(switches[0]!.closest(".staff-bar-tail")).not.toBeNull();
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(bar.querySelector("h1")?.textContent).toContain(STAFF["out.shell.title"].my);
    const col = main.querySelector(".staff-col.entry-col")!;
    expect(col).not.toBeNull();
    expect(col.querySelector("h1")).toBeNull();
    const h2 = col.querySelector("h2")!;
    expect(h2).not.toBeNull();
    expect(document.activeElement).toBe(h2);
    expect(col.textContent).toContain(STAFF["what.floor"].my);
    expect(
      screen.getByRole("button", { name: new RegExp(STAFF["out.shell.retry"].my) }),
    ).toBeTruthy();
  });
});
