/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GroceryHit } from "@/lib/grocery";
import { GroceryNameSheet } from "./GroceryNameSheet";

/**
 * PD4 (m4 screen 2) — the Name sheet's STATES, and the two rules the critic made blocking:
 *   · the tag for the counter shows ONLY in a sheet a MISS opened (B6);
 *   · the busy result row keeps full ink and says "Adding…" (B10).
 * The real `@mms/ui` Sheet renders (Radix Dialog, portalled). Each MUTATION was induced and watched
 * go red.
 */
afterEach(cleanup);

const TEA: GroceryHit = {
  barcode: "2990000000017",
  name: "Tea Leaves -400g",
  nameMy: "ဇယန်းလက်ဖက်ချိုနှပ်-400g",
  brand: null,
  sizeQty: 400,
  sizeUnit: "g",
  unitPriceCents: 644,
  compareAtCents: 899,
  ebt: true,
};

type Props = Parameters<typeof GroceryNameSheet>[0];
const base = (over: Partial<Props> = {}): Props => ({
  open: true,
  onClose: () => {},
  query: "",
  onQueryChange: () => {},
  hits: null,
  searching: false,
  searchFailed: false,
  online: true,
  miss: "0123456789012",
  addingBarcode: null,
  busyLineId: null,
  refusal: null,
  onAddHit: () => {},
  onRetry: () => {},
  ...over,
});

const counterTag = () => screen.queryByRole("note", { name: /For the counter/ });

describe("the Name sheet — guided states", () => {
  it("just opened: 'It’s not you' + the one-word coaching; no tag, no hero; the field is the first stop", () => {
    render(<GroceryNameSheet {...base()} />);
    expect(screen.getByRole("dialog", { name: /Search by name/ })).toBeTruthy();
    expect(screen.getByText("It’s not you — most shelf codes aren’t in the app yet.")).toBeTruthy();
    expect(screen.getByText(/One word from the name is enough — like “laphet”/)).toBeTruthy();
    expect(counterTag()).toBeNull();
    expect(screen.queryByRole("button", { name: /Back to the camera/ })).toBeNull();
    // D1(d): the sheet opens with the FIELD focused (initialFocus), so the keyboard rises in the
    // opening tap. RED with the container default.
    const field = screen.getByRole("searchbox", { name: "Search grocery items by name" });
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-describedby")).toBe("name-state");
  });

  it("no match, from a MISS: the NOW line, the coaching, the NEXT sentence above 'Back to the camera', then the tag — last, with the query", () => {
    const onClose = vi.fn();
    render(<GroceryNameSheet {...base({ query: "durian", hits: [], onClose })} />);
    expect(screen.getByText("It’s not you — most shelf codes aren’t in the app yet.")).toBeTruthy();
    expect(screen.getByText(/Try one word from the name — or ask at the counter\./)).toBeTruthy();
    expect(screen.getByText(/Keep scanning — this one can wait for the counter\./)).toBeTruthy();
    const hero = screen.getByRole("button", { name: /Back to the camera/ });
    fireEvent.click(hero);
    expect(onClose).toHaveBeenCalledTimes(1);
    const tag = counterTag();
    expect(tag).toBeTruthy();
    // The tag carries the lens tag's own words, the query, and NEVER a code or a price.
    expect(tag!.textContent).toContain("This code isn’t in the app yet.");
    expect(tag!.textContent).toContain("Looked for “durian”");
    expect(tag!.textContent).not.toContain("0123456789012");
    expect(tag!.textContent).not.toMatch(/\$/);
    // The tag is read, not operated: no tab stop inside it.
    expect(tag!.querySelectorAll("button, a, input")).toHaveLength(0);
    // Order: the hero sits BEFORE the tag in the DOM (the human fallback comes last).
    expect(hero.compareDocumentPosition(tag!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no match, from a camera PANEL (no miss): the same dead end, but NO tag for the counter (B6)", () => {
    // MUTATION: draw the tag whenever the state is a dead end → a claim about a code that was
    // never scanned, held up for Dad; red.
    render(<GroceryNameSheet {...base({ query: "durian", hits: [], miss: null })} />);
    expect(screen.getByRole("button", { name: /Back to the camera/ })).toBeTruthy();
    expect(counterTag()).toBeNull();
  });

  it("search failed: 'Search unavailable', the hero becomes 'Try again', 'Back to the camera' is withheld, the tag shows", () => {
    const onRetry = vi.fn();
    render(
      <GroceryNameSheet {...base({ query: "durian", hits: [], searchFailed: true, onRetry })} />,
    );
    expect(screen.getByText("Search unavailable — please try again.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back to the camera/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(counterTag()).toBeTruthy();
  });

  it("offline: 'Search needs a connection — or ask at the counter.' with the tag and 'Back to the camera'", () => {
    render(
      <GroceryNameSheet
        {...base({ query: "durian", hits: [], searchFailed: true, online: false })}
      />,
    );
    expect(screen.getByText("Search needs a connection — or ask at the counter.")).toBeTruthy();
    expect(screen.queryByText("Search unavailable — please try again.")).toBeNull();
    expect(screen.getByRole("button", { name: /Back to the camera/ })).toBeTruthy();
    expect(counterTag()).toBeTruthy();
  });

  it("8–14 digits typed: the barcode line, no search state, no tag", () => {
    render(<GroceryNameSheet {...base({ query: "2990000000017", hits: [] })} />);
    expect(
      screen.getByText(
        "That looks like a barcode — search by the item’s name (English or Burmese).",
      ),
    ).toBeTruthy();
    expect(counterTag()).toBeNull();
    expect(screen.queryByRole("button", { name: /Back to the camera/ })).toBeNull();
  });

  it("a refused add (locked / settling) replaces the state line and the sheet stays open", () => {
    render(
      <GroceryNameSheet
        {...base({
          query: "tea",
          hits: [TEA],
          refusal: "Hang on — this basket’s being checked out.",
        })}
      />,
    );
    expect(screen.getByText("Hang on — this basket’s being checked out.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/It’s not you/)).toBeNull();
  });
});

describe("the ONE shared result row (B10 — busy keeps full ink)", () => {
  it("a row adds on tap and shows the catalog's price, name and Burmese", () => {
    const onAddHit = vi.fn();
    render(<GroceryNameSheet {...base({ query: "tea", hits: [TEA], onAddHit })} />);
    const row = screen.getByRole("button", { name: /Tea Leaves -400g/ });
    expect(row.textContent).toContain("$6.44");
    expect(row.querySelector('[lang="my"]')?.textContent).toBe("ဇယန်းလက်ဖက်ချိုနှပ်-400g");
    fireEvent.click(row);
    expect(onAddHit).toHaveBeenCalledWith(TEA);
    expect(counterTag()).toBeNull();
  });

  it("the busy row is aria-busy with the word 'Adding…' — never dimmed; other rows refuse, never natively disabled", () => {
    const onAddHit = vi.fn();
    const other: GroceryHit = { ...TEA, barcode: "2990000000024", name: "Tea Leaves -200g" };
    render(
      <GroceryNameSheet
        {...base({ query: "tea", hits: [TEA, other], addingBarcode: TEA.barcode, onAddHit })}
      />,
    );
    const busy = screen.getByRole("button", { name: /Tea Leaves -400g/ });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.textContent).toContain("Adding…");
    // MUTATION: `style={{ opacity: 0.55 }}` back on the busy row → red.
    expect((busy as HTMLButtonElement).style.opacity).toBe("");
    const idle = screen.getByRole("button", { name: /Tea Leaves -200g/ });
    expect(idle.getAttribute("aria-disabled")).toBe("true");
    expect((idle as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(idle);
    expect(onAddHit).not.toHaveBeenCalled();
  });
});
