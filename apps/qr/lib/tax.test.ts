import { describe, expect, it } from "vitest";
import type { TaxCategory } from "@mms/db";
import { isTaxable, lineTax, taxRate } from "./tax";

/**
 * W8b (TS half) — the tax engine's category matrix, rounding, and rate constant.
 *
 * `lib/tax.ts` is a HAND-MAINTAINED mirror of `mms_taxable` / `mms_line_tax`
 * (`supabase/migrations/20260618000000_qr_platform_init.sql:14-39`). Nothing checked they agreed
 * until W8. The SQL half of this parity lives in `supabase/tests/tax_parity_test.sql` and asserts
 * the SAME integers from the database side, inside the `migrations-check` CI job.
 *
 * ⚠️ The two halves deliberately do NOT read each other. A TS test that parsed the migration would
 * be a turbo-cache trap: turbo hashes only files INSIDE the workspace, so editing a migration leaves
 * `@mms/qr:test` a cache hit and it replays a green log against drifted SQL (verified in this repo).
 * Each side asserts the constants independently, in its own job.
 *
 * ⚠️ Amounts are bounded NON-NEGATIVE here on purpose. TS `Math.round` is half-toward-+∞ and SQL
 * `round(numeric)` is half-away-from-zero, so they diverge by 1¢ on negative ties (−200 → TS −19,
 * SQL −20). That gap is real and schema-representable (no `>= 0` CHECK on `unit_price_cents`) — it is
 * filed as **T4**, pinned below, and not fixed here.
 */

// Exhaustive by construction: a `Record<TaxCategory, …>` fails to COMPILE if the union gains a
// member, so a new tax category can never silently skip this matrix. (A plain array would just
// under-test it.) `dineIn` / `toGo` are the expected `isTaxable` results.
const MATRIX: Record<TaxCategory, { dineIn: boolean; toGo: boolean }> = {
  // CDTFA Reg 1603 / 80-80: hot & prepared food is taxable however it leaves the building.
  hot_prepared: { dineIn: true, toGo: true },
  beverage_hot: { dineIn: true, toGo: true },
  // Retail non-food (a mug, a tote) is always taxable — never a grocery staple.
  retail_nonfood: { dineIn: true, toGo: true },
  // Cold food is taxable ONLY when consumed on premises. This is the rule the for-here/to-go toggle
  // flips, and the only category whose taxability a diner can change.
  cold_food: { dineIn: true, toGo: false },
  beverage_cold: { dineIn: true, toGo: false },
  // Grocery staples are exempt in both directions.
  grocery_food: { dineIn: false, toGo: false },
};

const CATEGORIES = Object.keys(MATRIX) as TaxCategory[];

describe("isTaxable — the CDTFA category matrix", () => {
  it("covers every TaxCategory the union declares", () => {
    // Guards the guard: if someone adds a member to `TaxCategory` and updates MATRIX to keep the
    // build green, this still tells them the matrix grew.
    expect(CATEGORIES).toHaveLength(6);
  });

  for (const category of CATEGORIES) {
    const expected = MATRIX[category];
    it(`${category}: dine-in ${expected.dineIn}, to-go ${expected.toGo}`, () => {
      expect(isTaxable(category, true)).toBe(expected.dineIn);
      expect(isTaxable(category, false)).toBe(expected.toGo);
    });
  }

  it("falls back to TAXABLE on an unknown category (fail-safe, mirrors the SQL `else true`)", () => {
    // A category that isn't in the union can still arrive from the DB (the column is text). Both
    // engines default to taxable so an unmapped item over-collects rather than under-remits.
    expect(isTaxable("something_new" as TaxCategory, true)).toBe(true);
    expect(isTaxable("something_new" as TaxCategory, false)).toBe(true);
  });
});

describe("lineTax — rounding", () => {
  // Computed in Node against RATE = 0.105 (W16a, owner-confirmed L.A rate). Each row is
  // `amount × 0.105` shown exactly, then rounded.
  //
  // The drift column is the point of this table: it marks rows whose value CHANGES if the rate is
  // edited to 0.104 (the verify:slice mutant's replacement). Verified drift set at 0.104
  // (computed, not assumed): 100 11→10 · 300 32→31 · 1000 105→104 · 2000 210→208 · 10000
  // 1050→1040 · 123456 12963→12839. At 0.105 the ties move to the ODD hundreds (100 → 10.5);
  // the even hundreds (200/600/1400) are now EXACT products, not ties.
  const CASES: [amount: number, expected: number, note: string][] = [
    [0, 0, "0 × 0.105 = 0"],
    [1, 0, "1 × 0.105 = 0.105 → 0 (a 1¢ line collects no tax — the M6 root cause)"],
    [4, 0, "4 × 0.105 = 0.42 → 0"],
    [5, 1, "5 × 0.105 = 0.525 → 1 (the smallest amount that collects any tax)"],
    [
      100,
      11,
      "100 × 0.105 = 10.5 → 11 — an EXACT .5 tie; see the tie note below (drifts to 10 at 0.104)",
    ],
    [200, 21, "200 × 0.105 = 21 exactly → 21 (no drift at 0.104 — a rate probe it is NOT)"],
    [300, 32, "300 × 0.105 = 31.5 → 32 — tie (drifts to 31 at 0.104)"],
    [600, 63, "600 × 0.105 = 63 exactly → 63 (was a tie at 0.0975; exact now)"],
    [700, 74, "700 × 0.105 = 73.5 → 74 — tie (drifts to 73 at 0.104)"],
    [1000, 105, "1000 × 0.105 = 105 exactly → 105 (drifts to 104 at 0.104)"],
    [1250, 131, "1250 × 0.105 = 131.25 → 131 (drifts to 130 at 0.104)"],
    [1400, 147, "1400 × 0.105 = 147 exactly → 147 (drifts to 146 at 0.104)"],
    [2000, 210, "2000 × 0.105 = 210 exactly → 210 (drifts to 208 at 0.104)"],
    [9999, 1050, "9999 × 0.105 = 1049.895 → 1050 (drifts to 1040 at 0.104)"],
    [10000, 1050, "10000 × 0.105 = 1050 exactly → 1050 (drifts to 1040 at 0.104)"],
    [123456, 12963, "123456 × 0.105 = 12962.88 → 12963 (drifts to 12839 at 0.104)"],
  ];

  for (const [amount, expected, note] of CASES) {
    it(`${amount}¢ → ${expected}¢ — ${note}`, () => {
      expect(lineTax(amount, "hot_prepared", true)).toBe(expected);
    });
  }

  it("rounds exact .5 ties UP, matching SQL round(numeric)", () => {
    // Why these agree despite the engines' different tie rules: the IEEE double nearest 0.105 is
    // 0.10499999999999999611… — strictly BELOW 21/200 — but the tie-site PRODUCTS land exactly on
    // .5 in floating point (100 × 0.105 === 10.5, 300 × 0.105 === 31.5 — verified in Node), and
    // Math.round (half toward +∞) takes them up: the same direction SQL's exact-numeric
    // half-away-from-zero takes for a positive amount. The agreement is a property of these
    // products, not of the rounding modes — it is why the negative side (T4) diverges.
    for (const amount of [100, 300, 700, 900, 1100]) {
      expect(lineTax(amount, "hot_prepared", true)).toBe(Math.ceil(amount * 0.105));
    }
  });

  it("returns exactly 0 for every exempt category, at every amount", () => {
    for (const amount of [0, 1, 5, 200, 2000, 123456]) {
      expect(lineTax(amount, "grocery_food", true)).toBe(0);
      expect(lineTax(amount, "grocery_food", false)).toBe(0);
      expect(lineTax(amount, "cold_food", false)).toBe(0);
      expect(lineTax(amount, "beverage_cold", false)).toBe(0);
    }
  });

  it("never returns a fractional cent", () => {
    for (let amount = 0; amount <= 5000; amount += 7) {
      expect(Number.isInteger(lineTax(amount, "hot_prepared", true))).toBe(true);
    }
  });

  it("is monotonic in amount (a bigger base never collects less tax)", () => {
    let prev = 0;
    for (let amount = 0; amount <= 20000; amount += 13) {
      const t = lineTax(amount, "hot_prepared", true);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe("the rate constant", () => {
  it("is 0.105 — the L.A combined rate (owner-confirmed, W16a)", () => {
    // The SQL half asserts the same literal from the database side. A rate change that lands on ONE
    // side only reddens exactly one of the two jobs, which is the whole point of the pair.
    //
    // NOTE the asymmetry worth knowing: the SQL rate has no charge consumer today — every reader of
    // the per-line `tax_cents` the SQL writes treats it as a boolean `> 0` flag, so a SQL-only rate
    // change moves ZERO charged amounts, while a TS-only change moves every one of them. A one-sided
    // *category* edit IS charge-affecting, via the diner-reachable for-here/to-go toggle
    // (`mms_set_line_fulfillment` recomputes `tax_cents` in SQL).
    expect(taxRate()).toBe(0.105);
  });

  it("is the rate lineTax actually applies", () => {
    // Ties the exported constant to observed behaviour, so exporting a stale constant can't pass.
    expect(lineTax(10000, "hot_prepared", true)).toBe(Math.round(10000 * taxRate()));
  });
});

describe("T4 (known-open) — negative amounts diverge from SQL", () => {
  it("rounds a negative tie toward +∞ where SQL rounds away from zero", () => {
    // PINNED, NOT FIXED. Every value below is COMPUTED in Node at 0.105 — the ties moved to the
    // odd hundreds with the W16a rate change:
    //   −100 × 0.105 = −10.5 → TS −10, SQL −11
    //   −300 × 0.105 = −31.5 → TS −31, SQL −32
    //   −700 × 0.105 = −73.5 → TS −73, SQL −74
    //  −1000 × 0.105 = −105 exactly → −105 both sides (no longer a tie — kept as the agreement row)
    // TS takes half toward +∞ (so a negative tie rounds toward zero); SQL numeric takes half away
    // from zero. Reachable because `unit_price_cents` carries no `>= 0` CHECK — adding those CHECKs
    // is a migration against live data (its own slice), see OPEN-ITEMS T4. When it IS fixed, these
    // amounts should become unrepresentable rather than merely changing value.
    expect(lineTax(-100, "hot_prepared", true)).toBe(-10);
    expect(lineTax(-300, "hot_prepared", true)).toBe(-31);
    expect(lineTax(-700, "hot_prepared", true)).toBe(-73);
    expect(lineTax(-1000, "hot_prepared", true)).toBe(-105);
  });

  it("returns negative zero for a small negative amount", () => {
    // `Math.round(-4 * 0.105)` is `-0`. It compares equal to 0 with `===` but `Object.is` tells
    // them apart, and it serialises as `-0` in JSON — noted so a future reader isn't surprised.
    expect(Object.is(lineTax(-4, "hot_prepared", true), -0)).toBe(true);
  });
});
