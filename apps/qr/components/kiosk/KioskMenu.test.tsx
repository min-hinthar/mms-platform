/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
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

function mount() {
  const onAdded = vi.fn();
  render(
    <KioskMenu
      lang="en"
      cartId="c1"
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
    // order at the counter" over an add that may still land; red.
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
});
