/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpoPoll, ExpoQueue, ExpoTicket, ExpoUnpaidBag } from "@/lib/expo-types";
import type { ExpoActionResult } from "@/lib/expo";
import type { TablePaneApi } from "./TablePaneContext";

/**
 * The lane's WIRING, pinned where it lives (the KDS suite's shape — T18). The rules are in `lib/`:
 * due-ness and the undo window in `expo-rules.ts`, the refusals in `expo-errors.ts`. What only a
 * render can show:
 *
 *   - counter-1: "Picked up" flips the card and WAITS — the write goes out when the window closes
 *     unless the counter undoes it, and never before;
 *   - §17: the bump is `aria-disabled` + `aria-busy` while in flight, never natively disabled, and
 *     keeps its label;
 *   - counter-6 / P2q: under `my` the card carries no English chrome — the tags, the pickup line,
 *     the destination chip and the visible call-out are the dictionary's;
 *   - P2p: a refusal reaches the ONE region as the dictionary's sentence about the bag, marked;
 *   - counter-7: the header wears the bag's due-ness as a tone, and nothing before its moment.
 */
const NOW = "2026-09-20T18:00:00.000Z";
const T0 = Date.parse(NOW);
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

const setTogoStatus = vi.fn((): Promise<ExpoActionResult> => Promise.resolve({ ok: true }));
const haptic = vi.fn();

const ticket = (over: Partial<ExpoTicket> = {}): ExpoTicket => ({
  orderId: "order-1",
  cartId: null,
  label: "T7",
  mode: "dinein",
  customerName: null,
  customerPhone: null,
  shortCode: "A1B2C3",
  status: "ready",
  kitchen: "done",
  pickupSlot: null,
  arrivedAt: null,
  tableNumber: 7,
  lines: [
    {
      id: "l-1",
      name: "Mohinga",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      fulfillment: "togo",
      notes: null,
    },
  ],
  createdAt: iso(-3),
  ...over,
});
const queue = (tickets: ExpoTicket[] = [ticket()]): ExpoQueue => ({
  tickets,
  unpaid: [],
  serverNow: NOW,
});
let currentQueue = queue();

const getExpoQueue = vi.fn(
  (): Promise<ExpoPoll> => Promise.resolve({ ok: true, queue: currentQueue }),
);
vi.mock("@/lib/expo", () => ({
  getExpoQueue: () => getExpoQueue(),
  setTogoStatus: (...a: unknown[]) => setTogoStatus(...(a as [])),
}));
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("./LiveConnection", () => ({
  useLiveBoardState: () => undefined,
  useReportLive: () => {},
}));
// Phase 2f — the unpaid bag's Take payment pushes the pane at split width (read at click time).
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const { StaffLangProvider } = await import("./StaffLangProvider");
const { ExpoBoard } = await import("./ExpoBoard");
const { TablePaneContext } = await import("./TablePaneContext");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");
const { COUNTER_UNCOLLECTED_HOURS } = await import("@/lib/counter-order");
const { SAME_GESTURE_MS: SAME_GESTURE, TOAST_LEAVE_MS: LEAVE } = await import("@mms/ui");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setTogoStatus.mockReset();
  setTogoStatus.mockImplementation(() => Promise.resolve({ ok: true }));
  getExpoQueue.mockReset();
  getExpoQueue.mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
  haptic.mockReset();
  currentQueue = queue();
});

const mount = (lang: "en" | "my" = "en", initial = currentQueue) =>
  render(
    <StaffLangProvider lang={lang}>
      <ExpoBoard initial={initial} />
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

const pickedUpName = (lang: "en" | "my") => new RegExp(`^${ts(lang, "expo.verb.pickedUp")}`);
/** The CARD's in-slot Undo. Phase 2b · feedback — scoped to the card's article: the thumb-zone
 *  pill's own "Undo" also matches /^Undo/, so an unscoped lookup finds two and throws. */
const cardUndo = (root: HTMLElement, orderIndex = 0) =>
  within(root.querySelectorAll("article")[orderIndex] as HTMLElement).getByRole("button", {
    name: /^Undo/,
  });

describe("counter-1 — Picked up waits on its window, and Undo is the way back", () => {
  it("flips the card at once, writes nothing for the window, then writes picked_up once", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    const card = container.querySelector("article")!;
    expect(card.getAttribute("data-picked")).toBe("true");
    expect(cardUndo(container)).toBeTruthy();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "expo.live.pickedTable", { id: 7 }),
    );
    expect(haptic).toHaveBeenCalledWith("commit");
    // MUTATION: write on the tap (`setTogoStatus` before the window) — called here, red.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(setTogoStatus).not.toHaveBeenCalled();
    // The write is issued at 6 s and held in flight by hand; the queue drops the bag only once the
    // refetch after it lands.
    const d = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => d.promise);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    expect(setTogoStatus).toHaveBeenLastCalledWith({ orderId: "order-1", to: "picked_up" });
    // MUTATION: drop the map entry BEFORE the write — the card flips back to a live "Picked up"
    // for the whole round trip, and a tap in that gap opens a second window; red here.
    expect(card.getAttribute("data-picked")).toBe("true");
    expect(cardUndo(container).getAttribute("aria-busy")).toBe("true");
    expect(() => getByRole("button", { name: pickedUpName("en") })).toThrow();
    currentQueue = queue([]);
    await act(async () => {
      d.resolve({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector("article")).toBeNull();
  });

  it("a double-tap's second tap does not undo — Undo arms 400 ms after the pick", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    // MUTATION: drop the arm guard — this second tap lands on Undo (same slot, same node), red.
    fireEvent.click(cardUndo(container));
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBe("true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.click(cardUndo(container));
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBeNull();
  });

  it("a standing refusal is replaced by the pick's own announcement", async () => {
    currentQueue = queue([ticket({ orderId: "a", tableNumber: 3, status: "preparing" }), ticket()]);
    setTogoStatus.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "Couldn’t update that bag. Try again.", code: "failed" }),
    );
    const { getByRole, container } = mount("en", currentQueue);
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.bagged")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() => expect(region.textContent).toBe(tf("en", "expo.err.bagTable", { id: 3 })));
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    // MUTATION: leave `err` standing in `onPicked` — the region keeps the old refusal, red.
    expect(region.textContent).toBe(tf("en", "expo.live.pickedTable", { id: 7 }));
  });

  it("the lane leaving with a window open sends the write — the counter already handed the bag over", async () => {
    vi.useFakeTimers();
    const { getByRole, unmount } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(setTogoStatus).not.toHaveBeenCalled();
    unmount();
    // MUTATION: drop the unmount flush — the pick the counter saw is never recorded, red.
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    expect(setTogoStatus).toHaveBeenLastCalledWith({ orderId: "order-1", to: "picked_up" });
  });

  it("an undo inside the window cancels the write for good", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    fireEvent.click(cardUndo(container));
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "expo.live.pickedUndoneTable", { id: 7 }),
    );
    // MUTATION: leave the window in the map on undo — the write still goes out at 6 s, red.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(setTogoStatus).not.toHaveBeenCalled();
    expect(getByRole("button", { name: pickedUpName("en") })).toBeTruthy();
  });

  it("a bag that leaves the queue under an open window takes its window with it", async () => {
    vi.useFakeTimers();
    const { getByRole } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    currentQueue = queue([]); // someone else's tap, a refund — the next poll no longer lists it
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000); // the poll runs at 5 s
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    // MUTATION: keep the window — a picked_up write to a gone order, and a "stale" banner, red.
    expect(setTogoStatus).not.toHaveBeenCalled();
  });
});

describe("§17 — the first-stage bump is aria-disabled and busy in flight, never natively disabled", () => {
  it("keeps focus and its label; a second tap is refused by the handler", async () => {
    currentQueue = queue([ticket({ status: "preparing" })]);
    const d = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => d.promise);
    const { getByRole, container } = mount("en", currentQueue);
    const btn = getByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.bagged")}`) });
    btn.focus();
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION: `disabled={pending}` — jsdom blurs it, focus falls to <body>, red.
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(btn);
    // MUTATION: `{pending ? "…" : label}` — the label collapses, red.
    expect(btn.textContent).toContain(ts("en", "expo.verb.bagged"));
    fireEvent.click(btn);
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
    await act(async () => {
      d.resolve({ ok: true });
    });
  });
});

describe("counter-6 / P2q — the card speaks the device language", () => {
  it("under my, the tags, the pickup line, the chip and the call-out are the dictionary's — on a ready bag, a ready grocery basket and a preparing bag", () => {
    // The stage VERBS keep their English echo by design (`echo="stack"`); this pins the card's
    // CHROME, so the forbidden list is the chrome's words — "Verified" is a tag here, and no
    // preparing grocery card is mounted (its verb's echo would legitimately read "Verified").
    currentQueue = queue([
      ticket({ arrivedAt: iso(-1), pickupSlot: iso(-2), tableNumber: 7 }),
      ticket({
        orderId: "order-2",
        tableNumber: null,
        customerName: "Aye Aye",
        lines: [{ ...ticket().lines[0]!, id: "l-2", fulfillment: "grocery" }],
      }),
      ticket({ orderId: "order-3", tableNumber: 2, status: "preparing", pickupSlot: iso(30) }),
    ]);
    const { container } = mount("my", currentQueue);
    const text = container.textContent ?? "";
    for (const en of ["Here now", "Ready", "Verified", "Pickup ", "To-go", "Grocery", "Table 7"])
      expect(text, en).not.toContain(en);
    expect(text).toContain(ts("my", "expo.tag.here"));
    expect(text).toContain(ts("my", "expo.tag.ready"));
    expect(text).toContain(ts("my", "expo.dest.togo"));
    expect(text).toContain(ts("my", "expo.dest.grocery"));
    // MUTATION: render `Table ${n}` in the header again — the English call-out is back, red.
    expect(text).toContain(tf("my", "floor.table", { id: "7" }));
    expect(text).toContain("Aye Aye");
  });
});

describe("P2p — a refusal reaches the ONE region as the dictionary's sentence, marked", () => {
  it("a stale first-stage bump under my names the table in Burmese with no English", async () => {
    currentQueue = queue([ticket({ status: "preparing" })]);
    setTogoStatus.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "That bag was already updated — refreshing.",
        code: "stale",
      }),
    );
    const { getByRole, container } = mount("my", currentQueue);
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "expo.verb.bagged")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() =>
      expect(region.textContent).toBe(tf("my", "expo.err.staleTable", { id: 7 })),
    );
    // MUTATION: `onError(res.error)` — the English sentence lands, red.
    expect(region.textContent).not.toContain("already updated");
    expect(region.querySelector('[lang="my"]')).not.toBeNull();
    expect(region.closest("[lang]")).toBeNull();
  });
});

describe("the lane's clock advances from the FIRST tick, even when no poll ever succeeds", () => {
  it("a lane that mounts into an outage still ages its bags — the offset is taken once, not recomputed", async () => {
    vi.useFakeTimers();
    currentQueue = queue([ticket({ orderId: "late", pickupSlot: iso(-25), createdAt: iso(-90) })]);
    getExpoQueue.mockImplementation(() => Promise.resolve({ ok: false, reason: "outage" }));
    const { container } = render(
      <StaffLangProvider lang="en">
        <ExpoBoard initial={currentQueue} initialOutage />
      </StaffLangProvider>,
    );
    expect(container.querySelector(".expo-age")?.textContent).toContain("25:00");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // MUTATION: recompute the fallback offset on every call — `Date.now() + (parse(serverNow) -
    // Date.now())` is the constant `parse(serverNow)`, the clock never moves, and neither does the
    // paper-flow escalation this path exists for; red here.
    expect(container.querySelector(".expo-age")?.textContent).toContain("26:00");
  });
});

describe("counter-7 — the header wears the bag's due-ness, and nothing before its moment", () => {
  it("a bag 25 minutes past its slot is late with a clock; a slot two hours ahead shows neither", () => {
    currentQueue = queue([
      ticket({ orderId: "late", pickupSlot: iso(-25), createdAt: iso(-90) }),
      ticket({ orderId: "ahead", pickupSlot: iso(120), createdAt: iso(-300) }),
    ]);
    const { container } = mount("en", currentQueue);
    const heads = container.querySelectorAll(".expo-head");
    expect(heads).toHaveLength(2);
    // MUTATION: drop `data-tone` from the header — the strip never colours, red.
    expect(heads[0]!.getAttribute("data-tone")).toBe("late");
    expect(heads[0]!.querySelector(".expo-age")?.textContent).toContain("25:00");
    expect(heads[1]!.getAttribute("data-tone")).toBeNull();
    expect(heads[1]!.querySelector(".expo-age")).toBeNull();
  });
});

// ── Phase 2b · kitchen ──
describe("Phase 2b — the bag line's note is the kitchen's TicketNote: ⚠, sr prefix, marked runs", () => {
  it("a noted bag line renders a SPAN .expo-note; a note-less line renders none", () => {
    // MUTATION (red-first, by hand): restore the quoted `<span style={noteInline}>“…”</span>` — no
    // .expo-note, no ⚠, and the Burmese run is typeset and voiced as English, red.
    const noted = ticket({
      lines: [
        { ...ticket().lines[0]!, id: "l-1", notes: "no peanuts — မြေပဲ" },
        { ...ticket().lines[0]!, id: "l-2", name: "Tea Leaf Salad", notes: null },
      ],
    });
    const { container } = mount("en", queue([noted]));
    const notes = container.querySelectorAll(".expo-note");
    expect(notes).toHaveLength(1);
    const note = notes[0]!;
    expect(note.tagName).toBe("SPAN");
    expect(note.id).toBe("expo-note-l-1");
    expect(note.children).toHaveLength(2);
    expect(note.children[0]!.tagName.toLowerCase()).toBe("svg");
    expect(note.children[0]!.getAttribute("aria-hidden")).toBe("true");
    const text = note.querySelector(".ticket-note-text")!;
    expect(text.firstElementChild!.className).toBe("sr-only");
    expect(text.firstElementChild!.textContent).toBe(`${ts("en", "kds.note.sr")} — `);
    expect(text.querySelector('[lang="my"]')?.textContent).toBe("မြေပဲ");
    // The quotes are gone: the ⚠ and the warn rule mark it as the diner's words.
    expect(note.textContent).not.toContain("“");
  });
});

// ── Phase 2b · feedback ──
/**
 * THE THUMB-ZONE UNDO — the pill that puts "Picked up"'s way back where the thumb is. The rules are
 * pure (`toastPick` in lib/expo-rules.ts, `setHeld`/`heldFor` in lib/undo-hold.ts, the Toast's
 * refusals in @mms/ui); these pin the WIRING: the pill is silent (the lane's region speaks the
 * pick), its Undo cancels the deferred write, it never outlives or out-names its pick, it shields
 * the second half of a double-tap VISIBLY, it holds the window for a keyboard user only, and focus
 * lands on the restored card rather than falling to <body>.
 */
const pill = (c: HTMLElement) => c.querySelector<HTMLElement>(".ui-toast");
const pillUndo = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".ui-toast-action")!;
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** jsdom never matches `:focus-visible`; these elements are treated as keyboard-focused. */
function stubFocusVisible() {
  const keyboard = new Set<Element>();
  const real = Element.prototype.matches;
  const spy = vi.spyOn(Element.prototype, "matches").mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ":focus-visible" ? keyboard.has(this) : real.call(this, selector);
  });
  return { keyboard, restore: () => spy.mockRestore() };
}

describe("Phase 2b · feedback — the thumb-zone Undo pill", () => {
  it("a pick draws a SILENT pill naming the bag while the lane's region speaks it; its Undo cancels the write", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    expect(pill(container)?.textContent).toContain(tf("en", "expo.toast.pickedTable", { id: 7 }));
    // MUTATION: leave the Toast at its live default — a second polite region repeats the pick.
    expect(container.querySelector(".ui-toast-region")?.hasAttribute("role")).toBe(false);
    expect(container.querySelector(".ui-toast-region")?.hasAttribute("aria-live")).toBe(false);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "expo.live.pickedTable", { id: 7 }),
    );
    // The pill's Undo is named by its visible word, and is NOT the card's "Undo — Table 7".
    expect(pillUndo(container).textContent).toBe(ts("en", "kds.undo"));
    expect(pillUndo(container).getAttribute("aria-label")).toBeNull();
    // Blind review (2026-09-24): "Undo" alone names no bag — the pill's own text is its
    // DESCRIPTION, so a screen reader hears what it undoes (the name stays the visible word).
    // MUTATION (by hand): drop `describedById` — the Undo has no subject, red.
    const described = document.getElementById(
      pillUndo(container).getAttribute("aria-describedby") ?? "",
    );
    expect(described?.textContent).toBe(tf("en", "expo.toast.pickedTable", { id: 7 }));
    // The drain carries the REAL window.
    expect(
      container
        .querySelector<HTMLElement>(".ui-toast-drain")
        ?.style.getPropertyValue("--toast-drain"),
    ).toBe("6000ms");
    await advance(500);
    fireEvent.click(pillUndo(container));
    // MUTATION: a no-op onAction — the card stays picked and the write goes out at 6 s, red.
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "expo.live.pickedUndoneTable", { id: 7 }),
    );
    await advance(7_000);
    expect(setTogoStatus).not.toHaveBeenCalled();
  });

  it("the pill's Undo is refused until it arms — the pick's own double-tap cannot land on it", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    expect(pillUndo(container).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(pillUndo(container));
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBe("true");
    await advance(400);
    expect(pillUndo(container).getAttribute("aria-disabled")).toBeNull();
  });

  it("two picks, Undo the latest from the pill: the pill leaves and never re-labels itself to the older bag", async () => {
    vi.useFakeTimers();
    currentQueue = queue([ticket({ orderId: "a", tableNumber: 3 }), ticket()]);
    const { getAllByRole, container } = mount("en", currentQueue);
    fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // Table 3
    await advance(200);
    fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // Table 7
    expect(pill(container)?.textContent).toContain(tf("en", "expo.toast.pickedTable", { id: 7 }));
    await advance(500);
    fireEvent.click(pillUndo(container));
    // Two advances: React commits between timers only when each advance's act() ends.
    await advance(SAME_GESTURE);
    await advance(LEAVE);
    // MUTATION `the-toast-falls-back-to-an-older-pick`: the pill now offers Table 3's Undo, and the
    // second tap of the Undo that took Table 7 back takes Table 3 back too — red.
    expect(pill(container)).toBeNull();
    const cards = container.querySelectorAll("article");
    expect(cards[0]!.getAttribute("data-picked")).toBe("true"); // Table 3 still in its window…
    expect(cardUndo(container, 0)).toBeTruthy(); // …with its own in-slot Undo
    expect(cards[1]!.getAttribute("data-picked")).toBeNull();
  });

  it("an in-slot Undo of the pill's pick takes the pill away at once — it never stays up for an older pick", async () => {
    vi.useFakeTimers();
    currentQueue = queue([ticket({ orderId: "a", tableNumber: 3 }), ticket()]);
    const { getAllByRole, container } = mount("en", currentQueue);
    fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // Table 3
    await advance(200);
    fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // Table 7
    await advance(500);
    fireEvent.click(cardUndo(container, 1)); // Table 7, from its own card
    // MUTATION `the-toast-falls-back-to-an-older-pick`: Table 3 is still open, so the pill stays
    // up — naming Table 7 over an Undo that can no longer do anything — red.
    expect(pill(container)?.className).toContain("ui-toast-leaving");
    await advance(LEAVE);
    expect(pill(container)).toBeNull();
    expect(container.querySelectorAll("article")[0]!.getAttribute("data-picked")).toBe("true");
  });

  it("the window closing takes the pill straight to leaving, then away — a committing pick never keeps it", async () => {
    vi.useFakeTimers();
    const d = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => d.promise);
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await advance(6_000);
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    // MUTATION `a-committing-pick-keeps-the-toast`: a write held in flight leaves a 64px strip
    // whose Undo refuses every tap — red.
    expect(pill(container)?.className).toContain("ui-toast-leaving");
    expect(pill(container)?.hasAttribute("data-shield")).toBe(false);
    await advance(LEAVE - 1);
    expect(pill(container)).not.toBeNull();
    await advance(1);
    expect(pill(container)).toBeNull();
    // The card keeps its committing Undo: inert and busy until the refetch drops the bag.
    expect(cardUndo(container).getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      d.resolve({ ok: true });
    });
  });

  it("after the pill's own Undo it stays VISIBLE and shielded for the same gesture, then leaves", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await advance(500);
    fireEvent.click(pillUndo(container));
    expect(pill(container)?.getAttribute("data-shield")).toBe("true");
    expect(pill(container)?.className).not.toContain("ui-toast-leaving");
    expect(pillUndo(container).getAttribute("aria-disabled")).toBe("true");
    haptic.mockClear();
    fireEvent.click(pillUndo(container)); // the double-tap's second half: sees it, does nothing
    expect(haptic).not.toHaveBeenCalled();
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBeNull();
    await advance(SAME_GESTURE - 1);
    // MUTATION: drop the shield — the pill is already leaving (or gone) here, red.
    expect(pill(container)?.getAttribute("data-shield")).toBe("true");
    await advance(1);
    expect(pill(container)?.className).toContain("ui-toast-leaving");
    await advance(LEAVE);
    expect(pill(container)).toBeNull();
  });

  it("after an Undo the restored slot refuses a re-pick for the same gesture", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await advance(500);
    fireEvent.click(cardUndo(container));
    const slot = getByRole("button", { name: pickedUpName("en") });
    await advance(300);
    fireEvent.click(slot);
    // MUTATION: drop the removeHeld refusal — the second half of a double-tapped Undo picks the
    // bag straight back up, red.
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBeNull();
    await advance(100);
    fireEvent.click(slot);
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBe("true");
  });

  it("a KEYBOARD focus on the pill's Undo holds the window (the drain pauses); blur resumes it — a tap's focus never holds", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      const { getByRole, container } = mount();
      fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
      await advance(5_000);
      fv.keyboard.add(pillUndo(container));
      act(() => pillUndo(container).focus());
      expect(pill(container)?.getAttribute("data-held")).toBe("true");
      await advance(5_000); // t = 10 s
      // MUTATION: onHold unwired — the write went out at 6 s under the keyboard user, red.
      expect(setTogoStatus).not.toHaveBeenCalled();
      act(() => pillUndo(container).blur());
      expect(pill(container)?.hasAttribute("data-held")).toBe(false);
      // Held 5 s: the window closes at 6 + 5 = 11 s.
      await advance(999);
      expect(setTogoStatus).not.toHaveBeenCalled();
      await advance(101);
      expect(setTogoStatus).toHaveBeenCalledTimes(1);
    } finally {
      fv.restore();
    }
  });

  it("a new pick taking the pill over ends the keyboard hold the old pill held — its button unmounts without a blur", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      currentQueue = queue([ticket({ orderId: "a", tableNumber: 3 }), ticket()]);
      const { getAllByRole, container } = mount("en", currentQueue);
      fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // Table 3 at 0 s
      await advance(1_000);
      fv.keyboard.add(pillUndo(container));
      act(() => pillUndo(container).focus()); // held from 1 s…
      await advance(1_000);
      fireEvent.click(getAllByRole("button", { name: pickedUpName("en") })[0]!); // …Table 7 at 2 s
      expect(pill(container)?.textContent).toContain(tf("en", "expo.toast.pickedTable", { id: 7 }));
      // Table 3 was held for 1 s: its window closes at 7 s.
      await advance(4_999);
      expect(setTogoStatus).not.toHaveBeenCalledWith({ orderId: "a", to: "picked_up" });
      await advance(1);
      // MUTATION: keep the stale hold — Table 3 stays on the tracker and the wall until the cap.
      expect(setTogoStatus).toHaveBeenCalledWith({ orderId: "a", to: "picked_up" });
    } finally {
      fv.restore();
    }
  });

  it("a plain (tap) focus on the pill's Undo does NOT hold the window", async () => {
    vi.useFakeTimers();
    // jsdom matches `:focus-visible` on ANY focused element; a tap's focus in a browser does not.
    const fv = stubFocusVisible();
    try {
      const { getByRole, container } = mount();
      fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
      await advance(1_000);
      act(() => pillUndo(container).focus());
      // MUTATION: every focus holds — a touch that focused the pill stalls the write it was about.
      expect(pill(container)?.hasAttribute("data-held")).toBe(false);
      await advance(5_000);
      expect(setTogoStatus).toHaveBeenCalledTimes(1);
    } finally {
      fv.restore();
    }
  });

  it("a KEYBOARD pick sits on Undo by morph and holds the window until focus leaves it", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      const { getByRole } = mount();
      const btn = getByRole("button", { name: pickedUpName("en") });
      fv.keyboard.add(btn);
      act(() => btn.focus());
      fireEvent.click(btn); // Enter on a focused button is a click
      expect(document.activeElement).toBe(btn); // the same node, now the Undo
      await advance(7_000);
      // MUTATION: the pick opens no slot hold — no focus event fires on a morph, so the window runs
      // under the keyboard user and the write goes out at 6 s, red.
      expect(setTogoStatus).not.toHaveBeenCalled();
      act(() => btn.blur()); // Tab away at 7 s: 7 s held, the window closes at 13 s
      await advance(5_999);
      expect(setTogoStatus).not.toHaveBeenCalled();
      await advance(1);
      expect(setTogoStatus).toHaveBeenCalledTimes(1);
    } finally {
      fv.restore();
    }
  });

  it("a keyboard user Tabbing onto the CARD's Undo holds the window too; leaving it resumes", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      const { getByRole, container } = mount();
      fireEvent.click(getByRole("button", { name: pickedUpName("en") })); // a tap: no hold
      await advance(2_000);
      const undo = cardUndo(container);
      fv.keyboard.add(undo);
      act(() => undo.focus());
      // The pill's drain pauses for ANY source's hold — the window is one window.
      expect(pill(container)?.getAttribute("data-held")).toBe("true");
      await advance(8_000); // t = 10 s
      // MUTATION: the in-slot onFocus unwired — the write went out at 6 s, red.
      expect(setTogoStatus).not.toHaveBeenCalled();
      act(() => undo.blur()); // held 8 s: closes at 14 s
      await advance(3_999);
      expect(setTogoStatus).not.toHaveBeenCalled();
      await advance(1);
      expect(setTogoStatus).toHaveBeenCalledTimes(1);
    } finally {
      fv.restore();
    }
  });

  it("after a keyboard Undo from the pill, focus lands on the card's restored slot — never <body>", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      const { container } = mount();
      fireEvent.click(container.querySelector<HTMLElement>("[data-expo-slot]")!);
      await advance(500);
      fv.keyboard.add(pillUndo(container));
      const slot = container.querySelector<HTMLElement>('[data-expo-slot="order-1"]')!;
      // A browser matches `:focus-visible` on a script focus that follows keyboard input — so the
      // restored slot's focus handler DOES see a keyboard focus, on the Undo node it still is.
      fv.keyboard.add(slot);
      act(() => pillUndo(container).focus());
      fireEvent.click(pillUndo(container));
      // MUTATION: leave focus on the pill — it shields, leaves, unmounts, and focus falls to <body>.
      expect(document.activeElement).toBe(slot);
      // Blind review (2026-09-24) — that focus held a window that no longer exists, and only the
      // post-Undo `markHeld(NO_HOLD)` lets it go. MUTATION (by hand): drop it — the shielded pill
      // wears data-held (a paused drain) over a pick that was already taken back, red.
      expect(pill(container)?.hasAttribute("data-held")).toBe(false);
      expect(slot.textContent).toContain(ts("en", "expo.verb.pickedUp"));
      await advance(SAME_GESTURE);
      await advance(LEAVE);
      expect(pill(container)).toBeNull();
      expect(document.activeElement).toBe(slot);
    } finally {
      fv.restore();
    }
  });

  it("the hold cap WARNS before it lets go, the drain visibly resumes, and the commit is announced", async () => {
    vi.useFakeTimers();
    const fv = stubFocusVisible();
    try {
      const { getByRole, container } = mount();
      const region = () => container.querySelector('[role="status"]')?.textContent;
      fireEvent.click(getByRole("button", { name: pickedUpName("en") })); // t = 0
      await advance(1_000);
      fv.keyboard.add(pillUndo(container));
      act(() => pillUndo(container).focus()); // held from 1 s
      expect(pill(container)?.getAttribute("data-held")).toBe("true");
      await advance(54_000); // t = 55 s — 54 s held: nothing to say yet
      expect(region()).not.toBe(tf("en", "expo.live.capSoonTable", { id: 7 }));
      await advance(1_000); // t = 56 s — 55 s held: five seconds from the cap
      // MUTATION (by hand): no warning — the pick lands under the keyboard user unannounced, red.
      expect(region()).toBe(tf("en", "expo.live.capSoonTable", { id: 7 }));
      expect(pill(container)?.getAttribute("data-held")).toBe("true");
      await advance(5_000); // t = 61 s — the cap
      // MUTATION (by hand): never release — data-held stays over a window that is really running.
      expect(pill(container)?.hasAttribute("data-held")).toBe(false);
      expect(setTogoStatus).not.toHaveBeenCalled();
      // The window's own rest: 1 s ran before the hold, so 5 s remain.
      await advance(4_000);
      expect(setTogoStatus).not.toHaveBeenCalled();
      await advance(1_000); // t = 66 s
      expect(setTogoStatus).toHaveBeenCalledTimes(1);
      expect(region()).toBe(tf("en", "expo.live.capDoneTable", { id: 7 }));
      // A focus after the release never re-holds: the hold is spent.
      expect(pill(container)?.hasAttribute("data-held") ?? false).toBe(false);
    } finally {
      fv.restore();
    }
  });

  it("an Undo landing after the tick SENT the write, before React re-rendered, is refused", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    await advance(5_999);
    const undo = cardUndo(container); // the node, and the handler closure, of the last render
    // The tick fires OUTSIDE act: it sends the write; React has not re-rendered the card.
    vi.advanceTimersByTime(1);
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(undo);
    await advance(0);
    // MUTATION (by hand): read only the render's `committing` — the Undo drops a pick whose
    // picked_up write is already on the wire, and the region says it is back on the counter, red.
    expect(container.querySelector('[role="status"]')?.textContent).not.toBe(
      tf("en", "expo.live.pickedUndoneTable", { id: 7 }),
    );
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBe("true");
  });

  it("a scan-and-go hand-over is spoken, and drawn, as 'handed over' — the word its button said", () => {
    vi.useFakeTimers();
    currentQueue = queue([
      ticket({
        tableNumber: null,
        lines: [{ ...ticket().lines[0]!, fulfillment: "grocery" }],
      }),
    ]);
    const { getByRole, container } = mount("en", currentQueue);
    fireEvent.click(
      getByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.handedOver")}`) }),
    );
    // MUTATION: `expo.live.picked` for a verify subject — "#A1B2C3 picked up" after a button that
    // said "Handed over", red.
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "expo.live.handedOver", { x: "#A1B2C3" }),
    );
    expect(pill(container)?.textContent).toContain(
      tf("en", "expo.toast.handedOver", { x: "#A1B2C3" }),
    );
  });
});

describe("Phase 2f — an unpaid bag (a counter order sent before it was paid)", () => {
  const bag = (over: Partial<ExpoUnpaidBag> = {}): ExpoUnpaidBag => ({
    cartId: "cart-reg",
    sessionId: "sess-reg",
    customerName: "Aye",
    lines: [
      {
        id: "u-1",
        name: "Tea Leaf Salad",
        nameMy: null,
        qty: 1,
        modifiers: [],
        modifiersMy: [],
        fulfillment: "togo",
        notes: null,
      },
    ],
    moreUnits: 0,
    owes: true,
    kitchen: "done",
    sentAt: iso(-4),
    ...over,
  });
  const withBag = (b = bag(), tickets: ExpoTicket[] = []) =>
    ({ tickets, unpaid: [b], serverNow: NOW }) satisfies ExpoQueue;
  const unpaidCard = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("article[data-unpaid]")!;

  it("draws the Unpaid flag, the SENT lines, what is not sent yet, and ONE link — to take payment", () => {
    // A bag with a draft still unsent is never "done" (lib's `unpaidBag`, self-review PT-4).
    const { container } = mount("en", withBag(bag({ moreUnits: 1, kitchen: "cooking" })));
    const card = unpaidCard(container);
    expect(card.textContent).toContain(ts("en", "settle.unpaid"));
    expect(card.textContent).not.toContain(ts("en", "expo.bag.noCharge"));
    expect(card.textContent).toContain("Tea Leaf Salad");
    expect(card.textContent).toContain(tf("en", "expo.unpaid.more.one", { n: 1 }));
    expect(card.textContent).not.toContain(ts("en", "expo.kitchenDone"));
    // ONE action, and never the lane's stage buttons: an unpaid bag is not bagged or handed over.
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/staff/table/sess-reg?settle=1");
    expect(links[0]!.className).toContain("ui-btn-primary");
    expect(links[0]!.getAttribute("aria-label")).toContain("Aye");
    expect(links[0]!.textContent).toBe(ts("en", "expo.verb.takePayment"));
  });

  it("a finished bag with nothing unsent says Kitchen done, and no 'more not sent' line", () => {
    const { container } = mount("en", withBag());
    const card = unpaidCard(container);
    expect(card.textContent).toContain(ts("en", "expo.kitchenDone"));
    expect(card.textContent).not.toContain(tf("en", "expo.unpaid.more.one", { n: 1 }));
  });

  // Self-review PT-2 — every chargeable line made free: the bag is still collected, but nothing is
  // owed. Never "Unpaid", never counted unpaid, never a Take payment into a page with no payment.
  it("a bag that owes nothing: 'No charge', a plain View link to its page, and no Unpaid anywhere", () => {
    // p2f-sr-lane/expo-board/free-bag-reads-unpaid · free-bag-takes-payment
    const { container } = mount("en", withBag(bag({ owes: false })));
    const card = unpaidCard(container);
    expect(card.textContent).toContain(ts("en", "expo.bag.noCharge"));
    expect(card.textContent).not.toContain(ts("en", "settle.unpaid"));
    const name = card.getAttribute("aria-label")!;
    expect(name).toContain(tf("en", "expo.a11y.cardNoCharge", { x: "Aye" }));
    expect(name).toContain(ts("en", "expo.bag.noCharge"));
    expect(name).not.toContain(ts("en", "settle.unpaid"));
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/staff/table/sess-reg");
    expect(links[0]!.className).toContain("ui-btn-secondary");
    expect(links[0]!.textContent).toBe(ts("en", "floor.verb.view"));
    expect(links[0]!.textContent).not.toBe(ts("en", "expo.verb.takePayment"));
    const linkName = links[0]!.getAttribute("aria-label")!;
    expect(linkName).toContain("Aye");
    expect(linkName).toContain(ts("en", "floor.verb.view"));
    expect(linkName).not.toContain(ts("en", "expo.verb.takePayment"));
  });

  it("the unpaid count counts only the bags that OWE — a free bag is still counted as a bag", () => {
    // p2f-sr-lane/expo-board/free-bag-counted-unpaid
    const q = {
      tickets: [],
      unpaid: [bag({ owes: false }), bag({ cartId: "cart-2", sessionId: "sess-2", owes: true })],
      serverNow: NOW,
    } satisfies ExpoQueue;
    const { container } = mount("en", q);
    const [announced, visible] = container.querySelectorAll(".expo-status");
    expect(visible!.textContent).toContain(tf("en", "expo.count.many", { n: 2 }));
    expect(visible!.textContent).toContain(tf("en", "expo.count.unpaid", { n: 1 }));
    expect(announced!.textContent).toContain(tf("en", "expo.count.unpaid", { n: 1 }));
    cleanup();
    const free = mount("en", withBag(bag({ owes: false })));
    const line = free.container.querySelectorAll(".expo-status")[1]!.textContent!;
    expect(line).toContain(tf("en", "expo.count.one", { n: 1 }));
    expect(line).not.toContain(tf("en", "expo.count.unpaid", { n: 1 }));
  });

  it("its name says whose bag it is and the visible Unpaid words — in every language mode", () => {
    for (const lang of ["en", "my"] as const) {
      const { container } = mount(lang, withBag());
      const name = unpaidCard(container).getAttribute("aria-label")!;
      expect(name).toContain(tf(lang, "expo.a11y.cardUnpaid", { x: "Aye" }));
      expect(name).toContain(ts(lang, "settle.unpaid"));
      cleanup();
    }
    const { container } = mount("en", withBag(bag({ customerName: null })));
    expect(unpaidCard(container).getAttribute("aria-label")).toContain(ts("en", "reg.row.walkup"));
  });

  it("the lane's count names the unpaid bag, and counts it as a bag", () => {
    const { container } = mount("en", withBag(bag(), [ticket()]));
    const visible = container.querySelectorAll(".expo-status")[1]!.textContent!;
    expect(visible).toContain(tf("en", "expo.count.many", { n: 2 }));
    expect(visible).toContain(tf("en", "expo.count.unpaid", { n: 1 }));
  });

  // Phase 2f review (M1, lib's `unpaidTruncated` — resolves at integration): the unpaid read hit
  // its cap. The paid bags stay; the lane SAYS the unpaid list is partial, in its visible line and
  // its announcement, and never reads as an all-clear.
  it("a saturated unpaid read: the count line and the announcement say more are unpaid", () => {
    const q: ExpoQueue & { unpaidTruncated?: boolean } = {
      ...withBag(bag(), [ticket()]),
      unpaidTruncated: true,
    };
    const { container } = mount("en", q);
    const [announced, visible] = container.querySelectorAll(".expo-status");
    expect(visible!.textContent).toContain(ts("en", "expo.count.unpaidMore"));
    expect(announced!.textContent).toContain(ts("en", "expo.count.unpaidMore"));
    cleanup();
    const plain = mount("en", withBag(bag(), [ticket()]));
    expect(plain.container.textContent).not.toContain(ts("en", "expo.count.unpaidMore"));
  });

  it("a saturated unpaid read with nothing drawable is never 'No bags waiting'", () => {
    const q: ExpoQueue & { unpaidTruncated?: boolean } = {
      tickets: [],
      unpaid: [],
      serverNow: NOW,
      unpaidTruncated: true,
    };
    const { container } = mount("en", q);
    expect(container.textContent).toContain(ts("en", "expo.count.unpaidMore"));
    expect(container.textContent).not.toContain(ts("en", "expo.none"));
    expect(container.textContent).not.toContain(ts("en", "expo.empty"));
  });

  it("a kitchen-done unpaid bag sorts beside the paid bags (never a second list)", () => {
    const { container } = mount(
      "en",
      withBag(bag(), [ticket({ kitchen: "cooking", status: "preparing" })]),
    );
    const cards = [...container.querySelectorAll("article")];
    expect(cards).toHaveLength(2);
    expect(cards[0]!.hasAttribute("data-unpaid")).toBe(true);
    expect(container.querySelectorAll('[role="list"][aria-label]').length).toBeGreaterThan(0);
  });

  it("at split width a plain click opens the counter's pane on the settle section", () => {
    // jsdom has no matchMedia: stand one in for this case only.
    const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
    const prev = window.matchMedia;
    const { container } = mount("en", withBag());
    // Installed AFTER the mount (the motion hooks subscribe to their own queries on mount).
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      fireEvent.click(within(unpaidCard(container)).getByRole("link"));
      expect(push).toHaveBeenCalledWith("/staff?floor=1&settle=1#table-sess-reg");
    } finally {
      if (had) window.matchMedia = prev;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("at split width a bag that owes nothing opens its pane on the order — no settle section", () => {
    // p2f-sr-lane/expo-board/free-bag-pane-settles
    const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
    const prev = window.matchMedia;
    const { container } = mount("en", withBag(bag({ owes: false })));
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      push.mockClear();
      fireEvent.click(within(unpaidCard(container)).getByRole("link"));
      expect(push).toHaveBeenCalledWith("/staff?floor=1#table-sess-reg");
    } finally {
      if (had) window.matchMedia = prev;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  // Phase 2g integration — ON the counter screen the split's own opener takes the tap: a router push
  // of `paneUrl` from this screen changes the address and opens nothing (the split seeds from the
  // URL on mount and then follows `hashchange` only, which a router push never fires). The push
  // above stays the fallback where no split is mounted.
  const mountInSplit = (initial: ExpoQueue, openSession: TablePaneApi["openSession"]) =>
    render(
      <StaffLangProvider lang="en">
        <TablePaneContext.Provider
          value={{
            selectedId: null,
            selectionGen: 0,
            openFromCard: () => {},
            openSession,
            publishFloor: () => {},
          }}
        >
          <ExpoBoard initial={initial} />
        </TablePaneContext.Provider>
      </StaffLangProvider>,
    );

  it("on the counter screen Take payment opens the pane on the payment section — no URL push", () => {
    // p2g-int/lane-tap-pushes-the-dead-url · p2g-int/lane-tap-drops-settle
    const openSession = vi.fn(() => true);
    const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
    const prev = window.matchMedia;
    const { container } = mountInSplit(withBag(), openSession);
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      push.mockClear();
      fireEvent.click(within(unpaidCard(container)).getByRole("link"));
      expect(openSession).toHaveBeenCalledTimes(1);
      expect(openSession).toHaveBeenCalledWith(
        "sess-reg",
        { counter: true, display: "" },
        { settle: true },
      );
      expect(push).not.toHaveBeenCalled();
    } finally {
      if (had) window.matchMedia = prev;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("on the counter screen a bag that owes nothing opens its pane on the order, not the payment", () => {
    // p2g-int/free-bag-split-settles
    const openSession = vi.fn(() => true);
    const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
    const prev = window.matchMedia;
    const { container } = mountInSplit(withBag(bag({ owes: false })), openSession);
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      push.mockClear();
      fireEvent.click(within(unpaidCard(container)).getByRole("link"));
      expect(openSession).toHaveBeenCalledWith(
        "sess-reg",
        { counter: true, display: "" },
        { settle: false },
      );
      expect(push).not.toHaveBeenCalled();
    } finally {
      if (had) window.matchMedia = prev;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("below the split's width the opener says no and the plain push still runs", () => {
    const openSession = vi.fn(() => false);
    const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
    const prev = window.matchMedia;
    const { container } = mountInSplit(withBag(), openSession);
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    try {
      push.mockClear();
      fireEvent.click(within(unpaidCard(container)).getByRole("link"));
      expect(push).toHaveBeenCalledWith("/staff?floor=1&settle=1#table-sess-reg");
    } finally {
      if (had) window.matchMedia = prev;
      else delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it("the lane heading takes focus when the paid card's link lands on #expo-h", () => {
    window.history.replaceState(null, "", "/staff?floor=1#expo-h");
    const { container } = mount("en", withBag());
    expect(document.activeElement).toBe(container.querySelector("#expo-h"));
    window.history.replaceState(null, "", "/");
  });
});

// ── M250 — a comped line rides its bag, and says so on its own line ──────────────────────────────
describe("M250 — a comped line says 'No charge' on its line; a free bag says it once", () => {
  const NO_CHARGE = ts("en", "expo.bag.noCharge");
  const occurrences = (text: string, word: string) => text.split(word).length - 1;
  const mohinga = ticket().lines[0]!;
  const shan = { ...mohinga, id: "l-comp", name: "Shan noodles", noCharge: true as const };
  const lineItems = (card: HTMLElement) => [...card.querySelectorAll("li")];
  const unpaidBag = (over: Partial<ExpoUnpaidBag> = {}): ExpoUnpaidBag => ({
    cartId: "cart-reg",
    sessionId: "sess-reg",
    customerName: "Aye",
    lines: [
      { ...mohinga, id: "u-1" },
      { ...shan, id: "u-comp" },
    ],
    moreUnits: 0,
    owes: true,
    kitchen: "cooking",
    sentAt: iso(-4),
    ...over,
  });

  it("on a paid bag only the comped line carries the tag — a line with no flag reads as charged", () => {
    // no-charge-tag-never · no-charge-tag-every-line
    const { container } = mount("en", queue([ticket({ lines: [mohinga, shan] })]));
    const card = container.querySelector("article")!;
    const [plain, comped] = lineItems(card);
    expect(plain!.textContent).toContain("Mohinga");
    expect(plain!.textContent).not.toContain(NO_CHARGE);
    expect(comped!.textContent).toContain("Shan noodles");
    expect(comped!.textContent).toContain(NO_CHARGE);
    expect(occurrences(card.textContent ?? "", NO_CHARGE)).toBe(1);
  });

  it("a paid bag with no comp says 'No charge' nowhere", () => {
    const { container } = mount("en", queue([ticket()]));
    expect(container.textContent).not.toContain(NO_CHARGE);
  });

  it("an unpaid bag that still owes tags its comp line, beside the Unpaid flag", () => {
    const { container } = mount("en", { tickets: [], unpaid: [unpaidBag()], serverNow: NOW });
    const card = container.querySelector<HTMLElement>("article[data-unpaid]")!;
    expect(card.textContent).toContain(ts("en", "settle.unpaid"));
    const [plain, comped] = lineItems(card);
    expect(plain!.textContent).not.toContain(NO_CHARGE);
    expect(comped!.textContent).toContain(NO_CHARGE);
    expect(occurrences(card.textContent ?? "", NO_CHARGE)).toBe(1);
  });

  it("an unpaid bag that owes NOTHING says 'No charge' exactly once — its badge, never per line", () => {
    // free-bag-tags-twice
    const { container } = mount("en", {
      tickets: [],
      unpaid: [unpaidBag({ owes: false, lines: [{ ...shan, id: "u-comp" }] })],
      serverNow: NOW,
    });
    const card = container.querySelector<HTMLElement>("article[data-unpaid]")!;
    expect(occurrences(card.textContent ?? "", NO_CHARGE)).toBe(1);
    for (const li of lineItems(card)) expect(li.textContent).not.toContain(NO_CHARGE);
  });

  it("under my, the line tag is the dictionary's Burmese with no English echo (a tag never echoes)", () => {
    const { container } = mount("my", queue([ticket({ lines: [mohinga, shan] })]));
    const comped = lineItems(container.querySelector("article")!)[1]!;
    expect(comped.textContent).toContain(ts("my", "expo.bag.noCharge"));
    expect(comped.textContent).not.toContain(NO_CHARGE);
    const my = [...comped.querySelectorAll('[lang="my"]')].find(
      (el) => el.textContent === ts("my", "expo.bag.noCharge"),
    );
    expect(my).toBeTruthy();
  });
});

// ── Phase 2g · P2fk — a bag nobody came for ──
describe("Phase 2g — an unpaid bag that has waited past the horizon says so, in its name too", () => {
  const words = (lang: "en" | "my") =>
    tf(
      lang,
      COUNTER_UNCOLLECTED_HOURS === 1
        ? "floor.counter.uncollected.badge.one"
        : "floor.counter.uncollected.badge.many",
      { n: COUNTER_UNCOLLECTED_HOURS },
    );
  const bag = (over: Partial<ExpoUnpaidBag> = {}): ExpoUnpaidBag => ({
    cartId: "cart-reg",
    sessionId: "sess-reg",
    customerName: "Aye",
    lines: [
      {
        id: "u-1",
        name: "Tea Leaf Salad",
        nameMy: null,
        qty: 1,
        modifiers: [],
        modifiersMy: [],
        fulfillment: "togo",
        notes: null,
      },
    ],
    moreUnits: 0,
    owes: true,
    kitchen: "done",
    sentAt: iso(-300),
    uncollected: true,
    ...over,
  });
  const card = (b: ExpoUnpaidBag, lang: "en" | "my" = "en", echoes = true) =>
    render(
      <StaffLangProvider lang={lang} echoes={echoes}>
        <ExpoBoard initial={{ tickets: [], unpaid: [b], serverNow: NOW }} />
      </StaffLangProvider>,
    ).container.querySelector<HTMLElement>("article[data-unpaid]")!;

  for (const [lang, echoes] of [
    ["en", true],
    ["my", true],
    ["my", false],
  ] as const) {
    it(`${lang}${echoes ? "" : " (Burmese only)"}: the badge is drawn after the money badge, and named after it`, () => {
      // p2g-uncollected/expo-board/badge-unnamed · badge-never-drawn
      const el = card(bag(), lang, echoes);
      const unpaid = ts(lang, "settle.unpaid");
      expect(el.textContent).toContain(words(lang));
      expect(el.textContent!.indexOf(unpaid)).toBeLessThan(el.textContent!.indexOf(words(lang)));
      const name = el.getAttribute("aria-label")!;
      expect(name.endsWith(`${unpaid}, ${words(lang)}`)).toBe(true);
      cleanup();
    });
  }

  it("a bag that owes nothing and waits: 'No charge', then the badge — in the name in that order", () => {
    const el = card(bag({ owes: false }));
    const name = el.getAttribute("aria-label")!;
    expect(name.endsWith(`${ts("en", "expo.bag.noCharge")}, ${words("en")}`)).toBe(true);
    expect(el.textContent).toContain(words("en"));
  });

  it("absent or false reads as NOT uncollected — no badge, nothing in the name", () => {
    const { uncollected: _drop, ...absent } = bag();
    void _drop;
    for (const b of [absent, bag({ uncollected: false })]) {
      const el = card(b);
      expect(el.textContent).not.toContain(words("en"));
      expect(el.getAttribute("aria-label")).not.toContain(words("en"));
      cleanup();
    }
  });
});

// ── Phase 2h — a hung tablet never traps the lane (P2cz · P2fc) ───────────────────────────────────
const { STAFF_HANG_MS, stalledSince } = await import("@/lib/bounded-write");
const { PICKED_UNDO_MS } = await import("@/lib/expo-rules");

describe("Phase 2h (9f) — the lane's poll never stacks a read behind a hung one", () => {
  const flush = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const head = () => document.getElementById("expo-h")!.parentElement!;

  it("a read hung for 60 s is ONE dispatch; the second miss arms the freeze; the answer kicks exactly one owed read", async () => {
    vi.useFakeTimers();
    const hung = deferred<ExpoPoll>();
    getExpoQueue.mockReset();
    getExpoQueue
      .mockReturnValueOnce(hung.promise)
      .mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
    mount();
    await flush(5_000);
    expect(getExpoQueue).toHaveBeenCalledTimes(1);
    await flush(14_998);
    expect(head().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    // MUTATION (p2h-boards/expo/refused-tick-never-a-miss): only the race's one miss counts; red.
    await flush(5_001);
    expect(head().textContent).toContain(ts("en", "out.head.notUpdating"));
    // MUTATION (p2h-boards/expo/poll-stacks · expo/gate-watches-nothing): a read per tick behind
    // the hung one; red.
    await flush(38_000);
    expect(getExpoQueue).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-boards/expo/owed-read-never-kicked): nothing reads until the next tick; red.
    await act(async () => {
      hung.resolve({ ok: true, queue: currentQueue });
    });
    await flush(0);
    expect(getExpoQueue).toHaveBeenCalledTimes(2);
    expect(head().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    await flush(1_000);
    expect(getExpoQueue).toHaveBeenCalledTimes(2);
  });
});

describe("Phase 2h (9b · 9e) — a lane write that hangs frees its control at the bound and says so", () => {
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const region = () => document.querySelector('[role="status"]')!;
  const reload = () =>
    document.querySelector<HTMLElement>(".staff-reload-offer")?.querySelector("button") ?? null;
  const bagged = (root: ReturnType<typeof mount>) =>
    root.getByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.bagged")}`) });

  it("Bagged & ready: busy frees AT the bound; the waiting line, its Reload and the bags caveat; the late ok refetches", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = queue([ticket({ status: "preparing" })]);
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount("en", currentQueue);
    const btn = bagged(q);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2h-boards/expo/bump-transition — the old startTransition): pending holds until the
    // action answers; red.
    await flush(1);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    // "Reload the screen to see": the button, beside the region (never inside it), with what a reload
    // costs on the lane (a pick inside its window lives only in this tab).
    // MUTATION (p2h-boards/expo/waiting-offers-no-reload): no button; red.
    expect(reload()).not.toBeNull();
    expect(region().contains(reload())).toBe(false);
    expect(document.querySelector(".staff-reload-offer")!.textContent).toContain(
      ts("en", "expo.reload.bags"),
    );
    // Critic B1 — the bag is HELD while its write is out: no longer busy, but refusing (a second
    // "Bagged & ready" queued behind the hung one would answer "already updated" over the first one's
    // landing). A tap re-says the line and sends nothing. MUTATION (p2h-boards/expo/held-not-said):
    // the button reads live; red. MUTATION (p2h-boards/expo/held-resent · expo/hold-never-taken):
    // the tap dispatches; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    // The late ok: the lane asks for the truth, and the waiting line (with its Reload) goes.
    // MUTATION (p2h-boards/expo/late-waiting-never-retired): the waiting line outlives its answer; red.
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    expect(region().textContent).not.toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    expect(reload()).toBeNull();
    // …and the bag is released by its own answer. MUTATION (p2h-boards/expo/held-never-released); red.
    expect(btn.getAttribute("aria-disabled")).toBeNull();
  });

  it("Bagged & ready: a late REFUSAL is said (9e)", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = queue([ticket({ status: "preparing" })]);
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount("en", currentQueue);
    await act(async () => {
      fireEvent.click(bagged(q));
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    // MUTATION (p2h-boards/expo/late-answer-dropped): the late answer is thrown away; red.
    await act(async () => {
      write.resolve({ ok: false, error: "stale", code: "stale" });
    });
    await flush();
    expect(region().textContent).toBe(tf("en", "expo.err.staleTable", { id: 7 }));
  });

  it("a late answer retires ITS OWN waiting line — never a newer refusal standing over it", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = queue([
      ticket({ status: "preparing" }),
      ticket({ orderId: "order-2", tableNumber: 8, label: "T8", status: "preparing" }),
    ]);
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount("en", currentQueue);
    const buttons = () =>
      q.getAllByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.bagged")}`) });
    await act(async () => {
      fireEvent.click(buttons()[0]!);
    });
    await flush(STAFF_HANG_MS);
    // A newer tap, refused: the region says THAT now.
    setTogoStatus.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "stale", code: "stale" }),
    );
    await act(async () => {
      fireEvent.click(buttons()[1]!);
    });
    await flush();
    const newer = region().textContent;
    expect(newer).not.toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    // The first write's late ok lands: its waiting line is long gone, and the newer refusal STANDS.
    // MUTATION (p2h-boards/expo/drop-retires-a-newer-line): the late answer clears whatever stands; red.
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    expect(region().textContent).toBe(newer);
  });

  it("Bagged & ready: a THROWN write says 'couldn't confirm' — never 'Couldn't update … — try again'", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = queue([ticket({ status: "preparing" })]);
    setTogoStatus.mockImplementationOnce(() => Promise.reject(new Error("Failed to fetch")));
    const q = mount("en", currentQueue);
    await act(async () => {
      fireEvent.click(bagged(q));
    });
    await flush();
    // MUTATION (p2h-boards/expo/threw-says-failed): `expoFailedMsg` — a claim a lost answer cannot
    // prove; red.
    expect(region().textContent).toBe(tf("en", "expo.err.unknownTable", { id: 7 }));
    expect(reload()).toBeNull();
  });

  it("the picked-up write: hung past the bound it is SAID (the card stays committing), and the late refusal gives the bag back", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: pickedUpName("en") }));
    await flush(PICKED_UNDO_MS + 1_000); // the window closes and the write goes out
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    const card = () => q.container.querySelector("article")!;
    expect(card().getAttribute("data-picked")).toBe("true");
    // MUTATION (p2h-boards/expo/commit-unbounded): the deferred write awaits the raw — silent for as
    // long as it hangs; red.
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    // The pick may have landed: the card keeps its picked posture, its Undo inert.
    expect(card().getAttribute("data-picked")).toBe("true");
    await act(async () => {
      write.resolve({ ok: false, error: "stale", code: "stale" });
    });
    await flush();
    expect(region().textContent).toBe(tf("en", "expo.err.staleTable", { id: 7 }));
    expect(card().getAttribute("data-picked")).toBeNull();
  });

  it("a leave (expired session) with a window open waits for its flush at most STAFF_HANG_MS, never for ever", async () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    setTogoStatus.mockImplementation(() => new Promise(() => {}));
    getExpoQueue.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: "signin" } as unknown as ExpoPoll),
    );
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: pickedUpName("en") }));
    await flush(5_000); // the poll answers "go sign in" with the window still open
    expect(setTogoStatus).toHaveBeenCalled();
    await flush(STAFF_HANG_MS - 1);
    expect(assign).not.toHaveBeenCalled();
    // MUTATION (p2h-boards/expo/leave-flush-unbounded): the leave awaits the raw flush — a hung write
    // holds the lane on a dead session for ever; red.
    await flush(1);
    expect(assign).toHaveBeenCalledWith("/staff/login");
    vi.unstubAllGlobals();
  });

  it("the unmount flush sits on the stall ledger until it answers — a hung one refuses the next screen's money taps", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    const flushWrite = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => flushWrite.promise);
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: pickedUpName("en") }));
    await flush(1_000);
    q.unmount();
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    const sentAt = Date.now();
    await flush(STAFF_HANG_MS);
    // MUTATION (p2h-boards/expo/unmount-flush-untracked): `void setTogoStatus(...)` — the ledger
    // never hears of it, and a money tap behind it is dispatched into the stuck queue; red.
    expect(stalledSince()).toBe(sentAt);
    await act(async () => {
      flushWrite.resolve({ ok: true });
    });
    expect(stalledSince()).toBeNull();
  });
  it("a tap on ANOTHER bag keeps a standing waiting line and its Reload (critic B12)", async () => {
    vi.useFakeTimers();
    getExpoQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = queue([
      ticket({ status: "preparing" }),
      ticket({ orderId: "order-2", tableNumber: 8, label: "T8", status: "preparing" }),
      ticket({ orderId: "order-3", tableNumber: 9, label: "T9", status: "ready" }),
    ]);
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount("en", currentQueue);
    const buttons = () =>
      q.getAllByRole("button", { name: new RegExp(`^${ts("en", "expo.verb.bagged")}`) });
    await act(async () => {
      fireEvent.click(buttons()[0]!);
    });
    await flush(STAFF_HANG_MS);
    const waitingLine = tf("en", "expo.err.waitingTable", { id: 7 });
    expect(region().textContent).toBe(waitingLine);
    // Table 8 bagged (it lands at once) and Table 9 handed over: Table 7's write is STILL out, so its
    // line — and the lane's only Reload — stand. MUTATION (p2h-boards/expo/tap-clears-waiting): each
    // tap clears whatever the region holds; red.
    await act(async () => {
      fireEvent.click(buttons()[1]!);
    });
    await flush();
    expect(setTogoStatus).toHaveBeenCalledTimes(2);
    expect(region().textContent).toBe(waitingLine);
    await act(async () => {
      fireEvent.click(q.getByRole("button", { name: pickedUpName("en") }));
    });
    expect(region().textContent).toBe(waitingLine);
    expect(reload()).not.toBeNull();
    await act(async () => {
      write.resolve({ ok: true });
    });
  });

  it("a late answer on a lane that is GONE starts no read (critic B4)", async () => {
    vi.useFakeTimers();
    // The polls answer at once — a late answer's re-read would be dispatched, not owed.
    currentQueue = queue([ticket({ status: "preparing" })]);
    const write = deferred<ExpoActionResult>();
    setTogoStatus.mockImplementationOnce(() => write.promise);
    const q = mount("en", currentQueue);
    await act(async () => {
      fireEvent.click(bagged(q));
    });
    await flush(STAFF_HANG_MS);
    expect(region().textContent).toBe(tf("en", "expo.err.waitingTable", { id: 7 }));
    q.unmount();
    getExpoQueue.mockClear();
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush(1_000);
    // MUTATION (p2h-boards/expo/dead-lane-reads): the landed bag's re-read is sent from a lane that
    // no longer exists (and its leave path would re-send windows the unmount flush already sent); red.
    expect(getExpoQueue).not.toHaveBeenCalled();
  });

  it("a THROWN picked-up write says 'couldn't confirm' and keeps the card picked until a read that STARTED after it decides (critic B11 · B10)", async () => {
    vi.useFakeTimers();
    // Poll #1 is in the air when the write throws; #2 is the first read started after the throw.
    const before = deferred<ExpoPoll>();
    const after = deferred<ExpoPoll>();
    getExpoQueue.mockReset();
    getExpoQueue
      .mockReturnValueOnce(before.promise)
      .mockReturnValueOnce(after.promise)
      .mockImplementation(() => new Promise(() => {}));
    setTogoStatus.mockImplementationOnce(() => Promise.reject(new Error("Failed to fetch")));
    const q = mount();
    fireEvent.click(q.getByRole("button", { name: pickedUpName("en") }));
    await flush(5_000); // poll #1 goes out
    expect(getExpoQueue).toHaveBeenCalledTimes(1);
    await flush(PICKED_UNDO_MS - 5_000 + 1_000); // the window closes; the write goes out and throws
    expect(setTogoStatus).toHaveBeenCalledTimes(1);
    const card = () => q.container.querySelector("article")!;
    // MUTATION (p2h-boards/expo/commit-threw-unsaid): the lost answer is not said; red.
    expect(region().textContent).toBe(tf("en", "expo.err.unknownTable", { id: 7 }));
    // The pick may have landed: the card keeps its picked posture (no live "Picked up" under a
    // sentence that says "check the screen"). MUTATION (p2h-boards/expo/lost-gives-bag-back-unread):
    // the bag is handed back at once; red.
    expect(card().getAttribute("data-picked")).toBe("true");
    // Poll #1 answers — it STARTED before the throw, so it decides nothing (its bag list is from
    // before the write). MUTATION (p2h-boards/expo/lost-decided-by-an-older-read): it decides, and
    // the bag goes back on a list that cannot know; red.
    await act(async () => {
      before.resolve({ ok: true, queue: currentQueue });
    });
    await flush(0);
    expect(card().getAttribute("data-picked")).toBe("true");
    // The throw asked for a read of its own, owed to #1 and kicked as #1 answered.
    // MUTATION (p2h-boards/expo/lost-never-reads): nothing reads until the next tick; red.
    expect(getExpoQueue).toHaveBeenCalledTimes(2);
    // #2 — started after the throw — still lists the bag: the pick did NOT land, the bag goes back.
    // MUTATION (p2h-boards/expo/lost-never-decided): the card stays parked mid-pick; red.
    await act(async () => {
      after.resolve({ ok: true, queue: currentQueue });
    });
    await flush(0);
    expect(card().getAttribute("data-picked")).toBeNull();
    expect(q.getByRole("button", { name: pickedUpName("en") })).toBeTruthy();
  });
});
