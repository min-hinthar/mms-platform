/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpoTicket } from "@/lib/expo-types";
import type { FloorTable } from "@/lib/floor-types";

/**
 * A4·2 (blind pass, CRITICAL 1) — the counter screen mounts TWO live boards, and the browser client
 * is a SINGLETON: `RealtimeClient.channel(topic)` returns the existing channel for a repeated topic,
 * and its `.on("postgres_changes")` THROWS once that channel has been subscribed. So the two boards
 * must open two channels. The fake below is the real client's contract on exactly those two points
 * (verified in `@supabase/realtime-js` `RealtimeClient.channel` / `RealtimeChannel.on`), so the
 * shape that shipped first — both boards on "floor" — reproduces here as an unhandled rejection
 * from the second board's effect, and the fix reads as two topics, both subscribed.
 */
const NOW = "2026-09-13T18:00:00.000Z";
const topics: string[] = [];
class FakeChannel {
  joined = false;
  constructor(public topic: string) {}
  on() {
    if (this.joined)
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`,
      );
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    this.joined = true;
    cb?.("SUBSCRIBED");
    return this;
  }
}
const channels = new Map<string, FakeChannel>();
const supa = {
  auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }) },
  realtime: { setAuth() {} },
  channel(topic: string) {
    topics.push(topic);
    let c = channels.get(topic);
    if (!c) {
      c = new FakeChannel(topic);
      channels.set(topic, c);
    }
    return c;
  },
  removeChannel(c: FakeChannel) {
    channels.delete(c.topic);
  },
};
vi.mock("@mms/db", () => ({ browserClient: () => supa }));
// Each board's poll answers from a mutable slot so a test can freeze one lane, or both.
const OUTAGE = { ok: false as const, reason: "outage" as const };
let floorAnswer: unknown = {
  ok: true,
  snapshot: { tables: [], counter: [], counterTruncated: false, serverNow: NOW },
};
let expoAnswer: unknown = { ok: true, queue: { tickets: [], serverNow: NOW } };
vi.mock("@/lib/floor", () => ({ getFloorView: () => Promise.resolve(floorAnswer) }));
vi.mock("@/lib/expo", () => ({
  getExpoQueue: () => Promise.resolve(expoAnswer),
  setTogoStatus: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
// ── Phase 2d · bell ── the floor's cards are links; and every ring the provider decides to PLAY is
// recorded on the real `playCounter` (the engine behind it stays real, over the fake context below).
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("@/lib/counter-sound", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/counter-sound")>();
  return { ...real, playCounter: vi.fn(real.playCounter) };
});

const { StaffLangProvider } = await import("./StaffLangProvider");
const { LiveConnectionProvider } = await import("./LiveConnection");
const { FloorBoard } = await import("./FloorBoard");
const { ExpoBoard } = await import("./ExpoBoard");
const { ts } = await import("@/lib/i18n/staff");
const { RING_GAP_MS: RING_GAP_MS_LOCAL } = await import("@/lib/counter-attention");
const { CounterBellProvider } = await import("./CounterBell");
const counterSound = await import("@/lib/counter-sound");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  floorAnswer = {
    ok: true,
    snapshot: { tables: [], counter: [], counterTruncated: false, serverNow: NOW },
  };
  expoAnswer = { ok: true, queue: { tickets: [], serverNow: NOW } };
});

const bag = (id: string) => ({
  orderId: id,
  label: "Order",
  tableNumber: null,
  mode: "pickup" as const,
  customerName: "Nilar",
  customerPhone: null,
  shortCode: id.slice(-6).toUpperCase(),
  status: "preparing" as const,
  kitchen: "cooking" as const,
  pickupSlot: null,
  arrivedAt: null,
  lines: [
    {
      id: `l-${id}`,
      name: "Mohinga",
      nameMy: null,
      qty: 1,
      modifiers: [],
      modifiersMy: [],
      fulfillment: "togo" as const,
      notes: null,
    },
  ],
  createdAt: NOW,
});
const laneStatus = () =>
  document.getElementById("expo-h")?.closest("section")?.querySelector('[role="status"]');
const floorStatus = () =>
  document.getElementById("floor-h")?.closest("section")?.querySelector('[role="status"]');

describe("the counter screen's two live boards on one singleton client", () => {
  it("open TWO channels, both subscribed — never the floor's channel twice", async () => {
    render(
      <StaffLangProvider lang="en">
        <FloorBoard
          initial={{ tables: [], counter: [], counterTruncated: false, serverNow: NOW }}
        />
        <ExpoBoard initial={{ tickets: [], serverNow: NOW }} />
      </StaffLangProvider>,
    );
    await waitFor(() => expect(topics.length).toBe(2));
    expect(new Set(topics).size).toBe(2);
    expect(topics).toContain("floor");
    for (const t of topics) expect(channels.get(t)?.joined, t).toBe(true);
  });
});

describe("the lane's announcements — heard, never twice (Codex round 1 on A4·2)", () => {
  /**
   * The blind pass measured three regions flipping to the same frozen sentence in one second, and
   * the first cut answered by making the lane's counts and freeze plain text — which left a
   * screen-reader user with no word for a bag arriving, a bag leaving, or a lane that froze while
   * the floor stayed live. The lane's ONE region now carries its state, visually hidden, DEDUPED:
   * the counts as they change, and the freeze only while the floor is live — when the floor is
   * frozen too, its region is the screen's one voice for that and the lane's falls silent.
   */
  const mount = (tickets: ReturnType<typeof bag>[]) =>
    render(
      <StaffLangProvider lang="en">
        <LiveConnectionProvider>
          <FloorBoard
            initial={{ tables: [], counter: [], counterTruncated: false, serverNow: NOW }}
          />
          <ExpoBoard initial={{ tickets, serverNow: NOW }} />
        </LiveConnectionProvider>
      </StaffLangProvider>,
    );
  const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  it("says how many bags are waiting, and says so again when the count changes", async () => {
    vi.useFakeTimers();
    mount([bag("11111111-1111-4111-8111-111111111111")]);
    await tick(1);
    expect(laneStatus()?.textContent).toContain(ts("en", "expo.count.one").replace("{n}", "1"));
    expoAnswer = {
      ok: true,
      queue: {
        tickets: [
          bag("11111111-1111-4111-8111-111111111111"),
          bag("22222222-2222-4222-8222-222222222222"),
        ],
        serverNow: NOW,
      },
    };
    await tick(5_000);
    expect(laneStatus()?.textContent).toContain(ts("en", "expo.count.many").replace("{n}", "2"));
  });

  it("announces an expo-only freeze while the floor is live, and falls silent once the floor freezes too", async () => {
    vi.useFakeTimers();
    mount([]);
    await tick(1);
    expoAnswer = OUTAGE;
    await tick(5_000);
    // The lane froze, the floor did not: the lane's region carries the freeze.
    expect(laneStatus()?.textContent).toContain(ts("en", "out.head.cant"));
    expect(floorStatus()?.textContent ?? "").not.toContain(ts("en", "out.head.cant"));
    floorAnswer = OUTAGE;
    await tick(5_000);
    // Both frozen: the floor's region is the screen's one voice; the lane's says nothing.
    expect(floorStatus()?.textContent).toContain(ts("en", "out.head.cant"));
    expect(laneStatus()?.textContent ?? "").toBe("");
  });
});

// ── Phase 2d · bell ──
describe("the counter bell on the counter's two boards (owner decision 5c)", () => {
  /**
   * Both boards under the REAL CounterBellProvider, over a fake AudioContext. A bell that rings
   * falsely or twice teaches the family to mute it, so each case is a way it could: the mount, a
   * StrictMode double mount, an outage and its recovery, a fact that drops out and comes back, two
   * boards answering on one tick. Every ring the provider decides to PLAY lands on `playCounter`.
   */
  const FloorTableBase = {
    label: "7",
    tableNumber: 7,
    mode: "dinein" as const,
    partySize: 2,
    hostName: null,
    itemCount: 2,
    runningSubtotalCents: 2400,
    paidTotalCents: null,
    refund: null,
    tab: "none" as const,
    tabOverCeiling: false,
    lastActivityAt: NOW,
  };
  const ASK = "2026-09-13T17:55:00.000Z";
  const askingTable = (sessionId: string, tableNumber = 7): FloorTable => ({
    ...FloorTableBase,
    sessionId,
    tableNumber,
    label: String(tableNumber),
    status: "counter" as const,
    counterRequestedAt: ASK,
  });
  const floorOf = (tables: FloorTable[]) => ({
    ok: true,
    snapshot: { tables, counter: [], counterTruncated: false, serverNow: NOW },
  });
  const laneOf = (tickets: ExpoTicket[]) => ({
    ok: true,
    queue: { tickets, serverNow: NOW },
  });
  const arrived = (id: string): ExpoTicket => ({
    ...bag(id),
    arrivedAt: "2026-09-13T17:58:00.000Z",
  });
  const cooked = (id: string): ExpoTicket => ({ ...bag(id), kitchen: "done" });
  // Fresh ids for every case: what the counter home has heard is DOCUMENT-scoped
  // (`counterHeard`, by design — a remount must not re-ring), and every case in this file shares one
  // document, so a key heard in an earlier case would read as already heard in the next.
  let seq = 0;
  const uid = () => {
    seq += 1;
    const h = seq.toString(16).padStart(8, "0");
    return `${h}-0000-4000-8000-${h.padStart(12, "0")}`;
  };
  let B1 = "";
  let B2 = "";
  let B3 = "";
  let B4 = "";
  beforeEach(() => {
    [B1, B2, B3, B4] = [uid(), uid(), uid(), uid()];
  });

  // The fake context: a browser's `statechange` on every move, `resume` runs it.
  const contexts: Array<EventTarget & { state: AudioContextState }> = [];
  class FakeCtx extends EventTarget {
    state: AudioContextState = "suspended";
    currentTime = 0;
    destination = {};
    constructor() {
      super();
      contexts.push(this);
    }
    resume() {
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
      return Promise.resolve();
    }
    createOscillator() {
      return { type: "", frequency: {}, connect: (d: unknown) => d, start() {}, stop() {} };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (d: unknown) => d,
      };
    }
  }
  /** The engine is a module singleton: one context for the whole file. */
  const ctx = () => contexts[0] ?? null;
  const setState = (state: AudioContextState) => {
    ctx()!.state = state;
    ctx()!.dispatchEvent(new Event("statechange"));
  };

  const played = counterSound.playCounter as unknown as ReturnType<
    typeof vi.fn<(k: string) => void>
  >;

  /** The bell ON, as a chip tap leaves it: wanted, and the context running. */
  async function bellOn() {
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeCtx });
    await counterSound.armWithin();
    counterSound.setCounterWanted(true);
    played.mockClear();
  }

  function mountCounter(
    floorInit: FloorTable[],
    laneInit: ExpoTicket[],
    opts: { strict?: boolean; laneOutage?: boolean } = {},
  ) {
    const tree = (
      <StaffLangProvider lang="en">
        <LiveConnectionProvider>
          <CounterBellProvider>
            <FloorBoard
              initial={{
                tables: floorInit,
                counter: [],
                counterTruncated: false,
                serverNow: NOW,
              }}
            />
            <ExpoBoard
              initial={{ tickets: opts.laneOutage ? [] : laneInit, serverNow: NOW }}
              initialOutage={opts.laneOutage}
            />
          </CounterBellProvider>
        </LiveConnectionProvider>
      </StaffLangProvider>
    );
    return render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }
  const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const rings = async () => played.mock.calls.map((c) => c[0]);

  afterEach(async () => {
    if (ctx() && ctx()!.state !== "suspended") setState("suspended");
    counterSound.setCounterWanted(false);
  });

  it("the mount rings NOTHING for the asks, arrivals and finished bags already on screen", async () => {
    await bellOn();
    vi.useFakeTimers();
    floorAnswer = floorOf([askingTable(B1)]);
    expoAnswer = laneOf([arrived(B2), cooked(B3)]);
    mountCounter([askingTable(B1)], [arrived(B2), cooked(B3)]);
    await tick(5_000);
    await tick(5_000);
    expect(await rings()).toEqual([]);
    // …and the ear is live, not deaf: a NEW ask rings once.
    floorAnswer = floorOf([askingTable(B1), askingTable(B4, 9)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest"]);
  });

  it("a floor ask and a lane arrival on ONE tick ring one guest phrase, not two", async () => {
    // MUTATION (counter-bell/the-bell-never-coalesces): the provider skips `mayRing` — two bells for
    // one rush, one from each board.
    await bellOn();
    vi.useFakeTimers();
    mountCounter([], [bag(B2)]);
    floorAnswer = floorOf([askingTable(B1)]);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest"]);
  });

  it("one ring per new fact: the same arrival dropping out and coming back rings nothing", async () => {
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([bag(B2)]);
    mountCounter([], [bag(B2)]);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    expoAnswer = laneOf([]);
    await tick(5_000);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    await tick(RING_GAP_MS_LOCAL);
    expect(await rings()).toEqual(["guest"]);
  });

  it("nothing rings while the bell is PAUSED (wanted, the context suspended) — or off", async () => {
    // MUTATION (counter-bell/the-bell-ignores-the-posture): the provider plays whatever the chip
    // says — a slept tablet's rings are queued into a suspended context and burst out on the next tap.
    await bellOn();
    vi.useFakeTimers();
    mountCounter([], [bag(B2)]);
    act(() => setState("suspended"));
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    expect(await rings()).toEqual([]);
    // Off (nobody wants it) with the context running: silent too.
    act(() => setState("running"));
    act(() => counterSound.setCounterWanted(false));
    floorAnswer = floorOf([askingTable(B1)]);
    await tick(5_000);
    expect(await rings()).toEqual([]);
  });

  it("a StrictMode double mount rings nothing — and the next new fact on each board rings once", async () => {
    await bellOn();
    vi.useFakeTimers();
    floorAnswer = floorOf([askingTable(B1)]);
    expoAnswer = laneOf([arrived(B2)]);
    mountCounter([askingTable(B1)], [arrived(B2)], { strict: true });
    await tick(5_000);
    expect(await rings()).toEqual([]);
    // The FLOOR's poll still runs after StrictMode's replayed effects (its `alive` guard is re-armed
    // at setup), so a new ask there is heard…
    floorAnswer = floorOf([askingTable(B1), askingTable(B4, 9)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest"]);
    // …and so is the lane's, a gap later.
    await tick(RING_GAP_MS_LOCAL);
    expoAnswer = laneOf([arrived(B2), arrived(B3)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest", "guest"]);
  });

  it("an outage and its recovery: a fact seen before rings nothing; one first seen after rings once", async () => {
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([arrived(B2)]);
    mountCounter([], [arrived(B2)]);
    expoAnswer = OUTAGE;
    await tick(5_000);
    await tick(5_000);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    expect(await rings()).toEqual([]);
    expoAnswer = OUTAGE;
    await tick(5_000);
    expoAnswer = laneOf([arrived(B2), cooked(B3)]);
    await tick(5_000);
    expect(await rings()).toEqual(["food"]);
  });

  it("a lane that mounted INTO an outage seeds on its first good poll — the bags already waiting ring nothing", async () => {
    // MUTATION (by hand, red-first): seed the lane from its empty placeholder — every arrived bag
    // rings the moment the lane recovers.
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([arrived(B2), cooked(B3)]);
    mountCounter([], [], { laneOutage: true });
    await tick(5_000);
    expect(await rings()).toEqual([]);
    expoAnswer = laneOf([arrived(B2), cooked(B3), arrived(B1)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest"]);
  });

  it("the card the bell rang for takes the one-shot ring (and only that card), for its second", async () => {
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([bag(B2), bag(B3)]);
    mountCounter([], [bag(B2), bag(B3)]);
    await tick(5_000); // the subscribe's catch-up read and the first poll, both with nothing new
    const cardOf = (id: string) =>
      [...document.querySelectorAll<HTMLElement>("section article")].find((a) =>
        a.querySelector(`[data-expo-slot="${id}"]`),
      );
    expoAnswer = laneOf([arrived(B2), bag(B3)]);
    await tick(5_000);
    expect(cardOf(B2)?.querySelectorAll(":scope > .floor-card-pulse")).toHaveLength(1);
    expect(cardOf(B3)?.querySelectorAll(":scope > .floor-card-pulse")).toHaveLength(0);
    // Sound is never the only feedback: the ring shows with the bell OFF too.
    act(() => setState("suspended"));
    expoAnswer = laneOf([arrived(B2), arrived(B3)]);
    await tick(5_000);
    expect(cardOf(B3)?.querySelectorAll(":scope > .floor-card-pulse")).toHaveLength(1);
    await tick(1_100);
    expect(document.querySelectorAll(".floor-card-pulse")).toHaveLength(0);
  });

  it("a REMOUNT carrying the page's first snapshot (Back restores it) never re-rings what an earlier mount rang for", async () => {
    // Red before the document-level set: each mount seeded from its own `initial`, so a counter home
    // restored by Back (the App Router's client cache hands back the FIRST load's props) rang again
    // for every ask and arrival it had already rung for since the page opened.
    await bellOn();
    vi.useFakeTimers();
    const firstLoad = { floor: [] as FloorTable[], lane: [bag(B2)] };
    floorAnswer = floorOf(firstLoad.floor);
    expoAnswer = laneOf(firstLoad.lane);
    const first = mountCounter(firstLoad.floor, firstLoad.lane);
    await tick(5_000);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    await tick(RING_GAP_MS_LOCAL);
    floorAnswer = floorOf([askingTable(B1)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest", "guest"]);
    // Into a table and Back: the boards remount on the page's FIRST snapshot, and the room still
    // holds the ask and the arrival the bell already rang for.
    first.unmount();
    mountCounter(firstLoad.floor, firstLoad.lane);
    await tick(5_000);
    await tick(5_000);
    expect(await rings()).toEqual(["guest", "guest"]);
    // …and the returning ear is not deaf: a fact it has never heard rings once.
    expoAnswer = laneOf([arrived(B2), cooked(B3)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest", "guest", "food"]);
  });

  it("a lane poll that lands after the counter home was left rings nothing", async () => {
    // Red before the fix: the in-flight `getExpoQueue` resolved on /staff/table/7, and the armed,
    // document-scoped engine rang the counter bell on a page that has none (owner decision 5c).
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([bag(B2)]);
    const view = mountCounter([], [bag(B2)]);
    await tick(5_000);
    let answer: (v: unknown) => void = () => {};
    expoAnswer = new Promise((resolve) => {
      answer = resolve;
    });
    await tick(5_000); // the next lane poll is on the wire
    view.unmount();
    await act(async () => {
      answer(laneOf([arrived(B2)]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await rings()).toEqual([]);
  });

  it("a lane that unmounts under a LIVE provider rings nothing and lights nothing for its late poll", async () => {
    // Red before ExpoBoard's own `alive` guard (by hand): the provider is still mounted, so its guard
    // cannot help — the lane's own must (a re-parent across a breakpoint unmounts the board alone).
    await bellOn();
    vi.useFakeTimers();
    const tree = (lane: boolean) => (
      <StaffLangProvider lang="en">
        <LiveConnectionProvider>
          <CounterBellProvider>
            {lane && <ExpoBoard initial={{ tickets: [bag(B2)], serverNow: NOW }} />}
          </CounterBellProvider>
        </LiveConnectionProvider>
      </StaffLangProvider>
    );
    expoAnswer = laneOf([bag(B2)]);
    const view = render(tree(true));
    await tick(5_000);
    let answer: (v: unknown) => void = () => {};
    expoAnswer = new Promise((resolve) => {
      answer = resolve;
    });
    await tick(5_000);
    view.rerender(tree(false));
    await act(async () => {
      answer(laneOf([arrived(B2)]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await rings()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rings while the tab is HIDDEN (owner decision 5c) — the counter is across the room, not at the screen", async () => {
    // MUTATION (counter-bell/a-hidden-tab-is-silent): the provider returns early on `document.hidden`.
    await bellOn();
    vi.useFakeTimers();
    expoAnswer = laneOf([bag(B2)]);
    mountCounter([], [bag(B2)]);
    await tick(5_000);
    hideTab();
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(document.hidden).toBe(true);
    expoAnswer = laneOf([arrived(B2)]);
    await tick(5_000);
    expect(await rings()).toEqual(["guest"]);
  });
});

/** Stub the tab hidden (an own property shadows jsdom's getter); `showTab` restores the getter. */
function hideTab() {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
}
function showTab() {
  delete (document as { visibilityState?: unknown }).visibilityState;
  delete (document as { hidden?: unknown }).hidden;
}
afterEach(showTab);
