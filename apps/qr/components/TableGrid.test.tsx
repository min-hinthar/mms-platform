/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DineInTable } from "@/lib/tables";
import type { PeekSession } from "@/lib/useSessionPeek";
import { dineInMenuHref, tableChipLabel } from "@/lib/table-pick";

/**
 * Phase 3c-i (D18) — the K2 grid, extracted from TablePicker so the DoorSheet can host it as a
 * SECTION. Every word and every href it renders comes from `lib/table-pick.ts`; this suite pins the
 * WIRING only: the three states reach the DOM, a seated chip hands the join to its HOST (never a
 * claim), the stagger is a prop the sheet turns off, the empty registry stays honest, and the
 * capture says where the tap came from.
 */
const ctx = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  peek: null as PeekSession[] | null,
}));
vi.mock("./nav/TransitionNav", () => ({ useJourneyRouter: () => ({ push: ctx.push }) }));
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => ctx.capture(...a) } }));
vi.mock("@/lib/useSessionPeek", () => ({ useSessionPeek: () => ctx.peek }));

const { TableGrid } = await import("./TableGrid");

const TABLES: DineInTable[] = [
  { tableNumber: 3, occupied: true }, // mine (peek below)
  { tableNumber: 5, occupied: true }, // a stranger's party
  { tableNumber: 8, occupied: false }, // open
];
const MINE: PeekSession = {
  mode: "dinein",
  tableNumber: 3,
  itemCount: 0,
  cartId: null,
} as PeekSession;

beforeEach(() => {
  ctx.push.mockReset();
  ctx.capture.mockReset();
  ctx.peek = [MINE];
});
afterEach(cleanup);

const chip = (n: number) =>
  screen.getByRole("button", { name: new RegExp(`^Table ${n},`) }) as HTMLButtonElement;

describe("TableGrid — the three states", () => {
  it("renders the lib's word and full-sentence name on each chip, by state class", () => {
    render(<TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />);
    const list = screen.getByRole("list", { name: "Choose your table" });
    expect(list.className.split(/\s+/)).toContain("table-grid");
    expect(within(list).getAllByRole("button")).toHaveLength(3);

    const mine = chip(3);
    expect(mine.getAttribute("aria-label")).toBe(tableChipLabel(3, "resume"));
    expect(mine.className.split(/\s+/)).toContain("is-mine");
    expect(mine.textContent).toContain("Your table");

    const seated = chip(5);
    expect(seated.getAttribute("aria-label")).toBe(tableChipLabel(5, "join"));
    expect(seated.className.split(/\s+/)).toContain("is-seated");
    expect(seated.textContent).toContain("Seated");
    // Seated is TAPPABLE (the K2 owner decision) — never disabled, in either spelling.
    expect(seated.hasAttribute("disabled")).toBe(false);
    expect(seated.getAttribute("aria-disabled")).toBeNull();

    const open = chip(8);
    expect(open.getAttribute("aria-label")).toBe(tableChipLabel(8, "claim"));
    expect(open.className.split(/\s+/)).toContain("is-open");
    expect(open.textContent).toContain("Open");

    // The numeral and the dot are decorative — the aria-label is the whole sentence.
    for (const b of within(list).getAllByRole("button")) {
      expect(b.querySelector(".table-chip-num")?.getAttribute("aria-hidden")).toBe("true");
      expect(b.querySelector(".table-dot")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("a failed peek leaves every occupied table plainly Seated (advisory only)", () => {
    ctx.peek = null;
    render(<TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />);
    expect(chip(3).className.split(/\s+/)).toContain("is-seated");
  });
});

describe("TableGrid — what a tap does", () => {
  it("an OPEN chip claims by number through the one href builder, and says the door is entered first", () => {
    const onEnter = vi.fn();
    render(
      <TableGrid
        tables={TABLES}
        stagger={false}
        source="sheet"
        onJoin={() => {}}
        onEnter={onEnter}
      />,
    );
    fireEvent.click(chip(8));
    expect(ctx.push).toHaveBeenCalledTimes(1);
    expect(ctx.push).toHaveBeenCalledWith(dineInMenuHref({ table: 8 }));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.invocationCallOrder[0]!).toBeLessThan(
      ctx.push.mock.invocationCallOrder[0]!,
    );
  });

  it("YOUR table resumes — `&resume=1` then the number", () => {
    render(<TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />);
    fireEvent.click(chip(3));
    expect(ctx.push).toHaveBeenCalledWith(dineInMenuHref({ table: 3, resume: true }));
  });

  it("a SEATED chip hands the join to the host with the chip itself — never a claim, no navigation, the door not entered", () => {
    const onJoin = vi.fn();
    const onEnter = vi.fn();
    render(
      <TableGrid
        tables={TABLES}
        stagger={false}
        source="sheet"
        onJoin={onJoin}
        onEnter={onEnter}
      />,
    );
    const seated = chip(5);
    fireEvent.click(seated);
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith(5, seated);
    expect(ctx.push).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("the capture carries the SOURCE — page or sheet — beside K2's table fields", () => {
    const { unmount } = render(
      <TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />,
    );
    fireEvent.click(chip(8));
    expect(ctx.capture).toHaveBeenCalledWith("table_picked", {
      table_number: 8,
      occupied: false,
      resumed: false,
      source: "sheet",
    });
    fireEvent.click(chip(5));
    expect(ctx.capture).toHaveBeenLastCalledWith("table_picked", {
      table_number: 5,
      occupied: true,
      source: "sheet",
    });
    unmount();
    ctx.capture.mockReset();
    render(<TableGrid tables={TABLES} stagger source="page" onJoin={() => {}} />);
    fireEvent.click(chip(3));
    expect(ctx.capture).toHaveBeenCalledWith("table_picked", {
      table_number: 3,
      occupied: true,
      resumed: true,
      source: "page",
    });
  });
});

describe("TableGrid — the stagger is the PAGE's premiere, never the sheet's", () => {
  it("stagger={false} renders no mms-stagger and no animationDelay anywhere", () => {
    const { container } = render(
      <TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />,
    );
    expect(container.querySelector(".mms-stagger")).toBeNull();
    for (const b of screen.getAllByRole("button"))
      expect((b as HTMLElement).style.animationDelay).toBe("");
  });
  it("stagger (the /dine-in page) keeps the K2 cascade: every chip staggers with its own delay", () => {
    render(<TableGrid tables={TABLES} stagger source="page" onJoin={() => {}} />);
    const chips = within(screen.getByRole("list")).getAllByRole("button");
    chips.forEach((b, i) => {
      expect(b.className.split(/\s+/)).toContain("mms-stagger");
      expect((b as HTMLElement).style.animationDelay).toBe(`calc(${i} * 40ms)`);
    });
  });
});

describe("TableGrid — the empty registry stays honest", () => {
  it("no grid, the shipped line, and 'start without a number' is a bare host-start", () => {
    const onEnter = vi.fn();
    render(
      <TableGrid tables={[]} stagger={false} source="sheet" onJoin={() => {}} onEnter={onEnter} />,
    );
    expect(screen.queryByRole("list")).toBeNull();
    expect(document.body.textContent).toContain(
      "Couldn’t load the tables. Scan your table’s sticker, or start without a number.",
    );
    expect(screen.queryByText("Not at a numbered table? Start anyway")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "start without a number" }));
    expect(ctx.push).toHaveBeenCalledWith(dineInMenuHref({}));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
  it("with tables, 'Not at a numbered table? Start anyway' is the same bare host-start, under the grid", () => {
    render(<TableGrid tables={TABLES} stagger={false} source="sheet" onJoin={() => {}} />);
    const start = screen.getByRole("button", { name: "Not at a numbered table? Start anyway" });
    expect(start.className.split(/\s+/)).toContain("table-start-plain");
    fireEvent.click(start);
    expect(ctx.push).toHaveBeenCalledWith(dineInMenuHref({}));
  });
});
