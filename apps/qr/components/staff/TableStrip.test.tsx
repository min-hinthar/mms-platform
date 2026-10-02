/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import type { MintNotice } from "./CounterMint";

/**
 * Phase 2h (S2 critic D1) — the strip's own share of a hung start. The strip mounts no live region:
 * a table start's "no answer yet … reload the page" is said by the BOARD's region (`onNotice`), and
 * the console is installed standalone (no browser reload), so the strip offers the reload at its head
 * while that start waits — and only then (a Walk-up's wait is the Start zone's to offer).
 *
 * The board's own wiring of the strip (the region, the flip guard, focus) is `FloorBoard.test`'s;
 * this suite renders the strip alone under the screen's ONE mint lock.
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

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CounterMintProvider, useCounterMint } = await import("./CounterMint");
const { TableStrip } = await import("./TableStrip");
const { ts } = await import("@/lib/i18n/staff");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  openRegisterOrder.mockReset();
  vi.clearAllMocks();
});

/** A Walk-up beside the strip, on the same lock (the Start zone's stand-in). */
function Walkup() {
  const mint = useCounterMint();
  return (
    <button
      type="button"
      onClick={() => mint.run("walkup", { kind: "walkup" }, { onStart() {}, onRefusal() {} })}
    >
      walkup
    </button>
  );
}

function mount() {
  const notices: Array<MintNotice | null> = [];
  const utils = render(
    <StaffLangProvider lang="en">
      <CounterMintProvider>
        <Walkup />
        <TableStrip registry={[7]} tables={[]} lang="en" onNotice={(n) => notices.push(n)} />
      </CounterMintProvider>
    </StaffLangProvider>,
  );
  const tile = () => utils.container.querySelector<HTMLButtonElement>('[data-tile="7"]')!;
  const reload = () =>
    [...utils.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(ts("en", "out.reload")),
    ) ?? null;
  const walkup = () => utils.getByText("walkup");
  return { ...utils, tile, reload, walkup, notices };
}

const bound = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
  });

describe("TableStrip — Phase 2h: a table start with no answer yet", () => {
  it("offers the reload while the start waits, under the board's line — and drops it when the late answer lands", async () => {
    const d = deferred<{ ok: true; sessionId: string; created: boolean }>();
    openRegisterOrder.mockReturnValueOnce(d.promise);
    const { tile, reload, notices } = mount();
    await act(async () => {
      fireEvent.click(tile());
    });
    expect(reload()).toBeNull();
    await bound();
    expect(notices.at(-1)).toEqual({ k: "floor.mint.waiting" });
    // MUTATION (p2h-doors/strip-reload-missing): the board says "reload the page" on a console
    // with no browser reload, and nothing on screen does it; red.
    expect(reload()).not.toBeNull();
    // A second tap on the strip is refused at the tap — never sent — and says the same line.
    await act(async () => {
      fireEvent.click(tile());
    });
    expect(openRegisterOrder).toHaveBeenCalledTimes(1);
    expect(notices.at(-1)).toEqual({ k: "floor.mint.waiting" });
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s7", created: true });
      await d.promise;
    });
    expect(push).toHaveBeenCalledWith("/staff/table/s7/add");
    // MUTATION (p2h-doors/strip-late-ok-keeps-waiting): the board's "no answer yet" stands over
    // a start that went; red.
    expect(notices.at(-1)).toBeNull();
    expect(reload()).toBeNull();
  });

  it("a WALK-UP's wait is not the strip's to offer — one reload on the screen, beside the zone that started it", async () => {
    openRegisterOrder.mockReturnValueOnce(deferred<never>().promise);
    const { walkup, reload } = mount();
    await act(async () => {
      fireEvent.click(walkup());
    });
    await bound();
    expect(reload()).toBeNull();
  });
});
