/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The chime as the board sees it: whether the TV's browser lets it arm, and what it played. */
const chime = vi.hoisted(() => ({
  armOk: true,
  play: vi.fn(),
  armCalls: 0,
  /** A promise the arm waits on, so a case can tap again INSIDE the arm. */
  armGate: null as Promise<void> | null,
}));
vi.mock("@/lib/kds-sound", () => ({
  KdsChime: class {
    async arm() {
      chime.armCalls += 1;
      if (chime.armGate) await chime.armGate;
      return chime.armOk;
    }
    get armed() {
      return chime.armOk;
    }
    play(...a: unknown[]) {
      chime.play(...a);
    }
  },
}));

const { ReadyBoard } = await import("./ReadyBoard");
const { BRAND_NAME } = await import("@/lib/brand");
const { tf } = await import("@/lib/i18n/fill");
const { STAFF } = await import("@/lib/i18n/staff");
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { PULSE_RAIL_MIN_PARTIES } = await import("@/lib/board-pulse");
const { BOARD_FAIL_THRESHOLD } = await import("@/lib/board-poll");
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
    expect(PULSE_RAIL_MIN_PARTIES).toBeGreaterThan(1);
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

  describe("a stale board BLANKS the band, and only the band", () => {
    /**
     * ⚠️ THE ASYMMETRY IS THE POINT, and the first cut did not have it. `nextBoardStateOnFailure`
     * keeps `kind: "live"` and carries the whole snapshot forward after two misses, flipping only
     * `stale` — right for the Ready column, whose rows are a name and a pickup code and do not rot.
     * Every value in this band does: a count of what is on the wok NOW, an age in minutes, and a
     * `Food up` announcement whose five-minute window is enforced SERVER-side and therefore lapses
     * the instant the server stops answering. Carried, the wall reads `9 Oldest` and a lit-gold
     * `Table 3 · Food up` forty minutes into an outage, and a runner is sent to the pass for a plate
     * that went out half an hour ago.
     */
    const withOrder = () => ({
      orders: [{ code: "A1B2C3", name: "Nilar", status: "ready", readyAt: SERVER_NOW }],
      serverNow: SERVER_NOW,
      pulse: pulse(),
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps the Ready column and drops the kitchen numbers after the fail threshold", async () => {
      vi.useFakeTimers();
      let answering = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (!answering) throw new Error("network");
          return { status: 200, ok: true, json: async () => withOrder() };
        }),
      );
      const { container } = render(<ReadyBoard token="t" lang="en" />);
      // `act` around every advance: the poll's setState lands in a timer callback, and React 19
      // batches those outside act into a warning and an unflushed render.
      const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
      await tick(1);

      // Live: the band is showing real numbers and the announcement this test exists to expire.
      expect(container.querySelector(".orb-pulse-body")).not.toBeNull();
      expect(container.textContent).toContain("Food up");
      expect(container.textContent).toContain("A1B2C3");

      answering = false;
      // ONE miss under the threshold: still fresh, still showing. Asserted so the test cannot pass
      // by blanking the band on any failure at all.
      for (let i = 0; i < BOARD_FAIL_THRESHOLD - 1; i++) await tick(5_000);
      expect(container.querySelector(".orb-pulse-body")).not.toBeNull();

      await tick(5_000); // the miss that makes it stale
      expect(container.querySelector(".orb-pulse-body")).toBeNull();
      expect(container.textContent).not.toContain("Food up");
      // …and the note replaces it, so the band says it cannot read the kitchen rather than going
      // silently absent — the same `null`-is-unknown contract the route uses for a dropped read.
      expect(container.querySelector(".orb-pulse-note")).not.toBeNull();
      // The Ready column is untouched: this is not a blanket blank, it is a claim-by-claim one.
      expect(container.textContent).toContain("A1B2C3");
    });

    it("drops the wait minutes with the band — a stale count would tick on for hours (Codex round 1 on A4·1)", async () => {
      // `readyMinutes` is a server-derived age, and an age rots exactly as the pulse's do: carried
      // through an outage, a bag reads "5 min" an hour later while the note beside it says the
      // board is reconnecting. The name and code stay (they do not rot); the count goes.
      vi.useFakeTimers();
      let answering = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (!answering) throw new Error("network");
          return {
            status: 200,
            ok: true,
            json: async () => ({
              orders: [
                {
                  code: "A1B2C3",
                  name: "Nilar",
                  status: "ready",
                  readyAt: SERVER_NOW,
                  readyMinutes: 5,
                },
              ],
              serverNow: SERVER_NOW,
              pulse: pulse(),
            }),
          };
        }),
      );
      const { container } = render(<ReadyBoard token="t" lang="en" />);
      const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
      await tick(1);
      expect(container.querySelector(".orb-wait")?.textContent).toBe("5 min");

      answering = false;
      for (let i = 0; i < BOARD_FAIL_THRESHOLD; i++) await tick(5_000);
      expect(container.textContent).toContain("A1B2C3");
      expect(container.querySelector(".orb-wait")).toBeNull();
    });
  });
});

/** A poll sequence: each call to `fetch` answers the next body in the list (the last one repeats). */
function pollSequence(bodies: object[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = bodies[Math.min(i, bodies.length - 1)]!;
      i += 1;
      return {
        status: 200,
        ok: true,
        json: async () => ({ serverNow: SERVER_NOW, pulse: pulse(), ...body }),
      };
    }),
  );
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const order = (code: string, status: "preparing" | "ready", readyMinutes?: number) => ({
  code,
  name: `Guest ${code}`,
  status,
  readyAt: status === "ready" ? SERVER_NOW : null,
  ...(readyMinutes === undefined ? {} : { readyMinutes }),
});

describe("board-1 — the rush cut: a column shows what fits and says what it hid", () => {
  /**
   * A 600px list whose rows are 100px: six slots. jsdom measures nothing, so the boxes are ours —
   * and a CONSTANT list box is honest only because `.orb-col ul` is `flex: 1 1 auto` (pinned in
   * the stylesheet block below): the real box is the column's remaining height whatever the list
   * holds. A content-sized box would shrink with every row the cut removed, and this fixture would
   * have stayed green through exactly that loop (the blind pass, slice 5).
   *
   * The observer is driven, not silenced: `fire(el)` runs every observer WATCHING `el`, as a real
   * one would on that element's resize — and only those, so a target the hook forgot to observe
   * stays silent, which is the defect the re-measure case induces.
   */
  const boxes = { ul: 600, li: 100 };
  function stubBoxes() {
    const observers: { cb: ResizeObserverCallback; targets: Set<Element> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        o: { cb: ResizeObserverCallback; targets: Set<Element> };
        constructor(cb: ResizeObserverCallback) {
          this.o = { cb, targets: new Set() };
          observers.push(this.o);
        }
        observe(el: Element) {
          this.o.targets.add(el);
        }
        unobserve(el: Element) {
          this.o.targets.delete(el);
        }
        disconnect() {
          this.o.targets.clear();
        }
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const height = this.tagName === "UL" ? boxes.ul : this.tagName === "LI" ? boxes.li : 0;
      return {
        height,
        width: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    });
    return (el: Element) =>
      act(async () => {
        for (const o of observers) if (o.targets.has(el)) o.cb([], o as unknown as ResizeObserver);
      });
  }
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    boxes.ul = 600;
    boxes.li = 100;
  });

  it("nine ready bags on six slots: five cards and a `+4 more` row, inside the list", async () => {
    stubBoxes();
    const codes = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
    await renderBoard("en", undefined, { orders: codes.map((c) => order(c, "ready")) });
    const readyCol = () => screen.getByRole("region", { name: "Ready" });
    await waitFor(() => expect(readyCol().querySelectorAll(".orb-card")).toHaveLength(5));
    // MUTATION: `shown = cap` in boardColumnFit — six cards and the row pushed past the box, red.
    const more = readyCol().querySelector("ul > li.orb-more");
    expect(more?.textContent).toBe(tf("en", "kds.more", { n: 4 }));
    // The row is the list's LAST item, so the box the fit measured is the box it fills.
    expect(readyCol().querySelector("ul")!.lastElementChild).toBe(more);
  });

  it("an unmeasured column (no boxes) shows everything and no row", async () => {
    await renderBoard("en", undefined, {
      orders: ["B1", "B2", "B3"].map((c) => order(c, "ready")),
    });
    await waitFor(() => expect(document.querySelectorAll(".orb-card")).toHaveLength(3));
    expect(document.querySelector(".orb-more")).toBeNull();
  });

  it("re-measures on a resize of the list OR of a row — a zoomed TV, a late Padauk load — not only on a poll", async () => {
    const fire = stubBoxes();
    const codes = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
    await renderBoard("en", undefined, { orders: codes.map((c) => order(c, "ready")) });
    const readyCol = () => screen.getByRole("region", { name: "Ready" });
    const cards = () => readyCol().querySelectorAll(".orb-card");
    const more = () => readyCol().querySelector("li.orb-more")?.textContent;
    await waitFor(() => expect(cards()).toHaveLength(5));
    boxes.ul = 300; // the TV zoomed in: three slots now
    // MUTATION: drop `ro.observe(ul)` — five cards stay on a three-slot list, two of them clipped
    // in silence until the next snapshot changes the array; red.
    await fire(readyCol().querySelector("ul")!);
    expect(cards()).toHaveLength(2);
    expect(more()).toBe(tf("en", "kds.more", { n: 7 }));
    boxes.li = 150; // Padauk landed late and the rows grew: two slots
    // MUTATION: drop `for (const r of rows()) ro.observe(r)` — the rows grew and the count did not
    // (the list box is unchanged, so observing it alone cannot see this); red.
    await fire(readyCol().querySelector("li")!);
    expect(cards()).toHaveLength(1);
    expect(more()).toBe(tf("en", "kds.more", { n: 8 }));
  });

  it("Preparing leads with the bag about to come up — the route's newest-first order reversed", async () => {
    await renderBoard("en", undefined, {
      orders: [order("NEW", "preparing"), order("MID", "preparing"), order("OLD", "preparing")],
    });
    const prep = () => screen.getByRole("region", { name: "Preparing" });
    await waitFor(() => expect(prep().querySelectorAll(".orb-card")).toHaveLength(3));
    // MUTATION: drop `.reverse()` — the just-placed bag leads and the cut would hide the next one up; red.
    expect([...prep().querySelectorAll(".orb-card")].map((c) => c.textContent)).toEqual([
      "Guest OLD#OLD",
      "Guest MID#MID",
      "Guest NEW#NEW",
    ]);
  });
});

describe("board-4 — the sound chip is a toggle that stays", () => {
  afterEach(() => {
    vi.useRealTimers();
    chime.armOk = true;
    chime.armGate = null;
    chime.play.mockReset();
    chime.armCalls = 0;
  });

  it("arms on the first tap and STAYS, pressed and named `Sound on`; a second tap mutes and the next call-out is silent", async () => {
    vi.useFakeTimers();
    pollSequence([
      { orders: [order("C1", "preparing"), order("C2", "preparing")] },
      { orders: [order("C1", "ready"), order("C2", "preparing")] },
      { orders: [order("C1", "ready"), order("C2", "ready")] },
    ]);
    render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    const chip = () => screen.getByRole("button", { name: /Enable sound|Sound on/ });
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    chip().focus(); // a remote's OK lands on a focused control; a tap alone would not focus it
    await act(async () => {
      chip().click();
    });
    // MUTATION: `{!soundOn && (<button …` again — the control is gone the moment it works and the
    // focus with it; red (the last assertion of this case).
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(chip().textContent).toBe(STAFF["board.sound.on"].en);
    expect(chime.play).toHaveBeenCalledTimes(1); // the arming confirmation tone
    await tick(5_000); // C1 comes up
    expect(chime.play).toHaveBeenCalledTimes(2);
    await act(async () => {
      chip().click(); // mute
    });
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(chip().textContent).toBe(STAFF["board.sound"].en);
    await tick(5_000); // C2 comes up
    // MUTATION: drop `&& soundOnRef.current` from the poll — a muted wall chimes; red.
    expect(chime.play).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(chip()); // focus never left the element
  });

  it("a refused arm says so ONCE through the one status node, then the node goes back to the poll — and the chip stays live to try again", async () => {
    vi.useFakeTimers();
    chime.armOk = false;
    pollSequence([{ orders: [] }]);
    render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    const status = () => screen.getByRole("status");
    const before = status().textContent;
    await act(async () => {
      screen.getByRole("button", { name: "Enable sound" }).click();
    });
    // MUTATION: swallow the `false` again — nothing says why nothing happened; red.
    expect(status().textContent).toBe(STAFF["board.sound.refused"].en);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const chip = screen.getByRole("button", { name: "Enable sound" });
    expect(chip.getAttribute("aria-disabled")).toBeNull();
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await tick(6_000);
    // MUTATION: drop the timer — the refusal sits on the status line for the rest of the shift; red.
    expect(status().textContent).toBe(before);
    chime.armOk = true;
    await act(async () => {
      chip.click();
    });
    expect(chime.armCalls).toBe(2);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("two taps inside ONE arm play one confirmation tone — the second tap is refused, not queued", async () => {
    vi.useFakeTimers();
    let open!: () => void;
    chime.armGate = new Promise<void>((r) => {
      open = r;
    });
    pollSequence([{ orders: [] }]);
    render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    const chip = () => screen.getByRole("button", { name: /Enable sound|Sound on/ });
    await act(async () => {
      chip().click();
      chip().click(); // a remote's OK bounces; a nervous thumb taps twice
    });
    // MUTATION: drop the `arming` ref — both taps take the arm path, arm twice and, once the
    // browser answers, play the tone twice; red on either count.
    expect(chime.armCalls).toBe(1);
    await act(async () => {
      open();
    });
    expect(chime.play).toHaveBeenCalledTimes(1);
    expect(chip().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("board-2 · board-5 · board-7 — the tell, the tongue, the ceiling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a stale board carries `data-stale` on its root (the three-metre tell) and keeps its ONE status node", async () => {
    vi.useFakeTimers();
    let answering = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!answering) throw new Error("network");
        return {
          status: 200,
          ok: true,
          json: async () => ({
            orders: [order("D1", "ready", 3)],
            serverNow: SERVER_NOW,
            pulse: pulse(),
          }),
        };
      }),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    expect(container.querySelector(".orb-root[data-stale]")).toBeNull();
    answering = false;
    for (let i = 0; i < BOARD_FAIL_THRESHOLD; i++) await tick(5_000);
    // MUTATION: drop `data-stale={stale || undefined}` — a stale wall looks live at three metres; red.
    expect(container.querySelector(".orb-root[data-stale]")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("the unlinked screen speaks the console's tongue: no bare Latin outside the path, and the brand from the singleton", async () => {
    await renderBoard("my", { status: 401, body: { reason: "denied", error: "no" } });
    // Not the `.orb-empty` count: the LOADING tree has two of those as well (the columns' empties).
    await screen.findByText("/staff/login?next=/board");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(BRAND_NAME);
    // Every Latin run under the two refusal lines sits inside a `lang="en"` element (the path).
    // MUTATION: the bare English sentence again — a Latin text node with no `lang="en"` ancestor; red.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bare: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (!el.closest(".orb-empty")) continue;
      if (
        /[A-Za-z]/.test(n.textContent ?? "") &&
        el.closest("[lang]")?.getAttribute("lang") !== "en"
      )
        bare.push(n.textContent!);
    }
    expect(bare).toEqual([]);
    expect(document.querySelector('.orb-empty [lang="en"]')?.textContent).toBe(
      "/staff/login?next=/board",
    );
  });

  it("the unlinked wall's one action is a real sign-in link back to this board, not a printed path", async () => {
    await renderBoard("en", { status: 401, body: { reason: "denied", error: "no" } });
    // MUTATION: the CTA back to a `<p>` of prose (the pre-Phase-0 screen) — no link by that name; red.
    const cta = await screen.findByRole("link", { name: "Sign in to set up this screen" });
    expect(cta.getAttribute("href")).toBe("/staff/login?next=/board");
    // The typed-path fallback stays beneath it for a manager on another device.
    expect(screen.getByText(/Or open \/staff\/login\?next=\/board on this screen/)).toBeTruthy();
  });

  it('the mirror property: under an English board every Burmese run sits inside a `lang="my"` element', async () => {
    // The first block asserts no Latin under a Burmese mark; this is the other direction, so the
    // fix cannot regress into the mirror-image defect — a Myanmar-script text node with no
    // `lang="my"` ancestor is Burmese set in the Latin face and announced as English. Rendered
    // with a pulse AND a shelf so the headings' echoes, the rail, the table chips and the cards
    // all exist; the unlinked screen under `en` is English alone by `Chrome`'s rule 1 and would
    // satisfy this vacuously.
    await renderBoard("en", undefined, {
      orders: [order("F1", "ready", 5), order("F2", "preparing")],
      pulse: pulse(),
    });
    await waitFor(() => expect(document.querySelector(".orb-pulse-body")).not.toBeNull());
    await waitFor(() => expect(document.querySelectorAll(".orb-card")).toHaveLength(2));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bare: string[] = [];
    let marked = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/[\u1000-\u109F]/.test(n.textContent ?? "")) continue;
      if (n.parentElement!.closest("[lang]")?.getAttribute("lang") === "my") marked += 1;
      else bare.push(n.textContent!);
    }
    expect(bare).toEqual([]);
    expect(marked).toBeGreaterThan(0); // rule 1 — both tongues are on the wall under `en` too
  });

  it("the shelf wait has a ceiling on the wall: `Over an hour`, never `1440 min`", async () => {
    await renderBoard("en", undefined, {
      orders: [order("E1", "ready", 1440), order("E2", "ready", 5), order("E3", "ready", 0)],
    });
    await waitFor(() => expect(document.querySelectorAll(".orb-wait")).toHaveLength(3));
    const waits = [...document.querySelectorAll(".orb-wait")].map((w) => w.textContent);
    // MUTATION: render `tf(lang, "board.card.wait", { mins: wait })` again — `1440 min`; red.
    expect(waits).toEqual([
      STAFF["board.card.waitLong"].en,
      "5 min",
      STAFF["board.card.justNow"].en,
    ]);
  });
});

describe("board-1 · 6 · 9 — the stylesheet, parsed (comments stripped, at-rule bodies attributed, every depth)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  type Block = { prelude: string; body: string };
  function blocksOf(src: string): Block[] {
    const out: Block[] = [];
    let depth = 0;
    let prelude = "";
    let body = "";
    for (const ch of src) {
      if (ch === "{") {
        depth += 1;
        if (depth === 1) continue;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push({ prelude: prelude.trim(), body });
          prelude = "";
          body = "";
          continue;
        }
      }
      if (depth === 0) prelude += ch;
      else body += ch;
    }
    return out;
  }
  const RM = "@media (prefers-reduced-motion: reduce)";
  /**
   * Every block at ANY depth, each carrying the at-rule preludes above it. A rule moved under a
   * `@media` or `@supports` still ships, and a depth-1 walk could neither see it nor a breakpoint
   * override of the very declaration it pins — `.orb-root { height: auto }` under a `min-width`
   * query would have left the first cut of this block green (the blind pass, slice 5).
   */
  type Deep = Block & { under: string[] };
  function deep(src: string, under: string[] = []): Deep[] {
    return blocksOf(src).flatMap((b) => {
      const here = { ...b, under };
      // A `@keyframes` body holds keyframe selectors, not rules; every other at-rule nests rules.
      return b.prelude.startsWith("@") && !b.prelude.startsWith("@keyframes")
        ? [here, ...deep(b.body, [...under, b.prelude])]
        : [here];
    });
  }
  const all = deep(css);
  const selectors = (b: Block) => b.prelude.split(",").map((s) => s.trim());
  const decl = (b: Block, prop: string) =>
    b.body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.startsWith(`${prop}:`))
      .map((d) => d.slice(prop.length + 1).trim());
  /** The rule(s) that OWN a selector: at any depth, outside the reduced-motion companion. */
  const rule = (sel: string) =>
    all.filter((b) => selectors(b).includes(sel) && !b.under.includes(RM));
  /** The reduced-motion companion(s) of a selector. */
  const rm = (sel: string) => all.filter((b) => selectors(b).includes(sel) && b.under.includes(RM));
  /**
   * ONE live declaration of `prop` across every owner, or the test refuses: two would leave the
   * shipped value to cascade order, which this parser does not model — uniqueness is asserted,
   * never a position picked (`[0]` is how a guard reads the parked copy and blesses the live one).
   */
  const one = (sel: string, prop: string) => {
    const values = rule(sel).flatMap((b) => decl(b, prop));
    expect(values, `${sel} { ${prop} }`).toHaveLength(1);
    return values[0]!;
  };

  it("the root IS the screen and the band cannot be squeezed off it", () => {
    // MUTATION: `min-height: 100dvh` again — the root grows past the TV and the band leaves; red.
    expect(one(".orb-root", "height")).toBe("100dvh");
    expect(one(".orb-root", "overflow")).toBe("hidden");
    expect(one(".orb-pulse", "flex")).toBe("none");
  });

  it("board-1 — the list takes the column's REMAINING height, and every row is one line", () => {
    expect(one(".orb-col", "display")).toBe("flex");
    expect(one(".orb-col", "flex-direction")).toBe("column");
    // MUTATION: drop `flex: 1 1 auto` from `.orb-col ul` — the box is content-sized, the fit reads
    // its own output back, and an overflowing column never settles; red.
    expect(one(".orb-col ul", "flex")).toMatch(/^1\b/);
    expect(one(".orb-col ul", "overflow")).toBe("hidden");
    // MUTATION: drop `white-space: nowrap` from `.orb-name` — a long name wraps to two lines and the
    // one-row-height division pushes the `+N more` row under the clip in silence; red.
    expect(one(".orb-name", "white-space")).toBe("nowrap");
    expect(one(".orb-name", "text-overflow")).toBe("ellipsis");
    expect(one(".orb-name", "min-width")).toBe("0");
  });

  it("the flash animates opacity on an overlay BEHIND the text, never the card's paint, and reduced motion hides it", () => {
    const kf = all.filter((b) => b.prelude === "@keyframes orbFlash");
    expect(kf).toHaveLength(1);
    // MUTATION: animate `background` in the keyframes again — red.
    expect(kf[0]!.body).toMatch(/opacity/);
    expect(kf[0]!.body).not.toMatch(/background/);
    expect(one(".orb-card-flash::before", "animation")).toMatch(/^orbFlash\b/);
    // MUTATION: drop `z-index: -1` (or the card's `isolation: isolate`) — the overlay paints OVER
    // the name and the code for the two seconds a guest is looking for exactly those; red.
    expect(one(".orb-card-flash::before", "z-index")).toBe("-1");
    expect(one(".orb-card", "isolation")).toBe("isolate");
    expect(one(".orb-card", "position")).toBe("relative");
    expect(rm(".orb-card-flash::before").flatMap((b) => decl(b, "display"))).toEqual(["none"]);
  });

  it("board-6 — the READY heading keeps gold on its TEXT alone; the rule under both headings is a hairline", () => {
    // The always-on posture's burn-in half: a 2px full-brightness gold rule lit 12h a day. The
    // drift that was drafted beside it is withdrawn (an auto-motion with no pause control on a
    // screen with no pointer), so the hairline is the whole of board-6 and it is pinned here.
    // MUTATION: `border-bottom: 2px solid var(--gold)` on `.orb-col-ready h2` again — red.
    expect(one(".orb-col h2", "border-bottom")).toBe("1px solid var(--bd)");
    expect(rule(".orb-col-ready h2").flatMap((b) => decl(b, "border-bottom"))).toEqual([]);
    expect(one(".orb-col-ready h2", "color")).toBe("var(--gold)");
    for (const sel of [".orb-head", ".orb-cols", ".orb-pulse"])
      expect(
        rule(sel).flatMap((b) => decl(b, "animation")),
        sel,
      ).toEqual([]);
  });

  it("the `Food up` chip wears the shared cap (one fill block names it) and its ink follows the fill", () => {
    const fills = rule(".orb-table-up").filter((b) => decl(b, "background").length);
    expect(fills).toHaveLength(1);
    expect(fills[0]!.prelude).toContain('.kds-chip[aria-pressed="true"]');
    // MUTATION: `color: var(--gold)` on the runs again — gold on gold; red.
    expect(one(".orb-table-up .orb-table-no", "color")).toBe("var(--oa)");
    expect(one(".orb-table-up .orb-table-state", "color")).toBe("var(--oa)");
  });

  it("name + code are one identity: the code's auto margin, no three-way space-between", () => {
    expect(one(".orb-code", "margin-right")).toBe("auto");
    expect(rule(".orb-card").flatMap((b) => decl(b, "justify-content"))).toEqual([]);
  });
});
