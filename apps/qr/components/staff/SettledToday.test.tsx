/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/lib/refunds", () => ({
  getSettledToday: () => Promise.resolve(refreshAnswer),
  refundLine: () => Promise.resolve({ ok: false, reason: "error" }),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { SettledToday } = await import("./SettledToday");

afterEach(cleanup);

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
  status: "paid",
  tender: "card",
  tableNumber: 4,
  customerName: null,
  pickupSlot: null,
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
});

function mount(initial: Snapshot, lang: "en" | "my" = "en") {
  return render(
    <StaffLangProvider lang={lang}>
      <SettledToday initial={initial} />
    </StaffLangProvider>,
  );
}

describe("SettledToday — the refund console, reading the receipt", () => {
  it("offers Refund only on a line the order can still give back: in-app path · paid · not in the ledger · a non-zero offer", () => {
    const orders = [
      order("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001"),
      order("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", { tender: "cash", refundPath: "cash" }),
      order("cccccccc-cccc-4ccc-8ccc-cccccccc0003", { refundPath: "dashboard" }),
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
    // Order A: line 1 only (line 2 is in the ledger). B (cash), C (dashboard), D (refunded) and
    // E (pool spent) offer nothing.
    expect(refunds.map((b) => b.getAttribute("aria-label"))).toEqual(["Refund — Mohinga"]);
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
