/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_QUERY } from "@/lib/floor-pane";
import type {
  FloorSnapshot,
  FloorTable,
  TableDetail,
  TableDetailResult,
  TableLineView,
} from "@/lib/floor-types";

/**
 * Phase 2d · review fixes — the counter screen's REAL composition around the split: the bell's
 * provider, `CounterSplit`, the Start zone (`RegisterStart`) and the real `FloorBoard` with its real
 * `TableStrip` and `TableCard`s. `TablePane.test` drives the pane through a stand-in floor that calls
 * `openFromCard` itself, so it cannot see the floor's own wiring; this suite can.
 *
 *   - a floor card and a strip tile open the pane (the wiring FloorBoard and TableStrip own);
 *   - the view's live regions, measured on a real render: one per zone, and the pane's ONE;
 *   - the bell never rings while the counter column is covered (below 48em a selected table TAKES
 *     the column): sound is never the only feedback, and what was heard meanwhile never rings late.
 *
 * Mocks: the server reads and actions, the realtime hook, the router, a plain `<a>` for next/link,
 * and the bell's document-scoped audio engine (`lib/counter-sound`: armed and wanted, `playCounter`
 * recorded, the heard set a plain Set) — the ring GATE stays the real provider's.
 */
const A = "0b8c1e7a-3f7d-4c2a-9e51-6a2b1c3d4e5f";
const B = "9f1e2d3c-4b5a-4968-8776-655443322110";
const NOW = "2026-09-29T19:00:00.000Z";
const NOW_MS = Date.parse(NOW);

let floorAnswer: () => Promise<unknown> = () => new Promise(() => {});
let answers: Record<string, () => Promise<TableDetailResult>> = {};
const getTableDetail = vi.fn((id: string) => (answers[id] ?? (() => new Promise(() => {})))());
vi.mock("@/lib/floor", () => ({
  getFloorView: () => floorAnswer(),
  getTableDetail: (id: string) => getTableDetail(id),
  clearTable: vi.fn(),
  getMergeCandidates: () => Promise.resolve([]),
  mergeTables: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: vi.fn(),
  setLineNotes: vi.fn(),
  settleCash: vi.fn(),
  closeSecureTab: vi.fn(),
}));
vi.mock("@/lib/terminal", () => ({
  settleCard: vi.fn(),
  terminalStatus: vi.fn(),
  cancelTerminal: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("@/lib/staff-promo", () => ({ applyPromoForTable: vi.fn(), clearPromoForTable: vi.fn() }));
vi.mock("@/lib/tabs", () => ({ openTab: vi.fn() }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("@/lib/staff-send", () => ({ staffFireCart: vi.fn(), staffUndoFire: vi.fn() }));
const openRegisterOrder = vi.fn((_input: unknown) => new Promise<unknown>(() => {}));
vi.mock("@/lib/register", () => ({
  openRegisterOrder: (input: unknown) => openRegisterOrder(input),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push }),
  usePathname: () => "/staff",
}));
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
// The bell's engine: armed and wanted (the posture is "on"), every ring recorded. The document's
// heard set is a plain Set, cleared per case.
const heard = new Set<string>();
const playCounter = vi.fn();
vi.mock("@/lib/counter-sound", () => ({
  armWithin: () => Promise.resolve(true),
  counterArmed: () => true,
  subscribeCounterArmed: () => () => {},
  counterSoundServerSnapshot: () => false,
  getCounterWanted: () => true,
  setCounterWanted: () => {},
  subscribeCounterWanted: () => () => {},
  playCounter: (kind: string) => playCounter(kind),
  counterHeard: () => heard,
  rememberCounterHeard: (keys: Iterable<string>) => {
    for (const k of keys) heard.add(k);
  },
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { LiveConnectionProvider } = await import("./LiveConnection");
const { CounterBellProvider } = await import("./CounterBell");
const { CounterSplit } = await import("./CounterSplit");
const { CounterMintProvider } = await import("./CounterMint");
const { RegisterStart } = await import("./RegisterStart");
const { FloorBoard } = await import("./FloorBoard");
const { DEFAULT_KDS_THRESHOLDS } = await import("@/lib/kds-urgency");
const { tf } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");

const table = (sessionId: string, n: number, over: Partial<FloorTable> = {}): FloorTable => ({
  sessionId,
  label: String(n),
  tableNumber: n,
  mode: "dinein",
  status: "ordering",
  partySize: 2,
  hostName: null,
  itemCount: 1,
  runningSubtotalCents: 1200,
  paidTotalCents: null,
  refund: null,
  tab: "none",
  tabOverCeiling: false,
  counterRequestedAt: null,
  lastActivityAt: NOW,
  openedAt: NOW,
  kitchen: null,
  ...over,
});
const snap = (tables: FloorTable[]): FloorSnapshot => ({
  tables,
  counter: [],
  counterTruncated: false,
  serverNow: NOW,
  registry: [1, 2, 3, 4, 5, 6, 7, 8],
  kitchenUnknown: false,
  thresholds: DEFAULT_KDS_THRESHOLDS,
});
const ROOM = [table(A, 4), table(B, 7)];
/** Table 7 asks to pay at the counter — a guest fact, the bell's news. */
const asks = (id: string, n: number, at: string) =>
  table(id, n, { status: "counter", counterRequestedAt: at });
const floorOk = (s: FloorSnapshot) => () => Promise.resolve({ ok: true, snapshot: s });

const line: TableLineView = {
  id: "l-1",
  name: "Mohinga",
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "fired",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  sendable: false,
  menuItemId: null,
  fulfillment: "dinein",
  nameMy: null,
  modifiersMy: [],
};
const detail = (sessionId: string, tableNumber: number) =>
  ({
    sessionId,
    settled: false,
    cartId: `c-${tableNumber}`,
    label: String(tableNumber),
    tableNumber,
    mode: "dinein",
    status: "ordering",
    members: [{ seatId: "m1", name: "Aye", isHost: true }],
    lines: [line],
    itemCount: 1,
    runningSubtotalCents: 1200,
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
    send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
    serverNow: NOW,
  }) as TableDetail;
const detailOk = (d: TableDetail) => () => Promise.resolve({ kind: "detail" as const, detail: d });

let split = true;
function mountCounter() {
  return render(
    <StaffLangProvider lang="en">
      <LiveConnectionProvider>
        <CounterBellProvider>
          <CounterSplit terminalReady={false}>
            <CounterMintProvider>
              <div className="staff-zone">
                <h2 id="start-h">Start</h2>
                <RegisterStart labelledBy="start-h" />
              </div>
              <FloorBoard initial={snap(ROOM)} />
            </CounterMintProvider>
          </CounterSplit>
        </CounterBellProvider>
      </LiveConnectionProvider>
    </StaffLangProvider>,
  );
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const floorSection = () => document.getElementById("floor-h")!.closest("section")!;
const pane = () => document.querySelector<HTMLElement>(".staff-split-pane")!;
const splitRoot = () => document.querySelector<HTMLElement>(".staff-split")!;
const card = (id: string) =>
  floorSection().querySelector<HTMLAnchorElement>(`.floor-card[data-session-id="${id}"]`)!;
const polite = (root: ParentNode) => root.querySelectorAll('[role="status"]');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  split = true;
  window.matchMedia = ((q: string) => ({
    matches: split && q === PANE_QUERY,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.history.replaceState(null, "", "/staff?floor=1");
  floorAnswer = () => new Promise(() => {});
  answers = { [A]: detailOk(detail(A, 4)), [B]: detailOk(detail(B, 7)) };
  heard.clear();
  playCounter.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  getTableDetail.mockClear();
  openRegisterOrder.mockClear();
  push.mockClear();
  sessionStorage.clear();
});

describe("the real floor opens the pane at split width", () => {
  it("a floor card (TableCard, wired by FloorBoard) opens its table beside the floor", async () => {
    mountCounter();
    await tick(0);
    await act(async () => {
      fireEvent.click(card(A));
    });
    await tick(0);
    // MUTATION: FloorBoard hands the card no `onSelect` — the link navigates to the full page; red.
    expect(location.hash).toBe(`#table-${A}`);
    expect(splitRoot().dataset.pane).toBe("open");
    expect(document.getElementById("table-pane-h")!.textContent).toBe(
      tf("en", "floor.table", { id: "4" }),
    );
    expect(card(A).getAttribute("aria-current")).toBe("true");
    expect(document.getElementById("order-h")).not.toBeNull();
  });

  it("an occupied strip tile (TableStrip) opens its table too", async () => {
    mountCounter();
    await tick(0);
    const tile = floorSection().querySelector<HTMLAnchorElement>('[data-tile="7"]')!;
    await act(async () => {
      fireEvent.click(tile);
    });
    await tick(0);
    // MUTATION: the strip's occupied tap skips `openFromCard` — the tile routes away; red.
    expect(location.hash).toBe(`#table-${B}`);
    expect(document.getElementById("table-pane-h")!.textContent).toBe(
      tf("en", "floor.table", { id: "7" }),
    );
  });
});

describe("the view's live regions, measured on a real render", () => {
  it("one per zone (Start, the floor) and the pane's ONE — in every pane state", async () => {
    answers[A] = () => new Promise(() => {}); // the pane's read stays in the air: `loading`
    mountCounter();
    await tick(0);
    // Nothing picked: the Start zone's, the floor's, and the pane's standing (empty) one.
    const start = document.getElementById("start-h")!.parentElement!;
    expect(polite(start)).toHaveLength(1);
    expect(polite(floorSection())).toHaveLength(1);
    expect(polite(pane())).toHaveLength(1);
    expect(polite(splitRoot())).toHaveLength(3);
    // No second channel on any of them: a status region with an explicit aria-live beside it.
    for (const r of polite(splitRoot())) expect(r.getAttribute("aria-live")).toBeNull();
    // Loading.
    await act(async () => {
      fireEvent.click(card(A));
    });
    await tick(0);
    expect(polite(pane())).toHaveLength(1);
    expect(pane().querySelector('[role="status"]')!.textContent).toBe(
      tf("en", "shell.loading", { what: ts("en", "what.table") }),
    );
    expect(polite(splitRoot())).toHaveLength(3);
    // A detail: its own region is the pane's one.
    await act(async () => {
      fireEvent.click(card(B));
    });
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
    expect(polite(pane())).toHaveLength(1);
    expect(polite(splitRoot())).toHaveLength(3);
  });
});

describe("the bell never rings over a covered counter column", () => {
  it("phone width, a table deep-linked into the column: no ring, no late ring after it closes, and a NEW ask rings", async () => {
    split = false;
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mountCounter();
    await tick(0);
    await tick(0);
    expect(splitRoot().dataset.pane).toBe("open"); // below 48em the pane TAKES the column
    // Table 7 asks to pay at the counter while the column is covered.
    floorAnswer = floorOk(snap([table(A, 4), asks(B, 7, NOW)]));
    await tick(5000);
    // MUTATION: the provider rings with no cover check — the floor card's ring and chip are not on
    // screen, so the sound is the only feedback; red.
    expect(playCounter).not.toHaveBeenCalled();
    // The pane closes: the column is back, and the same ask is not news (heard while covered).
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    expect(splitRoot().dataset.pane).not.toBe("open");
    await tick(5000);
    expect(playCounter).not.toHaveBeenCalled();
    // A NEW ask with the column showing rings — the gate is the cover, not a dead bell.
    floorAnswer = floorOk(snap([asks(A, 4, NOW), asks(B, 7, NOW)]));
    await tick(5000);
    expect(playCounter).toHaveBeenCalledWith("guest");
  });

  it("split width, a table open beside the floor: the floor is on screen, so the bell rings", async () => {
    mountCounter();
    await tick(0);
    await act(async () => {
      fireEvent.click(card(A));
    });
    await tick(0);
    expect(splitRoot().dataset.pane).toBe("open");
    floorAnswer = floorOk(snap([table(A, 4), asks(B, 7, NOW)]));
    await tick(5000);
    // MUTATION: treat any open pane as covering the column — a tablet mutes the bell all shift; red.
    expect(playCounter).toHaveBeenCalledWith("guest");
  });
});

/**
 * Phase 2d · Codex round 1 (mint) — a start in flight while the person moves the pane and comes
 * BACK. The landing compared the pane's selected id at tap and at answer, so a move that ends on
 * the id it left (A → B → A; the floor → a table → ✕) passed as "never moved" and the add screen
 * of the new order was pushed over the pane they had just worked in. The real split and the real
 * mint lock, so the generation the lock compares is the one `CounterSplit` actually publishes.
 */
describe("a start that lands after the pane moved and came back", () => {
  type Landing = { ok: true; sessionId: string; created: boolean };
  function held() {
    let resolve!: (v: Landing) => void;
    const promise = new Promise<Landing>((r) => {
      resolve = r;
    });
    openRegisterOrder.mockReturnValueOnce(promise);
    return { promise, resolve };
  }
  const walkup = () =>
    document
      .getElementById("start-h")!
      .parentElement!.querySelector<HTMLButtonElement>("button.ui-btn")!;
  const tap = async (el: HTMLElement) => {
    await act(async () => {
      fireEvent.click(el);
    });
    await tick(0);
  };
  const land = async (d: ReturnType<typeof held>) => {
    await act(async () => {
      d.resolve({ ok: true, sessionId: "s-new", created: true });
      await d.promise;
    });
    await tick(0);
  };

  it("A → B → A: the new order's add screen is never pushed over the table they came back to — and the lock re-arms", async () => {
    mountCounter();
    await tick(0);
    await tap(card(A));
    const d = held();
    await tap(walkup());
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(walkup().getAttribute("aria-disabled")).toBe("true");
    await tap(card(B));
    await tap(card(A));
    expect(location.hash).toBe(`#table-${A}`); // the same id the start was tapped over
    await land(d);
    // MUTATION: compare the selected id alone (or publish no generation) — A at tap, A at the
    // answer: push('/staff/table/s-new/add') yanks them off table A; red.
    expect(push).not.toHaveBeenCalled();
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
  });

  it("the floor → a table → ✕: a close is a move too — nothing is pushed over the floor", async () => {
    mountCounter();
    await tick(0);
    const d = held();
    await tap(walkup());
    await tap(card(A));
    expect(splitRoot().dataset.pane).toBe("open");
    await tap(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    expect(splitRoot().dataset.pane).not.toBe("open");
    await land(d);
    // MUTATION: a close takes no generation of its own — the floor reads as it did at the tap; red.
    expect(push).not.toHaveBeenCalled();
    expect(walkup().getAttribute("aria-disabled")).toBeNull();
  });

  // Over-blocking is as bad as under-blocking: the ordinary starts must still go where they went.
  it("an untouched floor still lands the new order on its add screen", async () => {
    mountCounter();
    await tick(0);
    const d = held();
    await tap(walkup());
    await land(d);
    expect(push).toHaveBeenCalledWith("/staff/table/s-new/add");
  });

  it("re-tapping the table already shown is not a move — the new order still lands", async () => {
    mountCounter();
    await tick(0);
    await tap(card(A));
    const d = held();
    await tap(walkup());
    await tap(card(A));
    await land(d);
    // MUTATION: a re-tap of the table shown takes a new generation — every start made with a table
    // open beside the floor would silently stay put; red.
    expect(push).toHaveBeenCalledWith("/staff/table/s-new/add");
  });
});
