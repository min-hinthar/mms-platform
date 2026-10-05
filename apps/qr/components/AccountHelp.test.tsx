/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountHelp } from "./AccountHelp";

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
});
