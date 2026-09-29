/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useTransition } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FloorSnapshot, FloorTable } from "@/lib/floor-types";

/**
 * Phase 2d · floor — THE FLOOR'S WIRING: the strip, the one mint lock across both zones, the one
 * region's precedence, the "ready to serve" cue, the wait pill's own clock, and focus across a flip.
 *
 * Decision logic is pinned as values in `lib/` (floor-kitchen, floor-rows, floor-tone,
 * staff-labels); this suite pins only what a render can show — who calls the server, how often,
 * where the sentence lands, and which element holds focus.
 */
const NOW = "2026-09-29T19:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const ago = (ms: number) => new Date(NOW_MS - ms).toISOString();

// ── the realtime client: the board subscribes, and nothing here ever fires a change ──
const channel = { on: () => channel, subscribe: () => channel };
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }) },
    realtime: { setAuth() {} },
    channel: () => channel,
    removeChannel() {},
  }),
}));
// ── the poll: each case decides what the next answer is (or that it never comes) ──
let answer: () => Promise<unknown> = () => new Promise(() => {});
vi.mock("@/lib/floor", () => ({ getFloorView: () => answer() }));
const openRegisterOrder = vi.fn();
vi.mock("@/lib/register", () => ({
  openRegisterOrder: (...a: unknown[]) => openRegisterOrder(...a),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
// TICK ISOLATION — every card render is counted, so a clock that re-renders the board is visible.
let cardRenders = 0;
vi.mock("./TableCard", async (importOriginal) => {
  const m = await importOriginal<typeof import("./TableCard")>();
  return {
    ...m,
    TableCard: (p: Parameters<typeof m.TableCard>[0]) => {
      cardRenders += 1;
      return <m.TableCard {...p} />;
    },
  };
});

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CounterMintProvider } = await import("./CounterMint");
const { RegisterStart } = await import("./RegisterStart");
const { FloorBoard } = await import("./FloorBoard");
const { DEFAULT_KDS_THRESHOLDS } = await import("@/lib/kds-urgency");
const { ts } = await import("@/lib/i18n/staff");
const { FLOOR_WAIT_TICK_MS } = await import("./FloorWait");
const { UP_NOTICE_DWELL_MS } = await import("@/lib/floor-kitchen");
const { ERR_DWELL_MS } = await import("@/lib/kds-errors");
/** The board's poll backstop (`FloorBoard`'s own interval; not exported). */
const POLL_MS = 5000;

const REGISTRY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const table = (n: number, over: Partial<FloorTable> = {}): FloorTable => ({
  sessionId: `s${n}`,
  label: String(n),
  tableNumber: n,
  mode: "dinein",
  status: "ordering",
  partySize: 2,
  hostName: null,
  itemCount: 1,
  runningSubtotalCents: 1200,
  paidTotalCents: null,
  refund: null,
  tab: "none",
  tabOverCeiling: false,
  counterRequestedAt: null,
  lastActivityAt: ago(60_000),
  openedAt: ago(20 * 60_000),
  kitchen: null,
  ...over,
});
const snap = (tables: FloorTable[], over: Partial<FloorSnapshot> = {}): FloorSnapshot => ({
  tables,
  counter: [],
  counterTruncated: false,
  serverNow: NOW,
  registry: REGISTRY,
  thresholds: DEFAULT_KDS_THRESHOLDS,
  kitchenUnknown: false,
  ...over,
});
const ok = (s: FloorSnapshot) => () => Promise.resolve({ ok: true, snapshot: s });

function mount(initial: FloorSnapshot, withStart = false) {
  const utils = render(
    <StaffLangProvider lang="en">
      <CounterMintProvider>
        {withStart ? <RegisterStart /> : null}
        <FloorBoard initial={initial} />
      </CounterMintProvider>
    </StaffLangProvider>,
  );
  const section = () => document.getElementById("floor-h")!.closest("section")!;
  const region = () => section().querySelector('[role="status"]')!;
  const tile = (n: number) => section().querySelector<HTMLElement>(`[data-tile="${n}"]`)!;
  return { ...utils, section, region, tile };
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

/**
 * A start that must stay in flight for the case — and is SETTLED when the case ends. React joins
 * every async transition into one entangled action: a promise left pending forever keeps `isPending`
 * true for every LATER transition in the file, and a later case would read its zone as held for a
 * reason that is not its own.
 */
const hanging: Deferred<unknown>[] = [];
function hang() {
  const d = deferred<unknown>();
  hanging.push(d);
  return d.promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  cardRenders = 0;
  answer = () => new Promise(() => {});
});
afterEach(async () => {
  await act(async () => {
    for (const d of hanging.splice(0)) d.resolve({ ok: false, error: "settled by the suite" });
  });
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("the wait pill ticks on its own", () => {
  it("(a) advancing its 15 s tick moves '9 min' to '10 min' with ZERO extra card renders", async () => {
    // The poll never answers, so nothing but the pill's own clock can move the minute.
    const { section } = mount(
      snap([
        table(7, {
          kitchen: {
            notSent: 0,
            inKitchen: 1,
            up: 0,
            done: 0,
            oldestFireAt: ago(9 * 60_000 + 50_000),
          },
        }),
      ]),
    );
    await tick(0);
    const pill = () => section().querySelector(".floor-wait")!;
    expect(pill().textContent).toBe("9 min");
    const before = cardRenders;
    expect(FLOOR_WAIT_TICK_MS).toBe(15_000);
    await tick(FLOOR_WAIT_TICK_MS);
    expect(pill().textContent).toBe("10 min");
    // MUTATION: a 15 s `setNowMs` in FloorBoard → every card re-renders on the tick.
    expect(cardRenders - before).toBe(0);
  });

  it("(i) crossing into amber replays the one-shot pop ONCE; the next tick does not", async () => {
    const { section } = mount(
      snap([
        table(7, {
          kitchen: {
            notSent: 0,
            inKitchen: 1,
            up: 0,
            done: 0,
            oldestFireAt: ago(7 * 60_000 + 50_000),
          },
        }),
      ]),
    );
    await tick(0);
    const pill = () => section().querySelector(".floor-wait")!;
    expect(pill().className).toContain("floor-wait-ok");
    expect(pill().className).not.toContain("mms-pop");
    await tick(FLOOR_WAIT_TICK_MS); // 8:05 — amber
    const popped = pill();
    expect(popped.className).toContain("floor-wait-amber");
    expect(popped.className).toContain("mms-pop");
    await tick(FLOOR_WAIT_TICK_MS); // 8:20 — still amber
    // MUTATION: pop on every tick → a fresh (re-keyed) element each tick.
    expect(pill()).toBe(popped);
  });
});

describe("the wait pill on a FROZEN floor", () => {
  it("(q) holds the last good minute — no extrapolated escalation, no pop — and says what the card's name says", async () => {
    // The poll is failing, so the board cannot know whether the dish came out. Ticking on from the
    // device clock drew '12 min' in red with the alert glyph and a pop over data nobody has, while
    // the card's name kept the poll's '9 min' — a sighted server and a listener told two things.
    // MUTATION: the pill keeps extrapolating while frozen → '12 min', red. MUTATION: the board
    // never tells the card the floor is frozen → the same. And the hold is the READ's instant, not
    // the one the freeze was noticed at: 9:57 + 5 s would be '10 min' beside the name's '9 min'.
    const { section } = mount(
      snap([
        table(7, {
          kitchen: {
            notSent: 0,
            inKitchen: 1,
            up: 0,
            done: 0,
            oldestFireAt: ago(9 * 60_000 + 57_000),
          },
        }),
      ]),
    );
    await tick(0);
    const pill = () => section().querySelector<HTMLElement>(".floor-wait")!;
    const name = () =>
      section().querySelector('.card-textured[data-session-id="s7"]')!.getAttribute("aria-label")!;
    expect(pill().textContent).toBe("9 min");
    answer = () => Promise.resolve({ ok: false, reason: "outage" });
    await tick(POLL_MS);
    await tick(10 * FLOOR_WAIT_TICK_MS);
    expect(pill().textContent).toBe("9 min");
    expect(pill().className).toContain("floor-wait-amber"); // the last read's own level
    expect(pill().className).not.toContain("mms-pop");
    expect(pill().querySelector("svg")).toBeNull();
    expect(name()).toContain(`, ${pill().textContent},`);
  });

  it("(q) a floor that comes back resumes the clock from the new read", async () => {
    const kitchen = {
      notSent: 0,
      inKitchen: 1,
      up: 0,
      done: 0,
      oldestFireAt: ago(9 * 60_000 + 20_000),
    };
    const { section } = mount(snap([table(7, { kitchen })]));
    await tick(0);
    const pill = () => section().querySelector<HTMLElement>(".floor-wait")!;
    answer = () => Promise.resolve({ ok: false, reason: "outage" });
    await tick(POLL_MS);
    await tick(3 * 60_000);
    expect(pill().textContent).toBe("9 min");
    // Over-blocking is as bad as under-blocking: a live read moves the pill again at once.
    answer = () => ok(snap([table(7, { kitchen })], { serverNow: new Date().toISOString() }))();
    await tick(POLL_MS); // 9:20 + 5 s + 3 min + 5 s
    expect(pill().textContent).toBe("12 min");
    expect(pill().className).toContain("floor-wait-red");
  });
});

describe("the strip starts a table through the screen's ONE lock", () => {
  it("(b) a free tile double-tapped in one frame starts ONE table, and lands on its add screen", async () => {
    const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
    openRegisterOrder.mockReturnValue(d.promise);
    const { tile } = mount(snap([]));
    expect(tile(7).tagName).toBe("BUTTON");
    await act(async () => {
      fireEvent.click(tile(7));
      fireEvent.click(tile(7));
    });
    // MUTATION: drop the tap-time ref read in the lock → two starts.
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "table", tableNumber: 7 });
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s1", created: true });
      await d.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s1/add");
  });

  it("(b) a start the server CONVERGED on a seated table (created:false) opens that table, never its add screen", async () => {
    openRegisterOrder.mockResolvedValueOnce({ ok: true, sessionId: "s1", created: false });
    const { tile } = mount(snap([]));
    await act(async () => {
      fireEvent.click(tile(7));
    });
    // MUTATION: always '/add' → staff land on an add screen for a party already seated.
    expect(push).toHaveBeenCalledWith("/staff/table/s1");
  });

  it("(c) Walk-up and a table tile in the SAME frame start one order — one lock for both zones", async () => {
    openRegisterOrder.mockImplementation(() => hang());
    const { tile, container } = mount(snap([]), true);
    const walkup = container.querySelector<HTMLButtonElement>("button.ui-btn")!;
    await act(async () => {
      fireEvent.click(walkup);
      fireEvent.click(tile(7));
    });
    // MUTATION: a per-component lock → Walk-up AND table 7 start.
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    // Every start control on the screen now says it is held; only Walk-up is busy.
    expect(tile(7).getAttribute("aria-disabled")).toBe("true");
    expect(tile(7).getAttribute("aria-busy")).toBeNull();
    expect(walkup.getAttribute("aria-busy")).toBe("true");
  });

  it("(d) a refused start lands in the board's ONE region; focus stays on the tile, which is aria-disabled and never :disabled", async () => {
    const d = deferred<{ ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { tile, region, section } = mount(snap([]));
    tile(7).focus();
    await act(async () => {
      fireEvent.click(tile(7));
    });
    // MUTATION: native `disabled` → focus drops to <body> and `disabled` reads true.
    expect((tile(7) as HTMLButtonElement).disabled).toBe(false);
    expect(tile(7).getAttribute("aria-disabled")).toBe("true");
    expect(tile(7).getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      d.resolve({ ok: false, error: "That table isn’t registered." });
      await d.promise;
    });
    await tick(0);
    // The section's FIRST role=status is the board's region (the lane's dedupe reads it).
    expect(section().querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(region().textContent).toBe("That table isn’t registered.");
    expect(document.activeElement).toBe(tile(7));
    expect(tile(7).getAttribute("aria-disabled")).toBeNull();
  });

  it("(e) a start whose answer never comes back is said as UNKNOWN, and the strip re-arms — no error boundary", async () => {
    const d = deferred<never>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { tile, region } = mount(snap([]));
    await act(async () => {
      fireEvent.click(tile(7));
    });
    await act(async () => {
      d.reject(new TypeError("Failed to fetch"));
      await d.promise.catch(() => {});
    });
    await tick(0);
    // MUTATION: remove the lock's catch → the rejection escapes to the boundary.
    expect(region().textContent).toBe(ts("en", "floor.mint.unknown"));
    expect(tile(7).getAttribute("aria-disabled")).toBeNull();
    openRegisterOrder.mockImplementationOnce(() => hang());
    await act(async () => {
      fireEvent.click(tile(7));
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("(f) a tile that JUST turned free ignores a tap for 600 ms (another tablet cleared it), then starts", async () => {
    openRegisterOrder.mockImplementation(() => hang());
    const { tile } = mount(snap([table(7)]));
    expect(tile(7).tagName).toBe("A");
    answer = ok(snap([]));
    await tick(5000); // the poll: table 7 was cleared elsewhere
    expect(tile(7).tagName).toBe("BUTTON");
    await tick(599);
    await act(async () => {
      fireEvent.click(tile(7));
    });
    // MUTATION: a guard that always allows → the person reaching to OPEN table 7 starts a new one.
    expect(openRegisterOrder).not.toHaveBeenCalled();
    await tick(1);
    await act(async () => {
      fireEvent.click(tile(7));
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
  });

  it("(t) the flip window is SAID: a tile that just turned free is aria-disabled for its 600 ms, then arms", async () => {
    // Phase 2d · review (floor #7) — the guard's refused tap was silent: a tile that looked ready
    // ignored a tap with nothing to tell the person why. Now the window is the held state every
    // start control already speaks (aria-disabled + the dim), never a native disable. MUTATION:
    // drop the window from the tile's held state → the tile reads ready while it refuses.
    const { tile } = mount(snap([table(7)]));
    answer = ok(snap([]));
    await tick(POLL_MS);
    expect(tile(7).tagName).toBe("BUTTON");
    expect(tile(7).getAttribute("aria-disabled")).toBe("true");
    expect((tile(7) as HTMLButtonElement).disabled).toBe(false);
    expect(tile(8).getAttribute("aria-disabled")).toBeNull(); // free all along: never held
    await tick(599);
    expect(tile(7).getAttribute("aria-disabled")).toBe("true");
    await tick(1);
    expect(tile(7).getAttribute("aria-disabled")).toBeNull();
  });

  it("(g) an occupied tile is a link to its table, never a start — and while a start is held its tap goes nowhere", async () => {
    openRegisterOrder.mockImplementation(() => hang());
    const { tile } = mount(snap([table(3, { status: "counter", counterRequestedAt: ago(1000) })]));
    const link = tile(3);
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/staff/table/s3");
    expect(link.getAttribute("data-tone")).toBe("ask");
    expect(link.getAttribute("aria-label")).toBe("View — Table 3 · Pay at counter");
    // Phase 2d · review (floor #5) — what the tile PRINTS is its label's visible half: the number.
    expect(link.querySelector(".floor-tile-n")?.textContent).toBe("3");
    // An ordinary tap is navigation: not prevented, and it starts nothing.
    expect(fireEvent.click(link)).toBe(true);
    expect(openRegisterOrder).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(tile(7));
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    // A start is held: the link's tap is refused, so a landing push is never raced.
    expect(fireEvent.click(tile(3))).toBe(false);
  });

  it("(k) a start that lands AFTER the person left the counter screen never yanks them to it", async () => {
    // They tapped a free tile, then opened a table from a CARD (a link the strip cannot refuse) —
    // the counter screen unmounted. The start still lands; the next poll shows it. MUTATION: push
    // regardless of the screen → they are pulled off the table they chose onto an add screen.
    const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { tile, unmount } = mount(snap([]));
    await act(async () => {
      fireEvent.click(tile(7));
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s1", created: true });
      await d.promise;
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("(l) an UNRELATED action still in flight elsewhere on the counter page never holds the lock", async () => {
    // The expo lane and the approvals queue run their own async transitions on this page. React
    // entangles every pending async transition, so a lock that read `useTransition`'s `pending`
    // stayed held for as long as someone else's action ran — taps went nowhere, every start control
    // dimmed. MUTATION: `held`/`isBusy` read `pending` again → the refused tile stays held.
    function Elsewhere() {
      const [, start] = useTransition();
      return (
        <button
          type="button"
          data-elsewhere=""
          onClick={() => start(async () => void (await hang()))}
        >
          elsewhere
        </button>
      );
    }
    openRegisterOrder.mockResolvedValueOnce({ ok: false, error: "Refused." });
    const utils = render(
      <StaffLangProvider lang="en">
        <CounterMintProvider>
          <Elsewhere />
          <FloorBoard initial={snap([])} />
        </CounterMintProvider>
      </StaffLangProvider>,
    );
    const tile7 = () => utils.container.querySelector<HTMLElement>('[data-tile="7"]')!;
    await act(async () => {
      fireEvent.click(utils.container.querySelector("[data-elsewhere]")!);
    });
    await act(async () => {
      fireEvent.click(tile7());
    });
    await tick(0);
    await tick(0);
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(tile7().getAttribute("aria-disabled")).toBeNull();
    openRegisterOrder.mockImplementationOnce(() => hang());
    await act(async () => {
      fireEvent.click(tile7());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });
});

describe("the ONE region", () => {
  it("(h) food coming out says 'Ready to serve — Table 7' AND rings that card; an ask adds its segment", async () => {
    const up = (n: number) => ({ notSent: 0, inKitchen: 0, up: n, done: 1, oldestFireAt: null });
    const { region, section } = mount(snap([table(7, { kitchen: up(0) }), table(3)]));
    expect(region().textContent).toBe("2 active tables");
    answer = ok(
      snap([
        table(7, { kitchen: up(1) }),
        table(3, { status: "counter", counterRequestedAt: ago(1000) }),
      ]),
    );
    await tick(5000);
    expect(region().textContent).toBe("Ready to serve — Table 7");
    const card7 = section().querySelector('.card-textured[data-session-id="s7"]')!;
    expect(card7.querySelector(".floor-card-pulse")).not.toBeNull();
    // The notice dwells its own named time, then the counts return — with the ask a listener must
    // hear.
    await tick(UP_NOTICE_DWELL_MS);
    expect(region().textContent).toBe("2 active tables · 1 waiting to pay at counter");
  });

  it("(h) a refusal outranks the freeze; the freeze speaks once the refusal's dwell ends", async () => {
    openRegisterOrder.mockResolvedValueOnce({ ok: false, error: "Refused." });
    const { tile, region } = mount(snap([]));
    await act(async () => {
      fireEvent.click(tile(7));
    });
    await tick(0);
    expect(region().textContent).toBe("Refused.");
    answer = () => Promise.resolve({ ok: false, reason: "outage" });
    await tick(POLL_MS);
    // MUTATION: the freeze before the refusal → the refusal vanishes under the freeze.
    expect(region().textContent).toBe("Refused.");
    // The refusal's dwell is the kitchen's (a refused action outlives the poll that follows it).
    await tick(ERR_DWELL_MS - POLL_MS);
    expect(region().textContent).toContain(ts("en", "out.head.cant"));
  });

  it("(h) a first sight of food already up never rings — only a RISE between polls does", async () => {
    const up = { notSent: 0, inKitchen: 0, up: 1, done: 0, oldestFireAt: null };
    const { region, section } = mount(snap([table(7, { kitchen: up })]));
    answer = ok(snap([table(7, { kitchen: up })]));
    await tick(5000);
    expect(region().textContent).toBe("1 active table");
    expect(section().querySelector(".floor-card-pulse")).toBeNull();
  });
});

describe("a kitchen the floor could not read (Phase 2d · review, floor #6)", () => {
  it("(s) is said ONCE in the region, draws no kitchen row, and its return never rings 'Ready to serve'", async () => {
    // A full paid-cart read used to take the whole room down; now the room stays and the kitchen
    // is honestly unknown. MUTATION: drop the region's segment → nothing says why every kitchen row
    // vanished. MUTATION: keep an unknown poll's zeros as the baseline → the kitchen's return reads
    // as food coming out on every table that already had it up.
    const up = (n: number) => ({ notSent: 0, inKitchen: 0, up: n, done: 0, oldestFireAt: null });
    const { region, section } = mount(snap([table(7, { kitchen: up(1) })]));
    expect(region().textContent).toBe("1 active table");
    answer = ok(snap([table(7, { kitchen: null })], { kitchenUnknown: true }));
    await tick(POLL_MS);
    expect(region().textContent).toBe(`1 active table · ${ts("en", "floor.kitchen.unknown")}`);
    expect(section().querySelector(".floor-kitchen")).toBeNull();
    answer = ok(snap([table(7, { kitchen: up(1) })]));
    await tick(POLL_MS);
    expect(region().textContent).toBe("1 active table");
    expect(section().querySelector(".floor-card-pulse")).toBeNull();
  });
});

describe("the poll's refusals", () => {
  it("(p) a console LOCKED on another tab goes to the lock screen — never the login", async () => {
    // `location.assign` itself cannot be spied (jsdom defines it non-configurable), but the
    // `location` global can be stubbed whole. MUTATION: drop the `locked` arm → the poll falls
    // through to the expired-session branch and a locked console lands on the login page.
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    mount(snap([]));
    answer = () => Promise.resolve({ ok: false, reason: "locked" });
    await tick(POLL_MS);
    expect(assign).toHaveBeenCalledWith("/staff/lock");
    expect(assign).not.toHaveBeenCalledWith("/staff/login");
  });
});

describe("focus across a flip", () => {
  it("(j) a focused FREE tile that turns OCCUPIED on a poll keeps focus — now on the link", async () => {
    const { tile } = mount(snap([]));
    tile(7).focus();
    expect(document.activeElement).toBe(tile(7));
    answer = ok(snap([table(7)]));
    await tick(5000);
    expect(tile(7).tagName).toBe("A");
    // MUTATION: drop the strip's refocus → focus is <body>.
    expect(document.activeElement).toBe(tile(7));
  });

  it("(n) a person who clicked something that takes NO focus is not pulled back by a flip", async () => {
    // A click on the page's background, a heading or the region's text blurs the tile with nowhere
    // to go (relatedTarget null) — the same shape as the tile being REPLACED, which is the one case
    // to restore. MUTATION: treat every null-target blur as a removal → focus jumps back to 7.
    const { tile } = mount(snap([]));
    tile(7).focus();
    await act(async () => {
      tile(7).blur();
    });
    expect(document.activeElement).toBe(document.body);
    answer = ok(snap([table(7)]));
    await tick(5000);
    expect(tile(7).tagName).toBe("A");
    expect(document.activeElement).toBe(document.body);
  });

  it("a person who moved focus elsewhere is not pulled back by a flip", async () => {
    const { tile, container } = mount(snap([]), true);
    tile(7).focus();
    const walkup = container.querySelector<HTMLButtonElement>("button.ui-btn")!;
    walkup.focus();
    answer = ok(snap([table(7)]));
    await tick(5000);
    expect(document.activeElement).toBe(walkup);
  });
});

describe("the strip's shape", () => {
  it("(m) the tile that is STARTING keeps full ink and the kit's spinner beside its kept verb; the other held tiles dim", async () => {
    // Walk-up shows a spinner while it starts; the tapped tile must say the same, or a person who
    // tapped one of ten dimmed tiles cannot tell which table is starting. The label is KEPT (the
    // primitive Button's rule), so the name still contains what the tile shows.
    openRegisterOrder.mockImplementation(() => hang());
    const { tile } = mount(snap([]));
    await act(async () => {
      fireEvent.click(tile(7));
    });
    expect(tile(7).getAttribute("aria-busy")).toBe("true");
    // MUTATION: drop the spinner → the busy tile is one more dimmed tile.
    expect(tile(7).querySelector(".ui-btn-spinner[aria-hidden]")).not.toBeNull();
    expect(tile(7).textContent).toBe("7Start");
    expect(tile(7).getAttribute("aria-label")).toBe("Start — Table 7");
    expect(tile(8).getAttribute("aria-disabled")).toBe("true");
    expect(tile(8).querySelector(".ui-btn-spinner")).toBeNull();
    // …and the stylesheet gives the busy tile its ink back AFTER the held rule dims it (equal
    // specificity, so source order decides). Comments stripped; each rule found by what it declares.
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const ruleAt = (sel: string, decl: RegExp) => {
      const re = new RegExp(`(^|\\})\\s*${sel.replace(/[.[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
      const hits = [...css.matchAll(re)].filter((m) => decl.test(m[2]!));
      expect(hits).toHaveLength(1);
      return hits[0]!.index!;
    };
    const dim = ruleAt('.floor-tile[aria-disabled="true"]', /opacity:\s*0\.6/);
    const lit = ruleAt('.floor-tile[aria-busy="true"]', /opacity:\s*1\s*(;|$)/);
    expect(lit).toBeGreaterThan(dim);
  });

  it("(o) a table owing a Send wears the owed mark and says it; the key decodes every glyph on the strip", () => {
    const owes = { notSent: 2, inKitchen: 0, up: 0, done: 0, oldestFireAt: null };
    const { tile, section } = mount(
      snap([
        table(3, { status: "counter", counterRequestedAt: ago(1000) }),
        table(5, { kitchen: owes }),
      ]),
    );
    // MUTATION: drop the mark → an ordering tile reads the same whether or not a Send is owed.
    expect(tile(5).querySelector(".floor-owed-dot[aria-hidden]")).not.toBeNull();
    expect(tile(5).getAttribute("aria-label")).toBe("View — Table 5 · Ordering · 2 not sent");
    expect(tile(3).querySelector(".floor-owed-dot")).toBeNull();
    expect(tile(3).getAttribute("aria-label")).toBe("View — Table 3 · Pay at counter");
    // The key: the ask first, then ordering, then the owed mark — each tile's own word. Hidden from
    // the accessibility tree, because every tile's name already says its word.
    const key = section().querySelector(".floor-key")!;
    expect(key.getAttribute("aria-hidden")).toBe("true");
    expect([...key.querySelectorAll(".floor-key-item")].map((i) => i.textContent)).toEqual([
      ts("en", "floor.status.counter"),
      ts("en", "floor.status.ordering"),
      ts("en", "floor.key.notSent"),
    ]);
    expect(key.querySelectorAll(".floor-key-item svg")).toHaveLength(2);
    expect(key.querySelector(".floor-key-item .floor-owed-dot")).not.toBeNull();
  });

  it("an all-free strip has no key — its tiles already say Start", () => {
    const { section } = mount(snap([]));
    expect(section().querySelector(".floor-key")).toBeNull();
  });

  it("one tile per registered table, in order, named by the verb the free tile shows", () => {
    const { section } = mount(snap([table(4)]));
    const tiles = [...section().querySelectorAll<HTMLElement>("[data-tile]")];
    expect(tiles.map((t) => t.dataset.tile)).toEqual(REGISTRY.map(String));
    const free = tiles[0]!;
    expect(free.getAttribute("aria-label")).toBe("Start — Table 1");
    expect(free.textContent).toBe("1Start");
    // The list is named by the visible label above it, and is a list despite `list-style: none`.
    const list = section().querySelector("ul.floor-strip")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-labelledby")).toBe("floor-strip-h");
    expect(document.getElementById("floor-strip-h")?.textContent).toBe(
      ts("en", "floor.strip.label"),
    );
  });

  it("an empty registry draws no strip and no label — never a dead control", () => {
    const { section } = mount(snap([], { registry: [] }));
    expect(section().querySelector(".floor-strip")).toBeNull();
    expect(document.getElementById("floor-strip-h")).toBeNull();
  });

  it("(r) an empty registry SAYS so where the strip would be, and the empty state promises no table start", () => {
    // Phase 2d · review (floor #3) — with no registered table there is no way to start one, but the
    // quiet room's line said tables appear "the moment … you start one" and the strip's place was a
    // silent gap. MUTATION: drop the note → nothing says why there are no tiles. MUTATION: keep the
    // ordinary subtitle → it promises a start the screen cannot offer.
    const { section } = mount(snap([], { registry: [] }));
    const note = section().querySelector(".floor-strip-none");
    expect(note?.textContent).toBe(ts("en", "floor.strip.none"));
    expect(section().textContent).toContain(ts("en", "floor.tables.emptySubNoTables"));
    expect(section().textContent).not.toContain(ts("en", "floor.tables.emptySub"));
    // …and the ordinary room keeps its ordinary line (over-blocking is as bad as under-blocking).
    cleanup();
    const again = mount(snap([]));
    expect(again.section().querySelector(".floor-strip-none")).toBeNull();
    expect(again.section().textContent).toContain(ts("en", "floor.tables.emptySub"));
  });
});
