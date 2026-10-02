/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettledOrder, SettledToday as Snapshot } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";
import { fill } from "@/lib/i18n/fill";
import {
  HAND_BACK_KEY,
  HAND_BACK_TTL_MS,
  peekHandBacks,
  rememberHandBack,
  resetHandBackDocumentForTests,
  tabStore,
  thisDocumentId,
} from "@/lib/settled-view";
import { blockKey, manualBlock, reloadHolds, resetHoldsForTests } from "@/lib/reload-guard";

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
    open,
  }: {
    onDone: (c?: number) => void;
    line: { name: string };
    open: boolean;
  }) => {
    return open ? (
      <button
        type="button"
        onClick={() => {
          onDone(sheetCents);
          heldAtReturn = window.sessionStorage.getItem("mms.staff.refund.handBack");
        }}
      >
        Answer {line.name}
      </button>
    ) : null;
  },
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
  resetHandBackDocumentForTests(); // each case is a new document
  resetHoldsForTests();
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
const snapshot = (...orders: SettledOrder[]): Snapshot => ({
  ok: true,
  orders,
  truncated: false,
  sinceIso: "2026-09-13T07:00:00.000Z",
  serverNow: "2026-09-13T19:00:00.000Z",
  serverClock: "12:00 PM",
});
const mount = (o: SettledOrder | SettledOrder[], lang: "en" | "my" = "en") =>
  render(
    <StaffLangProvider lang={lang}>
      <SettledToday initial={snapshot(...(Array.isArray(o) ? o : [o]))} />
    </StaffLangProvider>,
  );
/** The instruction as the banner says it — `fill`ed; its subject is dish · receipt code. */
const cashFor = (m: string, dish: string, code = "AA0001") =>
  fill(STAFF["floor.settled.confirmed.cashFor"].en, { m, x: `${dish} · ${code}` }, "en");
/** The same entry read back by a document that did not write it: a question, never the order. */
const checkFor = (m: string, dish: string, code = "AA0001") =>
  fill(STAFF["floor.settled.handBack.check"].en, { m, x: `${dish} · ${code}` }, "en");
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
      {
        lineId: "line-1",
        cents: 1105,
        name: "Mohinga",
        code: "AA0001",
        at: expect.any(Number),
        doc: thisDocumentId(),
      },
    ]);
  });

  it("blind review (M1 · C1) — a reload (a new document) shows the record as a QUESTION, with no focus, and its [Handed back] still ends it", async () => {
    mount(order());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    await flush();
    // The document that received the answer gives the order, once, with focus.
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
    expect(document.activeElement).toBe(screen.getByRole("status"));
    cleanup();
    resetHandBackDocumentForTests(); // the reload: this document's memory is gone, the record is not
    mount(order());
    await flush();
    // MUTATION (p2i-handback/banner-from-state): the banner reads only this document's memory, never
    // the record — after the reload nothing is said; red. (The mount reads through the same
    // `repeek` as every other path — critic F8 — so THIS assertion kills it, not only the one
    // before the remount.)
    const banner = screen.getByRole("status");
    // The money may already have left the drawer: never "now hand back" again.
    expect(banner.textContent).toBe(checkFor("$11.05", "Mohinga"));
    expect(banner.textContent).not.toContain(cashFor("$11.05", "Mohinga"));
    // MUTATION (p2i-handback/later-doc-focus): the reload pulls the manager onto the banner again; red.
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(window.sessionStorage.getItem(HAND_BACK_KEY)).toBeNull();
  });

  it("blind review (K1) — a duplicated tab's CLONE of the record (another document wrote it) asks, takes no focus, and is ended by its own [Handed back]", async () => {
    window.sessionStorage.setItem(
      HAND_BACK_KEY,
      JSON.stringify([
        {
          lineId: "line-1",
          cents: 1105,
          name: "Mohinga",
          code: "AA0001",
          at: Date.now(),
          doc: "the original tab's document",
        },
      ]),
    );
    mount(order());
    await flush();
    expect(screen.getByRole("status").textContent).toBe(checkFor("$11.05", "Mohinga"));
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(window.sessionStorage.getItem(HAND_BACK_KEY)).toBeNull();
  });

  it("an answer this document wrote while the zone was away IS said at the next mount, with focus — but never pulled out of a pane", async () => {
    // A late answer landing while no zone is mounted (the manager is on another screen).
    rememberHandBack(tabStore(), {
      lineId: "line-1",
      cents: 1105,
      name: "Mohinga",
      code: "AA0001",
      at: Date.now(),
    });
    const pane = document.createElement("button");
    document.body.appendChild(pane);
    pane.focus();
    try {
      mount(order());
      await flush();
      expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
      // MUTATION (p2i-handback/focus-stolen): the mount pulls focus out of the pane; red.
      expect(document.activeElement).toBe(pane);
    } finally {
      pane.remove();
    }
    cleanup();
    resetHandBackDocumentForTests();
    window.sessionStorage.clear();
    rememberHandBack(tabStore(), {
      lineId: "line-1",
      cents: 1105,
      name: "Mohinga",
      code: "AA0001",
      at: Date.now(),
    });
    mount(order());
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });

  it("critic F4 — a navigation back re-shows what is owed WITHOUT taking focus again; a reload never pulls focus out of where it already is", async () => {
    mount(order());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("status"));
    cleanup();
    mount(order()); // same document: the manager came back to the counter
    await flush();
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
    // MUTATION (p2i-handback/refocus-every-mount): every return to the counter jumps to the banner
    // and re-reads it, for a shift; red.
    expect(document.activeElement).toBe(document.body);
    cleanup();
    resetHandBackDocumentForTests(); // a reload, and a hash-opened pane already holds focus
    const pane = document.createElement("button");
    document.body.appendChild(pane);
    pane.focus();
    try {
      mount(order());
      await flush();
      expect(screen.getByRole("status").textContent).toBe(checkFor("$11.05", "Mohinga"));
      expect(document.activeElement).toBe(pane);
    } finally {
      pane.remove();
    }
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
      "Handed back · Mohinga · AA0001",
      "Handed back · Laphet · AA0001",
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

  it("a hand-back this tab could NOT write down (storage refused) is still said, and an automatic reload waits, until its own [Handed back]", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    mount(order());
    await flush();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    // MUTATION (p2i-handback/memory-unsaid): private mode, and the drawer instruction is never
    // said at all; red.
    expect(screen.getByRole("status").textContent).toBe(cashFor("$11.05", "Mohinga"));
    // MUTATION (p2i-handback/memory-unheld): the only copy is in memory, and nothing stops the
    // automatic reload from erasing it; red.
    expect(reloadHolds()).toHaveLength(1);
    // Blind review (C1 · K2) — and a PERSON's Reload tap is refused for it too, in its own words.
    const verdict = manualBlock({
      online: true,
      holds: reloadHolds(),
      youngWrite: false,
      stalledWrite: false,
      ownWait: false,
      msSinceWriteSettled: null,
      msSinceInput: 1e9,
      dialogOpen: false,
      typing: false,
      visible: true,
      retired: false,
    });
    expect(verdict).toEqual({ kind: "hold", reason: "handBack" });
    expect(blockKey(verdict!)).toBe("shell.version.wait.handBack");
    await flush();
    // MUTATION (p2i-handback/unkept-unfocused): said above the list, below the fold, to nobody; red.
    expect(document.activeElement).toBe(screen.getByRole("status"));
    screen.getByRole("button", { name: /^Handed back/ }).focus();
    fireEvent.click(screen.getByRole("button", { name: /^Handed back/ }));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(reloadHolds()).toEqual([]);
  });

  it("critic F1 — a memory entry aging out re-reads the list quietly: it never closes an open sheet or takes focus", async () => {
    vi.useFakeTimers();
    const T0 = 1_800_000_000_000;
    vi.setSystemTime(T0);
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    mount(order());
    await tick(0);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    refundAndAnswer("Mohinga"); // memory only, at T0
    refused.mockRestore();
    await tick(60 * 60_000);
    sheetCents = 250;
    refundAndAnswer("Laphet"); // written down, an hour later
    await tick(0);
    fireEvent.click(screen.getByRole("button", { name: "Refund — Mohinga" }));
    const answer = screen.getByRole("button", { name: "Answer Mohinga" });
    answer.focus();
    await tick(HAND_BACK_TTL_MS - 60 * 60_000); // Mohinga's shift ends; Laphet's has not
    expect(screen.getByRole("status").textContent).toBe(cashFor("$2.50", "Laphet"));
    // MUTATION (p2i-handback/expiry-steals): an expiry is treated as a new answer — the sheet the
    // manager is working in is shut and focus jumps to the banner; red.
    expect(screen.getByRole("button", { name: "Answer Mohinga" })).toBe(answer);
    expect(document.activeElement).toBe(answer);
  });

  it("Codex r1 on #311 — a hand-back read back from the RECORD stops being said at its shift's end, with the zone still mounted", async () => {
    // MUTATION (p2i-handback/record-expiry-unscheduled): only a MEMORY entry's end re-reads the list
    // — a record entry (a reload, a duplicated tab, an answer written while the zone was away) goes
    // on saying its instruction past its one-shift life, for as long as the zone stays up; red.
    vi.useFakeTimers();
    const T0 = 1_800_000_000_000;
    vi.setSystemTime(T0);
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    window.sessionStorage.setItem(
      HAND_BACK_KEY,
      JSON.stringify([
        { lineId: "line-1", cents: 1105, name: "Mohinga", code: "AA0001", at: T0 - 60 * 60_000 },
        { lineId: "line-2", cents: 250, name: "Laphet", code: "AA0001", at: T0, doc: "another" },
      ]),
    );
    mount(order());
    await tick(0);
    expect(screen.getAllByRole("button", { name: /^Handed back/ })).toHaveLength(2);
    await tick(HAND_BACK_TTL_MS - 60 * 60_000 - 1);
    expect(screen.getAllByRole("button", { name: /^Handed back/ })).toHaveLength(2);
    await tick(1); // Mohinga's shift ends
    expect(screen.getByRole("status").textContent).toBe(checkFor("$2.50", "Laphet"));
    expect(screen.getAllByRole("button", { name: /^Handed back/ })).toHaveLength(1);
    // Quietly: nothing took focus.
    expect(document.activeElement).toBe(document.body);
    await tick(60 * 60_000); // and Laphet's
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("button", { name: /^Handed back/ })).toBeNull();
  });

  it("critic F7 — an answer whose figure is no hand-back (zero) is said nowhere, even where storage refuses", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    sheetCents = 0;
    mount(order());
    await flush();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    refundAndAnswer("Mohinga");
    await flush();
    // MUTATION (p2i-handback/invalid-kept-in-memory): "hand back $0.00 for Mohinga" with a
    // [Handed back]; red.
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("button", { name: /^Handed back/ })).toBeNull();
    expect(reloadHolds()).toEqual([]);
  });

  it("critic F3 — the same dish refunded on two receipts: two instructions that read apart, two buttons that never match", async () => {
    const a = order();
    const b = order({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002",
      code: "BB0002",
      tableNumber: 7,
      lines: [line("line-9", "Mohinga")],
    });
    mount([a, b]);
    await flush();
    for (const t of screen.getAllByRole("button", { expanded: false })) fireEvent.click(t);
    const refunds = screen.getAllByRole("button", { name: "Refund — Mohinga" });
    fireEvent.click(refunds[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Answer Mohinga" }));
    sheetCents = 840;
    fireEvent.click(screen.getAllByRole("button", { name: "Refund — Mohinga" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Answer Mohinga" }));
    expect(screen.getByRole("status").textContent).toBe(
      `${cashFor("$11.05", "Mohinga")} ${cashFor("$8.40", "Mohinga", "BB0002")}`,
    );
    const acks = screen.getAllByRole("button", { name: /^Handed back/ });
    // MUTATION (p2i-handback/ack-label-dish-only): both buttons read "Handed back · Mohinga"; red.
    expect(acks.map((x) => x.textContent)).toEqual([
      "Handed back · Mohinga · AA0001",
      "Handed back · Mohinga · BB0002",
    ]);
    expect(document.getElementById(acks[1]!.getAttribute("aria-describedby")!)?.textContent).toBe(
      cashFor("$8.40", "Mohinga", "BB0002"),
    );
  });

  it("a Phase 2h record (no dish, no writer) is asked about on mount in its dish-less words, and its [Handed back] ends it", async () => {
    window.sessionStorage.setItem(HAND_BACK_KEY, JSON.stringify([{ lineId: "old", cents: 1105 }]));
    mount(order());
    await flush();
    expect(screen.getByRole("status").textContent).toBe(
      STAFF["floor.settled.handBack.checkBare"].en.replace("{m}", "$11.05"),
    );
    expect(document.activeElement).toBe(document.body);
    const ack = screen.getByRole("button", { name: /^Handed back/ });
    // Dish-less, it is called by its figure — the same figure its line says.
    expect(ack.textContent).toBe("Handed back · $11.05");
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
      name: `${STAFF["floor.settled.handBack.done"].my} · ${STAFF["floor.settled.handBack.done"].en} · Mohinga · AA0001`,
    });
    expect(ack.getAttribute("aria-describedby")).toBe("settled-hand-back-line-1");
  });
});
