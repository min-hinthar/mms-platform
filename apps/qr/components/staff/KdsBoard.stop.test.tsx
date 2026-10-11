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
const stop = (clearId: string, table: number, min: number, batch = "b9"): KitchenStop => ({
  key: `stop|${clearId}|b|${batch}`,
  clearId,
  tableNumber: table,
  label: `T${table}`,
  firedAt: at(min),
  lines: [
    {
      id: `stop-line-${clearId}-${batch}`,
      name: "Shan Noodles",
      nameMy: null,
      qty: 2,
      modifiers: [],
      modifiersMy: [],
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
vi.mock("@/lib/kds-sound", () => ({
  SOFT_LEVEL: 0.4,
  KDS_DEFAULT_VOLUME: 0.8,
  KdsChime: class {
    arm() {
      return Promise.resolve(false);
    }
    armWithin() {
      return this.arm();
    }
    get armed() {
      return false;
    }
    subscribe() {
      return () => {};
    }
    play() {}
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

  it("on EVERY station's view — a table that left is the whole kitchen's news", async () => {
    currentQueue = q([ticket(1, -10)], [stop("c3", 3, -5)]);
    const { container } = mount(currentQueue);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: ts("en", "kds.station.drinks") }));
    // The wok ticket leaves the drinks view; the stop card stays.
    expect(gridOrder(container)).toEqual(["stop:Table 3"]);
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

  it.each(["already", "nothing_to_stop"] as const)(
    "%s is the kitchen having it, never a failure: the card stays gone and nothing is said in warn",
    async (status) => {
      currentQueue = q([], [stop("c3", 3, -5)]);
      ackTableClearStop.mockImplementationOnce(() => Promise.resolve({ ok: true, status }));
      const { container } = mount(currentQueue);
      await act(async () => {});
      currentQueue = q([], []);
      await act(async () => {
        fireEvent.click(gotIt(container));
      });
      expect(stopCards(container)).toHaveLength(0);
      expect(region().textContent).not.toContain(tf("en", "kds.err.line", { x: "Table 3" }));
    },
  );

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
