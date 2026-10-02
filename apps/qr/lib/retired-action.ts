import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * Phase 2i (P2bi) — THE classifier for "this screen sent an action id the server no longer has".
 *
 * A deploy that rotates the action key, or renames, moves or changes the arity of a Server Action,
 * retires that action's id. The server answers 404 with `x-nextjs-action-not-found`, the client
 * throws `UnrecognizedActionError`, and the action's body NEVER ran. Nothing in this app handled it
 * before Phase 2i; now the ledger's rejection witness (`onTrackedRejection`) passes every tracked
 * rejection here, and one match marks the tab "retired" (see `reload-guard.ts` for exactly what that
 * relaxes — a rename retires ONE id, not all of them).
 *
 * The `unstable_` predicate is a bare `instanceof`; the name check beside it is the belt for a Next
 * upgrade that moves or renames the export (the class sets `this.name` itself). Client only — it
 * imports `next/navigation`.
 */
export function isRetiredActionError(e: unknown): boolean {
  return (
    unstable_isUnrecognizedActionError(e) ||
    (e instanceof Error && e.name === "UnrecognizedActionError")
  );
}
