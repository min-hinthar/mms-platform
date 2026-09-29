/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FloorTable } from "@/lib/floor-types";

/**
 * K33 — THE FLOOR CARD MUST NOT CALL REFUNDED MONEY PAID, in the words a screen reader speaks any
 * more than in the colour a sighted server sees.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A MUTANT SURVIVED, AND FOR THE REASON IT SURVIVED. The wiring that
 * feeds `paidRefunded` into the card's accessible name lives in `TableCard.tsx`, and its mutant was
 * pointed at `lib/staff-labels.test.ts` — a suite that calls `al()` directly and never renders this
 * component, so mutating the component could not turn it red. The label builder's own branch was
 * already guarded there; what was NOT guarded was anything passing the flag to it. A guard aimed at
 * the wrong subject is green for a reason that has nothing to do with the behaviour.
 */

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
// The pieces that carry their own timers, tokens or animation are not what this file is about.
// Phase 2d · floor — the clock renders WHICH instant it was handed, so the card's "Opened" can be
// told from its last activity; the status chip is the real one (its word is under test).
vi.mock("./RelativeTime", () => ({
  RelativeTime: ({ iso }: { iso: string }) => <time dateTime={iso} />,
}));
vi.mock("./LiveMoney", () => ({ LiveMoney: ({ cents }: { cents: number }) => <>{cents}</> }));

const { TableCard } = await import("./TableCard");
const { DEFAULT_KDS_THRESHOLDS } = await import("@/lib/kds-urgency");

const SETTLED: FloorTable = {
  sessionId: "s-1",
  label: "7",
  tableNumber: 7,
  mode: "dinein",
  status: "paid",
  partySize: 2,
  hostName: null,
  itemCount: 0,
  runningSubtotalCents: 0,
  paidTotalCents: 5330,
  tab: "none",
  tabOverCeiling: false,
  counterRequestedAt: null,
  lastActivityAt: "2026-09-09T01:00:00.000Z",
  refund: null,
  openedAt: "2026-09-09T00:40:00.000Z",
  kitchen: null,
};
const TH = DEFAULT_KDS_THRESHOLDS;

const card = () => screen.getByRole("link");

afterEach(cleanup);

describe("TableCard — a refunded table on the floor", () => {
  it("says money came BACK in the accessible name, not that the table paid it", () => {
    render(
      <TableCard
        table={{
          ...SETTLED,
          refund: { state: "full", refundedCents: 5330, netPaidCents: 0 },
        }}
        serverNow={SETTLED.lastActivityAt}
        thresholds={TH}
        pulse={undefined}
        lang="en"
      />,
    );
    const name = card().getAttribute("aria-label") ?? "";
    expect(name).toContain("$53.30 refunded");
    expect(name).not.toContain("$53.30 paid");
  });

  it("speaks what the guest actually KEPT paying on a partial refund", () => {
    // 3930 and 1400 and 5330 are three separable figures, so a card reading the wrong one cannot
    // pass by coincidence — and the guest's out-of-pocket is the number a cashier needs.
    render(
      <TableCard
        table={{
          ...SETTLED,
          refund: { state: "partial", refundedCents: 1400, netPaidCents: 3930 },
        }}
        serverNow={SETTLED.lastActivityAt}
        thresholds={TH}
        pulse={undefined}
        lang="en"
      />,
    );
    const name = card().getAttribute("aria-label") ?? "";
    expect(name).toContain("$39.30");
    expect(name).not.toContain("$53.30");
  });

  it("still says paid on an ordinary settled table", () => {
    // The correction must not become a blanket rewording: the overwhelming case is unrefunded.
    render(
      <TableCard
        table={SETTLED}
        serverNow={SETTLED.lastActivityAt}
        thresholds={TH}
        pulse={undefined}
        lang="en"
      />,
    );
    const name = card().getAttribute("aria-label") ?? "";
    expect(name).toContain("$53.30 paid");
    expect(name).not.toContain("refunded");
  });
});

// ── Phase 2d · floor ──
describe("TableCard — the refund-honest chip, the kitchen row and the clock", () => {
  const mount = (table: FloorTable, serverNow = SETTLED.lastActivityAt) =>
    render(<TableCard table={table} serverNow={serverNow} thresholds={TH} lang="en" />);

  it("a fully refunded table's chip says Refunded in the warn tone — never Paid (K33)", () => {
    // MUTATION: drop `refund={table.refund}` → the chip reads "Paid" in the success tone.
    const { container } = mount({
      ...SETTLED,
      refund: { state: "full", refundedCents: 5330, netPaidCents: 0 },
    });
    const words = [...container.querySelectorAll("span")].map((e) => e.textContent);
    expect(words).toContain("Refunded");
    expect(words).not.toContain("Paid");
    // The edge wears the returned tone, never `done`.
    expect(container.querySelector(".floor-edge")?.getAttribute("data-tone")).toBe("returned");
  });

  it("the kitchen row says what the kitchen has, and the wait's digits are hidden from the name's listeners", () => {
    const { container } = mount(
      {
        ...SETTLED,
        status: "ordering",
        paidTotalCents: null,
        itemCount: 5,
        runningSubtotalCents: 4200,
        kitchen: {
          notSent: 2,
          inKitchen: 3,
          up: 0,
          done: 0,
          oldestFireAt: "2026-09-09T00:51:00.000Z",
        },
      },
      "2026-09-09T01:00:00.000Z",
    );
    const row = container.querySelector(".floor-kitchen")!;
    expect(row.textContent).toContain("2 not sent · 3 in kitchen");
    const pill = row.querySelector(".floor-wait")!;
    expect(pill.textContent).toBe("9 min");
    expect(pill.getAttribute("aria-hidden")).toBe("true");
    // The name carries the same words, in the order the card shows them.
    expect(card().getAttribute("aria-label")).toContain("2 not sent, 3 in kitchen, 9 min");
  });

  it("no kitchen row at all when the table has nothing to say about the kitchen", () => {
    const { container } = mount(SETTLED);
    expect(container.querySelector(".floor-kitchen")).toBeNull();
  });

  it("'Opened' reads when the session OPENED, not its last activity", () => {
    // MUTATION: `iso={table.lastActivityAt}` → the clock jumps on every line add.
    const { container } = mount(SETTLED);
    const clock = container.querySelector("time")!;
    expect(clock.getAttribute("datetime")).toBe(SETTLED.openedAt);
    expect(clock.parentElement?.textContent).toContain("Opened");
    expect(card().getAttribute("aria-label")).toContain("Opened 20m ago");
  });

  it("the card carries its session id for the pane to find it", () => {
    mount(SETTLED);
    expect(card().getAttribute("data-session-id")).toBe("s-1");
  });
});
