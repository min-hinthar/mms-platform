/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DOORS, currentDoor } from "@/lib/doors";
import { t } from "@/lib/i18n";
import { menuHref } from "@/lib/menu-href";

/**
 * Phase 3b (D9) — the door is a moment, and the eyebrow has ONE host. Every door eyebrow opens the
 * same "Change order type" sheet: the current door lit (a non-link, `aria-current`), the other two
 * the home's exact links (hrefs EQUAL `DOORS`' — computed here, never typed), and the table's two
 * exits only at a table. The v7.2 sub-line "Your cart stays with you." is FALSE here (each door
 * mints its own cart) and is refused by name.
 */
vi.mock("@/components/nav/TransitionNav", () => ({
  TransitionLink: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...(rest as object)}>
      {children}
    </a>
  ),
}));
const capture = vi.fn();
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => capture(...a) } }));
const forgetDinein = vi.fn();
vi.mock("@/lib/useTableSession", () => ({
  forgetDineinOnThisDevice: () => forgetDinein(),
}));
const forgetCart = vi.fn();
vi.mock("@/components/ActiveOrderProvider", () => ({ useForgetCart: () => forgetCart }));
// The sheet reads the door vocabulary from lib/doors and never the cart: the market has no provider.
vi.mock("@/components/TableCartProvider", () => ({
  useCart: () => {
    throw new Error("the DoorSheet must not read the cart — the market has no provider");
  },
}));

const { DoorSheet } = await import("./DoorSheet");

/** No jest-dom here — read the text and match it. */
const text = (el: Element | null) => el?.textContent ?? "";

const COMPONENTS = __dirname;
const CSS = readFileSync(path.join(COMPONENTS, "..", "app", "globals.css"), "utf8");
/** Comments stripped first — prose naming a class is not a rule (the overscroll-contract idiom). */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

beforeEach(() => {
  capture.mockReset();
  forgetDinein.mockReset();
  forgetCart.mockReset();
});
afterEach(cleanup);

const open = () => {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  return screen.getByRole("dialog");
};
const hrefsOf = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"));
/** The two doors the sheet links to for a MENU mode (scango is the market, so its current door is
 *  grocery) — computed from the table, never typed. */
const otherDoors = (mode: string) =>
  DOORS.filter((d) => d.mode !== currentDoor(mode).mode).map((d) => d.href);

describe("DoorSheet — the trigger", () => {
  it("is the eyebrow as a control: haspopup dialog, expanded follows the sheet, the sr suffix", () => {
    render(<DoorSheet mode="pickup" />);
    const btn = screen.getByRole("button");
    expect(btn.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["eyebrow", "menu-context-btn"]),
    );
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(text(btn)).toMatch(/^To go/);
    expect(btn.querySelector(".sr-only")?.textContent).toBe(" — change how you’re ordering");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("reads the table NUMBER at a table, the door's word otherwise", () => {
    const { unmount } = render(<DoorSheet mode="dinein" tableNumber={7} />);
    expect(text(screen.getByRole("button"))).toMatch(/^At table 7/);
    unmount();
    render(<DoorSheet mode="dinein" tableNumber={null} />);
    expect(text(screen.getByRole("button"))).toMatch(/^At the table/);
  });

  it("the market's flourish rides inside the trigger, decorative", () => {
    render(
      <DoorSheet
        mode="scango"
        flourish={
          <>
            · <span lang="my">စျေး</span>
          </>
        }
      />,
    );
    const btn = screen.getByRole("button");
    expect(text(btn)).toMatch(/^Scan & go/);
    const my = btn.querySelector('[lang="my"]');
    expect(my?.closest("[aria-hidden]")).not.toBeNull();
  });

  it("reports open and close to its host (the pull-to-refresh and the camera hold read it)", () => {
    const onOpenChange = vi.fn();
    render(<DoorSheet mode="pickup" onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("DoorSheet — the sheet", () => {
  it("is titled 'Change order type' and says each door has its own order — never v7.2's false line", () => {
    render(<DoorSheet mode="pickup" />);
    const dialog = open();
    expect(text(dialog)).toMatch(t("en", "changeOrderType"));
    expect(text(dialog)).toMatch(t("my", "changeOrderType"));
    expect(text(dialog)).toMatch(t("en", "eachDoorOwnOrder"));
    expect(text(dialog)).toMatch(t("my", "eachDoorOwnOrder"));
    expect(document.body.textContent).not.toMatch(/Your cart stays with you/);
    // Nor in the source — a comment quoting it is one edit from shipping it.
    const src = readFileSync(path.join(COMPONENTS, "DoorSheet.tsx"), "utf8");
    expect(src).not.toMatch(/Your cart stays with you/);
    // The sheet adds no live region of its own.
    expect(dialog.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
  });

  it("dine-in: the current door is a lit non-link named with the table; the other two are DOORS' links", () => {
    render(<DoorSheet mode="dinein" tableNumber={7} />);
    const dialog = open();
    const current = dialog.querySelector('[aria-current="true"]')!;
    expect(current).not.toBeNull();
    expect(current.tagName).toBe("DIV");
    expect(current.getAttribute("tabindex")).toBeNull();
    expect(current.className.split(/\s+/)).toContain("door-sheet-current");
    expect(text(current)).toMatch("Dine-in · Table 7");
    expect(hrefsOf(dialog).slice(0, 2)).toEqual(otherDoors("dinein"));
    // Exactly the two exits, verbatim, under the doors.
    const back = within(dialog).getByRole("link", { name: /Back to the start/ });
    expect(text(back)).toMatch("keeps your table");
    expect(back.getAttribute("href")).toBe(menuHref(null));
    const leave = within(dialog).getByRole("link", { name: /Leave this table/ });
    expect(text(leave)).toMatch("this phone only — the table stays open for everyone else");
    expect(hrefsOf(dialog)).toHaveLength(4);
  });

  it("dine-in without a number: the current door is just 'Dine-in'", () => {
    render(<DoorSheet mode="dinein" tableNumber={null} />);
    const dialog = open();
    const current = dialog.querySelector('[aria-current="true"]')!;
    expect(text(current)).toMatch(/Dine-in/);
    expect(text(current)).not.toMatch(/Table/);
  });

  it("the danger exit forgets the table on this phone, THEN the cart pointer — in that order", () => {
    render(<DoorSheet mode="dinein" tableNumber={7} />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("link", { name: /Leave this table/ }));
    expect(forgetDinein).toHaveBeenCalledTimes(1);
    expect(forgetCart).toHaveBeenCalledTimes(1);
    expect(forgetDinein.mock.invocationCallOrder[0]!).toBeLessThan(
      forgetCart.mock.invocationCallOrder[0]!,
    );
    // The keeps-your-table exit forgets nothing.
    forgetDinein.mockReset();
    forgetCart.mockReset();
    cleanup();
    render(<DoorSheet mode="dinein" tableNumber={7} />);
    fireEvent.click(within(open()).getByRole("link", { name: /Back to the start/ }));
    expect(forgetDinein).not.toHaveBeenCalled();
    expect(forgetCart).not.toHaveBeenCalled();
  });

  it("to-go: To-go lit, dine-in + grocery links, NO exits", () => {
    render(<DoorSheet mode="pickup" />);
    const dialog = open();
    expect(text(dialog.querySelector('[aria-current="true"]'))).toMatch(/To-go/);
    expect(hrefsOf(dialog)).toEqual(otherDoors("pickup"));
    expect(within(dialog).queryByText(/Back to the start/)).toBeNull();
    expect(within(dialog).queryByText(/Leave this table/)).toBeNull();
  });

  it("the market: Grocery lit, the two food doors as links, NO exits", () => {
    render(<DoorSheet mode="scango" />);
    const dialog = open();
    expect(text(dialog.querySelector('[aria-current="true"]'))).toMatch(/Grocery/);
    expect(hrefsOf(dialog)).toEqual(otherDoors("scango"));
    expect(within(dialog).queryByText(/Leave this table/)).toBeNull();
  });

  it("a door link captures mode_selected with the door and source: sheet — and leaves the sheet OPEN until the route unmounts it", () => {
    // Blind pass on 3b (concurrency, high): on the market the sheet IS the camera hold. Closing it on
    // the tap released the hold while the stream still ran through the async route change, so a
    // sighting in that window wrote a line into the basket the shopper had just chosen to leave.
    const onOpenChange = vi.fn();
    render(<DoorSheet mode="scango" onOpenChange={onOpenChange} />);
    const dialog = open();
    const togo = DOORS.find((d) => d.mode === "pickup")!;
    fireEvent.click(within(dialog).getByRole("link", { name: /To-go/ }));
    expect(capture).toHaveBeenCalledWith("mode_selected", {
      mode: togo.mode,
      door: togo.door,
      source: "sheet",
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
  it("the current row SAYS it is where you are — not only by fill and aria-current (a role-less div is not reliably spoken)", () => {
    render(<DoorSheet mode="scango" />);
    const dialog = open();
    const current = dialog.querySelector('[aria-current="true"]')!;
    expect(text(current)).toMatch(/you’re here/);
    for (const a of within(dialog).getAllByRole("link")) expect(text(a)).not.toMatch(/you’re here/);
  });
});

describe("DoorSheet — the stylesheet", () => {
  /** Every rule block as { selectors, body }. Splitting on `}` leaves a media head attached to the
   *  first block inside it; the selector is the last line before `{`, which is the rule's own. */
  const blocks = CODE.split("}")
    .map((chunk) => {
      const at = chunk.lastIndexOf("{");
      if (at < 0) return null;
      const head = chunk.slice(0, at).trim().split("\n").pop()?.trim() ?? "";
      // A multi-line selector list: walk back while the previous line ends in a comma.
      const lines = chunk.slice(0, at).trim().split("\n");
      let i = lines.length - 1;
      while (i > 0 && lines[i - 1]!.trim().endsWith(",")) i--;
      const selector = lines.slice(i).join("\n");
      return {
        head,
        selectors: selector
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        body: chunk.slice(at + 1),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  it("`.door-sheet-current` rides the ONE lit-cap rule — the `.checkout-pill-on` list — and no other", () => {
    const naming = blocks.filter((b) => b.selectors.includes(".door-sheet-current"));
    expect(naming).toHaveLength(1);
    const cap = naming[0]!;
    expect(cap.selectors).toContain(".checkout-pill-on");
    // Selected by what it DECLARES: the solid accent fill with on-accent ink (ink follows fill).
    expect(cap.body).toMatch(/background:\s*var\(--ac\)\s*;/);
    expect(cap.body).toMatch(/color:\s*var\(--oa\)\s*;/);
    // And the token appears nowhere else — not as a compound, not in a second list.
    expect([...CODE.matchAll(/\.door-sheet-current/g)]).toHaveLength(1);
  });

  it("the lit row's ink is uncontested: no rule on the bare `.door-sheet-row` (the div's other class) declares color or text-decoration", () => {
    // Blind pass on 3b (critical 2): `.door-sheet-row { color: inherit }` sat ~9,300 lines AFTER the
    // lit-cap rule at the SAME specificity, so the current row — which carries both classes — painted
    // body ink on gold (1.82:1 in Night). The link-only resets belong on `a.door-sheet-row`, which a
    // div never matches. Candidates selected by what they DECLARE, comments already stripped.
    const bare = blocks.filter((b) => b.selectors.includes(".door-sheet-row"));
    expect(bare.length).toBeGreaterThanOrEqual(1);
    for (const b of bare) {
      expect(b.body).not.toMatch(/(^|[;\s])color\s*:/);
      expect(b.body).not.toMatch(/(^|[;\s])text-decoration\s*:/);
    }
    const anchorOnly = blocks.find((b) => b.selectors.includes("a.door-sheet-row"));
    expect(anchorOnly?.body).toMatch(/color:\s*inherit\s*;/);
  });

  it("every door row is a 44px target, and nothing in the sheet staggers", () => {
    const row = blocks.find((b) => b.selectors.includes(".door-sheet-row"));
    expect(row?.body).toMatch(/min-height:\s*44px\s*;/);
    const src = readFileSync(path.join(COMPONENTS, "DoorSheet.tsx"), "utf8");
    expect(src).not.toMatch(/mms-stagger/);
  });

  it("the table's exits kept their rules under the sheet's name — nothing left under the old one", () => {
    expect(blocks.some((b) => b.selectors.includes(".door-sheet-exits"))).toBe(true);
    expect(blocks.some((b) => b.selectors.includes(".door-sheet-exits-note"))).toBe(true);
    expect(CODE).not.toMatch(/\.table-options/);
  });
});
