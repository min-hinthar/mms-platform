import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { cssDeclarations, type CssDecl } from "./css-declarations";

/**
 * Phase 1c · cart-motion — the stylesheet half of a removed line's exit, parsed, never scanned.
 *
 * The ghost row is drawn by `useLineMotion` and styled ONLY by these rules, so a one-word edit here
 * changes what the diner sees with every jsdom suite still green (jsdom does not run CSS): drop
 * `reverse` and the removed row fades IN; `both` → `none` and it flashes back to full opacity at the
 * end of its exit; a `display: none` reduced-motion rule loses to the row's inline `display:flex`.
 * Every declaration is bound to its selector and its `@media` block by the shared walker
 * (`css-declarations.ts`), comments stripped, and a second candidate rule is refused rather than
 * picked by position.
 */
const QR = join(__dirname, "..");
const CSS = readFileSync(join(QR, "app", "globals.css"), "utf8");
const TOKENS = readFileSync(join(QR, "..", "..", "packages", "ui", "src", "tokens.css"), "utf8");
const HOOK = readFileSync(join(QR, "components", "useLineMotion.ts"), "utf8");
const DECLS = cssDeclarations(CSS);
const RM = "@media (prefers-reduced-motion: reduce)";

/** Does a (possibly comma-listed, possibly compound) selector mention `.mms-remove` as a class? */
const touchesRemove = (selector: string) => /\.mms-remove(?![\w-])/.test(selector);
const members = (selector: string) => selector.split(",").map((s) => s.trim());
const on = (selector: string, prop: string, media: string | null): CssDecl[] =>
  DECLS.filter(
    (d) => members(d.selector).includes(selector) && d.prop === prop && d.media === media,
  );
const one = (selector: string, prop: string, media: string | null) => {
  const hits = on(selector, prop, media);
  expect(hits, `${selector} { ${prop} } under ${media ?? "no media"}`).toHaveLength(1);
  return hits[0]!.value;
};
/** Top-level tokens of a CSS value (a `var(...)` stays one token). */
const words = (value: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

describe("the removed-row exit — .mms-remove", () => {
  it("is exactly two rules, the exit and its reduced-motion off-switch — nothing else can override them", () => {
    const where = [
      ...new Set(
        DECLS.filter((d) => touchesRemove(d.selector)).map((d) => `${d.media} ${d.selector}`),
      ),
    ];
    // A compound `.checkout-line.mms-remove { animation: … }` would outrank the base rule silently.
    expect(where.sort()).toEqual([`${RM} .mms-remove`, "null .mms-remove"].sort());
  });

  it("plays the house arrival BACKWARDS and holds its end state", () => {
    const animation = one(".mms-remove", "animation", null);
    expect(animation).not.toContain(","); // one animation, not a list
    const w = words(animation);
    expect(w[0]).toBe("mmsRise");
    // MUTATION: drop `reverse` — the removed row fades IN, red.
    expect(w).toContain("reverse");
    // MUTATION: `both` → `none` — the ghost flashes back to opacity 1 when its exit ends, red.
    expect(w).toContain("both");
    expect(w).toContain("var(--dur-base)");
    expect(one(".mms-remove", "pointer-events", null)).toBe("none");
  });

  it("the keyframes it reverses START invisible, so the reversed run ENDS invisible", () => {
    const from = DECLS.filter(
      (d) => d.media === "@keyframes mmsRise" && d.selector === "from" && d.prop === "opacity",
    );
    expect(from).toHaveLength(1);
    expect(from[0]!.value).toBe("0");
  });

  it("reduced motion: no animation, invisible at once, and never a `display` rule", () => {
    // MUTATION: delete the RM rule — the ghost fades for 240ms under reduced motion, red.
    expect(one(".mms-remove", "animation", RM)).toBe("none");
    expect(one(".mms-remove", "opacity", RM)).toBe("0");
    // MUTATION: RM uses `display: none` — the row's inline `display:flex` wins and the ghost stays
    // visible for its whole bound, red.
    expect(DECLS.filter((d) => touchesRemove(d.selector) && d.prop === "display")).toEqual([]);
  });
});

describe("the tap hold and the FLIP's anchoring switch", () => {
  it("[data-settling] refuses pointer input", () => {
    // MUTATION: delete it — a quick second tap lands on the row that slid under the finger, red.
    expect(one("[data-settling]", "pointer-events", null)).toBe("none");
  });

  it(":root:has([data-flip]) turns scroll anchoring off", () => {
    // MUTATION: delete it — the browser adjusts the scroll between the FLIP's two reads, red.
    expect(one(":root:has([data-flip])", "overflow-anchor", null)).toBe("none");
  });
});

describe("the hook's FLIP reads real tokens", () => {
  it("every token useLineMotion reads is declared on :root in tokens.css", () => {
    // Parsed: the string argument of every `token(...)` call in the hook, so a renamed token (the
    // FLIP would silently fall back or skip) reddens here.
    const sf = ts.createSourceFile("useLineMotion.ts", HOOK, ts.ScriptTarget.Latest, true);
    const read: string[] = [];
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "token" &&
        n.arguments.length === 1 &&
        ts.isStringLiteral(n.arguments[0]!)
      )
        read.push((n.arguments[0] as ts.StringLiteral).text);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect([...new Set(read)].sort()).toEqual(["--dur-base", "--ease-out", "--spring"]);
    const rootTokens = new Set(
      cssDeclarations(TOKENS)
        .filter((d) => d.media === null && members(d.selector).includes(":root"))
        .map((d) => d.prop),
    );
    for (const t of read) expect(rootTokens.has(t), `${t} on :root`).toBe(true);
  });
});
