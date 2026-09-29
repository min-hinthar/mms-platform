/** @vitest-environment jsdom */
import { useState, type MouseEvent } from "react";
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
          { onStart: () => {}, onRefusal: () => {} },
        )
      }
    >
      start 7
    </button>
  );
}

let pick: (id: string | null) => void = () => {};
function Pane({ initial }: { initial: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  pick = setSelectedId;
  const api: TablePaneApi = {
    selectedId,
    openFromCard: (_e: MouseEvent<HTMLElement>, id: string) => setSelectedId(id),
    openSession: (id, hint) => {
      openSession(id, hint);
      setSelectedId(id);
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
  landing: Landing;
}) {
  const d = deferred<Landing>();
  openRegisterOrder.mockReturnValueOnce(d.promise);
  render(<Pane initial={opts.initial} />);
  const button = () => screen.getByRole("button", { name: "start 7" });
  await act(async () => {
    fireEvent.click(button());
  });
  expect(openRegisterOrder).toHaveBeenCalledTimes(1);
  expect(button().getAttribute("aria-disabled")).toBe("true");
  if (opts.moveTo !== undefined) {
    const to = opts.moveTo;
    await act(async () => pick(to));
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
