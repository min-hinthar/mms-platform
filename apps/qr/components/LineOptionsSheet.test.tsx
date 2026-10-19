/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CartItem } from "@mms/db";

/**
 * Phase 3c-i (D17) — the line is a receipt row; its For here / To go and "Send to kitchen now" live
 * behind a 44px ⋯ in ONE sheet. What this pins: the group and its lit-cap vocabulary, a choice
 * closes, pills stay RENDERED and `aria-disabled` under a freeze (never native, nothing reaches the
 * parent), "Send to kitchen now" only for a to-go line and GUARDED (the sheet is busy for the one
 * bounded round trip — a fire is one-way for the guest who tapped it), and the sheet's own single
 * live region carrying the view's sentence.
 */
const { LineOptionsSheet } = await import("./LineOptionsSheet");

afterEach(cleanup);

const LINE: CartItem = {
  id: "line-mohinga",
  menuItemId: "menu-mohinga",
  name: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(over: Partial<Parameters<typeof LineOptionsSheet>[0]> = {}) {
  const onChoose = vi.fn();
  const onMakeNow = vi.fn(() => Promise.resolve());
  const onOpenChange = vi.fn();
  render(
    <LineOptionsSheet
      line={LINE}
      open
      frozen={false}
      prepMinutes={12}
      notice={null}
      onOpenChange={onOpenChange}
      onChoose={onChoose}
      onMakeNow={onMakeNow}
      {...over}
    />,
  );
  return { onChoose, onMakeNow, onOpenChange, dialog: screen.getByRole("dialog") };
}

describe("LineOptionsSheet — where the dish goes", () => {
  it("is named by the dish (both tongues) and carries the one selection vocabulary", () => {
    const { dialog } = mount();
    expect(within(dialog).getByText("Mohinga")).toBeTruthy();
    expect(dialog.querySelector('[lang="my"]')?.textContent).toBe("မုန့်ဟင်းခါး");
    const group = within(dialog).getByRole("group", { name: "Where Mohinga goes" });
    const here = within(group).getByRole("button", { name: "For here" });
    const togo = within(group).getByRole("button", { name: "To go" });
    expect(here.getAttribute("aria-pressed")).toBe("true");
    expect(togo.getAttribute("aria-pressed")).toBe("false");
    // The lit-gold cap is the ONE selection vocabulary — on the pressed pill only.
    expect(here.classList.contains("checkout-pill-on")).toBe(true);
    expect(togo.classList.contains("checkout-pill-on")).toBe(false);
    // A dine-in line has no early fire — that is the to-go line's option.
    expect(within(dialog).queryByRole("button", { name: /Send to kitchen now/i })).toBeNull();
    // Exactly ONE polite region, inside the sheet (Radix hides the page's).
    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
  });

  it("a choice reaches the parent once — the parent closes and toggles", () => {
    const { onChoose, dialog } = mount();
    fireEvent.click(within(dialog).getByRole("button", { name: "To go" }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("togo");
  });

  it("under a freeze the pills stay RENDERED and aria-disabled — never native — and nothing reaches the parent", () => {
    const { onChoose, onMakeNow, dialog } = mount({
      frozen: true,
      line: { ...LINE, fulfillment: "togo" },
    });
    const togoPill = within(dialog).getByRole("button", { name: "For here" });
    const now = within(dialog).getByRole("button", { name: /Send to kitchen now/i });
    // MUTATION (line-sheet/pills-live-under-a-freeze): aria-disabled dropped — the control reads
    // live while the server has already decided against its write; red.
    expect(togoPill.getAttribute("aria-disabled")).toBe("true");
    expect(togoPill.hasAttribute("disabled")).toBe(false);
    expect(now.getAttribute("aria-disabled")).toBe("true");
    expect(now.hasAttribute("disabled")).toBe(false);
    fireEvent.click(togoPill);
    fireEvent.click(now);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onMakeNow).not.toHaveBeenCalled();
  });

  it("'Send to kitchen now · usually ~N min' is the to-go line's option, and the sheet is BUSY for the bounded round trip", async () => {
    const fire = deferred<void>();
    const onMakeNow = vi.fn(() => fire.promise);
    const { dialog } = mount({ line: { ...LINE, fulfillment: "togo" }, onMakeNow });
    const now = within(dialog).getByRole("button", {
      name: "Send to kitchen now · usually ~12 min",
    });
    await act(async () => {
      fireEvent.click(now);
    });
    expect(onMakeNow).toHaveBeenCalledTimes(1);
    // M82 — a fire is one-way: the ✕ reads unavailable (aria-disabled, never native) until the
    // write answers, and the label says what is happening.
    const close = within(dialog).getByRole("button", { name: /Close — finishing/i });
    expect(close.getAttribute("aria-disabled")).toBe("true");
    expect(within(dialog).getByRole("button", { name: "Sending…" })).toBeTruthy();
    // A second tap while busy is refused without a second write.
    fireEvent.click(within(dialog).getByRole("button", { name: "Sending…" }));
    expect(onMakeNow).toHaveBeenCalledTimes(1);
    await act(async () => {
      fire.resolve();
      await fire.promise;
    });
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Send to kitchen now/i })).toBeTruthy();
  });

  it("while 'Send to kitchen now' is held, the pills are UNAVAILABLE too — aria-disabled, dimmed, a tap reaches nothing (Codex round 6 on #313)", async () => {
    const fire = deferred<void>();
    const onMakeNow = vi.fn(() => fire.promise);
    const { dialog, onChoose } = mount({ line: { ...LINE, fulfillment: "togo" }, onMakeNow });
    const forHere = within(dialog).getByRole("button", { name: "For here" });
    expect(forHere.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /Send to kitchen now/i }));
    });
    // MUTATION (line-sheet/pills-live-under-a-held-send): `busy` dropped from the pills' unavailable
    // state — a control advertised as live that silently discards the tap; red.
    expect(forHere.getAttribute("aria-disabled")).toBe("true");
    expect(forHere.hasAttribute("disabled")).toBe(false);
    expect((forHere as HTMLElement).style.opacity).toBe("0.55");
    fireEvent.click(forHere);
    expect(onChoose).not.toHaveBeenCalled();
    await act(async () => {
      fire.resolve();
      await fire.promise;
    });
    expect(forHere.getAttribute("aria-disabled")).toBeNull();
    expect((forHere as HTMLElement).style.opacity).toBe("");
  });

  it("the sheet's region carries the view's sentence", () => {
    const { dialog } = mount({
      notice: "That didn’t go through — the order’s locked while someone checks out",
    });
    expect(within(dialog).getByRole("status").textContent).toContain("didn’t go through");
  });
});

/**
 * Lifecycle audit (edit-notes 3) — the dish's kitchen note, editable while it is unsent. The write is
 * the parent's (`setLineNote`), awaited BOUNDED here; only an answered `ok` closes the sheet.
 */
describe("LineOptionsSheet — the kitchen note", () => {
  it("is seeded from the line, saves the TRIMMED text, and closes on ok", async () => {
    const onSaveNote = vi.fn(() => Promise.resolve({ ok: true }));
    const { onOpenChange, dialog } = mount({
      line: { ...LINE, notes: "No egg" },
      onSaveNote,
    });
    const field = within(dialog).getByLabelText("A note for the kitchen") as HTMLTextAreaElement;
    expect(field.value).toBe("No egg");
    expect(field.maxLength).toBe(160);
    // Unchanged: the save is offered but inert (aria-disabled, never native — focus can rest on it).
    const save = within(dialog).getByRole("button", { name: "Save note" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(field, { target: { value: "  No peanuts — allergy  " } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    // #362 — with the note it was seeded from: the write is a compare-and-swap on it.
    expect(onSaveNote).toHaveBeenCalledWith("No peanuts — allergy", "No egg");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("STAYS open on a refusal — the typed note is not thrown away", async () => {
    // MUTATION (lcb/line-sheet/note-closes-on-a-refusal): close on any answer — the diner's allergy
    // note vanishes with the sheet on a refusal they must act on; red.
    const onSaveNote = vi.fn(() => Promise.resolve({ ok: false }));
    const { onOpenChange, dialog } = mount({ onSaveNote });
    fireEvent.change(within(dialog).getByLabelText("A note for the kitchen"), {
      target: { value: "No peanuts" },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(onSaveNote).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("clearing an existing note is offered as removing it", () => {
    const { dialog } = mount({ line: { ...LINE, notes: "No egg" }, onSaveNote: vi.fn() });
    fireEvent.change(within(dialog).getByLabelText("A note for the kitchen"), {
      target: { value: "" },
    });
    expect(within(dialog).getByRole("button", { name: "Remove the note" })).toBeTruthy();
  });

  it("under a freeze nothing reaches the parent", async () => {
    const onSaveNote = vi.fn(() => Promise.resolve({ ok: true }));
    const { dialog } = mount({ frozen: true, onSaveNote });
    fireEvent.change(within(dialog).getByLabelText("A note for the kitchen"), {
      target: { value: "No egg" },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(onSaveNote).not.toHaveBeenCalled();
  });

  it("off a table the sheet holds the note alone — no For here / To go, no Send now", () => {
    const { dialog } = mount({
      dineIn: false,
      line: { ...LINE, fulfillment: "togo" },
      onSaveNote: vi.fn(),
    });
    expect(within(dialog).queryByRole("group", { name: /Where .* goes/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Send to kitchen now/i })).toBeNull();
    expect(within(dialog).getByLabelText("A note for the kitchen")).toBeTruthy();
  });
});

describe("LineOptionsSheet — one busy sheet, the right word on each control", () => {
  it("a note being SAVED holds the sheet without making 'Send to kitchen now' read 'Sending…'", async () => {
    const held = deferred<{ ok: boolean }>();
    const { dialog } = mount({
      line: { ...LINE, fulfillment: "togo" },
      onSaveNote: () => held.promise,
    });
    fireEvent.change(within(dialog).getByLabelText("A note for the kitchen"), {
      target: { value: "No egg" },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /^Sending/ })).toBeNull();
    await act(async () => {
      held.resolve({ ok: false });
    });
  });
});

/**
 * #362 (blind pass 1, CRITICAL · Codex D) — the field against the note on the ORDER. The sheet
 * seeded once and never compared: a staff allergy note written while it was open was overwritten on
 * Save — or, with the field untouched, the button became "Remove the note" and erased it.
 */
describe("LineOptionsSheet — the note on the order moves while the sheet is open", () => {
  const field = (dialog: HTMLElement) =>
    within(dialog).getByLabelText("A note for the kitchen") as HTMLTextAreaElement;

  it("an UNTOUCHED field follows the order — Save never turns into 'Remove the note'", () => {
    // MUTATION (lcb/line-sheet/untouched-field-frozen): never re-seed — the button offers to erase
    // the allergy note staff just wrote; red.
    const onSaveNote = vi.fn(() => Promise.resolve({ ok: true }));
    const { rerender } = render(
      <LineOptionsSheet
        line={LINE}
        open
        frozen={false}
        prepMinutes={12}
        notice={null}
        onOpenChange={vi.fn()}
        onChoose={vi.fn()}
        onMakeNow={vi.fn(() => Promise.resolve())}
        onSaveNote={onSaveNote}
      />,
    );
    rerender(
      <LineOptionsSheet
        line={{ ...LINE, notes: "No peanuts — allergy" }}
        open
        frozen={false}
        prepMinutes={12}
        notice={null}
        onOpenChange={vi.fn()}
        onChoose={vi.fn()}
        onMakeNow={vi.fn(() => Promise.resolve())}
        onSaveNote={onSaveNote}
      />,
    );
    const d = screen.getByRole("dialog");
    expect(field(d).value).toBe("No peanuts — allergy");
    expect(within(d).queryByRole("button", { name: "Remove the note" })).toBeNull();
    expect(within(d).getByRole("button", { name: "Save note" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("a TOUCHED field keeps the diner's words, SHOWS the change, and still saves against what it saw", async () => {
    const onSaveNote = vi.fn(() => Promise.resolve({ ok: true }));
    const props = {
      open: true,
      frozen: false,
      prepMinutes: 12,
      notice: null,
      onOpenChange: vi.fn(),
      onChoose: vi.fn(),
      onMakeNow: vi.fn(() => Promise.resolve()),
      onSaveNote,
    };
    const { rerender } = render(<LineOptionsSheet line={LINE} {...props} />);
    fireEvent.change(field(screen.getByRole("dialog")), { target: { value: "Extra spicy" } });
    rerender(<LineOptionsSheet line={{ ...LINE, notes: "No peanuts" }} {...props} />);
    const d = screen.getByRole("dialog");
    expect(field(d).value).toBe("Extra spicy");
    expect(d.textContent).toContain("No peanuts");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save note" }));
    });
    // The seed it was typed against — "" — so the server refuses it as `changed`, never overwrites.
    expect(onSaveNote).toHaveBeenCalledWith("Extra spicy", "");
  });

  it("the capped blind pass on #362 — a save that commits past the bound while the diner typed on is THEIRS, never 'changed on the order'", async () => {
    // MUTATION (lcb/line-sheet/late-save-unrecorded): never record what the save SUBMITTED — the
    // late commit reads as someone else's change, and the next Save is refused as `changed` over
    // the diner's own note; red.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const pending = deferred<{ ok: true }>();
      const onSaveNote = vi.fn(() => pending.promise);
      const props = {
        open: true,
        frozen: false,
        prepMinutes: 12,
        notice: null,
        onOpenChange: vi.fn(),
        onChoose: vi.fn(),
        onMakeNow: vi.fn(() => Promise.resolve()),
        onSaveNote,
      };
      const { rerender } = render(<LineOptionsSheet line={LINE} {...props} />);
      fireEvent.change(field(screen.getByRole("dialog")), { target: { value: "No egg" } });
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", { name: "Save note" }),
        );
      });
      // Past the sheet's bound the field frees while the save is still out; the diner types on.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      fireEvent.change(field(screen.getByRole("dialog")), {
        target: { value: "No egg, extra spicy" },
      });
      // The save commits late: the order now holds what THIS sheet sent.
      rerender(<LineOptionsSheet line={{ ...LINE, notes: "No egg" }} {...props} />);
      const d = screen.getByRole("dialog");
      expect(field(d).value).toBe("No egg, extra spicy");
      expect(d.textContent).not.toContain("Changed on the order while you were typing");
      await act(async () => {
        fireEvent.click(within(d).getByRole("button", { name: "Save note" }));
      });
      // The next save is against the note this sheet itself put there.
      expect(onSaveNote).toHaveBeenLastCalledWith("No egg, extra spicy", "No egg");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a save refused as `changed` re-seeds the field from the note now on the order, and stays open", async () => {
    // MUTATION (lcb/line-sheet/changed-not-reseeded): keep the stale seed — every retry is refused
    // again, and the diner never sees the note they would be replacing; red.
    const onSaveNote = vi.fn(() =>
      Promise.resolve({ ok: false, reason: "changed", notes: "No peanuts — allergy" }),
    );
    const { onOpenChange, dialog } = mount({ onSaveNote });
    fireEvent.change(field(dialog), { target: { value: "Extra spicy" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(field(dialog).value).toBe("No peanuts — allergy");
    expect(onOpenChange).not.toHaveBeenCalled();
    // The next save is against the note it now shows.
    fireEvent.change(field(dialog), { target: { value: "No peanuts — allergy, extra spicy" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(onSaveNote).toHaveBeenLastCalledWith(
      "No peanuts — allergy, extra spicy",
      "No peanuts — allergy",
    );
  });

  it("Codex D — the field is read-only while its save is out, and an edit that slips in keeps the sheet open", async () => {
    // MUTATION (lcb/line-sheet/draft-editable-mid-save): leave the field editable while saving; red.
    // MUTATION (lcb/line-sheet/closes-over-newer-text): close on ok regardless — the newer words
    // vanish with the sheet; red.
    const held = deferred<{ ok: boolean }>();
    const { onOpenChange, dialog } = mount({ onSaveNote: () => held.promise });
    fireEvent.change(field(dialog), { target: { value: "No egg" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    });
    expect(field(dialog).readOnly).toBe(true);
    expect(field(dialog).getAttribute("aria-busy")).toBe("true");
    // (`readOnly` stops a keyboard; a programmatic change still slips in — the close must ask.)
    fireEvent.change(field(dialog), { target: { value: "No egg, no peanuts" } });
    await act(async () => {
      held.resolve({ ok: true });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("isn’t saved yet");
    expect(field(dialog).readOnly).toBe(false);
  });
});
