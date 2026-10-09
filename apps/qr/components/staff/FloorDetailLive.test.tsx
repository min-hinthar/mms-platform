/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { frozenBoardCopy } from "@/lib/staff-outage";
import { STAFF_HANG_MS, youngWrite } from "@/lib/bounded-write";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";
import { SETTLE_TTL_MS } from "@/lib/lock-ttl";
import { handoffFocusKey, handoffStashKey } from "@/lib/floor-pane";
import { READER_COLLECT_KEY, type ReaderCollect } from "@/lib/reader-collect";
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
const settleCash = vi.fn();
const closeSecureTab = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (...a: unknown[]) => staffSetQty(...(a as [])),
  setLineNotes: vi.fn(),
  settleCash: (...a: unknown[]) => settleCash(...(a as [])),
  closeSecureTab: (...a: unknown[]) => closeSecureTab(...(a as [])),
}));
const terminalStatus = vi.fn();
const settleCard = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: (...a: unknown[]) => settleCard(...(a as [])),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: vi.fn(),
  // Codex r2 on #310 (A3) — a reader start left pending in this tab's stash by an earlier case is
  // resolved by the next provider's restore: no action of that table's on the reader.
  terminalResume: () => Promise.resolve({ ok: true, collect: null }),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
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
// ONE router object, as Next's app router hands every render (its context value is stable): a
// fresh object per call would re-create the page's `refresh` on every render, and its poll effect's
// cleanup would cancel a debounced re-read the moment any context the page reads changes.
const router = { replace, refresh, push };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/staff/table/s1",
}));
// Phase 2a · send — the table page now mounts the console's Send; its server action is inert here.
const staffFireCart = vi.fn();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (...a: unknown[]) => staffFireCart(...(a as [])),
  staffUndoFire: vi.fn(),
}));

const recordCounterNoShow = vi.fn();
vi.mock("@/lib/voids", () => ({
  listApprovers: () => Promise.resolve([]),
  voidLine: vi.fn(),
  recordCounterNoShow: (...a: unknown[]) => recordCounterNoShow(...(a as [])),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { FloorDetailLive } = await import("./FloorDetailLive");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");
const { COUNTER_UNCOLLECTED_HOURS } = await import("@/lib/counter-order");

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
  settleBreakdown: null,
  intendedTipCents: null,
  counterRequestedAt: null,
  paidTotalCents: null,
  refund: null,
  settledOrderCount: 0,
  settledOrderCountCapped: false,
  paidOrderId: null,
  promoCode: null,
  settlePromoCents: null,
  tab: "none",
  tabOpenedAt: null,
  ceilingCents: 15000,
  tabOverCeiling: false,
  nudgeSecure: null,
  lastActivityAt: NOW,
  paymentInFlight: false,
  paymentHolder: null,
  hostPresent: true,
  // Both drafts were staff-added (no seat), so the Send is primary even at a hosted table.
  send: {
    sendable: 2,
    staffAdded: 2,
    togoDraft: 0,
    inKitchen: false,
    foodDraft: true,
    counterDraft: 0,
    counterSentPastGrace: false,
  },
  serverNow: NOW,
  // Phase 2f · pay at pickup — the §5.4 read-model fields (a table: none of them apply).
  counterOrder: false,
  counterArm: null,
  customerName: null,
  unpaidSent: false,
  sentLineIds: [],
  droppedLineIds: [],
  compedKitchenLineIds: [],
  payAtPickup: true,
  mergeable: true,
};

const mount = () =>
  render(
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <FloorDetailLive initial={DETAIL} sessionId="s1" />
      </ReaderCollectProvider>
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
  settleCash.mockReset();
  closeSecureTab.mockReset();
  settleCard.mockReset();
  terminalStatus.mockReset();
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
  sessionStorage.clear();
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

  it("a counter order the server shows as PAID keeps the page: it re-renders to the #CODE card", async () => {
    // p2g-int/page-bounces-a-paid-counter-order — a colleague's settle (or another tablet's reader)
    // closes the order under a phone: bounced to the counter, where a paid order is no longer
    // listed, the code the guest is waiting on is nowhere; red.
    answer = () =>
      Promise.resolve({
        kind: "closed",
        label: "reg-7f3a",
        tableNumber: null,
        handoff: {
          orderId: "o-00a1b2c3",
          totalCents: 4210,
          tipCents: 0,
          tenderedCents: null,
          isCounter: true,
          cartId: "c-9",
          sentEarly: false,
        },
      });
    mount();
    await tick(5000);
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  // Phase 2g · review (A11Y-4) — the refresh swaps the whole detail for the closed card; focus that
  // was INSIDE the detail must land on the card (ClosedHandoffCard takes this one-shot note on mount
  // — app/staff/table/[id]/page.test.tsx), and an idle phone is never given focus by a poll.
  const PAID_VERDICT: TableDetailResult = {
    kind: "closed",
    label: "reg-7f3a",
    tableNumber: null,
    handoff: {
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: 0,
      tenderedCents: null,
      isCounter: true,
      cartId: "c-9",
      sentEarly: false,
    },
    refund: "none",
    orderId: "o-00a1b2c3",
  };

  it("focus INSIDE the detail when it swaps to the card: a one-shot note for the card, before the refresh", async () => {
    mount();
    const btn = document.querySelector<HTMLButtonElement>("main li button")!;
    act(() => btn.focus());
    answer = () => Promise.resolve(PAID_VERDICT);
    let noted: string | null = "unset";
    refresh.mockImplementation(() => {
      noted = sessionStorage.getItem(handoffFocusKey("s1"));
    });
    await tick(5000);
    expect(refresh).toHaveBeenCalled();
    // MUTANT p2g-fix-code/swap-leaves-no-focus-note — the detail unmounts under the person and focus
    // falls to <body>, unsaid; red.
    expect(noted).not.toBeNull();
    expect(Number(noted)).toBeGreaterThan(0);
  });

  it("an idle phone (focus on <body>) leaves no note: the swapped-in card is never focused by a poll", async () => {
    mount();
    expect(document.activeElement).toBe(document.body);
    answer = () => Promise.resolve(PAID_VERDICT);
    await tick(5000);
    expect(refresh).toHaveBeenCalled();
    // MUTANT p2g-fix-code/swap-note-always — a poll plants focus on an idle phone's card; red.
    expect(sessionStorage.getItem(handoffFocusKey("s1"))).toBeNull();
  });

  it("a closed counter order with NO card it can read (unreadable) still returns to the counter", async () => {
    answer = () =>
      Promise.resolve({
        kind: "closed",
        label: "reg-7f3a",
        tableNumber: null,
        handoff: null,
        refund: null,
        orderId: null,
      });
    mount();
    await tick(5000);
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a REFUNDED counter order keeps the page: it re-renders to the refunded sentence", async () => {
    // p2g-fix/page-bounces-a-refunded-counter-order — bounced to the counter, the phone is never
    // told the money went back (the order is no longer listed there); red.
    for (const refund of ["partial", "full"] as const) {
      replace.mockReset();
      refresh.mockReset();
      answer = () =>
        Promise.resolve({
          kind: "closed",
          label: "reg-7f3a",
          tableNumber: null,
          handoff: null,
          refund,
          orderId: "o-00a1b2c3",
        });
      const { unmount } = mount();
      await tick(5000);
      expect(replace).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
      unmount();
    }
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
        <ReaderCollectProvider>
          <FloorDetailLive initial={{ ...DETAIL, ...over }} sessionId="s1" />
        </ReaderCollectProvider>
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

// ── Phase 2c · register ── the settle section, the paid card, and the view's ONE region (P2r).
// Extended BEFORE the component changed (red against the Phase 2b table page), then made to pass.

/** A table (or counter order) ready to settle: a quoted total, no payment in flight — and, since
 *  Phase 2c · gate, every dish SENT (the settle gate refuses a table holding unsent dine-in drafts;
 *  its own cases below build that table from `DETAIL`'s drafts). */
const SETTLEABLE: TableDetail = {
  ...DETAIL,
  settleTotalCents: 4210,
  settleTipBaseCents: 4000,
  lines: DETAIL.lines.map((l) => ({ ...l, state: "fired", sendable: false })),
  send: {
    sendable: 0,
    staffAdded: 0,
    togoDraft: 0,
    inKitchen: true,
    foodDraft: false,
    counterDraft: 0,
    counterSentPastGrace: false,
  },
};
const mountWith = (
  initial: TableDetail,
  extra: { terminalReady?: boolean; focusSettle?: boolean } = {},
) =>
  render(
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <FloorDetailLive initial={initial} sessionId="s1" {...extra} />
      </ReaderCollectProvider>
    </StaffLangProvider>,
  );
/** A stashed reader collect for `sessionId` (Phase 2g · reader — the provider's record shape). */
const collectFor = (sessionId: string, over: Partial<ReaderCollect> = {}): ReaderCollect => ({
  sessionId,
  paymentIntentId: "pi_1",
  totalCents: 4210,
  isCounter: false,
  name: { counter: false, display: "4" },
  sentEarly: false,
  cartId: "c1",
  startedAt: Date.now(),
  liveAt: Date.now(),
  hidden: false,
  recordingSince: null,
  unrecordedAt: null,
  ...over,
});
/** The settle section's controls, in DOM order. */
const settleButtons = () =>
  [...document.getElementById("settle-h")!.closest("section")!.querySelectorAll("button")].filter(
    (b) => b.closest('[role="dialog"]') === null,
  );
const polite = () => document.querySelectorAll('main [role="status"]');

describe("FloorDetailLive — the settle section (Phase 2c · register)", () => {
  it("cash is the ONE primary, FIRST; the reader follows it as a secondary", () => {
    mountWith(SETTLEABLE, { terminalReady: true });
    const [first, second] = settleButtons();
    expect(first!.textContent).toContain(ts("en", "settle.cash.trigger").replace(" · {m}", ""));
    expect(first!.classList.contains("ui-btn-primary")).toBe(true);
    expect(second!.textContent).toContain("Card on the reader");
    expect(second!.classList.contains("ui-btn-secondary")).toBe(true);
    // One filled action per section (§20).
    expect(
      document.getElementById("settle-h")!.closest("section")!.querySelectorAll(".ui-btn-primary"),
    ).toHaveLength(1);
  });

  it("a SECURE running bill closes on the card on file first; cash becomes the secondary", () => {
    mountWith({ ...SETTLEABLE, tab: "secure" });
    const [first, second] = settleButtons();
    expect(first!.textContent).toContain("card on file");
    expect(first!.classList.contains("ui-btn-primary")).toBe(true);
    expect(second!.classList.contains("ui-btn-secondary")).toBe(true);
  });

  it("?settle=1 lands focus on the settle section's heading and drops the param", async () => {
    mountWith(SETTLEABLE, { focusSettle: true });
    await tick(0);
    expect(document.activeElement).toBe(document.getElementById("settle-h"));
    expect(replace).toHaveBeenCalledWith("/staff/table/s1", { scroll: false });
  });
});

describe("FloorDetailLive — the paid card and the ONE polite region (P2r)", () => {
  const COUNTER: TableDetail = {
    ...SETTLEABLE,
    label: "reg-7f3a",
    tableNumber: null,
    mode: "pickup",
    counterOrder: true,
  };

  async function settleInCash(tender?: string) {
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    if (tender) {
      const f = document.getElementById("cash-tendered") as HTMLInputElement;
      fireEvent.change(f, { target: { value: tender } });
    }
    const settle = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(settle);
    });
    await tick(0);
  }

  it("a counter settle lands the paid card: FOCUSED, named by its facts, and NOT a second status region", async () => {
    settleCash.mockResolvedValueOnce({
      ok: true,
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: 0,
    });
    mountWith(COUNTER);
    expect(polite()).toHaveLength(1);
    await settleInCash("50");
    const card = within(document.querySelector("main")!).getByRole("region", {
      name: /Paid.*Change.*\$7\.90.*#A1B2C3/,
    });
    expect(document.activeElement).toBe(card);
    // P2r — exactly ONE polite region on the page after the settle (the order card's).
    expect(polite()).toHaveLength(1);
  });

  it("the settle re-reads the page's OWN detail (onChanged), never a router.refresh", async () => {
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o-1", totalCents: 4210, tipCents: 0 });
    mountWith(SETTLEABLE);
    const before = getTableDetail.mock.calls.length;
    await settleInCash();
    await tick(400);
    expect(getTableDetail.mock.calls.length).toBeGreaterThan(before);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a TABLE cash settle with a tender shows the rows-only card; the next round's cart retires it (K33)", async () => {
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o-2", totalCents: 4210, tipCents: 0 });
    // The read after the settle: settled (no cart) — the card stands.
    answer = () =>
      Promise.resolve({ kind: "detail", detail: { ...SETTLEABLE, cartId: null, settled: true } });
    mountWith(SETTLEABLE);
    await settleInCash("50");
    await tick(400);
    const card = screen.getByRole("region", { name: /Paid.*Change.*\$7\.90/ });
    expect(within(card).queryByRole("link")).toBeNull();
    expect(card.textContent).not.toContain("#");
    // The table orders again: a NEW cart opens on the same session — last round's change goes.
    answer = () => Promise.resolve({ kind: "detail", detail: { ...SETTLEABLE, cartId: "c2" } });
    await tick(5000);
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
  });

  // ── Phase 2d · Codex round 1 · pane ── the card the next round replaced is DEAD, not hidden.
  it("round two settling with NO tender never brings back round one's change (Codex #306)", async () => {
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o-2", totalCents: 4210, tipCents: 0 });
    const paid = { ...SETTLEABLE, cartId: null, settled: true };
    answer = () => Promise.resolve({ kind: "detail", detail: paid });
    mountWith(SETTLEABLE);
    await settleInCash("50");
    await tick(400);
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$7\.90/ })).toBeTruthy();
    // Round two opens on the same session (cart c2)…
    answer = () => Promise.resolve({ kind: "detail", detail: { ...SETTLEABLE, cartId: "c2" } });
    await tick(5000);
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
    // …and settles with no tender entered: no card of its own, the paid state is the signal.
    answer = () => Promise.resolve({ kind: "detail", detail: paid });
    await tick(5000);
    // MUTATION: the card is only HIDDEN while c2 is open (never dropped) — with no live cart again
    // it reads as current, and last round's "$7.90 change" is shown as this round's; red.
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
    // …and its stash is gone with it (a pane would restore it on the next visit).
    expect(sessionStorage.getItem(handoffStashKey("s1"))).toBeNull();
  });

  it("the reader's status is SAID through the page's one region, SHOWN in its panel with no region of its own", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    // Phase 2g · reader — the provider's ONE record (a reload mid-collect restores it).
    sessionStorage.setItem(READER_COLLECT_KEY, JSON.stringify(collectFor("s1")));
    mountWith({ ...SETTLEABLE, paymentInFlight: true }, { terminalReady: true });
    await tick(0);
    await tick(0);
    const waiting = ts("en", "settle.reader.status.waiting");
    const panel = screen.getByRole("group", { name: ts("en", "settle.a11y.readerPanel") });
    expect(panel.textContent).toContain(waiting);
    expect(panel.querySelector('[role="status"]')).toBeNull();
    expect(polite()).toHaveLength(1);
    expect(orderRegion().textContent).toBe(waiting);
  });
});

describe("FloorDetailLive — the paying banner names WHO holds the money (P2w, critic finding)", () => {
  const bannerOf = (over: Partial<TableDetail>) => {
    const r = mountWith({ ...SETTLEABLE, paymentInFlight: true, ...over });
    return r.container.textContent ?? "";
  };
  it("the register's own held freeze says the register's sentence — never 'a guest is paying on their phone'", () => {
    // MUTATION: render the phone sentences from `paymentInFlight` alone — the unknown-outcome card
    // close (which HOLDS its freeze) tells staff a guest is paying on their phone; red.
    const text = bannerOf({ paymentHolder: "register" });
    expect(text).toContain(tf("en", "settle.inflight.register", { n: SETTLE_MINUTES }));
    expect(text).not.toContain(ts("en", "table.detail.payingPhone.cash"));
  });
  it("a guest's phone keeps its own two sentences (cash / running bill)", () => {
    expect(bannerOf({ paymentHolder: "phone" })).toContain(
      ts("en", "table.detail.payingPhone.cash"),
    );
    cleanup();
    expect(bannerOf({ paymentHolder: "phone", tab: "trust" })).toContain(
      ts("en", "table.detail.payingPhone.tab"),
    );
  });
  it("a holder nobody could read (or none sent) is UNSURE — never the phone by default", () => {
    const text = bannerOf({ paymentHolder: null });
    expect(text).toContain(ts("en", "settle.inflight.unsure"));
    expect(text).not.toContain(ts("en", "table.detail.payingPhone.cash"));
  });
});

describe("FloorDetailLive — a send line stays SHOWN while the reader's status is SAID (critic finding)", () => {
  it("a standing 'Couldn't send' is still on screen (aria-hidden) while the reader panel speaks", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    // Phase 2g · reader — a tab open at deploy: the pre-2g per-table key, adopted by this detail.
    sessionStorage.setItem(
      "mms-terminal-collect:s1",
      JSON.stringify({ paymentIntentId: "pi_1", totalCents: 4210 }),
    );
    // Unsent drafts, so the Send is on the page (Phase 2c · gate: SETTLEABLE is fully sent).
    mountWith({ ...SETTLEABLE, lines: DETAIL.lines, send: DETAIL.send });
    await tick(0);
    await tick(0);
    staffFireCart.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await act(async () => {
      fireEvent.click(document.querySelector<HTMLButtonElement>(".staff-send button")!);
    });
    await tick(0);
    const region = orderRegion();
    const couldnt = ts("en", "table.send.err.failed");
    // SAID: the reader's status (the settle line outranks a send line in what is spoken).
    expect(region.querySelector(".sr-only")?.textContent).toBe(
      ts("en", "settle.reader.status.waiting"),
    );
    // MUTATION (by hand): drop the send arm from the reader branch — "Couldn't send" vanishes from
    // the screen the moment a reader collect starts; red.
    const shown = [...region.querySelectorAll('[aria-hidden="true"]')].map((n) => n.textContent);
    expect(shown).toEqual([couldnt]);
    staffFireCart.mockReset();
  });
});

describe("FloorDetailLive — a counter settle whose response was LOST holds the closed-bounce (critic finding)", () => {
  const COUNTER: TableDetail = {
    ...SETTLEABLE,
    label: "reg-7f3a",
    tableNumber: null,
    mode: "pickup",
    counterOrder: true,
  };
  async function lostSettle() {
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mountWith(COUNTER);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(ts("en", "settle.cash.unknown"));
  }

  it("the settle landed (settleCash's after() closed the counter session): the page stays, says so, and focuses the way back", async () => {
    await lostSettle();
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(400);
    // MUTATION (by hand): drop the hold — the page jumps to the floor mid-sheet and the promised
    // "the order shows paid" never appears anywhere the cashier is looking; red.
    expect(replace).not.toHaveBeenCalled();
    const notice = screen.getByRole("region", { name: ts("en", "settle.cash.unknownClosed") });
    expect(document.activeElement).toBe(notice);
    const back = within(notice).getByRole("link");
    expect(back.getAttribute("href")).toBe(STAFF_DOOR_TARGET.counter);
    // The order is closed: nothing on it is writable any more (the settle section is gone).
    expect(document.getElementById("settle-h")).toBeNull();
    vi.restoreAllMocks();
  });

  it("a counter order closed WITHOUT an outstanding unknown settle still returns to the floor", async () => {
    mountWith(COUNTER);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a NEWER attempt's refusal ('That table is closed.') answers nothing about the lost one: the hold stays, and the close is said in place (#334, C1)", async () => {
    await lostSettle();
    // The retry meets the session the first settle closed — a refusal of the RETRY, which says
    // nothing about whether the first one recorded the payment (it most likely did).
    settleCash.mockResolvedValueOnce({ ok: false, error: "That table is closed." });
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION till-ui/refusal-frees-the-page-hold (judged here too): the cashier is yanked to the
    // floor over a payment that most likely went through; red.
    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: ts("en", "settle.cash.unknownClosed") }),
    ).toBeTruthy();
    vi.restoreAllMocks();
  });
});

// ── Phase 2c · gate ── the settle gate on the table page (owner decision 3).
describe("FloorDetailLive — the settle gate: every settle door refuses while dishes are unsent", () => {
  /** A settle-ready table still holding DETAIL's two unsent dine-in drafts. */
  const UNSENT: TableDetail = { ...SETTLEABLE, lines: DETAIL.lines, send: DETAIL.send };
  const sendControl = () => document.querySelector<HTMLButtonElement>(".staff-send button")!;
  const noteText = (running: boolean) =>
    tf("en", running ? "table.send.settleBlocked.tab.many" : "table.send.settleBlocked.many", {
      n: 2,
    });

  it("a blocked Cash tap opens NO sheet, lands focus on the Send, and the ONE region says why — visibly", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    mountWith(UNSENT, { terminalReady: true });
    const [cash, reader] = settleButtons();
    // Rendered with their amounts, dimmed by the ATTRIBUTE (never native), the note read first.
    expect(cash!.getAttribute("aria-disabled")).toBe("true");
    expect(reader!.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelectorAll("main button[disabled]")).toHaveLength(0);
    expect(cash!.getAttribute("aria-describedby")!.split(" ")[0]).toBe("settle-unsent-note");
    await act(async () => {
      fireEvent.click(cash!);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(settleCash).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(sendControl());
    const region = orderRegion();
    expect(region.textContent).toBe(noteText(false));
    // SHOWN, not only said: nothing of it is sr-only or aria-hidden.
    expect(region.querySelector(".sr-only, [aria-hidden='true']")).toBeNull();
    // Still exactly ONE polite region on the page.
    expect(polite()).toHaveLength(1);
  });

  it("a blocked reader tap starts nothing and jumps to the Send too", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    mountWith(UNSENT, { terminalReady: true });
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    // MUTATION (floor-detail/unsent-reader-gate-not-passed): the reader handed `blocked={false}` —
    // the tap starts a reader charge over unsent dishes and focus stays on it; red.
    expect(settleCard).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(sendControl());
    expect(orderRegion().textContent).toBe(noteText(false));
  });

  it("a blocked RUNNING-BILL close focuses the order's lines (its heading) and offers removing them", async () => {
    const SECURE: TableDetail = { ...UNSENT, tab: "secure" };
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE });
    mountWith(SECURE);
    const [close] = settleButtons();
    expect(close!.textContent).toContain("card on file");
    await act(async () => {
      fireEvent.click(close!);
    });
    // No "Charge $x" confirm opened.
    // MUTATION (floor-detail/unsent-close-gate-not-passed): the close handed `blocked={false}` — its
    // confirm opens, one tap from an off-session charge over unsent dishes; red.
    expect(screen.queryByRole("button", { name: /^Charge \$/ })).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("order-h"));
    expect(orderRegion().textContent).toBe(noteText(true));
  });

  it("the note is the settle section's LAST child — the running bill's words on a secure bill — and it goes once everything is sent", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    mountWith(UNSENT, { terminalReady: true });
    const section = document.getElementById("settle-h")!.closest("section")!;
    const note = document.getElementById("settle-unsent-note")!;
    expect(section.lastElementChild).toBe(note);
    expect(note.textContent).toBe(noteText(false));
    expect(note.getAttribute("role")).toBeNull();
    cleanup();
    mountWith({ ...UNSENT, tab: "secure" });
    expect(document.getElementById("settle-unsent-note")!.textContent).toBe(noteText(true));
    cleanup();
    // A fully sent table: no note, no dimmed trigger.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    mountWith(SETTLEABLE, { terminalReady: true });
    expect(document.getElementById("settle-unsent-note")).toBeNull();
    for (const b of settleButtons()) expect(b.getAttribute("aria-disabled")).toBeNull();
  });

  it("a send outcome takes the region from the gate's line — even while a read in the air still shows the drafts", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    mountWith(UNSENT);
    await act(async () => {
      fireEvent.click(settleButtons()[0]!);
    });
    expect(orderRegion().textContent).toBe(noteText(false));
    staffFireCart.mockResolvedValueOnce({
      ok: true,
      fired: 2,
      undoUntil: new Date(Date.now() + 10_000).toISOString(),
      serverNow: new Date().toISOString(),
      undoBatch: "b",
    });
    // The read after the send still shows the drafts (it began before the fire landed).
    await act(async () => {
      fireEvent.click(sendControl());
    });
    await tick(0);
    // MUTATION (floor-detail/unsent-line-outlives-the-send): keep the gate's line on a send
    // outcome — it outranks "Sent", so the region keeps saying "haven't gone to the kitchen" over
    // dishes the cashier just sent; red.
    expect(orderRegion().textContent).toBe(tf("en", "table.send.sent.many", { n: 2 }));
    // The next read has them in the kitchen: the note under the triggers goes too.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    await tick(5000);
    expect(document.getElementById("settle-unsent-note")).toBeNull();
    staffFireCart.mockReset();
  });

  it("the gate's line retires on a LATER read that shows nothing unsent (the dishes were removed)", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    mountWith(UNSENT);
    await act(async () => {
      fireEvent.click(settleButtons()[0]!);
    });
    expect(orderRegion().textContent).toBe(noteText(false));
    // A read that STARTS after the tap: the table holds nothing unsent any more.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    await tick(5000);
    // MUTATION (floor-detail/unsent-line-never-retires): drop the retire — the region keeps saying
    // "2 dishes haven't gone to the kitchen" over a table with nothing unsent; red.
    expect(orderRegion().textContent).toBe("");
  });

  it("a RACED server refusal (the page had not read the new dish): the sheet says it, and its close jumps to the Send once the page has read the drafts", async () => {
    // The page reads a fully sent table; a guest's dish lands before the tap.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    settleCash.mockResolvedValueOnce({
      ok: false,
      code: "unsent",
      units: 2,
      error: "Some dishes haven’t gone to the kitchen.",
    });
    mountWith(SETTLEABLE);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    await act(async () => {
      fireEvent.click(take);
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(noteText(false));
    await tick(400); // the refusal re-reads the page: the drafts arrive, the Send appears
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await tick(0);
    expect(document.activeElement).toBe(sendControl());
    expect(orderRegion().textContent).toBe(noteText(false));
  });

  // ── the critic's findings (Phase 2c · gate, round 2) ──
  const settleSection = () => document.getElementById("settle-h")!.closest("section")!;
  /** Any of the four gate sentences, in English — "haven’t gone to the kitchen" is in every one. */
  const saysUnsent = (el: Element) => (el.textContent ?? "").includes("gone to the kitchen");
  const refusal = (units: number) => ({
    ok: false,
    code: "unsent",
    units,
    error: "Some dishes haven’t gone to the kitchen.",
  });

  it("a RACED reader refusal's line never comes back once the dishes are sent — the page caught up, then the table cleared", async () => {
    // The page reads a fully sent table; a guest's dish lands before the reader tap.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    settleCard.mockResolvedValueOnce(refusal(2));
    mountWith(SETTLEABLE, { terminalReady: true });
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    // Shown beside the reader until the page has read the drafts.
    expect(saysUnsent(settleSection())).toBe(true);
    // The next read sees the drafts: the page's note takes over (the triggers dim).
    answer = () => Promise.resolve({ kind: "detail", detail: UNSENT });
    await tick(5000);
    expect(document.getElementById("settle-unsent-note")).not.toBeNull();
    // The cashier sends them; the read after the send has everything in the kitchen.
    staffFireCart.mockResolvedValueOnce({
      ok: true,
      fired: 2,
      undoUntil: new Date(Date.now() + 10_000).toISOString(),
      serverNow: new Date().toISOString(),
      undoBatch: "b",
    });
    await act(async () => {
      fireEvent.click(sendControl());
    });
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    await tick(5000);
    expect(document.getElementById("settle-unsent-note")).toBeNull();
    // MUTATION (terminal-ui/unsent-raced-line-never-dropped): drop the render-time clear — the
    // reader's raced line comes back under a live "Card on the reader", saying 2 dishes haven't gone
    // to the kitchen when they have; red.
    expect(saysUnsent(settleSection())).toBe(false);
    expect(settleButtons()[1]!.getAttribute("aria-disabled")).toBeNull();
    staffFireCart.mockReset();
  });

  it("a RACED reader refusal's line goes with the page's own line when a later read shows nothing unsent (removed before the page ever saw them)", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLEABLE });
    settleCard.mockResolvedValueOnce(refusal(1));
    mountWith(SETTLEABLE, { terminalReady: true });
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    expect(orderRegion().textContent).toBe(tf("en", "table.send.settleBlocked.one", { n: 1 }));
    // A read that STARTS after the refusal: the guest removed the dish; the page never saw it. (A
    // fresh object, as every real read is — the same reference would be a React bail-out.)
    answer = () => Promise.resolve({ kind: "detail", detail: { ...SETTLEABLE } });
    await tick(5000);
    expect(orderRegion().textContent).toBe("");
    // MUTATION (terminal-ui/unsent-raced-line-outlives-the-gate): clear only on `blocked` — the page
    // never read the table blocked, so the reader's line stands alone, saying a dish is unsent over
    // a table with nothing unsent; red.
    expect(saysUnsent(settleSection())).toBe(false);
  });

  it("a RACED running-bill close refusal's line never comes back once the dishes are removed", async () => {
    const SECURE_SENT: TableDetail = { ...SETTLEABLE, tab: "secure" };
    const SECURE_UNSENT: TableDetail = { ...UNSENT, tab: "secure" };
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE_SENT });
    closeSecureTab.mockResolvedValueOnce(refusal(2));
    mountWith(SECURE_SENT);
    fireEvent.click(settleButtons()[0]!);
    const charge = screen.getByRole("button", { name: /^Charge \$/ });
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE_UNSENT });
    await act(async () => {
      fireEvent.click(charge);
    });
    expect(saysUnsent(settleSection())).toBe(true);
    // The page reads the drafts (the poll; the test router is not stable across renders, so the
    // close's debounced re-read is re-armed by every render here): the note takes over.
    await tick(5000);
    expect(document.getElementById("settle-unsent-note")).not.toBeNull();
    // The guest has left: staff remove the two dishes; the next read has nothing unsent.
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE_SENT });
    await tick(5000);
    expect(document.getElementById("settle-unsent-note")).toBeNull();
    // MUTATION (secure-close/unsent-raced-line-never-dropped): drop the render-time clear — the
    // close's raced line comes back offering to remove dishes that were just removed; red.
    expect(saysUnsent(settleSection())).toBe(false);
  });

  it("on a card-on-file running bill every gate line says ONE sentence — the running bill's, whichever door was tapped", async () => {
    const SECURE_UNSENT: TableDetail = { ...UNSENT, tab: "secure" };
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE_UNSENT });
    mountWith(SECURE_UNSENT, { terminalReady: true });
    // [close, cash, reader] — the close is the primary on a secure running bill.
    const [, cash] = settleButtons();
    // MUTATION (floor-detail/unsent-note-variant-ignored): the note's variant not read off the one
    // binding (`runningClose`) — the note says the table's sentence on a running bill; red.
    expect(document.getElementById("settle-unsent-note")!.textContent).toBe(noteText(true));
    await act(async () => {
      fireEvent.click(cash!);
    });
    // Focus still goes to the Send (cash's fix), but the region says the note's words, not a second
    // sentence for the same fact.
    expect(document.activeElement).toBe(sendControl());
    // MUTATION (floor-detail/unsent-region-variant-by-trigger): the region's variant from the tapped
    // door — a cash tap says "send them first, then take payment" under a note offering removal; red.
    expect(orderRegion().textContent).toBe(noteText(true));
  });

  it("a RACED refusal on a card-on-file running bill says the running bill's sentence beside the reader and inside the cash sheet", async () => {
    const SECURE_SENT: TableDetail = { ...SETTLEABLE, tab: "secure" };
    answer = () => Promise.resolve({ kind: "detail", detail: SECURE_SENT });
    settleCard.mockResolvedValueOnce(refusal(2));
    mountWith(SECURE_SENT, { terminalReady: true });
    await act(async () => {
      fireEvent.click(settleButtons()[2]!);
    });
    // MUTATION (floor-detail/unsent-reader-variant-not-passed): `running` not handed to the reader —
    // its raced line says the table's sentence under the running bill's; red.
    const readerLine = [...settleSection().querySelectorAll("p")].find(
      (p) => saysUnsent(p) && p.id !== "settle-unsent-note",
    );
    expect(readerLine?.textContent).toBe(noteText(true));
    expect(orderRegion().textContent).toBe(noteText(true));
    cleanup();
    settleCash.mockResolvedValueOnce(refusal(2));
    mountWith(SECURE_SENT);
    fireEvent.click(settleButtons()[1]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    // MUTATION (floor-detail/unsent-cash-variant-not-passed): `running` not handed to cash; red.
    expect(within(dialog).getByRole("alert").textContent).toBe(noteText(true));
  });

  it("the jump puts the fix in view: the Send centred, the order heading at the TOP (its lines below it)", async () => {
    const calls: { id: string; block: unknown }[] = [];
    const proto = Element.prototype as unknown as { scrollIntoView?: unknown };
    const had = Object.prototype.hasOwnProperty.call(proto, "scrollIntoView");
    const prior = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element, o?: ScrollIntoViewOptions) {
      calls.push({ id: this.id || this.className, block: o?.block });
    };
    try {
      const SECURE: TableDetail = { ...UNSENT, tab: "secure" };
      answer = () => Promise.resolve({ kind: "detail", detail: SECURE });
      mountWith(SECURE);
      const [close, cash] = settleButtons();
      await act(async () => {
        fireEvent.click(close!);
      });
      // MUTATION (floor-detail/unsent-lines-jump-centred): centre the heading too — on a phone with
      // a long order half the screen above it is spent on the table card, and the reason below it
      // is pushed further off; red.
      expect(calls).toEqual([{ id: "order-h", block: "start" }]);
      calls.length = 0;
      await act(async () => {
        fireEvent.click(cash!);
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.block).toBe("center");
      expect(calls[0]!.id).not.toBe("order-h");
    } finally {
      if (had) proto.scrollIntoView = prior;
      else delete proto.scrollIntoView;
    }
  });
});

// ── Phase 2c · review fixes · reg2 ──
describe("FloorDetailLive — a refusal's figure is settled by the page's NEXT read, not only by its figure (R1)", () => {
  /** A promise the case resolves by hand — a detail read still in the air. */
  function held() {
    let resolve!: (r: TableDetailResult) => void;
    const promise = new Promise<TableDetailResult>((r) => (resolve = r));
    return { promise, resolve };
  }
  const movedLine = (from: string, to: string) =>
    tf("en", "settle.cash.moved", { old: from, m: to });
  const moved = { ok: false, code: "moved", totalCents: 4265, error: "moved" };

  // The guest adds a drink (the server refuses the $42.10 tap at $42.65) and removes it before the
  // page re-reads. Read #1 is IN THE AIR when the refusal comes back — it may predate the drink, so
  // it settles nothing; read #2 began after the refusal and reads $42.10 again: THAT is the truth.
  it("the cash sheet: read #1 (in the air at the refusal) keeps the server's figure; read #2 says the move back", async () => {
    let answerSettle!: (v: unknown) => void;
    settleCash.mockImplementationOnce(() => new Promise((r) => (answerSettle = r)));
    mountWith(SETTLEABLE);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = () =>
      within(dialog)
        .getAllByRole("button")
        .find((b) => b.classList.contains("ui-btn-primary"))!;
    const r1 = held();
    const r2 = held();
    let n = 0;
    answer = () => (++n === 1 ? r1.promise : r2.promise);
    await act(async () => {
      fireEvent.click(take());
    });
    await tick(5000); // read #1 starts — in the air
    await act(async () => {
      answerSettle(moved);
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(movedLine("$42.10", "$42.65"));
    await tick(400); // the refusal's re-read is queued behind read #1
    await act(async () => {
      r1.resolve({ kind: "detail", detail: { ...SETTLEABLE } });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2c-reg2/floor-cash-reads-started-dropped): the page hands no read clock's
    // "started" mark — the refusal is marked with the committed ticket, read #1 settles it, and a
    // false "changed from $42.65 to $42.10" is said over the server's own figure; red.
    expect(within(dialog).getByRole("alert").textContent).toBe(movedLine("$42.10", "$42.65"));
    expect(take().textContent).toContain("$42.65");
    await act(async () => {
      r2.resolve({ kind: "detail", detail: { ...SETTLEABLE } });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2c-reg2/floor-cash-read-ticket-dropped): the page hands no ticket — the quote
    // sticks on $42.65 forever while the table is $42.10 again; red.
    expect(within(dialog).getByRole("alert").textContent).toBe(movedLine("$42.65", "$42.10"));
  });

  it("the card-on-file close: read #1 keeps the trigger on the server's figure; read #2 puts $42.10 back", async () => {
    let answerClose!: (v: unknown) => void;
    closeSecureTab.mockImplementationOnce(() => new Promise((r) => (answerClose = r)));
    const SECURE: TableDetail = { ...SETTLEABLE, tab: "secure" };
    mountWith(SECURE);
    const trigger = () => settleButtons()[0]!;
    fireEvent.click(trigger());
    const r1 = held();
    const r2 = held();
    let n = 0;
    answer = () => (++n === 1 ? r1.promise : r2.promise);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.10/ }));
    });
    await tick(5000); // read #1 starts — in the air
    await act(async () => {
      answerClose(moved);
    });
    expect(trigger().textContent).toContain("$42.65");
    await tick(400);
    await act(async () => {
      r1.resolve({ kind: "detail", detail: { ...SECURE } });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2c-reg2/floor-close-reads-started-dropped): read #1 settles the refusal; red.
    expect(trigger().textContent).toContain("$42.65");
    await act(async () => {
      r2.resolve({ kind: "detail", detail: { ...SECURE } });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2c-reg2/floor-close-read-ticket-dropped): the trigger stays $42.65; red.
    expect(trigger().textContent).toContain("$42.10");
  });
});

describe("FloorDetailLive — a lost counter cash settle's 'most likely went through' is bounded (R2)", () => {
  const COUNTER: TableDetail = {
    ...SETTLEABLE,
    label: "reg-7f3a",
    tableNumber: null,
    mode: "pickup",
    counterOrder: true,
  };
  /** A counter cash settle whose response is lost, then Cancel — the order still reads open. */
  async function lostThenCancel(extra: { terminalReady?: boolean } = {}) {
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    answer = () => Promise.resolve({ kind: "detail", detail: { ...COUNTER } });
    mountWith(COUNTER, extra);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(ts("en", "settle.cash.unknown"));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await tick(400); // the lost settle's re-read: the order is still open
  }
  const unknownNotice = () =>
    screen.queryByRole("region", { name: ts("en", "settle.cash.unknownClosed") });

  it("the READER takes the payment afterwards: its close is the reader's paid card, never 'the payment most likely went through'", async () => {
    await lostThenCancel({ terminalReady: true });
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_9", totalCents: 4210 });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00c0ffee",
      totalCents: 4210,
    });
    await act(async () => {
      fireEvent.click(settleButtons()[1]!); // Card on the reader
    });
    await tick(0);
    await tick(0);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION (p2c-reg2/floor-unknown-survives-the-reader): keep the mark when the reader starts —
    // the reader's own close is announced as the lost CASH settle having most likely gone through,
    // and "find it on the floor before taking payment again" sends the cashier hunting; red.
    expect(unknownNotice()).toBeNull();
    // The reader's paid card holds the bounce, as it always did.
    expect(screen.getByRole("region", { name: /Paid/ })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("cancelled, and the order closes long after the settle could have landed (cleared from another tablet): back to the floor, no claim", async () => {
    await lostThenCancel();
    // Reads keep showing the order OPEN past the freeze's lifetime — the settle never landed.
    await tick(SETTLE_TTL_MS + 5000);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION (p2c-reg2/floor-unknown-never-read-out): the page never runs the reads through
    // `settleUnknownAfterRead` — the close is held and said as "most likely went through"; red.
    expect(unknownNotice()).toBeNull();
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
    vi.restoreAllMocks();
  });

  it("a read that STARTED inside the window proves nothing, even when it answers after it", async () => {
    await lostThenCancel(); // the mark is set at T; we are at T+400, every read so far "open"
    await tick(SETTLE_TTL_MS - 10_000 - 400); // T + TTL − 10s
    let answerA!: (r: TableDetailResult) => void;
    let answerB!: (r: TableDetailResult) => void;
    let n = 0;
    answer = () =>
      new Promise<TableDetailResult>((r) => {
        if (++n === 1) answerA = r;
        else answerB = r;
      });
    await tick(5000); // read A starts within 5s — inside the window — and hangs
    await tick(6000); // T + TTL + 1s: A still in the air; the polls queue one more read
    await act(async () => {
      answerA({ kind: "detail", detail: { ...COUNTER } }); // A answers "open", after the window
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      answerB({ kind: "closed" });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2c-reg2/floor-unknown-read-timed-at-its-answer): time the read by when it ANSWERED
    // — read A (begun inside the window) clears the mark, and a settle that landed after A's
    // snapshot is then bounced to the floor as if nothing had happened; red.
    expect(unknownNotice()).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("reads that show the order PAID never clear it, however late — that is a landed settle", async () => {
    await lostThenCancel();
    // The settle landed; the counter session's own close is late (its after() missed).
    answer = () =>
      Promise.resolve({ kind: "detail", detail: { ...COUNTER, cartId: null, settled: true } });
    await tick(SETTLE_TTL_MS + 5000);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION (p2c-reg2/floor-unknown-cleared-by-a-paid-read): read every detail as an open cart —
    // the paid reads clear the mark and the landed settle's close bounces the cashier to the floor
    // with the #CODE never shown; red.
    expect(unknownNotice()).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("a close INSIDE that window is still held and said (the settle may have landed)", async () => {
    await lostThenCancel();
    await tick(60_000);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION (p2c-reg2/floor-unknown-cleared-by-any-open-read): the reads right after the rejection
    // clear the mark — a late-landing settle's close bounces the cashier to the floor; red.
    expect(unknownNotice()).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("#334 sequence b: the page's read cleared the lost settle, a NEW attempt went out and was REFUSED late — the close is the ordinary close", async () => {
    await lostThenCancel(); // A's answer lost at T, the sheet cancelled
    // Reads keep showing the order OPEN past A's window: A never landed (the page's mark clears).
    await tick(SETTLE_TTL_MS + 5000);
    // C: the sheet again, Take, and no answer at the bound — the page holds again.
    let resolveC: (v: unknown) => void = () => {};
    settleCash.mockReturnValueOnce(
      new Promise((r) => {
        resolveC = r;
      }),
    );
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.classList.contains("ui-btn-primary"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    await tick(STAFF_HANG_MS);
    // C's late answer: refused — nothing recorded, and A was already proved never to have landed.
    await act(async () => {
      resolveC({ ok: false, error: "Couldn’t take it." });
      await vi.advanceTimersByTimeAsync(0);
    });
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION till-ui/host-read-not-asked (judged here too): the till never applies the page's
    // open read, keeps A's doubt, never hands up `false` — and a colleague's close is said as "the
    // payment most likely went through" over a settle the server refused; red.
    expect(unknownNotice()).toBeNull();
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
    vi.restoreAllMocks();
  });
});

describe("FloorDetailLive — the reader's money status is never masked by a stale refusal (R3)", () => {
  it("a line-edit refusal standing in the region gives way when the reader starts speaking — and to each status after", async () => {
    // A to-go draft keeps a stepper on screen without gating the settle (it cooks at payment).
    const TOGO: TableDetail = {
      ...SETTLEABLE,
      lines: [{ ...line("l1", "Mohinga"), fulfillment: "togo" }],
      itemCount: 1,
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 1,
        inKitchen: false,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    };
    answer = () => Promise.resolve({ kind: "detail", detail: { ...TOGO } });
    staffSetQty.mockResolvedValue({ ok: false, error: "That line just changed." });
    mountWith(TOGO, { terminalReady: true });
    const inc = document
      .getElementById("order-h")!
      .closest("section")!
      .querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await tick(0);
    expect(orderRegion().textContent).toBe("That line just changed.");
    // The cashier moves on to the reader.
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_3", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    await tick(0);
    await tick(0);
    // MUTATION (p2c-reg2/floor-reader-status-under-a-stale-refusal): the status leaves the refusal
    // standing — it outranks the reader, so a screen-reader cashier never hears "Waiting for the
    // guest…", nor later "The payment didn't go through" / "Don't charge again"; red.
    expect(orderRegion().textContent).toBe(ts("en", "settle.reader.status.waiting"));
    // The next status is heard too (the charge is declined).
    terminalStatus.mockResolvedValue({ ok: true, state: "failed", error: null });
    await tick(5000);
    expect(orderRegion().textContent).toBe(ts("en", "settle.reader.status.failed"));
    expect(polite()).toHaveLength(1);
  });
});

describe("FloorDetailLive — the programmatic focus landings keep the focus ring (R4)", () => {
  it("neither the settle heading (?settle=1) nor the order heading (its fallback, the catch-all, the gate's jump) suppresses the outline inline", async () => {
    mountWith(SETTLEABLE, { focusSettle: true });
    await tick(0);
    expect(document.activeElement).toBe(document.getElementById("settle-h"));
    // An inline `outline: none` outranks the global `:focus-visible` rule, so a keyboard cashier
    // landing here saw no ring at all (WCAG 2.4.7). The ring itself is globals.css's :focus-visible.
    for (const id of ["settle-h", "order-h"]) {
      const h = document.getElementById(id)!;
      expect(h.style.outline).toBe("");
      expect(h.style.outlineStyle).toBe("");
    }
  });
});

describe("FloorDetailLive — the full page never brings back a stashed paid card (Phase 2d · split)", () => {
  it("a stash for this table is the PANE's to restore; the page (a phone) keeps its card in memory", async () => {
    const { stashHandoff } = await import("@/lib/floor-pane");
    stashHandoff("s1", {
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: 0,
      tenderedCents: 5000,
      isCounter: false,
      cartId: null,
    });
    mountWith({ ...SETTLEABLE, cartId: null, settled: true });
    await tick(0);
    // MUTATION: restore in every variant — a reopened settled table on a phone shows an old
    // change-due card until Clear; red.
    // The table card names no #CODE; its change-due line is the tell ($50.00 − $42.10).
    expect(document.querySelector("main")!.textContent).not.toContain("$7.90");
  });
});

describe("FloorDetailLive — Phase 2f · a counter order paid at pickup", () => {
  beforeEach(() => {
    staffFireCart.mockReset();
    recordCounterNoShow.mockReset();
  });
  const togo = (id: string, name: string, state = "draft"): TableLineView => ({
    ...line(id, name),
    state: state as TableLineView["state"],
    sendable: false,
    fulfillment: "togo",
  });
  // A walk-up, named, two dishes not yet sent, nothing in the kitchen.
  const WALKUP: TableDetail = {
    ...DETAIL,
    label: "reg-ab12",
    tableNumber: null,
    mode: "pickup",
    members: [],
    hostPresent: false,
    counterOrder: true,
    counterArm: "walkup",
    customerName: "Aye",
    lines: [togo("l1", "Mohinga"), togo("l2", "Tea Leaf Salad")],
    settleTotalCents: 2598,
    settleTipBaseCents: 2400,
    send: {
      sendable: 0,
      staffAdded: 0,
      togoDraft: 0,
      inKitchen: false,
      foodDraft: true,
      counterDraft: 2,
      counterSentPastGrace: false,
    },
  };
  // One dish reached the kitchen unpaid (past its grace); one more to send.
  const UNPAID_MORE: TableDetail = {
    ...WALKUP,
    lines: [togo("l1", "Mohinga", "fired"), togo("l2", "Tea Leaf Salad")],
    unpaidSent: true,
    sentLineIds: ["l1"],
    droppedLineIds: ["l2"],
    mergeable: false,
    send: {
      ...WALKUP.send,
      inKitchen: true,
      counterDraft: 1,
      counterSentPastGrace: true,
    },
  };
  // Everything went to the kitchen unpaid.
  const ALL_SENT: TableDetail = {
    ...UNPAID_MORE,
    lines: [togo("l1", "Mohinga", "fired"), togo("l2", "Tea Leaf Salad", "in_progress")],
    sentLineIds: ["l1", "l2"],
    droppedLineIds: [],
    compedKitchenLineIds: [],
    send: {
      ...UNPAID_MORE.send,
      foodDraft: false,
      counterDraft: 0,
    },
  };
  const sendSlot = () => document.querySelector(".staff-send")!;
  const cash = () => settleButtons()[0]!;
  // The Send and every settle trigger: §20 — exactly ONE filled pill between them.
  const filled = () =>
    [
      ...sendSlot().querySelectorAll(".ui-btn-primary"),
      ...document
        .getElementById("settle-h")!
        .closest("section")!
        .querySelectorAll(".ui-btn-primary"),
    ].filter((b) => b.closest('[role="dialog"]') === null);

  it("a walk-up with nothing sent: the Send is SECONDARY and Take payment the one primary", () => {
    mountWith(WALKUP);
    const send = sendSlot().querySelector("button")!;
    expect(send.textContent).toBe(ts("en", "table.send.cta.counter.many").replace("{n}", "2"));
    expect(send.className).toContain("ui-btn-secondary");
    expect(cash().className).toContain("ui-btn-primary");
    expect(filled()).toHaveLength(1);
  });

  it("a PHONE order leads with the Send; Take payment steps back", () => {
    mountWith({ ...WALKUP, counterArm: "phone" });
    expect(sendSlot().querySelector("button")!.className).toContain("ui-btn-primary");
    expect(cash().className).toContain("ui-btn-secondary");
    expect(filled()).toHaveLength(1);
  });

  it("more to send after food went unpaid: the Send is the ONE primary", () => {
    mountWith(UNPAID_MORE);
    expect(sendSlot().querySelector("button")!.className).toContain("ui-btn-primary");
    expect(cash().className).toContain("ui-btn-secondary");
    expect(filled()).toHaveLength(1);
  });

  it("everything sent unpaid: a status row, and Take payment is the ONE primary", () => {
    mountWith(ALL_SENT);
    expect(sendSlot().querySelector("button")).toBeNull();
    expect(sendSlot().textContent).toContain(ts("en", "table.send.counterSent"));
    expect(cash().className).toContain("ui-btn-primary");
    expect(filled()).toHaveLength(1);
  });

  it("sent unpaid with a draft LEFT under a parked switch: the row names what is NOT sent", () => {
    mountWith({ ...UNPAID_MORE, payAtPickup: false });
    expect(sendSlot().querySelector("button")).toBeNull();
    expect(sendSlot().textContent).toContain(
      ts("en", "table.send.counterSent.partial.one").replace("{n}", "1"),
    );
    expect(sendSlot().textContent).not.toContain(ts("en", "table.send.counterSent"));
  });

  it("while this device's undo window is open, NOTHING is filled", async () => {
    staffFireCart.mockResolvedValueOnce({
      ok: true,
      fired: 1,
      undoUntil: new Date(Date.now() + 10_000).toISOString(),
      serverNow: new Date(Date.now()).toISOString(),
      undoBatch: "b1",
    });
    answer = () =>
      Promise.resolve({ kind: "detail", detail: { ...UNPAID_MORE, counterArm: "phone" } });
    mountWith({ ...WALKUP, counterArm: "phone" });
    await act(async () => {
      fireEvent.click(sendSlot().querySelector("button")!);
    });
    await tick(0);
    expect(sendSlot().textContent).toContain(ts("en", "table.send.undo"));
    expect(filled()).toHaveLength(0);
  });

  it("food in the kitchen unpaid: the name leads, the Unpaid flag shows, No-show replaces Clear, no Merge", () => {
    mountWith(UNPAID_MORE);
    const main = document.querySelector("main")!;
    expect(main.querySelector(".table-detail-name")!.textContent).toBe("Aye");
    expect(main.textContent).toContain(ts("en", "settle.unpaid"));
    expect(screen.getByRole("button", { name: ts("en", "table.noshow.btn") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: ts("en", "settle.clear.btn") })).toBeNull();
    expect(screen.queryByRole("button", { name: /Merge with another table/ })).toBeNull();
  });

  it("No-show's dropped sentence reads the server's droppedLineIds, threaded through (Codex r2 on #308)", async () => {
    // A comped in-grace dish (3): only the server's set knows it is dropped — the line view carries
    // no fire_at. The draft l2 (1) rides the same set. 4 dropped units, not 1 and not 0.
    mountWith({
      ...UNPAID_MORE,
      lines: [
        ...UNPAID_MORE.lines,
        { ...togo("c2", "Shan noodles", "fired"), qty: 3, comped: true },
      ],
      droppedLineIds: ["l2", "c2"],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "table.noshow.btn") }));
    });
    await tick(0);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(
      ts("en", "table.noshow.body.drafts.many").replace("{n}", "4"),
    );
  });

  it("a counter order with drafts only keeps Clear AND Merge, and no Unpaid flag", () => {
    mountWith(WALKUP);
    expect(screen.getByRole("button", { name: ts("en", "settle.clear.btn") })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Merge with another table/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: ts("en", "table.noshow.btn") })).toBeNull();
    expect(document.querySelector("main")!.textContent).not.toContain(ts("en", "settle.unpaid"));
  });

  it("no name: the Send refuses, its hint links to the name field, and a tap takes focus there", async () => {
    mountWith({ ...WALKUP, customerName: null });
    const send = sendSlot().querySelector("button")!;
    expect(send.getAttribute("aria-disabled")).toBe("true");
    const link = document.getElementById("send-name-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/staff/table/s1/add?name=1");
    await act(async () => {
      fireEvent.click(send);
    });
    expect(staffFireCart).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(link);
  });

  it("a SERVER no-name verdict: focus reaches “Add a name →” once the refreshed view draws it (PT-6)", async () => {
    // The view still reads a name (it was cleared on another device after this read), so the Send is
    // live and the link is not drawn; the server refuses the fire, and the refresh shows no name.
    staffFireCart.mockResolvedValueOnce({ ok: false, reason: "noName" });
    answer = () => Promise.resolve({ kind: "detail", detail: { ...WALKUP, customerName: null } });
    mountWith(WALKUP);
    expect(document.getElementById("send-name-link")).toBeNull();
    const send = sendSlot().querySelector("button")!;
    await act(async () => {
      fireEvent.click(send);
    });
    await tick(0);
    expect(staffFireCart).toHaveBeenCalledTimes(1);
    // MUTATION (p2f-sr-sheet/name-focus/owed-focus-dropped): focus stays on the Send / <body> — red.
    expect(document.activeElement?.id).toBe("send-name-link");
  });

  it("a read already on the wire at the no-name verdict does not settle it; the read after it does", async () => {
    // A poll starts BEFORE the tap and hangs; it answers (name still present — it predates the
    // clear) after the verdict. Only the Send's refresh, which starts after, may pay the focus.
    let answerStale: (r: TableDetailResult) => void = () => {};
    answer = () => new Promise<TableDetailResult>((r) => (answerStale = r));
    staffFireCart.mockResolvedValueOnce({ ok: false, reason: "noName" });
    mountWith(WALKUP);
    await tick(5000); // the poll is on the wire
    answer = () => Promise.resolve({ kind: "detail", detail: { ...WALKUP, customerName: null } });
    await act(async () => {
      fireEvent.click(sendSlot().querySelector("button")!);
    });
    await act(async () => {
      answerStale({ kind: "detail", detail: WALKUP });
    });
    await tick(0);
    // MUTATION (p2f-sr-sheet/name-focus/stale-read-pays): the stale read drops the debt — red.
    expect(document.activeElement?.id).toBe("send-name-link");
  });

  it("a server no-name whose refresh shows the name BACK owes nothing: a later no-name read never steals focus", async () => {
    staffFireCart.mockResolvedValueOnce({ ok: false, reason: "noName" });
    // The refresh after the verdict still reads the name (it came back): nothing to focus.
    answer = () => Promise.resolve({ kind: "detail", detail: WALKUP });
    mountWith(WALKUP);
    await act(async () => {
      fireEvent.click(sendSlot().querySelector("button")!);
    });
    await tick(0);
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    // Much later a poll shows the name gone: the link draws, but no debt is left to move focus.
    answer = () => Promise.resolve({ kind: "detail", detail: { ...WALKUP, customerName: null } });
    await tick(5000);
    expect(document.getElementById("send-name-link")).not.toBeNull();
    // MUTATION (p2f-sr-sheet/name-focus/debt-never-dropped): the stale debt steals focus — red.
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("No-show's kitchen-screen clause reads the server's compedKitchenLineIds, threaded through", async () => {
    mountWith({
      ...UNPAID_MORE,
      lines: [...UNPAID_MORE.lines, { ...togo("c1", "Tea", "fired"), qty: 2, comped: true }],
      compedKitchenLineIds: ["c1"],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "table.noshow.btn") }));
    });
    await tick(0);
    const dialog = document.querySelector('[role="dialog"]')!;
    // MUTATION (p2f-sr-sheet/comped/floor-detail-drops-the-set): no clause — red.
    expect(dialog.textContent).toContain(
      ts("en", "table.noshow.body.comped.many").replace("{n}", "2"),
    );
  });

  it("a cash settle of an order sent unpaid carries that to the paid card (hand it over from the lane)", async () => {
    settleCash.mockResolvedValueOnce({
      ok: true,
      orderId: "o-00a1b2c3",
      totalCents: 2598,
      tipCents: 0,
    });
    mountWith(ALL_SENT);
    fireEvent.click(cash());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    await tick(0);
    expect(document.getElementById("handoff-sent-early")!.textContent).toBe(
      ts("en", "table.detail.handoff.sentEarly"),
    );
  });

  it("a table page is untouched: a dine-in Send keeps its words and its primary", () => {
    mountWith(DETAIL);
    expect(sendSlot().querySelector("button")!.textContent).toBe(
      ts("en", "table.send.cta.many").replace("{n}", "2"),
    );
    expect(document.querySelector(".table-detail-name")).toBeNull();
  });

  // ── Phase 2g · P2fk — the order nobody collected ──
  const uncollectedWords = tf(
    "en",
    COUNTER_UNCOLLECTED_HOURS === 1
      ? "table.detail.uncollected.one"
      : "table.detail.uncollected.many",
    { n: COUNTER_UNCOLLECTED_HOURS },
  );
  it("an uncollected counter order says so ABOVE the No-show choice — a fact, not a live region", () => {
    // p2g-uncollected/detail/note-dropped
    mountWith({ ...ALL_SENT, counterUncollected: true });
    const note = document.querySelector<HTMLElement>("[data-uncollected]")!;
    expect(note.textContent).toBe(uncollectedWords);
    expect(note.getAttribute("role")).toBeNull();
    expect(note.closest('[role="status"], [aria-live]')).toBeNull();
    const noShow = screen.getByRole("button", { name: ts("en", "table.noshow.btn") });
    // DOCUMENT_POSITION_FOLLOWING: the button comes after the note it informs
    expect(note.compareDocumentPosition(noShow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("…and above Clear on a comped-only order (nothing owed, nothing to write off)", () => {
    mountWith({ ...WALKUP, counterUncollected: true });
    const note = document.querySelector<HTMLElement>("[data-uncollected]")!;
    const clear = screen.getByRole("button", { name: ts("en", "settle.clear.btn") });
    expect(note.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("not while a payment is moving on it — the guest may be at the counter paying right now", () => {
    // p2g-fix/uncollected-note-while-paying (Phase 2g review, PT-6)
    mountWith({ ...ALL_SENT, counterUncollected: true, paymentInFlight: true });
    expect(document.querySelector("[data-uncollected]")).toBeNull();
  });

  it("absent or false — and never on a table — reads as not uncollected: no note", () => {
    mountWith(ALL_SENT);
    expect(document.querySelector("[data-uncollected]")).toBeNull();
    cleanup();
    mountWith({ ...ALL_SENT, counterUncollected: false });
    expect(document.querySelector("[data-uncollected]")).toBeNull();
    cleanup();
    mountWith({ ...DETAIL, counterUncollected: true });
    expect(document.querySelector("[data-uncollected]")).toBeNull();
    expect(document.querySelector("main")!.textContent).not.toContain(uncollectedWords);
  });
});

// ── Phase 2g · reader (P2em · P2en) ── the collect outlives the page that started it. Both cases were
// written FIRST against the pre-2g page (the collect in this component's own state) and watched
// red there: "← Floor" mid-collect stopped the poll (3 calls expected, 0 made), and a start
// answering after the page left never polled at all.
describe("FloorDetailLive — the reader collect outlives the page (P2em · P2en)", () => {
  const COUNTER: TableDetail = {
    ...SETTLEABLE,
    label: "reg-7f3a",
    tableNumber: null,
    mode: "pickup",
    counterOrder: true,
    unpaidSent: true,
  };
  function Harness({ show, initial = SETTLEABLE }: { show: boolean; initial?: TableDetail }) {
    return (
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          {show ? <FloorDetailLive initial={initial} sessionId="s1" terminalReady /> : <p>floor</p>}
        </ReaderCollectProvider>
      </StaffLangProvider>
    );
  }

  it("← Floor mid-collect: the poll keeps answering, and back on the table the panel is there again", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const r = render(<Harness show />);
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    await tick(0);
    expect(terminalStatus).toHaveBeenCalled();
    r.rerender(<Harness show={false} />);
    const before = terminalStatus.mock.calls.length;
    await tick(7500);
    expect(terminalStatus.mock.calls.length).toBe(before + 3);
    // Back to the table (the cart is frozen now): the panel re-attaches — the settle button does not
    // come back over a live collect.
    answer = () =>
      Promise.resolve({ kind: "detail", detail: { ...SETTLEABLE, paymentInFlight: true } });
    r.rerender(<Harness show initial={{ ...SETTLEABLE, paymentInFlight: true }} />);
    await tick(0);
    expect(screen.getByRole("group", { name: ts("en", "settle.a11y.readerPanel") })).toBeTruthy();
    expect(orderRegion().textContent).toBe(ts("en", "settle.reader.status.waiting"));
  });

  it("a start answering after the page left still polls (P2en), and a counter landing leaves its card for the table", async () => {
    let ok!: (v: unknown) => void;
    settleCard.mockReturnValueOnce(new Promise((res) => (ok = res)));
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const r = render(<Harness show initial={COUNTER} />);
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    r.rerender(<Harness show={false} />);
    await act(async () => {
      ok({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    });
    await tick(2500);
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s1", paymentIntentId: "pi_1" });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    // The card the cashier hands the bag over by — with the TAP's "went out unpaid".
    const stashed = JSON.parse(sessionStorage.getItem(handoffStashKey("s1"))!);
    expect(stashed).toMatchObject({ orderId: "o-00a1b2c3", isCounter: true, sentEarly: true });
  });

  it("a TABLE charge landing on screen re-reads the page's own detail — no card, never a router.refresh", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(<Harness show />);
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    await tick(0);
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-2",
      totalCents: 4210,
    });
    const before = getTableDetail.mock.calls.length;
    await tick(2500);
    await tick(400);
    // MUTATION (p2c-register/reader-landed-no-page-reread, re-anchored): the landing hands the page
    // nothing to re-read on — it shows its live settle state for up to a poll interval; red.
    expect(getTableDetail.mock.calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a counter order closing while its reader still collects is HELD on screen (the poll will land its card)", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(<Harness show initial={COUNTER} />);
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    await tick(0);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    // MUTATION (p2g-reader/bounce-ignores-the-collect): the bounce held only by a card — the
    // webhook's close yanks the cashier to the floor before the #CODE ever lands; red.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: ts("en", "settle.a11y.readerPanel") })).toBeTruthy();
  });

  it("a counter charge landing on screen: the page adopts the card (focused), and the bounce holds", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(<Harness show initial={COUNTER} />);
    await act(async () => {
      fireEvent.click(settleButtons()[1]!);
    });
    await tick(0);
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    // MUTATION (p2g-reader/detail-ignores-the-landed-card): the page never adopts the landing — the
    // counter order closes behind its charge with no #CODE on the screen that took it; red.
    const card = screen.getByRole("region", { name: /Paid.*#A1B2C3/ });
    expect(document.activeElement).toBe(card);
    answer = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    expect(replace).not.toHaveBeenCalled();
  });
});

// ── Phase 2g · P2em (D2) ── a SETTLED counter order's #CODE card, built on the server from its paid
// row: the session the webhook's best-effort close left active shows its card here, with no panel and
// no stash. This tab's own card (the tender, the change) wins wherever it stands.
describe("FloorDetailLive — a settled counter order's server-built #CODE card (P2em · D2)", () => {
  const SERVER_CARD = {
    orderId: "o-00a1b2c3",
    totalCents: 4210,
    tipCents: 0,
    tenderedCents: null,
    isCounter: true,
    cartId: "c1",
    sentEarly: false,
  };
  const COUNTER: TableDetail = {
    ...SETTLEABLE,
    label: "reg-7f3a",
    tableNumber: null,
    mode: "pickup",
    counterOrder: true,
  };
  const SETTLED: TableDetail = {
    ...COUNTER,
    settled: true,
    cartId: null,
    settleTotalCents: null,
    status: "paid",
    paidTotalCents: 4210,
    paidOrderId: "o-00a1b2c3",
    refund: { state: "none", refundedCents: 0, netPaidCents: 4210 },
    settledOrderCount: 1,
    serverHandoff: SERVER_CARD,
  };

  it("with no card of its own, the page shows the server's — named by its facts, and NOT focused", async () => {
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLED });
    mountWith(SETTLED);
    await tick(0);
    // MUTANT p2g-code/detail-ignores-server-card — the settled counter order reads "Paid $42.10"
    // with no #CODE anywhere on the screen the bag is handed over from; red.
    const card = screen.getByRole("region", { name: /Paid.*\$42\.10.*#A1B2C3/ });
    expect(card.textContent).toContain(ts("en", "table.detail.handoff.callout"));
    // MUTANT p2g-code/server-card-steals-focus — a card FOUND on arrival is not a settle that just
    // landed: focus stays where the person put it; red.
    expect(document.activeElement).not.toBe(card);
    await tick(5000);
    expect(document.activeElement).not.toBe(card);
    // Never a second polite region (P2r).
    expect(polite()).toHaveLength(1);
  });

  it("this tab's card WINS over the server's — the cash settle's change stays on screen", async () => {
    settleCash.mockResolvedValueOnce({
      ok: true,
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: 0,
    });
    mountWith(COUNTER);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.change(document.getElementById("cash-tendered") as HTMLInputElement, {
      target: { value: "50" },
    });
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    await tick(0);
    // The settle's re-read: the order is paid, and its close was missed — the server's card rides it.
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLED });
    await tick(400);
    await tick(5000);
    // MUTANT p2g-code/detail-server-card-beats-client — the server card (no tender) replaces the
    // cashier's: "Change $7.90" disappears from under the hand counting it out; red.
    const card = screen.getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ });
    expect(card).toBeTruthy();
  });

  it("no server card in the detail (a table, an open cart, money that came back): no card", () => {
    mountWith({ ...SETTLED, serverHandoff: null });
    expect(screen.queryByRole("region", { name: /#A1B2C3/ })).toBeNull();
  });

  // ── Phase 2g · review (M2 · PT-3) ── the server's refund verdict VETOES this tab's card.
  async function cashCardOnScreen() {
    settleCash.mockResolvedValueOnce({
      ok: true,
      orderId: "o-00a1b2c3",
      totalCents: 4210,
      tipCents: 0,
    });
    mountWith(COUNTER);
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.change(document.getElementById("cash-tendered") as HTMLInputElement, {
      target: { value: "50" },
    });
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    await tick(0);
    answer = () => Promise.resolve({ kind: "detail", detail: SETTLED });
    await tick(400);
    await tick(5000);
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ })).toBeTruthy();
    expect(sessionStorage.getItem(handoffStashKey("s1"))).not.toBeNull();
  }

  it.each([
    [
      "partly (status still 'paid')",
      { state: "partial" as const, refundedCents: 1200, netPaidCents: 3010 },
      () => tf("en", "table.detail.refunded.partial", { m: "$30.10", r: "$12.00" }),
    ],
    [
      "in full",
      { state: "full" as const, refundedCents: 4210, netPaidCents: 0 },
      () => tf("en", "table.detail.refunded.full", { m: "$42.10" }),
    ],
  ])(
    "a refund of the card's OWN order, %s: no 'Paid' card over it, the refund said, the stash dropped",
    async (_, refund, said) => {
      await cashCardOnScreen();
      // A manager refunds it; the next read names the SAME order (`paidOrderId`) as refunded.
      answer = () =>
        Promise.resolve({
          kind: "detail",
          // The floor status stays "paid" (the chip reads the refund); the refund state is the
          // ONE derivation's (`summarizeRefund` — status 'refunded' or the amount, either way).
          detail: { ...SETTLED, serverHandoff: null, refund },
        });
      await tick(5000);
      // MUTANT p2g-fix-code/veto-ignored-on-detail — "this tab's card wins" outranks the refund:
      // "✓ Paid · Change $7.90 · #A1B2C3" stands over money that went back; red.
      expect(screen.queryByRole("region", { name: /#A1B2C3/ })).toBeNull();
      expect(document.querySelector("main")!.textContent).toContain(said());
      // MUTANT p2g-fix-code/detail-stash-kept-after-refund — the card's stash outlives the veto, and
      // the pane restores "Paid" over the refund on the next visit; red.
      expect(sessionStorage.getItem(handoffStashKey("s1"))).toBeNull();
    },
  );

  it("a refund of ANOTHER order, or an unknown refund state, never takes the card", async () => {
    await cashCardOnScreen();
    answer = () =>
      Promise.resolve({
        kind: "detail",
        detail: {
          ...SETTLED,
          paidOrderId: "o-0000new2",
          serverHandoff: null,
          refund: { state: "full", refundedCents: 4210, netPaidCents: 0 },
        },
      });
    await tick(5000);
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ })).toBeTruthy();
    answer = () => Promise.resolve({ kind: "detail", detail: { ...SETTLED, refund: null } });
    await tick(5000);
    expect(screen.getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ })).toBeTruthy();
    expect(sessionStorage.getItem(handoffStashKey("s1"))).not.toBeNull();
  });
});

describe("Phase 2i — the table's poll is a READ on the ledger", () => {
  it("a poll in flight never reads as a young write — a reload for a new build is not refused for it", async () => {
    answer = () => new Promise(() => {});
    mount();
    await tick(5_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // MUTATION (p2i-kind/floor-detail-poll): the race labels the poll a write; red.
    expect(youngWrite()).toBe(false);
  });
});

describe("Phase 2h (9f) — the table's poll never stacks a read behind a hung one", () => {
  it("a read hung for 60 s is ONE dispatch; the second miss arms the freeze; the answer kicks exactly one owed read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: (r: TableDetailResult) => void;
    const hung = new Promise<TableDetailResult>((r) => (release = r));
    getTableDetail.mockImplementationOnce(() => hung);
    mount();
    await tick(5_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    const notUpdating = ts("en", "out.head.notUpdating");
    await tick(14_998);
    expect(orderRegion().textContent).not.toContain(notUpdating);
    // At the bound: the race's give-up and the tick refused past it are TWO misses — the freeze.
    // MUTATION (p2h-boards/floor-detail/refused-tick-never-a-miss): only the race's miss counts; red.
    await tick(5_001);
    expect(orderRegion().textContent).toContain(notUpdating);
    // MUTATION (p2h-boards/floor-detail/poll-stacks · floor-detail/gate-watches-nothing): a read
    // per tick queued behind the hung one; red.
    await tick(38_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-boards/floor-detail/owed-read-never-kicked): nothing reads until the next
    // tick; red.
    await act(async () => {
      release({ kind: "detail", detail: DETAIL });
    });
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(orderRegion().textContent).not.toContain(notUpdating);
    await tick(1_000);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});

// ── Phase 2h · integration ─────────────────────────────────────────────────────────────────────────
function deferredOf<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// S2 critic D2's renderer half — a line edit whose write went past the bound said WRITE_WAITING in
// the order card's ONE region; its late SUCCESS says nothing through `onError`, so only the row's
// `onWaiting` edge can retract it. It stood (outranking the settle and frozen lines) until another
// setter happened by.
describe("Phase 2h · integration — a line edit's LATE answer and the region's 'no answer yet' (S2 critic D2)", () => {
  const waitingLine = () => ts("en", "out.write.waiting");
  const incOf = (name: string) => {
    const row = [...document.querySelectorAll("li")].find((li) => li.textContent?.includes(name))!;
    return row.querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
  };

  it("two rows' writes still out: the first late success keeps the line (the other may still save); the LAST retracts it", async () => {
    const one = deferredOf<{ ok: boolean; error?: string }>();
    const two = deferredOf<{ ok: boolean; error?: string }>();
    staffSetQty.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
    mount();
    await act(async () => {
      fireEvent.click(incOf("Mohinga"));
    });
    await act(async () => {
      fireEvent.click(incOf("Tea Leaf Salad"));
    });
    expect(staffSetQty).toHaveBeenCalledTimes(2);
    await tick(STAFF_HANG_MS);
    expect(orderRegion().textContent).toBe(waitingLine());
    await act(async () => one.resolve({ ok: true }));
    await tick(0);
    // MUTATION (p2h-int-a/line-waiting-forgets-the-others): the first answer retracts the line
    // while Tea Leaf Salad's change is still unanswered — "may still be saved" is still true of
    // it, and the region falls silent over it; red.
    expect(orderRegion().textContent).toBe(waitingLine());
    await act(async () => two.resolve({ ok: true }));
    await tick(0);
    // MUTATION (p2h-int-a/line-waiting-unwired): the detail hands the rows no `onWaiting` — "no
    // answer yet — that change may still be saved" stands over two changes that saved; red.
    expect(orderRegion().textContent).toBe("");
  });

  it("a LATE refusal says its own sentence first, and its waiting edge never wipes it — only 'no answer yet' is retracted", async () => {
    const one = deferredOf<{ ok: boolean; error?: string }>();
    staffSetQty.mockReturnValueOnce(one.promise);
    mount();
    await act(async () => {
      fireEvent.click(incOf("Mohinga"));
    });
    await tick(STAFF_HANG_MS);
    expect(orderRegion().textContent).toBe(waitingLine());
    await act(async () => one.resolve({ ok: false, error: "That line just changed." }));
    await tick(0);
    // MUTATION (p2h-int-a/line-waiting-wipes-any-line): the edge clears whatever the region says
    // — the refusal the late answer just said goes unread, and the dish looks saved; red.
    expect(orderRegion().textContent).toBe("That line just changed.");
  });
});

// Sheets residual 3 · boards P1 — the detail forwards a settle's outcome to the pane only once it
// UNMOUNTED (a mounted control says its own); `landed` (a late ok answering an `unknown`) follows the
// same rule through its own hand-up, and a detail that is GONE starts no read off a late hand-up.
describe("Phase 2h · integration — a settle answered late, after the detail left", () => {
  const OK = { ok: true as const, orderId: "o1", totalCents: 4210, tipCents: 0 };
  async function takeCash() {
    fireEvent.click(settleButtons()[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
  }
  function paneDetail() {
    const onLostWrite = vi.fn();
    const onLostLanded = vi.fn();
    const r = render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <FloorDetailLive
            initial={SETTLEABLE}
            sessionId="s1"
            onLostWrite={onLostWrite}
            onLostLanded={onLostLanded}
          />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    return { ...r, onLostWrite, onLostLanded };
  }

  it("unmounted mid-wait: 'we don't know' at the bound, then the late ok is handed up as landed — once, for this table", async () => {
    const late = deferredOf<typeof OK>();
    settleCash.mockReturnValueOnce(late.promise);
    const v = paneDetail();
    await takeCash();
    v.unmount(); // the pane moved on while the settle was out
    await tick(STAFF_HANG_MS);
    expect(v.onLostWrite).toHaveBeenCalledWith("s1", expect.anything(), "settleUnknown");
    expect(v.onLostLanded).not.toHaveBeenCalled();
    await act(async () => late.resolve(OK));
    // MUTATION (p2h-int-a/detail-landed-unforwarded): the landing dies with the detail — the pane's
    // "we don't know if the payment went through" stands over a payment that was recorded; red.
    // MUTATION (p2h-int-a/landed-said-as-refused): `landed` falls through to the refusal mapping —
    // the pane is told a payment that WENT THROUGH "didn't go through"; red (here, and below).
    expect(v.onLostLanded.mock.calls).toEqual([["s1", "paid"]]);
    expect(v.onLostWrite).toHaveBeenCalledTimes(1);
  });

  it("MOUNTED: a late ok is the control's own business — nothing is handed to the pane", async () => {
    const late = deferredOf<typeof OK>();
    settleCash.mockReturnValueOnce(late.promise);
    const v = paneDetail();
    await takeCash();
    await tick(STAFF_HANG_MS);
    expect(v.onLostWrite).not.toHaveBeenCalled();
    await act(async () => late.resolve(OK));
    // MUTATION (p2h-int-a/detail-landed-while-mounted): a mounted detail forwards its own landing —
    // the detail-to-pane contract ("only what no mounted region can say") breaks for the landing
    // alone; red.
    expect(v.onLostLanded).not.toHaveBeenCalled();
    expect(v.onLostWrite).not.toHaveBeenCalled();
  });

  it("a detail that is GONE starts no read: the settle's hand-up re-reads (at the bound, at the late ok) dispatch nothing (X1)", async () => {
    const late = deferredOf<typeof OK>();
    settleCash.mockReturnValueOnce(late.promise);
    const v = paneDetail();
    await takeCash();
    v.unmount();
    getTableDetail.mockClear();
    await tick(STAFF_HANG_MS + 1_000);
    // MUTATION (p2h-int-a/dead-detail-reads): the waiting arm's `onChanged` debounces a read on the
    // unmounted detail — dispatched into Next's one-at-a-time queue behind the very settle that is
    // hanging, for a table nobody is looking at; red.
    expect(getTableDetail).not.toHaveBeenCalled();
    await act(async () => late.resolve(OK));
    await tick(1_000);
    expect(getTableDetail).not.toHaveBeenCalled();
  });
});

describe("PD2 · PD6 — Dad's twin of the counter pass, one figure at the till, and a receipt that never sits on two bases", () => {
  const ASKED_AT = new Date(Date.parse(NOW) - 4 * 60_000).toISOString();
  const priced: Partial<TableDetail> = {
    send: { ...DETAIL.send, sendable: 0, staffAdded: 0, foodDraft: false, inKitchen: true },
    lines: [
      { ...line("l1", "Mohinga"), state: "fired", sendable: false },
      { ...line("l2", "Tea Leaf Salad"), state: "fired", sendable: false },
    ],
    settleTotalCents: 4641,
    settleTipBaseCents: 4200,
    settleBreakdown: {
      subtotalCents: 4200,
      discountCents: 0,
      serviceChargeCents: 0,
      taxCents: 441,
      tipCents: 0,
    },
  };
  const mountWith = (d: TableDetail) => {
    answer = () => Promise.resolve({ kind: "detail", detail: d });
    return render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <FloorDetailLive initial={d} sessionId="s1" />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
  };

  it("an ASKED table: the ONE PASS at the top, named by the ask (never the number twice), its age plain text, its total Take cash's figure", () => {
    mountWith({ ...DETAIL, ...priced, status: "counter", counterRequestedAt: ASKED_AT });
    const pass = screen.getByRole("region", { name: tf("en", "table.detail.counterAsk", {}) });
    // MUTATION pd2/ask-pass-redrawn (a plain card again): the guest and Dad hold two looks; red.
    expect(pass.classList.contains("ui-pass")).toBe(true);
    expect(pass.getAttribute("data-figure")).toBe("none");
    // The age is plain text in the status row (no escalation): "asked 4m ago".
    expect(pass.querySelector(".floor-ask-age")!.textContent).toBe("asked 4m ago");
    // ONE binding: the pass's total IS the trigger's figure. MUTATION pd2/ask-total-off-the-binding
    // (the lines' pre-tax $24.00): two figures for one bill; red.
    const total = pass.querySelector(".floor-ask-total dd")!.textContent;
    expect(total).toBe("$46.41");
    expect(
      screen.getByRole("button", { name: tf("en", "settle.cash.trigger", { m: "$46.41" }) }),
    ).toBeTruthy();
    // It sits ABOVE the order card (m2's one pane order).
    const order = document.getElementById("order-h")!;
    expect(pass.compareDocumentPosition(order) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No money row in the order card on an asked table: the pass carries the one figure (m2 B4).
    // MUTATION k44/receipt-on-an-asked-table → red.
    expect(order.closest("section")!.querySelector(".pad-receipts")).toBeNull();
    expect(document.body.textContent).not.toContain(ts("en", "table.detail.subtotalSoFar"));
  });

  it("K44 — an open table that has not asked: the receipt stack, its Total the very figure Take cash names; no pre-tax 'so far'", () => {
    mountWith({ ...DETAIL, ...priced });
    expect(document.querySelector(".floor-ask-pass")).toBeNull();
    const rows = [...document.querySelectorAll(".pad-receipts [data-row]")].map((r) => [
      r.getAttribute("data-row"),
      r.querySelector(".pad-receipt-amt")!.textContent,
    ]);
    // MUTATION k44/receipt-stack-dropped: the card names no money beside a tax-inclusive door; red.
    expect(rows).toEqual([
      ["subtotal", "$42.00"],
      ["tax", "$4.41"],
      ["total", "$46.41"],
    ]);
    expect(document.body.textContent).not.toContain(ts("en", "table.detail.subtotalSoFar"));
    expect(document.body.textContent).not.toContain(ts("en", "table.detail.pretaxNote"));
  });

  it("P2do (ruling #15) — an ASKED table's unsent dish wears the ring and says how long, as plain text; an un-asked one does not", () => {
    const unsent = {
      ...line("l1", "Mohinga"),
      createdAt: new Date(Date.parse(NOW) - 6 * 60_000).toISOString(),
    };
    mountWith({
      ...DETAIL,
      status: "counter",
      counterRequestedAt: ASKED_AT,
      lines: [unsent],
      itemCount: 1,
    });
    const lineItem = () =>
      within(screen.getByRole("list", { name: ts("en", "table.detail.a11y.lines") })).getByRole(
        "listitem",
      );
    const tag = lineItem().textContent!;
    expect(tag).toContain(`${ts("en", "pad.group.unsent")} · 6m ago`);
    // MUTATION pd1/line-tag-ring-dropped: the pane's line speaks another mark; red.
    expect(document.querySelector("li .staff-unsent-ring")).not.toBeNull();
    cleanup();
    mountWith({ ...DETAIL, lines: [unsent], itemCount: 1 });
    // MUTATION p2do/age-on-every-table: a "late"-looking clock on a table still choosing; red.
    expect(lineItem().textContent).not.toContain("6m ago");
  });
});
