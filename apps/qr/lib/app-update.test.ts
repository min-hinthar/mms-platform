import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_CONTRACT, type VersionVerdict } from "./build-stamp";
import { STAFF_HANG_MS, track } from "./bounded-write";
import { QUIET_MS, holdReload, type GuardInput } from "./reload-guard";
import type { TabStore } from "./settled-view";
import {
  APPLIED_KEY,
  afterLoad,
  applyUpdate,
  clearRefusal,
  dispatchUpdate,
  installApplyDeps,
  makeFetchServed,
  markAppliedIn,
  noteInput,
  onCheckRequested,
  readGuardInput,
  resetUpdateForTests,
  subscribeUpdate,
  triedTargetIn,
  updateSnapshot,
  type ApplyDeps,
} from "./app-update";

/**
 * Phase 2i (P2bi) — the one executor that reloads for a new build, with every browser dependency
 * faked. Each case is a way a reload could land on lost work or a dead network, and each asserts
 * `reload` was never called — or, when it is, that the page was made inert FIRST.
 */
const NEW = "mfq3k9zz-ffee0011";
const changed: VersionVerdict = {
  kind: "changed",
  served: { build: NEW, contract: STAFF_CONTRACT },
  incompatible: false,
};
const IDLE: GuardInput = {
  online: true,
  holds: [],
  youngWrite: false,
  stalledWrite: false,
  ownWait: false,
  msSinceWriteSettled: null,
  msSinceInput: QUIET_MS * 10,
  dialogOpen: false,
  typing: false,
  retired: false,
};

type Fake = ApplyDeps & { calls: string[]; input: GuardInput };
function fake(over: Partial<ApplyDeps> = {}): Fake {
  const calls: string[] = [];
  const f: Fake = {
    calls,
    input: { ...IDLE },
    guardInput: () => f.input,
    online: () => true,
    fetchServed: vi.fn(async () => changed),
    freshTruth: vi.fn(async () => "unknown" as const),
    triedTarget: () => false,
    markApplied: (b) => {
      calls.push(`mark:${b}`);
    },
    freeze: () => {
      calls.push("freeze");
    },
    reload: () => {
      calls.push("reload");
    },
    ...over,
  };
  return f;
}

beforeEach(() => {
  resetUpdateForTests();
});
afterEach(() => {
  resetUpdateForTests();
  vi.useRealTimers();
});

describe("applyUpdate — the pre-flight is always fresh", () => {
  it("all clear: marks the target, freezes, THEN reloads — in that order", async () => {
    // MUTATION (p2i-apply/freeze-skipped): the page is never made inert — a Done tapped while the
    // next document loads is POSTed into the unload; red.
    // MUTATION (p2i-apply/freeze-after-reload): inert only after the reload is issued; red.
    // MUTATION (p2i-apply/unmarked): the attempt is not recorded — a target that never arrives is
    // retried automatically on every load; red.
    const d = fake();
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
    expect(d.calls).toEqual([`mark:${NEW}`, "freeze", "reload"]);
  });

  it("offline: refused, no request, no reload", async () => {
    // MUTATION (p2i-apply/offline-ignored): the device's own offline is not checked; red.
    const d = fake({ online: () => false });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "offline" } });
    expect(d.fetchServed).not.toHaveBeenCalled();
    expect(d.calls).toEqual([]);
  });

  it("the server already serves this build: current, no reload", async () => {
    // MUTATION (p2i-apply/current-reloads): a screen that is already current reloads anyway; red.
    const d = fake({ fetchServed: vi.fn(async () => ({ kind: "current" }) as const) });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "current" });
    expect(d.calls).toEqual([]);
  });

  it("no verdict, or a throw: refused `check`, no reload", async () => {
    // MUTATION (p2i-apply/unknown-reloads): a portal answer reloads the screen into a login page; red.
    // MUTATION (p2i-apply/preflight-skipped): the fresh version read is skipped — the row's stale
    // claim (minutes old) is trusted; red.
    for (const fetchServed of [
      vi.fn(async () => ({ kind: "unknown" }) as const),
      vi.fn(async () => {
        throw new Error("network");
      }),
    ]) {
      const d = fake({ fetchServed });
      expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "check" } });
      expect(d.calls).toEqual([]);
    }
  });

  it("the order system is down: refused `down` — a reload would empty this screen", async () => {
    // MUTATION (p2i-apply/down-ignored): the cook reloads into the outage shell and loses the
    // tickets on screen; red.
    const d = fake({ freshTruth: vi.fn(async () => "we-down" as const) });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "down" } });
    expect(d.calls).toEqual([]);
  });

  it("the probe finds the device offline: refused `offline`", async () => {
    // MUTATION (p2i-apply/truth-offline-ignored); red.
    const d = fake({ freshTruth: vi.fn(async () => "you-offline" as const) });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "offline" } });
    expect(d.calls).toEqual([]);
  });

  it("asks the FRESH truth once per apply (never the 15s cache)", async () => {
    // MUTATION (p2i-apply/stale-truth): the health probe is skipped; red.
    const d = fake();
    await applyUpdate("manual", d);
    expect(d.freshTruth).toHaveBeenCalledTimes(1);
  });
});

describe("applyUpdate — its own mode's verdict, at the call AND after the last await", () => {
  it("a block at the call: refused before anything is fetched", async () => {
    const d = fake();
    d.input = { ...IDLE, youngWrite: true };
    expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "saving" } });
    expect(d.fetchServed).not.toHaveBeenCalled();
  });

  it("a hold registered DURING the pre-flight refuses — no reload", async () => {
    // MUTATION (p2i-apply/recheck-dropped): a pick made while /api/version answered is reloaded
    // away; red.
    const d = fake({
      fetchServed: vi.fn(async () => {
        d.input = {
          ...IDLE,
          holds: [{ kind: "unsent", reason: "pick", subject: "l", seq: 1, survives: false }],
        };
        return changed;
      }),
    });
    expect(await applyUpdate("manual", d)).toEqual({
      kind: "refused",
      block: { kind: "hold", reason: "pick" },
    });
    expect(d.calls).toEqual([]);
  });

  it("AUTO re-reads the AUTO verdict: a dialog opened during the pre-flight refuses `screen`", async () => {
    // MUTATION (p2i-apply/recheck-manual-for-auto): the re-check reads the MANUAL verdict, which
    // never refuses for a dialog — a sheet opened mid-pre-flight is reloaded away; red.
    const d = fake({
      freshTruth: vi.fn(async () => {
        d.input = { ...IDLE, dialogOpen: true };
        return "unknown" as const;
      }),
    });
    expect(await applyUpdate("auto", d)).toEqual({ kind: "refused", block: { kind: "screen" } });
    expect(d.calls).toEqual([]);
  });

  it("two concurrent applies: ONE reload; the second is busy", async () => {
    // MUTATION (p2i-apply/not-latched): a double tap (or a tap during the countdown's apply) reloads
    // twice and marks twice; red.
    const d = fake();
    const [a, b] = await Promise.all([applyUpdate("manual", d), applyUpdate("auto", d)]);
    expect([a, b]).toEqual([{ kind: "reloading" }, { kind: "busy" }]);
    expect(d.calls.filter((c) => c === "reload")).toHaveLength(1);
  });

  it("a refusal frees the latch — the next tap is not `busy`", async () => {
    // MUTATION (p2i-apply/latch-stuck): one refusal leaves every later apply `busy` forever; red.
    const d = fake({ freshTruth: vi.fn(async () => "we-down" as const) });
    await applyUpdate("manual", d);
    d.freshTruth = vi.fn(async () => "unknown" as const);
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
  });

  it("a `current` frees the latch — the next deploy's tap reloads, never `busy`", async () => {
    // MUTATION (p2i-apply/latch-kept-after-current): an apply that came back current keeps the
    // latch; the next stale verdict's tap reads `busy`, the reducer holds `applying`, and the row
    // says "Reloading…" forever with nothing reloading; red.
    const d = fake({ fetchServed: vi.fn(async () => ({ kind: "current" }) as const) });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "current" });
    d.fetchServed = vi.fn(async () => changed);
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
  });

  it("a dependency that THROWS after the latch: refused `check`, latch freed, never a rejection", async () => {
    // MUTATION (p2i-apply/throw-strands-latch): the throw rejects applyUpdate — `land` never runs
    // and the latch stays set for the life of the document; red.
    const d = fake();
    let reads = 0;
    d.guardInput = () => {
      reads++;
      if (reads === 2) throw new Error("no document");
      return IDLE;
    };
    expect(await applyUpdate("manual", d)).toEqual({ kind: "refused", block: { kind: "check" } });
    expect(d.calls).toEqual([]);
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
  });

  it("a guard read that throws at the call: refused `check`, never a rejection", async () => {
    // MUTATION (p2i-apply/guard-throw-rejects): the first read's throw rejects applyUpdate; red.
    const d = fake();
    d.guardInput = () => {
      throw new Error("no document");
    };
    expect(await applyUpdate("auto", d)).toEqual({ kind: "refused", block: { kind: "check" } });
    expect(d.fetchServed).not.toHaveBeenCalled();
  });

  it("a freeze that throws part-way still reloads — never an inert page left standing", async () => {
    // MUTATION (p2i-apply/freeze-throw-no-reload): the freeze's throw skips the reload, and a page
    // that may already be inert never reloads; red.
    const d = fake({
      freeze: () => {
        d.calls.push("freeze");
        throw new Error("no body");
      },
    });
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
    expect(d.calls).toEqual([`mark:${NEW}`, "freeze", "reload"]);
  });

  it("a tried target: AUTO refuses, a PERSON may retry it", async () => {
    // MUTATION (p2i-apply/tried-ignored): the automatic path reloads into the same missing build on
    // every load, forever; red.
    // MUTATION (p2i-apply/tried-blocks-manual): a person can never retry it either; red.
    const d = fake({ triedTarget: (b) => b === NEW });
    expect((await applyUpdate("auto", d)).kind).toBe("refused");
    expect(d.calls).toEqual([]);
    expect(await applyUpdate("manual", d)).toEqual({ kind: "reloading" });
  });
});

describe("the store — dispatch, effects, the row's refusal", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("a tap runs the MANUAL apply; its refusal is published for the row", async () => {
    const d = fake({ freshTruth: vi.fn(async () => "we-down" as const) });
    installApplyDeps(d);
    dispatchUpdate({ e: "verdict", v: changed, now: 0 });
    expect(updateSnapshot().phase.k).toBe("stale");
    dispatchUpdate({ e: "tap" });
    expect(updateSnapshot().phase.k).toBe("applying");
    await flush();
    // MUTATION (p2i-apply/refusal-unpublished): the row never learns why its tap did nothing; red.
    expect(updateSnapshot()).toEqual({
      phase: {
        k: "stale",
        served: changed.kind === "changed" ? changed.served : null,
        retired: false,
        snoozeUntil: null,
      },
      refusal: { kind: "down" },
    });
    clearRefusal();
    expect(updateSnapshot().refusal).toBeNull();
  });

  it("an AUTOMATIC refusal is never published — nobody tapped", async () => {
    // MUTATION (p2i-apply/auto-refusal-said): an alert appears on a screen nobody touched; red.
    vi.useFakeTimers();
    const d = fake({ freshTruth: vi.fn(async () => "we-down" as const) });
    installApplyDeps(d);
    dispatchUpdate({ e: "verdict", v: changed, now: 0 });
    dispatchUpdate({ e: "tick", now: 0, autoClear: true, tried: false });
    dispatchUpdate({ e: "tick", now: 5_000, autoClear: true, tried: false });
    expect(updateSnapshot().phase.k).toBe("applying");
    await vi.advanceTimersByTimeAsync(0);
    expect(updateSnapshot().phase.k).toBe("stale");
    expect(updateSnapshot().refusal).toBeNull();
  });

  it("the `check` effect reaches the watcher; subscribers hear every change; snapshots are stable", () => {
    let checks = 0;
    let heard = 0;
    onCheckRequested(() => {
      checks++;
    });
    subscribeUpdate(() => {
      heard++;
    });
    const before = updateSnapshot();
    expect(updateSnapshot()).toBe(before);
    dispatchUpdate({ e: "retired", now: 0 });
    expect(checks).toBe(1);
    expect(heard).toBe(1);
    dispatchUpdate({ e: "input" });
    expect(heard).toBe(1);
  });

  it("deps that throw: the tap still lands back on stale — never stuck applying", async () => {
    const d = fake();
    d.guardInput = () => {
      throw new Error("no document");
    };
    installApplyDeps(d);
    dispatchUpdate({ e: "verdict", v: changed, now: 0 });
    dispatchUpdate({ e: "tap" });
    await flush();
    expect(updateSnapshot().phase.k).toBe("stale");
    expect(updateSnapshot().refusal).toEqual({ kind: "check" });
  });

  it("with nothing installed, a tap falls back to stale — never stuck applying", () => {
    dispatchUpdate({ e: "verdict", v: changed, now: 0 });
    dispatchUpdate({ e: "tap" });
    expect(updateSnapshot().phase.k).toBe("stale");
  });
});

describe("readGuardInput — the live document, the ledger, the register", () => {
  const doc = (sel: string | null, active: Partial<HTMLElement> | null) =>
    ({
      querySelector: (q: string) => (sel !== null && q.includes(sel) ? {} : null),
      activeElement: active,
    }) as unknown as Document;
  const nav = (onLine: boolean) => ({ onLine }) as Navigator;
  const el = (tagName: string, type?: string, editable = false) =>
    ({
      tagName,
      getAttribute: (n: string) => (n === "type" ? (type ?? null) : null),
      isContentEditable: editable,
    }) as unknown as HTMLElement;

  it("a dialog, an alertdialog or an aria-modal is a dialog; [aria-busy] is not", () => {
    // MUTATION (p2i-apply/dialog-unseen): an open sheet never refuses the automatic reload; red.
    for (const sel of ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]']) {
      expect(
        readGuardInput({ doc: doc(sel, null), nav: nav(true), retired: false }).dialogOpen,
      ).toBe(true);
    }
    expect(
      readGuardInput({ doc: doc("[aria-busy", null), nav: nav(true), retired: false }).dialogOpen,
    ).toBe(false);
  });

  it("a focused text entry is typing; a focused button or checkbox is not", () => {
    // MUTATION (p2i-apply/typing-unseen): a half-typed note is reloaded away; red.
    const typing = (a: HTMLElement) =>
      readGuardInput({ doc: doc(null, a), nav: nav(true), retired: false }).typing;
    expect(typing(el("TEXTAREA"))).toBe(true);
    expect(typing(el("INPUT"))).toBe(true);
    expect(typing(el("INPUT", "search"))).toBe(true);
    expect(typing(el("DIV", undefined, true))).toBe(true);
    expect(typing(el("INPUT", "checkbox"))).toBe(false);
    expect(typing(el("BUTTON"))).toBe(false);
  });

  it("reads online, retired, the holds and the ledger NOW", () => {
    vi.useFakeTimers();
    const release = holdReload({
      kind: "sound",
      reason: "bellSound",
      subject: "c",
      survives: false,
    });
    void track(new Promise(() => {}));
    const i = readGuardInput({ doc: doc(null, null), nav: nav(false), retired: true });
    expect(i.online).toBe(false);
    expect(i.retired).toBe(true);
    expect(i.holds.map((h) => h.reason)).toEqual(["bellSound"]);
    expect(i.youngWrite).toBe(true);
    vi.advanceTimersByTime(STAFF_HANG_MS);
    expect(
      readGuardInput({ doc: doc(null, null), nav: nav(true), retired: false }).stalledWrite,
    ).toBe(true);
    release();
  });

  it("input resets the quiet clock", () => {
    // MUTATION (p2i-apply/input-unheard): a cook tapping every few seconds never reads as busy; red.
    vi.useFakeTimers();
    vi.advanceTimersByTime(QUIET_MS * 2);
    noteInput();
    vi.advanceTimersByTime(1_000);
    expect(
      readGuardInput({ doc: doc(null, null), nav: nav(true), retired: false }).msSinceInput,
    ).toBe(1_000);
  });
});

describe("makeFetchServed — strict, uncached, anonymous", () => {
  const OWN = "mfq3k2x1-0a1b2c3d";
  const json = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("asks /api/version with no-store and no credentials", async () => {
    // MUTATION (p2i-apply/fetch-cache-allowed): a cached answer reports the build of an hour ago; red.
    // MUTATION (p2i-apply/fetch-credentials-sent): the staff session cookie rides a request that needs
    // none; red.
    const f = json({ build: NEW, contract: STAFF_CONTRACT });
    expect(await makeFetchServed(f as unknown as typeof fetch, OWN)()).toEqual(changed);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/version");
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("omit");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a non-ok status, HTML, junk or a throw is unknown — never changed", async () => {
    // MUTATION (p2i-apply/fetch-status-trusted): a 503 page's body is parsed; red.
    const html = vi.fn(async () => new Response("<html>login</html>", { status: 200 }));
    expect(await makeFetchServed(html as unknown as typeof fetch, OWN)()).toEqual({
      kind: "unknown",
    });
    expect(
      await makeFetchServed(
        json({ build: NEW, contract: 1 }, 503) as unknown as typeof fetch,
        OWN,
      )(),
    ).toEqual({ kind: "unknown" });
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await makeFetchServed(boom as unknown as typeof fetch, OWN)()).toEqual({
      kind: "unknown",
    });
  });

  it("the same build is current", async () => {
    expect(
      await makeFetchServed(
        json({ build: OWN, contract: STAFF_CONTRACT }) as unknown as typeof fetch,
        OWN,
      )(),
    ).toEqual({ kind: "current" });
  });
});

describe("the one-shot record", () => {
  function memStore(): TabStore & { data: Record<string, string> } {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (k) => (k in data ? data[k]! : null),
      setItem: (k, v) => {
        data[k] = v;
      },
      removeItem: (k) => {
        delete data[k];
      },
    };
  }

  it("marked → tried for that build only", () => {
    const s = memStore();
    markAppliedIn(s, NEW);
    expect(triedTargetIn(s, NEW)).toBe(true);
    expect(triedTargetIn(s, "mfq3k2x1-0a1b2c3d")).toBe(false);
  });

  it("arrived (own === target) → cleared", () => {
    // MUTATION (p2i-apply/success-kept): a build that arrived stays "tried" — the NEXT new version
    // with the same stamp… and every later check reads a stale record; red.
    const s = memStore();
    markAppliedIn(s, NEW);
    afterLoad(s, NEW);
    expect(s.data[APPLIED_KEY]).toBeUndefined();
  });

  it("did not arrive (own ≠ target) → kept, so auto never retries it", () => {
    // MUTATION (p2i-apply/failure-cleared): the record is cleared on any load — the automatic
    // reload loops into a build the CDN does not serve yet; red.
    const s = memStore();
    markAppliedIn(s, NEW);
    afterLoad(s, "mfq3k2x1-0a1b2c3d");
    expect(triedTargetIn(s, NEW)).toBe(true);
  });

  it("broken storage never throws", () => {
    const broken: TabStore = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(() => markAppliedIn(broken, NEW)).not.toThrow();
    expect(triedTargetIn(broken, NEW)).toBe(false);
    expect(() => afterLoad(broken, NEW)).not.toThrow();
    expect(triedTargetIn(null, NEW)).toBe(false);
  });
});
