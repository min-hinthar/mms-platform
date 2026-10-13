/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * Session truth (finding 5, Codex round 1 on #361) — the host's leave warning reads the table's
 * DURABLE party (`session_members`, through the member-gated `getSplitContext`), never presence.
 */
const h = vi.hoisted(() => ({ getSplitContext: vi.fn() }));
vi.mock("./split", () => ({ getSplitContext: h.getSplitContext }));

const { useDurableParty } = await import("./durable-party");

function Probe(p: { cartId: string | null; enabled: boolean; epoch: number }) {
  const seats = useDurableParty(p.cartId, p.enabled, p.epoch);
  return <p data-testid="party">{seats === null ? "unknown" : seats.join(",")}</p>;
}
const ctx = (seats: string[]) => ({
  mode: "dinein",
  mySeat: "me",
  myRole: "host",
  members: seats.map((seat) => ({ seat, name: seat, role: "guest" })),
  tableNumber: 5,
  sessionId: "s-1",
});

afterEach(() => {
  cleanup();
  h.getSplitContext.mockReset();
});

describe("useDurableParty", () => {
  it("reads the durable seats for the cart — a face-down phone is still at the table", async () => {
    // MUTATION (lcs/durable-party-reads-nothing): skip the read — the warning never shows for a
    // party whose other phones are pocketed.
    h.getSplitContext.mockResolvedValue(ctx(["me", "aye"]));
    render(<Probe cartId="cart-1" enabled epoch={1} />);
    await waitFor(() => expect(screen.getByTestId("party").textContent).toBe("me,aye"));
    expect(h.getSplitContext).toHaveBeenCalledWith("cart-1");
  });

  it("asks nothing unless the answer can matter (not the host, or no cart), and answers unknown", () => {
    render(<Probe cartId="cart-1" enabled={false} epoch={1} />);
    render(<Probe cartId={null} enabled epoch={1} />);
    expect(h.getSplitContext).not.toHaveBeenCalled();
    for (const el of screen.getAllByTestId("party")) expect(el.textContent).toBe("unknown");
  });

  it("re-reads when the epoch (presence) moves — a join shows there first", async () => {
    h.getSplitContext.mockResolvedValueOnce(ctx(["me"]));
    const { rerender } = render(<Probe cartId="cart-1" enabled epoch={1} />);
    await waitFor(() => expect(screen.getByTestId("party").textContent).toBe("me"));
    h.getSplitContext.mockResolvedValueOnce(ctx(["me", "aye"]));
    rerender(<Probe cartId="cart-1" enabled epoch={2} />);
    await waitFor(() => expect(screen.getByTestId("party").textContent).toBe("me,aye"));
  });

  it("a failed read claims nothing", async () => {
    h.getSplitContext.mockRejectedValue(new Error("cart_closed"));
    render(<Probe cartId="cart-1" enabled epoch={1} />);
    await waitFor(() => expect(h.getSplitContext).toHaveBeenCalled());
    expect(screen.getByTestId("party").textContent).toBe("unknown");
  });
});
