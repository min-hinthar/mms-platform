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
  getMergeCandidates: vi.fn(() => Promise.resolve({ ok: true, candidates: [] })),
  mergeTables: vi.fn(),
}));
const clearTable = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
const staffSetQty = vi.fn();
const settleCash = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (...a: unknown[]) => staffSetQty(...(a as [])),
  setLineNotes: vi.fn(),
  settleCash: (...a: unknown[]) => settleCash(...(a as [])),
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
const { ts } = await import("@/lib/i18n/staff");

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
const mount = (props: Parameters<typeof Floor>[0] = {}) =>
  render(
    <StaffLangProvider lang="en">
      <LiveConnectionProvider>
        <CounterSplit terminalReady={false}>
          <Floor {...props} />
        </CounterSplit>
      </LiveConnectionProvider>
    </StaffLangProvider>,
  );
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
  clearTable.mockReset();
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
  sessionStorage.clear();
});

describe("TablePane — a card tap at split width", () => {
  it("opens in the pane: prevented, ONE push without __NA, the hash names it, the heading takes focus, one read", async () => {
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
    await act(async () => {
      resolveA({ kind: "detail", detail: detail(A, 4) });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION: accept every read — Table 4's order renders under the Table 7 heading; red.
    expect(paneHeading().textContent).toBe(tf("en", "floor.table", { id: "7" }));
    expect(document.getElementById("order-h")).toBeNull();
    await act(async () => {
      resolveB({ kind: "detail", detail: detail(B, 7) });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(document.getElementById("order-h")).not.toBeNull();
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
});

describe("TablePane — a start that converged on a seated table", () => {
  function StartTable4() {
    const mint = useCounterMint();
    return (
      <button
        type="button"
        onClick={() =>
          mint.run("table-4", { kind: "table", tableNumber: 4 }, {
            onStart: () => {},
            onRefusal: () => {},
          })
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
