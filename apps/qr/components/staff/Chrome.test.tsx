/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chrome, OutageText } from "./Chrome";
import { StaffLangProvider } from "./StaffLangProvider";
import { al, chromeVisible, type ChromeEcho } from "@/lib/staff-labels";
import { STAFF, STAFF_K15_HIGH, type StaffKey } from "@/lib/i18n/staff";
import {
  STAFF_WRITE_OUTAGE,
  STAFF_WRITE_OUTAGE_MY,
  AUTHORITY_UNCONFIRMED,
  AUTHORITY_UNCONFIRMED_MY,
} from "@/lib/staff-outage";

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
    expect(container.textContent).toBe(STAFF["kds.bump"].en);
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
    expect(my.textContent).toBe(STAFF["kds.bump"].my);

    const en = container.querySelector(".chrome-en")!;
    expect(en.textContent).toBe(STAFF["kds.bump"].en);
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
    expect(container.textContent).toBe(`${STAFF["kds.recall"].my} · ${STAFF["kds.recall"].en}`);
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

  it("translates the AUTHORITY-outage refusal too, and not into the write-outage words", () => {
    // M209 shipped a second outage sentence, and Codex round 1 on #279 caught it rendering as
    // English on a Burmese console — the swap is by identity, so a new sentence needs a new twin.
    // Its meaning differs from the write outage: nothing was attempted, so "keep it on paper" would
    // be false. The two must not collapse into one string just to get a free translation.
    const { container } = render(<OutageText lang="my" error={AUTHORITY_UNCONFIRMED} />);
    const marked = container.querySelector('[lang="my"]')!;
    expect(marked.textContent).toBe(AUTHORITY_UNCONFIRMED_MY);
    expect(marked.className).toContain("chrome-my");
    expect(marked.textContent).not.toBe(STAFF_WRITE_OUTAGE_MY);
  });

  it("ties the English constant to the dictionary entry its twin is paired with", () => {
    // ⚠️ THE SEPARATING ASSERTION, added after the first mutant SURVIVED. `<OutageText>` pairs
    // `AUTHORITY_UNCONFIRMED` with `out.authority.unconfirmed`.my by identity, so the English must BE
    // that key's `.en` rather than a hand-written twin of it. A literal that drifts leaves the Burmese
    // describing a sentence nobody shows, and the swap silently stops matching — English on a Burmese
    // console, which is the defect. Reading the dictionary here rather than restating the sentence is
    // the point: a copy of the string in this file would drift the same way.
    expect(AUTHORITY_UNCONFIRMED).toBe(STAFF["out.authority.unconfirmed"].en);
    expect(AUTHORITY_UNCONFIRMED_MY).toBe(STAFF["out.authority.unconfirmed"].my);
  });

  it("keeps the two outage sentences DISTINCT in both tongues", () => {
    // If either pair collapses, one of the two situations is being described by the other's words.
    expect(AUTHORITY_UNCONFIRMED).not.toBe(STAFF_WRITE_OUTAGE);
    expect(AUTHORITY_UNCONFIRMED_MY).not.toBe(STAFF_WRITE_OUTAGE_MY);
    // And the authority refusal must never tell a manager to fall back to paper.
    expect(AUTHORITY_UNCONFIRMED).not.toMatch(/paper/i);
  });

  it("shows the authority refusal verbatim in English", () => {
    const { container } = render(<OutageText lang="en" error={AUTHORITY_UNCONFIRMED} />);
    expect(container.querySelectorAll("*")).toHaveLength(0);
    expect(container.textContent).toBe(AUTHORITY_UNCONFIRMED);
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

// ── Phase 2e · lang ──
/**
 * P2e — Burmese only drops the ECHO, never the PAIR, and never on the K15-HIGH band.
 *
 * Every Burmese size rule in globals.css is written `.x > .chrome-pair > [lang="my"]`, so the one-
 * child pair is what keeps a Burmese-only bar title at its 30px — the render is measured here as a
 * TREE (the parent, its one element child), never as a substring (`startsWith` would pass a render
 * that still carried the echo after the Burmese). The K15-HIGH keys keep their English line because
 * the kitchen tablet is shared with an English reader (Dad's line) and a wrong word there would stop
 * service (the band's definition — wider than food and money).
 */
const burmeseOnly = (ui: React.ReactElement) =>
  render(
    <StaffLangProvider lang="my" echoes={false}>
      {ui}
    </StaffLangProvider>,
  ).container;

describe("P2e — Burmese only keeps the pair and drops its echo", () => {
  // Deliberately NOT in the K15-HIGH band — the cross-check below keeps the fixture honest.
  const PLAIN = [
    ["kds.title", "stack"],
    ["help.back", "inline"],
  ] as const;
  it("the fixture keys are outside the K15-HIGH band (or the case below proves nothing)", () => {
    for (const [k] of PLAIN) expect(STAFF_K15_HIGH.has(k), k).toBe(false);
    expect(STAFF_K15_HIGH.has("kds.err.bump")).toBe(false);
  });

  it.each(PLAIN)("%s · echo=%s: the Burmese alone, EXACTLY, inside a one-child pair", (k, echo) => {
    const c = burmeseOnly(<Chrome lang="my" k={k} echo={echo} />);
    expect(c.querySelector(".stx-root")!.textContent).toBe(chromeVisible("my", k, false));
    const my = c.querySelector('[lang="my"]')!;
    const pair = my.parentElement!;
    expect(pair.classList.contains("chrome-pair")).toBe(true);
    expect(pair.classList.contains("chrome-pair-inline")).toBe(echo === "inline");
    expect(pair.children).toHaveLength(1);
    expect(c.querySelector(".chrome-en")).toBeNull();
  });

  it("a slotted key keeps its Latin value marked inside the one Burmese run", () => {
    const c = burmeseOnly(
      <Chrome lang="my" k="kds.err.bump" vars={{ x: "Mohinga" }} echo="inline" />,
    );
    expect(c.querySelector(".stx-root")!.textContent).toBe(
      chromeVisible("my", "kds.err.bump", false, { x: "Mohinga" }),
    );
    expect(c.querySelector('[lang="my"] [lang="en"]')!.textContent).toBe("Mohinga");
    expect(c.querySelector(".chrome-pair")!.children).toHaveLength(1);
  });

  it("under Both (a provider with the default) and with NO provider (the wall TV), the echo stays", () => {
    for (const [k, echo] of PLAIN) {
      cleanup();
      const both = render(
        <StaffLangProvider lang="my">
          <Chrome lang="my" k={k} echo={echo} />
        </StaffLangProvider>,
      ).container;
      expect(renderedParts(both)).toEqual([STAFF[k].my, STAFF[k].en]);
      cleanup();
      const bare = render(<Chrome lang="my" k={k} echo={echo} />).container;
      expect(renderedParts(bare)).toEqual([STAFF[k].my, STAFF[k].en]);
    }
  });

  it("English is untouched by the flag — still one bare text node", () => {
    const c = render(
      <StaffLangProvider lang="en" echoes={false}>
        <Chrome lang="en" k="kds.title" echo="stack" />
      </StaffLangProvider>,
    ).container;
    expect(c.querySelector(".stx-root")!.querySelectorAll("*")).toHaveLength(0);
    expect(c.textContent).toBe(STAFF["kds.title"].en);
  });
});

describe("P2e — the K15-HIGH band keeps its English line on a Burmese-only device", () => {
  const HIGH: readonly StaffKey[] = ["kds.bump", "kds.86"];
  it("the fixture keys ARE in the band — the case cannot rot into a plain-key test", () => {
    for (const k of HIGH) expect(STAFF_K15_HIGH.has(k), k).toBe(true);
  });

  it.each(HIGH)("%s · echo=stack keeps .chrome-en with its English", (k) => {
    const c = burmeseOnly(<Chrome lang="my" k={k} echo="stack" />);
    expect(c.querySelector(".chrome-en")?.textContent).toBe(STAFF[k].en);
    expect(renderedParts(c.querySelector(".stx-root") as HTMLElement)).toEqual([
      STAFF[k].my,
      STAFF[k].en,
    ]);
  });

  it("the Burmese-only row says what THIS band keeps, in the band's own words — never a narrower claim", () => {
    // The band is "the strings a wrong word takes SERVICE down over" (the word-check sheet heads it
    // "A wrong word here stops service"), and it holds keys that gate neither food nor money — so a
    // row promising "English stays only where a wrong word costs food or money" was untrue on the
    // first sign-in refusal. The row reuses the band's own phrase in both tongues and claims no
    // exclusivity (the language surfaces keep their English too, `keepEcho`).
    const band = STAFF["pilot.gloss.band.high.why"];
    const row = STAFF["shell.lang.mode.myOnly"];
    const MY_PHRASE = "စာလုံးမှားရင် အလုပ် ရပ်သွား";
    expect(band.my).toContain(MY_PHRASE);
    expect(row.my).toContain(MY_PHRASE);
    expect(band.en).toMatch(/wrong word here stops service/);
    expect(row.en).toMatch(/wrong word would stop service/);
    for (const k of ["entry.login.denied", "pin.outage", "shell.net.offline"] as const)
      expect(STAFF_K15_HIGH.has(k), k).toBe(true);
    expect(row.en).not.toMatch(/stays only|food or money/);
  });

  it.each(HIGH)("%s · echo={false} is still the bare Burmese span — the flag adds nothing", (k) => {
    const c = burmeseOnly(<Chrome lang="my" k={k} echo={false} />);
    expect(c.querySelector(".chrome-pair")).toBeNull();
    expect(c.querySelector(".chrome-en")).toBeNull();
    expect(c.querySelector('[lang="my"]')!.textContent).toBe(STAFF[k].my);
  });
});

describe("P2e — keepEcho is the language surfaces' way through", () => {
  it("a keepEcho Chrome speaks both tongues on a Burmese-only device", () => {
    const c = burmeseOnly(<Chrome lang="my" k="shell.lang.failed" echo="inline" keepEcho />);
    expect(STAFF_K15_HIGH.has("shell.lang.failed")).toBe(false); // it is keepEcho doing this
    expect(c.querySelector(".stx-root")!.textContent).toBe(
      chromeVisible("my", "shell.lang.failed", "inline"),
    );
  });
});
