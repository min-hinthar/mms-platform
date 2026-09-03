import { describe, expect, it } from "vitest";
import { peerDisplayName } from "./peer-name";

/**
 * T20 — the pay-lock banner's peer name, tested as the sentence it lands in.
 *
 * Every case below is written as the rendered claim, because the defect is not "a bad string" — it
 * is a sentence about the reader that a tablemate gets to author. `${peerDisplayName(n)} is checking
 * out` must never come out reading as the person holding the phone.
 */
const sentence = (n: string | null | undefined) => `${peerDisplayName(n)} is checking out`;

describe("peerDisplayName — a tablemate cannot name themselves the reader", () => {
  it("passes an ordinary name through unchanged", () => {
    expect(sentence("Aye")).toBe("Aye is checking out");
  });

  it.each(["You", "you", "YOU", " You ", "Y.O.U.", "you’re", "youre", "U", "me", "I"])(
    "refuses %o — the sentence would read as the reader",
    (name) => {
      expect(sentence(name)).toBe("Someone is checking out");
    },
  );

  it("keeps real names that merely start with the same letters", () => {
    // The reason the list is normalized-exact rather than a prefix or substring match: these are
    // names people actually have, and replacing them with "Someone" would be its own small lie.
    for (const n of ["Yu", "Youn", "Mei", "Ivy", "Umi"]) {
      expect(peerDisplayName(n)).toBe(n);
    }
  });

  it("answers Someone for an unresolved or blank name", () => {
    expect(peerDisplayName(null)).toBe("Someone");
    expect(peerDisplayName(undefined)).toBe("Someone");
    expect(peerDisplayName("   ")).toBe("Someone");
    // A name of pure punctuation or emoji normalizes to nothing to say — same answer.
    expect(peerDisplayName("🙂")).toBe("Someone");
  });

  it("trims incidental whitespace rather than rendering it into the sentence", () => {
    expect(sentence("  Aye  ")).toBe("Aye is checking out");
  });
});
