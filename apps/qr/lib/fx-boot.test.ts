import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The GPU dial's boot script, tested as the STRING THAT SHIPS.
 *
 * M126 made this script blocking because applying the dial from a React effect lands after the
 * first composite has already allocated full-strength buffers — on the devices whose first
 * composite OOM-crashed a WebKit tab. That makes it a correctness path with no component around it
 * to test, so the assertions here read `layout.tsx` and evaluate the literal it injects. A test
 * that re-typed the script would pass forever while the shipped one rotted.
 *
 * The case that matters is M147 (Codex P2 on #238, post-merge, unanswered until now): the storage
 * read and the hardware-tier derivation shared ONE `try`, so a browser that throws on
 * `localStorage` — Safari private mode, cookies blocked, a partitioned iframe — skipped the tier
 * derivation with it. The device most likely to throw is a locked-down mobile browser, which is
 * precisely the low-end device `lite` exists for, and it was the one getting the full budget.
 */

const SCRIPT = (() => {
  const src = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");

  /**
   * PARSED, and bound to a script that actually RENDERS — the fourth shape of this extraction.
   *
   * Every earlier shape could find a string that is not the shipped script, each in a new way:
   *   1. anchored on the post-fix `var f=null;` prefix → a REGRESSION was unfindable, and vitest
   *      reported "no tests" instead of failing;
   *   2. first textual `__html` containing the key → a known-good copy left ABOVE a regressed one
   *      would be tested instead;
   *   3. strip JSX comments, require exactly one candidate → **uniqueness is not liveness**
   *      (Codex P2, round 2). A good copy in `{false && <script …/>}` or behind a `//` comment,
   *      plus a live script that regressed by dropping the key, leaves the DEAD copy as the sole
   *      candidate and every assertion passes against code that never ships.
   *
   * Text can express "there is a string like this"; it cannot express "this renders". So this asks
   * the compiler, the same instrument `check-promo-grant-pin.mjs` moved to for the same reason:
   * comments are not AST nodes, and a `<script>` inside `{false && …}` is a node whose guard can be
   * inspected. Requires exactly one LIVE candidate; ambiguity throws rather than being resolved by
   * position.
   */
  const sf = ts.createSourceFile(
    "layout.tsx",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  /** Is this node inside a `false && …` / `0 ? … : x` style dead branch? */
  const isDead = (node: ts.Node): boolean => {
    for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        n.left.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return true;
      }
    }
    return false;
  };

  // Every JSX <script> whose dangerouslySetInnerHTML __html names the storage key.
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === "script" && !isDead(node)) {
        for (const attr of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(attr) ||
            attr.name.getText(sf) !== "dangerouslySetInnerHTML" ||
            !attr.initializer ||
            !ts.isJsxExpression(attr.initializer) ||
            !attr.initializer.expression ||
            !ts.isObjectLiteralExpression(attr.initializer.expression)
          ) {
            continue;
          }
          for (const prop of attr.initializer.expression.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText(sf) === "__html" &&
              ts.isNoSubstitutionTemplateLiteral(prop.initializer) &&
              prop.initializer.text.includes("mms.fx")
            ) {
              found.push(prop.initializer.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c);
    });
  };
  visit(sf);

  if (found.length === 0) {
    throw new Error(
      'No RENDERED <script> in layout.tsx sets __html naming "mms.fx". A copy in a comment or a ' +
        "dead branch does not count — if the live dial script changed shape, teach this guard the " +
        "new shape rather than letting it pass against something that never ships.",
    );
  }
  if (found.length > 1) {
    throw new Error(
      `layout.tsx renders ${found.length} scripts naming "mms.fx". This guard cannot know which ` +
        "one wins, and picking the first is how a stale copy gets tested while a regressed one runs.",
    );
  }
  return found[0]!;
})();

/** Run the shipped string against a fake document/window, and report what the dial ended up as. */
function boot(opts: { stored?: string | null; throws?: boolean; cores?: number }) {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem(k: string) {
      if (opts.throws) throw new DOMException("The operation is insecure.", "SecurityError");
      return k === "mms.fx" ? (opts.stored ?? null) : null;
    },
  };
  // `"cores" in opts`, NOT `opts.cores ?? 8` — the default has to distinguish "the caller said
  // nothing" from "the caller explicitly passed undefined", because the second is the real browser
  // case being asserted (a UA that does not report `hardwareConcurrency` at all). A `??` default
  // silently rewrote that case to 8 cores and the assertion tested nothing; it was caught only
  // because the expectation disagreed.
  const navigator = { hardwareConcurrency: "cores" in opts ? opts.cores : 8 };
  const document = { documentElement: root };
  // eslint-disable-next-line no-new-func -- evaluating the SHIPPED literal is the whole point
  new Function("localStorage", "navigator", "document", SCRIPT)(localStorage, navigator, document);
  return root.dataset.fx;
}

describe("the GPU dial's boot script — a storage throw must not cost the tier fallback", () => {
  it("THE M147 CASE: storage throws on a low-core device — `lite` still applies", () => {
    // Before the split this returned undefined: the throw skipped the whole block, and the weakest
    // device — the one most likely to be running a browser that throws — got the full budget.
    expect(boot({ throws: true, cores: 2 })).toBe("lite");
  });

  it("storage throws on a capable device — no dial, which is the correct nothing", () => {
    expect(boot({ throws: true, cores: 8 })).toBeUndefined();
  });

  it("derives `lite` from a low core count when storage is readable but empty", () => {
    expect(boot({ stored: null, cores: 2 })).toBe("lite");
  });

  it("leaves a capable device undialled", () => {
    expect(boot({ stored: null, cores: 8 })).toBeUndefined();
  });

  it("honours an explicit override over the hardware tier, in both directions", () => {
    // `off` on a capable machine, and `off` on a weak one that would otherwise derive `lite`.
    expect(boot({ stored: "off", cores: 8 })).toBe("off");
    expect(boot({ stored: "off", cores: 2 })).toBe("off");
    expect(boot({ stored: "lite", cores: 8 })).toBe("lite");
  });

  it("writes NOTHING for an explicit `full`, since `html[data-fx]` itself is a selector", () => {
    // `data-fx="full"` would still match `html[data-fx]`, which the reduced-transparency override
    // keys on — so "full" must be the ABSENCE of the attribute, not a value of it.
    expect(boot({ stored: "full", cores: 8 })).toBeUndefined();
    expect(boot({ stored: "full", cores: 2 })).toBeUndefined();
  });

  it("ignores a junk stored value and falls back to the hardware tier", () => {
    expect(boot({ stored: "turbo", cores: 2 })).toBe("lite");
    expect(boot({ stored: "turbo", cores: 8 })).toBeUndefined();
  });

  it("treats a missing hardwareConcurrency as low-end, not as capable", () => {
    // `(navigator.hardwareConcurrency || 0) < 4` — an undefined count reads 0, so an unknown device
    // gets the cheaper budget. Asserted because the opposite default would be the dangerous one.
    expect(boot({ stored: null, cores: undefined as unknown as number })).toBe("lite");
  });
});
