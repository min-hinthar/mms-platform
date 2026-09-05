import { describe, expect, it } from "vitest";
import { fill, localizeCount, plural, tf } from "./fill";
import { STAFF } from "./staff";

/**
 * P2 · G9 — slot filling and the numeral rule.
 *
 * The numeral rule is the owner's (2026-09-05): Burmese numerals in prose counts, Latin for money,
 * clock times, table numbers and pickup codes. It lives in ONE function rather than in a hundred
 * dictionary strings, and the slot NAME is what decides — so this suite is where "which slots are
 * counts" is actually written down.
 */
describe("localizeCount", () => {
  it("converts every digit under Burmese", () => {
    expect(localizeCount(0, "my")).toBe("၀");
    expect(localizeCount(7, "my")).toBe("၇");
    expect(localizeCount(12, "my")).toBe("၁၂");
    expect(localizeCount(1990, "my")).toBe("၁၉၉၀");
  });

  it("leaves English alone", () => {
    expect(localizeCount(12, "en")).toBe("12");
  });
});

describe("fill", () => {
  it("replaces EVERY occurrence of a repeated slot, not just the first", () => {
    // A non-global regex passes a single-slot template and fails only here.
    expect(fill("{n} of {n}", { n: 3 }, "en")).toBe("3 of 3");
  });

  it("localizes count slots and leaves identifier, money and time slots Latin", () => {
    expect(fill("{n}", { n: 4 }, "my")).toBe("၄");
    expect(fill("{total}", { total: 4 }, "my")).toBe("၄");
    // A table number is read off a physical tent; money and clocks are matched against a receipt.
    expect(fill("{id}", { id: 4 }, "my")).toBe("4");
    expect(fill("{m}", { m: "$42.10" }, "my")).toBe("$42.10");
    expect(fill("{t}", { t: "7:45 PM" }, "my")).toBe("7:45 PM");
    expect(fill("{x}", { x: "Mohinga" }, "my")).toBe("Mohinga");
  });

  it("NEVER throws on a missing slot — it leaves the brace intact", () => {
    // A throw here happens inside KdsBoard's render, where the staff error boundary would take the
    // whole kitchen board down mid-service. A visible `{n}` at the pass is the better failure.
    expect(() => fill("{n} open", {}, "en")).not.toThrow();
    expect(fill("{n} open", {}, "en")).toBe("{n} open");
    expect(fill("{nope}", { n: 1 }, "en")).toBe("{nope}");
  });
});

describe("tf", () => {
  it("fills a dictionary template in both tongues", () => {
    expect(tf("en", "kds.open.one", { n: 1 })).toBe("1 open ticket");
    expect(tf("my", "kds.open.one", { n: 1 })).toContain("၁");
  });

  it("keeps a table number Latin inside a Burmese sentence", () => {
    const out = tf("my", "kds.table", { id: 12 });
    expect(out).toContain("12");
    expect(out).not.toContain("၁၂");
  });

  it("rejects a missing var at COMPILE time", () => {
    // @ts-expect-error — `kds.table` declares {id}; omitting it must not typecheck. If this stops
    // erroring (an `as const` dropped from STAFF, a widened signature), typecheck goes red here.
    expect(() => tf("en", "kds.table", {})).not.toThrow();
  });
});

describe("plural", () => {
  it("picks the singular key at exactly one", () => {
    expect(plural(1, "kds.open.one", "kds.open.many")).toBe("kds.open.one");
    expect(plural(0, "kds.open.one", "kds.open.many")).toBe("kds.open.many");
    expect(plural(2, "kds.open.one", "kds.open.many")).toBe("kds.open.many");
  });

  it("both keys of the pair carry the SAME Burmese — the distinction is English-only", () => {
    expect(STAFF["kds.open.one"].my).toBe(STAFF["kds.open.many"].my);
  });
});
