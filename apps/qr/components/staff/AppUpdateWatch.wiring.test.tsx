/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLIED_KEY, subscribeUpdate, updateSnapshot } from "@/lib/app-update";
import { STAFF_CONTRACT } from "@/lib/build-stamp";
import { STAFF } from "@/lib/i18n/staff";
import { QUIET_MS, type HoldInput } from "@/lib/reload-guard";
import { COUNTDOWN_MS, VERSION_POLL_MS } from "@/lib/update-policy";
import { AppUpdateWatch, WATCH_TICK_MS } from "./AppUpdateWatch";
import { ReloadButton } from "./ReloadOffer";
import { StaffBarUpdate } from "./StaffBarUpdate";
import { useReloadHold } from "./useReloadHold";

/**
 * Phase 2i (P2bi) — the streams' seams, wired together as the staff layout wires them: S1's watcher
 * (the poll, the tick, the executor's live dependencies), S2's bar row (the tap, the refusal and its
 * clearing), S2's `<ReloadButton>` standing hold and a board's holds (registered through the same
 * `useReloadHold` call sites KdsBoard and the counter bell use). Each suite of its own stubs the
 * other half (`installApplyDeps(deps())`, `holdReload(...)` directly); this one does not — a row
 * whose tap needed deps the watcher never installed, or a hold the watcher's tick never read, is red
 * only here.
 */
const OWN = "mfq3k9aa-00112233";
const NEW = "mfq3k9zz-ffee0011";

/** The build the server serves: this bundle's own until a case's first poll (the watcher's mount
 *  check — Codex r2 on #311 — hears "current"; `pollStale` then deploys the new one). */
let servedBuild = OWN;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === "/api/version")
    return Response.json({ build: servedBuild, contract: STAFF_CONTRACT });
  if (url === "/api/health") return Response.json({ db: "ok" });
  throw new Error(`unexpected fetch ${url}`);
});
const reload = vi.fn();

/** A board's hold, registered exactly as a board registers it. */
function BoardHold({ h, on }: { h: HoldInput; on: boolean }) {
  useReloadHold(h.kind, h.reason as never, h.subject, on, h.survives);
  return null;
}
const KDS_UNDO: HoldInput = {
  kind: "unsent",
  reason: "kitchenUndo",
  subject: "kds",
  survives: false,
};
const KDS_SOUND: HoldInput = { kind: "sound", reason: "kdsSound", subject: "kds", survives: false };

beforeEach(() => {
  vi.useFakeTimers();
  servedBuild = OWN;
  fetchMock.mockClear();
  reload.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, reload });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.body.inert = false;
  delete document.documentElement.dataset.reloading;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
  document.body.inert = false;
  delete document.documentElement.dataset.reloading;
});

const phase = () => updateSnapshot().phase;
/** One poll finds the new build: the bar's row appears. */
const pollStale = async () => {
  await act(() => vi.advanceTimersByTimeAsync(0)); // the mount's own check: current
  servedBuild = NEW;
  await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS));
  expect(phase().k).toBe("stale");
};
/** A real press: pointerdown (the watcher hears input) then the click. */
const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.pointerDown(el);
    fireEvent.click(el);
    await vi.advanceTimersByTimeAsync(0);
  });
};
const rowReload = () => {
  const row = document.querySelector<HTMLElement>(".staff-update");
  const btn = row?.querySelector<HTMLElement>("button");
  if (!btn) throw new Error("no row Reload");
  return btn;
};
/** Every phase the store publishes while `run` runs. */
const phasesDuring = async (run: () => Promise<unknown>) => {
  const seen: string[] = [];
  const off = subscribeUpdate(() => seen.push(phase().k));
  await run();
  off();
  return seen;
};

describe("Phase 2i wiring — the bar row's tap runs on the watcher's executor", () => {
  it("a tap on the row marks, freezes and reloads the document through the deps the watcher installed", async () => {
    render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
      </>,
    );
    await pollStale();
    await press(rowReload());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(document.body.inert).toBe(true);
    expect(document.documentElement.dataset.reloading).toBe("");
    expect(JSON.parse(sessionStorage.getItem(APPLIED_KEY) ?? "null")).toEqual({ target: NEW });
  });

  it("with no watcher mounted the row's tap is refused — the executor's deps are the watcher's alone", async () => {
    const r = render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
      </>,
    );
    await pollStale();
    // The watcher leaves (its cleanup uninstalls the deps); the bar stays.
    r.rerender(<StaffBarUpdate lang="en" />);
    await press(rowReload());
    expect(reload).not.toHaveBeenCalled();
    expect(document.body.inert).toBe(false);
  });
});

describe("Phase 2i wiring — the offer's standing hold and the boards' holds against the watcher", () => {
  it("<ReloadButton> on screen: the watcher never counts down; a person's row tap still reloads", async () => {
    render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
        <ReloadButton lang="en" />
      </>,
    );
    await pollStale();
    const seen = await phasesDuring(() =>
      act(() => vi.advanceTimersByTimeAsync(QUIET_MS + COUNTDOWN_MS + WATCH_TICK_MS * 5)),
    );
    expect(seen).not.toContain("countdown");
    expect(reload).not.toHaveBeenCalled();
    // The standing offer refuses only the AUTOMATIC reload.
    await press(rowReload());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the offer gone, the same quiet screen counts down and reloads on its own", async () => {
    const r = render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
        <ReloadButton lang="en" />
      </>,
    );
    await pollStale();
    r.rerender(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
      </>,
    );
    const seen = await phasesDuring(() =>
      act(() => vi.advanceTimersByTimeAsync(QUIET_MS + COUNTDOWN_MS + WATCH_TICK_MS * 5)),
    );
    // A visible countdown first, then the reload — never a silent one.
    expect(seen.indexOf("countdown")).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf("countdown")).toBeLessThan(seen.indexOf("applying"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a board's Undo bar refuses the row's tap; the refusal clears itself when the bar goes, and the next tap reloads", async () => {
    const r = render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
        <BoardHold h={KDS_UNDO} on />
      </>,
    );
    await pollStale();
    await press(rowReload());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.wait.undo"].en);
    expect(updateSnapshot().refusal).not.toBeNull();
    r.rerender(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
        <BoardHold h={KDS_UNDO} on={false} />
      </>,
    );
    expect(updateSnapshot().refusal).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await press(rowReload());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a board's live sound: the watcher waits for a person and the row says the cost; the tap reloads", async () => {
    render(
      <>
        <AppUpdateWatch own={OWN} />
        <StaffBarUpdate lang="en" />
        <BoardHold h={KDS_SOUND} on />
      </>,
    );
    await pollStale();
    const seen = await phasesDuring(() =>
      act(() => vi.advanceTimersByTimeAsync(QUIET_MS + COUNTDOWN_MS + WATCH_TICK_MS * 5)),
    );
    expect(seen).not.toContain("countdown");
    expect(document.querySelector(".staff-update")?.textContent).toContain(
      STAFF["shell.version.sound"].en,
    );
    await press(rowReload());
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
