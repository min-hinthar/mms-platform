import { afterEach } from "vitest";
import { resetLedgerForTests, resetOutReadsForTests, resetOwnWaitsForTests } from "./bounded-write";

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
afterEach(() => {
  resetLedgerForTests();
  // Phase 2h · review a (A4) — the per-subject own-wait register is module state too: a case that
  // leaves a refund hung would refuse the next case's refund of the same line in its own words.
  resetOwnWaitsForTests();
  // Codex r2 on #310 (B2) — and so is the per-key register of a read still out: a case that leaves
  // the roster read hung would hand the next case's mount that hung read instead of a fresh one.
  resetOutReadsForTests();
});
