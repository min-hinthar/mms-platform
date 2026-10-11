/** @vitest-environment jsdom */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sheet } from "@mms/ui";

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
 *
 * The observation point is the sheet's `onCloseAutoFocus`: Radix calls it from inside that timer
 * (`FocusScope`'s `onUnmountAutoFocus`), so a call means the timer has fired.
 */
afterEach(cleanup);

const restoredFirst = vi.fn();
const restoredFaked = vi.fn();
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

describe("a case that leaves vi.useFakeTimers() on", () => {
  afterAll(async () => {
    vi.useRealTimers();
    // Why the drain may ignore a FAKED close-restore: it was queued on the fake clock, which is
    // discarded with it, so it can never fire — before jsdom's teardown or after it.
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

describe("the file's last case", () => {
  it("ends with a sheet open — the exact shape that flaked on #340", () => {
    openSheet(restoredLast);
    expect(restoredLast).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  // The last hook this file owns; jsdom's teardown is next. Without the drain, the last case's
  // close-restore is still queued here and fires against a torn-down environment; red.
  expect(restoredLast).toHaveBeenCalledTimes(1);
});
