/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ActiveOrderStatus } from "./useActiveOrderStatus";

/**
 * Lifecycle audit (2026-10-13), D and I — the home card speaks the hook's `statusWord`, the ONE
 * derivation every other order surface speaks, and links as a RESUME on both branches.
 *
 * It re-derived its own ladder off the raw `togo_status` column: a held pickup (stamped 'preparing'
 * at payment, fired hours later) read "Preparing your order" while /track said "You’re booked for
 * 6:20 PM", and a self-scanned grocery basket read "Preparing", then "Your order is ready". The
 * fixtures below carry exactly those raw columns, so a card that reads the column again goes red.
 */
let hook: ActiveOrderStatus;
vi.mock("./useActiveOrderStatus", () => ({ useActiveOrderStatus: () => hook }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { HomeResumeCard } = await import("./HomeResumeCard");

const base = {
  tracked: null,
  kind: null,
  ready: false,
  isDone: false,
} satisfies Partial<ActiveOrderStatus>;
afterEach(cleanup);

describe("HomeResumeCard — one status word, one resume link", () => {
  it("a HELD pickup reads Scheduled, never the raw column's 'Preparing your order'", () => {
    hook = {
      ...base,
      order: { paymentIntent: "pi_1", cartId: "c1", mode: "pickup", createdAt: 0 },
      // The raw row says 'preparing' (stamped at payment); the shared word says Scheduled.
      tracked: { togoStatus: "preparing" } as ActiveOrderStatus["tracked"],
      kind: "pickup",
      statusWord: "Scheduled",
    };
    const { container } = render(<HomeResumeCard />);
    expect(container.querySelector(".home-resume-status")?.textContent).toBe("Scheduled");
    expect(container.textContent).not.toContain("Preparing");
  });

  it("a grocery basket the expo verified reads Ready to go, never 'Your order is ready'", () => {
    hook = {
      ...base,
      order: { paymentIntent: "pi_1", cartId: "c1", mode: "scango", createdAt: 0 },
      tracked: { togoStatus: "ready" } as ActiveOrderStatus["tracked"],
      kind: "grocery",
      statusWord: "Ready to go",
    };
    const { container } = render(<HomeResumeCard />);
    expect(container.querySelector(".home-resume-status")?.textContent).toBe("Ready to go");
    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe(
      "Ready to go — track your order",
    );
  });

  it("links as a RESUME on both branches (no arrival replay)", () => {
    hook = {
      ...base,
      order: { paymentIntent: null, cartId: "c9", mode: "dinein", createdAt: 0 },
      statusWord: "At your table",
    };
    const { container } = render(<HomeResumeCard />);
    // RED with the old hand-built `/track?cart=…&paid=1`: /track replays "Paid — thank you!".
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/track?cart=c9&paid=1&resume=1",
    );
  });

  it("renders nothing once the order is done", () => {
    hook = {
      ...base,
      order: { paymentIntent: "pi_1", cartId: null, mode: "dinein", createdAt: 0 },
      statusWord: "At your table",
      isDone: true,
    };
    const { container } = render(<HomeResumeCard />);
    expect(container.innerHTML).toBe("");
  });
});
