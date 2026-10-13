/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CartItem } from "@mms/db";

/**
 * Session truth — the MENU's kitchen strip (`MenuTimeline`) once the table has ENDED, and under the
 * register's settle freeze. Its own file (the strip's stage suite is `TableTimeline.test.tsx`): this
 * one drives the provider's context, which that suite stubs empty.
 */
type Ctx = {
  items: CartItem[];
  cartId: string | null;
  locked: boolean;
  settling: boolean;
  dbNow: string | null;
  ended: unknown;
};
const ctx = vi.hoisted(() => ({ current: {} as Ctx }));
vi.mock("./TableCartProvider", () => ({ useCart: () => ctx.current }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const { MenuTimeline } = await import("./TableTimeline");

const NOW = "2026-10-08T10:00:00.000Z";
const COOKING: CartItem = {
  id: "l-1",
  menuItemId: "m-1",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "in_progress",
  fireAt: new Date(Date.parse(NOW) - 600_000).toISOString(),
  bumpedAt: null,
  fulfillment: "dinein",
};
const LIVE: Ctx = {
  items: [COOKING],
  cartId: "cart-1",
  locked: false,
  settling: false,
  dbNow: NOW,
  ended: null,
};

afterEach(() => cleanup());

describe("MenuTimeline — session truth", () => {
  it("a live table narrates its kitchen as before", () => {
    ctx.current = LIVE;
    render(<MenuTimeline />);
    expect(screen.getByRole("region", { name: "Kitchen status" }).textContent).toContain(
      "Mohinga is being made",
    );
  });

  it("finding 8 — a table that CLOSED (cleared, merged, timed out) draws no kitchen strip: the clear voided those dishes", () => {
    // MUTATION (lcs/menu-strip-narrates-a-closed-table): drop the ended return — "Mohinga is being
    // made" stays on screen over food the kitchen was told to stop.
    for (const why of ["cleared", "closed", "expired"]) {
      ctx.current = { ...LIVE, ended: { kind: "ended", why } };
      const { container } = render(<MenuTimeline />);
      expect(container.textContent).toBe("");
      cleanup();
    }
  });

  it("finding 7 — a PAID table keeps its last view, QUIET (no dessert, no pay nudge) and labelled as no longer live", () => {
    ctx.current = {
      ...LIVE,
      ended: { kind: "paid", tender: "counter", orderId: "o-1", sessionLive: true },
    };
    render(<MenuTimeline />);
    const strip = screen.getByRole("region", { name: "Kitchen status" }).textContent ?? "";
    expect(strip).toContain("Mohinga is being made");
    expect(strip).toContain("As it stood when your bill was paid — this list won’t update here.");
    expect(strip).not.toContain("Room for dessert");
  });

  it("finding 2 — the REGISTER's freeze adds no 'pay your share' note (the split is parked)", () => {
    // MUTATION (lcs/menu-strip-speaks-the-split): pass the raw `settling` — the strip invites the
    // diner to "pay your share" through a door no phone can open.
    ctx.current = { ...LIVE, settling: true };
    render(<MenuTimeline />);
    const strip = screen.getByRole("region", { name: "Kitchen status" }).textContent ?? "";
    expect(strip).not.toContain("splitting the bill");
    expect(strip).not.toContain("pay your share");
  });
});
