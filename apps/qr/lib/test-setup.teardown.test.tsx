/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sheet } from "@mms/ui";
import { outstanding, track } from "./bounded-write";

/**
 * The CI flake on #340 (build job 114406642840: 7542/7542 passed, "Errors 1 error", exit 1). RTL's
 * `cleanup` unmounts an open sheet; Radix's FocusScope answers the unmount by queueing its
 * close-restore on a real `setTimeout(…, 0)`, which builds a `new CustomEvent` and dispatches it on
 * the sheet's (jsdom) container. When that timer outlives the file, vitest has already torn jsdom
 * down — its teardown deletes the jsdom globals and puts Node's own `CustomEvent` back — so jsdom's
 * `dispatchEvent` is handed a Node event and throws "parameter 1 is not of type 'Event'", an
 * unhandled error after every test has passed. `lib/test-setup.ts` drains one macrotask after every
 * jsdom case, so the timer fires inside the case that queued it.
 *
 * Every check below is deterministic, not a race: vitest yields NO macrotask between a case's last
 * `afterEach` and the next case, nor between a file's last `afterEach` and its `afterAll` (measured
 * — a `setTimeout(…, 0)` queued in a file's last `afterEach` had not fired in its `afterAll`, 5 of 5
 * runs). So without the drain, each close-restore asserted here is still queued where it is read.
 * The race is only AFTER `afterAll`: the jsdom teardown waits for the pool's `stop` message, and a
 * timer queued in a file's last `afterAll` beat it in 113 of 113 local runs; #340's CI run is the
 * one that lost. With the drain, no restore is still queued that late.
 *
 * The observation point is the sheet's `onCloseAutoFocus`: Radix calls it from inside that timer
 * (`FocusScope`'s `onUnmountAutoFocus`), so a call means the timer has fired.
 */
afterEach(cleanup);

const restoredFirst = vi.fn();
const restoredHung = vi.fn(() => {
  // A close-restore runs caller code. This one starts a tracked call that never answers — what a
  // focus handler on the sheet's trigger could do — so it leaves an entry in the stall ledger.
  void track(new Promise<never>(() => {}));
});
const restoredFaked = vi.fn();
const restoredCarried = vi.fn();
const restoredLast = vi.fn();

function openSheet(onCloseAutoFocus: (e: Event) => void) {
  render(
    <Sheet open onOpenChange={() => {}} title="Mohinga" onCloseAutoFocus={onCloseAutoFocus}>
      <p>For here or to go?</p>
    </Sheet>,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
}

describe("a sheet's close-restore fires inside the case that unmounted it", () => {
  it("a case may end with a sheet open — cleanup unmounts it…", () => {
    openSheet(restoredFirst);
    expect(restoredFirst).not.toHaveBeenCalled();
  });

  it("…and its close-restore has run before the next case begins", () => {
    // MUTATION (setup-teardown/focus-scope-drain): the setup's drain is gone — the first case's timer
    // is still queued here, and in the file's LAST case it outlives jsdom (the #340 flake); red.
    expect(restoredFirst).toHaveBeenCalledTimes(1);
  });
});

describe("the close-restore lands BEFORE the per-case resets", () => {
  it("a case whose sheet's close-restore leaves a tracked call hung…", () => {
    openSheet(restoredHung);
    expect(outstanding()).toBe(0);
  });

  it("…has it emptied with the case it belongs to — the next case's ledger starts empty", () => {
    expect(restoredHung).toHaveBeenCalledTimes(1);
    // MUTATION (setup-teardown/drain-after-resets): the setup drains AFTER its resets — the restore
    // fires once the ledger is already empty, and its hang is read by this case: a money door here
    // would refuse as "stuck — reload" for a hang this case never made; red.
    expect(outstanding()).toBe(0);
  });
});

describe("a case that leaves vi.useFakeTimers() on", () => {
  afterAll(async () => {
    vi.useRealTimers();
    // Why the drain may ignore THIS faked close-restore: it was queued on a fake clock that nothing
    // advanced before it was uninstalled, and an uninstalled clock never fires what it holds —
    // before jsdom's teardown or after it. (A clock that outlives its case is the next describe.)
    await new Promise((r) => setTimeout(r, 5));
    expect(restoredFaked).not.toHaveBeenCalled();
  });

  it("still finishes its hooks — the drain waits on the real clock, never the faked one", () => {
    // MUTATION (setup-teardown/focus-scope-real-clock): the drain reads the global `setTimeout`,
    // which this case has faked — the setup's afterEach never settles and the hook times out; red.
    vi.useFakeTimers();
    openSheet(restoredFaked);
  });
});

/**
 * The drain's documented LIMIT (T54), shown rather than asserted in prose: a fake clock installed in
 * a `beforeAll` outlives the case that queued a restore on it, so the restore crosses into the next
 * case that advances that clock. The drain waits on the real clock and cannot reach it; no suite in
 * apps/qr has this shape — this fixture is the only one.
 */
describe("a fake clock that outlives its case", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("case N unmounts a sheet on the faked clock — its close-restore is queued on THAT clock…", () => {
    openSheet(restoredCarried);
  });

  it("…and fires in the next case to advance it, out of the drain's reach", () => {
    expect(restoredCarried).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(restoredCarried).toHaveBeenCalledTimes(1);
  });
});

describe("the file's last case", () => {
  it("ends with a sheet open — the exact shape that flaked on #340", () => {
    openSheet(restoredLast);
    expect(restoredLast).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  // The last hook this file owns; jsdom's teardown is next. Without the drain, the last case's
  // close-restore is still queued here, left to race that teardown (the #340 flake); red.
  expect(restoredLast).toHaveBeenCalledTimes(1);
});
