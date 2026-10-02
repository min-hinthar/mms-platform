/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import {
  APPLIED_KEY,
  RELOAD_STUCK_MS,
  dispatchUpdate,
  subscribeUpdate,
  updateSnapshot,
} from "@/lib/app-update";
import { STAFF_CONTRACT } from "@/lib/build-stamp";
import { track } from "@/lib/bounded-write";
import { QUIET_MS, holdReload } from "@/lib/reload-guard";
import { COUNTDOWN_MS, VERSION_POLL_MS } from "@/lib/update-policy";
import { AppUpdateWatch, WATCH_TICK_MS } from "./AppUpdateWatch";

/**
 * Phase 2i (P2bi) — the watcher that wires the version check, the retired witness, input and the
 * tick into the contract's store and executor. What only a mounted watcher can show: WHEN it asks
 * (seen and online only, once at mount, one at a time), that a retired action reaches the store,
 * that a touch cancels a countdown, that nothing ticks unseen — and that an automatic reload, when
 * everything is clear, marks, freezes and reloads the DOCUMENT.
 */
const OWN = "mfq3k9aa-00112233";
const NEW = "mfq3k9zz-ffee0011";

let served: { build: string; contract: number } = { build: NEW, contract: STAFF_CONTRACT };
let hang = false;
const versionCalls: RequestInit[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === "/api/version") {
    versionCalls.push(init ?? {});
    if (hang) return new Promise<Response>(() => {});
    return Response.json(served);
  }
  if (url === "/api/health") return Response.json({ db: "ok" });
  throw new Error(`unexpected fetch ${url}`);
});
const reload = vi.fn();
let onLine = true;
let visibility: DocumentVisibilityState = "visible";

/** A `pageshow`; `persisted` = the page came back from the back-forward cache. */
function pageShow(persisted = true) {
  window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted }));
}

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  served = { build: NEW, contract: STAFF_CONTRACT };
  hang = false;
  versionCalls.length = 0;
  fetchMock.mockClear();
  reload.mockReset();
  onLine = true;
  visibility = "visible";
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom's `location.reload` is unforgeable (spyOn cannot redefine it); stub the whole object.
  vi.stubGlobal("location", { ...window.location, reload });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
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

/** Mount and let one poll find the new build: the phase is stale. */
/** Mount on the served build (the mount's own check — Codex r2 on #311 — hears "current"), then let
 *  one poll find the new build: the phase is stale, a poll's length after the load, so the quiet
 *  window (the load counts as input) has passed. */
async function mountStale() {
  const next = served;
  served = { build: OWN, contract: STAFF_CONTRACT };
  const r = render(<AppUpdateWatch own={OWN} />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(phase().k).toBe("current");
  served = next;
  await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS));
  expect(phase().k).toBe("stale");
  return r;
}

describe("AppUpdateWatch — when it asks /api/version", () => {
  it("once at mount; then every VERSION_POLL_MS, uncached and anonymous", async () => {
    served = { build: OWN, contract: STAFF_CONTRACT };
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(versionCalls).toHaveLength(1);
    expect(versionCalls[0]).toMatchObject({ cache: "no-store", credentials: "omit" });
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS));
    expect(versionCalls).toHaveLength(2);
    expect(phase().k).toBe("current");
    served = { build: NEW, contract: STAFF_CONTRACT };
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS));
    expect(versionCalls).toHaveLength(3);
    expect(phase()).toMatchObject({ k: "stale", served, retired: false });
  });

  it("Codex r2 on #311 — a staff layout reached by a SOFT navigation asks at once: its bundle is as old as the page it came from", async () => {
    // MUTATION (p2i-watch/mount-unchecked): the mount asks nothing — a diner page open since
    // lunch, soft-navigated into /staff, runs that lunchtime bundle for up to a minute before the
    // first poll asks; red. The staff layout cannot tell a soft arrival from a fresh load (the
    // document's own load may have been on any route, any time ago), so it always asks: one GET.
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(versionCalls).toHaveLength(1);
    expect(phase()).toMatchObject({ k: "stale", served });
  });

  it("not while the device is offline; at once when it comes back", async () => {
    // MUTATION (p2i-watch/polls-offline): the offline skip removed — a tablet off the network asks
    // every minute for an answer it cannot get; red.
    onLine = false;
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 3));
    expect(versionCalls).toHaveLength(0);
    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
  });

  it("not while the screen is unseen; at once when it is seen again", async () => {
    // MUTATION (p2i-watch/polls-hidden): the visibility skip removed — a backgrounded tab polls all
    // night; red.
    visibility = "hidden";
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 3));
    expect(versionCalls).toHaveLength(0);
    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
  });

  it("at once on pageshow (a page back from the back-forward cache)", async () => {
    render(<AppUpdateWatch own={OWN} />);
    await act(async () => {
      pageShow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
  });

  it("not on the first load's own pageshow — it can fire after mount, and the mount already asked", async () => {
    // MUTATION (p2i-watch/pageshow-unfiltered): every pageshow checks — a page whose images were
    // still loading asks a SECOND time at its first load, right behind the mount's own check; red.
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(versionCalls).toHaveLength(1);
    await act(async () => {
      pageShow(false);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
  });

  it("one request at a time: a hung answer is never stacked", async () => {
    hang = true;
    render(<AppUpdateWatch own={OWN} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 3);
      window.dispatchEvent(new Event("online"));
      pageShow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
  });

  it("Strict Mode's double setup leaves ONE watcher", async () => {
    served = { build: OWN, contract: STAFF_CONTRACT };
    render(
      <StrictMode>
        <AppUpdateWatch own={OWN} />
      </StrictMode>,
    );
    // Each setup asks once at mount (the first's answer is dropped — it is disposed)…
    await act(() => vi.advanceTimersByTimeAsync(0));
    const atMount = versionCalls.length;
    // …and one poll later exactly ONE more request: one interval survived, not two.
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS));
    expect(versionCalls).toHaveLength(atMount + 1);
  });

  it("a bundle with no stamp is inert: never asks, never retires, nothing installed", async () => {
    render(<AppUpdateWatch own={null} />);
    await act(async () => {
      track(Promise.reject(new UnrecognizedActionError("gone"))).catch(() => {});
      await vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 2);
    });
    expect(versionCalls).toHaveLength(0);
    expect(phase().k).toBe("current");
  });

  it("the same build is current: no row, nothing ticks into a reload", async () => {
    served = { build: OWN, contract: STAFF_CONTRACT };
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 2 + COUNTDOWN_MS));
    expect(phase().k).toBe("current");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("AppUpdateWatch — a retired action", () => {
  it("one UnrecognizedActionError on any tracked call marks the tab retired and asks at once", async () => {
    // MUTATION (p2i-watch/retired-unheard): the witness is not installed — the server has dropped
    // this screen's action and the screen goes on saying nothing; red.
    served = { build: OWN, contract: STAFF_CONTRACT };
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(0)); // the mount's own check: current
    expect(versionCalls).toHaveLength(1);
    served = { build: NEW, contract: STAFF_CONTRACT };
    await act(async () => {
      track(Promise.reject(new UnrecognizedActionError("Server Action not found"))).catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(phase()).toMatchObject({ k: "stale", retired: true });
    // The reducer's `check` effect reached the watcher: asked now, not in a minute.
    expect(versionCalls).toHaveLength(2);
    expect(phase()).toMatchObject({ k: "stale", retired: true, served });
  });

  it("any other failure is not a retired action", async () => {
    served = { build: OWN, contract: STAFF_CONTRACT };
    render(<AppUpdateWatch own={OWN} />);
    await act(() => vi.advanceTimersByTimeAsync(0)); // the mount's own check: current
    await act(async () => {
      track(Promise.reject(new TypeError("fetch failed"))).catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(phase().k).toBe("current");
    expect(versionCalls).toHaveLength(1);
  });
});

describe("AppUpdateWatch — the tick, input, and the automatic reload", () => {
  it("quiet and clear: a visible countdown, then mark → freeze → reload the document", async () => {
    await mountStale();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
    expect(phase().k).toBe("countdown");
    await act(() => vi.advanceTimersByTimeAsync(COUNTDOWN_MS));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(document.body.inert).toBe(true);
    expect(document.documentElement.dataset.reloading).toBe("");
    expect(JSON.parse(sessionStorage.getItem(APPLIED_KEY) ?? "null")).toEqual({ target: NEW });
    expect(phase()).toMatchObject({ k: "applying", mode: "auto" });
    // One re-issue if the document fetch hangs — never an inert page left standing.
    await act(() => vi.advanceTimersByTimeAsync(RELOAD_STUCK_MS));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("Codex r1 on #311 — a tab whose storage refuses the tried-target record never auto-reloads; a tap still does", async () => {
    // MUTATION (p2i-watch/mark-result-dropped): the watcher reports every mark as kept — a reload
    // that misses its target is retried automatically on every quiet window, for ever; red.
    await mountStale();
    const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
      expect(phase().k).toBe("countdown");
      await act(() => vi.advanceTimersByTimeAsync(COUNTDOWN_MS));
      expect(reload).not.toHaveBeenCalled();
      expect(document.body.inert).toBe(false);
      expect(phase().k).toBe("stale");
      await act(async () => {
        dispatchUpdate({ e: "tap" });
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      refuse.mockRestore();
    }
  });

  it("retired: the shorter quiet window, and live sound no longer holds the reload", async () => {
    // MUTATION (p2i-watch/retired-not-read): the executor's verdict and the tick read `retired:
    // false` — a sound-live KDS whose actions are gone waits for a person forever; red.
    holdReload({ kind: "sound", reason: "kdsSound", subject: "kds", survives: false });
    await mountStale();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS * 30));
    expect(phase().k).toBe("stale");
    await act(async () => {
      // A board's POLL meets the retired id (a read: no answer window follows it).
      track(Promise.reject(new UnrecognizedActionError("gone")), "read").catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(phase()).toMatchObject({ k: "stale", retired: true });
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS + COUNTDOWN_MS));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a touch during the countdown cancels it — and starts the quiet clock again", async () => {
    // MUTATION (p2i-watch/input-unheard): the input listener dropped — the cook touching the screen
    // is reloaded under their finger; red.
    await mountStale();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
    expect(phase().k).toBe("countdown");
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(phase().k).toBe("stale");
    // The touch is input: the quiet window has to pass again before another countdown.
    await act(() => vi.advanceTimersByTimeAsync(COUNTDOWN_MS * 2));
    expect(phase().k).toBe("stale");
    expect(reload).not.toHaveBeenCalled();
  });

  it("a key, a touchstart or a wheel scroll is input too", async () => {
    // MUTATION (p2i-watch/wheel-unheard): a wheel is not input — someone scrolling a long list
    // with a mouse or trackpad is reloaded under the cursor; red.
    await mountStale();
    for (const type of ["keydown", "touchstart", "wheel"]) {
      // A touch, then the quiet window: the countdown has just started.
      act(() => {
        window.dispatchEvent(new Event("pointerdown"));
      });
      await act(() => vi.advanceTimersByTimeAsync(QUIET_MS + WATCH_TICK_MS));
      expect(phase().k).toBe("countdown");
      act(() => {
        window.dispatchEvent(new Event(type));
      });
      expect(phase().k).toBe("stale");
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("nothing ticks while the screen is unseen — no countdown runs where nobody can see it", async () => {
    // MUTATION (p2i-watch/tick-while-hidden): the tick runs hidden — a backgrounded tablet reads the
    // document every second for a countdown nobody can see; red. (Since Codex r1 on #311 a hidden tab
    // is also refused by the automatic verdict itself, so the reload never happens either way: the
    // assertion that kills this mutant is that the hidden tick does no work at all.)
    await mountStale();
    act(() => setVisibility("hidden"));
    const reads = vi.spyOn(document, "querySelector");
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS * 30));
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
    expect(phase().k).toBe("stale");
    expect(reload).not.toHaveBeenCalled();
  });

  it("a countdown is cancelled when the screen is hidden", async () => {
    await mountStale();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
    expect(phase().k).toBe("countdown");
    act(() => setVisibility("hidden"));
    expect(phase().k).toBe("stale");
    await act(() => vi.advanceTimersByTimeAsync(COUNTDOWN_MS * 4));
    expect(reload).not.toHaveBeenCalled();
  });

  it("a hold refuses the countdown at the tick (the verdict, read live)", async () => {
    // MUTATION (p2i-watch/tick-unguarded): the tick reads no verdict — a visible "Reloading in 5…"
    // runs over an open Undo bar (the executor's own re-read refuses at the end, so the END phase
    // alone cannot tell; every phase is recorded); red.
    await mountStale();
    const release = holdReload({
      kind: "unsent",
      reason: "kitchenUndo",
      subject: "kds",
      survives: false,
    });
    const seen: string[] = [];
    const off = subscribeUpdate(() => seen.push(phase().k));
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS * 10));
    off();
    expect(seen).not.toContain("countdown");
    expect(seen).not.toContain("applying");
    expect(phase().k).toBe("stale");
    release();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
    expect(phase().k).toBe("countdown");
  });

  it("a target this tab already reloaded into without arriving never counts down again", async () => {
    // MUTATION (p2i-watch/tried-ignored): the tick ignores the record — the screen counts down on
    // every quiet moment and the executor refuses each one (it re-reads the record too), so the
    // countdown is the only witness; red.
    sessionStorage.setItem(APPLIED_KEY, JSON.stringify({ target: NEW }));
    await mountStale();
    const seen: string[] = [];
    const off = subscribeUpdate(() => seen.push(phase().k));
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS * 30));
    off();
    expect(seen).not.toContain("countdown");
    expect(phase().k).toBe("stale");
    expect(reload).not.toHaveBeenCalled();
  });

  it("arriving at the target clears the one-shot record at mount", () => {
    sessionStorage.setItem(APPLIED_KEY, JSON.stringify({ target: OWN }));
    render(<AppUpdateWatch own={OWN} />);
    expect(sessionStorage.getItem(APPLIED_KEY)).toBeNull();
  });

  it("a person's tap runs the executor the watcher installed", async () => {
    render(<AppUpdateWatch own={OWN} />);
    await act(async () => {
      pageShow();
      await vi.advanceTimersByTimeAsync(0);
    });
    // Input just happened (the automatic path would wait); a person's tap does not.
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await act(async () => {
      dispatchUpdate({ e: "tap" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("an answer that lands after unmount is dropped", async () => {
    // MUTATION (p2i-watch/answer-after-unmount): the disposed check dropped — a watcher that is gone
    // still moves the phase; red.
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          versionCalls.push(init ?? {});
          answer = resolve;
        }),
    );
    const r = render(<AppUpdateWatch own={OWN} />);
    await act(async () => {
      pageShow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(versionCalls).toHaveLength(1);
    r.unmount();
    await act(async () => {
      answer(Response.json(served));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(phase().k).toBe("current");
  });

  it("an attempt already in flight when the watcher unmounts reloads nothing", async () => {
    // MUTATION (p2i-watch/attempt-outlives-unmount): the gone watcher's input still reads — an
    // attempt whose pre-flight was answering when the watcher left marks, freezes and reloads a
    // page it no longer serves; red.
    const r = await mountStale();
    let answer: (res: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          versionCalls.push(init ?? {});
          answer = resolve;
        }),
    );
    act(() => {
      dispatchUpdate({ e: "tap" });
    });
    expect(phase().k).toBe("applying");
    r.unmount();
    await act(async () => {
      answer(Response.json(served));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(document.body.inert).toBe(false);
    expect(sessionStorage.getItem(APPLIED_KEY)).toBeNull();
    // Refused, never left latched: the next watcher's tap applies.
    expect(phase().k).toBe("stale");
    render(<AppUpdateWatch own={OWN} />);
    await act(async () => {
      dispatchUpdate({ e: "tap" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Codex r1 on #311 (P2iy) — an automatic apply already in its pre-flight reloads nothing once the tab is hidden", async () => {
    // MUTATION (p2i-guard/auto-ignores-hidden): the executor's re-check passes a hidden tab — the
    // countdown was seen, but the reload lands where nobody is looking; red.
    await mountStale();
    await act(() => vi.advanceTimersByTimeAsync(WATCH_TICK_MS));
    expect(phase().k).toBe("countdown");
    let answer: (res: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          versionCalls.push(init ?? {});
          answer = resolve;
        }),
    );
    await act(() => vi.advanceTimersByTimeAsync(COUNTDOWN_MS));
    expect(phase()).toMatchObject({ k: "applying", mode: "auto" });
    act(() => setVisibility("hidden"));
    await act(async () => {
      answer(Response.json(served));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(document.body.inert).toBe(false);
    expect(sessionStorage.getItem(APPLIED_KEY)).toBeNull();
    expect(phase().k).toBe("stale");
  });

  it("unmounted: the executor is uninstalled and nothing is heard", async () => {
    const r = render(<AppUpdateWatch own={OWN} />);
    r.unmount();
    await act(async () => {
      track(Promise.reject(new UnrecognizedActionError("gone"))).catch(() => {});
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(VERSION_POLL_MS * 2);
    });
    // Only the mount's own check went out — and its answer, landing after the unmount, is dropped.
    expect(versionCalls).toHaveLength(1);
    expect(phase().k).toBe("current");
  });
});

describe("the staff layout mounts it — one live watcher for every staff page", () => {
  it("one live <AppUpdateWatch /> in app/staff/layout.tsx, inside ReaderCollectProvider", () => {
    // Red-first: dropping the element, parking it in `{false && …}`, or mounting it outside the
    // provider tree fails here.
    const file = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "app",
      "staff",
      "layout.tsx",
    );
    const sf = ts.createSourceFile(
      "layout.tsx",
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let imported = false;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const nb = st.importClause?.namedBindings;
      if (
        st.moduleSpecifier.text === "@/components/staff/AppUpdateWatch" &&
        nb &&
        ts.isNamedImports(nb)
      )
        imported = nb.elements.some((e) => e.name.text === "AppUpdateWatch" && !e.propertyName);
    }
    expect(imported).toBe(true);
    const tagName = (n: ts.Node): string | null =>
      ts.isJsxSelfClosingElement(n)
        ? n.tagName.getText(sf)
        : ts.isJsxElement(n)
          ? n.openingElement.tagName.getText(sf)
          : null;
    const dead = (n: ts.Node): boolean => {
      for (let c: ts.Node = n; c.parent !== undefined; c = c.parent) {
        const p = c.parent;
        if (
          ts.isBinaryExpression(p) &&
          c === p.right &&
          p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          [ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(p.left.kind)
        )
          return true;
        if (ts.isConditionalExpression(p)) {
          if (c === p.whenTrue && p.condition.kind === ts.SyntaxKind.FalseKeyword) return true;
          if (c === p.whenFalse && p.condition.kind === ts.SyntaxKind.TrueKeyword) return true;
        }
      }
      return false;
    };
    const live: ts.Node[] = [];
    const visit = (n: ts.Node): void => {
      if (tagName(n) === "AppUpdateWatch" && !dead(n)) live.push(n);
      ts.forEachChild(n, (c) => {
        visit(c);
      });
    };
    visit(sf);
    expect(live).toHaveLength(1);
    const within = (n: ts.Node, name: string) => {
      for (let p = n.parent; p !== undefined; p = p.parent) if (tagName(p) === name) return true;
      return false;
    };
    const [el] = live;
    expect(el && within(el, "ReaderCollectProvider") && within(el, "StaffLangProvider")).toBe(true);
  });
});

describe("the production default — the layout passes no `own`", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("a stamped bundle's watcher with NO prop reads CLIENT_BUILD and is live", async () => {
    // MUTATION (p2i-watch/default-unstamped): the default is not CLIENT_BUILD — the layout mounts
    // `<AppUpdateWatch />` bare, so every staff screen goes inert and no deploy is ever noticed,
    // while every `own=`-passing case above stays green; red. `CLIENT_BUILD` is fixed when its
    // module loads, so the stamp is stubbed and the watcher (and the store it writes) re-imported.
    vi.stubEnv("NEXT_PUBLIC_BUILD_STAMP", OWN);
    vi.resetModules();
    const fresh = await import("./AppUpdateWatch");
    const store = await import("@/lib/app-update");
    const stamp = await import("@/lib/build-stamp");
    expect(stamp.CLIENT_BUILD).toBe(OWN);
    render(<fresh.AppUpdateWatch />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(versionCalls).toHaveLength(1);
    expect(store.updateSnapshot().phase).toMatchObject({ k: "stale", served });
  });
});
