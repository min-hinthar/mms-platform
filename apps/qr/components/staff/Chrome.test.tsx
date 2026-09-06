/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chrome, OutageText } from "./Chrome";
import { al, chromeVisible, type ChromeEcho } from "@/lib/staff-labels";
import { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } from "@/lib/staff-outage";

/**
 * P2 · G10 — the pair renderer's three rules, asserted on the rendered tree.
 *
 * The most important assertion in this file is the FIRST one. "An English console is byte-identical
 * to before" is a claim about a JSX BRANCH, not about CSS gating, and P1 shipped that exact claim
 * described the wrong way. If the `en` arm ever returns the pair markup, every English staff screen
 * silently grows an empty Padauk span, and only an element count catches it.
 */
afterEach(cleanup);

describe("the English branch is a BRANCH", () => {
  it("mounts one text node and ZERO elements", () => {
    const { container } = render(<Chrome lang="en" k="kds.bump" echo="stack" />);
    expect(container.querySelectorAll("*")).toHaveLength(0);
    expect(container.textContent).toBe("BUMP");
  });

  it("mounts no elements even with slots and an echo", () => {
    const { container } = render(
      <Chrome lang="en" k="kds.open.one" vars={{ n: 1 }} echo="inline" />,
    );
    expect(container.querySelectorAll("*")).toHaveLength(0);
    expect(container.textContent).toBe("1 open ticket");
  });

  it("carries no lang attribute at all", () => {
    const { container } = render(<Chrome lang="en" k="kds.title" echo="stack" />);
    expect(container.querySelector("[lang]")).toBeNull();
  });
});

describe("under Burmese, the English echo is a SIBLING", () => {
  it("puts Burmese first and English after it, outside the Burmese span", () => {
    const { container } = render(<Chrome lang="my" k="kds.bump" echo="stack" />);
    const my = container.querySelector('[lang="my"]')!;
    expect(my.textContent).toBe("ပြီးပြီ");

    const en = container.querySelector(".chrome-en")!;
    expect(en.textContent).toBe("BUMP");
    // Nesting it would typeset English in Padauk and announce it as Burmese — P1's hole, one tier up.
    expect(my.contains(en)).toBe(false);
    expect(en.hasAttribute("lang")).toBe(false);
    // Burmese leads.
    expect(my.compareDocumentPosition(en) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("echo={false} mounts the Burmese alone — a 44px chip cannot stack two scripts", () => {
    const { container } = render(<Chrome lang="my" k="kds.channel.togo" echo={false} />);
    expect(container.querySelector('[lang="my"]')!.textContent).toBe("ပါဆယ်");
    expect(container.querySelector(".chrome-en")).toBeNull();
  });

  it('echo="inline" separates the two with a middot text node', () => {
    const { container } = render(<Chrome lang="my" k="kds.recall" echo="inline" />);
    expect(container.textContent).toBe("ပြန်ခေါ် · Recall");
  });
});

describe("a Latin value inside a Burmese run is marked", () => {
  it('wraps an interpolated dish name in lang="en"', () => {
    const { container } = render(
      <Chrome lang="my" k="kds.err.bump" vars={{ x: "Mohinga" }} echo={false} />,
    );
    const marked = container.querySelector('[lang="my"] [lang="en"]')!;
    expect(marked.textContent).toBe("Mohinga");
  });

  it("wraps a table number, so it cannot break mid-value", () => {
    const { container } = render(<Chrome lang="my" k="kds.table" vars={{ id: 12 }} echo={false} />);
    expect(container.querySelector('[lang="my"] [lang="en"]')!.textContent).toBe("12");
  });

  it("does NOT wrap a Burmese-numeral count — it is already Burmese script", () => {
    const { container } = render(
      <Chrome lang="my" k="kds.open.one" vars={{ n: 3 }} echo={false} />,
    );
    expect(container.querySelector('[lang="my"]')!.textContent).toContain("၃");
    expect(container.querySelector('[lang="en"]')).toBeNull();
  });

  it("does not wrap a Burmese interpolated value either", () => {
    // A dish whose catalog name is Burmese arrives as Burmese and belongs in the same run.
    const { container } = render(
      <Chrome lang="my" k="kds.err.bump" vars={{ x: "မုန့်ဟင်းခါး" }} echo={false} />,
    );
    expect(container.querySelector('[lang="en"]')).toBeNull();
  });
});

describe("OutageText — the one server sentence with a Burmese twin", () => {
  it("swaps in the twin, marked, when the device is Burmese", () => {
    const { container } = render(<OutageText lang="my" error={STAFF_WRITE_OUTAGE} />);
    const marked = container.querySelector('[lang="my"]')!;
    expect(marked.textContent).toBe(STAFF_WRITE_OUTAGE_MY);
    expect(marked.className).toContain("chrome-my");
    expect(marked.textContent).not.toBe(STAFF_WRITE_OUTAGE);
  });

  it("is a BRANCH under English — the same bare text node, zero elements", () => {
    const { container } = render(<OutageText lang="en" error={STAFF_WRITE_OUTAGE} />);
    expect(container.querySelectorAll("*")).toHaveLength(0);
    expect(container.textContent).toBe(STAFF_WRITE_OUTAGE);
  });

  it("passes ANY other sentence through verbatim, in both tongues", () => {
    // A sentence we have no twin for is shown in English rather than guessed at in Burmese: the
    // swap is by identity against the one constant, never a substring or a prefix.
    for (const lang of ["en", "my"] as const) {
      cleanup();
      const other = "Too many attempts. Wait 30 seconds.";
      const { container } = render(<OutageText lang={lang} error={other} />);
      expect(container.textContent).toBe(other);
      expect(container.querySelector('[lang="my"]')).toBeNull();
    }
  });

  it("does not swap on a sentence that merely CONTAINS the constant", () => {
    const { container } = render(
      <OutageText lang="my" error={`${STAFF_WRITE_OUTAGE} (order #A12)`} />,
    );
    expect(container.textContent).toContain("#A12");
    expect(container.textContent).not.toContain(STAFF_WRITE_OUTAGE_MY);
  });
});

/**
 * ⚠️ THE PAIR THAT ACTUALLY FAILED WCAG 2.5.3, AND THE ONLY TEST SHAPE THAT COULD SEE IT.
 *
 * A pre-merge blind pass found that `al()` built a control's `visible` from ONE tongue while
 * `<Chrome echo>` put TWO on screen — so the Approve button SHOWED `ခွင့်ပြု` and `Approve` and
 * ANNOUNCED only `ခွင့်ပြု — Mohinga`. A speech-input user saying the word they can see hit
 * nothing, on 15 controls across 6 files, in the language the pilot DEFAULTS to.
 *
 * Nothing caught it because nothing rendered a control and compared its text to its name:
 * `staff-labels.test.ts`'s containment loop is tautological (al() interpolates `visible` into `aria`
 * by construction), and guard rule 3c compares KEYS, so it is structurally blind to what `<Chrome>`
 * emits. These tests close that gap from both ends — the render is measured, never assumed.
 */
/**
 * The parts a viewer actually reads: the Burmese span and the English echo when Chrome renders the
 * pair, or the single bare text node when it does not. Deliberately NOT `textContent` — jsdom
 * concatenates two `display: block` siblings with no whitespace ("ခွင့်ပြုApprove"), so a raw string
 * comparison would encode a jsdom quirk rather than what the screen shows.
 */
function renderedParts(container: HTMLElement): string[] {
  const spans = container.querySelectorAll('[lang="my"], .chrome-en');
  return spans.length ? [...spans].map((e) => e.textContent ?? "") : [container.textContent ?? ""];
}

describe("what Chrome puts ON SCREEN is what chromeVisible() says it does", () => {
  const CASES: ReadonlyArray<readonly [ChromeEcho, string]> = [
    [false, "no echo"],
    ["stack", "stacked echo"],
    ["inline", "inline echo"],
  ];
  for (const [echo, what] of CASES) {
    for (const lang of ["en", "my"] as const) {
      it(`${lang} · ${what}: the derivation al() reads accounts for every rendered part, and adds none`, () => {
        const { container } = render(
          <Chrome lang={lang} k="table.appr.verb.approve" echo={echo} />,
        );
        const parts = renderedParts(container);
        expect(parts.filter(Boolean)).toHaveLength(parts.length);

        // Two-way: every rendered part is IN the derivation, and once they are struck out nothing
        // but separators is left — so the derivation can neither miss a visible word nor invent one.
        let rest = chromeVisible(lang, "table.appr.verb.approve", echo);
        for (const part of parts) {
          expect(rest).toContain(part);
          rest = rest.replace(part, "");
        }
        expect(rest.trim()).toMatch(/^[·\s]*$/u);
      });
    }
  }
});

describe("a labelled control's NAME contains every word the control SHOWS", () => {
  const ECHOES: readonly ChromeEcho[] = [false, "stack", "inline"];
  for (const echo of ECHOES) {
    for (const lang of ["en", "my"] as const) {
      it(`${lang} · echo=${String(echo)}: WCAG 2.5.3 on the rendered text, not on the key`, () => {
        const { container } = render(
          <Chrome lang={lang} k="table.appr.verb.approve" echo={echo} />,
        );
        const { aria } = al(lang, {
          kind: "verb",
          echo,
          verb: "table.appr.verb.approve",
          subject: "Mohinga",
        });
        // The mutation this separates: drop `echo` from the al() call and, under `my` WITH an echo,
        // the English half of the visible label stops appearing in the name. Under `en` and under
        // `my`-without-echo the two are identical either way, so those arms cannot catch it — which
        // is exactly why every echo mode is exercised here.
        for (const part of renderedParts(container)) expect(aria).toContain(part);
      });
    }
  }

  it("a SLOTTED key pins too — the count is Burmese in the my half and Latin in the echo", () => {
    // The register row is the reason this case exists: its subject is built from two echoed Chromes
    // with a `{n}`/`{m}` count, and it announced only the Burmese halves. A no-slot fixture cannot
    // catch that — `fill` is where the two tongues diverge on numerals.
    const { container } = render(
      <Chrome lang="my" k="reg.row.many" vars={{ n: 2, m: "$12.00" }} echo="inline" />,
    );
    const parts = renderedParts(container);
    let rest = chromeVisible("my", "reg.row.many", "inline", { n: 2, m: "$12.00" });
    for (const part of parts) {
      expect(rest).toContain(part);
      rest = rest.replace(part, "");
    }
    expect(rest.trim()).toMatch(/^[·\s]*$/u);
    expect(parts.join(" ")).toContain("၂"); // Burmese numeral in the my half…
    expect(parts.join(" ")).toContain("2 items"); // …Latin in the echo
  });

  it("the English echo is the half that used to go missing", () => {
    const { aria } = al("my", {
      kind: "verb",
      echo: "stack",
      verb: "table.appr.verb.approve",
      subject: "Mohinga",
    });
    expect(aria).toContain("Approve"); // the VISIBLE English word — absent before this fix
    expect(aria).toContain("ခွင့်ပြု");
    expect(aria).toContain("Mohinga");
  });
});
