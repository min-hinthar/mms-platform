/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { MintId, MintReservation } from "./CounterMintContext";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import type { ClearPreview } from "@/lib/clear-table";
import { CLEAR_ARM_MS, CLEAR_UNDO_MS, type ClearWatch } from "@/lib/clear-window";
import { PICKED_HOLD_CAP_MS, PICKED_HOLD_WARN_MS } from "@/lib/undo-hold";

/**
 * PD7 · M182 (m7 "Turn Signals") — a TABLE's clear: the fresh look, the loss slip and its fork, the
 * six-second window that writes nothing until it closes, "Seat next party" under the ONE mint lock,
 * and the outcome said on the FLOOR. Red-first by mutant (`clear-ui/*`), named per case.
 */
const clearTable = vi.fn();
const getClearPreview = vi.fn();
vi.mock("@/lib/floor", () => ({
  clearTable: (...a: unknown[]) => clearTable(...(a as [])),
  getClearPreview: (...a: unknown[]) => getClearPreview(...(a as [])),
}));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ClearTableButton } = await import("./ClearTableButton");
const { TurnoverNewsProvider, useTurnoverNews } = await import("./TurnoverNews");
const { CounterMintCtx } = await import("./CounterMintContext");
const { ts } = await import("@/lib/i18n/staff");
const { tf } = await import("@/lib/i18n/fill");
const { MsgText } = await import("./StaffMsg");

/** jsdom's `:focus-visible` answer, per element: a tap by default (never holds), a key on demand. */
const keyboard = new Set<Element>();
const realMatches = Element.prototype.matches;
beforeEach(() => {
  vi.useFakeTimers();
  keyboard.clear();
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ":focus-visible" ? keyboard.has(this) : realMatches.call(this, selector);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearTable.mockReset();
  getClearPreview.mockReset();
  replace.mockReset();
  refresh.mockReset();
});
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** Time passing in steps, each its own act (a browser renders between ticks; one long act batches
 *  every tick's state into one render at its end). */
async function walk(ms: number, step = 250) {
  for (let t = 0; t < ms; t += step) await flush(Math.min(step, ms - t));
}

const SEEN = "2026-10-09T18:00:00.000000+00:00";
const FREE: ClearPreview = { seenAt: SEEN, sent: [], lossCents: 0, units: 0, droppedUnits: 0 };
const LOSS: ClearPreview = {
  seenAt: SEEN,
  sent: [
    {
      id: "l1",
      qty: 2,
      name: "Mohinga",
      nameMy: "မုန့်ဟင်းခါး",
      state: "in_progress",
      amountCents: 2800,
    },
    { id: "l2", qty: 1, name: "Shan Noodles", nameMy: null, state: "served", amountCents: 1300 },
  ],
  lossCents: 4100,
  units: 3,
  droppedUnits: 1,
};
const WATCH: ClearWatch = {
  members: ["seat-1"],
  lines: [
    { id: "l1", qty: 2 },
    { id: "l2", qty: 1 },
  ],
  paying: false,
};

/** The floor's region, as the board renders the turnover line. */
function FloorLine() {
  const line = useTurnoverNews()?.line ?? null;
  return <p data-testid="floor-line">{line ? <MsgText lang="en" msg={line.msg} /> : null}</p>;
}

type Mint = {
  reserve: Mock<(id: MintId) => MintReservation | null>;
  go: Mock<MintReservation["go"]>;
  release: Mock<MintReservation["release"]>;
};
function fakeMint(held = false): Mint {
  const go = vi.fn<MintReservation["go"]>();
  const release = vi.fn<MintReservation["release"]>();
  return {
    go,
    release,
    reserve: vi.fn<(id: MintId) => MintReservation | null>(() => (held ? null : { go, release })),
  };
}

function mount(
  opts: {
    watch?: ClearWatch;
    mint?: Mint | null;
    tableNumber?: number | null;
    onTakeCash?: () => void;
    onSlip?: (armed: boolean) => void;
    paymentInFlight?: boolean;
  } = {},
) {
  const mintValue = opts.mint
    ? {
        minting: null,
        held: false,
        startHeld: false,
        waiting: null,
        isBusy: () => false,
        run: () => {},
        reserve: opts.mint.reserve,
      }
    : null;
  const tree = (o: typeof opts): ReactNode => (
    <StaffLangProvider lang="en">
      <TurnoverNewsProvider>
        <CounterMintCtx.Provider value={mintValue}>
          <ClearTableButton
            sessionId="s4"
            label="4"
            paymentInFlight={o.paymentInFlight ?? false}
            tableNumber={o.tableNumber === undefined ? 4 : o.tableNumber}
            watch={o.watch ?? WATCH}
            onTakeCash={o.onTakeCash}
            onSlip={o.onSlip}
          />
          <FloorLine />
        </CounterMintCtx.Provider>
      </TurnoverNewsProvider>
    </StaffLangProvider>
  );
  const r = render(tree(opts));
  return { ...r, rerender: (o: Partial<typeof opts>) => r.rerender(tree({ ...opts, ...o })) };
}
const trigger = () => screen.getByRole("button", { name: ts("en", "settle.clear.btn") });
const tap = (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el);
  });
const windowGroup = () =>
  screen.queryByRole("group", { name: tf("en", "settle.clear.window", { id: "4" }) });
const undo = () => within(windowGroup()!).getByRole("button", { name: /^Undo/ });
const seat = () =>
  within(windowGroup()!).getByRole("button", { name: ts("en", "settle.clear.seatNext") });
const floorLine = () => screen.getByTestId("floor-line").textContent;

describe("a free table — straight into the six-second window, nothing written until it closes", () => {
  it("the look, 'Clearing Table 4' with Undo focused, the clear only at six seconds, carrying the look; the floor hears it", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    clearTable.mockResolvedValue({ ok: true });
    mount();
    await tap(trigger());
    expect(getClearPreview).toHaveBeenCalledWith({ sessionId: "s4" });
    expect(windowGroup()).not.toBeNull();
    expect(document.activeElement).toBe(undo());
    // The seconds leaf is decoration; the name is the verb alone.
    expect(undo().querySelector("[aria-hidden]")?.textContent).toContain("6s");
    await flush(CLEAR_UNDO_MS - 500);
    // MUTATION clear-ui/window-sends-at-once (the window skipped) → red.
    expect(clearTable).not.toHaveBeenCalled();
    await flush(1_000);
    expect(clearTable).toHaveBeenCalledTimes(1);
    // MUTATION clear-ui/look-not-carried (the clear sent without the look) → red.
    expect(clearTable).toHaveBeenCalledWith({
      sessionId: "s4",
      expect: { lineIds: [], lossCents: 0, seenAt: SEEN },
    });
    // MUTATION clear-ui/turnover-unsaid → the floor never hears the table is free; red.
    expect(floorLine()).toBe(tf("en", "settle.clear.free", { id: "4" }));
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("Undo writes nothing and hands focus back to the trigger; it is inert for the lane's first 400 ms", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    mount();
    await tap(trigger());
    await flush(CLEAR_ARM_MS / 4);
    // MUTATION clear-ui/window-armed-at-once → the second half of a double tap undoes; red.
    expect(undo().getAttribute("aria-disabled")).toBe("true");
    await tap(undo());
    expect(windowGroup()).not.toBeNull();
    await flush(CLEAR_ARM_MS);
    await tap(undo());
    expect(windowGroup()).toBeNull();
    await flush();
    expect(document.activeElement).toBe(trigger());
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
  });

  it("a table that MOVED under the window drops it: a join says who sat down, a changed order says so — nothing sent", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    const v = mount();
    await tap(trigger());
    v.rerender({ watch: { ...WATCH, members: ["seat-1", "seat-2"] } });
    await flush();
    // MUTATION clear-ui/stale-window-commits (the drop removed) → a party that just sat down is
    // closed out; red.
    expect(windowGroup()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      tf("en", "settle.clear.joined", { id: "4" }),
    );
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
    // A changed order (a dish added) drops the next window too.
    v.rerender({ watch: { ...WATCH, members: ["seat-1", "seat-2"] } });
    await tap(trigger());
    v.rerender({
      watch: {
        ...WATCH,
        members: ["seat-1", "seat-2"],
        lines: [...WATCH.lines, { id: "l3", qty: 1 }],
      },
    });
    await flush();
    expect(windowGroup()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "table.noshow.err.changed"));
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
  });

  it("the control leaving inside the window sends nothing (the safe direction — m7 B9)", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    const v = mount();
    await tap(trigger());
    v.unmount();
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
  });

  it("a KEYBOARD focus on Undo holds the window, warns five seconds before the cap, then lets it run", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    clearTable.mockResolvedValue({ ok: true });
    mount();
    await tap(trigger());
    await flush(CLEAR_ARM_MS);
    // Keyboard focus arrives on Undo (re-focused, as a Tab back onto it would).
    act(() => {
      undo().blur();
      keyboard.add(undo());
      undo().focus();
    });
    await flush(CLEAR_UNDO_MS * 2);
    // MUTATION clear-ui/hold-ignored → the clear commits under a keyboard user; red.
    expect(clearTable).not.toHaveBeenCalled();
    await flush(PICKED_HOLD_CAP_MS - PICKED_HOLD_WARN_MS - CLEAR_UNDO_MS * 2 + 500);
    // MUTATION clear-ui/hold-warning-unsaid → the cap releases with no word first; red.
    expect(screen.getByRole("alert").textContent).toBe(
      tf("en", "settle.clear.holdWarn", { id: "4" }),
    );
    expect(undo().getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    await walk(PICKED_HOLD_WARN_MS + CLEAR_UNDO_MS + 1_000);
    expect(clearTable).toHaveBeenCalledTimes(1);
  });
});

describe("the window's own focus move holds it only after a KEYBOARD opening", () => {
  it("Clear reached by keyboard: Undo, focused by the window, holds it at once", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    clearTable.mockResolvedValue({ ok: true });
    mount();
    act(() => {
      keyboard.add(trigger());
      trigger().focus();
    });
    await tap(trigger());
    await walk(CLEAR_UNDO_MS * 2);
    // MUTATION clear-ui/keyboard-opening-never-holds → the window runs out under a keyboard user
    // who never touched Undo; red. (A TAP's opening commits at six seconds — the first suite;
    // MUTATION clear-ui/tap-opening-holds reddens that one.)
    expect(clearTable).not.toHaveBeenCalled();
  });
});

describe("an unknown look is never a no-loss clear (Codex correction 11)", () => {
  it("unknown, a throw, or no answer: 'couldn't check', and nothing is ever sent", async () => {
    getClearPreview.mockResolvedValueOnce({ kind: "unknown" });
    mount();
    await tap(trigger());
    // MUTATION clear-ui/unknown-look-clears (an unknown look read as a free table) → red.
    expect(windowGroup()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.checkFailed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    getClearPreview.mockRejectedValueOnce(new Error("offline"));
    await tap(trigger());
    expect(windowGroup()).toBeNull();
    getClearPreview.mockReturnValueOnce(new Promise(() => {}));
    await tap(trigger());
    await flush(16_000);
    expect(windowGroup()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.checkFailed"));
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
  });
});

describe("food SENT and unpaid — the loss slip, only after Clear was reached for", () => {
  const slipHead = () => screen.getByRole("heading", { name: ts("en", "settle.clear.loss.head") });

  it("the dishes, their menu price, 'Did Table 4 pay?' — and nothing commits until 'No' is taken and armed", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: LOSS });
    clearTable.mockResolvedValue({ ok: true, dishes: 3, lossCents: 4100 });
    const onSlip = vi.fn();
    mount({ onSlip });
    await tap(trigger());
    // MUTATION clear-ui/loss-goes-straight-to-the-window (the slip skipped) → red.
    expect(slipHead()).toBeTruthy();
    expect(document.activeElement).toBe(slipHead());
    expect(onSlip).toHaveBeenLastCalledWith(true);
    const list = screen.getByRole("list", { name: ts("en", "settle.clear.loss.sent") });
    expect([...list.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "2×Mohingaမုန့်ဟင်းခါး",
      "1×Shan Noodles",
    ]);
    expect(document.querySelector(".clear-slip-total dd")!.textContent).toBe("$41.00");
    expect(screen.getByText(tf("en", "settle.clear.ask", { id: "4" }))).toBeTruthy();
    // No commit is drawn before the fork is answered.
    expect(screen.queryByRole("button", { name: /Clear · \$41\.00 loss/ })).toBeNull();
    await tap(screen.getByRole("button", { name: ts("en", "settle.clear.walkout") }));
    const commit = screen.getByRole("button", { name: /Clear · \$41\.00 loss/ });
    // MUTATION clear-ui/commit-armed-at-once → red.
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(commit.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(commit.getAttribute("aria-describedby")!)!.textContent,
    ).toContain(tf("en", "settle.clear.loss.body.many", { n: 3 }));
    await tap(commit);
    expect(windowGroup()).toBeNull();
    await flush(CLEAR_ARM_MS);
    await tap(screen.getByRole("button", { name: /Clear · \$41\.00 loss/ }));
    expect(windowGroup()).not.toBeNull();
    expect(onSlip).toHaveBeenLastCalledWith(false);
    await flush(CLEAR_UNDO_MS + 500);
    expect(clearTable).toHaveBeenCalledWith({
      sessionId: "s4",
      expect: { lineIds: ["l1", "l2"], lossCents: 4100, seenAt: SEEN },
    });
    // MUTATION clear-ui/loss-said-as-free → the floor says "free" over three dishes written off; red.
    expect(floorLine()).toBe(tf("en", "settle.clear.freeLoss.many", { id: "4", n: 3 }));
  });

  it("'Take cash' opens the pane's one till and stands the slip down; Cancel writes nothing", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: LOSS });
    const onTakeCash = vi.fn();
    mount({ onTakeCash });
    await tap(trigger());
    await tap(screen.getByRole("button", { name: ts("en", "settle.cash.title") }));
    expect(onTakeCash).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: ts("en", "settle.clear.loss.head") })).toBeNull();
    await tap(trigger());
    await tap(screen.getByRole("button", { name: ts("en", "settle.cancel") }));
    await flush();
    expect(document.activeElement).toBe(trigger());
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).not.toHaveBeenCalled();
  });

  it("no till offered: no 'Take cash' door is drawn", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: LOSS });
    mount();
    await tap(trigger());
    expect(screen.queryByRole("button", { name: ts("en", "settle.cash.title") })).toBeNull();
  });
});

describe("the server refuses — said in the dictionary's words, the table stays", () => {
  it("a join the server caught: 'Someone just joined Table 4…' and no navigation", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    clearTable.mockResolvedValue({ ok: false, error: "…", code: "joined" });
    mount();
    await tap(trigger());
    await flush(CLEAR_UNDO_MS + 500);
    // MUTATION clear-ui/refusal-in-server-english → the English sentence on a Burmese console; red.
    expect(screen.getByRole("alert").textContent).toBe(
      tf("en", "settle.clear.joined", { id: "4" }),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(floorLine()).toBe("");
  });
});

describe("Seat next party — under the screen's ONE mint lock (Codex corrections 5 · 6 · 9)", () => {
  it("the lock held: refused at the tap with the waiting line — nothing sent, the window as it was", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    const mint = fakeMint(true);
    mount({ mint });
    await tap(trigger());
    await flush(CLEAR_ARM_MS);
    await tap(seat());
    // MUTATION clear-ui/seat-ignores-the-hold → the clear goes and the start silently does not; red.
    expect(clearTable).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "floor.mint.waiting"));
    expect(windowGroup()).not.toBeNull();
  });

  it("free: the lock reserved FIRST, the clear sent now, the next party started only on its ok", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    let answer!: (v: unknown) => void;
    clearTable.mockReturnValue(new Promise((r) => (answer = r)));
    const mint = fakeMint();
    mount({ mint });
    await tap(trigger());
    await flush(CLEAR_ARM_MS);
    await tap(seat());
    // MUTATION clear-ui/seat-unreserved (the clear sent before the lock is taken) → red.
    expect(mint.reserve).toHaveBeenCalledWith("table-4");
    expect(clearTable).toHaveBeenCalledTimes(1);
    // MUTATION clear-ui/seat-before-the-close (the start sent with the clear) → it would find the
    // OLD session; red.
    expect(mint.go).not.toHaveBeenCalled();
    await act(async () => {
      answer({ ok: true });
    });
    expect(mint.go).toHaveBeenCalledWith({ kind: "table", tableNumber: 4 }, expect.anything());
    // The pane follows the new party — never the floor in between.
    expect(replace).not.toHaveBeenCalled();
    expect(mint.release).not.toHaveBeenCalled();
    await flush(CLEAR_UNDO_MS * 2);
    expect(clearTable).toHaveBeenCalledTimes(1);
  });

  it("a refused clear hands the lock back; a start that then fails is said on the floor with the way by hand", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    clearTable.mockResolvedValueOnce({ ok: false, error: "…", code: "joined" });
    const mint = fakeMint();
    mount({ mint });
    await tap(trigger());
    await flush(CLEAR_ARM_MS);
    await tap(seat());
    // MUTATION clear-ui/seat-held-after-refusal → every start on the screen stays held; red.
    expect(mint.release).toHaveBeenCalledTimes(1);
    expect(mint.go).not.toHaveBeenCalled();
    // The next try: the clear lands, the start is refused.
    clearTable.mockResolvedValueOnce({ ok: true });
    mint.go.mockImplementation((_i, cb) => cb.onRefusal("That table is taken."));
    await tap(trigger());
    await flush(CLEAR_ARM_MS);
    await tap(seat());
    // MUTATION clear-ui/seat-failure-unsaid → the party waits on a start nobody made; red.
    expect(floorLine()).toBe(tf("en", "settle.clear.seatFailed", { id: "4" }));
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("no lock on this screen (the full page), or no table number: no Seat next", async () => {
    getClearPreview.mockResolvedValue({ kind: "preview", preview: FREE });
    mount({ mint: null });
    await tap(trigger());
    expect(within(windowGroup()!).getAllByRole("button")).toHaveLength(1);
    cleanup();
    mount({ mint: fakeMint(), tableNumber: null });
    await tap(trigger());
    expect(within(windowGroup()!).getAllByRole("button")).toHaveLength(1);
  });
});
