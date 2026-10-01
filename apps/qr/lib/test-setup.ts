import { afterEach } from "vitest";
import { resetLedgerForTests } from "./bounded-write";

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
});
