/**
 * The comment-stripping CSS declaration walker the stylesheet contracts share — lifted verbatim out
 * of `responsive-contract.test.ts` (R1) when `motion-contract.test.ts` (Phase 1c · cart-motion)
 * became its second reader, so the two guards parse the stylesheet ONE way. Test-support only: no
 * runtime code imports it.
 *
 * Guards PARSE, never scan (LEARNINGS #60): a substring search is satisfied by a comment or a dead
 * rule, so every declaration is bound to the selector block it sits in and to the `@media` /
 * `@supports` / `@keyframes` block wrapping that.
 */

/** Comments name selectors and values in prose; a guard a comment can satisfy reads the wrong thing. */
export const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** `i` is the declaration's ORDER in the file — the cascade tiebreak at equal specificity, which is
 *  what an `@media` block relies on: it adds no weight, so a bare rule written AFTER it wins. */
export type CssDecl = {
  media: string | null;
  selector: string;
  prop: string;
  value: string;
  i: number;
};

/**
 * A declaration walker that binds every `prop: value` to the selector block it sits in AND to the
 * `@media` / `@supports` block wrapping that (one level, which is all this stylesheet uses). A
 * tokenizer on `{` `}` `;` is enough: prettier writes every declaration `prop: value;` on its own
 * line and closes every block, so there is no ambiguity to resolve — and where there would be
 * (a `{` inside a string), this file has none: it throws rather than guess.
 */
export function cssDeclarations(css: string): CssDecl[] {
  const code = stripCssComments(css);
  // No brace inside a quoted string (one line, same quote): the brace walk below is then exact.
  if (/(["'])(?:(?!\1)[^\n])*[{}](?:(?!\1)[^\n])*\1/.test(code))
    throw new Error("a brace inside a quoted string — the brace walk would be ambiguous");
  const out: CssDecl[] = [];
  const stack: string[] = [];
  let buf = "";
  const flush = () => {
    const text = buf.trim();
    buf = "";
    const colon = text.indexOf(":");
    if (colon < 0 || stack.length === 0) return;
    const head = stack[stack.length - 1]!;
    if (head.startsWith("@")) return; // a declaration directly inside @media/@supports: not a rule
    const media = stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
    out.push({
      media,
      selector: head.replace(/\s+/g, " "),
      prop: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
      i: out.length,
    });
  };
  for (const ch of code) {
    if (ch === "{") {
      stack.push(buf.trim().replace(/\s+/g, " "));
      buf = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      flush();
    } else buf += ch;
  }
  return out;
}
