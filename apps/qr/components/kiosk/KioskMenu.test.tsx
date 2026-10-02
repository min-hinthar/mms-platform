/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import { cssDeclarations } from "@/lib/css-declarations";
import { t } from "@/lib/kiosk/strings";
import type { KioskItem } from "./types";

/**
 * Phase 2h (P2cz) — the kiosk's add, on an UNATTENDED screen. The options sheet's busy is state
 * cleared in a finally around a BOUNDED add, never a transition's `pending`: on a stuck connection
 * the sheet frees at STAFF_HANG_MS and says `addWaiting`, the late answer is applied when it comes
 * (a late ok moves the "View order" count — the one thing that sentence promises), a re-add of the
 * waiting dish is refused, and a thrown add sends the guest to the counter (`addUnknown`).
 *
 * `addItem` is a Server Action — mocked; a hang is a promise the case controls.
 */
const addItem = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/cart", () => ({ addItem: (...a: unknown[]) => addItem(...a) }));
vi.mock("next/image", () => ({ default: () => null }));

/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };

const { KioskMenu } = await import("./KioskMenu");

const hanging: Array<() => void> = [];
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
/** Settled once the tree is gone: a pre-fix transition left pending must never entangle the next. */
function hang() {
  const d = deferred<unknown>();
  hanging.push(() => d.resolve({}));
  return d;
}

afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await act(async () => {
    for (const end of hanging.splice(0)) end();
  });
  vi.clearAllMocks();
});

const item = (over: Partial<KioskItem> & { id: string }): KioskItem => ({
  nameEn: over.id,
  nameMy: null,
  priceCents: 1200,
  imageUrl: null,
  soldOut: false,
  category: "Noodles",
  tags: [],
  groups: [],
  ...over,
});
const MOHINGA = item({ id: "m1", nameEn: "Mohinga" });
const CURRY = item({
  id: "m2",
  nameEn: "Beef Curry",
  groups: [
    {
      id: "g1",
      slug: "style",
      name: "Style",
      nameMy: null,
      selectionType: "single",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "o1", slug: "dry", name: "Dry", nameMy: null, priceDeltaCents: 0, allergens: [] },
      ],
    },
  ],
});

function mount(cartId = "c1") {
  const onAdded = vi.fn();
  render(
    <KioskMenu
      lang="en"
      cartId={cartId}
      items={[MOHINGA, CURRY]}
      categories={["Noodles"]}
      count={0}
      onAdded={onAdded}
      onReview={() => {}}
    />,
  );
  return { onAdded };
}
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
/** Did the region's content change in the DOM (a new node, or new text) since the call? */
function watchRegion(node: Element) {
  const recs: MutationRecord[] = [];
  const obs = new MutationObserver((rs) => {
    recs.push(...rs);
  });
  obs.observe(node, { childList: true, subtree: true, characterData: true });
  return () => {
    recs.push(...obs.takeRecords());
    obs.disconnect();
    return recs.some(
      (r) => r.type === "characterData" || (r.type === "childList" && r.addedNodes.length > 0),
    );
  };
}
const tile = (name: RegExp) => screen.getByRole("button", { name });
const pageStatus = () => document.querySelector<HTMLElement>('.kiosk-screen [role="status"]')!;
async function openCurrySheet() {
  await act(async () => {
    fireEvent.click(tile(/Beef Curry/));
  });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
  const addBtn = () =>
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.includes("$12.00") || b.getAttribute("aria-busy") === "true",
    )!;
  const closeX = () =>
    within(dialog).getByRole("button", { name: (n) => n === "Close" || n.startsWith("Close —") });
  const sheetLine = () => dialog.querySelector<HTMLElement>('[role="status"]')!;
  return { dialog, addBtn, closeX, sheetLine };
}

describe("KioskMenu — a stuck add never traps the guest (Phase 2h · 9a · 9e)", () => {
  it("no answer at STAFF_HANG_MS: the options sheet frees (✕ live, Add not busy) and says it is still adding", async () => {
    vi.useFakeTimers();
    addItem.mockReturnValueOnce(hang().promise);
    mount();
    const { addBtn, closeX, sheetLine } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    expect(addBtn().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    expect(addBtn().getAttribute("aria-busy")).toBe("true");
    await advance(1);
    // MUTATION (p2h-sheets/kiosk/busy-never-clears): a guest at an unattended screen is stuck behind
    // a sheet nothing will ever free; red.
    expect(addBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-sheets/kiosk/waiting-said-as-something-wrong): "Something went wrong — please
    // order at the counter" over an add that may still land; red. MUTATION
    // (p2h-sheets/kiosk/say-ignores-the-sheet): said to the page region behind the scrim; red.
    expect(sheetLine().textContent).toBe(t("en", "addWaiting"));
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging — the sheet still frees at the bound", async () => {
    vi.useFakeTimers();
    const other = hang();
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    addItem.mockReturnValueOnce(hang().promise);
    mount();
    const { addBtn, closeX } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await advance(STAFF_HANG_MS);
    expect(addBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE ok moves the count (onAdded) and closes its sheet — the promise `addWaiting` makes is kept", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    addItem.mockReturnValueOnce(late.promise);
    const { onAdded } = mount();
    const { addBtn, sheetLine } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await advance(STAFF_HANG_MS);
    expect(sheetLine().textContent).toBe(t("en", "addWaiting"));
    expect(onAdded).not.toHaveBeenCalled();
    await act(async () => {
      late.resolve({});
    });
    // MUTATION (p2h-sheets/kiosk/late-ok-never-counted): the dish is on the order and "View order"
    // never goes up — the guest re-adds it, or walks away; red.
    expect(onAdded).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pageStatus().textContent).toContain("Beef Curry");
  });

  it("a LATE ok after the guest closed the sheet still counts; a direct add's late throw says ask at the counter", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    addItem.mockReturnValueOnce(late.promise);
    const { onAdded } = mount();
    const { addBtn, closeX } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await advance(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.click(closeX());
    });
    await act(async () => {
      late.resolve({});
    });
    expect(onAdded).toHaveBeenCalledWith(1);
    const lost = deferred<unknown>();
    addItem.mockReturnValueOnce(lost.promise);
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    await advance(STAFF_HANG_MS);
    // MUTATION (p2h-sheets/kiosk/say-ignores-the-page): with no sheet open, said nowhere; red.
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
    await act(async () => {
      lost.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/kiosk/late-throw-unsaid): "Still adding that" stands for good; red.
    expect(pageStatus().textContent).toBe(t("en", "addUnknown"));
    expect(onAdded).toHaveBeenCalledTimes(1);
    // The wait is over: the dish can be added again (the guest asked at the counter first).
    addItem.mockResolvedValueOnce({});
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    // MUTATION (p2h-sheets/kiosk/waiting-never-cleared): the dish stays refused for good; red.
    expect(addItem).toHaveBeenCalledTimes(3);
    expect(onAdded).toHaveBeenCalledTimes(2);
  });

  it("a THROWN add may have gone on: ask at the counter before a re-add — never 'Something went wrong'", async () => {
    vi.useFakeTimers();
    addItem.mockRejectedValueOnce(new Error("fetch failed"));
    mount();
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    // MUTATION (p2h-sheets/kiosk/threw-said-as-something-wrong): red.
    expect(pageStatus().textContent).toBe(t("en", "addUnknown"));
  });

  it("a re-add of the dish still waiting is REFUSED, never sent — the same sentence again", async () => {
    vi.useFakeTimers();
    addItem.mockReturnValueOnce(hang().promise);
    mount();
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    await advance(STAFF_HANG_MS);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    // MUTATION (p2h-sheets/kiosk/retap-adds-twice): two bowls when both land; red.
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
  });

  it("review c (C5) — closing the sheet while its add waits MOVES 'Still adding that' to the page; it never drops", async () => {
    vi.useFakeTimers();
    // An older line on the page first: a different dish that was added.
    addItem.mockResolvedValueOnce({});
    mount();
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    expect(pageStatus().textContent).toContain("Mohinga");
    addItem.mockReturnValueOnce(hang().promise);
    const { addBtn, closeX, sheetLine } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await advance(STAFF_HANG_MS);
    expect(sheetLine().textContent).toBe(t("en", "addWaiting"));
    await act(async () => {
      fireEvent.click(closeX());
    });
    // MUTATION (p2h-rev-c/kiosk-close-drops-waiting): the line leaves with the sheet and the page
    // keeps "Added · Mohinga" — the guest, told nothing, adds the curry again; red.
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
  });

  it("review c (C5) — a re-tap of a waiting dish RE-SAYS the line (a new node), on the page and in the sheet — never a dead tap", async () => {
    vi.useFakeTimers();
    addItem.mockReturnValueOnce(hang().promise);
    mount();
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    await advance(STAFF_HANG_MS);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
    const pageSaid = watchRegion(pageStatus());
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-rev-c/kiosk-page-resay-unkeyed): equal text re-rendered in place is no DOM
    // change — nothing announced, nothing seen; red.
    expect(pageSaid()).toBe(true);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));

    addItem.mockReturnValueOnce(hang().promise);
    const { addBtn, sheetLine } = await openCurrySheet();
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await advance(STAFF_HANG_MS);
    expect(sheetLine().textContent).toBe(t("en", "addWaiting"));
    const sheetSaid = watchRegion(sheetLine());
    await act(async () => {
      fireEvent.click(addBtn());
    });
    expect(addItem).toHaveBeenCalledTimes(2);
    // MUTATION (p2h-rev-c/kiosk-sheet-resay-unkeyed): the sheet's region re-renders the same text
    // in place — the Add tap reads as dead; red.
    expect(sheetSaid()).toBe(true);
    expect(sheetLine().textContent).toBe(t("en", "addWaiting"));
  });

  it("a tapped tile keeps FOCUS while its add is out — refused by aria-disabled and the handler, never a native `disabled` that drops focus to <body> (critic F7)", async () => {
    vi.useFakeTimers();
    addItem.mockReturnValueOnce(hang().promise);
    mount();
    const mohinga = tile(/Mohinga/);
    mohinga.focus();
    await act(async () => {
      fireEvent.click(mohinga);
    });
    // MUTATION (p2h-sheets/kiosk/tiles-native-disabled): the focused tile goes native-disabled and
    // focus falls to <body> for up to 15 s; red.
    expect(mohinga.hasAttribute("disabled")).toBe(false);
    expect(mohinga.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(mohinga);
    // The dim, the resting cursor and the stilled press come from ONE place — the stylesheet's
    // `[aria-disabled="true"]` rule (pinned below). MUTATION (p2h-int-c/kiosk/inline-dim-back): a
    // second, inline copy that the next edit of either drifts from; red.
    expect(mohinga.style.opacity).toBe("");
    expect(mohinga.style.cursor).toBe("");
    expect(mohinga.style.transform).toBe("");
    expect(mohinga.hasAttribute("data-sold-out")).toBe(false); // busy, not sold out
    // The refusal is the handler's: another dish tapped mid-add is not sent.
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    // MUTATION (p2h-sheets/kiosk/busy-tile-tap-runs): with the attribute only, the tap still opens
    // the sheet; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  it("a sold-out tile is refused the same way — aria-disabled, no native `disabled`, no add", async () => {
    vi.useFakeTimers();
    render(
      <KioskMenu
        lang="en"
        cartId="c-sold"
        items={[item({ id: "s1", nameEn: "Shan noodles", soldOut: true })]}
        categories={["Noodles"]}
        count={0}
        onAdded={() => {}}
        onReview={() => {}}
      />,
    );
    const sold = tile(/Shan noodles/);
    expect(sold.hasAttribute("disabled")).toBe(false);
    expect(sold.getAttribute("aria-disabled")).toBe("true");
    // MUTATION (p2h-int-c/kiosk/sold-out-unmarked): the sold-out shade (`[data-sold-out]`) never
    // applies — a dish that will not come back looks merely busy; red.
    expect(sold.getAttribute("data-sold-out")).toBe("true");
    expect(sold.style.opacity).toBe("");
    await act(async () => {
      fireEvent.click(sold);
    });
    expect(addItem).not.toHaveBeenCalled();
  });

  it("a dish still WAITING stays refused after the menu remounts (Back from review) — per tab, like the stall ledger (critic F8)", async () => {
    vi.useFakeTimers();
    const late = deferred<unknown>();
    addItem.mockReturnValueOnce(late.promise);
    mount("c-remount");
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    await advance(STAFF_HANG_MS);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
    // View order → Back: KioskOrderFlow unmounts the menu and mounts a fresh one.
    cleanup();
    const { onAdded } = mount("c-remount");
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    // MUTATION (p2h-sheets/kiosk/waiting-forgotten-on-remount): the fresh mount's empty set sends
    // the re-add — two bowls when both land; red.
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(pageStatus().textContent).toBe(t("en", "addWaiting"));
    // Another cart (the next guest) is never refused by this one's wait.
    cleanup();
    addItem.mockResolvedValueOnce({});
    mount("c-next-guest");
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    expect(addItem).toHaveBeenCalledTimes(2);
    cleanup();
    await act(async () => {
      late.resolve({});
    });
    mount("c-remount");
    addItem.mockResolvedValueOnce({});
    await act(async () => {
      fireEvent.click(tile(/Mohinga/));
    });
    expect(addItem).toHaveBeenCalledTimes(3);
    void onAdded;
  });
});

describe("the dish tile's dim has ONE source — the stylesheet (Phase 2h · integration c)", () => {
  // The tiles refuse by `aria-disabled` (critic F7), so `.kiosk-door:disabled` alone no longer dims
  // them; the review's doors still refuse natively. One rule serves both — parsed, never scanned
  // (comments name these selectors in prose).
  const decls = cssDeclarations(readFileSync(join(__dirname, "../../app/globals.css"), "utf8"));
  /** Every top-level `prop` declared by a rule whose selector LIST names `sel` exactly. */
  const declared = (sel: string, prop: string) =>
    decls.filter(
      (d) =>
        d.media === null &&
        d.prop === prop &&
        d.selector
          .split(",")
          .map((x) => x.trim())
          .includes(sel),
    );

  it("a refused tile (aria-disabled) dims like a disabled door, its cursor rests, and its press is stilled", () => {
    // MUTATION (p2h-int-c/kiosk/aria-disabled-undimmed): only `:disabled` dims — a busy or sold-out
    // tile looks tappable, and the guest taps it again; red.
    for (const sel of ['.kiosk-door[aria-disabled="true"]', ".kiosk-door:disabled"]) {
      expect(declared(sel, "opacity").map((d) => d.value)).toEqual(["0.5"]);
      expect(declared(sel, "cursor").map((d) => d.value)).toEqual(["default"]);
    }
    // An aria-disabled button still takes `:active`: the stilling must come AFTER the press's
    // scale, which it beats at equal weight only by order. MUTATION
    // (p2h-int-c/kiosk/press-not-stilled): a refused tile still sinks under the finger; red.
    const stilled = declared('.kiosk-door[aria-disabled="true"]', "transform");
    expect(stilled.map((d) => d.value)).toEqual(["none"]);
    const press = declared(".kiosk-door:active", "transform");
    expect(press).toHaveLength(1);
    expect(stilled[0]!.i).toBeGreaterThan(press[0]!.i);
  });

  it("a sold-out tile keeps its own, lighter shade — written after the busy dim, so it wins", () => {
    // MUTATION (p2h-int-c/kiosk/sold-out-shade-lost): sold out reads exactly like busy; red.
    const shade = declared(".kiosk-door[data-sold-out]", "opacity");
    expect(shade.map((d) => d.value)).toEqual(["0.55"]);
    const dim = declared('.kiosk-door[aria-disabled="true"]', "opacity");
    expect(shade[0]!.i).toBeGreaterThan(dim[0]!.i);
  });
});
