import { describe, expect, it } from "vitest";
import { al, sx, type StaffControl } from "./staff-labels";
import { ts } from "./i18n/staff";
import type { StaffLang } from "./staff-lang";

/**
 * P2 · G11 — WCAG 2.5.3, resolved as a VALUE.
 *
 * This is the guard the P1 source asked for by name: the kitchen line's `aria-label` was left
 * English on purpose, with a comment saying "P2 owns the moment the chrome speaks Burmese; the
 * visible English echo keeps WCAG 2.5.3 meanwhile."
 *
 * Asserting it here rather than through a render is deliberate and stronger for this rule: the
 * property is about two STRINGS agreeing, so falsifying it needs a value, not a 900-line board plus
 * five mocks. The containment check below runs over EVERY control in BOTH languages from one table,
 * so a new control cannot be added without the rule applying to it.
 *
 * Fixtures use catalog Burmese (a real seed dish), never dictionary copy, so a native-check
 * correction to a drafted string cannot redden this suite.
 */
const MOHINGA = "Mohinga";
const MOHINGA_MY = "မုန့်ဟင်းခါး";

const CONTROLS: ReadonlyArray<readonly [string, StaffControl]> = [
  [
    "a line not yet started",
    { kind: "line", done: false, qty: 2, name: MOHINGA, nameMy: MOHINGA_MY, modifiers: [] },
  ],
  [
    "a line in progress, with modifiers",
    {
      kind: "line",
      done: true,
      qty: 1,
      name: MOHINGA,
      nameMy: MOHINGA_MY,
      modifiers: ["No egg", "Extra chili"],
    },
  ],
  [
    "a line whose dish has NO Burmese in the catalog",
    { kind: "line", done: false, qty: 3, name: "Tea Leaf Salad", nameMy: null, modifiers: [] },
  ],
  ["the bump", { kind: "bump", id: "#A12", items: 3 }],
  ["the 86", { kind: "eighty6", name: MOHINGA, nameMy: MOHINGA_MY }],
  ["the recall", { kind: "recall", label: "#A12" }],
  ["the undo", { kind: "undo", label: "#A12" }],
];

const LANGS: readonly StaffLang[] = ["en", "my"];

describe("every labelled control satisfies 2.5.3 in BOTH languages", () => {
  for (const lang of LANGS) {
    for (const [what, control] of CONTROLS) {
      it(`${lang}: ${what} — the name contains the visible label`, () => {
        const { visible, aria } = al(lang, control);
        expect(visible.trim().length).toBeGreaterThan(0);
        expect(aria).toContain(visible);
      });
    }
  }
});

describe("the visible label is what the screen actually shows", () => {
  it("under Burmese, a line's label is the CATALOG Burmese — the same string the ticket renders", () => {
    const { visible, aria } = al("my", {
      kind: "line",
      done: false,
      qty: 2,
      name: MOHINGA,
      nameMy: MOHINGA_MY,
      modifiers: [],
    });
    expect(visible).toBe(MOHINGA_MY);
    // The mutant: building the name from the English snapshot while the screen shows Burmese —
    // which is exactly what P1 shipped as a deliberate placeholder, and what this slice fixes.
    expect(aria).toContain(MOHINGA_MY);
    expect(aria).not.toContain(MOHINGA);
  });

  it("under Burmese, a dish with no catalog Burmese falls back to English in BOTH halves", () => {
    // The ticket renders English for this dish, so the name must too — otherwise the name contains
    // a Burmese string the screen never showed.
    const { visible, aria } = al("my", {
      kind: "line",
      done: false,
      qty: 1,
      name: "Tea Leaf Salad",
      nameMy: null,
      modifiers: [],
    });
    expect(visible).toBe("Tea Leaf Salad");
    expect(aria).toContain("Tea Leaf Salad");
  });

  it("under English, nothing changed from before P2", () => {
    const { visible, aria } = al("en", {
      kind: "line",
      done: true,
      qty: 2,
      name: MOHINGA,
      nameMy: MOHINGA_MY,
      modifiers: ["No egg"],
    });
    expect(visible).toBe(MOHINGA);
    expect(aria).toBe("Done — 2 Mohinga, No egg");
  });

  it("the bump and the 86 BEGIN with their visible label — their whole content is the label", () => {
    for (const lang of LANGS) {
      const bump = al(lang, { kind: "bump", id: "#A12", items: 3 });
      expect(bump.aria.startsWith(bump.visible)).toBe(true);
      const six = al(lang, { kind: "eighty6", name: MOHINGA, nameMy: MOHINGA_MY });
      expect(six.aria.startsWith(six.visible)).toBe(true);
    }
  });

  it("the bump names WHICH ticket and how much it clears", () => {
    // A tap that clears the card should say what it is clearing before it is tapped.
    const en = al("en", { kind: "bump", id: "#A12", items: 3 });
    expect(en.aria).toContain("#A12");
    expect(en.aria).toContain("3");
    const my = al("my", { kind: "bump", id: "#A12", items: 3 });
    expect(my.aria).toContain("#A12"); // the short code stays Latin — it is read off a printed slip
    expect(my.aria).toContain("၃"); // …but the COUNT is a prose count, so it is Burmese
  });
});

describe("the recall chip's pair is INVERTED, because its visible label is the code", () => {
  // The footer chip shows `⟲ #A12` — the code, not the verb — so `visible` must be the code and the
  // verb must lead the announcement. Written the other way round first, which produced a name
  // containing a Burmese verb the chip never displayed. The generic containment loop above cannot
  // tell the two shapes apart (both contain SOMETHING), so the direction is asserted here.
  for (const lang of LANGS) {
    it(`${lang}: visible is the ticket code and the name leads with the verb`, () => {
      const { visible, aria } = al(lang, { kind: "recall", label: "#A12" });
      expect(visible).toBe("#A12");
      expect(aria).toContain("#A12");
      expect(aria.startsWith("#A12")).toBe(false); // the ACTION is announced first
      expect(aria).toBe(`${ts(lang, "kds.recall")} — #A12`);
    });
  }

  it("the undo button is the OTHER shape — its whole visible content IS the verb", () => {
    const { visible, aria } = al("my", { kind: "undo", label: "#A12" });
    expect(visible).toMatch(/[က-႟]/);
    expect(aria.startsWith(visible)).toBe(true);
  });
});

describe("sx — aria-only strings, where there is no visible label to contain", () => {
  it("speaks the device's language", () => {
    expect(sx("en", "kds.a11y.tickets")).toBe("Open kitchen tickets");
    expect(sx("my", "kds.a11y.tickets")).toMatch(/[က-႟]/);
  });
});
