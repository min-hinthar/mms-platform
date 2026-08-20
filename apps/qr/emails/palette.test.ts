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

/** A realistic receipt: a refunded line, a kitchen note, mods, a dropped line and a pickup slot —
 *  every branch that paints a colour. A thin fixture would render half the palette and prove half. */
const entry: ReceiptEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "A1B2",
  createdAt: "2026-08-20T02:14:00.000Z",
  totalCents: 2247,
  tender: "card",
  pickupSlot: null,
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
  dropped: { count: 0, lines: [] },
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

describe("every rendered email speaks only the pinned palette", () => {
  it.each(RENDERED)("%s emits no colour outside palette.ts", async (_name, renderIt) => {
    const html = await renderIt();
    // Scan STYLE ATTRIBUTES only, never the whole document. Two things in rendered email HTML look
    // exactly like a hex colour and are not: React Email's `&#8202;`/`&#8203;` spacing entities, and
    // any receipt code that happens to be four hex digits — the first run of this test reported
    // `#8202`, `#8203` and the fixture's own order reference `#A1B2` as rogue colours. A guard that
    // flags text nobody paints is the same class of wrong as one that misses a real drift, so this
    // looks where colours actually live.
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1] ?? "").join(";");
    const found = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) =>
      m[0].toLowerCase(),
    );
    // Deliberately asserts the SET, not a count: a template that renders one colour twice is fine,
    // a template that renders one colour nobody pinned is the whole failure this exists to catch.
    expect([...new Set(found)].filter((v) => !ALLOWED.has(v))).toEqual([]);
  });

  it("⚠️ the shell really carries the palette — not merely no stray values", async () => {
    // The negative assertion above passes trivially on a template that emits NO colour at all (a
    // style object that stopped being applied, say). This is its positive twin.
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
