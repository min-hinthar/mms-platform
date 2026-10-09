/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";

/**
 * PD8 — the flag at Take payment, RENDERED through the pane (the blind pass on #333: this wiring had
 * no suite). The page hands the cart's pending requests to `ApprovalFlagCard`; "Decide it here" opens
 * the centred sheet around the ONE decision; the triggers stay live at full ink and each tap sends
 * exactly the ids the card shows. Asserted as calls and DOM, never as the component's private state:
 *
 *  - the flag renders with its consequence, and Take cash is described by it, never dimmed;
 *  - Take cash acknowledges EXACTLY the displayed ids (the page's `pendingRequests` → the door);
 *  - a CHANGED request's sheet offers Close it, never Deny / Approve;
 *  - a REFUSAL keeps the sheet open with its reason — no "Updating the total…", no focus move;
 *  - an APPLIED approve closes it, focuses the settle heading and holds "Updating the total…" until
 *    a read that started after it lands — bounded at STAFF_HANG_MS; a deny moves no total;
 *  - the server's re-warning (`approval_pending`) re-draws the card and the next tap acknowledges it.
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
  listApprovers: () =>
    Promise.resolve([
      {
        staffId: "aye",
        displayName: "Aye",
        role: "manager",
        active: true,
        hasPin: true,
        self: false,
      },
    ]),
  voidLine: vi.fn(),
  recordCounterNoShow: (...a: unknown[]) => recordCounterNoShow(...(a as [])),
}));

type Resolve = { ok: true; decision: "approve" | "deny" | "close" } | { ok: false; reason: string };
const resolveApproval = vi.fn(
  (): Promise<Resolve> => Promise.resolve({ ok: false, reason: "error" }),
);
vi.mock("@/lib/approvals", () => ({
  resolveApproval: (...a: unknown[]) => resolveApproval(...(a as [])),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
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
  pendingRequests: [],
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
  resolveApproval.mockReset();
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
  sessionStorage.clear();
});

const FLAG = {
  id: "r-1",
  kind: "void" as const,
  lineId: "l1",
  lineName: "Mohinga",
  nameMy: null,
  qty: 1,
  amountCents: 1200,
  cooked: true,
  initiatorName: "Thiri",
  initiatorStaffId: "thiri",
  createdAt: "2026-09-24T17:50:00.000Z",
  lineNow: { qty: 1, unitPriceCents: 1200, offTheBill: false },
};
/** A table ready to settle (every dish sent, a quoted total) with one dish waiting for a manager. */
const FLAGGED: TableDetail = {
  ...DETAIL,
  settleTotalCents: 4210,
  settleTipBaseCents: 4000,
  lines: DETAIL.lines.map((l) => ({
    ...l,
    state: "fired",
    sendable: false,
    pendingApproval: l.id === "l1",
  })),
  send: {
    sendable: 0,
    staffAdded: 0,
    togoDraft: 0,
    inKitchen: true,
    foodDraft: false,
    counterDraft: 0,
    counterSentPastGrace: false,
  },
  pendingRequests: [FLAG],
};
const mountFlagged = (initial: TableDetail = FLAGGED) =>
  render(
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <FloorDetailLive initial={initial} sessionId="s1" />
      </ReaderCollectProvider>
    </StaffLangProvider>,
  );
const cashTrigger = () =>
  [...document.getElementById("settle-h")!.closest("section")!.querySelectorAll("button")].find(
    (b) => b.closest('[role="dialog"]') === null && b.classList.contains("ui-btn-primary"),
  )!;
async function takeCash() {
  await act(async () => {
    fireEvent.click(cashTrigger());
  });
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  const take = within(dialog)
    .getAllByRole("button")
    .find((b) => b.textContent?.startsWith("Take $"))!;
  await act(async () => {
    fireEvent.click(take);
  });
  await tick(0);
}
async function decideHere() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Decide it here/ }));
  });
  await tick(0); // the roster read lands: the one eligible signer arrives lit
}
const sheet = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

describe("PD8 — the flag at Take payment, through the pane", () => {
  it("renders the flag above the triggers; Take cash stays live, described by the consequence first", () => {
    mountFlagged();
    const card = document.querySelector(".settle-flag") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain(tf("en", "settle.flag.title", { x: "Mohinga" }));
    expect(card.textContent).toContain(tf("en", "settle.flag.consequence", { x: "Mohinga" }));
    const trigger = cashTrigger();
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")?.split(" ")[0]).toBe("flag-consequence");
  });

  it("Take cash acknowledges EXACTLY the ids the card shows", async () => {
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o-1", totalCents: 4210, tipCents: 0 });
    mountFlagged();
    await takeCash();
    // MUTATION (approval-ack/pane-acks-nothing · approval-ack/cash-trigger-acks-nothing): [] reaches
    // the action, and every tap with a flag up is refused `approval_pending`; red.
    expect(settleCash).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s1", acknowledgedApprovalIds: ["r-1"] }),
    );
  });

  it("a CHANGED request's sheet offers Close it — never Deny or Approve (the queue's own derivation)", async () => {
    mountFlagged({
      ...FLAGGED,
      pendingRequests: [{ ...FLAG, lineNow: { qty: 2, unitPriceCents: 1200, offTheBill: false } }],
    });
    await decideHere();
    const dlg = sheet()!;
    // MUTATION (pane/flag-state-always-open): the sheet offers Deny and Approve over a line that
    // moved — and Deny writes the `denied` record D2 retired; red.
    expect(within(dlg).getByRole("button", { name: /^Close it/ })).toBeTruthy();
    expect(within(dlg).queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(within(dlg).queryByRole("button", { name: /^Deny/ })).toBeNull();
    expect(dlg.textContent).toContain(
      tf("en", "table.appr.changed.note", { x: "Thiri", n: 2, m: "$24.00" }),
    );
  });

  it("a REFUSAL keeps the sheet open with its reason: no 'Updating the total…', no focus move", async () => {
    resolveApproval.mockResolvedValueOnce({ ok: false, reason: "changed" });
    mountFlagged();
    await decideHere();
    fireEvent.change(document.getElementById("appr-r-1-pin")!, { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(sheet()!).getByRole("button", { name: /^Approve/ }));
    });
    await tick(0);
    // MUTATION (pane/refusal-closes-the-sheet): the refusal unmounts the sheet and says the total is
    // updating, as if the void had applied; red.
    expect(sheet()).not.toBeNull();
    expect(document.getElementById("appr-msg-r-1")!.textContent).toBe(
      ts("en", "table.appr.msg.stale"),
    );
    expect(cashTrigger().textContent).not.toContain(ts("en", "settle.flag.updating"));
    expect(document.activeElement?.id).not.toBe("settle-h");
  });

  it("an APPLIED approve closes the sheet, focuses the settle heading, and holds 'Updating the total…' — bounded", async () => {
    resolveApproval.mockResolvedValueOnce({ ok: true, decision: "approve" });
    mountFlagged();
    await decideHere();
    // Every read after the decision hangs: the bound, not a read, must free the trigger.
    answer = () => new Promise(() => {});
    fireEvent.change(document.getElementById("appr-r-1-pin")!, { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(sheet()!).getByRole("button", { name: /^Approve/ }));
    });
    await tick(0);
    expect(sheet()).toBeNull();
    expect(document.activeElement?.id).toBe("settle-h");
    expect(cashTrigger().textContent).toContain(ts("en", "settle.flag.updating"));
    // MUTATION (pane/total-pending-unbounded): Take cash stays busy for as long as the read hangs —
    // the payment blocked, which decision 4 forbids; red.
    await tick(STAFF_HANG_MS);
    expect(cashTrigger().textContent).not.toContain(ts("en", "settle.flag.updating"));
  });

  it("an applied DENY moves no total: the sheet closes, focus lands on the heading, the trigger stays as it was", async () => {
    resolveApproval.mockResolvedValueOnce({ ok: true, decision: "deny" });
    mountFlagged();
    await decideHere();
    fireEvent.change(document.getElementById("appr-r-1-pin")!, { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(sheet()!).getByRole("button", { name: /^Deny/ }));
    });
    await tick(0);
    expect(sheet()).toBeNull();
    expect(document.activeElement?.id).toBe("settle-h");
    // MUTATION (pane/deny-says-the-total-moves): a deny reads "Updating the total…"; red.
    expect(cashTrigger().textContent).not.toContain(ts("en", "settle.flag.updating"));
  });

  it("the server's re-warning re-draws the card with ITS list, and the next tap acknowledges what it shows", async () => {
    const SECOND = { ...FLAG, id: "r-2", lineId: "l2", lineName: "Tea Leaf Salad" };
    settleCash.mockResolvedValueOnce({
      ok: false,
      error: "x",
      code: "approval_pending",
      pending: [FLAG, SECOND],
    });
    mountFlagged();
    await takeCash();
    // The card names the new dish; the page's one region says the re-warning.
    const card = document.querySelector(".settle-flag") as HTMLElement;
    expect(card.textContent).toContain("Tea Leaf Salad");
    expect(orderRegion().textContent).toContain(
      tf("en", "settle.flag.pendingRefused", { x: "Mohinga" }),
    );
    settleCash.mockResolvedValueOnce({ ok: true, orderId: "o-1", totalCents: 4210, tipCents: 0 });
    await takeCash();
    // MUTATION (approval-ack/pane-acks-nothing): the re-drawn card's ids never reach the tap; red.
    expect(settleCash).toHaveBeenLastCalledWith(
      expect.objectContaining({ acknowledgedApprovalIds: ["r-1", "r-2"] }),
    );
  });
});
