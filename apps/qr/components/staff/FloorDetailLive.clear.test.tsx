/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";

/**
 * PD7 · the second blind pass on #341 — how the table page WIRES the clear (`ClearTableButton`) and
 * the card door (`CloseSecureTabButton`): a CLOSED read marks the table gone BEFORE the detail
 * leaves (so the window never says it was "left"), the tab's card reaches the clear (an armed slip
 * drops on a secured tab), and the card door is never stood down for the slip — on a secured tab it
 * is the one exit the server accepts. Every other module is stubbed: this suite is about wiring.
 */
const getTableDetail = vi.fn<(id: string) => Promise<TableDetailResult>>();
vi.mock("@/lib/floor", () => ({ getTableDetail: (id: string) => getTableDetail(id) }));
vi.mock("@/lib/staff-send", () => ({ staffFireCart: vi.fn(), staffUndoFire: vi.fn() }));
vi.mock("@/lib/staff-cart", () => ({ staffSetQty: vi.fn(), setLineNotes: vi.fn() }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("server-only", () => ({}));
vi.mock("./LossActionSheet", () => ({ LossActionSheet: () => null }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/staff",
}));
vi.mock("./StaffBar", () => ({ StaffBar: () => null }));
type ClearProps = {
  cardOnFile?: boolean;
  tableGone?: { readonly current: boolean };
  onSlip?: (armed: boolean) => void;
};
const clearProps = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("./ClearTableButton", () => ({
  ClearTableButton: (p: unknown) => {
    clearProps.last = p;
    return null;
  },
}));
const cardProps = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("./CloseSecureTabButton", () => ({
  CloseSecureTabButton: (p: unknown) => {
    cardProps.last = p;
    return null;
  },
}));
vi.mock("./MergeTableButton", () => ({ MergeTableButton: () => null }));
vi.mock("./StaffPromoControl", () => ({ StaffPromoControl: () => null }));
vi.mock("./CashSettleButton", () => ({ CashSettleButton: () => null }));
vi.mock("./OpenTabButton", () => ({ OpenTabButton: () => null }));
vi.mock("./TerminalSettle", () => ({
  TerminalSettleButton: () => null,
  TerminalCollectPanel: () => null,
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { FloorDetailLive } = await import("./FloorDetailLive");

const SESSION = "11111111-1111-4111-8111-111111111111";
const T = Date.parse("2026-09-24T18:00:00.000Z");

const draft = (id: string): TableLineView => ({
  id,
  name: "Mohinga",
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  sendable: true,
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  // Phase 2c · pad — the line's dish, fulfillment and Burmese (the order pad's ticket reads them).
  menuItemId: null,
  fulfillment: "dinein",
  nameMy: null,
  modifiersMy: [],
});

function detail(over: Partial<TableDetail> = {}): TableDetail {
  return {
    sessionId: SESSION,
    settled: false,
    pendingRequests: [],
    cartId: "cart-1",
    label: "t-7",
    tableNumber: 7,
    mode: "dinein",
    status: "ordering",
    members: [],
    // Two LINES, three UNITS (a Mohinga ×2): mms_fire_cart reports rows, the Send counts units, and
    // the notice must repeat the units — a fixture where the two agree cannot tell them apart.
    lines: [{ ...draft("a"), qty: 2 }, draft("b")],
    itemCount: 3,
    runningSubtotalCents: 3600,
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
    ceilingCents: 40000,
    tabOverCeiling: false,
    nudgeSecure: null,
    lastActivityAt: new Date(T).toISOString(),
    paymentInFlight: false,
    paymentHolder: null,
    hostPresent: false,
    send: {
      sendable: 3,
      staffAdded: 3,
      togoDraft: 0,
      inKitchen: false,
      foodDraft: true,
      counterDraft: 0,
      counterSentPastGrace: false,
    },
    serverNow: new Date(T).toISOString(),
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
    ...over,
  };
}

const clear = () => clearProps.last as ClearProps;
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function mount(initial: TableDetail, onClosed?: (sid: string) => void) {
  return render(
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <FloorDetailLive
          initial={initial}
          sessionId={SESSION}
          variant={onClosed ? "pane" : "page"}
          onClosed={onClosed}
        />
      </ReaderCollectProvider>
    </StaffLangProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: T });
  sessionStorage.clear();
  clearProps.last = null;
  cardProps.last = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the clear's wiring on the table page (PD7, the second blind pass on #341)", () => {
  it("a CLOSED read marks the table gone BEFORE the detail leaves", async () => {
    getTableDetail.mockResolvedValue({ kind: "closed" });
    let goneAtClose: boolean | null = null;
    const onClosed = vi.fn(() => {
      goneAtClose = clear().tableGone?.current ?? null;
    });
    mount(detail(), onClosed);
    expect(clear().tableGone?.current).toBe(false);
    await flush(6000);
    expect(onClosed).toHaveBeenCalled();
    // MUTATION floor-detail/clear-gone-unmarked → the window unmounting under a closed table reads
    // as "left", and the floor says the clear stopped over a table someone else cleared; red.
    expect(goneAtClose).toBe(true);
  });

  it("the tab's card reaches the clear: secured, the armed slip drops", () => {
    mount(detail({ tab: "secure", settleTotalCents: 3600 }));
    // MUTATION floor-detail/clear-card-on-file-unwired → a tab secured under the slip keeps its
    // walkout over the card that can pay; red.
    expect(clear().cardOnFile).toBe(true);
    cleanup();
    mount(detail({ tab: "trust", settleTotalCents: 3600 }));
    expect(clear().cardOnFile).toBe(false);
  });

  it("the card door is never stood down for the slip — on a secured tab it is the exit", async () => {
    mount(detail({ tab: "secure", settleTotalCents: 3600 }));
    expect((cardProps.last as { variant?: string }).variant).toBe("primary");
    await act(async () => {
      clear().onSlip?.(true);
    });
    // MUTATION floor-detail/card-door-stands-down → the one door the server accepts for a secured
    // tab's sent food drops below a danger commit it refuses (`secure_tab`); red.
    expect((cardProps.last as { variant?: string }).variant).toBe("primary");
  });
});
