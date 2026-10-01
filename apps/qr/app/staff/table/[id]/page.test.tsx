/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableDetailResult } from "@/lib/floor-types";
import type { Handoff } from "@/lib/register-ui";

/**
 * Phase 2g · P2em (D2) — the table page's CLOSED branch. A counter session closes behind its settle,
 * and this page is where a phone (or the bar's reader chip "View") lands on it: when the verdict
 * carries the order's server-built paid card, the page shows "Paid · $X · #CODE", the call-out and the
 * way back — on any device, with no panel and no stash. A closed table (or a counter order with no
 * card: refunded, or its order unreadable) keeps today's honest closed shell.
 *
 * Mocks: the gate, the read, the PIN check, the language cookie, and the bar (stubbed to the title key
 * it is handed — the bar's own contract is StaffBar.test's). The card and its client island are real.
 */
const h = vi.hoisted(() => ({ detail: null as unknown as TableDetailResult }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/lib/staff", () => ({
  requireStaffPage: () => Promise.resolve({ staffId: "st-1", role: "server" }),
}));
vi.mock("@/lib/floor", () => ({ getTableDetail: () => Promise.resolve(h.detail) }));
vi.mock("@/lib/staff-pin", () => ({ staffHasPin: () => Promise.resolve(false) }));
vi.mock("@/lib/staff-lang-server", () => ({ readStaffLang: () => Promise.resolve("en") }));
vi.mock("@/components/staff/StaffBar", () => ({
  StaffBar: (p: { title: string }) => <header data-title={p.title} />,
}));
vi.mock("@/components/staff/FloorDetailLive", () => ({
  FloorDetailLive: () => <div data-testid="detail" />,
}));
vi.mock("@/components/staff/StaffOutageShell", () => ({
  StaffOutageShell: () => <div data-testid="outage" />,
}));

const { default: TablePage } = await import("./page");
const { ReaderCollectContext } = await import("@/components/staff/ReaderCollectContext");
const { ts } = await import("@/lib/i18n/staff");

const ID = "11111111-1111-4111-8111-111111111111";
const CARD: Handoff = {
  orderId: "o-00a1b2c3",
  totalCents: 4210,
  tipCents: 0,
  tenderedCents: null,
  isCounter: true,
  cartId: "c-9",
  sentEarly: false,
};

async function mount(wrap: (n: ReactNode) => ReactNode = (n) => n) {
  const page = await TablePage({
    params: Promise.resolve({ id: ID }),
    searchParams: Promise.resolve({}),
  });
  return render(<>{wrap(page)}</>);
}
const barTitle = () => document.querySelector("header")!.getAttribute("data-title");

beforeEach(() => {
  h.detail = { kind: "closed", label: "reg-7f3a", tableNumber: null, handoff: CARD };
});
afterEach(cleanup);

describe("the table page — a CLOSED counter order shows its paid card (P2em · D2)", () => {
  it("the verdict's card: Paid · $42.10 · #A1B2C3, the call-out, the way back; the counter title", async () => {
    await mount();
    // MUTANT p2g-code/page-closed-ignores-handoff — the phone lands on "This table is closed / It was
    // cleared or sat idle too long" over an order that was just PAID; red.
    const card = screen.getByRole("region", { name: /Paid.*\$42\.10.*#A1B2C3/ });
    expect(card.textContent).toContain(ts("en", "table.detail.handoff.callout"));
    expect(barTitle()).toBe("floor.pane.closed.counterTitle");
    expect(document.body.textContent).not.toContain(ts("en", "table.detail.closed.body"));
    // The page was navigated to — nothing just landed on it: the card is not focused.
    expect(document.activeElement).not.toBe(card);
  });

  it("no card in the verdict (a table, a refunded order, an unreadable one): today's closed shell", async () => {
    h.detail = { kind: "closed", label: "t-7", tableNumber: 7 };
    await mount();
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
    expect(barTitle()).toBe("table.detail.closed.title");
    expect(document.body.textContent).toContain(ts("en", "table.detail.closed.body"));
    h.detail = { kind: "closed", label: "reg-7f3a", tableNumber: null, handoff: null };
    cleanup();
    await mount();
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
  });

  it("marks the order SHOWN, and a card this tab's reader landed for it wins (the tap's 'went out unpaid')", async () => {
    const shownHere = vi.fn((sessionId: string, viewer?: { onLanded?: (x: Handoff) => void }) => {
      // The provider hands a card that landed while this order was off screen to whoever shows it.
      if (sessionId === ID) viewer?.onLanded?.({ ...CARD, sentEarly: true });
      return () => {};
    });
    const api = { shownHere } as unknown as NonNullable<
      Parameters<typeof ReaderCollectContext.Provider>[0]["value"]
    >;
    await mount((n) => (
      <ReaderCollectContext.Provider value={api}>{n}</ReaderCollectContext.Provider>
    ));
    // MUTANT p2g-code/closed-page-never-shown — the bar's chip repeats "Paid · #CODE" over the
    // order's own card, and the landed card is never handed over; red.
    expect(shownHere).toHaveBeenCalledWith(ID, expect.anything());
    // MUTANT p2g-code/closed-page-landed-loses-to-server — the row's card (no "went out unpaid")
    // replaces the one the reader landed: the cashier is never pointed at the lane; red.
    expect(document.getElementById("handoff-sent-early")!.textContent).toBe(
      ts("en", "table.detail.handoff.sentEarly"),
    );
  });
});
