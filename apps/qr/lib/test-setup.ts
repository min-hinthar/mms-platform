import { afterEach } from "vitest";
import {
  resetLedgerForTests,
  resetOutReadsForTests,
  resetOwnWaitsForTests,
  resetWriteSignalsForTests,
} from "./bounded-write";
import { resetHoldsForTests } from "./reload-guard";
import { resetUpdateForTests } from "./app-update";
import { resetLoadForTests } from "./tab-load";
import { resetHandBacksForTests } from "./settled-view";
import { runTestResets } from "./test-resets";

/**
 * The real `setTimeout`, read when this file loads — before any suite can fake the clock. vitest's
 * jsdom environment leaves Node's timers in place (jsdom's own are not installed as globals), so this
 * is the clock the unmount timers below are queued on.
 */
const REAL_SET_TIMEOUT = globalThis.setTimeout;

/**
 * The #340 CI flake (build job 114406642840: every test passed, "Errors 1 error", exit 1) —
 * `TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type
 * 'Event'`, thrown from `@radix-ui/react-focus-scope` after its file had finished.
 *
 * Every `Sheet` (`@mms/ui`) is a Radix modal Dialog, and its FocusScope answers an UNMOUNT by queueing
 * its close-restore on `setTimeout(…, 0)`: build a `new CustomEvent`, dispatch it on the sheet's
 * container. A suite's own `afterEach(cleanup)` is that unmount. What was measured in-runner (vitest
 * 4.0.17): no macrotask runs between a case's hooks and the next case, nor between a file's last
 * `afterEach` and its `afterAll` (a timer queued in the last `afterEach` had not fired in `afterAll`,
 * 5 of 5 runs). AFTER `afterAll` there is a gap: the worker reports the file finished, and the jsdom
 * teardown runs only when the pool's `stop` message comes back — so a timer still queued races that
 * IPC round trip. The teardown deletes jsdom's globals and puts Node's own `CustomEvent` back; when
 * the timer loses, jsdom's `dispatchEvent` is handed a Node event and throws, unhandled, after the
 * summary has counted every test green. The timer usually wins (a timer queued in a file's last
 * `afterAll` fired before the teardown in 113 of 113 local runs, 83 of them among the full suite);
 * one CI run lost it.
 *
 * So after every jsdom case this waits ONE macrotask, and a restore queued on the real clock fires
 * inside the case that queued it — never in the next case, never in the race. Why that is enough,
 * and why here:
 *  - ORDER: vitest's default `sequence.hooks: "stack"` runs `afterEach` hooks in reverse registration
 *    order, and a describe's before its file's. This setup registers first, so its hook runs LAST —
 *    after every suite's own cleanup — and Node fires equal-delay timers in the order they were
 *    queued, so a 0 ms wait queued after the unmount resolves after Radix's.
 *  - REAL CLOCK: a suite that leaves `vi.useFakeTimers()` on through its hooks would otherwise hang
 *    this hook until the hook timeout (measured: "Hook timed out in 10000ms"). A restore queued while
 *    the clock was faked sits on THAT clock, out of this drain's reach. Uninstalled before anything
 *    advances it — by `vi.useRealTimers()`, or by the next `vi.useFakeTimers()` (from vitest 4.0.17's
 *    source, not measured: `useFakeTimers` uninstalls a live clock before installing a fresh one) — it
 *    is dropped and never fires. A clock installed in a `beforeAll` OUTLIVES its case and keeps it,
 *    and the next case to advance that clock fires it there (measured: the pinning file's fixture); a
 *    `shouldAdvanceTime` clock left running to the end of a file would tick it after the teardown
 *    (not measured). Both shapes are out of reach. A sweep on 2026-10-11 found neither in apps/qr past
 *    that fixture — a snapshot, not a guard (T54).
 *  - ONE MACROTASK: the drain lets a restore's SYNCHRONOUS work land in its own case. A restore whose
 *    handler defers again (its own `setTimeout`, a frame) queues behind the drain and lands after the
 *    resets — out of reach too; no `onCloseAutoFocus` handler in apps/qr defers (2026-10-11: the
 *    three — Checkout's two, TableBindSheet's — are synchronous).
 *  - jsdom only: a node suite mounts nothing, so it pays nothing.
 *
 * Pinned by `lib/test-setup.teardown.test.tsx`.
 */
function drainUnmountTimers(): Promise<void> {
  return new Promise((resolve) => {
    REAL_SET_TIMEOUT(resolve, 0);
  });
}

/**
 * Phase 2h (the contract critic, F7) — vitest's `setupFiles` entry for every suite in apps/qr.
 *
 * The stall ledger (`bounded-write.ts`) is MODULE state, and vitest isolates modules per FILE, not
 * per case: a case that leaves an action hung (a `new Promise(() => {})` add, a raced read that never
 * answers) leaves its entry for every later case in the same file. Once the money doors refuse on
 * `stalledSince()`, that later case reads "stuck — reload" for a hang it never made, and passes or
 * fails by its POSITION in the file — the #149 shape, crossing streams (CounterSplit's integration
 * suite, TablePane's and CashSettleButton's all hang promises and mount money controls). So the
 * ledger is emptied after EVERY case, here, once — never remembered per suite.
 */
afterEach(async () => {
  // FIRST, a jsdom case lets the timers its unmount queued FIRE (drainUnmountTimers above says why).
  // What they run is caller code — a close-restore's focus handler can start a tracked call — so it
  // must land in this case BEFORE the resets: drained after them, what it wrote would outlive the
  // case it belongs to and be read by the next one (`lib/test-setup.teardown.test.tsx` pins it).
  if (typeof document !== "undefined") await drainUnmountTimers();
  resetModuleState();
});

/** Every per-case reset, in one synchronous run — called only AFTER the drain above. */
function resetModuleState(): void {
  resetLedgerForTests();
  // Phase 2h · review a (A4) — the per-subject own-wait register is module state too: a case that
  // leaves a refund hung would refuse the next case's refund of the same line in its own words.
  resetOwnWaitsForTests();
  // Codex r2 on #310 (B2) — and so is the per-key register of a read still out: a case that leaves
  // the roster read hung would hand the next case's mount that hung read instead of a fresh one.
  resetOutReadsForTests();
  // Phase 2i (P2bi) — and so are the answer-window stamp and the rejection witnesses: a case whose
  // write settled would shorten the next case's quiet moment, and a witness a case installed (the
  // staff layout's) would hear the next case's rejections and mark its tab retired.
  resetWriteSignalsForTests();
  // …and the reload hold register: a case that mounts a KDS with its sound on and never unmounts it
  // (or a hold registered by hand) would refuse the next case's automatic reload for it.
  resetHoldsForTests();
  // …and the update store (phase, the executor's latch, the installed deps, the input clock) and
  // this document's claimed load: a case that leaves an apply latched or a phase stale would make
  // the next case's tap read `busy`, or its row render for a version nobody served it.
  resetUpdateForTests();
  resetLoadForTests();
  // Blind review (concurrency G) — …and the cash hand-back's document state (a new document id; the
  // memory entry, its reload hold's release and expiry timer, what was announced, and any listener),
  // so one case's refund is never told to, said in, or held for the next.
  resetHandBacksForTests();
  // …and the module state components keep (the shell's ask and owed reload, the bar row's retired
  // latch), which register their own resets when loaded — this setup must never import them
  // (`lib/test-resets.ts` says why).
  runTestResets();
}
