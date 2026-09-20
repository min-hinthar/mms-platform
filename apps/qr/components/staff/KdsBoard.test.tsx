/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KitchenQueue } from "@/lib/kitchen-types";
import type { KitchenActionResult } from "@/lib/kitchen";

/**
 * The board's WIRING, pinned where it lives (T18 — a component suite for what a pure module cannot
 * express). The rules themselves are elsewhere: the age formatter in `lib/kds-time.ts` (its own
 * suite), the reverse of an 86 in `lib/menu-availability.ts`. What only a render can show:
 *
 *   - K22: an 86 from the ticket lands in the undo bar, and Undo is the compare-and-swap BACK —
 *     `expectedSoldOut: true`, because that is the state this board just wrote;
 *   - §17: a control that was just tapped is `aria-disabled`, never `disabled` — native disabled
 *     drops focus to <body> mid-tap, and the busy name is then spoken from nowhere. Every action
 *     button on the board (bump, fire, line, 86, undo, recall, pager) follows the same rule, and
 *     the handler refuses re-entry so the attribute is a statement, not the gate;
 *   - K28: a ticket's visible age has a ceiling and its SPOKEN age is the dictionary's sentence;
 *   - §2: the five pressed selectors on the console share ONE rule — a second copy is the drift
 *     K29 found (a tint that vanished inside the station track).
 */
const NOW = "2026-09-20T18:00:00.000Z";
const HOUR = 3_600_000;

const setItemSoldOut = vi.fn(() => Promise.resolve({ ok: true as const, soldOut: true }));
const bumpTicket = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
const recallTicket = vi.fn((): Promise<KitchenActionResult> => Promise.resolve({ ok: true }));
const haptic = vi.fn();
// kitchen-8 — the device's remembered sound preference and whether this "device" has audio.
let soundWanted = false;
let armOk = false;
const setKdsSoundWanted = vi.fn();

const queue = (firedAt = NOW): KitchenQueue => ({
  tickets: [
    {
      cartId: "cart-1",
      sessionId: "sess-1",
      channel: "dinein",
      label: "T4",
      tableNumber: 4,
      customerName: null,
      shortCode: null,
      pickupSlot: null,
      held: false,
      firedAt,
      lines: [
        {
          id: "line-1",
          menuItemId: "mi-1",
          soldOut: false,
          name: "Mohinga",
          nameMy: null,
          qty: 1,
          modifiers: [],
          modifiersMy: [],
          notes: null,
          state: "fired",
          firedAt,
          fulfillment: "dinein",
          station: "wok",
        },
      ],
    },
  ],
  serverNow: NOW,
  thresholds: {
    dineinAmberMin: 8,
    dineinRedMin: 12,
    pickupAmberMin: 8,
    pickupRedMin: 12,
    rechimeSec: 60,
  },
  stats: { avgSecs: 0, servedToday: null },
  served: null,
});
let currentQueue = queue();

vi.mock("@/lib/kitchen", () => ({
  getKitchenQueue: () => Promise.resolve({ ok: true, queue: currentQueue }),
  bumpTicket: (...a: unknown[]) => bumpTicket(...(a as [])),
  bumpLine: () => Promise.resolve({ ok: true }),
  fireTicketNow: () => Promise.resolve({ ok: true }),
  recallTicket: (...a: unknown[]) => recallTicket(...(a as [])),
}));
vi.mock("@/lib/menu-availability", () => ({
  setItemSoldOut: (...a: unknown[]) => setItemSoldOut(...(a as [])),
}));
vi.mock("@/lib/haptics", () => ({ haptic: (...a: unknown[]) => haptic(...a) }));
vi.mock("@/lib/useFloorRealtime", () => ({ useFloorRealtime: () => {} }));
vi.mock("@/lib/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("@/lib/kds-sound", () => ({
  SOFT_LEVEL: 0.4,
  KDS_DEFAULT_VOLUME: 0.8,
  KdsChime: class {
    arm() {
      return Promise.resolve(armOk);
    }
    get armed() {
      return armOk;
    }
    play() {}
  },
  getKdsVolume: () => 0.8,
  setKdsVolume: () => {},
  getKdsSoundWanted: () => soundWanted,
  setKdsSoundWanted: (...a: unknown[]) => setKdsSoundWanted(...a),
}));
// The Help door auto-opens its sheet on a fresh device; this suite is about the board beneath it.
vi.mock("./HelpButton", () => ({ HelpButton: () => null }));
// The bar's two server actions and the router — the same stubs `StaffBar.test.tsx` mounts it with.
vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { KdsBoard } = await import("./KdsBoard");
const { tf, localizeCount } = await import("@/lib/i18n/fill");
const { ts } = await import("@/lib/i18n/staff");
const { sx } = await import("@/lib/staff-labels");

afterEach(() => {
  cleanup();
  setItemSoldOut.mockReset();
  setItemSoldOut.mockImplementation(() => Promise.resolve({ ok: true as const, soldOut: true }));
  bumpTicket.mockReset();
  bumpTicket.mockImplementation(() => Promise.resolve({ ok: true }));
  recallTicket.mockReset();
  recallTicket.mockImplementation(() => Promise.resolve({ ok: true }));
  haptic.mockReset();
  setKdsSoundWanted.mockReset();
  soundWanted = false;
  armOk = false;
  currentQueue = queue();
  vi.useRealTimers();
});

const mount = (lang: "en" | "my" = "en", initial = currentQueue) =>
  render(
    <StaffLangProvider lang={lang}>
      <KdsBoard initial={initial} />
    </StaffLangProvider>,
  );

/** One promise the test settles by hand — the shape of a write still in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("K22 — an 86 from the ticket can be undone from the bar, like a bump", () => {
  it("lands the dish in the undo bar and reverses through the compare-and-swap back to available", async () => {
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: /86 this dish/ }));
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(1));
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: true,
      expectedSoldOut: false,
    });
    // The bar names the dish, and the one live region says undo is still open.
    const bar = await waitFor(() => {
      const el = container.querySelector(".kds-undo");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(bar.textContent).toContain("Mohinga");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86", { x: "Mohinga" }),
    );
    expect(haptic).toHaveBeenCalledWith("commit");

    fireEvent.click(getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    // MUTATION: `expectedSoldOut: true` → `false` — the swap would refuse against the state the
    // board just wrote, and the cook's undo would fail every time with "someone else changed it".
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: false,
      expectedSoldOut: true,
    });
    await waitFor(() => expect(container.querySelector(".kds-undo")).toBeNull());
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      tf("en", "kds.live.86.undone", { x: "Mohinga" }),
    );
  });

  it("names the dish Burmese-first in the bar when the catalog has it", async () => {
    currentQueue = queue();
    currentQueue.tickets[0]!.lines[0]!.nameMy = "မုန့်ဟင်းခါး";
    const { getByRole, container } = mount("my", currentQueue);
    fireEvent.click(getByRole("button", { name: new RegExp(ts("my", "kds.86")) }));
    const bar = await waitFor(() => {
      const el = container.querySelector(".kds-undo");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(bar.textContent).toContain("မုန့်ဟင်းခါး");
    expect(bar.textContent).not.toContain("Mohinga");
  });
});

describe("§17 — a tapped control is aria-disabled, keeps focus, and refuses re-entry in the handler", () => {
  it("the 86 button, while its write is in flight", async () => {
    const d = deferred<{ ok: true; soldOut: boolean }>();
    setItemSoldOut.mockImplementationOnce(() => d.promise);
    const { getByRole } = mount();
    const btn = getByRole("button", { name: /86 this dish/ });
    btn.focus();
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    // MUTATION: `aria-disabled` → native `disabled`: jsdom (like a real browser) blurs a disabled
    // element, focus falls to <body>, and the busy name is announced from nowhere.
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(btn);
    // A second tap while in flight is refused by the handler, not by the attribute.
    fireEvent.click(btn);
    expect(setItemSoldOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, soldOut: true });
    });
  });

  it("the bump, while its write is in flight — one tap, one write", async () => {
    const d = deferred<{ ok: true }>();
    bumpTicket.mockImplementationOnce(() => d.promise);
    const { getByRole } = mount();
    const btn = getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-disabled")).toBe("true"));
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(bumpTicket).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true });
    });
  });

  it("no action button on the board is ever natively disabled — at the pager's edge, on a held line", () => {
    // Nine tickets at page 0 puts the ‹ button at its refused edge; the held ticket is on page 2,
    // so the board is paged there and its line is the refused one. Before §17 both were native
    // `disabled` — a one-ticket fixture with nothing in flight rendered zero `:disabled` buttons
    // on the OLD code too, so this case could not fail until the refused states were on screen.
    const { container, getByRole } = mount("en", nineTickets(true));
    const prev = getByRole("button", { name: sx("en", "kds.a11y.prevPage") });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(getByRole("button", { name: sx("en", "kds.a11y.nextPage") }));
    const heldLine = container.querySelector(".kds-ticket-held .kds-line")!;
    expect(heldLine).not.toBeNull();
    expect(heldLine.getAttribute("aria-disabled")).toBe("true");
    // …and the slot line names WHY it refuses.
    const slot = container.querySelector(".kds-ticket-held .kds-slot")!;
    expect(heldLine.getAttribute("aria-describedby")).toBe(slot.id);
    // MUTATION: `disabled={safePage === 0}` on ‹ or `disabled={pending || held}` on the line — red.
    expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
  });
});

describe("K28 — the ticket's age has a ceiling, and its spoken form is the dictionary's", () => {
  it("a ticket fired 26 hours ago reads `1d+`, and is announced as more than a day", () => {
    const stale = queue(new Date(Date.parse(NOW) - 26 * HOUR).toISOString());
    const { container } = mount("en", stale);
    expect(container.querySelector(".kds-clock")?.textContent).toBe("1d+");
    expect(container.querySelector(".kds-clock + .sr-only")?.textContent).toBe(
      ts("en", "kds.age.days"),
    );
  });

  it("a ticket fired 3m 42s ago is spoken in Burmese numerals under my", () => {
    const fresh = queue(new Date(Date.parse(NOW) - (3 * 60 + 42) * 1000).toISOString());
    const { container } = mount("my", fresh);
    const spoken = container.querySelector(".kds-clock + .sr-only");
    expect(spoken?.getAttribute("lang")).toBe("my");
    expect(spoken?.textContent).toBe(
      tf("my", "kds.age.mmss", { m: localizeCount(3, "my"), s: localizeCount(42, "my") }),
    );
  });
});

describe("§2 — the console's five pressed selectors share ONE lit-cap rule", () => {
  // counter-4 added the register's open arm (`aria-expanded`, the state that control already
  // carries) to the same list — a selection is a selection whichever attribute says so.
  const PRESSED = [
    '.kds-chip[aria-pressed="true"]',
    '.staff-seg > .kds-chip[aria-pressed="true"]',
    '.staff-lang-btn[aria-pressed="true"]',
    '.help-size-row[aria-pressed="true"]',
    '.staff-arm[aria-expanded="true"]',
  ];
  // Comments stripped, and every at-rule prelude (`@media … {`) removed so a block nested inside
  // one is matched by its OWN selector — otherwise a second fill parked under `@media (min-width: 0)`
  // would be counted as the at-rule's block and the guard would read green (LEARNINGS #60).
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|supports|layer|container)[^{]*\{/g, "");
  /** Every rule block whose selector list names `sel` exactly (as a whole comma-separated entry). */
  const blocksNaming = (sel: string) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) =>
      m[1]!
        .split(",")
        .map((s) => s.trim())
        .includes(sel),
    );

  it("declares a fill for each of them in exactly one block, and it is the same block", () => {
    const fills = PRESSED.map((sel) => blocksNaming(sel).filter((m) => /background:/.test(m[2]!)));
    for (const [i, f] of fills.entries())
      expect(f, `${PRESSED[i]} declares its fill exactly once`).toHaveLength(1);
    const bodies = new Set(fills.map((f) => f[0]![2]!.trim()));
    // MUTATION: give the switch back its own `background: var(--ac)` block — two blocks, red.
    expect(bodies.size, "all five pressed selectors resolve to one declaration").toBe(1);
    expect([...bodies][0]).toMatch(/background:\s*var\(--ac\)/);
    expect([...bodies][0]).toMatch(/--glow-gold/);
  });
});

/** Nine tickets on an eight-slot page — the pager exists; the last one is HELD when asked. */
const nineTickets = (heldLast = false): KitchenQueue => {
  const nine = queue();
  nine.tickets = Array.from({ length: 9 }, (_, i) => ({
    ...nine.tickets[0]!,
    cartId: `cart-${i}`,
    sessionId: `sess-${i}`,
    tableNumber: i + 1,
    label: `T${i + 1}`,
    held: heldLast && i === 8,
    pickupSlot: heldLast && i === 8 ? NOW : null,
    lines: [{ ...nine.tickets[0]!.lines[0]!, id: `line-${i}` }],
  }));
  return nine;
};

describe("kitchen-4 — the rush signal is in the head, never under a grid that outgrew the screen", () => {
  it("with nine tickets on an eight-slot page, `+1 more` and the pager sit in `.kds-head`", () => {
    const { container } = mount("en", nineTickets());
    // MUTATION: render the pager in the footer again — `.kds-head .kds-more` is null, red.
    expect(container.querySelector(".kds-head .kds-more")?.textContent).toBe(
      tf("en", "kds.more", { n: 1 }),
    );
    expect(container.querySelector(".kds-head .kds-pager")).not.toBeNull();
    expect(container.querySelector("footer .kds-pager")).toBeNull();
  });
});

describe("kitchen-3 — a refused action speaks the device language through the ONE region", () => {
  it("a stale bump under my is the dictionary's sentence, marked, with no English in the region", async () => {
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: "That ticket was already updated.", code: "stale" }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() =>
      expect(region.textContent).toBe(
        tf("my", "kds.err.stale", { x: tf("my", "kds.table", { id: 4 }) }),
      ),
    );
    // MUTATION: `onRefused(res, …)` → `onError(res.error)` — the English sentence lands, red.
    expect(region.textContent).not.toContain("already updated");
    // The mark rides the sentence, not the region: a server sentence with no twin must not be
    // announced as Burmese.
    expect(region.getAttribute("lang")).toBeNull();
    expect(region.querySelector('[lang="my"]')).not.toBeNull();
  });
});

describe("kitchen-3 — the string branch: a twin-less sentence is shown unmarked, a twin marked", () => {
  it("a role-floor refusal under my is the English sentence with no Burmese mark anywhere over it", async () => {
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "That needs a manager — ask one to step in.",
        code: "sentence",
      }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() =>
      expect(region.textContent).toBe("That needs a manager — ask one to step in."),
    );
    // MUTATION: `lang={lang}` back on the region — the sentence is announced as Burmese, red.
    expect(region.querySelector("[lang]")).toBeNull();
    expect(region.closest("[lang]")).toBeNull();
  });

  it("the write-outage sentence under my arrives as its Burmese twin, marked", async () => {
    const { STAFF_WRITE_OUTAGE, STAFF_WRITE_OUTAGE_MY } = await import("@/lib/staff-outage");
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, error: STAFF_WRITE_OUTAGE, code: "sentence" }),
    );
    const { getByRole, container } = mount("my");
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("my", "kds.bump")}`) }));
    const region = container.querySelector('[role="status"]')!;
    await waitFor(() => expect(region.textContent).toBe(STAFF_WRITE_OUTAGE_MY));
    expect(region.querySelector('[lang="my"]')?.textContent).toBe(STAFF_WRITE_OUTAGE_MY);
  });
});

describe("K22 — the 86's only undo survives the tap beside it, and the bar's busy state is its own", () => {
  it("a bump inside the 86's window leaves the dish in the bar; the bump rides the recall rail", async () => {
    const { getByRole, container } = mount();
    fireEvent.click(getByRole("button", { name: /86 this dish/ }));
    await waitFor(() =>
      expect(container.querySelector(".kds-undo")?.textContent).toContain("Mohinga"),
    );
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(bumpTicket).toHaveBeenCalledTimes(1));
    // MUTATION: `setUndo({ kind: "bump", … })` unconditionally — the bar now reads "T4 bumped" and
    // the dish's only way back is gone, red.
    await waitFor(() => expect(container.querySelector(".kds-recall-btn")).not.toBeNull());
    expect(container.querySelector(".kds-undo")?.textContent).toContain(
      tf("en", "kds.undo.86", { x: "Mohinga" }),
    );
    fireEvent.click(getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    expect(setItemSoldOut).toHaveBeenLastCalledWith({
      menuItemId: "mi-1",
      soldOut: false,
      expectedSoldOut: true,
    });
  });

  it("a rail recall in flight does not dim the 86's undo, and the undo still acts", async () => {
    const { getByRole, container } = mount();
    // A bump first (a rail entry), then an 86 (the bar).
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(container.querySelector(".kds-recall-btn")).not.toBeNull());
    fireEvent.click(getByRole("button", { name: /86 this dish/ }));
    await waitFor(() =>
      expect(container.querySelector(".kds-undo")?.textContent).toContain("Mohinga"),
    );
    const d = deferred<KitchenActionResult>();
    recallTicket.mockImplementationOnce(() => d.promise);
    fireEvent.click(container.querySelector(".kds-recall-btn")!);
    const rail = container.querySelector(".kds-recall-btn")!;
    await waitFor(() => expect(rail.getAttribute("aria-disabled")).toBe("true"));
    const undoBtn = getByRole("button", { name: /^Undo/ });
    // MUTATION: `aria-disabled={recallPending || undo86Pending}` — the bar says busy here, red.
    expect(undoBtn.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(undoBtn);
    await waitFor(() => expect(setItemSoldOut).toHaveBeenCalledTimes(2));
    await act(async () => {
      d.resolve({ ok: true });
    });
  });
});

describe("kitchen-10 — a refusal outlives the poll that follows it", () => {
  it("survives the 5-second snapshot and clears once the dwell has passed", async () => {
    vi.useFakeTimers();
    bumpTicket.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        error: "Couldn’t bump that ticket. Try again.",
        code: "failed",
      }),
    );
    const { getByRole, container } = mount();
    const region = container.querySelector('[role="status"]')!;
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const refusal = tf("en", "kds.err.bump", { x: tf("en", "kds.table", { id: 4 }) });
    expect(region.textContent).toBe(refusal);
    // The poll lands at 5 s with a good snapshot. MUTATION: clear the banner on every snapshot
    // (drop `actionErrorStale`) — the refusal is gone here, red.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(region.textContent).toBe(refusal);
    // The next poll, at 10 s, is past the 8 s dwell: the region goes back to the count.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(region.textContent).toBe(tf("en", "kds.open.one", { n: 1 }));
  });
});

describe("kitchen-8 — a device that wanted sound says so, and the first tap re-arms it", () => {
  it("wears the warn chip after a reload and arms off a bump, silently", async () => {
    soundWanted = true;
    armOk = true;
    const { getByRole, container } = mount();
    const chip = await waitFor(() => {
      const el = container.querySelector('.kds-chip[data-muted="true"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(chip.textContent).toBe(ts("en", "kds.sound.off"));
    // Any tap on the board is the gesture — here the bump. MUTATION: drop the capture listener —
    // the chip stays and the slider never appears, red.
    fireEvent.click(getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(container.querySelector('.kds-chip[data-muted="true"]')).toBeNull();
    // The gesture that armed the chime was a BUMP, and it still lands — the capture listener must
    // never swallow the shift's first tap.
    expect(bumpTicket).toHaveBeenCalledTimes(1);
  });

  it("a fresh device shows the plain chip, and an explicit arm is what sets the preference", async () => {
    armOk = true;
    const { getByRole, container } = mount();
    expect(container.querySelector('.kds-chip[data-muted="true"]')).toBeNull();
    fireEvent.click(getByRole("button", { name: ts("en", "kds.sound.enable") }));
    await waitFor(() => expect(container.querySelector(".kds-vol")).not.toBeNull());
    expect(setKdsSoundWanted).toHaveBeenCalledWith(true);
  });
});

describe("P2n + §17 — every list is named, and a busy control keeps its name", () => {
  it("the ticket's line list and both rail lists carry an accessible name", () => {
    currentQueue = queue();
    currentQueue.served = {
      lines: [
        {
          id: "s-1",
          name: "Mohinga",
          nameMy: null,
          qty: 1,
          modifiers: [],
          modifiersMy: [],
          bumpedAt: NOW,
          bumpedAtLabel: "11:02",
          voided: false,
          channel: "dinein",
          label: "T4",
          tableNumber: 4,
          shortCode: null,
          fulfillment: "dinein",
        },
      ],
      truncated: false,
      total: 1,
    };
    const { container, getByRole } = mount("en", currentQueue);
    fireEvent.click(getByRole("button", { name: ts("en", "kds.allday.chip") }));
    const named = (ul: Element) =>
      ul.getAttribute("aria-label") ||
      (ul.getAttribute("aria-labelledby") &&
        document.getElementById(ul.getAttribute("aria-labelledby")!)?.textContent);
    // MUTATION: drop `aria-label` from `.kds-lines` — an unnamed list, red.
    expect(container.querySelector(".kds-lines")?.getAttribute("aria-label")).toBe(
      tf("en", "kds.a11y.lines", { x: tf("en", "kds.table", { id: 4 }) }),
    );
    for (const ul of container.querySelectorAll('[role="list"]'))
      expect(named(ul), ul.className || "rail list").toBeTruthy();
    fireEvent.click(getByRole("button", { name: ts("en", "kds.served.chip") }));
    for (const ul of container.querySelectorAll('[role="list"]'))
      expect(named(ul), ul.className || "rail list").toBeTruthy();
  });

  it("a bump in flight keeps its label and its name — busy is the attribute, never an ellipsis", async () => {
    const d = deferred<KitchenActionResult>();
    bumpTicket.mockImplementationOnce(() => d.promise);
    const { getByRole } = mount();
    const btn = getByRole("button", { name: new RegExp(`^${ts("en", "kds.bump")}`) });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    // MUTATION: `{pending ? "…" : <Chrome …/>}` — the label collapses to an ellipsis, red.
    expect(btn.textContent).toContain(ts("en", "kds.bump"));
    expect(btn.textContent).not.toContain("…");
    await act(async () => {
      d.resolve({ ok: true });
    });
  });
});
