import { describe, expect, it } from "vitest";
import { passIdentity } from "./pass-identity";

/**
 * The ONE identity a table's pass prints. Owner-delegated (2026-10-09): never the session's join
 * code — the function cannot even be handed one — so a numberless table prints the host's first
 * name, or "Your table".
 */
describe("passIdentity", () => {
  it("a numbered table prints its number, once, as the table figure", () => {
    expect(passIdentity(7, "Aye")).toEqual({ figure: "7", figureKind: "table" });
  });
  it("a numberless table prints the host's FIRST name — the words take the figure's place", () => {
    // MUTATION (pass-identity/full-name-on-the-pass): the first-name cut dropped — "Aye Aye’s table";
    // red.
    expect(passIdentity(null, "Aye Aye")).toEqual({
      fallback: { en: "Aye’s table", my: "Aye ရဲ့ စားပွဲ" },
    });
  });
  it("an unnamed host (the default 'Guest', blank, none) is never read as a person: 'Your table'", () => {
    for (const nameless of ["Guest", "  ", null]) {
      // MUTATION (pass-identity/default-name-on-the-pass): the chosen-name filter dropped —
      // "Guest’s table" names a person who does not exist; red.
      expect(passIdentity(null, nameless)).toEqual({
        fallback: { en: "Your table", my: "သင့်စားပွဲ" },
      });
    }
  });
});
