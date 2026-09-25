/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { frozenBoardCopy } from "@/lib/staff-outage";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push }),
  usePathname: () => "/staff/table/s1",
}));
// Phase 2a · send — the table page now mounts the console's Send; its server action is inert here.
const staffFireCart = vi.fn();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (...a: unknown[]) => staffFireCart(...(a as [])),
  staffUndoFire: vi.fn(),
}));

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
  paymentHolder: null,
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
  send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
};
const mountWith = (
  initial: TableDetail,
  extra: { terminalReady?: boolean; focusSettle?: boolean } = {},
) =>
  render(
    <StaffLangProvider lang="en">
      <FloorDetailLive initial={initial} sessionId="s1" {...extra} />
    </StaffLangProvider>,
  );
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
  const COUNTER: TableDetail = { ...SETTLEABLE, label: "reg-7f3a", tableNumber: null };

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

  it("the reader's status is SAID through the page's one region, SHOWN in its panel with no region of its own", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    sessionStorage.setItem(
      "mms-terminal-collect:s1",
      JSON.stringify({ paymentIntentId: "pi_1", totalCents: 4210 }),
    );
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
  const COUNTER: TableDetail = { ...SETTLEABLE, label: "reg-7f3a", tableNumber: null };
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

  it("a later KNOWN answer releases the hold (a refused retry), so a genuine close bounces again", async () => {
    await lostSettle();
    // The retry is refused outright — a known outcome.
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
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
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
