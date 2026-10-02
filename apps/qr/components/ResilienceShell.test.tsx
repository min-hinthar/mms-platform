/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResilienceShell } from "./ResilienceShell";

/**
 * Phase 2i (P2bi) — the resilience shell's FIRST suite: what a service-worker change does to a tab.
 * Only the tab whose own Refresh asked for the activation reloads; another tab's activation (a
 * diner's Refresh while a KDS runs in the next tab) is ignored; a reload due offline is owed and
 * paid on `online`; and the very first install is never a reload.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

type Listener = () => void;
class FakeContainer {
  controller: object | null = null;
  registration: FakeRegistration;
  private listeners = new Map<string, Set<Listener>>();
  constructor(reg: FakeRegistration) {
    this.registration = reg;
  }
  register = vi.fn(async () => this.registration);
  getRegistration = vi.fn(async () => this.registration);
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  /** A worker took control of this page (whichever tab activated it). */
  controllerChange() {
    for (const fn of [...(this.listeners.get("controllerchange") ?? [])]) fn();
  }
}
class FakeRegistration {
  waiting: { postMessage: ReturnType<typeof vi.fn> } | null = null;
  installing = null;
  addEventListener() {}
  removeEventListener() {}
  update = vi.fn(async () => {});
}

const reload = vi.fn();
let onLine = true;
let sw: FakeContainer;

function goOnline() {
  onLine = true;
  window.dispatchEvent(new Event("online"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  // No `resetShellForTests()` here: `lib/test-setup.ts` resets the shell's module state after every
  // case (blind review, concurrency G) — the two cases at the end of this file prove it.
  pathname = "/";
  onLine = true;
  reload.mockReset();
  const reg = new FakeRegistration();
  sw = new FakeContainer(reg);
  Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: sw });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
  // jsdom's `location.reload` is unforgeable (spyOn cannot redefine it); stub the whole object.
  vi.stubGlobal("location", { ...window.location, reload });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ db: "ok" })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Mount with an existing controller and a new worker waiting (the strip's Refresh shows). */
async function mountWaiting() {
  sw.controller = {};
  sw.registration.waiting = { postMessage: vi.fn() };
  const r = render(<ResilienceShell />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  return r;
}

async function tapRefresh() {
  const btn = screen.getByRole("button", { name: "Refresh" });
  // The kit's floor: a real 44px target.
  expect(btn.style.minHeight).toBe("44px");
  act(() => {
    fireEvent.click(btn);
  });
}

describe("ResilienceShell — controllerchange reloads only the tab that asked", () => {
  it("the very first install is adopted, never reloaded", async () => {
    render(<ResilienceShell />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => sw.controllerChange());
    expect(reload).not.toHaveBeenCalled();
  });

  it("another tab's activation is ignored — a staff screen keeps working", async () => {
    // MUTATION (p2i-shell/any-tab-reloads): the shell tells the rule every tab asked — a diner's
    // Refresh in another tab reloads this one; red.
    pathname = "/staff/kitchen";
    sw.controller = {};
    render(<ResilienceShell />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => sw.controllerChange());
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("this tab's Refresh: SKIP_WAITING, then ONE reload on the change — the failsafe cancelled", async () => {
    // MUTATION (p2i-shell/ask-unrecorded): Refresh never records the ask — the tab that asked is
    // ignored like any other and only the failsafe ever reloads it; red.
    await mountWaiting();
    await tapRefresh();
    expect(sw.registration.waiting?.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    act(() => sw.controllerChange());
    expect(reload).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("asked, but offline at the change: owed — paid once on `online`, never twice", async () => {
    // MUTATION (p2i-shell/owed-unpaid): the owed reload is never paid — the tab that asked stays on
    // the old build with its strip gone; red.
    await mountWaiting();
    await tapRefresh();
    onLine = false;
    act(() => sw.controllerChange());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
    act(() => goOnline());
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => goOnline());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the failsafe: a stalled activation reloads online after 4s", async () => {
    await mountWaiting();
    await tapRefresh();
    await act(() => vi.advanceTimersByTimeAsync(3_999));
    expect(reload).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the failsafe offline: owed, not reloaded into the offline page", async () => {
    await mountWaiting();
    await tapRefresh();
    onLine = false;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
    act(() => goOnline());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("another tab already activated the offered worker: Refresh reloads at once, no 4s wait", async () => {
    // MUTATION (p2i-shell/tap-rule-ignored): Refresh always posts SKIP_WAITING — the worker is
    // already active, no controllerchange follows, and the tap does nothing for 4s; red.
    await mountWaiting();
    // Tab A's Refresh: the worker took over here too, and this tab (which did not ask) ignored it.
    if (sw.registration.waiting) Object.assign(sw.registration.waiting, { state: "activated" });
    act(() => sw.controllerChange());
    expect(reload).not.toHaveBeenCalled();
    await tapRefresh();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sw.registration.waiting?.postMessage).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("coming online with nothing owed reloads nothing", async () => {
    sw.controller = {};
    render(<ResilienceShell />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => goOnline());
    expect(reload).not.toHaveBeenCalled();
  });

  it("the strip renders nothing on a staff screen (its effect still runs there)", async () => {
    pathname = "/staff/kitchen";
    sw.registration.waiting = { postMessage: vi.fn() };
    sw.controller = {};
    const { container } = render(<ResilienceShell />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(container.innerHTML).toBe("");
  });
});

/** Blind review (concurrency G) — the module's `requested` and `owed` never reach the next case. */
describe("every case starts with no ask and nothing owed (lib/test-setup.ts)", () => {
  it("a case may leave this tab's ask recorded and a reload owed…", async () => {
    await mountWaiting();
    await tapRefresh(); // requested = true (SKIP_WAITING posted)
    onLine = false;
    act(() => sw.controllerChange()); // due offline: owed = true
    expect(reload).not.toHaveBeenCalled();
  });

  it("…and the next case inherits neither: another tab's activation and `online` reload nothing", async () => {
    // MUTATION (p2i-setup/shell-unregistered) · (p2i-setup/component-resets-unrun): the shell's
    // module state leaks — this case's mount reads the first case's ask and pays its owed reload,
    // and passes or fails by its position in the file; red.
    sw.controller = {};
    render(<ResilienceShell />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => sw.controllerChange());
    goOnline();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(reload).not.toHaveBeenCalled();
  });
});
