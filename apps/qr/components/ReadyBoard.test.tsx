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
// The fit's start is SPIED, never changed: how many times a snapshot re-fits from the top is the
// measure of the step-down's cost on a TV (the blind pass on #336).
const fitStarts = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/board-fit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/board-fit")>();
  return {
    ...actual,
    tablesFitStart: (n: number) => {
      fitStarts.n += 1;
      return actual.tablesFitStart(n);
    },
  };
});
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
const { BOARD_FAIL_THRESHOLD, FROZEN_TABLES_MS } = await import("@/lib/board-poll");
type BoardTable = import("@/lib/board-tables").BoardTable;
type BoardDish = import("@/lib/board-tables").BoardDish;

/**
 * P2 · G12 · PD9 — the wall TV.
 *
 * The rules this suite exists for:
 *
 * 1. **Both tongues are ALWAYS on the wall.** The dining room is mixed and the screen cannot choose
 *    for it; `lang` decides only which one leads.
 * 2. **A refusal renders OUR copy, keyed on the reason** — never the server's English sentence.
 * 3. **PD9 — the wall shows only what the payload carries, and never nags.** A table number and dish
 *    names, each dish's stage word; no guest name, no count, no age. A stale wall drops every stage
 *    and says so; a first read, a revisit and a frozen spell celebrate nothing.
 */
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ orders: [], tables: [] }) })),
  );
});

const SERVER_NOW = "2026-09-05T19:00:00.000Z";

const dish = (over: Partial<BoardDish> = {}): BoardDish => ({
  name: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  stage: "cooking",
  togo: false,
  ...over,
});
const tableOf = (n: number, dishes: BoardDish[], over: Partial<BoardTable> = {}): BoardTable => ({
  table: n,
  out: dishes.every((d) => d.stage === "served"),
  rounds: [{ n: 1, next: false, dishes }],
  ...over,
});

const PREPARING_MY = "ပြင်ဆင်နေသည်";
const READY_MY = "ယူသွားနိုင်ပါပြီ";

async function renderBoard(
  lang: "en" | "my",
  refusal?: { status: number; body: unknown },
  body?: {
    orders?: unknown[];
    tables?: BoardTable[] | null;
    kitchenIdle?: boolean | null;
    serverNow?: string;
  },
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
        json: async () => ({ orders: [], tables: [], serverNow: SERVER_NOW, ...body }),
      })),
    );
  const out = render(<ReadyBoard token="t" lang={lang} />);
  return out;
}

/** Render a live board with tables, and wait for the FIRST POLL to land (a pass, or a sentence). */
async function renderTables(
  lang: "en" | "my",
  tables: BoardTable[] | null,
  extra: { kitchenIdle?: boolean | null; orders?: unknown[] } = {},
) {
  // The route's answer: an empty read is an idle kitchen unless the case says otherwise.
  const out = await renderBoard(lang, undefined, {
    tables,
    kitchenIdle: tables !== null && tables.length === 0 ? true : null,
    ...extra,
  });
  await waitFor(() =>
    expect(
      out.container.querySelector(
        ".orb-passes, .orb-kitchen-note, .orb-kitchen .orb-empty, .orb-col li",
      ),
    ).not.toBeNull(),
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
    // PD9 — Ready leads the pickup column (the room's one call), Preparing beneath it.
    const heads = [...container.querySelectorAll<HTMLElement>(".orb-col h2")];
    expect(heads).toHaveLength(2);
    expect(heads[1]!.textContent).toContain("Preparing");
    expect(heads[1]!.textContent).toContain(PREPARING_MY);
    expect(heads[0]!.textContent).toContain("Ready");
    expect(heads[0]!.textContent).toContain(READY_MY);
    const { lead, small } = halves(heads[1]!);
    expect(lead.textContent).toBe("Preparing");
    expect(lead.hasAttribute("lang")).toBe(false); // English is the document's ambient tongue
    expect(small.getAttribute("lang")).toBe("my");
    expect(heads[1]!.hasAttribute("lang")).toBe(false);
  });

  it("Burmese leads, English follows — and BOTH are still present", async () => {
    const { container } = await renderBoard("my");
    const heads = [...container.querySelectorAll<HTMLElement>(".orb-col h2")];
    // The heading spans two tongues, so it carries neither mark; the CSS companion reaches the
    // Burmese half through a DESCENDANT selector and gives that half — and only it — Padauk.
    expect(heads[1]!.hasAttribute("lang")).toBe(false);
    const first = halves(heads[1]!);
    expect(first.lead.getAttribute("lang")).toBe("my");
    expect(first.lead.textContent).toBe(PREPARING_MY);
    expect(first.small.textContent).toBe("Preparing");
    expect(first.small.hasAttribute("lang")).toBe(false);
    const second = halves(heads[0]!);
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
        screen.getByText("This screen isn’t allowed to show the order-ready board."),
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
        json: async () => ({ serverNow: SERVER_NOW, orders: [], tables: [], ...body }),
      };
    }),
  );
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
/** A bag as the route publishes it since PD9: its code and its status — no name, no wait. */
const order = (code: string, status: "preparing" | "ready") => ({ code, status });

describe("PD9 — the kitchen half: every table's food, dish by dish", () => {
  /**
   * The subject is what a room full of guests reads off a wall. So these assert the ANSWER on
   * screen: the payload is pinned in `lib/board-tables.test.ts` and the route's suite, and a client
   * that drew a field the shaper withheld, or a sentence for a state it does not know, passes both.
   */
  it("each table is a pass: the figure once under 'စားပွဲ · Table', its dishes in both tongues, ONE stage word in the lead tongue", async () => {
    const { container } = await renderTables("my", [
      tableOf(4, [dish(), dish({ name: "Tea", nameMy: "လက်ဖက်ရည်", stage: "sent" })]),
    ]);
    const pass = container.querySelector<HTMLElement>(".orb-passes > li.ui-pass")!;
    expect(pass.getAttribute("data-tier")).toBe("tv");
    expect(pass.getAttribute("data-orientation")).toBe("landscape");
    expect(pass.querySelector(".ui-pass-figure")!.textContent).toBe("4");
    // The heading names the pass ONCE, in the lead tongue (the two-tongue label is decorative).
    expect(pass.querySelector("h3")!.textContent).toContain(STAFF["board.pass.table"].my);
    const rows = [...pass.querySelectorAll(".orb-dish")];
    expect(rows.map((r) => r.querySelector(".orb-dish-my")?.textContent)).toEqual([
      "မုန့်ဟင်းခါး",
      "လက်ဖက်ရည်",
    ]);
    expect(rows.map((r) => r.querySelector(".orb-dish-en")?.textContent)).toEqual([
      "Mohinga",
      "Tea",
    ]);
    // ONE word per row, the lead tongue only (two scripts cannot stack in a chip).
    expect(rows.map((r) => r.querySelector(".ui-track-word")!.textContent)).toEqual([
      STAFF["table.line.state.inProgress"].my,
      STAFF["table.line.state.fired"].my,
    ]);
    expect(rows[0]!.querySelector(".ui-track")!.getAttribute("data-stage")).toBe("cooking");
  });

  it("dish names keep Burmese on top under an ENGLISH board too; a dish with no catalog Burmese draws its English alone, unmarked", async () => {
    const { container } = await renderTables("en", [
      tableOf(2, [dish(), dish({ name: "Faluda", nameMy: null })]),
    ]);
    const [withMy, enOnly] = [...container.querySelectorAll(".orb-dish")];
    expect(withMy!.querySelector(".orb-dish-my")!.getAttribute("lang")).toBe("my");
    expect(withMy!.querySelector(".orb-dish-en")!.textContent).toBe("Mohinga");
    expect(enOnly!.querySelector(".orb-dish-my")).toBeNull();
    expect(enOnly!.querySelector(".orb-dish-lead")!.textContent).toBe("Faluda");
    expect(enOnly!.querySelector(".orb-dish-lead")!.hasAttribute("lang")).toBe(false);
    expect(withMy!.querySelector(".ui-track-word")!.textContent).toBe(
      STAFF["table.line.state.inProgress"].en,
    );
  });

  it("a to-go dish wears the KDS's 'To-go' tag beside its name", async () => {
    const { container } = await renderTables("en", [tableOf(3, [dish({ togo: true })])]);
    expect(container.querySelector(".orb-togo")!.textContent).toBe(STAFF["kds.channel.togo"].en);
  });

  it("round 2 wears the stub with a LATIN digit, round 1 none, an unknown later round 'next round' (`board-wall/stub-on-round-one`)", async () => {
    const { container } = await renderTables("my", [
      {
        table: 4,
        out: false,
        rounds: [
          { n: 1, next: false, dishes: [dish()] },
          {
            n: 2,
            next: false,
            dishes: [dish({ name: "Tea", nameMy: "လက်ဖက်ရည်", stage: "sent" })],
          },
          { n: null, next: true, dishes: [dish({ name: "Sago", nameMy: null, stage: "sent" })] },
        ],
      },
    ]);
    const stubs = [...container.querySelectorAll(".orb-round")];
    expect(stubs).toHaveLength(2);
    expect(stubs[0]!.textContent).toBe(tf("my", "kds.round", { id: 2 }));
    expect(stubs[0]!.querySelector('[lang="en"]')?.textContent).toBe("2");
    expect(stubs[1]!.textContent).toBe(STAFF["kds.round.next"].my);
    // Each round's list is named for its table and round.
    const lists = [...container.querySelectorAll("ul.orb-dishes")].map((u) =>
      u.getAttribute("aria-label"),
    );
    expect(lists[1]).toContain(tf("my", "kds.round", { id: 2 }));
  });

  it("a table ALL served carries the one roll-up in its status cell, and its rows drop their tracks — no fact marked twice (`board-wall/rows-keep-tracks-when-out`)", async () => {
    const { container } = await renderTables("en", [
      tableOf(5, [
        dish({ stage: "served" }),
        dish({ name: "Faluda", nameMy: null, stage: "served" }),
      ]),
    ]);
    const pass = container.querySelector(".orb-passes > li.ui-pass")!;
    const head = pass.querySelector(".ui-pass-status .ui-track")!;
    expect(head.getAttribute("data-stage")).toBe("served");
    expect(head.textContent).toBe(STAFF["table.line.state.served"].en);
    expect(pass.querySelectorAll(".orb-dish .ui-track")).toHaveLength(0);
    // Never a ✓ on the TV, and never gold on a table.
    expect(pass.querySelector(".ui-pass-stamp")).toBeNull();
    expect(container.querySelector(".orb-table-up")).toBeNull();
  });

  it("the passes run by NUMBER down the left column then the right — the break by index, never by status", async () => {
    const { container } = await renderTables("en", [
      tableOf(2, [dish()]),
      tableOf(3, [dish({ stage: "served" })]),
      tableOf(5, [dish()]),
      tableOf(7, [dish()]),
      tableOf(9, [dish()]),
    ]);
    const passes = [...container.querySelectorAll<HTMLElement>(".orb-passes > li.ui-pass")];
    expect(passes.map((p) => p.querySelector(".ui-pass-figure")!.textContent)).toEqual([
      "2",
      "3",
      "5",
      "7",
      "9",
    ]);
    expect(passes.map((p) => p.classList.contains("orb-pass-break"))).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it("an empty kitchen says ALL CLEAR under the key; an UNREADABLE one says it cannot read the kitchen, never 'all clear' (`board-wall/unread-kitchen-reads-all-clear`)", async () => {
    const quiet = await renderTables("en", []);
    expect(quiet.container.querySelector(".orb-kitchen .orb-empty")!.textContent).toBe(
      STAFF["kds.allclear"].en,
    );
    expect(quiet.container.querySelector(".orb-key")).not.toBeNull();
    cleanup();
    const blind = await renderTables("en", null);
    expect(blind.container.querySelector(".orb-kitchen-note")!.textContent).toBe(
      STAFF["board.pulse.unavailable"].en,
    );
    expect(blind.container.querySelector(".orb-key")).toBeNull();
    expect(blind.container.textContent).not.toContain(STAFF["kds.allclear"].en);
  });

  it("every dish list on a pass has its OWN accessible name — two unnumbered Sends are never two lists named alike (the blind pass on #336; `board-wall/list-names-repeat`)", async () => {
    // Round 1, then two Sends the round read numbered `none` (a to-go-only batch, settlement food).
    const { container } = await renderTables("en", [
      tableOf(4, [], {
        out: false,
        rounds: [
          { n: 1, next: false, dishes: [dish({ name: "Mohinga" })] },
          { n: null, next: false, dishes: [dish({ name: "Tea", togo: true })] },
          { n: null, next: false, dishes: [dish({ name: "Rice" })] },
        ],
      }),
    ]);
    const names = [...container.querySelectorAll(".orb-passes .orb-dishes")].map((l) =>
      l.getAttribute("aria-label"),
    );
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe(tf("en", "kds.a11y.lines", { x: tf("en", "kds.table", { id: "4" }) }));
  });

  it("NEVER 'All clear' over a busy kitchen: no table on the wall, but a pickup bag on the wok — the body says nothing, the key stays (the blind pass on #336; `board-wall/all-clear-over-a-busy-kitchen`)", async () => {
    const busy = await renderTables("en", [], {
      kitchenIdle: false,
      orders: [order("4C1A9E", "preparing")],
    });
    expect(busy.container.querySelector(".orb-key")).not.toBeNull();
    expect(busy.container.querySelector(".orb-kitchen .orb-empty")).toBeNull();
    expect(busy.container.querySelector(".orb-kitchen")!.textContent).not.toContain(
      STAFF["kds.allclear"].en,
    );
    cleanup();
    // An older server sends no `kitchenIdle` at all: unknown is never idle.
    const old = await renderTables("en", [], {
      kitchenIdle: undefined,
      orders: [order("4C1A9E", "preparing")],
    });
    expect(old.container.querySelector(".orb-kitchen .orb-empty")).toBeNull();
  });

  it("an OLDER server that sends no `tables` reads as unreadable — and a `name` it still sends is never drawn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          orders: [{ code: "A1B2C3", name: "Nilar", status: "ready", readyMinutes: 5 }],
          pulse: { tickets: 0 },
        }),
      })),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await waitFor(() => expect(container.querySelector(".orb-kitchen-note")).not.toBeNull());
    expect(container.textContent).toContain("#A1B2C3");
    expect(container.textContent).not.toContain("Nilar");
    expect(container.textContent).not.toContain("5 min");
  });

  it("the key teaches the three marks once, both tongues, aria-hidden; each row's own word carries its state", async () => {
    const { container } = await renderTables("en", [tableOf(4, [dish()])]);
    const key = container.querySelector(".orb-key")!;
    expect(key.getAttribute("aria-hidden")).toBe("true");
    expect([...key.querySelectorAll(".ui-track")].map((t) => t.getAttribute("data-stage"))).toEqual(
      ["sent", "cooking", "served"],
    );
    expect(key.textContent).toContain(STAFF["table.line.state.served"].en);
    expect(key.textContent).toContain(STAFF["table.line.state.served"].my);
    // The list of passes is named; one live region on the page.
    expect(screen.getByRole("list", { name: STAFF["board.a11y.tables"].en })).toBeTruthy();
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("nothing a guest's privacy forbids reaches the wall: no count, no price, no clock beside a dish", async () => {
    const { container } = await renderTables("en", [
      tableOf(4, [dish(), dish({ name: "Tea", nameMy: null })]),
    ]);
    const pass = container.querySelector(".orb-passes")!.textContent ?? "";
    expect(pass).not.toMatch(/×|\$|\d+\s*min|\d{1,2}:\d{2}/);
  });
});

describe("PD9 — the wall moves only when food changes state, one thing at a time", () => {
  afterEach(() => {
    vi.useRealTimers();
    chime.play.mockReset();
  });

  it("a first read celebrates nothing; a table whose last dish is served TURNs once, and never again that visit (`board-wall/turn-every-poll`)", async () => {
    vi.useFakeTimers();
    const cooking = [tableOf(7, [dish({ stage: "cooking" })])];
    const out = [tableOf(7, [dish({ stage: "served" })])];
    pollSequence([{ tables: out }]);
    const first = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    // A reboot mid-rush: the all-served table is drawn at its final frame, with no TURN.
    expect(first.container.querySelector('[data-turning="head"]')).toBeNull();
    first.unmount();

    pollSequence([{ tables: cooking }, { tables: out }, { tables: out }]);
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    await tick(5_000); // the last dish is served
    expect(container.querySelector('.ui-pass[data-turning="head"]')).not.toBeNull();
    await tick(480); // the TURN's two halves
    expect(container.querySelector('[data-turning="head"]')).toBeNull();
    await tick(5_000); // the same snapshot again: nothing turns twice
    expect(container.querySelector('[data-turning="head"]')).toBeNull();
  });

  it("a dish that advances FILLs its newly reached segment; a row seen for the first time does not", async () => {
    vi.useFakeTimers();
    pollSequence([
      { tables: [tableOf(4, [dish({ stage: "sent" })])] },
      {
        tables: [
          tableOf(4, [
            dish({ stage: "cooking" }),
            dish({ name: "Tea", nameMy: null, stage: "sent" }),
          ]),
        ],
      },
    ]);
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    expect(container.querySelector(".ui-track[data-filling]")).toBeNull();
    await tick(5_000);
    const filling = [...container.querySelectorAll(".orb-dish .ui-track[data-filling]")];
    expect(filling).toHaveLength(1);
    expect(filling[0]!.closest(".orb-dish")!.textContent).toContain("Mohinga");
  });

  it("a bag turning Ready is issued as a pass with the arrival on its edge — after the table's TURN, never at the same time", async () => {
    vi.useFakeTimers();
    pollSequence([
      {
        orders: [order("4C1A9E", "preparing")],
        tables: [tableOf(7, [dish({ stage: "cooking" })])],
      },
      { orders: [order("4C1A9E", "ready")], tables: [tableOf(7, [dish({ stage: "served" })])] },
    ]);
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    await tick(5_000);
    // One thing at a time: the TURN first (tables by number), then the pickup.
    expect(container.querySelector('[data-turning="head"]')).not.toBeNull();
    expect(container.querySelector(".orb-ready-flash")).toBeNull();
    await tick(480);
    expect(container.querySelector('[data-turning="head"]')).toBeNull();
    const ready = container.querySelector<HTMLElement>(
      ".orb-col-ready li.ui-pass.orb-ready-flash",
    )!;
    expect(ready.querySelector(".ui-pass-figure")!.textContent).toBe("#4C1A9E");
  });
});

describe("PD9 — the passes fit ONCE per snapshot (the blind pass on #336)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a poll re-fits from the top once — the ResizeObserver's own first notification is not a second step-down (`board-wall/fit-twice-per-poll`)", async () => {
    // As a browser does: the first notification arrives for `observe()` itself.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: () => void) {}
        observe() {
          queueMicrotask(() => this.cb());
        }
        disconnect() {}
      },
    );
    vi.useFakeTimers();
    pollSequence([
      { tables: [tableOf(4, [dish()])] },
      { tables: [tableOf(4, [dish({ stage: "cooking" })])] },
    ]);
    render(<ReadyBoard token="t" lang="en" />);
    fitStarts.n = 0;
    await tick(1); // the first answer: the passes mount and fit
    expect(fitStarts.n).toBe(1);
    await tick(5_000); // the second answer: a new snapshot starts full again — once
    expect(fitStarts.n).toBe(2);
  });
});

describe("PD9 — a frozen wall drops what rots and keeps what does not", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a FROZEN snapshot of an empty kitchen never says 'All clear' — the head says it cannot read the kitchen, and the body says nothing (the blind pass on #336; `board-wall/all-clear-over-a-frozen-snapshot`)", async () => {
    vi.useFakeTimers();
    let answering = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!answering) throw new Error("network");
        return {
          status: 200,
          ok: true,
          json: async () => ({ orders: [], tables: [], kitchenIdle: true }),
        };
      }),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    expect(container.querySelector(".orb-kitchen .orb-empty")!.textContent).toBe(
      STAFF["kds.allclear"].en,
    );
    answering = false;
    for (let i = 0; i < BOARD_FAIL_THRESHOLD; i++) await tick(5_000);
    expect(container.querySelector(".orb-root[data-stale]")).not.toBeNull();
    expect(container.querySelector(".orb-kitchen-note")!.textContent).toBe(
      STAFF["board.pulse.unavailable"].en,
    );
    expect(container.querySelector(".orb-kitchen .orb-empty")).toBeNull();
    expect(container.querySelector(".orb-kitchen")!.textContent).not.toContain(
      STAFF["kds.allclear"].en,
    );
  });

  it("past the fail threshold the passes keep their numbers and names but drop every stage and the roll-up; the sentence replaces the key (`board-wall/frozen-keeps-stages`)", async () => {
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
            orders: [order("A1B2C3", "ready")],
            tables: [tableOf(3, [dish({ stage: "served" })]), tableOf(4, [dish()])],
          }),
        };
      }),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    expect(container.querySelectorAll(".ui-track")).not.toHaveLength(0);
    answering = false;
    for (let i = 0; i < BOARD_FAIL_THRESHOLD - 1; i++) await tick(5_000);
    expect(container.querySelector(".orb-root[data-stale]")).toBeNull(); // one miss: say nothing
    await tick(5_000);
    expect(container.querySelector(".orb-root[data-stale]")).not.toBeNull();
    // The identities stay: numbers and dish names.
    expect(container.querySelectorAll(".orb-passes > li.ui-pass")).toHaveLength(2);
    expect(container.querySelector(".orb-passes")!.textContent).toContain("Mohinga");
    // Every stage goes — the dish words, the tracks, the roll-up — and the key's promise with them.
    expect(container.querySelectorAll(".orb-kitchen .ui-track")).toHaveLength(0);
    expect(container.querySelector(".orb-kitchen-note")!.textContent).toBe(
      STAFF["board.pulse.unavailable"].en,
    );
    // The code column keeps its code.
    expect(container.textContent).toContain("#A1B2C3");
  });

  it("a frozen pass rots on the linger clock: past it the kitchen keeps only its sentence (m9 critic B7; `board-wall/frozen-forever`)", async () => {
    vi.useFakeTimers();
    let answering = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!answering) throw new Error("network");
        return {
          status: 200,
          ok: true,
          json: async () => ({ orders: [], tables: [tableOf(4, [dish()])] }),
        };
      }),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    answering = false;
    await tick(FROZEN_TABLES_MS - 5_000);
    expect(container.querySelectorAll(".orb-passes > li.ui-pass")).toHaveLength(1);
    await tick(10_000);
    expect(container.querySelector(".orb-passes")).toBeNull();
    expect(container.querySelector(".orb-kitchen-note")!.textContent).toBe(
      STAFF["board.pulse.unavailable"].en,
    );
  });

  it("the first good poll after a frozen spell re-seeds: what went out meanwhile is drawn final, never celebrated late", async () => {
    vi.useFakeTimers();
    let answering = true;
    let tables = [tableOf(7, [dish({ stage: "cooking" })])];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!answering) throw new Error("network");
        return { status: 200, ok: true, json: async () => ({ orders: [], tables }) };
      }),
    );
    const { container } = render(<ReadyBoard token="t" lang="en" />);
    await tick(1);
    answering = false;
    for (let i = 0; i < BOARD_FAIL_THRESHOLD; i++) await tick(5_000);
    tables = [tableOf(7, [dish({ stage: "served" })])];
    answering = true;
    await tick(5_000);
    expect(container.querySelector(".orb-root[data-stale]")).toBeNull();
    expect(container.querySelector('[data-turning="head"]')).toBeNull();
  });
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
    await waitFor(() => expect(readyCol().querySelectorAll("li.ui-pass")).toHaveLength(5));
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
    await waitFor(() =>
      expect(document.querySelectorAll(".orb-col-ready li.ui-pass")).toHaveLength(3),
    );
    expect(document.querySelector(".orb-more")).toBeNull();
  });

  it("re-measures on a resize of the list OR of a row — a zoomed TV, a late Padauk load — not only on a poll", async () => {
    const fire = stubBoxes();
    const codes = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
    await renderBoard("en", undefined, { orders: codes.map((c) => order(c, "ready")) });
    const readyCol = () => screen.getByRole("region", { name: "Ready" });
    const cards = () => readyCol().querySelectorAll("li.ui-pass");
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

  it("Preparing keeps the route's order — the bag about to come up leads — and draws the code alone", async () => {
    await renderBoard("en", undefined, {
      orders: [order("OLD", "preparing"), order("MID", "preparing"), order("NEW", "preparing")],
    });
    const prep = () => screen.getByRole("region", { name: "Preparing" });
    await waitFor(() => expect(prep().querySelectorAll(".orb-card")).toHaveLength(3));
    expect([...prep().querySelectorAll(".orb-card")].map((c) => c.textContent)).toEqual([
      "#OLD",
      "#MID",
      "#NEW",
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
    const chip = () => screen.getByRole("button", { name: /Turn on sound|Sound on/ });
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
      screen.getByRole("button", { name: "Turn on sound" }).click();
    });
    // MUTATION: swallow the `false` again — nothing says why nothing happened; red.
    expect(status().textContent).toBe(STAFF["board.sound.refused"].en);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const chip = screen.getByRole("button", { name: "Turn on sound" });
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
    const chip = () => screen.getByRole("button", { name: /Turn on sound|Sound on/ });
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

describe("board-2 · board-5 — the tell and the tongue", () => {
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
            orders: [order("D1", "ready")],
            serverNow: SERVER_NOW,
            tables: [],
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
    // with tables AND both columns so the headings' echoes, the key, the pass labels, the dish
    // names, the round stub and the codes all exist; the unlinked screen under `en` is English
    // alone by `Chrome`'s rule 1 and would satisfy this vacuously.
    await renderBoard("en", undefined, {
      orders: [order("F1", "ready"), order("F2", "preparing")],
      tables: [
        {
          table: 4,
          out: false,
          rounds: [
            { n: 1, next: false, dishes: [dish()] },
            { n: 2, next: false, dishes: [dish({ togo: true })] },
          ],
        },
      ],
    });
    await waitFor(() => expect(document.querySelector(".orb-passes")).not.toBeNull());
    await waitFor(() =>
      expect(document.querySelectorAll(".orb-col-ready li.ui-pass")).toHaveLength(1),
    );
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

  it("the root IS the screen, and the passes clip inside their own box", () => {
    // MUTATION: `min-height: 100dvh` again — the root grows past the TV; red.
    expect(one(".orb-root", "height")).toBe("100dvh");
    expect(one(".orb-root", "overflow")).toBe("hidden");
    // PD9 — the passes' list takes the kitchen's REMAINING height and clips; the fit measures it.
    expect(one(".orb-passes", "flex")).toMatch(/^1\b/);
    expect(one(".orb-passes", "overflow")).toBe("hidden");
    expect(one(".orb-passes", "columns")).toBe("2");
    expect(one(".orb-pass-break", "break-before")).toBe("column");
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

  it("the Ready arrival animates opacity on a ring at the pass's EDGE — a gold wash over paper would vanish — and reduced motion hides it", () => {
    const kf = all.filter((b) => b.prelude === "@keyframes orbFlash");
    expect(kf).toHaveLength(1);
    expect(kf[0]!.body).toMatch(/opacity/);
    expect(kf[0]!.body).not.toMatch(/background/);
    expect(one(".orb-ready-flash::after", "animation")).toMatch(/^orbFlash\b/);
    expect(one(".orb-ready-flash::after", "box-shadow")).toContain("var(--gold)");
    expect(rule(".orb-ready-flash::after").flatMap((b) => decl(b, "background"))).toEqual([]);
    expect(rm(".orb-ready-flash::after").flatMap((b) => decl(b, "display"))).toEqual(["none"]);
  });

  it("board-6 — the READY heading keeps gold on its TEXT alone; the rule under both headings is a hairline", () => {
    // The always-on posture's burn-in half: a 2px full-brightness gold rule lit 12h a day. The
    // drift that was drafted beside it is withdrawn (an auto-motion with no pause control on a
    // screen with no pointer), so the hairline is the whole of board-6 and it is pinned here.
    // MUTATION: `border-bottom: 2px solid var(--gold)` on `.orb-col-ready h2` again — red.
    expect(one(".orb-col h2", "border-bottom")).toBe("1px solid var(--bd)");
    expect(rule(".orb-col-ready h2").flatMap((b) => decl(b, "border-bottom"))).toEqual([]);
    expect(one(".orb-col-ready h2", "color")).toBe("var(--gold)");
    for (const sel of [".orb-head", ".orb-main", ".orb-kitchen", ".orb-passes"])
      expect(
        rule(sel).flatMap((b) => decl(b, "animation")),
        sel,
      ).toEqual([]);
  });

  it("PD9 — the wall spends no gold on a table: the retired chip is out of the shared pressed rule, and a frozen pass is dashed", () => {
    expect(rule(".orb-table-up")).toEqual([]);
    expect(one(".orb-root[data-stale] .ui-pass-paper", "border")).toBe("2px dashed var(--t2)");
    expect(one(".orb-root[data-stale] .ui-pass", "--pass-paper")).toBe("transparent");
  });
});

describe("ReadyBoard — the /api/board read is a fetch, not a Server Action (Phase 2h review c, C1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("a hung board read never reaches the stall ledger — Next's action queue does not hold it", async () => {
    const { STAFF_HANG_MS, outstanding, stalledSince } = await import("@/lib/bounded-write");
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReadyBoard token="t" lang="en" />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(STAFF_HANG_MS * 3)));
    expect(fetchMock).toHaveBeenCalled();
    // MUTATION (p2h-rev-c/board-fetch-tracked): raced through the TRACKING race, every hung read
    // sits on the ledger as a stuck action the queue never held; red.
    expect(outstanding()).toBe(0);
    expect(stalledSince()).toBeNull();
  });
});
