/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KitchenQueue, KitchenStop, KitchenTicket } from "@/lib/kitchen-types";
import type { KitchenStopAckResult } from "@/lib/kitchen";
import { ticketKey } from "@/lib/kitchen-rounds";

/**
 * M270 (1) — "Table N left — stop cooking" ON THE BOARD (T18: the wiring a pure module cannot
 * express; the rules are `lib/kds-stop.ts`'s, the read `lib/kitchen-stop-read.ts`'s). What only a
 * render shows: the card stands in its ticket's slot on every station's view; "Got it" hides every
 * card of the clear at the TAP and the answer confirms or takes it back (the optimistic doctrine); a
 * refusal, a throw and a write still out each bring the card back, said in the ONE region; focus
 * leaves with the card to the board's heading; a stop card is work (no guide over it, never "All
 * clear" under it, and a tap aimed at the guide it replaced never acknowledges it); a new one is said
 * once; and a stop read that did not answer keeps the cards.
 */
const NOW = "2026-10-11T18:00:00.000Z";
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
const STAFF_ID = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b";

const ticket = (n: number, min: number, station: "wok" | "drinks" = "wok"): KitchenTicket => ({
  key: ticketKey({ cart_id: `cart-${n}`, fire_batch: `batch-${n}`, fire_at: null }),
  cartId: `cart-${n}`,
  sessionId: `sess-${n}`,
  fireBatch: `batch-${n}`,
  round: { kind: "n", n: 1 },
  stampIso: at(min),
  channel: "dinein",
  label: `T${n}`,
  tableNumber: n,
  customerName: null,
  shortCode: null,
  pickupSlot: null,
  held: false,
  unpaid: false,
  firedAt: at(min),
  lines: [
    {
      id: `line-${n}`,
      menuItemId: `mi-${n}`,
      soldOut: false,
      name: station === "drinks" ? "Lemon Juice" : "Mohinga",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      notes: null,
      state: "fired",
      firedAt: at(min),
      fulfillment: "dinein",
      station,
    },
  ],
});
const stop = (
  clearId: string,
  table: number,
  min: number,
  batch = "b9",
  station: "wok" | "drinks" | null = "wok",
): KitchenStop => ({
  key: `stop|${clearId}|b|${batch}`,
  clearId,
  tableNumber: table,
  label: `T${table}`,
  firedAt: at(min),
  lines: [
    {
      id: `stop-line-${clearId}-${batch}`,
      name: station === "drinks" ? "Lime Juice" : "Shan Noodles",
      nameMy: null,
      qty: 2,
      modifiers: [],
      modifiersMy: [],
      station,
    },
  ],
});
/** #347 r2 — ONE clear that stopped a wok dish AND a drinks dish (the common case). */
const mixedStop = (clearId: string, table: number, min: number): KitchenStop => ({
  ...stop(clearId, table, min, "bm", "wok"),
  lines: [
    {
      id: `${clearId}-noodles`,
      name: "Shan Noodles",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      station: "wok",
    },
    {
      id: `${clearId}-lime`,
      name: "Lime Juice",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      station: "drinks",
    },
  ],
});
const q = (tickets: KitchenTicket[], stops: KitchenStop[] | null): KitchenQueue => ({
  tickets,
  serverNow: NOW,
  thresholds: {
    dineinAmberMin: 30,
    dineinRedMin: 60,
    pickupAmberMin: 30,
    pickupRedMin: 60,
    rechimeSec: 600,
  },
  stats: { avgSecs: 0, servedToday: null },
  served: null,
  stops,
});

let currentQueue = q([], []);
const getKitchenQueue = vi.fn(() => Promise.resolve({ ok: true as const, queue: currentQueue }));
const ackTableClearStop = vi.fn(
  (_: { clearId: string }): Promise<KitchenStopAckResult> =>
    Promise.resolve({ ok: true, status: "ok" }),
);

vi.mock("@/lib/kitchen", () => ({
  getKitchenQueue: () => getKitchenQueue(),
  ackTableClearStop: (a: { clearId: string }) => ackTableClearStop(a),
  bumpTicket: () => Promise.resolve({ ok: true }),
  bumpLine: () => Promise.resolve({ ok: true }),
  fireTicketNow: () => Promise.resolve({ ok: true }),
  recallTicket: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/lib/menu-availability", () => ({
  setItemSoldOut: () => Promise.resolve({ ok: true, soldOut: true }),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
// #347 r2 — an armable chime, so a case can hear the re-chime (`played`); off by default.
// The context RUNS only once an arm settles (the real engine's contract): `armed` is false until then.
let armOk = false;
let ctxRunning = false;
const played = vi.fn();
vi.mock("@/lib/kds-sound", () => ({
  SOFT_LEVEL: 0.4,
  KDS_DEFAULT_VOLUME: 0.8,
  KdsChime: class {
    arm() {
      ctxRunning = armOk;
      return Promise.resolve(armOk);
    }
    armWithin() {
      return this.arm();
    }
    get armed() {
      return ctxRunning;
    }
    subscribe() {
      return () => {};
    }
    play(...a: unknown[]) {
      played(...a);
    }
  },
  getKdsSoundWanted: () => false,
  setKdsSoundWanted: () => {},
}));
vi.mock("./HelpButton", () => ({ HelpButton: () => null }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { KdsBoard } = await import("./KdsBoard");
const { ts } = await import("@/lib/i18n/staff");
const { tf } = await import("@/lib/i18n/fill");
const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
const { GUIDE_ARM_MS } = await import("@/lib/staff-guide");

afterEach(() => {
  cleanup();
  localStorage.clear();
  currentQueue = q([], []);
  getKitchenQueue.mockReset();
  getKitchenQueue.mockImplementation(() => Promise.resolve({ ok: true, queue: currentQueue }));
  ackTableClearStop.mockReset();
  ackTableClearStop.mockImplementation(() => Promise.resolve({ ok: true, status: "ok" }));
  armOk = false;
  ctxRunning = false;
  played.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = (initial: KitchenQueue, staffId: string | null = null) =>
  render(
    <StaffLangProvider lang="en">
      <KdsBoard initial={initial} staffId={staffId} />
    </StaffLangProvider>,
  );
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** The grid's cards in order: a ticket by its table, a stop card as "stop:<table>". */
const gridOrder = (c: HTMLElement) =>
  [...c.querySelectorAll("ul.kds-grid > li")].map((li) =>
    li.classList.contains("kds-ticket-stop")
      ? `stop:${li.querySelector(".kds-id")!.textContent}`
      : li.querySelector(".kds-id")!.textContent,
  );
const stopCards = (c: HTMLElement) => c.querySelectorAll("li.kds-ticket-stop");
const region = () => document.querySelector('.kds-head [role="status"]')!;
const gotIt = (c: HTMLElement, i = 0) =>
  within(stopCards(c)[i] as HTMLElement).getByRole("button", { name: /Got it/ });
const STOP3 = tf("en", "kds.stop", { id: 3 });
/** The board's persisted station (`KdsBoard`'s `STATION_KEY`). */
const STATION_KEY = "mms.kds.station";

describe("M270 (1) — the stop card stands in its ticket's slot", () => {
  it("between the live tickets by its Send's stamp, struck, named by its warn word, with Got it", async () => {
    // Table 1 (10 min ago), Table 3's cleared Send (5 min ago), Table 2 (1 min ago).
    currentQueue = q([ticket(1, -10), ticket(2, -1)], [stop("c3", 3, -5)]);
    const { container } = mount(currentQueue);
    await act(async () => {});
    // MUTATION m270/kds-board/stops-never-slotted: the grid draws no stop card at all.
    expect(gridOrder(container)).toEqual(["Table 1", "stop:Table 3", "Table 2"]);
    const card = stopCards(container)[0]!;
    expect(card.getAttribute("aria-label")).toBe(STOP3);
    expect(card.querySelector(".kds-stop-line")!.textContent).toContain("Shan Noodles");
    // Got it is described by the warn line: two stop cards are two Got its, each told apart.
    const ack = gotIt(container);
    const desc = document.getElementById(ack.getAttribute("aria-describedby")!)!;
    expect(desc.textContent).toContain(STOP3);
    // ALARM without motion: the stop card never wears the arrival flash.
    expect(card.querySelector(".kds-flash")).toBeNull();
  });

  it("#347 (C1) — a station's view draws a stop card only when it stopped one of its dishes (or one nobody can place); All draws every card", async () => {
    currentQueue = q(
      [ticket(1, -10)],
      [
        stop("c3", 3, -5, "b3", "wok"),
        stop("c5", 5, -4, "b5", "drinks"),
        stop("c7", 7, -3, "b7", null),
      ],
    );
    const { container } = mount(currentQueue);
    await act(async () => {});
    expect(gridOrder(container)).toEqual([
      "Table 1",
      "stop:Table 3",
      "stop:Table 5",
      "stop:Table 7",
    ]);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.drinks") }));
    // MUTATION m270/kds-board/station-filter-dropped: the drinks screen shows the wok's stop — and its
    // one Got it would retire it on the wok screen that is actually cooking.
    expect(gridOrder(container)).toEqual(["stop:Table 5", "stop:Table 7"]);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.wok") }));
    expect(gridOrder(container)).toEqual(["Table 1", "stop:Table 3", "stop:Table 7"]);
  });

  it("#347 r2 (C1) — one MIXED clear: the wok view and the drinks view each draw the WHOLE card — every dish it stopped", async () => {
    currentQueue = q([], [mixedStop("c4", 4, -5)]);
    const { container } = mount(currentQueue);
    await act(async () => {});
    const dishes = () =>
      [...stopCards(container)[0]!.querySelectorAll(".kds-stop-line")].map((l) =>
        l.textContent!.includes("Lime") ? "lime" : "noodles",
      );
    for (const st of ["kds.station.drinks", "kds.station.wok"] as const) {
      fireEvent.click(screen.getByRole("button", { name: ts("en", st) }));
      expect(stopCards(container)).toHaveLength(1);
      // MUTATION m270/kds-stop/lines-trimmed: the drinks cook sees only the juice, taps Got it — which
      // acknowledges the whole clear — and the noodles leave the wok's screen unseen.
      expect(dishes()).toEqual(["noodles", "lime"]);
    }
  });

  it("a stop read that did not answer keeps the cards — a card never leaves without a Got it", async () => {
    vi.useFakeTimers();
    currentQueue = q([], [stop("c3", 3, -5)]);
    const { container } = mount(currentQueue);
    currentQueue = q([], null);
    await flush(5_000);
    expect(getKitchenQueue).toHaveBeenCalled();
    expect(stopCards(container)).toHaveLength(1);
  });
});

describe("M270 (1) — Got it: the optimistic doctrine", () => {
  it("every card of the clear leaves at the TAP; focus goes to the heading; a poll while it is out never puts it back; the answer keeps it gone", async () => {
    vi.useFakeTimers();
    // Table 3 had two Sends cooking: two cards, one clear.
    currentQueue = q(
      [ticket(1, -10)],
      [stop("c3", 3, -8, "b1"), stop("c3", 3, -2, "b2"), stop("c5", 5, -4)],
    );
    const write = deferred<KitchenStopAckResult>();
    ackTableClearStop.mockImplementationOnce(() => write.promise);
    const { container } = mount(currentQueue);
    await flush();
    const ack = gotIt(container);
    act(() => ack.focus());
    await act(async () => {
      fireEvent.click(ack);
    });
    expect(ackTableClearStop).toHaveBeenCalledWith({ clearId: "c3" });
    // MUTATION m270/kds-board/no-optimistic-hide: both of Table 3's cards stay up under the finger
    // until the answer — a slow network reads as a Got it that did nothing.
    expect(gridOrder(container)).toEqual(["Table 1", "stop:Table 5"]);
    // MUTATION m270/kds-board/focus-left-on-body: the button that held focus left with its card.
    expect(document.activeElement).toBe(container.querySelector("#kds-h"));
    // A poll lands while the write is out — it read the record before the write committed: the
    // cards stay gone (the hide is the tap's until its own answer).
    await flush(5_000);
    expect(getKitchenQueue).toHaveBeenCalled();
    expect(gridOrder(container)).toEqual(["Table 1", "stop:Table 5"]);
    // The write commits: the record is acknowledged, so the reads after the answer no longer have it.
    currentQueue = q([ticket(1, -10)], [stop("c5", 5, -4)]);
    await act(async () => {
      write.resolve({ ok: true, status: "ok" });
    });
    await flush(5_000);
    expect(gridOrder(container)).toEqual(["Table 1", "stop:Table 5"]);
  });

  it("not_found re-reads: the hide is dropped at the answer, and the read decides", async () => {
    currentQueue = q([], [stop("c3", 3, -5)]);
    ackTableClearStop.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "not_found" }),
    );
    const { container } = mount(currentQueue);
    await act(async () => {});
    // The re-read is held: what stands BEFORE it answers is the last confirmed state.
    const reread = deferred<{ ok: true; queue: KitchenQueue }>();
    getKitchenQueue.mockImplementationOnce(() => reread.promise);
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    // MUTATION m270/kds-board/verdict-unread: not_found would read as acknowledged, and the card
    // stays hidden on a record the RPC never found.
    expect(stopCards(container)).toHaveLength(1);
    await act(async () => {
      reread.resolve({ ok: true, queue: q([], []) });
    });
    expect(stopCards(container)).toHaveLength(0);
  });

  it("a refused Got it brings the card BACK and says why in the ONE region", async () => {
    currentQueue = q([], [stop("c3", 3, -5)]);
    ackTableClearStop.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "Couldn’t update that ticket. Try again.",
        code: "failed",
      }),
    );
    const { container } = mount(currentQueue);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    // MUTATION m270/kds-board/refusal-keeps-hidden: the card that was never acknowledged is gone.
    expect(stopCards(container)).toHaveLength(1);
    expect(region().textContent).toBe(tf("en", "kds.err.line", { x: "Table 3" }));
  });

  it("a Got it still out at the bound: the card comes back HELD, its waiting line said; a re-tap sends nothing; the late ok takes it", async () => {
    vi.useFakeTimers();
    getKitchenQueue.mockImplementation(() => new Promise(() => {}));
    currentQueue = q([], [stop("c3", 3, -5)]);
    const write = deferred<KitchenStopAckResult>();
    ackTableClearStop.mockImplementationOnce(() => write.promise);
    const { container } = mount(currentQueue);
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    expect(stopCards(container)).toHaveLength(0);
    await flush(STAFF_HANG_MS);
    // MUTATION m270/kds-board/unanswered-keeps-hidden: a write that may never land hides the card.
    expect(stopCards(container)).toHaveLength(1);
    expect(region().textContent).toBe(tf("en", "kds.err.waiting", { x: "Table 3" }));
    expect(gotIt(container).getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    expect(ackTableClearStop).toHaveBeenCalledTimes(1);
    await act(async () => {
      write.resolve({ ok: true, status: "ok" });
    });
    await flush();
    expect(stopCards(container)).toHaveLength(0);
  });
});

describe("M270 (1) — a stop card is work", () => {
  it("never 'All clear' over a stop card: the count says the open tickets as they are", async () => {
    currentQueue = q([], [stop("c3", 3, -5)]);
    mount(currentQueue);
    await act(async () => {});
    // MUTATION m270/kds-board/all-clear-over-stop: the region tells the kitchen nothing is waiting
    // while a table that left still waits for its Got it.
    expect(region().textContent).not.toBe(ts("en", "kds.allclear"));
    expect(region().textContent).toBe(tf("en", "kds.open.many", { n: 0 }));
  });

  it("a NEW stop card is said once in the ONE region; one the board was rendered with is not news", async () => {
    vi.useFakeTimers();
    currentQueue = q([ticket(1, -10)], [stop("c5", 5, -6)]);
    mount(currentQueue);
    await flush();
    expect(region().textContent).not.toContain(tf("en", "kds.stop", { id: 5 }));
    // Table 3 is cleared on the counter: its card turns face on the next poll.
    currentQueue = q([ticket(1, -10)], [stop("c5", 5, -6), stop("c3", 3, -5)]);
    await flush(5_000);
    // MUTATION m270/kds-board/arrival-unsaid: no motion, no chime, and no word — a screen reader
    // never hears that a table left.
    expect(region().textContent).toBe(STOP3);
  });

  it("the guide is never offered over a stop card", async () => {
    mount(q([], [stop("c3", 3, -5)]), STAFF_ID);
    await act(async () => {});
    expect(document.querySelector(".kds-guide")).toBeNull();
    expect(screen.queryByRole("group", { name: "Table 11" })).toBeNull();
    expect(stopCards(document.body)).toHaveLength(1);
    // MUTATION m270/kds-board/guide-claimed-over-stop: the mount's claim reads the board as quiet,
    // marks the guide SEEN, and the work pushes it away unread — this person never gets it.
    expect(Object.keys(localStorage).filter((k) => k.startsWith("mms.guide.seen:"))).toEqual([]);
  });

  it("the flip's condition (b): a stop card that replaces the guide holds its Got it for the guide's arm — a tap aimed at Next never acknowledges it", async () => {
    vi.useFakeTimers();
    let clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    currentQueue = q([], []);
    const { container } = mount(currentQueue, STAFF_ID);
    await flush();
    expect(container.querySelector(".kds-guide")).not.toBeNull();
    // Table 3 is cleared: its card takes the guide's place.
    currentQueue = q([], [stop("c3", 3, -5)]);
    await flush(5_000);
    expect(container.querySelector(".kds-guide")).toBeNull();
    clock += GUIDE_ARM_MS - 1;
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    // MUTATION m270/kds-board/landing-unheld: the tap aimed at Next acknowledges a table nobody
    // read — and Got it has no undo. MUTATION m270/kds-board/guide-kept-over-stop: the board keeps
    // the guide "shown" under the stop card, so it never left — and nothing is held.
    expect(ackTableClearStop).not.toHaveBeenCalled();
    expect(stopCards(container)).toHaveLength(1);
    clock += 1;
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    expect(ackTableClearStop).toHaveBeenCalledTimes(1);
  });
});

describe("#347 (Codex P1 · blind C2) — an UNKNOWN first stop read is never 'no stops'", () => {
  it("no stop read has answered: never All clear, never 'Nothing to cook', never the guide (nor its seen-mark)", async () => {
    mount(q([], null), STAFF_ID);
    await act(async () => {});
    // MUTATION m270/kds-board/unknown-read-as-none: the unknown read becomes a confirmed "none" — All
    // clear, the empty state, and the guide claimed over a table that may have left.
    expect(region().textContent).not.toBe(ts("en", "kds.allclear"));
    expect(region().textContent).toBe(tf("en", "kds.open.many", { n: 0 }));
    // MUTATION m270/kds-board/unknown-empty-state: "Nothing to cook" stands over the unknown.
    expect(screen.queryByText(ts("en", "kds.empty"))).toBeNull();
    expect(document.getElementById("kds-empty-h")!.textContent).toBe(ts("en", "kds.stops.unknown"));
    // MUTATION m270/kds-board/unknown-guide-claimed: the guide is offered (and marked seen) over it.
    expect(document.querySelector(".kds-guide")).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("mms.guide.seen:"))).toEqual([]);
  });

  it("#347 r2 (C2) — stop reads that keep failing get the board's OWN stop line; the tickets stay live — no 'not updating', the re-chime still plays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(NOW));
    armOk = true;
    // A ticket nobody has started, 20 minutes old, on a board whose stop read has never answered.
    const base = q([ticket(1, -20)], null);
    currentQueue = { ...base, thresholds: { ...base.thresholds, rechimeSec: 30 } };
    // The server's clock moves with the test's (each poll re-seeds the board's clock from it).
    getKitchenQueue.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        queue: { ...currentQueue, serverNow: new Date(Date.now()).toISOString() },
      }),
    );
    const { container } = mount(currentQueue);
    await flush();
    // Sound on (the circle's own tap arms it).
    await act(async () => {
      fireEvent.click(container.querySelector("[data-kds-sound]")!);
    });
    await flush(1_000);
    const stale = () => container.querySelector(".kds-stop-stale");
    // The server render's read missed (1): not yet a pattern.
    expect(stale()).toBeNull();
    await flush(5_000);
    // MUTATION m270/kds-board/stop-misses-unsaid: a board that cannot hear a table leave keeps a
    // quiet face for as long as the reads fail.
    expect(stale()!.textContent).toBe(ts("en", "kds.stops.unknown"));
    // MUTATION m270/kds-board/stale-unsaid: the warning only SHOWS — static text no screen reader is
    // told about (Codex r3); the one region says it beside the count.
    expect(region().textContent).toContain(ts("en", "kds.stops.unknown"));
    expect(region().querySelector(".sr-only")!.textContent).toContain(
      ts("en", "kds.stops.unknown"),
    );
    // MUTATION m270/kds-board/misses-to-degraded: the WHOLE board freezes over tickets that still
    // land — the frozen line, "take orders on paper", the bar's not-updating, the re-chime muted.
    expect(region().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    expect(stale()!.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    played.mockClear();
    await flush(30_000);
    expect(played).toHaveBeenCalledWith("dinein", true);
    // The first stop read that answers ends it.
    currentQueue = { ...currentQueue, stops: [] };
    await flush(5_000);
    expect(stale()).toBeNull();
  });

  it("#347 r2 — stops known, then reads that keep failing on an EMPTY board: never All clear, never 'Nothing to cook' — the unknown line, said once", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    const { container } = mount(currentQueue);
    await flush();
    expect(region().textContent).toBe(ts("en", "kds.allclear"));
    currentQueue = q([], null);
    await flush(5_000);
    await flush(5_000);
    // MUTATION m270/kds-board/stale-read-as-known: All clear and "Nothing to cook" over a kitchen
    // that cannot hear a table leave — round 1's degrade said it; without it nothing would.
    // The count, and the warning said (visually hidden: the empty state's heading shows it).
    expect(region().textContent).toBe(
      `${tf("en", "kds.open.many", { n: 0 })} ${ts("en", "kds.stops.unknown")}`,
    );
    expect(document.getElementById("kds-empty-h")!.textContent).toBe(ts("en", "kds.stops.unknown"));
    expect(screen.queryByText(ts("en", "kds.empty"))).toBeNull();
    expect(container.querySelector(".kds-stop-stale")).toBeNull();
    expect(region().textContent).not.toContain(ts("en", "out.head.notUpdating"));
    currentQueue = q([], []);
    await flush(5_000);
    expect(region().textContent).toBe(ts("en", "kds.allclear"));
  });

  it("on an EMPTY unknown board the line is the empty state's own — never said twice", async () => {
    vi.useFakeTimers();
    currentQueue = q([], null);
    const { container } = mount(currentQueue);
    await flush(5_000);
    expect(document.getElementById("kds-empty-h")!.textContent).toBe(ts("en", "kds.stops.unknown"));
    // MUTATION m270/kds-board/stale-said-twice: the static line repeats the empty state's own words.
    expect(container.querySelector(".kds-stop-stale")).toBeNull();
    // ONE live region: the unknown-stops empty state (its error tone) is no second one.
    expect(document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(
      1,
    );
    currentQueue = q([], []);
    await flush(5_000);
    expect(region().textContent).toBe(ts("en", "kds.allclear"));
    expect(document.getElementById("kds-empty-h")!.textContent).toBe(ts("en", "kds.empty"));
  });
});

describe("#347 — guard integrity", () => {
  it("a read that STARTED before Got it's answer and still has the record cannot put the card back (afterSeq)", async () => {
    vi.useFakeTimers();
    currentQueue = q([], [stop("c3", 3, -5)]);
    const write = deferred<KitchenStopAckResult>();
    ackTableClearStop.mockImplementationOnce(() => write.promise);
    const { container } = mount(currentQueue);
    await flush();
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    expect(stopCards(container)).toHaveLength(0);
    // A poll STARTS while the write is out (it reads before the write commits) …
    const inFlight = deferred<{ ok: true; queue: KitchenQueue }>();
    getKitchenQueue.mockImplementationOnce(() => inFlight.promise);
    await flush(5_000);
    // … the write answers ok …
    await act(async () => {
      write.resolve({ ok: true, status: "ok" });
    });
    // … and the read lands with the record still in it.
    await act(async () => {
      inFlight.resolve({ ok: true, queue: q([], [stop("c3", 3, -5)]) });
    });
    // MUTATION m270/kds-board/after-seq-zero: every read after the answer counts as fresh, and the
    // stale one puts the acknowledged card back.
    expect(stopCards(container)).toHaveLength(0);
  });

  it.each(["already", "nothing_to_stop"] as const)(
    "%s keeps the card gone until a read that started after the answer — the verdict decides, not the re-read",
    async (status) => {
      currentQueue = q([], [stop("c3", 3, -5)]);
      ackTableClearStop.mockImplementationOnce(() => Promise.resolve({ ok: true, status }));
      const { container } = mount(currentQueue);
      await act(async () => {});
      // The re-read after the answer is held: before it answers, the verdict alone is on screen.
      const reread = deferred<{ ok: true; queue: KitchenQueue }>();
      getKitchenQueue.mockImplementationOnce(() => reread.promise);
      await act(async () => {
        fireEvent.click(gotIt(container));
      });
      // (A not_found here would put the card back: `not_found re-reads`, above.)
      expect(stopCards(container)).toHaveLength(0);
      expect(region().textContent).not.toContain(tf("en", "kds.err.line", { x: "Table 3" }));
      await act(async () => {
        reread.resolve({ ok: true, queue: q([], []) });
      });
      expect(stopCards(container)).toHaveLength(0);
    },
  );
});

describe("#347 (a11y) — a stop card's arrival is never lost in the ONE region", () => {
  it("a later transient notice rides BESIDE it — neither the alarm nor the notice is dropped", async () => {
    vi.useFakeTimers();
    currentQueue = q([ticket(1, -10)], []);
    const { container } = mount(currentQueue);
    await flush();
    // Table 3 is cleared: its card lands on the next poll.
    currentQueue = q([ticket(1, -10)], [stop("c3", 3, -5)]);
    await flush(5_000);
    expect(region().textContent).toBe(STOP3);
    // A bump lands right after — its notice must not take the alarm's place.
    await act(async () => {
      fireEvent.click(container.querySelector(".kds-bump:not(.kds-stop-ack)")!);
    });
    await flush();
    // MUTATION m270/kds-board/news-under-notice: "Table 1 bumped" replaces the only alarm a screen
    // reader would hear.
    expect(region().textContent).toContain(STOP3);
    // MUTATION m270/kds-board/notice-dropped-under-news: the bump's own confirmation is lost.
    expect(region().textContent).toContain(tf("en", "kds.live.bumped", { x: "Table 1" }));
  });

  it("the arrival leaves the region the moment its own card is acknowledged", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    const { container } = mount(currentQueue);
    await flush();
    currentQueue = q([], [stop("c3", 3, -5)]);
    await flush(5_000);
    expect(region().textContent).toBe(STOP3);
    // The server still holds the record when the tap lands (its acknowledgement is the write the
    // tap starts): a read answered now still names table 3, so only the TAP's own retirement can
    // take the words — the read-side retirement (`stopNewsWithin`) cannot stand in for it. With the
    // queue emptied here the re-read after the ack took them too, and the mutant below survived.
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    // MUTATION m270/kds-board/news-outlives-ack: "Table 3 left — stop cooking" stands 8 s over a
    // table already acknowledged.
    expect(region().textContent).not.toContain(STOP3);
  });

  it("Codex r4 — a Got it on ANOTHER tablet: the next read takes the table's words with its card", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    mount(currentQueue);
    await flush();
    currentQueue = q([], [stop("c3", 3, -5), stop("c4", 4, -4, "b4")]);
    await flush(5_000);
    const stop4 = tf("en", "kds.stop", { id: 4 });
    expect(region().textContent).toBe(`${STOP3} ${stop4}`);
    // Table 3 is acknowledged at the bar's tablet; this one only reads it, inside the 8 s dwell.
    currentQueue = q([], [stop("c4", 4, -4, "b4")]);
    await flush(5_000);
    // MUTATION m270/kds-board/remote-ack-unsaid: "Table 3 left — stop cooking" keeps standing over a
    // card that is gone; table 4, still open, keeps its words.
    expect(region().textContent).toBe(stop4);
  });

  it("two tables arrive in one poll: a Got it retires only its own table's words", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    const { container } = mount(currentQueue);
    await flush();
    currentQueue = q([], [stop("c3", 3, -5), stop("c4", 4, -4, "b4")]);
    await flush(5_000);
    const stop4 = tf("en", "kds.stop", { id: 4 });
    expect(region().textContent).toBe(`${STOP3} ${stop4}`);
    currentQueue = q([], [stop("c4", 4, -4, "b4")]);
    const card3 = [...stopCards(container)].findIndex((li) =>
      li.textContent!.includes(tf("en", "kds.table", { id: 3 })),
    );
    await act(async () => {
      fireEvent.click(gotIt(container, card3));
    });
    // MUTATION m270/kds-board/news-ack-drops-all: one Got it silences table 4's alarm too, a card
    // nobody has acknowledged.
    expect(region().textContent).toBe(stop4);
  });

  it("a stop card this station's view does not draw is not news here", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    const { container } = mount(currentQueue);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.drinks") }));
    currentQueue = q([], [stop("c3", 3, -5, "b3", "wok")]);
    await flush(5_000);
    expect(stopCards(container)).toHaveLength(0);
    // MUTATION m270/kds-board/news-every-station: the drinks screen announces a card it never draws.
    expect(region().textContent).not.toContain(STOP3);
  });

  it("#347 Codex r2 — a card the filter hid is said on the first read after the view starts drawing it, and only once", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    const { container } = mount(currentQueue);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.drinks") }));
    currentQueue = q([], [stop("c3", 3, -5, "b3", "wok")]);
    await flush(5_000);
    expect(region().textContent).not.toContain(STOP3);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.wok") }));
    expect(stopCards(container)).toHaveLength(1);
    await flush(5_000);
    // MUTATION m270/kds-board/hidden-marked-said: the read on the drinks view marked it said, so the
    // wok view draws it with no words — no motion, no chime, no alarm at all for a screen reader.
    expect(region().textContent).toBe(STOP3);
    await flush(10_000);
    // Said once: the reads after it never say it again.
    expect(region().textContent).not.toContain(STOP3);
  });

  it("#347 Codex r2 — a RESTORED station: a server-render card it never drew is said once the view draws it", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STATION_KEY, "drinks");
    currentQueue = q([], [stop("c3", 3, -5, "b3", "wok")]);
    const { container } = mount(currentQueue);
    await flush();
    expect(stopCards(container)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.wok") }));
    await flush(5_000);
    // MUTATION m270/kds-board/restored-hidden-said: the server render's card counts as said on a
    // view that never drew it.
    expect(region().textContent).toBe(STOP3);
  });

  it("#347 Codex r2 — a second table inside the first's dwell joins it: both said, the first standing until the newest's dwell ends", async () => {
    vi.useFakeTimers();
    currentQueue = q([], []);
    mount(currentQueue);
    await flush();
    currentQueue = q([], [stop("c3", 3, -5)]);
    await flush(5_000);
    expect(region().textContent).toBe(STOP3);
    currentQueue = q([], [stop("c3", 3, -5), stop("c4", 4, -4, "b4")]);
    await flush(5_000);
    const stop4 = tf("en", "kds.stop", { id: 4 });
    // MUTATION m270/kds-board/news-wave-replaces: table 4's words replace table 3's before its
    // dwell — perhaps before a screen reader said them.
    expect(region().textContent).toBe(`${STOP3} ${stop4}`);
    // Past table 3's own 8 s, both still stand: the dwell restarted for the newest table.
    await flush(4_000);
    expect(region().textContent).toBe(`${STOP3} ${stop4}`);
    await flush(5_000);
    expect(region().textContent).not.toContain(STOP3);
  });

  it("with a refusal already standing, the arrival is said beside it — still ONE region", async () => {
    vi.useFakeTimers();
    currentQueue = q([], [stop("c5", 5, -6)]);
    ackTableClearStop.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "x", code: "failed" }),
    );
    const { container } = mount(currentQueue);
    await flush();
    await act(async () => {
      fireEvent.click(gotIt(container));
    });
    await flush();
    const refused = tf("en", "kds.err.line", { x: "Table 5" });
    expect(region().textContent).toBe(refused);
    currentQueue = q([], [stop("c5", 5, -6), stop("c3", 3, -5)]);
    await flush(5_000);
    // MUTATION m270/kds-board/news-lost-under-err: the refusal hides the arrival entirely.
    expect(region().textContent).toContain(refused);
    expect(region().textContent).toContain(STOP3);
    expect(document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')).toHaveLength(
      1,
    );
  });
});
