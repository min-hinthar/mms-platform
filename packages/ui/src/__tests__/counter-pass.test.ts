import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CounterPass, type CounterPassProps } from "../counter-pass";
import { KitchenTrack } from "../kitchen-track";

/**
 * PATH_DESIGN round 3 — the ONE PASS. Node env, static markup: what the primitive RENDERS per tier,
 * orientation, terminal state and mode. The material (constant inks, Night contrast, the escorts)
 * is `pass-css.test.ts`.
 */
const LABEL = { en: "Table", my: "စားပွဲ" };
const BASE: CounterPassProps = {
  tier: "holder",
  figure: "47",
  figureKind: "table",
  label: LABEL,
  lang: "en",
  id: "pass-h",
};
const render = (props: Partial<CounterPassProps> = {}, children?: unknown) =>
  renderToStaticMarkup(
    createElement(
      CounterPass,
      { ...BASE, ...props },
      children === undefined ? undefined : (children as never),
    ),
  );
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The accessible name of the pass's heading: its text with every `aria-hidden` subtree removed —
 *  the same subtraction the accessible-name computation makes from `aria-labelledby`. */
function headingName(html: string): string {
  const m = /<(h[2-4]|p) class="ui-pass-identity"[^>]*>([\s\S]*?)<\/\1>/.exec(html);
  if (!m) throw new Error("no identity heading");
  let inner = m[2]!;
  // Drop `<span … aria-hidden="true">…</span>` subtrees (one level of nesting inside the label).
  for (let guard = 0; guard < 8; guard++) {
    const next = inner.replace(
      /<span(?: [^>]*)? aria-hidden="true"(?: [^>]*)?>(?:[^<]|<span[^>]*>[^<]*<\/span>)*<\/span>/g,
      "",
    );
    if (next === inner) break;
    inner = next;
  }
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("CounterPass — every tier and orientation, one figure", () => {
  it("renders each tier × orientation with the figure printed ONCE", () => {
    for (const tier of ["holder", "counter", "tv"] as const)
      for (const orientation of ["portrait", "landscape"] as const) {
        const html = render({ tier, orientation }, "body");
        expect(html).toContain(`data-tier="${tier}"`);
        expect(html).toContain(`data-orientation="${orientation}"`);
        // MUTATION: a second "စားပွဲ 47" line (the retired doubled figure) — red.
        expect(count(html, "47")).toBe(1);
        expect(count(html, 'class="ui-pass-figure ui-pass-figure-table"')).toBe(1);
      }
  });

  it("a table figure takes the display face; a code takes the code face", () => {
    expect(render()).toContain('data-figure="table"');
    expect(render()).toContain("ui-pass-figure-table");
    const code = render({ figureKind: "code", figure: "#7C2E9A" });
    expect(code).toContain('data-figure="code"');
    expect(code).toContain("ui-pass-figure-code");
    expect(code).not.toContain("ui-pass-figure-table");
  });

  it("the two-tongue label flips with lang, each tongue marked, Burmese in its own class", () => {
    const en = render({ lang: "en" });
    expect(en).toContain('<span class="ui-pass-label-en" lang="en">Table</span>');
    expect(en).toContain('<span class="ui-pass-label-my" lang="my">စားပွဲ</span>');
    expect(en.indexOf('class="ui-pass-label-en"')).toBeLessThan(en.indexOf('class="ui-pass-label-my"')); // prettier-ignore
    const my = render({ lang: "my" });
    expect(my.indexOf('class="ui-pass-label-my"')).toBeLessThan(my.indexOf('class="ui-pass-label-en"')); // prettier-ignore
    expect(count(my, "·")).toBe(1);
  });

  it("the seam defaults to 4px on the TV and 2px elsewhere; a host may say", () => {
    expect(render({ tier: "tv" })).toContain('data-seam="4px"');
    expect(render({ tier: "counter" })).toContain('data-seam="2px"');
    expect(render({ tier: "holder" })).toContain('data-seam="2px"');
    expect(render({ tier: "holder", seam: "4px" })).toContain('data-seam="4px"');
  });

  it("a three-digit TABLE steps down at the --fs-pass tiers only", () => {
    expect(render({ tier: "counter", figure: "120" })).toContain("data-figure-long");
    expect(render({ tier: "tv", figure: "120" })).toContain("data-figure-long");
    expect(render({ tier: "holder", figure: "120" })).not.toContain("data-figure-long");
    expect(render({ tier: "counter", figure: "47" })).not.toContain("data-figure-long");
    expect(render({ tier: "counter", figure: "120", figureKind: "code" })).not.toContain("data-figure-long"); // prettier-ignore
  });
});

describe("CounterPass — ✓ only at a terminal state", () => {
  it("a pass that is not terminal draws NO check glyph", () => {
    // Red-first: the stamp drawn on a Served head (m10's retired ✓ disc) — red here.
    for (const props of [
      {},
      { tier: "counter" as const },
      { tier: "tv" as const, orientation: "landscape" as const },
      { turning: "head" as const },
    ]) {
      const html = render(props, "body");
      expect(html).not.toContain("ui-pass-stamp");
      expect(html).not.toContain("✓");
      expect(html).not.toContain("<svg");
    }
  });

  it("Paid stamps the stub (the dine-in pass's only ✓), once", () => {
    const html = render({ terminal: "paid" }, "body");
    expect(html).toContain('data-terminal="paid"');
    expect(count(html, 'class="ui-pass-stamp"')).toBe(1);
    // In the stub, not the head: the stamp follows the stub's opening tag, and the head carries no
    // status row at all unless the host passes one.
    expect(html.indexOf('class="ui-pass-stub"')).toBeLessThan(
      html.indexOf('class="ui-pass-stamp"'),
    );
    expect(html).not.toContain("ui-pass-status");
    expect(html).toContain('<svg class="ui-pass-stamp" viewBox="0 0 44 44" aria-hidden="true"');
  });

  it("Ready marks the head of a pickup ticket, once, and stamps no stub", () => {
    const html = render({ terminal: "ready", figureKind: "code", figure: "#7C2E9A" });
    expect(count(html, 'class="ui-pass-stamp"')).toBe(1);
    expect(html.indexOf('class="ui-pass-status"')).toBeLessThan(html.indexOf('class="ui-pass-stamp"')); // prettier-ignore
    expect(html).not.toContain("ui-pass-stub");
  });
});

describe("CounterPass — a11y", () => {
  it("is a section named by its heading, and the name is the lead label + the figure ONCE", () => {
    const en = render();
    expect(en).toMatch(/^<section class="ui-pass"[^>]*aria-labelledby="pass-h"/);
    expect(en).toContain('<h2 class="ui-pass-identity" id="pass-h">');
    // MUTATION: the visible two-tongue label left in the name ("စားပွဲ · Table 47") — red.
    expect(headingName(en)).toBe("Table 47");
    expect(headingName(render({ lang: "my" }))).toBe("စားပွဲ 47");
  });

  it("a spoken figure replaces the visible one for assistive tech (a code, spelt)", () => {
    const html = render({
      figureKind: "code",
      figure: "#7C2E9A",
      figureSpoken: "7 C 2 E 9 A",
      label: { en: "Code", my: "ကုဒ်" },
    });
    expect(headingName(html)).toBe("Code 7 C 2 E 9 A");
    expect(html).toContain(
      'class="ui-pass-figure ui-pass-figure-code" aria-hidden="true">#7C2E9A<',
    );
  });

  it("the status slot is the host's, read as content, never in the name", () => {
    const head = createElement(KitchenTrack, {
      stage: "cooking",
      size: "glyph",
      word: { en: "Cooking", my: "ချက်နေဆဲ" },
    });
    const html = render({ head });
    expect(html).toContain('class="ui-pass-status"');
    expect(html).toContain("Cooking");
    expect(headingName(html)).toBe("Table 47");
  });

  it("notches, seam, tear and the stamp are aria-hidden", () => {
    const html = render({ terminal: "paid", tear: true, stub: "stub" }, "body");
    expect(html).toContain('<div class="ui-pass-seam" aria-hidden="true">');
    expect(html).toContain('<div class="ui-pass-tear" aria-hidden="true">');
    expect(html).toContain('<span class="ui-pass-notch ui-pass-notch-top" aria-hidden="true">');
    expect(html).toMatch(/<svg class="ui-pass-stamp"[^>]*aria-hidden="true"/);
    // Every notch is inside an aria-hidden ancestor or is aria-hidden itself.
    for (const m of html.matchAll(/<span class="ui-pass-notch[^"]*"([^>]*)>/g)) {
      const before = html.slice(0, m.index);
      const inSeam = before.lastIndexOf('class="ui-pass-seam" aria-hidden="true"') > before.lastIndexOf("</div>"); // prettier-ignore
      expect(inSeam || m[1]!.includes('aria-hidden="true"')).toBe(true);
    }
  });

  it("the tear and the body render only when asked for", () => {
    const bare = render();
    expect(bare).not.toContain("ui-pass-tear");
    expect(bare).not.toContain("ui-pass-tail");
    expect(bare).not.toContain("ui-pass-seam");
    const full = render({ tear: true }, "body");
    expect(full).toContain('data-tear=""');
    expect(full).toContain("ui-pass-tear");
    expect(full).toContain('<div class="ui-pass-body">body</div>');
  });

  it("portrait bites the paper's sides at the seam and the top at the stub; landscape bites the ends of its vertical seam", () => {
    const portrait = render({ stub: "stub" }, "body");
    expect(portrait).toContain("ui-pass-notch-start");
    expect(portrait).toContain("ui-pass-notch-end");
    expect(count(portrait, "ui-pass-notch-top")).toBe(1);
    const landscape = render({ orientation: "landscape", stub: "stub" }, "body");
    expect(landscape).not.toContain("ui-pass-notch-start");
    expect(landscape).not.toContain("ui-pass-notch-end");
    expect(count(landscape, "ui-pass-notch-top")).toBe(1);
    expect(count(landscape, "ui-pass-notch-bottom")).toBe(1);
  });

  it("an inert picture is hidden, inert, id-less and heading-less", () => {
    const html = render({ inert: true, terminal: "paid" }, "body");
    expect(html).toMatch(/^<section class="ui-pass"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/^<section class="ui-pass"[^>]*inert=""/);
    expect(html).toContain('data-inert=""');
    expect(html).not.toContain("aria-labelledby");
    expect(html).not.toContain(" id=");
    expect(html).not.toContain("<h2");
    expect(html).toContain('<p class="ui-pass-identity">');
    // A picture may still be rendered inside a live page: nothing inside it may be focusable.
    expect(html).not.toContain("tabindex");
  });

  it("takes a host element; a div is a named group", () => {
    expect(render({ as: "li" })).toMatch(/^<li class="ui-pass"/);
    expect(render({ as: "article" })).toMatch(/^<article class="ui-pass"/);
    expect(render({ as: "div" })).toMatch(/^<div class="ui-pass"[^>]*role="group"/);
    expect(render({ as: "div", inert: true })).not.toContain('role="group"');
    expect(render({ headingLevel: 3 })).toContain('<h3 class="ui-pass-identity"');
  });

  it("carries no inline colour: the material is pass.css's constant paper", () => {
    expect(render({ terminal: "paid", tear: true, stub: "s" }, "body")).not.toContain("style=");
  });
});

describe("CounterPass — the motion hooks are the host's, once, and off by default", () => {
  it("renders no motion hook unless the host sets one", () => {
    const html = render({}, "body");
    expect(html).not.toContain("data-turning");
    expect(html).not.toContain("data-stamping");
  });

  it("exposes TURN on the head or the figure, and STAMP then PRINT, as data hooks", () => {
    expect(render({ turning: "head" })).toContain('data-turning="head"');
    expect(render({ turning: "figure" })).toContain('data-turning="figure"');
    expect(render({ stamping: true, terminal: "paid" }, "body")).toContain('data-stamping=""');
  });
});
