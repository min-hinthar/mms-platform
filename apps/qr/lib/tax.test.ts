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
  // Hand-computed against RATE = 0.0975. Each row is `amount × 0.0975` shown exactly, then rounded.
  //
  // The `driftsAt098` column is the point of this table: it marks rows whose value CHANGES if the
  // rate is edited to 0.098. A table built only from tie-priced fixtures is USELESS as a drift
  // guard — e.g. 1400¢ rounds to 137 under both 0.0975 and 0.098, so a 1400-only table stays green
  // through exactly the drift the exit criterion tells you to induce. 2000 and 10000 do move.
  // Verified drift set at 0.098 (computed, not assumed): 2000 195→196 · 1250 122→123 · 9999 975→980 ·
  // 10000 975→980 · 123456 12037→12099. The tie-priced rows (200/600/1000/1400) do NOT move and are
  // here to pin the tie DIRECTION, not to guard the rate.
  const CASES: [amount: number, expected: number, note: string][] = [
    [0, 0, "0 × 0.0975 = 0"],
    [1, 0, "1 × 0.0975 = 0.0975 → 0 (a 1¢ line collects no tax — the M6 root cause)"],
    [5, 0, "5 × 0.0975 = 0.4875 → 0"],
    [6, 1, "6 × 0.0975 = 0.585 → 1 (the smallest amount that collects any tax)"],
    [100, 10, "100 × 0.0975 = 9.75 → 10 (a .75 round-up)"],
    [200, 20, "200 × 0.0975 = 19.5 → 20 — an EXACT .5 tie; see the tie note below"],
    [600, 59, "600 × 0.0975 = 58.5 → 59 — tie"],
    [1000, 98, "1000 × 0.0975 = 97.5 → 98 — tie (unchanged at 0.098, not a drift probe)"],
    [1400, 137, "1400 × 0.0975 = 136.5 → 137 — tie (unchanged at 0.098, NOT a drift probe)"],
    [2000, 195, "2000 × 0.0975 = 195 exactly → 195 (drifts to 196 at 0.098)"],
    [1250, 122, "1250 × 0.0975 = 121.875 → 122 (drifts to 123 at 0.098)"],
    [9999, 975, "9999 × 0.0975 = 974.9025 → 975 (drifts to 980 at 0.098)"],
    [10000, 975, "10000 × 0.0975 = 975 exactly → 975 (drifts to 980 at 0.098)"],
    [123456, 12037, "123456 × 0.0975 = 12036.96 → 12037 (drifts to 12099 at 0.098)"],
  ];

  for (const [amount, expected, note] of CASES) {
    it(`${amount}¢ → ${expected}¢ — ${note}`, () => {
      expect(lineTax(amount, "hot_prepared", true)).toBe(expected);
    });
  }

  it("rounds exact .5 ties UP, matching SQL round(numeric)", () => {
    // Why these agree despite the engines' different tie rules: the IEEE double nearest 0.0975 is
    // 0.09750000000000000333…, i.e. strictly ABOVE 39/400. So an "exact" tie like 200 × 0.0975 in
    // floating point lands a hair above 19.5, and Math.round (half toward +∞) rounds up — the same
    // direction SQL's exact-numeric half-away-from-zero takes for a positive amount. The agreement
    // is real but it is a coincidence of the constant, not of the rounding modes: it is why the
    // negative side (T4) diverges.
    for (const amount of [200, 600, 1000, 1400, 1800]) {
      expect(lineTax(amount, "hot_prepared", true)).toBe(Math.ceil(amount * 0.0975));
    }
  });

  it("returns exactly 0 for every exempt category, at every amount", () => {
    for (const amount of [0, 1, 6, 200, 2000, 123456]) {
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
  it("is 0.0975 — the Covina combined rate", () => {
    // The SQL half asserts the same literal from the database side. A rate change that lands on ONE
    // side only reddens exactly one of the two jobs, which is the whole point of the pair.
    //
    // NOTE the asymmetry worth knowing: the SQL rate has no charge consumer today — every reader of
    // the per-line `tax_cents` the SQL writes treats it as a boolean `> 0` flag, so a SQL-only rate
    // change moves ZERO charged amounts, while a TS-only change moves every one of them. A one-sided
    // *category* edit IS charge-affecting, via the diner-reachable for-here/to-go toggle
    // (`mms_set_line_fulfillment` recomputes `tax_cents` in SQL).
    expect(taxRate()).toBe(0.0975);
  });

  it("is the rate lineTax actually applies", () => {
    // Ties the exported constant to observed behaviour, so exporting a stale constant can't pass.
    expect(lineTax(10000, "hot_prepared", true)).toBe(Math.round(10000 * taxRate()));
  });
});

describe("T4 (known-open) — negative amounts diverge from SQL", () => {
  it("rounds a negative tie toward +∞ where SQL rounds away from zero", () => {
    // PINNED, NOT FIXED. Every value below is COMPUTED, not reasoned about: the double product is
    // printed alongside so the next reader can check the tie without re-deriving it.
    //   −200 × 0.0975 = −19.5  → TS −19, SQL −20
    //   −600 × 0.0975 = −58.5  → TS −58, SQL −59
    //  −1000 × 0.0975 = −97.5  → TS −97, SQL −98
    //  −1400 × 0.0975 = −136.5 → TS −136, SQL −137
    // TS takes half toward +∞ (so a negative tie rounds toward zero); SQL numeric takes half away
    // from zero. Reachable because `unit_price_cents` carries no `>= 0` CHECK — adding those CHECKs
    // is a migration against live data (its own slice), see OPEN-ITEMS T4. When it IS fixed, these
    // amounts should become unrepresentable rather than merely changing value.
    expect(lineTax(-200, "hot_prepared", true)).toBe(-19);
    expect(lineTax(-600, "hot_prepared", true)).toBe(-58);
    expect(lineTax(-1000, "hot_prepared", true)).toBe(-97);
    expect(lineTax(-1400, "hot_prepared", true)).toBe(-136);
  });

  it("returns negative zero for a small negative amount", () => {
    // `Math.round(-5 * 0.0975)` is `-0`. It compares equal to 0 with `===` but `Object.is` tells
    // them apart, and it serialises as `-0` in JSON — noted so a future reader isn't surprised.
    expect(Object.is(lineTax(-5, "hot_prepared", true), -0)).toBe(true);
  });
});
