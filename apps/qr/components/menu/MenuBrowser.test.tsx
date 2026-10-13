/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItem } from "./MenuBrowser";

/**
 * F31 — /menu has ONE live region: the cart provider's Toast (`announce`). Two extra `role="status"`
 * regions lived inside it — the "Nothing matches" card and the diet sheet's count line — against QA
 * §A's one-region rule, and the card's was born WITH its text, which several readers skip. Both now
 * speak through `announce` as a QUIET claim (spoken, not drawn: the words are already on screen
 * where the diner acted), on a CHANGE only.
 *
 * The browser is real and its DietFilterButton is real (the sheet is the real Radix dialog); every
 * other child is a stub that draws nothing, and the provider is ONE mocked hook whose `announce` is
 * the spy — the region itself is the provider's, pinned by its own suite.
 */
const announce = vi.fn();
vi.mock("@/components/TableCartProvider", () => ({
  useCart: () => ({ cartId: null, announce, refresh: async () => {}, tableNumber: null }),
}));
const none = () => null;
vi.mock("@/components/AddButton", () => ({ AddButton: none }));
vi.mock("@/components/CartBar", () => ({ CartBar: none }));
vi.mock("@/components/GuestList", () => ({ GuestList: none }));
vi.mock("@/components/TableTimeline", () => ({ MenuTimeline: none }));
vi.mock("@/components/DoorSheet", () => ({ DoorSheet: none }));
vi.mock("@/components/PullToRefresh", () => ({ PullToRefresh: none }));
vi.mock("@/components/PaperAmbient", () => ({ PaperAmbient: none }));
vi.mock("./BlurUpImage", () => ({ BlurUpImage: none }));
vi.mock("./PhotoPlaceholder", () => ({ PhotoPlaceholder: none }));
vi.mock("./ItemSheet", () => ({ ItemSheet: none }));
vi.mock("./ArrivalBeat", () => ({ ArrivalBeat: none }));
vi.mock("./YourUsual", () => ({ YourUsual: none }));
vi.mock("./PicksRow", () => ({ PicksRow: none }));
vi.mock("@/lib/favorites", () => ({ toggleFavorite: async () => null }));
vi.mock("@/lib/reorder", () => ({ reorderOrder: async () => ({ ok: false }) }));

const { MenuBrowser } = await import("./MenuBrowser");

const item = (id: string, name: string, category: string, tags: string[]): MenuItem => ({
  id,
  slug: id,
  name_en: name,
  name_my: null,
  description_en: null,
  description_my: null,
  base_price_cents: 1200,
  image_url: null,
  is_sold_out: false,
  tags,
  allergens: [],
  category,
  modifierGroups: [],
});
/** Two dishes: one vegetarian, one not — so "Vegan" empties the list and "Vegetarian" does not. */
const ITEMS: MenuItem[] = [
  item("m1", "Mohinga", "Noodles", []),
  item("t1", "Tea Leaf Salad", "Salads", ["vegetarian"]),
];
const EMPTY_SPOKEN = "Nothing matches. Try fewer filters or a different search.";
const QUIET_CLAIM = { quiet: true, kind: "claim" };

function Page({ items = ITEMS, children }: { items?: MenuItem[]; children?: ReactNode }) {
  return (
    <main>
      <MenuBrowser items={items} mode="dinein" usual={{ kind: "none" } as never} />
      {children}
    </main>
  );
}
/** Every live region the BROWSER draws (the provider's Toast is not rendered here — it is mocked). */
const regions = () =>
  document.querySelectorAll('[role="status"], [role="alert"], [role="log"], [aria-live]');
const search = () => screen.getByRole("searchbox", { name: "Search the menu" });
const type = (v: string) => act(() => void fireEvent.change(search(), { target: { value: v } }));
/** What was said and on what terms (`still`, the re-ask a waiting line gets, is checked on its own). */
const spoken = () =>
  announce.mock.calls.map((c) => {
    const o = c[3] as { quiet?: boolean; kind?: string } | undefined;
    return [c[0], o && { quiet: o.quiet, kind: o.kind }];
  });

beforeEach(() => {
  announce.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  // The diet sheet's pill rail (`Rail`) measures its overflow with a ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
  Element.prototype.scrollTo = function () {};
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("F31 — /menu speaks through ONE region", () => {
  it("the browser draws no live region of its own — not at arrival, not on the empty card", async () => {
    render(<Page />);
    expect(regions()).toHaveLength(0);
    await type("zzz");
    expect(screen.getByText("Nothing matches")).toBeTruthy();
    // MUTATION (the shipped defect): the empty card's `role="status"` back; red.
    expect(regions()).toHaveLength(0);
  });

  it("a search that empties the list is said ONCE, as a quiet claim, in the card's own words", async () => {
    render(<Page />);
    expect(announce).not.toHaveBeenCalled(); // never at arrival
    await type("z");
    expect(spoken()).toEqual([[EMPTY_SPOKEN, QUIET_CLAIM]]);
    // Still empty: a further letter says nothing new.
    await type("zz");
    expect(announce).toHaveBeenCalledTimes(1);
    // Back to a list, then empty again: a new transition, a new sentence.
    await type("");
    await type("q");
    expect(spoken()).toEqual([
      [EMPTY_SPOKEN, QUIET_CLAIM],
      [EMPTY_SPOKEN, QUIET_CLAIM],
    ]);
  });

  it("a line that waits is asked again: once the list has filled up, the empty claim is no longer true", async () => {
    // Blind pass on #355: the quiet claim waits behind a visible toast (the freshness news, a
    // tablemate's add). The diner corrected the search inside that window and the provider said
    // "Nothing matches" over the dishes now on screen. `still` is what the provider re-asks.
    render(<Page />);
    await type("z");
    const opts = announce.mock.calls[0]?.[3] as { still?: () => boolean } | undefined;
    // The shipped defect — no `still` on the claim, so the provider cannot drop it: red.
    expect(typeof opts?.still).toBe("function");
    expect(opts!.still!()).toBe(true);
    await type("");
    expect(opts!.still!()).toBe(false);
  });

  it("a catalog that changes UNDER an empty search says nothing new (the refresh speaks for itself)", async () => {
    const r = render(<Page />);
    await type("q");
    expect(announce).toHaveBeenCalledTimes(1);
    // A refresh lands a third dish that still does not match: the card was already said.
    r.rerender(<Page items={[...ITEMS, item("s1", "Shan Noodles", "Noodles", [])]} />);
    await act(async () => {});
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("the diet sheet draws its count as plain text and SPEAKS each change through the same region", async () => {
    render(<Page />);
    await act(() => void fireEvent.click(screen.getByRole("button", { name: "Dietary needs" })));
    const dialog = screen.getByRole("dialog");
    // Opening says nothing (the dialog is read on arrival); no region inside the sheet either.
    expect(announce).not.toHaveBeenCalled();
    expect(dialog.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0);
    // A toggle that keeps a dish: the count is drawn AND spoken, once.
    const veg = screen.getByRole("button", { name: /^Vegetarian/ });
    veg.focus();
    await act(() => void fireEvent.click(veg));
    expect(screen.getByText("1 dish fits.")).toBeTruthy();
    expect(spoken()).toEqual([["1 dish fits.", QUIET_CLAIM]]);
    // A toggle that EMPTIES the list, made from inside the dialog: the sheet's sentence is the one
    // voice — the page's "Nothing matches" stays unsaid (one toggle, one sentence).
    const vegan = screen.getByRole("button", { name: /^Vegan/ });
    vegan.focus();
    await act(() => void fireEvent.click(vegan));
    expect(spoken()).toEqual([
      ["1 dish fits.", QUIET_CLAIM],
      ["Nothing on the menu fits these filters — ease one.", QUIET_CLAIM],
    ]);
    expect(dialog.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0);
    // Close and re-open with the filters still lit: the sheet ARRIVES with its sentence on screen,
    // and arrival is read with the dialog — nothing goes to the region.
    await act(() => void fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    announce.mockClear();
    await act(
      () => void fireEvent.click(screen.getByRole("button", { name: "Dietary needs, 2 active" })),
    );
    expect(screen.getByText("Nothing on the menu fits these filters — ease one.")).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });
});
