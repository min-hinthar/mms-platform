/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpoPoll, ExpoQueue, ExpoTicket } from "@/lib/expo-types";
import type { ExpoActionResult } from "@/lib/expo";

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
const queue = (tickets: ExpoTicket[] = [ticket()]): ExpoQueue => ({ tickets, serverNow: NOW });
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

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ExpoBoard } = await import("./ExpoBoard");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");

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
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const pickedUpName = (lang: "en" | "my") => new RegExp(`^${ts(lang, "expo.verb.pickedUp")}`);

describe("counter-1 — Picked up waits on its window, and Undo is the way back", () => {
  it("flips the card at once, writes nothing for the window, then writes picked_up once", async () => {
    vi.useFakeTimers();
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: pickedUpName("en") }));
    const card = container.querySelector("article")!;
    expect(card.getAttribute("data-picked")).toBe("true");
    expect(getByRole("button", { name: /^Undo/ })).toBeTruthy();
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
    expect(getByRole("button", { name: /^Undo/ }).getAttribute("aria-busy")).toBe("true");
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
    fireEvent.click(getByRole("button", { name: /^Undo/ }));
    expect(container.querySelector("article")?.getAttribute("data-picked")).toBe("true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.click(getByRole("button", { name: /^Undo/ }));
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
    fireEvent.click(getByRole("button", { name: /^Undo/ }));
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
