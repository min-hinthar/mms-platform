/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";
import { fill } from "@/lib/i18n/fill";
import { resetHandBackDocumentForTests } from "@/lib/settled-view";
import { reloadHolds, resetHoldsForTests } from "@/lib/reload-guard";

/**
 * A4·3 · M204 · M183 — the settled list's WIRING, which has nowhere else to live: which lines get a
 * Refund control (the path, the status, the ledger flag and the offer all gate it), that every
 * control's name contains its visible label in both tongues (WCAG 2.5.3 — the A4·2 blind pass's
 * CRITICAL 2 was exactly this shape), and that the zone never speaks unprompted (no live region
 * until a Refund has been opened). The figures themselves are pinned by value in
 * `refund-console.test.ts` / `refunds.test.ts`; the row words in `settled-view.test.ts`.
 */
let refreshAnswer: unknown = { ok: false, reason: "outage" };
// Mutable so a test can make ONE refund succeed and the next one no-op — which is the whole subject
// of the two cash-banner cases below.
let refundAnswer: unknown = { ok: false, reason: "error" };
// Review a (A3) — how many reads the zone dispatched (a read from a DEAD zone is the defect).
let reads = 0;
vi.mock("@/lib/refunds", () => ({
  getSettledToday: () => {
    reads += 1;
    return Promise.resolve(refreshAnswer);
  },
  refundLine: () => Promise.resolve(refundAnswer),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { SettledToday } = await import("./SettledToday");

afterEach(() => {
  cleanup();
  refundAnswer = { ok: false, reason: "error" };
  // Phase 2i — a cash hand-back is kept in the tab until [Handed back]: never let one case's owed
  // instruction stand in the next case's banner.
  window.sessionStorage.clear();
  resetHandBackDocumentForTests(); // each case is a new document
  resetHoldsForTests();
});
/** The drawer instruction as the banner says it — `fill`ed, never transcribed. The subject is the
 *  dish and the receipt's code (`handBackSubjects`); every cash order here is `…aaaa0001`. */
const cashFor = (m: string, x = "Mohinga · AA0001") =>
  fill(STAFF["floor.settled.confirmed.cashFor"].en, { m, x }, "en");

const line = (id: string, over: Partial<SettledOrder["lines"][number]> = {}) => ({
  id,
  name: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  qty: 2,
  unitPriceCents: 1000,
  taxCents: 80,
  modifiers: ["Extra lime"],
  modifiersMy: [null],
  notes: null,
  fulfillment: "dinein",
  refundedCents: 0,
  refunded: false,
  offeredCents: 2100,
  offerClamped: false,
  ...over,
});
const order = (id: string, over: Partial<SettledOrder> = {}): SettledOrder => ({
  id,
  code: id.slice(-6).toUpperCase(),
  createdAt: "2026-09-13T18:41:00Z",
  settledAt: "11:41 AM",
  settledOn: null,
  refundedTodayAt: null,
  status: "paid",
  tender: "card",
  tableNumber: 4,
  customerName: null,
  pickupSlotAt: null,
  breakdown: {
    subtotalCents: 4000,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 300,
    tipCents: 700,
  },
  totalCents: 5000,
  refund: { state: "none", refundedCents: 0, netPaidCents: 5000 },
  refundPath: "app",
  remainingCents: 4300,
  lines: [line(`${id}-l1`), line(`${id}-l2`, { name: "Tea", nameMy: null, refunded: true })],
  ...over,
});
const snapshot = (orders: SettledOrder[], truncated = false): Snapshot => ({
  ok: true,
  orders,
  truncated,
  sinceIso: "2026-09-13T07:00:00.000Z",
  serverNow: "2026-09-13T19:00:00.000Z",
  serverClock: "12:00 PM",
});

function mount(initial: Snapshot, lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <SettledToday initial={initial} />
    </StaffLangProvider>,
  );
}

describe("SettledToday — the refund console, reading the receipt", () => {
  it("offers Refund on a line the order can still give back — card AND cash (M218), never dashboard", () => {
    const orders = [
      order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001"),
      // ⚠️ DISTINCT LINE NAMES, and that is the whole point of this fixture. The accessible name is
      // verb + line name, so with every order's line called "Mohinga" the assertion below could not
      // tell WHICH two orders offered a Refund — inverting the gate to `!== "cash"` would swap the
      // cash order for the dashboard one and still produce two identical labels (LEARNINGS #60: a
      // count satisfied without the behaviour).
      order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", {
        tender: "cash",
        refundPath: "cash",
        lines: [line("b-l1", { name: "Nan Gyi Thoke" })],
      }),
      order("cccccccc-cccc-4ccc-8ccc-cccccccc0003", {
        refundPath: "dashboard",
        lines: [line("c-l1", { name: "Shan Noodle" })],
      }),
      order("dddddddd-dddd-4ddd-8ddd-dddddddd0004", {
        status: "refunded",
        refund: { state: "full", refundedCents: 5000, netPaidCents: 0 },
      }),
      order("eeeeeeee-eeee-4eee-8eee-eeeeeeee0005", {
        remainingCents: 0,
        lines: [line("e-l1", { offeredCents: 0, offerClamped: true })],
      }),
    ];
    mount(snapshot(orders));
    for (const b of screen.getAllByRole("button", { expanded: false })) fireEvent.click(b);
    const refunds = screen.getAllByRole("button", { name: /^Refund — / });
    // Order A: line 1 only (line 2 is in the ledger). B is CASH and now offers one too — M218 made
    // the drawer hand-back recordable, so withholding the control would be the screen refusing to
    // write down money that already moved. C (dashboard — each payer's charge lives elsewhere),
    // D (refunded) and E (pool spent) still offer nothing.
    expect(refunds.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Refund — Mohinga", // A, the card order
      "Refund — Nan Gyi Thoke", // B, the CASH order — named, so the dashboard order cannot stand in
    ]);
    // The cash note STAYS: the app records the refund, it cannot open the drawer.
    expect(screen.getByText(STAFF["floor.settled.path.cash"].en)).toBeTruthy();
    expect(screen.getByText(/Paid by more than one card/)).toBeTruthy();
    expect(screen.getByText(STAFF["floor.settled.path.exhausted"].en)).toBeTruthy();
  });

  it("under my, every control's name contains BOTH visible strings (WCAG 2.5.3), and the list is named", () => {
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")]), "my");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const refund = screen.getByRole("button", { name: /Mohinga/ });
    const name = refund.getAttribute("aria-label")!;
    expect(name).toContain(STAFF["floor.settled.verb.refund"].my);
    expect(name).toContain(STAFF["floor.settled.verb.refund"].en);
    expect(refund.textContent).toContain(STAFF["floor.settled.verb.refund"].my);
    expect(screen.getByRole("list", { name: STAFF["floor.settled.a11y.list"].my })).toBeTruthy();
    // The Burmese half of the line, from the live catalog, beneath the English snapshot.
    expect(screen.getByText("မုန့်ဟင်းခါး")).toBeTruthy();
  });

  it("the expanded order IS the receipt: its rows, its status line, the refunded line's mark", () => {
    const o = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", {
      refund: { state: "partial", refundedCents: 1800, netPaidCents: 3200 },
      lines: [line("l1"), line("l2", { name: "Tea", refunded: true, refundedCents: 1800 })],
    });
    mount(snapshot([o]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const rows = screen.getByRole("list", { name: STAFF["floor.settled.a11y.rows"].en });
    expect(
      within(rows)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Subtotal$40.00",
      "Tax$3.00",
      "Tip$7.00",
      "Total$50.00",
      "Refunded−$18.00",
      "Guest paid$32.00",
    ]);
    expect(screen.getByText("Partly refunded · Card")).toBeTruthy();
    expect(screen.getByText(/\$18\.00 refunded/)).toBeTruthy();
    // The collapsed chip said so too, before the tap.
    expect(screen.getByText("Partly refunded")).toBeTruthy();
  });

  /**
   * M218 (Codex round 3 on #286, P1) — the cash banner is an IMPERATIVE, and the two cases below are
   * the ways a stale one gets a guest paid twice or not at all.
   *
   * Under record-first the banner no longer reports a hand-back that happened; it asks for one, and
   * it carries the only copy of the server-clamped figure. Every state transition that leaves the
   * old text standing is therefore a money defect, not a cosmetic one.
   */
  const openAndRefund = async (name = "Refund — Mohinga") => {
    fireEvent.click(screen.getByRole("button", { name }));
    const submit = screen.getByRole("button", { name: /^Refund \$/ });
    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByLabelText(/PIN/)).toBeNull());
  };

  it("a NO-OP clears the card confirmation — it never re-reports the last one's amount", async () => {
    const card = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001");
    refreshAnswer = snapshot([card]);
    mount(snapshot([card]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    refundAnswer = { ok: true, amountCents: 1105 };
    await openAndRefund();
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["floor.settled.confirmed"].en.replace("{m}", "$11.05"),
    );

    // A second attempt the server refuses: already refunded, nothing recorded, no amount returned.
    // The card stays expanded across the refresh, so the Refund control is already in reach — which
    // is precisely the stale board this case is about.
    refundAnswer = { ok: false, reason: "already_refunded" };
    await openAndRefund();
    // MUTATION (settled/a-no-op-re-issues-the-last-instruction): "Refunded $11.05" over an attempt
    // that moved no money; red.
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("Phase 2i (D5) — a NO-OP leaves an owed hand-back standing: it names its own dish and waits for its own [Handed back]", async () => {
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    refreshAnswer = snapshot([cash]);
    mount(snapshot([cash]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAnswer = { ok: true, amountCents: 1105 };
    await openAndRefund();
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05"));
    refundAnswer = { ok: false, reason: "already_refunded" };
    await openAndRefund();
    // The drawer still owes the guest $11.05 — nothing about this no-op changed that.
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05"));
  });

  it("the cash instruction takes focus even when the post-write refresh FAILS — the refund recorded either way", async () => {
    // ⚠️ THE REFRESH DIES HERE, and the refund still succeeded. `refresh()` calls `setSnap` only on
    // a good answer — an outage keeps the last good list and sets `stale` — so keying this focus to
    // `snap` made the instruction depend on a read landing (Codex round 4 on #286, P1). The money is
    // recorded; the manager has to be told to hand it over whatever the next read does.
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    refreshAnswer = { ok: false, reason: "outage" };
    mount(snapshot([cash]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    refundAnswer = { ok: true, amountCents: 1105 };
    await openAndRefund();

    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(cashFor("$11.05"));
    // The instruction has focus, so it is in view and announced — not sitting above a fold the
    // manager never scrolls back to.
    expect(document.activeElement).toBe(banner);
  });

  it("opening a new Refund clears the previous CARD confirmation before the manager can act on it", async () => {
    const card = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001");
    refreshAnswer = snapshot([card]);
    mount(snapshot([card]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    refundAnswer = { ok: true, amountCents: 1105 };
    await openAndRefund();
    expect(screen.getByRole("status").textContent).toContain("$11.05");

    // Opening the next sheet clears it, and BACKING OUT is what makes that visible: the manager
    // changed their mind, and must not be left standing in front of the previous line's imperative.
    fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByLabelText(/PIN/)).toBeNull());
    // ⚠️ The assertion waits for the sheet to GO. While it is open the dialog `aria-hidden`s the
    // page behind it, so the banner is out of the a11y tree entirely and a query here reads the
    // sheet's own empty error region instead — passing however the banner behaves. The first draft
    // of this case did exactly that, and the mutation that deletes the clear SURVIVED it.
    // MUTATION (settled/a-new-attempt-inherits-the-last-figure): red.
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("never speaks unprompted: no live region until a Refund is opened; counts and the cap are plain text", () => {
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")], true));
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByText(new RegExp(STAFF["floor.settled.count.one"].en.replace("{n}", "1"))),
    ).toBeTruthy();
    expect(screen.getByText(/the newest 50/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
    // The sheet is a MODAL (Radix hides the page behind it), so a status found while it is open is
    // the sheet's own error region, not the zone's (blind pass on A4·3). Cancel it, then look: the
    // zone's region is armed from that first tap on, and it is the only one left.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const zoneStatus = screen.getAllByRole("status");
    expect(zoneStatus).toHaveLength(1);
    expect(zoneStatus[0]!.closest("section")?.getAttribute("aria-labelledby")).toBe("settled-h");
  });

  it("a refresh that answers `outage` keeps the last good list and says when it is from — never an empty day over money just moved (blind pass on A4·3, CRITICAL 2)", async () => {
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")]));
    refreshAnswer = { ok: false, reason: "outage" };
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Couldn’t refresh/);
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy(); // the order is still here
    expect(screen.queryByText(STAFF["floor.settled.outage"].en)).toBeNull();
    // A good answer then replaces the list and clears the line. Wait for the control to re-arm
    // first: a tap on a still-busy (aria-disabled) button is refused by its handler (LEARNINGS #108).
    refreshAnswer = snapshot([]);
    const refreshBtn = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    await waitFor(() => expect(refreshBtn.getAttribute("aria-disabled")).toBeNull());
    expect(refreshBtn.disabled).toBe(false); // Phase 2h — never native `disabled` (§17)
    fireEvent.click(refreshBtn);
    await screen.findByText(STAFF["floor.settled.none"].en);
    await waitFor(() => expect(screen.queryByText(/Couldn’t refresh/)).toBeNull());
  });

  it("a failed refresh dates the list by the last GOOD read, never by the moment it failed (Codex round 1 on #283)", async () => {
    // The snapshot is from 19:00Z; the refresh fails "now". The line must name the snapshot's
    // instant — the list it is showing — not the failure's, which would claim an hours-old list
    // current through the present. And in the SERVICE zone, like every clock beside it (Codex
    // round 4 on #283): the server formats it (`serverClock`), the tablet's zone never does.
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")]));
    refreshAnswer = { ok: false, reason: "outage" };
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const line = await screen.findByText(/Couldn’t refresh/);
    expect(line.textContent).toContain("as of 12:00 PM");
  });

  it("an earlier day's order refunded today shows the day it was paid and the refund's own time (Codex round 1 on #283)", () => {
    mount(
      snapshot([
        order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", {
          settledOn: "Sep 12",
          refundedTodayAt: "11:50 AM",
          refund: { state: "partial", refundedCents: 2100, netPaidCents: 2900 },
        }),
        order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002"),
      ]),
    );
    expect(screen.getByText(/Sep 12, 11:41 AM/)).toBeTruthy();
    expect(screen.getByText(/refunded 11:50 AM/)).toBeTruthy();
    // A paid-today row keeps the bare clock.
    expect(screen.getAllByText(/11:41 AM/).length).toBe(2);
  });

  it("a pickup slot renders the server's zoned clock verbatim — no re-formatting on the tablet (Codex round 2 on #283)", () => {
    mount(
      snapshot([
        order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", {
          tableNumber: null,
          pickupSlotAt: "12:30 PM",
        }),
      ]),
    );
    expect(screen.getByText(/Pickup at 12:30 PM/)).toBeTruthy();
  });

  it("a same-page jump to the zone's fragment moves focus to its heading, not only the scroll (Codex round 1 on #283)", async () => {
    mount(snapshot([]));
    expect(document.activeElement?.id).not.toBe("settled-h");
    window.location.hash = "#settled-h";
    await waitFor(() => expect(document.activeElement?.id).toBe("settled-h"));
    window.location.hash = "";
  });

  it("takes focus on arrival by the folded route's fragment (WCAG 2.4.3)", () => {
    window.location.hash = "#settled-h";
    mount(snapshot([]));
    expect(document.activeElement?.id).toBe("settled-h");
    window.location.hash = "";
  });

  it("an outage renders the zone's honest line with Refresh — never an empty day; forbidden renders nothing", () => {
    mount({ ok: false, reason: "outage" });
    expect(screen.getByText(STAFF["floor.settled.outage"].en)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.queryByText(STAFF["floor.settled.none"].en)).toBeNull();
    cleanup();
    const { container } = mount({ ok: false, reason: "forbidden" });
    expect(container.textContent).toBe("");
  });
});

/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };
/** A stylesheet's answer for the sheet and its scrim: an exit animation once `data-state` is
 *  closed. With it, a CLOSED sheet is held until `animationend` — so "still there after close"
 *  proves the parent kept it mounted (SheetExit.test.tsx has the full fixture). */
function stubComputedStyle() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const node = el as HTMLElement;
    if (!node.classList?.contains("mms-sheet") && !node.classList?.contains("mms-scrim"))
      return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "animationName")
          return node.getAttribute("data-state") === "closed" ? "exit" : "enter";
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  });
}
function animationEnd(el: Element) {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: "exit" });
  el.dispatchEvent(ev);
}

describe("M76 — the refund sheet is HELD through its exit", () => {
  it("closing keeps the dialog mounted, `data-state=closed`, until its exit animation ends", async () => {
    stubComputedStyle();
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: /Mohinga/ }));
    const dialog = screen.getByRole("dialog", { name: /Refund Mohinga/ });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    // MUTATION: mount it as `{refunding && …}` again — the dialog is gone here; red.
    expect(screen.queryByRole("dialog")).toBe(dialog);
    expect(dialog.getAttribute("data-state")).toBe("closed");
    await act(async () => {
      animationEnd(dialog);
      animationEnd(document.querySelector(".mms-scrim")!);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("Phase 2h · integration b — a refund's LATE answer closes only its OWN line's sheet", () => {
  type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
  function deferred<T>(): Deferred<T> {
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

  it("a refund answered after the manager moved to ANOTHER line's sheet confirms its figure and leaves that sheet open", async () => {
    vi.useFakeTimers();
    try {
      const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
      const a = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001");
      const b = order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", {
        lines: [line("bbbbbbbb-l1", { name: "Laphet", nameMy: null })],
      });
      refreshAnswer = snapshot([a, b]);
      const late = deferred<unknown>();
      refundAnswer = late.promise;
      mount(snapshot([a, b]));
      for (const toggle of screen.getAllByRole("button", { expanded: false }))
        fireEvent.click(toggle);
      // Line A's refund is sent, and has no answer at the bound: the sheet frees and says so.
      fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
      fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
      fireEvent.click(screen.getByRole("button", { name: /^Refund \$/ }));
      await flush(STAFF_HANG_MS);
      expect(screen.getByRole("dialog").textContent).toContain(
        STAFF["floor.refund.waiting"].en.slice(0, 20),
      );
      // The manager puts A's sheet away and opens line B's.
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await flush();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Refund — Laphet" }));
      await flush();
      const bSheet = screen.getByRole("dialog", { name: /Refund Laphet/ });
      // A's refund lands late — through A's tap-time `onDone`.
      await act(async () => {
        late.resolve({ ok: true, amountCents: 1105 });
        await vi.advanceTimersByTimeAsync(0);
      });
      // MUTATION (p2h-int-b/settled/late-done-closes-any-sheet · p2h-int-b/settled/after-answer-closes-any):
      // A's late ok closes WHICHEVER sheet is open — B's, with the manager mid-way through it; red.
      expect(screen.queryByRole("dialog")).toBe(bSheet);
      expect(bSheet.getAttribute("data-state")).toBe("open");
      // A's figure is still confirmed (the zone's banner, behind the open sheet).
      const banner = document.querySelector<HTMLElement>('p[role="status"][tabindex="-1"]');
      expect(banner?.textContent).toContain("$11.05");
    } finally {
      vi.useRealTimers();
    }
  });

  it("critic S1 — a CASH refund answered late under ANOTHER line's sheet closes it: the hand-back instruction takes focus, never hidden", async () => {
    vi.useFakeTimers();
    try {
      const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
      const a = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
      const b = order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", {
        lines: [line("bbbbbbbb-l1", { name: "Laphet", nameMy: null })],
      });
      refreshAnswer = snapshot([a, b]);
      const late = deferred<unknown>();
      refundAnswer = late.promise;
      mount(snapshot([a, b]));
      for (const toggle of screen.getAllByRole("button", { expanded: false }))
        fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
      fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
      fireEvent.click(screen.getByRole("button", { name: /^Refund \$/ }));
      await flush(STAFF_HANG_MS);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Refund — Laphet" }));
      await flush();
      const bSheet = screen.getByRole("dialog", { name: /Refund Laphet/ });
      await act(async () => {
        late.resolve({ ok: true, amountCents: 1105 });
        await vi.advanceTimersByTimeAsync(0);
      });
      // MUTATION (p2h-int-b/settled/hand-back-keeps-other-sheet · hand-back-never-computed): B's
      // sheet stays open over the instruction — aria-hidden behind it, its focus taken back by the
      // sheet's trap, and nothing re-tries when B closes; red.
      expect(bSheet.getAttribute("data-state")).toBe("closed");
      const banner = document.querySelector<HTMLElement>('p[role="status"][tabindex="-1"]')!;
      expect(banner.textContent).toBe(cashFor("$11.05"));
      expect(banner.closest('[aria-hidden="true"]')).toBeNull();
      expect(document.activeElement).toBe(banner);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a refund answered late while its OWN sheet is still open closes that sheet, as an on-time one does", async () => {
    vi.useFakeTimers();
    try {
      const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
      const a = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001");
      refreshAnswer = snapshot([a]);
      const late = deferred<unknown>();
      refundAnswer = late.promise;
      mount(snapshot([a]));
      fireEvent.click(screen.getByRole("button", { expanded: false }));
      fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
      fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
      fireEvent.click(screen.getByRole("button", { name: /^Refund \$/ }));
      await flush(STAFF_HANG_MS);
      expect(screen.queryByRole("dialog")).not.toBeNull();
      await act(async () => {
        late.resolve({ ok: true, amountCents: 1105 });
        await vi.advanceTimersByTimeAsync(0);
      });
      // MUTATION (p2h-int-b/settled/after-answer-closes-nothing): a landed refund's own sheet
      // stays up over a line the ledger already holds; red.
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Phase 2h · review a — a refund's LATE answer after the zone is GONE (A2 · A3)", () => {
  type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
  function deferred<T>(): Deferred<T> {
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
  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  /** A refund of `o`'s Mohinga line sent, no answer at the bound, the zone then unmounted. */
  async function sendThenLeave(o: SettledOrder) {
    const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
    refreshAnswer = snapshot([o]);
    const late = deferred<unknown>();
    refundAnswer = late.promise;
    mount(snapshot([o]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /^Refund \$/ }));
    await flush(STAFF_HANG_MS);
    cleanup(); // the manager moved to another screen — the zone is gone
    return late;
  }

  it("A3 — a late answer after the zone unmounted dispatches NO read from the dead zone", async () => {
    vi.useFakeTimers();
    const late = await sendThenLeave(order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001"));
    const before = reads;
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1105 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2h-rev-a/settled/refresh-unguarded): the late onDone's re-read is sent from a
    // zone that can show nothing — one more action in the tab's one-at-a-time queue; red.
    expect(reads).toBe(before);
  });

  it("A2 · 2i — a CASH hand-back answered after the zone unmounted is said, with focus, every time the zone mounts until [Handed back]", async () => {
    vi.useFakeTimers();
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    const late = await sendThenLeave(cash);
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1105 });
      await vi.advanceTimersByTimeAsync(0);
    });
    mount(snapshot([cash])); // the manager comes back (a navigation or a reload of this tab)
    await flush();
    const banner = document.querySelector<HTMLElement>('p[role="status"][tabindex="-1"]');
    // MUTATION (p2h-rev-a/settled/dead-hand-back-dropped · p2h-rev-a/settled/hand-back-never-said):
    // the only copy of "hand back $11.05" died with the unmounted zone; red.
    expect(banner?.textContent).toBe(cashFor("$11.05"));
    // MUTATION (p2h-rev-a/settled/recovered-unfocused): said below the fold to nobody; red.
    expect(document.activeElement).toBe(banner);
    // Phase 2i (D5) — a new attempt does NOT clear it (it names its dish; Codex r3 #286's stale
    // imperative is answered by the name and its own acknowledgement).
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    // MUTATION (p2i-handback/cleared-on-new-attempt): the instruction is gone before anyone opened
    // the drawer; red.
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05"));
    // Not acknowledged: the next mount says it again.
    cleanup();
    mount(snapshot([cash]));
    await flush();
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05"));
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("");
    cleanup();
    mount(snapshot([cash]));
    await flush();
    // Acknowledged: the next mount does not ask for the same money again.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("2i — a late answer reaches a zone that mounted AFTER its refund was sent: said at once, with focus", async () => {
    vi.useFakeTimers();
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    const late = await sendThenLeave(cash);
    mount(snapshot([cash])); // back BEFORE the answer: this mount's own peek finds nothing yet
    await flush();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1105 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2i-handback/late-unheard): the record holds it, the screen in front of the manager
    // says nothing until some later mount; red.
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(cashFor("$11.05"));
    expect(document.activeElement).toBe(banner);
  });

  it("critic F5 — a late answer heard by a NEWER mount closes the sheet open there: the instruction is never said under it", async () => {
    vi.useFakeTimers();
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    const late = await sendThenLeave(cash);
    const b = order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", {
      lines: [line("bbbbbbbb-l1", { name: "Laphet", nameMy: null })],
    });
    refreshAnswer = snapshot([cash, b]);
    mount(snapshot([cash, b])); // back before the answer, and opens ANOTHER line's refund
    await flush();
    for (const toggle of screen.getAllByRole("button", { expanded: false }))
      fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Refund — Laphet" }));
    await flush();
    const bSheet = screen.getByRole("dialog", { name: /Refund Laphet/ });
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1105 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2i-handback/late-under-sheet): only the answering (dead) zone's closure closes a
    // sheet — this mount's stays open over the instruction, aria-hidden behind it, its focus taken
    // back by the sheet's trap; red.
    expect(bSheet.getAttribute("data-state")).toBe("closed");
    const banner = document.querySelector<HTMLElement>('p[role="status"][tabindex="-1"]')!;
    expect(banner.textContent).toBe(cashFor("$11.05"));
    expect(banner.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.activeElement).toBe(banner);
  });

  it("critic F1 · F2 — storage refused AND answered after the zone unmounted: the next mount still says it, and an automatic reload waits until [Handed back]", async () => {
    vi.useFakeTimers();
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    const late = await sendThenLeave(cash);
    const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      await act(async () => {
        late.resolve({ ok: true, amountCents: 1105 });
        await vi.advanceTimersByTimeAsync(0);
      });
      // The only copy is in memory: a reload would erase it, so the automatic one waits.
      expect(reloadHolds().map((h) => [h.kind, h.reason])).toEqual([["unread", "handBack"]]);
      mount(snapshot([cash]));
      await flush();
      // MUTATION (p2i-handback/memory-unsaid): the late answer's instruction lived in the dead
      // zone's memory — no banner anywhere, the money recorded as refunded; red.
      const banner = screen.getByRole("status");
      expect(banner.textContent).toBe(cashFor("$11.05"));
      expect(document.activeElement).toBe(banner);
      fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
      await flush();
      expect(screen.getByRole("status").textContent).toBe("");
      expect(reloadHolds()).toEqual([]);
    } finally {
      refused.mockRestore();
    }
  });

  it("2i — a card refund is never kept as a drawer instruction", async () => {
    vi.useFakeTimers();
    const card = await sendThenLeave(order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002"));
    await act(async () => {
      card.resolve({ ok: true, amountCents: 1300 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // MUTATION (p2h-rev-a/settled/card-kept-as-hand-back): a card refund asks for drawer cash; red.
    expect(window.sessionStorage.getItem("mms.staff.refund.handBack")).toBeNull();
  });
});
