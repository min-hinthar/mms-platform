/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";
import { tf } from "@/lib/i18n/fill";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";

/**
 * K29(b) — the cash confirm is the shared sheet. What the move had to keep, and what it changed
 * on purpose (see the component's docblock): the trigger's place, the tip wiring, a refusal read
 * INSIDE the sheet, §17 on Cancel/Settle, and a handoff that UNMOUNTS the sheet rather than
 * closing it (the parent's paid card must be focused on an un-hidden page).
 *
 * Phase 2c · register — the cash moment: quick cash, the optional tender and its readout, keep the
 * change as a FILL, the compare-and-swap's `moved` refusal, and the parent's own refresh
 * (`onChanged`) in place of a `router.refresh()` that updated nothing this control reads.
 */
const settleCash = vi.fn();
vi.mock("@/lib/staff-cart", () => ({ settleCash: (...a: unknown[]) => settleCash(...(a as [])) }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));

/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };
/** A stylesheet's answer: the computed `animationName` follows `data-state` (SheetExit.test). With
 *  it, a CLOSED sheet is held until `animationend` — so "gone at once" proves an UNMOUNT. */
function stubComputedStyle() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const node = el as HTMLElement;
    if (!node.classList?.contains("mms-sheet") && !node.classList?.contains("mms-scrim"))
      return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "animationName")
          return node.getAttribute("data-state") === "closed" ? "sheetDown" : "up";
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  });
}

/** Radix's FocusScope restores focus in a `setTimeout(0)` AFTER the sheet unmounts — a focus
 *  assertion made synchronously after a close sees the moment BEFORE any restore and passes for
 *  the wrong code (the M10 mutant survived exactly that way). Flush it first. */
const settleFocus = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * A settle that is still in flight when the case ends. NOT a bare `new Promise(() => {})`: React 19
 * ENTANGLES every transition with any async action still pending — globally, across roots — so a
 * never-settling action left behind by one case keeps every later case's `pending` true forever
 * (the moved-total case read "Taking payment…" only when it ran after one). Each is settled in
 * `afterEach`, after the tree is gone.
 */
const hanging: Array<() => void> = [];
function hang() {
  const d = deferred<{ ok: false; error: string }>();
  hanging.push(() => d.resolve({ ok: false, error: "ended" }));
  return d.promise;
}

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CashSettleButton } = await import("./CashSettleButton");

afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const end of hanging.splice(0)) end();
  });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // A `…Once` answer a case queued but never consumed must not leak into the next case.
  settleCash.mockReset();
});

/** The confirm button leads with the amount ("Take $42.10"); the trigger ("Take cash · …") does not. */
const SETTLE_AMOUNT = STAFF["settle.cash.settleAmount"].en.replace("{m}", "$");

function mount(props: Partial<Parameters<typeof CashSettleButton>[0]> = {}) {
  const onSettled = vi.fn();
  const onChanged = vi.fn();
  const view = (p: Partial<Parameters<typeof CashSettleButton>[0]>) => (
    <StaffLangProvider lang="en">
      <CashSettleButton
        sessionId="s1"
        totalCents={4210}
        tipBaseCents={4000}
        handoff
        onSettled={onSettled}
        onChanged={onChanged}
        {...p}
      />
    </StaffLangProvider>
  );
  const r = render(view(props));
  /** Re-render with new props (the parent's detail read moving `totalCents`). */
  const rerender = (p: Partial<Parameters<typeof CashSettleButton>[0]>) =>
    r.rerender(view({ ...props, ...p }));
  const trigger = () =>
    screen.getByRole("button", { name: STAFF["settle.cash.trigger"].en.replace("{m}", "$42.10") });
  const open = () => {
    fireEvent.click(trigger()); // a tap — never focused first, the WebKit shape
    return screen.getByRole("dialog", { name: STAFF["settle.cash.title"].en });
  };
  const settle = () =>
    screen.getByRole("button", {
      name: (n) => n.startsWith(SETTLE_AMOUNT) || n === STAFF["settle.cash.settling"].en,
    });
  const cancel = () => screen.getByRole("button", { name: "Cancel" });
  /** The trigger AFTER a landed settle — the only busy word left once the sheet is gone. */
  const settling = () => screen.getByRole("button", { name: STAFF["settle.cash.settling"].en });
  const field = (id: "cash-tip" | "cash-tendered") =>
    document.getElementById(id) as HTMLInputElement;
  /** One change event per key — the path real hands take (a paste is one event). */
  const type = (id: "cash-tip" | "cash-tendered", text: string) => {
    fireEvent.change(field(id), { target: { value: "" } });
    for (const ch of text) fireEvent.change(field(id), { target: { value: field(id).value + ch } });
  };
  const cashChips = () =>
    within(screen.getByRole("group", { name: STAFF["settle.a11y.cashQuick"].en }))
      .getAllByRole("button")
      .map((b) => b.textContent);
  const chip = (name: string | RegExp) =>
    within(screen.getByRole("group", { name: STAFF["settle.a11y.cashQuick"].en })).getByRole(
      "button",
      { name },
    );
  return {
    trigger,
    open,
    settle,
    cancel,
    settling,
    onSettled,
    onChanged,
    field,
    type,
    cashChips,
    chip,
    rerender,
  };
}

const take = (m: string) => STAFF["settle.cash.settleAmount"].en.replace("{m}", m);

describe("CashSettleButton — the confirm is a sheet", () => {
  it("the trigger opens the named sheet; Cancel closes it and hands focus back to the trigger even though the tap never focused it", async () => {
    const { trigger, open, cancel } = mount();
    expect(document.activeElement).toBe(document.body);
    const dialog = open();
    expect(within(dialog).getByText(/Take \$42\.10 in cash\?/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(cancel());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await settleFocus();
    // MUTATION: drop `onCloseAutoFocus` — the primitive's captured opener is <body>, red.
    expect(document.activeElement).toBe(trigger());
  });

  it("a refused settle keeps the sheet open with the reason inside it, and Settle live again", async () => {
    settleCash.mockResolvedValueOnce({ ok: false, error: "Card reader offline" });
    const { open, settle, cancel } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: `setConfirming(false)` on the error path — the dialog is gone, red.
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("alert").textContent).toContain("Card reader offline");
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(settle().getAttribute("aria-busy")).toBeNull();
    // Cancel: the refusal was read beside the tap — nothing outlives the sheet, and the next open is
    // this attempt's, not the last one's.
    await act(async () => {
      fireEvent.click(cancel());
    });
    await settleFocus();
    // MUTATION: bring back the alert under the trigger (`error && !confirming`) — it mounts at the
    // start of the exit, under the sheet's own aria-hidden, unannounced; red.
    expect(screen.queryByRole("alert")).toBeNull();
    const again = open();
    // MUTATION: drop `setError(null)` from the trigger's tap — the stale refusal re-mounts as a
    // fresh alert inside the new sheet; red.
    expect(within(again).queryByRole("alert")).toBeNull();
  });

  it("a settle that REJECTS (a lost connection) says the outcome is UNKNOWN, re-reads the detail, and never locks the sheet (P2ab)", async () => {
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { open, settle, onChanged } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop the try/catch around `settleCash` — nothing sets the error, the lock is
    // whatever React does with an escaped action, and the alert below is absent; red.
    expect(screen.getByRole("dialog")).toBe(dialog);
    // P2ab — deliberately rewritten: the response can be lost AFTER the settle committed, so the
    // write-outage twin ("that change wasn't saved") would be false. MUTATION: set the old outage
    // sentence (or any server text) in the catch — red.
    const alert = within(dialog).getByRole("alert").textContent;
    expect(alert).toBe(STAFF["settle.cash.unknown"].en);
    expect(alert).not.toContain(STAFF_WRITE_OUTAGE);
    // …and the detail is re-read, so a settle that DID land renders this control away.
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(settle().getAttribute("aria-busy")).toBeNull();
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it("while the settle runs: Settle is aria-disabled + aria-busy and refuses a second tap; the ✕ says so; a landed handoff UNMOUNTS the sheet and leaves focus for the parent's card", async () => {
    stubComputedStyle();
    const d = deferred<{ ok: true; orderId: string; totalCents: number; tipCents: number }>();
    settleCash.mockReturnValueOnce(d.promise);
    const { open, settle, settling, onSettled, onChanged } = mount();
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledTimes(1);
    // The quote rides along — COMPARE-ONLY: the pre-tip total the cashier read, never a price.
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 0, quotedCents: 4210 });
    expect(settle().getAttribute("aria-busy")).toBe("true");
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(settle().textContent).toBe(STAFF["settle.cash.settling"].en);
    expect(
      screen
        .getByRole("button", { name: "Close — finishing, please wait" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop `if (!canSettle) return` from `confirm()` — two settles, red.
    expect(settleCash).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, orderId: "o1", totalCents: 4210, tipCents: 0 });
    });
    // MUTATION: `{!landed && …}` → always render the sheet — closed, not unmounted, it is HELD by
    // the stubbed exit animation (no `animationend` fired here), so the dialog is still there; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    // A counter order's card follows every settle — no tender entered, so none is claimed.
    expect(onSettled).toHaveBeenCalledWith({
      orderId: "o1",
      totalCents: 4210,
      tipCents: 0,
      tenderedCents: null,
    });
    // The parent's OWN refresh — the detail lives in its state, not in an RSC payload.
    expect(onChanged).toHaveBeenCalledTimes(1);
    // §17 — the trigger stays, reads busy and refuses; the attribute is the pinned half (with the
    // sheet unmounted, the handler's early return has no observable effect of its own).
    // MUTATION: drop `aria-disabled={landed || undefined}` — a live-looking control after the
    // write landed; red.
    expect(settling().getAttribute("aria-disabled")).toBe("true");
    expect(settling().getAttribute("aria-busy")).toBe("true");
    await settleFocus();
    // MUTATION: focus the trigger regardless of `handoffLandedRef` — the parent's card focus is
    // fought (FloorDetailLive focuses the #CODE card in its own effect — parsed below); red.
    expect(document.activeElement).not.toBe(settling());
    expect(document.activeElement).toBe(document.body);
  });

  it("a table's settle with NO tender lands the quiet way: the sheet UNMOUNTS, no card, the trigger reads busy and takes focus", async () => {
    stubComputedStyle();
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o1", totalCents: 4210, tipCents: 0 });
    const { open, settle, settling, onSettled, onChanged } = mount({ handoff: false });
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // Unmounted (held by the stubbed exit if it were merely closed) — a sheet left open with a
    // re-armed Settle inside it, or held busy for a re-fetch this control does not own, is the
    // trap §16 names. MUTATION: skip `setLanded(true)` on the non-handoff path; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSettled).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(settling().getAttribute("aria-disabled")).toBe("true");
    await settleFocus();
    // Nothing else owns focus on this path: the busy trigger is the cashier's place.
    // MUTATION: set `handoffLandedRef` on every landing — focus drops to <body>; red.
    expect(document.activeElement).toBe(settling());
  });

  it("a quick-tip chip fills the field and lights; the settle carries its cents and the QUOTE — a guard, never a price", async () => {
    settleCash.mockReturnValueOnce(hang());
    const { open, settle, cashChips } = mount();
    const dialog = open();
    const chip = within(dialog).getByRole("button", { name: /^20%/ });
    fireEvent.click(chip);
    expect((document.getElementById("cash-tip") as HTMLInputElement).value).toBe("8.00");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(settle().textContent).toBe(take("$50.10"));
    // The quick-cash row re-derives from what is DUE (total + tip), not the pre-tip total.
    expect(cashChips()).toEqual(["Exact $50.10", "$51", "$55", "$60"]);
    await act(async () => {
      fireEvent.click(settle());
    });
    // Deliberately rewritten (Phase 2c): the payload now carries `quotedCents`, the PRE-tip total the
    // cashier read — compared by the server, never charged. MUTATION: `tipCents: 0` in the call — red;
    // drop `quotedCents` — red (a stale quote would be recorded silently).
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 800, quotedCents: 4210 });
  });

  it("'5,00' typed KEY BY KEY into the tip records 500 cents — never 50000", async () => {
    settleCash.mockReturnValueOnce(hang());
    const { open, settle } = mount();
    const dialog = open();
    const field = document.getElementById("cash-tip") as HTMLInputElement;
    // One change event per key, each carrying what the field held plus the new character — the
    // path real hands take (a paste is one event and never showed the bug).
    for (const ch of "5,00") fireEvent.change(field, { target: { value: field.value + ch } });
    expect(field.value).toBe("5,00");
    expect(settle().textContent).toBe(
      STAFF["settle.cash.settleAmount"].en.replace("{m}", "$47.10"),
    );
    // The chip lit by VALUE, not by the field's spelling: a $8.00 chip is not lit by "5,00", and
    // "8,00" typed by hand lights it.
    const chip = within(dialog).getByRole("button", { name: /^20%/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(field, { target: { value: "" } });
    for (const ch of "8,00") fireEvent.change(field, { target: { value: field.value + ch } });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(field, { target: { value: "" } });
    for (const ch of "5,00") fireEvent.change(field, { target: { value: field.value + ch } });
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: restore the per-keystroke comma drop in the field's onChange — the field builds
    // "500" and the settle carries 50000; red.
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 500, quotedCents: 4210 });
  });

  it("a tip past seven whole-dollar digits is refused as over the cap, never read as zero", async () => {
    const { open, settle } = mount();
    open();
    fireEvent.change(document.getElementById("cash-tip")!, { target: { value: "123456789" } });
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("cash-tip-cap")?.textContent).toContain("$1,000.00");
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).not.toHaveBeenCalled();
  });

  it("an over-cap tip dims Settle with the cap named, and the tap is refused", async () => {
    const { open, settle } = mount();
    open();
    fireEvent.change(document.getElementById("cash-tip")!, { target: { value: "1001" } });
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("cash-tip-cap")?.textContent).toContain("$1,000.00");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop `tipValid` from `canSettle` — the settle is sent, red.
    expect(settleCash).not.toHaveBeenCalled();
  });
});

describe("CashSettleButton — the cash moment (Phase 2c · register, DESIGN-LANGUAGE §29)", () => {
  it("quick cash reads Exact then three round-ups, computed from what is due", () => {
    const { open, cashChips } = mount();
    open();
    // $42.10 → Exact · $43 · $45 · $50 (quickCashTenders, pinned by value in register-math.test).
    expect(cashChips()).toEqual(["Exact $42.10", "$43", "$45", "$50"]);
  });

  it("a chip FILLS the tender and lights; typing the same amount lights it too (by value); the readout says the change", () => {
    const { open, chip, field, type } = mount();
    const dialog = open();
    fireEvent.click(chip("$50"));
    expect(field("cash-tendered").value).toBe("50.00");
    expect(chip("$50").getAttribute("aria-pressed")).toBe("true");
    const readout = document.getElementById("cash-readout")!;
    expect(readout.textContent).toBe(`${STAFF["settle.cash.changeLabel"].en}$7.90`);
    // A chip fill pops the figure once (kit idiom, RM-escorted); typing never does.
    expect(readout.querySelector("dd")?.classList.contains("mms-pop")).toBe(true);
    type("cash-tendered", "50");
    expect(chip("$50").getAttribute("aria-pressed")).toBe("true");
    expect(readout.querySelector("dd")?.classList.contains("mms-pop")).toBe(false);
    // Exact lights while the field holds exactly what is due.
    fireEvent.click(within(dialog).getByRole("button", { name: /^Exact/ }));
    expect(chip(/^Exact/).getAttribute("aria-pressed")).toBe("true");
    expect(readout.textContent).toBe(STAFF["settle.cash.exactNone"].en);
  });

  it("a SHORT tender blocks Settle — aria-disabled, described by the short row and its hint — and the tap is refused", async () => {
    const { open, settle, type } = mount();
    open();
    type("cash-tendered", "40");
    expect(document.getElementById("cash-readout")!.textContent).toBe(
      `${STAFF["settle.cash.shortLabel"].en}$2.10`,
    );
    // MUTATION: Settle's `disabled` ignores the one binding — a live Settle beside "Short $2.10"; red.
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(settle().getAttribute("aria-describedby")).toBe("cash-readout cash-short-hint");
    expect(document.getElementById("cash-short-hint")!.textContent).toBe(
      STAFF["settle.cash.shortHint"].en,
    );
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).not.toHaveBeenCalled();
  });

  it("the tender is OPTIONAL: empty or a typed 0 leaves Settle live and says nothing", () => {
    const { open, settle, type } = mount();
    open();
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(document.getElementById("cash-readout")!.textContent).toBe("");
    type("cash-tendered", "0");
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(document.getElementById("cash-readout")!.textContent).toBe("");
    // Settle is described by the readout only once there is something to read.
    expect(settle().getAttribute("aria-describedby")).toBeNull();
  });

  it("KEYSTROKE: '5,00' and '12,50' typed one key at a time are $5 and $12.50 in Settle's label", () => {
    const { open, settle, type } = mount();
    open();
    type("cash-tip", "5,00");
    expect(settle().textContent).toBe(take("$47.10"));
    type("cash-tip", "12,50");
    expect(settle().textContent).toBe(take("$54.60"));
  });

  it("keep the change is a FILL: the tip becomes the change, the readout says exact, focus goes to Settle — nothing is recorded", async () => {
    const { open, settle, type, field } = mount();
    const dialog = open();
    type("cash-tendered", "50");
    const keep = within(dialog).getByRole("button", {
      name: STAFF["settle.cash.keepChange"].en.replace("{m}", "$7.90"),
    });
    // An action, not a state.
    expect(keep.getAttribute("aria-pressed")).toBeNull();
    await act(async () => {
      fireEvent.click(keep);
    });
    expect(field("cash-tip").value).toBe("7.90");
    expect(document.getElementById("cash-readout")!.textContent).toBe(
      STAFF["settle.cash.exactNone"].en,
    );
    expect(settle().textContent).toBe(take("$50.00"));
    // It unmounted under its own tap — the cashier's place is the next thing to do.
    expect(within(dialog).queryByRole("button", { name: /^Keep the change/ })).toBeNull();
    expect(document.activeElement).toBe(settle());
    // A fill, never a commit.
    expect(settleCash).not.toHaveBeenCalled();
  });

  it("a MOVED total: the alert names both figures, the sheet quotes the server's, the parent re-reads, and the re-tap quotes the new figure", async () => {
    settleCash.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    const { open, settle, onChanged, cashChips, rerender } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(
      STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$42.65"),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    // MUTATION: never adopt the server's figure (`shownTotal = totalCents`) — Settle still reads the
    // stale $42.10 and the re-tap is refused again, forever while the poll lags; red.
    expect(settle().textContent).toBe(take("$42.65"));
    expect(cashChips()[0]).toBe("Exact $42.65");
    settleCash.mockReturnValueOnce(hang());
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenLastCalledWith({
      sessionId: "s1",
      tipCents: 0,
      quotedCents: 4265,
    });
    // Deliberately rewritten (critic finding — the figure moved UNDER the open sheet): the parent's
    // read moving the prop to a THIRD figure no longer swaps the label silently. The sheet keeps
    // the figure it quotes and the alert names both; the drift section below pins the rest.
    // (Settle itself reads "Taking payment…" — the re-tap above is still in the air.)
    rerender({ totalCents: 4300 });
    expect(cashChips()[0]).toBe("Exact $42.65");
    expect(within(dialog).getByRole("alert").textContent).toBe(
      STAFF["settle.cash.moved"].en.replace("{old}", "$42.65").replace("{m}", "$43.00"),
    );
  });

  it("Cancel and reopen: the tender (and a held figure) start clean; the tip is kept", async () => {
    const { open, cancel, type, field } = mount();
    open();
    type("cash-tendered", "50");
    type("cash-tip", "2");
    await act(async () => {
      fireEvent.click(cancel());
    });
    open();
    expect(field("cash-tendered").value).toBe("");
    expect(field("cash-tip").value).toBe("2");
  });

  it("no money input is focused on open — the pad never rises over Settle", () => {
    const { open, field } = mount();
    open();
    expect(document.activeElement).not.toBe(field("cash-tip"));
    expect(document.activeElement).not.toBe(field("cash-tendered"));
  });

  it("a TABLE settle with a tender hands the card up (the change is the fact the cashier still needs) and leaves focus to it", async () => {
    stubComputedStyle();
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o2", totalCents: 4210, tipCents: 0 });
    const { open, settle, settling, onSettled, type } = mount({ handoff: false });
    open();
    type("cash-tendered", "50");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: hand a card up only on `handoff` — a table's change figure vanishes at the tap; red.
    expect(onSettled).toHaveBeenCalledWith({
      orderId: "o2",
      totalCents: 4210,
      tipCents: 0,
      tenderedCents: 5000,
    });
    await settleFocus();
    expect(document.activeElement).not.toBe(settling());
  });

  it("every action is a Button — no native `disabled` anywhere in the sheet or on the trigger", () => {
    const { open, trigger } = mount();
    expect(trigger().classList.contains("ui-btn")).toBe(true);
    const dialog = open();
    expect(dialog.querySelectorAll("[disabled]")).toHaveLength(0);
    expect(document.querySelectorAll("button[disabled]")).toHaveLength(0);
  });
});

/**
 * The claim the handoff case rests on — "the parent focuses the #CODE card in its own effect" —
 * lives in another file, so it is PARSED there, never trusted from a comment: a `useEffect` in
 * `FloorDetailLive` whose body is `if (handoff) handoffRef.current?.focus()` with `handoff` in its
 * deps. Comments are not AST nodes; a dead `{false && …}` branch is not an `if` on `handoff`.
 */
describe("the handoff card's focus is the parent's — parsed, not trusted", () => {
  it("FloorDetailLive focuses `handoffRef` in an effect keyed on `handoff`", () => {
    const src = readFileSync(join(__dirname, "FloorDetailLive.tsx"), "utf8");
    const sf = ts.createSourceFile(
      "FloorDetailLive.tsx",
      src,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const focusEffects: ts.CallExpression[] = [];
    const isHandoffFocusCall = (n: ts.Node): boolean =>
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "focus" &&
      /^handoffRef\.current\??$/.test(n.expression.expression.getText(sf).replace(/\s/g, "")) &&
      n.expression.questionDotToken !== undefined;
    const containsHandoffIf = (body: ts.Node): boolean => {
      let found = false;
      const visit = (n: ts.Node) => {
        if (
          ts.isIfStatement(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "handoff" &&
          n.elseStatement === undefined
        ) {
          const then = n.thenStatement;
          const stmt = ts.isBlock(then) ? then.statements[0] : then;
          if (stmt && ts.isExpressionStatement(stmt) && isHandoffFocusCall(stmt.expression))
            found = true;
        }
        ts.forEachChild(n, (c) => {
          visit(c);
        });
      };
      visit(body);
      return found;
    };
    const walk = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "useEffect" &&
        n.arguments.length === 2 &&
        ts.isArrowFunction(n.arguments[0]!) &&
        ts.isArrayLiteralExpression(n.arguments[1]!) &&
        n.arguments[1]!.elements.some((e) => ts.isIdentifier(e) && e.text === "handoff") &&
        containsHandoffIf(n.arguments[0]!.body)
      )
        focusEffects.push(n);
      ts.forEachChild(n, (c) => {
        walk(c);
      });
    };
    walk(sf);
    // MUTATION: comment the focus line out in FloorDetailLive, or key the effect on `[]` — red.
    expect(focusEffects).toHaveLength(1);
  });
});

describe("CashSettleButton — the quote is FROZEN when the sheet opens (critic finding)", () => {
  it("a total that moves while the sheet is open never changes the figures silently: the alert names both, the tap adopts the new figure explicitly, and only the NEXT tap settles it", async () => {
    const { open, settle, chip, cashChips, rerender } = mount();
    const dialog = open();
    // The cashier takes $50 for $42.10 and reads "Change $7.90".
    fireEvent.click(chip("$50"));
    const readout = document.getElementById("cash-readout")!;
    expect(readout.textContent).toBe(`${STAFF["settle.cash.changeLabel"].en}$7.90`);
    // A guest adds a $4 drink from their phone; the page's re-read moves the prop under the sheet.
    rerender({ totalCents: 4610 });
    // MUTATION: bind the sheet's figures to the live prop — the label reads "Take $46.10" and the
    // readout "Change $3.90" with no announcement, $7.90 already handed back; red.
    expect(settle().textContent).toBe(take("$42.10"));
    expect(readout.textContent).toBe(`${STAFF["settle.cash.changeLabel"].en}$7.90`);
    expect(cashChips()[0]).toBe("Exact $42.10");
    const moved = STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$46.10");
    expect(within(dialog).getByRole("alert").textContent).toBe(moved);
    // Settle is described by the alert while the figures disagree.
    expect(settle().getAttribute("aria-describedby")).toContain("cash-alert");
    // The tap ADOPTS the new figure — it records nothing.
    // MUTATION: drop the drift arm in `confirm()` — the tap sends the old quote to the server; red.
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).not.toHaveBeenCalled();
    expect(settle().textContent).toBe(take("$46.10"));
    expect(readout.textContent).toBe(`${STAFF["settle.cash.changeLabel"].en}$3.90`);
    // The sentence stays on screen after the adopt: both figures are still what just happened.
    expect(within(dialog).getByRole("alert").textContent).toBe(moved);
    settleCash.mockReturnValueOnce(hang());
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 0, quotedCents: 4610 });
  });

  it("the settle carries the quote READ at open — a prop that moved and came back is no drift and no new figure", async () => {
    settleCash.mockReturnValueOnce(hang());
    const { open, settle, rerender } = mount();
    const dialog = open();
    rerender({ totalCents: 4610 });
    rerender({ totalCents: 4210 });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 0, quotedCents: 4210 });
  });

  it("a new attempt opens on the live figure", async () => {
    const { open, cancel, settle, rerender } = mount();
    open();
    await act(async () => {
      fireEvent.click(cancel());
    });
    rerender({ totalCents: 4610 });
    fireEvent.click(
      screen.getByRole("button", {
        name: STAFF["settle.cash.trigger"].en.replace("{m}", "$46.10"),
      }),
    );
    expect(settle().textContent).toBe(take("$46.10"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CashSettleButton — a tip intent arriving under an open sheet is frozen with the quote (Codex round 1, P1)", () => {
  it("the field, the due and the settle keep what the cashier read; the new intent is taken on the next open", async () => {
    settleCash.mockReturnValueOnce(hang());
    const { open, cancel, settle, field, rerender } = mount({ intendedTipCents: null });
    open();
    expect(field("cash-tip").value).toBe("");
    // The kiosk guest answers the tip prompt while the cashier is counting change.
    // MUTATION: apply the intent while the sheet is open — the field fills with 5.00, the due
    // becomes $47.10 and the tap records a tip the cashier never read; red.
    rerender({ intendedTipCents: 500 });
    expect(field("cash-tip").value).toBe("");
    expect(settle().textContent).toBe(take("$42.10"));
    expect(document.getElementById("cash-tip-kiosk")).toBeNull();
    await act(async () => {
      fireEvent.click(cancel());
    });
    open();
    expect(field("cash-tip").value).toBe("5.00");
    expect(settle().textContent).toBe(take("$47.10"));
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 500, quotedCents: 4210 });
  });
});

describe("CashSettleButton — the tip chips' base is frozen with the quote (Codex round 2, P2)", () => {
  it("a subtotal moving under an open sheet does not move the percentage chips; the next open reads the new base", async () => {
    const { open, cancel, rerender } = mount();
    let dialog = open();
    const chip20 = () => within(dialog).getByRole("button", { name: /^20%/ });
    expect(chip20().textContent).toContain("$8.00");
    // A discount lands from the guest's phone: the page re-reads a new tip base under the sheet.
    // MUTATION: read the live prop — "20% · $8.00" becomes "20% · $7.00" mid-count; red.
    rerender({ tipBaseCents: 3500 });
    expect(chip20().textContent).toContain("$8.00");
    await act(async () => {
      fireEvent.click(cancel());
    });
    dialog = open();
    expect(chip20().textContent).toContain("$7.00");
  });
});

describe("CashSettleButton — a server `moved` figure withholds the % chips until the page's read (Codex round 3, P2)", () => {
  it("no chip is computed off the previous order's base; the read that follows restores them", async () => {
    settleCash.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    const { open, settle, rerender } = mount({ readTicket: 3, readsStarted: () => 3 });
    const dialog = open();
    expect(within(dialog).queryByRole("button", { name: /^20%/ })).not.toBeNull();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: keep the old base — "20% · $8.00" of the PREVIOUS order sits beside "Take $42.65"; red.
    expect(within(dialog).queryByRole("button", { name: /^20%/ })).toBeNull();
    // "None" stays: clearing a tip never needs a base.
    expect(
      within(dialog).getByRole("button", { name: STAFF["settle.cash.tipNone"].en }),
    ).toBeTruthy();
    // The page's next read (a later ticket) brings the matching base.
    rerender({ readTicket: 4, readsStarted: () => 4, totalCents: 4265, tipBaseCents: 4050 });
    expect(within(dialog).getByRole("button", { name: /^20%/ }).textContent).toContain("$8.10");
  });
});

describe("CashSettleButton — a refusal mid-payment is said in the device language (P2w, critic finding)", () => {
  it("the typed `inflight` refusal renders its holder's key in Burmese — never the server's English", async () => {
    const english = "A payment started at the register on this table hasn’t finished.";
    settleCash.mockResolvedValueOnce({
      ok: false,
      code: "inflight",
      holder: "register",
      error: english,
    });
    render(
      <StaffLangProvider lang="my">
        <CashSettleButton sessionId="s1" totalCents={4210} tipBaseCents={4000} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    const dialog = screen.getByRole("dialog");
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    // MUTATION: render `res.error` through <OutageText> — the English passes through verbatim; red.
    const alert = within(dialog).getByRole("alert").textContent;
    expect(alert).toBe(tf("my", "settle.inflight.register", { n: SETTLE_MINUTES }));
    expect(alert).not.toContain(english);
    // The sheet stays open with the reason inside it, like every refusal.
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
});

describe("CashSettleButton — keep the change names the tip it MAKES when a tip is already typed (critic finding)", () => {
  it("tip $2 + change $5.90: the action reads 'make the tip $7.90', and the tap fills exactly that", async () => {
    const { open, type, field } = mount();
    const dialog = open();
    type("cash-tip", "2");
    type("cash-tendered", "50");
    // Due $44.10; $50 handed over → change $5.90; keeping it makes the tip $2 + $5.90 = $7.90.
    expect(document.getElementById("cash-readout")!.textContent).toBe(
      `${STAFF["settle.cash.changeLabel"].en}$5.90`,
    );
    // MUTATION: label the change ($5.90) regardless — the cashier reads "$5.90" and the field
    // becomes 7.90: a tip nobody named; red.
    const keep = within(dialog).getByRole("button", {
      name: STAFF["settle.cash.keepChangeTip"].en.replace("{m}", "$7.90"),
    });
    await act(async () => {
      fireEvent.click(keep);
    });
    expect(field("cash-tip").value).toBe("7.90");
  });

  it("with no tip typed, the change IS the new tip — the plain 'Keep the change as tip · $x' stands", () => {
    const { open, type } = mount();
    const dialog = open();
    type("cash-tendered", "50");
    expect(
      within(dialog).getByRole("button", {
        name: STAFF["settle.cash.keepChange"].en.replace("{m}", "$7.90"),
      }),
    ).toBeTruthy();
  });
});

describe("CashSettleButton — an unknown outcome is handed UP (critic finding: the counter's closed-bounce)", () => {
  it("a rejected settle says unknown to the parent; the next answered attempt says known", async () => {
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onOutcomeUnknown = vi.fn();
    const { open, settle } = mount({ onOutcomeUnknown });
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: never hand the unknown up — the page bounces a landed counter settle to the floor
    // mid-sheet (FloorDetailLive's hold never arms); red.
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(true);
    settleCash.mockResolvedValueOnce({ ok: false, error: "That table is closed." });
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: never clear it — a later GENUINE close (cleared from another tablet) is held too; red.
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(false);
  });
});

// ── Phase 2c · gate ──
describe("CashSettleButton — the settle gate (owner decision 3: refused while dishes are unsent)", () => {
  it("blocked: the trigger is aria-disabled (never native), read with the page's note first, and a tap opens NOTHING — it hands up once", () => {
    const onBlockedTap = vi.fn();
    const { trigger } = mount({ blocked: true, blockedNoteId: "settle-unsent-note", onBlockedTap });
    const t = trigger();
    expect(t.getAttribute("aria-disabled")).toBe("true");
    expect(t.hasAttribute("disabled")).toBe(false);
    expect(t.getAttribute("aria-describedby")).toBe("settle-unsent-note settle-hint");
    fireEvent.click(t);
    // MUTATION (cashsettle/unsent-trigger-opens-the-sheet): drop the handler's guard — the sheet
    // opens and the cashier fills in a tender for a settle the server will refuse; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(null);
    expect(settleCash).not.toHaveBeenCalled();
  });

  it("not blocked: no aria-disabled from the gate, and the trigger opens the sheet as before", () => {
    // MUTATION (cashsettle/unsent-trigger-always-dimmed): spread aria-disabled regardless — every
    // cash settle reads as refused to a screen reader; red.
    const { trigger, open } = mount({ blocked: false, blockedNoteId: "settle-unsent-note" });
    expect(trigger().getAttribute("aria-disabled")).toBeNull();
    expect(trigger().getAttribute("aria-describedby")).toBe("settle-hint");
    expect(open()).toBeTruthy();
  });

  // ── Phase 2d · P2el ──
  it("a server `unreadable` refusal is said in the sheet in Burmese, never the write-outage line, and Take stays armed for the retry", async () => {
    settleCash.mockResolvedValueOnce({ ok: false, code: "unreadable", error: "english" });
    render(
      <StaffLangProvider lang="my">
        <CashSettleButton sessionId="s1" totalCents={4210} tipBaseCents={4000} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    const dialog = screen.getByRole("dialog");
    const take = () =>
      within(dialog)
        .getAllByRole("button")
        .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take());
    });
    // MUTATION (p2d-el/cash-unreadable-said-as-server): drop the `unreadable` arm — the server's
    // English passes through <OutageText> on a Burmese console; red.
    expect(within(dialog).getByRole("alert").textContent).toBe(
      tf("my", "settle.unsentUnreadable", {}),
    );
    expect(take().getAttribute("aria-disabled")).toBeNull();
  });

  it("a server `unsent` refusal is said in the sheet in the device language, with ITS count — and the close hands the cashier to the fix, not back to the trigger", async () => {
    const english = "Some dishes haven’t gone to the kitchen.";
    settleCash.mockResolvedValueOnce({ ok: false, code: "unsent", units: 2, error: english });
    const onBlockedTap = vi.fn();
    const onChanged = vi.fn();
    render(
      <StaffLangProvider lang="my">
        <CashSettleButton
          sessionId="s1"
          totalCents={4210}
          tipBaseCents={4000}
          onBlockedTap={onBlockedTap}
          onChanged={onChanged}
        />
      </StaffLangProvider>,
    );
    const trigger = screen.getAllByRole("button")[0]!;
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    // MUTATION (cashsettle/unsent-said-in-english): drop the `unsent` arm — the server's English
    // passes through <OutageText> on a Burmese console; red.
    const alert = within(dialog).getByRole("alert").textContent;
    expect(alert).toBe(tf("my", "table.send.settleBlocked.many", { n: 2 }));
    expect(alert).not.toContain(english);
    // The page re-reads, so its note appears under the triggers.
    expect(onChanged).toHaveBeenCalled();
    // Nothing is handed up while the sheet is open (the page behind the modal is hidden).
    expect(onBlockedTap).not.toHaveBeenCalled();
    const cancel = within(dialog).getByRole("button", { name: /မလုပ်တော့|Cancel/ });
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await settleFocus();
    // MUTATION (cashsettle/unsent-refusal-never-jumps): drop the jump on close — the cashier is back
    // on a trigger the server just refused, with the Send somewhere above; red.
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(2);
    expect(document.activeElement).not.toBe(trigger);
  });
  it("on a card-on-file running bill the sheet says the running bill's sentence (the page's note's)", async () => {
    settleCash.mockResolvedValueOnce({ ok: false, code: "unsent", units: 2, error: "x" });
    render(
      <StaffLangProvider lang="en">
        <CashSettleButton sessionId="s1" totalCents={4210} tipBaseCents={4000} running />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    const dialog = screen.getByRole("dialog");
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    // MUTATION (cashsettle/unsent-running-ignored): the table's sentence regardless; red.
    expect(within(dialog).getByRole("alert").textContent).toBe(
      tf("en", "table.send.settleBlocked.tab.many", { n: 2 }),
    );
  });
});

// ── Phase 2c · review fixes · reg2 ──
describe("CashSettleButton — a refusal's figure is settled by the page's NEXT read (R1)", () => {
  const movedLine = (from: string, to: string) =>
    STAFF["settle.cash.moved"].en.replace("{old}", from).replace("{m}", to);

  it("add-then-remove before the re-read: the read that began AFTER the refusal brings $42.10 back — said as a drift, adopted by the tap, and quoted by the next", async () => {
    settleCash.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    // The page's read clock: read #3 is the committed detail; read #4 is already in the air when
    // the refusal comes back (it began BEFORE the server refused).
    const { open, settle, rerender } = mount({ readTicket: 3, readsStarted: () => 4 });
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settle().textContent).toBe(take("$42.65"));
    // Read #4 commits the OLD figure: it may predate the guest's drink, so it settles nothing.
    // MUTATION (p2c-reg2/cash-refusal-raised-at-the-committed-read): mark the refusal with the
    // COMMITTED ticket (#3) — read #4 then "settles" it and a false drift back to $42.10 is said
    // over a table the server just priced at $42.65; red.
    rerender({ readTicket: 4, readsStarted: () => 4, totalCents: 4210 });
    expect(settle().textContent).toBe(take("$42.65"));
    expect(within(dialog).getByRole("alert").textContent).toBe(movedLine("$42.10", "$42.65"));
    // Read #5 began after the refusal: the guest took the drink off again — $42.10 is the truth.
    // MUTATION (p2c-reg2/cash-quote-ignores-the-read-clock): reconcile without the ticket — the
    // sheet keeps quoting $42.65 (the basis looks like "no re-read yet") in silence; red.
    rerender({ readTicket: 5, readsStarted: () => 5, totalCents: 4210 });
    expect(within(dialog).getByRole("alert").textContent).toBe(movedLine("$42.65", "$42.10"));
    // The tap ADOPTS the figure now shown (nothing recorded); only the next tap takes payment.
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledTimes(1);
    expect(settle().textContent).toBe(take("$42.10"));
    settleCash.mockReturnValueOnce(hang());
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenLastCalledWith({
      sessionId: "s1",
      tipCents: 0,
      quotedCents: 4210,
    });
  });
});

// ── Phase 2h · p2h-sheets ──
describe("CashSettleButton — a hung settle never traps the sheet (Phase 2h · P2cz, decisions 9a · 9d · 9e)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  const alertText = (dialog: HTMLElement) => within(dialog).getByRole("alert").textContent;
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const OK = { ok: true as const, orderId: "o1", totalCents: 4250, tipCents: 0 };

  it("no answer at STAFF_HANG_MS: the sheet frees (Cancel and ✕ live), says 'no answer yet' with a reload beside it, and hands the unknown up", async () => {
    vi.useFakeTimers();
    settleCash.mockReturnValueOnce(hang());
    const onOutcomeUnknown = vi.fn();
    const onSettleOutcome = vi.fn();
    const { open, settle, cancel, onChanged } = mount({ onOutcomeUnknown, onSettleOutcome });
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settle().getAttribute("aria-busy")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    // Still in the air one millisecond short of the bound: busy, nothing said.
    expect(settle().getAttribute("aria-busy")).toBe("true");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await advance(1);
    // MUTATION (p2h-sheets/cash/busy-never-clears): drop `setBusy(false)` from the finally — the
    // sheet holds every exit forever behind a trapped focus scope; red.
    expect(settle().getAttribute("aria-busy")).toBeNull();
    expect(
      screen.getByRole("button", { name: STAFF["shell.close"].en }).getAttribute("aria-disabled"),
    ).toBeNull();
    // MUTATION (p2h-sheets/cash/waiting-said-as-unknown): say "the connection dropped… try again"
    // over an answer that is merely late — a second settle queued behind the first; red.
    expect(alertText(dialog)).toBe(STAFF["settle.cash.waiting"].en);
    // MUTATION (p2h-sheets/cash/waiting-no-reload): the sentence says "reload the page" on a
    // standalone console with no browser reload; red.
    expect(reloadBtn()).not.toBeNull();
    // MUTATION (p2h-sheets/cash/waiting-unknown-unhanded): the page's counter closed-bounce never
    // holds on a settle that may yet land; red.
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(true);
    // MUTATION (p2h-sheets/cash/waiting-unsaid-to-the-pane): a detail that unmounts mid-wait loses
    // the only line that could say it; red.
    expect(onSettleOutcome).toHaveBeenLastCalledWith("unknown");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(cancel().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(cancel());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging first — the sheet still frees at the bound (a transition's `pending` would not)", async () => {
    vi.useFakeTimers();
    // React 19 entangles every transition with ANY async action still pending (the browser's
    // stand-in: Next's router update for a hung Server Action). A sheet whose `busy` is a
    // transition's `pending` stays busy past any bound its callback races; state in a finally frees.
    const other = deferred<void>();
    hanging.push(() => other.resolve());
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    settleCash.mockReturnValueOnce(hang());
    const { open, settle } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    expect(settle().getAttribute("aria-busy")).toBeNull();
    expect(alertText(dialog)).toBe(STAFF["settle.cash.waiting"].en);
  });

  it("a LATE ok lands: the sheet unmounts, the card is handed up with the PERSISTED figures, the unknown clears", async () => {
    vi.useFakeTimers();
    stubComputedStyle();
    const late = deferred<typeof OK>();
    settleCash.mockReturnValueOnce(late.promise);
    const onOutcomeUnknown = vi.fn();
    const { open, settle, settling, onSettled, onChanged } = mount({ onOutcomeUnknown });
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(true);
    await act(async () => {
      late.resolve(OK);
    });
    // MUTATION (p2h-sheets/cash/late-answer-dropped): a late answer is never applied — the money
    // went through and the sheet keeps saying "no answer yet"; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSettled).toHaveBeenCalledWith({
      orderId: "o1",
      totalCents: 4250,
      tipCents: 0,
      tenderedCents: null,
    });
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(false);
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(settling().getAttribute("aria-busy")).toBe("true");
  });

  it("a LATE ok after the control unmounted still hands its card up and clears the unknown (9e)", async () => {
    vi.useFakeTimers();
    const late = deferred<typeof OK>();
    settleCash.mockReturnValueOnce(late.promise);
    const onOutcomeUnknown = vi.fn();
    const { open, settle, onSettled } = mount({ onOutcomeUnknown });
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(true);
    cleanup(); // the detail re-rendered without this control
    await act(async () => {
      late.resolve(OK);
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(false);
  });

  it("a LATE refusal is said in the open sheet, handed up as refused, clears the unknown — and the next tap sends again", async () => {
    vi.useFakeTimers();
    const late = deferred<{ ok: false; error: string }>();
    settleCash.mockReturnValueOnce(late.promise);
    const onOutcomeUnknown = vi.fn();
    const onSettleOutcome = vi.fn();
    const { open, settle } = mount({ onOutcomeUnknown, onSettleOutcome });
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    await act(async () => {
      late.resolve({ ok: false, error: "Card reader offline" });
    });
    expect(alertText(dialog)).toContain("Card reader offline");
    expect(onSettleOutcome).toHaveBeenLastCalledWith("refused");
    // MUTATION (p2h-sheets/cash/late-unknown-never-cleared): the page holds a counter's closed-bounce
    // over a settle the server has since refused; red.
    expect(onOutcomeUnknown).toHaveBeenLastCalledWith(false);
    expect(reloadBtn()).toBeNull();
    // The raw answered — the tablet is no longer stalled, so the cashier's retry is SENT.
    settleCash.mockReturnValueOnce(hang());
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledTimes(2);
  });

  it("a LATE throw is still no answer: the outcome stays unknown and the sheet says it couldn't confirm", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail!: (e: unknown) => void;
    settleCash.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
    const onOutcomeUnknown = vi.fn();
    const { open, settle } = mount({ onOutcomeUnknown });
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    expect(alertText(dialog)).toBe(STAFF["settle.cash.waiting"].en);
    await act(async () => {
      fail(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/cash/late-throw-reads-as-known): a lost response after a long wait is
    // treated as an answer — the closed-bounce hold drops while the settle may have landed; red.
    expect(onOutcomeUnknown).not.toHaveBeenCalledWith(false);
    expect(alertText(dialog)).toBe(STAFF["settle.cash.unknown"].en);
  });

  it("a re-tap while the settle is still out is REFUSED, never sent — said as the stalled tablet, with the reload", async () => {
    vi.useFakeTimers();
    settleCash.mockReturnValueOnce(hang());
    const { open, settle } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    await advance(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION (p2h-sheets/cash/stalled-tap-dispatches): a second settle queued behind the first,
    // released whenever the queue moves — after the cashier took the money some other way; red.
    expect(settleCash).toHaveBeenCalledTimes(1);
    expect(alertText(dialog)).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a tablet already stalled on ANOTHER action refuses the settle at the tap: nothing dispatched, the reload offered", async () => {
    vi.useFakeTimers();
    track(new Promise(() => {})); // some earlier action on this tab that never answered
    await advance(STAFF_HANG_MS);
    const { open, settle } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).not.toHaveBeenCalled();
    expect(settle().getAttribute("aria-busy")).toBeNull();
    expect(alertText(dialog)).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });
});
