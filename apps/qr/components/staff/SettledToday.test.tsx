/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";

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
vi.mock("@/lib/refunds", () => ({
  getSettledToday: () => Promise.resolve(refreshAnswer),
  refundLine: () => Promise.resolve(refundAnswer),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { SettledToday } = await import("./SettledToday");

afterEach(() => {
  cleanup();
  refundAnswer = { ok: false, reason: "error" };
});

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

  it("a NO-OP clears the cash instruction — it never re-issues the last one's amount", async () => {
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    refreshAnswer = snapshot([cash]);
    mount(snapshot([cash]));
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    refundAnswer = { ok: true, amountCents: 1105 };
    await openAndRefund();
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("$11.05");
    expect(banner.textContent).toContain("hand back");

    // A second attempt the server refuses: already refunded, nothing recorded, no amount returned.
    // The card stays expanded across the refresh, so the Refund control is already in reach — which
    // is precisely the stale board this case is about.
    refundAnswer = { ok: false, reason: "already_refunded" };
    await openAndRefund();
    // ⚠️ The old imperative must be GONE. Left standing it reads "now hand back $11.05" over an
    // attempt that moved no money, and a manager following it pays the first refund twice.
    expect(screen.getByRole("status").textContent).toBe("");
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
    expect(banner.textContent).toContain("$11.05");
    expect(banner.textContent).toContain("hand back");
    // The instruction has focus, so it is in view and announced — not sitting above a fold the
    // manager never scrolls back to.
    expect(document.activeElement).toBe(banner);
  });

  it("opening a new Refund clears the previous instruction before the manager can act on it", async () => {
    const cash = order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", { refundPath: "cash" });
    refreshAnswer = snapshot([cash]);
    mount(snapshot([cash]));
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
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("never speaks unprompted: no live region until a Refund is opened; counts and the cap are plain text", () => {
    mount(snapshot([order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")], true));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/1 settled/)).toBeTruthy();
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
    // A good answer then replaces the list and clears the line. Wait for the control to re-enable
    // first: a click on a still-pending (disabled) button is a silent no-op (LEARNINGS #108).
    refreshAnswer = snapshot([]);
    const refreshBtn = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    await waitFor(() => expect(refreshBtn.disabled).toBe(false));
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
