/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { TableEnd } from "@/lib/session-truth";

/**
 * Session truth — the ONE card a table that ENDED shows (`TableEndedCard`, /menu and /cart), and the
 * menu's mount of it (`MenuTableEnded`). What the pure words module cannot see: that each end is
 * drawn with its own words in both tongues, that the way forward is the right control in the right
 * state, that the card is not a second live region, and that focus orphaned by the inert controls
 * lands on its heading — never stolen from where the diner put it.
 */
vi.mock("@/components/nav/TransitionNav", () => ({
  TransitionLink: (p: ComponentProps<"a">) => <a {...p} />,
}));
const ctx = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("./TableCartProvider", () => ({ useCart: () => ctx.current }));

const { TableEndedCard } = await import("./TableEnded");
const { MenuTableEnded } = await import("./MenuTableEnded");

const CLEARED: TableEnd = { kind: "ended", why: "cleared" };
const PAID: TableEnd = { kind: "paid", tender: "counter", orderId: "o-1", sessionLive: true };
const mint = (over: Partial<{ busy: boolean; failed: boolean; onStart: () => void }> = {}) => ({
  kind: "mint" as const,
  onStart: vi.fn(),
  busy: false,
  failed: false,
  ...over,
});

afterEach(() => cleanup());

describe("TableEndedCard — the cause, in both tongues, and the way on", () => {
  it("a CLEARED table: the title and body name the clear, with their Burmese, and ask-our-staff", () => {
    render(<TableEndedCard end={CLEARED} trackHref={null} start={mint()} />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h.textContent).toContain("Our staff closed this table");
    expect(h.querySelector('[lang="my"]')?.textContent).toMatch(/[က-႟]/);
    expect(
      screen.getByText(/Anything not yet served was cancelled — you won’t be charged for it\./),
    ).toBeTruthy();
    expect(screen.getByText(/Not what you expected\? Ask our staff\./)).toBeTruthy();
    // Not a live region: the provider speaks the title once through the view's one region.
    expect(document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(
      0,
    );
  });

  it("a PAID table whose order this seat may see: Track first, the new order second, no staff line at a seated table", () => {
    render(<TableEndedCard end={PAID} trackHref="/track?cart=c&paid=1" start={mint()} />);
    const track = screen.getByRole("link", { name: /Track your order/ });
    expect(track.getAttribute("href")).toBe("/track?cart=c&paid=1");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "All paid — thank you!",
    );
    expect(screen.queryByText(/Ask our staff/)).toBeNull();
    const start = screen.getByRole("button", { name: /Start a new order/ });
    expect(track.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("'Start a new order' calls once; busy, it holds its place (aria-busy, re-entry refused); a failure is said beside it", () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <TableEndedCard end={CLEARED} trackHref={null} start={mint({ onStart })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Start a new order/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
    rerender(
      <TableEndedCard end={CLEARED} trackHref={null} start={mint({ onStart, busy: true })} />,
    );
    const busy = screen.getByRole("button", { name: /Starting your new order/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);
    expect(onStart).toHaveBeenCalledTimes(1);
    rerender(
      <TableEndedCard end={CLEARED} trackHref={null} start={mint({ onStart, failed: true })} />,
    );
    expect(screen.getByText("Couldn’t start a new order — try again.")).toBeTruthy();
  });

  it("on the Bill the way on is a link to the menu", () => {
    render(
      <TableEndedCard
        end={{ kind: "ended", why: "expired" }}
        trackHref={null}
        start={{ kind: "link", href: "/menu?mode=dinein" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "This table’s order timed out",
    );
    expect(screen.getByRole("link", { name: /Start a new order/ }).getAttribute("href")).toBe(
      "/menu?mode=dinein",
    );
  });

  describe("focus — orphaned focus lands on the heading; a live control the diner chose is left alone", () => {
    const heading = () => screen.getByRole("heading", { level: 2 });
    const card = () => render(<TableEndedCard end={CLEARED} trackHref={null} start={mint()} />);

    it("focus on <body> (nowhere) moves to the heading", () => {
      (document.activeElement as HTMLElement | null)?.blur();
      card();
      expect(document.activeElement).toBe(heading());
    });

    it("focus left on an Add that went natively DISABLED under it moves to the heading", () => {
      // MUTATION (lcs/disabled-focus-is-not-orphaned): only <body> counts — a keyboard user stays
      // parked on a dead Add while the card that says why appears elsewhere (the blind pass on #361).
      const add = document.createElement("button");
      document.body.appendChild(add);
      add.focus();
      add.disabled = true;
      card();
      expect(document.activeElement).toBe(heading());
      add.remove();
    });

    it("focus left on a control held aria-disabled (the Send, the stepper) moves to the heading", () => {
      const send = document.createElement("button");
      document.body.appendChild(send);
      send.focus();
      send.setAttribute("aria-disabled", "true");
      card();
      expect(document.activeElement).toBe(heading());
      send.remove();
    });

    it("focus on an unrelated LIVE control is left where the diner put it", () => {
      // MUTATION (lcs/card-steals-or-drops-focus): focus unconditionally — the card steals focus the
      // diner placed elsewhere (WCAG 2.4.3).
      const other = document.createElement("button");
      document.body.appendChild(other);
      other.focus();
      card();
      expect(document.activeElement).toBe(other);
      other.remove();
    });
  });
});

describe("MenuTableEnded — the menu's mount", () => {
  it("draws nothing until the table has ended", () => {
    ctx.current = {
      ended: null,
      restarting: false,
      startNewOrder: vi.fn(),
      cartId: "c",
      error: null,
    };
    const { container } = render(<MenuTableEnded />);
    expect(container.textContent).toBe("");
  });

  it("wires the provider's restart, busy state and failure, and the tracker only for an order this seat may see", () => {
    const startNewOrder = vi.fn();
    ctx.current = { ended: PAID, restarting: false, startNewOrder, cartId: "cart-1", error: null };
    const { rerender } = render(<MenuTableEnded />);
    expect(screen.getByRole("link", { name: /Track your order/ }).getAttribute("href")).toBe(
      "/track?cart=cart-1&paid=1",
    );
    fireEvent.click(screen.getByRole("button", { name: /Start a new order/ }));
    expect(startNewOrder).toHaveBeenCalledTimes(1);
    ctx.current = { ...ctx.current, ended: { ...PAID, orderId: null }, error: "x" };
    rerender(<MenuTableEnded />);
    expect(screen.queryByRole("link", { name: /Track your order/ })).toBeNull();
    expect(screen.getByText("Couldn’t start a new order — try again.")).toBeTruthy();
  });
});
