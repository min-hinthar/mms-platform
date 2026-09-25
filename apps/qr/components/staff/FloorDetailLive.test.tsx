/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { frozenBoardCopy } from "@/lib/staff-outage";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";

/**
 * Phase 2a · tablet — the table page's output, pinned BEFORE Phase 2 forks it into a page and a
 * pane. Everything here is today's contract, so a later variant that drifts from it goes red here
 * rather than on a tablet mid-service:
 *
 *  - the page shell: `main.staff-main`, ONE staff bar whose h1 names the table and whose leading
 *    control goes back to the floor BY NAME, then the `.staff-col` column;
 *  - the order card's ONE polite region, both arms (a write refusal; the frozen-board line);
 *  - the focus catch-all: real focus lost to a refresh lands on the order heading, and an idle
 *    tablet (focus on <body>) is never given focus by the poll;
 *  - a `closed` verdict returns to the floor by name, and a verdict that arrives AFTER the page
 *    unmounted (the server tapped "+ Add items" mid-poll) drives no navigation at all.
 *
 * Mocks: the read (`getTableDetail`), the realtime hook, the router — the same shape as
 * counter-boards.test — plus inert stubs for the server actions the page's children import.
 */
const NOW = "2026-09-24T18:00:00.000Z";
let answer: () => Promise<TableDetailResult>;
const getTableDetail = vi.fn((_id: string) => answer());
vi.mock("@/lib/floor", () => ({
  getTableDetail: (id: string) => getTableDetail(id),
  clearTable: vi.fn(),
  getMergeCandidates: vi.fn(() => Promise.resolve({ ok: true, candidates: [] })),
  mergeTables: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
const staffSetQty = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (...a: unknown[]) => staffSetQty(...(a as [])),
  setLineNotes: vi.fn(),
  settleCash: vi.fn(),
  closeSecureTab: vi.fn(),
}));
vi.mock("@/lib/terminal", () => ({
  settleCard: vi.fn(),
  terminalStatus: vi.fn(),
  cancelTerminal: vi.fn(),
}));
vi.mock("@/lib/staff-promo", () => ({
  applyPromoForTable: vi.fn(),
  clearPromoForTable: vi.fn(),
}));
vi.mock("@/lib/tabs", () => ({ openTab: vi.fn() }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push }),
  usePathname: () => "/staff/table/s1",
}));
// Phase 2a · send — the table page now mounts the console's Send; its server action is inert here.
vi.mock("@/lib/staff-send", () => ({ staffFireCart: vi.fn(), staffUndoFire: vi.fn() }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { FloorDetailLive } = await import("./FloorDetailLive");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");

const line = (id: string, name: string): TableLineView => ({
  id,
  name,
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  sendable: true,
  // Phase 2c · pad — the line's dish, fulfillment and Burmese (the order pad's ticket reads them).
  menuItemId: null,
  fulfillment: "dinein",
  nameMy: null,
  modifiersMy: [],
});
const DETAIL: TableDetail = {
  sessionId: "s1",
  settled: false,
  cartId: "c1",
  label: "T4",
  tableNumber: 4,
  mode: "dinein",
  status: "ordering",
  members: [{ seatId: "m1", name: "Aye", isHost: true }],
  lines: [line("l1", "Mohinga"), line("l2", "Tea Leaf Salad")],
  itemCount: 2,
  runningSubtotalCents: 2400,
  settleTotalCents: null,
  settleTipBaseCents: null,
  intendedTipCents: null,
  counterRequestedAt: null,
  paidTotalCents: null,
  refund: null,
  settledOrderCount: 0,
  settledOrderCountCapped: false,
  promoCode: null,
  settlePromoCents: null,
  tab: "none",
  tabOpenedAt: null,
  ceilingCents: 15000,
  tabOverCeiling: false,
  nudgeSecure: null,
  lastActivityAt: NOW,
  paymentInFlight: false,
  hostPresent: true,
  // Both drafts were staff-added (no seat), so the Send is primary even at a hosted table.
  send: { sendable: 2, staffAdded: 2, togoDraft: 0, inKitchen: false, foodDraft: true },
  serverNow: NOW,
};

const mount = () =>
  render(
    <StaffLangProvider lang="en">
      <FloorDetailLive initial={DETAIL} sessionId="s1" />
    </StaffLangProvider>,
  );
/** Advance the fake clock and drain the promises it releases (the 5s poll → the read → setState). */
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const orderRegion = () =>
  document.getElementById("order-h")!.closest("section")!.querySelector('[role="status"]')!;

beforeEach(() => {
  vi.useFakeTimers();
  answer = () => Promise.resolve({ kind: "detail", detail: DETAIL });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getTableDetail.mockClear();
  staffSetQty.mockReset();
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
});

describe("FloorDetailLive — the page shell", () => {
  it("is main.staff-main → ONE staff bar (h1 'Table 4', back to the floor by name) → .staff-col", () => {
    const { container } = mount();
    const main = container.querySelector("main");
    expect(main?.classList.contains("staff-main")).toBe(true);
    const bars = container.querySelectorAll(".staff-bar");
    expect(bars).toHaveLength(1);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toContain(tf("en", "floor.table", { id: "4" }));
    // The bar's leading control is the way back UP, to the floor asked for by name.
    const back = within(bars[0] as HTMLElement)
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === STAFF_DOOR_TARGET.counter);
    expect(back).toBeTruthy();
    expect(main!.querySelector(":scope > .staff-col")).toBeTruthy();
    // Page headings are h2 under the bar's h1.
    expect(document.getElementById("order-h")?.tagName).toBe("H2");
    expect(document.getElementById("party-h")?.tagName).toBe("H2");
  });
});

describe("FloorDetailLive — the order card's one polite region", () => {
  it("the write-error arm: a refused line edit speaks there, in the warn tone", async () => {
    staffSetQty.mockResolvedValue({ ok: false, error: "That line just changed." });
    mount();
    const list = within(document.getElementById("order-h")!.closest("section")!).getAllByRole(
      "list",
    )[0]!;
    const inc = list.querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await tick(0);
    expect(staffSetQty).toHaveBeenCalled();
    expect(orderRegion().textContent).toBe("That line just changed.");
    expect((orderRegion() as HTMLElement).style.color).toBe("var(--warn)");
  });

  it("the frozen arm: an outage read keeps the last detail and says the order is frozen", async () => {
    answer = () => Promise.resolve({ kind: "outage" });
    mount();
    expect(orderRegion().textContent).toBe("");
    await tick(5000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    expect(orderRegion().textContent).toBe(frozenBoardCopy("en", NOW, 0, "what.order", "outage"));
    // The last good detail is still on screen — an unreadable table is not a cleared one.
    expect(replace).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Mohinga");
  });
});

describe("FloorDetailLive — the focus catch-all", () => {
  const withoutTea = { ...DETAIL, lines: [line("l1", "Mohinga")], itemCount: 1 };

  it("real focus on a control the refresh removes → the order heading", async () => {
    mount();
    const teaRow = [...document.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Tea Leaf Salad"),
    )!;
    const btn = teaRow.querySelector<HTMLButtonElement>("button")!;
    act(() => btn.focus());
    expect(document.activeElement).toBe(btn);
    answer = () => Promise.resolve({ kind: "detail", detail: withoutTea });
    await tick(5000);
    expect(document.body.textContent).not.toContain("Tea Leaf Salad");
    expect(document.activeElement).toBe(document.getElementById("order-h"));
  });

  it("an idle tablet (focus on <body>) is never given focus by the poll", async () => {
    mount();
    expect(document.activeElement).toBe(document.body);
    answer = () => Promise.resolve({ kind: "detail", detail: withoutTea });
    await tick(5000);
    expect(document.body.textContent).not.toContain("Tea Leaf Salad");
    expect(document.activeElement).toBe(document.body);
  });
});

describe("FloorDetailLive — a closed table", () => {
  it("a `closed` verdict returns to the floor by name (STAFF_DOOR_TARGET.counter)", async () => {
    answer = () => Promise.resolve({ kind: "closed" });
    mount();
    await tick(5000);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a verdict that lands AFTER the page unmounted drives no navigation", async () => {
    let settle!: (r: TableDetailResult) => void;
    answer = () => new Promise<TableDetailResult>((r) => (settle = r));
    const { unmount } = mount();
    await tick(5000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The server tapped "+ Add items": the page is gone while its read is still in the air.
    unmount();
    await act(async () => {
      settle({ kind: "closed" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("FloorDetailLive — the running-bill nudge (blind review, 2026-09-24)", () => {
  const nudgeText = (over: Partial<TableDetail>) => {
    const r = render(
      <StaffLangProvider lang="en">
        <FloorDetailLive initial={{ ...DETAIL, ...over }} sessionId="s1" />
      </StaffLangProvider>,
    );
    return r.container.textContent ?? "";
  };
  it("a party at a table with a running bill ALREADY open is pointed at that bill, never offered one", () => {
    // MUTATION (by hand): drop the `tab === "trust"` fork — the open bill is suggested again, red.
    const open = nudgeText({ nudgeSecure: "party", tab: "trust" });
    expect(open).toContain(ts("en", "table.detail.nudge.partyOpen"));
    expect(open).not.toContain(ts("en", "table.detail.nudge.party"));
    cleanup();
    const none = nudgeText({ nudgeSecure: "party", tab: "none" });
    expect(none).toContain(ts("en", "table.detail.nudge.party"));
    cleanup();
    expect(nudgeText({ nudgeSecure: "age", tab: "trust" })).toContain(
      ts("en", "table.detail.nudge.age"),
    );
  });
});
