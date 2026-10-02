/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { STAFF_CONTRACT, type Served } from "@/lib/build-stamp";
import {
  dispatchUpdate,
  installApplyDeps,
  readGuardInput,
  resetUpdateForTests,
  updateSnapshot,
  type ApplyDeps,
} from "@/lib/app-update";
import { monoNow, track } from "@/lib/bounded-write";
import { holdReload, type GuardInput } from "@/lib/reload-guard";
import { COUNTDOWN_MS, CURRENT, type UpdatePhase } from "@/lib/update-policy";
import { NET_SHOW_MS } from "@/lib/live-connection";
import type { ConnectionTruth } from "@/lib/useConnectionTruth";
import { StaffBarUpdate, refusalStands, resetRetiredSaidForTests } from "./StaffBarUpdate";

/**
 * Phase 2i (P2bi) — the staff bar's new-version row. What only a render can see: that the row is
 * absent while current or offline; that a tap goes to the ONE executor (whose verdict is read at the
 * tap, never from this render) and a refusal REPLACES the line as an alert that clears the moment it
 * stops being true; that the standing line is not live, the retirement is said once and the
 * countdown's ticking digit is hidden behind ONE sr alert; and that the reload's sound cost is said
 * while a board's sound is live.
 */

const SERVED: Served = { build: "kq1x2y3-0a1b2c3d", contract: STAFF_CONTRACT };
const reload = vi.fn();
const freeze = vi.fn();
let onLine = true;

function deps(over: Partial<ApplyDeps> = {}): ApplyDeps {
  return {
    guardInput: () => {
      const phase = updateSnapshot().phase;
      return readGuardInput({
        doc: document,
        nav: navigator,
        retired: phase.k !== "current" && phase.retired,
      });
    },
    online: () => navigator.onLine !== false,
    fetchServed: () => Promise.resolve({ kind: "changed", served: SERVED, incompatible: false }),
    freshTruth: () => Promise.resolve("unknown"),
    triedTarget: () => false,
    markApplied: () => {},
    freeze,
    reload,
    ...over,
  };
}

beforeEach(() => {
  resetRetiredSaidForTests();
  // The real freeze marks the document as reloading in the reload's own task (app-update's contract).
  freeze.mockImplementation(() => {
    document.documentElement.dataset.reloading = "";
  });
  onLine = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
});
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.reloading;
  reload.mockReset();
  freeze.mockReset();
  vi.useRealTimers();
});

const stale = () =>
  act(() =>
    dispatchUpdate({
      e: "verdict",
      v: { kind: "changed", served: SERVED, incompatible: false },
      now: monoNow(),
    }),
  );
const retire = () => act(() => dispatchUpdate({ e: "retired", now: monoNow() }));
const countdown = () =>
  act(() => dispatchUpdate({ e: "tick", now: monoNow(), autoClear: true, tried: false }));
/** Let the executor's pre-flight awaits settle. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

const live = (root: ParentNode) =>
  root.querySelectorAll('[role="alert"],[role="status"],[aria-live]');
const row = () => document.querySelector(".staff-update");
const reloadButton = () => screen.getByRole("button", { name: STAFF["out.reload"].en });

describe("StaffBarUpdate — renders only when a new version is served", () => {
  it("renders NOTHING while the screen is current", () => {
    const { container } = render(<StaffBarUpdate lang="en" />);
    expect(container.innerHTML).toBe("");
  });

  it("stale: the plain line and the Reload button — a standing row, NOT a live region", () => {
    // MUTATION (p2i-row/standing-live): the standing line gets a live role — every board poll that
    // re-renders the bar re-announces "a new version is ready" into the kitchen's one region; red.
    stale();
    const { container } = render(<StaffBarUpdate lang="en" />);
    expect(row()?.textContent).toContain(STAFF["shell.version.ready"].en);
    expect(live(container)).toHaveLength(0);
    const btn = reloadButton();
    expect(btn.classList.contains("ui-btn")).toBe(true);
    expect(btn.classList.contains("ui-btn-lg")).toBe(true);
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBeNull();
    expect(row()?.classList.contains("mms-rise")).toBe(true);
  });

  it("says the reload's sound cost while a board's sound is live — and only then", () => {
    // MUTATION (p2i-row/sound-cost-unsaid): the cook taps Reload on a sounding KDS and the board
    // comes back silent with nobody told; red.
    stale();
    render(<StaffBarUpdate lang="en" />);
    expect(row()?.textContent).not.toContain(STAFF["shell.version.sound"].en);
    let release: () => void = () => {};
    act(() => {
      release = holdReload({ kind: "sound", reason: "kdsSound", subject: "kds", survives: false });
    });
    expect(row()?.textContent).toContain(STAFF["shell.version.sound"].en);
    act(() => release());
    expect(row()?.textContent).not.toContain(STAFF["shell.version.sound"].en);
  });

  it("renders nothing while the device is offline — the offline row speaks then", async () => {
    // MUTATION (p2i-row/shown-offline): the row stays while offline and a tap reloads into the
    // worker's offline page; red.
    vi.useFakeTimers();
    stale();
    render(<StaffBarUpdate lang="en" />);
    expect(row()).not.toBeNull();
    onLine = false;
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(NET_SHOW_MS);
    });
    expect(row()).toBeNull();
    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(row()).not.toBeNull();
  });

  it("speaks Burmese on a Burmese tablet", () => {
    stale();
    render(<StaffBarUpdate lang="my" />);
    expect(row()?.querySelector('[lang="my"]')?.textContent).toBe(STAFF["shell.version.ready"].my);
  });
});

describe("the tap — the one executor decides, at the tap", () => {
  it("a tap with nothing held reloads, once, through the executor (freeze first)", async () => {
    // MUTATION (p2i-row/tap-dead): the button dispatches nothing — the row offers a reload that
    // never happens; red.
    installApplyDeps(deps());
    stale();
    render(<StaffBarUpdate lang="en" />);
    fireEvent.click(reloadButton());
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(freeze).toHaveBeenCalledTimes(1);
    // Applying: the button is busy, saying so — never natively disabled.
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain(STAFF["shell.version.reloading"].en);
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("says Checking… while the pre-flight runs, and Reloading… only once the page is frozen", async () => {
    // MUTATION (p2i-row/busy-claims-reload): the busy label says "Reloading…" from the tap — through
    // a fetch and a health probe that often end in a refusal, the screen claims a reload that is not
    // happening; red.
    let answer: (t: ConnectionTruth) => void = () => {};
    installApplyDeps(deps({ freshTruth: () => new Promise((r) => (answer = r)) }));
    stale();
    render(<StaffBarUpdate lang="en" />);
    fireEvent.click(reloadButton());
    await settle();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain(STAFF["entry.checking"].en);
    expect(btn.textContent).not.toContain(STAFF["shell.version.reloading"].en);
    await act(async () => {
      answer("unknown");
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button").textContent).toContain(STAFF["shell.version.reloading"].en);
  });

  it("two taps in one frame are ONE apply", async () => {
    installApplyDeps(deps());
    stale();
    render(<StaffBarUpdate lang="en" />);
    const btn = reloadButton();
    act(() => {
      btn.click();
      btn.click();
    });
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a hold registered after the render refuses the tap — the verdict is never the render's", async () => {
    installApplyDeps(deps());
    stale();
    render(<StaffBarUpdate lang="en" />);
    const btn = reloadButton();
    // Registered with no re-render in between: the click runs the handler of the render above.
    holdReload({ kind: "unsent", reason: "pick", subject: "lane", survives: false });
    fireEvent.click(btn);
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.wait.pick"].en);
  });

  it("a refusal REPLACES the line as one alert, and clears the moment its hold is released", async () => {
    // MUTATIONS: (p2i-row/refusal-not-alert) the refusal is a plain line — a person who tapped
    // Reload hears nothing and the tap reads as dead; (p2i-row/refusal-never-clears) the sentence
    // stands after the Undo bar it names is gone, telling the cook to wait for nothing; red.
    installApplyDeps(deps());
    stale();
    const { container } = render(<StaffBarUpdate lang="en" />);
    let release: () => void = () => {};
    act(() => {
      release = holdReload({
        kind: "unsent",
        reason: "kitchenUndo",
        subject: "kds",
        survives: false,
      });
    });
    fireEvent.click(reloadButton());
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(STAFF["shell.version.wait.undo"].en);
    expect(live(container)).toHaveLength(1);
    // Same position: the line is gone while the refusal stands.
    expect(row()?.textContent).not.toContain(STAFF["shell.version.ready"].en);
    expect(row()?.firstElementChild).toBe(alert);
    act(() => release());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(updateSnapshot().refusal).toBeNull();
    expect(row()?.textContent).toContain(STAFF["shell.version.ready"].en);
    expect(reload).not.toHaveBeenCalled();
  });

  it("a refusal for a write still saving stands while it saves and clears on the next re-check after", async () => {
    // MUTATION (p2i-row/refusal-clears-early): the row drops a refusal that still holds — the cook
    // reads nothing, taps again and is refused again; red.
    vi.useFakeTimers();
    installApplyDeps(deps());
    stale();
    render(<StaffBarUpdate lang="en" />);
    let answer: (v: unknown) => void = () => {};
    void track(new Promise((r) => (answer = r)));
    fireEvent.click(reloadButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.wait.saving"].en);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.wait.saving"].en);
    await act(async () => {
      answer(null);
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("retired — this screen's taps may not save", () => {
  it("wears the warn tone and is said ONCE: an alert at the flip, a plain line after a refusal clears", async () => {
    installApplyDeps(deps());
    stale();
    const { container } = render(<StaffBarUpdate lang="en" />);
    retire();
    expect(row()?.getAttribute("data-tone")).toBe("warn");
    const first = screen.getByRole("alert");
    expect(first.textContent).toBe(STAFF["shell.version.retired"].en);
    // A refusal replaces it, then clears: the line returns WITHOUT announcing itself again.
    let release: () => void = () => {};
    act(() => {
      release = holdReload({ kind: "unsent", reason: "pick", subject: "lane", survives: false });
    });
    fireEvent.click(reloadButton());
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.wait.pick"].en);
    act(() => release());
    expect(row()?.textContent).toContain(STAFF["shell.version.retired"].en);
    expect(live(container)).toHaveLength(0);
  });

  it("the alert holds the retired sentence ALONE — the sound sentence coming back re-says nothing", () => {
    // MUTATION (p2i-row/retired-alert-holds-sound): the sound sentence sits inside the role=alert —
    // a slept tablet's bell comes back on, the sentence is re-inserted into an atomic alert, and
    // "this screen is out of date" is announced again; red.
    stale();
    render(<StaffBarUpdate lang="en" />);
    let release: () => void = () => {};
    act(() => {
      release = holdReload({
        kind: "sound",
        reason: "bellSound",
        subject: "counter",
        survives: false,
      });
    });
    retire();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(STAFF["shell.version.retired"].en);
    expect(row()?.textContent).toContain(STAFF["shell.version.sound"].en);
    act(() => release());
    act(() => {
      release = holdReload({
        kind: "sound",
        reason: "bellSound",
        subject: "counter",
        survives: false,
      });
    });
    expect(row()?.textContent).toContain(STAFF["shell.version.sound"].en);
    expect(screen.getByRole("alert")).toBe(alert);
    expect(alert.textContent).toBe(STAFF["shell.version.retired"].en);
    act(() => release());
  });

  it("is said once per retirement across a REMOUNT of the bar — and again after it came back current", async () => {
    // MUTATION (p2i-row/retired-said-per-mount): the latch lives in the mount — a pane toggling the
    // bar re-announces "this screen is out of date" on every remount; red.
    stale();
    retire();
    const first = render(<StaffBarUpdate lang="en" />);
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.retired"].en);
    first.unmount();
    render(<StaffBarUpdate lang="en" />);
    expect(row()?.textContent).toContain(STAFF["shell.version.retired"].en);
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    // An apply that came back current re-arms it (with no bar mounted at that moment): a LATER
    // retirement is news again.
    render(<StaffBarUpdate lang="en" />);
    cleanup();
    installApplyDeps(deps({ fetchServed: () => Promise.resolve({ kind: "current" }) }));
    act(() => dispatchUpdate({ e: "tap" }));
    await settle();
    expect(updateSnapshot().phase.k).toBe("current");
    act(() => dispatchUpdate({ e: "retired", now: monoNow() + 3 * 60_000 }));
    render(<StaffBarUpdate lang="en" />);
    expect(screen.getByRole("alert").textContent).toBe(STAFF["shell.version.retired"].en);
  });

  it("a plain new version is not the warn tone and says nothing", () => {
    stale();
    render(<StaffBarUpdate lang="en" />);
    expect(row()?.getAttribute("data-tone")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the countdown — the automatic reload, visible, with Not now", () => {
  it("shows the seconds aria-hidden, says it ONCE in words, and Not now puts it back to waiting", () => {
    // MUTATIONS: (p2i-row/notnow-dead) Not now dispatches nothing — the screen reloads under the
    // person who asked it to wait; (p2i-row/countdown-digit-spoken) the ticking digit is exposed —
    // a screen reader reads a number every second; red.
    stale();
    const { container } = render(<StaffBarUpdate lang="en" />);
    countdown();
    const phase = updateSnapshot().phase as Extract<UpdatePhase, { k: "countdown" }>;
    expect(phase.k).toBe("countdown");
    const seconds = Math.ceil(COUNTDOWN_MS / 1_000);
    const shown = tf("en", "shell.version.countdown", { n: seconds });
    const visible = [...container.querySelectorAll("span[aria-hidden]")].find(
      (el) => el.textContent === shown,
    );
    expect(visible, "the countdown line").toBeDefined();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.textContent).toBe(STAFF["shell.version.countdown.sr"].en);
    expect(alerts[0]!.className).toBe("sr-only");
    expect(live(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: STAFF["shell.version.notNow"].en }));
    const after = updateSnapshot().phase;
    expect(after.k).toBe("stale");
    expect((after as Extract<UpdatePhase, { k: "stale" }>).snoozeUntil).not.toBeNull();
    expect(screen.queryByRole("button", { name: STAFF["shell.version.notNow"].en })).toBeNull();
  });

  it("Not now survives the pointerdown that cancels the countdown — a real press snoozes it", () => {
    // MUTATION (p2i-row/notnow-leaves-on-input): Not now leaves with the countdown — the watcher's
    // capture listener cancels it on pointerdown, the button unmounts before its click, nothing is
    // snoozed and the screen reloads after the quiet window under someone who asked it to wait; red.
    const onInput = () => dispatchUpdate({ e: "input" });
    window.addEventListener("pointerdown", onInput, { capture: true });
    try {
      stale();
      render(<StaffBarUpdate lang="en" />);
      countdown();
      const notNow = screen.getByRole("button", { name: STAFF["shell.version.notNow"].en });
      const reloadAt = reloadButton();
      fireEvent.pointerDown(notNow);
      expect(updateSnapshot().phase.k).toBe("stale");
      expect(notNow.isConnected).toBe(true);
      // Reload did not move out from under a finger either: same element, same place.
      expect(notNow.nextElementSibling).toBe(reloadAt);
      fireEvent.click(notNow);
      const after = updateSnapshot().phase as Extract<UpdatePhase, { k: "stale" }>;
      expect(after.snoozeUntil).not.toBeNull();
      expect(screen.queryByRole("button", { name: STAFF["shell.version.notNow"].en })).toBeNull();
    } finally {
      window.removeEventListener("pointerdown", onInput, { capture: true });
    }
  });

  it("the seconds count down on their own", async () => {
    vi.useFakeTimers();
    stale();
    const { container } = render(<StaffBarUpdate lang="en" />);
    countdown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const n = Math.ceil((COUNTDOWN_MS - 2_000) / 1_000);
    expect(container.textContent).toContain(tf("en", "shell.version.countdown", { n }));
  });
});

describe("refusalStands — what the row re-reads", () => {
  const base: GuardInput = {
    online: true,
    holds: [],
    youngWrite: false,
    stalledWrite: false,
    ownWait: false,
    msSinceWriteSettled: null,
    msSinceInput: 0,
    dialogOpen: false,
    typing: false,
    retired: false,
  };
  const stalePhase: UpdatePhase = { k: "stale", served: SERVED, retired: false, snoozeUntil: null };
  const pick = { kind: "unsent", reason: "pick", subject: "lane", seq: 1, survives: true } as const;
  it("only a STALE screen's refusal stands", () => {
    expect(refusalStands({ kind: "check" }, stalePhase, base)).toBe(true);
    expect(refusalStands({ kind: "check" }, CURRENT, base)).toBe(false);
    expect(
      refusalStands(
        { kind: "check" },
        { ...stalePhase, k: "countdown", endsAt: 0 } as UpdatePhase,
        base,
      ),
    ).toBe(false);
  });
  it("offline stands while offline; saving while a write is young", () => {
    expect(refusalStands({ kind: "offline" }, stalePhase, { ...base, online: false })).toBe(true);
    expect(refusalStands({ kind: "offline" }, stalePhase, base)).toBe(false);
    expect(refusalStands({ kind: "saving" }, stalePhase, { ...base, youngWrite: true })).toBe(true);
    expect(refusalStands({ kind: "saving" }, stalePhase, base)).toBe(false);
  });
  it("a hold stands while an unsent hold of THAT reason remains — retired skips stashed work", () => {
    const block = { kind: "hold", reason: "pick" } as const;
    expect(refusalStands(block, stalePhase, { ...base, holds: [pick] })).toBe(true);
    expect(
      refusalStands({ kind: "hold", reason: "kitchenUndo" }, stalePhase, {
        ...base,
        holds: [pick],
      }),
    ).toBe(false);
    expect(refusalStands(block, stalePhase, { ...base, holds: [pick], retired: true })).toBe(false);
    expect(
      refusalStands(block, stalePhase, {
        ...base,
        holds: [{ ...pick, survives: false }],
        retired: true,
      }),
    ).toBe(true);
  });
  it("the pre-flight's own findings stand until the next tap", () => {
    expect(refusalStands({ kind: "down" }, stalePhase, base)).toBe(true);
  });
});

/**
 * The same guard StaffBar.test keeps for the offline row: every rule globals.css writes against
 * `.staff-update` must match the row in SOME state — a selector no state matches is dead CSS (a row
 * with no ground, a warn tone never drawn).
 */
describe("the new-version row's CSS matches the DOM the row renders", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const selectors = [...css.matchAll(/([^{}]*\.staff-update[^{}]*)\{/g)]
    .flatMap((m) => m[1]!.split(","))
    .map((sel) => sel.trim())
    .filter((sel) => sel !== "" && !sel.startsWith("@"));
  it("names the bar's wrap, the row, its warn tone, the line and the actions", () => {
    expect(selectors.length).toBeGreaterThanOrEqual(5);
  });
  it("no rule lifts the row (or a part of it) out of the bar's flow — absolute/fixed leave the measured box", () => {
    // The bar's height (`--staff-bar-h`, StaffBarNet's ONE measurement of the header) holds the row
    // only while the row is IN FLOW inside it: positioned out, the row would cover the board under
    // the bar while the published height says it is not there.
    const rules = [...css.matchAll(/([^{}]*\.staff-update[^{}]*)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const [, sel, body] of rules) {
      expect(body, sel!.trim()).not.toMatch(/(^|;|\s)position\s*:\s*(absolute|fixed)\b/);
    }
  });
  it.each(selectors)("%s matches the row in some state", (selector) => {
    const states: [string, () => void][] = [
      ["stale", stale],
      [
        "retired",
        () => {
          stale();
          retire();
        },
      ],
    ];
    const hits: string[] = [];
    for (const [name, enter] of states) {
      enter();
      const { unmount } = render(
        <header className="staff-bar">
          <StaffBarUpdate lang="en" />
        </header>,
      );
      if (document.querySelector(selector)) hits.push(name);
      unmount();
      resetUpdateForTests();
    }
    expect(hits, `${selector} matched no rendered state`).not.toEqual([]);
  });
});
