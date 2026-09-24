import { describe, expect, it } from "vitest";
import { addAttemptOutcome, heldAfter, keyForAttempt } from "./staff-add-key";

/**
 * Phase 2a (Codex round 1, P1) — the staff add surfaces send an ADD KEY, and the key's lifetime is
 * the INTENT's: a retry of an add whose outcome is unknown resends the SAME key (the ledger makes it a
 * no-op if the first landed); only a definite outcome retires it. Each case is the one a
 * `staff-add-key/*` mutant turns red.
 */
let n = 0;
const mint = () => `k${++n}`;

describe("addAttemptOutcome — definite vs unknown", () => {
  it("ok is ok; a throw and `unconfirmed` are UNKNOWN — the add may have landed", () => {
    expect(addAttemptOutcome({ ok: true })).toBe("ok");
    expect(addAttemptOutcome("threw")).toBe("unknown");
    // MUTATION: treat `unconfirmed` as a definite refusal — the next tap mints a NEW key and a
    // lost-response add is doubled (a second dish cooked and charged); red.
    expect(addAttemptOutcome({ ok: false, error: "x", code: "unconfirmed" })).toBe("unknown");
  });

  it("every other refusal is definite — nothing was written", () => {
    for (const code of [
      "closed",
      "no-cart",
      "paying",
      "sold_out",
      "gone",
      "outage",
      "failed",
    ] as const)
      expect(addAttemptOutcome({ ok: false, error: "x", code })).toBe("definite");
    expect(addAttemptOutcome({ ok: false, error: "x" })).toBe("definite");
  });
});

describe("the key's lifetime is the intent's", () => {
  it("an unknown outcome keeps the key for a retry of the SAME intent", () => {
    const held = heldAfter("dish-1", "k-a", "unknown");
    // MUTATION: mint afresh on every tap — the retry is a second add under a new key; red.
    expect(keyForAttempt(held, "dish-1", mint)).toBe("k-a");
  });

  it("a DIFFERENT intent never reuses it (a changed choice must not be swallowed as a duplicate)", () => {
    const held = heldAfter("dish-1|opt-a|1", "k-a", "unknown");
    expect(keyForAttempt(held, "dish-1|opt-b|1", mint)).not.toBe("k-a");
  });

  it("ok and definite outcomes retire it — the next tap is a new add under a new key", () => {
    // MUTATION: hold the key after ok — the NEXT deliberate add of the same dish is swallowed by
    // the ledger as a duplicate of the first; red.
    expect(heldAfter("dish-1", "k-a", "ok")).toBeNull();
    expect(heldAfter("dish-1", "k-a", "definite")).toBeNull();
    expect(keyForAttempt(null, "dish-1", () => "fresh")).toBe("fresh");
  });
});
