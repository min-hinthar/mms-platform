/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UndoGrace } from "./useUndoGrace";
import type { SendHandle } from "./SendToKitchenButton";

/**
 * Phase 1b — Send to kitchen is ONE tap (the W16c confirm is retired; the server-clocked undo is the
 * safety net). Phase 3c-i (D15) — the control is CONTROLLED and presentational: the undo window is
 * Checkout's (`useUndoGrace`), and every outcome sentence leaves through `onMessage` to the view's
 * one live region. What this pins is the wiring nothing else can see: the tap reaches the server,
 * the success line carries the owner's own Burmese, a frozen cart is refused at the door, the window
 * opens from the server's receipt, and the Undo is never drawn as the filled hero.
 */
const h = vi.hoisted(() => ({ sendToKitchen: vi.fn(), undoFire: vi.fn() }));
vi.mock("@/lib/cart", () => ({ sendToKitchen: h.sendToKitchen, undoFire: h.undoFire }));
vi.mock("@/lib/diner-sound", () => ({ chime: () => {} }));

const { SendToKitchenButton } = await import("./SendToKitchenButton");

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const { FROZEN_NOTE } = await import("./useUndoGrace");

afterEach(() => {
  cleanup();
  h.sendToKitchen.mockReset();
});

/** A hand-built grace — the hook's shape, with every write a spy. */
function grace(over: Partial<UndoGrace> = {}): UndoGrace {
  return {
    deadlineMs: null,
    batch: null,
    remaining: 0,
    pending: false,
    message: null,
    closedBy: null,
    graceWrites: { current: Promise.resolve() },
    undoBtnRef: () => {},
    open: vi.fn(),
    undo: vi.fn(() => Promise.resolve()),
    isOpen: () => false,
    ...over,
  };
}

const mount = (p: {
  verb: "send" | "undo" | "bill";
  frozen?: boolean;
  grace?: UndoGrace;
  onMessage?: (text: string, my?: string) => void;
  draftCount?: number;
  /** 3c-ii (D27) — the table gate and the host's ask. */
  needsTable?: boolean;
  onNeedTable?: () => void;
}) => {
  const g = p.grace ?? grace();
  const onMessage = p.onMessage ?? vi.fn();
  const handle: { current: SendHandle | null } = { current: null };
  render(
    <SendToKitchenButton
      ref={handle}
      cartId="cart-1"
      verb={p.verb}
      grace={g}
      draftCount={p.draftCount ?? 3}
      frozen={p.frozen ?? false}
      onMessage={onMessage}
      onChanged={() => {}}
      needsTable={p.needsTable}
      onNeedTable={p.onNeedTable}
    />,
  );
  return { g, onMessage, handle };
};

describe("Phase 1b — one tap sends", () => {
  it("sends on the FIRST tap, says so in both tongues, and opens the window from the receipt", async () => {
    // MUTATION: restore a confirm step (the tap opens a question instead of sending) — the server
    // is never reached by one tap; red.
    const res = {
      ok: true,
      fired: 3,
      undoUntil: "2026-10-04T12:00:10.000Z",
      serverNow: "2026-10-04T12:00:00.000Z",
      undoBatch: "batch-1",
    };
    h.sendToKitchen.mockResolvedValue(res);
    const { g, onMessage } = mount({ verb: "send" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    // MUTATION: drop the `my` half of the outcome — the owner's own words vanish; red.
    expect(onMessage).toHaveBeenCalledWith(
      "Sent to the kitchen — 3 items on the way.",
      "Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ",
    );
    // MUTATION: never hand the receipt to the grace — no window ever opens; red.
    expect(g.open).toHaveBeenCalledWith(res, expect.any(Number));
    // No private live region: the ONE region is the view's (QA §A:25).
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a frozen cart is refused at the door — nothing reaches the server", async () => {
    const { onMessage } = mount({ verb: "send", frozen: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(FROZEN_NOTE);
  });
});

/**
 * Phase 3c-ii (D27) — the table is asked INSIDE the send, once, on an unbound session: `send()`
 * keeps the frozen refusal FIRST, then — when the host says a table is needed and offers an ask —
 * calls `onNeedTable` and RETURNS before the server. The host's handle runs the SAME send once the
 * chip has answered (`tableAnswered`), and `focus()` lands on whichever control is mounted (the
 * Undo after a send that opened the window; the Send otherwise) — the sheet's success edge needs a
 * stable target after the modal unmounts.
 */
describe("Phase 3c-ii (D27) — the table gate inside send()", () => {
  it("an unbound dine-in send ASKS: the host's ask is called once and NOTHING reaches the server or the region", async () => {
    const onNeedTable = vi.fn();
    const { onMessage } = mount({ verb: "send", needsTable: true, onNeedTable });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    // MUTANT send-button/unbound-send-reaches-the-server: the `return` after the ask is dropped —
    // the sheet opens AND the order goes to the kitchen numberless behind it; red.
    expect(onNeedTable).toHaveBeenCalledTimes(1);
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("a FROZEN cart is refused at the door BEFORE the table is asked — no sheet over a lock", async () => {
    const onNeedTable = vi.fn();
    const { onMessage } = mount({ verb: "send", frozen: true, needsTable: true, onNeedTable });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    // MUTANT send-button/sheet-opens-under-a-freeze: the gate runs before the frozen refusal — a
    // table is bound under a peer's charge (the fulfill RPC snapshots the number at settlement)
    // and the send it was about to run is refused anyway; red.
    expect(onNeedTable).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(FROZEN_NOTE);
    expect(h.sendToKitchen).not.toHaveBeenCalled();
  });

  it("the handle runs the SAME send with the table answered — the gate is skipped, the server reached, the window opened", async () => {
    const res = {
      ok: true,
      fired: 2,
      undoUntil: "2026-10-04T12:00:10.000Z",
      serverNow: "2026-10-04T12:00:00.000Z",
      undoBatch: "batch-2",
    };
    h.sendToKitchen.mockResolvedValue(res);
    const onNeedTable = vi.fn();
    const { g, handle } = mount({ verb: "send", needsTable: true, onNeedTable });
    await act(async () => {
      handle.current!.send({ tableAnswered: true });
    });
    expect(onNeedTable).not.toHaveBeenCalled();
    expect(h.sendToKitchen).toHaveBeenCalledWith("cart-1");
    expect(g.open).toHaveBeenCalledWith(res, expect.any(Number));
  });

  it("the handle's send still honours the freeze first", async () => {
    const { handle, onMessage } = mount({ verb: "send", frozen: true, needsTable: true });
    await act(async () => {
      handle.current!.send({ tableAnswered: true });
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(FROZEN_NOTE);
  });

  it("with no host to ask, a needed table never blocks the send — the order goes out unbound, as before 3c-ii", async () => {
    h.sendToKitchen.mockResolvedValue({ ok: false, reason: "nothing" });
    mount({ verb: "send", needsTable: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
  });

  it("the handle's send is held while one is PENDING — one server call per gesture (the blind pass on 3c-ii: the tap path's native disable never covered the handle)", async () => {
    const sending = deferred<unknown>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    const { handle } = mount({ verb: "send", needsTable: true, onNeedTable: vi.fn() });
    await act(async () => {
      handle.current!.send({ tableAnswered: true });
    });
    await act(async () => {
      handle.current!.send({ tableAnswered: true });
      fireEvent.click(screen.getByRole("button", { name: /^Sending…/ })); // the pending name
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    await act(async () => {
      sending.resolve({ ok: false, reason: "nothing" });
    });
  });

  it("a PENDING Send stays focusable — aria-busy + aria-disabled, never natively disabled — so the host's landing after the table sheet reaches it, and a failed send leaves focus there", async () => {
    const sending = deferred<unknown>();
    h.sendToKitchen.mockReturnValue(sending.promise);
    const { handle, onMessage } = mount({ verb: "send" });
    await act(async () => {
      handle.current!.send({ tableAnswered: true });
    });
    const btn = screen.getByRole("button", { name: /^Sending…/ }); // the pending name
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(false);
    handle.current!.focus();
    expect(document.activeElement).toBe(btn);
    await act(async () => {
      sending.resolve({ ok: false, reason: "locked" });
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Send to kitchen/i })).toBe(btn);
    expect(btn.getAttribute("aria-busy")).toBe("false");
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("`focus()` lands on the mounted control: the Send, or the Undo once the window is open", () => {
    const { handle } = mount({ verb: "send" });
    handle.current!.focus();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Send to kitchen/i }));
    cleanup();
    const { handle: undoHandle } = mount({
      verb: "undo",
      grace: grace({ deadlineMs: Date.now() + 7_000, batch: "batch-1", remaining: 7 }),
    });
    undoHandle.current!.focus();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo — 7s" }));
  });
});

describe("Phase 3c-i (D13/D15) — the Undo is controlled, outline, and never the hero", () => {
  it("Undo is never the filled hero, counts down the grace's seconds, and targets the grace's batch", async () => {
    const g = grace({ deadlineMs: Date.now() + 7_000, batch: "batch-1", remaining: 7 });
    mount({ verb: "undo", grace: g });
    const undo = screen.getByRole("button", { name: "Undo — 7s" });
    // MUTATION (send-button/undo-is-rendered-as-the-hero): Undo gets `.checkout-cta` — reversing
    // becomes the filled verb; red.
    expect(undo.classList.contains("checkout-cta")).toBe(false);
    expect(undo.classList.contains("checkout-outline-btn")).toBe(true);
    // aria-disabled, never native: the window parks focus on this very button.
    expect(undo.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(undo);
    });
    expect(g.undo).toHaveBeenCalledWith("cart-1", false);
    expect(screen.queryByRole("button", { name: /Send to kitchen/i })).toBeNull();
  });

  it("a frozen Undo stays reachable (aria-disabled) and hands the freeze to the grace, which refuses", async () => {
    const g = grace({ deadlineMs: Date.now() + 7_000, batch: "batch-1", remaining: 7 });
    mount({ verb: "undo", grace: g, frozen: true });
    const undo = screen.getByRole("button", { name: "Undo — 7s" });
    expect(undo.getAttribute("aria-disabled")).toBe("true");
    expect(undo.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(undo);
    });
    expect(g.undo).toHaveBeenCalledWith("cart-1", true);
  });

  it("an undo in flight reads 'Bringing it back…'", () => {
    mount({
      verb: "undo",
      grace: grace({ deadlineMs: Date.now() + 7_000, remaining: 7, pending: true }),
    });
    expect(screen.getByRole("button", { name: "Bringing it back…" })).toBeTruthy();
  });

  it("verb 'bill' with nothing left to send is the quiet confirmation, never a button", () => {
    mount({ verb: "bill", draftCount: 0 });
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).toContain("Your order’s with the kitchen.");
  });

  it("verb 'bill' with drafts (a guest, a hostless table) draws nothing — the hero is the door", () => {
    mount({ verb: "bill", draftCount: 2 });
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toContain("with the kitchen");
  });
});
