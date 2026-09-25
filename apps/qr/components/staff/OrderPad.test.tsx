/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import type { TableDetail, TableDetailResult, TableLineView } from "@/lib/floor-types";
import type { StaffFireResult } from "@/lib/staff-send-view";
import type { StaffWriteResult } from "@/lib/staff-cart";
import type { PadCatalogItem } from "@/lib/order-pad";

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
vi.mock("@/lib/staff-cart", () => ({
  staffAddItem: (raw: unknown) => addItem(raw),
  staffSetQty: (id: string, raw: unknown) => setQty(id, raw),
  setLineNotes: vi.fn(() => Promise.resolve({ ok: true })),
}));
const setName = vi.fn<(raw: unknown) => Promise<{ ok: true } | { ok: false; error: string }>>();
vi.mock("@/lib/register", () => ({ setCartCustomerName: (raw: unknown) => setName(raw) }));
const fire = vi.fn<(raw: unknown) => Promise<StaffFireResult>>();
vi.mock("@/lib/staff-send", () => ({
  staffFireCart: (raw: unknown) => fire(raw),
  staffUndoFire: vi.fn(),
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => "/staff/table/S/add",
}));
vi.mock("./StaffBar", () => ({ StaffBar: () => <header data-testid="bar" /> }));

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
    paymentHolder: null,
    hostPresent: false,
    send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: false, foodDraft: false },
    serverNow: new Date(T).toISOString(),
    ...over,
  };
}
/** The table after one Mohinga landed. */
const ONE = () =>
  detail({
    lines: [line({ id: "l1" })],
    itemCount: 1,
    runningSubtotalCents: 1450,
    settleTotalCents: 1581,
    send: { sendable: 1, staffAdded: 1, togoDraft: 0, inKitchen: false, foodDraft: true },
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
    runningSubtotalCents: 1450,
    settleTotalCents: 1581,
    send: { sendable: 0, staffAdded: 0, togoDraft: 1, inKitchen: false, foodDraft: true },
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
  opts: { lang?: "en" | "my"; counter?: boolean; catalog?: unknown } = {},
) {
  return render(
    <StaffLangProvider lang={opts.lang ?? "en"}>
      <main>
        <OrderPad
          sessionId={SESSION}
          initialDetail={initial}
          catalog={(opts.catalog ?? CATALOG) as never}
          counterOrder={opts.counter ?? false}
          initialName={null}
          hasPin={false}
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
const receipt = () => document.querySelector(".pad-receipt-amt")!.textContent;
const sendBtn = () => document.querySelector<HTMLButtonElement>(".pad-dock .staff-send button")!;
const settleBtn = () => document.querySelector<HTMLButtonElement>(".pad-settle button")!;
const region = () => document.querySelector<HTMLElement>(".ui-toast-region")!;

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
  it("a quick-add tap writes ONE add {qty 1, no modifiers, a uuid key}, draws a ghost and says '—'", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount();
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
    // The ghost row — "Adding…", never a price — and the subtotal withholds its figure (§23).
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0]!.textContent).toContain(STAFF["pad.ghost.adding"].en);
    expect(ghosts()[0]!.textContent).not.toContain("$");
    expect(receipt()).toBe("—");
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
    expect(receipt()).toBe("$14.50");
    expect(mohinga().textContent).toContain("×1");
  });

  it("the view has exactly ONE live region, ONE ticket, and no natively disabled button", async () => {
    addItem.mockReturnValue(new Promise(() => {}));
    mount(detail({ paymentInFlight: false }));
    const live = () =>
      [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].filter(
        (e) => !e.closest('[role="dialog"]'),
      );
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

  it("Take payment is accepted while an add flies, drains it, then goes to the table's payment section", async () => {
    const add = deferred<StaffWriteResult>();
    addItem.mockReturnValueOnce(add.promise);
    mount(payable());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    // Enabled (never refused for a flying add), and names no stale sum.
    expect(settleBtn().getAttribute("aria-disabled")).toBeNull();
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.bare"].en);
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(settleBtn().getAttribute("aria-busy")).toBe("true");
    // MUTATION: navigating before the drain; red.
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      add.resolve({ ok: true });
    });
    await flush();
    expect(push).toHaveBeenCalledWith(`/staff/table/${SESSION}?settle=1`);
  });

  it("with nothing pending, Take payment names the server's total", () => {
    mount(ONE());
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$15.81"));
  });
});

describe("a counter order — no Send; the kitchen starts it when it's paid", () => {
  it("shows counterAtPay, no Send, and Take payment as the one primary", () => {
    mount(
      detail({
        label: "reg-ab12",
        tableNumber: null,
        mode: "pickup",
        lines: [line({ id: "l1", sendable: false })],
        itemCount: 1,
        runningSubtotalCents: 1450,
        settleTotalCents: 1581,
        send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: false, foodDraft: true },
      }),
      { counter: true },
    );
    expect(document.querySelector(".staff-send")).toBeNull();
    expect(document.body.textContent).toContain(STAFF["table.send.counterAtPay"].en);
    expect(settleBtn().className).toContain("ui-btn-primary");
    expect(settleBtn().closest(".pad-dock-primary")).not.toBeNull();
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
    expect(push).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.nameNotSaved"].en);
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    await flush();
    expect(setName).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/staff/table/${SESSION}?settle=1`);
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
      runningSubtotalCents: 2900,
      settleTotalCents: 3162,
      send: { sendable: 2, staffAdded: 2, togoDraft: 0, inKitchen: false, foodDraft: true },
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
        lines: [line({ id: "l1", sendable: false })],
        itemCount: 1,
        runningSubtotalCents: 1450,
        settleTotalCents: 1581,
        send: { sendable: 0, staffAdded: 0, togoDraft: 0, inKitchen: false, foodDraft: true },
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
    mount(payable());
    await act(async () => {
      fireEvent.click(mohinga());
    });
    await act(async () => {
      fireEvent.click(settleBtn());
    });
    // The note editor is ON the ticket; staff type while the button waits.
    const field = await openNote();
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
        send: { sendable: 1, staffAdded: 1, togoDraft: 0, inKitchen: false, foodDraft: true },
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

  it("an add on its way: 'Waiting for the last dish…' while it drains", async () => {
    addItem.mockReturnValueOnce(new Promise(() => {}));
    mount(payable());
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
  it("a quantity change: '—' while it saves AND until a read that started after it commits", async () => {
    const write = deferred<StaffWriteResult>();
    setQty.mockReturnValueOnce(write.promise);
    const read = deferred<TableDetailResult>();
    mount(ONE());
    await flush(400);
    expect(receipt()).toBe("$14.50");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Mohinga quantity" }));
    });
    // MUTATION: amounts blind to line writes — "$14.50" beside a quantity of 2; red.
    expect(receipt()).toBe("—");
    expect(settleBtn().textContent).toBe(STAFF["pad.settle.bare"].en);
    getTableDetail.mockReturnValueOnce(read.promise);
    await act(async () => {
      write.resolve({ ok: true });
    });
    await flush();
    // Answered, but the read that shows it has not committed: still no figure.
    expect(receipt()).toBe("—");
    await act(async () => {
      read.resolve({
        kind: "detail",
        detail: {
          ...ONE(),
          lines: [line({ id: "l1", qty: 2 })],
          itemCount: 2,
          runningSubtotalCents: 2900,
          settleTotalCents: 3162,
        },
      });
    });
    await flush();
    expect(receipt()).toBe("$29.00");
    expect(settleBtn().textContent).toBe(STAFF["pad.settle"].en.replace("{m}", "$31.62"));
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
      runningSubtotalCents: 2900,
      settleTotalCents: 3162,
      send: { sendable: 2, staffAdded: 2, togoDraft: 0, inKitchen: false, foodDraft: true },
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
