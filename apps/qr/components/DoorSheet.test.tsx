/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cssDeclarations } from "@/lib/css-declarations";
import { DOORS, currentDoor } from "@/lib/doors";
import { t } from "@/lib/i18n";
import { menuHref } from "@/lib/menu-href";
import { dineInMenuHref } from "@/lib/table-pick";
import type { DineInTable } from "@/lib/tables";

/**
 * Phase 3b (D9) — the door is a moment, and the eyebrow has ONE host. Every door eyebrow opens the
 * same "Change order type" sheet: the current door lit (a non-link, `aria-current`), the other two
 * the home's exact links (hrefs EQUAL `DOORS`' — computed here, never typed), and the table's two
 * exits only at a table. The v7.2 sub-line "Your cart stays with you." is FALSE here (each door
 * mints its own cart) and is refused by name.
 */
// 3c-i (D18): the grid inside the sheet routes through the journey router and reads the peek — both
// mocked so the suite stays a DOM suite (the real peek pulls the browser Supabase client in).
const grid = vi.hoisted(() => ({ push: vi.fn(), peek: [] as unknown[] }));
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
  useJourneyRouter: () => ({ push: grid.push }),
}));
vi.mock("@/lib/useSessionPeek", () => ({ useSessionPeek: () => grid.peek }));
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
  grid.push.mockReset();
  grid.peek = [];
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

/**
 * Phase 3c-i (D18) — the table grid is a SECTION of this sheet, offered only OFF a dine-in session
 * (`tableGridOffered`): a `?table=N` claim mints a NEW session, so a grid at a live table would orphan
 * this phone's drafts. The Dine-in ROW stays the home's exact link; the chips are the grid's own
 * buttons. A seated chip opens an INLINE form (never a second sheet — D9); `mode_selected` fires on
 * the chip tap, the door actually entered, never on open.
 */
describe("DoorSheet — the table grid section (3c-i)", () => {
  const TABLES: DineInTable[] = [
    { tableNumber: 2, occupied: false },
    { tableNumber: 5, occupied: true },
  ];
  const section = (dialog: HTMLElement) => {
    const h3 = within(dialog).queryByRole("heading", { level: 3, name: /Pick your table/ });
    if (!h3) return null;
    return dialog.querySelector<HTMLElement>(`section[aria-labelledby="${h3.id}"]`);
  };

  it("to-go with `tables`: ONE section headed 'Pick your table' (v7.2:495, both tongues) between the doors and the sheet's end; still ONE dialog", () => {
    render(<DoorSheet mode="pickup" tables={TABLES} />);
    const dialog = open();
    const sec = section(dialog)!;
    expect(sec).not.toBeNull();
    expect(dialog.querySelectorAll("section")).toHaveLength(1);
    const h3 = within(dialog).getByRole("heading", { level: 3 });
    expect(h3.id).toBe(sec.getAttribute("aria-labelledby"));
    expect(text(h3)).toContain(t("en", "pickYourTable"));
    expect(h3.querySelector('[lang="my"]')?.textContent).toBe(t("my", "pickYourTable"));
    // The shipped sub-line (TablePicker.tsx:57), EN-only — the heading carries the pair.
    expect(text(sec)).toContain("Scan your table’s sticker, or pick your number.");
    // Placed AFTER the doors list, inside the dialog.
    const doors = dialog.querySelector(".door-sheet-doors")!;
    expect(doors.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    // The grid itself, with its K2 name; nothing in the sheet staggers (DOM, not just source).
    expect(within(sec).getByRole("list", { name: "Choose your table" })).toBeTruthy();
    expect(dialog.querySelector(".mms-stagger")).toBeNull();
    for (const b of within(sec).getAllByRole("button"))
      expect((b as HTMLElement).style.animationDelay).toBe("");
    // The doors are still exactly the two links the home has — a chip is a button, never a door.
    expect(hrefsOf(dialog)).toEqual(otherDoors("pickup"));
    // No live region arrived with the section.
    expect(dialog.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
  });

  it("an OPEN chip pushes the one builder's claim href, records the door ENTERED, and leaves the sheet open", () => {
    const onOpenChange = vi.fn();
    render(<DoorSheet mode="pickup" tables={TABLES} onOpenChange={onOpenChange} />);
    const dialog = open();
    // Opening the sheet — and revealing the section — captured nothing.
    expect(capture).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Table 2,/ }));
    expect(grid.push).toHaveBeenCalledTimes(1);
    expect(grid.push).toHaveBeenCalledWith(dineInMenuHref({ table: 2 }));
    expect(capture).toHaveBeenCalledWith("mode_selected", {
      mode: "dinein",
      door: "dinein",
      source: "sheet",
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("a SEATED chip reveals the INLINE join form (no second dialog), focus lands on the code input; Join pushes the upper-cased join href", () => {
    render(<DoorSheet mode="pickup" tables={TABLES} />);
    const dialog = open();
    const seated = within(dialog).getByRole("button", { name: /^Table 5,/ });
    expect(dialog.querySelector("form")).toBeNull();
    // The seated chip is a DISCLOSURE here (it reveals the inline ask); the open chip is not.
    expect(seated.getAttribute("aria-expanded")).toBe("false");
    expect(seated.hasAttribute("aria-controls")).toBe(false);
    expect(
      within(dialog)
        .getByRole("button", { name: /^Table 2,/ })
        .hasAttribute("aria-expanded"),
    ).toBe(false);
    fireEvent.click(seated);
    expect(grid.push).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalledWith("mode_selected", expect.anything());
    const form = dialog.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(seated.getAttribute("aria-expanded")).toBe("true");
    expect(form.id).not.toBe("");
    expect(seated.getAttribute("aria-controls")).toBe(form.id);
    expect(form.className.split(/\s+/)).toContain("mms-rise");
    const title = within(form).getByRole("heading", { name: "Join Table 5" });
    expect(form.getAttribute("aria-labelledby")).toBe(title.id);
    expect(text(form)).toContain(
      "Someone is already sitting at Table 5. Enter the table code they share (or scan the table’s sticker) to order together.",
    );
    const input = within(form).getByLabelText("Table code") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("placeholder")).toBe("e.g. WXYZ1234");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    // Join refuses an empty code without vanishing or going native-disabled.
    const join = within(form).getByRole("button", { name: "Join" });
    expect(join.hasAttribute("disabled")).toBe(false);
    expect(join.getAttribute("aria-disabled")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    join.focus();
    fireEvent.submit(form);
    expect(grid.push).not.toHaveBeenCalled();
    // …and SAYS so, on the field: `aria-invalid`, the note, focus back on the input. An empty submit
    // used to go nowhere silently (Enter in the input submits past the aria-disabled look).
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(text(form)).toContain("Enter the table code to join.");
    expect(input.getAttribute("aria-describedby")).toBe(form.querySelector(".ui-field-error")!.id);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: " wxyz1234 " } });
    // Typing clears the refusal.
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(text(form)).not.toContain("Enter the table code to join.");
    expect(join.getAttribute("aria-disabled")).toBeNull();
    fireEvent.submit(form);
    expect(grid.push).toHaveBeenCalledWith(dineInMenuHref({ join: "WXYZ1234" }));
    expect(capture).toHaveBeenCalledWith("mode_selected", {
      mode: "dinein",
      door: "dinein",
      source: "sheet",
    });
  });

  it("tapping the same seated chip again collapses the form and returns focus to the chip", () => {
    render(<DoorSheet mode="pickup" tables={TABLES} />);
    const dialog = open();
    const seated = within(dialog).getByRole("button", { name: /^Table 5,/ });
    fireEvent.click(seated);
    expect(dialog.querySelector("form")).not.toBeNull();
    // A refusal left on the field does not survive the collapse and re-reveal.
    fireEvent.submit(dialog.querySelector("form")!);
    expect(text(dialog)).toContain("Enter the table code to join.");
    fireEvent.click(seated);
    expect(dialog.querySelector("form")).toBeNull();
    expect(seated.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(seated);
    fireEvent.click(seated);
    expect(text(dialog)).not.toContain("Enter the table code to join.");
  });

  it("at a dine-in session — numbered AND numberless — NO section even with `tables`: the lit row and the two exits exactly as today", () => {
    for (const tableNumber of [7, null]) {
      cleanup();
      render(<DoorSheet mode="dinein" tableNumber={tableNumber} tables={TABLES} />);
      const dialog = open();
      expect(section(dialog)).toBeNull();
      expect(dialog.querySelector("section")).toBeNull();
      expect(within(dialog).queryByText(/Pick your table/)).toBeNull();
      expect(within(dialog).queryByRole("list", { name: "Choose your table" })).toBeNull();
      expect(dialog.querySelector('[aria-current="true"]')).not.toBeNull();
      expect(hrefsOf(dialog).slice(0, 2)).toEqual(otherDoors("dinein"));
      expect(hrefsOf(dialog)).toHaveLength(4);
      expect(within(dialog).getByRole("link", { name: /Leave this table/ })).toBeTruthy();
    }
  });

  it("to-go without `tables`, and the market (which passes none in 3c-i), render no section", () => {
    render(<DoorSheet mode="pickup" />);
    expect(open().querySelector("section")).toBeNull();
    cleanup();
    render(<DoorSheet mode="scango" />);
    expect(open().querySelector("section")).toBeNull();
  });

  it("an EMPTY registry on the to-go menu stays honest — the shipped line, and a host-start that enters the door", () => {
    render(<DoorSheet mode="pickup" tables={[]} />);
    const dialog = open();
    const sec = section(dialog)!;
    expect(text(sec)).toContain(
      "Couldn’t load the tables. Scan your table’s sticker, or start without a number.",
    );
    // J32 — the line and its in-sentence button bring no top margin into the section's gap (the
    // retired picker page's 20px / 18px).
    const start = within(sec).getByRole("button", { name: "start without a number" });
    expect(start.style.marginTop).toBe("");
    expect(start.closest("p")!.style.marginTop).toBe("");
    fireEvent.click(within(sec).getByRole("button", { name: "start without a number" }));
    expect(grid.push).toHaveBeenCalledWith(dineInMenuHref({}));
    expect(capture).toHaveBeenCalledWith("mode_selected", {
      mode: "dinein",
      door: "dinein",
      source: "sheet",
    });
  });

  it("J32 — no inline spacing: the section names its host for the stylesheet, and the escape brings no top margin", () => {
    render(<DoorSheet mode="pickup" tables={TABLES} />);
    const sec = section(open())!;
    expect(sec.className.split(/\s+/)).toContain("door-sheet-tables");
    // The hairline and top rhythm ride `[data-host="sheet"]` (the stylesheet test below).
    expect(sec.getAttribute("data-host")).toBe("sheet");
    expect(sec.getAttribute("style")).toBeNull();
    expect(sec.querySelector<HTMLElement>(".table-start-plain")!.style.marginTop).toBe("");
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
    // Any selector that can MATCH the div (deep pass on #312): the bare class, a compound
    // (`.door-sheet-doors .door-sheet-row`), a pseudo-class (`.door-sheet-row:hover`) — never the
    // anchor-only `a.door-sheet-row`, which a div cannot match. String equality admitted only the
    // first, so a later "reset" in either other shape re-broke the lit row's ink with this green.
    const divMatching = (sel: string) =>
      /(^|[\s>+~])\.door-sheet-row(?![\w-])/.test(sel) && !/(^|[\s>+~])a\.door-sheet-row/.test(sel);
    const bare = blocks.filter((b) => b.selectors.some(divMatching));
    expect(bare.length).toBeGreaterThanOrEqual(1);
    expect(divMatching(".door-sheet-row:hover")).toBe(true);
    expect(divMatching(".door-sheet-doors .door-sheet-row")).toBe(true);
    expect(divMatching("a.door-sheet-row")).toBe(false);
    expect(divMatching(".door-sheet-row-extra")).toBe(false);
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

  it("3c-i: `.table-chip.is-mine` is AVAILABILITY (the clay wash), never selection — it rides no lit-cap list", () => {
    // The current door is the ONE lit-gold cap in this sheet. A "Your table" chip that joined the
    // `.checkout-pill-on` list would put two selected things on one surface (DESIGN-LANGUAGE §2).
    const cap = blocks.filter((b) => b.selectors.includes(".checkout-pill-on"));
    expect(cap.length).toBeGreaterThanOrEqual(1);
    for (const b of cap) expect(b.selectors.some((s) => /is-mine/.test(s))).toBe(false);
    const mine = blocks.filter((b) => b.selectors.includes(".table-chip.is-mine"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.selectors).not.toContain(".checkout-pill-on");
    expect(mine[0]!.selectors).not.toContain(".door-sheet-current");
  });

  it("the table's exits kept their rules under the sheet's name — nothing left under the old one", () => {
    expect(blocks.some((b) => b.selectors.includes(".door-sheet-exits"))).toBe(true);
    expect(blocks.some((b) => b.selectors.includes(".door-sheet-exits-note"))).toBe(true);
    expect(CODE).not.toMatch(/\.table-options/);
  });

  it("J32 — 'Pick your table' is spaced by the stylesheet in tokens, and inside it the --s3 gap is the one rhythm", () => {
    // Parsed (comments stripped, every declaration bound to its own selector block), never scanned.
    const decls = cssDeclarations(CSS);
    const at = (sel: string) =>
      Object.fromEntries(
        decls
          .filter((d) => d.media === null && d.selector.split(",").some((s) => s.trim() === sel))
          .map((d) => [d.prop, d.value]),
      );
    // The stack on the bare class — exactly this, so a hairline here (it would land under the Send
    // sheet's dialog title) is refused. MUTATION door-sheet/send-section-takes-the-hairline → red.
    expect(at(".door-sheet-tables")).toEqual({
      display: "grid",
      gap: "var(--s3)",
      "padding-bottom": "var(--s2)",
    });
    // The DoorSheet's own section, under the doors: the exits' hairline and top rhythm.
    expect(at('.door-sheet-tables[data-host="sheet"]')).toEqual({
      "margin-top": "var(--s4)",
      "padding-top": "var(--s4)",
      "border-top": "1px solid var(--bd)",
    });
    // The grid's ONE host is this section, so NO rule that can reach `.table-grid` — bare, compound
    // or descendant, at any width — gives it a margin but its own `margin: 0`; the retired picker
    // page's 20px top added to the gap. MUTATION door-sheet/grid-margin-doubles-in-the-section → red.
    const gridMargins = decls
      .filter((d) => /\.table-grid(?![\w-])/.test(d.selector) && /^margin/.test(d.prop))
      .map((d) => [d.media, d.selector, d.prop, d.value]);
    expect(gridMargins).toEqual([[null, ".table-grid", "margin", "0"]]);
  });
});
