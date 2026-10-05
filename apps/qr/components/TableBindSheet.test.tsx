/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BIND_COPY } from "@/lib/bind-copy";
import type { BindTableResult } from "@/lib/bind-table";
import { t } from "@/lib/i18n";
import type { DineInTable } from "@/lib/tables";

/**
 * Phase 3c-ii (D27 · D28) — the Send-time table sheet, against a FAKE host that owns what Checkout
 * owns (open · the note · what to do with each answer). What this pins is the sheet's own contract:
 * named by its title in both tongues with NO live region; a chip binds through ONE bounded write
 * (`busy` holds every exit while it is out, cleared in a finally) and hands the host the CONFIRMED
 * answer only — nothing while the bind pends; `seated` flips that chip to Seated and reveals the
 * inline join with focus in the input (plus the drafts note while drafts exist), and the chip is a
 * disclosure, never natively disabled, never a second claim; "Send anyway" sends unbound; a
 * dismissal calls nothing; and on the SEND edge the close prevents the primitive's restore (the Send
 * node the modal would return to has given way) and the host lands focus AFTER the unmount.
 */
const h = vi.hoisted(() => ({ bindTable: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/bind-table", () => ({ bindTable: h.bindTable }));
vi.mock("@/lib/cart", () => ({ sendToKitchen: vi.fn(), undoFire: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => h.capture(...a) } }));
vi.mock("@/lib/useSessionPeek", () => ({
  useSessionPeek: () => [{ mode: "dinein", tableNumber: 5, itemCount: 0, cartId: null }],
}));
vi.mock("@/components/nav/TransitionNav", () => ({ useJourneyRouter: () => ({ push: vi.fn() }) }));

const { TableBindSheet } = await import("./TableBindSheet");
const { FROZEN_NOTE } = await import("./useUndoGrace");

const TABLES: DineInTable[] = [
  { tableNumber: 2, occupied: false },
  { tableNumber: 5, occupied: true }, // the peek says MINE — must still read Seated here
  { tableNumber: 9, occupied: false },
];
const CART = "cart-1";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What Checkout does with the sheet: owns `open` and the visible note, confirms on ok. */
function Host(props: {
  draftQty?: number;
  frozen?: boolean;
  onFrozen?: (sentence: string) => void;
  onOutcome: (r: BindTableResult) => void;
  onSendAnyway: () => void;
  onClosed: (e: { sent: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const undo = useRef<HTMLButtonElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={trigger} onClick={() => setOpen(true)}>
        open-sheet
      </button>
      <button type="button" ref={undo}>
        undo-stub
      </button>
      <TableBindSheet
        open={open}
        onOpenChange={setOpen}
        onClaim={(n) => h.bindTable(CART, n)}
        tables={TABLES}
        draftQty={props.draftQty ?? 2}
        frozen={props.frozen ?? false}
        onFrozen={(s) => {
          props.onFrozen?.(s);
          setNote(s);
        }}
        note={note}
        onOutcome={(r) => {
          props.onOutcome(r);
          if (r.ok) setOpen(false);
          else setNote(`note:${r.reason}`);
        }}
        onSendAnyway={() => {
          props.onSendAnyway();
          setOpen(false);
        }}
        onClosed={(e) => {
          props.onClosed(e);
          // The landing is the host's on both edges (Checkout: `sendHandle.focus()` — the Undo
          // after a send, the Send after a dismissal).
          (e.sent ? undo : trigger).current?.focus();
        }}
      />
    </>
  );
}

const spies = () => ({ onOutcome: vi.fn(), onSendAnyway: vi.fn(), onClosed: vi.fn() });
const openSheet = () => {
  const trigger = screen.getByRole("button", { name: "open-sheet" });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.getByRole("dialog");
};
const chip = (n: number) => screen.getByRole("button", { name: new RegExp(`^Table ${n},`) });
const text = (el: Element | null) => el?.textContent ?? "";

beforeEach(() => {
  h.bindTable.mockReset();
  h.capture.mockReset();
});
afterEach(cleanup);

describe("TableBindSheet — named, quiet, the K2 chips", () => {
  it("is a dialog named 'Pick your table' in both tongues (lang=my), carries the sub-line and its MY draft, and has NO live region", () => {
    render(<Host {...spies()} />);
    const dialog = openSheet();
    const name = dialog.getAttribute("aria-labelledby");
    const title = document.getElementById(name!)!;
    expect(text(title)).toContain(t("en", "pickYourTable"));
    expect(title.querySelector('[lang="my"]')?.textContent).toBe(t("my", "pickYourTable"));
    expect(text(dialog)).toContain(BIND_COPY.sub);
    // The K15 draft rides a `lang="my"` span (the house idiom), beside the EN sentence it echoes.
    const myLines = Array.from(dialog.querySelectorAll('[lang="my"]')).map((el) => text(el));
    expect(myLines.some((l) => l.includes(BIND_COPY.subMy))).toBe(true);
    // The shipped DoorSheet sub-line is REFUSED here: a sticker scan from /cart would drop the
    // persisted key and mint a second session over the drafts about to be sent.
    expect(text(dialog)).not.toContain("Scan your table’s sticker, or pick your number.");
    expect(dialog.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    // The chips are the shipped `.table-chip` (≥44px by its stylesheet rule), nothing staggers, and
    // the peeked "mine" table reads Seated — no chip is "yours" on a numberless session.
    expect(within(dialog).getByRole("list", { name: "Choose your table" })).toBeTruthy();
    expect(dialog.querySelector(".mms-stagger")).toBeNull();
    expect(chip(2).className.split(/\s+/)).toContain("table-chip");
    expect(screen.queryByText("Your table")).toBeNull();
    expect(chip(5).className.split(/\s+/)).toContain("is-seated");
    // The escape is the send's verb.
    expect(within(dialog).getByRole("button", { name: BIND_COPY.sendAnyway })).toBeTruthy();
    expect(within(dialog).queryByText(/Start anyway/)).toBeNull();
  });

  it("the stylesheet gives `.table-chip` its ≥44px target and no new rule was needed", () => {
    const css = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const block = css.match(/\.table-chip\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toMatch(/min-height:\s*88px\s*;/);
  });
});

describe("TableBindSheet — a chip binds, bounded, and reports only the confirmed answer", () => {
  it("binds through `bindTable(cartId, n)`; while it pends the sheet is busy and NOTHING is reported; the answer reaches the host once, then the SEND edge prevents the restore and the host lands focus after the unmount", async () => {
    const s = spies();
    const pending = deferred<BindTableResult>();
    h.bindTable.mockReturnValue(pending.promise);
    render(<Host {...s} />);
    const dialog = openSheet();
    await act(async () => {
      fireEvent.click(chip(2));
    });
    expect(h.bindTable).toHaveBeenCalledWith(CART, 2);
    expect(h.capture).toHaveBeenCalledWith("table_picked", {
      table_number: 2,
      occupied: false,
      resumed: false,
      source: "send",
    });
    // MUTATION (checkout-bind/send-runs-before-the-bind-lands): the sheet reports ok before the
    // server answers — the host sends an order to a table the session may never be bound to; red.
    expect(s.onOutcome).not.toHaveBeenCalled();
    // M82 — busy: every exit refused, the ✕ named as unavailable, never natively disabled.
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    const close = within(dialog).getByRole("button", { name: "Close — finishing, please wait" });
    expect(close.getAttribute("aria-disabled")).toBe("true");
    expect(close.hasAttribute("disabled")).toBe(false);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    await act(async () => {
      pending.resolve({ ok: true, tableNumber: 2, already: false });
    });
    expect(s.onOutcome).toHaveBeenCalledTimes(1);
    expect(s.onOutcome).toHaveBeenCalledWith({ ok: true, tableNumber: 2, already: false });
    // The host closed it: the close edge says it closed to SEND…
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.onClosed).toHaveBeenCalledWith({ sent: true });
    // MUTATION (send-button/success-restores-focus-to-a-detached-send): the close edge reports every
    // close as a dismissal — the host lands focus back on the Send (on /cart a node that is gone or
    // disabled by then, so <body>) instead of the Undo that replaced it; red.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "undo-stub" }));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "open-sheet" }));
  });

  it("`seated`: the chip flips to Seated as a DISCLOSURE (never natively disabled), the join form reveals with focus in its input, the drafts note shows, the sentence stays off any region, and the chip is never claimed again", async () => {
    const s = spies();
    h.bindTable.mockResolvedValue({ ok: false, reason: "seated" });
    render(<Host {...s} />);
    const dialog = openSheet();
    await act(async () => {
      fireEvent.click(chip(9));
    });
    expect(s.onOutcome).toHaveBeenCalledWith({ ok: false, reason: "seated" });
    const nine = chip(9);
    // MUTATION (send-button/seated-chip-natively-disabled): the seated chip gets `disabled` — the
    // disclosure cannot be reached or collapsed by keyboard; red.
    expect(nine.hasAttribute("disabled")).toBe(false);
    expect(nine.getAttribute("aria-disabled")).toBeNull();
    expect(nine.className.split(/\s+/)).toContain("is-seated");
    expect(nine.getAttribute("aria-expanded")).toBe("true");
    const form = dialog.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(nine.getAttribute("aria-controls")).toBe(form.id);
    expect(within(form).getByRole("heading", { name: "Join Table 9" })).toBeTruthy();
    expect(document.activeElement).toBe(within(form).getByLabelText("Table code"));
    expect(text(form)).toContain(BIND_COPY.draftsNote);
    // The host's note is plain text in the sheet (seen, not announced).
    expect(text(dialog)).toContain("note:seated");
    expect(dialog.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    // MUTATION (checkout-bind/seated-claims-again): the chip stays Open and a second tap binds
    // again — the same `seated` over and over, with the join form flickering; red.
    await act(async () => {
      fireEvent.click(nine);
    });
    expect(h.bindTable).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector("form")).toBeNull(); // collapsed; focus back on the chip
    expect(document.activeElement).toBe(nine);
    expect(s.onSendAnyway).not.toHaveBeenCalled();
  });

  it("with no drafts the join form carries no drafts note", async () => {
    const s = spies();
    h.bindTable.mockResolvedValue({ ok: false, reason: "seated" });
    render(<Host {...s} draftQty={0} />);
    const dialog = openSheet();
    await act(async () => {
      fireEvent.click(chip(9));
    });
    expect(dialog.querySelector("form")).not.toBeNull();
    expect(text(dialog)).not.toContain(BIND_COPY.draftsNote);
  });

  it("any other refusal keeps the sheet open with the host's note and clears busy (the finally)", async () => {
    const s = spies();
    h.bindTable.mockResolvedValue({ ok: false, reason: "unavailable" });
    render(<Host {...s} />);
    const dialog = openSheet();
    await act(async () => {
      fireEvent.click(chip(2));
    });
    expect(s.onOutcome).toHaveBeenCalledWith({ ok: false, reason: "unavailable" });
    expect(text(dialog)).toContain("note:unavailable");
    expect(dialog.getAttribute("aria-busy")).toBeNull();
    expect(chip(2).className.split(/\s+/)).toContain("is-open");
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("a thrown bind and a bind still out at the bound both report `error` — never a hung sheet", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const s = spies();
      h.bindTable.mockRejectedValueOnce(new Error("boom"));
      render(<Host {...s} />);
      openSheet();
      await act(async () => {
        fireEvent.click(chip(2));
      });
      expect(s.onOutcome).toHaveBeenLastCalledWith({ ok: false, reason: "error" });
      const never = deferred<BindTableResult>();
      h.bindTable.mockReturnValueOnce(never.promise);
      await act(async () => {
        fireEvent.click(chip(9));
      });
      expect(s.onOutcome).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(s.onOutcome).toHaveBeenLastCalledWith({ ok: false, reason: "error" });
      expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TableBindSheet — the escape and the dismissal", () => {
  it("a chip tapped while the cart is FROZEN never reaches `bindTable`: the sheet says FROZEN_NOTE through the host and stays open (T9 — the freeze that lands while the ask is up)", async () => {
    const s = spies();
    const onFrozen = vi.fn();
    render(<Host {...s} frozen onFrozen={onFrozen} />);
    openSheet();
    await act(async () => {
      fireEvent.click(chip(2));
    });
    // MUTATION (checkout-bind/frozen-chip-binds): the `if (frozen)` gate dropped — the tap reaches
    // the server, which refuses on the raw lock, and the sheet says the RACED sentence over a
    // freeze the client already knew; red here (bindTable called, FROZEN_NOTE never said).
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(onFrozen).toHaveBeenCalledWith(FROZEN_NOTE);
    expect(s.onOutcome).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(text(screen.getByRole("dialog"))).toContain(FROZEN_NOTE);
  });

  it("'Send anyway' hands the send to the host and closes as a SEND edge; no bind is attempted", async () => {
    const s = spies();
    render(<Host {...s} />);
    const dialog = openSheet();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: BIND_COPY.sendAnyway }));
    });
    expect(s.onSendAnyway).toHaveBeenCalledTimes(1);
    expect(h.bindTable).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.onClosed).toHaveBeenCalledWith({ sent: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "undo-stub" }));
  });

  it("Esc · ✕ · the scrim call NOTHING: no bind, no send, the close edge says it was not a send, focus returns to the opener", async () => {
    const s = spies();
    render(<Host {...s} />);
    const dialog = openSheet();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(s.onOutcome).not.toHaveBeenCalled();
    expect(s.onSendAnyway).not.toHaveBeenCalled();
    expect(s.onClosed).toHaveBeenCalledWith({ sent: false });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "open-sheet" }));
    // ✕
    const d2 = openSheet();
    fireEvent.click(within(d2).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.onClosed).toHaveBeenLastCalledWith({ sent: false });
    expect(h.bindTable).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "open-sheet" }));
  });
});
