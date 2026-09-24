import { describe, expect, it } from "vitest";
import { admitNotice, purgesDeferred, type SlotNotice } from "./notice-slot";

/**
 * Phase 1c — the one slot's precedence, as a truth table. Every row is a real pairing the provider
 * produces; the NEWS-over-correction row is the one a "tidier" rule 3 would break (the lock-release
 * banner must replace the refusal it contradicts at once).
 */

const claim = (text: string, quiet = true): SlotNotice => ({ text, quiet, kind: "claim" });
const correction = (text: string): SlotNotice => ({ text, quiet: false, kind: "correction" });
const news = (text: string): SlotNotice => ({ text, quiet: false, kind: "news" });

const REFUSED = correction(
  "Mohinga didn’t go through — the order’s locked while someone checks out.",
);

describe("admitNotice — the five rules, in order", () => {
  it("an empty slot shows anything", () => {
    expect(admitNotice(null, claim("Mohinga added"))).toBe("show");
  });

  it("a claim waits behind a correction (a retracted claim must not erase its retraction)", () => {
    expect(admitNotice(REFUSED, claim("Tea added"))).toBe("defer");
    // A VISIBLE claim too — rule 3 is about the kind, not the quietness.
    expect(admitNotice(REFUSED, claim("Added to your order", false))).toBe("defer");
  });

  it("a quiet claim waits behind visible news (it must not blank what someone is reading)", () => {
    expect(admitNotice(news("Aung added Tea"), claim("Mohinga added"))).toBe("defer");
  });

  it("quiet over quiet shows — the newer step is the truer one", () => {
    expect(admitNotice(claim("Mohinga, quantity 2"), claim("Mohinga, quantity 3"))).toBe("show");
  });

  it("visible NEWS over a correction shows at once — the release banner must not wait", () => {
    expect(admitNotice(REFUSED, news("The order’s unlocked — you can edit again"))).toBe("show");
  });

  it("a correction over news shows", () => {
    expect(admitNotice(news("Aung added Tea"), REFUSED)).toBe("show");
  });

  it("an IDENTICAL correction extends rather than re-announcing", () => {
    expect(admitNotice(REFUSED, correction(REFUSED.text))).toBe("extend");
  });

  it("a DIFFERENT correction shows", () => {
    expect(
      admitNotice(REFUSED, correction("We couldn’t confirm Mohinga — check your order below.")),
    ).toBe("show");
  });

  it("a visible claim over a quiet claim shows", () => {
    expect(admitNotice(claim("Mohinga, quantity 2"), claim("2 Mohinga added", false))).toBe("show");
  });
});

describe("purgesDeferred — a correction drops the claim waiting behind it", () => {
  it("a correction purges a deferred claim", () => {
    expect(purgesDeferred(REFUSED, claim("Mohinga added"))).toBe(true);
  });

  it("news does not purge a deferred claim", () => {
    expect(purgesDeferred(news("Aung added Tea"), claim("Mohinga added"))).toBe(false);
  });

  it("a correction does not purge deferred news", () => {
    expect(purgesDeferred(REFUSED, news("Aung added Tea"))).toBe(false);
  });
});
