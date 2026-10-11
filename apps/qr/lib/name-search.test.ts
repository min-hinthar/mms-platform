import { describe, expect, it } from "vitest";
import { nameSearchOffline, nameSearchPending, nameSearchStep } from "./name-search";

/**
 * PD4 — the Name sheet's search with the radio known to be down. Each MUTATION is a row in
 * scripts/verify-slice.mjs (`name-search/…`), induced and watched go red.
 */
describe("nameSearchStep — no request while the radio is down", () => {
  it("an asked query OFFLINE sends nothing", () => {
    // MUTATION: fetch regardless → the shopper waits on a request the radio cannot carry; red.
    expect(nameSearchStep("durian", false)).toBe("offline");
  });

  it("online it fetches; under two characters there is nothing to ask", () => {
    expect(nameSearchStep("durian", true)).toBe("fetch");
    expect(nameSearchStep(" d ", true)).toBe("clear");
    expect(nameSearchStep("d", false)).toBe("clear");
  });
});

describe("nameSearchOffline — the sheet says so at ONCE, not after a lookup fails", () => {
  it("a fresh query (hits reset to null) with the radio down is the offline state", () => {
    // MUTATION: require a completed empty result (the old predicate) → "Searching…" until the
    // network stack gives up; red.
    expect(nameSearchOffline(true, false, null)).toBe(true);
    expect(nameSearchOffline(true, false, [])).toBe(true);
  });

  it("rows still on screen, online, or nothing asked → not the offline state", () => {
    expect(nameSearchOffline(true, false, [{}])).toBe(false);
    expect(nameSearchOffline(true, true, null)).toBe(false);
    expect(nameSearchOffline(false, false, null)).toBe(false);
  });
});

describe("nameSearchPending — a held query is ON ITS WAY the moment the radio is back (the blind pass on #329 @ f0d013f)", () => {
  it("held + online reads as searching; held + offline does not (that is the offline line)", () => {
    // MUTATION: read only the in-flight flag → the reconnect render has nothing true to say and
    // the page filled it with a failure that never happened; red.
    expect(nameSearchPending(false, true, true)).toBe(true);
    expect(nameSearchPending(false, true, false)).toBe(false);
  });

  it("a lookup in flight is searching whatever the radio says; nothing held, nothing in flight is not", () => {
    expect(nameSearchPending(true, false, false)).toBe(true);
    expect(nameSearchPending(false, false, true)).toBe(false);
  });
});
