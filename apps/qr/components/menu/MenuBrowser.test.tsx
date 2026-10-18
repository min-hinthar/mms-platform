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
/** The cart fields a case overrides — session truth: a HOST at a table, for the leave warning;
 *  lifecycle audit: the cart view's lines and clock, the sold-out marks. */
const cart = vi.hoisted(() => ({ extra: {} as Record<string, unknown> }));
vi.mock("@/components/TableCartProvider", () => ({
  useCart: () => ({
    cartId: null,
    announce,
    refresh: async () => {},
    tableNumber: null,
    role: null,
    members: [],
    me: null,
    ended: null,
    ...cart.extra,
  }),
}));
const none = () => null;
// A MARKER carrying the one prop the lifecycle cases ask about: the sold-out fact the page decided.
vi.mock("@/components/AddButton", () => ({
  AddButton: ({ menuItemId, soldOut }: { menuItemId: string; soldOut?: boolean }) => (
    <span data-add={menuItemId} data-soldout={String(!!soldOut)} />
  ),
}));
vi.mock("@/components/CartBar", () => ({ CartBar: none }));
vi.mock("@/components/GuestList", () => ({ GuestList: none }));
vi.mock("@/components/TableTimeline", () => ({ MenuTimeline: none }));
vi.mock("@/components/MenuTableEnded", () => ({ MenuTableEnded: none }));
// Session truth — the host's durable party is read through a Server Action (stubbed: each call's
// arguments are kept, and `partyAnswer` is what it answers), and the DoorSheet draws nothing but
// keeps its props, so a case can open the leave flow and read the warning it was handed.
const partyCalls: unknown[][] = [];
let partyAnswer: { seats: string[]; current: boolean } | null = null;
vi.mock("@/lib/durable-party", () => ({
  useDurableParty: (...args: unknown[]) => {
    partyCalls.push(args);
    return partyAnswer;
  },
}));
let doorProps: { leaveWarning?: unknown; onOpenChange?: (open: boolean) => void } = {};
vi.mock("@/components/DoorSheet", () => ({
  DoorSheet: (p: typeof doorProps) => {
    doorProps = p;
    return null;
  },
}));
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
  cart.extra = {};
  partyCalls.length = 0;
  partyAnswer = null;
  doorProps = {};
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

  it("the diet count that waits is asked again: unlit filters make it false", async () => {
    // Codex on #355: the count is a quiet claim too, so it waits behind a visible toast; filters
    // unlit (or Clear) inside that window left the provider saying a count nobody now sees.
    render(<Page />);
    await act(() => void fireEvent.click(screen.getByRole("button", { name: "Dietary needs" })));
    const veg = screen.getByRole("button", { name: /^Vegetarian/ });
    await act(() => void fireEvent.click(veg));
    const opts = announce.mock.calls[0]?.[3] as { still?: () => boolean } | undefined;
    expect(announce.mock.calls[0]?.[0]).toBe("1 dish fits.");
    // MUTATION uia11y/f31-diet-count-not-asked-again: red.
    expect(opts!.still!()).toBe(true);
    await act(() => void fireEvent.click(screen.getByRole("button", { name: /^Vegetarian/ })));
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

describe("session truth (finding 5) — the host's leave warning is read when the leave flow OPENS", () => {
  const HOST = {
    cartId: "cart-1",
    role: "host",
    me: { seat: "me", name: "Me" },
    members: [{ seat: "me", name: "Me" }],
  };

  it("Codex round 2 on #361 — opening the door sheet re-reads the durable party, whatever presence says", () => {
    // MUTATION (lcs/leave-flow-never-re-reads): the party is re-read only when presence grows — a
    // tablemate who joined with their phone already face down never shows in presence, and the
    // host's leave goes out under a minutes-old "alone".
    cart.extra = HOST;
    render(<Page />);
    const epochs = () => partyCalls.map((c) => c[2]);
    expect(partyCalls.at(-1)?.slice(0, 2)).toEqual(["cart-1", true]);
    const before = new Set(epochs());
    act(() => doorProps.onOpenChange?.(true));
    const opened = epochs().at(-1);
    expect(before.has(opened)).toBe(false);
    // Closing is not a new ask; opening again is.
    act(() => doorProps.onOpenChange?.(false));
    expect(epochs().at(-1)).toBe(opened);
    act(() => doorProps.onOpenChange?.(true));
    expect(epochs().at(-1)).not.toBe(opened);
  });

  it("while that read is out the warning is HEDGED, never the silence that claims 'alone'; a current 'alone' says nothing", () => {
    cart.extra = HOST;
    partyAnswer = { seats: ["me"], current: false };
    render(<Page />);
    expect(doorProps.leaveWarning).toBe("maybe");
    cleanup();
    partyAnswer = { seats: ["me"], current: true };
    render(<Page />);
    expect(doorProps.leaveWarning).toBeNull();
    cleanup();
    partyAnswer = { seats: ["me", "aye"], current: false };
    render(<Page />);
    expect(doorProps.leaveWarning).toBe("sends");
  });

  it("the blind pass on #361 (B1) — a host held on an ENDED table is given no leave warning, and the party is not read", () => {
    // After a clear or a merge the held session keeps role host and the last good party (the read
    // on the closed session fails and keeps it), so "the others will need a server to send theirs"
    // was drawn under "this table closed". MUTATION (lcs/menu-leave-warning-ignores-the-end).
    cart.extra = { ...HOST, ended: { kind: "ended", why: "cleared" } };
    partyAnswer = { seats: ["me", "aye"], current: true };
    render(<Page />);
    expect(doorProps.leaveWarning).toBeNull();
    // The read is not asked either: it can only fail on the closed session.
    expect(partyCalls.at(-1)?.[1]).toBe(false);
  });

  it("#361 review (2) — a PAID table still SEATED keeps the host's leave warning and its party read; a paid table whose session closed does not", () => {
    // "Start a new order" re-joins the SAME session at a paid, still-seated table, so the host's
    // leave still strands the next round's Send. MUTATION (lcs/menu-paid-seated-silences-the-leave).
    const paid = { kind: "paid", tender: "counter", orderId: null, complete: true };
    cart.extra = { ...HOST, ended: { ...paid, sessionLive: true } };
    partyAnswer = { seats: ["me", "aye"], current: false };
    render(<Page />);
    expect(doorProps.leaveWarning).toBe("sends");
    expect(partyCalls.at(-1)?.[1]).toBe(true);
    cleanup();
    cart.extra = { ...HOST, ended: { ...paid, sessionLive: false } };
    render(<Page />);
    expect(doorProps.leaveWarning).toBeNull();
    expect(partyCalls.at(-1)?.[1]).toBe(false);
  });

  it("the blind pass on #361 (A4) — a presence FLAP never re-reads the party; a seat presence has never seen does", () => {
    // MUTATION (lcs/leave-party-reads-on-every-flap): the epoch keyed on the presence COUNT — a
    // face-down phone dropping out and back fired the durable-party read on every flap.
    cart.extra = HOST;
    const { rerender } = render(<Page />);
    const epochs = () => partyCalls.map((c) => c[2]);
    const first = epochs().at(-1);
    const aye = { seat: "aye", name: "Aye" };
    cart.extra = { ...HOST, members: [...HOST.members, aye] };
    rerender(<Page />);
    const joined = epochs().at(-1);
    expect(joined).not.toBe(first); // a new seat is a reason to ask
    const mark = partyCalls.length;
    cart.extra = HOST; // Aye's phone goes face down…
    rerender(<Page />);
    cart.extra = { ...HOST, members: [...HOST.members, aye] }; // …and comes back
    rerender(<Page />);
    // Every render through the flap asked under the SAME epoch — the read never re-fired.
    expect(new Set(epochs().slice(mark))).toEqual(new Set([joined]));
  });
});

/**
 * Lifecycle audit (out-of-stock 0 · 5) — every surface on the page reads ONE sold-out fact, the
 * FRESHEST this phone holds (`lib/dish-sold-out.ts`): a refusal an add just met flips the card at
 * once, and a fresher cart reading puts a restocked dish back — the render's stale flag no longer
 * outvotes it.
 */
describe("the menu's sold-out fact is the freshest reading", () => {
  const soldOutOf = (id: string) =>
    document.querySelector(`[data-add="${id}"]`)?.getAttribute("data-soldout");

  it("a sold-out refusal's MARK flips the card to Sold out, with no reload", () => {
    // MUTATION (lcb/menu/refusal-mark-ignored): drop the mark — the card stays live under every
    // retry, each meeting the same refusal; red.
    cart.extra = { soldOutMarks: new Map([["m1", Date.parse("2026-10-13T12:00:05Z")]]) };
    render(
      <MenuBrowser
        items={ITEMS}
        mode="dinein"
        usual={{ kind: "none" } as never}
        catalogStamp={Date.parse("2026-10-13T12:00:00Z")}
      />,
    );
    expect(soldOutOf("m1")).toBe("true");
    expect(soldOutOf("t1")).toBe("false");
    expect(screen.getByText("· Sold out")).toBeTruthy();
  });

  it("a FRESHER cart reading puts a restocked dish back, over the render's stale Sold out", () => {
    // MUTATION (lcb/menu/cart-reading-ignored): read only the render — the restocked dish stays dead
    // on /menu while /cart's "+" is live; red.
    const stale = ITEMS.map((i) => (i.id === "m1" ? { ...i, is_sold_out: true } : i));
    cart.extra = {
      items: [{ menuItemId: "m1", soldOut: false, fulfillment: "dinein" }],
      dbNow: "2026-10-13T12:05:00.000Z",
    };
    render(
      <MenuBrowser
        items={stale}
        mode="dinein"
        usual={{ kind: "none" } as never}
        catalogStamp={Date.parse("2026-10-13T12:00:00Z")}
      />,
    );
    expect(soldOutOf("m1")).toBe("false");
    expect(screen.queryByText("· Sold out")).toBeNull();
  });
});
