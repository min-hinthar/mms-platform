/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KitchenQueue } from "@/lib/kitchen-types";
import type { KitchenActionResult } from "@/lib/kitchen";

/**
 * The board's WIRING, pinned where it lives (T18 — a component suite for what a pure module cannot
 * express). The rules themselves are elsewhere: the age formatter in `lib/kds-time.ts` (its own
 * suite), the reverse of an 86 in `lib/menu-availability.ts`. What only a render can show:
 *
 *   - K22 (Phase 2b): the 86 lives behind each line's ⋯ — two deliberate taps, the second held for
 *     SAME_GESTURE_MS from the sheet's mount — and resolves IN the sheet (busy Button, a refusal in
 *     the sheet's region, the sheet UNMOUNTED on success). Its result lands in the undo bar, whose
 *     Undo is held too and is the compare-and-swap BACK — `expectedSoldOut: true`, because that is
 *     the state this board just wrote. The board's confirmed override (keyed on the poll sequence)
 *     keeps a coalesced stale poll from re-offering the ⋯;
 *   - Phase 2b: a dish's kitchen note sits directly under its dish and is the line's description;
 *   - §17: a control that was just tapped is `aria-disabled`, never `disabled` — native disabled
 *     drops focus to <body> mid-tap, and the busy name is then spoken from nowhere. Every action
 *     button on the board (bump, fire, line, the ⋯ and its sheet's 86, undo, recall, pager) follows
 *     the same rule, and the handler refuses re-entry so the attribute is a statement, not the gate;
 *   - K28: a ticket's visible age has a ceiling and its SPOKEN age is the dictionary's sentence;
 *   - §2: the six pressed selectors on the console share ONE rule — a second copy is the drift
 *     K29 found (a tint that vanished inside the station track).
 */
const NOW = "2026-09-20T18:00:00.000Z";
const HOUR = 3_600_000;

type SoldOutRes =
  | { ok: true; soldOut: boolean }
  | { ok: false; error: string; code: "sentence" | "invalid" | "gone" | "stale" };
const setItemSoldOut = vi.fn(
  (): Promise<SoldOutRes> => Promise.resolve({ ok: true as const, soldOut: true }),
);
const bumpTicket = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
const recallTicket = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
// Phase 2h — the line tap's and the held ticket's writes, each a case's to hang or refuse.
const bumpLine = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
const fireTicketNow = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
const haptic = vi.fn();
// kitchen-8 — the device's remembered sound preference and whether this "device" has audio.
let soundWanted = false;
let armOk = false;
const setKdsSoundWanted = vi.fn();
// Phase 2b — the fake engine: `armed` is the context's state, and its listeners are what
// `KdsChime.subscribe` hands the board (a suspension is `ctxRunning = false` + `notifyChime()`).
let ctxRunning = false;
const chimeListeners = new Set<() => void>();
const notifyChime = () => {
  for (const f of chimeListeners) f();
};
const played = vi.fn();

const queue = (firedAt = NOW): KitchenQueue => ({
  tickets: [
    {
      cartId: "cart-1",
      sessionId: "sess-1",
      channel: "dinein",
      label: "T4",
      tableNumber: 4,
      customerName: null,
      shortCode: null,
      pickupSlot: null,
      held: false,
      unpaid: false,
      firedAt,
      lines: [
        {
          id: "line-1",
          menuItemId: "mi-1",
          soldOut: false,
          name: "Mohinga",
          nameMy: null,
          qty: 1,
          modifiers: [],
          modifiersMy: [],
          notes: null,
          state: "fired",
          firedAt,
          fulfillment: "dinein",
          station: "wok",
        },
      ],
    },
  ],
  serverNow: NOW,
  thresholds: {
    dineinAmberMin: 8,
    dineinRedMin: 12,
    pickupAmberMin: 8,
    pickupRedMin: 12,
    rechimeSec: 60,
  },
  stats: { avgSecs: 0, servedToday: null },
  served: null,
});
let currentQueue = queue();
const getKitchenQueue = vi.fn(
  (): Promise<{ ok: true; queue: KitchenQueue }> =>
    Promise.resolve({ ok: true, queue: currentQueue }),
);

vi.mock("@/lib/kitchen", () => ({
  getKitchenQueue: () => getKitchenQueue(),
  bumpTicket: (...a: unknown[]) => bumpTicket(...(a as [])),
  bumpLine: (...a: unknown[]) => bumpLine(...(a as [])),
  fireTicketNow: (...a: unknown[]) => fireTicketNow(...(a as [])),
  recallTicket: (...a: unknown[]) => recallTicket(...(a as [])),
}));
vi.mock("@/lib/menu-availability", () => ({
  setItemSoldOut: (...a: unknown[]) => setItemSoldOut(...(a as [])),
}));
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("@/lib/kds-sound", () => ({
  SOFT_LEVEL: 0.4,
  KDS_DEFAULT_VOLUME: 0.8,
  KdsChime: class {
    arm() {
      ctxRunning = armOk;
      notifyChime(); // the real engine notifies once after an arm settles
      return Promise.resolve(armOk);
    }
    get armed() {
      return ctxRunning;
    }
    subscribe(cb: () => void) {
      chimeListeners.add(cb);
      return () => {
        chimeListeners.delete(cb);
      };
    }
    play(...a: unknown[]) {
      played(...a);
    }
  },
  getKdsVolume: () => 0.8,
  setKdsVolume: () => {},
  getKdsSoundWanted: () => soundWanted,
  setKdsSoundWanted: (...a: unknown[]) => setKdsSoundWanted(...a),
}));
// The Help door auto-opens its sheet on a fresh device; this suite is about the board beneath it.
vi.mock("./HelpButton", () => ({ HelpButton: () => null }));
// The bar's two server actions and the router — the same stubs `StaffBar.test.tsx` mounts it with.
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { KdsBoard } = await import("./KdsBoard");
const { tf, localizeCount } = await import("@/lib/i18n/fill");
const { ts, STAFF } = await import("@/lib/i18n/staff");
const { padDishName } = await import("@/lib/order-pad");
const { sx, al } = await import("@/lib/staff-labels");

afterEach(() => {
  cleanup();
  setItemSoldOut.mockReset();
  setItemSoldOut.mockImplementation(() => Promise.resolve({ ok: true as const, soldOut: true }));
  bumpTicket.mockReset();
  bumpTicket.mockImplementation(() => Promise.resolve({ ok: true }));
  recallTicket.mockReset();
  recallTicket.mockImplementation(() => Promise.resolve({ ok: true }));
  bumpLine.mockReset();
  bumpLine.mockImplementation(() => Promise.resolve({ ok: true }));
  fireTicketNow.mockReset();
  fireTicketNow.mockImplementation(() => Promise.resolve({ ok: true }));
  haptic.mockReset();
  setKdsSoundWanted.mockReset();
  getKitchenQueue.mockReset();
  getKitchenQueue.mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
  soundWanted = false;
  armOk = false;
  ctxRunning = false;
  chimeListeners.clear();
  played.mockReset();
  currentQueue = queue();
  vi.useRealTimers();
  // The performance.now clock and the getComputedStyle stub are spies — restore them per test.
  vi.restoreAllMocks();
});

const mount = (lang: "en" | "my" = "en", initial = currentQueue) =>
  render(
    <StaffLangProvider lang={lang}>
      <KdsBoard initial={initial} />
    </StaffLangProvider>,
  );

/** One promise the test settles by hand — the shape of a write still in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

/**
 * Phase 2b — the same-gesture holds read `performance.now()` (the sheet's mount, the undo pill's
 * mount), so the suite drives it by hand: `clock` is what the board reads.
 */
let clock = 0;
function holdClock() {
  clock = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
}
const { SAME_GESTURE_MS } = await import("@mms/ui");

/** The ⋯ of a line, by its sr-only dictionary name (it carries NO aria-label). */
const moreFor = (dish = "Mohinga") => tf("en", "kds.line.more", { x: dish });
/** The sheet's danger button, by its dictionary word (the plain-words pass retired "86 this dish"). */
const eightySixName = new RegExp(ts("en", "kds.86"));

/** Open the ⋯ sheet, wait out the same-gesture hold, and tap its 86. Returns the dialog. */
async function tapEightySix(q: ReturnType<typeof render>, dish = "Mohinga") {
  fireEvent.click(q.getByRole("button", { name: moreFor(dish) }));
  const dialog = await q.findByRole("dialog");
  clock += SAME_GESTURE_MS;
  fireEvent.click(within(dialog).getByRole("button", { name: eightySixName }));
  return dialog;
}

/** Radix holds a closing sheet while its exit animation runs; jsdom has none, so stub one in. */
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
const commits = () => haptic.mock.calls.filter((c) => c[0] === "commit").length;

describe("K22 — an 86 from the ticket can be undone from the bar, like a bump", () => {
  it("lands the dish in the undo bar and reverses through the compare-and-swap back to available", async () => {
    holdClock();
    const q = mount();
    const { container } = q;
    await tapEightySix(q);
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(1));
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: true,
      expectedSoldOut: false,
    });
    // The bar names the dish, and the one live region says undo is still open.
    const bar = await waitFor(() => {
      const el = container.querySelector(".kds-undo");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(bar.textContent).toContain("Mohinga");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86", { x: "Mohinga" }),
    );
    expect(haptic).toHaveBeenCalledWith("commit");

    clock += SAME_GESTURE_MS;
    fireEvent.click(q.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    // MUTATION: `expectedSoldOut: true` → `false` — the swap would refuse against the state the
    // board just wrote, and the cook's undo would fail every time with "someone else changed it".
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: false,
      expectedSoldOut: true,
    });
    await waitFor(() => expect(container.querySelector(".kds-undo")).toBeNull());
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86.undone", { x: "Mohinga" }),
    );
    // The put-back is confirmed: the ⋯ is offered again before any poll.
    expect(q.getByRole("button", { name: moreFor() })).toBeTruthy();
  });

  it("names the dish Burmese-first in the bar when the catalog has it", async () => {
    holdClock();
    currentQueue = queue();
    currentQueue.tickets[0]!.lines[0]!.nameMy = "မုန့်ဟင်းခါး";
    const q = mount("my", currentQueue);
    fireEvent.click(
      q.getByRole("button", { name: tf("my", "kds.line.more", { x: "မုန့်ဟင်းခါး" }) }),
    );
    const dialog = await q.findByRole("dialog");
    clock += SAME_GESTURE_MS;
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(ts("my", "kds.86")) }));
    const bar = await waitFor(() => {
      const el = q.container.querySelector(".kds-undo");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(bar.textContent).toContain("မုန့်ဟင်းခါး");
    expect(bar.textContent).not.toContain("Mohinga");
  });
});

describe("Phase 2b (K22) — the 86 is two deliberate taps, resolved inside the sheet", () => {
  it("nothing is named `kds.86` until the ⋯ opens the dialog; then exactly one control is", async () => {
    // MUTATION (by hand): render the sheet's Button inline in the row — an 86 on the board, red.
    const q = mount();
    expect(q.queryAllByRole("button", { name: eightySixName })).toHaveLength(0);
    const more = q.getByRole("button", { name: moreFor() });
    // The ⋯ is named by sr-only dictionary text — no aria-label channel (rule 3).
    expect(more.getAttribute("aria-label")).toBeNull();
    expect(more.getAttribute("aria-haspopup")).toBe("dialog");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    const dialog = await q.findByRole("dialog");
    expect(within(dialog).getAllByRole("button", { name: eightySixName })).toHaveLength(1);
    expect(q.getAllByRole("button", { name: eightySixName, hidden: true })).toHaveLength(1);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(haptic).toHaveBeenCalledWith("pick");
    // The sheet is titled by the dish and describes the button with the hint.
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    expect(document.getElementById(btn.getAttribute("aria-describedby")!)?.textContent).toBe(
      ts("en", "kds.86.hint"),
    );
    expect(btn.className).toBe("ui-btn ui-btn-danger ui-btn-xl ui-btn-block");
  });

  it("the sheet's 86 is held for SAME_GESTURE_MS from the sheet's mount — 349 ms no, 350 ms yes", async () => {
    // MUTATION (by hand): drop the removeHeld guard — the double-tap's second half 86s, red.
    holdClock();
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    const dialog = await q.findByRole("dialog");
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    clock += SAME_GESTURE_MS - 1;
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(0);
    clock += 1;
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
  });

  it("stays open and busy through the write, buzzes once at the tap, and UNMOUNTS on success", async () => {
    holdClock();
    stubComputedStyle(); // a CLOSED sheet would now be held through its exit — unmount must win
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    const dialog = await tapEightySix(q);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: true,
      expectedSoldOut: false,
    });
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    expect(q.queryByRole("dialog")).not.toBeNull();
    // The label stays through the round trip — busy is the attribute and the spinner.
    expect(btn.textContent).toContain(ts("en", "kds.86"));
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    // §3 — the buzz is the GESTURE's. MUTATION: move it back into onEightySixed — 0 here, red.
    expect(commits()).toBe(1);
    // The dish's ⋯ is refused while its write is in flight: aria-disabled, and aria-busy (it opened
    // this sheet).
    const more = document.getElementById("kds-more-line-1")!;
    expect(more.getAttribute("aria-disabled")).toBe("true");
    expect(more.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    // MUTATION: close via the subject instead of the landedKey unmount — the stubbed exit holds a
    // closed dialog in the tree, red.
    expect(q.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(document.querySelector(".mms-sheet")).toBeNull();
    const bar = q.container.querySelector(".kds-undo")!;
    expect(bar.querySelector("span")!.textContent).toBe(tf("en", "kds.undo.86", { x: "Mohinga" }));
    expect(q.container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86", { x: "Mohinga" }),
    );
    expect(commits()).toBe(1);
    // Undo at the pill's mount + SAME_GESTURE_MS: the reverse swap, buzzing at the tap.
    const d2 = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d2.promise);
    clock += SAME_GESTURE_MS;
    fireEvent.click(q.getByRole("button", { name: /^Undo/ }));
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: false,
      expectedSoldOut: true,
    });
    expect(commits()).toBe(2);
    await act(async () => {
      d2.resolve({ ok: true, soldOut: false });
    });
  });

  it("the undo pill is held for SAME_GESTURE_MS from its mount — 349 ms no, 350 ms yes", async () => {
    // MUTATION (by hand): drop the undo's removeHeld guard — a stray second tap of the 86 lands on
    // the pill that mounted in its footprint and puts the dish straight back on sale, red.
    holdClock();
    const q = mount();
    await tapEightySix(q);
    await waitFor(() => expect(q.container.querySelector(".kds-undo")).not.toBeNull());
    const undoBtn = q.getByRole("button", { name: /^Undo/ });
    clock += SAME_GESTURE_MS - 1;
    fireEvent.click(undoBtn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    clock += 1;
    fireEvent.click(undoBtn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(2);
  });

  it("the override outlives a poll that was already in flight, and yields to the next one", async () => {
    // The coalesced-refresh defect (menu-3, on the board): a poll in flight at the write adopts a
    // snapshot that predates it. MUTATIONS: no override → the ⋯ survives the landed 86, red;
    // prune on `>=` → the stale poll resurrects it, red.
    vi.useFakeTimers();
    const d86 = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d86.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAME_GESTURE_MS);
    });
    const dialog = q.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: eightySixName }));
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    // A poll starts BEFORE the write lands, and hangs.
    const stale = deferred<{ ok: true; queue: KitchenQueue }>();
    getKitchenQueue.mockImplementationOnce(() => stale.promise);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000 - SAME_GESTURE_MS);
    });
    expect(getKitchenQueue).toHaveBeenCalledTimes(1);
    await act(async () => {
      d86.resolve({ ok: true, soldOut: true });
    });
    const tag = () => q.container.querySelector("#kds-line-line-1 .kds-line-tag")?.textContent;
    const name = () => q.container.querySelector("#kds-line-line-1")!.getAttribute("aria-label")!;
    expect(tag()).toContain(ts("en", "kds.86.done"));
    expect(document.getElementById("kds-more-line-1")).toBeNull();
    expect(name().endsWith(` — ${ts("en", "kds.86.done")}`)).toBe(true);
    // The stale poll lands, still saying available: the override holds.
    await act(async () => {
      stale.resolve({ ok: true, queue: queue() });
    });
    expect(document.getElementById("kds-more-line-1")).toBeNull();
    expect(tag()).toContain(ts("en", "kds.86.done"));
    // The next poll STARTED after the confirmation: it is the truth — put back elsewhere, the ⋯ is
    // back (never "until the prop agrees").
    currentQueue = queue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(document.getElementById("kds-more-line-1")).not.toBeNull();
    expect(name().endsWith(ts("en", "kds.86.done"))).toBe(false);
  });

  it("focus lands on the dish's own line when the 86 resolves with the sheet open", async () => {
    holdClock();
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    await tapEightySix(q);
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    // The OUTCOME, pinned for this order. Two mechanisms agree on it here: the board's landing
    // effect and the sheet's own orphan-only unmount focus (whose fallback, the ⋯ being gone, is
    // the line) — so deleting the landing effect is caught by the dismissed-mid-write case below,
    // where no sheet unmounts at the resolution and the landing is the only thing that moves focus.
    await waitFor(() => expect(document.activeElement?.id).toBe("kds-line-line-1"));
    // …and stays there once Radix's unmount focus has run (it moves only an orphaned focus).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.activeElement?.id).toBe("kds-line-line-1");
  });

  it("dismissed mid-write: focus returns to the busy ⋯, which opens nothing, then lands on the line", async () => {
    // MUTATION (by hand): delete the landing effect — the ⋯ leaves under the focus and nothing
    // moves it (no sheet unmounts at this resolution), red.
    holdClock();
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    const dialog = await tapEightySix(q);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    const more = document.getElementById("kds-more-line-1")!;
    await waitFor(() => expect(document.activeElement).toBe(more));
    expect(more.getAttribute("aria-busy")).toBe("true");
    expect(more.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(more);
    expect(q.queryByRole("dialog")).toBeNull();
    // Phase 2h — the read that follows the landed 86 is its OWN round trip (a Server Action never
    // answers inside the write's microtask burst). Held here, so the landing and that snapshot are two
    // commits, as on a tablet. Answered instantly, both land in ONE commit — the next case (K1).
    const after = deferred<{ ok: true; queue: KitchenQueue }>();
    getKitchenQueue.mockImplementationOnce(() => after.promise);
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    await waitFor(() => expect(document.activeElement?.id).toBe("kds-line-line-1"));
    await act(async () => {
      after.resolve({ ok: true, queue: currentQueue });
    });
  });

  it("a landed 86 and a snapshot in ONE commit: the orphaned focus still lands on the dish's line, never the heading (integration b · K1)", async () => {
    // The post-write read answers at once, so the override and the snapshot commit TOGETHER. Both
    // effects run in that commit, in declaration order: the landing must run before the board's
    // focus catch-all, or the catch-all takes the orphan to the heading first and the landing then
    // sees focus "somewhere real" and leaves it there. MUTATION (p2h-int-b/kds/focus-catch-all-first):
    // the catch-all declared first again (the K1 order); red.
    holdClock();
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    const dialog = await tapEightySix(q);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    const more = document.getElementById("kds-more-line-1")!;
    await waitFor(() => expect(document.activeElement).toBe(more));
    // The read that follows answers at once, and it is the truth: the dish IS off the menu.
    const off = queue();
    off.tickets[0]!.lines[0]!.soldOut = true;
    currentQueue = off;
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    await waitFor(() => expect(document.getElementById("kds-more-line-1")).toBeNull());
    expect(document.activeElement?.id).toBe("kds-line-line-1");
  });

  it("focus elsewhere is left alone, and the landing is one-shot — a later orphan is not pulled to the line", async () => {
    // MUTATION (by hand): keep landRef across commits — the Undo that orphans focus later pulls it
    // to line-1, red.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount("en", two);
    const dialog = await tapEightySix(q);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe("kds-more-line-1"));
    const other = document.getElementById("kds-line-line-2")!;
    other.focus();
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    expect(document.activeElement).toBe(other);
    // The Undo is focused and tapped; its bar unmounts under the focus, in the commit that records
    // the put-back override.
    const undoBtn = q.getByRole("button", { name: /^Undo/ });
    undoBtn.focus();
    clock += SAME_GESTURE_MS;
    const d2 = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d2.promise);
    fireEvent.click(undoBtn);
    await act(async () => {
      d2.resolve({ ok: true, soldOut: false });
    });
    expect(q.container.querySelector(".kds-undo")).toBeNull();
    expect(document.activeElement?.id).not.toBe("kds-line-line-1");
  });

  it("an 86 landing while ANOTHER line's sheet is open leaves that sheet alone and parks its Undo until it closes", async () => {
    // Blind review (2026-09-24). MUTATION (by hand): close/unmount on every success — B's sheet
    // vanishes under the cook, and A's Undo mounts in the footprint of B's sold-out button, red.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q); // A: Mohinga, in flight
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    fireEvent.click(q.getByRole("button", { name: moreFor("Laphet") })); // B opens
    const dialogB = await q.findByRole("dialog");
    expect(dialogB.textContent).toContain("Laphet");
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
    // B is still open, still B, and its own sold-out button is still the thing under the finger.
    expect(q.getByRole("dialog")).toBe(dialogB);
    expect(dialogB.getAttribute("data-state")).toBe("open");
    expect(within(dialogB).getByRole("button", { name: eightySixName })).toBeTruthy();
    expect(q.container.querySelector(".kds-undo")).toBeNull();
    // The fact is in the board's region.
    expect(q.container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86.parked", { x: "Mohinga" }),
    );
    // B closes: A's Undo arrives, naming A.
    fireEvent.keyDown(dialogB, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(q.container.querySelector(".kds-undo")).not.toBeNull());
    expect(q.container.querySelector(".kds-undo")!.textContent).toContain(
      tf("en", "kds.undo.86", { x: "Mohinga" }),
    );
  });

  it("an 86 made in the OPEN sheet keeps its own Undo — an older parked 86 never overwrites it", async () => {
    // Codex round 2 on #304 (P2). A lands while B's sheet is open (parked); then B's own 86 lands and
    // closes B's sheet. RED before the fix: the park-drain effect saw the sheet close and published
    // A over B, so the dish the cook had JUST marked sold out lost its six-second way back.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const dA = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dA.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q); // A in flight
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    const dB = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dB.promise);
    await tapEightySix(q, "Laphet"); // B in flight, B's sheet open
    await act(async () => {
      dA.resolve({ ok: true, soldOut: true }); // A lands under B's sheet: parked
    });
    // The parked notice promises no undo it may never get to offer.
    expect(q.container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86.parked", { x: "Mohinga" }),
    );
    await act(async () => {
      dB.resolve({ ok: true, soldOut: true }); // B lands in its own sheet: B's Undo
    });
    await waitFor(() => expect(q.container.querySelector(".kds-undo")).not.toBeNull());
    await act(async () => {}); // let every effect of the closing commit run
    const bar = q.container.querySelector(".kds-undo")!;
    expect(bar.textContent).toContain(tf("en", "kds.undo.86", { x: "Laphet" }));
    expect(bar.textContent).not.toContain("Mohinga");
  });

  it("the NEWEST sold-out keeps the Undo even when the OLDER one's answer lands last", async () => {
    // Codex round 3 on #304 (P2). A in flight, dismissed; B tapped and answered FIRST (B's Undo);
    // then A answers. RED before the tap sequence: A's late success took the null-sheet branch and
    // overwrote B's Undo.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const dA = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dA.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q);
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    setItemSoldOut.mockImplementationOnce(() => Promise.resolve({ ok: true, soldOut: true }));
    await tapEightySix(q, "Laphet");
    await waitFor(() => expect(q.container.querySelector(".kds-undo")).not.toBeNull());
    await act(async () => {
      dA.resolve({ ok: true, soldOut: true }); // the OLDER answer lands last
    });
    await act(async () => {});
    const bar = q.container.querySelector(".kds-undo")!;
    expect(bar.textContent).toContain(tf("en", "kds.undo.86", { x: "Laphet" }));
    expect(bar.textContent).not.toContain("Mohinga");
    expect(q.container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86.parked", { x: "Mohinga" }),
    );
  });

  it("a late refusal while ANOTHER dish's sheet is open is shown inside that open sheet", async () => {
    // Codex round 3 on #304 (P2). The modal sheet makes the board behind it aria-hidden, so the
    // board's region cannot be heard. RED before: A's refusal went to the board region.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const dA = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dA.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q);
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    fireEvent.click(q.getByRole("button", { name: moreFor("Laphet") }));
    const dialogB = await q.findByRole("dialog");
    await act(async () => {
      dA.resolve({ ok: false, error: "That changed.", code: "stale" });
    });
    const sentence = tf("en", "kds.err.stale", { x: "Mohinga" });
    await waitFor(() => expect(within(dialogB).getByRole("status").textContent).toBe(sentence));
    expect(q.getByRole("dialog")).toBe(dialogB);
  });

  it("an older refusal settling in the SAME batch as a success that closes the sheet reaches the board", async () => {
    // Codex round 4 on #304 (P2). B's success unmounts B's sheet; A's refusal lands in the same
    // batch. RED before: the routing ref still named B's sheet, so A's refusal went into the
    // unmounting sheet and was lost — the cook would believe A was sold out while it stayed orderable.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const dA = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dA.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q);
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    const dB = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dB.promise);
    await tapEightySix(q, "Laphet");
    await act(async () => {
      dB.resolve({ ok: true, soldOut: true });
      dA.resolve({ ok: false, error: "That changed.", code: "stale" });
    });
    const sentence = tf("en", "kds.err.stale", { x: "Mohinga" });
    await waitFor(() =>
      expect(q.container.querySelector('[role="status"]')?.textContent).toBe(sentence),
    );
  });

  it("a NEWER sold-out that FAILS does not strip the older success of its Undo", async () => {
    // Codex round 5 on #304 (P2). A in flight, dismissed; B tapped and refused; then A succeeds.
    // RED before: the tap sequence made A non-newest, so A went sold out with no Undo.
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    currentQueue = two;
    const dA = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => dA.promise);
    const q = mount("en", two);
    const dialogA = await tapEightySix(q);
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    setItemSoldOut.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "That changed.", code: "stale" }),
    );
    const dialogB = await tapEightySix(q, "Laphet");
    await waitFor(() => expect(within(dialogB).getByRole("status").textContent).not.toBe(""));
    fireEvent.keyDown(dialogB, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    await act(async () => {
      dA.resolve({ ok: true, soldOut: true });
    });
    await waitFor(() => expect(q.container.querySelector(".kds-undo")).not.toBeNull());
    expect(q.container.querySelector(".kds-undo")!.textContent).toContain(
      tf("en", "kds.undo.86", { x: "Mohinga" }),
    );
  });

  it("a refusal renders in the sheet's region, keeps the sheet open, and refreshes", async () => {
    // MUTATIONS (by hand): route every refusal to the board region — the sheet's region is empty,
    // red; refresh only on ok — no queue read, red.
    holdClock();
    setItemSoldOut.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "That changed.", code: "stale" }),
    );
    const q = mount();
    const dialog = await tapEightySix(q);
    const sentence = tf("en", "kds.err.stale", { x: "Mohinga" });
    await waitFor(() => expect(within(dialog).getByRole("status").textContent).toBe(sentence));
    expect(q.queryByRole("dialog")).not.toBeNull();
    expect(q.container.querySelector('[role="status"]')?.textContent).not.toBe(sentence);
    await waitFor(() => expect(getKitchenQueue).toHaveBeenCalledTimes(1));
    // The Button re-arms.
    expect(
      within(dialog).getByRole("button", { name: eightySixName }).getAttribute("aria-busy"),
    ).toBeNull();
  });

  it("a refusal after the sheet was dismissed goes to the board's region", async () => {
    holdClock();
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    const dialog = await tapEightySix(q);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    await act(async () => {
      d.resolve({ ok: false, error: "That changed.", code: "stale" });
    });
    await waitFor(() =>
      expect(q.container.querySelector('[role="status"]')?.textContent).toBe(
        tf("en", "kds.err.stale", { x: "Mohinga" }),
      ),
    );
  });

  it("an EXITING sheet cannot write: its 86 is aria-disabled and refused", async () => {
    // MUTATION (by hand): drop the `!open` refusal — the closing sheet's button writes, red.
    holdClock();
    stubComputedStyle();
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    const dialog = await q.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(dialog.getAttribute("data-state")).toBe("closed"));
    clock += SAME_GESTURE_MS;
    const btn = within(dialog).getByRole("button", { name: eightySixName, hidden: true });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(0);
  });

  it("the sheet follows the LIVE line: it closes when the line leaves, never reopens on a recall, and turns into the statement when the dish goes off elsewhere", async () => {
    // MUTATIONS (by hand): hand useSheetSubject the captured line — the sold-out swap never shows,
    // red; skip clearing the id — the recall reopens the sheet, red.
    vi.useFakeTimers();
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    expect(q.queryByRole("dialog")).not.toBeNull();
    currentQueue = { ...queue(), tickets: [] };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(q.queryByRole("dialog")).toBeNull();
    currentQueue = queue();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(q.queryByRole("dialog")).toBeNull();
    // Open again; another console takes the dish off while the sheet is open.
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    expect(q.queryByRole("dialog")).not.toBeNull();
    currentQueue = queue();
    currentQueue.tickets[0]!.lines[0]!.soldOut = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const dialog = q.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: eightySixName })).toBeNull();
    expect(dialog.querySelector(".kds-menu-off")?.textContent).toBe(ts("en", "kds.86.done"));
  });

  it("the unattended sheet: Esc closes it and returns focus to the ⋯ that opened it", async () => {
    // MUTATION (by hand): an onCloseAutoFocus that always focuses #kds-h — red.
    const q = mount();
    const more = q.getByRole("button", { name: moreFor() });
    more.focus();
    fireEvent.click(more);
    const dialog = await q.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(q.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});

describe("Phase 2b — a dish's note sits directly under that dish, as its description", () => {
  it("outside the line button, right after the row; the line is described by it; the next line is not", () => {
    // MUTATIONS (by hand): move the note into .kds-line-main — red; drop the describedby — red;
    // render it inside the row after the ⋯ — its previous sibling is not the row, red.
    const q = queue();
    q.tickets[0]!.lines[0]!.notes = "no peanuts — allergy";
    q.tickets[0]!.lines.push({ ...q.tickets[0]!.lines[0]!, id: "line-2", notes: null });
    const { container } = mount("en", q);
    const items = container.querySelectorAll(".kds-item");
    expect(items).toHaveLength(2);
    const note = items[0]!.querySelector(".kds-note")!;
    expect(note).not.toBeNull();
    expect(note.closest(".kds-line")).toBeNull();
    expect(note.previousElementSibling?.className).toBe("kds-item-row");
    const line1 = items[0]!.querySelector(".kds-line")!;
    expect(line1.getAttribute("aria-describedby")).toBe(note.id);
    expect(document.getElementById(note.id)).toBe(note);
    const line2 = items[1]!.querySelector(".kds-line")!;
    expect(line2.getAttribute("aria-describedby")).toBeNull();
    expect(items[1]!.querySelector(".kds-note")).toBeNull();
  });

  it("a held line with a note is described by the slot, then the note", () => {
    const nine = nineTickets(true);
    nine.tickets[8]!.lines[0]!.notes = "no MSG";
    const { container, getByRole } = mount("en", nine);
    fireEvent.click(getByRole("button", { name: sx("en", "kds.a11y.nextPage") }));
    const held = container.querySelector(".kds-ticket-held .kds-line")!;
    const slot = container.querySelector(".kds-ticket-held .kds-slot")!;
    const note = container.querySelector(".kds-ticket-held .kds-note")!;
    expect(held.getAttribute("aria-describedby")).toBe(`${slot.id} ${note.id}`);
  });
});

describe("§17 — a tapped control is aria-disabled, keeps focus, and refuses re-entry in the handler", () => {
  it("the sheet's 86, while its write is in flight", async () => {
    holdClock();
    const d = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const q = mount();
    const dialog = await tapEightySix(q);
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    // MUTATION: `aria-disabled` → native `disabled`: jsdom (like a real browser) blurs a disabled
    // element, focus falls to <body>, and the busy name is announced from nowhere.
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    // A second tap while in flight is refused by the handler, not by the attribute.
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
  });

  it("the bump, while its write is in flight — one tap, one write", async () => {
    const d = deferred<{ ok: true }>();
    bumpTicket.mockImplementationOnce(() => d.promise);
    const { getByRole } = mount();
    const btn = getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(bumpTicket).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true });
    });
  });

  it("no action button on the board is ever natively disabled — at the pager's edge, on a held line", () => {
    // Nine tickets at page 0 puts the ‹ button at its refused edge; the held ticket is on page 2,
    // so the board is paged there and its line is the refused one. Before §17 both were native
    // `disabled` — a one-ticket fixture with nothing in flight rendered zero `:disabled` buttons
    // on the OLD code too, so this case could not fail until the refused states were on screen.
    const { container, getByRole } = mount("en", nineTickets(true));
    const prev = getByRole("button", { name: sx("en", "kds.a11y.prevPage") });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(getByRole("button", { name: sx("en", "kds.a11y.nextPage") }));
    const heldLine = container.querySelector(".kds-ticket-held .kds-line")!;
    expect(heldLine).not.toBeNull();
    expect(heldLine.getAttribute("aria-disabled")).toBe("true");
    // …and the slot line names WHY it refuses.
    const slot = container.querySelector(".kds-ticket-held .kds-slot")!;
    expect(heldLine.getAttribute("aria-describedby")).toBe(slot.id);
    // MUTATION: `disabled={safePage === 0}` on ‹ or `disabled={pending || held}` on the line — red.
    expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
  });

  it("Phase 2b — with a ⋯ on screen and its sheet's 86 open, nothing is natively disabled", async () => {
    const q = mount();
    expect(q.container.querySelectorAll(".kds-line-more")).toHaveLength(1);
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    await q.findByRole("dialog");
    expect(document.querySelectorAll("button:disabled")).toHaveLength(0);
  });
});

describe("K28 — the ticket's age has a ceiling, and its spoken form is the dictionary's", () => {
  it("a ticket fired 26 hours ago reads `1d+`, and is announced as more than a day", () => {
    const stale = queue(new Date(Date.parse(NOW) - 26 * HOUR).toISOString());
    const { container } = mount("en", stale);
    expect(container.querySelector(".kds-clock")?.textContent).toBe("1d+");
    expect(container.querySelector(".kds-clock + .sr-only")?.textContent).toBe(
      ts("en", "kds.age.days"),
    );
  });

  it("a ticket fired 3m 42s ago is spoken in Burmese numerals under my", () => {
    const fresh = queue(new Date(Date.parse(NOW) - (3 * 60 + 42) * 1000).toISOString());
    const { container } = mount("my", fresh);
    const spoken = container.querySelector(".kds-clock + .sr-only");
    expect(spoken?.getAttribute("lang")).toBe("my");
    expect(spoken?.textContent).toBe(
      tf("my", "kds.age.mmss", { m: localizeCount(3, "my"), s: localizeCount(42, "my") }),
    );
  });
});

describe("§2 — the console's six pressed selectors share ONE lit-cap rule", () => {
  // counter-4 added the register's open arm (`aria-expanded`, the state that control already
  // carries) to the same list — a selection is a selection whichever attribute says so; manager-7
  // added `.staff-chip`, the one rest class every pressed chip outside the KDS root wears.
  const PRESSED = [
    '.kds-chip[aria-pressed="true"]',
    '.staff-seg > .kds-chip[aria-pressed="true"]',
    '.staff-lang-btn[aria-pressed="true"]',
    '.help-size-row[aria-pressed="true"]',
    '.staff-arm[aria-expanded="true"]',
    '.staff-chip[aria-pressed="true"]',
    // board-9 — the wall's `Food up` chip wears the cap too (an <li>, pressed by its class).
    ".orb-table-up",
    // ── Phase 2d · split ── the selected floor card's NAME (a pick from a live list, not "you are here").
    '.floor-card[aria-current="true"] .floor-card-label',
    // ── Phase 2e · lang ── the pressed language ROW (Help sheet · Profile) wears the same cap.
    '.staff-lang-row[aria-pressed="true"]',
  ];
  // Comments stripped, and every at-rule prelude (`@media … {`) removed so a block nested inside
  // one is matched by its OWN selector — otherwise a second fill parked under `@media (min-width: 0)`
  // would be counted as the at-rule's block and the guard would read green (LEARNINGS #60).
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|supports|layer|container)[^{]*\{/g, "");
  /** Every rule block whose selector list names `sel` exactly (as a whole comma-separated entry). */
  const blocksNaming = (sel: string) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) =>
      m[1]!
        .split(",")
        .map((s) => s.trim())
        .includes(sel),
    );

  it("declares a fill for each of them in exactly one block, and it is the same block", () => {
    const fills = PRESSED.map((sel) => blocksNaming(sel).filter((m) => /background:/.test(m[2]!)));
    for (const [i, f] of fills.entries())
      expect(f, `${PRESSED[i]} declares its fill exactly once`).toHaveLength(1);
    const bodies = new Set(fills.map((f) => f[0]![2]!.trim()));
    // MUTATION: give the switch back its own `background: var(--ac)` block — two blocks, red.
    expect(bodies.size, "every pressed selector resolves to one declaration").toBe(1);
    expect([...bodies][0]).toMatch(/background:\s*var\(--ac\)/);
    expect([...bodies][0]).toMatch(/--glow-gold/);
  });
});

describe("Phase 2b — lateness is `kdsUrgency`, read by the ticket's OWN channel", () => {
  it("dine-in 8/12 and pickup 2/4: a five-minute dine-in ticket is calm, a five-minute pickup is red, Late reads 1", () => {
    // Asymmetric thresholds, or the wiring could pass a constant channel and read the same. MUTATION
    // (red-first, by hand): `kdsUrgency("dinein", …)` at either call site — the pickup card loses its
    // red strip and Late reads 0.
    const fiveAgo = new Date(Date.parse(NOW) - 5 * 60_000).toISOString();
    const q = queue(fiveAgo);
    q.thresholds = { ...q.thresholds, pickupAmberMin: 2, pickupRedMin: 4 };
    q.tickets.push({
      ...q.tickets[0]!,
      cartId: "cart-p",
      sessionId: "sess-p",
      channel: "pickup",
      label: "#A1",
      tableNumber: null,
      customerName: "Aye",
      shortCode: "A1",
      lines: [{ ...q.tickets[0]!.lines[0]!, id: "line-p" }],
    });
    const { container } = mount("en", q);
    const strips = [...container.querySelectorAll(".kds-ticket > header")];
    expect(strips).toHaveLength(2);
    expect(strips[0]!.className).toBe("kds-strip");
    expect(strips[1]!.className).toContain("kds-strip-red");
    expect(container.querySelector(".kds-stat-late b")?.textContent).toBe("1");
  });
});

/** Nine tickets on an eight-slot page — the pager exists; the last one is HELD when asked. */
const nineTickets = (heldLast = false): KitchenQueue => {
  const nine = queue();
  nine.tickets = Array.from({ length: 9 }, (_, i) => ({
    ...nine.tickets[0]!,
    cartId: `cart-${i}`,
    sessionId: `sess-${i}`,
    tableNumber: i + 1,
    label: `T${i + 1}`,
    held: heldLast && i === 8,
    pickupSlot: heldLast && i === 8 ? NOW : null,
    lines: [{ ...nine.tickets[0]!.lines[0]!, id: `line-${i}` }],
  }));
  return nine;
};

describe("kitchen-4 — the rush signal is in the head, never under a grid that outgrew the screen", () => {
  it("with nine tickets on an eight-slot page, `+1 more` and the pager sit in `.kds-head`", () => {
    const { container } = mount("en", nineTickets());
    // MUTATION: render the pager in the footer again — `.kds-head .kds-more` is null, red.
    expect(container.querySelector(".kds-head .kds-more")?.textContent).toBe(
      tf("en", "kds.more", { n: 1 }),
    );
    expect(container.querySelector(".kds-head .kds-pager")).not.toBeNull();
    expect(container.querySelector("footer .kds-pager")).toBeNull();
  });
});

describe("kitchen-3 — a refused action speaks the device language through the ONE region", () => {
  it("a stale bump under my is the dictionary's sentence, marked, with no English in the region", async () => {
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "That ticket was already updated.", code: "stale" }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() =>
      expect(region.textContent).toBe(
        tf("my", "kds.err.stale", { x: tf("my", "kds.table", { id: 4 }) }),
      ),
    );
    // MUTATION: `onRefused(res, …)` → `onError(res.error)` — the English sentence lands, red.
    expect(region.textContent).not.toContain("already updated");
    // The mark rides the sentence, not the region: a server sentence with no twin must not be
    // announced as Burmese.
    expect(region.getAttribute("lang")).toBeNull();
    expect(region.querySelector('[lang="my"]')).not.toBeNull();
  });
});

describe("kitchen-3 — the string branch: a twin-less sentence is shown unmarked, a twin marked", () => {
  it("a role-floor refusal under my is the English sentence with no Burmese mark anywhere over it", async () => {
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "That needs a manager — ask one to step in.",
        code: "sentence",
      }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() =>
      expect(region.textContent).toBe("That needs a manager — ask one to step in."),
    );
    // MUTATION: `lang={lang}` back on the region — the sentence is announced as Burmese, red.
    expect(region.querySelector("[lang]")).toBeNull();
    expect(region.closest("[lang]")).toBeNull();
  });

  it("the write-outage sentence under my arrives as its Burmese twin, marked", async () => {
    const { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } = await import("@/lib/staff-outage");
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: STAFF_WRITE_OUTAGE, code: "sentence" }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() => expect(region.textContent).toBe(STAFF_WRITE_OUTAGE_MY));
    expect(region.querySelector('[lang="my"]')?.textContent).toBe(STAFF_WRITE_OUTAGE_MY);
  });
});

describe("K22 — the 86's only undo survives the tap beside it, and the bar's busy state is its own", () => {
  it("a bump inside the 86's window leaves the dish in the bar; the bump rides the recall rail", async () => {
    holdClock();
    const q = mount();
    const { getByRole, container } = q;
    await tapEightySix(q);
    await waitFor(() =>
      expect(container.querySelector(".kds-undo")?.textContent).toContain("Mohinga"),
    );
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(bumpTicket).toHaveBeenCalledTimes(1));
    // MUTATION: `setUndo({ kind: "bump", … })` unconditionally — the bar now reads "T4 bumped" and
    // the dish's only way back is gone, red.
    await waitFor(() => expect(container.querySelector(".kds-recall-btn")).not.toBeNull());
    expect(container.querySelector(".kds-undo")?.textContent).toContain(
      tf("en", "kds.undo.86", { x: "Mohinga" }),
    );
    clock += SAME_GESTURE_MS;
    fireEvent.click(getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: false,
      expectedSoldOut: true,
    });
  });

  it("a rail recall in flight does not dim the 86's undo, and the undo still acts", async () => {
    holdClock();
    const q = mount();
    const { getByRole, container } = q;
    // A bump first (a rail entry), then an 86 (the bar).
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(container.querySelector(".kds-recall-btn")).not.toBeNull());
    await tapEightySix(q);
    await waitFor(() =>
      expect(container.querySelector(".kds-undo")?.textContent).toContain("Mohinga"),
    );
    const d = deferred<KitchenActionResult>();
    recallTicket.mockImplementationOnce(() => d.promise);
    fireEvent.click(container.querySelector(".kds-recall-btn")!);
    const rail = container.querySelector(".kds-recall-btn")!;
    await waitFor(() => expect(rail.getAttribute("aria-disabled")).toBe("true"));
    const undoBtn = getByRole("button", { name: /^Undo/ });
    // MUTATION: `aria-disabled={recallPending || undo86Pending}` — the bar says busy here, red.
    expect(undoBtn.getAttribute("aria-disabled")).toBeNull();
    clock += SAME_GESTURE_MS;
    fireEvent.click(undoBtn);
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    await act(async () => {
      d.resolve({ ok: true });
    });
  });
});

describe("kitchen-10 — a refusal outlives the poll that follows it", () => {
  it("survives the 5-second snapshot and clears once the dwell has passed", async () => {
    vi.useFakeTimers();
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "Couldn’t bump that ticket. Try again.",
        code: "failed",
      }),
    );
    const { getByRole, container } = mount();
    const region = container.querySelector('[role="status"]')!;
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const refusal = tf("en", "kds.err.bump", { x: tf("en", "kds.table", { id: 4 }) });
    expect(region.textContent).toBe(refusal);
    // The poll lands at 5 s with a good snapshot. MUTATION: clear the banner on every snapshot
    // (drop `actionErrorStale`) — the refusal is gone here, red.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(region.textContent).toBe(refusal);
    // The next poll, at 10 s, is past the 8 s dwell: the region goes back to the count.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(region.textContent).toBe(tf("en", "kds.open.one", { n: 1 }));
  });
});

describe("kitchen-8 — a device that wanted sound says so, and the first tap re-arms it", () => {
  it("wears the warn chip after a reload and arms off a bump, silently", async () => {
    soundWanted = true;
    armOk = true;
    const { getByRole, container } = mount();
    // The preference hydrates through a two-step microtask chain after mount (KdsBoard's persisted-
    // controls effect). Flush THAT, deterministically — a `waitFor` here raced its 1s wall-clock
    // budget against a cold jsdom render and went red under CPU load (1 in 3 runs, 2026-09-23).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const chip = container.querySelector('.kds-chip[data-muted="true"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe(ts("en", "kds.sound.off"));
    // Any tap on the board is the gesture — here the bump. MUTATION: drop the capture listener —
    // the chip stays and the slider never appears, red.
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(container.querySelector('.kds-chip[data-muted="true"]')).toBeNull();
    // The gesture that armed the chime was a BUMP, and it still lands — the capture listener must
    // never swallow the shift's first tap.
    expect(bumpTicket).toHaveBeenCalledTimes(1);
  });

  it("Phase 2b — sound truth: armed for the FIRST time here, then suspended, wears the warn chip and re-arms off the next tap, silently", async () => {
    // MUTATIONS (by hand): enableSound leaves `soundWanted` false — the suspended board reads
    // "Enable sound" and never re-arms, red; `soundOn` set-once (no subscription) — the slider
    // survives the suspension, red.
    armOk = true;
    const { getByRole, container } = mount();
    // Let the persisted-controls hydration (a two-step microtask chain, "no stored flag") land
    // first, as it does long before a person can tap.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(getByRole("button", { name: ts("en", "kds.sound.enable") }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(played).toHaveBeenCalledTimes(1); // the arm's own confirmation tone
    // The tablet sleeps: the context is suspended out from under the armed engine.
    act(() => {
      ctxRunning = false;
      notifyChime();
    });
    expect(container.querySelector(".kds-vol")).toBeNull();
    const chip = container.querySelector('.kds-chip[data-muted="true"]');
    expect(chip?.textContent).toBe(ts("en", "kds.sound.off"));
    // The next tap anywhere on the board re-arms, with no tone, and the slider comes back.
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(played).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.kds-chip[data-muted="true"]')).toBeNull();
  });

  it("a fresh device shows the plain chip, and an explicit arm is what sets the preference", async () => {
    armOk = true;
    const { getByRole, container } = mount();
    expect(container.querySelector('.kds-chip[data-muted="true"]')).toBeNull();
    fireEvent.click(getByRole("button", { name: ts("en", "kds.sound.enable") }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(setKdsSoundWanted).toHaveBeenCalledWith(true);
  });
});

describe("P2n + §17 — every list is named, and a busy control keeps its name", () => {
  it("the ticket's line list and both rail lists carry an accessible name", () => {
    currentQueue = queue();
    currentQueue.served = {
      lines: [
        {
          id: "s-1",
          name: "Mohinga",
          nameMy: null,
          qty: 1,
          modifiers: [],
          modifiersMy: [],
          bumpedAt: NOW,
          bumpedAtLabel: "11:02",
          voided: false,
          channel: "dinein",
          label: "T4",
          tableNumber: 4,
          shortCode: null,
          fulfillment: "dinein",
        },
      ],
      truncated: false,
      total: 1,
    };
    const { container, getByRole } = mount("en", currentQueue);
    fireEvent.click(getByRole("button", { name: ts("en", "kds.allday.chip") }));
    const named = (ul: Element) =>
      ul.getAttribute("aria-label") ||
      (ul.getAttribute("aria-labelledby") &&
        document.getElementById(ul.getAttribute("aria-labelledby")!)?.textContent);
    // MUTATION: drop `aria-label` from `.kds-lines` — an unnamed list, red.
    expect(container.querySelector(".kds-lines")?.getAttribute("aria-label")).toBe(
      tf("en", "kds.a11y.lines", { x: tf("en", "kds.table", { id: 4 }) }),
    );
    for (const ul of container.querySelectorAll('[role="list"]'))
      expect(named(ul), ul.className || "rail list").toBeTruthy();
    fireEvent.click(getByRole("button", { name: ts("en", "kds.served.chip") }));
    for (const ul of container.querySelectorAll('[role="list"]'))
      expect(named(ul), ul.className || "rail list").toBeTruthy();
  });

  it("a bump in flight keeps its label and its name — busy is the attribute, never an ellipsis", async () => {
    const d = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => d.promise);
    const { getByRole } = mount();
    const btn = getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    // MUTATION: `{pending ? "…" : <Chrome …/>}` — the label collapses to an ellipsis, red.
    expect(btn.textContent).toContain(ts("en", "kds.bump"));
    expect(btn.textContent).not.toContain("…");
    await act(async () => {
      d.resolve({ ok: true });
    });
  });
});

describe("Phase 2b — the stylesheet: the 86 band is gone, the ⋯ sheet is a tier host", () => {
  // Comments stripped and at-rule preludes removed, as in the §2 guard above (LEARNINGS #60).
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|supports|layer|container)[^{]*\{/g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1]!
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    body: m[2]!,
  }));

  it("no rule declares .kds-line-86 or .kds-line-86-done any more", () => {
    // MUTATION (by hand): leave the old 86 block in — red.
    for (const r of rules)
      for (const sel of r.selectors)
        expect(sel, sel).not.toMatch(/\.kds-line-86(?![\w-])|\.kds-line-86-done/);
  });

  it("the undo pill clears the home indicator (xcut-10): its bottom adds the safe-area inset", () => {
    // MUTATION (by hand): `bottom: 18px` back — on a notched tablet the pill sits on the indicator.
    const pill = rules.filter((r) => r.selectors.includes(".kds-undo"));
    const bottoms = pill.flatMap((r) => [...r.body.matchAll(/(?:^|;)\s*bottom:\s*([^;]+)/g)]);
    expect(bottoms).toHaveLength(1);
    expect(bottoms[0]![1]!.trim()).toBe("calc(var(--s4) + env(safe-area-inset-bottom, 0px))");
  });

  it("the held line's fade is still declared verbatim (composite-contrast parses it)", () => {
    const held = rules.filter((r) => r.selectors.includes('.kds-line[aria-disabled="true"]'));
    expect(held).toHaveLength(1);
    expect(held[0]!.body).toMatch(/opacity:\s*var\(--kds-line-off-op\)/);
  });

  it("`.kds-menu-body` hosts the --kfs-* tier at the base and at both dial stops, `.kds-root` last", () => {
    // MUTATION (by hand): omit `.kds-menu-body` from the m stop — red.
    const tier = rules.filter((r) => /--kfs-clock:/.test(r.body));
    expect(tier).toHaveLength(3);
    for (const want of [
      ".kds-menu-body",
      '.kds-menu-body[data-size="m"]',
      '.kds-menu-body[data-size="l"]',
    ])
      expect(
        tier.some((r) => r.selectors.includes(want)),
        want,
      ).toBe(true);
    for (const r of tier) expect(r.selectors.at(-1), r.selectors.join()).toMatch(/^\.kds-root/);
  });
});

describe("Phase 2b (commit 2) — the glanceability pass: quiet singles, a started edge, a scaling ✓", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|supports|layer|container)[^{]*\{/g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: m[1]!
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    body: m[2]!,
  }));

  it("exactly one .kds-qty rule declares the --ac fill, and it is the multiple's", () => {
    // MUTATION (by hand): leave the rest chip lit — two rules declare the fill, red.
    const lit = rules.filter(
      (r) =>
        r.selectors.some((x) => x.startsWith(".kds-qty")) &&
        /background:\s*var\(--ac\)/.test(r.body),
    );
    expect(lit).toHaveLength(1);
    expect(lit[0]!.selectors).toEqual(['.kds-qty[data-many="true"]']);
  });

  it("a started item declares the inset left edge", () => {
    const started = rules.filter((r) =>
      r.selectors.includes('.kds-item[data-state="in_progress"]'),
    );
    expect(started).toHaveLength(1);
    expect(started[0]!.body).toMatch(/box-shadow:\s*inset 4px 0 0 var\(--ac\)/);
  });

  it("the row marks a multiple, never a single", () => {
    const q = queue();
    q.tickets[0]!.lines.push({ ...q.tickets[0]!.lines[0]!, id: "line-2", qty: 3 });
    const { container } = mount("en", q);
    const chips = container.querySelectorAll(".kds-qty");
    expect(chips[0]!.getAttribute("data-many")).toBeNull();
    expect(chips[1]!.getAttribute("data-many")).toBe("true");
  });
});

/**
 * Phase 2e review (P1) — the Language note's claim, pinned beside the render that makes it TRUE.
 *
 * `shell.lang.note` sits under the three language rows (the Profile card, the Help sheet's Language
 * view) and says what the setting does NOT change. Its first draft read "Dish names and kitchen
 * tickets never change with this", which was false: the order pad's tiles lead with the device's
 * tongue (`padDishName`), and so do the mod sheet's title and options, the KDS refusal lines
 * (`dishVisible`) and the line editor. What IS mode-free is the dish text ON the kitchen ticket —
 * `TicketLineText`, the catalog Burmese over the English snapshot whatever the device — so that is
 * all the note may claim. The claim is pinned verbatim here: edit the note and this suite makes you
 * re-prove it; make the ticket follow the mode and the render below goes red.
 */
describe("the Language note's claim — dish names on kitchen tickets never change with the mode", () => {
  const CLAIM = "Dish names on kitchen tickets never change with this.";
  const MOHINGA_MY = "မုန့်ဟင်းခါး"; // DB rows (supabase/seed.sql), never authored Burmese
  const MILD_MY = "အစပ်လျှော့";

  it("the note makes exactly this claim — nothing wider", () => {
    expect(STAFF["shell.lang.note"].en.startsWith(`${CLAIM} `)).toBe(true);
  });

  it("…because a wider one is false: the order pad's dish name DOES follow the mode", () => {
    // A REASON guard: the day the pad stops following the mode, this fails and someone re-reads the
    // note instead of inheriting a scope whose reason has expired.
    expect(padDishName("en", "Mohinga", MOHINGA_MY).lead).toEqual({ text: "Mohinga", lang: "en" });
    expect(padDishName("my", "Mohinga", MOHINGA_MY).lead).toEqual({ text: MOHINGA_MY, lang: "my" });
  });

  it("a ticket's dish name, its English and its options render IDENTICALLY under English, Both and Burmese only", () => {
    const q = queue();
    q.tickets[0]!.lines[0] = {
      ...q.tickets[0]!.lines[0]!,
      nameMy: MOHINGA_MY,
      modifiers: ["Mild"],
      modifiersMy: [MILD_MY],
    };
    const dishText = (lang: "en" | "my", echoes: boolean) => {
      const { container } = render(
        <StaffLangProvider lang={lang} echoes={echoes}>
          <KdsBoard initial={q} />
        </StaffLangProvider>,
      );
      const main = container.querySelector(".kds-line-main")!;
      const shot = [...main.querySelectorAll(".kds-line-name, .kds-line-en, .kds-line-mods")].map(
        (el) => el.outerHTML,
      );
      cleanup();
      return shot;
    };
    const english = dishText("en", true);
    // Not identical-because-empty: both tongues are there on the ENGLISH device too.
    expect(english).toEqual([
      `<p class="kds-line-name" lang="my">${MOHINGA_MY}</p>`,
      `<p class="kds-line-en">Mohinga</p>`,
      `<p class="kds-line-mods" lang="my">${MILD_MY}</p>`,
      `<p class="kds-line-mods">Mild</p>`,
    ]);
    expect(dishText("my", true)).toEqual(english); // Both
    expect(dishText("my", false)).toEqual(english); // Burmese only
  });
});

describe("Phase 2f — a counter order sent before it was paid", () => {
  // Plan §5.4: `KitchenTicket.unpaid` (Area B) — an open counter order's ticket past its grace.
  const counterTicket = (over: Partial<KitchenQueue["tickets"][number]>) => {
    const base = queue().tickets[0]!;
    return {
      ...base,
      cartId: "cart-reg",
      sessionId: "sess-reg",
      channel: "pickup" as const,
      label: "reg-7f3a9c",
      tableNumber: null,
      customerName: "Aye",
      shortCode: null,
      unpaid: true,
      ...over,
    } satisfies KitchenQueue["tickets"][number];
  };
  const withTicket = (t: KitchenQueue["tickets"][number]) => ({ ...queue(), tickets: [t] });
  const card = () => document.querySelector<HTMLElement>(".kds-ticket")!;

  it("says Unpaid under the header in both tongues — its list item's NAME carries it — never in warn", () => {
    mount("en", withTicket(counterTicket({})));
    const line = card().querySelector(".kds-unpaid")!;
    expect(line.textContent).toBe(STAFF["settle.unpaid"].en);
    expect(line.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // Kitchen-neutral: no warn class, no inline warn colour.
    expect(line.className).toBe("kds-unpaid");
    expect(card().getAttribute("aria-label")).toContain(STAFF["settle.unpaid"].en);
    cleanup();
    mount("my", withTicket(counterTicket({})));
    const my = card().querySelector(".kds-unpaid")!;
    expect(my.textContent).toContain(STAFF["settle.unpaid"].my);
    // K15-HIGH: a Burmese device keeps the English echo, and the name follows what is drawn.
    expect(my.textContent).toContain(STAFF["settle.unpaid"].en);
    expect(card().getAttribute("aria-label")).toContain(STAFF["settle.unpaid"].my);
  });

  it("never prints the raw reg- token: the name leads, and a nameless one reads 'Walk-up'", () => {
    mount("en", withTicket(counterTicket({})));
    expect(document.querySelector(".kds-grid")!.textContent).not.toContain("reg-");
    expect(card().getAttribute("aria-label")).not.toContain("reg-");
    cleanup();
    mount("en", withTicket(counterTicket({ customerName: null })));
    expect(card().querySelector(".kds-id")!.textContent).toBe(STAFF["reg.row.walkup"].en);
    expect(document.querySelector(".kds-grid")!.textContent).not.toContain("reg-");
  });

  it("a PAID counter ticket shows its #CODE and no Unpaid line", () => {
    mount("en", withTicket(counterTicket({ unpaid: false, shortCode: "A1B2C3" })));
    expect(card().querySelector(".kds-id")!.textContent).toContain("#A1B2C3");
    expect(card().querySelector(".kds-unpaid")).toBeNull();
    expect(card().getAttribute("aria-label")).not.toContain(STAFF["settle.unpaid"].en);
  });

  it("the stylesheet: `.kds-unpaid` shares `.kds-slot`'s block (one box, one type)", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) =>
      m[1]!
        .split(",")
        .map((x) => x.trim())
        .includes(".kds-slot"),
    );
    expect(blocks).toHaveLength(1);
    expect(
      blocks[0]![1]!
        .split(",")
        .map((x) => x.trim())
        .includes(".kds-unpaid"),
    ).toBe(true);
  });
});

// ── Phase 2h — a hung tablet never traps the kitchen (P2cz · P2fc) ────────────────────────────────
const { STAFF_HANG_MS, youngWrite } = await import("@/lib/bounded-write");

describe("Phase 2i — the board's poll is a READ on the ledger", () => {
  it("a poll in flight never reads as a young write — a reload for a new build is not refused for it", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockReset();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getKitchenQueue).toHaveBeenCalledTimes(1);
    // MUTATION (p2i-kind/kds-poll): the race labels the poll a write — the kitchen board never
    // finds a moment to take a new version; red.
    expect(youngWrite()).toBe(false);
  });
});

describe("Phase 2h (9f) — the board's poll never stacks a read behind a hung one", () => {
  const flush = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const region = () => document.querySelector('.kds-head [role="status"]')!;

  it("a read hung for 60 s is ONE dispatch; the second miss arms the banner; the answer kicks exactly one owed read", async () => {
    vi.useFakeTimers();
    const hung = deferred<{ ok: true; queue: KitchenQueue }>();
    getKitchenQueue.mockReset();
    getKitchenQueue
      .mockReturnValueOnce(hung.promise)
      .mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
    mount();
    await flush(5_000);
    expect(getKitchenQueue).toHaveBeenCalledTimes(1);
    // Under the bound a skipped tick is a slow read, not a miss: the board keeps its live voice.
    await flush(14_998);
    expect(region().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    // At the bound: the race's give-up and the tick refused past it are TWO misses — the banner.
    // MUTATION (p2h-boards/kds/refused-tick-never-a-miss): only the race's one miss counts; red.
    await flush(5_001);
    expect(region().textContent).toContain(ts("en", "out.head.notUpdating"));
    // MUTATION (p2h-boards/kds/poll-stacks · kds/gate-watches-nothing): a fresh read queued behind
    // the hung one every tick past the race's give-up; red.
    await flush(38_000);
    expect(getKitchenQueue).toHaveBeenCalledTimes(1);
    // The raw answers: exactly ONE owed read runs at once, lands, and the banner clears.
    // MUTATION (p2h-boards/kds/owed-read-never-kicked): nothing reads until the next tick; red.
    await act(async () => {
      hung.resolve({ ok: true, queue: currentQueue });
    });
    await flush(0);
    expect(getKitchenQueue).toHaveBeenCalledTimes(2);
    expect(region().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    await flush(1_000);
    expect(getKitchenQueue).toHaveBeenCalledTimes(2);
  });
});

describe("Phase 2h (9b · 9e) — a kitchen write that hangs frees its control at the bound and says so", () => {
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const region = () => document.querySelector('.kds-head [role="status"]')!;
  const reload = () => screen.queryByRole("button", { name: ts("en", "out.reload") });
  const waiting = (x: string) => tf("en", "kds.err.waiting", { x });
  const unknown = (x: string) => tf("en", "kds.err.unknown", { x });
  const T4 = tf("en", "kds.table", { id: 4 });

  it("the bump: busy frees AT the bound with the waiting line and its Reload; the late ok lands", async () => {
    vi.useFakeTimers();
    // The polls never answer here — this case is about the write.
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount();
    const bump = q.container.querySelector<HTMLButtonElement>(".kds-bump")!;
    await act(async () => {
      fireEvent.click(bump);
    });
    expect(bump.getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(bump.getAttribute("aria-busy")).toBe("true");
    // AT the bound (fact 3): the control frees, whatever the action is doing, and the ONE region says
    // there is no answer yet — never "couldn't". MUTATION (p2h-boards/kds/bump-transition — the old
    // startTransition): pending holds until the action answers; red.
    await flush(1);
    expect(bump.getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(waiting(T4));
    // The sentence says "reload the board": its button stands beside the region, outside it.
    // MUTATION (p2h-boards/kds/waiting-offers-no-reload): no button; red.
    expect(reload()).not.toBeNull();
    expect(region().contains(reload())).toBe(false);
    // Critic B1 — the ticket is HELD while its write is out: the control is no longer busy, but it
    // says it refuses (`aria-disabled`), and a second tap re-says the waiting line and sends NOTHING
    // (a second bump queued behind the hung one would answer "already updated" over a landed bump).
    // MUTATION (p2h-boards/kds/held-not-said): the button reads live; red. MUTATION
    // (p2h-boards/kds/held-subject-resent · kds/hold-never-taken): the re-tap dispatches; red.
    expect(bump.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(bump);
    });
    await flush();
    expect(bumpTicket).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(waiting(T4));
    expect(reload()).not.toBeNull();
    // The LATE answer lands (9e): the bump rides the recall rail, the notice speaks, the waiting line
    // and its Reload go. MUTATION (p2h-boards/kds/late-answer-dropped): the late ok is thrown away —
    // the rail never gets the bump; red. MUTATION (p2h-boards/kds/late-waiting-never-retired): the
    // waiting line outranks the notice for good; red.
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    expect(q.container.querySelector(".kds-recall")).not.toBeNull();
    expect(region().textContent).toBe(tf("en", "kds.live.bumped", { x: T4 }));
    expect(reload()).toBeNull();
    // …and the ticket is released by its own answer. MUTATION (p2h-boards/kds/held-never-released):
    // the control stays refused after the write answered; red.
    expect(bump.getAttribute("aria-disabled")).toBeNull();
  });

  it("the bump: a late REFUSAL is said, replacing the waiting line", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount();
    await act(async () => {
      fireEvent.click(q.container.querySelector(".kds-bump")!);
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting(T4));
    await act(async () => {
      write.resolve({ ok: false, error: "stale", code: "stale" });
    });
    await flush();
    expect(region().textContent).toBe(tf("en", "kds.err.stale", { x: T4 }));
    expect(q.container.querySelector(".kds-recall")).toBeNull();
  });

  it("a late answer retires ITS OWN waiting line — never a newer refusal standing over it", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount("en", two);
    const bumps = () => q.container.querySelectorAll<HTMLButtonElement>(".kds-bump");
    await act(async () => {
      fireEvent.click(bumps()[0]!);
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting(T4));
    // A newer tap, refused: the region says THAT now.
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "stale", code: "stale" }),
    );
    await act(async () => {
      fireEvent.click(bumps()[1]!);
    });
    await flush();
    const T5 = tf("en", "kds.table", { id: 5 });
    expect(region().textContent).toBe(tf("en", "kds.err.stale", { x: T5 }));
    // Table 4's late ok lands (its bump rides the rail) — and the newer refusal STANDS.
    // MUTATION (p2h-boards/kds/drop-retires-a-newer-line): the late answer clears whatever stands; red.
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    expect(q.container.querySelector(".kds-recall")).not.toBeNull();
    expect(region().textContent).toBe(tf("en", "kds.err.stale", { x: T5 }));
  });

  it("the bump: a THROWN write says 'couldn't confirm' — never 'Couldn't … — try again'", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    bumpTicket.mockImplementationOnce(() => Promise.reject(new Error("Failed to fetch")));
    const q = mount();
    await act(async () => {
      fireEvent.click(q.container.querySelector(".kds-bump")!);
    });
    await flush();
    // MUTATION (p2h-boards/kds/threw-says-failed): the old "Couldn't mark … all done — try again";
    // red. A lost answer may have landed — the bump may be on the server.
    expect(region().textContent).toBe(unknown(T4));
    expect(region().textContent).not.toBe(tf("en", "kds.err.bump", { x: T4 }));
    expect(reload()).toBeNull(); // only a waiting line promises a reload
  });

  it("an unrelated transition hung on the tab does not hold the bump past the bound (the entanglement proxy)", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    // Something else on the tab is mid-transition and never answers (fact 2: every async
    // transition's pending is entangled with it).
    const { startTransition } = await import("react");
    const never = deferred<void>();
    act(() => {
      startTransition(async () => {
        await never.promise;
      });
    });
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount();
    const bump = q.container.querySelector<HTMLButtonElement>(".kds-bump")!;
    await act(async () => {
      fireEvent.click(bump);
    });
    await flush(STAFF_HANG_MS);
    expect(bump.getAttribute("aria-busy")).toBeNull();
    await act(async () => {
      write.resolve({ ok: true });
      never.resolve();
    });
  });

  it("a line tap: frees at the bound with the dish's waiting line; the late ok refetches", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const write = deferred<KitchenActionResult>();
    bumpLine.mockImplementationOnce(() => write.promise);
    mount();
    const lineBtn = document.getElementById("kds-line-line-1")!;
    await act(async () => {
      fireEvent.click(lineBtn);
    });
    expect(lineBtn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-boards/kds/line-transition): the old transition holds pending until it answers; red.
    await flush(STAFF_HANG_MS);
    expect(lineBtn.getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(waiting("Mohinga"));
    // Critic B1 — the LINE is held: a second tap re-says the line and sends nothing.
    expect(lineBtn.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(lineBtn);
    });
    await flush();
    expect(bumpLine).toHaveBeenCalledTimes(1);
    getKitchenQueue.mockClear();
    getKitchenQueue.mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    // The late ok asks for a fresh snapshot (here owed to the gate behind the hung poll, which is
    // what a real tablet's queue would hold it behind) — and the waiting line goes.
    expect(region().textContent).not.toBe(waiting("Mohinga"));
  });

  it("Cook now on a held ticket: frees at the bound with the ticket's waiting line", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const held = queue();
    held.tickets[0] = { ...held.tickets[0]!, held: true, pickupSlot: NOW };
    const write = deferred<KitchenActionResult>();
    fireTicketNow.mockImplementationOnce(() => write.promise);
    const q = mount("en", held);
    const fire = q.container.querySelector<HTMLButtonElement>(".kds-bump-fire")!;
    await act(async () => {
      fireEvent.click(fire);
    });
    expect(fire.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-boards/kds/fire-transition): the old transition holds pending; red.
    await flush(STAFF_HANG_MS);
    expect(fire.getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(waiting(T4));
    // Critic B1 — the ticket is held: Cook now says so and a second tap sends nothing.
    // MUTATION (p2h-boards/kds/fire-held-not-said · kds/fire-held-resent); red.
    expect(fire.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(fire);
    });
    await flush();
    expect(fireTicketNow).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(waiting(T4));
    await act(async () => {
      write.resolve({ ok: true });
    });
  });

  it("a recall from the rail: frees at the bound, says waiting; the late ok takes the entry off the rail", async () => {
    vi.useFakeTimers();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    // The polls keep answering — with an EMPTY queue, as they would once both are bumped.
    currentQueue = { ...two, tickets: [] };
    const q = mount("en", two);
    // Both tickets bumped: the rail holds two entries.
    await act(async () => {
      for (const b of [...q.container.querySelectorAll<HTMLButtonElement>(".kds-bump")])
        fireEvent.click(b);
    });
    await flush();
    const T5 = tf("en", "kds.table", { id: 5 });
    const rail = (x: string) =>
      q.queryByRole("button", { name: al("en", { kind: "recall", label: x }).aria });
    expect(rail(T4)).not.toBeNull();
    expect(rail(T5)).not.toBeNull();
    const write = deferred<KitchenActionResult>();
    recallTicket.mockImplementationOnce(() => write.promise);
    await act(async () => {
      fireEvent.click(rail(T4)!);
    });
    expect(rail(T5)!.getAttribute("aria-disabled")).toBe("true"); // one recall at a time
    // AT the bound the rail frees: Table 5's entry acts again. MUTATION
    // (p2h-boards/kds/recall-transition): the old transition holds every entry dim until the hung
    // recall answers; red.
    await flush(STAFF_HANG_MS);
    expect(rail(T5)!.getAttribute("aria-disabled")).toBeNull();
    expect(region().textContent).toBe(waiting(T4));
    // Critic B1 — Table 4's own entry is HELD: a second recall of it only re-says the line (one
    // queued behind the hung one would answer "too late to bring back" over a recall that landed).
    expect(rail(T4)!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(rail(T4)!);
    });
    await flush();
    expect(recallTicket).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(waiting(T4));
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    expect(rail(T4)).toBeNull();
    expect(region().textContent).toBe(tf("en", "kds.live.restored", { x: T4 }));
  });

  it("the 86's undo: its busy frees at the bound (the NEXT dish's Undo acts), and it says waiting about the dish; a thrown late answer says couldn't confirm", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    const q = mount("en", two);
    const sell = async (dish: string) => {
      fireEvent.click(q.getByRole("button", { name: moreFor(dish) }));
      clock += SAME_GESTURE_MS;
      await flush();
      fireEvent.click(within(q.getByRole("dialog")).getByRole("button", { name: eightySixName }));
      await flush();
      clock += SAME_GESTURE_MS;
    };
    const undoBtn = () => q.container.querySelector<HTMLButtonElement>(".kds-undo button");
    await sell("Mohinga");
    const write = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => write.promise);
    await act(async () => {
      fireEvent.click(undoBtn()!);
    });
    expect(undoBtn()!.getAttribute("aria-disabled")).toBe("true");
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting("Mohinga"));
    // The bar left at its own six seconds; the NEXT dish's Undo must act. MUTATION
    // (p2h-boards/kds/undo86-transition): the old transition's pending held every later undo dim
    // and refused until the hung write answered; red.
    await sell("Laphet");
    expect(undoBtn()!.getAttribute("aria-disabled")).toBeNull();
    // A thrown late answer for Mohinga: "couldn't confirm" — never "Couldn't put it back".
    await act(async () => {
      write.reject(new Error("Failed to fetch"));
    });
    await flush();
    expect(region().textContent).toBe(unknown("Mohinga"));
  });

  it("the sheet's 86: frees at the bound; the waiting line is said in the sheet AND kept on the board", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    const write = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => write.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    clock += SAME_GESTURE_MS;
    await flush();
    const dialog = q.getByRole("dialog");
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-boards/kds/sheet86-unbounded): the sheet's 86 awaits the raw — busy until it
    // answers; red.
    await flush(STAFF_HANG_MS);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe(waiting("Mohinga"));
    // MUTATION (p2h-boards/kds/sheet86-waiting-board-unsaid): only the sheet says it — the board's
    // region (and the Reload beside it) is empty once the sheet is put away; red.
    expect(region().textContent).toBe(waiting("Mohinga"));
    // The late ok LANDS: the dish goes sold out on the board, the sheet unmounts, the bar offers Undo.
    await act(async () => {
      write.resolve({ ok: true, soldOut: true });
    });
    await flush();
    expect(q.queryByRole("dialog")).toBeNull();
    expect(q.container.querySelector(".kds-undo")).not.toBeNull();
    expect(region().textContent).not.toBe(waiting("Mohinga"));
  });
  it("the sheet's 86 with no answer yet: the SHEET offers the Reload beside its own region, until the late answer retires the line (integration b · K2)", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    const write = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => write.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    clock += SAME_GESTURE_MS;
    await flush();
    const dialog = q.getByRole("dialog");
    const sheetReload = () =>
      within(dialog).queryByRole("button", { name: ts("en", "out.reload") });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: eightySixName }));
    });
    // In flight under the bound: nothing to reload for yet.
    expect(sheetReload()).toBeNull();
    await flush(STAFF_HANG_MS);
    const msg = dialog.querySelector('[role="status"]')!;
    expect(msg.textContent).toBe(waiting("Mohinga"));
    // The sheet says "reload the board to see" and the board behind it is aria-hidden: the reload it
    // promises stands IN the sheet, beside its one region — never inside it (a control in a live
    // region). MUTATION (p2h-int-b/kds/sheet-reload-missing · sheet-reload-unflagged): the sheet
    // promises a reload the installed console has no button for; red.
    expect(sheetReload()).not.toBeNull();
    expect(msg.contains(sheetReload())).toBe(false);
    // The late answer is a refusal: the sheet says it, and the reload goes with the waiting line.
    // MUTATION (p2h-int-b/kds/sheet-reload-outlives-the-line): it stands under a refusal that asks
    // for no reload; red.
    await act(async () => {
      write.resolve({ ok: false, error: "That changed.", code: "stale" });
    });
    await flush();
    expect(msg.textContent).toBe(tf("en", "kds.err.stale", { x: "Mohinga" }));
    expect(sheetReload()).toBeNull();
  });
  it("a tap on ANOTHER ticket keeps a standing waiting line and its Reload (critic B12)", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const two = queue();
    two.tickets.push({
      ...two.tickets[0]!,
      cartId: "cart-2",
      sessionId: "sess-2",
      tableNumber: 5,
      label: "T5",
      lines: [{ ...two.tickets[0]!.lines[0]!, id: "line-2", menuItemId: "mi-2", name: "Laphet" }],
    });
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount("en", two);
    const bumps = () => q.container.querySelectorAll<HTMLButtonElement>(".kds-bump");
    await act(async () => {
      fireEvent.click(bumps()[0]!);
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting(T4));
    // Table 5 bumped (it lands at once): Table 4's write is STILL out, so its line — and the only
    // Reload on the board — stand. MUTATION (p2h-boards/kds/tap-clears-waiting): the tap clears
    // whatever the region holds; red.
    await act(async () => {
      fireEvent.click(bumps()[1]!);
    });
    await flush();
    expect(bumpTicket).toHaveBeenCalledTimes(2);
    expect(region().textContent).toBe(waiting(T4));
    expect(reload()).not.toBeNull();
    await act(async () => {
      write.resolve({ ok: true });
    });
  });

  it("a late answer on a board that is GONE starts no read (critic B4)", async () => {
    vi.useFakeTimers();
    // The polls answer at once — a late answer's re-read would be dispatched, not owed.
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount();
    await act(async () => {
      fireEvent.click(q.container.querySelector(".kds-bump")!);
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting(T4));
    // The cook leaves the board (the wall link) while the bump is out; then it answers.
    q.unmount();
    getKitchenQueue.mockClear();
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush(1_000);
    // MUTATION (p2h-boards/kds/dead-board-reads): the landed bump's re-read is sent from a board
    // that no longer exists — a read queued on the tab, and a sign-in verdict on it would send the
    // tablet away from the screen the cook moved on to; red.
    expect(getKitchenQueue).not.toHaveBeenCalled();
  });

  it("a read already out when the board goes, answering 'locked' after, sends nobody anywhere (review b · B1)", async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const read = deferred<{ ok: false; reason: "locked" }>();
    getKitchenQueue.mockImplementationOnce(
      () => read.promise as unknown as Promise<{ ok: true; queue: KitchenQueue }>,
    );
    const q = mount();
    await flush(5_000); // the poll goes out and waits (in Next's queue, behind e.g. a lock)
    expect(getKitchenQueue).toHaveBeenCalledTimes(1);
    // The cook has moved on (the lock screen, typing a PIN); then the old read answers.
    q.unmount();
    await act(async () => {
      read.resolve({ ok: false, reason: "locked" });
    });
    await flush(1_000);
    // MUTATION (p2h-rev-b/kds/read-answer-after-unmount-acts): the dead board's read hard-reloads the
    // screen the cook moved to, wiping the PIN being typed; red.
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a write's LATE 'go sign in' on a board that is gone sends nobody anywhere (review b · B1)", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const write = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => write.promise);
    const q = mount();
    await act(async () => {
      fireEvent.click(q.container.querySelector(".kds-bump")!);
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(waiting(T4));
    q.unmount();
    await act(async () => {
      write.resolve({ ok: false, error: "Sign in again.", code: "signin" });
    });
    await flush(1_000);
    // MUTATION (p2h-rev-b/kds/late-leave-after-unmount): the late refusal navigates from a board
    // that no longer exists; red.
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("the sheet's 86 still out: the dish is HELD — its sheet's 86 and its ⋯ refuse, nothing is sent twice (critic B1 · B5)", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    const write = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => write.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    clock += SAME_GESTURE_MS;
    await flush();
    const dialog = q.getByRole("dialog");
    const btn = within(dialog).getByRole("button", { name: eightySixName });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush(STAFF_HANG_MS);
    // The sheet's 86 is no longer busy — it REFUSES (the dish's write is out), and a tap sends nothing.
    // MUTATION (p2h-boards/kds/sheet86-hold-never-taken): the button acts again and a second 86
    // queues behind the hung one, to answer "someone else changed it" over a sold-out that landed; red.
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    // Put away and asked for again: the ⋯ refuses (no new sheet — so no new key for the late answer
    // to miss, B5) and the board says the line again.
    fireEvent.keyDown(dialog, { key: "Escape" });
    await flush();
    const more = q.getByRole("button", { name: moreFor() });
    expect(more.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(more);
    });
    await flush();
    expect(q.queryByRole("dialog")).toBeNull();
    expect(region().textContent).toBe(waiting("Mohinga"));
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    // The late ok lands: the dish is off the menu (no ⋯ any more) and the bar offers its Undo.
    await act(async () => {
      write.resolve({ ok: true, soldOut: true });
    });
    await flush();
    expect(q.queryByRole("button", { name: moreFor() })).toBeNull();
    expect(q.container.querySelector(".kds-undo")).not.toBeNull();
  });

  it("the sheet's 86: a THROWN write says 'couldn't confirm' in the sheet — never 'Couldn't mark … sold out — try again'", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    setItemSoldOut.mockImplementationOnce(() => Promise.reject(new Error("Failed to fetch")));
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    clock += SAME_GESTURE_MS;
    await flush();
    const dialog = q.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: eightySixName }));
    });
    await flush();
    // MUTATION (p2h-boards/kds/sheet86-threw-says-failed): the old "Couldn't mark … sold out — try
    // again" over an answer that was LOST (the dish may be off the menu already); red.
    expect(dialog.querySelector('[role="status"]')!.textContent).toBe(unknown("Mohinga"));
  });

  it("the sheet's 86: a LATE throw after the sheet was put away is said on the board", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    holdClock();
    const write = deferred<SoldOutRes>();
    setItemSoldOut.mockImplementationOnce(() => write.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: moreFor() }));
    clock += SAME_GESTURE_MS;
    await flush();
    const dialog = q.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: eightySixName }));
    });
    await flush(STAFF_HANG_MS);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await flush();
    expect(region().textContent).toBe(waiting("Mohinga"));
    await act(async () => {
      write.reject(new Error("Failed to fetch"));
    });
    await flush();
    // MUTATION (p2h-boards/kds/sheet86-late-threw-unsaid): the late throw only retires the waiting
    // line — the board says nothing about a sold-out it cannot confirm; red.
    expect(region().textContent).toBe(unknown("Mohinga"));
  });
});
