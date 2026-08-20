import { describe, expect, it } from "vitest";
import {
  catalogFreshness,
  freshnessDurationMs,
  freshnessSentence,
  nameList,
  type CatalogRow,
} from "./catalog-freshness";

const row = (id: string, name: string, soldOut = false, priceCents = 1200): CatalogRow => ({
  id,
  name,
  soldOut,
  priceCents,
});
const MENU: CatalogRow[] = [row("a", "Mohinga"), row("b", "Tea Leaf Salad"), row("c", "Samosa")];
/** A server render landed AND it was built from a live read — the only proof that permits a claim. */
const LANDED = { advanced: true, trusted: true } as const;

describe("catalogFreshness", () => {
  it("⚠️ NEVER reports a failed read as a sold-out restaurant", () => {
    // THE rule this module exists for. A failed catalog read yields an EMPTY snapshot; diffed
    // naively, every dish reads as newly sold out and the app announces to every diner in the room
    // that the whole restaurant has run out. "A failure must never read as empty", at a new boundary.
    const out = catalogFreshness(MENU, [], LANDED);
    expect(out).toEqual({ state: "unverified" });
    expect(freshnessSentence(out)).not.toMatch(/sold out/i);
  });

  it("says 'we couldn’t check' when no server render landed — not 'nothing changed'", () => {
    // The separating case: BOTH produce a screen where nothing moved, so only the outcome tells them
    // apart. `router.refresh()` returns void, so freshness must be PROVEN by the caller's stamp.
    const unproven = catalogFreshness(MENU, MENU, { advanced: false, trusted: true });
    const proven = catalogFreshness(MENU, MENU, LANDED);
    expect(unproven).toEqual({ state: "unverified" });
    expect(proven).toEqual({ state: "unchanged" });
    expect(freshnessSentence(unproven)).not.toBe(freshnessSentence(proven));
    expect(freshnessSentence(unproven)).toMatch(/couldn’t reach/i);
  });

  it("names what sold out and what came back", () => {
    const next = [row("a", "Mohinga", true), row("b", "Tea Leaf Salad"), row("c", "Samosa")];
    expect(catalogFreshness(MENU, next, LANDED)).toEqual({
      state: "changed",
      soldOut: ["Mohinga"],
      restocked: [],
      priceChanges: 0,
    });
    const back = catalogFreshness(next, MENU, LANDED);
    expect(back).toEqual({
      state: "changed",
      soldOut: [],
      restocked: ["Mohinga"],
      priceChanges: 0,
    });
    expect(freshnessSentence(back)).toBe("Mohinga is back on.");
  });

  it("reports price movement as a COUNT and never as a delta", () => {
    // W17b ships a live staff price editor, so prices really do move mid-service — but the server
    // owns the number, and a client-stated "+$1.00" starts an argument the client cannot win.
    const next = [
      row("a", "Mohinga", false, 1400),
      row("b", "Tea Leaf Salad", false, 900),
      row("c", "Samosa"),
    ];
    const out = catalogFreshness(MENU, next, LANDED);
    expect(out).toEqual({ state: "changed", soldOut: [], restocked: [], priceChanges: 2 });
    const said = freshnessSentence(out);
    expect(said).toBe("2 prices updated.");
    expect(said).not.toMatch(/\$|\d+\.\d\d|[+−-]\s*\d/);
  });

  it("never claims a dish 'just' sold out — recency is not a fact it holds", () => {
    // `sold_out_at` is not in the menu page's select. "now" is true relative to what the diner was
    // looking at; "just" would be a recency claim with nothing behind it.
    const next = [row("a", "Mohinga", true), row("b", "Tea Leaf Salad"), row("c", "Samosa")];
    expect(freshnessSentence(catalogFreshness(MENU, next, LANDED))).not.toMatch(/\bjust\b/i);
  });

  it("ignores dishes that did not exist before — a new dish is not a change", () => {
    const next = [...MENU, row("d", "Nan Gyi Thoke")];
    expect(catalogFreshness(MENU, next, LANDED)).toEqual({ state: "unchanged" });
  });

  it("⚠️ NEVER reports a STALE render as a verified one, even though its stamp advanced", () => {
    // The second half of the same rule, and the one the first version got wrong. /menu serves a
    // LAST-GOOD catalog when the live read fails (W10a), and that stale render still advances the
    // render stamp — so `advanced` alone said "verified" about a render where the database was
    // never reached. Two separate facts, two separate flags.
    const stale = catalogFreshness(MENU, MENU, { advanced: true, trusted: false });
    expect(stale).toEqual({ state: "unverified" });
    expect(freshnessSentence(stale)).toMatch(/couldn’t reach/i);
  });

  it("⚠️ an OLDER cached snapshot is never diffed into good news", () => {
    // `readLastGoodCatalog` is per-INSTANCE module state bounded by traffic, not a TTL, so a refresh
    // landing on a different warm instance can serve a cache OLDER than what the diner already had.
    // Diffed as if trustworthy, an 86'd dish reads as "back on" — sending the diner to build an
    // order around a dish that is still gone, which is the exact failure the gesture exists to
    // prevent. The separating case: identical inputs, opposite `trusted`.
    const shown = [row("a", "Mohinga", true), row("b", "Tea Leaf Salad"), row("c", "Samosa")];
    const olderCache = MENU; // Mohinga still available — from BEFORE the 86
    expect(catalogFreshness(shown, olderCache, { advanced: true, trusted: true })).toEqual({
      state: "changed",
      soldOut: [],
      restocked: ["Mohinga"],
      priceChanges: 0,
    });
    const honest = catalogFreshness(shown, olderCache, { advanced: true, trusted: false });
    expect(honest).toEqual({ state: "unverified" });
    expect(freshnessSentence(honest)).not.toMatch(/back on/i);
  });

  it("an empty menu that was ALREADY empty is not a failed read", () => {
    // The separating case for the empty guard: it fires on a catalog that SHRANK to nothing, not on
    // a cold start that legitimately had nothing to compare against.
    expect(catalogFreshness([], [], LANDED)).toEqual({ state: "unchanged" });
  });
});

describe("nameList", () => {
  it("stays readable aloud — two names, then a count", () => {
    expect(nameList(["Mohinga"])).toBe("Mohinga");
    expect(nameList(["Mohinga", "Tea"])).toBe("Mohinga and Tea");
    expect(nameList(["Mohinga", "Tea", "Samosa"])).toBe("Mohinga, Tea and 1 more");
    expect(nameList(["a", "b", "c", "d", "e"])).toBe("a, b and 3 more");
    expect(nameList([])).toBe("");
  });

  it("agrees its verb with the count", () => {
    const one = freshnessSentence({
      state: "changed",
      soldOut: ["Mohinga"],
      restocked: [],
      priceChanges: 0,
    });
    const two = freshnessSentence({
      state: "changed",
      soldOut: ["Mohinga", "Tea"],
      restocked: [],
      priceChanges: 0,
    });
    expect(one).toContain("is sold out now");
    expect(two).toContain("are sold out now");
  });
});

describe("freshnessDurationMs", () => {
  it("gives the longest sentence time to be read, and never undercuts the toast default", () => {
    // `flash` defaults to 2200ms, written for "Added Mohinga". The longest sentence this module can
    // emit is roughly five times that text, and a notice that leaves before it can be read is the
    // same defect as no notice.
    const short = freshnessSentence({ state: "unchanged" });
    const long = freshnessSentence({
      state: "changed",
      soldOut: ["Mohinga", "Tea Leaf Salad", "Samosa", "Nan Gyi Thoke"],
      restocked: ["Ohn No Khao Swe", "Falooda"],
      priceChanges: 3,
    });
    expect(long.length).toBeGreaterThan(short.length * 3);
    expect(freshnessDurationMs(short)).toBe(2200); // floored at the provider default, never shorter
    expect(freshnessDurationMs(long)).toBeGreaterThan(freshnessDurationMs(short));
    // Capped so a toast never becomes furniture, however many dishes moved.
    expect(freshnessDurationMs("x".repeat(10_000))).toBe(7000);
  });
});
