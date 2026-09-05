import { describe, expect, it } from "vitest";
import { FLOOR_STATUS_KEY, al, sx, type StaffControl } from "./staff-labels";
import { STAFF, ts } from "./i18n/staff";
import type { FloorStatus } from "./floor-types";
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
  ["a verb control", { kind: "verb", verb: "floor.verb.deactivate", subject: "Daw Hla" }],
  ["a subject control", { kind: "subject", verb: "reg.verb.resume", subject: "Daw Hla, 2 items" }],
  [
    "a quiet table",
    {
      kind: "table",
      label: "7",
      unregistered: false,
      status: "seated",
      tabOpen: false,
      tabOverCeiling: false,
      partySize: 2,
      itemCount: 0,
      runningSubtotal: "$0.00",
      paidTotal: null,
    },
  ],
  [
    "a table with every optional fragment lit",
    {
      kind: "table",
      label: "12",
      unregistered: true,
      status: "settling",
      tabOpen: true,
      tabOverCeiling: true,
      partySize: 6,
      itemCount: 9,
      runningSubtotal: "$142.10",
      paidTotal: "$88.00",
    },
  ],
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

/**
 * P2 · OPEN-ITEMS P2g — the defect this arm exists to close, asserted as a VALUE.
 *
 * `TableCard` built its accessible name in a local `const` and interpolated `table.status` RAW, so a
 * splitting table announced "settling" while the chip beside it read "Splitting". Both halves now
 * read `FLOOR_STATUS_KEY`, and the fixture below is chosen to SEPARATE the two: `settling` is the
 * one status whose DB value and displayed word differ, so a name built from the raw key and a name
 * built from the dictionary produce different strings on it and identical strings on every other
 * status. A fixture of `paid` or `seated` would pass either way — which is exactly the degenerate
 * shape a surviving mutant reports.
 */
describe("a table's name says the word the chip shows, never the database's", () => {
  const splitting = {
    kind: "table",
    label: "7",
    unregistered: false,
    status: "settling",
    tabOpen: false,
    tabOverCeiling: false,
    partySize: 2,
    itemCount: 0,
    runningSubtotal: "$0.00",
    paidTotal: null,
  } as const satisfies StaffControl;

  it("en: the visible word is 'Splitting' and the raw key never appears", () => {
    const { aria } = al("en", splitting);
    expect(aria).toContain("Splitting");
    expect(aria).not.toContain("settling");
  });

  it("my: the name carries the Burmese status word, not the English one and not the key", () => {
    const { aria } = al("my", splitting);
    expect(aria).toContain(STAFF["floor.status.settling"].my);
    expect(aria).not.toContain("settling");
    expect(aria).not.toContain("Splitting");
  });

  it("every FloorStatus resolves to a key that exists, and no two share one", () => {
    // The map is `satisfies Record<FloorStatus, StaffKey>`, so totality is a compile-time fact —
    // but a DUPLICATE value compiles fine and would make two states announce identically, which is
    // the same class of defect one step over.
    const keys = Object.values(FLOOR_STATUS_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(STAFF[k]).toBeDefined();
  });

  it("a status the room and the database agree on is NOT what pins this rule", () => {
    // Named so the next reader does not "simplify" the fixture above to `paid`: on `paid` the raw
    // key and the dictionary word differ only in case, and `toContain` would still separate them —
    // but on `seated`/`ordering`/`paying` a lowercase raw key differs from the label by case ALONE,
    // and any assertion that folded case would pass over the bug. `settling` is the honest fixture.
    const statuses: FloorStatus[] = ["seated", "ordering", "paying", "paid"];
    for (const status of statuses) {
      const { aria } = al("en", { ...splitting, status });
      expect(aria).toContain(STAFF[FLOOR_STATUS_KEY[status]].en);
    }
  });
});

describe("a table's name renders each fragment in the right script", () => {
  const busy = {
    kind: "table",
    label: "12",
    unregistered: true,
    status: "paying",
    tabOpen: true,
    tabOverCeiling: true,
    partySize: 6,
    itemCount: 9,
    runningSubtotal: "$142.10",
    paidTotal: "$88.00",
  } as const satisfies StaffControl;

  it("my: the table number and both money figures stay LATIN", () => {
    const { visible, aria } = al("my", busy);
    // The number is read off the physical tent card; the amounts off a receipt. Localizing either
    // stops the screen matching the thing in the room.
    expect(visible).toContain("12");
    expect(aria).toContain("$142.10");
    expect(aria).toContain("$88.00");
  });

  it("my: the party COUNT is Burmese — it is prose, not an identifier", () => {
    const { aria } = al("my", busy);
    expect(aria).toContain("၆"); // party of 6
    expect(aria).toContain("၉"); // 9 items
  });

  it("an optional fragment appears ONLY when its condition holds", () => {
    const quiet = {
      ...busy,
      unregistered: false,
      tabOpen: false,
      tabOverCeiling: false,
      itemCount: 0,
      paidTotal: null,
    } as const satisfies StaffControl;
    const loud = al("en", busy).aria;
    const soft = al("en", quiet).aria;
    for (const fragment of [
      STAFF["floor.unregisteredSticker"].en,
      STAFF["floor.tabOpen"].en,
      STAFF["floor.tabOverLimit"].en,
      "$88.00",
      "so far",
    ]) {
      expect(loud).toContain(fragment);
      expect(soft).not.toContain(fragment);
    }
    // …and the fragments that are NOT conditional survive both.
    expect(soft).toContain("Table 12");
    expect(soft).toContain("party of 6");
  });

  it("the singular is used at one item and the plural above it", () => {
    expect(al("en", { ...busy, itemCount: 1 }).aria).toContain("1 item,");
    expect(al("en", { ...busy, itemCount: 2 }).aria).toContain("2 items");
  });
});

describe("the verb control — the general shape", () => {
  it("the visible word IS the dictionary value of the verb key, in both tongues", () => {
    for (const lang of LANGS) {
      const { visible, aria } = al(lang, {
        kind: "verb",
        verb: "floor.verb.deactivate",
        subject: "Daw Hla",
      });
      expect(visible).toBe(ts(lang, "floor.verb.deactivate"));
      // The subject is rendered VERBATIM — a person's name is never translated, and never a count.
      expect(aria).toBe(`${visible} — Daw Hla`);
    }
  });

  it("every key the union will accept as a verb is in a `.verb.` namespace", () => {
    // The type already refuses anything else; this asserts the namespace is POPULATED, so the
    // constraint is a live rule rather than an empty one nobody could have violated yet.
    const verbs = Object.keys(STAFF).filter((k) => k.split(".").includes("verb"));
    expect(verbs.length).toBeGreaterThan(0);
  });
});

describe("verb and subject are INVERSES, and which one a control needs is decided by the screen", () => {
  // The two arms compose the same two pieces and differ only in which is `visible` — so a call site
  // that picks the wrong one still produces a plausible-looking name. That is not hypothetical: the
  // register's queue row shipped as `verb`, whose `visible` is the word "Resume", on a row that
  // shows a guest's name and a line count and never shows that word. The pair went unexercised and
  // the guard could not see it (`check-staff-lang.mjs` rule 3c searched only the attribute's own
  // initializer, and the call was hoisted). Asserting the inversion here is what makes the two arms
  // distinguishable by a value rather than by a reading.
  const verb = "reg.verb.resume" as const;
  const subject = "Daw Hla, 2 items";

  for (const lang of LANGS) {
    it(`${lang}: verb SHOWS the action; subject SHOWS the thing`, () => {
      const v = al(lang, { kind: "verb", verb, subject });
      const s = al(lang, { kind: "subject", verb, subject });
      expect(v.visible).toBe(ts(lang, verb));
      expect(s.visible).toBe(subject);
      // …and they are genuinely different, so a swap cannot pass unnoticed.
      expect(v.visible).not.toBe(s.visible);
    });

    it(`${lang}: BOTH lead the announcement with the action`, () => {
      // The inversion is about the visible half only. A person must hear what the tap does first in
      // either shape — that is the whole reason `recall` was written the way it was.
      for (const control of [
        { kind: "verb", verb, subject } as const,
        { kind: "subject", verb, subject } as const,
      ]) {
        const { aria } = al(lang, control);
        expect(aria.startsWith(ts(lang, verb))).toBe(true);
        expect(aria).toContain(subject);
      }
    });
  }

  it("recall is the `subject` shape hard-coded for one control", () => {
    // Stated as an assertion rather than a comment: if `recall` ever stops matching this shape, the
    // claim in `subject`'s docblock has quietly become false.
    const r = al("my", { kind: "recall", label: "#A12" });
    const s = al("my", { kind: "subject", verb: "reg.verb.resume", subject: "#A12" });
    expect(r.visible).toBe("#A12");
    expect(s.visible).toBe("#A12");
    expect(r.aria.endsWith("#A12")).toBe(true);
    expect(s.aria.endsWith("#A12")).toBe(true);
  });
});
