/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kds-sound", () => ({ KdsChime: class {} }));

const { ReadyBoard } = await import("./ReadyBoard");
const { PULSE_RAIL_MIN_TICKETS } = await import("@/lib/board-pulse");
type BoardPulse = import("@/lib/board-pulse").BoardPulse;

/**
 * P2 · G12 — the wall TV.
 *
 * Two rules this suite exists for:
 *
 * 1. **Both tongues are ALWAYS on the wall.** The dining room is mixed and the screen cannot choose
 *    for it; `lang` decides only which one leads. A conversion that renders `ts(lang, …)` alone
 *    would look right on whichever language the author tested and silently drop the other half.
 * 2. **A refusal renders OUR copy, keyed on the reason** — never the server's English sentence
 *    translated, which is impossible, and never a Burmese sentence invented for a reason this client
 *    has not learned. An English sentence that is true beats a Burmese one that is guessed.
 */
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ orders: [] }) })),
  );
});

const SERVER_NOW = "2026-09-05T19:00:00.000Z";

const pulse = (over: Partial<BoardPulse> = {}): BoardPulse => ({
  tickets: 3,
  oldestMinutes: 9,
  allDay: [{ name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", qty: 4 }],
  allDayMore: 0,
  tables: [
    { table: 2, status: "cooking" },
    { table: 3, status: "up" },
  ],
  ...over,
});

const PREPARING_MY = "ပြင်ဆင်နေသည်";
const READY_MY = "ယူသွားနိုင်ပါပြီ";

async function renderBoard(
  lang: "en" | "my",
  refusal?: { status: number; body: unknown },
  body?: { orders?: unknown[]; pulse?: BoardPulse | null; serverNow?: string },
) {
  if (refusal)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: refusal.status,
        ok: false,
        json: async () => refusal.body,
      })),
    );
  else if (body)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ orders: [], serverNow: SERVER_NOW, ...body }),
      })),
    );
  const out = render(<ReadyBoard token="t" lang={lang} />);
  return out;
}

/**
 * Render a live board carrying a pulse, and wait for the FIRST POLL to land.
 *
 * ⚠️ Not `findByRole("region")`: the band's heading mounts immediately, before any poll, so waiting
 * on the region resolves against the LOADING board and every assertion below it then races the
 * fetch. The band's body (or its note) is the first thing that exists only once a snapshot has
 * arrived, so that is what the wait is anchored to.
 */
async function renderPulse(lang: "en" | "my", p: BoardPulse | null) {
  const out = await renderBoard(lang, undefined, { pulse: p });
  await waitFor(() =>
    expect(out.container.querySelector(".orb-pulse-body, .orb-pulse-note")).not.toBeNull(),
  );
  return out;
}

describe("the two column headings", () => {
  /**
   * The rule both cases below share, and the defect they were rewritten for: the `<h2>` carries
   * BOTH tongues, so it must carry NO `lang` of its own, and each half must be marked for what IT
   * contains. The first cut put `lang="my"` on the heading itself under a Burmese board, which
   * nested the English echo inside a Burmese element — Padauk type and a Burmese announcement for an
   * English word, the very thing `Chrome`'s rule 2 forbids. Asserted in BOTH directions so the fix
   * cannot regress into the mirror-image bug.
   */
  function halves(h2: HTMLElement) {
    const small = h2.querySelector("small")!;
    const lead = [...h2.children].find((c) => c !== small) as HTMLElement;
    return { lead, small };
  }

  it("English leads, Burmese follows — and BOTH are present", async () => {
    const { container } = await renderBoard("en");
    const heads = [...container.querySelectorAll<HTMLElement>(".orb-col h2")];
    expect(heads).toHaveLength(2);
    expect(heads[0]!.textContent).toContain("Preparing");
    expect(heads[0]!.textContent).toContain(PREPARING_MY);
    expect(heads[1]!.textContent).toContain("Ready");
    expect(heads[1]!.textContent).toContain(READY_MY);
    const { lead, small } = halves(heads[0]!);
    expect(lead.textContent).toBe("Preparing");
    expect(lead.hasAttribute("lang")).toBe(false); // English is the document's ambient tongue
    expect(small.getAttribute("lang")).toBe("my");
    expect(heads[0]!.hasAttribute("lang")).toBe(false);
  });

  it("Burmese leads, English follows — and BOTH are still present", async () => {
    const { container } = await renderBoard("my");
    const heads = [...container.querySelectorAll<HTMLElement>(".orb-col h2")];
    // The heading spans two tongues, so it carries neither mark; the CSS companion reaches the
    // Burmese half through a DESCENDANT selector and gives that half — and only it — Padauk.
    expect(heads[0]!.hasAttribute("lang")).toBe(false);
    const first = halves(heads[0]!);
    expect(first.lead.getAttribute("lang")).toBe("my");
    expect(first.lead.textContent).toBe(PREPARING_MY);
    expect(first.small.textContent).toBe("Preparing");
    expect(first.small.hasAttribute("lang")).toBe(false);
    const second = halves(heads[1]!);
    expect(second.lead.getAttribute("lang")).toBe("my");
    expect(second.lead.textContent).toBe(READY_MY);
    expect(second.small.textContent).toBe("Ready");
    expect(second.small.hasAttribute("lang")).toBe(false);
  });

  it('no English text ever sits inside a lang="my" element, in either direction', async () => {
    // The rule stated as a property rather than a shape, so a future heading refactor is held to it
    // too: everything under a Burmese mark must be Myanmar script.
    for (const lang of ["en", "my"] as const) {
      cleanup();
      const { container } = await renderBoard(lang);
      const marked = [...container.querySelectorAll('[lang="my"]')];
      expect(marked.length).toBeGreaterThan(0);
      for (const el of marked) expect(el.textContent ?? "").not.toMatch(/[A-Za-z]/);
    }
  });
});

describe("a refusal renders our copy, keyed on the reason", () => {
  it("a DENIED board says so in Burmese", async () => {
    await renderBoard("my", { status: 401, body: { reason: "denied", error: "Unauthorized" } });
    const p = await screen.findByText((t) => t.includes("ခွင့်မပြု"));
    expect(p.getAttribute("lang")).toBe("my");
    // Not the server's English sentence.
    expect(p.textContent).not.toContain("Unauthorized");
  });

  it("an UNCONFIGURED board says something different — the two refusals need different actions", async () => {
    await renderBoard("my", { status: 503, body: { reason: "not_configured" } });
    const p = await screen.findByText((t) => t.includes("မပြင်ဆင်ရသေး"));
    expect(p).toBeTruthy();
  });

  it("renders OUR sentence, not the server's — even in English", async () => {
    // The server's `error` is its own wording for an operator reading logs; the screen has its own
    // copy for the room. There is deliberately no third branch: `readBoardRefusal` yields a verdict
    // only for a (status, reason) pair this client knows, so a reason invented later is a `retry`
    // and never reaches this screen at all.
    await renderBoard("en", { status: 401, body: { reason: "denied", error: "Custom refusal" } });
    await waitFor(() =>
      expect(
        screen.getByText("This screen isn’t authorized for the order-ready board."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Custom refusal")).toBeNull();
  });
});

describe("the status line", () => {
  it("speaks one language only — a bilingual live region says everything twice", async () => {
    const { container } = await renderBoard("my");
    await waitFor(() => {
      const status = container.querySelector('.orb-status[role="status"]')!;
      expect(status.getAttribute("lang")).toBe("my");
    });
    // Exactly one polite region on the page.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });
});

describe("P6 — the kitchen pulse band", () => {
  /**
   * The band's whole subject is what a room full of guests can read off a wall. So these assert the
   * ANSWER on screen, not the payload: the payload is already pinned in `lib/board-pulse.test.ts`
   * and `app/api/board/route.test.ts`, and a client that quietly rendered a field the shaper
   * withheld — or invented a sentence for a state it does not know — would pass both of those.
   */
  it("shows the table strip by number and status, and never a dish beside a table", async () => {
    const { container } = await renderPulse("en", pulse());
    const chips = [...container.querySelectorAll(".orb-table")].map((c) => c.textContent);
    expect(chips).toEqual(["Table 2Cooking", "Table 3Food up"]);
    // NOT "Ready". Nothing records that a plate reached a table — `bumped_at` means the pass
    // finished the food — and on a screen a dining room reads, "Ready" is an instruction aimed at a
    // guest who has nothing to do about it. The word must stay what the stamp supports.
    expect(container.textContent).not.toMatch(/Table 3\s*Ready/);
    // The lit-gold cap marks only the table a runner must act on — the ONE selection vocabulary.
    expect(container.querySelectorAll(".orb-table-up")).toHaveLength(1);
    expect(container.querySelector(".orb-table-up")!.textContent).toContain("Table 3");
  });

  it("renders the oldest age the SERVER measured, and does no clock arithmetic of its own", async () => {
    const { container } = await renderPulse("en", pulse());
    const stats = [...container.querySelectorAll(".orb-stat")].map((s) => s.textContent);
    expect(stats).toEqual(["3Cooking", "9Oldest (min)"]);
  });

  it("says nothing about an age the server could not measure", async () => {
    const { container } = await renderPulse("en", pulse({ tickets: 1, oldestMinutes: null }));
    expect(container.querySelectorAll(".orb-stat")[1]!.textContent).toBe("—Oldest (min)");
  });

  it("renders no rail at all when the route withheld it", async () => {
    // The exposure floor is enforced server-side; this is the client half of the same fact — an
    // empty `allDay` must mount nothing rather than an empty list that reads as "no dishes".
    const { container } = await renderPulse("en", pulse({ allDay: [], allDayMore: 0 }));
    expect(container.querySelector(".orb-rail")).toBeNull();
    expect(PULSE_RAIL_MIN_TICKETS).toBeGreaterThan(1);
  });

  it("says how many rail rows the cap dropped, rather than truncating in silence", async () => {
    const { container } = await renderPulse("en", pulse({ allDayMore: 3 }));
    expect(container.querySelector(".orb-rail-more")!.textContent).toBe("+3 more");
  });

  it("a NULL pulse says it cannot read the kitchen — it never draws an empty band", async () => {
    // The lie this exists to refuse: `{tickets: 0}` over a full wok. `null` is "we could not ask".
    const { container } = await renderPulse("my", null);
    const note = container.querySelector(".orb-pulse-note")!;
    expect(note.textContent).toContain("မဖတ်နိုင်သေး");
    expect(container.querySelector(".orb-pulse-stats")).toBeNull();
  });

  it("a genuinely quiet kitchen says ALL CLEAR, which is a different sentence", async () => {
    const { container } = await renderPulse("en", pulse({ tickets: 0, allDay: [], tables: [] }));
    expect(container.querySelector(".orb-pulse-note")!.textContent).toBe("All clear");
  });

  it("adds no second live region — a wall that announces twice announces nothing", async () => {
    const { container } = await renderPulse("my", pulse());
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("names every region and list it adds", async () => {
    await renderPulse("en", pulse());
    expect(screen.getByRole("region", { name: "Kitchen" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Table status" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "All-day counts" })).toBeTruthy();
  });

  describe("the bilingual rules hold on the new markup too", () => {
    /**
     * ⚠️ THE REASON THESE RE-RUN THE PROPERTY ABOVE. The `lang="my"` sweep in the first block renders
     * a board whose poll returns `{orders: []}` and NO pulse — so it never saw one byte of this band
     * and would have stayed green through every typographic defect in it. A guard that cannot reach
     * the code it guards is decorative; this is the same property, aimed at markup that exists.
     */
    it('no English text sits inside a lang="my" element, in ANY state the band can mount', async () => {
      // ⚠️ Swept over every branch rather than the one fixture the first draft used. A property
      // test only holds for the markup it actually renders, and three of these states — the
      // overflow line, the outage note and the all-clear note — mount elements no other case does.
      const states: (BoardPulse | null)[] = [
        pulse(),
        pulse({ allDayMore: 3 }),
        pulse({ allDay: [{ name: "Mohinga", nameMy: null, qty: 4 }] }),
        pulse({ tickets: 0, allDay: [], tables: [] }),
        pulse({ oldestMinutes: null }),
        null,
      ];
      for (const lang of ["en", "my"] as const) {
        for (const state of states) {
          cleanup();
          const { container } = await renderPulse(lang, state);
          const marked = [...container.querySelectorAll('[lang="my"]')];
          expect(marked.length).toBeGreaterThan(0);
          for (const el of marked) expect(el.textContent ?? "").not.toMatch(/[A-Za-z]/);
        }
      }
    });

    it("a dish with NO catalog Burmese renders its English name unmarked, never in Padauk", async () => {
      // The render rule the data layer cannot enforce: `nameMy: null` means the rail shows the
      // English snapshot ALONE. `{my ?? en}` under a Burmese mark is the exact defect P1's blind
      // pass rejected one screen over, and it is invisible to every data-layer guard.
      const { container } = await renderPulse(
        "my",
        pulse({
          allDay: [{ name: "Mohinga", nameMy: null, qty: 4 }],
        }),
      );
      const name = container.querySelector(".orb-rail-name")!;
      expect(name.textContent).toBe("Mohinga");
      expect(name.querySelector('[lang="my"]')).toBeNull();
      expect(name.querySelector("small")).toBeNull();
    });

    it("a dish WITH catalog Burmese carries both tongues, each marked for what it holds", async () => {
      const { container } = await renderPulse("my", pulse());
      const name = container.querySelector(".orb-rail-name")!;
      expect(name.querySelector('[lang="my"]')!.textContent).toBe("မုန့်ဟင်းခါး");
      expect(name.querySelector("small")!.textContent).toBe("Mohinga");
      expect(name.querySelector("small")!.hasAttribute("lang")).toBe(false);
    });

    it("the table number stays LATIN inside a Burmese chip", async () => {
      // `{id}` is an identifier slot, never a count: a tent card reads `3`, so the wall must too.
      const { container } = await renderPulse("my", pulse());
      const chip = container.querySelector(".orb-table")!;
      expect(chip.textContent).toContain("2");
      expect(chip.textContent).not.toContain("၂");
      expect(chip.querySelector('[lang="en"]')!.textContent).toBe("2");
    });
  });
});
