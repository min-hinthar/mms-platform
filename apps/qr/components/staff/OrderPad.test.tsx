/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";
import type { StaffFireResult, StaffUndoResult } from "@/lib/staff-send-view";
import type { StaffWriteResult } from "@/lib/staff-cart";
import type { PadCatalogItem } from "@/lib/order-pad";
import { STAFF_HANG_MS, stalledSince, youngWrite } from "@/lib/bounded-write";
import { reloadHolds } from "@/lib/reload-guard";
import { handoffStashKey } from "@/lib/floor-pane";

/**
 * Phase 2c · pad — the ORDER PAD's WIRING (DESIGN-LANGUAGE §28). The decisions are pure and pinned
 * in lib/order-pad · pad-pending · pad-errors; this suite pins what only a render can see: that a tap
 * is claimed at once and written once under its own key, that the one region is the only region,
 * that a hung or lost add holds the Send and Take payment and offers the SAME key again, and that
 * the Send and Take payment DRAIN the add chain before they go.
 */
const addItem = vi.fn<(raw: unknown) => Promise<StaffWriteResult>>();
const setQty = vi.fn<(id: string, raw: unknown) => Promise<StaffWriteResult>>(() =>
  Promise.resolve({ ok: true }),
);
const settleCash = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  staffAddItem: (raw: unknown) => addItem(raw),
  staffSetQty: (id: string, raw: unknown) => setQty(id, raw),
  setLineNotes: vi.fn(() => Promise.resolve({ ok: true })),
  settleCash: (raw: unknown) => settleCash(raw),
}));
const setName =
  vi.fn<
    (raw: unknown) => Promise<{ ok: true } | { ok: false; error: string; code?: "keepName" }>
  >();
const openRegisterOrder = vi.fn();
vi.mock("@/lib/register", () => ({
  setCartCustomerName: (raw: unknown) => setName(raw),
  openRegisterOrder: (raw: unknown) => openRegisterOrder(raw),
}));
const fire = vi.fn<(raw: unknown) => Promise<StaffFireResult>>();
const undo = vi.fn<(raw: unknown) => Promise<StaffUndoResult>>();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (raw: unknown) => fire(raw),
  staffUndoFire: (raw: unknown) => undo(raw),
}));
const getTableDetail = vi.fn<(id: string) => Promise<TableDetailResult>>();
vi.mock("@/lib/floor", () => ({ getTableDetail: (id: string) => getTableDetail(id) }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("server-only", () => ({}));
vi.mock("./LossActionSheet", () => ({ LossActionSheet: () => null }));
const haptic = vi.fn();
vi.mock("@/lib/haptics", () => ({ haptic: (m: string) => haptic(m) }));
const push = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace }),
  usePathname: () => "/staff/table/S/add",
}));
// The REAL StaffBar (P13 — the one-region test counts every region the page mounts, the bar's
// included); only its two server actions are stubbed.
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { OrderPad } = await import("./OrderPad");

const SESSION = "11111111-1111-4111-8111-111111111111";
const T = Date.parse("2026-09-24T18:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dish = (over: Partial<PadCatalogItem> & { id: string }): PadCatalogItem => ({
  nameEn: over.id,
  nameMy: null,
  category: "All-Day Breakfast",
  categorySlug: "all-day-breakfast",
  categorySort: 10,
  soldOut: false,
  priceCents: 1450,
  groups: [],
  ...over,
});
const CATALOG = {
  kind: "ok" as const,
  items: [
    dish({ id: "m1", nameEn: "Mohinga", nameMy: "မုန့်ဟင်းခါး" }),
    dish({
      id: "m2",
      nameEn: "Beef Curry",
      category: "Curries",
      categorySlug: "curries",
      categorySort: 40,
      groups: [
        {
          id: "g1",
          slug: "style",
          name: "Style",
          nameMy: null,
          selectionType: "single",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: "o1", slug: "dry", name: "Dry", nameMy: null, priceDeltaCents: 0, allergens: [] },
          ],
        },
      ],
    }),
  ],
};

const line = (over: Partial<TableLineView> & { id: string }): TableLineView => ({
  name: "Mohinga",
  qty: 1,
  unitPriceCents: 1450,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  sendable: true,
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
  menuItemId: "m1",
  fulfillment: "dinein",
  nameMy: "မုန့်ဟင်းခါး",
  modifiersMy: [],
  ...over,
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
    lines: [],
    itemCount: 0,
    runningSubtotalCents: 0,
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
      sendable: 0,
      staffAdded: 0,
      togoDraft: 0,
      inKitchen: false,
      foodDraft: false,
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
/**
 * Phase 3d · counter — a PRICED read, as `getTableDetail` returns one: the lines read's sum beside
 * the totals read's figure and its parts. The breakdown's tax is the FIXTURE's (total − sub), not the
 * 10.5% engine's — the stack renders the server's parts verbatim and never recomputes, so a client
 * that did would read a different number ($1.31 here where the engine says $1.52 on $14.50). A total
 * with no breakdown is a state the read cannot produce.
 */
const priced = (sub: number, total: number) => ({
  runningSubtotalCents: sub,
  settleTotalCents: total,
  settleBreakdown: {
    subtotalCents: sub,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: total - sub,
    tipCents: 0,
  },
});
/** The table after one Mohinga landed. */
const ONE = () =>
  detail({
    lines: [line({ id: "l1" })],
    itemCount: 1,
    ...priced(1450, 1581),
    send: {
      sendable: 1,
      staffAdded: 1,
      togoDraft: 0,
      inKitchen: false,
      foodDraft: true,
      counterDraft: 0,
      counterSentPastGrace: false,
    },
  });

/**
 * Phase 2c · gate — a table Take payment will LEAVE for: its one dish is a to-go draft (it cooks at
 * payment, so nothing is unsent and the settle gate stays open). The drain / busy / note cases below
 * are about Take payment's own life, not the gate — they ran on `ONE()`, whose dine-in draft the gate
 * now refuses. The poll answers the same table, so a later read cannot close the gate under them.
 */
const payable = () => {
  const d = detail({
    lines: [line({ id: "l1", fulfillment: "togo", sendable: false })],
    itemCount: 1,
    ...priced(1450, 1581),
    send: {
      sendable: 0,
      staffAdded: 0,
      togoDraft: 1,
      inKitchen: false,
      foodDraft: true,
      counterDraft: 0,
      counterSentPastGrace: false,
    },
  });
  getTableDetail.mockResolvedValue({ kind: "detail", detail: d });
  return d;
};

/** A counter (pickup) order with one dish — no settle gate, so Take payment drains a flying add and
 *  goes (a dine-in table refuses on `unsent` instead: Codex round 1, P2). */
const counterPayable = () => {
  const d = detail({
    label: "reg-ab12",
    mode: "pickup",
    counterOrder: true,
    lines: [line({ id: "l1", fulfillment: "togo", sendable: false })],
    itemCount: 1,
    ...priced(1450, 1581),
    // Phase 2f — the counts B derives for a counter order: its to-go draft is `counterDraft` (the
    // pay-at-pickup Send's), never `togoDraft` (a dine-in table's cook-at-payment count).
    send: {
      sendable: 0,
      staffAdded: 0,
      togoDraft: 0,
      inKitchen: false,
      foodDraft: true,
      counterDraft: 1,
      counterSentPastGrace: false,
    },
  });
  getTableDetail.mockResolvedValue({ kind: "detail", detail: d });
  return d;
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function mount(
  initial: TableDetail = detail(),
  opts: {
    lang?: "en" | "my";
    counter?: boolean;
    catalog?: unknown;
    name?: string | null;
    focusName?: boolean;
  } = {},
) {
  return render(
    <StaffLangProvider lang={opts.lang ?? "en"}>
      <main>
        <OrderPad
          sessionId={SESSION}
          initialDetail={initial}
          catalog={(opts.catalog ?? CATALOG) as never}
          counterOrder={opts.counter ?? false}
          initialName={opts.name ?? null}
          hasPin={false}
          focusName={opts.focusName}
        />
      </main>
    </StaffLangProvider>,
  );
}
const tile = (name: RegExp) =>
  screen
    .getAllByRole("button", { name })
    .find((b) => b.classList.contains("pad-tile-main")) as HTMLButtonElement;
const mohinga = () => tile(/Mohinga/);
const ghosts = () => [...document.querySelectorAll<HTMLElement>(".pad-ghost")];
/** Phase 3d · counter — the ticket's receipt stack, read by ROW KEY (`data-row`), never by position:
 *  a row's amount, null when the row is not drawn; and the drawn rows' keys in DOM order. */
const row = (k: string) =>
  document.querySelector(`.pad-receipts [data-row="${k}"] .pad-receipt-amt`)?.textContent ?? null;
const rowKeys = () =>
  [...document.querySelectorAll<HTMLElement>(".pad-receipts [data-row]")].map(
    (r) => r.getAttribute("data-row") ?? "",
  );
const sendBtn = () => document.querySelector<HTMLButtonElement>(".pad-dock .staff-send button")!;
const settleBtn = () => document.querySelector<HTMLButtonElement>(".pad-settle button")!;
const region = () => document.querySelector<HTMLElement>(".ui-toast-region")!;
/** PD6 — the crowned till tray (the one cash sheet), opened in place on a counter order. */
const tray = () => screen.queryByRole("dialog", { name: STAFF["settle.cash.title"].en });

beforeEach(() => {
  vi.useFakeTimers({ now: T });
  sessionStorage.clear();
  getTableDetail.mockResolvedValue({ kind: "detail", detail: ONE() });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the add moment — claimed at the tap, written once, under its own key", () => {
  it("a quick-add tap writes ONE add {qty 1, no modifiers, a uuid key}, draws a ghost and claims no figure", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount();
    // Phase 3d · counter — nothing priced yet, so no receipt stack: never a fabricated "$0.00".
    expect(document.querySelector(".pad-receipt-amt")).toBeNull();
    mohinga().focus();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0]![0]).toMatchObject({
      sessionId: SESSION,
      menuItemId: "m1",
      modifierIds: [],
      qty: 1,
      addKey: expect.stringMatching(UUID),
    });
    // The ghost row — "Adding…", never a price — and the ticket claims no figure while the first
    // dish flies: no read has priced the order, so there is no stack to name one (§23).
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0]!.textContent).toContain(STAFF["pad.ghost.adding"].en);
    expect(ghosts()[0]!.textContent).not.toContain("$");
    expect(document.querySelector(".pad-receipt-amt")).toBeNull();
    // The claim is SPOKEN (quiet) through the one region; focus stays on the tile.
    expect(region().querySelector(".ui-toast-quiet")?.textContent).toBe("Added 1 × Mohinga.");
    expect(document.activeElement).toBe(mohinga());
    expect(haptic).toHaveBeenCalledWith("add");
    // The + disc pops.
    expect(mohinga().querySelector(".pad-tile-plus")?.className).toContain("mms-pop");

    // The answer lands; the read that follows shows the line — the ghost leaves, the badge counts.
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(getTableDetail).toHaveBeenCalled();
    expect(ghosts()).toHaveLength(0);
    expect(row("total")).toBe("$15.81");
    expect(mohinga().textContent).toContain("×1");
  });

  it("the view has exactly ONE live region, ONE ticket, and no natively disabled button", async () => {
    addItem.mockReturnValue(new Promise(() => {}));
    mount(detail({ paymentInFlight: false }));
    // Every region the page mounts — the REAL StaffBar's included (P13). Only a DIALOG is excluded,
    // and deliberately: the options sheet is a modal view of its own, with its own one region (its
    // `role="status"` line, M82), and the pad's Toast stays live beside it (see "the options sheet
    // never hides the pad's region" below). No dialog is open in this test.
    const live = () =>
      [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].filter(
        (e) => !e.closest('[role="dialog"]'),
      );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector(".staff-bar")).not.toBeNull();
    // MUTATION: a per-tile alert or a status line in the ticket — a second region; red.
    expect(live()).toHaveLength(1);
    expect(document.querySelectorAll(".pad-ticket")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(live()).toHaveLength(1);
    expect(document.querySelectorAll("button[disabled]")).toHaveLength(0);
    expect(document.querySelectorAll(".pad-ticket")).toHaveLength(1);
  });

  it("a 'choose' dish opens the options sheet and writes nothing; it has no options corner", async () => {
    mount();
    const beef = tile(/Beef Curry/);
    expect(beef.closest("li")!.querySelector(".pad-tile-opts")).toBeNull();
    expect(mohinga().closest("li")!.querySelector(".pad-tile-opts")).not.toBeNull();
    await act(async () => {
      fireEvent.click(beef);
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("a refusal — definite, named, and set back down", () => {
  it("'paying' names the dish, removes the ghost, keeps focus on the tile, settles the glyph", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "paying" });
    mount();
    mohinga().focus();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush();
    expect(ghosts()).toHaveLength(0);
    expect(region().textContent).toBe(STAFF["pad.err.add.paying"].en.replace("{x}", "Mohinga"));
    expect(document.activeElement).toBe(mohinga());
    // `.mms-settle` on the GLYPH, never the button (§23).
    expect(mohinga().querySelector(".pad-tile-glyph")?.className).toContain("mms-settle");
    expect(mohinga().className).not.toContain("mms-settle");
  });

  it("a 'sold_out' answer turns the tile sold out on the spot", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "sold_out" });
    mount();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush();
    expect(mohinga().getAttribute("aria-disabled")).toBe("true");
    expect(mohinga().closest("li")!.hasAttribute("data-soldout")).toBe(true);
  });
});

describe("an unknown outcome — the SAME key, never a second plate", () => {
  it("an answer that may have committed keeps the ghost and offers 'Try again' under the SAME key", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush();
    const key = (addItem.mock.calls[0]![0] as { addKey: string }).addKey;
    expect(ghosts()).toHaveLength(1);
    // "Try again", never "Send again" — on this console "send" is the kitchen's word.
    const again = screen.getByRole("button", { name: /^Try again — / });
    // Send and Take payment wait on it — and say what fixes it, never "waiting": its answer came
    // back, so nothing is coming (a family member would wait forever).
    expect(settleBtn().getAttribute("aria-disabled")).toBe("true");
    const lost = STAFF["table.send.hold.lost"].en.replace("{x}", "Mohinga");
    expect(document.getElementById("pad-settle-why")?.textContent).toBe(lost);
    expect(document.body.textContent).not.toContain("Waiting to hear back");
    addItem.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(again);
    });
    await flush();
    // MUTATION: a resend that mints a new key — the ledger cannot dedupe it; red.
    expect(addItem).toHaveBeenCalledTimes(2);
    expect((addItem.mock.calls[1]![0] as { addKey: string }).addKey).toBe(key);
  });

  it("15s with no answer: 'Checking…', Send and Take payment wait, Reload is offered; a late ok resolves it", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush(16_000);
    expect(ghosts()[0]!.textContent).toContain(STAFF["pad.ghost.checking"].en);
    expect(sendBtn().getAttribute("aria-disabled")).toBe("true");
    expect(settleBtn().getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain(STAFF["pad.reload"].en);
    // A tile tap is refused while the request hangs (the queue is held behind it).
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    // The late answer still resolves the ghost normally.
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(ghosts()).toHaveLength(0);
    expect(document.body.textContent).not.toContain(STAFF["pad.reload"].en);
  });
});

describe("a sheet add queued behind a hung add — its origin is never held past 15s", () => {
  it("the sheet stops being busy 15s after ITS tap, says the outcome is unknown, and a late refusal is still said", async () => {
    const first = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(first.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush(5_000);
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent?.includes("$14.50") || b.getAttribute("aria-busy") === "true",
      )!;
    await act(async () => {
      fireEvent.click(addBtn());
    });
    expect(addBtn().getAttribute("aria-busy")).toBe("true");
    // Queued behind the hung add: nothing dispatched yet (Next runs actions one at a time).
    expect(addItem).toHaveBeenCalledTimes(1);
    await flush(15_500);
    // 15s after the SHEET's tap: the sheet is free again and says the outcome is unknown.
    expect(addBtn().getAttribute("aria-busy")).toBeNull();
    expect(dialog.textContent).toContain(STAFF["browse.add.unconfirmed"].en);
    // Its ghost is still simply in line — only a dispatched add reads "Checking…".
    const beefGhost = ghosts().find((g) => g.textContent?.includes("Beef Curry"))!;
    expect(beefGhost.dataset.state).toBe("flying");
    // The hung add answers; the queued one dispatches and is REFUSED after the sheet gave up
    // waiting — the pad's own region says it, so it is never lost in silence.
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "paying" });
    await act(async () => {
      first.resolve({ ok: true });
    });
    await flush();
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(ghosts().some((g) => g.textContent?.includes("Beef Curry"))).toBe(false);
    expect(region().textContent).toContain("Beef Curry");
  });
});

// ── Phase 2h · p2h-sheets ──
describe("the options sheet's busy is bounded STATE, never a transition's pending (Phase 2h · 9a)", () => {
  it("the entanglement proxy: with an UNRELATED async transition left hanging, the sheet still frees 15s after its tap", async () => {
    // React 19 holds EVERY transition's `pending` while any async action is unanswered — the
    // browser's stand-in is Next's router update for a hung Server Action. A sheet whose busy is a
    // transition's pending stays busy past the chain's bound; state cleared in a finally frees.
    const other = deferred<void>();
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent?.includes("$14.50") || b.getAttribute("aria-busy") === "true",
      )!;
    const closeX = () =>
      within(dialog).getByRole("button", {
        name: (n) => n === STAFF["shell.close"].en || n === STAFF["shell.closeBusy"].en,
      });
    await act(async () => {
      fireEvent.click(addBtn());
    });
    expect(addBtn().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await flush(15_500);
    // MUTATION (p2h-sheets/pad/sheet-busy-never-clears): the ✕, Escape, the scrim and the drag stay
    // refused behind a trapped focus scope; red.
    expect(addBtn().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    expect(dialog.textContent).toContain(STAFF["browse.add.unconfirmed"].en);
    await act(async () => {
      add.resolve({ ok: true });
      other.resolve();
    });
  });

  it("two taps on the sheet's Add inside one frame add ONE dish — the tap-time guard is a ref", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("$14.50"),
    )!;
    await act(async () => {
      fireEvent.click(addBtn);
      fireEvent.click(addBtn); // the same render: neither tap has seen the busy flip
    });
    // MUTATION (p2h-sheets/pad/sheet-double-tap-adds-twice): the second tap mints a second key —
    // two plates of curry; red.
    expect(ghosts().filter((g) => g.textContent?.includes("Beef Curry"))).toHaveLength(1);
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(addItem).toHaveBeenCalledTimes(1);
  });
});

describe("the drains — the Send and Take payment wait for the dish tapped a beat before", () => {
  it("Send awaits the add before it fires", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    const order: string[] = [];
    fire.mockImplementation(() => {
      order.push("fire");
      return Promise.resolve({ ok: false, reason: "nothing" });
    });
    mount(ONE());
    await flush(400);
    await act(async () => {
      fireEvent.click(mohinga());
    });
    // Bare while the add flies: a count is a claim only from a view that has seen the cart.
    expect(sendBtn().textContent).toBe(STAFF["table.send.cta.bare"].en);
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush();
    // MUTATION: firing before the drain — the dish tapped a beat before Send misses the round; red.
    expect(fire).not.toHaveBeenCalled();
    expect(sendBtn().getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      order.push("add answered");
      add.resolve({ ok: true });
    });
    await flush();
    expect(fire).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["add answered", "fire"]);
  });

  it("a Send draining an add that goes unconfirmed stops waiting at 15s and says what it waits on", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(ONE());
    await flush(400);
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush(16_000);
    // MUTATION: a drain that waits on the hung request itself — the Send stays "Sending…" for as
    // long as the request hangs, with no word; red.
    expect(fire).not.toHaveBeenCalled();
    expect(sendBtn().getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(STAFF["table.send.hold.add"].en.replace("{x}", "Mohinga"));
  });

  it("on a counter order Take cash is accepted while an add flies, drains it, reads it back, then opens the till in place (PD6)", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    // `counterPayable()` arms the read with itself; the read AFTER the add is armed below it.
    const seed = counterPayable();
    // The read after the add: the dish is on it, and so is its price.
    getTableDetail.mockResolvedValue({
      kind: "detail",
      detail: {
        ...counterPayable(),
        lines: [
          line({ id: "l1", fulfillment: "togo", sendable: false }),
          line({ id: "l2", fulfillment: "togo", sendable: false }),
        ],
        itemCount: 2,
        ...priced(2900, 3162),
      },
    });
    mount(seed, { counter: true });
    await act(async () => {
      fireEvent.click(mohinga());
    });
    // Enabled (never refused for a flying add), and names no stale sum: the bare door.
    expect(settleBtn().getAttribute("aria-disabled")).toBeNull();
    expect(settleBtn().textContent).toBe(STAFF["settle.cash.title"].en);
    // Phase 3d · counter — nor does the ticket a thumb away: the priced stack keeps its rows and
    // withholds every amount while the dish flies (the dock's own predicate). MUTATION
    // p3d-receipt/ticket-blind-to-a-flying-add → red.
    expect(rowKeys()).toEqual(["subtotal", "tax", "total"]);
    expect(rowKeys().map(row)).toEqual(["—", "—", "—"]);
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(settleBtn().getAttribute("aria-busy")).toBe("true");
    // MUTATION: opening before the drain; red.
    expect(tray()).toBeNull();
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    await flush();
    // PD6 (K39) — no navigation on a counter order: the tray opens over the pad, quoting the read
    // that STARTED after the add landed. (Here the landing's own read commits before the gate
    // looks; the gate's wait is falsified by the next case, whose read is still out.)
    expect(push).not.toHaveBeenCalled();
    expect(tray()).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Take \$/ }).textContent).toBe(
      STAFF["settle.cash.settleAmount"].en.replace("{m}", "$31.62"),
    );
    // The slip froze with that read too: no "the order changed" over a cart it already shows.
    expect(screen.queryByRole("button", { name: /The order changed/ })).toBeNull();
  });

  it("an add that LANDED but whose read is still out: Take cash waits for a read that starts after it (PD6)", async () => {
    const seed = counterPayable();
    mount(seed, { counter: true });
    await flush();
    // The read the landing kicks hangs; every read after it shows the dish and its price.
    const postAdd = deferred<TableDetailResult>();
    const twoLines: TableDetailResult = {
      kind: "detail",
      detail: {
        ...seed,
        lines: [
          line({ id: "l1", fulfillment: "togo", sendable: false }),
          line({ id: "l2", fulfillment: "togo", sendable: false }),
        ],
        itemCount: 2,
        ...priced(2900, 3162),
      },
    };
    getTableDetail.mockReturnValueOnce(postAdd.promise);
    getTableDetail.mockResolvedValue(twoLines);
    addItem.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush();
    // Landed, unread: nothing flies, so the drain is instant — the gate's wait is the only thing
    // between this tap and a tray frozen on the pre-add $15.81.
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    // MUTATION pad-door/gate-skips-the-fresh-read: the tray opens now, over a read that never
    // showed the dish; red.
    expect(tray()).toBeNull();
    expect(settleBtn().getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      postAdd.resolve(twoLines);
    });
    await flush();
    await flush();
    expect(tray()).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Take \$/ }).textContent).toBe(
      STAFF["settle.cash.settleAmount"].en.replace("{m}", "$31.62"),
    );
  });

  it("at a dine-in table Take payment while an add flies is refused on unsent and jumps to the Send (Codex round 1, P2)", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(payable());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    // MUTATION: count only the server's drafts — the tap drains and navigates to a payment section
    // the gate refuses on; red.
    expect(push).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["table.send.settleBlocked.one"].en.replace("{n}", "1"));
    expect(document.activeElement).toBe(sendBtn());
  });

  it("with nothing pending, Take payment names the server's total", () => {
    mount(ONE());
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$15.81"));
  });
});

describe("a counter order — Take payment, and (Phase 2f) a Send that is paid at pickup", () => {
  it("with nothing to send (pay-at-pickup off), no Send: Take payment is the one primary", () => {
    mount(
      detail({
        label: "reg-ab12",
        tableNumber: null,
        mode: "pickup",
        counterOrder: true,
        payAtPickup: false,
        lines: [line({ id: "l1", sendable: false, fulfillment: "togo" })],
        itemCount: 1,
        ...priced(1450, 1581),
        send: {
          sendable: 0,
          staffAdded: 0,
          togoDraft: 0,
          inKitchen: false,
          foodDraft: true,
          counterDraft: 1,
          counterSentPastGrace: false,
        },
      }),
      { counter: true, name: "Aye" },
    );
    expect(document.querySelector(".staff-send")).toBeNull();
    expect(settleBtn().className).toContain("ui-btn-primary");
    expect(settleBtn().closest(".pad-dock-primary")).not.toBeNull();
    expect(document.querySelector(".pad-dock-settle")).toBeNull();
  });

  it("a name that fails to save keeps the pad; the next Take payment goes on without it", async () => {
    setName.mockResolvedValueOnce({ ok: false, error: "Couldn’t save." });
    mount(
      detail({
        label: "reg-ab12",
        mode: "pickup",
        lines: [line({ id: "l1", sendable: false })],
        itemCount: 1,
        settleTotalCents: 1581,
      }),
      { counter: true },
    );
    const field = screen.getByLabelText(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "Aye" } });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Aye" });
    expect(tray()).toBeNull();
    expect(region().textContent).toBe(STAFF["pad.nameNotSaved"].en);
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(setName).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(tray()).not.toBeNull();
  });
});

describe("a catalog outage — the menu says so, the order still works", () => {
  it("renders the outage panel with a retry, never an empty menu", async () => {
    mount(ONE(), { catalog: { kind: "outage" } });
    expect(document.body.textContent).toContain(STAFF["pad.menu.outage"].en);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["pad.menu.retry"].en }));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    // The ticket and Take payment keep working.
    expect(settleBtn()).toBeTruthy();
  });
});

describe("Burmese first on a Burmese console", () => {
  it("a tile leads in Burmese with the English echo; a dish with no Burmese leads English, marked", () => {
    mount(detail(), { lang: "my" });
    const lead = document.querySelector(".pad-tile-main .pad-tile-name")!;
    expect(lead.getAttribute("lang")).toBe("my");
    expect(lead.textContent).toBe("မုန့်ဟင်းခါး");
    expect(lead.parentElement!.querySelector(".pad-tile-echo")?.textContent).toBe("Mohinga");
    const beef = [...document.querySelectorAll(".pad-tile-name")].find(
      (e) => e.textContent === "Beef Curry",
    )!;
    expect(beef.getAttribute("lang")).toBe("en");
    // A chip carries no echo (two scripts cannot stack in a 44px chip).
    const all = document.querySelector(".pad-rail .staff-chip")!;
    expect(all.querySelector(".chrome-en")).toBeNull();
  });
});

describe("a removal on the ticket — a ghost while it goes, back in place if refused (§24)", () => {
  const TWO = () =>
    detail({
      lines: [line({ id: "l1" }), line({ id: "l2", name: "Tea", menuItemId: "t1", nameMy: null })],
      itemCount: 2,
      ...priced(2900, 3162),
      send: {
        sendable: 2,
        staffAdded: 2,
        togoDraft: 0,
        inKitchen: false,
        foodDraft: true,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-line-id="${id}"]`);

  it("the row leaves as a ghost, focus lands on the neighbour's name BEFORE the write", async () => {
    const write = deferred<StaffWriteResult>();
    setQty.mockReturnValueOnce(write.promise);
    getTableDetail.mockResolvedValue({ kind: "detail", detail: TWO() });
    mount(TWO());
    const remove = screen.getByRole("button", { name: "Remove Mohinga" });
    remove.focus();
    await act(async () => {
      fireEvent.click(remove);
    });
    expect(setQty).toHaveBeenCalledWith(SESSION, { cartItemId: "l1", qty: 0 });
    // The neighbour's NAME (it cannot be activated — a repeated Enter never removes the next dish).
    expect(document.activeElement?.hasAttribute("data-line-name")).toBe(true);
    expect(row("l2")!.contains(document.activeElement)).toBe(true);
    // …and what sits below is held from the next tap for the same gesture (SAME_GESTURE_MS).
    expect(row("l2")!.hasAttribute("data-settling")).toBe(true);
    // Still drawn — a ghost, inert, fading (the list closes over it).
    expect(row("l1")?.className).toContain("mms-remove");
    expect(row("l1")?.getAttribute("aria-hidden")).toBe("true");
    // Refused: the row comes back in place, and the region says why.
    await act(async () => {
      write.resolve({
        ok: false,
        error: "This table is mid-payment — wait until they’ve finished.",
      });
    });
    await flush();
    expect(row("l1")?.className ?? "").not.toContain("mms-remove");
    expect(region().textContent).toContain("mid-payment");
  });

  it("a removal in flight holds the Send (a write still saving)", async () => {
    setQty.mockReturnValueOnce(new Promise(() => {}));
    mount(TWO());
    await flush(400);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mohinga" }));
    });
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush();
    expect(fire).not.toHaveBeenCalled();
  });
});

describe("Take payment never drops a typed kitchen note (the allergy line)", () => {
  const openNote = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Note — Mohinga" }));
    });
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    fireEvent.change(field, { target: { value: "no peanuts" } });
    return field;
  };

  it("at a table: a note typed but not saved refuses the tap, says why, and takes focus to it", async () => {
    mount(ONE());
    const field = await openNote();
    expect(settleBtn().getAttribute("aria-disabled")).toBe("true");
    const why = STAFF["table.send.hold.note"].en.replace("{x}", "Mohinga");
    expect(document.getElementById("pad-settle-why")?.textContent).toBe(why);
    settleBtn().focus();
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    // MUTATION: Take payment blind to the note — it navigates and the draft is thrown away; red.
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(region().textContent).toBe(why);
  });

  it("at the counter (no Send guards it): the same refusal, on a line the Send would never fire", async () => {
    mount(
      detail({
        label: "reg-ab12",
        tableNumber: null,
        mode: "pickup",
        counterOrder: true,
        lines: [line({ id: "l1", sendable: false })],
        itemCount: 1,
        ...priced(1450, 1581),
        send: {
          sendable: 0,
          staffAdded: 0,
          togoDraft: 0,
          inKitchen: false,
          foodDraft: true,
          counterDraft: 0,
          counterSentPastGrace: false,
        },
      }),
      { counter: true },
    );
    const field = await openNote();
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });

  it("a note typed WHILE Take payment waited on a dish is read again before it leaves", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(counterPayable(), { counter: true });
    await act(async () => {
      fireEvent.click(mohinga());
    });
    // The note editor was opened (still clean) before the tap; staff type in it while the button
    // waits. (Opening a NEW editor during the wait is closed — Codex round 2: the ticket's writes
    // shut while Take payment leaves.)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Note — Mohinga" }));
    });
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    fireEvent.change(field, { target: { value: "no peanuts" } });
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(settleBtn().getAttribute("aria-busy")).toBeNull();
  });
});

describe("a refused tap says why — the phone bar has no room for the hint (§17)", () => {
  it("Take payment on an empty order says 'Add a dish first' through the one region", async () => {
    mount(detail());
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    // MUTATION: a silent refusal — a dimmed button that does nothing on screen; red.
    expect(region().textContent).toBe(STAFF["pad.reason.empty"].en);
    expect(push).not.toHaveBeenCalled();
  });

  it("a Send held by a guest's payment says so when tapped", async () => {
    mount(
      detail({
        lines: [line({ id: "l1" })],
        itemCount: 1,
        runningSubtotalCents: 1450,
        paymentInFlight: true,
        send: {
          sendable: 1,
          staffAdded: 1,
          togoDraft: 0,
          inKitchen: false,
          foodDraft: true,
          counterDraft: 0,
          counterSentPastGrace: false,
        },
      }),
    );
    expect(sendBtn().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    expect(fire).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["table.send.paying"].en);
  });
});

describe("Take payment says what it is actually doing while busy", () => {
  it("nothing pending: 'Opening payment…' (never 'waiting for the last dish'), and a push that never lands frees it", async () => {
    mount(payable());
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(settleBtn().getAttribute("aria-busy")).toBe("true");
    // MUTATION: one busy label for every phase — "Waiting for the last dish…" with no dish coming; red.
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.opening"].en);
    // The route never changed (a dropped push): the button comes back rather than sticking busy.
    await flush(10_500);
    expect(settleBtn().getAttribute("aria-busy")).toBeNull();
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("a counter name typed WHILE Take payment waited is the one saved (Codex round 1, P2)", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    setName.mockResolvedValueOnce({ ok: true });
    mount(counterPayable(), { counter: true });
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    // The field is still editable while the button waits on the dish.
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "Aye" },
    });
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    // MUTATION: decide the save from the name captured at the tap — the call-out is skipped (it
    // was clean then) and the page leaves with "Aye" thrown away; red.
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Aye" });
    await flush();
    expect(tray()).not.toBeNull();
  });

  it("the ticket's own writes are closed while Take payment is on its way out (Codex round 2, P2)", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(counterPayable(), { counter: true });
    const more = () =>
      screen.getByRole("button", {
        name: STAFF["table.line.a11y.more"].en.replace("{x}", "Mohinga"),
      });
    expect(more().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    // MUTATION: leave the ticket writable during the drain — a quantity change starts under a page
    // that is about to leave, its answer said to nobody; red.
    expect(more().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(more());
    expect(setQty).not.toHaveBeenCalled();
  });

  it("the counter name is read-only while Take payment saves it (Codex round 3, P2)", async () => {
    const save = deferred<{ ok: true }>();
    setName.mockReturnValueOnce(save.promise as never);
    mount(counterPayable(), { counter: true });
    const input = () => screen.getByLabelText(STAFF["browse.name.label"].en) as HTMLInputElement;
    fireEvent.change(input(), { target: { value: "Aye" } });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    // MUTATION: leave it editable — "Aye" is marked saved while the field reads something else, and
    // the page leaves with the visible call-out thrown away; red.
    expect(input().readOnly).toBe(true);
    await act(async () => {
      save.resolve({ ok: true });
    });
    await flush();
    await flush();
    expect(tray()).not.toBeNull();
  });

  it("an add on its way: 'Waiting for the last dish…' while it drains", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(counterPayable(), { counter: true });
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.busy"].en);
  });
});

describe("the ticket's own writes withhold the amounts until a read shows them (§23)", () => {
  it("a quantity change: '—' on every row while it saves AND until a read that started after it commits", async () => {
    const write = deferred<StaffWriteResult>();
    setQty.mockReturnValueOnce(write.promise);
    const read = deferred<TableDetailResult>();
    mount(ONE());
    await flush(400);
    expect(row("total")).toBe("$15.81");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Mohinga quantity" }));
    });
    // MUTATION p3d-receipt/ticket-names-amounts-while-pending: "$15.81" beside a quantity of 2; red.
    // The rows stay (the last read's labels) and every amount withholds — the dock's own predicate.
    expect(rowKeys()).toEqual(["subtotal", "tax", "total"]);
    expect(rowKeys().map(row)).toEqual(["—", "—", "—"]);
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.bare"].en);
    getTableDetail.mockReturnValueOnce(read.promise);
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    // Answered, but the read that shows it has not committed: still no figure on any row.
    expect(rowKeys().map(row)).toEqual(["—", "—", "—"]);
    await act(async () => {
      read.resolve({
        kind: "detail",
        detail: {
          ...ONE(),
          lines: [line({ id: "l1", qty: 2 })],
          itemCount: 2,
          ...priced(2900, 3162),
        },
      });
    });
    await flush();
    expect(row("subtotal")).toBe("$29.00");
    expect(row("total")).toBe("$31.62");
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$31.62"));
  });
});

describe("PD1 — the ticket's 'Not sent yet' group sits under the hollow ring", () => {
  it("only the unsent group's heading wears the ring, decorative (the word carries it)", async () => {
    mount(
      detail({
        lines: [line({ id: "l1" }), line({ id: "l2", state: "fired", sendable: false })],
        itemCount: 2,
      }),
    );
    await flush();
    const heads = [...document.querySelectorAll<HTMLElement>(".pad-ticket-group-h")];
    const unsent = heads.find((h) => h.textContent!.includes(STAFF["pad.group.unsent"].en))!;
    // MUTATION pd1/ticket-group-ring-dropped: the pad's group speaks another mark from the floor's;
    // red.
    const ring = unsent.querySelector(".staff-unsent-ring")!;
    expect(ring.getAttribute("data-stage")).toBe("unsent");
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    expect(heads.filter((h) => h.querySelector(".staff-unsent-ring"))).toEqual([unsent]);
  });
});

describe("Phase 3d · counter — the ticket speaks receipt, and its Total is Take payment's figure", () => {
  it("the ticket's Total IS Take payment's figure — one binding, a thumb apart", async () => {
    // The bug this closes: the ticket printed the LINES read's pre-tax "$14.50 subtotal so far" a
    // thumb from the dock's tax-inclusive "Take payment · $15.81" — two bases on one screen.
    mount(ONE());
    await flush();
    expect(rowKeys()).toEqual(["subtotal", "tax", "total"]);
    // The server's parts, verbatim: $1.31 is the FIXTURE's tax (`priced`); the 10.5% engine on
    // $14.50 says $1.52, so a stack that recomputed client-side reads a different number here.
    expect(rowKeys().map(row)).toEqual(["$14.50", "$1.31", "$15.81"]);
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$15.81"));
    expect(document.querySelector('[data-row="total"]')!.hasAttribute("data-grand")).toBe(true);
    expect(document.querySelector('[data-row="tax"]')!.textContent).toContain(
      STAFF["floor.settled.row.tax"].en,
    );
    // The pre-tax note left with the pre-tax figure.
    expect(screen.queryByText(STAFF["table.detail.pretaxNote"].en)).toBeNull();
    expect(screen.queryByText(STAFF["table.detail.subtotalSoFar"].en)).toBeNull();
    // A list named as the receipt's totals — never a region (the pad's one Toast stays the one).
    const list = document.querySelector(".pad-receipts")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe(STAFF["floor.settled.a11y.rows"].en);
    expect(list.getAttribute("aria-live")).toBeNull();
  });

  it("a discount is its own row, signed, and the Total is still the dock's figure", async () => {
    // Before 3d nothing on the pad named a discount: the pre-discount subtotal sat beside a
    // discounted total. The combined Discount (promo + reward, M22) is the guest receipt's row.
    const d = detail({
      ...ONE(),
      lines: [line({ id: "l1", qty: 2, unitPriceCents: 2500 })],
      itemCount: 2,
      runningSubtotalCents: 5000,
      settleTotalCents: 3930,
      settleBreakdown: {
        subtotalCents: 5000,
        discountCents: 1400,
        serviceChargeCents: 0,
        taxCents: 330,
        tipCents: 0,
      },
    });
    getTableDetail.mockResolvedValue({ kind: "detail", detail: d });
    mount(d);
    await flush();
    expect(rowKeys()).toEqual(["subtotal", "discount", "tax", "total"]);
    // MUTATION p3d-receipt/ticket-discount-loses-its-minus: "$14.00" reads as an added charge; red.
    expect(row("discount")).toBe("−$14.00");
    expect(row("total")).toBe("$39.30");
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$39.30"));
  });

  it("a Burmese console reads the receipt's Burmese words — the settled list's own keys", async () => {
    mount(ONE(), { lang: "my" });
    await flush();
    // MUTATION p3d-receipt/ticket-labels-lose-their-burmese: the receipt's English label, unmarked;
    // red.
    expect(document.querySelector('[data-row="tax"] [lang="my"]')?.textContent).toBe(
      STAFF["floor.settled.row.tax"].my,
    );
    expect(document.querySelector('[data-row="total"] [lang="my"]')?.textContent).toBe(
      STAFF["floor.settled.row.total"].my,
    );
    expect(document.querySelector(".pad-receipts")!.getAttribute("aria-label")).toBe(
      STAFF["floor.settled.a11y.rows"].my,
    );
  });
});

describe("no natively disabled button in any state (§17)", () => {
  it("while a guest pays, and with a dish sold out", async () => {
    mount(detail({ ...ONE(), paymentInFlight: true }), {
      catalog: {
        kind: "ok",
        items: [...CATALOG.items, dish({ id: "s1", nameEn: "Samosa", soldOut: true })],
      },
    });
    // MUTATION: a native `disabled` on the paused tiles, the paying Send or a sold-out tile; red.
    expect(tile(/Samosa/).getAttribute("aria-disabled")).toBe("true");
    expect(sendBtn().getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelectorAll("button[disabled]")).toHaveLength(0);
  });
});

describe("the category rail during a search (the desktop register shows both)", () => {
  it("tapping the chip chosen before the search picks it again — never 'All'", async () => {
    mount();
    const chip = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>(".pad-rail .staff-chip")].find(
        (b) => b.textContent === name,
      )!;
    await act(async () => {
      fireEvent.click(chip("Curries"));
    });
    expect(chip("Curries").getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(document.querySelector<HTMLInputElement>(".pad-search-input")!, {
      target: { value: "mo" },
    });
    expect(chip("Curries").getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(chip("Curries"));
    });
    // MUTATION: toggling the STORED choice — the retained slug toggles to null and "All" opens; red.
    expect(chip("Curries").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".pad-section")).toHaveLength(1);
  });
});

describe("a removal whose answer is lost — said as unknown, never stranded", () => {
  const TWO = () =>
    detail({
      lines: [line({ id: "l1" }), line({ id: "l2", name: "Tea", menuItemId: "t1", nameMy: null })],
      itemCount: 2,
      ...priced(2900, 3162),
      send: {
        sendable: 2,
        staffAdded: 2,
        togoDraft: 0,
        inKitchen: false,
        foodDraft: true,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });

  it("a removal that throws says it could not be confirmed — in the dictionary, by dish", async () => {
    setQty.mockRejectedValueOnce(new Error("network"));
    mount(TWO());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mohinga" }));
    });
    await flush();
    // MUTATION: the old literal English "Couldn’t update that…" — a definite failure for an
    // unknown outcome, in English on a Burmese console; red.
    expect(region().textContent).toBe(STAFF["pad.err.remove.unknown"].en.replace("{x}", "Mohinga"));
  });

  it("a removal in flight SAYS it holds the Send; hung past 15s it comes back, frees the Send, offers Reload", async () => {
    setQty.mockReturnValueOnce(new Promise(() => {}));
    mount(TWO());
    await flush(400);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mohinga" }));
    });
    // MUTATION: the hold kept in a ref only — a live-looking Send that ignores taps; red.
    expect(sendBtn().getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector(".pad-dock .staff-send-hint")?.textContent).toBe(
      STAFF["table.send.hold.writing"].en,
    );
    await flush(15_500);
    // MUTATION: an un-raced removal — the Send held for as long as the request hangs; red.
    expect(sendBtn().getAttribute("aria-disabled")).toBeNull();
    expect(document.querySelector('[data-line-id="l1"]')?.className ?? "").not.toContain(
      "mms-remove",
    );
    expect(region().textContent).toBe(STAFF["pad.err.remove.unknown"].en.replace("{x}", "Mohinga"));
    expect(document.body.textContent).toContain(STAFF["pad.reload"].en);
  });
});

describe("Phase 2i — the pad's removal is a WRITE on the ledger", () => {
  it("a removal in flight is a young write — a reload for a new build is refused for it", async () => {
    setQty.mockReturnValueOnce(new Promise(() => {}));
    mount(
      detail({
        lines: [
          line({ id: "l1" }),
          line({ id: "l2", name: "Tea", menuItemId: "t1", nameMy: null }),
        ],
        itemCount: 2,
      }),
    );
    await flush(400);
    expect(youngWrite()).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Mohinga" }));
    });
    // MUTATION (p2i-kind/pad-removal): the removal's race labels it a read — a reload for a new
    // build lands over a removal still in flight; red.
    expect(youngWrite()).toBe(true);
  });
});

describe("the options sheet's retry reads 2a's key rule", () => {
  it("an unknown outcome keeps the key: the same choice again rides the SAME key; a new choice mints one", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes("$14.50"),
      )!;
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    expect(dialog.textContent).toContain(STAFF["browse.add.unconfirmed"].en);
    const first = (addItem.mock.calls[0]![0] as { addKey: string }).addKey;
    // The first may have landed: its ghost is LOST, so the retry sends it again, same key.
    addItem.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    expect(addItem).toHaveBeenCalledTimes(2);
    expect((addItem.mock.calls[1]![0] as { addKey: string }).addKey).toBe(first);
  });
});

describe("the menu outage's Try again is never silent", () => {
  it("still down after the re-read: the outage line comes through the one region", async () => {
    mount(ONE(), { catalog: { kind: "outage" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["pad.menu.retry"].en }));
    });
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    // MUTATION: a retry with no failure state — nothing on screen changes; red.
    expect(region().textContent).toBe(STAFF["pad.menu.outage"].en);
  });
});

// ── Phase 2c · gate ──
describe("the settle gate on the pad — Take payment waits for everything to be sent", () => {
  it("a table holding an unsent dish: Take payment is aria-disabled with the reason, a tap says it once and takes the finger to the Send (the order view first)", async () => {
    mount(ONE()); // one dine-in Mohinga, not sent
    const take = settleBtn();
    expect(take.getAttribute("aria-disabled")).toBe("true");
    expect(take.hasAttribute("disabled")).toBe(false);
    const why = tf("en", "table.send.settleBlocked.one", { n: 1 });
    const hint = document.getElementById(take.getAttribute("aria-describedby")!)!;
    expect(hint.textContent).toBe(why);
    // The pad opens on the menu view (the phone's first screen).
    expect(document.querySelector(".pad-shell")!.getAttribute("data-view")).toBe("menu");
    await act(async () => {
      fireEvent.click(take);
    });
    // MUTATION (pad/unsent-take-payment-live, the lib clause): the tap navigates to a payment
    // section whose every door refuses; red.
    expect(push).not.toHaveBeenCalled();
    expect(region().textContent).toBe(why);
    // MUTATION (pad-ui/unsent-tap-leaves-focus): drop the jump — the cashier reads why with the
    // finger still on a refused button and the Send somewhere else on the screen; red.
    expect(document.querySelector(".pad-shell")!.getAttribute("data-view")).toBe("order");
    expect(document.activeElement).toBe(sendBtn());
  });
});

// ── Phase 2c · review fixes · pad2 ──
/** A catalog with a second quick-add dish, so "only THIS dish is held" can be seen. */
const WITH_TEA = {
  kind: "ok" as const,
  items: [...CATALOG.items, dish({ id: "t1", nameEn: "Tea", categorySort: 10 })],
};
const tea = () => tile(/^Add — Tea|Tea/);
const tryAgain = () => screen.getByRole("button", { name: /^Try again — / });
/** One Mohinga whose add answered "unconfirmed" — lost: it may already be on the order. */
async function lostMohinga(initial: TableDetail = ONE(), opts: { catalog?: unknown } = {}) {
  addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
  mount(initial, opts);
  await act(async () => {
    fireEvent.click(mohinga());
  });
  await flush();
  expect(ghosts()[0]!.dataset.state).toBe("lost");
  return (addItem.mock.calls[0]![0] as { addKey: string }).addKey;
}
const keyOf = (i: number) => (addItem.mock.calls[i]![0] as { addKey: string }).addKey;

describe("P1 — a dish whose add is UNKNOWN is never added again under a new key", () => {
  it("a re-tap on the lost dish is refused and names the fix; another dish stays live", async () => {
    await lostMohinga(ONE(), { catalog: WITH_TEA });
    expect(mohinga().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(mohinga());
    });
    // MUTATION (pad2/tile-tap-ignores-the-dish-hold): the tap mints a NEW key — if the first add
    // landed, the table is billed and cooked two Mohinga; red.
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(tf("en", "table.send.hold.lost", { x: "Mohinga" }));
    // The options corner is the same door: refused too, no sheet.
    await act(async () => {
      fireEvent.click(mohinga().closest("li")!.querySelector<HTMLButtonElement>(".pad-tile-opts")!);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Only THIS dish — a lost Mohinga never stalls the Tea (`pad/lost-add-blocks-the-tiles`).
    addItem.mockResolvedValueOnce({ ok: true });
    expect(tea().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(tea());
    });
    expect(addItem).toHaveBeenCalledTimes(2);
    expect((addItem.mock.calls[1]![0] as { menuItemId: string }).menuItemId).toBe("t1");
  });

  it("the options sheet: an unknown add, the sheet closed and opened again — refused, no new key", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    await act(async () => {
      fireEvent.click(
        [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
          b.textContent?.includes("$14.50"),
        )!,
      );
    });
    await flush();
    expect(dialog.textContent).toContain(STAFF["browse.add.unconfirmed"].en);
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    await flush(1000);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    // MUTATION: reopening resets the held key — the same choice again mints a NEW key; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(region().textContent).toBe(tf("en", "table.send.hold.lost", { x: "Beef Curry" }));
    expect(addItem).toHaveBeenCalledTimes(1);
  });
});

describe("P2 — a RETRY refused before the ledger leaves the add unknown, under the SAME key", () => {
  it("Try again answered 'outage' keeps the ghost lost, says it may be on, keeps the key", async () => {
    const first = await lostMohinga();
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "outage" });
    await act(async () => {
      fireEvent.click(tryAgain());
    });
    await flush();
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(first);
    // MUTATION (pad2/retry-reads-first-attempt): the retry's refusal read as definite — the ghost
    // goes, "Mohinga didn't go on", and the next tap mints a new key; red.
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0]!.dataset.state).toBe("lost");
    expect(region().textContent).toBe(tf("en", "pad.err.retry.outage", { x: "Mohinga" }));
    expect(region().textContent).not.toContain("didn’t go on");
    // The dish is still held (a re-tap would be a new key), and Try again still rides the first key.
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(addItem).toHaveBeenCalledTimes(2);
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "paying" });
    await act(async () => {
      fireEvent.click(tryAgain());
    });
    await flush();
    expect(keyOf(2)).toBe(first);
    expect(region().textContent).toBe(tf("en", "pad.err.retry.paying", { x: "Mohinga" }));
    expect(ghosts()[0]!.dataset.state).toBe("lost");
  });

  it("a closed order answering the retry is still no verdict on the first attempt", async () => {
    const first = await lostMohinga();
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "closed" });
    await act(async () => {
      fireEvent.click(tryAgain());
    });
    await flush();
    expect(keyOf(1)).toBe(first);
    expect(ghosts()[0]!.dataset.state).toBe("lost");
    expect(region().textContent).toBe(tf("en", "pad.err.retry.failed", { x: "Mohinga" }));
  });

  it("the options sheet: a refused retry keeps the held key — the same choice again rides it", async () => {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes("$14.50"),
      )!;
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "outage" });
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    // The sheet says why the retry could not run — and that the dish may already be on.
    expect(dialog.textContent).toContain(tf("en", "pad.err.retry.outage", { x: "Beef Curry" }));
    addItem.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    // MUTATION: the held key dropped on the retry's refusal — the third try mints a NEW key; red.
    expect(addItem).toHaveBeenCalledTimes(3);
    expect(keyOf(2)).toBe(keyOf(0));
  });
});

describe("P1/P2 — the options sheet and the ghost, on one unknown add", () => {
  /** Beef Curry through the sheet, answered "unconfirmed": lost, its refusals the sheet's own. */
  async function lostBeef() {
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
    const addBtn = () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes("$"),
      )!;
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    expect(ghosts()[0]!.dataset.state).toBe("lost");
    return { dialog, addBtn };
  }

  it("a DIFFERENT choice for the dish, while its add is unknown, is refused — never a new key", async () => {
    const { dialog, addBtn } = await lostBeef();
    // A kitchen note makes it a different intent (a different add, by 2a's rule).
    fireEvent.change(dialog.querySelector<HTMLInputElement>("#staff-mod-note")!, {
      target: { value: "no onion" },
    });
    await act(async () => {
      fireEvent.click(addBtn());
    });
    await flush();
    // MUTATION (pad2/sheet-new-key-over-a-held-dish): the new intent mints a NEW key while the
    // first may have landed — a second curry; red.
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(dialog.textContent).toContain(tf("en", "table.send.hold.lost", { x: "Beef Curry" }));
  });

  it("Try again on the ghost of a SHEET add says its outcome in the pad's region (the sheet is gone)", async () => {
    const { dialog } = await lostBeef();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    await flush(1000);
    addItem.mockResolvedValueOnce({ ok: false, error: "x", code: "outage" });
    await act(async () => {
      fireEvent.click(tryAgain());
    });
    await flush();
    expect(keyOf(1)).toBe(keyOf(0));
    // MUTATION (pad2/ghost-retry-said-to-the-sheet): the retry keeps the sheet's quiet flag — its
    // refusal is said to a sheet that is closed, i.e. to nobody; red.
    expect(region().textContent).toBe(tf("en", "pad.err.retry.outage", { x: "Beef Curry" }));
  });
});

describe("P3 — the Send re-reads the note hold AFTER its drain", () => {
  it("a kitchen note typed while the Send waited on a dish holds the fire and says so", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await flush(400);
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    // The Send is draining; the server types the allergy on the unsent dish meanwhile.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Note — Mohinga" }));
    });
    const field = document.querySelector<HTMLInputElement>('[data-note-for="l1"]')!;
    fireEvent.change(field, { target: { value: "no peanuts" } });
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    // MUTATION (pad2/send-fires-past-a-late-note): the hold read only at the tap — the dish fires
    // with the allergy still in the field, and the save after it is refused (draft-only); red.
    expect(fire).not.toHaveBeenCalled();
    expect(region().textContent).toBe(tf("en", "table.send.hold.note", { x: "Mohinga" }));
    expect(document.activeElement).toBe(field);
    expect(sendBtn().getAttribute("aria-busy")).toBeNull();
  });
});

describe("P4 — nothing is added while Take payment is on its way out", () => {
  it("while the name saves: a tile tap is refused and says what Take payment is doing", async () => {
    const save = deferred<{ ok: true }>();
    setName.mockReturnValueOnce(save.promise);
    mount(
      detail({
        label: "reg-ab12",
        mode: "pickup",
        lines: [line({ id: "l1", sendable: false })],
        itemCount: 1,
        settleTotalCents: 1581,
      }),
      { counter: true },
    );
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "Aye" },
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.savingName"].en);
    // MUTATION (pad2/tap-ignores-the-settle): the tile adds after the drain — its outcome is said to
    // a screen that is leaving, and the "Added" claim is never retracted; red.
    expect(mohinga().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.settle.savingName"].en);
    await act(async () => {
      save.resolve({ ok: true });
    });
    await flush();
    await flush();
    expect(tray()).not.toBeNull();
  });

  it("while payment opens: a tile tap is refused", async () => {
    mount(payable());
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    expect(push).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(mohinga());
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.settle.opening"].en);
  });
});

describe("P5 — a hung detail read is never piled on", () => {
  it("no new read starts while the last one is still unanswered; its answer kicks the next", async () => {
    const hung = deferred<TableDetailResult>();
    getTableDetail.mockReturnValue(hung.promise);
    mount(ONE());
    await flush(5_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // Past the 15s give-up, and several 5s polls later.
    // MUTATION (pad2/detail-read-piles-on-a-hung-one): the timeout frees the next read — each one
    // queues behind the hung action in Next's serialized queue, and the pile grows every 5s; red.
    await flush(40_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    getTableDetail.mockResolvedValue({ kind: "detail", detail: ONE() });
    await act(async () => {
      hung.resolve({ kind: "detail", detail: ONE() });
    });
    await flush();
    // The polls it refused are owed one fresh read, at once.
    expect(getTableDetail).toHaveBeenCalledTimes(2);
  });
});

describe("Phase 2i — the pad's detail read is a READ on the ledger", () => {
  it("a detail read in flight never reads as a young write", async () => {
    getTableDetail.mockReturnValue(new Promise(() => {}));
    mount(ONE());
    await flush(5_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // MUTATION (p2i-kind/pad-detail-poll): the race labels the poll a write — an open pad refuses a
    // reload for a new build every 5s; red.
    expect(youngWrite()).toBe(false);
  });
});

describe("Phase 2h (9c) — the pad's unconfirmed add reads THE hang bound", () => {
  it("a dispatched add reads 'Checking…' at EXACTLY STAFF_HANG_MS — not a millisecond before", async () => {
    // MUTATION (p2h-core/pad-add-bound-drifts): the pad's own 15s drifts off the constant the stall
    // ledger and the poll gate read — the ghost and the refusal disagree about when a hang began; red.
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush(STAFF_HANG_MS - 1);
    expect(ghosts()[0]!.textContent).toContain(STAFF["pad.ghost.adding"].en);
    await flush(1);
    expect(ghosts()[0]!.textContent).toContain(STAFF["pad.ghost.checking"].en);
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
  });
});

describe("Phase 2h (9d) — the pad's add sits on the stall ledger until it answers", () => {
  it("a hung add makes the tab read stalled at 15s — the money taps behind it are refused, not queued", async () => {
    // MUTATION (p2h-core/track-pad-add): the add is not tracked — the usual hang (LEARNINGS #157)
    // only shows once a poll queued behind it has aged 15s, up to 5s later, and every money tap in
    // that window is dispatched into the stuck queue; red.
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    const tappedAt = Date.now();
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    await flush(1);
    expect(stalledSince()).toBe(tappedAt);
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(stalledSince()).toBeNull();
  });
});

describe("Phase 2h (9d) — the counter name's save sits on the stall ledger until it answers", () => {
  it("a hung name save (Take payment's first step) makes the tab read stalled at 15s", async () => {
    // MUTATION (p2h-core/track-name-save): the save is not tracked — hung, it holds the action queue
    // while the ledger calls the tab healthy, and the next money tap is queued behind it; red.
    const save = deferred<{ ok: true }>();
    setName.mockReturnValueOnce(save.promise as never);
    mount(counterPayable(), { counter: true });
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "Aye" },
    });
    const tappedAt = Date.now();
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush(STAFF_HANG_MS - 1);
    expect(setName).toHaveBeenCalledTimes(1);
    expect(stalledSince()).toBeNull();
    await flush(1);
    expect(stalledSince()).toBe(tappedAt);
    await act(async () => {
      save.resolve({ ok: true });
    });
    await flush();
  });
});

describe("Phase 2h (9f) — a hung detail read ARMS the not-updating line instead of hiding it", () => {
  const stale = () => document.querySelector(".pad-stale")?.textContent ?? null;

  it("a tick skipped while the raw read has been out ≥ STAFF_HANG_MS is a miss: two arm the line, it escalates, ONE read in the air", async () => {
    const hung = deferred<TableDetailResult>();
    getTableDetail.mockReturnValue(hung.promise);
    mount(ONE());
    await flush(5_000);
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // Under the bound, a skipped tick is a slow read on busy wifi — not a miss, nothing said.
    await flush(9_000);
    expect(stale()).toBeNull();
    // Past it: the race's give-up and the tick it refused are two misses, and the pad SAYS it is not
    // updating. Before Phase 2h the skip never counted, so after the race's one miss the line never
    // armed — the pad wore its live face over a frozen feed for as long as the read hung.
    // MUTATION (p2h-core/pad-skip-never-a-miss): the hook ignores `missed`; red.
    await flush(16_000);
    expect(stale()).toContain(STAFF["out.head.notUpdating"].en);
    expect(stale()).not.toContain(STAFF["out.head.cant"].en); // this end's wifi is not blamed on us
    // …and it escalates on the outage voice's own clock (two minutes) while the read stays hung.
    await flush(120_000);
    expect(stale()).toContain(STAFF["out.head.stillNotUpdating"].en);
    expect(stale()).toContain(STAFF["out.tail.paper"].en);
    // The whole time, ONE read was in the air (the gate never stacked a second behind it).
    expect(getTableDetail).toHaveBeenCalledTimes(1);
    // The raw answers: the owed read runs once, lands, and the line clears.
    await act(async () => {
      hung.resolve({ kind: "detail", detail: ONE() });
    });
    await flush();
    expect(getTableDetail).toHaveBeenCalledTimes(2);
    expect(stale()).toBeNull();
  });
});

describe("P6 — a hung add is SAID, and so is the retry that lands", () => {
  it("15s with no answer: the region says it is not confirmed yet; a late ok says it is on", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await flush(16_000);
    // MUTATION (pad2/hang-said-to-nobody): the ghost turns "Checking…" (aria-hidden) with no word
    // in the region — a screen-reader user last heard "Added"; red.
    expect(region().textContent).toBe(tf("en", "pad.err.add.checking", { x: "Mohinga" }));
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(region().textContent).toBe(tf("en", "browse.added", { n: 1, x: "Mohinga" }));
  });

  it("a Try again that lands says so", async () => {
    await lostMohinga();
    addItem.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(tryAgain());
    });
    await flush();
    // MUTATION (pad2/retry-ok-silent): the retry lands in silence under "We couldn't confirm"; red.
    expect(region().textContent).toBe(tf("en", "browse.added", { n: 1, x: "Mohinga" }));
  });
});

describe("P7 — focus never falls to the page when a pad control goes", () => {
  it("Try again keeps focus on its own control (busy), and the ghost leaving hands it to the order", async () => {
    await lostMohinga();
    const retry = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(retry.promise);
    const btn = tryAgain();
    btn.focus();
    await act(async () => {
      fireEvent.click(btn);
    });
    // MUTATION: the ghost swaps its button for an aria-hidden span — focus drops to <body>; red.
    expect(document.activeElement).toBe(btn);
    expect(btn.isConnected).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      retry.resolve({ ok: true });
    });
    await flush();
    expect(ghosts()).toHaveLength(0);
    // The catch-all: the ticket's heading, never <body>.
    expect(document.activeElement).toBe(document.querySelector(".pad-ticket-title"));
  });
});

describe("P8 — the phone's view button says what the adds ARE", () => {
  it("a lost add: 'Check the order', never 'Adding…'", async () => {
    await lostMohinga();
    const view = document.querySelector<HTMLButtonElement>(".pad-view")!;
    // MUTATION (pad2/view-lost-said-adding): "Adding…" over an answer that came back; red.
    expect(view.textContent).toContain(STAFF["pad.bar.check"].en);
    expect(view.textContent).not.toContain(STAFF["pad.ghost.adding"].en);
  });

  it("an unconfirmed add: 'Checking…'", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    const view = () => document.querySelector<HTMLButtonElement>(".pad-view")!;
    expect(view().textContent).toContain(STAFF["pad.ghost.adding"].en);
    await flush(16_000);
    expect(view().textContent).toContain(STAFF["pad.ghost.checking"].en);
  });
});

describe("P9 — a tile's name keeps each script's language and counts what is on its way", () => {
  it("named by its lang-tagged runs; the pending +N is in the name", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(ONE());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    const btn = mohinga();
    const ids = btn.getAttribute("aria-labelledby")!.split(" ");
    const runs = ids.map((id) => document.getElementById(id)!);
    // MUTATION: one flattened aria-label — the English voice reads the Myanmar run; red.
    expect(btn.hasAttribute("aria-label")).toBe(false);
    expect(runs.find((r) => r.textContent === "မုန့်ဟင်းခါး")?.getAttribute("lang")).toBe("my");
    expect(runs.find((r) => r.textContent === "Mohinga")?.getAttribute("lang")).toBe("en");
    // WCAG 2.5.3: the visible "+1" is in the name, with what it counts.
    expect(screen.getAllByRole("button", { name: /\+1 Adding…/ })).toContain(btn);
    expect(screen.getAllByRole("button", { name: /^Add Mohinga/ })).toContain(btn);
  });
});

describe("P11 — a counter name's Save with nothing to save refuses, and says why", () => {
  it("empty field, nothing saved: aria-disabled with the reason; a tap says it once", async () => {
    mount(
      detail({ label: "reg-ab12", mode: "pickup", lines: [line({ id: "l1", sendable: false })] }),
      { counter: true },
    );
    const save = screen.getByRole("button", { name: STAFF["browse.name.save"].en });
    // MUTATION (pad2/name-empty-reads-saved): a live-looking Save that does nothing; red.
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(save.getAttribute("aria-describedby")!)?.textContent).toBe(
      STAFF["pad.name.empty"].en,
    );
    await act(async () => {
      fireEvent.click(save);
    });
    expect(setName).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.name.empty"].en);
  });

  it("an emptied field over a saved name CLEARS it", async () => {
    setName.mockResolvedValueOnce({ ok: true });
    render(
      <StaffLangProvider lang="en">
        <main>
          <OrderPad
            sessionId={SESSION}
            initialDetail={detail({ label: "reg-ab12", mode: "pickup" })}
            catalog={CATALOG as never}
            counterOrder
            initialName="Aye"
            hasPin={false}
          />
        </main>
      </StaffLangProvider>,
    );
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["browse.name.save"].en }));
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "" });
    expect(region().textContent).toBe(STAFF["browse.name.cleared"].en);
  });
});

describe("Codex r2 on #311 — a counter name typed and not saved holds the reload for a new version", () => {
  it("held while it differs from the saved name, focused or not; the save releases it", async () => {
    // MUTATION (p2i-draft/counter-name-unheld): no hold — the call-out typed for a waiting guest is
    // erased by the automatic reload once the cashier taps a dish; red.
    setName.mockResolvedValueOnce({ ok: true });
    mount(
      detail({ label: "reg-ab12", mode: "pickup", lines: [line({ id: "l1", sendable: false })] }),
      { counter: true },
    );
    const drafts = () => reloadHolds().filter((h) => h.reason === "draft");
    expect(drafts()).toEqual([]);
    const field = screen.getByLabelText(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "Aye" } });
    (field as HTMLInputElement).blur();
    expect(drafts()).toEqual([
      expect.objectContaining({ kind: "unsent", subject: "counterName", survives: false }),
    ]);
    // Typed back to what is saved (nothing): nothing to lose.
    fireEvent.change(field, { target: { value: "  " } });
    expect(drafts()).toEqual([]);
    fireEvent.change(field, { target: { value: "Aye" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["browse.name.save"].en }));
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Aye" });
    expect(drafts()).toEqual([]);
  });
});

describe("open question — the options sheet never hides the pad's one region", () => {
  it("while the sheet is open, the Toast region is outside every aria-hidden subtree", async () => {
    mount(ONE());
    await act(async () => {
      fireEvent.click(tile(/Beef Curry/));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Radix's modal sweep hides the page, but exempts `[aria-live]` — the Toast carries it, so a
    // late refusal of a queued add is still spoken while the sheet is up.
    expect(region().closest('[aria-hidden="true"]')).toBeNull();
    expect(region().getAttribute("aria-live")).toBe("polite");
  });
});

describe("Phase 2f · pay at pickup — the pad's dock for a counter order", () => {
  const counter = (over: Partial<TableDetail> = {}) =>
    detail({
      label: "reg-ab12",
      tableNumber: null,
      mode: "pickup",
      counterOrder: true,
      counterArm: "walkup",
      customerName: "Aye",
      lines: [line({ id: "l1", sendable: false, fulfillment: "togo" })],
      itemCount: 1,
      ...priced(1450, 1581),
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: false,
        foodDraft: true,
        counterDraft: 1,
        counterSentPastGrace: false,
      },
      ...over,
    });
  const primary = () => document.querySelector<HTMLElement>(".pad-dock-primary")!;
  const filled = () => document.querySelectorAll(".pad-dock .ui-btn-primary");
  const serve = (d: TableDetail) => getTableDetail.mockResolvedValue({ kind: "detail", detail: d });

  it("a WALK-UP leads with Take payment; the Send (pay at pickup) sits second", async () => {
    const d = counter();
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    expect(settleBtn().closest(".pad-dock-primary")).not.toBeNull();
    expect(settleBtn().className).toContain("ui-btn-primary");
    const send = sendBtn();
    expect(send.closest(".pad-dock-settle")).not.toBeNull();
    expect(send.className).toContain("ui-btn-secondary");
    expect(send.textContent).toBe(STAFF["table.send.cta.counter.one"].en.replace("{n}", "1"));
    expect(filled()).toHaveLength(1);
  });

  it("a PHONE order leads with the Send; Take payment steps back", async () => {
    const d = counter({ counterArm: "phone" });
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    expect(sendBtn().closest(".pad-dock-primary")).not.toBeNull();
    expect(sendBtn().className).toContain("ui-btn-primary");
    expect(settleBtn().closest(".pad-dock-settle")).not.toBeNull();
    expect(settleBtn().className).toContain("ui-btn-secondary");
    expect(filled()).toHaveLength(1);
  });

  it("after a walk-up's Send: the Undo stays in the Send's slot and nothing is filled", async () => {
    const d = counter();
    serve(d);
    fire.mockResolvedValueOnce({
      ok: true,
      fired: 1,
      undoUntil: new Date(T + 10_000).toISOString(),
      serverNow: new Date(T).toISOString(),
      undoBatch: "b1",
    });
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const before = sendBtn();
    // The detail after the fire: nothing left to send, nothing past its grace yet.
    serve(counter({ send: { ...d.send, counterDraft: 0 } }));
    await act(async () => {
      fireEvent.click(before);
    });
    await flush();
    expect(fire).toHaveBeenCalledWith({ sessionId: SESSION });
    // The wiring of p2f-lib/pad/send-slot-jumps-at-the-tap (judged by lib/order-pad.test.ts): the
    // Undo must not remount in the primary slot.
    expect(sendBtn()).toBe(before);
    expect(sendBtn().closest(".pad-dock-settle")).not.toBeNull();
    expect(sendBtn().textContent).toContain(STAFF["table.send.undo"].en);
    expect(filled()).toHaveLength(0);
  });

  it("Codex r4 — a reload inside the grace with pay at pickup PARKED: the restored Undo still shows and works", async () => {
    // The send fired before the switch was parked; the page reloaded inside its 10s. The switch
    // parks NEW sends only — the server takes a send in its grace back regardless.
    sessionStorage.setItem(
      `mms-staff-undo:${SESSION}`,
      JSON.stringify({ batch: "b1", deadlineMs: T + 8_000 }),
    );
    const d = counter({
      payAtPickup: false,
      unpaidSent: true,
      sentLineIds: [],
      lines: [line({ id: "l1", sendable: false, fulfillment: "togo", state: "fired" })],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: false,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: false,
      },
    });
    serve(d);
    undo.mockResolvedValueOnce({ ok: true, unfired: 1 });
    mount(d, { counter: true, name: "Aye" });
    // The stash re-arms on a scheduled tick (its relabel commits as the timers drain); then past
    // the relabel's same-gesture hold before the tap.
    await flush();
    await flush(400);
    // MUTATION (p2f-cx4/pad/restored-undo-hidden-by-switch): gated on `sendable`, no Undo — red.
    const u = sendBtn();
    expect(u).not.toBeNull();
    expect(u.textContent).toContain(STAFF["table.send.undo"].en);
    await act(async () => {
      fireEvent.click(u);
    });
    await flush();
    expect(undo).toHaveBeenCalledWith({ sessionId: SESSION, batch: "b1" });
  });

  it("Codex r4 — pay at pickup PARKED and no undo open: drafts get no new Send", async () => {
    const d = counter({ payAtPickup: false });
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush(400);
    expect(document.querySelector(".staff-send")).toBeNull();
    expect(settleBtn().closest(".pad-dock-primary")).not.toBeNull();
  });

  it("everything went unpaid: 'Done · Counter' leads, Take payment second, the foot says so", async () => {
    const d = counter({
      unpaidSent: true,
      sentLineIds: ["l1"],
      droppedLineIds: [],
      compedKitchenLineIds: [],
      lines: [line({ id: "l1", sendable: false, fulfillment: "togo", state: "fired" })],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: false,
        counterDraft: 0,
        counterSentPastGrace: true,
      },
    });
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const done = primary().querySelector("button")!;
    expect(done.textContent).toBe(STAFF["pad.done.counter"].en);
    expect(done.className).toContain("ui-btn-primary");
    expect(settleBtn().closest(".pad-dock-settle")).not.toBeNull();
    expect(settleBtn().className).toContain("ui-btn-secondary");
    expect(document.querySelector(".pad-status")!.textContent).toBe(
      STAFF["table.send.counterSent"].en,
    );
    // The ticket's head carries the Unpaid flag.
    expect(document.querySelector(".pad-ticket-head")!.textContent).toContain(
      STAFF["settle.unpaid"].en,
    );
    fireEvent.click(done);
    expect(push).toHaveBeenCalledWith("/staff?floor=1");
  });

  it("sent unpaid with drafts LEFT under a parked switch: the foot names what is NOT sent", async () => {
    const d = counter({
      payAtPickup: false,
      unpaidSent: true,
      sentLineIds: ["l1"],
      droppedLineIds: [],
      compedKitchenLineIds: [],
      lines: [
        line({ id: "l1", sendable: false, fulfillment: "togo", state: "fired" }),
        line({ id: "l2", sendable: false, fulfillment: "togo", state: "draft", qty: 2 }),
      ],
      send: {
        sendable: 0,
        staffAdded: 0,
        togoDraft: 0,
        inKitchen: true,
        foodDraft: true,
        counterDraft: 2,
        counterSentPastGrace: true,
      },
    });
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    // Never "Sent to the kitchen" over two dishes the kitchen does not have.
    expect(document.querySelector(".pad-status")!.textContent).toBe(
      STAFF["table.send.counterSent.partial.many"].en.replace("{n}", "2"),
    );
  });

  it("a name typed but not saved is saved BEFORE the unpaid fire", async () => {
    const d = counter({ customerName: null });
    serve(d);
    const order: string[] = [];
    setName.mockImplementationOnce(async () => {
      order.push("name");
      return { ok: true };
    });
    fire.mockImplementationOnce(async () => {
      order.push("fire");
      return { ok: false, reason: "nothing" };
    });
    mount(d, { counter: true });
    await flush();
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "Aye" },
    });
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Aye" });
    expect(order).toEqual(["name", "fire"]);
  });

  it("a name save that fails holds the fire and says so", async () => {
    const d = counter({ customerName: null });
    serve(d);
    setName.mockResolvedValueOnce({ ok: false, error: "Couldn’t save." });
    mount(d, { counter: true });
    await flush();
    fireEvent.change(screen.getByLabelText(STAFF["browse.name.label"].en), {
      target: { value: "Aye" },
    });
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush();
    expect(fire).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.nameNotSaved"].en);
  });

  it("no name at all: the Send refuses, says why, and takes the finger to the name field", async () => {
    const d = counter({ customerName: null });
    serve(d);
    mount(d, { counter: true });
    await flush();
    const send = sendBtn();
    expect(send.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(send);
    });
    await flush();
    expect(fire).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["table.send.hold.noName"].en);
    expect(document.activeElement).toBe(screen.getByLabelText(STAFF["browse.name.label"].en));
  });

  it("the SERVER finds no name (cleared on another tablet): the name field takes the finger", async () => {
    const d = counter();
    serve(d); // this pad's reads still show the name — the fire's own statement is what finds none
    fire.mockResolvedValueOnce({ ok: false, reason: "noName" });
    mount(d, { counter: true, name: "Aye" });
    await flush();
    await act(async () => {
      fireEvent.click(sendBtn());
    });
    await flush();
    expect(fire).toHaveBeenCalledTimes(1);
    // MUTATION (p2f-cx3-name/pad-server-noName-no-focus): the verdict never reaches the field — red.
    expect(document.activeElement).toBe(screen.getByLabelText(STAFF["browse.name.label"].en));
    expect(region().textContent).toBe(STAFF["table.send.err.noName"].en);
  });

  it("a live read with the name CLEARED elsewhere empties a pristine field; the Send blocks", async () => {
    const d = counter();
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    expect(field.value).toBe("Aye");
    serve(counter({ customerName: null }));
    await flush(5000);
    // MUTATION (p2f-cx3-name/server-name-not-reconciled): the field keeps "Aye", the Send fires — red.
    expect(field.value).toBe("");
    expect(sendBtn().getAttribute("aria-disabled")).toBe("true");
  });

  it("a live read with the name cleared never clobbers a name being TYPED", async () => {
    const d = counter();
    serve(d);
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "Aye Aye" } });
    serve(counter({ customerName: null }));
    await flush(5000);
    // MUTATION (p2f-cx3-name/reconcile-clobbers-dirty): the typing is thrown away — red.
    expect(field.value).toBe("Aye Aye");
    expect(sendBtn().getAttribute("aria-disabled")).not.toBe("true");
  });

  it("a stale read that still shows NO name after this pad saved one does not revert it", async () => {
    // Phase 2f review (PT-7) — the stale read is made GENUINELY stale: it STARTS before the save and
    // answers after it. (This test once let a read that began AFTER the save play the stale one;
    // under PT-7 that read is authoritative, and a server with no name after the save means no name.)
    const d = counter({ customerName: null });
    serve(d);
    setName.mockResolvedValueOnce({ ok: true });
    mount(d, { counter: true });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    const stale = deferred<TableDetailResult>();
    getTableDetail.mockReturnValueOnce(stale.promise);
    await flush(5000); // the poll is on the wire, before the save
    fireEvent.change(field, { target: { value: "Aye" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Aye" });
    await act(async () => {
      stale.resolve({ kind: "detail", detail: d });
    });
    await flush();
    // MUTATION (p2f-cx3-name/reconcile-by-value · p2f-sr-sheet/pad-name/pre-save-read-boundary): the
    // pre-save read reverts the name to "" — red.
    expect(field.value).toBe("Aye");
    expect(sendBtn().getAttribute("aria-disabled")).not.toBe("true");
    // The first read that starts AFTER the save is the truth — the server holds the name.
    serve(counter({ customerName: "Aye" }));
    await flush(5000);
    expect(field.value).toBe("Aye");
  });

  it("after a save, the first read that STARTS after it is the truth — even the OLD name back (PT-7)", async () => {
    const d = counter(); // the server holds "Aye", and the pad has seen it
    serve(d);
    setName.mockResolvedValueOnce({ ok: true });
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "Bo" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "Bo" });
    expect(field.value).toBe("Bo");
    // Another device wrote "Aye" back after this save: the post-save read carries exactly the value
    // the pad had last seen — invisible to a change-keyed reconcile.
    await flush(5000);
    // MUTATION (p2f-sr-sheet/pad-name/save-never-arms · p2f-sr-sheet/pad-name/post-save-read-ignored):
    // the pad keeps showing "Bo" while every other surface says "Aye" — red.
    expect(field.value).toBe("Aye");
    expect(screen.getByRole("button", { name: STAFF["browse.name.saved"].en })).toBeTruthy();
  });

  it("the post-save read never clobbers a name being TYPED — only the saved name follows it (PT-7)", async () => {
    const d = counter();
    serve(d);
    setName.mockResolvedValueOnce({ ok: true });
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "Bo" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    await flush();
    fireEvent.change(field, { target: { value: "Bobo" } }); // typing again, not yet saved
    await flush(5000);
    expect(field.value).toBe("Bobo");
    // The saved name followed the server ("Aye"), so the typed "Bobo" is still offered as a Save.
    expect(screen.getByRole("button", { name: STAFF["browse.name.save"].en })).toBeTruthy();
  });

  it("?name=1 lands on the name field ONCE and drops the param", async () => {
    const d = counter({ customerName: null });
    serve(d);
    mount(d, { counter: true, focusName: true });
    await flush();
    expect(document.activeElement).toBe(screen.getByLabelText(STAFF["browse.name.label"].en));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/staff/table/S/add", { scroll: false });
  });

  it("clearing the name of an order cooking unpaid is refused: the pad's sentence, the name back", async () => {
    const d = counter({ unpaidSent: true });
    serve(d);
    setName.mockResolvedValueOnce({
      ok: false,
      error: "This order is cooking unpaid — keep a name on it so the counter can call it.",
      code: "keepName",
    });
    mount(d, { counter: true, name: "Aye" });
    await flush();
    const field = screen.getByLabelText<HTMLInputElement>(STAFF["browse.name.label"].en);
    fireEvent.change(field, { target: { value: "" } });
    await act(async () => {
      fireEvent.submit(field.closest("form")!);
    });
    await flush();
    expect(setName).toHaveBeenCalledWith({ sessionId: SESSION, name: "" });
    expect(region().textContent).toBe(STAFF["browse.name.keep"].en);
    expect(field.value).toBe("Aye");
  });
});

describe("PD6 · K39 — the walk-up cash sale never leaves the pad (m6 'Shape of the Sale')", () => {
  const OK = { ok: true as const, orderId: "o-00003f9a2c", totalCents: 1581, tipCents: 0 };
  const live = () =>
    [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].filter(
      (e) => !e.closest('[role="dialog"]'),
    );
  const openTray = async () => {
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(tray()).not.toBeNull();
  };
  const takeIt = async (chip: string) => {
    fireEvent.click(
      within(screen.getByRole("group", { name: STAFF["settle.a11y.cashQuick"].en })).getByRole(
        "button",
        { name: chip },
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Take \$/ }));
    });
    await flush();
  };

  it("Take cash → the till → Take: the seal stands where the pad was — stashed, focused, the poll paused, one region", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: counterPayable() });
    settleCash.mockResolvedValueOnce(OK);
    mount(counterPayable(), { counter: true });
    // One money verb end to end: the dock reads "Take cash · $15.81" (never "Take payment").
    expect(settleBtn().textContent).toBe(STAFF["settle.cash.trigger"].en.replace("{m}", "$15.81"));
    await openTray();
    await takeIt("$20");
    expect(settleCash).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION, tipCents: 0, quotedCents: 1581 }),
    );
    // 2000 − 1581 = 419 (node -e 'console.log(2000-1581)'); the #CODE is the order id's last six.
    const seal = screen.getByRole("region", { name: /Paid.*Change.*\$4\.19.*#3F9A2C/ });
    expect(document.activeElement).toBe(seal);
    expect(seal.hasAttribute("data-landing")).toBe(true);
    // The pad shell is UNMOUNTED, not hidden.
    expect(document.querySelector(".pad-shell")).toBeNull();
    expect(document.querySelector(".pad-skip")).toBeNull();
    // Codex correction 4 — the landing wrote the stash, tender and all (a same-tab reload adopts it).
    // MUTATION pad-seal/landing-never-stashed: a reload loses Cash received and Change; red.
    const stashed = JSON.parse(sessionStorage.getItem(handoffStashKey(SESSION))!);
    expect(stashed).toMatchObject({ orderId: OK.orderId, totalCents: 1581, tenderedCents: 2000 });
    // The poll is PAUSED under the seal: the session closing behind its settle never bounces it.
    getTableDetail.mockResolvedValue({ kind: "closed" });
    const before = getTableDetail.mock.calls.length;
    await flush(12_000);
    // MUTATION pad-seal/poll-never-paused: the next read is `closed` and the seal is yanked to the
    // floor mid-hand-back; red.
    expect(getTableDetail.mock.calls.length).toBe(before);
    expect(replace).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(seal);
    // The pad's ONE region survives with the seal (Walk-up's refusals are said there).
    expect(live()).toHaveLength(1);
    // Walk-up is the quiet secondary, described by its honest note; Back to the counter the hero.
    const walk = screen.getByRole("button", { name: /Walk-up/ });
    expect(walk.getAttribute("aria-describedby")).toBe("seal-walkup-note");
    expect(document.getElementById("seal-walkup-note")!.textContent).toBe(
      STAFF["table.detail.handoff.walkupNote"].en,
    );
    expect(screen.getByRole("link", { name: /Back to the counter/ }).className).toContain(
      "ui-btn-primary",
    );
  });

  it("a read already in the air when the seal goes up says nothing over it — its `closed` never bounces the seal", async () => {
    const inAir = deferred<TableDetailResult>();
    getTableDetail.mockResolvedValue({ kind: "detail", detail: counterPayable() });
    settleCash.mockResolvedValueOnce(OK);
    mount(counterPayable(), { counter: true });
    await openTray();
    // The 5s poll starts a read that hangs while the cashier counts.
    getTableDetail.mockReturnValueOnce(inAir.promise);
    await flush(5000);
    await takeIt("$20");
    expect(screen.getByRole("region", { name: /Paid/ })).toBeTruthy();
    // It answers AFTER the landing: the session closed behind the settle.
    await act(async () => {
      inAir.resolve({ kind: "closed" });
    });
    await flush();
    // MUTATION pad-seal/in-air-read-lands-on-the-seal: the late `closed` bounces the seal; red.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: /Paid/ })).toBeTruthy();
  });

  it("Walk-up on the seal starts the next order through the ONE mint lock and lands on its pad", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: counterPayable() });
    settleCash.mockResolvedValueOnce(OK);
    const NEXT = "22222222-2222-4222-8222-222222222222";
    openRegisterOrder.mockResolvedValueOnce({ ok: true, sessionId: NEXT, created: true });
    mount(counterPayable(), { counter: true });
    await openTray();
    await takeIt("$20");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Walk-up/ }));
    });
    await flush();
    expect(openRegisterOrder).toHaveBeenCalledWith({ kind: "walkup" });
    expect(push).toHaveBeenCalledWith(`/staff/table/${NEXT}/add`);
  });

  it("a refused settle, then Cancel: the pad's Toast says nothing was taken (graft 5); a plain cancel says nothing", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: counterPayable() });
    mount(counterPayable(), { counter: true });
    await openTray();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await flush();
    expect(region().textContent).not.toBe(STAFF["settle.cash.cancelClean"].en);
    settleCash.mockResolvedValueOnce({ ok: false, error: "Couldn’t.", code: "sentence" });
    await openTray();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Take \$/ }));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await flush();
    // MUTATION pad-seal/cancel-clean-unsaid: the hand-up never reaches the Toast; red.
    expect(region().textContent).toBe(STAFF["settle.cash.cancelClean"].en);
  });

  it("unpriced (m6 graft 2): the door reads bare 'Take cash', is held, and a tap says reload — no tray", async () => {
    const d = { ...counterPayable(), settleTotalCents: null, settleBreakdown: null };
    getTableDetail.mockResolvedValue({ kind: "detail", detail: d });
    mount(d, { counter: true });
    expect(settleBtn().textContent).toBe(STAFF["settle.cash.title"].en);
    expect(settleBtn().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("pad-settle-why")!.textContent).toBe(
      STAFF["pad.reason.unpriced"].en,
    );
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(tray()).toBeNull();
    expect(region().textContent).toBe(STAFF["pad.reason.unpriced"].en);
  });

  it("a counter settle whose answer was LOST, then a `closed` read: said in place, focused — never a bounce to the floor (§29's hold)", async () => {
    getTableDetail.mockResolvedValue({ kind: "detail", detail: counterPayable() });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    mount(counterPayable(), { counter: true });
    await openTray();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Take \$/ }));
    });
    await flush();
    // The settle may have landed: the session closes behind it.
    getTableDetail.mockResolvedValue({ kind: "closed" });
    await flush(6000);
    // MUTATION pad-seal/closed-unknown-bounces: the cashier is yanked to the floor over a payment
    // that most likely went through; red.
    expect(replace).not.toHaveBeenCalled();
    const notice = document.querySelector<HTMLElement>('[aria-labelledby="pad-settle-closed-h"]')!;
    expect(notice.textContent).toContain(STAFF["settle.cash.unknownClosed"].en);
    expect(document.activeElement).toBe(notice);
    expect(logged).toHaveBeenCalled();
  });
});
