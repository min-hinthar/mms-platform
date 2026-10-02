/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";

/**
 * A4·3 (Codex round 1 on #283, P2) — two refreshes can overlap: a manual Refresh does not disable
 * the line Refund controls, so a refund can complete — and fire its own re-read — while the manual
 * read is still in flight. Whichever answer lands LAST used to win; the older, pre-refund list then
 * restored the Refund button over a line the ledger already holds. Phase 2h (9f): the second read is
 * now OWED to the first (the poll gate) and starts only after it answers, so the newest read always
 * lands last — by construction, not by a generation check. Its own file: the sheet is stubbed here
 * (the main suite mounts the real one).
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
  serverClock: "12:00 PM",
});

describe("SettledToday — overlapping refreshes", () => {
  it("a re-read asked for while one is in the air is OWED, never sent beside it — so an older answer can never land after a newer one", async () => {
    render(
      <StaffLangProvider lang="en">
        <SettledToday initial={snapshot(order(false))} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("button", { name: /^Refund — / })).toBeTruthy();

    // 1. A manual Refresh — read #1 is in flight, and the Refresh says so (aria-disabled, never
    //    native — Phase 2h).
    const refresh = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(refresh);
    expect(reads.length).toBe(1);
    expect(refresh.getAttribute("aria-disabled")).toBe("true");
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
    // 2. The refund completes meanwhile and asks for its re-read: OWED to the read in the air, never
    //    sent beside it (Phase 2h · 9f — a second call would only queue behind the first in Next's
    //    one-at-a-time queue, and its answer could land in either order). MUTATION
    //    (p2h-boards/settled/reads-stack): it is sent — two reads in the air; red.
    fireEvent.click(screen.getByRole("button", { name: /^Refund — / }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(reads.length).toBe(1);
    // 3. Read #1 (asked BEFORE the refund) answers with the pre-refund list — and only THEN does the
    //    owed re-read start. MUTATION (p2h-boards/settled/owed-read-never-kicked): the refund's
    //    re-read is lost for good, the pre-refund list stands; red.
    await act(async () => reads[0]!.resolve(snapshot(order(false))));
    await waitFor(() => expect(reads.length).toBe(2));
    // 4. The owed read (post-refund) lands last, by construction: the mark stays, the control goes.
    await act(async () => reads[1]!.resolve(snapshot(order(true))));
    expect(screen.queryByRole("button", { name: /^Refund — / })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("$21.00");
    expect(reads.length).toBe(2);
  });
});

describe("Phase 2i — the zone's read is a READ on the ledger", () => {
  it("a Refresh in flight never reads as a young write — a reload for a new build is not refused for it", async () => {
    const { youngWrite, outstanding } = await import("@/lib/bounded-write");
    render(
      <StaffLangProvider lang="en">
        <SettledToday initial={snapshot(order(false))} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(reads.length).toBe(1);
    expect(outstanding()).toBe(1);
    // MUTATION (p2i-kind/settled-poll): the race labels the read a write; red.
    expect(youngWrite()).toBe(false);
  });
});

describe("Phase 2h — the zone's read is bounded, never stacked, and its Refresh frees at the bound", () => {
  it("a read hung for 60 s is ONE dispatch: Refresh frees at the bound, the list says it is stale, taps past it start nothing, and the answer kicks exactly one owed read", async () => {
    vi.useFakeTimers();
    const { STAFF_HANG_MS } = await import("@/lib/bounded-write");
    const flush = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    render(
      <StaffLangProvider lang="en">
        <SettledToday initial={snapshot(order(false))} />
      </StaffLangProvider>,
    );
    const refresh = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(refresh);
    expect(reads.length).toBe(1);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    await flush(STAFF_HANG_MS - 1);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    // AT the bound the control frees (a state cleared in `finally`), and the list says it is stale.
    // MUTATION (p2h-boards/settled/read-transition — the old startTransition): its pending held until
    // the action answered; red.
    await flush(1);
    expect(refresh.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByText(/Couldn’t refresh/)).toBeTruthy();
    // Taps past the bound start nothing: the read in the air is still in Next's queue. MUTATION
    // (p2h-boards/settled/reads-stack): each tap sends another behind it; red.
    fireEvent.click(refresh);
    await flush(0);
    // Critic B8 — the tap is OWED to the read in the air, and Refresh says so: busy, refusing — never a
    // live-looking control that does nothing and says nothing. MUTATION
    // (p2h-boards/settled/owed-tap-silent): it reads live after the tap; red.
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    expect(refresh.getAttribute("aria-disabled")).toBe("true");
    for (let i = 0; i < 3; i++) {
      fireEvent.click(refresh);
      await flush(15_000);
    }
    expect(reads.length).toBe(1);
    // The raw answers (its race long given up — its list is not applied): ONE owed read is kicked.
    // MUTATION (p2h-boards/settled/owed-read-never-kicked): nothing reads again; red.
    await act(async () => reads[0]!.resolve(snapshot(order(false))));
    await flush(0);
    expect(reads.length).toBe(2);
    await act(async () => reads[1]!.resolve(snapshot(order(true))));
    expect(screen.queryByText(/Couldn’t refresh/)).toBeNull();
    expect(reads.length).toBe(2);
    // The owed read ran and answered: Refresh is free again. MUTATION
    // (p2h-boards/settled/owed-never-cleared): it stays busy for good; red.
    expect(refresh.getAttribute("aria-busy")).toBeNull();
    vi.useRealTimers();
  });
});
