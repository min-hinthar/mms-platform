/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableDetailResult } from "@/lib/floor-types";
import type { Handoff } from "@/lib/register-ui";
import { handoffFocusKey, markHandoffFocus } from "@/lib/floor-pane";

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
  h.detail = {
    kind: "closed",
    label: "reg-7f3a",
    tableNumber: null,
    handoff: CARD,
    refund: "none",
    orderId: CARD.orderId,
  };
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

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

  it("a counter order with no card the server could not name (unreadable) is named as one and hedged — never 'sat idle'", async () => {
    // p2g-int/page-counter-without-card-says-idle — a counter order with no card read "It was
    // cleared or sat idle too long" under "This table is closed"; red.
    h.detail = {
      kind: "closed",
      label: "reg-7f3a",
      tableNumber: null,
      handoff: null,
      refund: null,
      orderId: null,
    };
    await mount();
    expect(barTitle()).toBe("floor.pane.closed.counterTitle");
    expect(document.body.textContent).toContain(ts("en", "floor.pane.closed.body"));
    expect(document.body.textContent).not.toContain(ts("en", "table.detail.closed.body"));
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

  // ── Phase 2g · review (PT-7) ── a counter order the server KNOWS was refunded says so.
  it("refunded in part: no Paid card, the refund said with the order's #CODE and a manager check", async () => {
    h.detail = {
      kind: "closed",
      label: "reg-7f3a",
      tableNumber: null,
      handoff: null,
      refund: "partial",
      orderId: CARD.orderId,
    };
    await mount();
    // MUTANT p2g-fix-code/page-refund-hedged — the page hedges "it may have been paid, cleared or
    // merged…" over an order the server read as partly refunded, and the #CODE the rest of the bag
    // is handed over under is nowhere; red.
    expect(screen.queryByRole("region", { name: /Paid/ })).toBeNull();
    expect(barTitle()).toBe("floor.pane.closed.counterTitle");
    expect(document.body.textContent).toContain(
      "Part of this order was refunded — order #A1B2C3. Check with a manager before handing it over.",
    );
    expect(document.body.textContent).not.toContain(ts("en", "floor.pane.closed.body"));
  });

  it("refunded in full: the plain fact, never the hedge", async () => {
    h.detail = {
      kind: "closed",
      label: "reg-7f3a",
      tableNumber: null,
      handoff: null,
      refund: "full",
      orderId: CARD.orderId,
    };
    await mount();
    expect(document.body.textContent).toContain(ts("en", "floor.pane.closed.refundedFull"));
    expect(document.body.textContent).not.toContain(ts("en", "floor.pane.closed.body"));
  });

  // Codex r2 on #309 — a "Paid · #CODE" the bar's chip queued for this order is CONSUMED here when
  // the server names it refunded (the page that says "refunded" never sits under a bar that says
  // Paid); an UNREADABLE order is NOT marked, so the chip keeps the only copy of its code.
  const withShown = async () => {
    const shownHere = vi.fn((_sessionId: string, _viewer?: unknown) => () => {});
    const api = { shownHere } as unknown as NonNullable<
      Parameters<typeof ReaderCollectContext.Provider>[0]["value"]
    >;
    await mount((n) => (
      <ReaderCollectContext.Provider value={api}>{n}</ReaderCollectContext.Provider>
    ));
    return shownHere;
  };
  it.each(["partial", "full"] as const)(
    "refunded (%s): the order is marked shown, so a queued Paid chip is consumed",
    async (refund) => {
      h.detail = {
        kind: "closed",
        label: "reg-7f3a",
        tableNumber: null,
        handoff: null,
        refund,
        orderId: CARD.orderId,
      };
      const shownHere = await withShown();
      // MUTATION (p2g-cx2/refunded-page-keeps-the-paid-chip): never marked — the bar keeps
      // "Paid · #A1B2C3" over a page saying the order was refunded, and again on every page after;
      // red.
      expect(shownHere).toHaveBeenCalledWith(ID, expect.anything());
    },
  );
  it("unreadable: NOT marked — the chip's card is then the only copy of the code", async () => {
    h.detail = {
      kind: "closed",
      label: "reg-7f3a",
      tableNumber: null,
      handoff: null,
      refund: null,
      orderId: null,
    };
    const shownHere = await withShown();
    // MUTATION (p2g-cx2/unreadable-page-eats-the-code): marked on any card-less counter order — a
    // read that failed swallows the one #CODE this tab still holds; red.
    expect(shownHere).not.toHaveBeenCalled();
  });
});

// ── Phase 2g · review (A11Y-4) ── the phone's detail swapped to this card under the person's focus.
describe("the table page — the closed card takes focus ONCE, only when the detail it replaced asked", () => {
  it("with the detail's one-shot note: the card is focused on mount, and the note is spent", async () => {
    markHandoffFocus(ID, Date.now());
    await act(async () => {
      await mount();
    });
    const card = screen.getByRole("region", { name: /Paid.*\$42\.10.*#A1B2C3/ });
    // MUTANT p2g-fix-code/closed-card-ignores-focus-note — the card replaces the detail under the
    // person's focus and focus falls to <body>, unsaid; red.
    expect(document.activeElement).toBe(card);
    expect(sessionStorage.getItem(handoffFocusKey(ID))).toBeNull();
  });

  it("without one (a deep link, a reload, the chip's View): never focused", async () => {
    await act(async () => {
      await mount();
    });
    const card = screen.getByRole("region", { name: /Paid.*\$42\.10.*#A1B2C3/ });
    // MUTANT p2g-fix-code/closed-card-always-focused — every arrival pulls focus onto the card; red.
    expect(document.activeElement).not.toBe(card);
  });
});
