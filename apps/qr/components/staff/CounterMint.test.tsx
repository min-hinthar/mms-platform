/** @vitest-environment jsdom */
import { startTransition, type MouseEvent } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import type { TablePaneApi } from "./TablePaneContext";

/**
 * Phase 2d · review — THE MINT LOCK AGAINST THE PANE (blind review, floor #1).
 *
 * A start in flight, then the cashier picks a table in the counter's split pane (a floor card, the
 * pane's own "go back" / namesake button, Back / Forward). Nothing unmounts — the pane is beside
 * the floor — so the old "is the screen still here" check waved the landing through, and the
 * closure's `pane` was the render that TAPPED: a new session pushed its add screen over the table
 * they had just chosen, and a converged one replaced it in the pane.
 *
 * The pane here is a stand-in context whose selection the case moves — the one fact the provider
 * reads — so each case names exactly which selection the person made while the start was out.
 */
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const openRegisterOrder = vi.fn();
const push = vi.fn();
vi.mock("@/lib/register", () => ({
  openRegisterOrder: (...a: unknown[]) => openRegisterOrder(...a),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { TablePaneContext } = await import("./TablePaneContext");
const { CounterMintProvider, useCounterMint } = await import("./CounterMint");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Landing = { ok: true; sessionId: string; created: boolean };
const openSession = vi.fn((_id: string, _hint: unknown) => true);

/** Start table 7 through the ONE lock; `held` mirrors what every start control would say. */
function StartTable7() {
  const mint = useCounterMint();
  return (
    <button
      type="button"
      aria-disabled={mint.held || undefined}
      onClick={() =>
        mint.run(
          "table-7",
          { kind: "table", tableNumber: 7 },
          { onStart: () => {}, onRefusal: () => {}, onResolved: () => {} },
        )
      }
    >
      start 7
    </button>
  );
}

/** The pane's selection is the case's to move: a re-render with a new `selectedId` is the person
 *  picking a table (a card, the pane's own pick, Back) while the start is out. `selectionGen` is
 *  held at 0 unless a case walks a `path` — so the id comparison is pinned on its own. */
function Pane({
  selectedId,
  selectionGen = 0,
}: {
  selectedId: string | null;
  selectionGen?: number;
}) {
  const api: TablePaneApi = {
    selectedId,
    selectionGen,
    openFromCard: (_e: MouseEvent<HTMLElement>) => {},
    openSession: (id, hint) => {
      openSession(id, hint);
      return true;
    },
    publishFloor: () => {},
  };
  return (
    <TablePaneContext.Provider value={api}>
      <CounterMintProvider>
        <StartTable7 />
      </CounterMintProvider>
    </TablePaneContext.Provider>
  );
}

async function startThenLand(opts: {
  initial: string | null;
  /** What the person picks in the pane while the start is out (undefined: nothing). */
  moveTo?: string | null;
  /** Phase 2d · Codex round 1 — a walk of picks with the generation the real split publishes: a
   *  new one per pick of a table not already shown AND per close, kept by a re-tap. */
  path?: readonly (string | null)[];
  landing: Landing;
}) {
  const d = deferred<Landing>();
  openRegisterOrder.mockReturnValueOnce(d.promise);
  const { rerender } = render(<Pane selectedId={opts.initial} />);
  const button = () => screen.getByRole("button", { name: "start 7" });
  await act(async () => {
    fireEvent.click(button());
  });
  expect(openRegisterOrder).toHaveBeenCalledTimes(1);
  expect(button().getAttribute("aria-disabled")).toBe("true");
  if (opts.moveTo !== undefined) {
    const to = opts.moveTo;
    await act(async () => rerender(<Pane selectedId={to} />));
  }
  let shown = opts.initial;
  let gen = 0;
  for (const to of opts.path ?? []) {
    if (to !== shown) gen += 1;
    shown = to;
    const g = gen;
    await act(async () => rerender(<Pane selectedId={to} selectionGen={g} />));
  }
  await act(async () => {
    d.resolve(opts.landing);
    await d.promise;
  });
  await act(async () => {});
  return { button };
}

describe("CounterMint — a start that lands after the person picked a table in the pane", () => {
  it("a NEW session never pushes its add screen over the table they chose — and the lock re-arms", async () => {
    // MUTATION: drop the selection check → push('/staff/table/s-new/add') yanks them off table B.
    // MUTATION: compare against the closure's `pane` (the render that tapped) → the same push.
    const { button } = await startThenLand({
      initial: null,
      moveTo: "s-B",
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).not.toHaveBeenCalled();
    // MUTATION: skip the re-arm → `landed` stays true, `finally` never releases, every start
    // control on the screen stays held for good.
    expect(button().getAttribute("aria-disabled")).toBeNull();
    openRegisterOrder.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("a CONVERGED session never replaces the table they chose in the pane", async () => {
    const { button } = await startThenLand({
      initial: "s-A",
      moveTo: "s-B",
      landing: { ok: true, sessionId: "s-7", created: false },
    });
    expect(openSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(button().getAttribute("aria-disabled")).toBeNull();
  });

  it("closing the pane is a move too — nothing is pushed over the floor they went back to", async () => {
    await startThenLand({
      initial: "s-A",
      moveTo: null,
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).not.toHaveBeenCalled();
  });

  // Over-blocking is as bad as under-blocking: the ordinary start must still go where it went.
  it("an untouched pane still lands a NEW session on its add screen", async () => {
    await startThenLand({
      initial: "s-A",
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s-new/add");
  });

  it("an untouched pane still opens a CONVERGED session in the pane", async () => {
    await startThenLand({
      initial: null,
      landing: { ok: true, sessionId: "s-7", created: false },
    });
    expect(openSession).toHaveBeenCalledWith("s-7", { counter: false, display: "7" });
    expect(push).not.toHaveBeenCalled();
  });

  it("re-picking the table already shown is not a move — the new session still lands", async () => {
    await startThenLand({
      initial: "s-A",
      moveTo: "s-A",
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s-new/add");
  });
});

/**
 * Phase 2d · Codex round 1 (mint) — a move that COMES BACK. The id at the answer equals the id at
 * the tap (A → B → A; the floor → a table → ✕), so an id comparison alone reads "never moved" and
 * lands the start over the pane the person has been working in. The pane's selection generation
 * moves on every pick and every close, and the lock compares it too.
 */
describe("CounterMint — a start that lands after the pane moved and came back", () => {
  it("A → B → A never pushes the new session's add screen — and the lock re-arms", async () => {
    // MUTATION: drop the generation comparison → A at the tap, A at the answer: the push lands.
    const { button } = await startThenLand({
      initial: "s-A",
      path: ["s-B", "s-A"],
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).not.toHaveBeenCalled();
    expect(button().getAttribute("aria-disabled")).toBeNull();
  });

  it("the floor → a table → ✕ never pushes over the floor", async () => {
    await startThenLand({
      initial: null,
      path: ["s-A", null],
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("A → B → A never opens a CONVERGED session over the table they came back to", async () => {
    await startThenLand({
      initial: "s-A",
      path: ["s-B", "s-A"],
      landing: { ok: true, sessionId: "s-7", created: false },
    });
    expect(openSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("a re-tap of the table shown keeps its generation — the new session still lands", async () => {
    await startThenLand({
      initial: "s-A",
      path: ["s-A"],
      landing: { ok: true, sessionId: "s-new", created: true },
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s-new/add");
  });
});

/**
 * Phase 2g · reader (D1) — the mint no longer looks at the card reader. Phase 2d's Codex round 2
 * refused a tap and stood a landing down while the pane's reader collected (the landing's route swap
 * unmounted the collect panel and its poll); the poll lives in `ReaderCollectProvider` now, above
 * every route, so the mint's API has nothing to ask — `TablePaneApi` carries no `startHeld` — and a
 * start mid-collect is an ordinary start. Its end-to-end proof (the start lands AND the poll survives
 * the route swap) is `CounterSplit.integration.test`'s, against the real split and provider.
 */

/**
 * Phase 2h (P2fc · LEARNINGS #158 · #200) — the start is no TRANSITION and is BOUNDED. Under
 * `startTransition(async …)` its lock could only release when the raw action answered, and the
 * landing's `router.push` could not commit while any async transition on the tab hung. Now the busy
 * start lets go at STAFF_HANG_MS with "no answer yet", and the LATE answer still lands. Until it
 * does, no other start goes (S2 critic D3): the copy says "don't start it again", and a second start
 * would only queue behind the stuck one and land as a duplicate order.
 */
describe("CounterMint — Phase 2h: the start is bounded, and its late answer lands", () => {
  const settle: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => {
      for (const s of settle.splice(0)) s();
    });
    vi.useRealTimers();
    // A case whose queued answer was never asked for (a refused tap) must not hand it to the next.
    openRegisterOrder.mockReset();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const onRefusal = vi.fn();
  const onResolved = vi.fn();
  function StartWith({ id, table }: { id: "table-7" | "walkup"; table?: number }) {
    const mint = useCounterMint();
    return (
      <button
        type="button"
        aria-disabled={mint.startHeld || undefined}
        aria-busy={mint.minting === id || undefined}
        data-waiting={mint.waiting ?? undefined}
        data-held={mint.held ? "" : undefined}
        onClick={() =>
          mint.run(
            id,
            table === undefined ? { kind: "walkup" } : { kind: "table", tableNumber: table },
            { onStart: () => {}, onRefusal, onResolved },
          )
        }
      >
        {id}
      </button>
    );
  }
  function Screen({ selectedId }: { selectedId: string | null }) {
    const api: TablePaneApi = {
      selectedId,
      selectionGen: 0,
      openFromCard: () => {},
      openSession: () => false,
      publishFloor: () => {},
    };
    return (
      <TablePaneContext.Provider value={api}>
        <CounterMintProvider>
          <StartWith id="walkup" />
          <StartWith id="table-7" table={7} />
        </CounterMintProvider>
      </TablePaneContext.Provider>
    );
  }
  /** The counter screen; `move` is the person picking a table in the pane while a start is out. */
  function mount() {
    onRefusal.mockReset();
    onResolved.mockReset();
    const { rerender } = render(<Screen selectedId={null} />);
    return { move: (to: string | null) => act(async () => rerender(<Screen selectedId={to} />)) };
  }
  const walkup = () => screen.getByRole("button", { name: "walkup" });
  const table7 = () => screen.getByRole("button", { name: "table-7" });

  it("no answer at the bound: the lock re-arms even beside an unrelated hung transition, and the caller says 'no answer yet'", async () => {
    // Another surface's async transition, never answered (the expo lane, the approvals queue).
    startTransition(async () => {
      await new Promise<void>((r) => settle.push(r));
    });
    openRegisterOrder.mockReturnValueOnce(deferred<Landing>().promise);
    mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    expect(walkup().getAttribute("aria-disabled")).toBe("true");
    expect(table7().getAttribute("aria-disabled")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(walkup().getAttribute("aria-busy")).toBe("true");
    expect(onRefusal).not.toHaveBeenCalled();
    // MUTATION (p2h-doors/mint-unbounded): the bound never fires — "Starting…" spins and nothing is
    // said for as long as the action queue is stuck; red.
    await flush(1);
    expect(walkup().getAttribute("aria-busy")).toBeNull();
    // MUTATION (p2h-doors/mint-waiting-unsaid): said as "no answer … it may have started — check"
    // with no reload, while the floor's own read is queued behind the stuck start; red.
    expect(onRefusal).toHaveBeenLastCalledWith({ k: "floor.mint.waiting" });
    // The start is WAITING (the zone that made it offers the reload), and every START stays held —
    // MUTATION (p2h-doors/mint-waiting-controls-look-ready): the start controls look ready while
    // every tap is refused; red.
    expect(walkup().dataset.waiting).toBe("walkup");
    expect(walkup().getAttribute("aria-disabled")).toBe("true");
    expect(table7().getAttribute("aria-disabled")).toBe("true");
    // …but navigation is not (an occupied tile still opens its table): a wait holds starts only.
    // MUTATION (p2h-doors/mint-waiting-holds-navigation): `held` takes the wait too — every
    // occupied tile reads dimmed while its tap still navigates; red.
    expect(walkup().dataset.held).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("a LATE start lands: its order opens, and the screen is held for the route swap", async () => {
    const d = deferred<Landing>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await flush(STAFF_HANG_MS);
    expect(onRefusal).toHaveBeenLastCalledWith({ k: "floor.mint.waiting" });
    // MUTATION (p2h-doors/mint-late-ok-dropped): the late answer is dropped — the order WAS
    // started and the cashier is left on the counter, told only "no answer yet"; red.
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s-late", created: true });
      await d.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s-late/add");
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(walkup().dataset.waiting).toBeUndefined();
    expect(walkup().getAttribute("aria-disabled")).toBe("true");
  });

  it("while a start WAITS no other start goes: a tap is refused at the tap, never sent, and the late start still lands (S2 critic D3 · D5)", async () => {
    const first = deferred<Landing>();
    openRegisterOrder.mockReturnValueOnce(first.promise);
    mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await flush(STAFF_HANG_MS);
    onRefusal.mockClear();
    openRegisterOrder.mockReturnValueOnce(deferred<Landing>().promise);
    // MUTATION (p2h-doors/mint-late-ok-over-a-newer-start): the latch is gone — the Table 7 start
    // is sent, queues behind the stuck Walk-up, and the late Walk-up lands over it (or both open:
    // a duplicate order); red.
    await act(async () => {
      fireEvent.click(table7());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledWith({ k: "floor.mint.waiting" });
    await act(async () => {
      first.resolve({ ok: true, sessionId: "s-late", created: true });
      await first.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s-late/add");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a LATE start that finds the pane moved stands down: nothing is pushed, the waiting line is cleared and every start is free again (S2 critic D6)", async () => {
    const d = deferred<Landing>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { move } = mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await flush(STAFF_HANG_MS);
    await move("s-B");
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s-late", created: true });
      await d.promise;
    });
    expect(push).not.toHaveBeenCalled();
    // MUTATION (p2h-doors/mint-late-ok-leaves-waiting-said): the order DID start, and "no answer
    // yet — don't start it again" stands under the zone with nothing to retract it; red.
    expect(onResolved).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-doors/mint-late-standdown-holds-lock): the late landing re-holds the lock and
    // never hands it back — no route swap is coming, so every start control stays dimmed until a
    // reload; red.
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
    expect(table7().getAttribute("aria-disabled")).toBeNull();
    openRegisterOrder.mockReturnValueOnce(deferred<Landing>().promise);
    await act(async () => {
      fireEvent.click(table7());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("a LATE throw says the start couldn't be confirmed", async () => {
    let fail!: (e: Error) => void;
    openRegisterOrder.mockReturnValueOnce(new Promise((_r, j) => (fail = j)));
    mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await flush(STAFF_HANG_MS);
    expect(onRefusal).toHaveBeenLastCalledWith({ k: "floor.mint.waiting" });
    // MUTATION (p2h-doors/mint-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => fail(new Error("fetch failed")));
    expect(onRefusal).toHaveBeenLastCalledWith({ k: "floor.mint.unknown" });
    expect(onResolved).not.toHaveBeenCalled();
    // MUTATION (p2h-doors/mint-waiting-never-clears): the latch outlives its answer — every start
    // stays refused with "no answer yet" after the answer came; red.
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
    openRegisterOrder.mockReturnValueOnce(deferred<Landing>().promise);
    await act(async () => {
      fireEvent.click(table7());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(2);
  });

  it("a LATE refusal is said in the caller's region", async () => {
    const d = deferred<Landing | { ok: false; error: string }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await flush(STAFF_HANG_MS);
    expect(onRefusal).toHaveBeenLastCalledWith({ k: "floor.mint.waiting" });
    // MUTATION (p2h-doors/mint-late-refusal-unsaid): the refusal is dropped — "no answer yet"
    // stands over a start the server refused; red.
    await act(async () => {
      d.resolve({ ok: false, error: "The counter is closed." });
      await d.promise;
    });
    expect(onRefusal).toHaveBeenLastCalledWith("The counter is closed.");
    expect(push).not.toHaveBeenCalled();
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
  });
});

// ── PD7 · Codex corrections 5 · 6 · 9 — "Seat next party" RESERVES the one lock across a clear ──
describe("reserve — the lock taken at the tap, held across another write, spent once", () => {
  /** A control that reserves table 4's start, and reports what it got. */
  function Reserver({ onReserve }: { onReserve: (r: unknown) => void }) {
    const mint = useCounterMint();
    return (
      <button type="button" onClick={() => onReserve(mint.reserve("table-4"))}>
        reserve 4
      </button>
    );
  }
  function Split({ onReserve }: { onReserve: (r: unknown) => void }) {
    const api: TablePaneApi = {
      selectedId: "s-old",
      selectionGen: 0,
      openFromCard: () => {},
      openSession: (id, hint) => {
        openSession(id, hint);
        return true;
      },
      publishFloor: () => {},
    };
    return (
      <TablePaneContext.Provider value={api}>
        <CounterMintProvider>
          <Reserver onReserve={onReserve} />
          <StartTable7 />
        </CounterMintProvider>
      </TablePaneContext.Provider>
    );
  }
  type R = {
    go: (i: { kind: "table"; tableNumber: number }, cb: object) => void;
    release: () => void;
  } | null;

  it("reserved: every other start is held and refused; release hands the lock back", async () => {
    let got: R = null;
    render(<Split onReserve={(r) => (got = r as R)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reserve 4" }));
    });
    expect(got).not.toBeNull();
    // MUTATION counter-mint/reserve-holds-nothing → a Walk-up slips in before the clear answers; red.
    expect(screen.getByRole("button", { name: "start 7" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "start 7" }));
    });
    expect(openRegisterOrder).not.toHaveBeenCalled();
    // A second reservation while one stands: refused (correction 5's hold check).
    let second: R = {} as R;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reserve 4" }));
    });
    second = got;
    expect(second).toBeNull();
    // Released (the clear was refused): the lock is free again.
    let third: R = null;
    cleanup();
    render(<Split onReserve={(r) => (third = r as R)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reserve 4" }));
    });
    await act(async () => third!.release());
    // MUTATION counter-mint/release-keeps-the-lock → every start on the screen stays held; red.
    expect(
      screen.getByRole("button", { name: "start 7" }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("go: starts the reserved order, and a NEW session lands in the PANE (the bell stays live)", async () => {
    let got: R = null;
    openRegisterOrder.mockResolvedValueOnce({ ok: true, sessionId: "s-new", created: true });
    render(<Split onReserve={(r) => (got = r as R)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reserve 4" }));
    });
    await act(async () => {
      got!.go({ kind: "table", tableNumber: 4 }, { onStart: () => {}, onRefusal: () => {} });
    });
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "table", tableNumber: 4 });
    // MUTATION counter-mint/reserved-start-routes-away (the pane landing for created dropped) →
    // the route leaves the counter home, the only page with the bell; red.
    expect(openSession).toHaveBeenCalledWith("s-new", { counter: false, display: "4" });
    expect(push).not.toHaveBeenCalled();
  });
});
