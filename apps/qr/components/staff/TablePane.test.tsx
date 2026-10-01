/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_QUERY, handoffStashKey, stashHandoff } from "@/lib/floor-pane";
import { frozenBoardCopy } from "@/lib/staff-outage";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";

/**
 * Phase 2d · split — the counter's tablet split, driven through the real `CounterSplit` +
 * `TablePane` + `FloorDetailLive variant="pane"`, with a stand-in floor (two cards and the floor
 * heading) that taps through `useTablePane` exactly as FloorBoard and the strip do. Mocks: the read,
 * the realtime hook, the router, and inert server actions — FloorDetailLive.test's shape.
 */
const A = "0b8c1e7a-3f7d-4c2a-9e51-6a2b1c3d4e5f";
const B = "9f1e2d3c-4b5a-4968-8776-655443322110";
const C = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";
const NOW = "2026-09-29T18:00:00.000Z";

let answers: Record<string, () => Promise<TableDetailResult>> = {};
const getTableDetail = vi.fn((id: string) => (answers[id] ?? (() => new Promise(() => {})))());
vi.mock("@/lib/floor", () => ({
  getTableDetail: (id: string) => getTableDetail(id),
  clearTable: (...a: unknown[]) => clearTable(...(a as [])),
  getMergeCandidates: (...a: unknown[]) => getMergeCandidates(...(a as [])),
  mergeTables: (...a: unknown[]) => mergeTables(...(a as [])),
}));
const clearTable = vi.fn();
const getMergeCandidates = vi.fn(() => Promise.resolve([] as unknown[]));
const mergeTables = vi.fn();
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
const settleCard = vi.fn();
const terminalStatus = vi.fn();
const cancelTerminal = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: (...a: unknown[]) => settleCard(...(a as [])),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: (...a: unknown[]) => cancelTerminal(...(a as [])),
}));
vi.mock("@/lib/haptics", () => ({ haptic: () => {} }));
vi.mock("@/lib/staff-promo", () => ({ applyPromoForTable: vi.fn(), clearPromoForTable: vi.fn() }));
vi.mock("@/lib/tabs", () => ({ openTab: vi.fn() }));
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push }),
  usePathname: () => "/staff",
}));
vi.mock("@/lib/staff-send", () => ({ staffFireCart: vi.fn(), staffUndoFire: vi.fn() }));
const openRegisterOrder = vi.fn();
vi.mock("@/lib/register", () => ({
  openRegisterOrder: (...a: unknown[]) => openRegisterOrder(...(a as [])),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { LiveConnectionProvider, useReportLive } = await import("./LiveConnection");
const { CounterSplit } = await import("./CounterSplit");
const { StaffBar } = await import("./StaffBar");
const { useTablePane } = await import("./TablePaneContext");
const { CounterMintProvider, useCounterMint } = await import("./CounterMint");
const { tf } = await import("@/lib/i18n/fill");
const { ts, STAFF } = await import("@/lib/i18n/staff");

const line = (id: string, name: string, drafts = true): TableLineView => ({
  id,
  name,
  qty: 1,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: drafts ? "draft" : "fired",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  sendable: drafts,
  menuItemId: null,
  fulfillment: "dinein",
  nameMy: null,
  modifiersMy: [],
});
const detail = (sessionId: string, tableNumber: number, over: Partial<TableDetail> = {}) =>
  ({
    sessionId,
    settled: false,
    cartId: `c-${tableNumber}`,
    label: `T${tableNumber}`,
    tableNumber,
    mode: "dinein",
    status: "ordering",
    members: [{ seatId: "m1", name: "Aye", isHost: true }],
    lines: [line(`l-${tableNumber}`, "Mohinga")],
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
    send: {
      sendable: 1,
      staffAdded: 1,
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
    ...over,
  }) as TableDetail;
const ok = (d: TableDetail) => () => Promise.resolve({ kind: "detail" as const, detail: d });

/** The floor stand-in: the heading, two cards and a spare control outside the pane. */
function Floor({
  cards = [A, B],
  publish,
  floorState,
}: {
  cards?: string[];
  publish?: { sessionId: string; label: string; n: number }[];
  floorState?: "live" | "not_updating";
}) {
  const pane = useTablePane()!;
  useReportLive("floor", floorState ?? "live");
  const publishFloor = pane.publishFloor;
  useEffect(() => {
    if (publish)
      publishFloor(
        publish.map((p) => ({
          sessionId: p.sessionId,
          label: p.label,
          hint: { counter: false, display: String(p.n) },
        })),
      );
  }, [publish, publishFloor]);
  return (
    <div>
      <h2 id="floor-h" tabIndex={-1}>
        Tables
      </h2>
      <button type="button" id="outside">
        outside
      </button>
      {cards.map((id) => (
        <a
          key={id}
          href={`/staff/table/${id}`}
          className="floor-card"
          data-session-id={id}
          aria-current={pane.selectedId === id ? "true" : undefined}
          onClick={(e) =>
            pane.openFromCard(e, id, { counter: false, display: id === A ? "4" : "7" })
          }
        >
          card {id}
        </a>
      ))}
    </div>
  );
}

let split = true;
let terminalReady = false;
const tree = (props: Parameters<typeof Floor>[0] = {}) => (
  <StaffLangProvider lang="en">
    <ReaderCollectProvider>
      <LiveConnectionProvider>
        <CounterSplit terminalReady={terminalReady}>
          <Floor {...props} />
        </CounterSplit>
      </LiveConnectionProvider>
    </ReaderCollectProvider>
  </StaffLangProvider>
);
const mount = (props: Parameters<typeof Floor>[0] = {}) => render(tree(props));
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const card = (id: string) =>
  document.querySelector<HTMLAnchorElement>(`.floor-card[data-session-id="${id}"]`)!;
const paneHeading = () => document.getElementById("table-pane-h")!;
const pane = () => document.querySelector<HTMLElement>(".staff-split-pane")!;
const tap = async (el: HTMLElement) => {
  let ev!: MouseEvent;
  el.addEventListener("click", (e) => (ev = e), { once: true });
  await act(async () => {
    fireEvent.click(el);
  });
  await tick(0);
  return ev;
};
let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  split = true;
  terminalReady = false;
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
  answers = { [A]: ok(detail(A, 4)), [B]: ok(detail(B, 7)) };
  pushSpy = vi.spyOn(window.history, "pushState");
  replaceSpy = vi.spyOn(window.history, "replaceState");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  getTableDetail.mockClear();
  staffSetQty.mockReset();
  settleCash.mockReset();
  closeSecureTab.mockReset();
  settleCard.mockReset();
  terminalStatus.mockReset();
  cancelTerminal.mockReset();
  clearTable.mockReset();
  mergeTables.mockReset();
  getMergeCandidates.mockClear();
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
  sessionStorage.clear();
});

describe("TablePane — a card tap at split width", () => {
  it("opens in the pane: prevented, ONE push without __NA, the hash names it, the heading takes focus, one read", async () => {
    // Next's own entry: its state carries __NA — a write that copies it would keep it (the
    // fixture that separates `{}` from `{ ...history.state }`).
    window.history.replaceState({ __NA: true, tree: [] }, "", "/staff?floor=1");
    mount();
    await tick(0);
    const ev = await tap(card(A));
    // MUTATION: drop preventDefault — the link navigates to the full page; red.
    expect(ev.defaultPrevented).toBe(true);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    // MUTATION: push `{ ...history.state }` — Next's __NA rides along and Next refuses the hash; red.
    const state = pushSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(state).toEqual({});
    expect(location.hash).toBe(`#table-${A}`);
    expect(document.activeElement).toBe(paneHeading());
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    expect(getTableDetail).toHaveBeenCalledWith(A);
    expect(card(A).getAttribute("aria-current")).toBe("true");
  });

  it("at phone width the link is left alone: not prevented, no history write", async () => {
    split = false;
    mount();
    await tick(0);
    const ev = await tap(card(A));
    expect(ev.defaultPrevented).toBe(false);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("a switch REPLACES (one entry deep)", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tap(card(B));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy.mock.calls.at(-1)![2]).toBe(`/staff?floor=1#table-${B}`);
  });
});

describe("TablePane — a late read never lands under another table", () => {
  it("A's read answering after B was picked is dropped; B's read starts only THEN (one read in the air), and lands", async () => {
    let resolveA!: (r: TableDetailResult) => void;
    let resolveB!: (r: TableDetailResult) => void;
    answers[A] = () => new Promise((r) => (resolveA = r));
    answers[B] = () => new Promise((r) => (resolveB = r));
    mount();
    await tick(0);
    await tap(card(A));
    await tap(card(B));
    // Phase 2h (9f) — B's read is OWED to A's, never sent beside it: Next runs Server Actions one at
    // a time, so B's would only queue behind A's — and the two answers could land in either order.
    // MUTATION (table-pane/late-read-lands — the gate's hold and the landing guard, every protection
    // of this rule at once): B is read at once, and A's late answer replaces B's detail; red.
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // A answers (after B was picked): dropped — never under B's heading.
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(pane().textContent).not.toContain("Mohinga");
    // …and only now does B's own read go out, once.
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(getTableDetail).toHaveBeenLastCalledWith(B);
    await act(async () => {
      resolveB({ kind: "detail", detail: detail(B, 7, { lines: [line("l-7", "Tea")] }) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(document.getElementById("order-h")).not.toBeNull();
    expect(pane().textContent).toContain("Tea");
    expect(pane().textContent).not.toContain("Mohinga");
  });
});

describe("TablePane — closing", () => {
  it("✕ after our own push walks BACK and lands on the card — even after Next re-stamps the entry", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    // Next's revalidating action replaces the entry with its own state (same URL, same length).
    window.history.replaceState({ __NA: true, tree: [] }, "", `/staff?floor=1#table-${A}`);
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(card(A));
    expect(card(A).getAttribute("aria-current")).toBeNull();
  });

  it("a deep link we did not push: ✕ REPLACES to the floor heading and focuses it when no card is there", async () => {
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    expect(document.activeElement).toBe(paneHeading());
    replaceSpy.mockClear();
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    expect(backSpy).not.toHaveBeenCalled();
    expect(replaceSpy.mock.calls.at(-1)![2]).toBe("/staff?floor=1#floor-h");
    expect(document.activeElement).toBe(document.getElementById("floor-h"));
  });

  it("Escape closes — but never from inside a field", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const input = pane().querySelector("input")!;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.getElementById("table-pane-h")?.textContent).toBe(
      tf("en", "floor.table", { id: "4" }),
    );
    fireEvent.keyDown(paneHeading(), { key: "Escape" });
    await tick(0);
    expect(within(pane()).queryByText(tf("en", "floor.table", { id: "4" }))).toBeNull();
  });

  it("a table opened by openSession (or the chip's View) after a card tap closes onto ITS card — never the card that opened the last one (A11Y-3)", async () => {
    function OpenSeven() {
      const api = useTablePane()!;
      return (
        <button type="button" onClick={() => api.openSession(B, { counter: false, display: "7" })}>
          open 7
        </button>
      );
    }
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <Floor />
              <OpenSeven />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await tap(card(A)); // the opener is Table 4's card
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open 7" }));
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    // MUTATION (p2g-fix-reader/split-opener-outlives-its-table): the stale opener — focus lands on
    // Table 4's card after closing Table 7; red.
    expect(document.activeElement).not.toBe(card(A));
    expect(document.activeElement).toBe(card(B));
  });

  it("a Clear inside the pane closes it onto the floor heading, never the doomed card", async () => {
    clearTable.mockResolvedValue({ ok: true });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    fireEvent.click(within(pane()).getByRole("button", { name: /Clear table/ }));
    const confirm = within(pane())
      .getAllByRole("button")
      .find((b) => b.textContent?.includes(ts("en", "settle.confirm")))!;
    await act(async () => {
      fireEvent.click(confirm);
    });
    await tick(0);
    expect(replace).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById("floor-h"));
  });
});

describe("TablePane — a zone jump (the approvals circle) keeps the table", () => {
  it("a native fragment entry is adopted into Next's URL and the table stays beside it", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    // The native anchor: an entry Next never saw (state null), then `hashchange`.
    window.history.pushState(null, "", "/staff?floor=1#appr-h");
    replaceSpy.mockClear();
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    // MUTATION: drop the canonical sync — no replace; red.
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy.mock.calls[0]![0]).toEqual({});
    expect(replaceSpy.mock.calls[0]![2]).toBe(location.href);
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
  });

  it("with the URL already naming the table, a tap writes no second entry", async () => {
    window.history.replaceState({ __NA: true }, "", `/staff?floor=1#table-${A}`);
    mount();
    await tick(0);
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    window.history.replaceState({ __NA: true }, "", `/staff?floor=1#table-${A}`);
    pushSpy.mockClear();
    await tap(card(A));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
  });
});

describe("TablePane — before and after hydration", () => {
  it("SSR: aria-busy, neither the empty title nor a table heading (the server cannot see the hash)", () => {
    const html = renderToString(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <p>zones</p>
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-pane="unknown"');
    expect(html).not.toContain(ts("en", "floor.pane.empty.title"));
    expect(html).not.toContain(`id="table-pane-h"`);
  });
  it("mounted with no hash: the empty state (shown ≥64em by CSS)", async () => {
    const { container } = mount();
    await tick(0);
    expect(container.querySelector(".staff-split")!.getAttribute("data-pane")).toBe("empty");
    expect(paneHeading().textContent).toBe(ts("en", "floor.pane.empty.title"));
  });
});

describe("TablePane — the pane is not a page", () => {
  it("no second bar or language switch; sections are h3 under the pane's h2; ONE polite region", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.querySelectorAll(".staff-bar")).toHaveLength(0);
    expect(document.querySelectorAll("main")).toHaveLength(0);
    expect(document.getElementById("order-h")!.tagName).toBe("H3");
    expect(document.getElementById("party-h")!.tagName).toBe("H3");
    expect(document.getElementById("promo-h")!.tagName).toBe("H3");
    expect(pane().querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("the catch-all never answers a focus lost OUTSIDE the pane", async () => {
    answers[A] = ok(detail(A, 4));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const outside = document.getElementById("outside")!;
    act(() => outside.focus());
    await tick(5000); // a refresh samples focus: outside the pane
    act(() => outside.remove());
    expect(document.activeElement).toBe(document.body);
    answers[A] = ok(detail(A, 4, { lines: [], itemCount: 0 }));
    await tick(5000);
    // MUTATION: sample `activeElement !== body` in the pane — the order heading steals focus; red.
    expect(document.activeElement).toBe(document.body);
  });
});

// Phase 2d · review fixes — a tapped card names the table in the head at once, so the head's sr-only
// "Loading…" never rendered: focus landed on "Table 4" over a skeleton and nothing said it was
// loading. It is said now through the pane's ONE region — a node that stands from mount (a live
// region inserted WITH its text is often never spoken), outside the busy body (a busy subtree's
// announcements may be held until it clears).
describe("TablePane — loading is said through the pane's one region", () => {
  const loading = () => tf("en", "shell.loading", { what: ts("en", "what.table") });
  it("a tapped card: the head names it, the SAME region node says loading, outside the busy body", async () => {
    answers[A] = () => new Promise(() => {}); // the read stays in the air
    mount();
    await tick(0);
    const region = pane().querySelector('[role="status"]');
    expect(region).not.toBeNull();
    await tap(card(A));
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
    expect(pane().querySelectorAll('[role="status"]')).toHaveLength(1);
    // MUTATION: say loading only when the head is unnamed — the tap path is silent; red.
    expect(pane().querySelector('[role="status"]')!.textContent).toBe(loading());
    // MUTATION: render the region inside each branch — a fresh node per branch; red.
    expect(pane().querySelector('[role="status"]')).toBe(region);
    expect(pane().querySelector(".staff-pane-body")!.getAttribute("aria-busy")).toBe("true");
    expect(region!.closest('[aria-busy="true"]')).toBeNull();
  });
  it("a switch away from a mounted detail: the region comes back EMPTY, then says loading", async () => {
    answers[B] = () => new Promise(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull(); // A's detail (and its region)
    await act(async () => {
      fireEvent.click(card(B));
    });
    // MUTATION: fill the region at mount — inserted WITH its text, it is often never spoken; red.
    expect(pane().querySelector('[role="status"]')!.textContent).toBe("");
    await tick(0);
    expect(pane().querySelector('[role="status"]')!.textContent).toBe(loading());
    expect(pane().querySelectorAll('[role="status"]')).toHaveLength(1);
  });
  it("a deep link with no name yet: the head carries it, the region stays quiet (said once)", async () => {
    answers[A] = () => new Promise(() => {});
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    expect(paneHeading().textContent).toBe(loading());
    // MUTATION: say loading whatever the head says — focus on the head and the region say it twice.
    expect(pane().querySelector('[role="status"]')!.textContent).toBe("");
  });
  it("once the detail lands, the detail's region is the pane's one", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
    expect(pane().querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(pane().querySelector(".staff-pane-body")!.getAttribute("aria-busy")).toBeNull();
  });
});

describe("TablePane — the freeze is one fact, spoken once", () => {
  const frozenSpan = () =>
    [
      ...document
        .getElementById("order-h")!
        .closest("section")!
        .querySelectorAll('[role="status"] span'),
    ].find((s) => s.textContent === frozenBoardCopy("en", NOW, 0, "what.order", "outage"))!;
  it("while the floor already says it: shown, not said", async () => {
    mount({ floorState: "not_updating" });
    await tick(0);
    await tap(card(A));
    answers[A] = () => Promise.resolve({ kind: "outage" });
    await tick(5000);
    expect(frozenSpan().getAttribute("aria-hidden")).toBe("true");
  });
  it("with the floor live: said", async () => {
    mount({ floorState: "live" });
    await tick(0);
    await tap(card(A));
    answers[A] = () => Promise.resolve({ kind: "outage" });
    await tick(5000);
    expect(frozenSpan().getAttribute("aria-hidden")).toBeNull();
  });
});

describe("TablePane — the paid card follows its table", () => {
  const H = {
    orderId: "o-00a1b2c3",
    totalCents: 4210,
    tipCents: 0,
    tenderedCents: 5000,
    isCounter: true,
    cartId: "c-4",
  };
  it("a stashed card comes back with its table, and ✕ takes it away", async () => {
    stashHandoff(A, H);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain("#A1B2C3");
    // Restored cards never pull focus off the heading the person landed on.
    expect(document.activeElement).toBe(paneHeading());
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    // MUTATION: skip the removal on close — the card follows a table the cashier finished; red.
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).not.toContain("#A1B2C3");
  });

  // Phase 2d · review fixes — the card sits UNDER the pane's heading (Table 7 › Paid), as every
  // other section in the pane does; an h2 beside the pane's own h2 broke the outline.
  it("the card's title is an h3 in the pane — on the live detail and on the closed notice", async () => {
    stashHandoff(A, H);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    // MUTATION: the detail hands the card no pane level — an h2 beside the pane's h2; red.
    expect(document.getElementById("handoff-title")!.tagName).toBe("H3");
    cleanup();
    const tableCard = { ...H, isCounter: false };
    stashHandoff(B, tableCard);
    answers[B] = () => Promise.resolve({ kind: "closed", label: "T7", tableNumber: 7 });
    window.history.replaceState(null, "", `/staff?floor=1#table-${B}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    await tick(0);
    expect(pane().textContent).toContain(ts("en", "table.detail.closed.title"));
    // MUTATION: the closed notice's card at the page level — red.
    expect(document.getElementById("handoff-title")!.tagName).toBe("H3");
  });

  it("a settle that lands AFTER the pane moved on still leaves the card for its table", async () => {
    const counterA = detail(A, 4, {
      label: "reg-7f3a",
      counterOrder: true,
      tableNumber: null,
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line("l-4", "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });
    answers[A] = ok(counterA);
    let land!: (v: unknown) => void;
    settleCash.mockReturnValueOnce(new Promise((r) => (land = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(settleSection.querySelector("button")!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
    await tap(card(B)); // the cashier moved on before the answer came
    await act(async () => {
      land({ ok: true, orderId: "o-00a1b2c3", totalCents: 4210, tipCents: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: skip the stash write — the #CODE is gone with the unmounted detail; red.
    expect(sessionStorage.getItem(handoffStashKey(A))).toContain("o-00a1b2c3");
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain("#A1B2C3");
  });

  // ── Phase 2d · Codex round 1 · pane ──
  const round1 = { ...H, orderId: "o-00c1c1c1", isCounter: false, cartId: "c-1" };
  // The table's LATEST paid order rides the detail (`paidOrderId`); round one's by default.
  const settledA = (paidOrderId: string = round1.orderId) =>
    detail(A, 4, {
      cartId: null,
      settled: true,
      paidOrderId,
      lines: [line("l-4", "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });

  it("a table's card still current comes back with its table, across a switch", async () => {
    stashHandoff(A, round1); // round one paid with a tender; the table has not ordered again
    answers[A] = ok(settledA());
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).not.toBeNull();
    await tap(card(B));
    await tap(card(A));
    await tick(0);
    // MUTATION: supersede on ANY cart difference (null included) — the card a settled table still
    // owns is dropped on the first visit; red.
    expect(document.getElementById("handoff-title")).not.toBeNull();
    expect(sessionStorage.getItem(handoffStashKey(A))).toContain("o-00c1c1c1");
  });

  it("a restored card the next round supersedes WHILE shown goes for good — the pane never left the table", async () => {
    stashHandoff(A, round1);
    answers[A] = ok(settledA()); // round one's card is current: restored and shown
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).not.toBeNull();
    answers[A] = ok(detail(A, 4, { cartId: "c-2" })); // round two opens under the pane
    await tick(5000);
    expect(document.getElementById("handoff-title")).toBeNull();
    answers[A] = ok(settledA()); // …and settles with no tender
    await tick(5000);
    // MUTATION: the restored card is only hidden, never cleared from state — round one's total and
    // change come back as round two's; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });

  it("round two opens, the pane switches away and back, round two settles with NO tender: round one's card never comes back (Codex #306)", async () => {
    stashHandoff(A, round1); // round one (cart c-1) paid with a tender — its card follows the table
    answers[A] = ok(detail(A, 4, { cartId: "c-2" })); // round two is open
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).toBeNull(); // hidden while c-2 is open
    await tap(card(B));
    await tap(card(A)); // …and back: the stash is read again
    await tick(0);
    expect(document.getElementById("handoff-title")).toBeNull();
    // Round two settles with no tender entered: no card of its own, and no live cart any more.
    answers[A] = ok(settledA("o-00c2c2c2"));
    await tick(5000);
    // MUTATION: never drop a superseded card (only hide it while c-2 is open) — the restored
    // round-one card reads as current again and shows last round's total and change; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
    // …nor on the next visit.
    await tap(card(B));
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).toBeNull();
  });
  it("round two opens AND pays while the pane shows another table: round one's card never comes back (Codex #306, the residual)", async () => {
    stashHandoff(A, round1); // round one (cart c-1, order o-00c1c1c1) paid with a tender
    answers[A] = ok(settledA());
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).not.toBeNull();
    await tap(card(B));
    await tick(0);
    // While the pane is on B, round two opens and settles with no tender: this detail never sees
    // c-2 — only a NEWER paid order when it comes back.
    answers[A] = ok(settledA("o-00c2c2c2"));
    await tap(card(A));
    await tick(0);
    // MUTANT p2d-cx1/handoff-settled-ignores-the-order — a settled table reads every card as
    // current: round one's total and change shown as round two's; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });
});

describe("TablePane — a change that did not save on a table the pane left", () => {
  it("is said, names the table, and one tap goes back to it", async () => {
    let refuse!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (refuse = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const inc = pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      refuse({ ok: false, error: "That line just changed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    const table4 = tf("en", "floor.table", { id: "4" });
    const lost = pane().querySelector(".staff-pane-lost")!;
    // MUTATION: drop the !alive route — the refusal dies with the unmounted detail; red.
    expect(lost.textContent).toContain(tf("en", "floor.pane.lostWrite", { x: table4 }));
    // SAID through the ONE region of the detail now shown.
    const region = document
      .getElementById("order-h")!
      .closest("section")!
      .querySelector('[role="status"]')!;
    expect(region.textContent).toContain(tf("en", "floor.pane.lostWrite", { x: table4 }));
    await act(async () => {
      fireEvent.click(within(lost as HTMLElement).getByRole("button"));
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(table4);
    expect(pane().querySelector(".staff-pane-lost")).toBeNull();
  });
});

// Phase 2d · review fixes — a settle's refusal (or an answer that never came) landing after its
// detail UNMOUNTED used to die with it: the three settle controls say their outcome inside
// themselves, and only line/discount writes rode the lost-write channel. A cashier who took cash and
// went Back (the sheet's scrim stops a card tap, not the browser's Back), or tapped another card
// beside a card-on-file close or a reader start, never learned it was not recorded.
describe("TablePane — a settle outcome on a table the pane left", () => {
  const settleable = (id: string, n: number, over: Partial<TableDetail> = {}) =>
    detail(id, n, {
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line(`l-${n}`, "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
      ...over,
    });
  const table4 = () => tf("en", "floor.table", { id: "4" });
  const lostLine = () => pane().querySelector(".staff-pane-lost");
  const deferred = () => {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((r, j) => {
      resolve = r;
      reject = j;
    });
    return { promise, resolve, reject };
  };
  async function takeCash() {
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(within(settleSection).getAllByRole("button")[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const take = within(dialog)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("Take $"))!;
    await act(async () => {
      fireEvent.click(take);
    });
  }
  const goBack = async () => {
    await act(async () => {
      window.history.replaceState(null, "", "/staff?floor=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
  };

  it("cash REFUSED after Back closed the pane: said, naming the table, one tap back", async () => {
    answers[A] = ok(settleable(A, 4));
    const d = deferred();
    settleCash.mockReturnValueOnce(d.promise);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCash();
    await goBack();
    expect(document.getElementById("order-h")).toBeNull(); // the detail (and its sheet) is gone
    await act(async () => {
      d.resolve({ ok: false, error: "That table is closed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    const said = tf("en", "floor.pane.lostSettle", { x: table4() });
    // MUTATION: the cash control reports no refusal — it dies with the unmounted sheet; red.
    expect(lostLine()?.textContent).toContain(said);
    expect(pane().querySelector('[role="status"]')!.textContent).toContain(said);
    await act(async () => {
      fireEvent.click(within(lostLine() as HTMLElement).getByRole("button"));
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(table4());
    expect(lostLine()).toBeNull();
  });

  it("cash whose answer never came, after a switch: 'we don't know' — never 'didn't go through'", async () => {
    answers[A] = ok(settleable(A, 4));
    const d = deferred();
    settleCash.mockReturnValueOnce(d.promise);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCash();
    await tap(card(B));
    await tick(0);
    await act(async () => {
      d.reject(new Error("fetch failed"));
      await vi.advanceTimersByTimeAsync(0);
    });
    const said = tf("en", "floor.pane.lostSettleUnknown", { x: table4() });
    // MUTATION: an unknown outcome reported as refused — "didn't go through" over a settle that
    // may have landed, and the cashier takes the money twice; red.
    expect(lostLine()?.textContent).toContain(said);
    // SAID through the ONE region of the detail now shown (B's).
    const region = document
      .getElementById("order-h")!
      .closest("section")!
      .querySelector('[role="status"]')!;
    expect(region.textContent).toContain(said);
  });

  it("a card-on-file close whose answer never came, after a switch: said", async () => {
    answers[A] = ok(settleable(A, 4, { tab: "secure" }));
    const d = deferred();
    closeSecureTab.mockReturnValueOnce(d.promise);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(within(settleSection).getAllByRole("button")[0]!); // the close is the primary
    await act(async () => {
      fireEvent.click(within(settleSection).getByRole("button", { name: /^Charge \$/ }));
    });
    await tap(card(B)); // the confirm is inline, not a sheet: the floor stays tappable
    await tick(0);
    await act(async () => {
      d.reject(new Error("fetch failed"));
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: the close reports no unknown outcome — the charge may have landed, unsaid; red.
    expect(lostLine()?.textContent).toContain(
      tf("en", "floor.pane.lostSettleUnknown", { x: table4() }),
    );
  });

  it("a card-on-file close REFUSED after a switch: said as not gone through", async () => {
    answers[A] = ok(settleable(A, 4, { tab: "secure" }));
    const d = deferred();
    closeSecureTab.mockReturnValueOnce(d.promise);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(within(settleSection).getAllByRole("button")[0]!);
    await act(async () => {
      fireEvent.click(within(settleSection).getByRole("button", { name: /^Charge \$/ }));
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      d.resolve({ ok: false, error: "The card was declined — settle by cash or a fresh card." });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: the close reports no refusal — a declined card on a table left behind, unsaid; red.
    expect(lostLine()?.textContent).toContain(tf("en", "floor.pane.lostSettle", { x: table4() }));
  });

  it("a reader start whose answer never came, after a switch: 'we don't know'", async () => {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    const d = deferred();
    settleCard.mockReturnValueOnce(d.promise);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      d.reject(new Error("fetch failed"));
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: the reader's rejected start reports nothing — the reader may be asking for the
    // money on a table the cashier left; red.
    expect(lostLine()?.textContent).toContain(
      tf("en", "floor.pane.lostSettleUnknown", { x: table4() }),
    );
  });

  it("a reader start refused after a switch: said", async () => {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    const d = deferred();
    settleCard.mockReturnValueOnce(d.promise);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    const reader = within(settleSection).getAllByRole("button").at(-1)!;
    await act(async () => {
      fireEvent.click(reader);
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      d.resolve({ ok: false, code: "inflight", holder: "phone", error: "A guest is paying." });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: the reader's start reports no refusal — it dies with the unmounted button; red.
    expect(lostLine()?.textContent).toContain(tf("en", "floor.pane.lostSettle", { x: table4() }));
  });

  it("a refusal on the table still SHOWN is its control's own — never a lost line", async () => {
    answers[A] = ok(settleable(A, 4));
    settleCash.mockResolvedValueOnce({ ok: false, error: "That table is closed." });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCash();
    await tick(0);
    // MUTATION: route every outcome to the pane — the shown table says its refusal twice; red.
    expect(lostLine()).toBeNull();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      "That table is closed.",
    );
  });
});

describe("TablePane — a table that closes", () => {
  it("says so, and offers the live Table 4 a new party sat at", async () => {
    mount({ publish: [{ sessionId: C, label: "T4", n: 4 }] });
    await tick(0);
    await tap(card(A));
    await tick(0);
    answers[A] = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    expect(replace).not.toHaveBeenCalled();
    expect(pane().textContent).toContain(ts("en", "table.detail.closed.title"));
    const view = within(pane()).getByRole("button", {
      name: new RegExp(tf("en", "floor.pane.closed.openCurrent", { x: "Table 4" })),
    });
    answers[C] = ok(detail(C, 4));
    await act(async () => {
      fireEvent.click(view);
    });
    await tick(0);
    expect(replaceSpy.mock.calls.at(-1)![2]).toBe(`/staff?floor=1#table-${C}`);
  });
  it("no namesake, no button", async () => {
    mount({ publish: [] });
    await tick(0);
    await tap(card(A));
    await tick(0);
    answers[A] = () => Promise.resolve({ kind: "closed" });
    await tick(5000);
    expect(within(pane()).queryByRole("button", { name: /current/ })).toBeNull();
  });
});

describe("TablePane — a first read that failed, said by cause", () => {
  it("a timeout never claims the system is unreachable, and never sends anyone to paper", async () => {
    answers[A] = () => Promise.reject(new Error("staff-poll-timeout"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    expect(pane().textContent).not.toContain(ts("en", "out.shell.title"));
    expect(pane().textContent).not.toMatch(/paper/i);
    // The retry reads again.
    answers[A] = ok(detail(A, 4));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "out.shell.retry") }));
    });
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
  });
  it("a server-said outage is the outage title", async () => {
    answers[A] = () => Promise.resolve({ kind: "outage" });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain(ts("en", "out.shell.title"));
  });
  // Phase 2d · review fixes — the quiet retry is timed from a read's ANSWER, never from its start:
  // re-armed every 5 s regardless, it cancelled the read in the air, so a database answering in
  // 5–15 s (inside `raceTimeout`'s bound) never landed and the pane said "couldn't" forever.
  it("the quiet retry never cancels a read still in the air: a slow answer lands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    answers[A] = () => Promise.reject(new Error("staff-poll-timeout"));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    // The next read answers after 8 s — past the 5 s quiet retry, inside the 15 s read bound.
    answers[A] = () =>
      new Promise((r) => setTimeout(() => r({ kind: "detail", detail: detail(A, 4) }), 8000));
    await tick(5000); // the quiet retry: read #2 goes out
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    await tick(5000); // 10 s — read #2 is still in the air: no third read may replace it
    // MUTATION: arm the quiet retry off `failed` alone — read #3 cancels read #2; red.
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    await tick(3000); // 13 s — read #2 answers, and it lands
    expect(document.getElementById("order-h")).not.toBeNull();
  });
});

describe("TablePane — a start that converged on a seated table", () => {
  function StartTable4() {
    const mint = useCounterMint();
    return (
      <button
        type="button"
        onClick={() =>
          mint.run(
            "table-4",
            { kind: "table", tableNumber: 4 },
            {
              onStart: () => {},
              onRefusal: () => {},
            },
          )
        }
      >
        start 4
      </button>
    );
  }
  const mountMint = () =>
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <CounterMintProvider>
                <StartTable4 />
              </CounterMintProvider>
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
  it("opens it in the pane at split width (no route), where a card tap would", async () => {
    openRegisterOrder.mockResolvedValue({ ok: true, sessionId: A, created: false });
    mountMint();
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "start 4" }));
    });
    await tick(0);
    // MUTATION: route every landing through the router — the counter screen is swapped for the
    // table page on a tablet; red.
    expect(push).not.toHaveBeenCalled();
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
  });
  it("a NEW session still goes to its add screen; a phone still routes", async () => {
    openRegisterOrder.mockResolvedValue({ ok: true, sessionId: A, created: true });
    mountMint();
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "start 4" }));
    });
    await tick(0);
    expect(push).toHaveBeenCalledWith(`/staff/table/${A}/add`);
  });
});

// ── Critic round (split) — each block is red against the code it fixes. ──
describe("TablePane — a floor re-render never re-reads the table shown", () => {
  it("new floor rows: no second first-read, and a close the poll has not said yet never swaps the detail", async () => {
    const view = mount({ publish: [{ sessionId: A, label: "T4", n: 4 }] });
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The webhook closes it (the detail's own hold decides what that means) — then the floor
    // publishes new rows, which re-renders the split.
    answers[A] = () => Promise.resolve({ kind: "closed" });
    view.rerender(tree({ publish: [{ sessionId: B, label: "T7", n: 7 }] }));
    await tick(0);
    // MUTATION: a new `selectedNow` arrow per render — the first read runs again, lands `closed`,
    // and unmounts the live detail past its terminal hold; red.
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    expect(document.getElementById("order-h")).not.toBeNull();
  });
});

describe("TablePane — a Clear or Merge that answers after a switch", () => {
  const H = {
    orderId: "o-00b7c8d9",
    totalCents: 1200,
    tipCents: 0,
    tenderedCents: 2000,
    isCounter: false,
    cartId: null,
  };
  it("a late Clear on A never closes B, never drops B's paid card; A's own card goes", async () => {
    let land!: (v: unknown) => void;
    clearTable.mockReturnValueOnce(new Promise((r) => (land = r)));
    // Each card names its table's LIVE cart (a settle whose card landed before the re-read): a card
    // another cart superseded is dropped on sight (Codex #306), which would empty A's stash before
    // the Clear ever ran and leave the drop below proving nothing.
    stashHandoff(A, { ...H, orderId: "o-00a1a1a1", cartId: "c-4" });
    stashHandoff(B, { ...H, cartId: "c-7" });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    fireEvent.click(within(pane()).getByRole("button", { name: /Clear table/ }));
    const confirm = within(pane())
      .getAllByRole("button")
      .find((b) => b.textContent?.includes(ts("en", "settle.confirm")))!;
    await act(async () => {
      fireEvent.click(confirm);
    });
    await tap(card(B));
    await tick(0);
    backSpy.mockClear();
    await act(async () => {
      land({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: an unbound `toFloor` — A's late success closes B's pane; red.
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(backSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(handoffStashKey(B))).toContain("o-00b7c8d9");
    // MUTATION: skip ClearTableButton's own drop — a cleared table's card outlives it; red.
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });

  it("a late Merge on A never switches the pane away from B", async () => {
    let land!: (v: unknown) => void;
    mergeTables.mockReturnValueOnce(new Promise((r) => (land = r)));
    getMergeCandidates.mockResolvedValueOnce([
      { sessionId: C, label: "T9", tableNumber: 9, mode: "dinein", itemCount: 1, partySize: 2 },
    ]);
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: /Merge with another table/ }));
    });
    await tick(0);
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: /Table 9/ }));
    });
    await tick(0);
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: /Merge into Table 9/ }));
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      land({ ok: true, movedCount: 1, targetSessionId: C });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: an unbound `toTable` — A's late merge moves the pane off B to Table 9; red.
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(location.hash).toBe(`#table-${B}`);
  });
});

describe("TablePane — a table picked again starts from a fresh read", () => {
  it("A → ✕ → A never shows A's old detail", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain("Mohinga");
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    answers[A] = ok(detail(A, 4, { lines: [line("l-4b", "Tea")] }));
    await tap(card(A));
    await tick(0);
    // MUTATION: reuse the previous read for the same id — the old order is seeded into the detail
    // (useState(initial)) and stays until the next poll; red.
    expect(pane().textContent).toContain("Tea");
    expect(pane().textContent).not.toContain("Mohinga");
    expect(getTableDetail).toHaveBeenCalledTimes(2);
  });
  it("A → B (still loading) → A reads A again — once B's read has answered", async () => {
    let resolveB!: (r: TableDetailResult) => void;
    answers[B] = () => new Promise((r) => (resolveB = r));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await tap(card(B));
    answers[A] = ok(detail(A, 4, { lines: [line("l-4b", "Tea")] }));
    await tap(card(A));
    await tick(0);
    // Phase 2h (9f) — B's read is still in the air: A's fresh read is owed to it (never sent beside
    // it), and the pane never shows A's OLD detail meanwhile.
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(pane().textContent).not.toContain("Mohinga");
    await act(async () => {
      resolveB({ kind: "detail", detail: detail(B, 7) });
    });
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(3);
    expect(pane().textContent).toContain("Tea");
    expect(pane().textContent).not.toContain("Mohinga");
  });
  it("re-tapping the table SHOWN keeps its live detail (no re-read, no remount)", async () => {
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const heading = document.getElementById("order-h");
    await tap(card(A));
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    expect(document.getElementById("order-h")).toBe(heading);
  });
});

describe("TablePane — a refusal after the pane closed is shown at every width", () => {
  it("the split says `lost` (CSS shows the pane's line below 64em), and the line is SAID", async () => {
    let refuse!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (refuse = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const inc = pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    await act(async () => {
      refuse({ ok: false, error: "That line just changed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    const split = document.querySelector<HTMLElement>(".staff-split")!;
    // MUTATION: `empty` while a lost write stands — the CSS hides the pane (and its region) on a
    // phone and a portrait iPad; red.
    expect(split.dataset.pane).toBe("lost");
    const said = tf("en", "floor.pane.lostWrite", { x: tf("en", "floor.table", { id: "4" }) });
    expect(pane().querySelector('[role="status"]')!.textContent).toContain(said);
    // The one way back is a real 44px Button, not a bare browser button.
    const view = within(pane().querySelector(".staff-pane-lost") as HTMLElement).getByRole(
      "button",
    );
    expect(view.className).toContain("ui-btn");
    expect(view.className).not.toContain("staff-press");
    await act(async () => {
      fireEvent.click(view);
    });
    await tick(0);
    expect(split.dataset.pane).toBe("open");
  });
  it("a refusal from A's CLOSED detail, landing after A was picked again, is still said", async () => {
    let refuse!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (refuse = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const inc = pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await act(async () => {
      fireEvent.click(within(pane()).getByRole("button", { name: ts("en", "shell.close") }));
    });
    await tick(0);
    await tap(card(A));
    await tick(0);
    await act(async () => {
      refuse({ ok: false, error: "That line just changed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    // The new A detail never issued that write, so its region cannot say it: dropping it because
    // "A is shown" loses a refused dish change silently. MUTATION: re-add that check; red.
    const said = tf("en", "floor.pane.lostWrite", { x: tf("en", "floor.table", { id: "4" }) });
    expect(pane().querySelector(".staff-pane-lost")?.textContent).toContain(said);
  });
  it("a refusal on the table SHOWN is its own detail's, never a lost write", async () => {
    let refuse!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (refuse = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const inc = pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    await act(async () => {
      fireEvent.click(inc);
    });
    await act(async () => {
      refuse({ ok: false, error: "That line just changed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    // A MOUNTED detail says its own refusal (its one region); only an unmounted one reports it here.
    expect(pane().querySelector(".staff-pane-lost")).toBeNull();
  });
});

describe("TablePane — a table that closes while a control inside it has focus", () => {
  it("focus goes to the closed notice's title, never <body>", async () => {
    mount({ publish: [] });
    await tick(0);
    await tap(card(A));
    await tick(0);
    const inc = pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!;
    inc.focus();
    expect(document.activeElement).toBe(inc);
    answers[A] = () => Promise.resolve({ kind: "closed", label: "T4", tableNumber: 4 });
    await tick(5000);
    await tick(0);
    // MUTATION: sample focus only after the swap — the removed control left it on <body>; red.
    expect(document.activeElement).toBe(document.getElementById("table-pane-closed-h"));
  });
  it("focus elsewhere stays where it is", async () => {
    mount({ publish: [] });
    await tick(0);
    await tap(card(A));
    await tick(0);
    const outside = document.getElementById("outside")!;
    outside.focus();
    answers[A] = () => Promise.resolve({ kind: "closed", label: "T4", tableNumber: 4 });
    await tick(5000);
    await tick(0);
    expect(document.activeElement).toBe(outside);
  });
});

describe("TablePane — a deep link to a table that is already closed", () => {
  it("names it, stops saying loading, and offers the live namesake", async () => {
    answers[A] = () => Promise.resolve({ kind: "closed", label: "T4", tableNumber: 4 });
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [], publish: [{ sessionId: C, label: "T4", n: 4 }] });
    await tick(0);
    await tick(0);
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "4" }));
    expect(pane().getAttribute("aria-busy")).toBeNull();
    expect(pane().textContent).not.toContain(
      tf("en", "shell.loading", { what: ts("en", "what.table") }),
    );
    expect(
      within(pane()).getByRole("button", {
        name: new RegExp(tf("en", "floor.pane.closed.openCurrent", { x: "Table 4" })),
      }),
    ).toBeTruthy();
  });
  // Phase 2d · review fixes — `closed` is also the answer for an id the server never had (a typed
  // or stale hash): the notice HEDGES its cause in both scripts, and names every real one (paid,
  // cleared, merged, idle) — never "its session ended" / "time ran out" asserted as history.
  it("a session the server cannot find: the notice hedges, never states a history", async () => {
    answers[A] = () => Promise.resolve({ kind: "closed" });
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    const body = tf("en", "floor.pane.closed.body", {});
    expect(pane().textContent).toContain(body);
    expect(body).toMatch(/\bmay\b/);
    expect(body).not.toMatch(/session ended/);
    expect(STAFF["floor.pane.closed.body"].my).toContain("ဖြစ်နိုင်ပါတယ်"); // "may be" — the hedge
    expect(STAFF["floor.pane.closed.body"].my).not.toContain("အချိန်ကုန်"); // "time ran out"
  });
  it("a first read that failed with no name still stops saying loading", async () => {
    answers[A] = () => Promise.resolve({ kind: "outage" });
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    expect(paneHeading().textContent).toBe(ts("en", "floor.pane.head.unnamed"));
    expect(pane().textContent).not.toContain(
      tf("en", "shell.loading", { what: ts("en", "what.table") }),
    );
  });
});

describe("TablePane — the settle arrival in the pane", () => {
  it("?settle=1 is dropped by the split, never by a router.replace that strips the hash", async () => {
    window.history.replaceState(null, "", `/staff?floor=1&settle=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
    // MUTATION: drop the `!inPane` guard — replace(pathname) strips ?floor=1 and the hash; red.
    expect(replace).not.toHaveBeenCalled();
    expect(location.search).toBe("?floor=1");
    expect(location.hash).toBe(`#table-${A}`);
  });
});

describe("TablePane — a converged start on a phone", () => {
  it("routes to the table page (the pane is not shown below 48em)", async () => {
    split = false;
    openRegisterOrder.mockResolvedValue({ ok: true, sessionId: A, created: false });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <CounterMintProvider>
                <StartTable4Phone />
              </CounterMintProvider>
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "start 4" }));
    });
    await tick(0);
    // MUTATION: open in the pane at every width — a phone's column is swapped for a pane it
    // cannot close back to a floor it can see, and the URL never reaches the table page; red.
    expect(push).toHaveBeenCalledWith(`/staff/table/${A}`);
    expect(location.hash).toBe("");
  });
});
function StartTable4Phone() {
  const mint = useCounterMint();
  return (
    <button
      type="button"
      onClick={() =>
        mint.run(
          "table-4",
          { kind: "table", tableNumber: 4 },
          { onStart: () => {}, onRefusal: () => {} },
        )
      }
    >
      start 4
    </button>
  );
}

// ── Phase 2g · reader (D1) ── the pane no longer HOLDS a table whose reader collects. Codex rounds
// 1–2 on #306 held it (and refused every start) because a switch unmounted the collect panel — the
// 2.5 s poll that slides the freeze and records a counter order's #CODE. The poll lives in
// `ReaderCollectProvider` above every route now, so every case below is the INVERSE of the hold it
// replaced: the pane moves freely mid-collect, and the poll — and the #CODE it records — survive.
describe("TablePane — the pane moves freely mid-collect; the poll survives (P2em)", () => {
  const settleable = (id: string, n: number, over: Partial<TableDetail> = {}) =>
    detail(id, n, {
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line(`l-${n}`, "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
      ...over,
    });
  const table4 = () => tf("en", "floor.table", { id: "4" });
  const table7 = () => tf("en", "floor.table", { id: "7" });
  const readerPanel = () =>
    screen.queryByRole("group", { name: ts("en", "settle.a11y.readerPanel") });
  const closeBtn = () => within(pane()).getByRole("button", { name: ts("en", "shell.close") });
  const goBack = async () => {
    await act(async () => {
      window.history.replaceState(null, "", "/staff?floor=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
  };
  const polls = () => terminalStatus.mock.calls.length;
  /** Table 4 open in the pane, its reader collecting. */
  async function collectingOn4(over: Partial<TableDetail> = {}) {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4, over));
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tick(0);
    expect(readerPanel()).not.toBeNull();
    expect(document.activeElement).toBe(readerPanel()); // the panel takes focus as it mounts
  }

  it("a card tap mid-collect switches the pane; the poll keeps running with Table 4's panel gone", async () => {
    await collectingOn4();
    await tap(card(B));
    expect(location.hash).toBe(`#table-${B}`);
    expect(paneHeading().textContent).toBe(table7());
    expect(readerPanel()).toBeNull();
    const n = polls();
    await tick(5000);
    // Watched red against the pre-2g pane (the poll died with the switch): now it never stops.
    expect(polls()).toBe(n + 2);
    expect(terminalStatus).toHaveBeenLastCalledWith({ sessionId: A, paymentIntentId: "pi_4" });
  });

  it("✕, Escape and Back close the pane mid-collect; the poll keeps running", async () => {
    await collectingOn4();
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    expect(document.getElementById("order-h")).toBeNull();
    let n = polls();
    await tick(2500);
    expect(polls()).toBe(n + 1);
    // Escape and Back, from Table 4 shown again.
    await tap(card(A));
    await tick(0);
    await act(async () => {
      fireEvent.keyDown(paneHeading(), { key: "Escape" });
    });
    await tick(0);
    expect(document.getElementById("order-h")).toBeNull();
    await tap(card(A));
    await tick(0);
    await goBack();
    expect(document.getElementById("order-h")).toBeNull();
    n = polls();
    await tick(2500);
    expect(polls()).toBe(n + 1);
  });

  it("back on the paying table the panel is there again — and does not pull focus (a re-attach)", async () => {
    await collectingOn4();
    await tap(card(B));
    await tap(card(A));
    await tick(0);
    expect(readerPanel()).not.toBeNull();
    // The tap's own focus rule (the pane heading) stands; the panel never steals it back.
    expect(document.activeElement).toBe(paneHeading());
  });

  it("charged but not yet recorded, then a switch: the counter's #CODE still lands — stashed for its table and shown when it is picked again", async () => {
    await collectingOn4({ label: "reg-7f3a", tableNumber: null, counterOrder: true });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    await tick(2500);
    await tap(card(B));
    expect(paneHeading().textContent).toBe(table7());
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    expect(sessionStorage.getItem(handoffStashKey(A))).toContain("o-00a1b2c3");
    // The webhook closed the counter session behind its charge: picked again, the pane's closed
    // state shows the card the poll recorded.
    answers[A] = () => Promise.resolve({ kind: "closed", label: "reg-7f3a", tableNumber: null });
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).toContain("#A1B2C3");
    // The poll is over.
    const n = polls();
    await tick(5000);
    expect(polls()).toBe(n);
  });

  it("a reader start that SUCCEEDS after a switch still polls (P2en) — and the pane it left is not pulled back", async () => {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    let resolve!: (v: unknown) => void;
    settleCard.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      resolve({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // Watched red against the pre-2g pane: the stash was written and nothing ever polled it.
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: A, paymentIntentId: "pi_4" });
    expect(paneHeading().textContent).toBe(table7());
  });

  it("the bar's chip says it while Table 4 is not shown, and its View opens Table 4 in THIS pane", async () => {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <StaffBar lang="en" title="floor.door.counter" />
          <LiveConnectionProvider>
            <CounterSplit terminalReady>
              <Floor />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tick(0);
    const chip = () => document.querySelector<HTMLElement>(".staff-reader");
    // Table 4 shown: the panel says it; the bar does not.
    expect(chip()).toBeNull();
    await tap(card(B));
    expect(chip()).not.toBeNull();
    const view = within(chip()!).getByRole("link", {
      name: tf("en", "floor.pane.open", { x: table4() }),
    });
    await tap(view);
    // MUTATION (p2g-reader/split-never-registers-its-pane): the split offers the chip no opener — a
    // hash push on this same page fires no `hashchange`, and View does nothing; red.
    expect(paneHeading().textContent).toBe(table4());
    expect(location.hash).toBe(`#table-${A}`);
    expect(push).not.toHaveBeenCalled();
    await tick(0);
    expect(chip()).toBeNull();
    expect(readerPanel()).not.toBeNull();
  });

  it("tapping the paying table takes the bar's chip down in the SAME commit — the pane's loading state counts as shown (A11Y-10)", async () => {
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <StaffBar lang="en" title="floor.door.counter" />
          <LiveConnectionProvider>
            <CounterSplit terminalReady>
              <Floor />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tick(0);
    const chip = () => document.querySelector<HTMLElement>(".staff-reader");
    await tap(card(B));
    expect(chip()).not.toBeNull();
    // Table 4 picked again, its read slow: the pane is LOADING (no detail registered yet).
    answers[A] = () => new Promise(() => {});
    await act(async () => {
      fireEvent.click(card(A));
    });
    expect(pane().querySelector(".staff-pane-body")!.getAttribute("aria-busy")).toBe("true");
    // MUTATION (p2g-fix-reader/pane-shown-only-once-read): only a mounted detail (or the closed
    // state) registers the table — the chip lingers through the loading state, then the bar row
    // vanishes under the finger; red.
    expect(chip()).toBeNull();
  });

  it("a counter order's closed pane, shown while its charge is still recording, shows the #CODE the moment it lands", async () => {
    await collectingOn4({ label: "reg-7f3a", tableNumber: null, counterOrder: true });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    await tick(2500);
    await tap(card(B));
    // The webhook closed the counter session; the order is not recorded on this end yet.
    answers[A] = () => Promise.resolve({ kind: "closed", label: "reg-7f3a", tableNumber: null });
    await tap(card(A));
    await tick(0);
    expect(pane().textContent).not.toContain("#A1B2C3");
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    // MUTATION (p2g-reader/closed-pane-misses-the-landing): the closed pane reads the stash once —
    // a card landing while it is shown never appears there; red.
    expect(pane().textContent).toContain("#A1B2C3");
  });

  it("Table 7's reader button is held while Table 4's collect is live — one reader", async () => {
    answers[B] = ok(settleable(B, 7));
    await collectingOn4();
    await tap(card(B));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    const reader = within(settleSection).getAllByRole("button").at(-1)!;
    expect(reader.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("terminal-busy")!.textContent).toBe(
      tf("en", "settle.reader.busyElsewhere", { x: table4() }),
    );
    settleCard.mockClear();
    await act(async () => {
      fireEvent.click(reader);
    });
    expect(settleCard).not.toHaveBeenCalled();
  });
});

// ── Phase 2d · Codex round 2 · pane ── a lost outcome SURVIVES a close. The split used to clear it on
// every close, so a payment on Table 4 whose answer never came (said above Table 7, the table shown
// when it landed) vanished the moment the cashier closed Table 7 — ✕, Escape or Back — though it is
// about Table 4 and nothing answered it: the only warning against taking the money twice. The floor
// with nothing picked already shows a lost outcome (`data-pane="lost"`), so a close keeps it; only
// going back to its table, or a newer loss that outranks it (`nextLost`), replaces it.
describe("TablePane — a lost outcome outlives a close of another table (Codex #306 round 2)", () => {
  const settleable = (id: string, n: number) =>
    detail(id, n, {
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line(`l-${n}`, "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });
  const table4 = () => tf("en", "floor.table", { id: "4" });
  const lostLine = () => pane().querySelector<HTMLElement>(".staff-pane-lost");
  const paneRegion = () => pane().querySelectorAll('[role="status"]');
  const unknownOn4 = () => tf("en", "floor.pane.lostSettleUnknown", { x: table4() });
  const closeBtn = () => within(pane()).getByRole("button", { name: ts("en", "shell.close") });
  /** Cash on Table 4 whose answer never came, landing while Table 7 is shown. */
  async function unknownCashOn4ThenShow7() {
    answers[A] = ok(settleable(A, 4));
    let fail!: (e: unknown) => void;
    settleCash.mockReturnValueOnce(new Promise((_r, j) => (fail = j)));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(within(settleSection).getAllByRole("button")[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(
        within(dialog)
          .getAllByRole("button")
          .find((b) => b.textContent?.startsWith("Take $"))!,
      );
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      fail(new Error("fetch failed"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(lostLine()?.textContent).toContain(unknownOn4());
  }
  const closes: [string, () => Promise<void>][] = [
    [
      "✕",
      async () => {
        await act(async () => {
          fireEvent.click(closeBtn());
        });
        await tick(0);
      },
    ],
    [
      "Escape",
      async () => {
        await act(async () => {
          fireEvent.keyDown(paneHeading(), { key: "Escape" });
        });
        await tick(0);
      },
    ],
    [
      "Back",
      async () => {
        await act(async () => {
          window.history.replaceState(null, "", "/staff?floor=1");
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        await tick(0);
      },
    ],
  ];

  it.each(closes)(
    "cash on Table 4 with no answer, Table 7 shown, %s on Table 7: the warning stays on the floor, shown and said",
    async (_how, close) => {
      await unknownCashOn4ThenShow7();
      await close();
      expect(document.getElementById("order-h")).toBeNull(); // Table 7 closed: nothing picked
      const split = document.querySelector<HTMLElement>(".staff-split")!;
      // MUTATION: the close clears the lost outcome — the floor reads "empty", the one warning
      // against collecting Table 4's money again is gone, and nothing answered it; red.
      expect(split.dataset.pane).toBe("lost");
      expect(lostLine()?.textContent).toContain(unknownOn4());
      // Said once, through the pane's ONE region (the detail that carried it is gone).
      expect(paneRegion()).toHaveLength(1);
      expect(paneRegion()[0]!.textContent).toContain(unknownOn4());
    },
  );

  it("a DISH that did not save outlives the close too — only its table's own detail can show it again", async () => {
    let refuse!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (refuse = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await act(async () => {
      fireEvent.click(pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!);
    });
    await tap(card(B));
    await tick(0);
    await act(async () => {
      refuse({ ok: false, error: "That line just changed." });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    // MUTATION: a close keeps a payment's loss but drops a dish's — a dish the cashier changed on
    // Table 4 that never saved is forgotten the moment Table 7 closes; red.
    const said = tf("en", "floor.pane.lostWrite", { x: table4() });
    expect(document.querySelector<HTMLElement>(".staff-split")!.dataset.pane).toBe("lost");
    expect(lostLine()?.textContent).toContain(said);
    expect(paneRegion()[0]!.textContent).toContain(said);
  });

  // The clears that DO answer it still clear it: going back to its table.
  it("after the close, the line's own 'View' goes back to Table 4 and the warning goes with the answer", async () => {
    await unknownCashOn4ThenShow7();
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    await act(async () => {
      fireEvent.click(within(lostLine()!).getByRole("button"));
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(table4());
    expect(lostLine()).toBeNull();
    expect(document.querySelector<HTMLElement>(".staff-split")!.dataset.pane).toBe("open");
  });

  it("after the close, Table 4's own card on the floor answers it too", async () => {
    await unknownCashOn4ThenShow7();
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(paneHeading().textContent).toBe(table4());
    expect(lostLine()).toBeNull();
  });

  it("another table picked after the close keeps it — a switch answers nothing either", async () => {
    await unknownCashOn4ThenShow7();
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    await tap(card(B));
    await tick(0);
    expect(lostLine()?.textContent).toContain(unknownOn4());
  });
});

// ── Phase 2g · reader (D1) ── `openSession` is the pane's API, and its answer is a contract: `false`
// tells the caller to navigate instead (the mint's converged landing does exactly that). With the
// hold retired it simply OPENS the table at split width — mid-collect too — and the poll goes on.
describe("TablePane — openSession mid-collect opens the table (the hold is retired)", () => {
  it("answers HANDLED, the pane switches, nothing navigates, and the poll keeps running", async () => {
    let answered: boolean | null = null;
    function OpenSeven() {
      const api = useTablePane()!;
      return (
        <button
          type="button"
          onClick={() => {
            answered = api.openSession(B, { counter: false, display: "7" });
            if (!answered) push(`/staff/table/${B}`);
          }}
        >
          open 7
        </button>
      );
    }
    terminalReady = true;
    answers[A] = ok(
      detail(A, 4, {
        settleTotalCents: 4210,
        settleTipBaseCents: 4000,
        lines: [line("l-4", "Mohinga", false)],
        send: {
          sendable: 0,
          staffAdded: 0,
          togoDraft: 0,
          inKitchen: true,
          foodDraft: false,
          counterDraft: 0,
          counterSentPastGrace: false,
        },
      }),
    );
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady>
              <Floor />
              <OpenSeven />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open 7" }));
    });
    await tick(0);
    expect(answered).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    const n = terminalStatus.mock.calls.length;
    await tick(2500);
    expect(terminalStatus.mock.calls.length).toBe(n + 1);
  });
});

// ── Phase 2g · P2em (D2) ── a closed counter order's #CODE card from its ORDER ROW: the closed verdict
// carries it, so the pane shows it with no stash (another tablet, a reload, a panel that never saw the
// charge land). The tab's stash — with the tender and the change — still wins.
describe("TablePane — a closed counter order's server-built card (P2em · D2)", () => {
  const SERVER_CARD = {
    orderId: "o-00a1b2c3",
    totalCents: 4210,
    tipCents: 0,
    tenderedCents: null,
    isCounter: true,
    cartId: "c-4",
    sentEarly: false,
  };
  // The verdict as `getTableDetail` builds it (`serverCounterOutcome`): with a card, the order is
  // unrefunded ("none"); without one, the refund state is whatever the row said — or unknown.
  const closedCounter =
    (
      handoff: typeof SERVER_CARD | null,
      refund: "none" | "partial" | "full" | null = handoff ? "none" : null,
      orderId: string | null = handoff || refund ? SERVER_CARD.orderId : null,
    ) =>
    () =>
      Promise.resolve({
        kind: "closed" as const,
        label: "reg-7f3a",
        tableNumber: null,
        handoff,
        refund,
        orderId,
      });
  const openDeepLink = async () => {
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    await tick(0);
  };

  it("a deep link with NO stash: the verdict's card shows, under the counter title, unfocused", async () => {
    answers[A] = closedCounter(SERVER_CARD);
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    await tick(0);
    // MUTANT p2g-code/pane-closed-ignores-server-handoff — the pane reads the stash alone, and a
    // counter order paid on another tablet (or before a reload) closes with no #CODE; red.
    // MUTANT p2g-code/pane-first-read-drops-server-handoff — the first read keeps the label, drops
    // the card; red.
    const card = within(pane()).getByRole("region", { name: /Paid.*\$42\.10.*#A1B2C3/ });
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.counterTitle"));
    expect(document.getElementById("handoff-title")!.tagName).toBe("H3");
    expect(document.activeElement).not.toBe(card);
    // p2g-int/pane-hedges-under-the-card — with "Paid" standing above, "It may have been paid,
    // cleared or merged…" doubts the fact the card states; red.
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.closed.body"));
  });

  it("the tab's STASH wins: its tender and change stay, never swapped for the row's bare total", async () => {
    stashHandoff(A, { ...SERVER_CARD, tenderedCents: 5000 });
    answers[A] = closedCounter(SERVER_CARD);
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    await tick(0);
    // MUTANT p2g-code/pane-server-handoff-beats-stash — while the server says nothing came back
    // (refund "none"), the server card outranks the cashier's: the change to hand back
    // ($50.00 − $42.10) disappears; red.
    expect(
      within(pane()).getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ }),
    ).toBeTruthy();
    expect(sessionStorage.getItem(handoffStashKey(A))).not.toBeNull();
  });

  // ── Phase 2g · review (M2 · PT-3 · PT-7) ── the server's refund verdict VETOES the tab's card.
  it("the tab's stash over an order the verdict names PARTLY refunded: no Paid card, the refund said with its #CODE, the stash dropped", async () => {
    stashHandoff(A, { ...SERVER_CARD, tenderedCents: 5000 });
    answers[A] = closedCounter(null, "partial");
    await openDeepLink();
    // MUTANT p2g-fix-code/veto-ignored-on-pane — "the tab's card wins" outranks the refund:
    // "✓ Paid · Change $7.90 · #A1B2C3" stands over money that went back; red.
    // MUTANT p2g-fix-code/pane-first-read-drops-refund — the pane reads the refund as unknown: the
    // stash stands and the hedge is said; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.counterTitle"));
    expect(pane().textContent).toContain(
      tf("en", "floor.pane.closed.refundedPart", { id: "#A1B2C3" }),
    );
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.closed.body"));
    // MUTANT p2g-fix-code/pane-stash-kept-after-refund — the vetoed card stays in storage, and the
    // next visit's detail restores "Paid" over the refund; red.
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });

  it("the tab's stash over an order the verdict names refunded IN FULL: the plain fact, the stash dropped", async () => {
    stashHandoff(A, SERVER_CARD);
    answers[A] = closedCounter(null, "full");
    await openDeepLink();
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.refundedFull"));
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.closed.body"));
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });

  it("an UNREADABLE order (refund unknown) vetoes nothing: the tab's card stands; with no card, the hedge", async () => {
    stashHandoff(A, { ...SERVER_CARD, tenderedCents: 5000 });
    answers[A] = closedCounter(null, null);
    await openDeepLink();
    expect(
      within(pane()).getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ }),
    ).toBeTruthy();
    expect(sessionStorage.getItem(handoffStashKey(A))).not.toBeNull();
    cleanup();
    sessionStorage.clear();
    answers[A] = closedCounter(null, null);
    await openDeepLink();
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.body"));
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.closed.refundedFull"));
  });

  it("no card in the verdict and no refund the server could name (an unreadable order): the notice alone", async () => {
    answers[A] = closedCounter(null);
    window.history.replaceState(null, "", `/staff?floor=1#table-${A}`);
    mount({ cards: [] });
    await tick(0);
    await tick(0);
    await tick(0);
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.counterTitle"));
    expect(document.getElementById("handoff-title")).toBeNull();
    // With no card and nothing named, the hedge is the honest line (a refund it CAN name is said —
    // Phase 2g · review, below).
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.body"));
  });

  it("a counter order that closes WHILE shown carries the verdict's card into the closed pane", async () => {
    answers[A] = ok(
      detail(A, 4, { label: "reg-7f3a", tableNumber: null, mode: "pickup", counterOrder: true }),
    );
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(document.getElementById("handoff-title")).toBeNull();
    answers[A] = closedCounter(SERVER_CARD);
    await tick(5000);
    await tick(0); // the closed state reads the stash first (a scheduled callback)
    // MUTANT p2g-code/detail-closed-drops-server-handoff — the detail hands the pane no card; and
    // MUTANT p2g-code/pane-detail-close-drops-server-handoff — the pane drops the one it is handed:
    // either way the order closes with no #CODE beside the floor; red.
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.counterTitle"));
    expect(within(pane()).getByRole("region", { name: /Paid.*#A1B2C3/ })).toBeTruthy();
  });

  it("an order that closes WHILE shown, refunded in part: the pane is handed the refund and says it", async () => {
    stashHandoff(A, { ...SERVER_CARD, tenderedCents: 5000 });
    answers[A] = ok(
      detail(A, 4, { label: "reg-7f3a", tableNumber: null, mode: "pickup", counterOrder: true }),
    );
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    // The restored counter card HOLDS the closed bounce (the #CODE hand-over must not be yanked)…
    expect(within(pane()).getByRole("region", { name: /Paid.*#A1B2C3/ })).toBeTruthy();
    answers[A] = closedCounter(null, "partial");
    await tick(5000);
    // …until a verdict names its order refunded: the card goes from screen and stash at once.
    // MUTANT p2g-fix-code/closed-veto-ignored — the held card ignores the verdict: "Paid · Change
    // $7.90" stands over the refund for as long as the pane stays open, the refund never said; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
    // No longer held, the next read hands the verdict to the pane, which says the refund.
    await tick(5000);
    await tick(0); // the closed state reads the stash first (a scheduled callback)
    // MUTANT p2g-fix-code/pane-detail-close-drops-refund — the pane keeps the label and the card but
    // not the refund: the hedge is said over an order the server named refunded; red.
    expect(pane().textContent).toContain(ts("en", "floor.pane.closed.counterTitle"));
    expect(pane().textContent).toContain(
      tf("en", "floor.pane.closed.refundedPart", { id: "#A1B2C3" }),
    );
  });

  it("the pane's live detail drops its RESTORED card once a read names that order refunded", async () => {
    const settledCounter = (refund: TableDetail["refund"]) =>
      detail(A, 4, {
        label: "reg-7f3a",
        tableNumber: null,
        mode: "pickup",
        counterOrder: true,
        cartId: null,
        settled: true,
        status: "paid",
        paidTotalCents: 4210,
        paidOrderId: SERVER_CARD.orderId,
        refund,
        settledOrderCount: 1,
        lines: [line("l-4", "Mohinga", false)],
      });
    stashHandoff(A, { ...SERVER_CARD, tenderedCents: 5000 });
    answers[A] = ok(settledCounter({ state: "none", refundedCents: 0, netPaidCents: 4210 }));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    expect(
      within(pane()).getByRole("region", { name: /Paid.*Change.*\$7\.90.*#A1B2C3/ }),
    ).toBeTruthy();
    answers[A] = ok(settledCounter({ state: "partial", refundedCents: 1200, netPaidCents: 3010 }));
    await tick(5000);
    // MUTANT p2g-fix-code/veto-ignored-on-detail-restored — the restored stash keeps "Paid · Change
    // $7.90" over the refund the detail itself now states; red.
    expect(document.getElementById("handoff-title")).toBeNull();
    expect(pane().textContent).toContain(
      tf("en", "table.detail.refunded.partial", { m: "$30.10", r: "$12.00" }),
    );
    expect(sessionStorage.getItem(handoffStashKey(A))).toBeNull();
  });
});

// ── Phase 2g integration ── the lane's Take payment at split width opens the pane through
// `openSession(…, { settle: true })` — the in-place twin of `?settle=1`, because a router push of
// that URL from the counter screen fires no `hashchange` and the split never sees it.
describe("TablePane — openSession can land on the payment section", () => {
  function OpenFour({ settle }: { settle?: boolean }) {
    const api = useTablePane()!;
    return (
      <button
        type="button"
        onClick={() => {
          api.openSession(A, { counter: true, display: "" }, settle ? { settle } : undefined);
        }}
      >
        open 4
      </button>
    );
  }
  const settleable = () =>
    ok(
      detail(A, 4, {
        settleTotalCents: 4210,
        settleTipBaseCents: 4000,
        lines: [line("l-4", "Mohinga", false)],
        send: {
          sendable: 0,
          staffAdded: 0,
          togoDraft: 0,
          inKitchen: true,
          foodDraft: false,
          counterDraft: 0,
          counterSentPastGrace: false,
        },
      }),
    );
  const mountOpener = (settle?: boolean) =>
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <Floor cards={[]} />
              <OpenFour settle={settle} />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );

  it("settle: true focuses the settle section's heading — the lane's Take payment", async () => {
    // p2g-int/split-open-ignores-settle
    answers[A] = settleable();
    mountOpener(true);
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open 4" }));
    });
    await tick(0);
    await tick(0);
    expect(document.getElementById("settle-h")).not.toBeNull();
    expect(document.activeElement).toBe(document.getElementById("settle-h"));
  });

  it("without settle the pane opens on its heading, never the payment section", async () => {
    answers[A] = settleable();
    mountOpener(false);
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open 4" }));
    });
    await tick(0);
    await tick(0);
    expect(document.getElementById("settle-h")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.getElementById("settle-h"));
  });

  // Codex r1 on #309 — the table ALREADY in the pane: its detail stays mounted (keyed by session), so
  // the mount-time seed never sees the settle, and a fresh heading focus (a parent effect, run after
  // the detail's) would steal it back.
  it("settle: true on the table ALREADY shown still lands on the payment section", async () => {
    answers[A] = settleable();
    function OpenTwice() {
      const api = useTablePane()!;
      return (
        <>
          <button type="button" onClick={() => api.openSession(A, { counter: true, display: "" })}>
            open 4
          </button>
          <button
            type="button"
            onClick={() => api.openSession(A, { counter: true, display: "" }, { settle: true })}
          >
            pay 4
          </button>
        </>
      );
    }
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <LiveConnectionProvider>
            <CounterSplit terminalReady={false}>
              <Floor cards={[]} />
              <OpenTwice />
            </CounterSplit>
          </LiveConnectionProvider>
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await tick(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open 4" }));
    });
    await tick(0);
    await tick(0);
    expect(document.getElementById("settle-h")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.getElementById("settle-h"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pay 4" }));
    });
    await tick(0);
    await tick(0);
    // MUTATION (p2g-cx1/shown-pane-ignores-settle): only the mount seed reads the prop — the detail
    // never moves; red.
    // MUTATION (p2g-cx1/shown-pane-heading-steals-settle): the opener still asks for the heading's
    // focus — the pane's parent effect runs after the detail's and takes it back; red.
    expect(document.activeElement).toBe(document.getElementById("settle-h"));
  });
});

// ── Phase 2h — the pane's reads never stack behind a hung one (P2cz · P2fc) ───────────────────────
describe("Phase 2h (9f) — every read the pane starts goes through ONE gate", () => {
  it("a first read hung for 60 s is ONE dispatch: the quiet retry and Try again start nothing, and the answer kicks exactly one read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveA!: (r: TableDetailResult) => void;
    answers[A] = () => new Promise((r) => (resolveA = r));
    mount();
    await tick(0);
    await tap(card(A));
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The race gives up at 15 s: the pane says it could not (by cause — never paper).
    await tick(15_000);
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    // A minute of quiet retries and a Try again: ONE read in the air the whole time. MUTATION
    // (p2h-boards/pane/reads-stack): every retry sends another read queued behind the hung one; red.
    await tick(20_000);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "out.shell.retry") }));
    });
    await tick(25_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The refused retry is answered as a failure (still the failure title; the button not stuck
    // busy). MUTATION (p2h-boards/pane/refused-retry-stays-busy): "Trying…" for as long as the hang; red.
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    expect(pane().textContent).not.toContain(ts("en", "out.shell.retrying"));
    // The raw answers (its race long given up — not applied): ONE owed read of the table selected
    // NOW is kicked, and lands. MUTATION (p2h-boards/pane/owed-read-never-kicked): the pane waits on
    // the quiet retry instead; red.
    answers[A] = ok(detail(A, 4, { lines: [line("l-4b", "Tea")] }));
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
    });
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(pane().textContent).toContain("Tea");
    vi.restoreAllMocks();
  });

  it("a pick while ANOTHER table's read hangs: no second read, and past the bound the pane says it couldn't — never a skeleton for as long as the hang lasts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveA!: (r: TableDetailResult) => void;
    answers[A] = () => new Promise((r) => (resolveA = r));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(3_000);
    await tap(card(B)); // A's read has been out 3 s — B's is owed, held under the bound
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.fail.title"));
    // The re-ask runs on the quiet retry's cadence; once A's read is past the bound, B's pick is a
    // failed read, said. MUTATION (p2h-boards/pane/held-ask-never-reasked): the skeleton stands
    // until A answers, however long; red. MUTATION (p2h-boards/pane/refused-never-a-miss): the
    // refusal past the bound is not a failure — the same; red.
    await tick(15_000);
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // A answers: B's ONE owed read runs and lands.
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
    });
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(getTableDetail).toHaveBeenLastCalledWith(B);
    expect(document.getElementById("order-h")).not.toBeNull();
    vi.restoreAllMocks();
  });
  it("the answer of a table picked AWAY from never replaces what the new pick shows — even one that wins its race in the instant past the bound (table-pane/late-read-lands · critic B9)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveA!: (r: TableDetailResult) => void;
    let resolveB!: (r: TableDetailResult) => void;
    answers[A] = () => new Promise((r) => (resolveA = r));
    answers[B] = () => new Promise((r) => (resolveB = r));
    mount();
    await tick(0);
    await tap(card(A));
    // One millisecond short of A's bound on the timers, and AT it on the clock: the race's own timer
    // is overdue but has not run yet — a busy tablet runs a tap before an overdue timer. (The poll
    // gate measures `missed` on `Date.now()`; `setSystemTime` moves it and keeps every timer's
    // distance.)
    await tick(15_000 - 1);
    vi.setSystemTime(Date.now() + 1);
    await tap(card(B)); // owed to A's read, and past the bound: B's pick is a failed read, said
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // A's answer arrives in that instant: it wins A's race (the race's timer has still not run), and
    // lands in the pane's read under B. B's owed read is kicked and held in the air.
    // MUTATION (table-pane/late-read-lands): A's answer is applied, and B's failure turns into a
    // skeleton for as long as B's own read takes; red.
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
    });
    await tick(0);
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(getTableDetail).toHaveBeenLastCalledWith(B);
    expect(pane().textContent).toContain(ts("en", "floor.pane.fail.title"));
    // B's own read lands.
    await act(async () => {
      resolveB({ kind: "detail", detail: detail(B, 5) });
    });
    await tick(0);
    expect(document.getElementById("order-h")).not.toBeNull();
    expect(pane().textContent).not.toContain(ts("en", "floor.pane.fail.title"));
    vi.restoreAllMocks();
  });
});

// ── Phase 2h · integration (sheets residual 3 · boards P1 · doors residual) ── a payment on Table 4
// whose answer had not come at the bound, after the pane moved on: the unmounted detail hands the
// pane its `unknown`, and the pane says "we don't know if the payment on Table 4 went through". When
// the LATE answer then turns out OK, nothing used to retract that line — the cashier was told to
// check before taking payment again on a table that was paid. The control now reports `landed`, the
// unmounted detail forwards it, and the split retracts only THAT table's unknown (`lostAfterLanded`).
describe("TablePane — a payment the pane said it did not know about LANDS late (Phase 2h · integration)", () => {
  const settleable = (id: string, n: number) =>
    detail(id, n, {
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line(`l-${n}`, "Mohinga", false)],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });
  const tableN = (n: number) => tf("en", "floor.table", { id: String(n) });
  const unknownOn = (n: number) => tf("en", "floor.pane.lostSettleUnknown", { x: tableN(n) });
  const lostLine = () => pane().querySelector<HTMLElement>(".staff-pane-lost");
  const landedLine = () => pane().querySelector<HTMLElement>(".staff-pane-landed");
  const paidOn = (n: number) => tf("en", "floor.pane.landedSettle", { x: tableN(n) });
  const viewBtn = () => within(lostLine()!).getByRole("button");
  const paneSays = () =>
    [...pane().querySelectorAll('[role="status"]')].map((r) => r.textContent).join(" | ");
  const OK = { ok: true as const, orderId: "o-00a1b2c3", totalCents: 4210, tipCents: 0 };
  /** A cash settle whose answer the case holds. */
  function hungCash() {
    let answer!: (v: unknown) => void;
    settleCash.mockReturnValueOnce(new Promise((r) => (answer = r)));
    return (v: unknown) => answer(v);
  }
  async function takeCashOnShown() {
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    fireEvent.click(within(settleSection).getAllByRole("button")[0]!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(
        within(dialog)
          .getAllByRole("button")
          .find((b) => b.textContent?.startsWith("Take $"))!,
      );
    });
  }

  it("cash on Table 4 still out at the bound after a switch: 'we don't know' — the LATE ok retracts it, and focus on its View lands on the pane's heading", async () => {
    answers[A] = ok(settleable(A, 4));
    answers[B] = ok(settleable(B, 7));
    const answer = hungCash();
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCashOnShown();
    await tap(card(B)); // Table 4's detail (and its sheet) unmount mid-settle
    await tick(0);
    await tick(STAFF_HANG_MS);
    expect(lostLine()?.textContent).toContain(unknownOn(4));
    expect(paneSays()).toContain(unknownOn(4));
    act(() => viewBtn().focus());
    await act(async () => answer(OK));
    await tick(0);
    // MUTATION (p2h-int-a/pane-landed-unwired · pane-landed-unpassed): the split never retracts (or
    // the pane never hands the detail the hand-up) — "we don't know if the payment on Table 4 went
    // through — view it before you take payment again" stands over a payment that was recorded; red.
    expect(lostLine()).toBeNull();
    expect(paneSays()).not.toContain(unknownOn(4));
    // Critic F2 — ANSWERED, never silently gone: "The payment on Table 4 went through", shown in
    // quiet ink with no View (nothing to check) and SAID through the one region the warning was.
    // MUTATION (p2h-int-a/f2-landed-retracts-silently): the warning just vanishes; red.
    expect(landedLine()?.textContent).toContain(paidOn(4));
    expect(within(landedLine()!).queryByRole("button")).toBeNull();
    expect(paneSays()).toContain(paidOn(4));
    // Said by Table 7's detail region (it is mounted) — in quiet ink, never the loss's warn.
    // MUTATION (p2h-int-a/f2-resolved-notice-warn): "went through" in warn ink, read as a loss; red.
    const said = [...pane().querySelectorAll('[role="status"]')].find((r) =>
      r.textContent?.includes(paidOn(4)),
    )!;
    expect(said.querySelector<HTMLElement>('span[style*="--t2"]')).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".staff-split")!.dataset.pane).toBe("open");
    // MUTATION (p2h-int-a/retract-focus-dropped): the View under the finger unmounts and focus
    // falls to <body>, unsaid; red.
    expect(document.activeElement).toBe(paneHeading());
  });

  it("a reader START still out at the bound after a switch: 'we don't know' — its LATE start retracts it (the reader is collecting)", async () => {
    terminalReady = true;
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    answers[A] = ok(settleable(A, 4));
    let answer!: (v: unknown) => void;
    settleCard.mockReturnValueOnce(new Promise((r) => (answer = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const settleSection = document.getElementById("settle-h")!.closest("section")!;
    await act(async () => {
      fireEvent.click(within(settleSection).getAllByRole("button").at(-1)!);
    });
    await tap(card(B));
    await tick(0);
    await tick(STAFF_HANG_MS);
    expect(lostLine()?.textContent).toContain(unknownOn(4));
    await act(async () => answer({ ok: true, paymentIntentId: "pi_late", totalCents: 4210 }));
    await tick(0);
    // MUTATION (p2h-int-a/reader-landed-unreported, at the wiring): the late start hands nothing
    // up — "we don't know" stands beside a reader that is collecting the card; red.
    expect(lostLine()).toBeNull();
    // Critic F2 — a reader START is not a payment that went through: never "went through" (the
    // reader is still asking for the card; the bar's reader chip carries it and alerts its outcome).
    // MUTATION (p2h-int-a/f2-reader-start-landed · f2-detail-started-as-paid): the pane says "The
    // payment on Table 4 went through" over a card nobody has tapped yet; red.
    expect(landedLine()).toBeNull();
    expect(paneSays()).not.toContain(paidOn(4));
  });

  it("a landing on Table 4 never retracts Table 7's unknown — focus on its View stays; Table 7's own landing retracts it, focus to the floor's heading", async () => {
    answers[A] = ok(settleable(A, 4));
    answers[B] = ok(settleable(B, 7));
    const answer4 = hungCash();
    const answer7 = hungCash();
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCashOnShown(); // Table 4's settle: out
    await tap(card(B));
    await tick(0);
    await takeCashOnShown(); // Table 7's settle: out too (neither has reached the bound yet)
    // Back closes the pane (the sheet's scrim stops a tap, not the browser's Back).
    await act(async () => {
      window.history.replaceState(null, "", "/staff?floor=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
    expect(document.getElementById("order-h")).toBeNull(); // nothing picked: both details gone
    await tick(STAFF_HANG_MS);
    // Both reported unknown at their bound; the newer (Table 7's) is the one the pane holds.
    expect(lostLine()?.textContent).toContain(unknownOn(7));
    act(() => viewBtn().focus());
    const view7 = viewBtn();
    await act(async () => answer4(OK));
    await tick(0);
    // MUTATION (p2h-int-a/landed-clears-another-table, at the wiring): Table 4's landing retracts
    // Table 7's line — Table 7's payment, which may not have gone through, goes unsaid; red.
    expect(lostLine()?.textContent).toContain(unknownOn(7));
    // MUTATION (p2h-int-a/retract-focus-yanks-a-standing-line): the line stood, yet focus is
    // pulled off its View to a heading; red.
    expect(document.activeElement).toBe(view7);
    await act(async () => answer7({ ...OK, orderId: "o-77" }));
    await tick(0);
    expect(lostLine()).toBeNull();
    // Critic F2 — answered: the one line is now "The payment on Table 7 went through" (still the
    // line above the floor below 64em, `data-pane="lost"`), said through the pane's region.
    expect(landedLine()?.textContent).toContain(paidOn(7));
    expect(paneSays()).toContain(paidOn(7));
    expect(document.querySelector<HTMLElement>(".staff-split")!.dataset.pane).toBe("lost");
    // MUTATION (p2h-int-a/retract-focus-to-pane-heading-always): nothing picked, the pane's heading
    // is the empty state's — focus lands there, away from the floor the line sat above; red.
    expect(document.activeElement).toBe(document.getElementById("floor-h"));
  });

  it("a RESOLVED line goes on the next pick — it was said; nothing on it is left to check (critic F2)", async () => {
    answers[A] = ok(settleable(A, 4));
    answers[B] = ok(settleable(B, 7));
    const answer = hungCash();
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await takeCashOnShown();
    await tap(card(B));
    await tick(0);
    await tick(STAFF_HANG_MS);
    await act(async () => answer(OK));
    await tick(0);
    expect(landedLine()?.textContent).toContain(paidOn(4));
    // Back closes the pane (the line stands, said), then Table 7 is picked again — a pick of a table
    // that is NOT the one the line is about.
    await act(async () => {
      window.history.replaceState(null, "", "/staff?floor=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
    expect(landedLine()?.textContent).toContain(paidOn(4));
    await tap(card(B));
    await tick(0);
    // MUTATION (p2h-int-a/f2-resolved-lingers, at the wiring): "went through" rides above every
    // table opened after — read as news on each visit; red.
    expect(landedLine()).toBeNull();
    expect(paneSays()).not.toContain(paidOn(4));
  });
});

// ── Phase 2h · integration (critic F1) ── a LINE EDIT on Table 4 still out at the bound after the pane
// moved on. Its detail is gone, so the pane says it — and it used to say "didn't save" (WRITE_WAITING
// mapped to the refusal's kind), then never took that back when the change saved late.
describe("TablePane — a line edit still out when the pane left its table (Phase 2h · integration, critic F1)", () => {
  const tableN = (n: number) => tf("en", "floor.table", { id: String(n) });
  const lostLine = () => pane().querySelector<HTMLElement>(".staff-pane-lost");
  const landedLine = () => pane().querySelector<HTMLElement>(".staff-pane-landed");
  const paneSays = () =>
    [...pane().querySelectorAll('[role="status"]')].map((r) => r.textContent).join(" | ");
  async function plusOnFourThenShowSeven() {
    let answer!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (answer = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await act(async () => {
      fireEvent.click(pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn")[1]!);
    });
    await tap(card(B)); // Table 4's detail and its rows unmount with the write out
    await tick(0);
    await tick(STAFF_HANG_MS);
    return (v: unknown) => answer(v);
  }

  it("past the bound the pane says 'no answer yet — it may still be saved', never 'didn't save'; the LATE ok answers it: 'saved'", async () => {
    const answer = await plusOnFourThenShowSeven();
    const waiting = tf("en", "floor.pane.lostWriteWaiting", { x: tableN(4) });
    // MUTATION (p2h-int-a/f1-waiting-said-as-lost · f1-detail-waiting-as-write): "A change on
    // Table 4 didn't save" over a change that may still save — the cashier taps + again; red.
    expect(lostLine()?.textContent).toContain(waiting);
    expect(lostLine()?.textContent).not.toContain(
      tf("en", "floor.pane.lostWrite", { x: tableN(4) }),
    );
    expect(paneSays()).toContain(waiting);
    await act(async () => answer({ ok: true }));
    await tick(0);
    // MUTATION (p2h-int-a/f1-dead-detail-saved-unforwarded · f1-pane-saved-dropped): the late save
    // reaches only the dead detail's state — "no answer yet" stands over a change that saved; red.
    const saved = tf("en", "floor.pane.landedWrite", { x: tableN(4) });
    expect(lostLine()).toBeNull();
    expect(landedLine()?.textContent).toContain(saved);
    expect(paneSays()).toContain(saved);
  });

  it("two rows out: the FIRST late ok keeps 'no answer yet' — only the last one answers it", async () => {
    answers[A] = ok(
      detail(A, 4, { lines: [line("l-4", "Mohinga"), line("l-4b", "Tea")], itemCount: 2 }),
    );
    let answer1!: (v: unknown) => void;
    let answer2!: (v: unknown) => void;
    staffSetQty.mockReturnValueOnce(new Promise((r) => (answer1 = r)));
    staffSetQty.mockReturnValueOnce(new Promise((r) => (answer2 = r)));
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    const plus = () => pane().querySelectorAll<HTMLButtonElement>(".mms-stepper-btn");
    await act(async () => {
      fireEvent.click(plus()[1]!);
    });
    await act(async () => {
      fireEvent.click(plus()[3]!);
    });
    expect(staffSetQty).toHaveBeenCalledTimes(2);
    await tap(card(B));
    await tick(0);
    await tick(STAFF_HANG_MS);
    const waiting = tf("en", "floor.pane.lostWriteWaiting", { x: tableN(4) });
    expect(lostLine()?.textContent).toContain(waiting);
    await act(async () => answer1({ ok: true }));
    await tick(0);
    // MUTATION (p2h-int-a/f1-saved-while-others-wait): the first row's late ok says "The change on
    // Table 4 saved" while the other row's change is still out — it may yet fail; red.
    expect(lostLine()?.textContent).toContain(waiting);
    expect(landedLine()).toBeNull();
    await act(async () => answer2({ ok: true }));
    await tick(0);
    expect(landedLine()?.textContent).toContain(
      tf("en", "floor.pane.landedWrite", { x: tableN(4) }),
    );
  });

  it("a LATE refusal says 'didn't save' — and its waiting edge never answers that as saved", async () => {
    const answer = await plusOnFourThenShowSeven();
    await act(async () => answer({ ok: false, error: "That line just changed." }));
    await tick(0);
    // MUTATION (p2h-int-a/f1-saved-on-any-edge): the edge after the refusal turns "didn't save"
    // into "saved" — a dish change that never saved reads as done; red.
    expect(lostLine()?.textContent).toContain(tf("en", "floor.pane.lostWrite", { x: tableN(4) }));
    expect(landedLine()).toBeNull();
  });
});
