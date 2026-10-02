/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";
import { fill } from "@/lib/i18n/fill";
import { HAND_BACK_KEY, peekHandBacks, tabStore } from "@/lib/settled-view";

/**
 * Phase 2i (P2bi · D5) — the cash hand-back is written down on EVERY cash answer and said FROM that
 * record until its own [Handed back]. The sheet is stubbed so the answer can be delivered at an
 * exact instant: `refundLine` revalidates, and on a tab older than the server Next reloads the page
 * right after the answer handler runs — so the record must hold the instruction THE INSTANT `onDone`
 * returns, before any effect, commit or paint. The stub reads the store at exactly that instant.
 */
let sheetCents: number | undefined = 1105;
/** What the record held the instant the answer handler returned (read inside the same call). */
let heldAtReturn: string | null = null;
vi.mock("@/lib/refunds", () => ({
  getSettledToday: () => new Promise(() => {}),
  refundLine: vi.fn(),
}));
vi.mock("./RefundActionSheet", () => ({
  RefundActionSheet: ({
    onDone,
    line,
  }: {
    onDone: (c?: number) => void;
    line: { name: string };
  }) => (
    <button
      type="button"
      onClick={() => {
        onDone(sheetCents);
        heldAtReturn = window.sessionStorage.getItem("mms.staff.refund.handBack");
      }}
    >
      Answer {line.name}
    </button>
  ),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { SettledToday } = await import("./SettledToday");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
  sheetCents = 1105;
  heldAtReturn = null;
});

const line = (id: string, name: string) => ({
  id,
  name,
  nameMy: null,
  qty: 1,
  unitPriceCents: 1000,
  taxCents: 105,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  fulfillment: "dinein",
  refundedCents: 0,
  refunded: false,
  offeredCents: 1105,
  offerClamped: false,
});
const order = (over: Partial<SettledOrder> = {}): SettledOrder => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
  code: "AA0001",
  createdAt: "2026-09-13T18:41:00Z",
  settledAt: "11:41 AM",
  settledOn: null,
  refundedTodayAt: null,
  status: "paid",
  tender: "cash",
  tableNumber: 4,
  customerName: null,
  pickupSlotAt: null,
  breakdown: {
    subtotalCents: 2000,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 210,
    tipCents: 0,
  },
  totalCents: 2210,
  refund: { state: "none", refundedCents: 0, netPaidCents: 2210 },
  refundPath: "cash",
  remainingCents: 2210,
  lines: [line("line-1", "Mohinga"), line("line-2", "Laphet")],
  ...over,
});
const snapshot = (o: SettledOrder): Snapshot => ({
  ok: true,
  orders: [o],
  truncated: false,
  sinceIso: "2026-09-13T07:00:00.000Z",
  serverNow: "2026-09-13T19:00:00.000Z",
  serverClock: "12:00 PM",
});
const mount = (o: SettledOrder, lang: "en" | "my" = "en") =>
  render(
    <StaffLangProvider lang={lang}>
      <SettledToday initial={snapshot(o)} />
    </StaffLangProvider>,
  );
const cashFor = (m: string, x: string) =>
  fill(STAFF["floor.settled.confirmed.cashFor"].en, { m, x }, "en");
/** Open line `name`'s refund and deliver its answer. */
function refundAndAnswer(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Refund — ${name}` }));
  fireEvent.click(screen.getByRole("button", { name: `Answer ${name}` }));
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe("Phase 2i — the cash hand-back is kept until [Handed back]", () => {
  it("a MOUNTED zone's cash answer is in the record the instant the answer handler returns — before any commit", () => {
    mount(order());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    // MUTATION (p2i-handback/remember-only-unmounted): the Phase 2h gate — only a GONE zone's
    // hand-back was written down, so Next's reload on this very answer erases the only copy; red.
    expect(heldAtReturn).not.toBeNull();
    expect(JSON.parse(heldAtReturn!)).toEqual([
      { lineId: "line-1", cents: 1105, name: "Mohinga", at: expect.any(Number) },
    ]);
  });

  it("a remount (a reload, a navigation back) says it again, with focus — the banner reads the record, not the answer", async () => {
    mount(order());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
    cleanup();
    mount(order());
    await flush();
    // MUTATION (p2i-handback/banner-from-state): the banner said the ANSWER (component state) and
    // the record was never read back — a reload drops the instruction; red.
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(cashFor("$11.05", "Mohinga"));
    expect(document.activeElement).toBe(banner);
  });

  it("each instruction names its dish and has its own [Handed back], described by its line; one tap forgets only its own", async () => {
    mount(order());
    await flush(); // the mount-time peek has run (it finds nothing) — it must not focus anything later
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    sheetCents = 250;
    refundAndAnswer("Laphet");
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(
      `${cashFor("$11.05", "Mohinga")} ${cashFor("$2.50", "Laphet")}`,
    );
    const acks = screen.getAllByRole("button", { name: /^Handed back/ });
    expect(acks.map((b) => b.textContent)).toEqual([
      "Handed back · Mohinga",
      "Handed back · Laphet",
    ]);
    // Outside the live region (a control inside one is read out as text), each described by ITS line.
    for (const b of acks) expect(banner.contains(b)).toBe(false);
    expect(document.getElementById(acks[1]!.getAttribute("aria-describedby")!)?.textContent).toBe(
      cashFor("$2.50", "Laphet"),
    );
    acks[0]!.focus(); // a real tap focuses the button it removes
    fireEvent.click(acks[0]!);
    // MUTATION (p2i-handback/ack-unwired): the tap does nothing — the instruction stands for a
    // shift after the money left the drawer, and the next manager hands it back again; red.
    expect(peekHandBacks(tabStore(), Date.now()).map((h) => h.lineId)).toEqual(["line-2"]);
    expect(screen.getByRole("status").textContent).toBe(cashFor("$2.50", "Laphet"));
    await flush();
    // Focus stays on the instruction still owed, never on <body>.
    expect(document.activeElement).toBe(screen.getByRole("status"));
    screen.getByRole("button", { name: /^Handed back/ }).focus();
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(window.sessionStorage.getItem(HAND_BACK_KEY)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("button", { name: /^Handed back/ })).toBeNull();
    // Nothing left to say: the zone's heading takes focus.
    expect(document.activeElement).toBe(document.getElementById("settled-h"));
  });

  it("a hand-back this tab could NOT write down (storage refused) is still said, until its own [Handed back]", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    mount(order());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    // MUTATION (p2i-handback/unkept-dropped): private mode, and the drawer instruction is never
    // said at all; red.
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
    await flush();
    // MUTATION (p2i-handback/unkept-unfocused): said above the list, below the fold, to nobody —
    // only a WRITTEN-DOWN entry is announced through the record's own listener; red.
    expect(document.activeElement).toBe(screen.getByRole("status"));
    screen.getByRole("button", { name: /^Handed back/ }).focus();
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("a Phase 2h record (no dish) is said on mount in its dish-less words, and its [Handed back] ends it", async () => {
    window.sessionStorage.setItem(HAND_BACK_KEY, JSON.stringify([{ lineId: "old", cents: 1105 }]));
    mount(order());
    await flush();
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["floor.settled.confirmed.cash"].en.replace("{m}", "$11.05"),
    );
    const ack = screen.getByRole("button", { name: /^Handed back/ });
    expect(ack.textContent).toBe("Handed back");
    fireEvent.click(ack);
    await flush();
    expect(window.sessionStorage.getItem(HAND_BACK_KEY)).toBeNull();
  });

  it("a card refund's answer keeps nothing and offers no [Handed back]", () => {
    mount(order({ tender: "card", refundPath: "app" }));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    expect(heldAtReturn).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["floor.settled.confirmed"].en.replace("{m}", "$11.05"),
    );
    expect(screen.queryByRole("button", { name: /^Handed back/ })).toBeNull();
  });

  it("under my, the acknowledgement keeps its English echo (money: K15-HIGH) and its name contains what it shows", () => {
    mount(order(), "my");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getAllByRole("button", { name: /Mohinga/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Answer Mohinga" }));
    const ack = screen.getByRole("button", {
      name: `${STAFF["floor.settled.handBack.done"].my} · ${STAFF["floor.settled.handBack.done"].en} · Mohinga`,
    });
    expect(ack.getAttribute("aria-describedby")).toBe("settled-hand-back-line-1");
  });
});
