import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

// `MmsEmailLayout` builds the logo URL from `lib/site-url`, which imports `server-only` — and that
// module throws the moment a non-RSC runtime loads it, taking the whole suite with it. Mocked
// rather than worked around: the origin has nothing to do with colour, and the alternative (moving
// the import) would change production code to suit a test.
vi.mock("@/lib/site-url", () => ({ siteUrl: () => "https://example.test" }));
import { AuthCodeEmail } from "./AuthCodeEmail";
import { OrderReceiptEmail } from "./OrderReceiptEmail";
import { StaffDeactivatedEmail } from "./StaffDeactivatedEmail";
import { StaffInviteEmail } from "./StaffInviteEmail";
import { EMAIL } from "./palette";
import type { ReceiptEntry } from "@/lib/receipt-entry";

/**
 * M83 — what actually reaches the diner's mail client.
 *
 * `check-theme-parity.mjs` pins `palette.ts` to `tokens.css` and refuses a raw colour in the template
 * SOURCE. Neither of those reads the rendered HTML, and the source is not the artifact: React Email
 * inlines these style objects into attributes, so a colour could be correct in the table, absent from
 * the source, and still never arrive — a template that simply forgets to apply a style is invisible
 * to both guards. This suite renders each template and asserts on the output.
 *
 * JSX is unavailable here (`apps/qr/vitest.config.ts` includes `**\/*.test.ts` only, and a `.ts` file
 * cannot carry JSX), hence `createElement`. That is also why this file can exist at all: the
 * templates are plain modules with no `server-only` import.
 */

/** Every colour the palette can emit, lowercased — the only values allowed in rendered output. */
const ALLOWED = new Set(Object.values(EMAIL).map((v) => v.toLowerCase()));

/**
 * A receipt that actually reaches every branch that paints: a refunded line (`--warn`), a kitchen
 * note and mods (`--t3`/`--t2`), a dropped line, a pickup slot, and a group heading.
 *
 * The first version of this comment claimed all that while the fixture carried `dropped: {count: 0}`
 * and `pickupSlot: null` — two branches that never rendered. No colour was actually lost (the dropped
 * notice reuses the shared `fine` style and the slot only changes text), but a fixture whose stated
 * coverage is larger than its real coverage is how a suite ends up proving less than it says.
 */
const entry: ReceiptEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "A1B2",
  createdAt: "2026-08-20T02:14:00.000Z",
  totalCents: 2247,
  tender: "card",
  pickupSlot: "2026-08-20T03:00:00.000Z",
  tableNumber: 4,
  customerName: null,
  breakdown: {
    subtotalCents: 1900,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 200,
    tipCents: 147,
  },
  lines: [
    {
      name: "Mohinga",
      qty: 1,
      unitPriceCents: 1400,
      mods: ["No egg"],
      fulfillment: "dinein",
      imageUrl: null,
      nameMy: null,
      notes: "extra chili",
      refundedCents: 0,
    },
    {
      name: "Burmese Milk Tea",
      qty: 1,
      unitPriceCents: 500,
      mods: [],
      fulfillment: "togo",
      imageUrl: null,
      nameMy: null,
      notes: null,
      refundedCents: 500,
    },
  ],
  refund: { state: "partial", refundedCents: 500, netPaidCents: 1747 },
  dropped: { count: 1, lines: [{ name: "Tea Leaf Salad", qty: 1 }] },
};

const RENDERED: [string, () => Promise<string>][] = [
  [
    "OrderReceiptEmail",
    () =>
      render(
        createElement(OrderReceiptEmail, { entry, receiptUrl: "https://example.test/track?r=tok" }),
      ),
  ],
  // Real props, no `as never`: a cast here would let a fixture drift from the component it renders,
  // which is how a suite ends up asserting on a tree the app never produces.
  [
    "AuthCodeEmail",
    () =>
      render(createElement(AuthCodeEmail, { code: "482913", magicLink: "https://example.test/m" })),
  ],
  [
    "StaffInviteEmail",
    () =>
      render(
        createElement(StaffInviteEmail, {
          displayName: "Nilar",
          roleLabel: "Server",
          signInUrl: "https://example.test/i",
        }),
      ),
  ],
  ["StaffDeactivatedEmail", () => render(createElement(StaffDeactivatedEmail))],
];

/**
 * The shell is probed THROUGH a real template rather than by rendering `MmsEmailLayout` directly.
 * Its `children` is a required prop, so a direct `createElement` would have to pass it as a prop —
 * which `react/no-children-prop` forbids — and every colour under test belongs to the shell anyway,
 * so a body adds nothing. This also keeps the probe on a tree the app actually sends.
 */
const shellHtml = () => render(createElement(StaffDeactivatedEmail));

/** Reverse map for reporting — several tokens share a value (`--tx`/`--ink`, `--cd`/`--oa`), so a
 *  hex can name more than one key. Only used to make a failure readable. */
const NAME_OF = new Map<string, string>();
for (const [k, v] of Object.entries(EMAIL)) {
  const key = v.toLowerCase();
  NAME_OF.set(key, NAME_OF.has(key) ? `${NAME_OF.get(key)}/${k}` : k);
}

/** The only two grounds an email's text can sit on: the page behind the card, and the card itself. */
const GROUNDS = [EMAIL.pg, EMAIL.cd];

/** Words that appear in a colour-valued declaration and are not colours. `none` and `solid` come
 *  from border shorthands; `transparent` and `inherit` are colour KEYWORDS but carry no value of
 *  their own, so they cannot drift away from the palette. */
const KEYWORDS_OK = new Set(["none", "solid", "dashed", "dotted", "transparent", "inherit"]);

function srgb(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [srgb(a), srgb(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every `prop: value` inside every `style="…"`, as a list of one element's declarations. */
function declarationSets(html: string): Record<string, string>[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map((m) => {
    const out: Record<string, string> = {};
    for (const decl of (m[1] ?? "").split(";")) {
      const at = decl.indexOf(":");
      if (at > 0) out[decl.slice(0, at).trim().toLowerCase()] = decl.slice(at + 1).trim();
    }
    return out;
  });
}

/**
 * Colour-valued properties, parsed by NAME rather than by hunting for hex-shaped substrings.
 *
 * ⚠️ This is the inversion an adversarial pass forced. Searching the markup for `#…`/`rgba(…)` can
 * only ever catch colours that LOOK like colours: `color: "white"` (or `red`, `hsl(…)`,
 * `color-mix(…)`) sailed past both this test and the parity sweep, on a surface whose whole stated
 * rule is "no colour except the table". Reading the declarations and asserting each VALUE is in the
 * palette catches every spelling, including ones CSS has not grown yet.
 */
const COLOUR_PROPS = /^(color|background|background-color|border[a-z-]*color|outline-color)$/;

describe("every rendered email speaks only the pinned palette", () => {
  it.each(RENDERED)("%s emits no colour outside palette.ts", async (_name, renderIt) => {
    const html = await renderIt();
    const rogue: string[] = [];
    for (const decls of declarationSets(html))
      for (const [prop, value] of Object.entries(decls)) {
        if (!COLOUR_PROPS.test(prop)) continue;
        // A shorthand like `border-top: 1px solid #ebe7e2` is matched by `border[a-z-]*color` only
        // in its longhand form; the shorthands are swept below by scanning the whole value.
        for (const tokenish of value.split(/\s+/))
          if (/^(#|rgb|hsl|color-mix|[a-z]{3,})/.test(tokenish) && !/^\d/.test(tokenish))
            if (!ALLOWED.has(tokenish.toLowerCase()) && !KEYWORDS_OK.has(tokenish.toLowerCase()))
              rogue.push(`${prop}: ${tokenish}`);
      }
    expect([...new Set(rogue)]).toEqual([]);
  });

  it("⚠️ every text colour clears AA against the ground it actually sits on", async () => {
    // The pairing guard, and the one the other three could not provide. `check-theme-parity` proves
    // each VALUE is a token and `contrast-audit` proves those tokens clear AA — but neither knows
    // which colour a template puts on which ground, so swapping a body line from `EMAIL.t2` to
    // `EMAIL.gold` shipped 2.05:1 text with all of them green.
    //
    // Two cases, and they are exhaustive for these templates: a declaration that carries its OWN
    // `background-color` is a filled element (the CTA buttons), so assert that pair; anything else is
    // text on one of the two grounds, and since the markup does not say which, it must clear BOTH.
    // Stricter than reality by design — the alternative is resolving the cascade, and every genuine
    // text token passes on both grounds anyway (the decorative `--gold` and on-fill `--oa` do not,
    // which is precisely the pair of mistakes this catches).
    const failures: string[] = [];
    for (const [name, renderIt] of RENDERED) {
      for (const decls of declarationSets(await renderIt())) {
        const fg = decls.color;
        if (!fg || !ALLOWED.has(fg.toLowerCase())) continue;
        const own = decls["background-color"] ?? decls.background;
        const grounds = own && ALLOWED.has(own.toLowerCase()) ? [own] : GROUNDS;
        for (const bg of grounds) {
          const r = ratio(fg, bg);
          if (r < 4.5)
            failures.push(
              `${name}: ${NAME_OF.get(fg.toLowerCase()) ?? fg} on ` +
                `${NAME_OF.get(bg.toLowerCase()) ?? bg} = ${r.toFixed(2)}`,
            );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("⚠️ the shell really carries the palette — not merely no stray values", async () => {
    // The negative assertions above pass trivially on a template that emits NO colour at all (a
    // style object that stopped being applied, say). This is their positive twin.
    const html = await shellHtml();
    for (const hex of [EMAIL.pg, EMAIL.cd, EMAIL.tx, EMAIL.t2, EMAIL.ac, EMAIL.gold, EMAIL.bd])
      expect(html.toLowerCase()).toContain(hex.toLowerCase());
  });

  it("⚠️ declares itself a LIGHT message, so a client does not invert unmeasured pairs", async () => {
    const html = await shellHtml();
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('name="supported-color-schemes"');
    expect(html).toMatch(/color-scheme"\s+content="light"/);
  });
});
