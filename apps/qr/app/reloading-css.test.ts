import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2i · integration (S1 critic L2) — `<html data-reloading>`, set by the executor's `freeze` in
 * the reload's own task, has a look: a progress cursor and a click-through dim laid under the sticky
 * staff bar, faded in on the kit's `fade` with reduced motion getting it at once. There is no CSS
 * parser in the repo, so the scan is CONSTRAINED: comments stripped, each rule split by brace depth
 * with its enclosing at-rule kept, and a rule is selected by the selector it DECLARES — a selector
 * named only in a comment, or under another media query, is not a match.
 */
type Rule = { at: string | null; selectors: string[]; decls: Map<string, string> };

function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (text: string, at: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) return;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@")) walk(body, head);
      else {
        const decls = new Map<string, string>();
        for (const d of body.split(";")) {
          const c = d.indexOf(":");
          if (c > 0) decls.set(d.slice(0, c).trim(), d.slice(c + 1).trim());
        }
        out.push({ at, selectors: head.split(",").map((s) => s.trim()), decls });
      }
      i = j;
    }
  };
  walk(src, null);
  return out;
}

const all = rules(readFileSync(join(__dirname, "globals.css"), "utf8"));
const RM = "@media (prefers-reduced-motion: reduce)";
/** The ONE rule outside any at-rule that declares exactly this selector — ambiguity is refused. */
function only(selector: string, at: string | null = null): Rule {
  const hit = all.filter((r) => r.at === at && r.selectors.includes(selector));
  expect(hit, `${at ?? "top level"} › ${selector}`).toHaveLength(1);
  return hit[0]!;
}

describe("the reloading page's CSS", () => {
  it("a progress cursor on the document while it reloads", () => {
    // MUTATION (p2i-css/reloading-no-cursor): the cursor rule goes — a counter terminal's pointer
    // reads as live over a page that ignores it; red.
    expect(only("html[data-reloading]").decls.get("cursor")).toBe("progress");
    expect(only("html[data-reloading] body").decls.get("cursor")).toBe("progress");
  });

  it("a dim OVER the page: fixed, full-bleed, click-through, a token colour, under the staff bar", () => {
    // MUTATION (p2i-css/reloading-dim-over-bar): the dim rises above the sticky bar — the bar's own
    // "Reloading…" is dimmed with the page it describes; red.
    const d = only("html[data-reloading] body::after").decls;
    expect(d.get("content")).toBe('""');
    expect(d.get("position")).toBe("fixed");
    expect(d.get("inset")).toBe("0");
    expect(d.get("pointer-events")).toBe("none");
    expect(d.get("background")).toMatch(/^var\(--[a-z-]+\)$/);
    expect(d.get("z-index")).toBe("calc(var(--z-toolbar) - 1)");
    expect(d.get("animation")).toMatch(/^fade var\(--dur-[a-z]+\) var\(--ease-[a-z-]+\)$/);
  });

  it("reduced motion gets the dim at once", () => {
    // MUTATION (p2i-css/reloading-rm-unescorted): the reduced-motion reset goes — the fade runs for a
    // person who asked for none; red.
    expect(only("html[data-reloading] body::after", RM).decls.get("animation")).toBe("none");
  });
});
