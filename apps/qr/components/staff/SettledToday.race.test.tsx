/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";

/**
 * A4·3 (Codex round 1 on #283, P2) — two refreshes can overlap: a manual Refresh does not disable
 * the line Refund controls, so a refund can complete — and fire its own re-read — while the manual
 * read is still in flight. Whichever answer lands LAST used to win; the older, pre-refund list then
 * restored the Refund button over a line the ledger already holds. Only the newest read may replace
 * the list. Its own file: the sheet is stubbed here (the main suite mounts the real one).
 */
type Deferred = { resolve: (v: Snapshot) => void };
const reads: Deferred[] = [];
vi.mock("@/lib/refunds", () => ({
  getSettledToday: () =>
    new Promise<Snapshot>((resolve) => {
      reads.push({ resolve });
    }),
  refundLine: () => Promise.resolve({ ok: false, reason: "error" }),
}));
vi.mock("./RefundActionSheet", () => ({
  RefundActionSheet: ({ onDone }: { onDone: (c?: number) => void }) => (
    <button type="button" onClick={() => onDone(2100)}>
      Done
    </button>
  ),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { SettledToday } = await import("./SettledToday");

afterEach(() => {
  cleanup();
  reads.length = 0;
});

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const order = (refunded: boolean): SettledOrder => ({
  id: ID,
  code: "AA0001",
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
    subtotalCents: 2000,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 100,
    tipCents: 0,
  },
  totalCents: 2100,
  refund: refunded
    ? { state: "partial", refundedCents: 2100, netPaidCents: 0 }
    : { state: "none", refundedCents: 0, netPaidCents: 2100 },
  refundPath: "app",
  remainingCents: refunded ? 0 : 2100,
  lines: [
    {
      id: `${ID}-l1`,
      name: "Mohinga",
      nameMy: null,
      qty: 1,
      unitPriceCents: 2000,
      taxCents: 100,
      modifiers: [],
      modifiersMy: [],
      notes: null,
      fulfillment: "dinein",
      refundedCents: refunded ? 2100 : 0,
      refunded,
      offeredCents: refunded ? 0 : 2100,
      offerClamped: false,
    },
  ],
});
const snapshot = (o: SettledOrder): Snapshot => ({
  ok: true,
  orders: [o],
  truncated: false,
  sinceIso: "2026-09-13T07:00:00.000Z",
  serverNow: "2026-09-13T19:00:00.000Z",
});

describe("SettledToday — overlapping refreshes", () => {
  it("an older read that resolves AFTER a newer one cannot put the pre-refund list back", async () => {
    render(
      <StaffLangProvider lang="en">
        <SettledToday initial={snapshot(order(false))} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("button", { name: /^Refund — / })).toBeTruthy();

    // 1. A manual Refresh — read #1 is in flight.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(reads.length).toBe(1);
    // 2. The refund completes meanwhile — read #2 fires.
    fireEvent.click(screen.getByRole("button", { name: /^Refund — / }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(reads.length).toBe(2);
    // 3. Read #2 (post-refund) lands first: the line is marked, the control gone.
    await act(async () => reads[1]!.resolve(snapshot(order(true))));
    expect(screen.queryByRole("button", { name: /^Refund — / })).toBeNull();
    // 4. Read #1 (pre-refund) lands late: it is superseded — the mark stays, the control stays gone.
    await act(async () => reads[0]!.resolve(snapshot(order(false))));
    expect(screen.queryByRole("button", { name: /^Refund — / })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("$21.00");
  });
});
