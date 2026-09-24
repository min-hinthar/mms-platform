/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveBoardState } from "@/lib/live-connection";

vi.mock("@/lib/staff-lang-actions", () => ({ setStaffLang: vi.fn() }));
vi.mock("@/lib/staff-pin-actions", () => ({ lockConsole: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { StaffBar } = await import("./StaffBar");
const { LiveConnectionProvider, useReportLive } = await import("./LiveConnection");
const { STAFF } = await import("@/lib/i18n/staff");
const { NET_SHOW_MS } = await import("@/lib/live-connection");

/**
 * Phase 2b · feedback — the bar's STATUS SLOT, through the bar that mounts it. What only a render
 * can show (the rules are `liveDot` / `counterFold` in lib/live-connection.ts):
 *
 *   - a feedless bar keeps TODAY's DOM: no `.staff-bar-head`, no `.staff-live`;
 *   - the slot sits OUTSIDE the h1, so the heading's name is the same with and without it;
 *   - the counter's mark is RESERVED and EMPTY until its boards report — never a guessed 'Live' —
 *     and folds the floor + the bags only (a frozen approvals rail says nothing);
 *   - a board's own `degraded` draws the stale ring with a VISIBLE word; 'Live' is sr-only;
 *   - a sustained device offline outranks the feed;
 *   - a state CHANGE pops the mark; the first paint does not.
 */
let onLine = true;
beforeEach(() => {
  onLine = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Leave the module-level outage clock clean: the next subscribe re-reads navigator.onLine.
  onLine = true;
  window.dispatchEvent(new Event("online"));
});

function Report({ board, state }: { board: string; state: LiveBoardState }) {
  useReportLive(board, state);
  return null;
}
const slot = (c: HTMLElement) => c.querySelector(".staff-live");

describe("the status slot", () => {
  it("a bar with no feed keeps today's DOM — no head wrapper, no slot", () => {
    const { container } = render(<StaffBar lang="en" title="kds.title" />);
    expect(container.querySelector(".staff-bar-head")).toBeNull();
    // MUTATION: render the slot for an undefined feed — a menu page grows a 'Live' it cannot back.
    expect(slot(container)).toBeNull();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.parentElement?.classList.contains("staff-bar")).toBe(true);
  });

  it("the slot sits OUTSIDE the h1 — the heading's name is identical with and without it", () => {
    const bare = render(<StaffBar lang="my" title="kds.title" />);
    const nameBare = screen.getByRole("heading", { level: 1 }).textContent;
    bare.unmount();
    const { container } = render(<StaffBar lang="my" title="kds.title" live="not_updating" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    // MUTATION: mount <LiveDot> inside the h1 — its name gains "Not updating", red.
    expect(h1.querySelector(".staff-live")).toBeNull();
    expect(h1.textContent).toBe(nameBare);
    expect(h1.parentElement?.classList.contains("staff-bar-head")).toBe(true);
    expect(slot(container)?.parentElement).toBe(h1.parentElement);
  });

  it("the counter's mark is reserved and EMPTY before its boards report — never a guessed Live", () => {
    const { container } = render(
      <LiveConnectionProvider>
        <StaffBar lang="en" title="floor.door.counter" live="counter" />
      </LiveConnectionProvider>,
    );
    const s = slot(container)!;
    expect(s.getAttribute("data-state")).toBe("none");
    expect(s.querySelector(".staff-live-mark")).not.toBeNull();
    expect(s.querySelector(".staff-live-word")).toBeNull();
    expect(s.textContent).toBe("");
  });

  it("the counter folds the floor and the bags — a frozen approvals rail alone says nothing", () => {
    const tree = (reports: Record<string, LiveBoardState>) => (
      <LiveConnectionProvider>
        {Object.entries(reports).map(([b, st]) => (
          <Report key={b} board={b} state={st} />
        ))}
        <StaffBar lang="en" title="floor.door.counter" live="counter" />
      </LiveConnectionProvider>
    );
    const { container, rerender } = render(tree({ approvals: "not_updating" }));
    // MUTATION `approvals-freezes-the-counter-dot`, one layer up: a fold of every report reads
    // this as stale.
    expect(slot(container)?.getAttribute("data-state")).toBe("none");
    rerender(tree({ approvals: "not_updating", floor: "live", bags: "live" }));
    expect(slot(container)?.getAttribute("data-state")).toBe("live");
    rerender(tree({ approvals: "live", floor: "live", bags: "not_updating" }));
    expect(slot(container)?.getAttribute("data-state")).toBe("stale");
  });

  it("a frozen board draws the stale ring with a VISIBLE word; 'Live' is a word for the ear only", () => {
    const { container, rerender } = render(<StaffBar lang="en" title="kds.title" live="live" />);
    const word = () => slot(container)?.querySelector(".staff-live-word");
    expect(slot(container)?.getAttribute("data-state")).toBe("live");
    expect(word()?.textContent).toBe(STAFF["shell.live.live"].en);
    rerender(<StaffBar lang="en" title="kds.title" live="not_updating" />);
    expect(slot(container)?.getAttribute("data-state")).toBe("stale");
    expect(word()?.textContent).toBe(STAFF["shell.live.stale"].en);
  });

  it("the word speaks the device language, marked", () => {
    const { container } = render(<StaffBar lang="my" title="kds.title" live="not_updating" />);
    const my = slot(container)?.querySelector('.staff-live-word [lang="my"]');
    expect(my?.textContent).toBe(STAFF["shell.live.stale"].my);
  });

  it("a SUSTAINED device offline outranks a live feed — only after the sustain", async () => {
    vi.useFakeTimers();
    const { container } = render(<StaffBar lang="en" title="kds.title" live="live" />);
    onLine = false;
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(NET_SHOW_MS - 1);
    });
    expect(slot(container)?.getAttribute("data-state")).toBe("live");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(slot(container)?.getAttribute("data-state")).toBe("offline");
    expect(slot(container)?.querySelector(".staff-live-mark svg")).not.toBeNull();
    expect(slot(container)?.textContent).toBe(STAFF["shell.live.offline"].en);
    // A feed page draws NO offline row — the slot already says it (StaffBarNet.test pins the row).
    expect(container.querySelector(".staff-net")).toBeNull();
    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(slot(container)?.getAttribute("data-state")).toBe("live");
  });

  it("a state CHANGE pops the mark once; the first paint does not", () => {
    const { container, rerender } = render(<StaffBar lang="en" title="kds.title" live="live" />);
    const mark = () => slot(container)!.querySelector(".staff-live-mark")!;
    expect(mark().classList.contains("mms-pop")).toBe(false);
    rerender(<StaffBar lang="en" title="kds.title" live="not_updating" />);
    expect(mark().classList.contains("mms-pop")).toBe(true);
    const first = mark();
    rerender(<StaffBar lang="en" title="kds.title" live="live" />);
    // Keyed on the change, so the one-shot REPLAYS rather than sitting on a finished animation.
    expect(mark()).not.toBe(first);
    expect(mark().classList.contains("mms-pop")).toBe(true);
  });
});
