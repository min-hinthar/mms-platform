import { describe, expect, it } from "vitest";
import { SESSION_REFUSALS, sessionRefusal } from "./session-refusal";

/** J16 — the `/api/session` refusal's machine word, parsed against the ONE list. */
describe("sessionRefusal", () => {
  it("every word on the list parses to itself", () => {
    for (const r of SESSION_REFUSALS) expect(sessionRefusal(r)).toBe(r);
  });

  it("anything else is null — an unknown word, a near miss, a non-string, nothing", () => {
    // MUTATION (j16-reason/parser-accepts-any): any string passes — a word from a newer server
    // (or a typo) reaches GuestList's switch as if it had been decided, and lands in no arm.
    for (const x of ["some_future_word", "Seated", " seated", "", 409, null, undefined, {}])
      expect(sessionRefusal(x)).toBeNull();
  });

  it("the words are unique (a duplicate would make two arms out of one refusal)", () => {
    expect(new Set(SESSION_REFUSALS).size).toBe(SESSION_REFUSALS.length);
  });
});
