/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * Session truth (finding 5, Codex rounds 1–2 on #361) — the host's leave warning reads the table's
 * DURABLE party (`session_members`, through the member-gated `getSplitContext`), never presence, and
 * says whether the seats it answers were read for the CURRENT epoch.
 */
const h = vi.hoisted(() => ({ getSplitContext: vi.fn() }));
vi.mock("./split", () => ({ getSplitContext: h.getSplitContext }));

const { useDurableParty } = await import("./durable-party");

function Probe(p: { cartId: string | null; enabled: boolean; epoch: string }) {
  const party = useDurableParty(p.cartId, p.enabled, p.epoch);
  return (
    <p data-testid="party">
      {party === null ? "unknown" : `${party.seats.join(",")}${party.current ? "" : " (stale)"}`}
    </p>
  );
}
const ctx = (seats: string[]) => ({
  mode: "dinein",
  mySeat: "me",
  myRole: "host",
  members: seats.map((seat) => ({ seat, name: seat, role: "guest" })),
  tableNumber: 5,
  sessionId: "s-1",
});
const shown = () => screen.getByTestId("party").textContent;

/** A promise the test settles by hand — the read still out while the screen is checked. */
function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  h.getSplitContext.mockReset();
});

describe("useDurableParty", () => {
  it("reads the durable seats for the cart — a face-down phone is still at the table", async () => {
    // MUTATION (lcs/durable-party-reads-nothing): skip the read — the warning never shows for a
    // party whose other phones are pocketed.
    h.getSplitContext.mockResolvedValue(ctx(["me", "aye"]));
    render(<Probe cartId="cart-1" enabled epoch="1" />);
    await waitFor(() => expect(shown()).toBe("me,aye"));
    expect(h.getSplitContext).toHaveBeenCalledWith("cart-1");
  });

  it("asks nothing unless the answer can matter (not the host, or no cart), and answers unknown", () => {
    render(<Probe cartId="cart-1" enabled={false} epoch="1" />);
    render(<Probe cartId={null} enabled epoch="1" />);
    expect(h.getSplitContext).not.toHaveBeenCalled();
    for (const el of screen.getAllByTestId("party")) expect(el.textContent).toBe("unknown");
  });

  it("re-reads when the epoch moves, and the older answer is STALE until the new one lands (Codex round 2 on #361)", async () => {
    // MUTATION (lcs/durable-party-stale-reads-current): the answer is marked current whatever epoch
    // it was read for — a minutes-old "alone" stands while the read the leave flow asked is still
    // out, and the warning stays silent over a party that has grown.
    h.getSplitContext.mockResolvedValueOnce(ctx(["me"]));
    const { rerender } = render(<Probe cartId="cart-1" enabled epoch="1·0" />);
    await waitFor(() => expect(shown()).toBe("me"));
    const fresh = deferred<ReturnType<typeof ctx>>();
    h.getSplitContext.mockReturnValueOnce(fresh.promise);
    rerender(<Probe cartId="cart-1" enabled epoch="1·1" />);
    expect(h.getSplitContext).toHaveBeenCalledTimes(2);
    expect(shown()).toBe("me (stale)");
    fresh.resolve(ctx(["me", "aye"]));
    await waitFor(() => expect(shown()).toBe("me,aye"));
  });

  it("a failed read claims nothing — and a failed RE-read leaves the older answer stale, never current", async () => {
    h.getSplitContext.mockRejectedValueOnce(new Error("cart_closed"));
    const { rerender } = render(<Probe cartId="cart-1" enabled epoch="1" />);
    await waitFor(() => expect(h.getSplitContext).toHaveBeenCalled());
    expect(shown()).toBe("unknown");
    h.getSplitContext.mockResolvedValueOnce(ctx(["me"]));
    rerender(<Probe cartId="cart-1" enabled epoch="2" />);
    await waitFor(() => expect(shown()).toBe("me"));
    h.getSplitContext.mockRejectedValueOnce(new Error("blip"));
    rerender(<Probe cartId="cart-1" enabled epoch="3" />);
    await waitFor(() => expect(h.getSplitContext).toHaveBeenCalledTimes(3));
    expect(shown()).toBe("me (stale)");
  });
});
