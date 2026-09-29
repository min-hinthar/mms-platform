/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_QUERY, paneUrl } from "@/lib/floor-pane";

/**
 * Phase 2d · split — a way back to a table (the order pad's "← Table 7") lands in the counter's
 * pane at split width and on the full table page below it, decided at CLICK time.
 */
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }),
}));
const { StaffBar } = await import("./StaffBar");

const A = "0b8c1e7a-3f7d-4c2a-9e51-6a2b1c3d4e5f";
let split = true;
const bar = () => (
  <StaffBar
    lang="en"
    title="browse.title.add"
    leading={{
      kind: "back",
      href: `/staff/table/${A}`,
      paneHref: paneUrl(A),
      k: "browse.back.table",
      vars: { id: "7" },
    }}
  />
);
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: split && q === PANE_QUERY,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("StaffBar — a split-aware way back", () => {
  it("renders the same real link (href, classes) on the server", () => {
    const html = renderToString(bar());
    expect(html).toContain(`href="/staff/table/${A}"`);
    expect(html).toContain('class="staff-back staff-press"');
  });
  it("at split width a plain click goes to the pane", async () => {
    split = true;
    render(bar());
    const link = screen.getByRole("link", { name: /7/ });
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.click(link);
    });
    expect(push).toHaveBeenCalledWith(paneUrl(A));
    expect(notPrevented).toBe(false);
  });
  it("on a phone, or a modified click, the real link runs", async () => {
    split = false;
    render(bar());
    const link = screen.getByRole("link", { name: /7/ });
    await act(async () => {
      fireEvent.click(link);
    });
    split = true;
    await act(async () => {
      fireEvent.click(link, { metaKey: true });
    });
    // MUTATION: always push — a phone lands on the counter screen's hash; red.
    expect(push).not.toHaveBeenCalled();
  });
});
