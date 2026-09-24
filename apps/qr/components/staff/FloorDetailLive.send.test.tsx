/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";
import type { StaffFireResult } from "@/lib/staff-send-view";

/**
 * Phase 2a · send — how the table page HOSTS the Send: its outcomes share the page's ONE region
 * under a written precedence (writeError > send warn > degraded > send ok — a standing "Sent" must
 * never mask the frozen-board signal, S2-audit S9), and the add page's "Review · N not sent →"
 * (`?send=1`) lands focused on what it promised, then drops the param.
 *
 * Everything around the order card is stubbed: this suite is about the wiring of ONE slot and ONE
 * region, and each stub is a module this file would otherwise have to feed a database.
 */
const getTableDetail = vi.fn<(id: string) => Promise<TableDetailResult>>();
vi.mock("@/lib/floor", () => ({ getTableDetail: (id: string) => getTableDetail(id) }));
const fire = vi.fn<(raw: unknown) => Promise<StaffFireResult>>();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (raw: unknown) => fire(raw),
  staffUndoFire: vi.fn(),
}));
vi.mock("@/lib/staff-cart", () => ({ staffSetQty: vi.fn(), setLineNotes: vi.fn() }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("server-only", () => ({}));
vi.mock("./LossActionSheet", () => ({ LossActionSheet: () => null }));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/staff/table/S",
}));
vi.mock("./StaffBar", () => ({ StaffBar: () => null }));
vi.mock("./ClearTableButton", () => ({ ClearTableButton: () => null }));
vi.mock("./MergeTableButton", () => ({ MergeTableButton: () => null }));
vi.mock("./StaffPromoControl", () => ({ StaffPromoControl: () => null }));
vi.mock("./CashSettleButton", () => ({ CashSettleButton: () => null }));
vi.mock("./CloseSecureTabButton", () => ({ CloseSecureTabButton: () => null }));
vi.mock("./OpenTabButton", () => ({ OpenTabButton: () => null }));
vi.mock("./TerminalSettle", () => ({
  TerminalSettleButton: () => null,
  TerminalCollectPanel: () => null,
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
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
});

function detail(over: Partial<TableDetail> = {}): TableDetail {
  return {
    sessionId: SESSION,
    settled: false,
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
    ceilingCents: 40000,
    tabOverCeiling: false,
    nudgeSecure: null,
    lastActivityAt: new Date(T).toISOString(),
    paymentInFlight: false,
    hostPresent: false,
    send: { sendable: 3, staffAdded: 3, togoDraft: 0, inKitchen: false, foodDraft: true },
    serverNow: new Date(T).toISOString(),
    ...over,
  };
}

const region = () => document.querySelector<HTMLElement>('[role="status"]')!;
const sendBtn = () => document.querySelector<HTMLButtonElement>(".staff-send button")!;
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function mount(initial: TableDetail, arrivedToSend = false) {
  return render(
    <StaffLangProvider lang="en">
      <FloorDetailLive initial={initial} sessionId={SESSION} arrivedToSend={arrivedToSend} />
    </StaffLangProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: T });
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the ONE region — writeError > send warn > degraded > send ok", () => {
  // The notice repeats the Send's own count — `detail.send.sendable` units, never the line count.
  const SENT = STAFF["table.send.sent.many"].en.replace("{n}", String(detail().send.sendable));

  it("a standing ok 'Sent' line is REPLACED by the frozen-board signal", async () => {
    expect(detail().lines).toHaveLength(2);
    fire.mockResolvedValueOnce({
      ok: true,
      fired: detail().send.sendable, // the server's `fired` is UNITS (staff-send.test.ts pins it)
      undoUntil: new Date(T + 10_000).toISOString(),
      serverNow: new Date(T).toISOString(),
      undoBatch: "b",
    });
    // The post-send refresh reads the table fine: "Sent" stands.
    getTableDetail.mockResolvedValue({
      kind: "detail",
      detail: detail({
        lines: [draft("a")].map((l) => ({ ...l, state: "fired" as const, sendable: false })),
        send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
      }),
    });
    mount(detail());
    await flush();
    fireEvent.click(sendBtn());
    await flush();
    expect(region().textContent).toBe(SENT);
    // Then the platform goes away: the next poll cannot read the table. A frozen view must never
    // look live — the degraded line takes the region from the ok one.
    getTableDetail.mockResolvedValue({ kind: "outage" });
    await flush(5000);
    expect(region().textContent).not.toContain(SENT);
    expect(region().textContent!.length).toBeGreaterThan(0);
  });

  it("a WARN send line outranks the degraded one — a refusal is the thing to read", async () => {
    getTableDetail.mockResolvedValue({ kind: "outage" });
    mount(detail());
    await flush(5000);
    const frozen = region().textContent;
    expect(frozen!.length).toBeGreaterThan(0);
    fire.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await flush(400);
    fireEvent.click(sendBtn());
    await flush();
    expect(region().textContent).toBe(STAFF["table.send.err.failed"].en);
  });
});

describe("?send=1 — the add page's bridge lands on what it promised", () => {
  it("focuses the Send, and drops the param without scrolling", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: detail() });
    mount(detail(), true);
    await flush();
    expect(document.activeElement).toBe(sendBtn());
    expect(replace).toHaveBeenCalledWith("/staff/table/S", { scroll: false });
  });

  it("with nothing left to send (a colleague sent it), focuses the status row instead", async () => {
    const sent = detail({
      lines: [{ ...draft("a"), state: "fired", sendable: false }],
      send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
    });
    getTableDetail.mockResolvedValue({ kind: "detail", detail: sent });
    mount(sent, true);
    await flush();
    expect(sendBtn()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".staff-send-status"));
    expect(replace).toHaveBeenCalledWith("/staff/table/S", { scroll: false });
  });

  it("without the param, nothing is focused and nothing is replaced", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: detail() });
    mount(detail());
    await flush();
    expect(document.activeElement).toBe(document.body);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the Send's 're-read NOW' is never dropped by a poll already in the air", () => {
  it("a refresh asked for mid-poll runs once more after it — not 5s later", async () => {
    mount(detail());
    await flush();
    // The 5s poll starts, and hangs on the wire (it began BEFORE the send).
    let answer!: (r: TableDetailResult) => void;
    getTableDetail.mockReturnValueOnce(new Promise((res) => (answer = res)));
    await flush(5000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The send lands mid-poll and asks for a read NOW.
    fire.mockResolvedValueOnce({ ok: false, reason: "nothing" });
    getTableDetail.mockResolvedValue({ kind: "detail", detail: detail() });
    fireEvent.click(sendBtn());
    await flush();
    expect(getTableDetail).toHaveBeenCalledTimes(1); // one read at a time
    await act(async () => {
      answer({ kind: "detail", detail: detail() });
    });
    await flush();
    // MUTATION: drop the ask while a read is in flight — the stale pre-send read is the last word
    // until the next poll; red.
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    // Exactly one re-run: nothing else was asked for.
    await flush(1000);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
  });
});
