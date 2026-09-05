/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpoLineMy, ModsMy, RailRowText, TicketLineText } from "./TicketText";

/**
 * P1 — the RENDER rule, pinned where it lives.
 *
 * `lib/ticket-names.ts` guarantees a Burmese slot with no `name_my` is `null`. Nothing in that
 * suite says what a null slot LOOKS like — and the blind pass on this slice was right that
 * `{my ?? en}` at any of the three render sites ships English typeset in Padauk under `lang="my"`
 * with every data-layer guard green. So this suite renders the three sites and asks the DOM:
 *
 *   - a null slot is an English label wrapped in `lang="en"`, never bare text under `lang="my"`;
 *   - a Burmese slot is bare text under `lang="my"`, never wrapped as English;
 *   - an English-only line mounts exactly the elements it mounted before P1 — no echo, no Burmese
 *     modifier line, no `lang` attribute anywhere (the "byte-identical" claim is this branch, not
 *     the CSS gating).
 *
 * Fixtures are DB rows (`supabase/seed.sql`), never authored Burmese.
 */
const MOHINGA_MY = "မုန့်ဟင်းခါး";
const MILD_MY = "အစပ်လျှော့";

afterEach(cleanup);

/** Every text node directly under `el` (not inside a child element), trimmed, non-empty. */
function ownText(el: Element): string[] {
  return [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => (n.textContent ?? "").trim())
    .filter(Boolean);
}

describe('ModsMy — a null slot is English wrapped lang="en", a Burmese slot is bare Burmese', () => {
  it("THE HOLE RULE at the render site", () => {
    // MUTATION: `{my ?? en}` → "No egg" becomes a bare text node under lang="my" and the
    // `[lang="my"] [lang="en"]` query below finds nothing.
    const { container } = render(
      <p lang="my" data-testid="run">
        <ModsMy modifiers={["Mild", "No egg"]} modifiersMy={[MILD_MY, null]} />
      </p>,
    );
    const run = container.querySelector('[data-testid="run"]')!;
    const en = run.querySelectorAll('[lang="en"]');
    expect(en).toHaveLength(1);
    expect(en[0]!.textContent).toBe("No egg");
    // The Burmese slot is NOT wrapped as English, and the English one is NOT bare Burmese-context text.
    expect(ownText(run)).toEqual([MILD_MY, "·"]);
    expect(run.textContent).toBe(`${MILD_MY} · No egg`);
  });

  it('all-Burmese slots render no lang="en" span at all', () => {
    const { container } = render(
      <p lang="my">
        <ModsMy modifiers={["Mild"]} modifiersMy={[MILD_MY]} />
      </p>,
    );
    expect(container.querySelector('[lang="en"]')).toBeNull();
  });
});

describe("TicketLineText — the KDS name pair and modifier pair", () => {
  const line = (o: Partial<Parameters<typeof TicketLineText>[0]["line"]>) => ({
    name: "Mohinga",
    nameMy: null,
    modifiers: [] as string[],
    modifiersMy: [] as (string | null)[],
    ...o,
  });

  it("an English-only line mounts exactly the pre-P1 elements — no echo, no Burmese modifier line, no lang", () => {
    // MUTATION: take the Burmese branch unconditionally → `.kds-line-en` appears here.
    const { container } = render(
      <TicketLineText line={line({ modifiers: ["Mild", "No egg"], modifiersMy: [null, null] })} />,
    );
    expect(container.querySelectorAll(".kds-line-name")).toHaveLength(1);
    expect(container.querySelector(".kds-line-name")!.getAttribute("lang")).toBeNull();
    expect(container.querySelector(".kds-line-en")).toBeNull();
    expect(container.querySelectorAll(".kds-line-mods")).toHaveLength(1);
    expect(container.querySelector(".kds-line-mods")!.getAttribute("lang")).toBeNull();
    expect(container.querySelector("[lang]")).toBeNull();
    expect(container.querySelector(".kds-line-mods")!.textContent).toBe("Mild · No egg");
  });

  it('a Burmese name takes the primary slot under lang="my" and the English echoes beneath', () => {
    const { container } = render(<TicketLineText line={line({ nameMy: MOHINGA_MY })} />);
    const primary = container.querySelector(".kds-line-name")!;
    expect(primary.getAttribute("lang")).toBe("my");
    expect(primary.textContent).toBe(MOHINGA_MY);
    expect(container.querySelector(".kds-line-en")!.textContent).toBe("Mohinga");
    expect(container.querySelector(".kds-line-mods")).toBeNull();
  });

  it('one Burmese modifier mounts the lang="my" line ABOVE the English line, fallback wrapped lang="en"', () => {
    const { container } = render(
      <TicketLineText
        line={line({
          nameMy: MOHINGA_MY,
          modifiers: ["Mild", "No egg"],
          modifiersMy: [MILD_MY, null],
        })}
      />,
    );
    const mods = container.querySelectorAll(".kds-line-mods");
    expect(mods).toHaveLength(2);
    expect(mods[0]!.getAttribute("lang")).toBe("my");
    expect(mods[0]!.querySelector('[lang="en"]')!.textContent).toBe("No egg");
    expect(mods[1]!.getAttribute("lang")).toBeNull();
    expect(mods[1]!.textContent).toBe("Mild · No egg");
  });

  it("all-null modifiers with a Burmese name: the name pair only, the English modifier line as before", () => {
    const { container } = render(
      <TicketLineText
        line={line({ nameMy: MOHINGA_MY, modifiers: ["Mild"], modifiersMy: [null] })}
      />,
    );
    expect(container.querySelectorAll(".kds-line-mods")).toHaveLength(1);
    expect(container.querySelector('.kds-line-mods[lang="my"]')).toBeNull();
  });
});

describe("RailRowText — the All-Day row", () => {
  const row = (o: Partial<Parameters<typeof RailRowText>[0]["row"]> = {}) => ({
    label: "Mohinga",
    qty: 2,
    name: "Mohinga",
    nameMy: null,
    modifiers: [] as string[],
    modifiersMy: [] as (string | null)[],
    ...o,
  });

  it("nothing Burmese known → the label alone, no elements", () => {
    const { container } = render(<RailRowText row={row()} />);
    expect(container.querySelector(".kds-rail-my")).toBeNull();
    expect(container.textContent).toBe("Mohinga");
  });

  it('a Burmese name → the Burmese row under lang="my" with the English label beneath', () => {
    const { container } = render(<RailRowText row={row({ nameMy: MOHINGA_MY })} />);
    const my = container.querySelector(".kds-rail-my")!;
    expect(my.getAttribute("lang")).toBe("my");
    expect(my.textContent).toBe(MOHINGA_MY);
    expect(container.querySelector(".kds-rail-en")!.textContent).toBe("Mohinga");
  });

  it('THE RAIL FALLBACK: an English-only dish with one Burmese option wraps the dish name lang="en"', () => {
    // MUTATION: `{row.nameMy ?? row.name}` → "Mohinga" sits bare under lang="my".
    const { container } = render(
      <RailRowText
        row={row({
          label: "Mohinga · Mild, No egg",
          modifiers: ["Mild", "No egg"],
          modifiersMy: [MILD_MY, null],
        })}
      />,
    );
    const my = container.querySelector(".kds-rail-my")!;
    const en = [...my.querySelectorAll('[lang="en"]')].map((e) => e.textContent);
    expect(en).toEqual(["Mohinga", "No egg"]);
    expect(ownText(my)).toEqual(["·", MILD_MY, "·"]);
  });
});

describe("ExpoLineMy — the bag row's Burmese half, name and modifiers independent", () => {
  const line = (o: Partial<Parameters<typeof ExpoLineMy>[0]["line"]>) => ({
    name: "Mohinga",
    nameMy: null,
    modifiers: [] as string[],
    modifiersMy: [] as (string | null)[],
    ...o,
  });

  it("an English-only bag line mounts nothing", () => {
    const { container } = render(
      <ExpoLineMy line={line({ modifiers: ["Mild"], modifiersMy: [null] })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it('a Burmese name with English-only modifiers: the name alone, no lang="en", no modifier run', () => {
    const { container } = render(
      <ExpoLineMy line={line({ nameMy: MOHINGA_MY, modifiers: ["Mild"], modifiersMy: [null] })} />,
    );
    const my = container.querySelector(".expo-line-my")!;
    expect(my.getAttribute("lang")).toBe("my");
    expect(my.textContent).toBe(MOHINGA_MY);
    expect(my.querySelector('[lang="en"]')).toBeNull();
  });

  it('an English-only name with one Burmese option: the name wrapped lang="en", the option bare', () => {
    const { container } = render(
      <ExpoLineMy line={line({ modifiers: ["Mild", "No egg"], modifiersMy: [MILD_MY, null] })} />,
    );
    const my = container.querySelector(".expo-line-my")!;
    const en = [...my.querySelectorAll('[lang="en"]')].map((e) => e.textContent);
    expect(en).toEqual(["Mohinga", "No egg"]);
    expect(my.textContent).toBe(`Mohinga · ${MILD_MY} · No egg`);
  });
});
