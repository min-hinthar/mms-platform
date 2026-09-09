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
vi.mock("./RelativeTime", () => ({ RelativeTime: () => null }));
vi.mock("./LiveMoney", () => ({ LiveMoney: ({ cents }: { cents: number }) => <>{cents}</> }));
vi.mock("./FloorStatusChip", () => ({ FloorStatusChip: () => null }));

const { TableCard } = await import("./TableCard");

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
};

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
      <TableCard table={SETTLED} serverNow={SETTLED.lastActivityAt} pulse={undefined} lang="en" />,
    );
    const name = card().getAttribute("aria-label") ?? "";
    expect(name).toContain("$53.30 paid");
    expect(name).not.toContain("refunded");
  });
});
