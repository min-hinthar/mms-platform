/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { GroceryCatalogItem, GroceryLine } from "@/lib/grocery";

/**
 * Phase 1c — Browse's WIRING: the extracted card (pinned byte-for-byte BEFORE the extraction, against
 * the inlined card it replaced), the hash-driven aisle view and its history writes, and the catalog
 * failure's announcement + recovery. Decisions are pure and pinned in lib/grocery-view.test.ts and
 * lib/grocery-aisles.test.ts. Each MUTATION was induced and watched go red.
 */

const h = vi.hoisted(() => ({
  catalog: vi.fn<() => Promise<GroceryCatalogItem[]>>(),
  // STABLE, like the real hook's useCallback — a fresh identity per render would re-run the read.
  diagnose: async () => "unknown" as const,
}));
vi.mock("@/lib/grocery", () => ({ getGroceryCatalog: h.catalog }));
vi.mock("@/lib/grocery-catalog-cache", () => ({ saveCatalogCache: () => {} }));
vi.mock("@/lib/useConnectionTruth", () => ({
  useConnectionTruth: () => ({ truth: "unknown", diagnose: h.diagnose }),
}));
// The detail sheet is its own surface (Radix); Browse only feeds it.
vi.mock("@/components/grocery/GroceryItemSheet", () => ({ GroceryItemSheet: () => null }));

const { GroceryBrowse } = await import("./GroceryBrowse");

const item = (p: Partial<GroceryCatalogItem> & { barcode: string; name: string }) =>
  ({
    nameMy: null,
    brand: null,
    category: "cooking",
    sizeQty: null,
    sizeUnit: null,
    priceCents: 499,
    compareAtCents: null,
    featuredDeal: false,
    ebt: false,
    imageUrl: null,
    ...p,
  }) satisfies GroceryCatalogItem;

/** One card of each anatomy the name composition branches on. */
const PIN: GroceryCatalogItem[] = [
  item({
    barcode: "2990000000011",
    name: "Fish Sauce",
    nameMy: "ငံပြာရည်",
    brand: "Squid",
    sizeQty: 700,
    sizeUnit: "ml",
    priceCents: 349,
    compareAtCents: 499,
    featuredDeal: true,
    ebt: true,
  }),
  item({
    barcode: "2990000000028",
    name: "Garlic Oil",
    brand: "Mandalay",
    priceCents: 650,
    compareAtCents: 800,
  }),
  item({ barcode: "2990000000035", name: "Rice Flour", sizeQty: 400, sizeUnit: "g", ebt: true }),
  item({ barcode: "2990000000042", name: "Tamarind", priceCents: 275 }),
];

const line = (barcode: string, name: string, qty: number): GroceryLine => ({
  lineId: `line-${barcode}`,
  barcode,
  name,
  qty,
  unitPriceCents: 275,
  compareAtCents: null,
  ebt: false,
  imageUrl: null,
});

beforeEach(() => {
  window.history.replaceState({ __NA: true }, "", "/grocery");
  vi.stubGlobal(
    "matchMedia",
    (q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal("scrollTo", () => {});
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  h.catalog.mockReset();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

type Props = Parameters<typeof GroceryBrowse>[0];
function mount(over: Partial<Props> = {}) {
  const props = {
    lines: [],
    canAdd: true,
    addingBarcode: null,
    busyLineId: null,
    onAdd: vi.fn(),
    onStep: vi.fn(),
    active: true,
    onAnnounce: vi.fn(),
    onAislePop: vi.fn(),
    ...over,
  } as Props;
  const view = render(<GroceryBrowse {...props} />);
  return {
    ...view,
    props,
    rerender: (p: Partial<Props>) => view.rerender(<GroceryBrowse {...props} {...p} />),
  };
}

describe("the grocery card — pinned against the inlined card BEFORE the extraction", () => {
  it("composes each card's accessible name byte-for-byte", async () => {
    h.catalog.mockResolvedValue(PIN);
    mount();
    await flush();
    // Captured from the pre-extraction GroceryBrowse (the W9d sale gate: only a FEATURED deal says
    // "save N%"; an ordinary discount says only "compare at"). Pasted from that run, not typed.
    expect(
      PIN.map((i) =>
        screen
          .getByRole("button", { name: new RegExp(`^${i.name}\\b.*view details$`) })
          .getAttribute("aria-label"),
      ),
    ).toEqual([
      "Fish Sauce, Squid · 700ml, $3.49, featured deal, compare at $4.99, save 30%, $0.50/100ml, EBT eligible — view details",
      "Garlic Oil, Mandalay, $6.50, compare at $8.00 — view details",
      "Rice Flour, 400g, $4.99, $1.25/100g, EBT eligible — view details",
      "Tamarind, $2.75 — view details",
    ]);
  });

  it("keeps the W9d sale gate: the loud pill only on a featured deal, the quiet strike on every sale", async () => {
    h.catalog.mockResolvedValue(PIN);
    const v = mount();
    await flush();
    const pills = [...v.container.querySelectorAll(".gcard-sale")].map((n) => n.textContent);
    const strikes = [...v.container.querySelectorAll(".gcard-compare")].map((n) => n.textContent);
    expect({ pills, strikes }).toEqual({
      pills: ["Save 30%"],
      strikes: ["Compare at $4.99", "Compare at $8.00"],
    });
  });

  it("offers the FAB when not carted and the stepper when carted, with the same names", async () => {
    h.catalog.mockResolvedValue(PIN);
    const v = mount({ lines: [line("2990000000042", "Tamarind", 2)], canAdd: false });
    await flush();
    const fabs = [...v.container.querySelectorAll(".gcard-fab")].map((b) => [
      b.getAttribute("aria-label"),
      b.getAttribute("aria-disabled"),
    ]);
    const group = screen.getByRole("group", { name: "Tamarind quantity" });
    const steps = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect({ fabs, steps }).toEqual({
      fabs: [
        ["Add Fish Sauce to basket — $3.49", "true"],
        ["Add Garlic Oil to basket — $6.50", "true"],
        ["Add Rice Flour to basket — $4.99", "true"],
      ],
      steps: ["One less Tamarind", "One more Tamarind"],
    });
  });

  it("hands focus from a card's Add to its new stepper's + (MED-1)", async () => {
    h.catalog.mockResolvedValue(PIN);
    const v = mount();
    await flush();
    const fab = screen.getByRole("button", { name: "Add Tamarind to basket — $2.75" });
    fireEvent.click(fab);
    expect(v.props.onAdd).toHaveBeenCalledWith(PIN[3]);
    v.rerender({ lines: [line("2990000000042", "Tamarind", 1)] });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "One more Tamarind" }));
  });

  it("a REFUSED add never arms the handoff (a later cart of that item must not steal focus)", async () => {
    h.catalog.mockResolvedValue(PIN);
    const v = mount({ canAdd: false });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Add Tamarind to basket — $2.75" }));
    v.rerender({ canAdd: true, lines: [line("2990000000042", "Tamarind", 1)] });
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "One more Tamarind" }),
    );
  });
});

// ── the market home + the aisle view ────────────────────────────────────────────────────────────
/** Seven in cooking (one more than a shelf shows), two in health. Catalog order = name A→Z. */
const MARKET: GroceryCatalogItem[] = [
  ...["Anchovy", "Basil", "Chili", "Dal", "Egg Noodles", "Fish Sauce", "Garlic"].map((name, i) =>
    item({ barcode: `29910000000${i}`, name, category: "cooking" }),
  ),
  ...["Ginseng", "Honey"].map((name, i) =>
    item({ barcode: `29920000000${i}`, name, category: "health" }),
  ),
];
const inAisle = (slug: string) => MARKET.filter((i) => i.category === slug);

async function market(over: Partial<Props> = {}) {
  h.catalog.mockResolvedValue(MARKET);
  const v = mount(over);
  await flush();
  return v;
}
const chip = (name: RegExp) =>
  within(screen.getByRole("navigation", { name: "Aisles" })).getByRole("link", { name });

describe("the market home — a shelf of six per aisle", () => {
  it("shows the first six in catalog order and a See all only when there are more", async () => {
    await market();
    const cooking = screen.getByRole("list", { name: /Cooking Essentials/ });
    expect(within(cooking).getAllByRole("listitem")).toHaveLength(6);
    const seeAll = screen.getByRole("link", {
      name: `See all ${inAisle("cooking").length} in Cooking Essentials`,
    });
    expect(seeAll.getAttribute("href")).toBe("#aisle-cooking");
    // Health holds fewer than a shelf: a plain count, no link.
    expect(screen.queryByRole("link", { name: /See all .* in Health/ })).toBeNull();
    expect(screen.getByText(`${inAisle("health").length} items`)).toBeTruthy();
  });

  it("the current chip carries aria-current, and no chip is a pressed toggle", async () => {
    // MUTATION: keep `aria-pressed` on the chips → red (and the CSS pin below goes with it).
    const v = await market();
    expect(chip(/All aisles/).getAttribute("aria-current")).toBe("true");
    expect(v.container.querySelector(".aisle-tile[aria-pressed]")).toBeNull();
    fireEvent.click(chip(/Cooking Essentials/));
    await flush();
    expect(chip(/Cooking Essentials/).getAttribute("aria-current")).toBe("true");
    expect(chip(/All aisles/).getAttribute("aria-current")).toBeNull();
  });
});

describe("the aisle view lives in history", () => {
  it("a chip from home PUSHES, keeping Next's state and marking the entry ours", async () => {
    // MUTATION: pass a null state → Next's `__NA` is lost (its patched history no longer bails); red.
    const push = vi.spyOn(window.history, "pushState");
    await market();
    fireEvent.click(chip(/Cooking Essentials/));
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toEqual({ __NA: true, mmsAisle: true });
    expect(push.mock.calls[0]![2]).toBe("/grocery#aisle-cooking");
  });

  it("focuses the aisle view's heading on entry", async () => {
    await market();
    fireEvent.click(screen.getByRole("link", { name: /See all \d+ in Cooking Essentials/ }));
    await flush();
    const title = screen.getByRole("heading", { level: 2, name: /Cooking Essentials/ });
    expect(title.id).toBe("aisle-view-title");
    expect(document.activeElement).toBe(title);
    // …and it holds the whole aisle, not the shelf's six.
    const grid = screen.getByRole("list", { name: /Cooking Essentials/ });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(inAisle("cooking").length);
  });

  it("a lateral chip REPLACES, so Back lands on the market home", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    await market();
    fireEvent.click(chip(/Cooking Essentials/));
    await flush();
    fireEvent.click(chip(/Health & Nutrition/));
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls.at(-1)![2]).toBe("/grocery#aisle-health");
  });

  it("'All aisles' walks BACK over an entry we pushed", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await market();
    fireEvent.click(chip(/Cooking Essentials/));
    await flush();
    fireEvent.click(chip(/All aisles/));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("'All aisles' REPLACES on a deep-linked aisle (Back would leave /grocery)", async () => {
    window.history.replaceState({ __NA: true }, "", "/grocery#aisle-cooking");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    await market();
    expect(chip(/Cooking Essentials/).getAttribute("aria-current")).toBe("true");
    fireEvent.click(chip(/All aisles/));
    await flush();
    expect(back).not.toHaveBeenCalled();
    expect(replace.mock.calls.at(-1)![2]).toBe("/grocery");
    expect(chip(/All aisles/).getAttribute("aria-current")).toBe("true");
  });

  it("a pop off an aisle while Scan shows asks the page for Browse", async () => {
    window.history.replaceState({ __NA: true }, "", "/grocery#aisle-cooking");
    const v = await market({ active: false });
    window.history.replaceState({ __NA: true }, "", "/grocery");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    expect(v.props.onAislePop).toHaveBeenCalledTimes(1);
    expect(chip(/All aisles/).getAttribute("aria-current")).toBe("true");
  });

  it("an unstocked #aisle hash is replaced away, never a dead end", async () => {
    window.history.replaceState({ __NA: true }, "", "/grocery#aisle-snacks-sweets");
    await market();
    expect(window.location.hash).toBe("");
    expect(chip(/All aisles/).getAttribute("aria-current")).toBe("true");
  });
});

describe("a failed catalog — announced once, recoverable in place", () => {
  it("announces through the page's channel only while Browse shows, and adds no alert", async () => {
    h.catalog.mockRejectedValue(new Error("down"));
    const v = mount({ active: true });
    await flush();
    expect(v.props.onAnnounce).toHaveBeenCalledTimes(1);
    expect(v.container.querySelector('[role="alert"]')).toBeNull();
    cleanup();
    const hidden = mount({ active: false });
    await flush();
    expect(hidden.props.onAnnounce).not.toHaveBeenCalled();
  });

  it("Retry stays mounted and busy, and keeps focus through a second failure", async () => {
    h.catalog.mockRejectedValue(new Error("down"));
    const v = mount();
    await flush();
    const retry = screen.getByRole("button", { name: /Retry/ });
    retry.focus();
    let release: (items: GroceryCatalogItem[]) => void = () => {};
    h.catalog.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("again")), 0)),
    );
    fireEvent.click(retry);
    expect(retry.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    await flush();
    expect(screen.getByRole("button", { name: /Retry/ })).toBe(retry);
    expect(document.activeElement).toBe(retry);
    expect(v.props.onAnnounce).toHaveBeenCalledTimes(2);
    // …and a success lands focus on the rail's "All aisles", never <body>.
    h.catalog.mockImplementationOnce(() => new Promise((r) => (release = r)));
    fireEvent.click(retry);
    await act(async () => {
      release(MARKET);
    });
    await flush();
    expect(document.activeElement).toBe(chip(/All aisles/));
  });
});

describe("the lit cap moved with the attribute (CSS)", () => {
  it("the selected-chip rule keys on aria-current, and no aisle-tile rule keys on aria-pressed", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const lit = rules.filter((m) =>
      m[1]!.split(",").some((s) => s.trim() === '.aisle-tile[aria-current="true"]'),
    );
    expect(lit.map((m) => /background:\s*var\(--ac\)/.test(m[2]!))).toEqual([true]);
    expect(rules.some((m) => /\.aisle-tile\[aria-pressed/.test(m[1]!))).toBe(false);
  });
});
