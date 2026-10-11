/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDE_COPY } from "@/lib/diner-guide";

vi.mock("posthog-js", () => ({ default: { capture: () => {} } }));
const { AccountHelp } = await import("./AccountHelp");

/** Deep pass on #312 — a link that opens a new tab says so to the ear (WCAG G201): the social links
 *  carried `target="_blank"` with the bare names "Instagram" / "Facebook" as their whole name. */
afterEach(cleanup);

describe("AccountHelp", () => {
  it("names the new-tab behaviour of the social links in their accessible name", () => {
    render(<AccountHelp />);
    for (const site of ["Instagram", "Facebook"]) {
      const a = screen.getByRole("link", {
        name: new RegExp(`^${site} \\(opens in a new tab\\)$`),
      });
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("leads with PD11's door back into the first-visit guide — a real button that opens a dialog", () => {
    render(<AccountHelp />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    // MUTATION (pd11/account/door-dropped): no row — "this guide under Account" (page 5) is false; red.
    const door = within(rows[0]!).getByRole("button", { name: GUIDE_COPY.accountRow });
    expect(door.getAttribute("aria-haspopup")).toBe("dialog");
  });
});
