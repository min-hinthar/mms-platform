/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GroceryHit } from "@/lib/grocery";
import { nextRefusal } from "@/lib/sheet-refusal";
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
    // The state line is the MODAL's own live region (blind pass on #329): the page toast sits
    // behind the keyboard, so every dead end is announced HERE, once.
    expect(screen.getByRole("status").id).toBe("name-state");
  });

  it("just opened from a camera PANEL (no miss): the coaching only — no coverage claim about a code nobody scanned", () => {
    render(<GroceryNameSheet {...base({ miss: null })} />);
    expect(screen.queryByText(/It’s not you/)).toBeNull();
    expect(screen.getByText(/One word from the name is enough/)).toBeTruthy();
    expect(counterTag()).toBeNull();
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

  it("no match, from a camera PANEL (no miss): 'Try one word…' only — no 'It’s not you', no camera hero, no tag (B6)", () => {
    // MUTATION: draw the tag whenever the state is a dead end → a claim about a code that was
    // never scanned, held up for Dad; red. MUTATION: say "It’s not you — most shelf codes…" to a
    // camera-denied shopper who scanned nothing; red.
    render(<GroceryNameSheet {...base({ query: "durian", hits: [], miss: null })} />);
    expect(screen.getByText("Try one word from the name — or ask at the counter.")).toBeTruthy();
    expect(screen.queryByText(/It’s not you/)).toBeNull();
    expect(screen.queryByText(/Keep scanning/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Back to the camera/ })).toBeNull();
    expect(counterTag()).toBeNull();
    // The ✕ is the way back.
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("the refusal the page routes here is announced by the sheet's own status region", () => {
    render(
      <GroceryNameSheet
        {...base({ refusal: nextRefusal(null, "Couldn’t add that — check your connection.") })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Couldn’t add that — check your connection.",
    );
  });

  it("an IDENTICAL refusal again arrives as a NEW node — the live region re-announces it", () => {
    // Blind pass 2 on #329. MUTATION: the sentence's node not keyed on the refusal → the same text
    // in the same node changes no DOM, and a screen reader hears the second refusal as nothing; red.
    const first = nextRefusal(null, "Hang on — this basket’s being checked out.");
    const { rerender } = render(<GroceryNameSheet {...base({ refusal: first })} />);
    const before = screen.getByText("Hang on — this basket’s being checked out.");
    rerender(
      <GroceryNameSheet
        {...base({ refusal: nextRefusal(first, "Hang on — this basket’s being checked out.") })}
      />,
    );
    const after = screen.getByText("Hang on — this basket’s being checked out.");
    expect(after).not.toBe(before);
    expect(before.isConnected).toBe(false);
  });

  it("a refusal keeps its Burmese half, marked lang=my", () => {
    // MUTATION: drop the `my` span → the sheet says the English half only; red.
    render(
      <GroceryNameSheet
        {...base({
          refusal: nextRefusal(null, "Saved — we’ll check it when you’re back online.", "မြန်မာ"),
        })}
      />,
    );
    expect(screen.getByText("မြန်မာ").getAttribute("lang")).toBe("my");
  });

  it("a SENT search that failed: 'Search unavailable', the hero becomes 'Try again', 'Back to the camera' is withheld, the tag shows", () => {
    // Only a lookup that was sent and failed produces these props. A query the radio HELD (typed
    // offline) never sets `searchFailed` — see the reconnect case below (lib/hooks/useNameSearch).
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

  it("the radio BACK with a held query (the blind pass on #329 @ f0d013f): 'Searching…' — never 'Search unavailable', never the 'Try again' hero", () => {
    // What the page passes in that render: nothing failed (nothing was sent), the query on its way
    // (`nameSearchPending`), the rows still empty.
    render(
      <GroceryNameSheet
        {...base({ query: "durian", hits: [], searchFailed: false, searching: true, online: true })}
      />,
    );
    expect(screen.getByText(/Searching/)).toBeTruthy();
    expect(screen.queryByText("Search unavailable — please try again.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
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

  it("OFFLINE AT ONCE: a fresh query with the radio down says so — never 'Searching…' (Codex on #329's head ff29547)", () => {
    // A keystroke resets the hits to null, so the old predicate (a completed empty result) showed
    // "Searching…" until the network gave up. MUTATION: `searching` checked before `offline` in
    // the state line → "Searching…" over a radio known to be down; red.
    render(
      <GroceryNameSheet
        {...base({ query: "durian", hits: null, searching: true, online: false })}
      />,
    );
    expect(screen.getByText("Search needs a connection — or ask at the counter.")).toBeTruthy();
    expect(screen.queryByText(/Searching/)).toBeNull();
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
          refusal: nextRefusal(null, "Hang on — this basket’s being checked out."),
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
