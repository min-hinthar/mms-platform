/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS, outstanding, stalledSince, youngWrite } from "@/lib/bounded-write";
import type { CounterFloorRow, OlderCounterPoll } from "@/lib/floor-types";

/**
 * Phase 2g · P2fz — the oldest-first sheet's WIRING: page one on open, "Show more" APPENDS the page
 * the server's cursor names and moves focus to the first new row, one status region for loading /
 * the outage / the end, Try again outside it, the floor's exits for a refused session, and rows that
 * open the pane at split width (the parent's `onPaneOpen`) or stay real links below it. The read's
 * rules (the predicate, the keyset, the cursor) are pinned in `lib/register-queue.test.ts` and
 * `lib/floor-counter.test.ts`; this suite pins only what a render shows.
 */
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
const read = vi.fn((_input: unknown): Promise<OlderCounterPoll> => new Promise(() => {}));
vi.mock("@/lib/floor", () => ({ getOldestCounterOrders: (input: unknown) => read(input) }));

const { CounterOlderSheet } = await import("./CounterOlderSheet");
const { StaffLangProvider } = await import("./StaffLangProvider");
const { ts } = await import("@/lib/i18n/staff");
const { DEFAULT_KDS_THRESHOLDS } = await import("@/lib/kds-urgency");

const NOW = "2026-09-30T18:00:00.000Z";
const row = (id: string): CounterFloorRow => ({
  sessionId: id,
  customerName: `Guest ${id}`,
  itemCount: 1,
  subtotalCents: 1200,
  startedAt: "2026-09-30T08:00:00.000Z",
  source: "register",
  unpaidSent: true,
  kitchen: null,
  uncollected: true,
});
const page = (ids: string[], more: boolean): OlderCounterPoll => ({
  ok: true,
  rows: ids.map(row),
  more,
  next: more ? { startedAt: `cursor-after-${ids.at(-1)}`, sessionId: ids.at(-1)! } : null,
  serverNow: NOW,
});
const tick = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

let onPaneOpen = vi.fn();
function mount() {
  onPaneOpen = vi.fn();
  render(
    <StaffLangProvider lang="en">
      <button type="button">door</button>
      <CounterOlderSheet
        open
        onOpenChange={() => {}}
        onPaneOpen={onPaneOpen}
        onCloseAutoFocus={(e) => e.preventDefault()}
        lang="en"
        thresholds={DEFAULT_KDS_THRESHOLDS}
      />
    </StaffLangProvider>,
  );
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
  const status = () => dialog().querySelector('[role="status"]')!;
  const list = () =>
    within(dialog()).getByRole("list", { name: ts("en", "floor.counter.older.a11y.list") });
  const names = () =>
    [...list().querySelectorAll(":scope > li > a")].map((a) => a.getAttribute("href"));
  const button = (k: "floor.counter.older.more" | "floor.counter.older.retry") =>
    within(dialog()).queryByRole("button", { name: ts("en", k) });
  return { dialog, status, list, names, button };
}

beforeEach(() => {
  vi.useFakeTimers();
  read.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CounterOlderSheet — every open counter order, oldest first", () => {
  it("reads page ONE on open, draws its rows as the floor's cards (opening the order's page)", async () => {
    read.mockResolvedValueOnce(page(["a", "b"], true));
    const s = mount();
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.loading"));
    await tick();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ after: null });
    expect(s.names()).toEqual(["/staff/table/a", "/staff/table/b"]);
    // more to come: the region says nothing final, and Show more is offered
    expect(s.status().textContent).toBe("");
    expect(s.button("floor.counter.older.more")).not.toBeNull();
    // ONE status region in the sheet
    expect(s.dialog().querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1);
  });

  it("Show more APPENDS the page the server's cursor names, and focus lands on the first NEW row", async () => {
    // p2g-older/older-sheet/more-replaces · cursor-ignored · focus-stays
    read.mockResolvedValueOnce(page(["a", "b"], true));
    const s = mount();
    await tick();
    read.mockResolvedValueOnce(page(["c", "d"], false));
    await act(async () => void fireEvent.click(s.button("floor.counter.older.more")!));
    await tick();
    expect(read).toHaveBeenLastCalledWith({
      after: { startedAt: "cursor-after-b", sessionId: "b" },
    });
    expect(s.names()).toEqual([
      "/staff/table/a",
      "/staff/table/b",
      "/staff/table/c",
      "/staff/table/d",
    ]);
    expect(document.activeElement?.getAttribute("href")).toBe("/staff/table/c");
    // the last page: the end is said, and there is nothing more to offer
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.end"));
    expect(s.button("floor.counter.older.more")).toBeNull();
  });

  it("while a page is out, Show more reads busy (never natively disabled) and a second tap sends nothing", async () => {
    // p2g-older/older-sheet/double-tap-reads-twice
    read.mockResolvedValueOnce(page(["a"], true));
    const s = mount();
    await tick();
    read.mockImplementationOnce(() => new Promise(() => {}));
    const more = s.button("floor.counter.older.more")!;
    await act(async () => {
      fireEvent.click(more);
      fireEvent.click(more);
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(more.getAttribute("aria-disabled")).toBe("true");
    expect(more.hasAttribute("disabled")).toBe(false);
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.loading"));
  });

  it("an unreadable first page says so, with Try again OUTSIDE the region — and the retry reads page one", async () => {
    // p2g-older/older-sheet/outage-reads-empty
    read.mockResolvedValueOnce({ ok: false, reason: "outage" });
    const s = mount();
    await tick();
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.outage"));
    expect(s.status().textContent).not.toBe(ts("en", "floor.counter.older.none"));
    const retry = s.button("floor.counter.older.retry")!;
    expect(s.status().contains(retry)).toBe(false);
    read.mockResolvedValueOnce(page(["a"], false));
    await act(async () => void fireEvent.click(retry));
    await tick();
    expect(read).toHaveBeenLastCalledWith({ after: null });
    expect(s.names()).toEqual(["/staff/table/a"]);
  });

  it("a first-page retry never drops focus: Try again stays (busy), then focus goes to the first row", async () => {
    // p2g-fix/older-sheet/retry-drops-focus · p2g-fix/older-sheet/retry-lands-nowhere (A11Y-8)
    read.mockResolvedValueOnce({ ok: false, reason: "outage" });
    const s = mount();
    await tick();
    const retry = s.button("floor.counter.older.retry")!;
    retry.focus();
    let answer!: (v: OlderCounterPoll) => void;
    read.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    await act(async () => void fireEvent.click(retry));
    // While page one is asked again the button stays — busy, still holding focus.
    expect(retry.isConnected).toBe(true);
    expect(retry.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(retry);
    await act(async () => void answer(page(["a", "b"], false)));
    await tick();
    expect(document.activeElement?.getAttribute("href")).toBe("/staff/table/a");
  });

  it("a first-page retry that comes back empty puts focus on the status line, never the sheet", async () => {
    read.mockResolvedValueOnce({ ok: false, reason: "outage" });
    const s = mount();
    await tick();
    const retry = s.button("floor.counter.older.retry")!;
    retry.focus();
    read.mockResolvedValueOnce(page([], false));
    await act(async () => void fireEvent.click(retry));
    await tick();
    expect(document.activeElement).toBe(s.status());
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.none"));
  });

  it("an unreadable LATER page keeps the rows shown and retries the SAME cursor", async () => {
    read.mockResolvedValueOnce(page(["a"], true));
    const s = mount();
    await tick();
    read.mockRejectedValueOnce(new Error("dropped"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => void fireEvent.click(s.button("floor.counter.older.more")!));
    await tick();
    expect(s.names()).toEqual(["/staff/table/a"]);
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.outage"));
    read.mockResolvedValueOnce(page(["b"], false));
    await act(async () => void fireEvent.click(s.button("floor.counter.older.retry")!));
    await tick();
    expect(read).toHaveBeenLastCalledWith({
      after: { startedAt: "cursor-after-a", sessionId: "a" },
    });
    expect(s.names()).toEqual(["/staff/table/a", "/staff/table/b"]);
  });

  it("nothing open: the sheet says so honestly — never 'every order' over an empty list", async () => {
    read.mockResolvedValueOnce(page([], false));
    const s = mount();
    await tick();
    expect(s.status().textContent).toBe(ts("en", "floor.counter.older.none"));
  });

  it("a refused session or a locked console leaves exactly as the floor does", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    read.mockResolvedValueOnce({ ok: false, reason: "signin" });
    mount();
    await tick();
    expect(assign).toHaveBeenLastCalledWith("/staff/login");
    cleanup();
    read.mockResolvedValueOnce({ ok: false, reason: "locked" });
    mount();
    await tick();
    expect(assign).toHaveBeenLastCalledWith("/staff/lock");
  });

  it("a row at split width opens the PANE (the parent's), never navigating; below it, the real link", async () => {
    // p2g-older/older-sheet/row-never-reaches-the-pane
    read.mockResolvedValueOnce(page(["a"], false));
    const s = mount();
    await tick();
    const card = () => s.list().querySelector<HTMLAnchorElement>(":scope > li > a")!;
    // Whether the sheet prevented the click, read AFTER React's handler (the document hears it
    // last) — and then prevented here, so jsdom never attempts a navigation it cannot do.
    const click = () => {
      let prevented: boolean | null = null;
      const seen = (e: Event) => {
        prevented = e.defaultPrevented;
        e.preventDefault();
      };
      document.addEventListener("click", seen, { once: true });
      fireEvent.click(card());
      return prevented;
    };
    // below 48em (jsdom has no matchMedia): the plain link, no pane
    expect(click()).toBe(false); // not prevented — the link navigates
    expect(onPaneOpen).not.toHaveBeenCalled();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    expect(click()).toBe(true); // prevented — the pane, not a navigation
    expect(onPaneOpen).toHaveBeenCalledWith("a");
  });
});

describe("Phase 2h (9d) — the page read sits on the stall ledger until it answers", () => {
  it("a hung page read makes the tab read stalled at 15s", async () => {
    // MUTATION (p2h-core/track-older-read): the read is not tracked — hung, it holds the action
    // queue while the ledger calls the tab healthy, and a money tap is queued behind it; red.
    read.mockReturnValue(new Promise(() => {}));
    const openedAt = Date.now();
    mount();
    await tick(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    await tick(1);
    expect(stalledSince()).toBe(openedAt);
  });
  it("the page read in flight is a READ — never a young write (Phase 2i)", async () => {
    read.mockReturnValue(new Promise(() => {}));
    mount();
    await tick(0);
    expect(outstanding()).toBe(1);
    // MUTATION (p2i-kind/older-read): the page read is tracked as a write — an open sheet refuses a
    // reload for a new build as "still saving"; red.
    expect(youngWrite()).toBe(false);
  });
});
