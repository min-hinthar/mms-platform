/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_QUERY, handoffStashKey, stashHandoff } from "@/lib/floor-pane";
import { frozenBoardCopy } from "@/lib/staff-outage";
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
const { LiveConnectionProvider, useReportLive } = await import("./LiveConnection");
const { CounterSplit } = await import("./CounterSplit");
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
    send: { sendable: 1, staffAdded: 1, togoDraft: 0, inKitchen: false, foodDraft: true },
    serverNow: NOW,
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
    <LiveConnectionProvider>
      <CounterSplit terminalReady={terminalReady}>
        <Floor {...props} />
      </CounterSplit>
    </LiveConnectionProvider>
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
  it("A's read resolving after B was picked is dropped; B's detail lands", async () => {
    let resolveA!: (r: TableDetailResult) => void;
    let resolveB!: (r: TableDetailResult) => void;
    answers[A] = () => new Promise((r) => (resolveA = r));
    answers[B] = () => new Promise((r) => (resolveB = r));
    mount();
    await tick(0);
    await tap(card(A));
    await tap(card(B));
    // B answers first; A's read (asked first) answers LAST.
    await act(async () => {
      resolveB({ kind: "detail", detail: detail(B, 7, { lines: [line("l-7", "Tea")] }) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(document.getElementById("order-h")).not.toBeNull();
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: accept every read — A's late answer replaces B's, and B's order drops back to the
    // skeleton under its own heading; red.
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
        <LiveConnectionProvider>
          <CounterSplit terminalReady={false}>
            <p>zones</p>
          </CounterSplit>
        </LiveConnectionProvider>
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
      tableNumber: null,
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line("l-4", "Mohinga", false)],
      send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
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
      send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
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
      send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
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
        <LiveConnectionProvider>
          <CounterSplit terminalReady={false}>
            <CounterMintProvider>
              <StartTable4 />
            </CounterMintProvider>
          </CounterSplit>
        </LiveConnectionProvider>
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
  it("A → B (still loading) → A reads A again", async () => {
    answers[B] = () => new Promise(() => {});
    mount();
    await tick(0);
    await tap(card(A));
    await tick(0);
    await tap(card(B));
    answers[A] = ok(detail(A, 4, { lines: [line("l-4b", "Tea")] }));
    await tap(card(A));
    await tick(0);
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
        <LiveConnectionProvider>
          <CounterSplit terminalReady={false}>
            <CounterMintProvider>
              <StartTable4Phone />
            </CounterMintProvider>
          </CounterSplit>
        </LiveConnectionProvider>
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

// ── Phase 2d · Codex round 1 · pane ── a reader collection live in the pane HOLDS the pane on its
// table. The collect panel's 2.5 s poll is what slides the settlement freeze forward and what turns
// a counter order's charge into its #CODE card; a switch unmounted it mid-collect, the webhook then
// closed the counter order behind the charge, and nothing ever recorded the card.
describe("TablePane — a reader collection holds the pane on its table (Codex #306)", () => {
  const settleable = (id: string, n: number, over: Partial<TableDetail> = {}) =>
    detail(id, n, {
      settleTotalCents: 4210,
      settleTipBaseCents: 4000,
      lines: [line(`l-${n}`, "Mohinga", false)],
      send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: true, foodDraft: false },
      ...over,
    });
  const heldLine = () => ts("en", "floor.pane.payingHeld");
  const table4 = () => tf("en", "floor.table", { id: "4" });
  const table7 = () => tf("en", "floor.table", { id: "7" });
  const readerPanel = () =>
    screen.queryByRole("group", { name: ts("en", "settle.a11y.readerPanel") });
  const region = () =>
    document.getElementById("order-h")!.closest("section")!.querySelector('[role="status"]')!;
  const closeBtn = () => within(pane()).getByRole("button", { name: ts("en", "shell.close") });
  const goBack = async () => {
    await act(async () => {
      window.history.replaceState(null, "", "/staff?floor=1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
  };
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

  it("a card tap, ✕ and Escape are refused mid-collect: the pane stays, focus stays, ONE line says why, the poll keeps running", async () => {
    await collectingOn4();
    const polls = terminalStatus.mock.calls.length;
    const ev = await tap(card(B));
    // Never the full page either: the link is still prevented.
    expect(ev.defaultPrevented).toBe(true);
    // MUTATION: CounterSplit's select admits every tap — the pane switches to Table 7, the panel
    // unmounts and its poll stops mid-collect; red.
    expect(location.hash).toBe(`#table-${A}`);
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    expect(document.activeElement).toBe(readerPanel());
    // Said in the pane's ONE region (the detail's), in plain words.
    expect(pane().querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(region().textContent).toBe(heldLine());
    // ✕ …
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    // MUTATION: CounterSplit's close admits a user close mid-collect — the pane empties; red.
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    expect(backSpy).not.toHaveBeenCalled();
    // … and Escape.
    await act(async () => {
      fireEvent.keyDown(readerPanel()!, { key: "Escape" });
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    // The poll never stopped.
    await tick(2500);
    expect(terminalStatus.mock.calls.length).toBeGreaterThan(polls);
    expect(getTableDetail).not.toHaveBeenCalledWith(B);
  });

  it("Back is refused too: the paying table's entry comes back, owned by the pane (a later ✕ walks back over it)", async () => {
    await collectingOn4();
    pushSpy.mockClear();
    await goBack();
    // MUTATION: the history arm neither refuses nor restores — Back empties the pane mid-collect; red.
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    expect(location.hash).toBe(`#table-${A}`);
    // MUTATION: refuse without restoring the entry — the URL says the floor while the pane shows
    // Table 4, and the next Back leaves the counter screen; red.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(heldLine());
    // The reader declines: the collection is over and selection works again — the restored entry
    // is the pane's own, so ✕ walks back over it.
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    await tick(2500);
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("order-h")).toBeNull();
  });

  it("a Forward onto another table's entry is refused the same way: the paying table's entry comes back", async () => {
    await collectingOn4();
    pushSpy.mockClear();
    await act(async () => {
      window.history.replaceState(null, "", `/staff?floor=1#table-${B}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await tick(0);
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    // MUTATION: a hash-driven pick refused as if it were a tap — nothing puts the entry back, and the
    // URL names Table 7 while the pane shows Table 4; red.
    expect(location.hash).toBe(`#table-${A}`);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(getTableDetail).not.toHaveBeenCalledWith(B);
    expect(region().textContent).toBe(heldLine());
  });

  it("re-tapping the paying table is not a change: no refusal, the heading takes focus", async () => {
    await collectingOn4();
    await tap(card(A));
    // MUTATION: the same-table clause dropped — a re-tap of the table shown reads as leaving it; red.
    expect(region().textContent).not.toBe(heldLine());
    expect(document.activeElement).toBe(paneHeading());
    expect(readerPanel()).not.toBeNull();
  });

  it("a declined card ends the collection: a tap switches again", async () => {
    await collectingOn4();
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    await tick(2500);
    // MUTATION: hold while the panel is merely MOUNTED (a declined panel stays, with "Back to
    // payment") — the cashier is stranded on a table whose reader already let go; red.
    await tap(card(B));
    await tick(0);
    expect(paneHeading().textContent).toBe(table7());
  });

  it("a tap refused mid-collect leaves no trace: the later ✕ lands on the table's OWN card", async () => {
    await collectingOn4();
    await tap(card(B)); // refused
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    await tick(2500);
    await act(async () => {
      fireEvent.click(closeBtn());
    });
    await tick(0);
    // MUTATION: the refused tap still records its card as the pane's opener — the close hands
    // focus to Table 7's card, a table the pane never showed; red.
    expect(document.activeElement).toBe(card(A));
  });

  it("a cancel ends the collection: a tap switches again", async () => {
    await collectingOn4();
    cancelTerminal.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(within(readerPanel()!).getByRole("button", { name: /Cancel the reader/ }));
    });
    await tick(0);
    await tap(card(B));
    await tick(0);
    expect(paneHeading().textContent).toBe(table7());
  });

  it("charged but not yet recorded still holds; the counter's #CODE card lands, and then a tap switches", async () => {
    await collectingOn4({ label: "reg-7f3a", tableNumber: null });
    // The charge went through; the webhook has not recorded the order yet.
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    await tick(2500);
    await tap(card(B));
    // MUTATION: hold only while `collecting` — the pane leaves in the window where the poll is the
    // only thing that will ever record the #CODE; red.
    expect(readerPanel()).not.toBeNull();
    expect(region().textContent).toBe(heldLine());
    // The order lands: the #CODE card, and the hold is over.
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    expect(readerPanel()).toBeNull();
    expect(pane().textContent).toContain("#A1B2C3");
    expect(sessionStorage.getItem(handoffStashKey(A))).toContain("o-00a1b2c3");
    // MUTATION: the line outlives the hold — "Finish the card payment first" over a paid order; red.
    expect(region().textContent).not.toContain(heldLine());
    await tap(card(B));
    await tick(0);
    expect(paneHeading().textContent).toBe(table7());
  });

  it("a Start that converged on another seated table neither switches the pane nor routes away", async () => {
    function StartTable7() {
      const mint = useCounterMint();
      return (
        <button
          type="button"
          onClick={() =>
            mint.run(
              "table-7",
              { kind: "table", tableNumber: 7 },
              { onStart: () => {}, onRefusal: () => {} },
            )
          }
        >
          start 7
        </button>
      );
    }
    terminalReady = true;
    answers[A] = ok(settleable(A, 4));
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_4", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    openRegisterOrder.mockResolvedValue({ ok: true, sessionId: B, created: false });
    render(
      <StaffLangProvider lang="en">
        <LiveConnectionProvider>
          <CounterSplit terminalReady>
            <CounterMintProvider>
              <Floor />
              <StartTable7 />
            </CounterMintProvider>
          </CounterSplit>
        </LiveConnectionProvider>
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
      fireEvent.click(screen.getByRole("button", { name: "start 7" }));
    });
    await tick(0);
    // A refused open still answers "handled" — `false` would send the mint to the table's own page
    // and take the whole counter screen (the panel with it) away.
    expect(push).not.toHaveBeenCalled();
    expect(paneHeading().textContent).toBe(table4());
    expect(readerPanel()).not.toBeNull();
    expect(region().textContent).toBe(heldLine());
  });
});
