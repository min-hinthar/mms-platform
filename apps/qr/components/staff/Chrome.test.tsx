/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chrome, OutageText } from "./Chrome";
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
