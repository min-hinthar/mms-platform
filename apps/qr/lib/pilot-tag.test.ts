import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PILOT_PROMO_CODE, isPilotCode, promoTag } from "./pilot-tag";

/**
 * P5 — the reporting tag. Every case here is a shape `qr_carts.promo_code` can actually hold: a
 * `text` column with no NOT NULL and no CHECK, written today by one uppercasing writer and, per
 * OPEN-ITEMS P2e, about to gain a second.
 */
describe("promoTag — the one normalizer behind every reported promo code", () => {
  it("passes an already-canonical code through unchanged", () => {
    expect(promoTag("PILOT15")).toBe("PILOT15");
  });

  it("upper-cases, so one campaign is one value in a filter", () => {
    // The failure this prevents is not a crash: it is `PILOT15` and `pilot15` reading as two
    // campaigns, one of which under-counts the pilot by however many orders took the other spelling.
    expect(promoTag("pilot15")).toBe("PILOT15");
    expect(promoTag("Pilot15")).toBe("PILOT15");
  });

  it("trims, because a stray space is a different filter value and nothing else", () => {
    expect(promoTag("  pilot15  ")).toBe("PILOT15");
  });

  it("reports NO CODE for every not-a-code shape the column can hold", () => {
    // The empty string is the one that bites: a writer that clears a code by writing `""` rather
    // than NULL would otherwise put a nameless "campaign" on the money path's events.
    expect(promoTag("")).toBeNull();
    expect(promoTag("   ")).toBeNull();
    expect(promoTag(null)).toBeNull();
    expect(promoTag(undefined)).toBeNull();
  });

  it("never invents a code from a non-string", () => {
    expect(promoTag(42 as unknown as string)).toBeNull();
  });

  it("isPilotCode answers on the normalized value, not the raw one", () => {
    expect(isPilotCode(" pilot15 ")).toBe(true);
    expect(isPilotCode("WELCOME10")).toBe(false);
    expect(isPilotCode(null)).toBe(false);
    // The constant and the predicate must agree — a rename that touched only one would pass every
    // other assertion in this file.
    expect(isPilotCode(PILOT_PROMO_CODE)).toBe(true);
  });
});

/**
 * P5 — the WIRING, which is the half the normalizer's own tests cannot see.
 *
 * `promoTag` was tested thoroughly and used unguarded: replace `promoTag(cartRow?.promo_code)` with
 * `cartRow?.promo_code ?? null` at either capture site and every test here — and every mutant, since
 * they all target the normalizer's internals — stays green, while PostHog starts receiving `PILOT15`,
 * `pilot15` and `""` as three different campaign values in an exact-match filter. That is the exact
 * failure this module exists to prevent, one call away from the code that prevents it.
 *
 * ⚠️ IT PARSES, IT DOES NOT SCAN (LEARNINGS #60). `grep "promoTag"` is satisfied by this very
 * docblock, by an import left behind after the call was changed, and by a commented-out line. The
 * check below walks the TypeScript AST to the `promo_code` property of the analytics payload and
 * demands its initializer be a CALL to `promoTag` — a name in a comment is not an AST node.
 *
 * `apps/qr/app/api/stripe/webhook/route.ts` carries `verify:slice-exempt`, so `check-money-coverage`
 * will never ask for a mutant there; this is the only thing standing under that call site.
 */
describe("the capture sites normalize the code — proved against the AST, not the text", () => {
  const SITES = ["app/api/stripe/webhook/route.ts", "lib/staff-cart.ts"] as const;

  for (const rel of SITES) {
    it(`${rel} passes promo_code through promoTag()`, () => {
      const src = readFileSync(join(import.meta.dirname, "..", rel), "utf8");
      const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true);
      const initializers: string[] = [];
      const visit = (n: ts.Node): void => {
        if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "promo_code")
          initializers.push(
            ts.isCallExpression(n.initializer) && ts.isIdentifier(n.initializer.expression)
              ? `call:${n.initializer.expression.text}`
              : `raw:${n.initializer.getText()}`,
          );
        // ⚠️ `forEachChild` is a SEARCH primitive — a truthy return ABORTS the walk, which would
        // silently stop at the first match and make this guard pass by not looking.
        ts.forEachChild(n, (c) => {
          visit(c);
        });
      };
      visit(sf);
      // A site that stopped assigning `promo_code` at all must fail too, not vacuously pass: an
      // empty list is the shape a deleted capture leaves behind.
      expect(initializers.length).toBeGreaterThan(0);
      expect(initializers).toEqual(initializers.map(() => "call:promoTag"));
    });
  }
});
