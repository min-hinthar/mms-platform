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

/** A SOFT navigation: the root layout (and the shell in it) stays mounted, the path changes. */
function navigate(to: string) {
  pathname = to;
  vi.stubGlobal("location", { ...window.location, pathname: to, reload });
}

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

  it("Codex r1 on #311 (P2ix) — owed on a diner page, then a soft navigation into /staff: `online` pays nothing there", async () => {
    // MUTATION (p2i-shell/owed-staff-unread): the shell pays the owed reload without reading where
    // the tab now is — a KDS is reloaded under every reload hold the staff app keeps; red.
    await mountWaiting();
    await tapRefresh();
    onLine = false;
    act(() => sw.controllerChange()); // owed
    navigate("/staff/kitchen");
    act(() => goOnline());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("Codex r1 on #311 (P2ix) — the failsafe of a Refresh tapped on a diner page reloads nothing once the tab is under /staff", async () => {
    // MUTATION (p2i-shell/failsafe-staff-unread): the failsafe reloads whatever page the tab
    // reached in its 4s; red.
    await mountWaiting();
    await tapRefresh();
    navigate("/staff");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("Codex r1 on #311 (P2ix) — the activation a diner page asked for, arriving under /staff, reloads nothing", async () => {
    // MUTATION (p2i-shell/change-staff-unread): the asked-for change reloads the staff screen; red.
    await mountWaiting();
    await tapRefresh();
    navigate("/staff/kitchen");
    act(() => sw.controllerChange());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
  });

  it("Codex r2 on #311 — the failsafe released under /staff: back on the diner page the strip's Refresh works again", async () => {
    // MUTATION (p2i-shell/release-skipped): the staff route ignores the failsafe but keeps the
    // one-shot — every later tap on the diner strip returns at its first line, for the life of the
    // document; red.
    const r = await mountWaiting();
    await tapRefresh();
    const ask = sw.registration.waiting?.postMessage;
    expect(ask).toHaveBeenCalledTimes(1);
    navigate("/staff/kitchen");
    await act(() => vi.advanceTimersByTimeAsync(10_000)); // the failsafe: released, not paid
    expect(reload).not.toHaveBeenCalled();
    navigate("/");
    r.rerender(<ResilienceShell />);
    await tapRefresh();
    expect(ask).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(4_000)); // this ask's own failsafe, on a diner page
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Codex r2 on #311 — the asked-for change released under /staff: a LATER activation on the diner page is another tab's, never this tab's ask", async () => {
    // MUTATION (p2i-shell/change-release-skipped): the staff route ignores the change but keeps
    // `requested` — back on a diner page, another tab's next Refresh reloads this one under the
    // diner's hands; red.
    const r = await mountWaiting();
    await tapRefresh();
    navigate("/staff/kitchen");
    act(() => sw.controllerChange());
    navigate("/");
    r.rerender(<ResilienceShell />);
    act(() => sw.controllerChange()); // another tab's later activation
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
    // …and the strip still answers a tap: the worker it offers is active now, so it reloads at once.
    if (sw.registration.waiting) Object.assign(sw.registration.waiting, { state: "activated" });
    await tapRefresh();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Codex r2 on #311 — owed, then `online` under /staff RELEASES the debt: back on the diner page a later `online` reloads nothing, and Refresh works", async () => {
    // MUTATION (p2i-shell/owed-release-skipped): kept owed — the next `online` on any diner page
    // reloads it, long after anyone asked, and the strip's Refresh stays dead meanwhile; red.
    const r = await mountWaiting();
    await tapRefresh();
    onLine = false;
    act(() => sw.controllerChange()); // owed
    navigate("/staff/kitchen");
    act(() => goOnline());
    navigate("/");
    r.rerender(<ResilienceShell />);
    act(() => goOnline());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(reload).not.toHaveBeenCalled();
    if (sw.registration.waiting) Object.assign(sw.registration.waiting, { state: "activated" });
    await tapRefresh();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the other route order — owed on a diner page and STILL there when the device is back: paid, as before", async () => {
    await mountWaiting();
    await tapRefresh();
    onLine = false;
    act(() => sw.controllerChange()); // owed
    navigate("/staff/kitchen");
    navigate("/t/abc/menu"); // back before the network returned: the debt is still the diner's
    act(() => goOnline());
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
