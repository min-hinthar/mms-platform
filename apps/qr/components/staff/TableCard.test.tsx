/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const { CHIP_TONE } = await import("./FloorStatusChip");
const { FLOOR_TONES } = await import("@/lib/floor-tone");
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
        frozen={false}
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
        frozen={false}
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
        frozen={false}
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
    render(
      <TableCard table={table} serverNow={serverNow} thresholds={TH} lang="en" frozen={false} />,
    );

  it("a fully refunded table's chip says Refunded in the returned tone — never Paid (K33)", () => {
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

  it("ONE tone map: the chip's ink for every tone is the ink the tile and the key draw (never two colours for one table)", () => {
    // The chip colours itself inline (`CHIP_TONE`); the tile, the card's edge and the strip's key
    // colour themselves from the stylesheet's `--floor-ink`. A refunded table read warn on its chip
    // and muted on its tile until this pinned them together. Comments stripped; each tone's ink is
    // the ONE rule selecting `.floor-tile[data-tone="…"]` that declares it, else the tile's base.
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1]!.split(",").map((x) => x.trim()),
      body: m[2]!,
    }));
    const inkOf = (selector: string): string[] =>
      rules
        .filter((r) => r.selectors.includes(selector))
        .flatMap((r) => [...r.body.matchAll(/--floor-ink:\s*([^;]+);/g)].map((m) => m[1]!.trim()));
    const base = inkOf(".floor-tile");
    expect(base).toHaveLength(1);
    for (const tone of FLOOR_TONES) {
      const own = inkOf(`.floor-tile[data-tone="${tone}"]`);
      expect(own.length).toBeLessThanOrEqual(1);
      // MUTATION: the chip's `returned` back on the warn pair → red here.
      expect([tone, CHIP_TONE[tone].fg]).toEqual([tone, own[0] ?? base[0]]);
    }
  });

  it("'not sent' is drawn in the act-now ink, bold — never the row's quiet grey (K15-HIGH)", () => {
    const { container } = mount({
      ...SETTLED,
      status: "ordering",
      paidTotalCents: null,
      itemCount: 2,
      runningSubtotalCents: 2000,
      kitchen: { notSent: 2, inKitchen: 0, up: 0, done: 0, oldestFireAt: null },
    });
    const seg = [...container.querySelectorAll<HTMLElement>(".floor-kitchen-seg")].find(
      (e) => e.textContent === "2 not sent",
    )!;
    // The stylesheet binds to the segment's OWN attribute value, so a renamed key cannot quietly
    // drop the emphasis. MUTATION: delete the rule → the owed Send reads in grey beside bold words.
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const sel = `.floor-kitchen-seg[data-seg="${seg.dataset.seg}"]`;
    const bodies = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) =>
        m[1]!
          .split(",")
          .map((x) => x.trim())
          .includes(sel),
      )
      .map((m) => m[2]!);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatch(/(^|;)\s*color:\s*var\(--warn\)\s*;/);
    expect(bodies[0]).toMatch(/font-weight:\s*var\(--fw-bold\)\s*;/);
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

// ── Phase 2d · split ──
describe("TableCard — the table open in the counter's pane", () => {
  const mountCard = (selected: boolean) =>
    render(
      <TableCard
        table={{ ...SETTLED, tableNumber: 7, label: "T7" }}
        serverNow={SETTLED.lastActivityAt}
        thresholds={TH}
        lang="en"
        frozen={false}
        selected={selected}
      />,
    );
  it("selected: aria-current, and the lit cap's host holds exactly the table's NAME", () => {
    mountCard(true);
    expect(card().getAttribute("aria-current")).toBe("true");
    expect(card().classList.contains("floor-card")).toBe(true);
    expect(card().querySelector(".floor-card-label")!.textContent).toBe("Table 7");
  });
  it("unselected: no attribute (MUTATION: always set — every card reads as the open one; red)", () => {
    mountCard(false);
    expect(card().hasAttribute("aria-current")).toBe(false);
  });
});
