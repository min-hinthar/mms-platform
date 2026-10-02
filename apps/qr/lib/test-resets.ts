/**
 * Phase 2i · blind review (concurrency G) — module state that lives in a COMPONENT, reset after
 * every case by `lib/test-setup.ts` without that setup ever importing the component.
 *
 * vitest isolates modules per FILE, not per case, so a component's module-level latch (the shell's
 * `requested` / `owed`, the bar row's retired latch) leaks from one case into the next. The setup
 * cannot simply import those components to reset them: a module a setup file imports is evaluated
 * BEFORE a suite's hoisted `vi.mock` applies, so the suite would then get the unmocked copy (S1
 * measured exactly that with `app-update`'s default parameter). Instead each such module registers
 * its own reset here when it is loaded, and the setup runs whatever the file's modules registered —
 * a module no case imported has nothing to reset.
 *
 * Production cost: one function added to a Set per registering module, never called.
 */
const resets = new Set<() => void>();

/** Register `reset` to run after every test case (a module calls this once, at load). */
export function resetWithEachTest(reset: () => void): void {
  resets.add(reset);
}

/** `lib/test-setup.ts`: run every registered reset. */
export function runTestResets(): void {
  for (const reset of [...resets]) reset();
}
