/** @vitest-environment jsdom */
import type { MouseEvent } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  collecting = false;
});

type Landing = { ok: true; sessionId: string; created: boolean };
const openSession = vi.fn((_id: string, _hint: unknown) => true);
/** Phase 2d · Codex round 2 — whether the pane's reader is collecting, as the split answers it at
 *  the instant of asking (a case flips it), and the pane's "say it" for a refused start. */
let collecting = false;
const sayStartHeld = vi.fn();

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
          { onStart: () => {}, onRefusal: () => {} },
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
    startHeld: () => collecting,
    sayStartHeld,
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
 * Phase 2d · Codex round 2 · pane — a START while the pane's reader collects. A start does not move
 * the pane's selection, so neither check above sees it: a NEW order's landing pushed its add screen,
 * and the route swap unmounted the collect panel (the payment's hold, a counter order's #CODE). The
 * lock asks the pane (`startHeld`) at the tap — refused before the server is asked, said by the
 * pane — and again as a start already out lands.
 */
describe("CounterMint — a start while the pane's reader collects", () => {
  it("a tap mid-collect is refused BEFORE the server is asked, said by the pane, and takes no lock", async () => {
    collecting = true;
    render(<Pane selectedId="s-A" />);
    const button = screen.getByRole("button", { name: "start 7" });
    await act(async () => {
      fireEvent.click(button);
    });
    // MUTATION: drop the tap-time hold — the server starts table 7 mid-collect; red.
    expect(openRegisterOrder).not.toHaveBeenCalled();
    // MUTATION: refuse silently — the tap does nothing and nothing says why; red.
    expect(sayStartHeld).toHaveBeenCalledTimes(1);
    // MUTATION: refuse after taking the lock — every start control stays held for good; red.
    expect(button.getAttribute("aria-disabled")).toBeNull();
    // The collection ends: the next tap starts.
    collecting = false;
    openRegisterOrder.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button);
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(sayStartHeld).toHaveBeenCalledTimes(1);
  });

  it("a start out when the collection begins stands down as it lands — silently, and the lock re-arms", async () => {
    const d = deferred<Landing>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    render(<Pane selectedId="s-A" />);
    const button = () => screen.getByRole("button", { name: "start 7" });
    await act(async () => {
      fireEvent.click(button());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    collecting = true; // the reader began on the table shown; the pane did not move
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s-new", created: true });
      await d.promise;
    });
    await act(async () => {});
    // MUTATION: land with no collection check — the add screen is pushed over the collect panel; red.
    expect(push).not.toHaveBeenCalled();
    // MUTATION: stand down without re-arming — every start control stays held; red.
    expect(button().getAttribute("aria-disabled")).toBeNull();
    // A landing is never a refusal the person made: the pane says nothing (a move's stand-down).
    expect(sayStartHeld).not.toHaveBeenCalled();
  });
});
